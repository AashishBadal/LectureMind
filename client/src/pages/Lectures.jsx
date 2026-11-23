import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getLecturesApi, deleteLectureApi } from '../services/api';
import {
  BookOpen,
  Upload,
  Clock,
  Tag,
  ArrowRight,
  Loader2,
  AlertCircle,
  Search,
  X,
  Trash2,
  FileText,
  Sparkles,
  Network,
  Bookmark,
  Calendar,
  Plus,
  GraduationCap
} from 'lucide-react';

function StatusBadge({ status }) {
  switch (status) {
    case 'COMPLETED':
    case 'ANALYZED':
      return <span className="badge badge-success">Completed</span>;
    case 'TRANSCRIBING':
    case 'ANALYZING':
    case 'PROCESSING':
      return <span className="badge badge-warning animate-pulse">Processing</span>;
    case 'FAILED':
    case 'ERROR':
      return <span className="badge badge-error">Failed</span>;
    case 'TRANSCRIBED':
      return <span className="badge badge-info">Transcribed</span>;
    default:
      return <span className="badge badge-neutral">{status || 'Pending'}</span>;
  }
}

export default function Lectures() {
  const [lectures, setLectures] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState('ALL'); // 'ALL' | 'PERSONAL' | 'CLASSROOM'
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  // Deletion modal state
  const [lectureToDelete, setLectureToDelete] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [actionSuccessMsg, setActionSuccessMsg] = useState('');

  const personalLectures = lectures.filter((l) => !l.subjectId && !l.subject);
  const classroomLectures = lectures.filter((l) => Boolean(l.subjectId || l.subject));

  const filteredLectures = lectures.filter((l) => {
    if (filter === 'PERSONAL') return !l.subjectId && !l.subject;
    if (filter === 'CLASSROOM') return Boolean(l.subjectId || l.subject);
    return true;
  });

  // Debounce search query input (300ms)
  useEffect(() => {
    setIsSearching(true);
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch lectures whenever debounced query changes
  useEffect(() => {
    let isMounted = true;

    async function loadLectures() {
      try {
        setError('');
        const data = await getLecturesApi(debouncedQuery);
        if (isMounted) {
          setLectures(data?.lectures || []);
        }
      } catch (err) {
        if (isMounted) {
          setError(err.message || 'Failed to retrieve lectures.');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
          setIsSearching(false);
        }
      }
    }

    loadLectures();
    return () => {
      isMounted = false;
    };
  }, [debouncedQuery]);

  // Execute deletion after confirmation
  const handleConfirmDelete = async () => {
    if (!lectureToDelete) return;

    try {
      setIsDeleting(true);
      setDeleteError('');

      await deleteLectureApi(lectureToDelete.id);

      setLectures((prev) => prev.filter((lec) => lec.id !== lectureToDelete.id));
      setActionSuccessMsg(`"${lectureToDelete.title}" was deleted.`);
      setTimeout(() => setActionSuccessMsg(''), 4000);
      setLectureToDelete(null);
    } catch (err) {
      console.error('Delete lecture error:', err);
      setDeleteError(err.message || 'Failed to delete lecture.');
    } finally {
      setIsDeleting(false);
    }
  };

  const getProcessingBadge = (status) => {
    switch (status) {
      case 'TRANSCRIBED':
      case 'COMPLETED':
        return (
          <span className="badge-success">
            COMPLETED
          </span>
        );
      case 'TRANSCRIBING':
      case 'ANALYZING':
      case 'PROCESSING':
        return (
          <span className="badge-warning">
            {status}
          </span>
        );
      case 'UPLOADED':
        return (
          <span className="badge-info">
            UPLOADED
          </span>
        );
      case 'FAILED':
        return (
          <span className="badge-error">
            FAILED
          </span>
        );
      default:
        return (
          <span className="badge-neutral">
            {status || 'PENDING'}
          </span>
        );
    }
  };

  const formatDuration = (seconds) => {
    if (!seconds) return 'Audio attached';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-slate-900 dark:text-zinc-100 tracking-tight">Lectures</h1>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
            All your uploaded classroom sessions, transcripts, and learning maps
          </p>
        </div>
        <Link
          to="/upload"
          id="btn-upload-new-lecture"
          className="btn-primary self-start sm:self-auto"
        >
          <Upload className="h-3.5 w-3.5" />
          <span>Upload Lecture</span>
        </Link>
      </div>

      {/* Action Notifications */}
      {actionSuccessMsg && (
        <div className="alert alert-success">
          <span>{actionSuccessMsg}</span>
        </div>
      )}

      {error && (
        <div className="alert alert-error">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Search & Filter Bar */}
      <div className="surface p-3 rounded-lg flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-zinc-500" />
          <input
            id="input-lecture-search"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by title, transcript, or concepts..."
            className="input pl-8 pr-8 py-1.5"
          />
          {searchQuery && (
            <button
              id="btn-clear-search"
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:text-zinc-500 dark:hover:text-zinc-300 transition-colors"
              title="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto shrink-0">
          <button
            onClick={() => setFilter('ALL')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 ${
              filter === 'ALL'
                ? 'bg-teal-600 text-white shadow-sm'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            All ({lectures.length})
          </button>
          <button
            onClick={() => setFilter('PERSONAL')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 ${
              filter === 'PERSONAL'
                ? 'bg-teal-600 text-white shadow-sm'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            Personal ({personalLectures.length})
          </button>
          <button
            onClick={() => setFilter('CLASSROOM')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 ${
              filter === 'CLASSROOM'
                ? 'bg-teal-600 text-white shadow-sm'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            Classes ({classroomLectures.length})
          </button>
        </div>
      </div>

      {/* Lecture List / Empty States */}
      {loading ? (
        <div className="min-h-[30vh] flex flex-col items-center justify-center space-y-2">
          <Loader2 className="h-6 w-6 text-emerald-700 dark:text-emerald-400 animate-spin" />
          <p className="text-xs text-gray-500 dark:text-gray-400">Loading lectures...</p>
        </div>
      ) : lectures.length === 0 ? (
        debouncedQuery ? (
          /* Empty State: No Search Results */
          <div
            id="empty-state-search"
            className="surface rounded-lg p-10 text-center space-y-3"
          >
            <div className="h-10 w-10 rounded-md bg-gray-100 dark:bg-[#2a2a2a] mx-auto flex items-center justify-center text-gray-500">
              <Search className="h-5 w-5" />
            </div>
            <div className="space-y-1 max-w-sm mx-auto">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-zinc-200">No lectures found</h3>
              <p className="text-xs text-slate-500 dark:text-zinc-400">
                No lectures matched "{debouncedQuery}".
              </p>
            </div>
            <div className="pt-1">
              <button
                id="btn-empty-clear-search"
                onClick={() => setSearchQuery('')}
                className="btn-secondary"
              >
                <X className="h-3 w-3" />
                <span>Clear search</span>
              </button>
            </div>
          </div>
        ) : (
          /* Empty State: No Lectures at all */
          <div
            id="empty-state-no-lectures"
            className="surface rounded-lg p-10 text-center space-y-3"
          >
            <div className="h-10 w-10 rounded-md bg-gray-100 dark:bg-[#2a2a2a] mx-auto flex items-center justify-center text-gray-500">
              <BookOpen className="h-5 w-5" />
            </div>
            <div className="space-y-1 max-w-sm mx-auto">
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">No lectures uploaded</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Upload a recorded lecture to begin generating learning maps.
              </p>
            </div>
            <div className="pt-2">
              <Link
                to="/upload"
                id="btn-empty-upload"
                className="btn-primary"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Upload Lecture</span>
              </Link>
            </div>
          </div>
        )
      ) : filteredLectures.length === 0 ? (
        /* Empty State: Category Filter */
        <div className="surface rounded-lg p-10 text-center space-y-3">
          <div className="h-10 w-10 rounded-md bg-gray-100 dark:bg-[#2a2a2a] mx-auto flex items-center justify-center text-gray-500">
            {filter === 'CLASSROOM' ? <GraduationCap className="h-5 w-5" /> : <BookOpen className="h-5 w-5" />}
          </div>
          <div className="space-y-1 max-w-sm mx-auto">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-zinc-200">
              No {filter === 'PERSONAL' ? 'personal' : 'classroom'} lectures
            </h3>
            <p className="text-xs text-slate-500 dark:text-zinc-400">
              {filter === 'PERSONAL'
                ? "You haven't uploaded any independent personal lectures yet."
                : "You don't have any lectures assigned to a subject or class yet."}
            </p>
          </div>
          <div className="pt-1">
            <button
              onClick={() => setFilter('ALL')}
              className="btn-secondary"
            >
              <span>View all lectures</span>
            </button>
          </div>
        </div>
      ) : (
        /* Lectures Grid */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredLectures.map((lecture) => (
            <div
              key={lecture.id}
              data-lecture-id={lecture.id}
              className="surface rounded-xl p-5 flex flex-col justify-between space-y-4 hover:border-teal-500/40 dark:hover:border-teal-500/40 hover:-translate-y-1 hover:shadow-md transition-all duration-200"
            >
              <div className="space-y-3">
                {/* Header: Status Badge and Date */}
                <div className="flex items-center justify-between gap-2">
                  <StatusBadge status={lecture.status} />
                  <span className="text-[11px] text-slate-400 dark:text-slate-500 flex items-center gap-1 font-mono">
                    <Calendar className="h-3 w-3" />
                    <span>{formatDate(lecture.lectureDate || lecture.createdAt)}</span>
                  </span>
                </div>

                {/* Title & Subject */}
                <div className="space-y-1.5">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 line-clamp-1 tracking-tight">
                    {lecture.title}
                  </h3>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {lecture.subject ? (
                      <Link
                        to={`/subjects/${lecture.subject.id || lecture.subjectId}`}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-teal-700 dark:text-teal-300 hover:underline bg-teal-50 dark:bg-teal-950/40 px-2.5 py-0.5 rounded-md border border-teal-200 dark:border-teal-800/50"
                      >
                        <GraduationCap className="h-3 w-3" />
                        <span>{lecture.subject.code ? `[${lecture.subject.code}] ` : ''}{lecture.subject.name}</span>
                      </Link>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md border border-slate-200 dark:border-slate-700">
                        <BookOpen className="h-3 w-3" />
                        <span>Personal Note</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Metadata Row: Duration, Concepts, Bookmarks */}
                <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400 flex-wrap">
                  <div className="flex items-center gap-1 text-[11px]">
                    <Clock className="h-3 w-3 text-slate-400 dark:text-slate-500" />
                    <span>{formatDuration(lecture.duration)}</span>
                  </div>

                  {lecture.conceptCount > 0 && (
                    <div className="flex items-center gap-1 text-[11px]">
                      <Tag className="h-3 w-3 text-teal-600 dark:text-teal-400" />
                      <span>{lecture.conceptCount} concepts</span>
                    </div>
                  )}

                  {lecture.bookmarkCount > 0 && (
                    <div className="flex items-center gap-1 text-[11px]">
                      <Bookmark className="h-3 w-3 text-amber-500 dark:text-amber-400" />
                      <span>{lecture.bookmarkCount} saved</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Bottom Actions Row */}
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                <button
                  onClick={() => setLectureToDelete(lecture)}
                  className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-red-600 dark:text-zinc-500 dark:hover:text-red-400 p-1 rounded hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors"
                  title="Delete lecture"
                >
                  <Trash2 className="h-3 w-3" />
                  <span className="text-[11px]">Delete</span>
                </button>

                <Link
                  to={`/lectures/${lecture.id}`}
                  className="btn-secondary"
                >
                  <span>Open</span>
                  <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Confirmation Modal */}
      {lectureToDelete && (
        <div
          id="modal-confirm-delete"
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in"
        >
          <div className="surface max-w-sm w-full rounded-lg p-5 space-y-4 shadow-xl">
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-zinc-100">Delete lecture</h3>
              <p className="text-xs text-slate-500 dark:text-zinc-400">
                Are you sure you want to delete <strong className="text-slate-800 dark:text-zinc-200">"{lectureToDelete.title}"</strong>? This will permanently remove its transcript, summary, and learning map.
              </p>
            </div>

            {deleteError && (
              <div className="alert alert-error">
                {deleteError}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                id="btn-cancel-delete"
                onClick={() => setLectureToDelete(null)}
                disabled={isDeleting}
                className="btn-ghost"
              >
                Cancel
              </button>
              <button
                id="btn-confirm-delete"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="btn-danger"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="h-3 w-3" />
                    <span>Delete</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
