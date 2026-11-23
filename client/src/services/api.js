/**
 * Centralized API service client for communicating with the LectureMind Express backend
 * Always sends credentials (HTTP-only cookies)
 */
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';
export const getLectureAudioUrl = (id) => `${API_BASE_URL}/lectures/${encodeURIComponent(id)}/audio`;

/**
 * Common fetch wrapper with credentials and JSON parsing
 */
async function request(endpoint, options = {}) {
  const url = `${API_BASE_URL}${endpoint}`;
  const isFormData = options.body instanceof FormData;

  const config = {
    ...options,
    credentials: 'include', // Ensures HTTP-only cookies are sent and received
    headers: {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...(options.headers || {})
    }
  };

  const response = await fetch(url, config);
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const errorMsg = data?.error?.message || data?.message || `HTTP ${response.status}`;
    const err = new Error(errorMsg);
    err.status = response.status;
    err.data = data;
    throw err;
  }

  return data;
}

// Health Check
export const checkHealth = () => request('/health');

// Authentication API
export const loginApi = (credentials) =>
  request('/auth/login', {
    method: 'POST',
    body: JSON.stringify(credentials)
  });

export const registerApi = (userData) =>
  request('/auth/register', {
    method: 'POST',
    body: JSON.stringify(userData)
  });

export const sendRegistrationOtpApi = (userData) =>
  request('/auth/send-registration-otp', {
    method: 'POST',
    body: JSON.stringify(userData)
  });

export const googleAuthApi = (payload) =>
  request('/auth/google', {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const getMeApi = () => request('/auth/me');

export const updateProfileApi = (profileData) =>
  request('/auth/profile', {
    method: 'PUT',
    body: JSON.stringify(profileData)
  });

export const completeOnboardingApi = (onboardingData) =>
  request('/auth/onboarding', {
    method: 'POST',
    body: JSON.stringify(onboardingData)
  });

export const logoutApi = () =>
  request('/auth/logout', {
    method: 'POST'
  });

// Lectures API (Protected by User Ownership)
export const getLecturesApi = (searchQuery) =>
  request(searchQuery ? `/lectures?search=${encodeURIComponent(searchQuery)}` : '/lectures');

export const createLectureApi = (data) => {
  if (data instanceof FormData) {
    return request('/lectures', {
      method: 'POST',
      body: data
    });
  }
  return request('/lectures', {
    method: 'POST',
    body: JSON.stringify(data)
  });
};

export const getLectureByIdApi = (id) => request(`/lectures/${id}`);

export const deleteLectureApi = (id) =>
  request(`/lectures/${id}`, {
    method: 'DELETE'
  });

// Automatic Speech Recognition & Transcription API
export const transcribeLectureApi = (id, audioFormData) =>
  request(`/lectures/${id}/transcribe`, {
    method: 'POST',
    body: audioFormData
  });

export const getTranscriptApi = (id) => request(`/lectures/${id}/transcript`);

export const updateTranscriptApi = (id, data) =>
  request(`/lectures/${id}/transcript`, {
    method: 'PUT',
    body: JSON.stringify(data)
  });

// Gemini 2.5 Pro Lecture Analysis API (Part 6)
export const analyzeLectureApi = (id) =>
  request(`/lectures/${id}/analyze`, {
    method: 'POST'
  });

export const getLectureSummaryApi = (id) => request(`/lectures/${id}/summary`);

export const getLectureConceptsApi = (id) => request(`/lectures/${id}/concepts`);

// AI Concept Relationship Extraction API (Part 7)
export const extractRelationshipsApi = (id) =>
  request(`/lectures/${id}/relationships`, {
    method: 'POST'
  });

export const getLectureRelationshipsApi = (id) => request(`/lectures/${id}/relationships`);

// Interactive Learning Map API (Part 8)
export const getLearningMapApi = (id) => request(`/lectures/${id}/learning-map`);

export const generateLearningMapApi = (id) =>
  request(`/lectures/${id}/learning-map`, {
    method: 'POST'
  });

export const updateLearningMapApi = (id, mapData) =>
  request(`/lectures/${id}/learning-map`, {
    method: 'PUT',
    body: JSON.stringify({ mapData })
  });

// AI Diagnostic Status
export const getAiStatusApi = () => request('/ai/status');

// Bookmarks API (Part 9)
export const getBookmarksApi = (id) => request(`/lectures/${id}/bookmarks`);

export const createBookmarkApi = (id, data) =>
  request(`/lectures/${id}/bookmarks`, {
    method: 'POST',
    body: JSON.stringify(data)
  });

export const deleteBookmarkApi = (id, bookmarkId) =>
  request(`/lectures/${id}/bookmarks/${bookmarkId}`, {
    method: 'DELETE'
  });

// Lecture Export API (Part 10)
export const exportLectureApi = (id, format = 'json') =>
  request(`/lectures/${id}/export?format=${encodeURIComponent(format)}`);

// RAG Conversational AI Tutor & Lecture Q&A
export const chatWithLectureApi = (id, data) =>
  request(`/lectures/${id}/chat`, {
    method: 'POST',
    body: JSON.stringify(data)
  });

export const askResearchLabApi = (question, subjectId = null, history = []) =>
  request('/research/ask', {
    method: 'POST',
    body: JSON.stringify({
      question,
      ...(subjectId ? { subjectId } : {}),
      history
    })
  });

// Subjects & Classroom Management
export const getSubjectsApi = () => request('/subjects');

export const getSubjectByIdApi = (id) => request(`/subjects/${id}`);

export const createSubjectApi = (data) =>
  request('/subjects', {
    method: 'POST',
    body: JSON.stringify(data)
  });

export const joinSubjectApi = (inviteCode) =>
  request('/subjects/join', {
    method: 'POST',
    body: JSON.stringify({ inviteCode })
  });

export const getSubjectPreviewApi = (inviteCode) =>
  request(`/subjects/invite/${encodeURIComponent(inviteCode)}`);

export const deleteSubjectApi = (id) =>
  request(`/subjects/${id}`, {
    method: 'DELETE'
  });

// eSewa Payments & Credits API
export const getPaymentPackagesApi = () => request('/payments/packages');

export const initiatePaymentApi = (packageId) =>
  request('/payments/initiate', {
    method: 'POST',
    body: JSON.stringify({ packageId })
  });

export const verifyPaymentApi = (payload) =>
  request('/payments/verify', {
    method: 'POST',
    body: JSON.stringify(payload)
  });

export const getCreditHistoryApi = () => request('/payments/history');

