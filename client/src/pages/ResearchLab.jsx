import React, { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { askResearchLabApi, getSubjectByIdApi } from '../services/api';
import { useAuth } from '../context/AuthContext';
import {
  getResearchSessions,
  saveResearchSessions,
  createNewSession,
  formatSessionDate
} from '../services/researchHistory';
import {
  ArrowUpRight,
  BookOpen,
  Bot,
  Check,
  ChevronDown,
  ChevronRight,
  Command,
  Edit3,
  GraduationCap,
  History,
  Loader2,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  RotateCcw,
  Search,
  Sparkles,
  Trash2,
  User,
  X
} from 'lucide-react';

const SUGGESTIONS = [
  'How do the lectures define a reliable distributed system?',
  'Which concepts appear across multiple lectures?',
  'Compare the examples used to explain scalability.'
];

function renderInlineFormatted(text) {
  if (!text) return null;
  const pattern = /(\*\*[^*]+\*\*|__[^_]+__|`[^`]+`|\*[^*]+\*|_[^_]+_|\[\d+\])/g;
  const parts = text.split(pattern);

  return parts.map((part, pIdx) => {
    if (!part) return null;

    if (
      (part.startsWith('**') && part.endsWith('**') && part.length >= 4) ||
      (part.startsWith('__') && part.endsWith('__') && part.length >= 4)
    ) {
      return (
        <strong key={pIdx} className="font-semibold text-gray-900 dark:text-gray-100">
          {part.slice(2, -2)}
        </strong>
      );
    }

    if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
      return (
        <code
          key={pIdx}
          className="px-1.5 py-0.5 rounded text-[12px] font-mono bg-gray-100 dark:bg-[#1a2234] text-teal-700 dark:text-teal-300 border border-gray-200 dark:border-teal-900/40"
        >
          {part.slice(1, -1)}
        </code>
      );
    }

    if (
      (part.startsWith('*') && part.endsWith('*') && part.length >= 2) ||
      (part.startsWith('_') && part.endsWith('_') && part.length >= 2)
    ) {
      return (
        <em key={pIdx} className="italic">
          {part.slice(1, -1)}
        </em>
      );
    }

    const citationMatch = part.match(/^\[(\d+)\]$/);
    if (citationMatch) {
      return (
        <span key={pIdx} className="source-ref-badge" title={`Source passage ${citationMatch[1]}`}>
          [{citationMatch[1]}]
        </span>
      );
    }

    return part.replace(/\*\*/g, '').replace(/^\*|\*$/g, '');
  });
}

function CleanMessageContent({ content }) {
  if (!content || typeof content !== 'string') return null;

  const lines = content.split(/\r?\n/);
  const elements = [];
  let currentList = null;
  let elemKey = 0;

  const flushList = () => {
    if (currentList) {
      if (currentList.type === 'bullet') {
        elements.push(
          <ul key={elemKey++} className="space-y-1.5 my-2 pl-2">
            {currentList.items.map((item, idx) => (
              <li key={idx} className="flex items-start gap-2 text-sm leading-relaxed text-gray-800 dark:text-gray-200">
                <span className="text-xs font-bold mt-1 shrink-0 text-teal-600 dark:text-teal-400">•</span>
                <span className="flex-1">{renderInlineFormatted(item)}</span>
              </li>
            ))}
          </ul>
        );
      } else {
        elements.push(
          <ol key={elemKey++} className="space-y-1.5 my-2 pl-2">
            {currentList.items.map((item, idx) => (
              <li key={idx} className="flex items-start gap-2 text-sm leading-relaxed text-gray-800 dark:text-gray-200">
                <span className="text-xs font-semibold mt-0.5 shrink-0 text-teal-600 dark:text-teal-400 font-mono">
                  {idx + 1}.
                </span>
                <span className="flex-1">{renderInlineFormatted(item)}</span>
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

    if (/^[-*=_]{3,}$/.test(trimmed)) {
      flushList();
      elements.push(<hr key={elemKey++} className="my-3 border-gray-200 dark:border-slate-800" />);
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (headingMatch) {
      flushList();
      const level = headingMatch[1].length;
      const headingText = headingMatch[2];
      elements.push(
        <div
          key={elemKey++}
          className={`font-semibold tracking-tight text-gray-900 dark:text-gray-100 ${
            level <= 2 ? 'text-base mt-3 mb-1.5' : 'text-sm mt-2 mb-1'
          }`}
        >
          {renderInlineFormatted(headingText)}
        </div>
      );
      continue;
    }

    const bulletMatch = trimmed.match(/^[\*\-+\u2022]\s+(.+)$/);
    if (bulletMatch) {
      if (!currentList || currentList.type !== 'bullet') {
        flushList();
        currentList = { type: 'bullet', items: [] };
      }
      currentList.items.push(bulletMatch[1]);
      continue;
    }

    const numberMatch = trimmed.match(/^\d+[\.\)]\s+(.+)$/);
    if (numberMatch) {
      if (!currentList || currentList.type !== 'number') {
        flushList();
        currentList = { type: 'number', items: [] };
      }
      currentList.items.push(numberMatch[1]);
      continue;
    }

    flushList();
    elements.push(
      <p key={elemKey++} className="leading-relaxed my-1.5 text-gray-800 dark:text-gray-200">
        {renderInlineFormatted(trimmed)}
      </p>
    );
  }

  flushList();
  return <div className="space-y-1 font-sans">{elements}</div>;
}

export default function ResearchLab() {
  const { id: subjectId } = useParams();
  const { user } = useAuth();
  const userId = user?.id || 'guest';

  // Research Chat Sessions State
  const [sessions, setSessions] = useState(() => getResearchSessions(userId));
  const [currentSessionId, setCurrentSessionId] = useState(null);

  // Search/filter in history list
  const [searchFilter, setSearchFilter] = useState('');
  const [editingTitleId, setEditingTitleId] = useState(null);
  const [editingTitleText, setEditingTitleText] = useState('');

  // UI state
  const [question, setQuestion] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [subject, setSubject] = useState(null);
  const [subjectLoading, setSubjectLoading] = useState(Boolean(subjectId));

  // Collapsible panels
  const [historyOpen, setHistoryOpen] = useState(() => {
    try {
      return localStorage.getItem('lecturemind_research_history_open') !== 'false';
    } catch {
      return true;
    }
  });

  // Collapsible source citations (collapsed by default)
  const [expandedCitations, setExpandedCitations] = useState({});

  const toggleCitations = (msgId) => {
    setExpandedCitations((prev) => ({
      ...prev,
      [msgId]: !prev[msgId]
    }));
  };

  const messagesEndRef = useRef(null);

  // Filter sessions relevant to current subject scope
  const contextSessions = sessions.filter((s) =>
    subjectId ? s.subjectId === subjectId : !s.subjectId
  );

  // Set initial active session when subject or user changes
  useEffect(() => {
    const list = getResearchSessions(userId).filter((s) =>
      subjectId ? s.subjectId === subjectId : !s.subjectId
    );
    if (list.length > 0) {
      setCurrentSessionId(list[0].id);
    } else {
      setCurrentSessionId(null);
    }
  }, [subjectId, userId]);

  // Persist history collapse preference
  useEffect(() => {
    try {
      localStorage.setItem('lecturemind_research_history_open', String(historyOpen));
    } catch {}
  }, [historyOpen]);

  // Fetch subject details if subjectId is provided
  useEffect(() => {
    let active = true;
    if (!subjectId) {
      setSubject(null);
      setSubjectLoading(false);
      setError('');
      return undefined;
    }
    setSubject(null);
    setError('');
    setSubjectLoading(true);
    getSubjectByIdApi(subjectId)
      .then((response) => {
        if (active) setSubject(response?.subject || null);
      })
      .catch((err) => {
        if (active) setError(err.message || 'Unable to load this subject.');
      })
      .finally(() => {
        if (active) setSubjectLoading(false);
      });
    return () => {
      active = false;
    };
  }, [subjectId]);

  // Current active session and messages
  const currentSession = sessions.find((s) => s.id === currentSessionId) || null;
  const messages = currentSession?.messages || [];

  // Auto-scroll when messages update or loading
  useEffect(() => {
    if (messages.length > 0 || loading) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, loading]);

  // Filter displayed sessions by user search
  const displayedSessions = contextSessions.filter((s) => {
    if (!searchFilter.trim()) return true;
    const query = searchFilter.toLowerCase();
    return (
      s.title?.toLowerCase().includes(query) ||
      s.messages?.some((m) => m.content?.toLowerCase().includes(query))
    );
  });

  // Switch to a new chat
  const handleNewChat = () => {
    setCurrentSessionId(null);
    setQuestion('');
    setError('');
  };

  // Select a specific session from history
  const handleSelectSession = (sessionId) => {
    setCurrentSessionId(sessionId);
    setQuestion('');
    setError('');
  };

  // Delete a session
  const handleDeleteSession = (sessionId, event) => {
    event?.stopPropagation();
    const updated = sessions.filter((s) => s.id !== sessionId);
    setSessions(updated);
    saveResearchSessions(userId, updated);

    if (currentSessionId === sessionId) {
      const remainingContext = updated.filter((s) =>
        subjectId ? s.subjectId === subjectId : !s.subjectId
      );
      setCurrentSessionId(remainingContext.length > 0 ? remainingContext[0].id : null);
    }
  };

  // Start inline title editing
  const handleStartRename = (session, event) => {
    event?.stopPropagation();
    setEditingTitleId(session.id);
    setEditingTitleText(session.title);
  };

  // Save inline title editing
  const handleSaveRename = (sessionId, event) => {
    event?.preventDefault();
    event?.stopPropagation();
    if (!editingTitleText.trim()) {
      setEditingTitleId(null);
      return;
    }
    const updated = sessions.map((s) =>
      s.id === sessionId ? { ...s, title: editingTitleText.trim() } : s
    );
    setSessions(updated);
    saveResearchSessions(userId, updated);
    setEditingTitleId(null);
  };

  // Execute research query (creates session if none active, or appends follow-up to active session)
  const runResearch = async (rawQuestion) => {
    const textToSend = rawQuestion?.trim();
    if (!textToSend || loading) return;

    setQuestion('');
    setError('');
    setLoading(true);

    const userMessage = {
      id: `user-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      role: 'user',
      content: textToSend,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    let targetSessionId = currentSessionId;
    let updatedSessionsList = [...sessions];
    let activeSessionObj = currentSession;

    // If no session active, create a new session
    if (!activeSessionObj) {
      const newSession = createNewSession({
        initialQuestion: textToSend,
        subjectId: subjectId || null,
        initialMessages: [userMessage]
      });
      targetSessionId = newSession.id;
      activeSessionObj = newSession;
      updatedSessionsList = [newSession, ...sessions];
    } else {
      // Append user message to active session and move it to top of list
      const updatedMessages = [...activeSessionObj.messages, userMessage];
      const updatedSession = {
        ...activeSessionObj,
        updatedAt: Date.now(),
        messages: updatedMessages
      };
      activeSessionObj = updatedSession;
      updatedSessionsList = [
        updatedSession,
        ...sessions.filter((s) => s.id !== activeSessionObj.id)
      ];
    }

    setSessions(updatedSessionsList);
    setCurrentSessionId(targetSessionId);
    saveResearchSessions(userId, updatedSessionsList);

    // Build history payload from earlier messages in this particular session (up to last 6)
    const existingMessages = currentSession?.messages || [];
    const historyPayload = existingMessages.slice(-6).map((m) => ({
      role: m.role,
      content: m.content
    }));

    try {
      const response = await askResearchLabApi(textToSend, subjectId || null, historyPayload);
      const assistantMessage = {
        id: `ai-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        role: 'assistant',
        content: response.answer,
        citations: response.citations || [],
        suggestedQuestions: response.suggestedQuestions || [],
        indexedLectures: response.indexedLectures,
        searchedLectures: response.searchedLectures,
        retrievedChunks: response.retrievedChunks,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };

      const finalSessionsList = updatedSessionsList.map((s) =>
        s.id === targetSessionId
          ? {
              ...s,
              updatedAt: Date.now(),
              messages: [...s.messages, assistantMessage]
            }
          : s
      );

      setSessions(finalSessionsList);
      saveResearchSessions(userId, finalSessionsList);
    } catch (err) {
      setError(err.message || 'The research query could not be completed.');
      setQuestion(textToSend);
      // Remove unanswered user message
      const rolledBackSessions = updatedSessionsList.map((s) =>
        s.id === targetSessionId
          ? {
              ...s,
              messages: s.messages.filter((m) => m.id !== userMessage.id)
            }
          : s
      );
      setSessions(rolledBackSessions);
      saveResearchSessions(userId, rolledBackSessions);
    } finally {
      setLoading(false);
    }
  };

  const submitQuestion = async (event) => {
    event?.preventDefault();
    await runResearch(question);
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      runResearch(question);
    }
  };

  const toggleHistoryOpen = () => setHistoryOpen((prev) => !prev);

  return (
    <div className="research-page">
      <header className="page-heading">
        <div className="eyebrow">
          <span className="eyebrow-mark" /> {subjectId ? 'SUBJECT WORKSPACE' : 'LIBRARY INTELLIGENCE'}{' '}
          <span className="eyebrow-divider">/</span> RESEARCH LAB
        </div>
        <div className="research-heading-row">
          <div>
            <h1>{subjectId ? `Research ${subject?.name || 'this subject'}.` : 'Ask across your lectures.'}</h1>
            <p>
              {subjectId
                ? `Compare ideas across ${subject?.code ? `${subject.code} ` : ''}lectures. Search is limited to this subject.`
                : 'Connect ideas across classes. Every answer is grounded in passages from your own lecture library.'}
            </p>
          </div>
          <div className="research-heading-actions">
            <button
              onClick={toggleHistoryOpen}
              className="research-sidebar-toggle-btn"
              title={historyOpen ? 'Hide chat history' : `View past chats (${contextSessions.length})`}
            >
              {historyOpen ? <PanelLeftClose size={14} /> : <History size={14} />}
              <span>{historyOpen ? 'Hide chats' : `Chats (${contextSessions.length})`}</span>
            </button>
            <button
              onClick={handleNewChat}
              className="research-sidebar-toggle-btn !bg-teal-600 !text-white hover:!bg-teal-700 !border-teal-600"
              title="Start a new research chat"
            >
              <Plus size={14} />
              <span>New chat</span>
            </button>
            <div className="research-index-chip">
              {subjectId ? <GraduationCap size={14} /> : <BookOpen size={14} />}
              {subjectId ? `${subject?.lectures?.length || 0} lectures in this subject` : 'Personal + classroom transcripts'}
            </div>
          </div>
        </div>
      </header>

      {subjectLoading && (
        <div className="research-loading">
          <Loader2 className="animate-spin" size={17} /> Loading subject scope…
        </div>
      )}

      <div className={`research-layout${!historyOpen ? ' no-history' : ''}`}>
        {/* Left Panel: Chat History (ChatGPT Style) */}
        {historyOpen && (
          <aside className="research-history-sidebar">
            <div className="research-history-header">
              <div className="research-history-title">
                <History size={13} />
                <span>Chat History ({contextSessions.length})</span>
              </div>
              <button
                onClick={toggleHistoryOpen}
                className="research-sidebar-close-btn"
                title="Collapse history"
                aria-label="Collapse history"
              >
                <PanelLeftClose size={14} />
              </button>
            </div>

            <button onClick={handleNewChat} className="research-history-new-btn">
              <Plus size={15} />
              <span>New research chat</span>
            </button>

            {contextSessions.length > 2 && (
              <div className="research-history-search">
                <Search size={13} />
                <input
                  type="text"
                  placeholder="Filter chats…"
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                />
              </div>
            )}

            <div className="research-history-list">
              {displayedSessions.length > 0 ? (
                displayedSessions.map((s) => {
                  const isCurrent = s.id === currentSessionId;
                  const isEditing = editingTitleId === s.id;

                  return (
                    <div
                      key={s.id}
                      onClick={() => handleSelectSession(s.id)}
                      className={`research-history-item${isCurrent ? ' is-active' : ''}`}
                      title={s.title}
                    >
                      <MessageSquare size={14} className="shrink-0 mt-0.5" />
                      <div className="research-history-item-content">
                        {isEditing ? (
                          <form
                            onSubmit={(e) => handleSaveRename(s.id, e)}
                            className="flex items-center gap-1"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <input
                              type="text"
                              value={editingTitleText}
                              onChange={(e) => setEditingTitleText(e.target.value)}
                              autoFocus
                              className="w-full text-xs py-0.5 px-1 bg-white dark:bg-slate-800 border border-teal-500 rounded outline-none"
                            />
                            <button
                              type="submit"
                              className="text-teal-600 dark:text-teal-400 p-0.5 hover:text-teal-700"
                            >
                              <Check size={12} />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingTitleId(null);
                              }}
                              className="text-gray-400 p-0.5 hover:text-gray-600"
                            >
                              <X size={12} />
                            </button>
                          </form>
                        ) : (
                          <>
                            <span className="research-history-item-title">{s.title}</span>
                            <div className="research-history-item-meta">
                              <span>{formatSessionDate(s.updatedAt)}</span>
                              <span>·</span>
                              <span>
                                {s.messages?.filter((m) => m.role === 'user').length || 0} Qs
                              </span>
                            </div>
                          </>
                        )}
                      </div>

                      {!isEditing && (
                        <div className="research-history-item-actions">
                          <button
                            onClick={(e) => handleStartRename(s, e)}
                            className="research-history-item-btn"
                            title="Rename chat"
                          >
                            <Edit3 size={12} />
                          </button>
                          <button
                            onClick={(e) => handleDeleteSession(s.id, e)}
                            className="research-history-item-btn"
                            title="Delete chat"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })
              ) : (
                <div className="research-empty-history">
                  {searchFilter ? 'No matching chats found.' : 'No research chats yet. Ask a question to start one!'}
                </div>
              )}
            </div>
          </aside>
        )}

        {/* Center Main: Conversation View */}
        <main className="research-main">
          {!currentSession || messages.length === 0 ? (
            <>
              <form onSubmit={submitQuestion} className="research-composer">
                <label htmlFor="research-question" className="research-label">
                  <Search size={15} /> Research question
                </label>
                <textarea
                  id="research-question"
                  rows={3}
                  maxLength={2000}
                  value={question}
                  onChange={(event) => setQuestion(event.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={
                    subjectId
                      ? 'Ask a question across this subject’s lectures…'
                      : 'Ask a question that spans your lecture library…'
                  }
                />
                <div className="research-composer-footer">
                  <span>
                    <Command size={12} /> Press Enter to search · Shift+Enter for newline
                  </span>
                  <button
                    type="submit"
                    disabled={!question.trim() || loading || subjectLoading || Boolean(subjectId && !subject)}
                    className="research-submit"
                  >
                    {loading ? <Loader2 className="animate-spin" size={15} /> : <Sparkles size={15} />}
                    {loading ? 'Searching sources' : 'Find evidence'}
                    {!loading && <ArrowUpRight size={14} />}
                  </button>
                </div>
              </form>

              {!loading && !error && (
                <section className="research-starters">
                  <div className="section-kicker">START WITH A QUESTION</div>
                  {SUGGESTIONS.map((suggestion, index) => (
                    <button key={suggestion} onClick={() => runResearch(suggestion)} className="research-starter">
                      <span className="starter-number">0{index + 1}</span>
                      <span>{suggestion}</span>
                      <ChevronRight size={15} />
                    </button>
                  ))}
                </section>
              )}

              {loading && (
                <div className="research-loading">
                  <span className="loading-orbit">
                    <span />
                  </span>
                  <div>
                    <strong>Searching your lecture evidence</strong>
                    <p>
                      {subjectId
                        ? 'Comparing semantic and keyword matches within this subject.'
                        : 'Comparing semantic and keyword matches across accessible transcripts.'}
                    </p>
                  </div>
                </div>
              )}

              {error && <div className="research-error">{error}</div>}
            </>
          ) : (
            <div className="research-thread">
              {/* Active Chat Header */}
              <div className="research-active-chat-header">
                <div className="research-active-chat-info">
                  <h2 className="research-active-chat-title">{currentSession.title}</h2>
                  <div className="research-active-chat-meta">
                    <span>
                      {messages.filter((m) => m.role === 'user').length}{' '}
                      {messages.filter((m) => m.role === 'user').length === 1 ? 'question' : 'questions'}
                    </span>
                    <span>·</span>
                    <span>Last updated {formatSessionDate(currentSession.updatedAt)}</span>
                  </div>
                </div>
                <div className="research-active-chat-actions">
                  <button
                    onClick={handleNewChat}
                    className="research-new-chat-btn"
                    title="Start a new chat"
                  >
                    <Plus size={13} />
                    <span>New chat</span>
                  </button>
                  <button
                    onClick={(e) => handleDeleteSession(currentSession.id, e)}
                    className="research-new-chat-btn !text-rose-600 dark:!text-rose-400 hover:!border-rose-300 dark:hover:!border-rose-800"
                    title="Delete this chat"
                  >
                    <Trash2 size={13} />
                    <span>Delete</span>
                  </button>
                </div>
              </div>

              {/* Messages List */}
              <div className="research-messages-list">
                {messages.map((msg) => {
                  if (msg.role === 'user') {
                    return (
                      <div key={msg.id} className="research-message-user">
                        <div className="research-user-bubble">{msg.content}</div>
                        <div className="research-user-meta">
                          <User size={11} />
                          <span>You</span>
                          {msg.timestamp && <span>· {msg.timestamp}</span>}
                        </div>
                      </div>
                    );
                  }

                  return (
                    <section key={msg.id} className="research-answer">
                      <div className="answer-meta">
                        <div className="flex items-center gap-2">
                          <span className="section-kicker">SYNTHESIS</span>
                          <span className="text-[11px] font-mono text-teal-600 dark:text-teal-400 font-semibold inline-flex items-center gap-1">
                            <Bot size={12} /> Research Assistant
                          </span>
                        </div>
                        <span>
                          {msg.indexedLectures ?? 0} indexed of {msg.searchedLectures || 0} transcripts ·{' '}
                          {msg.retrievedChunks || 0} passages retrieved
                          {msg.timestamp ? ` · ${msg.timestamp}` : ''}
                        </span>
                      </div>

                      <div className="answer-body">
                        <CleanMessageContent content={msg.content} />
                      </div>

                      {msg.citations?.length > 0 ? (
                        <div className="source-list">
                          <button
                            type="button"
                            onClick={() => toggleCitations(msg.id)}
                            className="source-list-header-btn"
                            aria-expanded={Boolean(expandedCitations[msg.id])}
                          >
                            <div className="section-kicker flex items-center gap-2">
                              <BookOpen size={13} />
                              <span>SOURCE PASSAGES</span>
                              <span className="source-count-pill">{msg.citations.length}</span>
                            </div>
                            <div className="source-collapse-indicator">
                              <span>
                                {expandedCitations[msg.id] ? 'Hide sources' : 'View sources'}
                              </span>
                              <ChevronDown
                                size={14}
                                className={`transition-transform duration-200 ${
                                  expandedCitations[msg.id] ? 'rotate-180' : ''
                                }`}
                              />
                            </div>
                          </button>

                          {expandedCitations[msg.id] && (
                            <div className="source-cards-container">
                              {msg.citations.map((source) => (
                                <article key={`${source.lectureId}-${source.label}`} className="source-card">
                                  <div className="source-card-top">
                                    <span className="source-label">{String(source.label).padStart(2, '0')}</span>
                                    <div className="source-title-wrap">
                                      <Link to={`/lectures/${source.lectureId}`} className="source-title">
                                        {source.lectureTitle}
                                      </Link>
                                      <span className="source-meta">
                                        {source.subject?.code || source.subject?.name || 'Personal library'}
                                        {source.timestamp ? ` · ${source.timestamp}` : ''}
                                        {source.speaker ? ` · ${source.speaker}` : ''}
                                      </span>
                                    </div>
                                    <Link
                                      aria-label={`Open ${source.lectureTitle}`}
                                      to={`/lectures/${source.lectureId}`}
                                      className="source-open"
                                    >
                                      <ArrowUpRight size={15} />
                                    </Link>
                                  </div>
                                  <p>{source.text}</p>
                                </article>
                              ))}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="no-evidence-note">
                          No matching indexed passages were found.{' '}
                          {subjectId
                            ? 'Open a lecture in this subject and ask its tutor once to prepare its passages for research.'
                            : 'Open a lecture and ask its tutor once to prepare its passages for library-wide search.'}{' '}
                          <Link to={subjectId ? `/subjects/${subjectId}` : '/lectures'}>
                            {subjectId ? 'Return to subject' : 'Browse your library'} <ArrowUpRight size={12} />
                          </Link>
                        </div>
                      )}

                      {msg.suggestedQuestions?.length > 0 && (
                        <div className="follow-up-questions">
                          <div className="section-kicker">FOLLOW THE THREAD</div>
                          {msg.suggestedQuestions.map((suggestion) => (
                            <button
                              key={suggestion}
                              disabled={loading}
                              onClick={() => runResearch(suggestion)}
                            >
                              <span>{suggestion}</span>
                              <ChevronRight size={14} />
                            </button>
                          ))}
                        </div>
                      )}
                    </section>
                  );
                })}

                {loading && (
                  <div className="research-loading">
                    <span className="loading-orbit">
                      <span />
                    </span>
                    <div>
                      <strong>Searching your lecture evidence</strong>
                      <p>
                        {subjectId
                          ? 'Comparing semantic and keyword matches within this subject.'
                          : 'Comparing semantic and keyword matches across accessible transcripts.'}
                      </p>
                    </div>
                  </div>
                )}

                {error && <div className="research-error">{error}</div>}
                <div ref={messagesEndRef} />
              </div>

              {/* Follow-up Question Composer on this specific chat */}
              <form onSubmit={submitQuestion} className="research-composer research-composer-followup">
                <label htmlFor="research-followup-question" className="research-label">
                  <Search size={14} /> Ask a follow-up question
                </label>
                <textarea
                  id="research-followup-question"
                  rows={2}
                  maxLength={2000}
                  value={question}
                  onChange={(event) => setQuestion(event.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={
                    subjectId
                      ? 'Ask a follow-up across this subject’s lectures…'
                      : 'Ask a follow-up on this topic or across lectures…'
                  }
                />
                <div className="research-composer-footer">
                  <span>
                    <Command size={12} /> Press Enter to send · Shift+Enter for newline
                  </span>
                  <button
                    type="submit"
                    disabled={!question.trim() || loading || subjectLoading}
                    className="research-submit"
                  >
                    {loading ? <Loader2 className="animate-spin" size={15} /> : <Sparkles size={15} />}
                    {loading ? 'Searching sources' : 'Ask follow-up'}
                    {!loading && <ArrowUpRight size={14} />}
                  </button>
                </div>
              </form>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
