import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  getLectureByIdApi,
  deleteLectureApi,
  getTranscriptApi,
  updateTranscriptApi,
  analyzeLectureApi,
  getLectureSummaryApi,
  getLectureConceptsApi,
  extractRelationshipsApi,
  getLectureRelationshipsApi,
  getLearningMapApi,
  generateLearningMapApi,
  updateLearningMapApi,
  getBookmarksApi,
  createBookmarkApi,
  deleteBookmarkApi,
  exportLectureApi,
  chatWithLectureApi,
  getLectureAudioUrl
} from '../services/api';
import { useAuth } from '../context/AuthContext';
import PaymentModal from '../components/PaymentModal';
import LearningMapCanvas from '../components/LearningMapCanvas';
import AnalysisProgressBar from '../components/AnalysisProgressBar';
import {
  ArrowLeft,
  Network,
  FileText,
  Sparkles,
  Clock,
  Search,
  Edit3,
  Check,
  X,
  Loader2,
  AlertCircle,
  Volume2,
  User,
  Save,
  BookOpen,
  Tag,
  RefreshCw,
  ShieldCheck,
  Zap,
  GitFork,
  ArrowDown,
  ArrowRight,
  Filter,
  Layers,
  Bookmark,
  Trash2,
  ShieldAlert,
  CheckCircle2,
  Download,
  Highlighter,
  Printer,
  FileCode,
  Share2,
  MessageSquare,
  Bot,
  Send,
  AlignLeft,
  ListCollapse,
  Copy
} from 'lucide-react';

/**
 * Fallback parser to synthesize timestamped dialogue segments from plain text content
 */
function parseTextToSegments(content) {
  if (!content || typeof content !== 'string') return [];
  const rawBlocks = content
    .split(/\r?\n\s*\r?\n|\r?\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  if (rawBlocks.length === 0) return [];

  let currentStart = 0;
  return rawBlocks.map((text, idx) => {
    const wordCount = text.split(/\s+/).filter(Boolean).length;
    const duration = Math.max(5, Math.round((wordCount / 130) * 60));
    const end = currentStart + duration;

    let speaker = 'Lecturer';
    let cleanText = text;
    const speakerMatch = text.match(/^([A-Za-z0-9\s._-]{2,25}):\s+(.+)$/s);
    if (speakerMatch) {
      speaker = speakerMatch[1].trim();
      cleanText = speakerMatch[2].trim();
    }

    const seg = {
      start: currentStart,
      end,
      speaker,
      text: cleanText,
      originalIdx: idx
    };

    currentStart = end;
    return seg;
  });
}

/**
 * Formats inline text with bold, italic, code tokens, and removes rogue asterisks
 */
function renderInlineFormatted(text, isUser = false) {
  if (!text) return null;

  // Pattern matches **bold**, __bold__, `code`, *italic*, _italic_
  const pattern = /(\*\*[^*]+\*\*|__[^_]+__|`[^`]+`|\*[^*]+\*|_[^_]+_)/g;
  const parts = text.split(pattern);

  return parts.map((part, pIdx) => {
    if (!part) return null;

    if (
      (part.startsWith('**') && part.endsWith('**') && part.length >= 4) ||
      (part.startsWith('__') && part.endsWith('__') && part.length >= 4)
    ) {
      const inner = part.slice(2, -2);
      return (
        <strong
          key={pIdx}
          className={isUser ? 'font-bold text-white' : 'font-semibold text-gray-900 dark:text-white'}
        >
          {inner}
        </strong>
      );
    }

    if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
      const inner = part.slice(1, -1);
      return (
        <code
          key={pIdx}
          className={`px-1.5 py-0.5 rounded text-[12px] font-mono ${
            isUser
              ? 'bg-emerald-800 text-emerald-100'
              : 'bg-gray-100 dark:bg-[#2c2c2c] text-emerald-700 dark:text-emerald-300 border border-gray-200 dark:border-[#383838]'
          }`}
        >
          {inner}
        </code>
      );
    }

    if (
      (part.startsWith('*') && part.endsWith('*') && part.length >= 2) ||
      (part.startsWith('_') && part.endsWith('_') && part.length >= 2)
    ) {
      const inner = part.slice(1, -1);
      return (
        <em key={pIdx} className="italic">
          {inner}
        </em>
      );
    }

    // Clean up any remaining rogue unclosed asterisks
    const cleanPart = part.replace(/\*\*/g, '').replace(/^\*|\*$/g, '');
    return cleanPart;
  });
}

/**
 * Renders AI tutor and student messages with clean typography,
 * properly formatted bold tags, clean bullet/numbered lists, styled headings,
 * and subtle dividers instead of raw markdown asterisks and dashes.
 */
function CleanMessageContent({ content, isUser = false }) {
  if (!content || typeof content !== 'string') return null;

  const lines = content.split(/\r?\n/);
  const elements = [];
  let currentList = null; // { type: 'bullet' | 'number', items: [] }
  let elemKey = 0;

  const flushList = () => {
    if (currentList) {
      if (currentList.type === 'bullet') {
        elements.push(
          <ul key={elemKey++} className="space-y-1.5 my-2 pl-1">
            {currentList.items.map((item, idx) => (
              <li key={idx} className="flex items-start gap-2 text-sm leading-relaxed">
                <span
                  className={`text-xs font-bold mt-1 shrink-0 ${
                    isUser ? 'text-emerald-200' : 'text-emerald-600 dark:text-emerald-400'
                  }`}
                >
                  •
                </span>
                <span className="flex-1">{renderInlineFormatted(item, isUser)}</span>
              </li>
            ))}
          </ul>
        );
      } else {
        elements.push(
          <ol key={elemKey++} className="space-y-1.5 my-2 pl-1">
            {currentList.items.map((item, idx) => (
              <li key={idx} className="flex items-start gap-2 text-sm leading-relaxed">
                <span
                  className={`text-xs font-semibold mt-0.5 shrink-0 ${
                    isUser ? 'text-emerald-200' : 'text-emerald-600 dark:text-emerald-400'
                  }`}
                >
                  {idx + 1}.
                </span>
                <span className="flex-1">{renderInlineFormatted(item, isUser)}</span>
              </li>
            ))}
          </ol>
        );
      }
      currentList = null;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    if (!trimmed) {
      flushList();
      continue;
    }

    // 1. Horizontal divider (---, ***, ===, ___)
    if (/^[-*=_]{3,}$/.test(trimmed)) {
      flushList();
      elements.push(
        <hr
          key={elemKey++}
          className={`my-2.5 ${isUser ? 'border-emerald-600' : 'border-gray-200 dark:border-[#333333]'}`}
        />
      );
      continue;
    }

    // 2. Markdown Headings (# Heading, ## Heading, ### Heading)
    const headingMatch = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (headingMatch) {
      flushList();
      const level = headingMatch[1].length;
      const headingText = headingMatch[2];
      elements.push(
        <div
          key={elemKey++}
          className={`font-semibold tracking-tight ${
            level <= 2 ? 'text-base mt-3 mb-1' : 'text-sm mt-2.5 mb-1'
          } ${isUser ? 'text-white' : 'text-gray-900 dark:text-white'}`}
        >
          {renderInlineFormatted(headingText, isUser)}
        </div>
      );
      continue;
    }

    // 3. Bullet list items (* item, - item, + item, • item)
    const bulletMatch = trimmed.match(/^[\*\-+\u2022]\s+(.+)$/);
    if (bulletMatch) {
      if (!currentList || currentList.type !== 'bullet') {
        flushList();
        currentList = { type: 'bullet', items: [] };
      }
      currentList.items.push(bulletMatch[1]);
      continue;
    }

    // 4. Numbered list items (1. item, 2. item)
    const numberMatch = trimmed.match(/^\d+[\.\)]\s+(.+)$/);
    if (numberMatch) {
      if (!currentList || currentList.type !== 'number') {
        flushList();
        currentList = { type: 'number', items: [] };
      }
      currentList.items.push(numberMatch[1]);
      continue;
    }

    // 5. Standard paragraph text
    flushList();
    elements.push(
      <p key={elemKey++} className="leading-relaxed my-1 font-sans">
        {renderInlineFormatted(trimmed, isUser)}
      </p>
    );
  }

  flushList();

  return <div className="space-y-1 font-sans">{elements}</div>;
}

export default function LectureDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { credits, updateCredits } = useAuth();
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentModalReason, setPaymentModalReason] = useState('');

  const [lecture, setLecture] = useState(null);
  const [transcript, setTranscript] = useState(null);
  const [summary, setSummary] = useState(null);
  const [concepts, setConcepts] = useState([]);
  const [relationships, setRelationships] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Active navigation tab
  const [activeTab, setActiveTab] = useState('transcript'); // 'transcript' | 'summary' | 'concepts' | 'relationships' | 'map' | 'bookmarks'
  const [searchQuery, setSearchQuery] = useState('');
  const [conceptFilter, setConceptFilter] = useState('all'); // 'all' | 'high' | 'medium' | 'low'
  const [relationshipFilter, setRelationshipFilter] = useState('all'); // 'all' | type

  // Highlighting & Section Notes state (Part 10)
  const [highlights, setHighlights] = useState({}); // { [segmentIdx]: { color: 'amber', note?: string } }
  const [transcriptFilter, setTranscriptFilter] = useState('all'); // 'all' | 'highlighted' | 'notes'
  const [editingNoteSegmentIdx, setEditingNoteSegmentIdx] = useState(null);
  const [segmentNoteInput, setSegmentNoteInput] = useState('');

  // Export Modal state (Part 10)
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // Bookmarks state (Part 9)
  const [bookmarks, setBookmarks] = useState([]);
  const [activeSegmentForBookmark, setActiveSegmentForBookmark] = useState(null);
  const [bookmarkModalOpen, setBookmarkModalOpen] = useState(false);
  const [bookmarkTitle, setBookmarkTitle] = useState('');
  const [bookmarkNote, setBookmarkNote] = useState('');
  const [isSavingBookmark, setIsSavingBookmark] = useState(false);
  const [bookmarkError, setBookmarkError] = useState('');
  const [bookmarkSuccessMsg, setBookmarkSuccessMsg] = useState('');
  const [isDeletingBookmarkId, setIsDeletingBookmarkId] = useState(null);
  const [highlightedSegmentIndex, setHighlightedSegmentIndex] = useState(null);

  // Stale Analysis Warning & Pipeline Regeneration state (Part 9)
  const [showStaleWarning, setShowStaleWarning] = useState(false);
  const [isRegeneratingAll, setIsRegeneratingAll] = useState(false);
  const [regeneratingStep, setRegeneratingStep] = useState('');

  // Deletion modal state (Part 9)
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeletingLecture, setIsDeletingLecture] = useState(false);
  const [deleteLectureError, setDeleteLectureError] = useState('');

  // Edit Transcript Mode state
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState('');
  const [editedSegments, setEditedSegments] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState('');

  // Analysis state (Part 6)
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState('');
  const [analysisSuccessMsg, setAnalysisSuccessMsg] = useState('');
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [analysisStageIndex, setAnalysisStageIndex] = useState(0);
  const [analysisElapsedSeconds, setAnalysisElapsedSeconds] = useState(0);
  const [analysisIsComplete, setAnalysisIsComplete] = useState(false);

  // Relationships state (Part 7)
  const [isExtractingRelationships, setIsExtractingRelationships] = useState(false);
  const [relationshipError, setRelationshipError] = useState('');
  const [relationshipSuccessMsg, setRelationshipSuccessMsg] = useState('');

  // Learning Map state (Part 8)
  const [learningMap, setLearningMap] = useState(null);
  const [isGeneratingMap, setIsGeneratingMap] = useState(false);
  const [isSavingMapLayout, setIsSavingMapLayout] = useState(false);
  const [mapError, setMapError] = useState('');
  const [mapSuccessMsg, setMapSuccessMsg] = useState('');

  // Transcript View Mode ('segments' | 'fulltext')
  const [transcriptViewMode, setTranscriptViewMode] = useState('segments');
  const [copiedTranscript, setCopiedTranscript] = useState(false);

  // RAG Chat AI Tutor state
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [chatError, setChatError] = useState('');
  const chatMessagesEndRef = useRef(null);

  useEffect(() => {
    let isMounted = true;

    async function loadLectureData() {
      try {
        setLoading(true);
        setError('');

        const lectureData = await getLectureByIdApi(id);
        if (!isMounted) return;
        const currentLecture = lectureData?.lecture;
        setLecture(currentLecture);

        // Fetch transcript
        try {
          const transcriptData = await getTranscriptApi(id);
          if (isMounted && transcriptData?.transcript) {
            const tr = transcriptData.transcript;
            const segs = Array.isArray(tr.segments) && tr.segments.length > 0
              ? tr.segments
              : tr.content ? parseTextToSegments(tr.content) : [];
            setTranscript({ ...tr, segments: segs });
            setEditedContent(tr.content || '');
            setEditedSegments(segs);
          }
        } catch (tErr) {
          if (currentLecture?.transcript) {
            const tr = currentLecture.transcript;
            const segs = Array.isArray(tr.segments) && tr.segments.length > 0
              ? tr.segments
              : tr.content ? parseTextToSegments(tr.content) : [];
            setTranscript({ ...tr, segments: segs });
            setEditedContent(tr.content || '');
            setEditedSegments(segs);
          }
        }

        // Fetch summary if available
        try {
          const summaryData = await getLectureSummaryApi(id);
          if (isMounted && summaryData?.summary) {
            setSummary(summaryData.summary);
          }
        } catch (sErr) {
          if (currentLecture?.summary) {
            setSummary(currentLecture.summary);
          }
        }

        // Fetch concepts if available
        try {
          const conceptsData = await getLectureConceptsApi(id);
          if (isMounted && Array.isArray(conceptsData?.concepts)) {
            setConcepts(conceptsData.concepts);
          }
        } catch (cErr) {
          if (Array.isArray(currentLecture?.concepts)) {
            setConcepts(currentLecture.concepts);
          }
        }

        // Fetch relationships if available (Part 7)
        try {
          const relData = await getLectureRelationshipsApi(id);
          if (isMounted && Array.isArray(relData?.relationships)) {
            setRelationships(relData.relationships);
          }
        } catch (rErr) {
          if (Array.isArray(currentLecture?.relationships)) {
            setRelationships(currentLecture.relationships);
          }
        }

        // Fetch learning map if available (Part 8)
        try {
          const mapData = await getLearningMapApi(id);
          if (isMounted && mapData?.learningMap) {
            setLearningMap(mapData.learningMap);
          }
        } catch (mErr) {
          // Cleanly ignore if not yet generated
        }

        // Fetch bookmarks (Part 9)
        try {
          const bmData = await getBookmarksApi(id);
          if (isMounted && Array.isArray(bmData?.bookmarks)) {
            setBookmarks(bmData.bookmarks);
          }
        } catch (bErr) {
          if (Array.isArray(currentLecture?.bookmarks)) {
            setBookmarks(currentLecture.bookmarks);
          }
        }

        // Load persistent highlights (Part 10)
        try {
          const savedHl = localStorage.getItem(`lecturemind_highlights_${id}`);
          if (savedHl && isMounted) {
            setHighlights(JSON.parse(savedHl));
          }
        } catch (hErr) {
          // Cleanly ignore localStorage parse errors
        }

        // Check if transcript was modified after summary was generated
        const tUpdated = currentLecture?.transcript?.updatedAt;
        const sUpdated = currentLecture?.summary?.updatedAt;
        if (tUpdated && sUpdated && new Date(tUpdated).getTime() > new Date(sUpdated).getTime()) {
          if (isMounted) setShowStaleWarning(true);
        }
      } catch (err) {
        if (isMounted) {
          setError(err.message || 'Failed to load lecture details.');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    loadLectureData();
    return () => {
      isMounted = false;
    };
  }, [id]);

  // Trigger Gemini Lecture Analysis with real-time progressive stage tracking
  const handleRunAnalysis = async () => {
    try {
      setIsAnalyzing(true);
      setAnalysisError('');
      setAnalysisSuccessMsg('');
      setAnalysisProgress(8);
      setAnalysisStageIndex(0);
      setAnalysisElapsedSeconds(0);
      setAnalysisIsComplete(false);

      const startTime = Date.now();
      const progressTimer = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        setAnalysisElapsedSeconds(elapsed);

        // Smooth multi-stage analytical progression
        if (elapsed < 3) {
          // Stage 0: Grounding (8% -> 25%)
          setAnalysisStageIndex(0);
          setAnalysisProgress(Math.min(25, 8 + elapsed * 6));
        } else if (elapsed < 10) {
          // Stage 1: Synthesis (25% -> 55%)
          setAnalysisStageIndex(1);
          setAnalysisProgress(Math.min(55, 25 + (elapsed - 3) * 4.3));
        } else if (elapsed < 18) {
          // Stage 2: Concepts (55% -> 80%)
          setAnalysisStageIndex(2);
          setAnalysisProgress(Math.min(80, 55 + (elapsed - 10) * 3.1));
        } else {
          // Stage 3: Knowledge Map (80% -> 96%)
          setAnalysisStageIndex(3);
          setAnalysisProgress(Math.min(96, 80 + (elapsed - 18) * 1.5));
        }
      }, 500);

      try {
        const res = await analyzeLectureApi(id);
        clearInterval(progressTimer);
        setAnalysisProgress(100);
        setAnalysisStageIndex(3);
        setAnalysisIsComplete(true);

        if (res?.success) {
          if (res.summary) setSummary(res.summary);
          if (Array.isArray(res.concepts)) setConcepts(res.concepts);
          if (res.lecture) setLecture(res.lecture);
          if (res.credits !== undefined) updateCredits(res.credits);

          setAnalysisSuccessMsg('Lecture analysis completed! Academic summary & concepts extracted.');
          setTimeout(() => {
            setIsAnalyzing(false);
            setAnalysisIsComplete(false);
            setAnalysisSuccessMsg('');
            setActiveTab('summary');
          }, 800);
        } else {
          throw new Error(res?.error?.message || 'Analysis failed.');
        }
      } catch (innerErr) {
        clearInterval(progressTimer);
        throw innerErr;
      }
    } catch (err) {
      console.error('Lecture analysis error:', err);
      if (err?.status === 402 || err?.data?.error?.code === 'INSUFFICIENT_CREDITS') {
        setPaymentModalReason(err.message || 'Insufficient credits to analyze this lecture. Please top up with eSewa to proceed.');
        setShowPaymentModal(true);
      }
      setAnalysisError(err.message || 'Failed to analyze lecture transcript.');
      setIsAnalyzing(false);
      setAnalysisIsComplete(false);
    }
  };

  // Trigger Gemini Concept Relationship Extraction (Part 7)
  const handleExtractRelationships = async () => {
    try {
      setIsExtractingRelationships(true);
      setRelationshipError('');
      setRelationshipSuccessMsg('');

      const res = await extractRelationshipsApi(id);

      if (res?.success && Array.isArray(res.relationships)) {
        setRelationships(res.relationships);
        setRelationshipSuccessMsg(`Discovered and mapped ${res.relationships.length} conceptual relationships!`);
        setTimeout(() => setRelationshipSuccessMsg(''), 5000);
        setActiveTab('relationships');
      } else {
        throw new Error(res?.error?.message || 'Failed to extract relationships.');
      }
    } catch (err) {
      console.error('Relationship extraction error:', err);
      setRelationshipError(err.message || 'Failed to extract conceptual relationships.');
    } finally {
      setIsExtractingRelationships(false);
    }
  };

  // Generate or Regenerate Learning Map (Part 8)
  const handleGenerateLearningMap = async () => {
    if (concepts.length < 2) return;
    try {
      setIsGeneratingMap(true);
      setMapError('');
      setMapSuccessMsg('');

      const res = await generateLearningMapApi(id);

      if (res?.success && res.learningMap) {
        setLearningMap(res.learningMap);
        setMapSuccessMsg(`Smart Learning Map synthesized with ${res.learningMap.mapData?.nodes?.length || 0} nodes and ${res.learningMap.mapData?.edges?.length || 0} relationships!`);
        setTimeout(() => setMapSuccessMsg(''), 5000);
        setActiveTab('map');
      } else {
        throw new Error(res?.error?.message || 'Failed to generate learning map.');
      }
    } catch (err) {
      console.error('Learning map generation error:', err);
      setMapError(err.message || 'Failed to generate learning map.');
    } finally {
      setIsGeneratingMap(false);
    }
  };

  // Save Custom Node Coordinates (Part 8)
  const handleSaveMapLayout = async (updatedMapData) => {
    try {
      setIsSavingMapLayout(true);
      setMapError('');
      const res = await updateLearningMapApi(id, updatedMapData);
      if (res?.success && res.learningMap) {
        setLearningMap(res.learningMap);
      } else {
        throw new Error(res?.error?.message || 'Failed to update map layout.');
      }
    } catch (err) {
      console.error('Map layout update error:', err);
      setMapError(err.message || 'Failed to save map layout.');
      throw err;
    } finally {
      setIsSavingMapLayout(false);
    }
  };

  const handleSegmentChange = (idx, newText) => {
    const next = [...editedSegments];
    next[idx] = { ...next[idx], text: newText };
    setEditedSegments(next);
    setEditedContent(next.map((s) => s.text).join(' '));
  };

  const handleSpeakerChange = (idx, newSpeaker) => {
    const next = [...editedSegments];
    next[idx] = { ...next[idx], speaker: newSpeaker };
    setEditedSegments(next);
  };

  const handleSaveTranscript = async () => {
    try {
      setIsSaving(true);
      setSaveSuccessMsg('');
      setError('');

      const res = await updateTranscriptApi(id, {
        content: editedContent,
        segments: editedSegments
      });

      if (res?.success && res?.transcript) {
        const tr = res.transcript;
        const segs = Array.isArray(tr.segments) && tr.segments.length > 0
          ? tr.segments
          : tr.content ? parseTextToSegments(tr.content) : [];
        setTranscript({ ...tr, segments: segs });
        setEditedSegments(segs);
        setEditedContent(tr.content || '');
        setIsEditing(false);
        setSaveSuccessMsg('Transcript changes saved successfully!');
        setTimeout(() => setSaveSuccessMsg(''), 4000);

        // Indicate previously generated AI results may no longer match the edited transcript
        if (summary || concepts.length > 0 || learningMap) {
          setShowStaleWarning(true);
        }
      }
    } catch (err) {
      setError(err.message || 'Failed to save transcript.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setEditedContent(transcript?.content || '');
    setEditedSegments(resolvedSegments);
    setIsEditing(false);
  };

  // Initialize AI Tutor greeting when lecture loads
  useEffect(() => {
    if (lecture && chatMessages.length === 0) {
      setChatMessages([
        {
          id: 'welcome',
          role: 'assistant',
          content: `Hello! I am your AI Lecture Tutor for **${lecture.title || 'this lecture'}**.\n\nAsk me about this lecture. I search the transcript for relevant passages and show the source passages used for each answer.`,
          suggestedQuestions: [
            'Summarize this lecture',
            'What are the most important concepts discussed?',
            'Quiz me with 3 practice questions on this lecture'
          ],
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    }
  }, [lecture]);

  // Scroll chat messages to bottom on new messages
  useEffect(() => {
    if (activeTab === 'chat' && chatMessagesEndRef.current) {
      chatMessagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages, isChatLoading, activeTab]);

  // Handle sending a question in RAG chat
  const handleSendChatMessage = async (overrideText) => {
    const textToSend = typeof overrideText === 'string' ? overrideText.trim() : chatInput.trim();
    if (!textToSend || isChatLoading) return;

    setChatError('');
    setChatInput('');

    const userMsg = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: textToSend,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    const updatedHistory = [...chatMessages, userMsg];
    setChatMessages(updatedHistory);

    try {
      setIsChatLoading(true);

      const historyPayload = updatedHistory
        .slice(0, -1)
        .slice(-4)
        .map((m) => ({ role: m.role, content: m.content }));

      const res = await chatWithLectureApi(id, {
        message: textToSend,
        history: historyPayload
      });

      if (res?.success) {
        const assistantMsg = {
          id: `ai-${Date.now()}`,
          role: 'assistant',
          content: res.answer,
          citations: res.citations || [],
          suggestedQuestions: res.suggestedQuestions || [],
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        setChatMessages((prev) => [...prev, assistantMsg]);
      } else {
        throw new Error(res?.error?.message || 'Failed to get answer from AI Tutor.');
      }
    } catch (err) {
      console.error('Chat with lecture error:', err);
      setChatError(err.message || 'Failed to communicate with AI Tutor.');
    } finally {
      setIsChatLoading(false);
    }
  };

  // Click citation to navigate to transcript and highlight/scroll
  const handleCitationClick = (citation) => {
    setActiveTab('transcript');
    setTranscriptViewMode('segments');
    if (typeof citation.segmentIndex === 'number') {
      setHighlightedSegmentIndex(citation.segmentIndex);
      setTimeout(() => {
        const el = document.getElementById(`segment-${citation.segmentIndex}`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 150);
    } else if (citation.timestamp) {
      const parts = citation.timestamp.split(':').map(Number);
      const targetSec = (parts[0] || 0) * 60 + (parts[1] || 0);
      const matchIdx = resolvedSegments.findIndex(
        (seg) => typeof seg.start === 'number' && seg.start <= targetSec && seg.end >= targetSec
      );
      const targetIdx = matchIdx !== -1 ? matchIdx : 0;
      setHighlightedSegmentIndex(targetIdx);
      setTimeout(() => {
        const el = document.getElementById(`segment-${targetIdx}`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 150);
    }
  };

  // Copy full transcript text to clipboard
  const handleCopyTranscript = () => {
    const textToCopy = transcript?.content || resolvedSegments.map((s) => s.text).join('\n\n');
    if (textToCopy) {
      navigator.clipboard.writeText(textToCopy);
      setCopiedTranscript(true);
      setTimeout(() => setCopiedTranscript(false), 2000);
    }
  };

  // Controlled option to regenerate complete AI pipeline after transcript edits (Part 9)
  const handleRegenerateAllAnalysis = async () => {
    try {
      setIsRegeneratingAll(true);
      setAnalysisError('');
      setRelationshipError('');
      setMapError('');

      // Step 1: Re-analyze lecture (generates summary & concepts)
      setRegeneratingStep('Re-analyzing transcript & extracting updated concepts...');
      const analysisRes = await analyzeLectureApi(id);
      if (!analysisRes?.success) {
        throw new Error(analysisRes?.error?.message || 'Failed to re-analyze lecture.');
      }
      if (analysisRes.summary) setSummary(analysisRes.summary);
      if (Array.isArray(analysisRes.concepts)) setConcepts(analysisRes.concepts);
      if (analysisRes.lecture) setLecture(analysisRes.lecture);
      if (analysisRes.credits !== undefined) updateCredits(analysisRes.credits);

      // Step 2: Re-extract relationships if concepts >= 2
      const updatedConcepts = analysisRes.concepts || [];
      if (updatedConcepts.length >= 2) {
        setRegeneratingStep('Re-mapping conceptual relationships...');
        const relRes = await extractRelationshipsApi(id);
        if (relRes?.success && Array.isArray(relRes.relationships)) {
          setRelationships(relRes.relationships);

          // Step 3: Re-synthesize learning map
          setRegeneratingStep('Synthesizing updated interactive learning map...');
          const mapRes = await generateLearningMapApi(id);
          if (mapRes?.success && mapRes.learningMap) {
            setLearningMap(mapRes.learningMap);
          }
        }
      }

      setShowStaleWarning(false);
      setAnalysisSuccessMsg('Full AI pipeline regenerated successfully! Summary, concepts, relationships, and learning map are now synchronized with your edited transcript.');
      setTimeout(() => setAnalysisSuccessMsg(''), 6000);
    } catch (err) {
      console.error('Pipeline regeneration error:', err);
      if (err?.status === 402 || err?.data?.error?.code === 'INSUFFICIENT_CREDITS') {
        setPaymentModalReason(err.message || 'Insufficient credits to regenerate analysis. Please top up with eSewa to proceed.');
        setShowPaymentModal(true);
      }
      setAnalysisError(err.message || 'Failed to regenerate complete AI pipeline.');
    } finally {
      setIsRegeneratingAll(false);
      setRegeneratingStep('');
    }
  };

  // Bookmarking Handlers (Part 9)
  const handleOpenBookmarkModal = (seg, idx) => {
    setActiveSegmentForBookmark({ ...seg, index: idx });
    const timeFormatted = formatSeconds(seg.start);
    const snippet = seg.text ? seg.text.slice(0, 35) + '...' : 'Lecture Section';
    setBookmarkTitle(`Segment @ ${timeFormatted} — "${snippet}"`);
    setBookmarkNote('');
    setBookmarkError('');
    setBookmarkModalOpen(true);
  };

  const handleSaveBookmark = async () => {
    if (!activeSegmentForBookmark) return;
    try {
      setIsSavingBookmark(true);
      setBookmarkError('');

      const res = await createBookmarkApi(id, {
        title: bookmarkTitle.trim() || `Bookmark @ ${formatSeconds(activeSegmentForBookmark.start)}`,
        note: bookmarkNote.trim(),
        timestamp: activeSegmentForBookmark.start,
        transcriptPosition: activeSegmentForBookmark.index
      });

      if (res?.success && res.bookmark) {
        setBookmarks((prev) => [...prev, res.bookmark].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0)));
        setBookmarkModalOpen(false);
        setActiveSegmentForBookmark(null);
        setBookmarkSuccessMsg('Bookmark saved successfully!');
        setTimeout(() => setBookmarkSuccessMsg(''), 3500);
      } else {
        throw new Error(res?.error?.message || 'Failed to create bookmark.');
      }
    } catch (err) {
      setBookmarkError(err.message || 'Failed to save bookmark.');
    } finally {
      setIsSavingBookmark(false);
    }
  };

  const handleDeleteBookmark = async (bookmarkId) => {
    try {
      setIsDeletingBookmarkId(bookmarkId);
      await deleteBookmarkApi(id, bookmarkId);
      setBookmarks((prev) => prev.filter((b) => b.id !== bookmarkId));
    } catch (err) {
      console.error('Delete bookmark error:', err);
    } finally {
      setIsDeletingBookmarkId(null);
    }
  };

  const handleJumpToSegment = (bookmark) => {
    setActiveTab('transcript');
    setHighlightedSegmentIndex(bookmark.transcriptPosition);
    setTimeout(() => {
      const el = document.getElementById(`segment-${bookmark.transcriptPosition}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 150);
  };

  // Destructive Deletion Handler (Part 9)
  const handleConfirmDeleteLecture = async () => {
    try {
      setIsDeletingLecture(true);
      setDeleteLectureError('');
      await deleteLectureApi(id);
      navigate('/lectures');
    } catch (err) {
      console.error('Delete lecture error:', err);
      setDeleteLectureError(err.message || 'Failed to delete lecture.');
    } finally {
      setIsDeletingLecture(false);
    }
  };

  const formatSeconds = (sec) => {
    if (typeof sec !== 'number') return '00:00';
    const mins = Math.floor(sec / 60);
    const remainingSecs = Math.floor(sec % 60);
    return `${mins.toString().padStart(2, '0')}:${remainingSecs.toString().padStart(2, '0')}`;
  };

  // Highlighting & Section Note Handlers (Part 10)
  const toggleHighlight = (segIdx) => {
    setHighlights((prev) => {
      const next = { ...prev };
      if (next[segIdx]) {
        delete next[segIdx];
      } else {
        next[segIdx] = { color: 'amber', createdAt: Date.now() };
      }
      try {
        localStorage.setItem(`lecturemind_highlights_${id}`, JSON.stringify(next));
      } catch (e) {}
      return next;
    });
  };

  const handleSaveSegmentNote = (segIdx, note) => {
    setHighlights((prev) => {
      const next = {
        ...prev,
        [segIdx]: {
          ...(prev[segIdx] || { color: 'amber', createdAt: Date.now() }),
          note: note.trim()
        }
      };
      try {
        localStorage.setItem(`lecturemind_highlights_${id}`, JSON.stringify(next));
      } catch (e) {}
      return next;
    });
    setEditingNoteSegmentIdx(null);
    setSegmentNoteInput('');
  };

  // Export Utility Handlers (Part 10)
  const getSafeTitle = () => {
    return (lecture?.title || 'Lecture')
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .replace(/_+/g, '_');
  };

  const downloadBlob = (content, filename, mimeType) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleExportTranscriptTxt = () => {
    const segs = transcript?.segments || [];
    const dateFormatted = new Date(lecture?.createdAt || Date.now()).toLocaleDateString();
    let text = `LECTURE TRANSCRIPT: ${lecture?.title || 'Lecture'}\n`;
    text += `Date: ${dateFormatted}\n`;
    text += `Duration: ${lecture?.duration ? `${Math.round(lecture.duration / 60)} minutes` : 'Not specified'}\n`;
    text += `======================================================\n\n`;

    if (segs.length > 0) {
      segs.forEach((s) => {
        text += `[${formatSeconds(s.start)}] ${s.speaker || 'Speaker'}:\n${s.text}\n\n`;
      });
    } else {
      text += transcript?.content || '(No transcript content)';
    }

    downloadBlob(text, `${getSafeTitle()}_Transcript.txt`, 'text/plain;charset=utf-8');
  };

  const handleExportSummaryMd = () => {
    const dateFormatted = new Date(lecture?.createdAt || Date.now()).toLocaleDateString();
    let md = `# ${lecture?.title || 'Lecture'} — Executive Academic Summary\n\n`;
    md += `**Date:** ${dateFormatted}  \n`;
    md += `**Estimated Duration:** ${lecture?.duration ? `${Math.round(lecture.duration / 60)} minutes` : 'Standard'}  \n\n`;
    md += `---\n\n`;
    md += `## Executive Summary\n\n${summary?.content || 'No summary available.'}\n\n`;
    md += `## Key Concepts\n\n`;

    concepts.forEach((c) => {
      md += `### ${c.name} (${c.importance || 'Standard'})\n`;
      md += `${c.description || ''}\n\n`;
    });

    md += `---\n*Generated by LectureMind — AI-Based Smart Learning Map Generator*\n`;
    downloadBlob(md, `${getSafeTitle()}_Summary.md`, 'text/markdown;charset=utf-8');
  };

  const handleExportStudyGuideMd = () => {
    const dateFormatted = new Date(lecture?.createdAt || Date.now()).toLocaleDateString();
    let md = `# ${lecture?.title || 'Lecture'} — Academic Study Guide\n\n`;
    md += `**Date:** ${dateFormatted}  \n`;
    md += `**Duration:** ${lecture?.duration ? `${Math.round(lecture.duration / 60)} minutes` : 'Standard'}  \n\n`;
    md += `---\n\n`;
    md += `## 1. Executive Summary\n\n${summary?.content || 'No summary available.'}\n\n`;

    md += `## 2. Core Concepts\n\n`;
    concepts.forEach((c, idx) => {
      md += `### 2.${idx + 1}. ${c.name} [${c.importance || 'Standard'}]\n`;
      md += `${c.description || ''}\n\n`;
    });

    if (relationships.length > 0) {
      md += `## 3. Conceptual Relationships\n\n`;
      relationships.forEach((r) => {
        const src = r.sourceConcept?.name || 'Concept';
        const tgt = r.targetConcept?.name || 'Concept';
        md += `- **${src}** *[${(r.relationshipType || 'relates to').replace(/_/g, ' ')}]* -> **${tgt}**\n`;
        if (r.description) md += `  - *Context:* ${r.description}\n`;
      });
      md += `\n`;
    }

    if (bookmarks.length > 0) {
      md += `## 4. Bookmarked Sections & Notes\n\n`;
      bookmarks.forEach((b) => {
        md += `### [${formatSeconds(b.timestamp)}] ${b.title}\n`;
        if (b.note) md += `> ${b.note}\n\n`;
      });
    }

    md += `## 5. Dialogue Transcript\n\n`;
    (transcript?.segments || []).forEach((s, idx) => {
      const isHl = highlights[idx] ? ' ⭐ [STUDENT HIGHLIGHT]' : '';
      const hlNote = highlights[idx]?.note ? `\n> Student Note: ${highlights[idx].note}` : '';
      md += `**[${formatSeconds(s.start)}] ${s.speaker || 'Speaker'}**${isHl}:\n${s.text}${hlNote}\n\n`;
    });

    md += `---\n*Generated by LectureMind — AI-Based Smart Learning Map Generator*\n`;
    downloadBlob(md, `${getSafeTitle()}_StudyGuide.md`, 'text/markdown;charset=utf-8');
  };

  const handleExportJson = () => {
    const sanitized = {
      title: lecture?.title,
      date: new Date(lecture?.createdAt || Date.now()).toLocaleDateString(),
      durationSeconds: lecture?.duration,
      summary: summary?.content || null,
      concepts: concepts.map((c) => ({
        name: c.name,
        description: c.description,
        importance: c.importance
      })),
      relationships: relationships.map((r) => ({
        source: r.sourceConcept?.name || null,
        target: r.targetConcept?.name || null,
        relationshipType: r.relationshipType,
        description: r.description
      })),
      bookmarks: bookmarks.map((b) => ({
        title: b.title,
        timestamp: b.timestamp,
        note: b.note
      })),
      transcript: (transcript?.segments || []).map((s, idx) => ({
        start: s.start,
        end: s.end,
        speaker: s.speaker,
        text: s.text,
        isHighlighted: Boolean(highlights[idx]),
        studentNote: highlights[idx]?.note || null
      }))
    };

    downloadBlob(JSON.stringify(sanitized, null, 2), `${getSafeTitle()}_Dataset.json`, 'application/json;charset=utf-8');
  };

  const handlePrintStudyGuide = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const dateFormatted = new Date(lecture?.createdAt || Date.now()).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    const conceptsHtml = concepts
      .map(
        (c) => `
      <div style="margin-bottom: 12px; padding: 10px 14px; border: 1px solid #e2e8f0; border-radius: 8px; page-break-inside: avoid;">
        <div style="display: flex; justify-content: space-between; align-items: baseline;">
          <strong style="font-size: 13px; color: #0f172a;">${c.name}</strong>
          <span style="font-size: 10px; font-weight: bold; text-transform: uppercase; color: #4f46e5; background: #eef2ff; padding: 2px 8px; border-radius: 4px;">${c.importance || 'Standard'}</span>
        </div>
        <p style="margin: 6px 0 0 0; font-size: 12px; color: #334155; line-height: 1.5;">${c.description || ''}</p>
      </div>
    `
      )
      .join('');

    const relationshipsHtml = relationships
      .map(
        (r) => `
      <li style="margin-bottom: 6px; font-size: 12px; color: #1e293b;">
        <strong>${r.sourceConcept?.name || 'Concept'}</strong>
        <em style="color: #6366f1;"> [${(r.relationshipType || 'relates to').replace(/_/g, ' ')}] </em> &rarr;
        <strong>${r.targetConcept?.name || 'Concept'}</strong>
        ${r.description ? `<br><span style="color: #64748b; font-size: 11px;">${r.description}</span>` : ''}
      </li>
    `
      )
      .join('');

    const transcriptHtml = (transcript?.segments || [])
      .map((s, idx) => {
        const isHl = Boolean(highlights[idx]);
        const note = highlights[idx]?.note;
        return `
        <div style="margin-bottom: 8px; padding: 8px 12px; border-radius: 6px; ${
          isHl ? 'background: #fef9c3; border-left: 4px solid #eab308;' : 'border-bottom: 1px solid #f1f5f9;'
        } page-break-inside: avoid;">
          <div style="font-size: 11px; color: #64748b; font-family: monospace; margin-bottom: 2px;">
            [${formatSeconds(s.start)}] <strong>${s.speaker || 'Speaker'}</strong> ${
          isHl ? '<span style="color: #ca8a04; font-weight: bold; margin-left: 6px;">[HIGHLIGHTED]</span>' : ''
        }
          </div>
          <div style="font-size: 12px; color: #1e293b; line-height: 1.5;">${s.text}</div>
          ${note ? `<div style="margin-top: 4px; font-size: 11px; color: #854d0e; background: #fef08a; padding: 4px 8px; border-radius: 4px;"><strong>Note:</strong> ${note}</div>` : ''}
        </div>
      `;
      })
      .join('');

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>${lecture?.title || 'Lecture'} — Study Guide</title>
          <style>
            @media print {
              body { margin: 0; padding: 20px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #0f172a; }
              .no-print { display: none; }
            }
            body { margin: 0; padding: 36px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #0f172a; max-width: 820px; margin-left: auto; margin-right: auto; }
            h1 { font-size: 22px; color: #0f172a; margin-bottom: 4px; }
            h2 { font-size: 15px; color: #1e293b; border-bottom: 2px solid #e2e8f0; padding-bottom: 6px; margin-top: 24px; }
            .meta { font-size: 12px; color: #64748b; margin-bottom: 18px; }
            .summary-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 18px; font-size: 12px; line-height: 1.6; color: #1e293b; }
            .footer { margin-top: 36px; padding-top: 14px; border-top: 1px solid #e2e8f0; font-size: 11px; color: #94a3b8; text-align: center; }
          </style>
        </head>
        <body>
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px;">
            <div>
              <h1>${lecture?.title || 'Lecture Study Guide'}</h1>
              <div class="meta">
                Date: <strong>${dateFormatted}</strong> &bull; Estimated Duration: <strong>${lecture?.duration ? `${Math.round(lecture.duration / 60)} min` : 'Standard'}</strong>
              </div>
            </div>
            <button class="no-print" onclick="window.print()" style="padding: 8px 16px; font-size: 12px; font-weight: bold; background: #4f46e5; color: #fff; border: none; border-radius: 6px; cursor: pointer;">
              Print / Save PDF
            </button>
          </div>

          <h2>1. Executive Academic Summary</h2>
          <div class="summary-box">
            ${summary?.content || 'No summary generated yet.'}
          </div>

          <h2>2. Key Concepts (${concepts.length})</h2>
          ${conceptsHtml || '<p style="font-size: 12px; color: #64748b;">No concepts extracted.</p>'}

          ${
            relationships.length > 0
              ? `
            <h2>3. Conceptual Relationships (${relationships.length})</h2>
            <ul style="padding-left: 20px;">
              ${relationshipsHtml}
            </ul>
          `
              : ''
          }

          <h2>4. Dialogue Transcript & Student Highlights</h2>
          ${transcriptHtml || '<p style="font-size: 12px; color: #64748b;">No transcript dialogue recorded.</p>'}

          <div class="footer">
            Generated with LectureMind &mdash; AI-Based Smart Learning Map Generator &bull; Strictly Verified Academic Content
          </div>

          <script>
            window.onload = function() {
              window.print();
            }
          </script>
        </body>
      </html>
    `;

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
  };

  // Filter segments by search query AND transcriptFilter (All / Highlighted / Notes)
  const effectiveSegments = (isEditing ? editedSegments : transcript?.segments) || [];
  const resolvedSegments = effectiveSegments.length > 0
    ? effectiveSegments
    : transcript?.content
    ? parseTextToSegments(transcript.content)
    : [];

  const displayedSegments = resolvedSegments
    .map((seg, originalIdx) => ({ ...seg, originalIdx: seg.originalIdx ?? originalIdx }))
    .filter((seg) => {
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matches =
          seg.text?.toLowerCase().includes(query) ||
          seg.speaker?.toLowerCase().includes(query);
        if (!matches) return false;
      }

      if (transcriptFilter === 'highlighted') {
        return Boolean(highlights[seg.originalIdx]);
      }

      if (transcriptFilter === 'notes') {
        const hasHighlightNote = Boolean(highlights[seg.originalIdx]?.note);
        const hasBookmark = bookmarks.some((b) => b.transcriptPosition === seg.originalIdx);
        return hasHighlightNote || hasBookmark;
      }

      return true;
    });

  // Filter concepts by importance
  const filteredConcepts = concepts.filter((c) => {
    if (conceptFilter === 'all') return true;
    return (c.importance || '').toLowerCase() === conceptFilter.toLowerCase();
  });

  // Filter relationships by type
  const filteredRelationships = relationships.filter((rel) => {
    if (relationshipFilter === 'all') return true;
    return (rel.relationshipType || '').toLowerCase() === relationshipFilter.toLowerCase();
  });

  // Unique relationship types present in current lecture
  const existingRelTypes = Array.from(new Set(relationships.map((r) => r.relationshipType))).filter(Boolean);

  if (loading) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center space-y-3">
        <Loader2 className="h-8 w-8 text-brand-400 animate-spin" />
        <p className="text-xs text-gray-500 dark:text-gray-400 font-normal">Loading lecture and knowledge graph...</p>
      </div>
    );
  }

  if (error && !lecture) {
    return (
      <div className="max-w-md mx-auto py-12 text-center space-y-4">
        <AlertCircle className="h-10 w-10 text-rose-400 mx-auto" />
        <h2 className="text-xl font-bold text-white">Lecture Unavailable</h2>
        <p className="text-xs text-gray-500 dark:text-gray-400">{error}</p>
        <Link
          to="/lectures"
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-brand-600 text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Lectures</span>
        </Link>
      </div>
    );
  }

  const hasTranscript = Boolean(transcript?.content);
  const hasAnalysis = Boolean(summary?.content || concepts.length > 0);
  const canExtractRelationships = concepts.length >= 2;

  // Helper for relationship badge styling
  const getRelationBadgeStyle = (type) => {
    switch (type) {
      case 'causes':
      case 'leads_to':
        return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
      case 'depends_on':
      case 'prerequisite':
        return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
      case 'part_of':
      case 'contains':
      case 'subcategory':
        return 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30';
      case 'contrasts_with':
        return 'bg-rose-500/15 text-rose-300 border-rose-500/30';
      case 'example_of':
        return 'bg-purple-500/15 text-purple-300 border-purple-500/30';
      default:
        return 'bg-sky-500/15 text-sky-300 border-sky-500/30';
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="space-y-3">
        <Link
          to="/lectures"
          className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-100 transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Back to Lectures</span>
        </Link>

        {lecture?.storagePath && (
          <div className="rounded-lg border border-gray-200 dark:border-[#333333] bg-white dark:bg-[#171717] p-3 space-y-2">
            <p className="text-xs font-medium text-gray-700 dark:text-gray-300">Lecture audio</p>
            <audio controls preload="metadata" crossOrigin="use-credentials" src={getLectureAudioUrl(lecture.id)} className="w-full" />
          </div>
        )}

        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-semibold text-gray-900 dark:text-gray-100 tracking-tight">{lecture?.title}</h1>
            <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500 dark:text-gray-400 mt-1.5 font-normal">
              <span>Status: <strong className="text-brand-400">{lecture?.status}</strong></span>
              {lecture?.originalFileName && <span>&bull; File: {lecture.originalFileName}</span>}
              {lecture?.duration && <span>&bull; Duration: {formatSeconds(lecture.duration)}</span>}
              {concepts.length > 0 && <span>&bull; Concepts: {concepts.length}</span>}
              {relationships.length > 0 && <span>&bull; Relations: {relationships.length}</span>}
            </div>
          </div>

          {/* Action Controls */}
          <div className="flex items-center gap-2.5 flex-wrap">
            <span
              className={`px-2.5 py-0.5 rounded text-[11px] font-medium border ${
                lecture?.status === 'ANALYZED' || lecture?.status === 'COMPLETED'
                  ? 'badge-success'
                  : lecture?.status === 'ANALYZING'
                  ? 'badge-warning animate-pulse'
                  : lecture?.status === 'TRANSCRIBED'
                  ? 'badge-info'
                  : 'badge-neutral'
              }`}
            >
              {lecture?.status || 'PENDING'}
            </span>

            {/* Run Analysis Button */}
            {hasTranscript && (
              <button
                id="btn-analyze-lecture"
                onClick={handleRunAnalysis}
                disabled={isAnalyzing || isSaving}
                className={`btn ${
                  hasAnalysis ? 'btn-secondary' : 'btn-primary'
                }`}
              >
                {isAnalyzing ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-teal-400" />
                    <span>Analyzing ({Math.round(analysisProgress)}%)...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="h-3.5 w-3.5 text-brand-300" />
                    <span>
                      {hasAnalysis ? 'Re-analyze' : 'Analyze Lecture'} (
                      {lecture?.requiredCredits ||
                        Math.max(
                          1,
                          Math.ceil(
                            ((lecture?.duration || 600) / 60) / 10
                          )
                        )}{' '}
                      {(lecture?.requiredCredits ||
                        Math.max(
                          1,
                          Math.ceil(
                            ((lecture?.duration || 600) / 60) / 10
                          )
                        )) === 1
                        ? 'Credit'
                        : 'Credits'}
                      )
                    </span>
                  </>
                )}
              </button>
            )}

            {/* Extract Relationships Button (Part 7) */}
            {canExtractRelationships && (
              <button
                id="btn-extract-relationships"
                onClick={handleExtractRelationships}
                disabled={isExtractingRelationships || isAnalyzing || isSaving}
                className="btn-secondary"
              >
                {isExtractingRelationships ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-400" />
                    <span>Mapping Relations...</span>
                  </>
                ) : (
                  <>
                    <GitFork className="h-3.5 w-3.5 text-indigo-300" />
                    <span>{relationships.length > 0 ? 'Regenerate Relations' : 'Extract Relations'}</span>
                  </>
                )}
              </button>
            )}

            {/* Export Materials Button (Part 10) */}
            <button
              id="btn-open-export-modal"
              onClick={() => setExportModalOpen(true)}
              className="btn-secondary"
              title="Export lecture materials, summary, and learning map"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Export</span>
            </button>

            {/* Delete Lecture Button (Part 9) */}
            <button
              id="btn-delete-lecture-detail"
              onClick={() => setShowDeleteModal(true)}
              className="btn-danger-ghost"
              title="Delete this lecture session"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Delete</span>
            </button>
          </div>
        </div>
      </div>

      {/* Notifications */}
      {saveSuccessMsg && (
        <div className="alert alert-success animate-in fade-in">
          <Check className="h-4 w-4 text-emerald-400" />
          <span>{saveSuccessMsg}</span>
        </div>
      )}

      {bookmarkSuccessMsg && (
        <div className="alert alert-warning animate-in fade-in">
          <Bookmark className="h-4 w-4 text-amber-400" />
          <span>{bookmarkSuccessMsg}</span>
        </div>
      )}

      {analysisSuccessMsg && (
        <div className="alert alert-info animate-in fade-in">
          <Sparkles className="h-4 w-4 text-indigo-400" />
          <span>{analysisSuccessMsg}</span>
        </div>
      )}

      {relationshipSuccessMsg && (
        <div className="alert alert-info animate-in fade-in">
          <GitFork className="h-4 w-4 text-purple-400" />
          <span>{relationshipSuccessMsg}</span>
        </div>
      )}

      {mapSuccessMsg && (
        <div className="alert alert-success animate-in fade-in">
          <Sparkles className="h-4 w-4 text-emerald-400" />
          <span>{mapSuccessMsg}</span>
        </div>
      )}

      {/* Transcript Stale Analysis Warning Banner (Part 9) */}
      {showStaleWarning && (
        <div
          id="banner-stale-analysis"
          className="alert alert-warning flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in"
        >
          <div className="flex items-start gap-2.5">
            <AlertCircle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-amber-300">Transcript Was Modified</p>
              <p className="text-amber-200/90 mt-0.5">
                Previously generated academic summary, concepts, relationships, and learning maps may no longer match the latest transcript content.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              id="btn-dismiss-stale-warning"
              onClick={() => setShowStaleWarning(false)}
              className="btn-ghost"
            >
              Dismiss
            </button>
            <button
              id="btn-regenerate-all-analysis"
              onClick={handleRegenerateAllAnalysis}
              disabled={isRegeneratingAll}
              className="btn-primary"
            >
              {isRegeneratingAll ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>{regeneratingStep || 'Regenerating...'}</span>
                </>
              ) : (
                <>
                  <RefreshCw className="h-3.5 w-3.5" />
                  <span>Regenerate AI Analysis & Map</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Error Banners */}
      {analysisError && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300 flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-rose-200">Analysis Error</p>
              <p className="text-rose-300/90 mt-0.5">{analysisError}</p>
            </div>
          </div>
          <button
            onClick={handleRunAnalysis}
            disabled={isAnalyzing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 border border-rose-500/30 transition-colors"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Retry Analysis</span>
          </button>
        </div>
      )}

      {relationshipError && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300 flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-rose-200">Relationship Extraction Error</p>
              <p className="text-rose-300/90 mt-0.5">{relationshipError}</p>
            </div>
          </div>
          <button
            id="btn-retry-relationships"
            onClick={handleExtractRelationships}
            disabled={isExtractingRelationships}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 border border-rose-500/30 transition-colors"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Retry Extraction</span>
          </button>
        </div>
      )}

      {mapError && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300 flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-rose-200">Learning Map Error</p>
              <p className="text-rose-300/90 mt-0.5">{mapError}</p>
            </div>
          </div>
          <button
            id="btn-retry-learning-map"
            onClick={handleGenerateLearningMap}
            disabled={isGeneratingMap}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 border border-rose-500/30 transition-colors"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Retry Generation</span>
          </button>
        </div>
      )}

      {/* Extraction In-Progress Banner */}
      {isExtractingRelationships && (
        <div className="surface p-4 rounded-lg flex items-center justify-between gap-3 animate-pulse">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-md bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 flex items-center justify-center">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-900 dark:text-gray-100">Extracting concept relationships...</p>
              <p className="text-[11px] text-gray-500 dark:text-gray-400">
                Analyzing relationships between {concepts.length} concepts
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Learning Map In-Progress Banner */}
      {isGeneratingMap && (
        <div className="surface p-4 rounded-lg flex items-center justify-between gap-3 animate-pulse">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-md bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 flex items-center justify-center">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-900 dark:text-gray-100">Generating learning map...</p>
              <p className="text-[11px] text-gray-500 dark:text-gray-400">
                Computing layout coordinates and hierarchy
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex items-center gap-1 border-b border-slate-200 dark:border-slate-800 overflow-x-auto scrollbar-none">
        <button
          onClick={() => setActiveTab('transcript')}
          className={`flex items-center gap-2 px-3.5 py-2.5 text-xs font-semibold border-b-2 whitespace-nowrap transition-all duration-200 -mb-px ${
            activeTab === 'transcript'
              ? 'border-teal-600 text-teal-700 dark:border-teal-400 dark:text-teal-300 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
        >
          <FileText className="h-3.5 w-3.5" />
          <span>ASR Transcript</span>
          {resolvedSegments.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 font-mono">
              {resolvedSegments.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('summary')}
          className={`flex items-center gap-2 px-3.5 py-2.5 text-xs font-semibold border-b-2 whitespace-nowrap transition-all duration-200 -mb-px ${
            activeTab === 'summary'
              ? 'border-teal-600 text-teal-700 dark:border-teal-400 dark:text-teal-300 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
        >
          <BookOpen className="h-3.5 w-3.5" />
          <span>Academic Summary</span>
          {summary?.content && (
            <span className="h-1.5 w-1.5 rounded-full bg-teal-500 animate-pulse"></span>
          )}
        </button>

        {/* TAB: RAG CHAT WITH LECTURE (AI TUTOR) */}
        <button
          id="tab-chat-ai-tutor"
          onClick={() => setActiveTab('chat')}
          className={`flex items-center gap-2 px-3.5 py-2.5 text-xs font-semibold border-b-2 whitespace-nowrap transition-all duration-200 -mb-px ${
            activeTab === 'chat'
              ? 'border-teal-600 text-teal-700 dark:border-teal-400 dark:text-teal-300 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
        >
          <MessageSquare className="h-3.5 w-3.5 text-teal-600 dark:text-teal-400" />
          <span>Chat / AI Tutor</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 font-bold border border-teal-200 dark:border-teal-800/50">
            RAG
          </span>
        </button>

        <button
          onClick={() => setActiveTab('concepts')}
          className={`flex items-center gap-2 px-3.5 py-2.5 text-xs font-semibold border-b-2 whitespace-nowrap transition-all duration-200 -mb-px ${
            activeTab === 'concepts'
              ? 'border-teal-600 text-teal-700 dark:border-teal-400 dark:text-teal-300 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
        >
          <Tag className="h-3.5 w-3.5" />
          <span>Key Concepts</span>
          {concepts.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 font-mono">
              {concepts.length}
            </span>
          )}
        </button>

        {/* RELATIONSHIPS TAB (Part 7) */}
        <button
          id="tab-relationships"
          onClick={() => setActiveTab('relationships')}
          className={`flex items-center gap-2 px-3.5 py-2.5 text-xs font-semibold border-b-2 whitespace-nowrap transition-all duration-200 -mb-px ${
            activeTab === 'relationships'
              ? 'border-teal-600 text-teal-700 dark:border-teal-400 dark:text-teal-300 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
        >
          <GitFork className="h-3.5 w-3.5" />
          <span>Relationships</span>
          {relationships.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 font-mono">
              {relationships.length}
            </span>
          )}
        </button>

        {/* LEARNING MAP TAB (Part 8) */}
        <button
          id="tab-learning-map"
          onClick={() => setActiveTab('map')}
          className={`flex items-center gap-2 px-3.5 py-2.5 text-xs font-semibold border-b-2 whitespace-nowrap transition-all duration-200 -mb-px ${
            activeTab === 'map'
              ? 'border-teal-600 text-teal-700 dark:border-teal-400 dark:text-teal-300 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
        >
          <Network className="h-3.5 w-3.5" />
          <span>Learning Map</span>
          {learningMap?.mapData?.nodes?.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 font-mono">
              {learningMap.mapData.nodes.length}
            </span>
          )}
        </button>

        {/* BOOKMARKS TAB (Part 9) */}
        <button
          id="tab-bookmarks"
          onClick={() => setActiveTab('bookmarks')}
          className={`flex items-center gap-2 px-3.5 py-2.5 text-xs font-semibold border-b-2 whitespace-nowrap transition-all duration-200 -mb-px ${
            activeTab === 'bookmarks'
              ? 'border-teal-600 text-teal-700 dark:border-teal-400 dark:text-teal-300 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
        >
          <Bookmark className="h-3.5 w-3.5" />
          <span>Bookmarks</span>
          {bookmarks.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 font-mono">
              {bookmarks.length}
            </span>
          )}
        </button>
      </div>

      {/* Real-time Analysis Progress Banner */}
      {isAnalyzing && (
        <AnalysisProgressBar
          progress={analysisProgress}
          currentStageIndex={analysisStageIndex}
          elapsedSeconds={analysisElapsedSeconds}
          lectureTitle={lecture?.title}
          durationSeconds={lecture?.duration}
          requiredCredits={lecture?.requiredCredits}
          isComplete={analysisIsComplete}
        />
      )}

      {/* TAB 1: TRANSCRIPT */}
      {activeTab === 'transcript' && (
        <div className="space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 surface p-3.5 rounded-lg">
            <div className="relative flex-1 max-w-md">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search words, concepts, or speakers in transcript..."
                className="input pl-9 pr-8 py-2"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Transcript Filter Pills (Part 10) */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
              <button
                id="filter-transcript-all"
                onClick={() => setTranscriptFilter('all')}
                className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                  transcriptFilter === 'all'
                    ? 'bg-emerald-700 text-white shadow-sm'
                    : 'bg-gray-100 dark:bg-[#2a2a2a] text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
                }`}
              >
                All ({resolvedSegments.length})
              </button>
              <button
                id="filter-transcript-highlighted"
                onClick={() => setTranscriptFilter('highlighted')}
                className={`px-2.5 py-1 rounded text-xs font-medium flex items-center gap-1.5 transition-colors ${
                  transcriptFilter === 'highlighted'
                    ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800/50'
                    : 'bg-gray-100 dark:bg-[#2a2a2a] text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
                }`}
              >
                <Highlighter className="h-3 w-3 text-amber-400" />
                <span>Highlighted ({Object.keys(highlights).length})</span>
              </button>
              <button
                id="filter-transcript-notes"
                onClick={() => setTranscriptFilter('notes')}
                className={`px-2.5 py-1 rounded text-xs font-medium flex items-center gap-1.5 transition-colors ${
                  transcriptFilter === 'notes'
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/50'
                    : 'bg-gray-100 dark:bg-[#2a2a2a] text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
                }`}
              >
                <FileText className="h-3 w-3 text-brand-400" />
                <span>With Notes ({Object.values(highlights).filter((h) => h?.note && h.note.trim()).length})</span>
              </button>
            </div>

            <div className="flex items-center gap-2 self-end md:self-auto">
              {/* View Mode Toggle: Segments vs Full Text */}
              <div className="flex items-center rounded-lg bg-gray-100 dark:bg-[#2a2a2a] p-0.5 border border-gray-200 dark:border-[#333333]">
                <button
                  id="toggle-view-segments"
                  onClick={() => setTranscriptViewMode('segments')}
                  className={`px-2.5 py-1 rounded text-xs font-medium flex items-center gap-1.5 transition-colors ${
                    transcriptViewMode === 'segments'
                      ? 'bg-emerald-700 text-white shadow-sm'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
                  }`}
                  title="Dialogue Segments with Timestamps"
                >
                  <ListCollapse className="h-3 w-3" />
                  <span className="hidden sm:inline">Segments</span>
                </button>
                <button
                  id="toggle-view-fulltext"
                  onClick={() => setTranscriptViewMode('fulltext')}
                  className={`px-2.5 py-1 rounded text-xs font-medium flex items-center gap-1.5 transition-colors ${
                    transcriptViewMode === 'fulltext'
                      ? 'bg-emerald-700 text-white shadow-sm'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
                  }`}
                  title="Continuous Full Reading Text"
                >
                  <AlignLeft className="h-3 w-3" />
                  <span className="hidden sm:inline">Full Text</span>
                </button>
              </div>

              {isEditing ? (
                <>
                  <button
                    onClick={handleCancelEdit}
                    disabled={isSaving}
                    className="btn-ghost"
                  >
                    <X className="h-3.5 w-3.5" />
                    <span>Cancel</span>
                  </button>
                  <button
                    onClick={handleSaveTranscript}
                    disabled={isSaving}
                    className="btn-primary"
                  >
                    {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                    <span>Save Changes</span>
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setIsEditing(true)}
                  disabled={!transcript}
                  className="btn-secondary"
                >
                  <Edit3 className="h-3.5 w-3.5 text-brand-400" />
                  <span>Edit Transcript</span>
                </button>
              )}
            </div>
          </div>

          {!transcript ? (
            <div className="surface rounded-lg p-12 text-center space-y-3">
              <FileText className="h-10 w-10 text-gray-400 mx-auto" />
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">No Transcript Available</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 max-w-sm mx-auto">
                {lecture?.status === 'TRANSCRIBING'
                  ? 'Gemini is currently transcribing the lecture audio. Please refresh shortly.'
                  : 'This lecture does not have a transcript yet. Upload audio to generate one.'}
              </p>
            </div>
          ) : transcriptViewMode === 'fulltext' ? (
            <div className="surface rounded-lg p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-gray-100 dark:border-[#2a2a2a]">
                <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                  <span className="font-semibold text-gray-700 dark:text-gray-300">
                    {((transcript?.content || resolvedSegments.map((s) => s.text).join(' ')).split(/\s+/).filter(Boolean).length)} words
                  </span>
                  <span>&bull;</span>
                  <span>{(transcript?.content || resolvedSegments.map((s) => s.text).join(' ')).length} characters</span>
                  {searchQuery && (
                    <>
                      <span>&bull;</span>
                      <span className="text-emerald-700 dark:text-emerald-400 font-medium">
                        Filtered for &ldquo;{searchQuery}&rdquo;
                      </span>
                    </>
                  )}
                </div>

                <button
                  id="btn-copy-fulltext-transcript"
                  onClick={handleCopyTranscript}
                  className="btn-secondary py-1.5 px-3 text-xs flex items-center gap-1.5"
                  title="Copy full transcript text to clipboard"
                >
                  {copiedTranscript ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-emerald-700 dark:text-emerald-400" />
                      <span className="text-emerald-700 dark:text-emerald-400 font-medium">Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      <span>Copy Full Text</span>
                    </>
                  )}
                </button>
              </div>

              {isEditing ? (
                <textarea
                  rows={16}
                  value={editedContent}
                  onChange={(e) => {
                    setEditedContent(e.target.value);
                    setEditedSegments(parseTextToSegments(e.target.value));
                  }}
                  className="input w-full leading-relaxed font-sans text-sm p-4"
                  placeholder="Edit full lecture transcript text here..."
                />
              ) : (
                <div className="space-y-4 text-sm leading-relaxed text-gray-800 dark:text-gray-200">
                  {(transcript?.content || resolvedSegments.map((s) => s.text).join('\n\n'))
                    .split(/\r?\n\s*\r?\n/)
                    .filter((para) => !searchQuery || para.toLowerCase().includes(searchQuery.toLowerCase()))
                    .map((paragraph, pIdx) => (
                      <p key={pIdx} className="p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-[#252525] transition-colors leading-7">
                        {paragraph}
                      </p>
                    ))}
                  {searchQuery &&
                    (transcript?.content || resolvedSegments.map((s) => s.text).join('\n\n'))
                      .split(/\r?\n\s*\r?\n/)
                      .filter((para) => para.toLowerCase().includes(searchQuery.toLowerCase())).length === 0 && (
                      <div className="text-center py-8 text-xs text-gray-500">
                        No paragraphs matched &ldquo;{searchQuery}&rdquo;
                      </div>
                    )}
                </div>
              )}
            </div>
          ) : displayedSegments.length === 0 ? (
            <div className="surface rounded-lg p-8 text-center space-y-2">
              <Search className="h-6 w-6 text-gray-400 dark:text-gray-500 mx-auto" />
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {transcriptFilter === 'highlighted'
                  ? 'No segments have been highlighted yet. Click the highlighter icon on any segment to mark key points.'
                  : transcriptFilter === 'notes'
                  ? 'No study notes have been attached to segments yet. Click the note icon on any segment to add takeaways.'
                  : `No segments matched your query "${searchQuery}".`}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {displayedSegments.map((seg, idx) => {
                const isHl = Boolean(highlights[seg.originalIdx]);
                const hlData = highlights[seg.originalIdx];
                const isSelectedForJump = highlightedSegmentIndex === seg.originalIdx;

                return (
                  <div
                    key={seg.id || seg.originalIdx || idx}
                    id={`segment-${seg.originalIdx}`}
                    className={`surface rounded-lg p-4 transition-all space-y-2 ${
                      isSelectedForJump
                        ? 'ring-2 ring-amber-500 bg-amber-50/50 dark:bg-amber-950/20'
                        : isHl
                        ? 'border-l-4 border-l-amber-500 bg-amber-50/30 dark:bg-amber-950/10'
                        : 'hover:border-gray-300 dark:hover:border-gray-600'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/50 font-medium text-[11px]">
                        <User className="h-3 w-3 text-emerald-700 dark:text-emerald-400" />
                        {isEditing ? (
                          <input
                            type="text"
                            value={seg.speaker}
                            onChange={(e) => handleSpeakerChange(seg.originalIdx, e.target.value)}
                            className="input py-0.5 px-1 text-[11px]"
                          />
                        ) : (
                          <span>{seg.speaker || 'Speaker 1'}</span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1 font-normal text-[11px] text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-[#2a2a2a] px-2 py-0.5 rounded border border-gray-200 dark:border-[#333333]">
                          <Clock className="h-3 w-3 text-gray-400 dark:text-gray-500" />
                          <span>
                            {formatSeconds(seg.start)} &ndash; {formatSeconds(seg.end)}
                          </span>
                        </div>

                        {!isEditing && (
                          <div className="flex items-center gap-1">
                            {/* Highlight Toggle Button (Part 10) */}
                            <button
                              id={`btn-highlight-seg-${seg.originalIdx}`}
                              onClick={() => toggleHighlight(seg.originalIdx)}
                              className={`p-1.5 rounded-lg transition-colors ${
                                isHl
                                  ? 'text-amber-300 bg-amber-500/20 border border-amber-500/40 shadow-sm'
                                  : 'text-gray-400 dark:text-gray-500 hover:text-amber-300 hover:bg-amber-500/10'
                              }`}
                              title={isHl ? 'Remove Highlight' : 'Highlight Section'}
                            >
                              <Highlighter className="h-3.5 w-3.5" />
                            </button>

                            {/* Section Note Toggle Button (Part 10) */}
                            <button
                              id={`btn-note-seg-${seg.originalIdx}`}
                              onClick={() => {
                                if (editingNoteSegmentIdx === seg.originalIdx) {
                                  setEditingNoteSegmentIdx(null);
                                } else {
                                  setEditingNoteSegmentIdx(seg.originalIdx);
                                  setSegmentNoteInput(hlData?.note || '');
                                }
                              }}
                              className={`p-1.5 rounded-lg transition-colors ${
                                hlData?.note
                                  ? 'text-brand-300 bg-brand-500/20 border border-brand-500/40 shadow-sm'
                                  : 'text-gray-400 dark:text-gray-500 hover:text-brand-300 hover:bg-brand-500/10'
                              }`}
                              title="Add / Edit Study Note"
                            >
                              <FileText className="h-3.5 w-3.5" />
                            </button>

                            {/* Bookmark Button (Part 9) */}
                            <button
                              onClick={() => handleOpenBookmarkModal(seg, seg.originalIdx)}
                              className="p-1.5 rounded-lg text-gray-400 dark:text-gray-500 hover:text-amber-300 hover:bg-amber-500/10 transition-colors"
                              title="Bookmark this lecture section"
                            >
                              <Bookmark className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {isEditing ? (
                      <textarea
                        rows={2}
                        value={seg.text}
                        onChange={(e) => handleSegmentChange(seg.originalIdx, e.target.value)}
                        className="input leading-relaxed"
                      />
                    ) : (
                      <p className="text-xs sm:text-sm text-gray-700 dark:text-gray-200 leading-relaxed font-sans">
                        {seg.text}
                      </p>
                    )}

                    {/* Inline Study Note Editor (Part 10) */}
                    {editingNoteSegmentIdx === seg.originalIdx && (
                      <div className="mt-2 p-3 rounded-xl surface-raised border border-brand-500/40 space-y-2 animate-in fade-in">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-semibold text-brand-300">Add / Edit Section Study Note:</span>
                          <button
                            onClick={() => setEditingNoteSegmentIdx(null)}
                            className="text-gray-400 dark:text-gray-500 hover:text-white text-xs"
                          >
                            Cancel
                          </button>
                        </div>
                        <textarea
                          rows={2}
                          value={segmentNoteInput}
                          onChange={(e) => setSegmentNoteInput(e.target.value)}
                          placeholder="Type your study takeaway or question for this section..."
                          className="input"
                        />
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => handleSaveSegmentNote(seg.originalIdx, segmentNoteInput)}
                            className="btn-primary"
                          >
                            Save Note
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Display Attached Study Note (Part 10) */}
                    {hlData?.note && editingNoteSegmentIdx !== seg.originalIdx && (
                      <div className="mt-2 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-200 flex items-start justify-between gap-2">
                        <div className="flex items-start gap-1.5">
                          <span className="font-semibold text-amber-400 shrink-0">Study Note:</span>
                          <span className="text-slate-200 font-sans leading-relaxed">{hlData.note}</span>
                        </div>
                        <button
                          onClick={() => {
                            setEditingNoteSegmentIdx(seg.originalIdx);
                            setSegmentNoteInput(hlData.note);
                          }}
                          className="text-[11px] text-amber-400 hover:underline shrink-0"
                        >
                          Edit
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: ACADEMIC SUMMARY */}
      {activeTab === 'summary' && (
        <div className="space-y-4">
          {!summary ? (
            isAnalyzing ? (
              <AnalysisProgressBar
                progress={analysisProgress}
                currentStageIndex={analysisStageIndex}
                elapsedSeconds={analysisElapsedSeconds}
                lectureTitle={lecture?.title}
                durationSeconds={lecture?.duration}
                requiredCredits={lecture?.requiredCredits}
                isComplete={analysisIsComplete}
              />
            ) : (
              <div className="surface rounded-lg p-12 text-center space-y-4">
                <div className="h-14 w-14 rounded-lg bg-brand-500/10 text-brand-400 border border-brand-500/20 mx-auto flex items-center justify-center">
                  <BookOpen className="h-7 w-7" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">No Summary Generated Yet</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 max-w-md mx-auto mt-1">
                    Run Gemini analysis to extract an academic summary, key points, and core explanations grounded in your lecture transcript.
                  </p>
                </div>
                <button
                  id="btn-summary-run-analysis"
                  onClick={handleRunAnalysis}
                  disabled={isAnalyzing || !hasTranscript}
                  className="btn-primary"
                >
                  <Sparkles className="h-4 w-4" />
                  <span>Generate Academic Summary</span>
                </button>
              </div>
            )
          ) : (
            <div className="surface rounded-lg p-6 sm:p-8 space-y-6 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-200 dark:border-[#333333] pb-4">
                <div className="flex items-center gap-2.5">
                  <div className="h-8 w-8 rounded-md bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/50 flex items-center justify-center">
                    <BookOpen className="h-4 w-4" />
                  </div>
                  <div>
                    <h2 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-gray-100">Academic Summary</h2>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400">Synthesized strictly from verified classroom dialogue</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    <span>100% Grounded</span>
                  </span>
                </div>
              </div>

              <div className="prose dark:prose-invert max-w-none text-sm leading-relaxed space-y-4">
                {summary.content.split('\n\n').map((para, pIdx) => (
                  <p key={pIdx} className="leading-relaxed font-sans text-gray-700 dark:text-gray-300">
                    {para}
                  </p>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: KEY CONCEPTS */}
      {activeTab === 'concepts' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 surface p-3.5 rounded-lg">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider">Importance:</span>
              <div className="flex items-center gap-1.5">
                {['all', 'high', 'medium', 'low'].map((filter) => (
                  <button
                    key={filter}
                    onClick={() => setConceptFilter(filter)}
                    className={`px-2.5 py-1 rounded text-xs font-medium capitalize transition-colors ${
                      conceptFilter === filter
                        ? 'bg-emerald-700 text-white shadow-sm'
                        : 'bg-gray-100 dark:bg-[#2a2a2a] text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
                    }`}
                  >
                    {filter}
                  </button>
                ))}
              </div>
            </div>

            <span className="text-xs text-gray-500 dark:text-gray-400 self-end sm:self-auto">
              Showing {filteredConcepts.length} of {concepts.length} concepts
            </span>
          </div>

          {concepts.length === 0 ? (
            isAnalyzing ? (
              <AnalysisProgressBar
                progress={analysisProgress}
                currentStageIndex={analysisStageIndex}
                elapsedSeconds={analysisElapsedSeconds}
                lectureTitle={lecture?.title}
                durationSeconds={lecture?.duration}
                requiredCredits={lecture?.requiredCredits}
                isComplete={analysisIsComplete}
              />
            ) : (
              <div className="surface rounded-lg p-12 text-center space-y-4">
                <div className="h-14 w-14 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 mx-auto flex items-center justify-center">
                  <Tag className="h-7 w-7" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">No Concepts Extracted Yet</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 max-w-md mx-auto mt-1">
                    Run Gemini analysis to identify core principles, architectural components, and academic terminology with importance rankings.
                  </p>
                </div>
                <button
                  id="btn-concepts-run-analysis"
                  onClick={handleRunAnalysis}
                  disabled={isAnalyzing || !hasTranscript}
                  className="btn-primary"
                >
                  <Sparkles className="h-4 w-4" />
                  <span>Extract Key Concepts</span>
                </button>
              </div>
            )
          ) : filteredConcepts.length === 0 ? (
            <div className="surface rounded-lg p-8 text-center space-y-2">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                No concepts found matching importance level "{conceptFilter}".
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredConcepts.map((concept, idx) => {
                const isHigh = (concept.importance || '').toLowerCase() === 'high' || concept.importanceScore >= 3;
                const isMedium = (concept.importance || '').toLowerCase() === 'medium' || concept.importanceScore === 2;

                return (
                  <div
                    key={concept.id || idx}
                    className="surface rounded-lg p-5 hover:border-gray-300 dark:hover:border-gray-600 transition-colors flex flex-col justify-between space-y-3"
                  >
                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="text-sm sm:text-base font-semibold text-gray-900 dark:text-gray-100">
                          {concept.name}
                        </h4>
                        <span
                          className={`badge ${
                            isHigh
                              ? 'badge-warning'
                              : isMedium
                              ? 'badge-info'
                              : 'badge-neutral'
                          }`}
                        >
                          {concept.importance || (isHigh ? 'HIGH' : isMedium ? 'MEDIUM' : 'LOW')}
                        </span>
                      </div>

                      <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 leading-relaxed font-sans">
                        {concept.description}
                      </p>
                    </div>

                    {concept.context && (
                      <div className="pt-2 border-t border-gray-100 dark:border-[#333333]">
                        <p className="text-[11px] text-gray-500 dark:text-gray-400 italic">
                          "{concept.context}"
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 4: CONCEPT RELATIONSHIPS (Part 7) */}
      {activeTab === 'relationships' && (
        <div className="space-y-4">
          {/* Relationships Toolbar & Filter */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 surface p-3.5 rounded-lg">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider flex items-center gap-1">
                <Filter className="h-3.5 w-3.5 text-emerald-700 dark:text-emerald-400" />
                <span>Type:</span>
              </span>
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  onClick={() => setRelationshipFilter('all')}
                  className={`px-2.5 py-1 rounded text-xs font-medium capitalize transition-colors ${
                    relationshipFilter === 'all'
                      ? 'bg-emerald-700 text-white shadow-sm'
                      : 'bg-gray-100 dark:bg-[#2a2a2a] text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
                  }`}
                >
                  All ({relationships.length})
                </button>
                {existingRelTypes.map((type) => (
                  <button
                    key={type}
                    onClick={() => setRelationshipFilter(type)}
                    className={`px-2.5 py-1 rounded text-xs font-medium capitalize transition-colors ${
                      relationshipFilter === type
                        ? 'bg-emerald-700 text-white shadow-sm'
                        : 'bg-gray-100 dark:bg-[#2a2a2a] text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
                    }`}
                  >
                    {type.replace(/_/g, ' ')}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-auto">
              <span className="text-xs font-normal text-gray-500 dark:text-gray-400">
                {filteredRelationships.length} relationships
              </span>
              {canExtractRelationships && relationships.length > 0 && (
                <button
                  onClick={handleExtractRelationships}
                  disabled={isExtractingRelationships}
                  className="btn-secondary"
                >
                  <RefreshCw className={`h-3 w-3 ${isExtractingRelationships ? 'animate-spin' : ''}`} />
                  <span>Regenerate</span>
                </button>
              )}
            </div>
          </div>

          {/* Relationships Content */}
          {concepts.length < 2 ? (
            <div className="surface rounded-lg p-12 text-center space-y-4">
              <div className="h-14 w-14 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 mx-auto flex items-center justify-center">
                <Tag className="h-7 w-7" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Concepts Required First</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 max-w-md mx-auto mt-1">
                  At least 2 extracted concepts are required before conceptual relationships can be identified. Please run lecture analysis first.
                </p>
              </div>
              <button
                onClick={handleRunAnalysis}
                disabled={isAnalyzing || !hasTranscript}
                className="btn-primary"
              >
                <Sparkles className="h-4 w-4" />
                <span>Run Lecture Analysis</span>
              </button>
            </div>
          ) : relationships.length === 0 ? (
            <div className="surface rounded-lg p-12 text-center space-y-4">
              <div className="h-14 w-14 rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/20 mx-auto flex items-center justify-center">
                <GitFork className="h-7 w-7" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">No Relationships Extracted Yet</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 max-w-md mx-auto mt-1">
                  Use Gemini to discover semantic, causal, and pedagogical relationships connecting your {concepts.length} lecture concepts.
                </p>
              </div>
              <button
                id="btn-relationships-extract-first"
                onClick={handleExtractRelationships}
                disabled={isExtractingRelationships}
                className="btn-primary"
              >
                {isExtractingRelationships ? <Loader2 className="h-4 w-4 animate-spin" /> : <GitFork className="h-4 w-4" />}
                <span>Extract Concept Relationships</span>
              </button>
            </div>
          ) : filteredRelationships.length === 0 ? (
            <div className="surface rounded-lg p-8 text-center space-y-2">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                No relationships found matching filter "{relationshipFilter.replace(/_/g, ' ')}".
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {filteredRelationships.map((rel, idx) => {
                const sourceName = rel.sourceConcept?.name || rel.sourceConceptName || 'Concept A';
                const targetName = rel.targetConcept?.name || rel.targetConceptName || 'Concept B';
                const relType = rel.relationshipType || 'related_to';

                return (
                  <div
                    key={rel.id || idx}
                    className="surface rounded-lg p-5 hover:border-gray-300 dark:hover:border-gray-600 transition-colors flex flex-col justify-between space-y-4"
                  >
                    {/* Visual Flow Header: Concept A -> [type] -> Concept B */}
                    <div className="space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-md bg-gray-50 dark:bg-[#1A1A1A] border border-gray-200 dark:border-[#333333]">
                        {/* Source Concept */}
                        <div className="flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full bg-emerald-600 dark:bg-emerald-400"></span>
                          <span className="text-xs font-semibold text-gray-900 dark:text-gray-100">
                            {sourceName}
                          </span>
                        </div>

                        {/* Directional Indicator & Relationship Badge */}
                        <div className="flex items-center gap-1.5 self-center">
                          <span
                            className={`badge badge-info uppercase tracking-wider`}
                          >
                            {relType.replace(/_/g, ' ')}
                          </span>
                          <ArrowRight className="h-3.5 w-3.5 text-gray-400 hidden sm:inline-block" />
                          <ArrowDown className="h-3.5 w-3.5 text-gray-400 sm:hidden" />
                        </div>

                        {/* Target Concept */}
                        <div className="flex items-center gap-2 justify-end">
                          <span className="text-xs font-semibold text-gray-900 dark:text-gray-100">
                            {targetName}
                          </span>
                          <span className="h-2 w-2 rounded-full bg-teal-600 dark:bg-teal-400"></span>
                        </div>
                      </div>

                      {/* Explanation */}
                      <div className="space-y-1">
                        <span className="text-[10px] uppercase font-semibold tracking-wider text-gray-400 dark:text-gray-500">
                          Pedagogical Rationale:
                        </span>
                        <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 leading-relaxed font-sans">
                          {rel.description}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-gray-400 dark:text-gray-500 pt-2 border-t border-gray-100 dark:border-[#333333] font-normal">
                      <span>Prisma DB Relational Link</span>
                      <span className="text-emerald-400/80 flex items-center gap-1">
                        <Check className="h-3 w-3" />
                        <span>Verified</span>
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 5: INTERACTIVE LEARNING MAP (Part 8) */}
      {activeTab === 'map' && (
        <div className="space-y-4">
          {/* Header Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                <span>Interactive Learning Map</span>
                <span className="badge badge-info">
                  Graph View
                </span>
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Visualizing prerequisite pathways, core dependencies, and conceptual flow derived from lecture audio
              </p>
            </div>

            <div className="flex items-center gap-2">
              {learningMap?.mapData?.nodes?.length > 0 && (
                <button
                  id="btn-regenerate-learning-map"
                  onClick={handleGenerateLearningMap}
                  disabled={isGeneratingMap || concepts.length < 2}
                  className="btn-secondary"
                  title="Recalculate deterministic topological hierarchy from updated concepts & relationships"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${isGeneratingMap ? 'animate-spin' : ''}`} />
                  <span>Regenerate Map</span>
                </button>
              )}
            </div>
          </div>

          {/* Conditional Display */}
          {concepts.length < 2 ? (
            <div className="surface rounded-lg p-12 text-center space-y-4">
              <div className="h-14 w-14 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 mx-auto flex items-center justify-center">
                <Tag className="h-7 w-7" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Concepts Required First</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 max-w-md mx-auto mt-1">
                  At least 2 extracted concepts are required before an interactive learning map can be synthesized. Please run lecture analysis first.
                </p>
              </div>
              <button
                onClick={handleRunAnalysis}
                disabled={isAnalyzing || !hasTranscript}
                className="btn-primary"
              >
                <Sparkles className="h-4 w-4" />
                <span>Run Lecture Analysis</span>
              </button>
            </div>
          ) : !learningMap?.mapData?.nodes?.length ? (
            <div className="surface rounded-lg p-12 text-center space-y-4">
              <div className="h-14 w-14 rounded-lg bg-brand-500/10 text-brand-400 border border-brand-500/20 mx-auto flex items-center justify-center">
                <Network className="h-7 w-7" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Smart Learning Map Ready to Generate</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 max-w-md mx-auto mt-1">
                  Synthesize your {concepts.length} key concepts and {relationships.length} relationships into an interactive 2D node-link learning map with zoom, pan, draggable nodes, and detail inspection.
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-2 pt-1 pb-2">
                <span className="text-xs text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20 font-normal">
                  {concepts.length} Concepts Available
                </span>
                <span className="text-xs text-purple-400 bg-purple-500/10 px-3 py-1 rounded-full border border-purple-500/20 font-normal">
                  {relationships.length} Relationships Available
                </span>
              </div>

              <button
                id="btn-generate-learning-map"
                onClick={handleGenerateLearningMap}
                disabled={isGeneratingMap}
                className="btn-primary py-2.5 px-5"
              >
                {isGeneratingMap ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                <span>Generate Interactive Learning Map</span>
              </button>
            </div>
          ) : (
            <LearningMapCanvas
              mapData={learningMap.mapData}
              onSaveLayout={handleSaveMapLayout}
              isSaving={isSavingMapLayout}
              onRegenerate={handleGenerateLearningMap}
              isRegenerating={isGeneratingMap}
            />
          )}
        </div>
      )}

      {/* TAB 5: BOOKMARKS (Part 9) */}
      {activeTab === 'bookmarks' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 surface p-3.5 rounded-lg">
            <div className="flex items-center gap-2">
              <Bookmark className="h-4 w-4 text-amber-500" />
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Lecture Bookmarks</h3>
            </div>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {bookmarks.length} {bookmarks.length === 1 ? 'bookmark' : 'bookmarks'} saved
            </span>
          </div>

          {bookmarks.length === 0 ? (
            <div className="surface rounded-lg p-12 text-center space-y-4 border border-slate-800 animate-in fade-in">
              <div className="h-14 w-14 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 mx-auto flex items-center justify-center">
                <Bookmark className="h-7 w-7" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">No Bookmarks Saved Yet</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 max-w-md mx-auto mt-1">
                  Bookmark important lecture moments, complex definitions, or exam-critical concepts directly from the transcript to create a fast revision roadmap.
                </p>
              </div>
              <button
                onClick={() => setActiveTab('transcript')}
                className="btn-primary"
              >
                <FileText className="h-4 w-4" />
                <span>Go to Transcript to Add Bookmarks</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {bookmarks.map((bm) => (
                <div
                  key={bm.id}
                  className="surface rounded-lg p-5 hover:border-gray-300 dark:hover:border-gray-600 transition-colors flex flex-col justify-between space-y-3"
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 line-clamp-2">
                        {bm.title}
                      </h4>
                      {typeof bm.timestamp === 'number' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-normal font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/20 shrink-0">
                          <Clock className="h-3 w-3 text-amber-400" />
                          <span>{formatSeconds(bm.timestamp)}</span>
                        </span>
                      )}
                    </div>

                    {bm.note ? (
                      <p className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed font-sans bg-gray-50 dark:bg-[#1A1A1A] p-2.5 rounded-md border border-gray-200 dark:border-[#333333]">
                        {bm.note}
                      </p>
                    ) : (
                      <p className="text-xs text-gray-400 dark:text-gray-500 italic">No notes attached.</p>
                    )}
                  </div>

                  <div className="pt-2 border-t border-gray-100 dark:border-[#333333] flex items-center justify-between gap-2 text-xs">
                    <span className="text-[11px] text-gray-400 dark:text-gray-500 font-normal">
                      {new Date(bm.createdAt).toLocaleDateString()}
                    </span>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleDeleteBookmark(bm.id)}
                        disabled={isDeletingBookmarkId === bm.id}
                        className="p-1.5 rounded-lg text-gray-400 dark:text-gray-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                        title="Delete this bookmark"
                      >
                        {isDeletingBookmarkId === bm.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                      </button>

                      <button
                        onClick={() => handleJumpToSegment(bm)}
                        className="btn-secondary"
                      >
                        <FileText className="h-3.5 w-3.5" />
                        <span>Jump to Transcript</span>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 6: CHAT / AI TUTOR */}
      {activeTab === 'chat' && (
        <div className="surface rounded-xl overflow-hidden border border-gray-200 dark:border-[#2d2d2d] flex flex-col h-[700px] shadow-lg">
          {/* Chat Header */}
          <div className="p-4 bg-gray-50 dark:bg-[#1a1a1a] border-b border-gray-200 dark:border-[#2d2d2d] flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="h-10 w-10 rounded-xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 flex items-center justify-center">
                  <Bot className="h-5 w-5" />
                </div>
                <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-[#1a1a1a]" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    Lecture AI Tutor
                  </h3>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800/60">
                    RAG Grounded
                  </span>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-sm sm:max-w-md">
                  Grounded strictly in: {lecture?.title || 'This lecture'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                id="btn-reset-chat"
                onClick={() =>
                  setChatMessages([
                    {
                      id: 'welcome',
                      role: 'assistant',
          content: `Hello! I am your AI Lecture Tutor for **${lecture?.title || 'this lecture'}**.\n\nAsk me about this lecture. I search the transcript for relevant passages and show the source passages used for each answer.`,
                      suggestedQuestions: [
                        'Summarize the core takeaways from this lecture',
                        'What are the most important concepts discussed?',
                        'Quiz me with 3 practice questions on this lecture'
                      ],
                      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                    }
                  ])
                }
                className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 px-2.5 py-1 rounded-lg hover:bg-gray-200/50 dark:hover:bg-[#2a2a2a] transition-colors"
                title="Clear conversation and restart tutor"
              >
                Reset Chat
              </button>
            </div>
          </div>

          {/* Messages Container */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
            {chatMessages.map((msg) => {
              const isUser = msg.role === 'user';
              return (
                <div
                  key={msg.id}
                  className={`flex gap-3 max-w-3xl ${isUser ? 'ml-auto justify-end' : 'mr-auto justify-start'}`}
                >
                  {!isUser && (
                    <div className="h-8 w-8 rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 flex items-center justify-center shrink-0 mt-0.5">
                      <Bot className="h-4 w-4" />
                    </div>
                  )}

                  <div className="space-y-2.5 max-w-[85%] sm:max-w-[80%]">
                    <div
                      className={`p-4 rounded-2xl text-sm leading-relaxed ${
                        isUser
                          ? 'bg-emerald-700 text-white rounded-br-xs shadow-sm font-medium'
                          : 'bg-white dark:bg-[#202020] text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-[#2e2e2e] rounded-bl-xs shadow-sm'
                      }`}
                    >
                      {/* Clean Message Content (Formatted Markdown, Bold, Lists, Headers, No raw asterisks or dashes) */}
                      <CleanMessageContent content={msg.content} isUser={isUser} />
                    </div>

                    {/* Citations & Timestamps */}
                    {!isUser && Array.isArray(msg.citations) && msg.citations.length > 0 && (
                      <div className="space-y-1.5 pt-1 pl-1">
                        <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider block">
                          Retrieved Transcript Sources:
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {msg.citations.map((cit, cIdx) => (
                            <button
                              key={cIdx}
                              onClick={() => handleCitationClick(cit)}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 border border-amber-200 dark:border-amber-800/60 hover:bg-amber-100 dark:hover:bg-amber-900/50 transition-colors cursor-pointer group"
                              title={cit.text ? `Jump to: "${cit.text}"` : 'Jump to segment in transcript'}
                            >
                              <Clock className="h-3 w-3 text-amber-500 group-hover:scale-110 transition-transform" />
                              <span>[{cit.label || cIdx + 1}]</span>
                              <span>{cit.timestamp || (Number.isInteger(cit.segmentIndex) ? `Segment ${cit.segmentIndex + 1}` : `Passage ${cIdx + 1}`)}</span>
                              {cit.text && (
                                <span className="max-w-[220px] truncate text-amber-800/80 dark:text-amber-100/80 font-normal">
                                  {cit.text.slice(0, 120)}
                                </span>
                              )}
                              {cit.speaker && (
                                <span className="text-amber-700 dark:text-amber-300 font-normal">
                                  ({cit.speaker})
                                </span>
                              )}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Suggested Follow-up Questions */}
                    {!isUser && Array.isArray(msg.suggestedQuestions) && msg.suggestedQuestions.length > 0 && (
                      <div className="space-y-1.5 pt-2 pl-1">
                        <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider block">
                          Suggested Questions:
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {msg.suggestedQuestions.map((q, qIdx) => (
                            <button
                              key={qIdx}
                              onClick={() => handleSendChatMessage(q)}
                              disabled={isChatLoading}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-normal bg-gray-100 dark:bg-[#2a2a2a] text-gray-700 dark:text-gray-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 hover:text-emerald-800 dark:hover:text-emerald-300 hover:border-emerald-300 dark:hover:border-emerald-800/60 border border-transparent transition-all text-left"
                            >
                              <Sparkles className="h-3 w-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
                              <span>{q}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Timestamp */}
                    <div
                      className={`text-[10px] text-gray-400 dark:text-gray-500 ${
                        isUser ? 'text-right pr-1' : 'pl-1'
                      }`}
                    >
                      {msg.timestamp}
                    </div>
                  </div>

                  {isUser && (
                    <div className="h-8 w-8 rounded-lg bg-emerald-700 text-white flex items-center justify-center shrink-0 mt-0.5 font-semibold text-xs shadow-sm">
                      <User className="h-4 w-4" />
                    </div>
                  )}
                </div>
              );
            })}

            {/* Chat Loading Bubble */}
            {isChatLoading && (
              <div className="flex gap-3 max-w-xl mr-auto justify-start animate-in fade-in">
                <div className="h-8 w-8 rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 flex items-center justify-center shrink-0 mt-0.5">
                  <Bot className="h-4 w-4" />
                </div>
                <div className="bg-white dark:bg-[#202020] border border-gray-200 dark:border-[#2e2e2e] p-4 rounded-2xl rounded-bl-xs text-xs text-gray-600 dark:text-gray-300 flex items-center gap-2.5 shadow-sm">
                  <Loader2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 animate-spin" />
                  <span>Searching transcript, concepts, and synthesizing grounded answer...</span>
                </div>
              </div>
            )}

            {/* Chat Error Banner */}
            {chatError && (
              <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-600 dark:text-rose-300 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{chatError}</span>
                </div>
                <button
                  onClick={() => handleSendChatMessage(chatMessages[chatMessages.length - 1]?.content)}
                  className="px-2.5 py-1 rounded bg-rose-500/20 hover:bg-rose-500/30 text-rose-700 dark:text-rose-200 text-xs font-semibold shrink-0"
                >
                  Retry
                </button>
              </div>
            )}

            <div ref={chatMessagesEndRef} />
          </div>

          {/* Quick Starter Pills (shown if chat has only 1 welcome message) */}
          {chatMessages.length <= 1 && (
            <div className="px-4 py-2 bg-gray-50/50 dark:bg-[#181818] border-t border-gray-200 dark:border-[#2a2a2a] flex items-center gap-2 overflow-x-auto text-xs">
              <span className="text-[11px] text-gray-400 shrink-0 font-medium">Try asking:</span>
              <button
                onClick={() => handleSendChatMessage('What are the 3 main takeaways from this lecture?')}
                className="px-2.5 py-1 rounded-full bg-white dark:bg-[#252525] border border-gray-200 dark:border-[#333] text-gray-700 dark:text-gray-300 hover:text-emerald-700 dark:hover:text-emerald-400 hover:border-emerald-300 text-xs shrink-0 transition-colors"
              >
                3 main takeaways
              </button>
              <button
                onClick={() => handleSendChatMessage('Explain the most difficult concept mentioned in simple terms.')}
                className="px-2.5 py-1 rounded-full bg-white dark:bg-[#252525] border border-gray-200 dark:border-[#333] text-gray-700 dark:text-gray-300 hover:text-emerald-700 dark:hover:text-emerald-400 hover:border-emerald-300 text-xs shrink-0 transition-colors"
              >
                Explain key concept simply
              </button>
              <button
                onClick={() => handleSendChatMessage('Provide a 5-question multiple choice revision quiz on this lecture.')}
                className="px-2.5 py-1 rounded-full bg-white dark:bg-[#252525] border border-gray-200 dark:border-[#333] text-gray-700 dark:text-gray-300 hover:text-emerald-700 dark:hover:text-emerald-400 hover:border-emerald-300 text-xs shrink-0 transition-colors"
              >
                Generate revision quiz
              </button>
            </div>
          )}

          {/* Chat Input Bar */}
          <div className="p-3 sm:p-4 bg-white dark:bg-[#1b1b1b] border-t border-gray-200 dark:border-[#2d2d2d]">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendChatMessage();
              }}
              className="flex items-center gap-2"
            >
              <input
                id="input-lecture-chat"
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Ask anything about this lecture's concepts, transcript, or takeaways..."
                disabled={isChatLoading}
                className="input flex-1 py-2.5 text-sm"
              />
              <button
                id="btn-send-lecture-chat"
                type="submit"
                disabled={isChatLoading || !chatInput.trim()}
                className="btn-primary py-2.5 px-4 flex items-center gap-1.5 shrink-0"
              >
                {isChatLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                <span className="hidden sm:inline">Ask</span>
              </button>
            </form>
            <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-2 text-center">
              AI Tutor searches this lecture&apos;s transcript and links answers to the passages it retrieved.
            </p>
          </div>
        </div>
      )}

      {/* Bookmark Creation Modal (Part 9) */}
      {bookmarkModalOpen && activeSegmentForBookmark && (
        <div
          id="modal-create-bookmark"
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in"
        >
          <div className="surface max-w-md w-full rounded-lg p-6 space-y-4 shadow-xl">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="h-9 w-9 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center justify-center shrink-0">
                  <Bookmark className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Bookmark Lecture Section</h3>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 font-normal">
                    Time: {formatSeconds(activeSegmentForBookmark.start)} &ndash; {formatSeconds(activeSegmentForBookmark.end)}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setBookmarkModalOpen(false)}
                className="text-gray-400 dark:text-gray-500 hover:text-white p-1 rounded-lg"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {bookmarkError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300">
                {bookmarkError}
              </div>
            )}

            <div className="space-y-3 text-xs">
              <div className="space-y-1">
                <label className="text-gray-700 dark:text-gray-300 font-semibold block">Title</label>
                <input
                  type="text"
                  value={bookmarkTitle}
                  onChange={(e) => setBookmarkTitle(e.target.value)}
                  placeholder="e.g. Concept Overview or Exam Note"
                  className="input"
                />
              </div>

              <div className="space-y-1">
                <label className="text-gray-700 dark:text-gray-300 font-semibold block">Study Note (Optional)</label>
                <textarea
                  rows={3}
                  value={bookmarkNote}
                  onChange={(e) => setBookmarkNote(e.target.value)}
                  placeholder="Add your study takeaways, questions, or revision reminders..."
                  className="input leading-relaxed"
                />
              </div>

              <div className="p-2.5 rounded-md surface-raised text-[11px] text-gray-600 dark:text-gray-400 line-clamp-2 italic font-sans">
                "{activeSegmentForBookmark.text}"
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                onClick={() => setBookmarkModalOpen(false)}
                disabled={isSavingBookmark}
                className="btn-ghost"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveBookmark}
                disabled={isSavingBookmark}
                className="btn-primary"
              >
                {isSavingBookmark ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Bookmark className="h-3.5 w-3.5" />
                    <span>Save Bookmark</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Destructive Lecture Deletion Confirmation Modal (Part 9) */}
      {showDeleteModal && (
        <div
          id="modal-confirm-delete-lecture"
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in"
        >
          <div className="surface max-w-md w-full rounded-lg p-6 space-y-4 shadow-xl">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20 flex items-center justify-center shrink-0">
                <ShieldAlert className="h-5 w-5" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Delete This Lecture?</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  This destructive operation permanently removes this lecture session.
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl surface-raised border-gray-100 dark:border-[#333333] text-xs space-y-1.5">
              <p className="text-slate-200 font-semibold truncate">
                {lecture?.title}
              </p>
              <p className="text-[11px] text-gray-500 dark:text-gray-400">
                All associated generated records will be purged: ASR transcripts, academic summary, key concepts, conceptual relationships, interactive learning map, and bookmarks.
              </p>
            </div>

            {deleteLectureError && (
              <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300">
                {deleteLectureError}
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setShowDeleteModal(false)}
                disabled={isDeletingLecture}
                className="btn-ghost"
              >
                Cancel
              </button>
              <button
                id="btn-confirm-delete-lecture-detail"
                onClick={handleConfirmDeleteLecture}
                disabled={isDeletingLecture}
                className="btn-danger"
              >
                {isDeletingLecture ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>Confirm Delete</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Export Lecture Materials Modal (Part 10) */}
      {exportModalOpen && (
        <div
          id="modal-export-materials"
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in"
        >
          <div className="surface max-w-xl w-full rounded-lg p-6 space-y-5 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="h-10 w-10 rounded-xl bg-brand-500/10 text-brand-400 border border-brand-500/20 flex items-center justify-center shrink-0">
                  <Download className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Export Lecture Materials</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Generate professionally formatted study materials and clean data exports.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setExportModalOpen(false)}
                className="text-gray-400 dark:text-gray-500 hover:text-white p-1 rounded-lg"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              {/* Printable PDF Study Guide */}
              <button
                id="btn-export-pdf"
                onClick={() => {
                  handlePrintStudyGuide();
                  setExportModalOpen(false);
                }}
                className="flex flex-col items-start p-4 rounded-lg bg-gray-50 dark:bg-[#2a2a2a] hover:bg-gray-100 dark:hover:bg-[#333333] border border-gray-200 dark:border-[#333333] text-left transition-colors group"
              >
                <div className="flex items-center gap-2 mb-1.5 text-brand-400 group-hover:text-brand-300 font-semibold">
                  <Printer className="h-4 w-4" />
                  <span>Printable Study Guide / PDF</span>
                </div>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed">
                  Beautifully styled academic report with title, summary, concepts, relationships, and highlighted transcript. Print or save to PDF directly.
                </p>
              </button>

              {/* Markdown Study Guide */}
              <button
                id="btn-export-markdown-guide"
                onClick={() => {
                  handleExportStudyGuideMd();
                  setExportModalOpen(false);
                }}
                className="flex flex-col items-start p-4 rounded-lg bg-gray-50 dark:bg-[#2a2a2a] hover:bg-gray-100 dark:hover:bg-[#333333] border border-gray-200 dark:border-[#333333] text-left transition-colors group"
              >
                <div className="flex items-center gap-2 mb-1.5 text-indigo-400 group-hover:text-indigo-300 font-semibold">
                  <FileText className="h-4 w-4" />
                  <span>Study Guide (.md)</span>
                </div>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed">
                  Comprehensive markdown bundle ready for Obsidian, Notion, or GitHub markdown renderers.
                </p>
              </button>

              {/* Clean Transcript Text */}
              <button
                id="btn-export-transcript-txt"
                onClick={() => {
                  handleExportTranscriptTxt();
                  setExportModalOpen(false);
                }}
                className="flex flex-col items-start p-4 rounded-lg bg-gray-50 dark:bg-[#2a2a2a] hover:bg-gray-100 dark:hover:bg-[#333333] border border-gray-200 dark:border-[#333333] text-left transition-colors group"
              >
                <div className="flex items-center gap-2 mb-1.5 text-emerald-400 group-hover:text-emerald-300 font-semibold">
                  <FileText className="h-4 w-4" />
                  <span>Dialogue Transcript (.txt)</span>
                </div>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed">
                  Raw timestamped speaker dialogue in clean plain text format.
                </p>
              </button>

              {/* Summary & Concepts Markdown */}
              <button
                id="btn-export-summary-md"
                onClick={() => {
                  handleExportSummaryMd();
                  setExportModalOpen(false);
                }}
                className="flex flex-col items-start p-4 rounded-lg bg-gray-50 dark:bg-[#2a2a2a] hover:bg-gray-100 dark:hover:bg-[#333333] border border-gray-200 dark:border-[#333333] text-left transition-colors group"
              >
                <div className="flex items-center gap-2 mb-1.5 text-amber-400 group-hover:text-amber-300 font-semibold">
                  <BookOpen className="h-4 w-4" />
                  <span>Executive Summary (.md)</span>
                </div>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed">
                  Focused synthesis of the lecture's executive summary and key concept definitions.
                </p>
              </button>

              {/* Sanitized Graph Dataset JSON */}
              <button
                id="btn-export-json"
                onClick={() => {
                  handleExportJson();
                  setExportModalOpen(false);
                }}
                className="flex flex-col items-start p-4 rounded-lg bg-gray-50 dark:bg-[#2a2a2a] hover:bg-gray-100 dark:hover:bg-[#333333] border border-gray-200 dark:border-[#333333] text-left transition-colors group sm:col-span-2"
              >
                <div className="flex items-center gap-2 mb-1.5 text-cyan-400 group-hover:text-cyan-300 font-semibold">
                  <FileCode className="h-4 w-4" />
                  <span>Sanitized Knowledge Graph Dataset (.json)</span>
                </div>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed">
                  Developer and researcher friendly JSON structure containing validated concepts, directed relationships, bookmarks, and transcript with student notes. Stripped of internal database IDs.
                </p>
              </button>
            </div>

            <div className="p-3 rounded-xl surface-raised border-gray-100 dark:border-[#333333] text-[11px] text-gray-500 dark:text-gray-400 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                <span>Strictly sanitized — no internal database IDs or credentials exposed</span>
              </span>
              <button
                onClick={() => setExportModalOpen(false)}
                className="px-3 py-1 rounded-lg text-xs font-semibold text-gray-700 dark:text-gray-300 hover:text-white bg-slate-800 hover:bg-slate-700 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Ask AI Tutor Assistant Button */}
      {activeTab !== 'chat' && (
        <button
          id="btn-floating-ai-tutor"
          onClick={() => setActiveTab('chat')}
          className="fixed bottom-6 right-6 z-40 bg-emerald-700 hover:bg-emerald-800 text-white py-3 px-4 rounded-full shadow-2xl flex items-center gap-2.5 transition-all hover:scale-105 active:scale-95 group border border-emerald-500/40"
          title="Open AI Lecture Tutor"
        >
          <Bot className="h-5 w-5 animate-pulse" />
          <span className="text-xs font-semibold tracking-wide">Ask AI Tutor</span>
          <span className="h-2 w-2 rounded-full bg-emerald-300 group-hover:scale-125 transition-transform" />
        </button>
      )}

      {/* eSewa Top-Up Payment Modal */}
      <PaymentModal
        isOpen={showPaymentModal}
        onClose={() => setShowPaymentModal(false)}
        defaultReason={paymentModalReason}
      />
    </div>
  );
}
