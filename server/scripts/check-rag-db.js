import 'dotenv/config';
import { prisma } from '../src/config/prisma.js';

async function check() {
  try {
    const res = await prisma.$queryRawUnsafe('SELECT table_name FROM information_schema.tables WHERE table_name = $1', 'transcript_chunks');
    console.log('transcript_chunks table exists:', res.length > 0);
    if (res.length > 0) {
      const cols = await prisma.$queryRawUnsafe("SELECT column_name, data_type, udt_name FROM information_schema.columns WHERE table_name = 'transcript_chunks'");
      console.log('columns:', cols);
      const idx = await prisma.$queryRawUnsafe("SELECT indexname FROM pg_indexes WHERE tablename = 'transcript_chunks'");
      console.log('indexes:', idx.map(i => i.indexname));
    }
  } catch(e) {
    console.error('Error:', e.message);
  } finally {
    await prisma.$disconnect();
  }
}
check();

