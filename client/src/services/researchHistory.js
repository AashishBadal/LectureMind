const STORAGE_PREFIX = 'lecturemind_research_sessions_';

/**
 * Load all stored research sessions for a given user.
 */
export function getResearchSessions(userId = 'default') {
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${userId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error('Failed to load research sessions:', err);
    return [];
  }
}

/**
 * Persist research sessions for a given user.
 */
export function saveResearchSessions(userId = 'default', sessions = []) {
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${userId}`, JSON.stringify(sessions));
  } catch (err) {
    console.error('Failed to save research sessions:', err);
  }
}

/**
 * Creates a new session object.
 */
export function createNewSession({ initialQuestion = '', subjectId = null, initialMessages = [] } = {}) {
  const id = `session-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const title = initialQuestion
    ? formatTitle(initialQuestion)
    : 'New research chat';

  return {
    id,
    title,
    subjectId: subjectId || null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    messages: initialMessages
  };
}

/**
 * Cleanly format a session title from a user's question.
 */
export function formatTitle(question) {
  if (!question || typeof question !== 'string') return 'New research chat';
  const trimmed = question.trim().replace(/^([a-z])/i, (m) => m.toUpperCase());
  if (trimmed.length <= 44) return trimmed;
  return trimmed.slice(0, 44).trim() + '…';
}

/**
 * Format relative session timestamp for display in the history list.
 */
export function formatSessionDate(timestamp) {
  if (!timestamp) return '';
  const now = new Date();
  const date = new Date(timestamp);
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

  if (diffMins < 2) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24 && now.getDate() === date.getDate()) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  if (diffHours < 48 && now.getDate() - date.getDate() === 1) {
    return 'Yesterday';
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}
