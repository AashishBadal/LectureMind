import { generateWithRetry } from './client.js';
import { parseAndValidateJson, handleGeminiError } from './geminiErrors.js';
import { logger } from '../../utils/logger.js';

const SUMMARIZATION_SYSTEM_INSTRUCTION = `
You are LectureMind's Academic Summarization Engine.
Your task is to analyze the provided classroom lecture transcript and synthesize a structured, academically rigorous summary.

CRITICAL CONSTRAINTS:
1. SOURCE OF TRUTH: The provided lecture transcript is your sole source of truth. Do NOT hallucinate concepts, examples, or theories not stated or discussed by the lecturer.
2. ACADEMIC INTEGRITY: Preserve exact technical terminology, definitions, formulas, and caveats mentioned by the lecturer.
3. UNCERTAINTY: If a speaker's point is ambiguous or unfinished, mark it as "(stated tentatively by speaker)" rather than extrapolating.
4. STRUCTURED OUTPUT: Return strictly valid JSON adhering to the specified schema.
`;

/**
 * Generates structured academic summary from classroom lecture transcript
 * @param {string} transcriptText
 * @param {object} [options]
 * @returns {Promise<{ title: string, executiveSummary: string, keyTakeaways: string[], bulletPoints: string[], topicsCovered: string[] }>}
 */
export const generateSummary = async (transcriptText, options = {}) => {
  if (!transcriptText || typeof transcriptText !== 'string' || !transcriptText.trim()) {
    throw new Error('generateSummary: A non-empty lecture transcript is required.');
  }

  try {
    const prompt = `
Analyze the following classroom lecture transcript and produce a structured summary in JSON format:

TRANSCRIPT:
"""
${transcriptText.trim()}
"""

JSON SCHEMA REQUIREMENTS:
{
  "title": "A concise, descriptive title for the lecture topic based strictly on transcript",
  "executiveSummary": "A comprehensive 2-3 paragraph summary synthesizing the lecturer's primary arguments, explanations, and core themes",
  "keyTakeaways": ["Array of 3 to 6 major conceptual takeaways"],
  "bulletPoints": ["Array of specific points, examples, or definitions provided by the lecturer"],
  "topicsCovered": ["List of distinct thematic topics covered in the lecture"]
}
`;

    const response = await generateWithRetry(
      {
        systemInstruction: SUMMARIZATION_SYSTEM_INSTRUCTION,
        jsonMode: true,
        temperature: 0.2
      },
      prompt
    );

    const rawText = response?.response?.text();
    const parsed = parseAndValidateJson(rawText);

    // Validate structure
    if (!parsed.title || !parsed.executiveSummary || !Array.isArray(parsed.keyTakeaways)) {
      throw new Error('Summary JSON missing required fields (title, executiveSummary, keyTakeaways)');
    }

    return {
      title: String(parsed.title).trim(),
      executiveSummary: String(parsed.executiveSummary).trim(),
      keyTakeaways: Array.isArray(parsed.keyTakeaways) ? parsed.keyTakeaways.map(String) : [],
      bulletPoints: Array.isArray(parsed.bulletPoints) ? parsed.bulletPoints.map(String) : [],
      topicsCovered: Array.isArray(parsed.topicsCovered) ? parsed.topicsCovered.map(String) : []
    };
  } catch (error) {
    logger.error('Error generating lecture summary:', error);
    throw handleGeminiError(error);
  }
};
