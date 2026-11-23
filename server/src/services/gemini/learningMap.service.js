import { logger } from '../../utils/logger.js';

// Category color palette for visual graph rendering
const CATEGORY_COLORS = {
  'core principle': '#6366f1', // Indigo
  'mathematical model': '#06b6d4', // Cyan
  'algorithm': '#10b981', // Emerald
  'architectural component': '#8b5cf6', // Violet
  'practical tool': '#f59e0b', // Amber
  'historical precedent': '#ec4899', // Pink
  'general': '#64748b' // Slate
};

function getCategoryColor(category = '') {
  const normalized = category.toLowerCase().trim();
  for (const [key, color] of Object.entries(CATEGORY_COLORS)) {
    if (normalized.includes(key)) return color;
  }
  return CATEGORY_COLORS.general;
}

/**
 * Computes deterministic initial (x, y) coordinates for nodes
 * Arranges nodes in hierarchical topological tiers based on edge directions and importance.
 */
function computeInitialLayout(nodes, edges) {
  const width = 1100;
  const height = 750;

  // Build adjacency and compute in-degrees
  const inDegree = new Map();
  const adjList = new Map();

  nodes.forEach((n) => {
    inDegree.set(n.id, 0);
    adjList.set(n.id, []);
  });

  edges.forEach((e) => {
    if (inDegree.has(e.target)) {
      inDegree.set(e.target, inDegree.get(e.target) + 1);
    }
    if (adjList.has(e.source)) {
      adjList.get(e.source).push(e.target);
    }
  });

  // Assign topological rank / layer
  const layers = new Map();
  const queue = [];

  // Start with root nodes (inDegree === 0)
  nodes.forEach((n) => {
    if (inDegree.get(n.id) === 0) {
      layers.set(n.id, 0);
      queue.push(n.id);
    }
  });

  // If all nodes have in-degree > 0 (cycle), pick the highest importance nodes as roots
  if (queue.length === 0 && nodes.length > 0) {
    const highestImp = Math.max(...nodes.map((n) => n.importance || 3));
    nodes.filter((n) => (n.importance || 3) === highestImp).forEach((n) => {
      layers.set(n.id, 0);
      queue.push(n.id);
    });
  }

  // BFS layering
  while (queue.length > 0) {
    const curr = queue.shift();
    const currLayer = layers.get(curr);
    const neighbors = adjList.get(curr) || [];

    neighbors.forEach((nxt) => {
      const nextLayer = Math.max(layers.get(nxt) ?? 0, currLayer + 1);
      if (!layers.has(nxt) || nextLayer > layers.get(nxt)) {
        layers.set(nxt, nextLayer);
        queue.push(nxt);
      }
    });
  }

  // Assign fallback layer for any unvisited nodes based on importance (5 -> 0, 1 -> 4)
  nodes.forEach((n) => {
    if (!layers.has(n.id)) {
      const imp = Math.min(5, Math.max(1, n.importance || 3));
      layers.set(n.id, 5 - imp);
    }
  });

  // Group nodes by layer
  const layerBuckets = new Map();
  nodes.forEach((n) => {
    const layer = layers.get(n.id) || 0;
    if (!layerBuckets.has(layer)) {
      layerBuckets.set(layer, []);
    }
    layerBuckets.get(layer).push(n);
  });

  const sortedLayerKeys = Array.from(layerBuckets.keys()).sort((a, b) => a - b);
  const totalLayers = sortedLayerKeys.length;
  const yPadding = 90;
  const yAvailable = height - yPadding * 2;
  const yStep = totalLayers > 1 ? yAvailable / (totalLayers - 1) : 0;

  const positionedNodes = [];

  sortedLayerKeys.forEach((layerKey, layerIdx) => {
    const tierNodes = layerBuckets.get(layerKey);
    const y = totalLayers > 1 ? Math.round(yPadding + layerIdx * yStep) : Math.round(height / 2);
    const count = tierNodes.length;
    const xPadding = 120;
    const xAvailable = width - xPadding * 2;
    const xStep = count > 1 ? xAvailable / (count - 1) : 0;

    tierNodes.forEach((node, idx) => {
      const x = count > 1 ? Math.round(xPadding + idx * xStep) : Math.round(width / 2);
      positionedNodes.push({
        ...node,
        x,
        y,
        position: { x, y },
        tier: layerIdx
      });
    });
  });

  return positionedNodes;
}

/**
 * Validates learning map graph integrity.
 * Ensures:
 * 1. Nodes array is valid and non-empty.
 * 2. Every edge references a source and target that exists in nodes.
 * 3. Self-loops are filtered.
 *
 * @param {object} mapData
 * @returns {{ valid: boolean, errors: string[], sanitizedMapData: object }}
 */
export function validateLearningMapIntegrity(mapData) {
  const errors = [];
  if (!mapData || typeof mapData !== 'object') {
    return { valid: false, errors: ['Map data must be an object.'], sanitizedMapData: null };
  }

  const nodes = Array.isArray(mapData.nodes) ? mapData.nodes : [];
  if (nodes.length === 0) {
    errors.push('Map data contains no nodes.');
  }

  const validNodeIdSet = new Set(nodes.map((n) => n.id));
  const sanitizedEdges = [];

  const rawEdges = Array.isArray(mapData.edges) ? mapData.edges : [];
  for (const [idx, edge] of rawEdges.entries()) {
    if (!edge || typeof edge !== 'object') {
      errors.push(`Edge at index ${idx} is not an object.`);
      continue;
    }

    if (!validNodeIdSet.has(edge.source)) {
      errors.push(`Edge at index ${idx} has invalid source "${edge.source}".`);
      continue;
    }
    if (!validNodeIdSet.has(edge.target)) {
      errors.push(`Edge at index ${idx} has invalid target "${edge.target}".`);
      continue;
    }
    if (edge.source === edge.target) {
      errors.push(`Edge at index ${idx} is an invalid self-loop.`);
      continue;
    }

    sanitizedEdges.push(edge);
  }

  return {
    valid: errors.length === 0,
    errors,
    sanitizedMapData: {
      ...mapData,
      nodes,
      edges: sanitizedEdges
    }
  };
}

/**
 * Synthesizes extracted concepts and relationships into a structured learning map graph
 * @param {Array<object>} concepts
 * @param {Array<object>} relationships
 * @param {object} [options]
 * @returns {Promise<{ nodes: Array<object>, edges: Array<object>, summaryStats: object, layoutConfig: object }>}
 */
export const generateLearningMap = async (concepts = [], relationships = [], options = {}) => {
  try {
    if (!Array.isArray(concepts) || concepts.length === 0) {
      return {
        nodes: [],
        edges: [],
        summaryStats: { nodeCount: 0, edgeCount: 0 },
        layoutConfig: { orientation: 'vertical', zoom: 1 }
      };
    }

    // Map concepts into unique graph nodes
    const rawNodes = concepts.map((concept, index) => {
      const id = concept.id || `node-${index + 1}-${concept.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
      const importance = concept.importance || 3;
      return {
        id,
        conceptId: concept.id || null,
        label: concept.name,
        description: concept.description || '',
        category: concept.category || 'General',
        importance,
        color: getCategoryColor(concept.category),
        size: 30 + importance * 8
      };
    });

    // Create lookup map by lowercase concept name for edge resolution
    const nodeNameMap = new Map();
    rawNodes.forEach((n) => {
      nodeNameMap.set(n.label.toLowerCase().trim(), n.id);
      if (n.conceptId) {
        nodeNameMap.set(n.conceptId, n.id);
      }
    });

    // Map relationships into graph edges with strict referential integrity
    const validNodeIdSet = new Set(rawNodes.map((n) => n.id));
    const edges = [];
    (relationships || []).forEach((rel, index) => {
      const sourceId =
        (rel.sourceConceptId && nodeNameMap.get(rel.sourceConceptId)) ||
        nodeNameMap.get(rel.sourceConcept?.name?.toLowerCase()?.trim()) ||
        nodeNameMap.get(rel.sourceConceptName?.toLowerCase()?.trim());
      const targetId =
        (rel.targetConceptId && nodeNameMap.get(rel.targetConceptId)) ||
        nodeNameMap.get(rel.targetConcept?.name?.toLowerCase()?.trim()) ||
        nodeNameMap.get(rel.targetConceptName?.toLowerCase()?.trim());

      // Only add edge if both source and target exist and are non-identical
      if (
        sourceId &&
        targetId &&
        sourceId !== targetId &&
        validNodeIdSet.has(sourceId) &&
        validNodeIdSet.has(targetId)
      ) {
        edges.push({
          id: rel.id || `edge-${index + 1}-${sourceId}-${targetId}`,
          relationshipId: rel.id || null,
          source: sourceId,
          target: targetId,
          label: rel.relationshipType?.replace(/_/g, ' ') || 'relates to',
          relationshipType: rel.relationshipType || 'relates_to',
          description: rel.description || '',
          weight: rel.weight || 1.0
        });
      }
    });

    // Calculate node coordinates
    const nodesWithLayout = computeInitialLayout(rawNodes, edges);

    const learningMapData = {
      nodes: nodesWithLayout,
      edges,
      summaryStats: {
        nodeCount: nodesWithLayout.length,
        edgeCount: edges.length,
        categories: [...new Set(nodesWithLayout.map((n) => n.category))]
      },
      layoutConfig: {
        orientation: 'hierarchical-top-down',
        defaultZoom: 1.0,
        backgroundColor: '#090d16'
      }
    };

    logger.info(`Generated learning map: ${nodesWithLayout.length} nodes, ${edges.length} edges.`);
    return learningMapData;
  } catch (error) {
    logger.error('Error synthesizing learning map:', error);
    throw error;
  }
};
