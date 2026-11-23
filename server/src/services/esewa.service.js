import crypto from 'crypto';
import { config } from '../config/env.js';
import { logger } from '../utils/logger.js';

/**
 * Time-Based Credit Model:
 * 1 Credit covers 10 minutes of lecture audio/transcript (or fraction thereof).
 * Minimum 1 credit per analysis.
 */
export const CREDIT_INTERVAL_MINUTES = 10;
export const MIN_CREDITS_PER_ANALYSIS = 1;

/**
 * Calculates credits required to analyze a lecture based on duration in seconds.
 * @param {number|null} durationSeconds Duration in seconds
 * @param {string} [fallbackText] Transcript text to estimate duration from word count
 * @returns {number} Required credits (minimum 1)
 */
export function calculateLectureCredits(durationSeconds, fallbackText = '') {
  let sec = Number(durationSeconds);
  if (!Number.isFinite(sec) || sec <= 0) {
    if (typeof fallbackText === 'string' && fallbackText.trim()) {
      const words = fallbackText.trim().split(/\s+/).filter(Boolean).length;
      sec = Math.max(60, Math.round((words / 130) * 60)); // ~130 words per minute
    } else {
      sec = 600; // default 10 minutes (1 credit)
    }
  }
  const minutes = sec / 60;
  return Math.max(MIN_CREDITS_PER_ANALYSIS, Math.ceil(minutes / CREDIT_INTERVAL_MINUTES));
}

/**
 * Curated Credit Packages priced in Nepalese Rupees (NPR / रु)
 * 1 Credit = 10 minutes of lecture analysis
 */
export const CREDIT_PACKAGES = [
  {
    id: 'starter',
    name: 'Student Starter',
    priceNpr: 50,
    credits: 10,
    analyses: 'Up to 100 mins',
    badge: 'Starter',
    bonus: null,
    description: 'Perfect for trying out up to 100 minutes of lecture analysis & maps.',
    popular: false
  },
  {
    id: 'scholar',
    name: 'Scholar Pack',
    priceNpr: 150,
    credits: 35,
    analyses: 'Up to 350 mins',
    badge: 'Most Popular',
    bonus: '+5 Bonus Credits',
    description: 'Ideal for up to 350 minutes of semester coursework and weekly lectures.',
    popular: true
  },
  {
    id: 'pro',
    name: 'Pro Academic',
    priceNpr: 300,
    credits: 80,
    analyses: 'Up to 800 mins',
    badge: 'Best Value',
    bonus: '+15 Bonus Credits',
    description: 'Great for up to 800 minutes of heavy exam prep, research, and papers.',
    popular: false
  },
  {
    id: 'ultimate',
    name: 'Campus Ultimate',
    priceNpr: 600,
    credits: 200,
    analyses: 'Up to 2,000 mins',
    badge: 'Maximum Savings',
    bonus: '+40 Bonus Credits',
    description: 'All-inclusive pack with up to 2,000 minutes for power learners & research.',
    popular: false
  }
];

export const COST_PER_LECTURE_ANALYSIS = 5; // Legacy fallback
export const INITIAL_USER_CREDITS = 10;

/**
 * Generates an HMAC-SHA256 signature for eSewa EPAY v2 checkout form
 * @param {string|number} totalAmount e.g. "150"
 * @param {string} transactionUuid e.g. "LM-TXN-1715000000-ABC"
 * @param {string} productCode e.g. "EPAYTEST"
 * @returns {string} Base64 encoded HMAC-SHA256 signature
 */
export function generateEsewaSignature(totalAmount, transactionUuid, productCode) {
  const secretKey = config.esewa.secretKey;
  const message = `total_amount=${totalAmount},transaction_uuid=${transactionUuid},product_code=${productCode}`;
  return crypto.createHmac('sha256', secretKey).update(message).digest('base64');
}

/**
 * Decodes base64 encoded response parameter sent by eSewa upon redirect
 * @param {string} encodedData Base64 string from `?data=...` query parameter
 * @returns {object} Decoded JSON response
 */
export function decodeEsewaResponse(encodedData) {
  try {
    const jsonStr = Buffer.from(encodedData, 'base64').toString('utf-8');
    return JSON.parse(jsonStr);
  } catch (err) {
    logger.error('Failed to decode eSewa response base64:', err);
    throw new Error('Invalid or corrupted eSewa callback payload.');
  }
}

/**
 * Validates HMAC-SHA256 signature of eSewa EPAY v2 callback payload
 * @param {object} payload Decoded payload containing transaction_code, status, total_amount, transaction_uuid, product_code, signed_field_names, signature
 * @returns {boolean} True if signature is valid
 */
export function verifyEsewaSignature(payload) {
  try {
    const { signed_field_names, signature } = payload;
    if (!signed_field_names || !signature) {
      return false;
    }

    const secretKey = config.esewa.secretKey;
    const fieldList = signed_field_names.split(',');
    
    // Construct message according to eSewa v2 signature specifications
    const message = fieldList
      .map((field) => `${field}=${payload[field] !== undefined ? payload[field] : ''}`)
      .join(',');

    const expectedSignature = crypto.createHmac('sha256', secretKey).update(message).digest('base64');
    if (expectedSignature === signature) {
      return true;
    }

    // In some edge cases eSewa formats total_amount with commas (e.g. "1,000.0")
    if (payload.total_amount && typeof payload.total_amount === 'string' && payload.total_amount.includes(',')) {
      const sanitizedPayload = { ...payload, total_amount: payload.total_amount.replace(/,/g, '') };
      const sanitizedMessage = fieldList
        .map((field) => `${field}=${sanitizedPayload[field] !== undefined ? sanitizedPayload[field] : ''}`)
        .join(',');
      const sanitizedSignature = crypto.createHmac('sha256', secretKey).update(sanitizedMessage).digest('base64');
      if (sanitizedSignature === signature) {
        return true;
      }
    }

    return false;
  } catch (err) {
    logger.error('Error verifying eSewa signature:', err);
    return false;
  }
}

/**
 * Server-to-server transaction status check using eSewa API
 * @param {string} productCode
 * @param {string|number} totalAmount
 * @param {string} transactionUuid
 * @returns {Promise<{ success: boolean, data?: object, error?: string }>}
 */
export async function verifyWithEsewaApi(productCode, totalAmount, transactionUuid) {
  try {
    const baseUrl = (config.esewa.statusCheckUrl || 'https://rc.esewa.com.np/api/epay/transaction/status').replace(/\/+$/, '');
    const cleanAmount = String(totalAmount).replace(/,/g, '').trim();
    const url = `${baseUrl}/?product_code=${encodeURIComponent(productCode)}&total_amount=${encodeURIComponent(cleanAmount)}&transaction_uuid=${encodeURIComponent(transactionUuid)}`;
    
    logger.info(`Checking transaction status with eSewa API: ${url}`);
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.warn(`eSewa status check API responded with ${response.status}: ${errorText}`);
      return { success: false, error: `eSewa API returned HTTP ${response.status}` };
    }

    const data = await response.json();
    return { success: true, data };
  } catch (err) {
    logger.warn('Failed to contact eSewa status verification endpoint:', err.message);
    // Return gracefully so signature verification can serve as primary or fallback
    return { success: false, error: err.message };
  }
}
