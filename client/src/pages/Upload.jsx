import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import PaymentModal from '../components/PaymentModal';
import AnalysisProgressBar, { DEFAULT_ANALYSIS_STAGES, TRANSCRIPTION_STAGES } from '../components/AnalysisProgressBar';
import {
  createLectureApi,
  transcribeLectureApi,
  getSubjectsApi,
  analyzeLectureApi,
  extractRelationshipsApi,
  generateLearningMapApi
} from '../services/api';
import {
  UploadCloud,
  FileAudio,
  AlertCircle,
  Loader2,
  CheckCircle2,
  ArrowRight,
  Calendar,
  GraduationCap,
  Sparkles,
  FileText,
  Copy,
  Trash2,
  BrainCircuit,
  Lightbulb
} from 'lucide-react';

const SAMPLE_TRANSCRIPT = `Welcome back everyone. Today we are exploring the architecture of Modern Transformer Neural Networks and the core Self-Attention Mechanism that powers modern large language models.

Let's begin by understanding why recurrent architectures like RNNs and LSTMs hit a fundamental computational bottleneck. In an RNN, hidden states are computed sequentially: h_t depends strictly on h_{t-1}. This sequential dependency prevents parallel execution across GPU cores during training and struggles to maintain long-range dependencies because gradients vanish or explode over long time horizons.

The Transformer architecture, introduced by Vaswani and colleagues in 2017, replaces recurrence entirely with the Attention Mechanism. The mathematical foundation rests upon three vector projections derived from each token embedding: Query (Q), Key (K), and Value (V).

To calculate Scaled Dot-Product Attention:
Attention(Q, K, V) = softmax( (Q * K^T) / sqrt(d_k) ) * V

Why do we scale by the square root of the dimension d_k? When the dimension is large, dot products grow substantially in magnitude. Large values push the softmax function into regions with extremely small gradients, leading to vanishing gradient problems during backpropagation. The scaling factor maintains unit variance and stable gradient flow.

Furthermore, instead of performing a single attention function, Multi-Head Attention projects Queries, Keys, and Values linearly h times with different learned parameter matrices. Each attention head operates in parallel, enabling the network to jointly attend to information from different representation subspaces at different positions. For example, one head might focus on syntactic subject-verb agreements, while another captures semantic coreference resolution.

These representations then pass through residual connections with Layer Normalization, followed by position-wise Feed-Forward Networks. Because attention has no inherent concept of order, Positional Encodings—either sinusoidal or learned rotary embeddings—are injected into the input embeddings to provide spatial and temporal sequence awareness.

In summary, the synergy of Self-Attention, Multi-Head projections, Positional Encodings, and parallel feed-forward layers allows Transformers to scale efficiently across massive datasets, paving the way for modern generative artificial intelligence.`;



export default function Upload() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { credits, updateCredits } = useAuth();
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentModalReason, setPaymentModalReason] = useState('');
  const fileInputRef = useRef(null);

  // Active Mode: 'audio' | 'transcript'
  const initialMode = searchParams.get('mode') === 'transcript' ? 'transcript' : 'audio';
  const [activeMode, setActiveMode] = useState(initialMode);

  // General fields
  const [title, setTitle] = useState('');
  const [subjects, setSubjects] = useState([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState(searchParams.get('subjectId') || '');
  const [lectureDate, setLectureDate] = useState(new Date().toISOString().split('T')[0]);

  // Audio Upload fields
  const [selectedFile, setSelectedFile] = useState(null);
  const [audioDuration, setAudioDuration] = useState(null);
  const [audioPreviewUrl, setAudioPreviewUrl] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [status, setStatus] = useState('IDLE'); // 'IDLE' | 'UPLOADING' | 'TRANSCRIBING' | 'SUCCESS' | 'FAILED'
  const [errorMessage, setErrorMessage] = useState('');

  // Transcription & Analysis Progress Tracking
  const [transcriptionProgress, setTranscriptionProgress] = useState(0);
  const [transcriptionStageIndex, setTranscriptionStageIndex] = useState(0);
  const [transcriptionElapsed, setTranscriptionElapsed] = useState(0);
  const [transcriptAnalysisProgress, setTranscriptAnalysisProgress] = useState(0);
  const [transcriptAnalysisStageIndex, setTranscriptAnalysisStageIndex] = useState(0);
  const [transcriptAnalysisElapsed, setTranscriptAnalysisElapsed] = useState(0);

  useEffect(() => {
    if (!selectedFile) {
      setAudioPreviewUrl('');
      setAudioDuration(null);
      return undefined;
    }
    const url = URL.createObjectURL(selectedFile);
    setAudioPreviewUrl(url);

    const tempAudio = new Audio(url);
    tempAudio.addEventListener('loadedmetadata', () => {
      if (tempAudio.duration && Number.isFinite(tempAudio.duration)) {
        setAudioDuration(Math.round(tempAudio.duration));
      }
    });

    return () => URL.revokeObjectURL(url);
  }, [selectedFile]);

  // Paste Transcript fields
  const [transcriptText, setTranscriptText] = useState('');
  const [isAnalyzingTranscript, setIsAnalyzingTranscript] = useState(false);
  const [transcriptStep, setTranscriptStep] = useState('');

  // Sync mode with URL
  const switchMode = (mode) => {
    setActiveMode(mode);
    setErrorMessage('');
    const newParams = new URLSearchParams(searchParams);
    newParams.set('mode', mode);
    setSearchParams(newParams);
  };

  useEffect(() => {
    getSubjectsApi()
      .then((res) => {
        if (res?.success) {
          setSubjects(res.subjects || []);
        }
      })
      .catch(() => {});
  }, []);

  // Compute live word and character counts for transcript
  const transcriptWordCount = transcriptText.trim()
    ? transcriptText.trim().split(/\s+/).filter(Boolean).length
    : 0;
  const transcriptCharCount = transcriptText.length;

  // Audio Selection Handlers
  const handleFileSelect = (file) => {
    setErrorMessage('');
    if (!file) return;

    const validExtensions = /\.(mp3|wav|m4a|aac|ogg|webm|flac)$/i;
    if (!validExtensions.test(file.name)) {
      setErrorMessage('Please select a valid audio file (MP3, WAV, M4A, AAC, OGG, or WEBM).');
      return;
    }

    if (file.size > 100 * 1024 * 1024) {
      setErrorMessage('File size exceeds the 100MB limit.');
      return;
    }

    setSelectedFile(file);
    if (!title.trim()) {
      const cleanName = file.name.replace(/\.[^/.]+$/, '').replace(/[_-]+/g, ' ');
      setTitle(cleanName.charAt(0).toUpperCase() + cleanName.slice(1));
    }
  };

  const handleLoadSampleAudio = async () => {
    try {
      const res = await fetch('/sample_lecture.wav');
      const blob = await res.blob();
      const sampleFile = new File([blob], 'sample_lecture.wav', { type: 'audio/wav' });
      setSelectedFile(sampleFile);
      if (!title.trim()) {
        setTitle('Introduction to Computational Complexity');
      }
    } catch (err) {
      console.error('Failed to load sample audio:', err);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  // Submit Audio Upload
  const handleAudioSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage('');

    if (!selectedFile) {
      setErrorMessage('Please select an audio file to upload.');
      return;
    }

    if (!title.trim()) {
      setErrorMessage('Please enter a lecture title.');
      return;
    }

    let progressTimer = null;
    try {
      setStatus('UPLOADING');
      setTranscriptionProgress(10);
      setTranscriptionStageIndex(0);
      setTranscriptionElapsed(0);

      const startTime = Date.now();
      progressTimer = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        setTranscriptionElapsed(elapsed);

        if (elapsed < 4) {
          setTranscriptionStageIndex(0);
          setTranscriptionProgress(Math.min(25, 10 + elapsed * 4));
        } else if (elapsed < 10) {
          setTranscriptionStageIndex(1);
          setTranscriptionProgress(Math.min(50, 25 + (elapsed - 4) * 4.2));
        } else if (elapsed < 22) {
          setTranscriptionStageIndex(2);
          setTranscriptionProgress(Math.min(80, 50 + (elapsed - 10) * 2.5));
        } else {
          setTranscriptionStageIndex(3);
          setTranscriptionProgress(Math.min(96, 80 + (elapsed - 22) * 1.1));
        }
      }, 500);

      const createRes = await createLectureApi({
        title: title.trim(),
        originalFileName: selectedFile.name,
        duration: audioDuration || undefined,
        subjectId: selectedSubjectId || null,
        lectureDate: lectureDate || new Date().toISOString().split('T')[0]
      });

      const lectureId = createRes?.lecture?.id;
      if (!lectureId) {
        throw new Error('Failed to create lecture session.');
      }

      setStatus('TRANSCRIBING');
      const formData = new FormData();
      formData.append('audio', selectedFile);

      const transcribeRes = await transcribeLectureApi(lectureId, formData);

      if (transcribeRes?.success) {
        clearInterval(progressTimer);
        setTranscriptionProgress(100);
        setTranscriptionStageIndex(3);
        setStatus('SUCCESS');
        setTimeout(() => {
          navigate(`/lectures/${lectureId}`);
        }, 900);
      } else {
        throw new Error(transcribeRes?.error?.message || 'Transcription failed.');
      }
    } catch (err) {
      if (progressTimer) clearInterval(progressTimer);
      console.error('Upload/transcription error:', err);
      setStatus('FAILED');
      setErrorMessage(err.message || 'An unexpected error occurred during transcription.');
    }
  };

  // Load sample transcript text
  const handleLoadSampleTranscript = () => {
    setTranscriptText(SAMPLE_TRANSCRIPT);
    if (!title.trim()) {
      setTitle('Transformer Architectures & Self-Attention');
    }
  };

  // Submit Pasted Transcript with Full AI Analysis
  const handleTranscriptSubmit = async (autoAnalyze = true) => {
    setErrorMessage('');

    const cleanText = transcriptText.trim();
    if (!cleanText) {
      setErrorMessage('Please paste a lecture transcript before analyzing.');
      return;
    }

    // Auto-generate title if empty
    let finalTitle = title.trim();
    if (!finalTitle) {
      const firstLine = cleanText.split(/\r?\n/).map((l) => l.trim()).find((l) => l.length > 0);
      finalTitle = firstLine ? firstLine.slice(0, 60).replace(/[#*_-]/g, '').trim() : 'Pasted Lecture';
    }

    let progressTimer = null;
    try {
      setIsAnalyzingTranscript(true);
      setTranscriptAnalysisProgress(12);
      setTranscriptAnalysisStageIndex(0);
      setTranscriptAnalysisElapsed(0);

      const startTime = Date.now();
      progressTimer = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        setTranscriptAnalysisElapsed(elapsed);

        if (elapsed < 3) {
          setTranscriptAnalysisStageIndex(0);
          setTranscriptAnalysisProgress(Math.min(25, 12 + elapsed * 4));
        } else if (elapsed < 8) {
          setTranscriptAnalysisStageIndex(1);
          setTranscriptAnalysisProgress(Math.min(55, 25 + (elapsed - 3) * 6));
        } else if (elapsed < 14) {
          setTranscriptAnalysisStageIndex(2);
          setTranscriptAnalysisProgress(Math.min(80, 55 + (elapsed - 8) * 4.1));
        } else {
          setTranscriptAnalysisStageIndex(3);
          setTranscriptAnalysisProgress(Math.min(96, 80 + (elapsed - 14) * 2));
        }
      }, 500);

      // Step 1: Create Lecture and Transcript record
      setTranscriptStep('Saving lecture and transcript...');
      const createRes = await createLectureApi({
        title: finalTitle,
        transcriptText: cleanText,
        subjectId: selectedSubjectId || null,
        lectureDate: lectureDate || new Date().toISOString().split('T')[0]
      });

      const lectureId = createRes?.lecture?.id;
      if (!lectureId) {
        throw new Error('Failed to create lecture session from transcript.');
      }

      if (!autoAnalyze) {
        if (progressTimer) clearInterval(progressTimer);
        // Just save and redirect immediately
        setTranscriptStep('Redirecting to lecture...');
        navigate(`/lectures/${lectureId}`);
        return;
      }

      // Step 2: Analyze Lecture (Summary & Key Concepts)
      setTranscriptStep('Extracting academic summary and key concepts with Gemini AI...');
      let analysisRes = null;
      try {
        analysisRes = await analyzeLectureApi(lectureId);
        if (analysisRes?.credits !== undefined) {
          updateCredits(analysisRes.credits);
        }
      } catch (aiErr) {
        console.warn('Analysis step warning:', aiErr);
        if (aiErr?.status === 402 || aiErr?.data?.error?.code === 'INSUFFICIENT_CREDITS') {
          if (progressTimer) clearInterval(progressTimer);
          setPaymentModalReason(aiErr.message || 'Your lecture transcript was saved, but analyzing it requires credits. Please top up with eSewa to unlock AI summaries & mind maps.');
          setShowPaymentModal(true);
          setIsAnalyzingTranscript(false);
          setTranscriptStep('');
          setTimeout(() => {
            navigate(`/lectures/${lectureId}`);
          }, 1200);
          return;
        }
      }

      // Step 3: Extract Concept Relationships & Learning Map
      const extractedConcepts = analysisRes?.concepts || [];
      if (extractedConcepts.length >= 2) {
        setTranscriptStep('Mapping conceptual relationships...');
        try {
          await extractRelationshipsApi(lectureId);
        } catch (relErr) {
          console.warn('Relationship extraction warning:', relErr);
        }

        setTranscriptStep('Synthesizing interactive knowledge learning map...');
        try {
          await generateLearningMapApi(lectureId);
        } catch (mapErr) {
          console.warn('Learning map generation warning:', mapErr);
        }
      }

      if (progressTimer) clearInterval(progressTimer);
      setTranscriptAnalysisProgress(100);
      setTranscriptStep('Analysis complete! Redirecting...');
      setTimeout(() => {
        navigate(`/lectures/${lectureId}`);
      }, 700);
    } catch (err) {
      if (progressTimer) clearInterval(progressTimer);
      console.error('Direct transcript analysis error:', err);
      setErrorMessage(err.message || 'An error occurred while analyzing the transcript.');
      setIsAnalyzingTranscript(false);
      setTranscriptStep('');
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Page Header with Credits Balance */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-slate-900 dark:text-zinc-100 tracking-tight">
            Add Lecture
          </h1>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
            Transcribe recorded audio or paste an existing transcript to generate summaries and learning maps
          </p>
        </div>

        {/* Clean Credit Balance & Top Up Widget */}
        <div className="self-start sm:self-auto flex items-center gap-2 shrink-0">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40 shadow-xs text-xs whitespace-nowrap">
            <span className="text-sm">🪙</span>
            <span className="font-bold text-amber-900 dark:text-amber-200">{credits} Credits</span>
            <span className="text-amber-300 dark:text-amber-700">|</span>
            <span className="text-[11px] text-amber-700 dark:text-amber-400">5 / analysis</span>
          </div>

          <button
            type="button"
            onClick={() => {
              setPaymentModalReason('');
              setShowPaymentModal(true);
            }}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 active:scale-95 text-white text-xs font-semibold shadow-sm transition-all whitespace-nowrap cursor-pointer"
          >
            <span>+ Top Up</span>
          </button>
        </div>
      </div>

      {/* Mode Switcher Tabs */}
      <div className="flex items-center gap-2 p-1 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 w-fit">
        <button
          type="button"
          id="tab-mode-audio"
          onClick={() => switchMode('audio')}
          disabled={status === 'UPLOADING' || status === 'TRANSCRIBING' || isAnalyzingTranscript}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
            activeMode === 'audio'
              ? 'bg-white dark:bg-slate-900 text-teal-700 dark:text-teal-300 shadow-sm border border-slate-200 dark:border-slate-700'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          <FileAudio className="h-3.5 w-3.5" />
          <span>Upload Audio Recording</span>
        </button>

        <button
          type="button"
          id="tab-mode-transcript"
          onClick={() => switchMode('transcript')}
          disabled={status === 'UPLOADING' || status === 'TRANSCRIBING' || isAnalyzingTranscript}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
            activeMode === 'transcript'
              ? 'bg-white dark:bg-slate-900 text-teal-700 dark:text-teal-300 shadow-sm border border-slate-200 dark:border-slate-700'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          <Sparkles className="h-3.5 w-3.5 text-teal-600 dark:text-teal-400" />
          <span>Paste Transcript Directly</span>
        </button>
      </div>

      <div className="surface rounded-lg p-6 space-y-5">
        {errorMessage && (
          <div className="alert alert-error">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* ======================================================== */}
        {/* MODE 1: AUDIO UPLOAD                                     */}
        {/* ======================================================== */}
        {activeMode === 'audio' && (
          <form onSubmit={handleAudioSubmit} className="space-y-5">
            {/* Audio Dropzone */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border border-dashed rounded-lg p-8 text-center space-y-3 cursor-pointer transition-colors ${
                dragOver
                  ? 'border-emerald-600 bg-emerald-50/50 dark:bg-emerald-950/20'
                  : selectedFile
                  ? 'border-emerald-600/50 bg-emerald-50/40 dark:bg-emerald-950/20'
                  : 'border-gray-300 dark:border-[#333333] hover:border-gray-400 dark:hover:border-gray-500 bg-gray-50/60 dark:bg-[#1A1A1A]'
              }`}
            >
              <input
                ref={fileInputRef}
                id="audio-file-input"
                type="file"
                accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.webm,.flac"
                className="hidden"
                onChange={(e) => handleFileSelect(e.target.files[0])}
              />

              <div
                className={`h-10 w-10 rounded-md mx-auto flex items-center justify-center transition-colors ${
                  selectedFile
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
                    : 'bg-gray-200/80 text-gray-600 dark:bg-[#2a2a2a] dark:text-gray-400'
                }`}
              >
                {selectedFile ? <FileAudio className="h-5 w-5" /> : <UploadCloud className="h-5 w-5" />}
              </div>

              {selectedFile ? (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400 flex items-center justify-center gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    <span>{selectedFile.name}</span>
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB &bull; Click to change file
                  </p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-slate-700 dark:text-zinc-200">
                    Choose audio file or drag & drop here
                  </p>
                  <p className="text-[11px] text-slate-500">
                    MP3, WAV, M4A, AAC, OGG, WEBM (up to 100MB)
                  </p>
                  <div className="pt-2">
                    <button
                      type="button"
                      id="btn-use-sample-audio"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleLoadSampleAudio();
                      }}
                      className="btn-secondary"
                    >
                      <span>Use Sample Audio</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Lecture Metadata */}
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                Lecture Title <span className="text-emerald-700 dark:text-emerald-400">*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Introduction to Computational Complexity"
                required
                disabled={status === 'UPLOADING' || status === 'TRANSCRIBING'}
                className="input"
              />
            </div>

            {/* Subject & Lecture Date Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5 flex items-center gap-1.5">
                  <GraduationCap className="w-3.5 h-3.5 text-gray-500 dark:text-gray-400" />
                  <span>Subject (Optional)</span>
                </label>
                <select
                  value={selectedSubjectId}
                  onChange={(e) => setSelectedSubjectId(e.target.value)}
                  disabled={status === 'UPLOADING' || status === 'TRANSCRIBING'}
                  className="input cursor-pointer"
                >
                  <option value="">None (Independent Lecture)</option>
                  {subjects
                    .filter((s) => s.isTeacher || s.role === 'TEACHER' || s.userRole === 'TEACHER')
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.code ? `[${s.code}] ` : ''}{s.name}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-gray-500 dark:text-gray-400" />
                  <span>Lecture Date</span>
                </label>
                <input
                  type="date"
                  required
                  value={lectureDate}
                  onChange={(e) => setLectureDate(e.target.value)}
                  disabled={status === 'UPLOADING' || status === 'TRANSCRIBING'}
                  className="input"
                />
              </div>
            </div>

            {/* Real-time Transcription Progress Indicator */}
            {(status === 'UPLOADING' || status === 'TRANSCRIBING') && (
              <AnalysisProgressBar
                progress={transcriptionProgress}
                currentStageIndex={transcriptionStageIndex}
                stages={TRANSCRIPTION_STAGES}
                elapsedSeconds={transcriptionElapsed}
                lectureTitle={title || selectedFile?.name}
                durationSeconds={audioDuration}
                requiredCredits={audioDuration ? Math.max(1, Math.ceil((audioDuration / 60) / 10)) : null}
                isComplete={status === 'SUCCESS'}
              />
            )}

            {status === 'SUCCESS' && (
              <div className="p-4 rounded-xl border border-teal-500/30 bg-teal-500/10 flex items-center gap-3 animate-fadeIn">
                <CheckCircle2 className="h-5 w-5 text-teal-400 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-teal-200">Transcription Succeeded!</p>
                  <p className="text-xs text-teal-300/80">Dialogue segments parsed. Loading lecture workspace...</p>
                </div>
              </div>
            )}

            {/* Action Button */}
            <div className="pt-1">
              <button
                type="submit"
                id="btn-submit-audio-upload"
                disabled={!selectedFile || !title.trim() || status === 'UPLOADING' || status === 'TRANSCRIBING'}
                className="btn-primary w-full py-2"
              >
                {status === 'UPLOADING' || status === 'TRANSCRIBING' ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Processing...</span>
                  </>
                ) : (
                  <>
                    <span>Upload & Transcribe</span>
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </div>

            {selectedFile && audioPreviewUrl && (
              <div className="rounded-md border border-gray-200 dark:border-[#333333] p-3 space-y-2">
                <p className="text-xs font-medium text-gray-700 dark:text-gray-300">Listen to your recording</p>
                <audio controls preload="metadata" src={audioPreviewUrl} className="w-full" />
                <p className="text-[11px] text-gray-500">Listen to your audio before uploading it for transcription.</p>
              </div>
            )}
          </form>
        )}

        {/* ======================================================== */}
        {/* MODE 2: PASTE TRANSCRIPT & ANALYZE                       */}
        {/* ======================================================== */}
        {activeMode === 'transcript' && (
          <div className="space-y-5">
            {/* Metadata Section */}
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Lecture Title
                </label>
                <input
                  type="text"
                  id="input-transcript-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Transformer Architectures & Self-Attention (or leave blank to auto-detect)"
                  disabled={isAnalyzingTranscript}
                  className="input"
                />
              </div>

              {/* Subject & Lecture Date Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5 flex items-center gap-1.5">
                    <GraduationCap className="w-3.5 h-3.5 text-gray-500 dark:text-gray-400" />
                    <span>Subject (Optional)</span>
                  </label>
                  <select
                    id="select-transcript-subject"
                    value={selectedSubjectId}
                    onChange={(e) => setSelectedSubjectId(e.target.value)}
                    disabled={isAnalyzingTranscript}
                    className="input cursor-pointer"
                  >
                    <option value="">None (Independent Lecture)</option>
                    {subjects
                      .filter((s) => s.isTeacher || s.role === 'TEACHER' || s.userRole === 'TEACHER')
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.code ? `[${s.code}] ` : ''}{s.name}
                        </option>
                      ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-gray-500 dark:text-gray-400" />
                    <span>Lecture Date</span>
                  </label>
                  <input
                    type="date"
                    id="input-transcript-date"
                    required
                    value={lectureDate}
                    onChange={(e) => setLectureDate(e.target.value)}
                    disabled={isAnalyzingTranscript}
                    className="input"
                  />
                </div>
              </div>
            </div>

            {/* Transcript Textarea Section */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
                  Lecture Transcript <span className="text-emerald-700 dark:text-emerald-400">*</span>
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    id="btn-insert-sample-transcript"
                    onClick={handleLoadSampleTranscript}
                    disabled={isAnalyzingTranscript}
                    className="text-xs text-emerald-700 dark:text-emerald-400 hover:underline font-medium inline-flex items-center gap-1"
                  >
                    <Lightbulb className="h-3 w-3" />
                    <span>Insert Sample Transcript</span>
                  </button>
                  {transcriptText && (
                    <button
                      type="button"
                      id="btn-clear-transcript"
                      onClick={() => setTranscriptText('')}
                      disabled={isAnalyzingTranscript}
                      className="text-xs text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400 inline-flex items-center gap-1"
                      title="Clear text"
                    >
                      <Trash2 className="h-3 w-3" />
                      <span>Clear</span>
                    </button>
                  )}
                </div>
              </div>

              <textarea
                id="textarea-pasted-transcript"
                rows={12}
                value={transcriptText}
                onChange={(e) => setTranscriptText(e.target.value)}
                placeholder="Paste the full lecture transcript here... (e.g. from YouTube captions, Zoom/Teams transcript, audio transcription tools, or classroom notes)"
                disabled={isAnalyzingTranscript}
                className="input font-mono text-xs leading-relaxed resize-y p-3"
              />

              {/* Counters */}
              <div className="flex items-center justify-between text-[11px] text-gray-500 dark:text-gray-400 px-1">
                <span>
                  {transcriptWordCount.toLocaleString()} words &bull; {transcriptCharCount.toLocaleString()} characters
                </span>
                {transcriptWordCount > 0 && (
                  <span className="text-emerald-700 dark:text-emerald-400">
                    Est. lecture duration: ~{Math.max(1, Math.round(transcriptWordCount / 130))} min
                  </span>
                )}
              </div>
            </div>

            {/* Real-time Analysis Progress Card */}
            {isAnalyzingTranscript && (
              <AnalysisProgressBar
                progress={transcriptAnalysisProgress}
                currentStageIndex={transcriptAnalysisStageIndex}
                stages={DEFAULT_ANALYSIS_STAGES}
                elapsedSeconds={transcriptAnalysisElapsed}
                lectureTitle={title || 'Pasted Lecture'}
                durationSeconds={Math.max(60, Math.round((transcriptWordCount / 130) * 60))}
                requiredCredits={Math.max(1, Math.ceil(Math.max(1, Math.round(transcriptWordCount / 130)) / 10))}
                isComplete={transcriptAnalysisProgress >= 100}
              />
            )}

            {/* Action Buttons */}
            <div className="pt-2 flex flex-col sm:flex-row items-center justify-end gap-2.5">
              <button
                type="button"
                id="btn-save-transcript-only"
                onClick={() => handleTranscriptSubmit(false)}
                disabled={!transcriptText.trim() || isAnalyzingTranscript}
                className="btn-secondary w-full sm:w-auto py-2"
                title="Save the lecture and transcript to edit or review before running AI analysis"
              >
                <span>Save Transcript Only</span>
              </button>

              <button
                type="button"
                id="btn-analyze-pasted-transcript"
                onClick={() => handleTranscriptSubmit(true)}
                disabled={!transcriptText.trim() || isAnalyzingTranscript}
                className="btn-primary w-full sm:w-auto py-2 flex items-center justify-center gap-2"
              >
                {isAnalyzingTranscript ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Analyzing with AI...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    <span>
                      Analyze Transcript (
                      {Math.max(1, Math.ceil(Math.max(1, Math.round(transcriptWordCount / 130)) / 10))}{' '}
                      {Math.max(1, Math.ceil(Math.max(1, Math.round(transcriptWordCount / 130)) / 10)) === 1
                        ? 'Credit'
                        : 'Credits'}
                      )
                    </span>
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* eSewa Payment & Top-Up Modal */}
      <PaymentModal
        isOpen={showPaymentModal}
        onClose={() => setShowPaymentModal(false)}
        defaultReason={paymentModalReason}
      />
    </div>
  );
}
