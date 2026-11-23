import { prisma } from '../../config/prisma.js';
import { logger } from '../../utils/logger.js';
import { EMBEDDING_VERSION, embedText } from '../gemini/embedding.service.js';

const STOP_WORDS = new Set([
  'about', 'after', 'again', 'also', 'are', 'because', 'been', 'being', 'between',
  'could', 'does', 'from', 'have', 'into', 'just', 'lecture', 'more', 'most', 'only',
  'other', 'should', 'some', 'such', 'than', 'that', 'their', 'them', 'there', 'these',
  'they', 'this', 'those', 'through', 'what', 'when', 'where', 'which', 'while', 'with',
  'would', 'your', 'explain', 'describe', 'tell', 'understand'
]);

/** Retrieve vector and full-text candidates, then combine semantic and lexical scores. */
export async function retrieveRelevantChunks(lectureId, query, topK = 6) {
  if (!lectureId || typeof query !== 'string' || !query.trim()) {
    throw new Error('retrieveRelevantChunks: lectureId and query are required');
  }

  const queryEmbedding = await embedText(query, { task: 'query' });
  const vector = `[${queryEmbedding.join(',')}]`;
  const lexicalQuery = query.includes('Follow-up question:')
    ? query.split(/Follow-up question:\s*/i).at(-1)
    : query;
  const candidates = await prisma.$queryRawUnsafe(
    `WITH semantic_candidates AS (
       SELECT "id", "chunkIndex", "content", "startSec", "endSec", "speaker", "segmentIndex",
              1 - ("embedding" <=> $2::vector) AS similarity, 0::real AS lexical_rank
         FROM transcript_chunks
        WHERE "lectureId" = $1 AND "embedding" IS NOT NULL AND "embeddingModel" = $3
        ORDER BY "embedding" <=> $2::vector
        LIMIT $4
     ), lexical_candidates AS (
       SELECT "id", "chunkIndex", "content", "startSec", "endSec", "speaker", "segmentIndex",
              1 - ("embedding" <=> $2::vector) AS similarity,
              ts_rank_cd(to_tsvector('simple', "content"), plainto_tsquery('simple', $5)) AS lexical_rank
         FROM transcript_chunks
        WHERE "lectureId" = $1 AND "embedding" IS NOT NULL AND "embeddingModel" = $3
          AND to_tsvector('simple', "content") @@ plainto_tsquery('simple', $5)
        ORDER BY lexical_rank DESC
        LIMIT $4
     ), combined AS (
       SELECT * FROM semantic_candidates
       UNION ALL
       SELECT * FROM lexical_candidates
     )
     SELECT "id", "chunkIndex", "content", "startSec", "endSec", "speaker", "segmentIndex",
            MAX(similarity) AS similarity, MAX(lexical_rank) AS lexical_rank
       FROM combined
      GROUP BY "id", "chunkIndex", "content", "startSec", "endSec", "speaker", "segmentIndex"`,
    lectureId,
    vector,
    EMBEDDING_VERSION,
    Math.max(topK * 4, 20),
    lexicalQuery
  );

  const queryTerms = tokenize(lexicalQuery);
  const ranked = candidates.map(row => {
    const semantic = clamp(Number(row.similarity), -1, 1);
    const lexical = Math.max(
      lexicalCoverage(queryTerms, tokenize(row.content)),
      1 - Math.exp(-Math.max(0, Number(row.lexical_rank) || 0) * 8)
    );
    // Lexical overlap helps exact names, formulas, and course terminology while
    // semantic similarity still handles paraphrases.
    const score = Math.max(0, semantic) * 0.75 + lexical * 0.25;
    return {
      id: row.id,
      passageId: `P${row.chunkIndex}`,
      chunkIndex: row.chunkIndex,
      content: row.content,
      startSec: row.startSec == null ? null : Number(row.startSec),
      endSec: row.endSec == null ? null : Number(row.endSec),
      speaker: row.speaker,
      segmentIndex: row.segmentIndex == null ? null : Number(row.segmentIndex),
      similarity: semantic,
      relevance: score,
      lexicalCoverage: lexical
    };
  });

  const filtered = ranked
    .filter(chunk => chunk.similarity >= 0.22 || chunk.lexicalCoverage >= 0.15)
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, topK);

  logger.info(`[RAG] Retrieved ${filtered.length}/${candidates.length} relevant passages for lecture ${lectureId}.`);
  return filtered;
}

/** Retrieve transcript evidence across a caller-authorized set of lectures with one query embedding. */
export async function retrieveRelevantChunksAcrossLectures(lectureIds, query, topK = 8) {
  if (!Array.isArray(lectureIds) || lectureIds.length === 0 || typeof query !== 'string' || !query.trim()) return [];

  const queryEmbedding = await embedText(query, { task: 'query' });
  const vector = `[${queryEmbedding.join(',')}]`;
  const lexicalQuery = query.includes('Follow-up question:')
    ? query.split(/Follow-up question:\s*/i).at(-1)
    : query;
  const lectureParams = lectureIds.map((_, index) => `$${index + 5}`).join(', ');
  const queryParams = [vector, EMBEDDING_VERSION, Math.max(topK * 5, 30), lexicalQuery, ...lectureIds];
  const candidates = await prisma.$queryRawUnsafe(
    `WITH semantic_candidates AS (
       SELECT tc."id", tc."lectureId", l."title" AS "lectureTitle", tc."chunkIndex", tc."content",
              tc."startSec", tc."endSec", tc."speaker", tc."segmentIndex",
              1 - (tc."embedding" <=> $1::vector) AS similarity, 0::real AS lexical_rank
         FROM transcript_chunks tc
         JOIN lectures l ON l."id" = tc."lectureId"
        WHERE tc."lectureId" IN (${lectureParams})
          AND tc."embedding" IS NOT NULL AND tc."embeddingModel" = $2
        ORDER BY tc."embedding" <=> $1::vector
        LIMIT $3
     ), lexical_candidates AS (
       SELECT tc."id", tc."lectureId", l."title" AS "lectureTitle", tc."chunkIndex", tc."content",
              tc."startSec", tc."endSec", tc."speaker", tc."segmentIndex",
              1 - (tc."embedding" <=> $1::vector) AS similarity,
              ts_rank_cd(to_tsvector('simple', tc."content"), plainto_tsquery('simple', $4)) AS lexical_rank
         FROM transcript_chunks tc
         JOIN lectures l ON l."id" = tc."lectureId"
        WHERE tc."lectureId" IN (${lectureParams})
          AND tc."embedding" IS NOT NULL AND tc."embeddingModel" = $2
          AND to_tsvector('simple', tc."content") @@ plainto_tsquery('simple', $4)
        ORDER BY lexical_rank DESC
        LIMIT $3
     ), combined AS (
       SELECT * FROM semantic_candidates UNION ALL SELECT * FROM lexical_candidates
     )
     SELECT "id", "lectureId", "lectureTitle", "chunkIndex", "content", "startSec", "endSec", "speaker", "segmentIndex",
            MAX(similarity) AS similarity, MAX(lexical_rank) AS lexical_rank
       FROM combined
      GROUP BY "id", "lectureId", "lectureTitle", "chunkIndex", "content", "startSec", "endSec", "speaker", "segmentIndex"`,
    ...queryParams
  );

  const queryTerms = tokenize(lexicalQuery);
  return candidates.map(row => {
    const semantic = clamp(Number(row.similarity), -1, 1);
    const lexical = Math.max(
      lexicalCoverage(queryTerms, tokenize(row.content)),
      1 - Math.exp(-Math.max(0, Number(row.lexical_rank) || 0) * 8)
    );
    return {
      ...row,
      startSec: row.startSec == null ? null : Number(row.startSec),
      endSec: row.endSec == null ? null : Number(row.endSec),
      segmentIndex: row.segmentIndex == null ? null : Number(row.segmentIndex),
      similarity: semantic,
      relevance: Math.max(0, semantic) * 0.75 + lexical * 0.25,
      lexicalCoverage: lexical
    };
  })
    .filter(chunk => chunk.similarity >= 0.22 || chunk.lexicalCoverage >= 0.15)
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, topK);
}

export async function countIndexedLectures(lectureIds) {
  if (!Array.isArray(lectureIds) || lectureIds.length === 0) return 0;
  const lectureParams = lectureIds.map((_, index) => `$${index + 2}`).join(', ');
  const rows = await prisma.$queryRawUnsafe(
    `SELECT COUNT(DISTINCT "lectureId")::int AS count
       FROM transcript_chunks
      WHERE "lectureId" IN (${lectureParams})
        AND "embedding" IS NOT NULL AND "embeddingModel" = $1`,
    EMBEDDING_VERSION,
    ...lectureIds
  );
  return Number(rows[0]?.count || 0);
}

function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .match(/[\p{L}\p{N}][\p{L}\p{N}_'-]*/gu)?.filter(token =>
      token.length > 2 && !STOP_WORDS.has(token)
    ) || [];
}

function lexicalCoverage(queryTerms, passageTerms) {
  const importantTerms = [...new Set(queryTerms)];
  if (!importantTerms.length) return 0;
  const available = new Set(passageTerms);
  return importantTerms.filter(term => available.has(term)).length / importantTerms.length;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : 0));
}
