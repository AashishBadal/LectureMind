import { config } from '../../config/env.js';

export const EMBEDDING_MODEL = 'gemini-embedding-2';
export const EMBEDDING_DIMENSIONS = 1536;
export const EMBEDDING_VERSION = `${EMBEDDING_MODEL}:${EMBEDDING_DIMENSIONS}`;
const EMBEDDING_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

/**
 * Embed a single text string using gemini-embedding-2
 * Returns the configured 1536-dimensional Gemini embedding
 * @param {string} text
 * @returns {Promise<number[]>}
 */
export async function embedText(text, { task = 'query' } = {}) {
  if (typeof text !== 'string' || !text.trim()) throw new Error('embedText: text is required');
  if (!config.geminiApiKey?.trim()) {
    const err = new Error('GEMINI_API_KEY is not configured for lecture search.');
    err.status = 503;
    err.code = 'MISSING_API_KEY';
    throw err;
  }

  const instruction = task === 'document'
    ? 'Represent this lecture passage for retrieval: '
    : 'Represent this student question to retrieve relevant lecture passages: ';
  const url = `${EMBEDDING_API_BASE}/models/${EMBEDDING_MODEL}:embedContent`;
  let lastError;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': config.geminiApiKey.trim()
        },
        body: JSON.stringify({
          model: `models/${EMBEDDING_MODEL}`,
          content: { parts: [{ text: `${instruction}${text.trim().slice(0, 8000)}` }] },
          outputDimensionality: EMBEDDING_DIMENSIONS
        }),
        signal: AbortSignal.timeout(30000)
      });

      if (!response.ok) {
        await response.text();
        const err = new Error(`Gemini embedding request failed with HTTP ${response.status}.`);
        err.status = response.status === 429 ? 429 : response.status >= 500 ? 503 : 502;
        err.code = response.status === 429 ? 'RATE_LIMIT_EXCEEDED' : 'EMBEDDING_FAILED';
        err.retryable = response.status === 429 || response.status >= 500;
        throw err;
      }

      const data = await response.json();
      const values = data?.embedding?.values;
      if (!Array.isArray(values) || values.length !== EMBEDDING_DIMENSIONS || values.some(v => !Number.isFinite(v))) {
        throw new Error(`Gemini returned an invalid embedding; expected ${EMBEDDING_DIMENSIONS} finite values.`);
      }
      return values;
    } catch (error) {
      lastError = error;
      if (attempt === 2 || error.retryable === false || (error.status && error.status < 500 && error.status !== 429)) break;
      await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
    }
  }

  throw lastError;
}

/**
 * Embed multiple texts sequentially with rate-limit friendly delay
 * @param {string[]} texts
 * @param {number} [delayMs=100]
 * @returns {Promise<number[][]>}
 */
export async function embedBatch(texts, delayMs = 100) {
  const results = [];
  for (const text of texts) {
    results.push(await embedText(text, { task: 'document' }));
    if (delayMs > 0) await new Promise(resolve => setTimeout(resolve, delayMs));
  }
  return results;
}

/**
 * Compute cosine similarity between two embedding vectors
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number} cosine similarity in [-1, 1]
 */
export function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
    throw new Error('cosineSimilarity: both vectors must be arrays of equal length');
  }
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
