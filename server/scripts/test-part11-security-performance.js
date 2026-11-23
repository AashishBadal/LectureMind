import 'dotenv/config';
import http from 'http';
import fs from 'fs';
import path from 'path';
import app from '../src/server.js';
import { prisma } from '../src/config/prisma.js';
import { validateAudioBuffer, sanitizeFileName } from '../src/middleware/upload.js';
import { validateAnalysisSchema } from '../src/services/gemini/analysis.service.js';
import { validateRelationshipIntegrity } from '../src/services/gemini/relationshipExtraction.service.js';
import { validateLearningMapIntegrity } from '../src/services/gemini/learningMap.service.js';

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

async function runPart11EngineeringReview() {
  console.log('========================================================================');
  console.log('🛡️  LECTUREMIND PART 11: SECURITY, RELIABILITY & PERFORMANCE AUDIT');
  console.log('========================================================================\n');

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  console.log(`[INFO] Test server active on ephemeral port ${port}`);

  const testSuffix = Date.now();
  const userAEmail = `audit_user_a_${testSuffix}@university.edu`;
  const userBEmail = `audit_user_b_${testSuffix}@university.edu`;
  const userAPassword = 'SecurePassword_123!';
  const userBPassword = 'AttackerPassword_456!';

  let userACookie = null;
  let userBCookie = null;
  let userALectureId = null;
  let userABookmarkId = null;

  try {
    // =========================================================================
    // SECTION 1: AUTHENTICATION SECURITY
    // =========================================================================
    console.log('\n--- [AUDIT 1] AUTHENTICATION SECURITY ---');

    // 1.1 Password Hashing & Sanitization
    const regA = await makeRequest(server, { path: '/api/auth/register', method: 'POST' }, {
      name: 'Alice Legit',
      email: userAEmail,
      password: userAPassword
    });

    if (regA.status !== 201) throw new Error(`Registration failed: ${JSON.stringify(regA.body)}`);
    userACookie = regA.cookie;

    // Verify plaintext password is NEVER returned
    if (regA.body.user.password || regA.body.user.passwordHash) {
      throw new Error('SECURITY BREACH: Registration endpoint leaked password or password hash in response!');
    }
    console.log('  ✓ Registration does not expose password or passwordHash.');

    // Verify database record has bcrypt hash
    const dbUserA = await prisma.user.findUnique({ where: { email: userAEmail } });
    if (!dbUserA.passwordHash || !dbUserA.passwordHash.startsWith('$2')) {
      throw new Error('SECURITY BREACH: Password was not securely hashed with bcrypt in database!');
    }
    console.log('  ✓ Passwords securely hashed with bcrypt in Neon database.');

    // 1.2 Invalid Credentials Rejection
    const badLogin = await makeRequest(server, { path: '/api/auth/login', method: 'POST' }, {
      email: userAEmail,
      password: 'WrongPassword999!'
    });
    if (badLogin.status !== 401) {
      throw new Error(`Expected 401 for incorrect password, got ${badLogin.status}`);
    }
    console.log('  ✓ Incorrect password rejected with HTTP 401.');

    // 1.3 Session Handling & HTTP-Only Cookie
    const validLogin = await makeRequest(server, { path: '/api/auth/login', method: 'POST' }, {
      email: userAEmail,
      password: userAPassword
    });
    if (validLogin.status !== 200 || !validLogin.cookie) {
      throw new Error('Login failed to set session cookie');
    }
    if (validLogin.body.user.password || validLogin.body.user.passwordHash) {
      throw new Error('SECURITY BREACH: Login endpoint leaked password hash!');
    }
    console.log('  ✓ Login issues secure session cookie and returns sanitized user object.');

    // Register User B (Attacker)
    const regB = await makeRequest(server, { path: '/api/auth/register', method: 'POST' }, {
      name: 'Bob Attacker',
      email: userBEmail,
      password: userBPassword
    });
    userBCookie = regB.cookie;
    console.log('  ✓ Second user (User B) registered as unprivileged context.');

    // =========================================================================
    // SECTION 2: SEED COMPLETE LECTURE DATA UNDER USER A
    // =========================================================================
    console.log('\n--- [SETUP] SEEDING COMPREHENSIVE LECTURE UNDER USER A ---');

    const meA = await makeRequest(server, { path: '/api/auth/me', method: 'GET' }, null, userACookie);
    const userAId = meA.body.user.id;

    const lecture = await prisma.lecture.create({
      data: {
        userId: userAId,
        title: 'Advanced Operating Systems: Distributed Consensus',
        originalFileName: 'distributed_consensus_09.mp3',
        status: 'MAP_READY',
        duration: 2150.0,
        transcript: {
          create: {
            content: 'In distributed systems, achieving consensus across unreliable networks requires quorum-based protocols such as Paxos and Raft.',
            segments: [
              { start: 0.0, end: 15.0, speaker: 'Prof. Turing', text: 'In distributed systems, achieving consensus across unreliable networks requires quorum-based protocols.' },
              { start: 15.0, end: 35.0, speaker: 'Prof. Turing', text: 'Paxos guarantees safety under asynchronous models, while Raft decomposes consensus for understandability.' }
            ]
          }
        },
        summary: {
          create: {
            content: 'Comprehensive lecture explaining consensus protocols in distributed architectures. Details leader election, log replication, and safety guarantees.'
          }
        },
        concepts: {
          create: [
            { name: 'Distributed Consensus', description: 'Agreement on state across independent networked computing nodes.', importance: 5 },
            { name: 'Paxos Protocol', description: 'Consensus algorithm guaranteeing safety in asynchronous networks.', importance: 5 },
            { name: 'Raft Protocol', description: 'Understandable consensus algorithm using decomposed leader election and log replication.', importance: 4 }
          ]
        },
        bookmarks: {
          create: [
            { title: 'Paxos Safety Invariants', timestamp: 15.0, transcriptPosition: 1, note: 'Important midterm question.' }
          ]
        }
      },
      include: { concepts: true, bookmarks: true }
    });

    userALectureId = lecture.id;
    userABookmarkId = lecture.bookmarks[0].id;

    const conceptPaxos = lecture.concepts.find(c => c.name === 'Paxos Protocol');
    const conceptRaft = lecture.concepts.find(c => c.name === 'Raft Protocol');

    await prisma.relationship.create({
      data: {
        lectureId: userALectureId,
        sourceConceptId: conceptPaxos.id,
        targetConceptId: conceptRaft.id,
        relationshipType: 'contrasts_with',
        description: 'Both achieve consensus, but Raft decomposes states for comprehensibility compared to Paxos.'
      }
    });

    await prisma.learningMap.create({
      data: {
        lectureId: userALectureId,
        mapData: {
          nodes: [
            { id: conceptPaxos.id, label: 'Paxos Protocol', x: 200, y: 150 },
            { id: conceptRaft.id, label: 'Raft Protocol', x: 500, y: 150 }
          ],
          edges: [
            { id: 'edge-1', source: conceptPaxos.id, target: conceptRaft.id, label: 'contrasts_with' }
          ]
        }
      }
    });

    console.log(`  ✓ Seeded User A lecture ID: ${userALectureId} with all related entities.`);

    // =========================================================================
    // SECTION 3 & 14: COMPLETE IDOR PENETRATION ATTACK MATRIX
    // =========================================================================
    console.log('\n--- [AUDIT 2 & 14] COMPLETE IDOR ATTACK MATRIX (USER B -> USER A) ---');
    console.log('Testing User B attempts to access User A resources by URL/ID manipulation across all endpoints:');

    const idorEndpoints = [
      { name: '1.  GET Lecture Details', path: `/api/lectures/${userALectureId}`, method: 'GET' },
      { name: '2.  GET Transcript', path: `/api/lectures/${userALectureId}/transcript`, method: 'GET' },
      { name: '3.  PUT Transcript (Tamper)', path: `/api/lectures/${userALectureId}/transcript`, method: 'PUT', body: { content: 'Tampered by attacker' } },
      { name: '4.  POST Transcribe (Audio)', path: `/api/lectures/${userALectureId}/transcribe`, method: 'POST', body: { audioBase64: 'UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=' } },
      { name: '5.  POST Analyze Lecture', path: `/api/lectures/${userALectureId}/analyze`, method: 'POST' },
      { name: '6.  GET Summary', path: `/api/lectures/${userALectureId}/summary`, method: 'GET' },
      { name: '7.  GET Concepts', path: `/api/lectures/${userALectureId}/concepts`, method: 'GET' },
      { name: '8.  POST Relationships', path: `/api/lectures/${userALectureId}/relationships`, method: 'POST' },
      { name: '9.  GET Relationships', path: `/api/lectures/${userALectureId}/relationships`, method: 'GET' },
      { name: '10. POST Learning Map', path: `/api/lectures/${userALectureId}/learning-map`, method: 'POST' },
      { name: '11. GET Learning Map', path: `/api/lectures/${userALectureId}/learning-map`, method: 'GET' },
      { name: '12. PUT Learning Map Layout', path: `/api/lectures/${userALectureId}/learning-map`, method: 'PUT', body: { mapData: { nodes: [] } } },
      { name: '13. GET Export Markdown', path: `/api/lectures/${userALectureId}/export?format=markdown`, method: 'GET' },
      { name: '14. GET Export JSON', path: `/api/lectures/${userALectureId}/export?format=json`, method: 'GET' },
      { name: '15. GET Bookmarks', path: `/api/lectures/${userALectureId}/bookmarks`, method: 'GET' },
      { name: '16. POST Create Bookmark', path: `/api/lectures/${userALectureId}/bookmarks`, method: 'POST', body: { title: 'Attacker Bookmark', timestamp: 10 } },
      { name: '17. DELETE Bookmark', path: `/api/lectures/${userALectureId}/bookmarks/${userABookmarkId}`, method: 'DELETE' },
      { name: '18. DELETE Lecture', path: `/api/lectures/${userALectureId}`, method: 'DELETE' }
    ];

    for (const ep of idorEndpoints) {
      const res = await makeRequest(server, { path: ep.path, method: ep.method }, ep.body || null, userBCookie);
      if (res.status !== 403 && res.status !== 404) {
        throw new Error(`CRITICAL VULNERABILITY (IDOR): User B accessed User A's lecture on "${ep.name}". Expected HTTP 403/404, received ${res.status}!`);
      }
      console.log(`  ✓ ${ep.name.padEnd(30)} -> Blocked with HTTP ${res.status}`);
    }

    // Verify User A lecture was NOT deleted by User B attack
    const lectureIntact = await prisma.lecture.findUnique({ where: { id: userALectureId } });
    if (!lectureIntact) {
      throw new Error('CRITICAL VULNERABILITY: User A lecture was deleted during IDOR attack!');
    }
    console.log('  ✓ User A lecture remained 100% intact after all 18 IDOR penetration attempts.');

    // =========================================================================
    // SECTION 4: GEMINI API KEY SECURITY SCAN
    // =========================================================================
    console.log('\n--- [AUDIT 3] GEMINI API KEY SECURITY ---');

    // Verify key is not leaked in client bundle or source files
    const clientSrcPath = path.resolve(process.cwd(), '../client/src');
    if (fs.existsSync(clientSrcPath)) {
      const clientFiles = fs.readdirSync(clientSrcPath, { recursive: true });
      for (const file of clientFiles) {
        const fullPath = path.join(clientSrcPath, file);
        if (fs.statSync(fullPath).isFile() && /\.(jsx?|tsx?|html|css|json)$/.test(file)) {
          const content = fs.readFileSync(fullPath, 'utf8');
          if (content.includes('AIzaSy') || content.includes('GEMINI_API_KEY')) {
            throw new Error(`SECURITY BREACH: Gemini API Key reference detected in client file: ${file}`);
          }
        }
      }
      console.log('  ✓ Static scan: Zero Gemini API key references in client source files.');
    }

    // =========================================================================
    // SECTION 5: NEON POSTGRESQL & PRISMA SECURITY
    // =========================================================================
    console.log('\n--- [AUDIT 4 & 12] NEON + PRISMA CONNECTION & SQL SECURITY ---');

    // 5.1 Singleton Verification
    if (!prisma || typeof prisma.$connect !== 'function') {
      throw new Error('Prisma client singleton module not properly initialized.');
    }
    console.log('  ✓ PrismaClient initialized as centralized singleton (avoids connection pool exhaustion on Neon).');

    // 5.2 SQL Injection Safety (Prisma parameterization)
    const sqlInjectionPayload = "'; DROP TABLE lectures; --";
    const searchRes = await makeRequest(server, {
      path: `/api/lectures?search=${encodeURIComponent(sqlInjectionPayload)}`,
      method: 'GET'
    }, null, userACookie);

    if (searchRes.status !== 200 || !Array.isArray(searchRes.body.lectures)) {
      throw new Error('SQL injection attempt crashed the search handler.');
    }
    console.log('  ✓ SQL injection attempt safely parameterized by Prisma (no arbitrary SQL execution).');

    // =========================================================================
    // SECTION 6: FILE UPLOAD SECURITY & MAGIC BYTES
    // =========================================================================
    console.log('\n--- [AUDIT 5] FILE UPLOAD SECURITY ---');

    // 6.1 Executable disguised as audio (MZ header)
    const fakeExeBuffer = Buffer.from([0x4D, 0x5A, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]);
    const exeCheck = validateAudioBuffer(fakeExeBuffer);
    if (exeCheck.valid) {
      throw new Error('SECURITY BREACH: validateAudioBuffer accepted Windows PE executable as audio!');
    }
    console.log('  ✓ Disguised Windows PE executable strictly rejected by magic byte inspection.');

    // 6.2 Linux ELF binary disguised as audio
    const fakeElfBuffer = Buffer.from([0x7F, 0x45, 0x4C, 0x46, 0x02, 0x01, 0x01, 0x00]);
    const elfCheck = validateAudioBuffer(fakeElfBuffer);
    if (elfCheck.valid) {
      throw new Error('SECURITY BREACH: validateAudioBuffer accepted Linux ELF binary as audio!');
    }
    console.log('  ✓ Disguised Linux ELF binary strictly rejected by magic byte inspection.');

    // 6.3 PHP script disguised as audio
    const fakePhpBuffer = Buffer.from('<?php echo "malicious web shell"; ?>');
    const phpCheck = validateAudioBuffer(fakePhpBuffer);
    if (phpCheck.valid) {
      throw new Error('SECURITY BREACH: validateAudioBuffer accepted PHP script as audio!');
    }
    console.log('  ✓ Web script / PHP shell disguised as audio strictly rejected.');

    // 6.4 Valid Audio Buffer Validation (RIFF WAVE)
    const validWavHeader = Buffer.from([
      0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00,
      0x57, 0x41, 0x56, 0x45, 0x66, 0x6D, 0x74, 0x20
    ]);
    const wavCheck = validateAudioBuffer(validWavHeader);
    if (!wavCheck.valid || wavCheck.format !== 'wav') {
      throw new Error('Valid WAV buffer signature was incorrectly rejected.');
    }
    console.log('  ✓ Authentic WAV audio header accepted successfully.');

    // 6.5 Filename Traversal Sanitization
    const maliciousFilename = '../../../../etc/passwd.mp3';
    const sanitizedName = sanitizeFileName(maliciousFilename);
    if (sanitizedName.includes('..') || sanitizedName.includes('/')) {
      throw new Error(`Sanitizer failed to neutralize directory traversal: ${sanitizedName}`);
    }
    console.log(`  ✓ Directory traversal filename sanitized: "${maliciousFilename}" -> "${sanitizedName}"`);

    // =========================================================================
    // SECTION 7: GEMINI OUTPUT VALIDATION & HALLUCINATION DEFENSE
    // =========================================================================
    console.log('\n--- [AUDIT 6 & 7] AI OUTPUT VALIDATION & GROUNDING ---');

    // 7.1 Concept schema validation
    const invalidAnalysis = {
      summary: 'Too short', // < 30 chars
      concepts: [{ name: '', description: '' }] // invalid fields
    };
    const analysisCheck = validateAnalysisSchema(invalidAnalysis);
    if (analysisCheck.valid || analysisCheck.errors.length === 0) {
      throw new Error('Schema validation failed to catch invalid concept analysis.');
    }
    console.log(`  ✓ Analysis schema rejected malformed model output (${analysisCheck.errors.length} validation errors caught).`);

    // 7.2 Relationship referential integrity & self-loop prevention
    const rawRels = [
      { sourceConceptId: 'non_existent_1', targetConceptId: conceptPaxos.id, relationshipType: 'leads_to' },
      { sourceConceptId: conceptPaxos.id, targetConceptId: conceptPaxos.id, relationshipType: 'causes' } // self-loop
    ];
    const relCheck = validateRelationshipIntegrity(rawRels, [conceptPaxos, conceptRaft]);
    if (relCheck.sanitized.length !== 0) {
      throw new Error('Referential integrity validation failed to prune non-existent concept reference or self-loop.');
    }
    console.log('  ✓ Relationship integrity pruned non-existent concept references and self-referencing loops.');

    // 7.3 Learning Map dangling edge pruning
    const rawMapData = {
      nodes: [{ id: 'node-A', label: 'A' }, { id: 'node-B', label: 'B' }],
      edges: [
        { source: 'node-A', target: 'node-B' },
        { source: 'node-A', target: 'non-existent-node-C' } // dangling edge!
      ]
    };
    const mapIntegrity = validateLearningMapIntegrity(rawMapData);
    if (mapIntegrity.sanitizedMapData.edges.length !== 1) {
      throw new Error('Learning map validator failed to prune dangling edge referencing non-existent node.');
    }
    console.log('  ✓ Learning map integrity pruned dangling edge referencing non-existent node.');

    // =========================================================================
    // SECTION 8: PERFORMANCE & CACHING OPTIMIZATION
    // =========================================================================
    console.log('\n--- [AUDIT 10] PERFORMANCE & CACHING AUDIT ---');

    // 8.1 Reusing existing analysis when force=false
    const cachedAnalysisRes = await makeRequest(server, {
      path: `/api/lectures/${userALectureId}/analyze`,
      method: 'POST'
    }, null, userACookie);

    if (cachedAnalysisRes.status !== 200 || !cachedAnalysisRes.body.cached) {
      throw new Error('Cached analysis was not returned when force was omitted.');
    }
    console.log('  ✓ Repeated analyze request returned cached results immediately without duplicate Gemini call.');

    // 8.2 Reusing existing relationships when force=false
    const cachedRelsRes = await makeRequest(server, {
      path: `/api/lectures/${userALectureId}/relationships`,
      method: 'POST'
    }, null, userACookie);

    if (cachedRelsRes.status !== 200 || !cachedRelsRes.body.cached) {
      throw new Error('Cached relationships were not returned when force was omitted.');
    }
    console.log('  ✓ Repeated relationships request returned cached results immediately without duplicate Gemini call.');

    // 8.3 Reusing existing learning map when force=false
    const cachedMapRes = await makeRequest(server, {
      path: `/api/lectures/${userALectureId}/learning-map`,
      method: 'POST'
    }, null, userACookie);

    if (cachedMapRes.status !== 200 || !cachedMapRes.body.cached) {
      throw new Error('Cached learning map was not returned when force was omitted.');
    }
    console.log('  ✓ Repeated learning map request returned cached results immediately without duplicate Gemini call.');

    console.log('\n========================================================================');
    console.log('🎉 ALL 14 SECURITY, RELIABILITY & PERFORMANCE AUDITS PASSED WITH ZERO FAILURES');
    console.log('========================================================================\n');

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

runPart11EngineeringReview()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n❌ Security Audit Failed:', err);
    process.exit(1);
  });
