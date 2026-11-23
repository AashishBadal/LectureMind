CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS "transcript_chunks" (
  "id" TEXT NOT NULL,
  "lectureId" TEXT NOT NULL,
  "chunkIndex" INTEGER NOT NULL,
  "content" TEXT NOT NULL,
  "startSec" DOUBLE PRECISION,
  "endSec" DOUBLE PRECISION,
  "speaker" TEXT,
  "segmentIndex" INTEGER,
  "sourceHash" TEXT NOT NULL DEFAULT '',
  "embeddingModel" TEXT NOT NULL DEFAULT '',
  "embedding" vector(1536),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "transcript_chunks_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "transcript_chunks_lectureId_fkey"
    FOREIGN KEY ("lectureId") REFERENCES "lectures"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Repair databases where the initial RAG migration was partially applied or
-- the old table predates source fingerprint and model version columns.
ALTER TABLE "transcript_chunks" ADD COLUMN IF NOT EXISTS "segmentIndex" INTEGER;
ALTER TABLE "transcript_chunks" ADD COLUMN IF NOT EXISTS "sourceHash" TEXT NOT NULL DEFAULT '';
ALTER TABLE "transcript_chunks" ADD COLUMN IF NOT EXISTS "embeddingModel" TEXT NOT NULL DEFAULT '';
ALTER TABLE "transcript_chunks" ALTER COLUMN "sourceHash" DROP DEFAULT;
ALTER TABLE "transcript_chunks" ALTER COLUMN "embeddingModel" DROP DEFAULT;

CREATE INDEX IF NOT EXISTS "transcript_chunks_lectureId_idx" ON "transcript_chunks"("lectureId");
CREATE UNIQUE INDEX IF NOT EXISTS "transcript_chunks_lectureId_chunkIndex_key" ON "transcript_chunks"("lectureId", "chunkIndex");
CREATE INDEX IF NOT EXISTS "transcript_chunks_embedding_hnsw_idx"
  ON "transcript_chunks" USING hnsw ("embedding" vector_cosine_ops);
CREATE INDEX IF NOT EXISTS "transcript_chunks_content_fts_idx"
  ON "transcript_chunks" USING GIN (to_tsvector('simple', "content"));
