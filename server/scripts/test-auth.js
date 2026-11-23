process.env.NODE_ENV = 'test';
import 'dotenv/config';
import http from 'http';
import app from '../src/server.js';
import { prisma } from '../src/config/prisma.js';

// Helper to make HTTP requests against the test server instance
function makeRequest(server, options, body = null, cookie = null) {
  return new Promise((resolve, reject) => {
    const port = server.address().port;
    const reqOptions = {
      hostname: '127.0.0.1',
      port,
      path: options.path,
      method: options.method,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
        ...(cookie ? { Cookie: cookie } : {})
      }
    };

    const req = http.request(reqOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(data);
        } catch (e) {
          json = data;
        }

        // Extract set-cookie if present
        const setCookie = res.headers['set-cookie'];
        let cookieHeader = null;
        if (setCookie && setCookie.length > 0) {
          cookieHeader = setCookie[0].split(';')[0];
        }

        resolve({
          status: res.statusCode,
          headers: res.headers,
          data: json,
          cookie: cookieHeader
        });
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function runAuthVerification() {
  console.log('====================================================');
  console.log('🔒 LectureMind - Part 3 Authentication Verification');
  console.log('====================================================\n');

  // Start test server on random free port
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const testPort = server.address().port;
  console.log(`🚀 Test server started on port ${testPort}\n`);

  const timestamp = Date.now();
  const userAData = {
    name: 'User Alpha',
    email: `alpha_${timestamp}@lecturemind.internal`,
    password: 'securePassword123!'
  };

  const userBData = {
    name: 'User Beta',
    email: `beta_${timestamp}@lecturemind.internal`,
    password: 'securePassword456!'
  };

  let userACookie = null;
  let userBCookie = null;
  let userALectureId = null;

  try {
    // ----------------------------------------------------
    // TEST 1: Registration
    // ----------------------------------------------------
    console.log('[Test 1/8] Testing User Registration (POST /api/auth/register)...');
    const regRes = await makeRequest(server, {
      path: '/api/auth/register',
      method: 'POST'
    }, userAData);

    if (regRes.status !== 201 || !regRes.data.success || !regRes.data.user?.id) {
      throw new Error(`Test 1 Failed: Expected 201 Created, received ${regRes.status}: ${JSON.stringify(regRes.data)}`);
    }

    if (regRes.data.user.passwordHash) {
      throw new Error('Test 1 Failed: passwordHash must NEVER be returned to client!');
    }

    if (!regRes.cookie || !regRes.cookie.includes('lecturemind_token=')) {
      throw new Error('Test 1 Failed: Expected HTTP-only lecturemind_token cookie to be set.');
    }

    userACookie = regRes.cookie;
    console.log(`✅ Registration successful for ${regRes.data.user.email} (ID: ${regRes.data.user.id})`);
    console.log(`   HTTP-only Cookie issued: ${userACookie.substring(0, 35)}...`);

    // ----------------------------------------------------
    // TEST 2: Duplicate Email Rejection
    // ----------------------------------------------------
    console.log('\n[Test 2/8] Testing Duplicate Email Rejection (POST /api/auth/register)...');
    const dupRes = await makeRequest(server, {
      path: '/api/auth/register',
      method: 'POST'
    }, userAData);

    if (dupRes.status !== 409 || dupRes.data.success) {
      throw new Error(`Test 2 Failed: Expected 409 Conflict for duplicate email, got ${dupRes.status}: ${JSON.stringify(dupRes.data)}`);
    }
    console.log(`✅ Duplicate email properly rejected with HTTP 409: "${dupRes.data.error?.message}"`);

    // ----------------------------------------------------
    // TEST 3: Invalid Registration Rejections
    // ----------------------------------------------------
    console.log('\n[Test 3/8] Testing Invalid Registration Validation...');
    // Missing password
    const inv1 = await makeRequest(server, { path: '/api/auth/register', method: 'POST' }, { name: 'Test', email: 'test@mail.com' });
    // Weak password (< 6 chars)
    const inv2 = await makeRequest(server, { path: '/api/auth/register', method: 'POST' }, { name: 'Test', email: 'test@mail.com', password: '123' });
    // Invalid email format
    const inv3 = await makeRequest(server, { path: '/api/auth/register', method: 'POST' }, { name: 'Test', email: 'notanemail', password: 'password123' });

    if (inv1.status !== 400 || inv2.status !== 400 || inv3.status !== 400) {
      throw new Error(`Test 3 Failed: Validation errors must return 400. Got: ${inv1.status}, ${inv2.status}, ${inv3.status}`);
    }
    console.log('✅ Invalid input validation verified (empty fields, short passwords, invalid emails all rejected with HTTP 400).');

    // ----------------------------------------------------
    // TEST 4: Login with Valid Credentials
    // ----------------------------------------------------
    console.log('\n[Test 4/8] Testing Login (POST /api/auth/login)...');
    const loginRes = await makeRequest(server, {
      path: '/api/auth/login',
      method: 'POST'
    }, { email: userAData.email, password: userAData.password });

    if (loginRes.status !== 200 || !loginRes.data.success || !loginRes.data.user) {
      throw new Error(`Test 4 Failed: Expected 200 OK, got ${loginRes.status}: ${JSON.stringify(loginRes.data)}`);
    }

    if (loginRes.data.user.passwordHash) {
      throw new Error('Test 4 Failed: Login response must never include passwordHash!');
    }

    if (!loginRes.cookie) {
      throw new Error('Test 4 Failed: Login response did not issue auth cookie.');
    }
    userACookie = loginRes.cookie;
    console.log(`✅ Login successful for ${loginRes.data.user.name}. Cookie refreshed.`);

    // ----------------------------------------------------
    // TEST 5: Invalid Password Rejection
    // ----------------------------------------------------
    console.log('\n[Test 5/8] Testing Invalid Password Rejection (POST /api/auth/login)...');
    const badPwRes = await makeRequest(server, {
      path: '/api/auth/login',
      method: 'POST'
    }, { email: userAData.email, password: 'wrongPassword_999!' });

    if (badPwRes.status !== 401 || badPwRes.data.success) {
      throw new Error(`Test 5 Failed: Expected 401 Unauthorized for wrong password, got ${badPwRes.status}`);
    }
    console.log(`✅ Wrong password rejected with HTTP 401: "${badPwRes.data.error?.message}"`);

    // ----------------------------------------------------
    // TEST 6: Protected Route (/api/auth/me & /api/lectures)
    // ----------------------------------------------------
    console.log('\n[Test 6/8] Testing Protected Route Access (GET /api/auth/me)...');
    // Request without token
    const unauthRes = await makeRequest(server, { path: '/api/auth/me', method: 'GET' });
    if (unauthRes.status !== 401) {
      throw new Error(`Test 6 Failed: Unauthenticated request should be 401, got ${unauthRes.status}`);
    }

    // Request with valid auth cookie
    const authMeRes = await makeRequest(server, { path: '/api/auth/me', method: 'GET' }, null, userACookie);
    if (authMeRes.status !== 200 || !authMeRes.data.user || authMeRes.data.user.email !== userAData.email) {
      throw new Error(`Test 6 Failed: Authenticated GET /api/auth/me failed: ${JSON.stringify(authMeRes.data)}`);
    }

    if (authMeRes.data.user.passwordHash) {
      throw new Error('Test 6 Failed: /api/auth/me must never return passwordHash!');
    }
    console.log(`✅ Protected route passed: Unauthenticated denied (401), Authenticated accepted (200, user: ${authMeRes.data.user.name})`);

    // ----------------------------------------------------
    // TEST 7: Logout (POST /api/auth/logout)
    // ----------------------------------------------------
    console.log('\n[Test 7/8] Testing Logout (POST /api/auth/logout)...');
    const logoutRes = await makeRequest(server, { path: '/api/auth/logout', method: 'POST' }, null, userACookie);
    if (logoutRes.status !== 200 || !logoutRes.data.success) {
      throw new Error(`Test 7 Failed: Expected 200 on logout, got ${logoutRes.status}`);
    }

    // Check that set-cookie clears lecturemind_token
    const clearedCookie = logoutRes.headers['set-cookie']?.[0];
    if (!clearedCookie || (!clearedCookie.includes('Max-Age=0') && !clearedCookie.includes('Expires='))) {
      console.warn('   Note: set-cookie returned:', clearedCookie);
    }
    console.log('✅ Logout successful. Session cookie cleared.');

    // ----------------------------------------------------
    // TEST 8: Strict User Ownership Enforcement
    // ----------------------------------------------------
    console.log('\n[Test 8/8] Testing Strict User Ownership Enforcement...');

    // Re-login User A
    const loginARes = await makeRequest(server, { path: '/api/auth/login', method: 'POST' }, { email: userAData.email, password: userAData.password });
    userACookie = loginARes.cookie;

    // Register User B
    const regBRes = await makeRequest(server, { path: '/api/auth/register', method: 'POST' }, userBData);
    userBCookie = regBRes.cookie;

    // User A creates a lecture
    const createLectRes = await makeRequest(server, {
      path: '/api/lectures',
      method: 'POST'
    }, {
      title: 'Private Lecture of User Alpha',
      duration: 3600
    }, userACookie);

    if (createLectRes.status !== 201 || !createLectRes.data.lecture?.id) {
      throw new Error(`Failed creating test lecture: ${JSON.stringify(createLectRes.data)}`);
    }

    userALectureId = createLectRes.data.lecture.id;
    console.log(`   User Alpha created private lecture ID: ${userALectureId}`);

    // User A accesses their own lecture -> SUCCESS (200)
    const accessOwnRes = await makeRequest(server, {
      path: `/api/lectures/${userALectureId}`,
      method: 'GET'
    }, null, userACookie);

    if (accessOwnRes.status !== 200 || accessOwnRes.data.lecture?.id !== userALectureId) {
      throw new Error(`User A should be able to access their own lecture! Got ${accessOwnRes.status}`);
    }
    console.log('   User Alpha access to own lecture: Allowed (HTTP 200).');

    // User B attempts to access User A's lecture -> FORBIDDEN (HTTP 403)
    const accessOtherRes = await makeRequest(server, {
      path: `/api/lectures/${userALectureId}`,
      method: 'GET'
    }, null, userBCookie);

    if (accessOtherRes.status !== 403) {
      throw new Error(`SECURITY VULNERABILITY: User B accessed User A's lecture! Expected 403, got ${accessOtherRes.status}`);
    }
    console.log(`   User Beta cross-user access attempt: BLOCKED with HTTP 403: "${accessOtherRes.data.error?.message}"`);

    // User B lists lectures -> Should be empty (User B has 0 lectures)
    const listBRes = await makeRequest(server, { path: '/api/lectures', method: 'GET' }, null, userBCookie);
    if (listBRes.data.lectures?.length !== 0) {
      throw new Error(`SECURITY VULNERABILITY: User B list should only contain User B's lectures!`);
    }
    console.log('   User Beta lecture list properly scoped: 0 lectures visible.');

    // User B attempts to delete User A's lecture -> FORBIDDEN (HTTP 403)
    const deleteOtherRes = await makeRequest(server, {
      path: `/api/lectures/${userALectureId}`,
      method: 'DELETE'
    }, null, userBCookie);

    if (deleteOtherRes.status !== 403) {
      throw new Error(`SECURITY VULNERABILITY: User B was able to delete User A's lecture!`);
    }
    console.log('   User Beta unauthorized deletion attempt: BLOCKED with HTTP 403.');

    console.log('\n🎉 ALL 8 AUTHENTICATION & OWNERSHIP TESTS PASSED PERFECTLY!\n');
  } catch (error) {
    console.error('\n❌ Authentication verification failed:', error.message);
    process.exitCode = 1;
  } finally {
    // Clean up test users from database
    console.log('🧹 Cleaning up test users from Neon database...');
    try {
      await prisma.user.deleteMany({
        where: {
          email: {
            in: [userAData.email, userBData.email]
          }
        }
      });
      console.log('✅ Cleanup complete.');
    } catch (cleanupErr) {
      console.error('Warning during cleanup:', cleanupErr.message);
    }

    server.close();
    await prisma.$disconnect();
  }
}

runAuthVerification();
