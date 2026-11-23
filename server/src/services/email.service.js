import nodemailer from 'nodemailer';
import { logger } from '../utils/logger.js';

// Configuration from environment variables
const SMTP_HOST = process.env.BREVO_SMTP_HOST || 'smtp-relay.brevo.com';
const SMTP_PORT = parseInt(process.env.BREVO_SMTP_PORT || '587', 10);
const SMTP_USER = process.env.BREVO_SMTP_USER || process.env.SMTP_USER || '';
const SMTP_PASS = process.env.BREVO_SMTP_KEY || process.env.BREVO_SMTP_PASS || process.env.SMTP_PASS || '';
const SMTP_FROM = process.env.BREVO_SMTP_FROM || process.env.SMTP_FROM || '"LectureMind AI" <noreply@lecturemind.ai>';

let transporter = null;

function getTransporter() {
  if (!transporter && SMTP_USER && SMTP_PASS) {
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465, // true for 465, false for 587
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS
      }
    });
  }
  return transporter;
}

/**
 * Send password reset email via Brevo SMTP
 *
 * @param {Object} params
 * @param {string} params.to - Recipient email address
 * @param {string} [params.name] - Recipient name
 * @param {string} params.resetUrl - Full password reset URL
 * @returns {Promise<{ success: boolean, messageId?: string, previewUrl?: string }>}
 */
/**
 * Send registration OTP verification email via Brevo SMTP
 *
 * @param {Object} params
 * @param {string} params.to - Recipient email address
 * @param {string} [params.name] - Recipient name
 * @param {string} params.otp - 6-digit verification code
 * @returns {Promise<{ success: boolean, messageId?: string }>}
 */
export async function sendRegistrationOtpEmail({ to, name = 'Student', otp }) {
  const mailTransporter = getTransporter();
  const recipientName = name || 'Student';
  const expirationTime = '10 minutes';
  const timeString = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

  const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Verify your LectureMind account</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0b0f17; margin: 0; padding: 0; color: #e2e8f0; }
    .container { max-width: 580px; margin: 40px auto; background-color: #131b2e; border: 1px solid #1e293b; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
    .header { background: linear-gradient(135deg, #0ea5e9 0%, #6366f1 100%); padding: 32px 24px; text-align: center; }
    .logo-text { font-size: 24px; font-weight: 800; color: #ffffff; letter-spacing: -0.5px; margin: 0; }
    .subtitle { color: rgba(255,255,255,0.9); font-size: 13px; margin-top: 6px; }
    .body { padding: 32px 28px; line-height: 1.6; }
    .greeting { font-size: 18px; font-weight: 600; color: #ffffff; margin-bottom: 16px; }
    .message { color: #94a3b8; font-size: 14px; margin-bottom: 24px; }
    .otp-container { text-align: center; margin: 28px 0; }
    .otp-label { font-size: 11px; text-transform: uppercase; letter-spacing: 2px; color: #38bdf8; font-weight: 700; margin-bottom: 8px; }
    .otp-box { display: inline-block; padding: 14px 28px; background: rgba(2, 132, 199, 0.12); border: 2px solid #0284c7; border-radius: 14px; font-size: 34px; font-weight: 800; letter-spacing: 8px; color: #ffffff; font-family: 'Courier New', Courier, monospace; box-shadow: 0 4px 20px rgba(2, 132, 199, 0.25); }
    .expiry-note { font-size: 12px; color: #94a3b8; margin-top: 24px; text-align: center; background: rgba(30, 41, 59, 0.5); padding: 12px; border-radius: 8px; }
    .footer { border-top: 1px solid #1e293b; padding: 20px; text-align: center; font-size: 12px; color: #475569; background-color: #0f172a; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo-text">LectureMind</div>
      <div class="subtitle">AI-Based Smart Learning Map Generator</div>
    </div>
    <div class="body">
      <div class="greeting">Welcome, ${recipientName}! 🎉</div>
      <p class="message">
        Thanks for signing up! Use the 6-digit verification code below to confirm your email address and activate your LectureMind account:
      </p>

      <div class="otp-container">
        <div class="otp-label">Email Verification Code</div>
        <div class="otp-box">${otp}</div>
      </div>

      <div class="expiry-note">
        ⏱ This verification code is valid for <strong>${expirationTime}</strong>.<br />
        If you did not create a LectureMind account, please ignore this email.
      </div>
    </div>
    <div class="footer">
      &copy; ${new Date().getFullYear()} LectureMind AI Platform. All rights reserved.
    </div>
  </div>
</body>
</html>
  `.trim();

  const textContent = `
Welcome to LectureMind, ${recipientName}!

Your 6-digit email verification code is:

  ${otp}

This code is valid for ${expirationTime}. If you did not sign up for LectureMind, you can safely ignore this email.

— LectureMind AI Team
  `.trim();

  if (mailTransporter) {
    try {
      const info = await mailTransporter.sendMail({
        from: SMTP_FROM,
        to,
        subject: `Verify your LectureMind account: ${otp} [${timeString}]`,
        headers: {
          'X-Entity-Ref-ID': `lecturemind-reg-otp-${Date.now()}`
        },
        text: textContent,
        html: htmlContent
      });

      logger.info(`[BREVO SMTP] Registration OTP email sent to ${to} (MessageId: ${info.messageId})`);
      return { success: true, messageId: info.messageId };
    } catch (error) {
      logger.error(`[BREVO SMTP] Failed to send registration OTP email to ${to}:`, error);
      throw error;
    }
  } else {
    logger.error(`[BREVO SMTP] SMTP credentials not configured in server environment.`);
    throw new Error('SMTP email service is not configured. Please contact the administrator.');
  }
}

/**
 * Send password reset OTP email via Brevo SMTP
 *
 * @param {Object} params
 * @param {string} params.to - Recipient email address
 * @param {string} [params.name] - Recipient name
 * @param {string} params.otp - 6-digit verification code
 * @param {string} [params.resetUrl] - Optional fallback reset URL
 * @returns {Promise<{ success: boolean, messageId?: string, previewUrl?: string }>}
 */
export async function sendPasswordResetOtpEmail({ to, name = 'Student', otp, resetUrl }) {
  const mailTransporter = getTransporter();
  const recipientName = name || 'Student';
  const expirationTime = '15 minutes';
  const timeString = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

  const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Your LectureMind Password Reset Code</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0b0f17; margin: 0; padding: 0; color: #e2e8f0; }
    .container { max-width: 580px; margin: 40px auto; background-color: #131b2e; border: 1px solid #1e293b; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
    .header { background: linear-gradient(135deg, #0ea5e9 0%, #6366f1 100%); padding: 32px 24px; text-align: center; }
    .logo-text { font-size: 24px; font-weight: 800; color: #ffffff; letter-spacing: -0.5px; margin: 0; }
    .subtitle { color: rgba(255,255,255,0.9); font-size: 13px; margin-top: 6px; }
    .body { padding: 32px 28px; line-height: 1.6; }
    .greeting { font-size: 18px; font-weight: 600; color: #ffffff; margin-bottom: 16px; }
    .message { color: #94a3b8; font-size: 14px; margin-bottom: 24px; }
    .otp-container { text-align: center; margin: 28px 0; }
    .otp-label { font-size: 11px; text-transform: uppercase; letter-spacing: 2px; color: #38bdf8; font-weight: 700; margin-bottom: 8px; }
    .otp-box { display: inline-block; padding: 14px 28px; background: rgba(2, 132, 199, 0.12); border: 2px solid #0284c7; border-radius: 14px; font-size: 34px; font-weight: 800; letter-spacing: 8px; color: #ffffff; font-family: 'Courier New', Courier, monospace; box-shadow: 0 4px 20px rgba(2, 132, 199, 0.25); }
    .expiry-note { font-size: 12px; color: #94a3b8; margin-top: 24px; text-align: center; background: rgba(30, 41, 59, 0.5); padding: 12px; border-radius: 8px; }
    .footer { border-top: 1px solid #1e293b; padding: 20px; text-align: center; font-size: 12px; color: #475569; background-color: #0f172a; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo-text">LectureMind</div>
      <div class="subtitle">AI-Based Smart Learning Map Generator</div>
    </div>
    <div class="body">
      <div class="greeting">Hello, ${recipientName}</div>
      <p class="message">
        We received a request to reset your password. Use the 6-digit verification code below to complete your password reset:
      </p>
      
      <div class="otp-container">
        <div class="otp-label">Verification Code (OTP)</div>
        <div class="otp-box">${otp}</div>
      </div>

      ${resetUrl ? `
      <div style="text-align: center; margin: 24px 0 16px 0;">
        <a href="${resetUrl}" target="_blank" style="display: inline-block; padding: 12px 28px; background: linear-gradient(135deg, #0284c7 0%, #4f46e5 100%); color: #ffffff !important; text-decoration: none; border-radius: 10px; font-weight: 600; font-size: 14px; box-shadow: 0 4px 14px rgba(2, 132, 199, 0.4);">
          Or Click Here to Reset Directly
        </a>
      </div>` : ''}

      <div class="expiry-note">
        ⏱ This verification code is valid for <strong>${expirationTime}</strong>.<br />
        If you did not request this password reset, please ignore this email.
      </div>
    </div>
    <div class="footer">
      &copy; ${new Date().getFullYear()} LectureMind AI Platform. All rights reserved.
    </div>
  </div>
</body>
</html>
  `.trim();

  const textContent = `
Hello ${recipientName},

Your 6-digit password reset verification code (OTP) for LectureMind is:

  ${otp}

This code is valid for ${expirationTime}. If you did not request this code, you can safely ignore this email.

— LectureMind AI Team
  `.trim();

  if (mailTransporter) {
    try {
      const info = await mailTransporter.sendMail({
        from: SMTP_FROM,
        to,
        subject: `Your LectureMind Reset Code: ${otp} [${timeString}]`,
        headers: {
          'X-Entity-Ref-ID': `lecturemind-otp-${Date.now()}`
        },
        text: textContent,
        html: htmlContent
      });

      logger.info(`[BREVO SMTP] OTP email sent successfully to ${to} (MessageId: ${info.messageId})`);
      return { success: true, messageId: info.messageId };
    } catch (error) {
      logger.error(`[BREVO SMTP] Failed to send OTP email to ${to}:`, error);
      throw error;
    }
  } else {
    logger.error(`[BREVO SMTP] SMTP credentials not configured in server environment.`);
    throw new Error('SMTP email service is not configured. Please contact the administrator.');
  }
}

/**
 * Send password reset email via Brevo SMTP (Link-based)
 */
export async function sendPasswordResetEmail({ to, name = 'Student', resetUrl }) {
  const mailTransporter = getTransporter();
  const recipientName = name || 'Student';
  const expirationTime = '1 hour';

  const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Reset Your LectureMind Password</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0b0f17; margin: 0; padding: 0; color: #e2e8f0; }
    .container { max-width: 580px; margin: 40px auto; background-color: #131b2e; border: 1px solid #1e293b; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
    .header { background: linear-gradient(135deg, #0ea5e9 0%, #6366f1 100%); padding: 32px 24px; text-align: center; }
    .logo-text { font-size: 24px; font-weight: 800; color: #ffffff; letter-spacing: -0.5px; margin: 0; }
    .subtitle { color: rgba(255,255,255,0.9); font-size: 13px; margin-top: 6px; }
    .body { padding: 32px 28px; line-height: 1.6; }
    .greeting { font-size: 18px; font-weight: 600; color: #ffffff; margin-bottom: 16px; }
    .message { color: #94a3b8; font-size: 14px; margin-bottom: 24px; }
    .btn-container { text-align: center; margin: 32px 0; }
    .btn { display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #0284c7 0%, #4f46e5 100%); color: #ffffff !important; text-decoration: none; border-radius: 12px; font-weight: 600; font-size: 15px; box-shadow: 0 4px 14px rgba(2, 132, 199, 0.4); }
    .btn:hover { opacity: 0.95; }
    .fallback-box { background-color: #0b0f17; border: 1px solid #1e293b; border-radius: 8px; padding: 12px 16px; word-break: break-all; font-size: 12px; color: #38bdf8; font-family: monospace; margin-top: 16px; }
    .expiry-note { font-size: 12px; color: #64748b; margin-top: 24px; text-align: center; }
    .footer { border-top: 1px solid #1e293b; padding: 20px; text-align: center; font-size: 12px; color: #475569; background-color: #0f172a; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo-text">LectureMind</div>
      <div class="subtitle">AI-Based Smart Learning Map Generator</div>
    </div>
    <div class="body">
      <div class="greeting">Hello, ${recipientName}</div>
      <p class="message">
        We received a request to reset the password for your LectureMind account. Click the button below to choose a new secure password.
      </p>
      
      <div class="btn-container">
        <a href="${resetUrl}" target="_blank" class="btn">Reset Password</a>
      </div>

      <p class="message" style="font-size: 13px;">
        If the button above does not work, copy and paste this link into your web browser:
      </p>
      <div class="fallback-box">
        ${resetUrl}
      </div>

      <p class="expiry-note">
        This link will expire in <strong>${expirationTime}</strong>. If you did not request a password reset, you can safely ignore this email; your account remains secure.
      </p>
    </div>
    <div class="footer">
      &copy; ${new Date().getFullYear()} LectureMind AI Platform. All rights reserved.
    </div>
  </div>
</body>
</html>
  `.trim();

  const textContent = `
Hello ${recipientName},

We received a request to reset the password for your LectureMind account.
Please visit the following URL to set a new password:

${resetUrl}

This link is valid for ${expirationTime}. If you did not request this, please disregard this email.

— LectureMind Team
  `.trim();

  if (mailTransporter) {
    try {
      const info = await mailTransporter.sendMail({
        from: SMTP_FROM,
        to,
        subject: 'Reset Your LectureMind Password',
        text: textContent,
        html: htmlContent
      });

      logger.info(`[BREVO SMTP] Password reset email sent to ${to} (MessageId: ${info.messageId})`);
      return { success: true, messageId: info.messageId };
    } catch (error) {
      logger.error(`[BREVO SMTP] Failed to send email to ${to}:`, error);
      throw error;
    }
  } else {
    logger.error(`[BREVO SMTP] SMTP credentials not configured in server environment.`);
    throw new Error('SMTP email service is not configured. Please contact the administrator.');
  }
}
