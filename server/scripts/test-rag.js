/**
 * End-to-end RAG pipeline test script.
 *
 * Usage:
 *   node --env-file=.env scripts/test-rag.js
 *   node --env-file=.env scripts/test-rag.js <lectureId>
 *
 * What it does:
 * 1. Fetches a lecture with a transcript from the DB (or uses the provided lectureId)
 * 2. Calls indexLectureTranscript to chunk + embed + store
 * 3. Calls retrieveRelevantChunks with a test question
 * 4. Calls chatWithLecture end-to-end
 * 5. Prints results
 */

import { prisma } from '../src/config/prisma.js';
import { indexLectureTranscript, isLectureIndexed } from '../src/services/rag/indexer.js';
import { retrieveRelevantChunks } from '../src/services/rag/retriever.js';
import { chatWithLecture } from '../src/services/gemini/ragChat.service.js';
import { logger } from '../src/utils/logger.js';

const TEST_QUESTION = process.argv[3] || 'What are the main topics covered in this lecture?';
const LECTURE_ID = process.argv[2] || null;

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log('║          LectureMind RAG Pipeline E2E Test           ║');
  console.log('╚══════════════════════════════════════════════════════╝\n');

  // 1. Find a lecture with a transcript
  let lecture;
  if (LECTURE_ID) {
    lecture = await prisma.lecture.findUnique({
      where: { id: LECTURE_ID },
      include: {
        transcript: true,
        summary: true,
        concepts: true,
        subject: { select: { id: true, name: true, code: true } }
      }
    });
    if (!lecture) {
      console.error(`❌ Lecture not found: ${LECTURE_ID}`);
      process.exit(1);
    }
  } else {
    lecture = await prisma.lecture.findFirst({
      where: { transcript: { isNot: null } },
      include: {
        transcript: true,
        summary: true,
        concepts: true,
        subject: { select: { id: true, name: true, code: true } }
      },
      orderBy: { createdAt: 'desc' }
    });
    if (!lecture) {
      console.error('❌ No lectures with transcripts found in the DB. Create a lecture with a transcript first.');
      process.exit(1);
    }
  }

  console.log(`📚 Testing with lecture: "${lecture.title}" (ID: ${lecture.id})`);
  console.log(`   Transcript length: ${lecture.transcript.content.length} chars`);
  console.log(`   Has segments: ${Array.isArray(lecture.transcript.segments) && lecture.transcript.segments.length > 0 ? `yes (${lecture.transcript.segments.length} segments)` : 'no'}\n`);

  // 2. Index the lecture
  const alreadyIndexed = await isLectureIndexed(lecture.id);
  console.log(`📦 Already indexed: ${alreadyIndexed}`);

  console.log('\n━━━ STEP 1: Indexing (chunking + embedding) ━━━━━━━━━━━━\n');
  const start1 = Date.now();
  const chunkCount = await indexLectureTranscript(lecture.id, lecture.transcript);
  const duration1 = Date.now() - start1;
  console.log(`✅ Indexed ${chunkCount} chunks in ${(duration1 / 1000).toFixed(1)}s\n`);

  // 3. Retrieve relevant chunks
  console.log(`━━━ STEP 2: Retrieval ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
  console.log(`   Question: "${TEST_QUESTION}"\n`);
  const start2 = Date.now();
  const chunks = await retrieveRelevantChunks(lecture.id, TEST_QUESTION, 5);
  const duration2 = Date.now() - start2;
  console.log(`✅ Retrieved ${chunks.length} chunks in ${(duration2 / 1000).toFixed(1)}s\n`);
  chunks.forEach((c, i) => {
    const ts = c.startSec != null ? ` [${formatSec(c.startSec)}]` : '';
    console.log(`   ${i + 1}. (sim=${(c.similarity * 100).toFixed(1)}%)${ts} "${c.content.slice(0, 100)}..."`);
  });

  // 4. Full RAG chat
  console.log(`\n━━━ STEP 3: RAG Chat (Gemini generation) ━━━━━━━━━━━━━\n`);
  const start3 = Date.now();
  const result = await chatWithLecture({
    lecture,
    question: TEST_QUESTION,
    history: []
  });
  const duration3 = Date.now() - start3;
  console.log(`✅ Generated in ${(duration3 / 1000).toFixed(1)}s\n`);
  console.log('─── Answer ────────────────────────────────────────────');
  console.log(result.answer);
  console.log('\n─── Citations ─────────────────────────────────────────');
  if (result.citations.length > 0) {
    result.citations.forEach((c, i) => console.log(`   ${i + 1}. [${c.timestamp || 'N/A'}] "${c.text}"`));
  } else {
    console.log('   (none)');
  }
  console.log('\n─── Suggested Follow-up Questions ─────────────────────');
  result.suggestedQuestions.forEach((q, i) => console.log(`   ${i + 1}. ${q}`));
  console.log(`\n   retrievedChunks: ${result.retrievedChunks}`);

  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log('║                   Test PASSED ✅                      ║');
  console.log('╚══════════════════════════════════════════════════════╝\n');

  await prisma.$disconnect();
}

function formatSec(s) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

main().catch(err => {
  console.error('\n❌ Test FAILED:', err.message);
  console.error(err.stack);
  process.exit(1);
});
