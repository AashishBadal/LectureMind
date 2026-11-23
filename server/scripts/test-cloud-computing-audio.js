import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { prisma } from '../src/config/prisma.js';
import { validateAudioBuffer } from '../src/middleware/upload.js';
import { transcribeAudio } from '../src/services/gemini/transcription.service.js';
import { analyzeLecture } from '../src/services/gemini/analysis.service.js';
import { extractRelationships } from '../src/services/gemini/relationshipExtraction.service.js';
import { generateLearningMap } from '../src/services/gemini/learningMap.service.js';
import { hashPassword } from '../src/utils/auth.js';

const AUDIO_PATH = 'D:\\Lecture audios\\Cloud COmputing and Virtualization\\ElevenLabs_2026-09-05T05_29_29_Adam - Dominant, Firm_pre_sp100_s50_sb75_se0_b_m2.mp3';
const LECTURE_TITLE = 'Cloud Computing and Virtualization';

async function main() {
  console.log('\n========================================================================');
  console.log('🎙️  TESTING WITH LECTURE AUDIO: Cloud Computing and Virtualization');
  console.log('========================================================================\n');

  // 1. Inspect Audio File
  console.log(`[STEP 1] Checking audio file existence at:\n  ${AUDIO_PATH}`);
  if (!fs.existsSync(AUDIO_PATH)) {
    throw new Error(`Audio file not found at: ${AUDIO_PATH}`);
  }

  const fileStats = fs.statSync(AUDIO_PATH);
  const fileSizeMb = (fileStats.size / (1024 * 1024)).toFixed(2);
  console.log(`  ✓ Audio file found. Size: ${fileSizeMb} MB (${fileStats.size.toLocaleString()} bytes)`);

  const audioBuffer = fs.readFileSync(AUDIO_PATH);

  // 2. Validate Magic Bytes
  console.log('\n[STEP 2] Running security validation on audio buffer magic bytes...');
  const validation = validateAudioBuffer(audioBuffer);
  if (!validation.valid) {
    throw new Error(`Audio buffer validation failed: ${validation.error}`);
  }
  console.log(`  ✓ Magic bytes validated! Format detected: ${validation.format}`);

  // 3. Ensure Test User in Database
  console.log('\n[STEP 3] Ensuring student account exists in Neon database...');
  const userEmail = 'cloud_student@university.edu';
  let user = await prisma.user.findUnique({ where: { email: userEmail } });

  if (!user) {
    const passwordHash = await hashPassword('CloudLearning2026!');
    user = await prisma.user.create({
      data: {
        name: 'Alex Rivera',
        email: userEmail,
        passwordHash
      }
    });
    console.log(`  ✓ Created user: ${user.name} (${user.email}) [${user.id}]`);
  } else {
    console.log(`  ✓ Using existing user: ${user.name} (${user.email}) [${user.id}]`);
  }

  // 4. Create or fetch Lecture record
  console.log(`\n[STEP 4] Setting up lecture record: "${LECTURE_TITLE}"...`);
  let lecture = await prisma.lecture.findFirst({
    where: {
      userId: user.id,
      title: LECTURE_TITLE
    }
  });

  if (!lecture) {
    lecture = await prisma.lecture.create({
      data: {
        userId: user.id,
        title: LECTURE_TITLE,
        originalFileName: path.basename(AUDIO_PATH),
        status: 'PROCESSING'
      }
    });
    console.log(`  ✓ Created new lecture record: ${lecture.id}`);
  } else {
    console.log(`  ✓ Found existing lecture record: ${lecture.id} (status: ${lecture.status})`);
  }

  // 5. Transcribe Audio via Gemini
  console.log('\n[STEP 5] Transcribing lecture audio using Google Gemini...');
  const existingTranscript = await prisma.transcript.findUnique({ where: { lectureId: lecture.id } });
  let transcriptContent = '';
  let transcriptSegments = [];

  if (existingTranscript && existingTranscript.content && existingTranscript.content.length > 500) {
    console.log('  ✓ Using existing high-quality transcript from database:');
    transcriptContent = existingTranscript.content;
    transcriptSegments = existingTranscript.segments || [];
  } else {
    const transcriptResult = await transcribeAudio({
      audioData: audioBuffer,
      mimeType: 'audio/mp3',
      lectureTitle: LECTURE_TITLE
    });

    transcriptContent = transcriptResult.content;
    transcriptSegments = transcriptResult.segments || [];

    // Save Transcript in Prisma
    await prisma.transcript.upsert({
      where: { lectureId: lecture.id },
      update: {
        content: transcriptContent,
        segments: transcriptSegments
      },
      create: {
        lectureId: lecture.id,
        content: transcriptContent,
        segments: transcriptSegments
      }
    });
  }

  console.log(`  ✓ Transcript confirmed: ${transcriptContent.length} characters, ${transcriptSegments.length} segments.`);
  console.log(`\n--- TRANSCRIPT EXCERPT ---`);
  console.log(transcriptContent.substring(0, 350) + '...\n---------------------------');

  // 6. Gemini Academic Analysis (Summary & Key Concepts)
  console.log('\n[STEP 6] Analyzing lecture with Gemini for Academic Summary & Key Concepts...');
  const analysisResult = await analyzeLecture(transcriptContent, LECTURE_TITLE);

  console.log(`  ✓ Analysis complete!`);
  console.log(`    Summary length: ${analysisResult.summary?.length || 0} characters`);
  console.log(`    Key concepts extracted: ${analysisResult.concepts?.length || 0}`);

  // Save Summary
  await prisma.summary.upsert({
    where: { lectureId: lecture.id },
    update: { content: analysisResult.summary },
    create: { lectureId: lecture.id, content: analysisResult.summary }
  });

  // Delete prior concepts and relationships to avoid duplicates on re-run
  await prisma.relationship.deleteMany({ where: { lectureId: lecture.id } });
  await prisma.concept.deleteMany({ where: { lectureId: lecture.id } });

  // Save Concepts with integer importance
  const savedConcepts = [];
  for (const c of analysisResult.concepts) {
    const importanceInt = typeof c.importanceScore === 'number'
      ? c.importanceScore
      : c.importance === 'high' ? 3 : c.importance === 'low' ? 1 : 2;

    const saved = await prisma.concept.create({
      data: {
        lectureId: lecture.id,
        name: c.name,
        description: c.description,
        importance: importanceInt
      }
    });
    savedConcepts.push(saved);
  }
  console.log(`  ✓ Saved ${savedConcepts.length} concepts to Neon database.`);
  savedConcepts.forEach((c, idx) => {
    console.log(`    ${idx + 1}. [Imp ${c.importance}] ${c.name} — ${c.description.substring(0, 70)}...`);
  });

  // 7. Extract Concept Relationships
  console.log('\n[STEP 7] Extracting concept relationships via Gemini...');
  const extractedRelationships = await extractRelationships(savedConcepts, transcriptContent, {
    lectureTitle: LECTURE_TITLE
  });

  console.log(`  ✓ Relationship extraction complete! Found: ${extractedRelationships?.length || 0} relationships`);

  // Save Relationships
  for (const rel of extractedRelationships) {
    if (rel.sourceConceptId && rel.targetConceptId && rel.sourceConceptId !== rel.targetConceptId) {
      await prisma.relationship.create({
        data: {
          lectureId: lecture.id,
          sourceConceptId: rel.sourceConceptId,
          targetConceptId: rel.targetConceptId,
          relationshipType: rel.relationshipType || 'relates_to',
          description: rel.description || ''
        }
      });
      console.log(`    • ${rel.sourceConceptName} --[${rel.relationshipType}]--> ${rel.targetConceptName}`);
    }
  }

  // 8. Generate Interactive Learning Map Graph
  console.log('\n[STEP 8] Generating interactive visual learning map data...');
  const dbRelationships = await prisma.relationship.findMany({
    where: { lectureId: lecture.id },
    include: { sourceConcept: true, targetConcept: true }
  });

  const mapData = await generateLearningMap(savedConcepts, dbRelationships, {
    lectureTitle: LECTURE_TITLE
  });

  console.log(`  ✓ Learning map generated:`);
  console.log(`    Nodes: ${mapData.nodes?.length || 0}`);
  console.log(`    Edges: ${mapData.edges?.length || 0}`);

  // Save Learning Map
  await prisma.learningMap.upsert({
    where: { lectureId: lecture.id },
    update: { mapData },
    create: { lectureId: lecture.id, mapData }
  });

  // Update Lecture status to COMPLETED
  await prisma.lecture.update({
    where: { id: lecture.id },
    data: { status: 'COMPLETED' }
  });

  console.log('\n========================================================================');
  console.log('🎉 AUDIO PROCESSING PIPELINE SUCCEEDED 100%!');
  console.log(`   Lecture ID: ${lecture.id}`);
  console.log(`   Direct URL: http://localhost:5173/lectures/${lecture.id}`);
  console.log('========================================================================\n');
}

main()
  .catch((err) => {
    console.error('\n❌ Audio processing error:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
