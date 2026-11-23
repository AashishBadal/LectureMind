import 'dotenv/config';
import http from 'http';
import app from '../src/server.js';
import { prisma } from '../src/config/prisma.js';
import { generateLearningMap } from '../src/services/gemini/learningMap.service.js';

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

async function runLearningMapTestSuite() {
  console.log('====================================================');
  console.log('🗺️  LectureMind - Part 8 Interactive Learning Map Test');
  console.log('====================================================\n');

  let server;
  let testUserA = null;
  let testUserB = null;
  let cookieA = null;
  let cookieB = null;
  let testLecture = null;
  let createdConcepts = [];
  let createdRelationships = [];

  try {
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;
    console.log(`🚀 Test server listening on port ${port}\n`);

    const uniqueSuffix = Date.now();

    // 1. Service Layer Test: Layout & Synthesis
    console.log('[Test 1/7] Testing generateLearningMap service layer topological layout...');
    const mockConcepts = [
      { id: 'c1', name: 'Perceptron', description: 'Single-layer linear classifier', importance: 5, category: 'Core Principle' },
      { id: 'c2', name: 'XOR Problem', description: 'Linear separability limitation', importance: 4, category: 'Mathematical Model' },
      { id: 'c3', name: 'Multilayer Perceptron', description: 'Feedforward network with hidden layers', importance: 5, category: 'Architectural Component' },
      { id: 'c4', name: 'Backpropagation', description: 'Gradient computation via chain rule', importance: 5, category: 'Algorithm' },
      { id: 'c5', name: 'Stochastic Gradient Descent', description: 'Weight optimization iteratively', importance: 4, category: 'Algorithm' }
    ];

    const mockRelationships = [
      { id: 'r1', sourceConceptId: 'c1', targetConceptId: 'c2', relationshipType: 'leads_to', description: 'Limitation of perceptron revealed by XOR' },
      { id: 'r2', sourceConceptId: 'c2', targetConceptId: 'c3', relationshipType: 'necessitates', description: 'XOR necessitates multilayer architecture' },
      { id: 'r3', sourceConceptId: 'c3', targetConceptId: 'c4', relationshipType: 'trained_with', description: 'MLP is trained using backpropagation' },
      { id: 'r4', sourceConceptId: 'c4', targetConceptId: 'c5', relationshipType: 'leads_to', description: 'Backpropagation gradients feed SGD' }
    ];

    const mapData = await generateLearningMap(mockConcepts, mockRelationships);
    if (!mapData || !Array.isArray(mapData.nodes) || mapData.nodes.length !== 5) {
      throw new Error(`Expected 5 nodes in synthesized map data, received ${mapData?.nodes?.length}`);
    }
    if (!Array.isArray(mapData.edges) || mapData.edges.length !== 4) {
      throw new Error(`Expected 4 edges in synthesized map data, received ${mapData?.edges?.length}`);
    }

    // Verify coordinates and layout
    const allHaveCoords = mapData.nodes.every((n) => typeof n.x === 'number' && typeof n.y === 'number');
    if (!allHaveCoords) {
      throw new Error('Some nodes are missing (x, y) layout coordinates.');
    }
    console.log(`✅ [Test 1 PASS] Service generated ${mapData.nodes.length} nodes and ${mapData.edges.length} edges with topological layout.\n`);

    // 2. Setup Test Users & DB Fixtures
    console.log('[Test 2/7] Setting up authenticated users and lecture fixtures in Neon DB...');
    const regA = await makeRequest(server, { path: '/api/auth/register', method: 'POST' }, {
      name: 'Ada Lovelace',
      email: `lovelace_map_${uniqueSuffix}@lecturemind.internal`,
      password: 'SecurePass123!'
    });
    testUserA = regA.body.user;
    cookieA = regA.cookie;

    const regB = await makeRequest(server, { path: '/api/auth/register', method: 'POST' }, {
      name: 'Charles Babbage',
      email: `babbage_map_${uniqueSuffix}@lecturemind.internal`,
      password: 'SecurePass123!'
    });
    testUserB = regB.body.user;
    cookieB = regB.cookie;

    // Create Lecture
    testLecture = await prisma.lecture.create({
      data: {
        userId: testUserA.id,
        title: 'Deep Learning Architectures',
        originalFileName: 'deep_learning.mp3',
        status: 'analyzed',
        duration: 3600
      }
    });

    // Create Concepts in DB
    for (const c of mockConcepts) {
      const created = await prisma.concept.create({
        data: {
          lectureId: testLecture.id,
          name: c.name,
          description: c.description,
          importance: c.importance
        }
      });
      createdConcepts.push(created);
    }

    // Create Relationships in DB
    const conceptMap = new Map(createdConcepts.map((c) => [c.name, c.id]));
    const relDefs = [
      { s: 'Perceptron', t: 'XOR Problem', type: 'leads_to', desc: 'Perceptron limitation exposed' },
      { s: 'XOR Problem', t: 'Multilayer Perceptron', type: 'necessitates', desc: 'Hidden layers required' },
      { s: 'Multilayer Perceptron', t: 'Backpropagation', type: 'trained_with', desc: 'Weight calculation' },
      { s: 'Backpropagation', t: 'Stochastic Gradient Descent', type: 'leads_to', desc: 'Parameter update' }
    ];

    for (const r of relDefs) {
      const created = await prisma.relationship.create({
        data: {
          lectureId: testLecture.id,
          sourceConceptId: conceptMap.get(r.s),
          targetConceptId: conceptMap.get(r.t),
          relationshipType: r.type,
          description: r.desc
        }
      });
      createdRelationships.push(created);
    }
    console.log(`✅ [Test 2 PASS] Fixtures created: ${createdConcepts.length} concepts and ${createdRelationships.length} relationships.\n`);

    // 3. POST /api/lectures/:id/learning-map
    console.log('[Test 3/7] Testing POST /api/lectures/:id/learning-map (Synthesis & Neon DB Upsert)...');
    const postRes = await makeRequest(
      server,
      { path: `/api/lectures/${testLecture.id}/learning-map`, method: 'POST' },
      {},
      cookieA
    );

    if (postRes.status !== 200 || !postRes.body.success) {
      throw new Error(`POST learning-map failed: status ${postRes.status}, error: ${JSON.stringify(postRes.body)}`);
    }

    const savedMap = postRes.body.learningMap;
    if (!savedMap || !savedMap.mapData || !Array.isArray(savedMap.mapData.nodes)) {
      throw new Error('Returned learning map has invalid mapData payload.');
    }
    if (savedMap.mapData.nodes.length !== 5 || savedMap.mapData.edges.length !== 4) {
      throw new Error(`Expected 5 nodes and 4 edges, got ${savedMap.mapData.nodes.length} nodes and ${savedMap.mapData.edges.length} edges.`);
    }
    console.log(`✅ [Test 3 PASS] Learning map synthesized and persisted with ${savedMap.mapData.nodes.length} nodes and ${savedMap.mapData.edges.length} edges.\n`);

    // 4. GET /api/lectures/:id/learning-map
    console.log('[Test 4/7] Testing GET /api/lectures/:id/learning-map...');
    const getRes = await makeRequest(
      server,
      { path: `/api/lectures/${testLecture.id}/learning-map`, method: 'GET' },
      null,
      cookieA
    );

    if (getRes.status !== 200 || !getRes.body.success) {
      throw new Error(`GET learning-map failed: status ${getRes.status}, error: ${JSON.stringify(getRes.body)}`);
    }
    if (getRes.body.learningMap.lectureId !== testLecture.id) {
      throw new Error('GET returned map does not match lectureId.');
    }
    console.log('✅ [Test 4 PASS] Learning map retrieved successfully from Neon DB.\n');

    // 5. PUT /api/lectures/:id/learning-map (Updating Layout / Coordinates)
    console.log('[Test 5/7] Testing PUT /api/lectures/:id/learning-map (Custom Node Coordinates Persistence)...');
    const modifiedMapData = JSON.parse(JSON.stringify(savedMap.mapData));
    modifiedMapData.nodes[0].x = 777;
    modifiedMapData.nodes[0].y = 888;
    modifiedMapData.nodes[0].customTagged = true;

    const putRes = await makeRequest(
      server,
      { path: `/api/lectures/${testLecture.id}/learning-map`, method: 'PUT' },
      { mapData: modifiedMapData },
      cookieA
    );

    if (putRes.status !== 200 || !putRes.body.success) {
      throw new Error(`PUT learning-map failed: status ${putRes.status}, error: ${JSON.stringify(putRes.body)}`);
    }

    // Verify coordinates updated in database
    const verifyUpdated = await prisma.learningMap.findUnique({
      where: { lectureId: testLecture.id }
    });
    if (verifyUpdated.mapData.nodes[0].x !== 777 || verifyUpdated.mapData.nodes[0].y !== 888) {
      throw new Error('Updated coordinates were not persisted in database.');
    }
    console.log(`✅ [Test 5 PASS] Custom layout persisted: Node 0 position successfully updated to (777, 888).\n`);

    // 6. Test Regeneration & Upsert Idempotency
    console.log('[Test 6/7] Testing map regeneration idempotency (no duplicate records)...');
    const regenRes = await makeRequest(
      server,
      { path: `/api/lectures/${testLecture.id}/learning-map`, method: 'POST' },
      {},
      cookieA
    );

    if (regenRes.status !== 200) {
      throw new Error(`Regeneration failed with status ${regenRes.status}`);
    }

    const mapRowsCount = await prisma.learningMap.count({
      where: { lectureId: testLecture.id }
    });
    if (mapRowsCount !== 1) {
      throw new Error(`Expected exactly 1 LearningMap record, found ${mapRowsCount}.`);
    }
    console.log('✅ [Test 6 PASS] Regeneration successfully updated existing record without duplication.\n');

    // 7. Security Isolation: User B cannot access or modify User A's learning map
    console.log('[Test 7/7] Testing security isolation (unauthorized access and modification prevention)...');
    const unauthorizedGet = await makeRequest(
      server,
      { path: `/api/lectures/${testLecture.id}/learning-map`, method: 'GET' },
      null,
      cookieB
    );
    if (unauthorizedGet.status !== 403) {
      throw new Error(`Expected 403 Forbidden for User B GET, got ${unauthorizedGet.status}`);
    }

    const unauthorizedPut = await makeRequest(
      server,
      { path: `/api/lectures/${testLecture.id}/learning-map`, method: 'PUT' },
      { mapData: modifiedMapData },
      cookieB
    );
    if (unauthorizedPut.status !== 403) {
      throw new Error(`Expected 403 Forbidden for User B PUT, got ${unauthorizedPut.status}`);
    }

    const unauthorizedPost = await makeRequest(
      server,
      { path: `/api/lectures/${testLecture.id}/learning-map`, method: 'POST' },
      {},
      cookieB
    );
    if (unauthorizedPost.status !== 403) {
      throw new Error(`Expected 403 Forbidden for User B POST, got ${unauthorizedPost.status}`);
    }

    console.log('✅ [Test 7 PASS] Strict ownership verified: User B blocked with 403 on GET, PUT, and POST.\n');

    console.log('====================================================');
    console.log('🎉 ALL 7 LEARNING MAP TESTS PASSED SUCCESSFULLY!');
    console.log('====================================================\n');
  } finally {
    // Cleanup fixtures
    try {
      if (testLecture) {
        await prisma.learningMap.deleteMany({ where: { lectureId: testLecture.id } });
        await prisma.relationship.deleteMany({ where: { lectureId: testLecture.id } });
        await prisma.concept.deleteMany({ where: { lectureId: testLecture.id } });
        await prisma.lecture.delete({ where: { id: testLecture.id } });
      }
      if (testUserA) {
        await prisma.user.delete({ where: { id: testUserA.id } });
      }
      if (testUserB) {
        await prisma.user.delete({ where: { id: testUserB.id } });
      }
    } catch (cleanupErr) {
      console.warn('Test cleanup warning:', cleanupErr.message);
    }

    if (server) {
      server.close();
    }
  }
}

runLearningMapTestSuite()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Test suite failed:', err);
    process.exit(1);
  });
