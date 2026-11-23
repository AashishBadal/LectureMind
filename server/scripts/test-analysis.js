import 'dotenv/config';
import http from 'http';
import app from '../src/server.js';
import { prisma } from '../src/config/prisma.js';
import { analyzeLecture } from '../src/services/gemini/analysis.service.js';

// Realistic university lecture transcript for grounding
const SAMPLE_CS_TRANSCRIPT = `
Good morning everyone. Today in CS 402, we are discussing the architecture of Deep Feedforward Networks, specifically focusing on Backpropagation and Gradient Descent.

First, let's understand the Perceptron. The single-layer perceptron was introduced in the late 1950s by Frank Rosenblatt. It takes weighted inputs, sums them, and passes them through an activation step function. However, as Minsky and Papert proved in 1969, a single perceptron cannot solve non-linearly separable problems, most famously the XOR problem.

To overcome this limitation, we use the Multilayer Perceptron, or MLP. An MLP introduces one or more hidden layers between the input and output. The universal approximation theorem guarantees that a feedforward network with a single hidden layer and non-linear activation functions can approximate any continuous function on compact subsets of R^n.

Now, how do we train these hidden layers? We use Backpropagation. Backpropagation is an efficient algorithm for computing the gradient of the loss function with respect to every weight in the network. It applies the chain rule of calculus repeatedly backwards from the final output layer to the earliest input layer.

Finally, once backpropagation gives us these partial derivatives or gradients, we update the weights using Gradient Descent. Specifically, Stochastic Gradient Descent, or SGD, takes mini-batches of training samples rather than the entire dataset, balancing computational speed and gradient variance.
`;

function makeRequest(server, options, body = null, cookie = null) {
  return new Promise((resolve, reject) => {
    const port = server.address().port;
    const reqOptions = {
      hostname: '127.0.0.1',
      port,
      path: options.path,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(cookie && { Cookie: cookie }),
        ...(options.headers || {})
      }
    };

    const req = http.request(reqOptions, (res) => {
      let data = '';
      const setCookie = res.headers['set-cookie'];

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        let parsed = null;
        try {
          parsed = JSON.parse(data);
        } catch (e) {
          parsed = data;
        }

        let cookieHeader = null;
        if (setCookie && setCookie.length > 0) {
          cookieHeader = setCookie[0].split(';')[0];
        }

        resolve({
          status: res.statusCode,
          headers: res.headers,
          cookie: cookieHeader,
          body: parsed
        });
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

async function runAnalysisTestSuite() {
  console.log('====================================================');
  console.log('🧠 LectureMind - Part 6 Gemini Lecture Analysis Test');
  console.log('====================================================\n');

  let server;
  let testUserA = null;
  let testUserB = null;
  let cookieA = null;
  let cookieB = null;
  let testLecture = null;

  try {
    // Start temporary test server
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;
    console.log(`🚀 Test server listening on port ${port}\n`);

    // TEST 1: Direct Service Test
    console.log('[Test 1/5] Testing direct analyzeLecture service with Gemini...');
    const analysisResult = await analyzeLecture(SAMPLE_CS_TRANSCRIPT);

    if (!analysisResult.summary || typeof analysisResult.summary !== 'string') {
      throw new Error('Analysis did not produce a valid summary.');
    }
    if (!Array.isArray(analysisResult.concepts) || analysisResult.concepts.length === 0) {
      throw new Error('Analysis did not extract concepts.');
    }

    console.log('✅ Direct analyzeLecture succeeded!');
    console.log(`   Summary length: ${analysisResult.summary.length} characters`);
    console.log(`   Extracted Concepts (${analysisResult.concepts.length}):`);
    analysisResult.concepts.slice(0, 4).forEach((c, idx) => {
      console.log(`     ${idx + 1}. [${c.importance.toUpperCase()}] ${c.name}: ${c.description.slice(0, 60)}...`);
    });
    console.log();

    // TEST 2: Setup Users & Lecture with Transcript
    console.log('[Test 2/5] Creating test users and lecture with transcript...');
    const uniqueSuffix = Date.now();

    const regA = await makeRequest(server, { path: '/api/auth/register', method: 'POST' }, {
      name: 'Alan Turing',
      email: `turing_analysis_${uniqueSuffix}@lecturemind.internal`,
      password: 'SecurePass123!'
    });
    testUserA = regA.body.user;
    cookieA = regA.cookie;

    const regB = await makeRequest(server, { path: '/api/auth/register', method: 'POST' }, {
      name: 'Ada Lovelace',
      email: `ada_analysis_${uniqueSuffix}@lecturemind.internal`,
      password: 'SecurePass123!'
    });
    testUserB = regB.body.user;
    cookieB = regB.cookie;

    // Create Lecture
    const createRes = await makeRequest(
      server,
      { path: '/api/lectures', method: 'POST' },
      { title: 'CS 402: Deep Feedforward Networks & Backprop' },
      cookieA
    );
    testLecture = createRes.body.lecture;

    // Seed Transcript into DB
    await prisma.transcript.create({
      data: {
        lectureId: testLecture.id,
        content: SAMPLE_CS_TRANSCRIPT.trim(),
        segments: [
          { start: 0, end: 15, text: 'Good morning everyone. Today in CS 402, we are discussing Deep Feedforward Networks.' },
          { start: 15, end: 35, text: 'First, let us understand the Perceptron and the XOR problem.' },
          { start: 35, end: 60, text: 'We use Backpropagation and Gradient Descent to train multi-layer networks.' }
        ]
      }
    });

    // Update status to TRANSCRIBED
    await prisma.lecture.update({
      where: { id: testLecture.id },
      data: { status: 'TRANSCRIBED' }
    });

    console.log(`✅ Lecture ${testLecture.id} created with initial status TRANSCRIBED.\n`);

    // TEST 3: POST /api/lectures/:id/analyze
    console.log('[Test 3/5] Testing POST /api/lectures/:id/analyze...');
    const analyzeRes = await makeRequest(
      server,
      { path: `/api/lectures/${testLecture.id}/analyze`, method: 'POST' },
      {},
      cookieA
    );

    if (analyzeRes.status !== 200 || !analyzeRes.body.success) {
      throw new Error(`Analyze endpoint failed with status ${analyzeRes.status}: ${JSON.stringify(analyzeRes.body)}`);
    }

    console.log('✅ Endpoint analysis succeeded!');
    console.log(`   Updated Lecture Status: ${analyzeRes.body.status}`);
    console.log(`   Summary ID: ${analyzeRes.body.summary.id}`);
    console.log(`   Concepts Saved: ${analyzeRes.body.concepts.length}`);

    // Verify in Neon PostgreSQL via Prisma
    const dbSummary = await prisma.summary.findUnique({ where: { lectureId: testLecture.id } });
    const dbConcepts = await prisma.concept.findMany({ where: { lectureId: testLecture.id } });
    if (!dbSummary || !dbSummary.content) {
      throw new Error('Summary record was not saved to Neon PostgreSQL.');
    }
    if (!dbConcepts || dbConcepts.length === 0) {
      throw new Error('Concept records were not saved to Neon PostgreSQL.');
    }
    console.log('✅ Verified Summary and Concept persistence directly in Neon PostgreSQL.\n');

    // TEST 4: GET /api/lectures/:id/summary and GET /api/lectures/:id/concepts
    console.log('[Test 4/5] Testing GET /api/lectures/:id/summary and GET /api/lectures/:id/concepts...');
    const summaryRes = await makeRequest(
      server,
      { path: `/api/lectures/${testLecture.id}/summary`, method: 'GET' },
      null,
      cookieA
    );
    if (summaryRes.status !== 200 || !summaryRes.body.summary) {
      throw new Error(`GET /summary failed: ${JSON.stringify(summaryRes.body)}`);
    }
    console.log(`✅ GET /summary succeeded. Content length: ${summaryRes.body.summary.content.length} chars.`);

    const conceptsRes = await makeRequest(
      server,
      { path: `/api/lectures/${testLecture.id}/concepts`, method: 'GET' },
      null,
      cookieA
    );
    if (conceptsRes.status !== 200 || !Array.isArray(conceptsRes.body.concepts)) {
      throw new Error(`GET /concepts failed: ${JSON.stringify(conceptsRes.body)}`);
    }
    console.log(`✅ GET /concepts succeeded. Retrieved ${conceptsRes.body.concepts.length} concepts ordered by importance.\n`);

    // TEST 5: Strict Security & Ownership Isolation
    console.log('[Test 5/5] Testing Strict Security & Ownership Isolation...');

    // User B attempts to analyze User A's lecture
    const unauthAnalyze = await makeRequest(
      server,
      { path: `/api/lectures/${testLecture.id}/analyze`, method: 'POST' },
      {},
      cookieB
    );
    if (unauthAnalyze.status !== 403) {
      throw new Error(`Expected 403 for unauthorized analysis, got ${unauthAnalyze.status}`);
    }
    console.log('   User B analyze attempt: BLOCKED with HTTP 403.');

    // User B attempts to view User A's summary
    const unauthSummary = await makeRequest(
      server,
      { path: `/api/lectures/${testLecture.id}/summary`, method: 'GET' },
      null,
      cookieB
    );
    if (unauthSummary.status !== 403) {
      throw new Error(`Expected 403 for unauthorized summary view, got ${unauthSummary.status}`);
    }
    console.log('   User B view summary attempt: BLOCKED with HTTP 403.');

    // User B attempts to view User A's concepts
    const unauthConcepts = await makeRequest(
      server,
      { path: `/api/lectures/${testLecture.id}/concepts`, method: 'GET' },
      null,
      cookieB
    );
    if (unauthConcepts.status !== 403) {
      throw new Error(`Expected 403 for unauthorized concepts view, got ${unauthConcepts.status}`);
    }
    console.log('   User B view concepts attempt: BLOCKED with HTTP 403.\n');

    console.log('🎉 ALL 5 LECTURE ANALYSIS & SECURITY TESTS PASSED PERFECTLY!\n');
  } catch (err) {
    console.error('❌ Test suite failed:', err);
    process.exitCode = 1;
  } finally {
    // Cleanup test data
    console.log('🧹 Cleaning up test users and lectures from database...');
    try {
      if (testLecture) {
        await prisma.concept.deleteMany({ where: { lectureId: testLecture.id } });
        await prisma.summary.deleteMany({ where: { lectureId: testLecture.id } });
        await prisma.transcript.deleteMany({ where: { lectureId: testLecture.id } });
        await prisma.lecture.deleteMany({ where: { id: testLecture.id } });
      }
      if (testUserA) {
        await prisma.user.deleteMany({ where: { id: testUserA.id } });
      }
      if (testUserB) {
        await prisma.user.deleteMany({ where: { id: testUserB.id } });
      }
      console.log('✅ Cleanup complete.');
    } catch (cleanErr) {
      console.warn('Warning during cleanup:', cleanErr.message);
    }

    if (server) {
      server.close();
    }
    await prisma.$disconnect();
  }
}

runAnalysisTestSuite();
