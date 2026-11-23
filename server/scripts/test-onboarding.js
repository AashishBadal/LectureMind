import 'dotenv/config';
import http from 'http';
import { prisma } from '../src/config/prisma.js';
import { generateToken } from '../src/utils/auth.js';

async function testOnboardingFlow() {
  console.log('Testing Onboarding & Profile Features...');

  // Create or retrieve a test user
  const testEmail = `test_onboarding_${Date.now()}@example.com`;
  const user = await prisma.user.create({
    data: {
      name: 'Ada Lovelace',
      email: testEmail,
      emailVerified: true,
      credits: 10,
      role: 'STUDENT',
      onboardingCompleted: false
    }
  });

  console.log(`Created test user: ${user.id} (${user.email}), onboardingCompleted: ${user.onboardingCompleted}`);

  const token = generateToken({ id: user.id, email: user.email });

  // Test complete onboarding endpoint
  const onboardingPayload = {
    role: 'STUDENT',
    institution: 'University of Cambridge',
    fieldOfStudy: 'Computer Science & AI',
    academicLevel: 'Undergraduate',
    primaryGoal: 'EXAM_PREP',
    aiTonePreference: 'CONCISE'
  };

  const reqOptions = {
    hostname: '127.0.0.1',
    port: 5000,
    path: '/api/auth/onboarding',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    }
  };

  const response = await new Promise((resolve, reject) => {
    const req = http.request(reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(data) }));
    });
    req.on('error', reject);
    req.write(JSON.stringify(onboardingPayload));
    req.end();
  });

  console.log('Onboarding API status:', response.status);
  console.log('Onboarding response user:', response.body.user);

  if (response.body.user?.onboardingCompleted !== true) {
    throw new Error('Onboarding did not set onboardingCompleted to true!');
  }
  if (response.body.user?.fieldOfStudy !== 'Computer Science & AI') {
    throw new Error('Field of study mismatch!');
  }

  // Test getMe endpoint
  const getMeRes = await new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port: 5000,
      path: '/api/auth/me',
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(data) }));
    });
    req.on('error', reject);
    req.end();
  });

  console.log('GET /api/auth/me status:', getMeRes.status);
  console.log('GET /api/auth/me user:', getMeRes.body.user);

  if (getMeRes.body.user?.institution !== 'University of Cambridge') {
    throw new Error('Institution mismatch in getMe!');
  }

  // Cleanup test user
  await prisma.user.delete({ where: { id: user.id } });
  console.log('Cleaned up test user. ALL CHECKS PASSED SUCCESSFULLY!');
  process.exit(0);
}

testOnboardingFlow().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});

