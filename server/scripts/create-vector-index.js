/**
 * Script to create the IVFFlat vector index on transcript_chunks.embedding
 * Run once after `prisma db push` creates the table.
 *
 * Usage: node --env-file=.env scripts/create-vector-index.js
 */
import { prisma } from '../src/config/prisma.js';
import { logger } from '../src/utils/logger.js';

async function main() {
  logger.info('[VectorIndex] Checking pgvector index options for 3072-dim embeddings...');
  try {
    // Both IVFFlat and HNSW in pgvector < 0.7 are capped at 2000 dimensions.
    // gemini-embedding-2 produces 3072-dim vectors, so we cannot use ANN indexes here.
    // Exact KNN search with <=> operator works perfectly for per-lecture queries
    // (each lecture has tens to low hundreds of chunks — seq scan is fast enough).
    //
    // If your pgvector version supports higher dims (pgvector >= 0.7 with HNSW),
    // uncomment the block below:
    //
    // await prisma.$executeRawUnsafe(`
    //   CREATE INDEX IF NOT EXISTS idx_transcript_chunks_embedding
    //   ON transcript_chunks USING hnsw (embedding vector_cosine_ops)
    // `);

    // For now, just verify the table exists and is accessible
    const result = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*) as cnt FROM transcript_chunks`
    );
    logger.info(`[VectorIndex] transcript_chunks table OK. Row count: ${result[0].cnt}`);
    logger.info('[VectorIndex] Note: Using exact KNN search (no ANN index). Safe for per-lecture queries.');
  } catch (err) {
    logger.error('[VectorIndex] Error:', err.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
