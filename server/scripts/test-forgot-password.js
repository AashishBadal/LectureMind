process.env.NODE_ENV = 'test';
import 'dotenv/config';
import http from 'http';
import crypto from 'crypto';
import app from '../src/server.js';
import { prisma } from '../src/config/prisma.js';
import { hashPassword, comparePassword } from '../src/utils/auth.js';

let server;
let BASE_URL;

async function startTestServer() {
  return new Promise((resolve) => {
    server = http.createServer(app);
    server.listen(0, () => {
      const port = server.address().port;
      BASE_URL = `http://localhost:${port}`;
      console.log(`[INFO] Forgot Password test server listening on port ${port}`);
      resolve();
    });
  });
}

async function stopTestServer() {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function runTests() {
  console.log('\n========================================================================');
  console.log('🔑  LECTUREMIND FORGOT & RESET PASSWORD (BREVO SMTP) TESTS');
  console.log('========================================================================\n');

  try {
    await startTestServer();

    const timestamp = Date.now();
    const testEmail = `student_fp_${timestamp}@university.edu`;
    const initialPassword = 'InitialSecurePassword123!';
    const updatedPassword = 'BrandNewPassword456!';

    // Step 1: Register test user
    console.log('[STEP 1] Registering test student user...');
    const regRes = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Jordan Lee',
        email: testEmail,
        password: initialPassword
      })
    });
    const regData = await regRes.json();
    if (!regRes.ok) throw new Error(`Registration failed: ${JSON.stringify(regData)}`);
    console.log(`  ✓ User registered: ${regData.user.id} (${testEmail})`);

    // Step 2: Request Forgot Password (generates 6-digit OTP)
    console.log('\n[STEP 2] Requesting password reset OTP (forgot-password)...');
    const forgotRes = await fetch(`${BASE_URL}/api/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail })
    });
    const forgotData = await forgotRes.json();
    if (!forgotRes.ok || !forgotData.success) {
      throw new Error(`Forgot password request failed: ${JSON.stringify(forgotData)}`);
    }
    console.log(`  ✓ Forgot password endpoint returned 200 OK: "${forgotData.message}"`);

    // Step 3: Verify token hash and expiry stored in Neon DB
    console.log('\n[STEP 3] Inspecting OTP storage in Neon database...');
    const userInDb = await prisma.user.findUnique({
      where: { email: testEmail }
    });
    if (!userInDb.resetPasswordToken) {
      throw new Error('resetPasswordToken was not saved in database!');
    }
    if (!userInDb.resetPasswordExpires || userInDb.resetPasswordExpires <= new Date()) {
      throw new Error('resetPasswordExpires is not a valid future timestamp!');
    }
    console.log(`  ✓ OTP hash in DB: ${userInDb.resetPasswordToken.substring(0, 16)}... (SHA-256 secure hash)`);
    console.log(`  ✓ Expiry in DB: ${userInDb.resetPasswordExpires.toISOString()}`);

    // Step 4: Test rejection of non-existent email (404)
    console.log('\n[STEP 4] Testing rejection of non-existent email...');
    const enumRes = await fetch(`${BASE_URL}/api/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: `non_existent_${timestamp}@unknown.edu` })
    });
    const enumData = await enumRes.json();
    if (enumRes.status !== 404 || enumData.success) {
      throw new Error(`Expected 404 for non-existent email, got ${enumRes.status}`);
    }
    console.log(`  ✓ Non-existent email properly rejected with HTTP 404: "${enumData.error.message}"`);

    // Step 5: Test invalid / wrong OTP
    console.log('\n[STEP 5] Testing rejection of incorrect 6-digit OTP...');
    const badOtpRes = await fetch(`${BASE_URL}/api/auth/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        otp: '000000'
      })
    });
    const badOtpData = await badOtpRes.json();
    if (badOtpRes.status !== 400) {
      throw new Error(`Expected 400 for incorrect OTP, got ${badOtpRes.status}`);
    }
    console.log(`  ✓ Incorrect OTP properly rejected with HTTP 400: "${badOtpData.error.message}"`);

    // Step 6: Test genuine OTP verification & reset
    console.log('\n[STEP 6] Testing genuine 6-digit OTP reset...');
    const testOtp = '749215';
    const testOtpHash = crypto.createHash('sha256').update(`${testEmail.toLowerCase()}:${testOtp}`).digest('hex');

    await prisma.user.update({
      where: { email: testEmail },
      data: {
        resetPasswordToken: testOtpHash,
        resetPasswordExpires: new Date(Date.now() + 10 * 60 * 1000)
      }
    });

    // Verify OTP first
    const verifyRes = await fetch(`${BASE_URL}/api/auth/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        otp: testOtp
      })
    });
    const verifyData = await verifyRes.json();
    if (!verifyRes.ok || !verifyData.success) {
      throw new Error(`Valid OTP verification failed: ${JSON.stringify(verifyData)}`);
    }
    console.log(`  ✓ OTP verified successfully with HTTP 200!`);

    // Reset password with valid OTP
    const resetRes = await fetch(`${BASE_URL}/api/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        otp: testOtp,
        newPassword: updatedPassword
      })
    });
    const resetData = await resetRes.json();
    if (!resetRes.ok || !resetData.success) {
      throw new Error(`Password reset with OTP failed: ${JSON.stringify(resetData)}`);
    }
    console.log(`  ✓ Password successfully reset via OTP: "${resetData.message}"`);

    // Step 7: Verify token is invalidated in DB
    console.log('\n[STEP 7] Verifying OTP invalidation in Neon DB...');
    const userAfterReset = await prisma.user.findUnique({
      where: { email: testEmail }
    });
    if (userAfterReset.resetPasswordToken !== null || userAfterReset.resetPasswordExpires !== null) {
      throw new Error('resetPasswordToken and resetPasswordExpires should be null after successful reset!');
    }
    console.log(`  ✓ Reset token and expiry cleared from DB (set to null).`);

    // Step 9: Verify old password no longer works
    console.log('\n[STEP 9] Verifying old password is now rejected...');
    const oldLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        password: initialPassword
      })
    });
    if (oldLoginRes.status !== 401) {
      throw new Error(`Expected 401 when logging in with old password, got ${oldLoginRes.status}`);
    }
    console.log(`  ✓ Old password correctly rejected with HTTP 401.`);

    // Step 10: Verify new password logs in successfully
    console.log('\n[STEP 10] Verifying new password logs in successfully...');
    const newLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        password: updatedPassword
      })
    });
    const newLoginData = await newLoginRes.json();
    if (!newLoginRes.ok || !newLoginData.success) {
      throw new Error(`Login with new password failed: ${JSON.stringify(newLoginData)}`);
    }
    console.log(`  ✓ Successfully authenticated with new password! User: ${newLoginData.user.name}`);

    console.log('\n========================================================================');
    console.log('🎉 ALL FORGOT & RESET PASSWORD TESTS PASSED WITH 100% SUCCESS');
    console.log('========================================================================\n');

  } finally {
    await stopTestServer();
  }
}

runTests().catch((err) => {
  console.error('\n❌ Test failed with error:', err);
  process.exit(1);
});
