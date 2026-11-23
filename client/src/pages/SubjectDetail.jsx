import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import AnalysisProgressBar, { DEFAULT_ANALYSIS_STAGES, TRANSCRIPTION_STAGES } from '../components/AnalysisProgressBar';
import {
  getSubjectByIdApi,
  createLectureApi,
  transcribeLectureApi,
  analyzeLectureApi,
  deleteSubjectApi
} from '../services/api';
import {
  Calendar,
  Users,
  Plus,
  KeyRound,
  Copy,
  Check,
  CheckCircle2,
  ExternalLink,
  ArrowLeft,
  FileAudio,
  Network,
  Trash2,
  Clock,
  X,
  Loader2,
  AlertCircle,
  Sparkles,
  FileText,
  Search
} from 'lucide-react';

export default function SubjectDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [subject, setSubject] = useState(null);
  const [dateGroups, setDateGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('TIMELINE'); // 'TIMELINE' | 'STUDENTS'

  // Copy feedback
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  // Add Lecture Modal State
  const [isAddLectureOpen, setIsAddLectureOpen] = useState(false);
  const [lectureForm, setLectureForm] = useState({
    mode: 'audio', // 'audio' | 'transcript'
    title: '',
    lectureDate: new Date().toISOString().split('T')[0],
    file: null,
    transcriptText: ''
  });
  const [audioDuration, setAudioDuration] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [uploadProgressPercent, setUploadProgressPercent] = useState(0);
  const [uploadStageIndex, setUploadStageIndex] = useState(0);
  const [uploadElapsedSeconds, setUploadElapsedSeconds] = useState(0);
  const [isUploadComplete, setIsUploadComplete] = useState(false);
  const progressTimerRef = useRef(null);

  useEffect(() => {
    return () => {
      if (progressTimerRef.current) clearInterval(progressTimerRef.current);
    };
  }, []);

  const resetAddLectureModal = () => {
    if (progressTimerRef.current) {
      clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }
    setIsAddLectureOpen(false);
    setUploading(false);
    setIsUploadComplete(false);
    setUploadError(null);
    setUploadProgressPercent(0);
    setUploadStageIndex(0);
    setUploadElapsedSeconds(0);
    setAudioDuration(null);
    setLectureForm({
      mode: 'audio',
      title: '',
      lectureDate: new Date().toISOString().split('T')[0],
      file: null,
      transcriptText: ''
    });
  };

  const fetchSubject = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await getSubjectByIdApi(id);
      if (res?.success) {
        const sub = res.subject || {};
        setSubject(sub);
        setDateGroups(sub.dateGroups || res.dateGroups || []);
      }
    } catch (err) {
      setError(err.message || 'Failed to load subject details.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (id) fetchSubject();
  }, [id]);

  const handleCopyLink = () => {
    if (!subject?.inviteCode) return;
    const inviteUrl = `${window.location.origin}/join/${subject.inviteCode}`;
    navigator.clipboard.writeText(inviteUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const handleCopyCode = () => {
    if (!subject?.inviteCode) return;
    navigator.clipboard.writeText(subject.inviteCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2500);
  };

  const handleFileChange = (e) => {
    const selected = e.target.files?.[0];
    if (selected) {
      setLectureForm((prev) => ({
        ...prev,
        file: selected,
        title: prev.title.trim() ? prev.title : selected.name.replace(/\.[^/.]+$/, '')
      }));

      // Calculate audio duration
      try {
        const url = URL.createObjectURL(selected);
        const tempAudio = new Audio(url);
        tempAudio.addEventListener('loadedmetadata', () => {
          if (tempAudio.duration && Number.isFinite(tempAudio.duration)) {
            setAudioDuration(Math.round(tempAudio.duration));
          }
          URL.revokeObjectURL(url);
        });
      } catch (err) {
        console.warn('Audio metadata preview error:', err);
      }
    } else {
      setAudioDuration(null);
    }
  };

  const handleAddLectureSubmit = async (e) => {
    e.preventDefault();
    if (!isTeacher) {
      setUploadError('Only instructors can add lectures to this subject.');
      return;
    }
    if (!lectureForm.title.trim()) {
      setUploadError('Lecture title is required.');
      return;
    }

    if (progressTimerRef.current) {
      clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }

    if (lectureForm.mode === 'transcript') {
      if (!lectureForm.transcriptText.trim()) {
        setUploadError('Please paste a lecture transcript.');
        return;
      }

      try {
        setUploading(true);
        setIsUploadComplete(false);
        setUploadError(null);
        setUploadProgressPercent(10);
        setUploadStageIndex(0);
        setUploadElapsedSeconds(0);

        const startTime = Date.now();
        progressTimerRef.current = setInterval(() => {
          const elapsed = Math.floor((Date.now() - startTime) / 1000);
          setUploadElapsedSeconds(elapsed);

          if (elapsed < 3) {
            setUploadStageIndex(0);
            setUploadProgressPercent(Math.min(25, 10 + elapsed * 5));
          } else if (elapsed < 8) {
            setUploadStageIndex(1);
            setUploadProgressPercent(Math.min(55, 25 + (elapsed - 3) * 6));
          } else if (elapsed < 14) {
            setUploadStageIndex(2);
            setUploadProgressPercent(Math.min(80, 55 + (elapsed - 8) * 4.1));
          } else {
            setUploadStageIndex(3);
            setUploadProgressPercent(Math.min(96, 80 + (elapsed - 14) * 2));
          }
        }, 500);

        const createRes = await createLectureApi({
          title: lectureForm.title.trim(),
          transcriptText: lectureForm.transcriptText.trim(),
          subjectId: id,
          lectureDate: lectureForm.lectureDate
        });

        const createdLecture = createRes?.lecture;
        if (!createdLecture?.id) {
          throw new Error('Lecture created but missing ID.');
        }

        try {
          await analyzeLectureApi(createdLecture.id);
        } catch (aiErr) {
          console.warn('Auto-analysis notice:', aiErr);
        }

        if (progressTimerRef.current) {
          clearInterval(progressTimerRef.current);
          progressTimerRef.current = null;
        }
        setUploadProgressPercent(100);
        setUploadStageIndex(3);
        setIsUploadComplete(true);

        setTimeout(async () => {
          resetAddLectureModal();
          await fetchSubject();
        }, 1200);
      } catch (err) {
        if (progressTimerRef.current) {
          clearInterval(progressTimerRef.current);
          progressTimerRef.current = null;
        }
        setUploading(false);
        setIsUploadComplete(false);
        setUploadError(err.message || 'Failed to add lecture transcript.');
      }
      return;
    }

    // Audio upload flow
    if (!lectureForm.file) {
      setUploadError('Please select an audio file for this lecture recording.');
      return;
    }

    try {
      setUploading(true);
      setIsUploadComplete(false);
      setUploadError(null);
      setUploadProgressPercent(10);
      setUploadStageIndex(0);
      setUploadElapsedSeconds(0);

      const startTime = Date.now();
      progressTimerRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        setUploadElapsedSeconds(elapsed);

        if (elapsed < 4) {
          setUploadStageIndex(0);
          setUploadProgressPercent(Math.min(25, 10 + elapsed * 4));
        } else if (elapsed < 10) {
          setUploadStageIndex(1);
          setUploadProgressPercent(Math.min(50, 25 + (elapsed - 4) * 4.2));
        } else if (elapsed < 22) {
          setUploadStageIndex(2);
          setUploadProgressPercent(Math.min(80, 50 + (elapsed - 10) * 2.5));
        } else {
          setUploadStageIndex(3);
          setUploadProgressPercent(Math.min(96, 80 + (elapsed - 22) * 1.1));
        }
      }, 500);

      const formData = new FormData();
      formData.append('audio', lectureForm.file);
      formData.append('title', lectureForm.title.trim());
      formData.append('subjectId', id);
      formData.append('lectureDate', lectureForm.lectureDate);
      if (audioDuration) {
        formData.append('duration', audioDuration);
      }

      const createRes = await createLectureApi(formData);
      const createdLecture = createRes?.lecture;

      if (!createdLecture?.id) {
        throw new Error('Lecture created but missing ID.');
      }

      try {
        const transcribeFormData = new FormData();
        transcribeFormData.append('audio', lectureForm.file);
        await transcribeLectureApi(createdLecture.id, transcribeFormData);
      } catch (transcribeErr) {
        console.warn('Auto-transcribe notice:', transcribeErr);
      }

      if (progressTimerRef.current) {
        clearInterval(progressTimerRef.current);
        progressTimerRef.current = null;
      }
      setUploadProgressPercent(100);
      setUploadStageIndex(3);
      setIsUploadComplete(true);

      setTimeout(async () => {
        resetAddLectureModal();
        await fetchSubject();
      }, 1200);
    } catch (err) {
      if (progressTimerRef.current) {
        clearInterval(progressTimerRef.current);
        progressTimerRef.current = null;
      }
      setUploading(false);
      setIsUploadComplete(false);
      setUploadError(err.message || 'Failed to upload lecture.');
    }
  };

  const handleDeleteSubject = async () => {
    if (!window.confirm('Are you sure you want to delete this subject?')) return;
    try {
      await deleteSubjectApi(id);
      navigate('/subjects');
    } catch (err) {
      alert(err.message || 'Failed to delete subject.');
    }
  };

  if (loading) {
    return (
      <div className="min-h-[40vh] flex flex-col items-center justify-center text-slate-500">
        <Loader2 className="w-6 h-6 text-blue-600 dark:text-brand-400 animate-spin mb-2" />
        <p className="text-xs">Loading subject...</p>
      </div>
    );
  }

  if (error || !subject) {
    return (
      <div className="max-w-sm mx-auto py-12 px-4">
        <div className="surface rounded-lg p-6 text-center space-y-3">
          <AlertCircle className="w-8 h-8 text-red-500 mx-auto" />
          <h2 className="text-base font-semibold text-slate-900 dark:text-zinc-100">Subject Unavailable</h2>
          <p className="text-slate-500 dark:text-zinc-400 text-xs">{error || 'Could not find this subject.'}</p>
          <div className="pt-2">
            <Link
              to="/subjects"
              className="btn-primary"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Subjects</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const isTeacher = Boolean(
    subject.isTeacher ||
    subject.role === 'TEACHER' ||
    subject.userRole === 'TEACHER' ||
    (subject.teacherId && user?.id && subject.teacherId === user?.id) ||
    (subject.teacher?.id && user?.id && subject.teacher.id === user?.id)
  );
  const totalLectures = subject.lectures?.length || 0;
  const totalMembers = subject.members?.length || 0;

  return (
    <div className="space-y-6">
      {/* Navigation Breadcrumb */}
      <div className="flex items-center justify-between">
        <Link
          to="/subjects"
          className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-200 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Subjects</span>
        </Link>

        {isTeacher && (
          <button
            onClick={handleDeleteSubject}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs text-slate-400 hover:text-red-600 dark:text-zinc-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Delete Subject</span>
          </button>
        )}
      </div>

      {/* Subject Header Card */}
      <div className="surface rounded-lg p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              {subject.code && (
                <span className="px-2 py-0.5 rounded bg-gray-100 dark:bg-[#2a2a2a] border border-gray-200 dark:border-[#333333] text-xs font-medium text-emerald-800 dark:text-emerald-300">
                  {subject.code}
                </span>
              )}
              <span
                className={`badge ${
                  isTeacher ? 'badge-warning' : 'badge-info'
                }`}
              >
                {isTeacher ? 'Instructor' : 'Enrolled'}
              </span>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                Instructor: <strong className="text-gray-700 dark:text-gray-300 font-medium">{subject.teacher?.name || 'Instructor'}</strong>
              </span>
            </div>

            <h1 className="text-xl sm:text-2xl font-semibold text-gray-900 dark:text-gray-100 tracking-tight">
              {subject.name}
            </h1>
            <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed max-w-xl">
              {subject.description || 'Classroom lectures, transcripts, and AI learning maps.'}
            </p>

            {/* Invite Code & Link */}
            <div className="pt-2 flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-gray-100 dark:bg-[#222222] border border-gray-200 dark:border-[#333333] text-xs text-gray-700 dark:text-gray-300">
                <KeyRound className="w-3 h-3 text-gray-400 dark:text-gray-500" />
                <span className="text-gray-500">Code:</span>
                <strong className="text-gray-900 dark:text-gray-100 font-medium tracking-wide">{subject.inviteCode}</strong>
                <button
                  onClick={handleCopyCode}
                  title="Copy code"
                  className="ml-1 text-gray-400 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
                >
                  {copiedCode ? <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" /> : <Copy className="w-3 h-3" />}
                </button>
              </div>

              <button
                onClick={handleCopyLink}
                className="btn-secondary"
              >
                {copiedLink ? <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" /> : <ExternalLink className="w-3 h-3 text-gray-400 dark:text-gray-400" />}
                <span>{copiedLink ? 'Link Copied' : 'Copy Invite Link'}</span>
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link to={`/subjects/${id}/research`} className="btn-secondary">
              <Search className="w-3.5 h-3.5" />
              <span>Research Lab</span>
            </Link>
            {isTeacher && (
              <button
                onClick={() => { setUploadError(null); setIsAddLectureOpen(true); }}
                className="btn-primary"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Lecture</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-gray-200 dark:border-[#333333]">
        <button
          onClick={() => setActiveTab('TIMELINE')}
          className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 whitespace-nowrap transition-colors -mb-px ${
            activeTab === 'TIMELINE'
              ? 'border-emerald-700 text-gray-900 dark:border-emerald-500 dark:text-gray-100'
              : 'border-transparent text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200'
          }`}
        >
          <Calendar className="w-3.5 h-3.5" />
          <span>Lectures ({totalLectures})</span>
        </button>

        <button
          onClick={() => setActiveTab('STUDENTS')}
          className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 whitespace-nowrap transition-colors -mb-px ${
            activeTab === 'STUDENTS'
              ? 'border-emerald-700 text-gray-900 dark:border-emerald-500 dark:text-gray-100'
              : 'border-transparent text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          <span>Students ({totalMembers})</span>
        </button>
      </div>

      {/* TAB 1: DATE-BY-DATE LECTURE TIMELINE */}
      {activeTab === 'TIMELINE' && (
        <div>
          {dateGroups.length === 0 ? (
            <div className="surface rounded-lg p-10 text-center space-y-3 max-w-md mx-auto">
              <div className="w-10 h-10 rounded-md bg-slate-100 dark:bg-[#18181f] flex items-center justify-center mx-auto text-slate-500">
                <FileAudio className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-zinc-200">No lectures yet</h3>
                <p className="text-slate-500 dark:text-zinc-400 text-xs">
                  {isTeacher
                    ? "Upload lecture recordings to build this subject's syllabus."
                    : "The instructor has not uploaded any lectures to this subject yet."}
                </p>
              </div>
              {isTeacher && (
                <div className="pt-2">
                  <button
                    onClick={() => setIsAddLectureOpen(true)}
                    className="btn-primary"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Upload First Lecture</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-8">
              {dateGroups.map((group) => (
                <div key={group.date} className="space-y-3">
                  {/* Date Header */}
                  <div className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-zinc-400">
                    <Calendar className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-500" />
                    <span className="text-slate-900 dark:text-zinc-200 font-semibold">{group.formattedDate || group.displayDate || group.date}</span>
                    <span className="text-slate-300 dark:text-zinc-600">&bull;</span>
                    <span className="text-slate-500">{group.lectures.length} {group.lectures.length === 1 ? 'lecture' : 'lectures'}</span>
                  </div>

                  {/* Lectures Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pl-2 sm:pl-4 border-l border-slate-200 dark:border-[#1e1e2a]">
                    {group.lectures.map((lec) => {
                      const conceptsCount = lec.conceptCount || lec._count?.concepts || 0;
                      const relsCount = lec.relationshipCount || lec._count?.relationships || 0;

                      return (
                        <div
                          key={lec.id}
                          className="surface rounded-lg p-4 flex flex-col justify-between space-y-3 hover:border-slate-300 dark:hover:border-[#2a2a3a] transition-colors"
                        >
                          <div>
                            <div className="flex items-center justify-between gap-2 mb-1.5">
                              <span
                                className={`badge ${
                                  lec.status === 'TRANSCRIBED' || lec.status === 'ANALYZED'
                                    ? 'badge-success'
                                    : lec.status === 'FAILED'
                                    ? 'badge-error'
                                    : 'badge-warning'
                                }`}
                              >
                                {lec.status}
                              </span>

                              <span className="text-[11px] text-slate-500 flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {lec.duration ? `${Math.round(lec.duration / 60)} min` : 'Audio'}
                              </span>
                            </div>

                            <Link to={`/lectures/${lec.id}`}>
                              <h3 className="text-sm font-medium text-slate-900 dark:text-zinc-100 hover:text-blue-600 dark:hover:text-brand-300 transition-colors line-clamp-1">
                                {lec.title}
                              </h3>
                            </Link>

                            {lec.originalFileName && (
                              <p className="mt-1 text-slate-500 text-xs truncate flex items-center gap-1">
                                <FileAudio className="w-3 h-3 shrink-0" />
                                <span className="truncate">{lec.originalFileName}</span>
                              </p>
                            )}

                            <div className="mt-2.5 flex items-center gap-2 text-xs">
                              <span className="badge-neutral text-[10px]">
                                {conceptsCount} concepts
                              </span>
                              <span className="badge-neutral text-[10px]">
                                {relsCount} relations
                              </span>
                            </div>
                          </div>

                          <div className="pt-2 border-t border-slate-100 dark:border-[#1e1e2a] flex items-center justify-between">
                            <Link
                              to={`/lectures/${lec.id}`}
                              className="btn-secondary"
                            >
                              <Network className="w-3 h-3 text-slate-400 dark:text-zinc-400" />
                              <span>Learning Map</span>
                            </Link>

                            <Link
                              to={`/lectures/${lec.id}`}
                              className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-200 transition-colors"
                            >
                              <span>View</span>
                              <ExternalLink className="w-3 h-3" />
                            </Link>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: STUDENTS */}
      {activeTab === 'STUDENTS' && (
        <div className="surface rounded-lg p-5 space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-zinc-100">Enrolled Students</h2>
            <p className="text-xs text-slate-500 dark:text-zinc-400">
              Members enrolled in this subject via invite code
            </p>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-[#1e1e2a]">
            {(!subject.members || subject.members.length === 0) ? (
              <div className="py-8 text-center text-xs text-slate-500 dark:text-zinc-400">
                No enrolled students found.
              </div>
            ) : (
              subject.members.map((m) => {
                const studentName = m.name || m.user?.name || (m.email || m.user?.email ? (m.email || m.user?.email).split('@')[0] : 'Student');
                const studentEmail = m.email || m.user?.email || '';
                const initial = studentName[0]?.toUpperCase() || 'U';

                return (
                  <div key={m.id} className="py-3 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded bg-blue-100 dark:bg-blue-600/20 text-blue-700 dark:text-brand-300 font-semibold text-xs flex items-center justify-center">
                        {initial}
                      </div>
                      <div>
                        <div className="text-xs font-medium text-slate-800 dark:text-zinc-200">
                          {studentName}
                        </div>
                        {studentEmail && (
                          <div className="text-[11px] text-slate-500">{studentEmail}</div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span
                        className={`badge ${
                          m.role === 'TEACHER' ? 'badge-warning' : 'badge-info'
                        }`}
                      >
                        {m.role}
                      </span>
                      <span className="text-[11px] text-slate-400 hidden sm:inline-block">
                        {new Date(m.joinedAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ADD LECTURE MODAL */}
      {isAddLectureOpen && isTeacher && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className={`surface relative w-full ${uploading || isUploadComplete ? 'max-w-2xl' : 'max-w-md'} rounded-xl p-5 sm:p-6 shadow-xl transition-all duration-300 animate-in fade-in`}>
            <button
              onClick={() => !uploading && resetAddLectureModal()}
              disabled={uploading}
              className="absolute right-4 top-4 text-slate-400 hover:text-slate-600 dark:text-zinc-400 dark:hover:text-zinc-200 disabled:opacity-50"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="mb-4">
              <h3 className="text-base font-semibold text-slate-900 dark:text-zinc-100">
                {uploading || isUploadComplete ? 'Processing Lecture' : 'Add Lecture for Date'}
              </h3>
              <p className="text-xs text-slate-500 dark:text-zinc-400">
                {uploading || isUploadComplete
                  ? `AI analysis & pipeline ingestion for ${subject?.name}`
                  : `Record audio or paste transcript under ${subject?.name}`}
              </p>
            </div>

            {uploadError && (
              <div className="alert alert-error mb-4">
                {uploadError}
              </div>
            )}

            {uploading || isUploadComplete ? (
              <div className="space-y-4 my-2">
                <AnalysisProgressBar
                  progress={uploadProgressPercent}
                  currentStageIndex={uploadStageIndex}
                  stages={lectureForm.mode === 'audio' ? TRANSCRIPTION_STAGES : DEFAULT_ANALYSIS_STAGES}
                  elapsedSeconds={uploadElapsedSeconds}
                  lectureTitle={lectureForm.title || lectureForm.file?.name}
                  durationSeconds={audioDuration}
                  requiredCredits={audioDuration ? Math.max(1, Math.ceil((audioDuration / 60) / 10)) : null}
                  isComplete={isUploadComplete}
                />
                {isUploadComplete && (
                  <div className="p-3.5 rounded-xl border border-teal-500/30 bg-teal-500/10 flex items-center gap-3 animate-fadeIn">
                    <CheckCircle2 className="h-5 w-5 text-teal-600 dark:text-teal-400 shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-teal-800 dark:text-teal-200">
                        {lectureForm.mode === 'audio' ? 'Audio Transcribed Successfully!' : 'Transcript Analyzed Successfully!'}
                      </p>
                      <p className="text-xs text-teal-700 dark:text-teal-300/80">Updating subject lectures timeline...</p>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <>
                {/* Mode Switcher */}
                <div className="flex items-center gap-1 p-1 mb-4 rounded-md bg-slate-100 dark:bg-[#121218] border border-slate-200 dark:border-[#222230]">
                  <button
                    type="button"
                    onClick={() => setLectureForm({ ...lectureForm, mode: 'audio' })}
                    disabled={uploading}
                    className={`flex-1 py-1 px-2 rounded text-xs font-medium transition-colors flex items-center justify-center gap-1.5 ${
                      lectureForm.mode === 'audio'
                        ? 'bg-white dark:bg-[#1e1e28] text-slate-900 dark:text-zinc-100 shadow-sm'
                        : 'text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200'
                    }`}
                  >
                    <FileAudio className="w-3.5 h-3.5" />
                    <span>Upload Audio</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setLectureForm({ ...lectureForm, mode: 'transcript' })}
                    disabled={uploading}
                    className={`flex-1 py-1 px-2 rounded text-xs font-medium transition-colors flex items-center justify-center gap-1.5 ${
                      lectureForm.mode === 'transcript'
                        ? 'bg-white dark:bg-[#1e1e28] text-slate-900 dark:text-zinc-100 shadow-sm'
                        : 'text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200'
                    }`}
                  >
                    <Sparkles className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    <span>Paste Transcript</span>
                  </button>
                </div>

                <form onSubmit={handleAddLectureSubmit} className="space-y-3.5">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-zinc-300 mb-1">
                      Lecture Date *
                    </label>
                    <input
                      type="date"
                      required
                      value={lectureForm.lectureDate}
                      onChange={(e) => setLectureForm({ ...lectureForm, lectureDate: e.target.value })}
                      className="input"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-zinc-300 mb-1">
                      Lecture Title *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Distributed Consensus & Raft"
                      value={lectureForm.title}
                      onChange={(e) => setLectureForm({ ...lectureForm, title: e.target.value })}
                      className="input"
                    />
                  </div>

                  {lectureForm.mode === 'audio' ? (
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-zinc-300 mb-1">
                        Audio File *
                      </label>
                      <input
                        type="file"
                        required
                        accept="audio/*,.mp3,.m4a,.wav,.ogg,.aac"
                        onChange={handleFileChange}
                        className="w-full text-xs text-slate-600 dark:text-zinc-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-medium file:bg-slate-100 dark:file:bg-[#18181f] file:text-slate-700 dark:file:text-zinc-200 hover:file:bg-slate-200 dark:hover:file:bg-[#1e1e28] file:cursor-pointer cursor-pointer bg-white dark:bg-[#0a0a0f] border border-slate-200 dark:border-[#1e1e2a] rounded-md p-1"
                      />
                      {lectureForm.file && (
                        <p className="mt-1 text-[11px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                          <Check className="w-3 h-3" />
                          <span>
                            Selected: {lectureForm.file.name} ({(lectureForm.file.size / (1024 * 1024)).toFixed(1)} MB)
                            {audioDuration ? ` • ~${Math.max(1, Math.round(audioDuration / 60))} mins` : ''}
                          </span>
                        </p>
                      )}
                    </div>
                  ) : (
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-zinc-300 mb-1">
                        Transcript Text *
                      </label>
                      <textarea
                        rows={6}
                        required
                        placeholder="Paste lecture transcript text here..."
                        value={lectureForm.transcriptText}
                        onChange={(e) => setLectureForm({ ...lectureForm, transcriptText: e.target.value })}
                        className="input font-mono text-xs resize-y"
                      />
                      {lectureForm.transcriptText && (
                        <p className="mt-1 text-[11px] text-slate-500">
                          {lectureForm.transcriptText.trim().split(/\s+/).filter(Boolean).length} words
                        </p>
                      )}
                    </div>
                  )}

                  <div className="pt-3 border-t border-slate-200 dark:border-[#1e1e2a] flex items-center justify-end gap-2">
                    <button
                      type="button"
                      disabled={uploading}
                      onClick={resetAddLectureModal}
                      className="btn-ghost"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={
                        uploading ||
                        !lectureForm.title.trim() ||
                        (lectureForm.mode === 'audio' ? !lectureForm.file : !lectureForm.transcriptText.trim())
                      }
                      className="btn-primary"
                    >
                      <span>
                        {lectureForm.mode === 'transcript'
                          ? 'Add & Analyze'
                          : 'Upload & Transcribe'}
                      </span>
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
