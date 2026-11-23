const TARGET_WORDS = 220;
const OVERLAP_WORDS = 40;

/**
 * Build overlapping retrieval passages from transcript segments. Segment indices
 * always refer to the original transcript array; estimated timecodes are never
 * presented as recording timestamps.
 */
export function chunkTranscript({ content, segments }) {
  if (Array.isArray(segments) && segments.length) return chunkFromSegments(segments, content);
  return chunkFromText(content || '');
}

function splitOversized(text, limit) {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= limit) return [text.trim()];
  const result = [];
  for (let offset = 0; offset < words.length; offset += limit - OVERLAP_WORDS) {
    result.push(words.slice(offset, offset + limit).join(' '));
  }
  return result;
}

function chunkFromSegments(segments, transcriptContent) {
  const atoms = [];
  segments.forEach((segment, segmentIndex) => {
    const sourceText = typeof segment?.text === 'string' ? segment.text.trim() : '';
    if (!sourceText) return;

    const sentences = sourceText.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [sourceText];
    const isLegacyEstimatedFallback = segments.length === 1 && segment.id === 1 &&
      segment.start === 0 && segment.end === 10 && segment.text === transcriptContent;
    const hasSourceTimestamps = Number.isInteger(segment.id) && segment.timestampEstimated !== true && !isLegacyEstimatedFallback;
    for (const sentence of sentences) {
      for (const text of splitOversized(sentence.trim(), TARGET_WORDS)) {
        atoms.push({
          text,
          segmentIndex,
          startSec: hasSourceTimestamps ? finiteOrNull(segment.start) : null,
          endSec: hasSourceTimestamps ? finiteOrNull(segment.end) : null,
          speaker: segment.speaker ? String(segment.speaker).slice(0, 80) : null
        });
      }
    }
  });

  const chunks = [];
  let cursor = 0;
  while (cursor < atoms.length) {
    let end = cursor;
    let words = 0;
    while (end < atoms.length && (words < TARGET_WORDS || end === cursor)) {
      words += wordCount(atoms[end].text);
      end++;
    }

    const group = atoms.slice(cursor, end);
    const segmentIndices = [...new Set(group.map(atom => atom.segmentIndex))];
    chunks.push({
      chunkIndex: chunks.length,
      content: group.map(atom => `${atom.speaker ? `${atom.speaker}: ` : ''}${atom.text}`).join(' '),
      startSec: group[0].startSec,
      endSec: group[group.length - 1].endSec,
      speaker: group[0].speaker,
      segmentIndex: segmentIndices[0] ?? null,
      segmentIndices
    });

    if (end >= atoms.length) break;
    let overlap = 0;
    let nextCursor = end;
    while (nextCursor > cursor + 1 && overlap < OVERLAP_WORDS) {
      nextCursor--;
      overlap += wordCount(atoms[nextCursor].text);
    }
    cursor = Math.max(cursor + 1, nextCursor);
  }

  return chunks;
}

function chunkFromText(text) {
  const words = String(text).split(/\s+/).filter(Boolean);
  if (!words.length) return [];

  const chunks = [];
  for (let offset = 0; offset < words.length; offset += TARGET_WORDS - OVERLAP_WORDS) {
    chunks.push({
      chunkIndex: chunks.length,
      content: words.slice(offset, offset + TARGET_WORDS).join(' '),
      startSec: null,
      endSec: null,
      speaker: null,
      segmentIndex: null,
      segmentIndices: []
    });
  }
  return chunks;
}

function finiteOrNull(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

function wordCount(text) {
  return text.split(/\s+/).filter(Boolean).length;
}
