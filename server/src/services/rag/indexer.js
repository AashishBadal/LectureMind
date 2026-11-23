import { createHash, randomUUID } from 'node:crypto';
import { prisma } from '../../config/prisma.js';
import { logger } from '../../utils/logger.js';
import { EMBEDDING_DIMENSIONS, EMBEDDING_VERSION, embedBatch } from '../gemini/embedding.service.js';
import { chunkTranscript } from './chunker.js';

const indexingByLecture = new Map();

export function transcriptFingerprint(transcript) {
  const source = JSON.stringify({
    content: transcript?.content || '',
    segments: Array.isArray(transcript?.segments) ? transcript.segments : null
  });
  return createHash('sha256').update(source).digest('hex');
}

/** Replace the lecture's complete passage index with an index for this exact source version. */
export function indexLectureTranscript(lectureId, transcript) {
  if (!lectureId || typeof transcript?.content !== 'string' || !transcript.content.trim()) {
    return Promise.reject(new Error('indexLectureTranscript: lectureId and non-empty transcript.content are required'));
  }

  const sourceHash = transcriptFingerprint(transcript);
  const pending = indexingByLecture.get(lectureId);
  if (pending?.sourceHash === sourceHash) return pending.promise;

  const previous = pending?.promise || Promise.resolve();
  const current = previous.catch(() => {}).then(() => buildAndStoreIndex(lectureId, transcript, sourceHash));
  indexingByLecture.set(lectureId, { sourceHash, promise: current });

  return current.finally(() => {
    if (indexingByLecture.get(lectureId)?.promise === current) indexingByLecture.delete(lectureId);
  });
}

async function buildAndStoreIndex(lectureId, transcript, sourceHash) {
  const chunks = chunkTranscript({ content: transcript.content, segments: transcript.segments });
  if (!chunks.length) throw new Error('No searchable passages could be created from this transcript.');

  logger.info(`[RAG] Embedding ${chunks.length} transcript passages for lecture ${lectureId}.`);
  const embeddings = await embedBatch(chunks.map(chunk => chunk.content));
  if (embeddings.length !== chunks.length) throw new Error('Embedding service returned an incomplete passage index.');

  // Do not remove the previous usable index until the replacement has been fully embedded.
  await prisma.$transaction(async tx => {
    await tx.$executeRawUnsafe('DELETE FROM transcript_chunks WHERE "lectureId" = $1', lectureId);

    for (let index = 0; index < chunks.length; index++) {
      const chunk = chunks[index];
      const embedding = embeddings[index];
      if (!Array.isArray(embedding) || embedding.length !== EMBEDDING_DIMENSIONS || embedding.some(value => !Number.isFinite(value))) {
        throw new Error(`Invalid embedding for passage ${index}.`);
      }

      await tx.$executeRawUnsafe(
        `INSERT INTO transcript_chunks
          ("id", "lectureId", "chunkIndex", "content", "startSec", "endSec", "speaker", "segmentIndex", "sourceHash", "embeddingModel", "embedding", "createdAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::vector, NOW())`,
        randomUUID(),
        lectureId,
        chunk.chunkIndex,
        chunk.content,
        chunk.startSec,
        chunk.endSec,
        chunk.speaker,
        chunk.segmentIndex,
        sourceHash,
        EMBEDDING_VERSION,
        `[${embedding.join(',')}]`
      );
    }
  }, { maxWait: 10000, timeout: 120000 });

  logger.info(`[RAG] Indexed ${chunks.length} passages for lecture ${lectureId} (${sourceHash.slice(0, 12)}).`);
  return chunks.length;
}

/** Return true only when every indexed passage matches the current transcript and model. */
export async function isLectureIndexed(lectureId, transcript) {
  if (!lectureId || !transcript?.content) return false;
  const sourceHash = transcriptFingerprint(transcript);
  let rows;
  try {
    rows = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::int AS count,
              COUNT(DISTINCT "sourceHash")::int AS versions,
              MIN("sourceHash") AS "sourceHash",
              COUNT(*) FILTER (WHERE "embedding" IS NULL)::int AS missing_embeddings,
              COUNT(*) FILTER (WHERE "embeddingModel" = $2)::int AS current_model
         FROM transcript_chunks
        WHERE "lectureId" = $1`,
      lectureId,
      EMBEDDING_VERSION
    );
  } catch (error) {
    const postgresCode = error?.meta?.code;
    const missingRagSchema = postgresCode === '42703' || postgresCode === '42P01';
    if (missingRagSchema) {
      const schemaError = new Error('The lecture search index database is outdated. Apply pending migrations with `npx prisma migrate deploy` from the server directory, then try again.');
      schemaError.code = 'RAG_SCHEMA_OUTDATED';
      schemaError.status = 503;
      throw schemaError;
    }
    throw error;
  }
  const row = rows[0];
  return Boolean(
    row && Number(row.count) > 0 && Number(row.versions) === 1 &&
    row.sourceHash === sourceHash && Number(row.missing_embeddings) === 0 &&
    Number(row.current_model) === Number(row.count)
  );
}
