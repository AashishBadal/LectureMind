import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env reliably regardless of working directory
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config();

export const config = {
  port: process.env.PORT || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  databaseUrl: process.env.DATABASE_URL,
  directUrl: process.env.DIRECT_URL,
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  geminiTextModel: process.env.GEMINI_TEXT_MODEL || 'gemini-flash-lite-latest',
  geminiAnalysisModel: process.env.GEMINI_ANALYSIS_MODEL || 'gemini-flash-lite-latest',
  geminiAudioModel: process.env.GEMINI_AUDIO_MODEL || 'gemini-3.5-transcribe',
  jwtSecret: process.env.JWT_SECRET || 'lecturemind_jwt_default_secret_key_change_in_production_2026',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  // Google OAuth
  googleClientId: process.env.GOOGLE_CLIENT_ID || '',
  // eSewa EPAY v2 Integration Configuration
  esewa: {
    gatewayUrl: process.env.ESEWA_GATEWAY_URL || 'https://rc-epay.esewa.com.np/api/epay/main/v2/form',
    productCode: process.env.ESEWA_PRODUCT_CODE || 'EPAYTEST',
    secretKey: process.env.ESEWA_SECRET_KEY || '8gBm/:&EnhH.1/q',
    statusCheckUrl: process.env.ESEWA_STATUS_CHECK_URL || 'https://rc.esewa.com.np/api/epay/transaction/status'
  }
};

// Validate critical configuration in production
if (config.nodeEnv === 'production') {
  if (!config.databaseUrl) {
    console.warn('[WARN] DATABASE_URL is not defined in production environment.');
  }
  if (!config.geminiApiKey) {
    console.warn('[WARN] GEMINI_API_KEY is not defined in production environment.');
  }
  if (!process.env.JWT_SECRET) {
    console.warn('[WARN] JWT_SECRET is not explicitly defined in production environment.');
  }
}
