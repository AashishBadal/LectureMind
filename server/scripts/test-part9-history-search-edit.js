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

async function runPart9Tests() {
  console.log('\n======================================================');
  console.log('  LECTUREMIND — PART 9: HISTORY, SEARCH & EDITING TESTS');
  console.log('======================================================\n');

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  console.log(`[INFO] Test server listening on ephemeral port: ${port}`);

  const runTimestamp = Date.now();
  const emailA = `part9.userA.${runTimestamp}@lecturemind.internal`;
  const emailB = `part9.userB.${runTimestamp}@lecturemind.internal`;
  const password = 'Password@123Secure!';

  let cookieA = null;
  let cookieB = null;
  let lectureAId = null;
  let lectureBId = null;
  let bookmarkAId = null;

  let totalTests = 0;
  let passedTests = 0;

  function assertTest(name, condition, details = '') {
    totalTests++;
    if (condition) {
      passedTests++;
      console.log(`  [PASS] ${name}`);
      if (details) console.log(`         ${details}`);
    } else {
      console.error(`  [FAIL] ${name}`);
      if (details) console.error(`         Reason: ${details}`);
    }
  }

  try {
    // ---------------------------------------------------------
    // Setup 1: Register User A and User B
    // ---------------------------------------------------------
    console.log('\n--- PHASE 1: User Registration & Authentication ---');
    const regResA = await makeRequest(
      server,
      { path: '/api/auth/register', method: 'POST' },
      { name: 'Dr. Elena UserA', email: emailA, password }
    );
    assertTest(
      'Register User A',
      regResA.status === 201 && regResA.body?.success,
      `User ID: ${regResA.body?.user?.id}`
    );
    cookieA = regResA.cookie;

    const regResB = await makeRequest(
      server,
      { path: '/api/auth/register', method: 'POST' },
      { name: 'Prof. Marcus UserB', email: emailB, password }
    );
    assertTest(
      'Register User B',
      regResB.status === 201 && regResB.body?.success,
      `User ID: ${regResB.body?.user?.id}`
    );
    cookieB = regResB.cookie;

    // ---------------------------------------------------------
    // Setup 2: Create Distinct Lectures for User A and User B
    // ---------------------------------------------------------
    console.log('\n--- PHASE 2: Create Owned Lectures ---');
    const lecResA = await makeRequest(
      server,
      { path: '/api/lectures', method: 'POST' },
      {
        title: 'Distributed Consensus and Raft Protocol',
        duration: 3600
      },
      cookieA
    );
    lectureAId = lecResA.body?.lecture?.id;
    assertTest(
      'Create Lecture for User A',
      lecResA.status === 201 && lectureAId,
      `Lecture A ID: ${lectureAId}`
    );

    const lecResB = await makeRequest(
      server,
      { path: '/api/lectures', method: 'POST' },
      {
        title: 'Quantum Computing and Superposition Dynamics',
        duration: 2400
      },
      cookieB
    );
    lectureBId = lecResB.body?.lecture?.id;
    assertTest(
      'Create Lecture for User B',
      lecResB.status === 201 && lectureBId,
      `Lecture B ID: ${lectureBId}`
    );

    // Populate Lecture A with transcript, summary, concepts, relationships, and learning map
    await prisma.transcript.create({
      data: {
        lectureId: lectureAId,
        content:
          'In this lecture, we examine distributed consensus. The Raft algorithm replaces complex Paxos by decomposing consensus into leader election, log replication, and safety guarantees.',
        segments: [
          { start: 0, end: 15, text: 'In this lecture, we examine distributed consensus.', speaker: 'Professor' },
          { start: 16, end: 45, text: 'The Raft algorithm replaces complex Paxos by decomposing consensus.', speaker: 'Professor' },
          { start: 46, end: 90, text: 'Leader election and log replication ensure state machine replication.', speaker: 'Professor' }
        ]
      }
    });

    await prisma.summary.create({
      data: {
        lectureId: lectureAId,
        content:
          'Comprehensive overview of consensus algorithms in distributed systems. Focuses on the Raft protocol as an understandable alternative to multi-Paxos.'
      }
    });

    const c1 = await prisma.concept.create({
      data: {
        lectureId: lectureAId,
        name: 'Raft Consensus Algorithm',
        description: 'A consensus algorithm designed for state machine replication with clear leader-follower model.',
        importance: 3
      }
    });

    const c2 = await prisma.concept.create({
      data: {
        lectureId: lectureAId,
        name: 'Leader Election Protocol',
        description: 'The mechanism where nodes transition from candidate to leader via randomized timeout election.',
        importance: 2
      }
    });

    await prisma.relationship.create({
      data: {
        lectureId: lectureAId,
        sourceConceptId: c1.id,
        targetConceptId: c2.id,
        relationshipType: 'contains',
        description: 'Raft protocol encompasses randomized leader election.'
      }
    });

    await prisma.learningMap.create({
      data: {
        lectureId: lectureAId,
        mapData: {
          nodes: [
            { id: c1.id, name: c1.name, x: 200, y: 150, importance: 3 },
            { id: c2.id, name: c2.name, x: 500, y: 150, importance: 2 }
          ],
          edges: [
            { id: 'edge-1', source: c1.id, target: c2.id, relationshipType: 'contains' }
          ]
        }
      }
    });

    await prisma.lecture.update({
      where: { id: lectureAId },
      data: { status: 'COMPLETED' }
    });

    // ---------------------------------------------------------
    // Test 1: User Ownership Isolation & History Display
    // ---------------------------------------------------------
    console.log('\n--- PHASE 3: Strict User Ownership Isolation & History Statuses ---');
    const histResA = await makeRequest(
      server,
      { path: '/api/lectures', method: 'GET' },
      null,
      cookieA
    );

    assertTest(
      'User A history contains Lecture A',
      histResA.status === 200 &&
        Array.isArray(histResA.body?.lectures) &&
        histResA.body.lectures.some((l) => l.id === lectureAId),
      `User A total lectures: ${histResA.body?.lectures?.length}`
    );

    assertTest(
      'User A history strictly EXCLUDES User B lecture (Data Isolation)',
      !histResA.body?.lectures?.some((l) => l.id === lectureBId),
      'User B lecture is not visible to User A'
    );

    const lectureRecordA = histResA.body.lectures.find((l) => l.id === lectureAId);
    assertTest(
      'History reports correct status badges for Lecture A',
      lectureRecordA?.processingStatus === 'COMPLETED' &&
        lectureRecordA?.transcriptStatus === 'READY' &&
        lectureRecordA?.summaryStatus === 'READY' &&
        lectureRecordA?.learningMapStatus === 'READY' &&
        lectureRecordA?.conceptCount === 2,
      `Statuses: proc=${lectureRecordA?.processingStatus}, tx=${lectureRecordA?.transcriptStatus}, sum=${lectureRecordA?.summaryStatus}, map=${lectureRecordA?.learningMapStatus}, concepts=${lectureRecordA?.conceptCount}`
    );

    // Verify User B cannot access Lecture A directly
    const unauthorizedGet = await makeRequest(
      server,
      { path: `/api/lectures/${lectureAId}`, method: 'GET' },
      null,
      cookieB
    );
    assertTest(
      'User B blocked from GET Lecture A (Ownership Security: 403)',
      unauthorizedGet.status === 403,
      `Status code returned: ${unauthorizedGet.status}`
    );

    // ---------------------------------------------------------
    // Test 2: Search Across Title, Transcript, Summary, Concepts
    // ---------------------------------------------------------
    console.log('\n--- PHASE 4: Search Engine (Multi-Attribute & User Isolation) ---');

    // 2.1 Search by title
    const searchByTitle = await makeRequest(
      server,
      { path: '/api/lectures?search=Distributed%20Consensus', method: 'GET' },
      null,
      cookieA
    );
    assertTest(
      'Search by Lecture Title matches',
      searchByTitle.status === 200 &&
        searchByTitle.body?.lectures?.some((l) => l.id === lectureAId),
      `Found ${searchByTitle.body?.lectures?.length} match(es)`
    );

    // 2.2 Search by transcript content ("Paxos")
    const searchByTranscript = await makeRequest(
      server,
      { path: '/api/lectures?search=Paxos', method: 'GET' },
      null,
      cookieA
    );
    assertTest(
      'Search by Transcript Content ("Paxos") matches',
      searchByTranscript.status === 200 &&
        searchByTranscript.body?.lectures?.some((l) => l.id === lectureAId),
      `Found ${searchByTranscript.body?.lectures?.length} match(es)`
    );

    // 2.3 Search by summary content ("multi-Paxos")
    const searchBySummary = await makeRequest(
      server,
      { path: '/api/lectures?search=multi-Paxos', method: 'GET' },
      null,
      cookieA
    );
    assertTest(
      'Search by Summary Content matches',
      searchBySummary.status === 200 &&
        searchBySummary.body?.lectures?.some((l) => l.id === lectureAId),
      `Found ${searchBySummary.body?.lectures?.length} match(es)`
    );

    // 2.4 Search by concept name ("Leader Election")
    const searchByConcept = await makeRequest(
      server,
      { path: '/api/lectures?search=Leader%20Election', method: 'GET' },
      null,
      cookieA
    );
    assertTest(
      'Search by Concept Name ("Leader Election") matches',
      searchByConcept.status === 200 &&
        searchByConcept.body?.lectures?.some((l) => l.id === lectureAId),
      `Found ${searchByConcept.body?.lectures?.length} match(es)`
    );

    // 2.5 Search isolation: User A searching for "Quantum" (which belongs to User B) must return 0 results
    const searchCrossUserLeak = await makeRequest(
      server,
      { path: '/api/lectures?search=Quantum', method: 'GET' },
      null,
      cookieA
    );
    assertTest(
      'Cross-user search does not expose User B lecture to User A',
      searchCrossUserLeak.status === 200 &&
        searchCrossUserLeak.body?.lectures?.length === 0,
      `Returned ${searchCrossUserLeak.body?.lectures?.length} results (expected 0)`
    );

    // 2.6 Search with nonexistent term yields empty state
    const searchNoMatch = await makeRequest(
      server,
      { path: '/api/lectures?search=xyznonexistenttoken999', method: 'GET' },
      null,
      cookieA
    );
    assertTest(
      'Search with non-existent query returns empty list (Empty state support)',
      searchNoMatch.status === 200 && searchNoMatch.body?.lectures?.length === 0,
      `Returned 0 matches`
    );

    // ---------------------------------------------------------
    // Test 3: Transcript Editing
    // ---------------------------------------------------------
    console.log('\n--- PHASE 5: Transcript Editing & Stale Analysis Detection ---');
    const updatedTranscriptText =
      'In this updated lecture, we examine distributed consensus with enhanced Byzantine fault tolerance rules and leader election.';

    const editTxRes = await makeRequest(
      server,
      { path: `/api/lectures/${lectureAId}/transcript`, method: 'PUT' },
      {
        content: updatedTranscriptText,
        segments: [
          { start: 0, end: 15, text: 'In this updated lecture, we examine distributed consensus.', speaker: 'Professor' },
          { start: 16, end: 45, text: 'With enhanced Byzantine fault tolerance rules and leader election.', speaker: 'Professor' }
        ]
      },
      cookieA
    );

    assertTest(
      'Save edited transcript',
      editTxRes.status === 200 && editTxRes.body?.transcript?.content === updatedTranscriptText,
      `Saved ${editTxRes.body?.transcript?.segments?.length} segments`
    );

    // Verify User B cannot edit User A's transcript
    const unauthorizedEditTx = await makeRequest(
      server,
      { path: `/api/lectures/${lectureAId}/transcript`, method: 'PUT' },
      { content: 'Hacked content' },
      cookieB
    );
    assertTest(
      'User B blocked from editing User A transcript (403)',
      unauthorizedEditTx.status === 403,
      `Status code: ${unauthorizedEditTx.status}`
    );

    // Verify transcript updatedAt is now newer than summary updatedAt
    const checkTxUpdated = await prisma.transcript.findUnique({
      where: { lectureId: lectureAId }
    });
    const checkSumUpdated = await prisma.summary.findUnique({
      where: { lectureId: lectureAId }
    });

    assertTest(
      'Transcript timestamp reflects recent edit (> Summary updatedAt)',
      new Date(checkTxUpdated.updatedAt).getTime() >= new Date(checkSumUpdated.updatedAt).getTime(),
      `Tx updatedAt: ${checkTxUpdated.updatedAt}, Sum updatedAt: ${checkSumUpdated.updatedAt}`
    );

    // ---------------------------------------------------------
    // Test 4: Bookmarks CRUD
    // ---------------------------------------------------------
    console.log('\n--- PHASE 6: Bookmarks Management ---');
    // 4.1 Create bookmark
    const createBmRes = await makeRequest(
      server,
      { path: `/api/lectures/${lectureAId}/bookmarks`, method: 'POST' },
      {
        title: 'Key Definition: Raft Leader Election',
        timestamp: 16.0,
        transcriptPosition: 1,
        note: 'Review for the midterm exam.'
      },
      cookieA
    );

    bookmarkAId = createBmRes.body?.bookmark?.id;
    assertTest(
      'Create lecture bookmark',
      createBmRes.status === 201 && bookmarkAId && createBmRes.body?.bookmark?.title === 'Key Definition: Raft Leader Election',
      `Bookmark ID: ${bookmarkAId}`
    );

    // 4.2 List bookmarks
    const getBmRes = await makeRequest(
      server,
      { path: `/api/lectures/${lectureAId}/bookmarks`, method: 'GET' },
      null,
      cookieA
    );
    assertTest(
      'List lecture bookmarks for owner',
      getBmRes.status === 200 &&
        Array.isArray(getBmRes.body?.bookmarks) &&
        getBmRes.body.bookmarks.some((b) => b.id === bookmarkAId),
      `Total bookmarks retrieved: ${getBmRes.body?.bookmarks?.length}`
    );

    // 4.3 Unauthorized bookmark access
    const unauthorizedGetBm = await makeRequest(
      server,
      { path: `/api/lectures/${lectureAId}/bookmarks`, method: 'GET' },
      null,
      cookieB
    );
    assertTest(
      'User B blocked from viewing User A bookmarks (403)',
      unauthorizedGetBm.status === 403,
      `Status code: ${unauthorizedGetBm.status}`
    );

    // 4.4 Delete bookmark
    const deleteBmRes = await makeRequest(
      server,
      { path: `/api/lectures/${lectureAId}/bookmarks/${bookmarkAId}`, method: 'DELETE' },
      null,
      cookieA
    );
    assertTest(
      'Delete lecture bookmark',
      deleteBmRes.status === 200 && deleteBmRes.body?.success,
      `Bookmark ${bookmarkAId} deleted`
    );

    const getBmAfterDelete = await makeRequest(
      server,
      { path: `/api/lectures/${lectureAId}/bookmarks`, method: 'GET' },
      null,
      cookieA
    );
    assertTest(
      'Bookmark removed from lecture list',
      getBmAfterDelete.body?.bookmarks?.length === 0,
      'Bookmarks list is now empty'
    );

    // Re-create a bookmark to test cascade delete
    const bmForCascade = await prisma.bookmark.create({
      data: {
        lectureId: lectureAId,
        title: 'Cascade Test Bookmark',
        note: 'Should be deleted when lecture is deleted',
        timestamp: 10
      }
    });

    // ---------------------------------------------------------
    // Test 5: Destructive Cascade Deletion
    // ---------------------------------------------------------
    console.log('\n--- PHASE 7: Destructive Cascade Deletion ---');

    // 5.1 Unauthorized deletion attempt
    const unauthorizedDelete = await makeRequest(
      server,
      { path: `/api/lectures/${lectureAId}`, method: 'DELETE' },
      null,
      cookieB
    );
    assertTest(
      'User B blocked from deleting User A lecture (403 Forbidden)',
      unauthorizedDelete.status === 403,
      `Status code: ${unauthorizedDelete.status}`
    );

    // 5.2 Authorized deletion by owner
    const deleteRes = await makeRequest(
      server,
      { path: `/api/lectures/${lectureAId}`, method: 'DELETE' },
      null,
      cookieA
    );
    assertTest(
      'Owner deletes Lecture A successfully',
      deleteRes.status === 200 && deleteRes.body?.success,
      'Lecture deleted via DELETE /api/lectures/:id'
    );

    // 5.3 Verify database cascade: all related entities must be gone
    const txCount = await prisma.transcript.count({ where: { lectureId: lectureAId } });
    const sumCount = await prisma.summary.count({ where: { lectureId: lectureAId } });
    const conceptCount = await prisma.concept.count({ where: { lectureId: lectureAId } });
    const relCount = await prisma.relationship.count({ where: { lectureId: lectureAId } });
    const mapCount = await prisma.learningMap.count({ where: { lectureId: lectureAId } });
    const bmCount = await prisma.bookmark.count({ where: { lectureId: lectureAId } });

    assertTest(
      'PostgreSQL Cascade Deletion: Transcripts purged',
      txCount === 0,
      `Transcripts remaining: ${txCount}`
    );
    assertTest(
      'PostgreSQL Cascade Deletion: Summaries purged',
      sumCount === 0,
      `Summaries remaining: ${sumCount}`
    );
    assertTest(
      'PostgreSQL Cascade Deletion: Concepts purged',
      conceptCount === 0,
      `Concepts remaining: ${conceptCount}`
    );
    assertTest(
      'PostgreSQL Cascade Deletion: Relationships purged',
      relCount === 0,
      `Relationships remaining: ${relCount}`
    );
    assertTest(
      'PostgreSQL Cascade Deletion: Learning Maps purged',
      mapCount === 0,
      `Learning maps remaining: ${mapCount}`
    );
    assertTest(
      'PostgreSQL Cascade Deletion: Bookmarks purged',
      bmCount === 0,
      `Bookmarks remaining: ${bmCount}`
    );

    // Clean up User B lecture and test users
    await prisma.lecture.deleteMany({ where: { id: lectureBId } });
    await prisma.user.deleteMany({ where: { email: { in: [emailA, emailB] } } });
    console.log('\n[INFO] Cleaned up temporary test users and test lectures.');

  } catch (err) {
    console.error('[ERROR] Unexpected test runner exception:', err);
  } finally {
    server.close();
    await prisma.$disconnect();
  }

  console.log('\n======================================================');
  console.log(`  PART 9 TEST RESULTS: ${passedTests}/${totalTests} PASSED`);
  console.log('======================================================\n');

  if (passedTests === totalTests && totalTests > 0) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runPart9Tests();
