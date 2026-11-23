import 'dotenv/config';
import { prisma } from '../src/config/prisma.js';

/**
 * Automated Database & Relational Verification Script
 * Validates Neon PostgreSQL connectivity, schema models, and relational cascade constraints.
 */
async function runDatabaseVerification() {
  console.log('----------------------------------------------------');
  console.log('🧠 LectureMind - Neon PostgreSQL Database Verification');
  console.log('----------------------------------------------------');

  try {
    // 1. Verify Connection
    console.log('\n[1/5] Testing Neon PostgreSQL connection...');
    const startTime = Date.now();
    await prisma.$connect();
    const result = await prisma.$queryRaw`SELECT current_database() as db_name, version() as pg_version`;
    const latency = Date.now() - startTime;
    console.log(`✅ Connected to Neon database in ${latency}ms.`);
    console.log(`   Database Name: ${result[0]?.db_name}`);
    console.log(`   Engine: ${result[0]?.pg_version?.substring(0, 45)}...`);

    // 2. Test User & Lecture creation
    console.log('\n[2/5] Creating test User & Lecture models...');
    const testEmail = `test_verification_${Date.now()}@lecturemind.internal`;
    const user = await prisma.user.create({
      data: {
        name: 'Database Test User',
        email: testEmail,
        passwordHash: 'argon2_or_bcrypt_hash_placeholder'
      }
    });
    console.log(`✅ User created: ${user.id} (${user.email})`);

    const lecture = await prisma.lecture.create({
      data: {
        userId: user.id,
        title: 'Introduction to Neural Computation',
        originalFileName: 'classroom_lecture_session_01.mp3',
        audioUrl: 'https://storage.lecturemind.internal/lectures/session_01.mp3',
        storagePath: '/uploads/lectures/session_01.mp3',
        status: 'PENDING',
        duration: 2700 // 45 minutes in seconds
      }
    });
    console.log(`✅ Lecture created: ${lecture.id} (status: ${lecture.status})`);

    // 3. Test Relational Models: Transcript, Summary, Concepts, Relationships, LearningMap, Bookmark
    console.log('\n[3/5] Testing relational models and foreign key linkages...');

    // Transcript
    const transcript = await prisma.transcript.create({
      data: {
        lectureId: lecture.id,
        content: 'Welcome students to today’s lecture on artificial neural networks...',
        segments: [
          { start: 0.0, end: 15.2, text: 'Welcome students to today’s lecture...' },
          { start: 15.3, end: 45.0, text: 'We begin with perceptron fundamentals.' }
        ]
      }
    });
    console.log(`✅ Transcript created: ${transcript.id}`);

    // Summary
    const summary = await prisma.summary.create({
      data: {
        lectureId: lecture.id,
        content: 'This lecture covered biological vs artificial neurons, activation functions, and gradient descent.'
      }
    });
    console.log(`✅ Summary created: ${summary.id}`);

    // Concepts
    const concept1 = await prisma.concept.create({
      data: {
        lectureId: lecture.id,
        name: 'Perceptron',
        description: 'The fundamental building block of artificial neural networks.',
        importance: 5
      }
    });

    const concept2 = await prisma.concept.create({
      data: {
        lectureId: lecture.id,
        name: 'Multilayer Perceptron (MLP)',
        description: 'Feedforward artificial neural network consisting of input, hidden, and output layers.',
        importance: 4
      }
    });
    console.log(`✅ Concepts created: "${concept1.name}" (${concept1.id}) and "${concept2.name}" (${concept2.id})`);

    // Relationship linking concept1 and concept2
    const relationship = await prisma.relationship.create({
      data: {
        lectureId: lecture.id,
        sourceConceptId: concept1.id,
        targetConceptId: concept2.id,
        relationshipType: 'generalizes_to',
        description: 'Perceptron is the elementary constituent unit that generalizes into an MLP.'
      }
    });
    console.log(`✅ Relationship created: "${concept1.name}" --[${relationship.relationshipType}]--> "${concept2.name}"`);

    // LearningMap
    const learningMap = await prisma.learningMap.create({
      data: {
        lectureId: lecture.id,
        mapData: {
          nodes: [
            { id: concept1.id, label: concept1.name, x: 100, y: 150 },
            { id: concept2.id, label: concept2.name, x: 300, y: 150 }
          ],
          edges: [
            { id: relationship.id, source: concept1.id, target: concept2.id, label: relationship.relationshipType }
          ]
        }
      }
    });
    console.log(`✅ LearningMap created: ${learningMap.id}`);

    // Bookmark
    const bookmark = await prisma.bookmark.create({
      data: {
        lectureId: lecture.id,
        title: 'Backpropagation Derivation',
        note: 'Important formula highlighted by professor for midterm exams.',
        timestamp: 1250.5,
        transcriptPosition: 420
      }
    });
    console.log(`✅ Bookmark created: "${bookmark.title}" at ${bookmark.timestamp}s`);

    // 4. Query Full Lecture Graph (Read verification)
    console.log('\n[4/5] Reading full relational lecture graph from Neon...');
    const fullLecture = await prisma.lecture.findUnique({
      where: { id: lecture.id },
      include: {
        user: true,
        transcript: true,
        summary: true,
        concepts: {
          include: {
            outgoingRelations: true,
            incomingRelations: true
          }
        },
        relationships: {
          include: {
            sourceConcept: true,
            targetConcept: true
          }
        },
        learningMap: true,
        bookmarks: true
      }
    });

    if (!fullLecture) {
      throw new Error('Verification failed: could not retrieve created lecture graph');
    }

    console.log(`✅ Lecture graph read successfully:`);
    console.log(`   - Title: ${fullLecture.title}`);
    console.log(`   - Owner: ${fullLecture.user.name} (${fullLecture.user.email})`);
    console.log(`   - Concepts Count: ${fullLecture.concepts.length}`);
    console.log(`   - Relationships Count: ${fullLecture.relationships.length}`);
    console.log(`   - Transcript Length: ${fullLecture.transcript.content.length} chars`);
    console.log(`   - Bookmarks Count: ${fullLecture.bookmarks.length}`);

    // 5. Cleanup & Cascading Delete Test
    console.log('\n[5/5] Testing cascade deletion by removing test user...');
    await prisma.user.delete({ where: { id: user.id } });

    // Verify all related entities were removed via ON DELETE CASCADE
    const remainingLecture = await prisma.lecture.findUnique({ where: { id: lecture.id } });
    const remainingTranscript = await prisma.transcript.findUnique({ where: { id: transcript.id } });
    const remainingConcepts = await prisma.concept.findMany({ where: { lectureId: lecture.id } });
    const remainingRelationships = await prisma.relationship.findMany({ where: { lectureId: lecture.id } });

    if (remainingLecture || remainingTranscript || remainingConcepts.length > 0 || remainingRelationships.length > 0) {
      throw new Error('Cascade deletion check failed: Orphaned records still present!');
    }

    console.log('✅ Cascade deletion confirmed: all linked lecture, transcript, concept, and relationship records cleanly removed.');
    console.log('\n🎉 ALL DATABASE CHECKS PASSED SUCCESSFULLY!');
  } catch (error) {
    console.error('\n❌ Verification failed with error:', error.message);
    if (error.code) {
      console.error(`   Prisma Error Code: ${error.code}`);
    }
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runDatabaseVerification();
