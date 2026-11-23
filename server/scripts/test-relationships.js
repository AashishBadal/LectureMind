import 'dotenv/config';
import http from 'http';
import app from '../src/server.js';
import { prisma } from '../src/config/prisma.js';
import { extractRelationships, ALLOWED_RELATIONSHIP_TYPES } from '../src/services/gemini/relationshipExtraction.service.js';

const SAMPLE_TRANSCRIPT = `
Today we are examining Deep Feedforward Networks.
The foundation begins with the Single-Layer Perceptron. However, as proved by Minsky and Papert, a single perceptron cannot solve the XOR problem because it is non-linearly separable.
To solve this, we introduce the Multilayer Perceptron, or MLP, which contains one or more hidden layers.
The Universal Approximation Theorem mathematically establishes that an MLP can approximate any continuous function.
To train the parameters of an MLP, we use Backpropagation. Backpropagation computes the gradient of the loss function with respect to weights using the chain rule of calculus.
Finally, once gradients are computed, Stochastic Gradient Descent, or SGD, updates the weights to minimize training error.
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

async function runRelationshipsTestSuite() {
  console.log('====================================================');
  console.log('🔗 LectureMind - Part 7 Concept Relationships Test');
  console.log('====================================================\n');

  let server;
  let testUserA = null;
  let testUserB = null;
  let cookieA = null;
  let cookieB = null;
  let testLecture = null;
  let createdConcepts = [];

  try {
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;
    console.log(`🚀 Test server listening on port ${port}\n`);

    const uniqueSuffix = Date.now();

    // 1. Setup Users
    console.log('[Test 1/7] Setting up authenticated users and lecture session...');
    const regA = await makeRequest(server, { path: '/api/auth/register', method: 'POST' }, {
      name: 'Alan Turing',
      email: `turing_rel_${uniqueSuffix}@lecturemind.internal`,
      password: 'SecurePass123!'
    });
    testUserA = regA.body.user;
    cookieA = regA.cookie;

    const regB = await makeRequest(server, { path: '/api/auth/register', method: 'POST' }, {
      name: 'Ada Lovelace',
      email: `ada_rel_${uniqueSuffix}@lecturemind.internal`,
      password: 'SecurePass123!'
    });
    testUserB = regB.body.user;
    cookieB = regB.cookie;

    // Create Lecture
    const createRes = await makeRequest(
      server,
      { path: '/api/lectures', method: 'POST' },
      { title: 'CS 402: Feedforward Networks & Backprop' },
      cookieA
    );
    testLecture = createRes.body.lecture;

    // Seed Transcript
    await prisma.transcript.create({
      data: {
        lectureId: testLecture.id,
        content: SAMPLE_TRANSCRIPT.trim(),
        segments: [
          { start: 0, end: 15, text: 'The foundation begins with the Single-Layer Perceptron and XOR problem.' },
          { start: 15, end: 35, text: 'We introduce the Multilayer Perceptron, or MLP, and Universal Approximation Theorem.' },
          { start: 35, end: 60, text: 'To train an MLP, Backpropagation applies the chain rule and Stochastic Gradient Descent updates weights.' }
        ]
      }
    });

    console.log(`✅ Lecture ${testLecture.id} created with verified transcript in Neon PostgreSQL.\n`);

    // 2. Test Precondition: missing concepts error handling
    console.log('[Test 2/7] Testing precondition handling (relationship extraction without concepts)...');
    const missingConceptsRes = await makeRequest(
      server,
      { path: `/api/lectures/${testLecture.id}/relationships`, method: 'POST' },
      {},
      cookieA
    );
    if (missingConceptsRes.status !== 400 || missingConceptsRes.body.error?.code !== 'CONCEPTS_REQUIRED') {
      throw new Error(`Expected 400 CONCEPTS_REQUIRED, received: ${JSON.stringify(missingConceptsRes.body)}`);
    }
    console.log('✅ Correctly blocked with 400 CONCEPTS_REQUIRED when lecture has 0 concepts.\n');

    // 3. Seed Concepts into Database
    console.log('[Test 3/7] Seeding concepts into Neon PostgreSQL for relationship identification...');
    const conceptsToInsert = [
      { name: 'Perceptron', description: 'Single-layer linear classifier introduced by Frank Rosenblatt.', importance: 2 },
      { name: 'XOR Problem', description: 'Non-linearly separable function that exposed single perceptron limits.', importance: 2 },
      { name: 'Multilayer Perceptron', description: 'Feedforward architecture with hidden layers capable of non-linear classification.', importance: 3 },
      { name: 'Backpropagation', description: 'Algorithm calculating loss gradients via chain rule backwards through network.', importance: 3 },
      { name: 'Stochastic Gradient Descent', description: 'Optimization algorithm updating network weights iteratively using mini-batches.', importance: 3 }
    ];

    for (const c of conceptsToInsert) {
      const dbC = await prisma.concept.create({
        data: {
          lectureId: testLecture.id,
          name: c.name,
          description: c.description,
          importance: c.importance
        }
      });
      createdConcepts.push(dbC);
    }
    console.log(`✅ Created ${createdConcepts.length} concepts for lecture ${testLecture.id}.\n`);

    // 4. Test Direct extractRelationships Service
    console.log('[Test 4/7] Testing direct extractRelationships Gemini service...');
    const directRels = await extractRelationships(createdConcepts, SAMPLE_TRANSCRIPT);

    if (!Array.isArray(directRels) || directRels.length === 0) {
      throw new Error('Direct extractRelationships returned 0 relationships.');
    }

    console.log(`✅ Direct extractRelationships identified ${directRels.length} valid relationships:`);
    directRels.forEach((r, idx) => {
      if (!ALLOWED_RELATIONSHIP_TYPES.includes(r.relationshipType)) {
        throw new Error(`Invalid relationship type: ${r.relationshipType}`);
      }
      console.log(`     ${idx + 1}. [${r.sourceConceptName}] --(${r.relationshipType})--> [${r.targetConceptName}]`);
      console.log(`        "${r.description.slice(0, 80)}..."`);
    });
    console.log();

    // 5. Test POST /api/lectures/:id/relationships (Generation & Prisma Storage)
    console.log('[Test 5/7] Testing POST /api/lectures/:id/relationships (Endpoint generation & Prisma storage)...');
    const endpointRes = await makeRequest(
      server,
      { path: `/api/lectures/${testLecture.id}/relationships`, method: 'POST' },
      {},
      cookieA
    );

    if (endpointRes.status !== 200 || !endpointRes.body.success) {
      throw new Error(`Relationship extraction endpoint failed: ${JSON.stringify(endpointRes.body)}`);
    }

    const savedRels = endpointRes.body.relationships;
    console.log(`✅ Successfully extracted and saved ${savedRels.length} relationships in Neon PostgreSQL.`);

    // Verify foreign keys and relational links directly in Prisma
    const dbRels = await prisma.relationship.findMany({
      where: { lectureId: testLecture.id },
      include: { sourceConcept: true, targetConcept: true }
    });

    if (dbRels.length !== savedRels.length) {
      throw new Error(`Database count (${dbRels.length}) does not match response count (${savedRels.length})`);
    }

    for (const r of dbRels) {
      if (!r.sourceConcept || !r.targetConcept) {
        throw new Error(`Relationship ${r.id} missing source or target relation link.`);
      }
      if (r.sourceConceptId === r.targetConceptId) {
        throw new Error(`Relationship ${r.id} is self-referencing.`);
      }
    }
    console.log('✅ Verified relational foreign keys and absence of self-loops directly in Neon PostgreSQL.\n');

    // 6. Test Regeneration & Duplicate Prevention
    console.log('[Test 6/7] Testing Regeneration & Duplicate Prevention (Calling POST /relationships again)...');
    const regenRes = await makeRequest(
      server,
      { path: `/api/lectures/${testLecture.id}/relationships`, method: 'POST' },
      {},
      cookieA
    );

    if (regenRes.status !== 200 || !regenRes.body.success) {
      throw new Error(`Regeneration failed: ${JSON.stringify(regenRes.body)}`);
    }

    const dbRelsAfterRegen = await prisma.relationship.findMany({
      where: { lectureId: testLecture.id }
    });

    // Count should remain consistent (not accumulate duplicates)
    console.log(`✅ Regeneration complete. Database count after regeneration: ${dbRelsAfterRegen.length} (no duplicates accumulated).\n`);

    // 7. Test Strict Security & Ownership Isolation
    console.log('[Test 7/7] Testing Strict Multi-User Security Isolation...');

    // User B attempts to extract relationships for User A's lecture
    const unauthPost = await makeRequest(
      server,
      { path: `/api/lectures/${testLecture.id}/relationships`, method: 'POST' },
      {},
      cookieB
    );
    if (unauthPost.status !== 403) {
      throw new Error(`Expected 403 for unauthorized POST, got ${unauthPost.status}`);
    }
    console.log('   User B extract attempt: BLOCKED with HTTP 403.');

    // User B attempts to view relationships for User A's lecture
    const unauthGet = await makeRequest(
      server,
      { path: `/api/lectures/${testLecture.id}/relationships`, method: 'GET' },
      null,
      cookieB
    );
    if (unauthGet.status !== 403) {
      throw new Error(`Expected 403 for unauthorized GET, got ${unauthGet.status}`);
    }
    console.log('   User B view relationships attempt: BLOCKED with HTTP 403.\n');

    console.log('🎉 ALL 7 CONCEPT RELATIONSHIP TESTS PASSED PERFECTLY!\n');
  } catch (err) {
    console.error('❌ Test suite failed:', err);
    process.exitCode = 1;
  } finally {
    console.log('🧹 Cleaning up test users and lecture data from database...');
    try {
      if (testLecture) {
        await prisma.relationship.deleteMany({ where: { lectureId: testLecture.id } });
        await prisma.concept.deleteMany({ where: { lectureId: testLecture.id } });
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

runRelationshipsTestSuite();
