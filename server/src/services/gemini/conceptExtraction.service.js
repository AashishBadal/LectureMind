import { generateWithRetry } from './client.js';
import { parseAndValidateJson, handleGeminiError } from './geminiErrors.js';
import { logger } from '../../utils/logger.js';

const CONCEPT_EXTRACTION_SYSTEM_INSTRUCTION = `
You are LectureMind's Academic Concept Extraction Specialist.
Your goal is to identify and extract the core pedagogical concepts and terminology from a classroom lecture transcript.

CRITICAL CONSTRAINTS:
1. SOURCE OF TRUTH: Ground all concepts strictly in the transcript. Only extract concepts that the lecturer actually discussed, defined, or referenced.
2. ACCURACY: Maintain exact terminology (e.g., if the lecturer says "Stochastic Gradient Descent", do not abbreviate or change it arbitrarily).
3. IMPORTANCE: Rate importance from 1 (minor mention/example) to 5 (central theme of the lecture).
4. STRUCTURED OUTPUT: Return strictly valid JSON adhering to the specified schema.
`;

/**
 * Extracts pedagogical concepts from classroom lecture transcript
 * @param {string} transcriptText
 * @param {object} [options]
 * @returns {Promise<Array<{ name: string, description: string, category: string, importance: number }>>}
 */
export const extractConcepts = async (transcriptText, options = {}) => {
  if (!transcriptText || typeof transcriptText !== 'string' || !transcriptText.trim()) {
    throw new Error('extractConcepts: A non-empty lecture transcript is required.');
  }

  try {
    const maxConcepts = options.maxConcepts || 15;

    const prompt = `
Analyze the following lecture transcript and extract up to ${maxConcepts} key academic concepts.

TRANSCRIPT:
"""
${transcriptText.trim()}
"""

JSON SCHEMA REQUIREMENTS:
{
  "concepts": [
    {
      "name": "Standardized academic concept name",
      "description": "Clear definition and role of the concept as explained in the lecture",
      "category": "Core Principle | Mathematical Model | Historical Precedent | Algorithm | Practical Tool | Architectural Component",
      "importance": 1 to 5 (integer, where 5 represents foundational/primary concepts)
    }
  ]
}
`;

    const response = await generateWithRetry(
      {
        systemInstruction: CONCEPT_EXTRACTION_SYSTEM_INSTRUCTION,
        jsonMode: true,
        temperature: 0.2
      },
      prompt
    );

    const rawText = response?.response?.text();
    const parsed = parseAndValidateJson(rawText);

    if (!parsed.concepts || !Array.isArray(parsed.concepts)) {
      throw new Error('Concept extraction JSON missing "concepts" array.');
    }

    // Validate and sanitize concept objects
    return parsed.concepts
      .filter((c) => c && typeof c.name === 'string' && c.name.trim())
      .map((c) => ({
        name: c.name.trim(),
        description: c.description ? String(c.description).trim() : '',
        category: c.category ? String(c.category).trim() : 'General',
        importance: Math.min(5, Math.max(1, parseInt(c.importance, 10) || 3))
      }));
  } catch (error) {
    logger.error('Error extracting lecture concepts:', error);
    throw handleGeminiError(error);
  }
};
