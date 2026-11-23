import 'dotenv/config';
import { prisma } from '../src/config/prisma.js';

async function run() {
  try {
    const result = await prisma.$queryRawUnsafe("SELECT extname FROM pg_extension WHERE extname = 'vector'");
    console.log('pgvector:', result.length > 0 ? 'INSTALLED' : 'NOT INSTALLED');
    
    // Also try to enable it
    if (result.length === 0) {
      try {
        await prisma.$executeRawUnsafe('CREATE EXTENSION IF NOT EXISTS vector');
        console.log('pgvector: ENABLED SUCCESSFULLY');
      } catch(e2) {
        console.log('Could not enable pgvector:', e2.message);
      }
    }
  } catch (e) {
    console.log('Error:', e.message);
  } finally {
    await prisma.$disconnect();
  }
}
run();

