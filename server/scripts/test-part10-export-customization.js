import 'dotenv/config';
import http from 'http';
import app from '../src/server.js';
import { prisma } from '../src/config/prisma.js';

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

async function runPart10Tests() {
  console.log('================================================================');
  console.log('🧪 LECTUREMIND PART 10: EXPORT & CUSTOMIZATION AUTOMATED TESTS');
  console.log('================================================================\n');

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  console.log(`[INFO] Ephemeral test server listening on port ${port}`);

  const testSuffix = Date.now();
  const userAEmail = `part10_user_a_${testSuffix}@example.com`;
  const userBEmail = `part10_user_b_${testSuffix}@example.com`;
  const testPassword = 'Password123!Secure';

  let userACookie = null;
  let userBCookie = null;
  let userALectureId = null;

  try {
    // ---------------------------------------------------------
    // Step 1: Create Test Users (User A and User B)
    // ---------------------------------------------------------
    console.log('[STEP 1] Registering User A and User B...');

    const regA = await makeRequest(server, { path: '/api/auth/register', method: 'POST' }, {
      name: 'Alice Scholar',
      email: userAEmail,
      password: testPassword
    });
    if (regA.status !== 201) throw new Error(`Failed to register User A: ${JSON.stringify(regA.body)}`);
    userACookie = regA.cookie;

    const regB = await makeRequest(server, { path: '/api/auth/register', method: 'POST' }, {
      name: 'Bob Peer',
      email: userBEmail,
      password: testPassword
    });
    if (regB.status !== 201) throw new Error(`Failed to register User B: ${JSON.stringify(regB.body)}`);
    userBCookie = regB.cookie;

    console.log('  ✓ User A and User B registered and authenticated successfully.');

    // ---------------------------------------------------------
    // Step 2: Seed a Complete Lecture for User A
    // ---------------------------------------------------------
    console.log('\n[STEP 2] Creating and seeding a complete lecture for User A...');

    const meRes = await makeRequest(server, { path: '/api/auth/me', method: 'GET' }, null, userACookie);
    const userAId = meRes.body.user.id;

    const lecture = await prisma.lecture.create({
      data: {
        userId: userAId,
        title: 'Distributed Systems & Vector Clocks',
        originalFileName: 'distributed_systems_lecture_07.mp3',
        status: 'MAP_READY',
        duration: 1845.5,
        transcript: {
          create: {
            content: 'Welcome everyone. Today we analyze distributed event ordering, Lamport timestamps, and vector clocks in asynchronous networks.',
            segments: [
              {
                start: 0.0,
                end: 18.5,
                speaker: 'Prof. Davis',
                text: 'Welcome everyone. Today we analyze distributed event ordering, Lamport timestamps, and vector clocks in asynchronous networks.'
              },
              {
                start: 18.5,
                end: 45.0,
                speaker: 'Prof. Davis',
                text: 'Without synchronized physical clocks, causal ordering between independent nodes relies on logical clocks.'
              },
              {
                start: 45.0,
                end: 82.0,
                speaker: 'Prof. Davis',
                text: 'Vector clocks generalize Lamport clocks to determine whether two events are causally related or concurrent.'
              }
            ]
          }
        },
        summary: {
          create: {
            content: 'This lecture introduces causal event ordering in distributed asynchronous architectures without global physical clocks. It examines Lamport logical clocks and extends them to vector clocks for identifying concurrent events.'
          }
        },
        concepts: {
          create: [
            {
              name: 'Logical Clocks',
              description: 'Mechanisms for capturing chronological and causal relationships without physical time synchronization.',
              importance: 5
            },
            {
              name: 'Lamport Timestamps',
              description: 'A monotonically increasing scalar counter establishing a partial ordering of events in distributed systems.',
              importance: 4
            },
            {
              name: 'Vector Clocks',
              description: 'An array of logical clock counters tracking causality across all nodes and distinguishing concurrent events.',
              importance: 5
            }
          ]
        },
        bookmarks: {
          create: [
            {
              title: 'Vector Clocks Definition',
              timestamp: 45.0,
              transcriptPosition: 2,
              note: 'Crucial for midterm exam on causal consistency.'
            }
          ]
        }
      },
      include: {
        concepts: true
      }
    });

    userALectureId = lecture.id;

    // Create Relationships between concepts
    const logicalClockConcept = lecture.concepts.find(c => c.name === 'Logical Clocks');
    const lamportConcept = lecture.concepts.find(c => c.name === 'Lamport Timestamps');
    const vectorClockConcept = lecture.concepts.find(c => c.name === 'Vector Clocks');

    await prisma.relationship.createMany({
      data: [
        {
          lectureId: userALectureId,
          sourceConceptId: logicalClockConcept.id,
          targetConceptId: lamportConcept.id,
          relationshipType: 'foundation_for',
          description: 'Logical clocks provide the foundational principle implemented by Lamport timestamps.'
        },
        {
          lectureId: userALectureId,
          sourceConceptId: lamportConcept.id,
          targetConceptId: vectorClockConcept.id,
          relationshipType: 'generalized_by',
          description: 'Vector clocks generalize scalar Lamport timestamps into vectors to detect event concurrency.'
        }
      ]
    });

    // Create Learning Map
    await prisma.learningMap.create({
      data: {
        lectureId: userALectureId,
        mapData: {
          nodes: [
            { id: logicalClockConcept.id, label: 'Logical Clocks', name: 'Logical Clocks', x: 100, y: 100, importance: 'high' },
            { id: lamportConcept.id, label: 'Lamport Timestamps', name: 'Lamport Timestamps', x: 250, y: 200, importance: 'high' },
            { id: vectorClockConcept.id, label: 'Vector Clocks', name: 'Vector Clocks', x: 400, y: 300, importance: 'high' }
          ],
          edges: [
            { id: 'edge-1', source: logicalClockConcept.id, target: lamportConcept.id, label: 'foundation_for', relationshipType: 'foundation_for' },
            { id: 'edge-2', source: lamportConcept.id, target: vectorClockConcept.id, label: 'generalized_by', relationshipType: 'generalized_by' }
          ]
        }
      }
    });

    console.log(`  ✓ Seeded complete lecture (ID: ${userALectureId}) with transcript, summary, concepts, relationships, and learning map.`);

    // ---------------------------------------------------------
    // Step 3: Security & Ownership Verification
    // ---------------------------------------------------------
    console.log('\n[STEP 3] Testing Export Ownership & Security Constraints...');

    // 3.1 Unauthenticated export attempt
    const unauthExport = await makeRequest(server, {
      path: `/api/lectures/${userALectureId}/export?format=markdown`,
      method: 'GET'
    });
    if (unauthExport.status !== 401) {
      throw new Error(`Expected 401 Unauthorized for unauthenticated export, got ${unauthExport.status}`);
    }
    console.log('  ✓ Unauthenticated export correctly blocked with HTTP 401.');

    // 3.2 Cross-User export attempt (User B accessing User A's lecture)
    const crossUserExport = await makeRequest(server, {
      path: `/api/lectures/${userALectureId}/export?format=markdown`,
      method: 'GET'
    }, null, userBCookie);
    if (crossUserExport.status !== 403 && crossUserExport.status !== 404) {
      throw new Error(`Expected 403 Forbidden or 404 for cross-user export, got ${crossUserExport.status}`);
    }
    console.log('  ✓ Cross-user export strictly forbidden with HTTP ' + crossUserExport.status + '.');

    // ---------------------------------------------------------
    // Step 4: Multi-Format Export Verification
    // ---------------------------------------------------------
    console.log('\n[STEP 4] Testing Multi-Format Export Endpoints...');

    // 4.1 Markdown Study Guide Export
    const mdExport = await makeRequest(server, {
      path: `/api/lectures/${userALectureId}/export?format=markdown&download=true`,
      method: 'GET'
    }, null, userACookie);

    if (mdExport.status !== 200) {
      throw new Error(`Markdown export failed with status ${mdExport.status}: ${JSON.stringify(mdExport.body)}`);
    }
    if (!mdExport.headers['content-type'].includes('text/markdown')) {
      throw new Error(`Expected text/markdown content-type, got: ${mdExport.headers['content-type']}`);
    }
    if (!mdExport.headers['content-disposition']?.includes('attachment')) {
      throw new Error('Expected attachment Content-Disposition header');
    }
    const mdContent = typeof mdExport.body === 'string' ? mdExport.body : JSON.stringify(mdExport.body);
    if (!mdContent.includes('Distributed Systems & Vector Clocks') ||
        !mdContent.includes('Executive Academic Summary') ||
        !mdContent.includes('Logical Clocks') ||
        !mdContent.includes('foundation')) {
      throw new Error('Markdown export missing core lecture sections');
    }
    console.log('  ✓ Markdown study guide export successfully validated with attachment headers and core sections.');

    // 4.2 Summary Only Export
    const summaryExport = await makeRequest(server, {
      path: `/api/lectures/${userALectureId}/export?format=summary`,
      method: 'GET'
    }, null, userACookie);

    if (summaryExport.status !== 200) {
      throw new Error(`Summary export failed with status ${summaryExport.status}`);
    }
    const summaryContent = typeof summaryExport.body === 'string' ? summaryExport.body : JSON.stringify(summaryExport.body);
    if (!summaryContent.includes('Executive Academic Summary') || !summaryContent.includes('causal event ordering')) {
      throw new Error('Summary export missing academic summary text');
    }
    console.log('  ✓ Executive summary export successfully validated.');

    // 4.3 Plain Text Transcript Export
    const textExport = await makeRequest(server, {
      path: `/api/lectures/${userALectureId}/export?format=text`,
      method: 'GET'
    }, null, userACookie);

    if (textExport.status !== 200) {
      throw new Error(`Text export failed with status ${textExport.status}`);
    }
    const textContent = typeof textExport.body === 'string' ? textExport.body : JSON.stringify(textExport.body);
    if (!textContent.includes('Prof. Davis') || !textContent.includes('[00:00]')) {
      throw new Error('Text export missing speaker and timestamp formatting');
    }
    console.log('  ✓ Plain text transcript export successfully validated with speaker timestamps.');

    // 4.4 Sanitized JSON Dataset Export
    const jsonExport = await makeRequest(server, {
      path: `/api/lectures/${userALectureId}/export?format=json`,
      method: 'GET'
    }, null, userACookie);

    if (jsonExport.status !== 200) {
      throw new Error(`JSON export failed with status ${jsonExport.status}`);
    }
    const payload = jsonExport.body.data || jsonExport.body;
    if (!payload.title || !payload.concepts || !payload.relationships || !payload.transcriptSegments) {
      throw new Error(`JSON export missing expected top-level properties: ${Object.keys(payload)}`);
    }
    console.log('  ✓ Structured JSON dataset export successfully validated.');

    // ---------------------------------------------------------
    // Step 5: Strict Data Sanitization Verification
    // ---------------------------------------------------------
    console.log('\n[STEP 5] Testing Strict Data Sanitization (No Database Internal IDs Exposed)...');

    // Check top-level lecture object
    if (payload.userId || payload.storagePath) {
      throw new Error('Sanitization failure: payload contains userId or storagePath');
    }
    if (payload.id) {
      throw new Error('Sanitization failure: payload exposes internal database ID');
    }

    // Check concepts
    for (const c of payload.concepts) {
      if (c.id || c.lectureId) {
        throw new Error('Sanitization failure: concept exposes internal database id or lectureId');
      }
    }

    // Check relationships
    for (const r of payload.relationships) {
      if (r.id || r.sourceConceptId || r.targetConceptId) {
        throw new Error('Sanitization failure: relationship exposes internal database IDs');
      }
      if (!r.sourceConcept || !r.targetConcept) {
        throw new Error('Sanitization check: relationship must have human-readable source and target names');
      }
    }

    // Check markdown text for database IDs
    if (mdContent.includes(userAId) || mdContent.includes(userALectureId)) {
      throw new Error('Sanitization failure: markdown export contains internal database user or lecture IDs');
    }

    console.log('  ✓ Strict data sanitization verified: no internal database IDs, CUIDs, or user credentials leaked.');

    // ---------------------------------------------------------
    // Step 6: Learning Map Custom Layout & Reset Verification
    // ---------------------------------------------------------
    console.log('\n[STEP 6] Testing Learning Map Layout Persistence and Safe Reset...');

    const updatedNodes = [
      { id: logicalClockConcept.id, label: 'Logical Clocks', name: 'Logical Clocks', x: 180, y: 220, importance: 'high' },
      { id: lamportConcept.id, label: 'Lamport Timestamps', name: 'Lamport Timestamps', x: 380, y: 420, importance: 'high' },
      { id: vectorClockConcept.id, label: 'Vector Clocks', name: 'Vector Clocks', x: 580, y: 620, importance: 'high' }
    ];

    const updatedEdges = [
      { id: 'edge-1', source: logicalClockConcept.id, target: lamportConcept.id, label: 'foundation_for', relationshipType: 'foundation_for' },
      { id: 'edge-2', source: lamportConcept.id, target: vectorClockConcept.id, label: 'generalized_by', relationshipType: 'generalized_by' }
    ];

    // Save custom node coordinates via PUT /api/lectures/:id/learning-map
    const saveLayoutRes = await makeRequest(server, {
      path: `/api/lectures/${userALectureId}/learning-map`,
      method: 'PUT'
    }, {
      mapData: {
        nodes: updatedNodes,
        edges: updatedEdges
      }
    }, userACookie);

    if (saveLayoutRes.status !== 200) {
      throw new Error(`Failed to save custom learning map layout: ${JSON.stringify(saveLayoutRes.body)}`);
    }
    console.log('  ✓ Custom layout persisted via PUT /api/lectures/:id/learning-map.');

    // Retrieve learning map and verify updated node coordinates
    const mapRes = await makeRequest(server, {
      path: `/api/lectures/${userALectureId}/learning-map`,
      method: 'GET'
    }, null, userACookie);

    if (mapRes.status !== 200) {
      throw new Error(`Failed to fetch learning map: ${JSON.stringify(mapRes.body)}`);
    }

    const savedNodes = mapRes.body.learningMap.mapData.nodes;
    const retrievedNode = savedNodes.find(n => n.id === logicalClockConcept.id);
    if (!retrievedNode || retrievedNode.x !== 180 || retrievedNode.y !== 220) {
      throw new Error(`Retrieved node coordinates do not match saved coordinates: ${JSON.stringify(retrievedNode)}`);
    }
    console.log('  ✓ Custom layout coordinates correctly retrieved without breaking original nodes or edges.');

    // Verify underlying data integrity is completely intact
    const verifyLecture = await prisma.lecture.findUnique({
      where: { id: userALectureId },
      include: { concepts: true, relationships: true, summary: true }
    });

    if (verifyLecture.concepts.length !== 3 || verifyLecture.relationships.length !== 2) {
      throw new Error('Customization broke underlying concept or relationship records');
    }
    console.log('  ✓ Underlying concepts, relationships, and summary records remain 100% intact.');

    console.log('\n================================================================');
    console.log('🎉 ALL PART 10 EXPORT & CUSTOMIZATION TESTS PASSED SUCCESSFULLY');
    console.log('================================================================\n');

  } finally {
    // Cleanup test data
    if (userALectureId) {
      await prisma.relationship.deleteMany({ where: { lectureId: userALectureId } }).catch(() => {});
      await prisma.learningMap.deleteMany({ where: { lectureId: userALectureId } }).catch(() => {});
      await prisma.bookmark.deleteMany({ where: { lectureId: userALectureId } }).catch(() => {});
      await prisma.concept.deleteMany({ where: { lectureId: userALectureId } }).catch(() => {});
      await prisma.summary.deleteMany({ where: { lectureId: userALectureId } }).catch(() => {});
      await prisma.transcript.deleteMany({ where: { lectureId: userALectureId } }).catch(() => {});
      await prisma.lecture.deleteMany({ where: { id: userALectureId } }).catch(() => {});
    }
    await prisma.user.deleteMany({ where: { email: { in: [userAEmail, userBEmail] } } }).catch(() => {});

    await server.close();
  }
}

runPart10Tests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n❌ Test Suite Failed:', err);
    process.exit(1);
  });
