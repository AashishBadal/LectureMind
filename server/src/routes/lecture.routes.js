import { Router } from 'express';
import {
  getLectures,
  createLecture,
  getLectureById,
  deleteLecture,
  transcribeLecture,
  getLectureAudio,
  getTranscript,
  updateTranscript,
  analyzeLectureController,
  getLectureSummaryController,
  getLectureConceptsController,
  extractRelationshipsController,
  getLectureRelationshipsController,
  generateLearningMapController,
  getLearningMapController,
  updateLearningMapController,
  getBookmarks,
  createBookmark,
  deleteBookmark,
  exportLectureController,
  chatWithLectureController,
  reIndexLecture
} from '../controllers/lecture.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { audioUpload } from '../middleware/upload.js';

const router = Router();

// All lecture routes require authentication
router.use(requireAuth);

// Lecture management
router.get('/', getLectures);
router.post('/', audioUpload.single('audio'), createLecture);
router.get('/:id', getLectureById);
router.delete('/:id', deleteLecture);
router.get('/:id/export', exportLectureController); // Professional Multi-Format Export (Part 10)

// Automatic Speech Recognition & Transcription
router.post('/:id/transcribe', audioUpload.single('audio'), transcribeLecture);
router.get('/:id/audio', getLectureAudio);
router.get('/:id/transcript', getTranscript);
router.put('/:id/transcript', updateTranscript);

// Gemini 2.5 Pro Lecture Analysis (Part 6)
router.post('/:id/analyze', analyzeLectureController);
router.get('/:id/summary', getLectureSummaryController);
router.get('/:id/concepts', getLectureConceptsController);

// AI Concept Relationship Extraction (Part 7)
router.post('/:id/relationships', extractRelationshipsController);
router.get('/:id/relationships', getLectureRelationshipsController);

// Interactive AI-Generated Learning Map (Part 8)
router.post('/:id/learning-map', generateLearningMapController);
router.get('/:id/learning-map', getLearningMapController);
router.put('/:id/learning-map', updateLearningMapController);

// Bookmarking Lecture Sections (Part 9)
router.get('/:id/bookmarks', getBookmarks);
router.post('/:id/bookmarks', createBookmark);
router.delete('/:id/bookmarks/:bookmarkId', deleteBookmark);

// RAG Conversational AI Tutor & Lecture Q&A
router.post('/:id/chat', chatWithLectureController);

// Manual RAG re-index (useful for existing lectures or after transcript updates)
router.post('/:id/index', requireAuth, reIndexLecture);

export default router;


