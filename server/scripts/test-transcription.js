import 'dotenv/config';
import http from 'http';
import app from '../src/server.js';
import { prisma } from '../src/config/prisma.js';
import { transcribeAudio } from '../src/services/gemini/transcription.service.js';

/**
 * Creates a valid PCM WAV audio buffer in pure JavaScript
 * @param {number} durationSeconds
 * @param {number} sampleRate
 * @returns {Buffer}
 */
function createSyntheticWavAudio(durationSeconds = 3, sampleRate = 16000) {
  const numChannels = 1;
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const numSamples = durationSeconds * sampleRate;
  const dataSize = numSamples * blockAlign;
  const buffer = Buffer.alloc(44 + dataSize);

  // RIFF identifier
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);

  // fmt subchunk
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); // Subchunk1Size (16 for PCM)
  buffer.writeUInt16LE(1, 20);  // AudioFormat (1 = PCM)
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);

  // data subchunk
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  // Generate speech-like alternating harmonic frequencies (220Hz - 440Hz)
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const freq = 300 + 100 * Math.sin(2 * Math.PI * 2 * t);
    const sample = Math.sin(2 * Math.PI * freq * t) * 0.4 * 32767;
    buffer.writeInt16LE(Math.round(sample), 44 + i * 2);
  }

  return buffer;
}

// Helper to make HTTP requests
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

async function runTranscriptionVerification() {
  console.log('====================================================');
  console.log('🎙️ LectureMind - Part 5 Audio Transcription Verification');
  console.log('====================================================\n');

  // Start test server on random free port
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const testPort = server.address().port;
  console.log(`🚀 Test server listening on port ${testPort}\n`);

  const timestamp = Date.now();
  const userAData = {
    name: 'Professor Turing',
    email: `turing_${timestamp}@lecturemind.internal`,
    password: 'securePassword123!'
  };
  const userBData = {
    name: 'Student Ada',
    email: `ada_${timestamp}@lecturemind.internal`,
    password: 'securePassword456!'
  };

  let userACookie = null;
  let userBCookie = null;
  let lectureId = null;

  try {
    // ----------------------------------------------------
    // TEST 1: Synthetic WAV Audio Creation & Direct Service Test
    // ----------------------------------------------------
    console.log('[Test 1/5] Synthesizing valid PCM WAV audio & testing transcribeAudio service...');
    const testWavBuffer = createSyntheticWavAudio(4, 16000);
    console.log(`   Generated test WAV: ${testWavBuffer.length} bytes (duration: 4.0s)`);

    const serviceResult = await transcribeAudio({
      audioData: testWavBuffer,
      mimeType: 'audio/wav',
      lectureTitle: 'CS101 Intro'
    });

    if (!serviceResult.content && (!serviceResult.segments || serviceResult.segments.length === 0)) {
      throw new Error('Direct transcription service test returned neither content nor segments.');
    }

    console.log(`✅ Direct transcribeAudio succeeded!`);
    console.log(`   Content preview: "${serviceResult.content.substring(0, 80)}..."`);
    console.log(`   Segments: ${serviceResult.segments.length}`);
    console.log(`   Language: ${serviceResult.language}`);

    // ----------------------------------------------------
    // TEST 2: User Setup & Lecture Creation
    // ----------------------------------------------------
    console.log('\n[Test 2/5] Creating users and initial lecture record...');
    const regA = await makeRequest(server, { path: '/api/auth/register', method: 'POST' }, userAData);
    userACookie = regA.cookie;

    const regB = await makeRequest(server, { path: '/api/auth/register', method: 'POST' }, userBData);
    userBCookie = regB.cookie;

    const createLect = await makeRequest(server, {
      path: '/api/lectures',
      method: 'POST'
    }, {
      title: 'CS 402: Quantum Algorithms and Complexity',
      originalFileName: 'quantum_lecture_01.wav',
      duration: 3600
    }, userACookie);

    if (createLect.status !== 201 || !createLect.data.lecture?.id) {
      throw new Error(`Failed to create lecture: ${JSON.stringify(createLect.data)}`);
    }

    lectureId = createLect.data.lecture.id;
    console.log(`✅ Lecture created: ${lectureId} (initial status: ${createLect.data.lecture.status})`);

    // ----------------------------------------------------
    // TEST 3: POST /api/lectures/:id/transcribe (API Workflow)
    // ----------------------------------------------------
    console.log('\n[Test 3/5] Testing POST /api/lectures/:id/transcribe...');
    const transcribeRes = await makeRequest(server, {
      path: `/api/lectures/${lectureId}/transcribe`,
      method: 'POST'
    }, {
      audioBase64: testWavBuffer.toString('base64'),
      mimeType: 'audio/wav'
    }, userACookie);

    if (transcribeRes.status !== 200 || !transcribeRes.data.success) {
      throw new Error(`Transcription endpoint failed (${transcribeRes.status}): ${JSON.stringify(transcribeRes.data)}`);
    }

    if (transcribeRes.data.status !== 'TRANSCRIBED') {
      throw new Error(`Expected status TRANSCRIBED, got ${transcribeRes.data.status}`);
    }

    console.log(`✅ Endpoint transcription succeeded!`);
    console.log(`   Lecture Status: ${transcribeRes.data.status}`);
    console.log(`   Transcript ID: ${transcribeRes.data.transcript?.id}`);
    console.log(`   Segments saved: ${transcribeRes.data.transcript?.segments?.length || 0}`);

    // ----------------------------------------------------
    // TEST 4: GET /api/lectures/:id/transcript and PUT /api/lectures/:id/transcript
    // ----------------------------------------------------
    console.log('\n[Test 4/5] Testing GET & PUT /api/lectures/:id/transcript...');

    // GET
    const getRes = await makeRequest(server, {
      path: `/api/lectures/${lectureId}/transcript`,
      method: 'GET'
    }, null, userACookie);

    if (getRes.status !== 200 || !getRes.data.transcript?.content) {
      throw new Error(`Failed to retrieve transcript via GET: ${JSON.stringify(getRes.data)}`);
    }
    console.log(`✅ GET /transcript succeeded. Content length: ${getRes.data.transcript.content.length} chars.`);

    // PUT (edit and save)
    const updatedContent = getRes.data.transcript.content + '\n[Professor Note]: Midterm exam will cover through Section 4.';
    const updatedSegments = [
      ...(getRes.data.transcript.segments || []),
      {
        id: 99,
        start: 4.5,
        end: 8.0,
        speaker: 'Professor Turing',
        text: 'Midterm exam will cover through Section 4.'
      }
    ];

    const putRes = await makeRequest(server, {
      path: `/api/lectures/${lectureId}/transcript`,
      method: 'PUT'
    }, {
      content: updatedContent,
      segments: updatedSegments
    }, userACookie);

    if (putRes.status !== 200 || !putRes.data.transcript?.content.includes('Midterm exam will cover')) {
      throw new Error(`Failed to update transcript via PUT: ${JSON.stringify(putRes.data)}`);
    }
    console.log(`✅ PUT /transcript succeeded: Edited content and segments saved to Neon PostgreSQL.`);

    // ----------------------------------------------------
    // TEST 5: Security & User Ownership Enforcement
    // ----------------------------------------------------
    console.log('\n[Test 5/5] Testing Strict Security & Ownership Isolation...');

    // User B tries to transcribe User A's lecture -> FORBIDDEN (403)
    const unauthTranscribe = await makeRequest(server, {
      path: `/api/lectures/${lectureId}/transcribe`,
      method: 'POST'
    }, {
      audioBase64: testWavBuffer.toString('base64'),
      mimeType: 'audio/wav'
    }, userBCookie);

    if (unauthTranscribe.status !== 403) {
      throw new Error(`SECURITY VULNERABILITY: User B was able to trigger transcription on User A's lecture! (Got ${unauthTranscribe.status})`);
    }
    console.log('   User B transcribe attempt: BLOCKED with HTTP 403.');

    // User B tries to view User A's transcript -> FORBIDDEN (403)
    const unauthGet = await makeRequest(server, {
      path: `/api/lectures/${lectureId}/transcript`,
      method: 'GET'
    }, null, userBCookie);

    if (unauthGet.status !== 403) {
      throw new Error(`SECURITY VULNERABILITY: User B was able to view User A's transcript! (Got ${unauthGet.status})`);
    }
    console.log('   User B view transcript attempt: BLOCKED with HTTP 403.');

    // User B tries to edit User A's transcript -> FORBIDDEN (403)
    const unauthPut = await makeRequest(server, {
      path: `/api/lectures/${lectureId}/transcript`,
      method: 'PUT'
    }, {
      content: 'Malicious modification by unauthorized user'
    }, userBCookie);

    if (unauthPut.status !== 403) {
      throw new Error(`SECURITY VULNERABILITY: User B was able to edit User A's transcript! (Got ${unauthPut.status})`);
    }
    console.log('   User B edit transcript attempt: BLOCKED with HTTP 403.');

    console.log('\n🎉 ALL 5 AUDIO TRANSCRIPTION & SECURITY TESTS PASSED PERFECTLY!\n');
  } catch (error) {
    console.error('\n❌ Transcription verification failed:', error.message);
    process.exitCode = 1;
  } finally {
    console.log('🧹 Cleaning up test users and lectures from database...');
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
      console.error('Cleanup warning:', cleanupErr.message);
    }

    server.close();
    await prisma.$disconnect();
  }
}

runTranscriptionVerification();
