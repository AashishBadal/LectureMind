/**
 * Custom Gemini API Error classes and error sanitization utilities
 * Ensures raw API keys and provider endpoints are never leaked to clients.
 */

export class GeminiServiceError extends Error {
  constructor(message, code = 'GEMINI_ERROR', status = 500, details = null) {
    super(message);
    this.name = 'GeminiServiceError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

/**
 * Sanitizes and classifies Gemini API errors into clean user-safe application errors.
 * @param {Error} error
 * @returns {GeminiServiceError}
 */
export function handleGeminiError(error) {
  const msg = error?.message || 'Unknown Gemini error';

  // 1. Missing API Key
  if (msg.includes('API key') && (msg.includes('missing') || msg.includes('empty') || msg.includes('not configured'))) {
    return new GeminiServiceError(
      'Google Gemini API key is not configured on the server.',
      'MISSING_API_KEY',
      503
    );
  }

  // 2. Invalid or expired API Key
  if (msg.includes('API_KEY_INVALID') || msg.includes('API key not valid') || (msg.includes('400') && msg.includes('API key'))) {
    return new GeminiServiceError(
      'Authentication with Google Gemini API failed. Please check your server API key.',
      'INVALID_API_KEY',
      502
    );
  }

  // 3. Rate Limit / Quota Exceeded
  if (msg.includes('429') || msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED')) {
    return new GeminiServiceError(
      'Google Gemini API rate limit or quota exceeded. Please try again shortly.',
      'RATE_LIMIT_EXCEEDED',
      429
    );
  }

  // 4. Model Unavailable / Not Found
  if (msg.includes('404') || msg.includes('not found') || msg.includes('no longer available')) {
    return new GeminiServiceError(
      'The requested Gemini model is currently unavailable or unsupported. Check GEMINI_TEXT_MODEL configuration.',
      'MODEL_UNAVAILABLE',
      502
    );
  }

  // 5. JSON parsing error
  if (msg.includes('JSON') || msg.includes('parse')) {
    return new GeminiServiceError(
      'Gemini model returned an unparseable or invalid structured JSON response.',
      'INVALID_JSON_RESPONSE',
      502
    );
  }

  // 6. Timeout
  if (msg.includes('timeout') || msg.includes('ETIMEDOUT') || msg.includes('deadline')) {
    return new GeminiServiceError(
      'The request to Google Gemini API timed out. Please try again.',
      'REQUEST_TIMEOUT',
      504
    );
  }

  // Default fallback (scrubbing any potential key fragments)
  const sanitized = msg.replace(/[A-Za-z0-9_-]{35,}/g, '[REDACTED_SECRET]');
  return new GeminiServiceError(
    `AI service processing failed: ${sanitized}`,
    'GEMINI_SERVICE_ERROR',
    500
  );
}

/**
 * Safely parses and validates JSON output from Gemini.
 * Removes markdown code blocks like ```json ... ``` if model wrapped the output.
 * @param {string} rawText
 * @returns {any}
 */
export function parseAndValidateJson(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    throw new GeminiServiceError(
      'Empty response received from Gemini model.',
      'EMPTY_RESPONSE',
      502
    );
  }

  let cleaned = rawText.trim();

  // Strip markdown code fences if present
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  }

  try {
    return JSON.parse(cleaned);
  } catch (err) {
    throw new GeminiServiceError(
      `Failed to parse structured JSON from model: ${err.message}`,
      'INVALID_JSON_SYNTAX',
      502,
      { rawSnippet: cleaned.substring(0, 200) }
    );
  }
}
