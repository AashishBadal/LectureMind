import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  Save,
  RotateCcw,
  Search,
  X,
  Tag,
  Sparkles,
  ArrowRight,
  GitFork,
  Check,
  RefreshCw,
  Eye,
  EyeOff,
  Download,
  BookOpen,
  Network,
  CheckCircle2,
  HelpCircle,
  Compass,
  Layers,
  ChevronRight
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

const CATEGORY_COLORS = {
  'core principle': {
    bg: '#4f46e5',
    border: '#818cf8',
    light: '#e0e7ff',
    text: '#c7d2fe',
    darkText: '#3730a3',
    badgeBgLight: '#eef2ff',
    badgeBorderLight: '#c7d2fe'
  },
  'mathematical model': {
    bg: '#0891b2',
    border: '#22d3ee',
    light: '#cffafe',
    text: '#a5f3fc',
    darkText: '#155e75',
    badgeBgLight: '#ecfeff',
    badgeBorderLight: '#a5f3fc'
  },
  'algorithm': {
    bg: '#059669',
    border: '#34d399',
    light: '#d1fae5',
    text: '#a7f3d0',
    darkText: '#065f46',
    badgeBgLight: '#f0fdf4',
    badgeBorderLight: '#a7f3d0'
  },
  'architectural component': {
    bg: '#7c3aed',
    border: '#a78bfa',
    light: '#ede9fe',
    text: '#ddd6fe',
    darkText: '#5b21b6',
    badgeBgLight: '#f5f3ff',
    badgeBorderLight: '#ddd6fe'
  },
  'practical tool': {
    bg: '#d97706',
    border: '#fbbf24',
    light: '#fef3c7',
    text: '#fde68a',
    darkText: '#92400e',
    badgeBgLight: '#fffbeb',
    badgeBorderLight: '#fde68a'
  },
  'historical precedent': {
    bg: '#db2777',
    border: '#f472b6',
    light: '#fce7f3',
    text: '#fbcfe8',
    darkText: '#9d174d',
    badgeBgLight: '#fdf2f8',
    badgeBorderLight: '#fbcfe8'
  },
  'general': {
    bg: '#475569',
    border: '#94a3b8',
    light: '#f1f5f9',
    text: '#cbd5e1',
    darkText: '#334155',
    badgeBgLight: '#f8fafc',
    badgeBorderLight: '#cbd5e1'
  }
};

function getNodeColors(category = '') {
  const normalized = (category || '').toLowerCase().trim();
  for (const [key, val] of Object.entries(CATEGORY_COLORS)) {
    if (normalized.includes(key)) return val;
  }
  return CATEGORY_COLORS.general;
}

/**
 * Wraps long concept names into up to 2 lines for clean SVG readability
 */
function wrapNodeLabel(label, maxCharsPerLine = 14) {
  if (!label) return ['Concept'];
  const trimmed = label.trim();
  if (trimmed.length <= maxCharsPerLine) return [trimmed];

  const words = trimmed.split(/\s+/);
  if (words.length === 1) {
    return [trimmed.slice(0, maxCharsPerLine - 1) + '…'];
  }

  const line1Words = [];
  const line2Words = [];
  let currentLen = 0;

  for (const word of words) {
    if (line2Words.length > 0) {
      line2Words.push(word);
    } else if (currentLen + word.length + (line1Words.length ? 1 : 0) <= maxCharsPerLine) {
      line1Words.push(word);
      currentLen += word.length + 1;
    } else {
      line2Words.push(word);
    }
  }

  const line1 = line1Words.join(' ');
  let line2 = line2Words.join(' ');
  if (line2.length > maxCharsPerLine) {
    line2 = line2.slice(0, maxCharsPerLine - 1) + '…';
  }

  return [line1, line2];
}

export default function LearningMapCanvas({
  mapData,
  onSaveLayout,
  isSaving = false,
  onRegenerate,
  isRegenerating = false
}) {
  const containerRef = useRef(null);
  const svgRef = useRef(null);
  const initialNodesRef = useRef(null);
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  // Local state for interactive positioning
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [pan, setPan] = useState({ x: 50, y: 50 });
  const [zoom, setZoom] = useState(0.95);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  // View Mode: 'GRAPH' (Interactive Visual DAG) | 'ROADMAP' (Sequential Guided Syllabus)
  const [viewMode, setViewMode] = useState('GRAPH');

  // Mastery Tracking (Study Checklist)
  const [masteredNodeIds, setMasteredNodeIds] = useState(() => {
    try {
      const saved = localStorage.getItem('lecturemind-mastered-nodes');
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch {
      return new Set();
    }
  });

  // Relationship labels visibility
  const [showRelationshipLabels, setShowRelationshipLabels] = useState(true);

  // Focus Learning Pathway toggle (Highlights prerequisite chain + unlocks)
  const [focusPathwayMode, setFocusPathwayMode] = useState(true);

  // Dragging state for nodes
  const [draggingNodeId, setDraggingNodeId] = useState(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isDirty, setIsDirty] = useState(false);

  // Selection & Filtering
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [hoveredNodeId, setHoveredNodeId] = useState(null);
  const [hoveredEdgeId, setHoveredEdgeId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [saveSuccessMsg, setSaveSuccessMsg] = useState('');

  // Persist mastered nodes
  const toggleMastered = (nodeId) => {
    setMasteredNodeIds((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      try {
        localStorage.setItem('lecturemind-mastered-nodes', JSON.stringify(Array.from(next)));
      } catch {}
      return next;
    });
  };

  // Sync props to state and cache initial coordinates
  useEffect(() => {
    if (mapData?.nodes) {
      setNodes(mapData.nodes);
      if (!initialNodesRef.current) {
        initialNodesRef.current = JSON.parse(JSON.stringify(mapData.nodes));
      }
    }
    if (mapData?.edges) {
      setEdges(mapData.edges);
    }
    setIsDirty(false);
  }, [mapData]);

  // Safe layout reset
  const handleResetLayout = () => {
    if (initialNodesRef.current) {
      setNodes(JSON.parse(JSON.stringify(initialNodesRef.current)));
      setIsDirty(true);
      setSaveSuccessMsg('Layout reset to default positions. Click "Save Layout" to preserve.');
      setTimeout(() => setSaveSuccessMsg(''), 3500);
    }
  };

  // Export current map canvas as SVG
  const handleExportSvg = () => {
    if (!svgRef.current) return;
    try {
      const svgEl = svgRef.current;
      const serializer = new XMLSerializer();
      let source = serializer.serializeToString(svgEl);

      if (!source.match(/^<svg[^>]+xmlns="http\:\/\/www\.w3\.org\/2000\/svg"/)) {
        source = source.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
      }

      const blob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'LectureMind_LearningMap.svg';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export SVG error:', err);
    }
  };

  // Derive unique categories from nodes
  const categories = useMemo(() => {
    const cats = new Set(nodes.map((n) => n.category || 'General'));
    return ['ALL', ...Array.from(cats)];
  }, [nodes]);

  // Selected node object
  const selectedNode = useMemo(() => {
    return nodes.find((n) => n.id === selectedNodeId) || null;
  }, [nodes, selectedNodeId]);

  // Active focus node
  const activeFocusNodeId = selectedNodeId || hoveredNodeId;

  // Prerequisite nodes (ancestors leading directly into active node)
  const prerequisiteNodeIds = useMemo(() => {
    if (!activeFocusNodeId) return new Set();
    const set = new Set();
    edges.forEach((e) => {
      if (e.target === activeFocusNodeId) {
        set.add(e.source);
      }
    });
    return set;
  }, [edges, activeFocusNodeId]);

  // Subsequent nodes (descendants that build upon active node)
  const subsequentNodeIds = useMemo(() => {
    if (!activeFocusNodeId) return new Set();
    const set = new Set();
    edges.forEach((e) => {
      if (e.source === activeFocusNodeId) {
        set.add(e.target);
      }
    });
    return set;
  }, [edges, activeFocusNodeId]);

  // Connected edges for the active node
  const connectedEdgeIds = useMemo(() => {
    if (!activeFocusNodeId) return new Set();
    const ids = new Set();
    edges.forEach((e) => {
      if (e.source === activeFocusNodeId || e.target === activeFocusNodeId) {
        ids.add(e.id);
      }
    });
    return ids;
  }, [edges, activeFocusNodeId]);

  const connectedNodeIds = useMemo(() => {
    if (!activeFocusNodeId) return new Set();
    const ids = new Set([activeFocusNodeId]);
    prerequisiteNodeIds.forEach((id) => ids.add(id));
    subsequentNodeIds.forEach((id) => ids.add(id));
    return ids;
  }, [activeFocusNodeId, prerequisiteNodeIds, subsequentNodeIds]);

  // Quick lookup map for nodes by id
  const nodeMap = useMemo(() => {
    const m = new Map();
    nodes.forEach((n) => m.set(n.id, n));
    return m;
  }, [nodes]);

  // Filter matching nodes by search and category
  const matchingNodeIds = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const hasQuery = query.length > 0;
    const hasCat = selectedCategory !== 'ALL';

    if (!hasQuery && !hasCat) return null;

    const matchSet = new Set();
    nodes.forEach((n) => {
      const matchText =
        !hasQuery ||
        n.label.toLowerCase().includes(query) ||
        (n.description && n.description.toLowerCase().includes(query)) ||
        (n.category && n.category.toLowerCase().includes(query));

      const matchCategory =
        !hasCat || (n.category || 'General').toLowerCase() === selectedCategory.toLowerCase();

      if (matchText && matchCategory) {
        matchSet.add(n.id);
      }
    });
    return matchSet;
  }, [nodes, searchQuery, selectedCategory]);

  // Group nodes into sequential roadmap tiers for Guided Syllabus View
  const roadmapTiers = useMemo(() => {
    if (!nodes.length) return [];

    const inDegreeMap = new Map();
    nodes.forEach((n) => inDegreeMap.set(n.id, 0));
    edges.forEach((e) => {
      if (inDegreeMap.has(e.target)) {
        inDegreeMap.set(e.target, (inDegreeMap.get(e.target) || 0) + 1);
      }
    });

    const tier1 = [];
    const tier2 = [];
    const tier3 = [];

    nodes.forEach((node) => {
      const inDegree = inDegreeMap.get(node.id) || 0;
      const importance = node.importance || 3;
      const cat = (node.category || '').toLowerCase();

      if (inDegree === 0 || cat.includes('principle') || cat.includes('precedent')) {
        tier1.push(node);
      } else if (inDegree <= 2 || importance <= 3) {
        tier2.push(node);
      } else {
        tier3.push(node);
      }
    });

    tier1.sort((a, b) => (b.importance || 3) - (a.importance || 3));
    tier2.sort((a, b) => (b.importance || 3) - (a.importance || 3));
    tier3.sort((a, b) => (b.importance || 3) - (a.importance || 3));

    const tiers = [];
    if (tier1.length) {
      tiers.push({
        id: 'tier-1',
        title: 'Step 1: Foundational Principles & Prerequisites',
        description: 'Start here. Core definitions and conceptual foundations that build the bedrock for the topic.',
        nodes: tier1,
        colorClass: 'border-blue-500/30 bg-blue-500/5 text-blue-700 dark:text-blue-300'
      });
    }
    if (tier2.length) {
      tiers.push({
        id: 'tier-2',
        title: 'Step 2: Core Frameworks & Mechanisms',
        description: 'Intermediate models and algorithmic processes that connect foundational theories together.',
        nodes: tier2,
        colorClass: 'border-purple-500/30 bg-purple-500/5 text-purple-700 dark:text-purple-300'
      });
    }
    if (tier3.length) {
      tiers.push({
        id: 'tier-3',
        title: 'Step 3: Advanced Applications & Practical Synthesis',
        description: 'High-level synthesis, specialized tools, and advanced paradigms applied in real-world scenarios.',
        nodes: tier3,
        colorClass: 'border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300'
      });
    }
    return tiers;
  }, [nodes, edges]);

  // Camera focus on a specific node
  const handleFocusNode = useCallback((nodeId) => {
    setSelectedNodeId(nodeId);
    const target = nodeMap.get(nodeId);
    if (target && containerRef.current) {
      const w = containerRef.current.clientWidth || 900;
      const h = containerRef.current.clientHeight || 700;
      const targetX = target.x ?? target.position?.x ?? 0;
      const targetY = target.y ?? target.position?.y ?? 0;
      setPan({
        x: w / 2 - targetX * zoom,
        y: h / 2 - targetY * zoom
      });
    }
  }, [nodeMap, zoom]);

  // Switch to graph view and focus node
  const handleInspectInGraph = (nodeId) => {
    setViewMode('GRAPH');
    setTimeout(() => {
      handleFocusNode(nodeId);
    }, 50);
  };

  // PANNING HANDLERS
  const handleMouseDownCanvas = (e) => {
    if (e.button !== 0) return;
    if (e.target.tagName !== 'svg' && !e.target.classList.contains('canvas-background')) {
      return;
    }
    setIsPanning(true);
    setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  // NODE DRAGGING HANDLERS
  const handleMouseDownNode = (e, node) => {
    e.stopPropagation();
    if (e.button !== 0) return;

    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();

    const currentX = node.x ?? node.position?.x ?? 0;
    const currentY = node.y ?? node.position?.y ?? 0;

    const mouseCanvasX = (e.clientX - rect.left - pan.x) / zoom;
    const mouseCanvasY = (e.clientY - rect.top - pan.y) / zoom;

    setDraggingNodeId(node.id);
    setDragOffset({
      x: mouseCanvasX - currentX,
      y: mouseCanvasY - currentY
    });
  };

  // GLOBAL MOUSE MOVE
  const handleMouseMove = useCallback(
    (e) => {
      if (isPanning) {
        setPan({
          x: e.clientX - panStart.x,
          y: e.clientY - panStart.y
        });
        return;
      }

      if (draggingNodeId) {
        const svg = svgRef.current;
        if (!svg) return;
        const rect = svg.getBoundingClientRect();

        const mouseCanvasX = (e.clientX - rect.left - pan.x) / zoom;
        const mouseCanvasY = (e.clientY - rect.top - pan.y) / zoom;

        const newX = Math.round(mouseCanvasX - dragOffset.x);
        const newY = Math.round(mouseCanvasY - dragOffset.y);

        setNodes((prev) =>
          prev.map((n) => {
            if (n.id === draggingNodeId) {
              return {
                ...n,
                x: newX,
                y: newY,
                position: { x: newX, y: newY }
              };
            }
            return n;
          })
        );
        setIsDirty(true);
      }
    },
    [isPanning, panStart, draggingNodeId, pan.x, pan.y, zoom, dragOffset]
  );

  // GLOBAL MOUSE UP
  const handleMouseUp = useCallback(() => {
    if (isPanning) setIsPanning(false);
    if (draggingNodeId) setDraggingNodeId(null);
  }, [isPanning, draggingNodeId]);

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  // ZOOM ON WHEEL
  const handleWheel = (e) => {
    e.preventDefault();
    const zoomFactor = 1.1;
    const minZoom = 0.35;
    const maxZoom = 2.4;

    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();

    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    let newZoom = e.deltaY < 0 ? zoom * zoomFactor : zoom / zoomFactor;
    newZoom = Math.min(maxZoom, Math.max(minZoom, newZoom));

    const newPanX = mouseX - ((mouseX - pan.x) / zoom) * newZoom;
    const newPanY = mouseY - ((mouseY - pan.y) / zoom) * newZoom;

    setZoom(newZoom);
    setPan({ x: newPanX, y: newPanY });
  };

  const handleZoomIn = () => {
    setZoom((prev) => Math.min(2.4, prev * 1.2));
  };

  const handleZoomOut = () => {
    setZoom((prev) => Math.max(0.35, prev / 1.2));
  };

  const handleFitView = () => {
    if (nodes.length === 0 || !containerRef.current) return;
    const minX = Math.min(...nodes.map((n) => n.x ?? 0));
    const maxX = Math.max(...nodes.map((n) => n.x ?? 0));
    const minY = Math.min(...nodes.map((n) => n.y ?? 0));
    const maxY = Math.max(...nodes.map((n) => n.y ?? 0));

    const contentWidth = maxX - minX + 260;
    const contentHeight = maxY - minY + 220;

    const containerWidth = containerRef.current.clientWidth || 900;
    const containerHeight = containerRef.current.clientHeight || 650;

    const fitZoom = Math.min(
      containerWidth / contentWidth,
      containerHeight / contentHeight,
      1.1
    );

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    setZoom(fitZoom);
    setPan({
      x: containerWidth / 2 - centerX * fitZoom,
      y: containerHeight / 2 - centerY * fitZoom
    });
  };

  // SAVE LAYOUT
  const handleSaveLayoutClick = async () => {
    if (!onSaveLayout) return;
    const updatedMapData = {
      ...mapData,
      nodes,
      edges
    };
    await onSaveLayout(updatedMapData);
    setIsDirty(false);
    setSaveSuccessMsg('Layout saved successfully!');
    setTimeout(() => setSaveSuccessMsg(''), 3000);
  };

  // Calculate mastery stats
  const masteredCount = useMemo(() => {
    return nodes.filter((n) => masteredNodeIds.has(n.id)).length;
  }, [nodes, masteredNodeIds]);

  const masteryPercent = nodes.length ? Math.round((masteredCount / nodes.length) * 100) : 0;

  return (
    <div
      ref={containerRef}
      className="relative w-full h-[740px] rounded-lg bg-slate-50 dark:bg-[#12131c] border border-gray-200 dark:border-[#282a3c] overflow-hidden select-none flex flex-col transition-colors shadow-sm"
    >
      {/* Top Header & Control Toolbar */}
      <div className="absolute top-3.5 left-3.5 right-3.5 z-20 flex flex-wrap items-center justify-between gap-2.5 pointer-events-none">
        {/* Left Controls: View Switcher, Search, and Category */}
        <div className="flex items-center gap-2 pointer-events-auto flex-wrap">
          {/* View Mode Toggle (Graph vs Roadmap) */}
          <div className="flex items-center bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-0.5 shadow-sm">
            <button
              onClick={() => setViewMode('GRAPH')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                viewMode === 'GRAPH'
                  ? 'bg-teal-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Network className="h-3.5 w-3.5" />
              <span>Interactive Graph</span>
            </button>
            <button
              onClick={() => setViewMode('ROADMAP')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                viewMode === 'ROADMAP'
                  ? 'bg-teal-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Compass className="h-3.5 w-3.5" />
              <span>Study Roadmap</span>
            </button>
          </div>

          {/* Search Input */}
          <div className="flex items-center bg-white dark:bg-[#1c1e2b] px-2.5 py-1 rounded-lg border border-gray-200 dark:border-[#2f3248] shadow-sm">
            <Search className="h-3.5 w-3.5 text-gray-400 dark:text-gray-500 mr-2 shrink-0 pointer-events-none" />
            <input
              id="input-search-learning-map"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search concept..."
              className="py-1 text-xs bg-transparent text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none w-32 sm:w-44"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 ml-1"
                title="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Category Filter Pills (Graph View only) */}
          {viewMode === 'GRAPH' && (
            <div className="hidden lg:flex items-center gap-1 bg-white/80 dark:bg-[#1c1e2b]/80 backdrop-blur-sm p-1 rounded-lg border border-gray-200 dark:border-[#2f3248] max-w-[280px] overflow-x-auto scrollbar-none">
              {categories.slice(0, 4).map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-2 py-0.5 rounded text-[11px] font-medium whitespace-nowrap transition-colors ${
                    selectedCategory === cat
                      ? 'bg-teal-600 text-white shadow-xs'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-[#252839]'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right Controls: Save, Zoom, Labels, Export */}
        <div className="flex items-center gap-2 pointer-events-auto flex-wrap justify-end">
          {isDirty && (
            <button
              id="btn-save-learning-map-layout"
              onClick={handleSaveLayoutClick}
              disabled={isSaving}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-teal-600 hover:bg-teal-700 text-white shadow-sm transition-all animate-pulse"
            >
              <Save className="h-3.5 w-3.5" />
              <span>{isSaving ? 'Saving...' : 'Save Layout'}</span>
            </button>
          )}

          {saveSuccessMsg && (
            <div className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-teal-50 dark:bg-teal-950/50 text-teal-800 dark:text-teal-300 border border-teal-200 dark:border-teal-800 flex items-center gap-1.5 shadow-sm">
              <Check className="h-3.5 w-3.5" />
              <span>{saveSuccessMsg}</span>
            </div>
          )}

          {viewMode === 'GRAPH' && (
            <>
              {/* Zoom Controls */}
              <div className="flex items-center bg-white dark:bg-[#1c1e2b] rounded-lg border border-gray-200 dark:border-[#2f3248] p-0.5 shadow-sm">
                <button
                  onClick={handleZoomIn}
                  title="Zoom In"
                  className="p-1.5 rounded text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-[#252839] transition-colors"
                >
                  <ZoomIn className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={handleZoomOut}
                  title="Zoom Out"
                  className="p-1.5 rounded text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-[#252839] transition-colors"
                >
                  <ZoomOut className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={handleFitView}
                  title="Center & Fit View"
                  className="p-1.5 rounded text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-[#252839] transition-colors"
                >
                  <Maximize2 className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Relationship Labels Toggle */}
              <button
                onClick={() => setShowRelationshipLabels((prev) => !prev)}
                title={showRelationshipLabels ? 'Hide Relationship Labels' : 'Show Relationship Labels'}
                className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border shadow-sm transition-colors ${
                  showRelationshipLabels
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/50'
                    : 'bg-white dark:bg-[#1c1e2b] text-gray-600 dark:text-gray-400 border-gray-200 dark:border-[#2f3248]'
                }`}
              >
                {showRelationshipLabels ? <Eye className="h-3.5 w-3.5 text-emerald-700 dark:text-emerald-400" /> : <EyeOff className="h-3.5 w-3.5" />}
                <span className="hidden sm:inline">{showRelationshipLabels ? 'Labels' : 'Labels Off'}</span>
              </button>

              {/* Reset Layout */}
              <button
                onClick={handleResetLayout}
                title="Reset node positions"
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-white dark:bg-[#1c1e2b] text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-[#252839] border border-gray-200 dark:border-[#2f3248] shadow-sm transition-colors"
              >
                <RotateCcw className="h-3.5 w-3.5 text-gray-400 dark:text-gray-500" />
                <span className="hidden sm:inline">Reset</span>
              </button>

              {/* Export SVG */}
              <button
                onClick={handleExportSvg}
                title="Export visual learning map as SVG"
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-white dark:bg-[#1c1e2b] text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-[#252839] border border-gray-200 dark:border-[#2f3248] shadow-sm transition-colors"
              >
                <Download className="h-3.5 w-3.5 text-gray-400" />
                <span className="hidden sm:inline">Export</span>
              </button>
            </>
          )}

          {onRegenerate && (
            <button
              onClick={onRegenerate}
              disabled={isRegenerating}
              title="Re-compute layout using AI"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-white dark:bg-[#1c1e2b] text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 border border-gray-200 dark:border-[#2f3248] shadow-sm transition-colors"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isRegenerating ? 'animate-spin text-emerald-600' : ''}`} />
              <span className="hidden md:inline">Re-layout</span>
            </button>
          )}
        </div>
      </div>

      {/* VIEW 1: INTERACTIVE GRAPH CANVAS */}
      {viewMode === 'GRAPH' && (
        <>
          <svg
            ref={svgRef}
            className="w-full h-full cursor-grab active:cursor-grabbing canvas-background"
            onMouseDown={handleMouseDownCanvas}
            onWheel={handleWheel}
          >
            <defs>
              {/* Subtle Adaptable Grid Pattern */}
              <pattern id="canvas-grid" width="36" height="36" patternUnits="userSpaceOnUse">
                <path
                  d="M 36 0 L 0 0 0 36"
                  fill="none"
                  stroke={isDark ? '#232638' : '#e2e8f0'}
                  strokeWidth="0.75"
                  strokeOpacity={isDark ? '0.45' : '0.6'}
                />
                <circle
                  cx="0"
                  cy="0"
                  r="1.2"
                  fill={isDark ? '#3b415a' : '#cbd5e1'}
                  fillOpacity={isDark ? '0.5' : '0.8'}
                />
              </pattern>

              {/* Edge Arrowhead Markers */}
              <marker
                id="arrowhead-normal"
                viewBox="0 -5 10 10"
                refX="32"
                refY="0"
                markerWidth="6"
                markerHeight="6"
                orient="auto"
              >
                <path d="M0,-4L9,0L0,4" fill={isDark ? '#64748b' : '#94a3b8'} />
              </marker>

              <marker
                id="arrowhead-highlight"
                viewBox="0 -5 10 10"
                refX="32"
                refY="0"
                markerWidth="7"
                markerHeight="7"
                orient="auto"
              >
                <path d="M0,-4L9,0L0,4" fill={isDark ? '#c084fc' : '#7c3aed'} />
              </marker>

              <marker
                id="arrowhead-prereq"
                viewBox="0 -5 10 10"
                refX="32"
                refY="0"
                markerWidth="7"
                markerHeight="7"
                orient="auto"
              >
                <path d="M0,-4L9,0L0,4" fill={isDark ? '#38bdf8' : '#0284c7'} />
              </marker>

              <marker
                id="arrowhead-unlock"
                viewBox="0 -5 10 10"
                refX="32"
                refY="0"
                markerWidth="7"
                markerHeight="7"
                orient="auto"
              >
                <path d="M0,-4L9,0L0,4" fill={isDark ? '#34d399' : '#059669'} />
              </marker>

              {/* Soft Drop Shadow Filters */}
              <filter id="node-shadow-light" x="-30%" y="-30%" width="160%" height="160%">
                <feDropShadow dx="0" dy="3" stdDeviation="4" floodColor="#0f172a" floodOpacity="0.12" />
              </filter>
              <filter id="node-glow-selected" x="-50%" y="-50%" width="200%" height="200%">
                <feDropShadow dx="0" dy="0" stdDeviation="8" floodColor={isDark ? '#c084fc' : '#7c3aed'} floodOpacity="0.75" />
              </filter>
              <filter id="node-glow-prereq" x="-50%" y="-50%" width="200%" height="200%">
                <feDropShadow dx="0" dy="0" stdDeviation="7" floodColor={isDark ? '#38bdf8' : '#0284c7'} floodOpacity="0.75" />
              </filter>
              <filter id="node-glow-unlock" x="-50%" y="-50%" width="200%" height="200%">
                <feDropShadow dx="0" dy="0" stdDeviation="7" floodColor={isDark ? '#34d399' : '#059669'} floodOpacity="0.75" />
              </filter>
            </defs>

            {/* Background Canvas Grid */}
            <rect
              width="100%"
              height="100%"
              fill={isDark ? '#12131c' : '#f8fafc'}
              className="canvas-background"
            />
            <rect
              width="100%"
              height="100%"
              fill="url(#canvas-grid)"
              className="canvas-background pointer-events-none"
            />

            {/* Transformed Content */}
            <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
              {/* 1. EDGES LAYER */}
              <g className="edges-layer">
                {edges.map((edge) => {
                  const sourceNode = nodeMap.get(edge.source);
                  const targetNode = nodeMap.get(edge.target);
                  if (!sourceNode || !targetNode) return null;

                  const sx = sourceNode.x ?? sourceNode.position?.x ?? 0;
                  const sy = sourceNode.y ?? sourceNode.position?.y ?? 0;
                  const tx = targetNode.x ?? targetNode.position?.x ?? 0;
                  const ty = targetNode.y ?? targetNode.position?.y ?? 0;

                  const dx = tx - sx;
                  const dy = ty - sy;
                  const cx = (sx + tx) / 2 - dy * 0.12;
                  const cy = (sy + ty) / 2 + dx * 0.12;

                  const isEdgeHighlighted =
                    connectedEdgeIds.has(edge.id) || hoveredEdgeId === edge.id;

                  const isPrereqEdge = selectedNodeId && edge.target === selectedNodeId;
                  const isUnlockEdge = selectedNodeId && edge.source === selectedNodeId;

                  const isFaded =
                    (matchingNodeIds &&
                      (!matchingNodeIds.has(edge.source) || !matchingNodeIds.has(edge.target))) ||
                    (focusPathwayMode && activeFocusNodeId && !isEdgeHighlighted);

                  let strokeColor = isDark ? '#475569' : '#cbd5e1';
                  let strokeWidth = 1.6;
                  let marker = 'url(#arrowhead-normal)';

                  if (isPrereqEdge) {
                    strokeColor = isDark ? '#38bdf8' : '#0284c7';
                    strokeWidth = 2.8;
                    marker = 'url(#arrowhead-prereq)';
                  } else if (isUnlockEdge) {
                    strokeColor = isDark ? '#34d399' : '#059669';
                    strokeWidth = 2.8;
                    marker = 'url(#arrowhead-unlock)';
                  } else if (isEdgeHighlighted) {
                    strokeColor = isDark ? '#c084fc' : '#7c3aed';
                    strokeWidth = 2.6;
                    marker = 'url(#arrowhead-highlight)';
                  }

                  return (
                    <g
                      key={edge.id}
                      className="transition-opacity duration-200"
                      style={{ opacity: isFaded ? 0.12 : 0.95 }}
                      onMouseEnter={() => setHoveredEdgeId(edge.id)}
                      onMouseLeave={() => setHoveredEdgeId(null)}
                    >
                      <path
                        d={`M ${sx} ${sy} Q ${cx} ${cy} ${tx} ${ty}`}
                        fill="none"
                        stroke={strokeColor}
                        strokeWidth={strokeWidth}
                        markerEnd={marker}
                        className="cursor-pointer transition-colors"
                      />

                      {/* Relationship Label Pill */}
                      {showRelationshipLabels && (
                        <g transform={`translate(${cx}, ${cy})`}>
                          <rect
                            x="-42"
                            y="-12"
                            width="84"
                            height="24"
                            rx="8"
                            fill={isDark ? '#191c2b' : '#ffffff'}
                            stroke={strokeColor}
                            strokeWidth={isEdgeHighlighted ? '1.5' : '1'}
                            filter={isDark ? 'none' : 'url(#node-shadow-light)'}
                            className="cursor-pointer"
                          />
                          <text
                            textAnchor="middle"
                            dominantBaseline="middle"
                            fill={
                              isPrereqEdge
                                ? (isDark ? '#7dd3fc' : '#0369a1')
                                : isUnlockEdge
                                ? (isDark ? '#6ee7b7' : '#047857')
                                : isEdgeHighlighted
                                ? (isDark ? '#e9d5ff' : '#6d28d9')
                                : (isDark ? '#cbd5e1' : '#334155')
                            }
                            fontSize="9.5"
                            fontWeight="600"
                            className="cursor-pointer select-none"
                          >
                            {edge.label || edge.relationshipType?.replace(/_/g, ' ') || 'relates to'}
                          </text>
                        </g>
                      )}
                    </g>
                  );
                })}
              </g>

              {/* 2. NODES LAYER */}
              <g className="nodes-layer">
                {nodes.map((node) => {
                  const x = node.x ?? node.position?.x ?? 0;
                  const y = node.y ?? node.position?.y ?? 0;
                  const importance = node.importance || 3;
                  const radius = 32 + importance * 3.5;

                  const isSelected = selectedNodeId === node.id;
                  const isHovered = hoveredNodeId === node.id;
                  const isPrereq = prerequisiteNodeIds.has(node.id);
                  const isSubsequent = subsequentNodeIds.has(node.id);
                  const isConnected = connectedNodeIds.has(node.id);
                  const isMatchedBySearch = matchingNodeIds ? matchingNodeIds.has(node.id) : true;
                  const isMastered = masteredNodeIds.has(node.id);

                  const isDimmed =
                    (matchingNodeIds && !isMatchedBySearch) ||
                    (focusPathwayMode && activeFocusNodeId && !isConnected && !isSelected);

                  const colorScheme = getNodeColors(node.category);
                  const labelLines = wrapNodeLabel(node.label, 14);

                  // Disc Styling
                  const discFill = isDark ? '#141726' : '#ffffff';
                  let discStroke = isDark ? colorScheme.border : colorScheme.bg;
                  let filterId = isDark ? 'none' : 'url(#node-shadow-light)';

                  if (isSelected) {
                    discStroke = isDark ? '#c084fc' : '#7c3aed';
                    filterId = 'url(#node-glow-selected)';
                  } else if (isPrereq) {
                    discStroke = isDark ? '#38bdf8' : '#0284c7';
                    filterId = 'url(#node-glow-prereq)';
                  } else if (isSubsequent) {
                    discStroke = isDark ? '#34d399' : '#059669';
                    filterId = 'url(#node-glow-unlock)';
                  }

                  const tintFill = isDark ? colorScheme.bg : colorScheme.light;
                  const tintOpacity = isDark ? 0.25 : 0.45;
                  const labelFill = isDark ? '#ffffff' : '#0f172a';
                  const categoryFill = isDark ? colorScheme.text : colorScheme.darkText;

                  return (
                    <g
                      key={node.id}
                      id={`map-node-${node.id}`}
                      transform={`translate(${x}, ${y})`}
                      onMouseDown={(e) => handleMouseDownNode(e, node)}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedNodeId((prev) => (prev === node.id ? null : node.id));
                      }}
                      onMouseEnter={() => setHoveredNodeId(node.id)}
                      onMouseLeave={() => setHoveredNodeId(null)}
                      className="cursor-grab active:cursor-grabbing transition-opacity duration-200 group"
                      style={{ opacity: isDimmed ? 0.18 : 1 }}
                    >
                      {/* Active / Prereq Focus Outer Ring */}
                      {(isSelected || isPrereq || isSubsequent) && (
                        <circle
                          r={radius + 8}
                          fill="none"
                          stroke={
                            isSelected
                              ? (isDark ? '#c084fc' : '#7c3aed')
                              : isPrereq
                              ? (isDark ? '#38bdf8' : '#0284c7')
                              : (isDark ? '#34d399' : '#059669')
                          }
                          strokeWidth="2.2"
                          strokeDasharray="5 4"
                          className="animate-spin"
                          style={{ animationDuration: '10s' }}
                        />
                      )}

                      {/* Main Node Background Disc */}
                      <circle
                        r={radius}
                        fill={discFill}
                        stroke={discStroke}
                        strokeWidth={isSelected ? 3.5 : isPrereq || isSubsequent ? 3 : 2}
                        filter={filterId}
                        className="transition-all"
                      />

                      {/* Inner Tint Layer */}
                      <circle
                        r={radius - 2.5}
                        fill={tintFill}
                        fillOpacity={tintOpacity}
                      />

                      {/* Top Rim Badge: Importance Stars & Pathway Tag */}
                      <g transform={`translate(0, ${-radius + 8})`}>
                        <rect
                          x="-22"
                          y="-8"
                          width="44"
                          height="16"
                          rx="8"
                          fill={isDark ? '#0f111a' : '#ffffff'}
                          stroke={isDark ? colorScheme.border : '#cbd5e1'}
                          strokeWidth="0.8"
                        />
                        <text
                          textAnchor="middle"
                          dominantBaseline="middle"
                          fill={isDark ? '#fde047' : '#b45309'}
                          fontSize="9.5"
                          fontWeight="700"
                        >
                          ★ {importance}/5
                        </text>
                      </g>

                      {/* Concept Label (Wrapped into 1 or 2 lines for high readability) */}
                      {labelLines.length === 1 ? (
                        <text
                          textAnchor="middle"
                          dominantBaseline="middle"
                          fill={labelFill}
                          fontSize="11.5"
                          fontWeight="700"
                          className="select-none pointer-events-none"
                        >
                          {labelLines[0]}
                        </text>
                      ) : (
                        <g className="select-none pointer-events-none">
                          <text
                            y="-6"
                            textAnchor="middle"
                            dominantBaseline="middle"
                            fill={labelFill}
                            fontSize="11"
                            fontWeight="700"
                          >
                            {labelLines[0]}
                          </text>
                          <text
                            y="8"
                            textAnchor="middle"
                            dominantBaseline="middle"
                            fill={labelFill}
                            fontSize="11"
                            fontWeight="700"
                          >
                            {labelLines[1]}
                          </text>
                        </g>
                      )}

                      {/* Sub-label: Category Pill */}
                      <text
                        y={radius - 12}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fill={categoryFill}
                        fontSize="8.5"
                        fontWeight="600"
                        className="select-none pointer-events-none uppercase tracking-wider"
                      >
                        {node.category || 'Concept'}
                      </text>

                      {/* Mastered Badge Indicator (Green Checkmark) */}
                      {isMastered && (
                        <g transform={`translate(${radius - 8}, ${radius - 8})`}>
                          <circle r="9" fill="#10b981" stroke="#ffffff" strokeWidth="1.5" />
                          <path
                            d="M -3.5 0 L -1 2.5 L 3.5 -2"
                            fill="none"
                            stroke="#ffffff"
                            strokeWidth="1.6"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </g>
                      )}

                      {/* Pathway Role Tag (When Node Selected) */}
                      {selectedNodeId && (isPrereq || isSubsequent) && (
                        <g transform={`translate(0, ${radius + 14})`}>
                          <rect
                            x="-36"
                            y="-9"
                            width="72"
                            height="18"
                            rx="9"
                            fill={isPrereq ? '#0284c7' : '#059669'}
                          />
                          <text
                            textAnchor="middle"
                            dominantBaseline="middle"
                            fill="#ffffff"
                            fontSize="8.5"
                            fontWeight="700"
                            className="uppercase tracking-wider"
                          >
                            {isPrereq ? 'Prerequisite' : 'Unlocks'}
                          </text>
                        </g>
                      )}
                    </g>
                  );
                })}
              </g>
            </g>
          </svg>

          {/* Bottom Learning Bar & Progress */}
          <div className="absolute bottom-3.5 left-4 right-4 z-10 flex items-center justify-between pointer-events-none flex-wrap gap-2 text-xs">
            {/* Left Status Bar */}
            <div className="bg-white/95 dark:bg-[#151724]/95 border border-gray-200 dark:border-[#2a2d40] px-3.5 py-2 rounded-lg shadow-sm flex items-center gap-3.5 pointer-events-auto backdrop-blur-sm">
              <span className="flex items-center gap-1.5 font-medium text-gray-800 dark:text-zinc-200">
                <Tag className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
                <span>{nodes.length} Concepts</span>
              </span>

              <span className="h-3 w-px bg-gray-200 dark:bg-gray-700"></span>

              <span className="flex items-center gap-1.5 font-medium text-gray-800 dark:text-zinc-200">
                <GitFork className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400" />
                <span>{edges.length} Relationships</span>
              </span>

              <span className="h-3 w-px bg-gray-200 dark:bg-gray-700 hidden sm:block"></span>

              {/* Study Progress Indicator */}
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                <span className="text-gray-700 dark:text-zinc-300 font-medium text-xs">
                  Mastered: {masteredCount} / {nodes.length} ({masteryPercent}%)
                </span>
                <div className="w-16 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden hidden md:block">
                  <div
                    className="h-full bg-emerald-600 transition-all duration-300"
                    style={{ width: `${masteryPercent}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Right Zoom & Pathway Legend */}
            <div className="flex items-center gap-2 pointer-events-auto">
              {selectedNodeId && (
                <div className="bg-white/95 dark:bg-[#151724]/95 border border-gray-200 dark:border-[#2a2d40] px-3 py-1.5 rounded-lg shadow-sm text-[11px] font-medium flex items-center gap-2.5 backdrop-blur-sm">
                  <span className="flex items-center gap-1 text-sky-700 dark:text-sky-300">
                    <span className="w-2 h-2 rounded-full bg-sky-500 inline-block" />
                    <span>Prerequisite</span>
                  </span>
                  <span>→</span>
                  <span className="flex items-center gap-1 text-purple-700 dark:text-purple-300 font-bold">
                    <span className="w-2 h-2 rounded-full bg-purple-500 inline-block" />
                    <span>Active Topic</span>
                  </span>
                  <span>→</span>
                  <span className="flex items-center gap-1 text-emerald-700 dark:text-emerald-300">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                    <span>Unlocks</span>
                  </span>
                </div>
              )}

              <div className="bg-white/95 dark:bg-[#151724]/95 border border-gray-200 dark:border-[#2a2d40] px-2.5 py-1.5 rounded-lg text-gray-700 dark:text-zinc-300 font-mono text-xs shadow-sm backdrop-blur-sm">
                {Math.round(zoom * 100)}%
              </div>
            </div>
          </div>
        </>
      )}

      {/* VIEW 2: GUIDED SYLLABUS ROADMAP (Step-by-Step Learning Timeline) */}
      {viewMode === 'ROADMAP' && (
        <div className="w-full h-full overflow-y-auto p-5 sm:p-7 pt-16 space-y-8 bg-slate-50/50 dark:bg-[#12131c]">
          {/* Roadmap Header */}
          <div className="max-w-4xl mx-auto space-y-2 text-center pt-2">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center justify-center gap-2">
              <Compass className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              <span>Step-by-Step Concept Roadmap</span>
            </h3>
            <p className="text-xs text-gray-600 dark:text-gray-400 max-w-xl mx-auto">
              Follow this structured sequence synthesized from prerequisite relationships. Learn foundational principles first, then advance through core models to culminating applications.
            </p>
          </div>

          {/* Tiered Step Cards */}
          <div className="max-w-4xl mx-auto space-y-6">
            {roadmapTiers.map((tier) => (
              <div
                key={tier.id}
                className="bg-white dark:bg-[#181a28] border border-gray-200 dark:border-[#2c3048] rounded-xl p-5 sm:p-6 shadow-sm space-y-4"
              >
                {/* Step Header */}
                <div className="border-b border-gray-100 dark:border-[#262a40] pb-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h4 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 font-bold text-xs flex items-center justify-center border border-emerald-300 dark:border-emerald-800">
                        {tier.id === 'tier-1' ? '1' : tier.id === 'tier-2' ? '2' : '3'}
                      </span>
                      <span>{tier.title}</span>
                    </h4>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      {tier.description}
                    </p>
                  </div>
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-gray-100 dark:bg-[#252839] text-gray-700 dark:text-gray-300 self-start sm:self-auto shrink-0">
                    {tier.nodes.length} {tier.nodes.length === 1 ? 'topic' : 'topics'}
                  </span>
                </div>

                {/* Grid of Concept Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  {tier.nodes.map((node) => {
                    const isMastered = masteredNodeIds.has(node.id);
                    const colorScheme = getNodeColors(node.category);

                    const incomingEdges = edges.filter((e) => e.target === node.id);
                    const outgoingEdges = edges.filter((e) => e.source === node.id);

                    return (
                      <div
                        key={node.id}
                        className={`p-4 rounded-lg border transition-all flex flex-col justify-between space-y-3 ${
                          isMastered
                            ? 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-300 dark:border-emerald-800/60'
                            : 'bg-gray-50/70 dark:bg-[#1d2032] border-gray-200 dark:border-[#2b2f48] hover:border-gray-300 dark:hover:border-[#3d4366]'
                        }`}
                      >
                        <div className="space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <span
                              className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border"
                              style={{
                                backgroundColor: isDark ? `${colorScheme.bg}25` : colorScheme.badgeBgLight,
                                borderColor: isDark ? colorScheme.border : colorScheme.badgeBorderLight,
                                color: isDark ? colorScheme.text : colorScheme.darkText
                              }}
                            >
                              {node.category || 'Concept'}
                            </span>

                            <div className="flex items-center gap-1 text-[11px] font-bold text-amber-600 dark:text-amber-400">
                              <span>★ {node.importance || 3}/5</span>
                            </div>
                          </div>

                          <h5 className="text-sm font-bold text-gray-900 dark:text-white leading-snug">
                            {node.label}
                          </h5>

                          <p className="text-xs text-gray-600 dark:text-gray-300 line-clamp-3 leading-relaxed">
                            {node.description || 'Core concept extracted from lecture analysis.'}
                          </p>
                        </div>

                        {/* Prerequisites & Consequences Badges */}
                        <div className="space-y-2 pt-2 border-t border-gray-200/60 dark:border-[#2b2f48]">
                          {incomingEdges.length > 0 && (
                            <div className="text-[11px] text-gray-500 dark:text-gray-400 flex items-center gap-1.5 flex-wrap">
                              <span className="font-semibold text-sky-700 dark:text-sky-400">Prerequisites:</span>
                              {incomingEdges.slice(0, 2).map((e) => {
                                const src = nodeMap.get(e.source);
                                return src ? (
                                  <span key={e.id} className="bg-sky-50 dark:bg-sky-950/50 text-sky-800 dark:text-sky-300 px-1.5 py-0.5 rounded text-[10px] border border-sky-200 dark:border-sky-900">
                                    {src.label}
                                  </span>
                                ) : null;
                              })}
                            </div>
                          )}

                          {outgoingEdges.length > 0 && (
                            <div className="text-[11px] text-gray-500 dark:text-gray-400 flex items-center gap-1.5 flex-wrap">
                              <span className="font-semibold text-emerald-700 dark:text-emerald-400">Leads to:</span>
                              {outgoingEdges.slice(0, 2).map((e) => {
                                const trg = nodeMap.get(e.target);
                                return trg ? (
                                  <span key={e.id} className="bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 px-1.5 py-0.5 rounded text-[10px] border border-emerald-200 dark:border-emerald-900">
                                    {trg.label}
                                  </span>
                                ) : null;
                              })}
                            </div>
                          )}

                          {/* Action Buttons: Mastery & Inspect in Graph */}
                          <div className="flex items-center justify-between gap-2 pt-2">
                            <button
                              onClick={() => toggleMastered(node.id)}
                              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-semibold transition-colors ${
                                isMastered
                                  ? 'bg-emerald-600 text-white shadow-xs'
                                  : 'bg-white dark:bg-[#252839] text-gray-700 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-[#2e3247] border border-gray-200 dark:border-[#383d58]'
                              }`}
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              <span>{isMastered ? 'Mastered' : 'Mark Mastered'}</span>
                            </button>

                            <button
                              onClick={() => handleInspectInGraph(node.id)}
                              className="inline-flex items-center gap-1 text-xs text-indigo-700 dark:text-indigo-400 hover:underline font-medium"
                            >
                              <span>Inspect in Graph</span>
                              <ArrowRight className="h-3 w-3" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* INTERACTIVE CONCEPT DETAIL SIDE DRAWER (Available in Graph View) */}
      {selectedNode && viewMode === 'GRAPH' && (
        <div
          id="learning-map-node-drawer"
          className="absolute top-14 right-3 w-84 max-w-[92vw] max-h-[82%] bg-white dark:bg-[#161826] border border-gray-200 dark:border-[#2b2f48] rounded-xl p-5 shadow-2xl z-30 flex flex-col justify-between overflow-y-auto scrollbar-none animate-in slide-in-from-right-4 duration-200 transition-colors"
        >
          <div className="space-y-4">
            {/* Header with Close */}
            <div className="flex items-start justify-between gap-2 border-b border-gray-100 dark:border-[#262a40] pb-3.5">
              <div>
                <span
                  className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border"
                  style={{
                    backgroundColor: isDark ? `${getNodeColors(selectedNode.category).bg}25` : getNodeColors(selectedNode.category).badgeBgLight,
                    borderColor: isDark ? getNodeColors(selectedNode.category).border : getNodeColors(selectedNode.category).badgeBorderLight,
                    color: isDark ? getNodeColors(selectedNode.category).text : getNodeColors(selectedNode.category).darkText
                  }}
                >
                  {selectedNode.category || 'General'}
                </span>
                <h4 className="text-base font-bold text-gray-900 dark:text-white mt-1.5 leading-snug">
                  {selectedNode.label}
                </h4>
              </div>
              <button
                onClick={() => setSelectedNodeId(null)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-[#252839] transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Importance Rating & Mastery Action */}
            <div className="flex items-center justify-between text-xs bg-gray-50 dark:bg-[#1d2032] p-3 rounded-xl border border-gray-200 dark:border-[#2a2e48]">
              <div>
                <span className="text-gray-500 dark:text-gray-400 text-[11px] block">Importance Weight</span>
                <div className="flex items-center gap-1 font-bold text-amber-600 dark:text-amber-400 mt-0.5">
                  <span>{selectedNode.importance || 3}/5</span>
                  <span>•</span>
                  <span className="text-[11px] font-medium text-gray-600 dark:text-gray-300">
                    {selectedNode.importance >= 4 ? 'Core Fundamental' : 'Key Topic'}
                  </span>
                </div>
              </div>

              <button
                onClick={() => toggleMastered(selectedNode.id)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold shadow-xs transition-colors ${
                  masteredNodeIds.has(selectedNode.id)
                    ? 'bg-emerald-600 text-white'
                    : 'bg-white dark:bg-[#282d46] text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-[#383d5c] hover:bg-gray-100'
                }`}
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>{masteredNodeIds.has(selectedNode.id) ? 'Mastered' : 'Mark Mastered'}</span>
              </button>
            </div>

            {/* Grounded Academic Description */}
            <div className="space-y-1.5">
              <span className="text-[10px] uppercase font-bold tracking-wider text-gray-400 dark:text-gray-500">
                Definition & Context
              </span>
              <p className="text-xs text-gray-700 dark:text-zinc-200 leading-relaxed bg-gray-50 dark:bg-[#1a1d2c] p-3 rounded-xl border border-gray-200 dark:border-[#282c42]">
                {selectedNode.description || 'Core concept extracted and mapped from lecture recordings.'}
              </p>
            </div>

            {/* Prerequisites (What to study before this) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[11px]">
                <span className="uppercase font-bold tracking-wider text-sky-700 dark:text-sky-400 flex items-center gap-1">
                  <span>Prerequisites (Learn Before This)</span>
                  <span>({edges.filter((e) => e.target === selectedNode.id).length})</span>
                </span>
              </div>
              <div className="space-y-1.5">
                {edges
                  .filter((e) => e.target === selectedNode.id)
                  .map((e) => {
                    const source = nodeMap.get(e.source);
                    if (!source) return null;
                    return (
                      <button
                        key={e.id}
                        onClick={() => handleFocusNode(source.id)}
                        className="w-full text-left p-2.5 rounded-lg bg-sky-50/70 dark:bg-sky-950/20 hover:bg-sky-100 dark:hover:bg-sky-950/40 border border-sky-200 dark:border-sky-900/40 transition-all flex items-center justify-between group"
                      >
                        <div className="truncate">
                          <span className="text-xs font-semibold text-sky-900 dark:text-sky-200 group-hover:underline">
                            {source.label}
                          </span>
                          <span className="text-[10px] text-sky-700 dark:text-sky-400 block truncate">
                            {e.label}
                          </span>
                        </div>
                        <ArrowRight className="h-3 w-3 text-sky-600 dark:text-sky-400 shrink-0 ml-2" />
                      </button>
                    );
                  })}
                {edges.filter((e) => e.target === selectedNode.id).length === 0 && (
                  <p className="text-xs text-gray-500 italic p-2 rounded-lg bg-gray-50 dark:bg-[#1a1d2c]">
                    Foundational concept. No incoming prerequisite dependencies required.
                  </p>
                )}
              </div>
            </div>

            {/* Outgoing Connections (What this unlocks) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[11px]">
                <span className="uppercase font-bold tracking-wider text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                  <span>Unlocks Next (Consequences)</span>
                  <span>({edges.filter((e) => e.source === selectedNode.id).length})</span>
                </span>
              </div>
              <div className="space-y-1.5">
                {edges
                  .filter((e) => e.source === selectedNode.id)
                  .map((e) => {
                    const target = nodeMap.get(e.target);
                    if (!target) return null;
                    return (
                      <button
                        key={e.id}
                        onClick={() => handleFocusNode(target.id)}
                        className="w-full text-left p-2.5 rounded-lg bg-emerald-50/70 dark:bg-emerald-950/20 hover:bg-emerald-100 dark:hover:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/40 transition-all flex items-center justify-between group"
                      >
                        <div className="truncate">
                          <span className="text-xs font-semibold text-emerald-900 dark:text-emerald-200 group-hover:underline">
                            {target.label}
                          </span>
                          <span className="text-[10px] text-emerald-700 dark:text-emerald-400 block truncate">
                            {e.label}
                          </span>
                        </div>
                        <ArrowRight className="h-3 w-3 text-emerald-600 dark:text-emerald-400 shrink-0 ml-2" />
                      </button>
                    );
                  })}
                {edges.filter((e) => e.source === selectedNode.id).length === 0 && (
                  <p className="text-xs text-gray-500 italic p-2 rounded-lg bg-gray-50 dark:bg-[#1a1d2c]">
                    Culminating outcome or terminal practical application.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
