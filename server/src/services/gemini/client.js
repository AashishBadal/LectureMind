import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import { handleGeminiError, GeminiServiceError } from './geminiErrors.js';

let genAIInstance = null;

/**
 * Initializes and returns the singleton Google Generative AI client
 * @returns {GoogleGenerativeAI}
 */
export const getGeminiClient = () => {
  if (!config.geminiApiKey || !config.geminiApiKey.trim()) {
    throw new GeminiServiceError(
      'Google Gemini API key is missing from server configuration.',
      'MISSING_API_KEY',
      503
    );
  }

  if (!genAIInstance) {
    genAIInstance = new GoogleGenerativeAI(config.geminiApiKey.trim());
  }

  return genAIInstance;
};

/**
 * Returns a configured Generative Model instance
 * @param {object} options
 * @param {string} [options.modelName]
 * @param {boolean} [options.jsonMode=true]
 * @param {string} [options.systemInstruction]
 * @param {number} [options.temperature=0.2]
 */
export const getGenerativeModel = ({
  modelName = config.geminiTextModel,
  jsonMode = true,
  systemInstruction = undefined,
  temperature = 0.2,
  timeout = 600000 // 10 minutes default to support long audio files
} = {}) => {
  const client = getGeminiClient();

  const generationConfig = {
    temperature,
    ...(jsonMode && { responseMimeType: 'application/json' })
  };

  return client.getGenerativeModel(
    {
      model: modelName,
      generationConfig,
      ...(systemInstruction && { systemInstruction })
    },
    {
      timeout
    }
  );
};

/**
 * Generates content with automatic retry on transient errors (503 / 429 / timeouts / fetch failures)
 * and intelligent fallback between supported models.
 * @param {object} modelOptions
 * @param {string|Array} content
 * @param {number} [maxRetries=3]
 * @returns {Promise<any>}
 */
export const generateWithRetry = async (modelOptions, content, maxRetries = 3) => {
  let attempt = 0;
  let currentModelName = modelOptions.modelName || config.geminiTextModel;

  while (attempt <= maxRetries) {
    try {
      const model = getGenerativeModel({
        ...modelOptions,
        modelName: currentModelName
      });
      return await model.generateContent(content);
    } catch (err) {
      attempt++;
      const errMsg = err?.message || '';

      // Check if error is 503 high demand, 429 quota, fetch failure, or network timeout
      const isTransient =
        errMsg.includes('503') ||
        errMsg.includes('429') ||
        errMsg.includes('high demand') ||
        errMsg.includes('quota') ||
        errMsg.includes('fetch failed') ||
        errMsg.includes('timeout') ||
        errMsg.includes('ECONNRESET') ||
        errMsg.includes('ETIMEDOUT');

      const isUnavailable =
        errMsg.includes('404') ||
        errMsg.includes('not found') ||
        errMsg.includes('no longer available');

      if (attempt <= maxRetries && (isTransient || isUnavailable)) {
        logger.warn(`Gemini attempt ${attempt} failed on model ${currentModelName} (${isTransient ? 'transient/timeout' : '404'}). Retrying with fallback...`);

        // Smart model progression across distinct high-speed Flash-Lite / Flash models:
        const fallbackOrder = ['gemini-flash-lite-latest', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-flash-latest', 'gemini-3.5-flash'];
        const currentIdx = fallbackOrder.indexOf(currentModelName);
        const nextIdx = currentIdx === -1 ? 0 : (currentIdx + 1) % fallbackOrder.length;
        currentModelName = fallbackOrder[nextIdx];

        // Wait with backoff (fast 500ms multiplier for responsive fallback)
        await new Promise((r) => setTimeout(r, attempt * 500));
        continue;
      }

      throw handleGeminiError(err);
    }
  }
};

let cachedHealthStatus = null;
let lastHealthCheckTime = 0;
const HEALTH_CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Tests the Gemini API connection safely without leaking credentials.
 * Results are cached for 60 seconds to protect rate-limited quotas during polling.
 * @param {boolean} [forceRefresh=false]
 * @returns {Promise<{ connected: boolean, model: string, latencyMs?: number, error?: string }>}
 */
export const testGeminiConnection = async (forceRefresh = false) => {
  const now = Date.now();
  if (!forceRefresh && cachedHealthStatus && (now - lastHealthCheckTime < HEALTH_CACHE_TTL_MS)) {
    return cachedHealthStatus;
  }

  const startTime = Date.now();
  try {
    if (!config.geminiApiKey || !config.geminiApiKey.trim()) {
      cachedHealthStatus = {
        connected: false,
        model: config.geminiTextModel,
        error: 'GEMINI_API_KEY is not configured on the backend server.'
      };
      lastHealthCheckTime = now;
      return cachedHealthStatus;
    }

    const result = await generateWithRetry(
      {
        modelName: config.geminiTextModel,
        jsonMode: false,
        temperature: 0.1
      },
      'Health check ping. Respond with: OK'
    );

    const text = result?.response?.text();
    const latencyMs = Date.now() - startTime;

    if (!text) {
      throw new Error('No content returned in response.');
    }

    cachedHealthStatus = {
      connected: true,
      model: config.geminiTextModel,
      latencyMs
    };
    lastHealthCheckTime = now;
    return cachedHealthStatus;
  } catch (err) {
    const sanitized = handleGeminiError(err);
    logger.error('Gemini connection test failed:', sanitized.message);
    cachedHealthStatus = {
      connected: false,
      model: config.geminiTextModel,
      error: sanitized.message
    };
    lastHealthCheckTime = now;
    return cachedHealthStatus;
  }
};
