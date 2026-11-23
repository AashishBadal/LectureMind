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
  "sourceHash" TEXT NOT NULL,
  "embeddingModel" TEXT NOT NULL,
  "embedding" vector(1536),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "transcript_chunks_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "transcript_chunks_lectureId_fkey"
    FOREIGN KEY ("lectureId") REFERENCES "lectures"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

ALTER TABLE "transcript_chunks" ADD COLUMN IF NOT EXISTS "segmentIndex" INTEGER;
ALTER TABLE "transcript_chunks" ADD COLUMN IF NOT EXISTS "sourceHash" TEXT NOT NULL DEFAULT '';
ALTER TABLE "transcript_chunks" ADD COLUMN IF NOT EXISTS "embeddingModel" TEXT NOT NULL DEFAULT '';
ALTER TABLE "transcript_chunks" ALTER COLUMN "sourceHash" DROP DEFAULT;
ALTER TABLE "transcript_chunks" ALTER COLUMN "embeddingModel" DROP DEFAULT;
ALTER TABLE "transcript_chunks"
  ALTER COLUMN "embedding" TYPE vector(1536)
  USING CASE WHEN "embedding" IS NULL THEN NULL ELSE subvector("embedding", 1, 1536)::vector(1536) END;

DELETE FROM "transcript_chunks" older
USING "transcript_chunks" newer
WHERE older."lectureId" = newer."lectureId"
  AND older."chunkIndex" = newer."chunkIndex"
  AND older.ctid < newer.ctid;

CREATE INDEX IF NOT EXISTS "transcript_chunks_lectureId_idx" ON "transcript_chunks"("lectureId");
CREATE UNIQUE INDEX IF NOT EXISTS "transcript_chunks_lectureId_chunkIndex_key" ON "transcript_chunks"("lectureId", "chunkIndex");
CREATE INDEX IF NOT EXISTS "transcript_chunks_embedding_hnsw_idx"
  ON "transcript_chunks" USING hnsw ("embedding" vector_cosine_ops);
CREATE INDEX IF NOT EXISTS "transcript_chunks_content_fts_idx"
  ON "transcript_chunks" USING GIN (to_tsvector('simple', "content"));
