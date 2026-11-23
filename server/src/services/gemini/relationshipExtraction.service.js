import { generateWithRetry } from './client.js';
import { parseAndValidateJson, handleGeminiError } from './geminiErrors.js';
import { logger } from '../../utils/logger.js';
import { config } from '../../config/env.js';

// Standard academic relationship types allowed in LectureMind
export const ALLOWED_RELATIONSHIP_TYPES = [
  'related_to',
  'causes',
  'depends_on',
  'contains',
  'example_of',
  'leads_to',
  'contrasts_with',
  'subcategory',
  'part_of',
  'prerequisite'
];

const RELATIONSHIP_EXTRACTION_SYSTEM_INSTRUCTION = `
You are LectureMind's Pedagogical Relationship Identifier.
Your purpose is to discover and formalize genuine academic, causal, hierarchical, and pedagogical relationships between concepts extracted from a classroom lecture.

CRITICAL INSTRUCTIONS & GROUNDING:
1. SOURCE OF TRUTH: Use only the supplied lecture transcript as the source of truth. Identify relationships ONLY when they are directly supported by the lecture context.
2. NO INVENTED FACTS: Do not invent facts or connections that the lecturer did not make or directly state.
3. NO UNSUPPORTED RELATIONSHIPS: Do not create unsupported relationships. If no meaningful relationship exists between certain concepts, do not force one.
4. UNAMBIGUOUS INFORMATION: If information is unclear, omit it rather than inventing it.
5. EXACT CONCEPTS: Only define relationships between the provided known concepts. Do NOT invent new concept names.
6. RELATIONSHIP TYPES: Select the most appropriate relationship type strictly from the allowed list:
   - related_to
   - causes
   - depends_on
   - contains
   - example_of
   - leads_to
   - contrasts_with
   - subcategory
   - part_of
   - prerequisite
7. STRUCTURED OUTPUT: Return strictly valid JSON adhering to the specified schema.
`;

/**
 * Validates relationship integrity against known concept IDs
 * @param {Array<object>} relationships
 * @param {Array<object>} concepts
 * @returns {{ valid: boolean, errors: string[], sanitized: Array<object> }}
 */
export function validateRelationshipIntegrity(relationships, concepts) {
  const errors = [];
  const validConceptIdSet = new Set((concepts || []).map((c) => c.id));
  const conceptNameMap = new Map((concepts || []).map((c) => [c.name.trim().toLowerCase(), c]));
  const sanitized = [];
  const seenEdges = new Set();

  if (!Array.isArray(relationships)) {
    return { valid: false, errors: ['Relationships must be an array.'], sanitized: [] };
  }

  for (const [idx, rel] of relationships.entries()) {
    if (!rel || typeof rel !== 'object') {
      errors.push(`Relationship at index ${idx} is not an object.`);
      continue;
    }

    const srcId = rel.sourceConceptId || conceptNameMap.get((rel.sourceConcept || rel.sourceConceptName || '').toLowerCase().trim())?.id;
    const tgtId = rel.targetConceptId || conceptNameMap.get((rel.targetConcept || rel.targetConceptName || '').toLowerCase().trim())?.id;

    if (!srcId || !validConceptIdSet.has(srcId)) {
      errors.push(`Relationship at index ${idx} references non-existent source concept: "${rel.sourceConcept || rel.sourceConceptId}".`);
      continue;
    }
    if (!tgtId || !validConceptIdSet.has(tgtId)) {
      errors.push(`Relationship at index ${idx} references non-existent target concept: "${rel.targetConcept || rel.targetConceptId}".`);
      continue;
    }
    if (srcId === tgtId) {
      errors.push(`Relationship at index ${idx} is an invalid self-loop (${srcId} -> ${tgtId}).`);
      continue;
    }

    const normalizedType = normalizeRelationshipType(rel.relationshipType);
    const edgeKey = `${srcId}->${tgtId}->${normalizedType}`;
    if (seenEdges.has(edgeKey)) {
      continue;
    }
    seenEdges.add(edgeKey);

    sanitized.push({
      ...rel,
      sourceConceptId: srcId,
      targetConceptId: tgtId,
      relationshipType: normalizedType
    });
  }

  return { valid: errors.length === 0, errors, sanitized };
}

/**
 * Attempts safe recovery on malformed or slightly corrupted JSON strings
 * @param {string} raw
 * @returns {object|null}
 */
function attemptSafeJsonRecovery(raw) {
  if (!raw || typeof raw !== 'string') return null;

  let cleaned = raw.trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

  try {
    return JSON.parse(cleaned);
  } catch (e) {
    try {
      const repaired = cleaned
        .replace(/,\s*([\]}])/g, '$1')
        .replace(/(['"])?([a-zA-Z0-9_]+)(['"])?\s*:/g, '"$2":');
      return JSON.parse(repaired);
    } catch (e2) {
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          const repaired = match[0].replace(/,\s*([\]}])/g, '$1');
          return JSON.parse(repaired);
        } catch (e3) {
          return null;
        }
      }
      return null;
    }
  }
}

/**
 * Normalizes a relationship type string to one of the allowed academic types
 * @param {string} rawType
 * @returns {string}
 */
export function normalizeRelationshipType(rawType) {
  if (!rawType || typeof rawType !== 'string') return 'related_to';
  const lower = rawType.toLowerCase().trim().replace(/[\s-]+/g, '_');

  // Direct match
  if (ALLOWED_RELATIONSHIP_TYPES.includes(lower)) {
    return lower;
  }

  // Common synonyms mapping
  if (lower === 'prerequisite_of' || lower === 'prereq') return 'prerequisite';
  if (lower === 'is_part_of') return 'part_of';
  if (lower === 'is_example_of') return 'example_of';
  if (lower === 'relates_to') return 'related_to';
  if (lower === 'subclass_of' || lower === 'subset_of') return 'subcategory';
  if (lower === 'results_in' || lower === 'enables') return 'leads_to';

  return 'related_to';
}

/**
 * Identifies and validates meaningful academic relationships between concepts extracted from a lecture.
 *
 * @param {Array<{ id: string, name: string, description?: string }>} concepts
 * @param {string} transcriptText
 * @param {object} [options]
 * @returns {Promise<Array<{ sourceConceptId: string, targetConceptId: string, sourceConceptName: string, targetConceptName: string, relationshipType: string, description: string }>>}
 */
export const extractRelationships = async (concepts, transcriptText, options = {}) => {
  if (!Array.isArray(concepts) || concepts.length < 2) {
    throw new Error('extractRelationships requires at least 2 extracted concepts.');
  }

  if (!transcriptText || typeof transcriptText !== 'string' || !transcriptText.trim()) {
    throw new Error('extractRelationships requires a non-empty lecture transcript.');
  }

  // Create lookup maps for fast matching and normalization
  const conceptNameMap = new Map(); // normalized lowercase name -> concept object
  concepts.forEach((c) => {
    if (c && c.name) {
      conceptNameMap.set(c.name.trim().toLowerCase(), c);
    }
  });

  const knownConceptsList = concepts.map((c) => ({
    name: c.name.trim(),
    description: c.description ? c.description.trim() : ''
  }));

  const prompt = `
Use only the supplied lecture transcript as the source of truth. Identify relationships only when they are directly supported by the lecture context. Do not invent connections.

KNOWN CONCEPTS IN THIS LECTURE:
${JSON.stringify(knownConceptsList, null, 2)}

TRANSCRIPT:
"""
${transcriptText.trim()}
"""

Identify meaningful relationships between these concepts. For each relationship, select the most accurate relationship type strictly from this list:
[related_to, causes, depends_on, contains, example_of, leads_to, contrasts_with, subcategory, part_of, prerequisite]

REQUESTED JSON STRUCTURE:
{
  "relationships": [
    {
      "sourceConcept": "Exact concept name from KNOWN CONCEPTS list",
      "targetConcept": "Exact concept name from KNOWN CONCEPTS list",
      "relationshipType": "depends_on",
      "description": "Clear explanation supported by the lecture transcript explaining why this relationship holds."
    }
  ]
}
`;

  const preferredModel = options.preferredModel || process.env.GEMINI_ANALYSIS_MODEL || config.geminiAnalysisModel || config.geminiTextModel || 'gemini-flash-lite-latest';

  try {
    logger.info(`Extracting conceptual relationships for ${concepts.length} concepts with Gemini...`);

    const response = await generateWithRetry(
      {
        modelName: preferredModel,
        systemInstruction: RELATIONSHIP_EXTRACTION_SYSTEM_INSTRUCTION,
        jsonMode: true,
        temperature: 0.2
      },
      prompt
    );

    const rawText = response?.response?.text();
    if (!rawText) {
      throw new Error('Gemini returned an empty response for relationship extraction.');
    }

    let parsed = null;
    try {
      parsed = parseAndValidateJson(rawText);
    } catch (parseErr) {
      logger.warn('Initial JSON parse failed for relationships, attempting safe recovery...');
      parsed = attemptSafeJsonRecovery(rawText);
      if (!parsed) {
        throw new Error(`JSON recovery failed: ${parseErr.message}`);
      }
    }

    if (!parsed || !Array.isArray(parsed.relationships)) {
      throw new Error('Relationship extraction response missing "relationships" array.');
    }

    // Comprehensive validation and deduplication
    const validatedRelationships = [];
    const seenEdges = new Set(); // To prevent duplicates: "sourceId->targetId->type"

    for (const rel of parsed.relationships) {
      if (!rel || typeof rel !== 'object') continue;

      // Handle either sourceConcept or sourceConceptName
      const rawSrc = String(rel.sourceConcept || rel.sourceConceptName || '').trim();
      const rawTgt = String(rel.targetConcept || rel.targetConceptName || '').trim();

      if (!rawSrc || !rawTgt) continue;

      // 1. Verify source and target concept exist in known lecture concepts
      const sourceObj = conceptNameMap.get(rawSrc.toLowerCase());
      const targetObj = conceptNameMap.get(rawTgt.toLowerCase());

      if (!sourceObj || !targetObj) {
        logger.warn(`Skipping relationship: concept "${rawSrc}" or "${rawTgt}" not found in lecture concepts.`);
        continue;
      }

      // 2. Prevent self-referencing relationships
      if (sourceObj.id === targetObj.id) {
        logger.warn(`Skipping self-referencing relationship for concept "${sourceObj.name}".`);
        continue;
      }

      // 3. Normalize & validate relationship type
      const normalizedType = normalizeRelationshipType(rel.relationshipType);

      // 4. Prevent duplicate relationships
      const edgeKey = `${sourceObj.id}->${targetObj.id}->${normalizedType}`;
      if (seenEdges.has(edgeKey)) {
        logger.warn(`Skipping duplicate relationship edge: ${edgeKey}`);
        continue;
      }
      seenEdges.add(edgeKey);

      // 5. Sanitize explanation
      const sanitizedDesc = rel.description ? String(rel.description).trim() : `Concept "${sourceObj.name}" ${normalizedType.replace(/_/g, ' ')} "${targetObj.name}".`;

      validatedRelationships.push({
        sourceConceptId: sourceObj.id,
        targetConceptId: targetObj.id,
        sourceConceptName: sourceObj.name,
        targetConceptName: targetObj.name,
        relationshipType: normalizedType,
        description: sanitizedDesc
      });
    }

    logger.info(`Relationship extraction completed: ${validatedRelationships.length} valid relationships discovered.`);
    return validatedRelationships;
  } catch (error) {
    logger.error('Error extracting conceptual relationships:', error);
    throw handleGeminiError(error);
  }
};
