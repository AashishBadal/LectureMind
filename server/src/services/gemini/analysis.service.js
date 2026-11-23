import { generateWithRetry } from './client.js';
import { parseAndValidateJson, handleGeminiError } from './geminiErrors.js';
import { logger } from '../../utils/logger.js';
import { config } from '../../config/env.js';

const ANALYSIS_SYSTEM_INSTRUCTION = `
You are LectureMind's Academic Lecture Analysis Engine.
Your objective is to transform a classroom lecture transcript into an academically rigorous summary and a structured list of core pedagogical concepts with clear explanations and importance rankings.

CRITICAL INSTRUCTIONS & GROUNDING:
1. SOURCE OF TRUTH: Use only the supplied lecture transcript as the source of truth. Do not introduce information that is not supported by the transcript.
2. NO INVENTED FACTS: Do not invent facts or external information.
3. NO UNSUPPORTED CONCEPTS: Do not introduce unsupported concepts, frameworks, or theories not discussed in the lecture.
4. UNAMBIGUOUS INFORMATION: If information is unclear or not discussed in the lecture, omit it rather than inventing it.
5. ACADEMIC CLARITY: Present the summary so it is understandable to university students, removing unnecessary speech fillers or repetition while preserving technical accuracy.
6. STRUCTURED OUTPUT: Return strictly valid JSON adhering to the specified schema.
`;

/**
 * Attempts safe recovery on malformed or slightly corrupted JSON strings
 * @param {string} raw
 * @returns {object|null}
 */
function attemptSafeJsonRecovery(raw) {
  if (!raw || typeof raw !== 'string') return null;

  let cleaned = raw.trim();

  // Strip markdown code fences if present
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

  // Attempt direct parse first
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    // Attempt common repairs: remove trailing commas before closing braces/brackets
    try {
      const repaired = cleaned
        .replace(/,\s*([\]}])/g, '$1')
        .replace(/(['"])?([a-zA-Z0-9_]+)(['"])?\s*:/g, '"$2":');
      return JSON.parse(repaired);
    } catch (e2) {
      // Extract outer JSON object if wrapped in explanatory text
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          const repaired = match[0].replace(/,\s*([\]}])/g, '$1');
          return JSON.parse(repaired);
        } catch (e3) {
          return null;
        }
      }
      return null;
    }
  }
}

/**
 * Validates the parsed lecture analysis object against required schema
 * @param {any} data
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateAnalysisSchema(data) {
  const errors = [];

  if (!data || typeof data !== 'object') {
    return { valid: false, errors: ['Response must be a valid JSON object.'] };
  }

  if (!data.summary || typeof data.summary !== 'string' || data.summary.trim().length < 30) {
    errors.push('Analysis missing a valid, substantive "summary" text field (min 30 characters).');
  }

  if (!Array.isArray(data.concepts) || data.concepts.length === 0) {
    errors.push('Analysis missing "concepts" array or contains no concepts.');
  } else {
    data.concepts.forEach((concept, idx) => {
      if (!concept || typeof concept !== 'object') {
        errors.push(`Concept at index ${idx} is not an object.`);
      } else {
        if (!concept.name || typeof concept.name !== 'string' || !concept.name.trim() || concept.name.trim().length > 120) {
          errors.push(`Concept at index ${idx} missing valid "name" (must be 1-120 characters).`);
        }
        if (!concept.description || typeof concept.description !== 'string' || !concept.description.trim()) {
          errors.push(`Concept at index ${idx} missing required "description".`);
        }
      }
    });
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Normalizes concept importance to numeric and string representations
 * @param {string|number} rawImportance
 * @returns {{ importanceScore: number, importanceLevel: 'high' | 'medium' | 'low' }}
 */
export function normalizeImportance(rawImportance) {
  if (typeof rawImportance === 'string') {
    const lower = rawImportance.toLowerCase().trim();
    if (lower.includes('high') || lower === '3' || lower === '4' || lower === '5') {
      return { importanceScore: 3, importanceLevel: 'high' };
    }
    if (lower.includes('low') || lower === '1') {
      return { importanceScore: 1, importanceLevel: 'low' };
    }
    return { importanceScore: 2, importanceLevel: 'medium' };
  }

  if (typeof rawImportance === 'number') {
    if (rawImportance >= 3) return { importanceScore: 3, importanceLevel: 'high' };
    if (rawImportance <= 1) return { importanceScore: 1, importanceLevel: 'low' };
    return { importanceScore: 2, importanceLevel: 'medium' };
  }

  return { importanceScore: 2, importanceLevel: 'medium' };
}

/**
 * Analyzes a lecture transcript using Gemini, extracting academic summary and key concepts.
 * Implements safe JSON recovery and automated retry logic on schema invalidity.
 *
 * @param {string} transcriptText
 * @param {object} [options]
 * @param {string} [options.preferredModel]
 * @returns {Promise<{ summary: string, concepts: Array<{ name: string, description: string, importance: string, importanceScore: number, context?: string }> }>}
 */
export const analyzeLecture = async (transcriptText, options = {}) => {
  if (!transcriptText || typeof transcriptText !== 'string' || !transcriptText.trim()) {
    throw new Error('analyzeLecture requires a non-empty lecture transcript.');
  }

  const preferredModel = options.preferredModel || process.env.GEMINI_ANALYSIS_MODEL || config.geminiAnalysisModel || config.geminiTextModel || 'gemini-flash-lite-latest';

  const basePrompt = `
Use only the supplied lecture transcript as the source of truth. Do not introduce information that is not supported by the transcript.

Transform the classroom lecture transcript below into:
1. A structured academic summary that:
   - represents the transcript accurately
   - preserves important concepts
   - removes unnecessary repetition
   - is clear and understandable to university students
   - avoids unsupported claims or external information
2. Key pedagogical concepts extracted from the lecture:
   - "name": Concise academic term
   - "description": Clear explanation grounded in the lecture
   - "importance": "high" | "medium" | "low"
   - "context": Optional direct quote or reference from transcript demonstrating the concept

TRANSCRIPT:
"""
${transcriptText.trim()}
"""

REQUESTED JSON STRUCTURE:
{
  "summary": "Coherent multi-paragraph academic summary synthesizing the lecture's core themes, explanations, and arguments.",
  "concepts": [
    {
      "name": "Concept Name",
      "description": "Explanation of the concept based strictly on the transcript",
      "importance": "high",
      "context": "Context or evidence quote from transcript where useful"
    }
  ]
}
`;

  // Model generation attempt with recovery and retry
  let lastError = null;
  const maxAttempts = 2;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      logger.info(`Running lecture analysis with Gemini (Attempt ${attempt}/${maxAttempts})...`);

      const currentPrompt = attempt === 1
        ? basePrompt
        : `${basePrompt}\n\nIMPORTANT: The previous output failed JSON validation. Ensure the output is strictly 100% valid JSON matching the exact schema with no surrounding commentary.`;

      // Use generateWithRetry which handles model fallback (e.g. gemini-2.5-pro -> gemini-3.6-flash)
      const response = await generateWithRetry(
        {
          modelName: preferredModel,
          systemInstruction: ANALYSIS_SYSTEM_INSTRUCTION,
          jsonMode: true,
          temperature: 0.2
        },
        currentPrompt
      );

      const rawText = response?.response?.text();
      if (!rawText) {
        throw new Error('Gemini returned an empty response for lecture analysis.');
      }

      // Step 1 & 2: Safe parsing & recovery
      let parsed = null;
      try {
        parsed = parseAndValidateJson(rawText);
      } catch (parseErr) {
        logger.warn('Initial JSON parse failed, attempting safe recovery heuristics...');
        parsed = attemptSafeJsonRecovery(rawText);
        if (!parsed) {
          throw new Error(`JSON recovery failed: ${parseErr.message}`);
        }
      }

      // Step 3: Schema validation
      const validation = validateAnalysisSchema(parsed);
      if (!validation.valid) {
        throw new Error(`Invalid analysis schema: ${validation.errors.join(', ')}`);
      }

      // Format and normalize output
      const sanitizedConcepts = parsed.concepts.map((concept) => {
        const { importanceScore, importanceLevel } = normalizeImportance(concept.importance);
        return {
          name: concept.name.trim(),
          description: concept.description.trim(),
          importance: importanceLevel,
          importanceScore,
          context: concept.context ? String(concept.context).trim() : undefined
        };
      });

      logger.info(`Lecture analysis succeeded: ${sanitizedConcepts.length} concepts extracted.`);
      return {
        summary: parsed.summary.trim(),
        concepts: sanitizedConcepts
      };
    } catch (err) {
      lastError = err;
      logger.warn(`Lecture analysis attempt ${attempt} failed: ${err.message}`);
      if (attempt < maxAttempts) {
        // Short pause before retry
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
    }
  }

  // If still invalid after retry, report failure and do not save malformed data
  logger.error('All lecture analysis attempts failed.', lastError);
  throw handleGeminiError(lastError);
};
