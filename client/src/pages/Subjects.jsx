import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  getSubjectsApi,
  createSubjectApi,
  joinSubjectApi
} from '../services/api';
import {
  GraduationCap,
  Plus,
  KeyRound,
  Users,
  BookOpen,
  Copy,
  Check,
  Search,
  ExternalLink,
  ArrowRight,
  X,
  Loader2
} from 'lucide-react';

const THEME_COLORS = [
  { name: 'Blue', value: '#2563eb' },
  { name: 'Emerald', value: '#10b981' },
  { name: 'Amber', value: '#f59e0b' },
  { name: 'Rose', value: '#f43f5e' },
  { name: 'Cyan', value: '#06b6d4' },
];

export default function Subjects() {
  const { user } = useAuth();

  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState('ALL'); // 'ALL' | 'TEACHING' | 'ENROLLED'

  // Modals
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isJoinOpen, setIsJoinOpen] = useState(false);

  // Create form state
  const [createForm, setCreateForm] = useState({
    name: '',
    code: '',
    description: '',
    color: '#2563eb'
  });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState(null);

  // Join form state
  const [inviteCodeInput, setInviteCodeInput] = useState('');
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState(null);

  // Copied feedback tracker
  const [copiedCode, setCopiedCode] = useState(null);

  const fetchSubjects = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await getSubjectsApi();
      if (res?.success) {
        setSubjects(res.subjects || []);
      }
    } catch (err) {
      setError(err.message || 'Failed to load subjects.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSubjects();
  }, []);

  const handleCopyCode = (code) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2500);
  };

  const handleCopyLink = (code) => {
    const inviteUrl = `${window.location.origin}/join/${code}`;
    navigator.clipboard.writeText(inviteUrl);
    setCopiedCode(code + '_link');
    setTimeout(() => setCopiedCode(null), 2500);
  };

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    if (!createForm.name.trim()) return;

    try {
      setCreating(true);
      setCreateError(null);
      const res = await createSubjectApi(createForm);
      if (res?.success) {
        setIsCreateOpen(false);
        setCreateForm({ name: '', code: '', description: '', color: '#2563eb' });
        await fetchSubjects();
      }
    } catch (err) {
      setCreateError(err.message || 'Failed to create subject.');
    } finally {
      setCreating(false);
    }
  };

  const handleJoinSubmit = async (e) => {
    e.preventDefault();
    if (!inviteCodeInput.trim()) return;

    try {
      setJoining(true);
      setJoinError(null);
      const res = await joinSubjectApi(inviteCodeInput.trim());
      if (res?.success) {
        setIsJoinOpen(false);
        setInviteCodeInput('');
        await fetchSubjects();
      }
    } catch (err) {
      setJoinError(err.message || 'Failed to join subject with that code.');
    } finally {
      setJoining(false);
    }
  };

  const filteredSubjects = subjects.filter((s) => {
    const matchesSearch =
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (s.code && s.code.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (s.description && s.description.toLowerCase().includes(searchQuery.toLowerCase()));

    if (!matchesSearch) return false;
    const isSubTeacher = Boolean(s.isTeacher || s.role === 'TEACHER' || s.userRole === 'TEACHER');
    if (filter === 'TEACHING') return isSubTeacher;
    if (filter === 'ENROLLED') return !isSubTeacher;
    return true;
  });

  const totalLecturesAcrossSubjects = subjects.reduce((sum, s) => sum + (s.lectureCount ?? s._count?.lectures ?? 0), 0);
  const totalStudentsEnrolled = subjects.reduce((sum, s) => sum + (s.memberCount ?? s._count?.members ?? 0), 0);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-slate-900 dark:text-zinc-100 tracking-tight">
            Subjects & Coursework
          </h1>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
            Organize lectures into subjects and collaborate with students and instructors
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setJoinError(null); setIsJoinOpen(true); }}
            className="btn-secondary"
          >
            <KeyRound className="w-3.5 h-3.5 text-slate-500 dark:text-zinc-400" />
            <span>Join with Code</span>
          </button>
          <button
            onClick={() => { setCreateError(null); setIsCreateOpen(true); }}
            className="btn-primary"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Subject</span>
          </button>
        </div>
      </div>

      {/* Quick Stats Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="surface rounded-lg p-4 flex items-center gap-3">
          <div className="p-2 rounded-md bg-slate-100 dark:bg-[#18181f] text-slate-600 dark:text-zinc-400">
            <GraduationCap className="w-4 h-4" />
          </div>
          <div>
            <div className="text-lg font-semibold text-slate-900 dark:text-zinc-100">{subjects.length}</div>
            <div className="text-[11px] text-slate-500">Enrolled & Taught</div>
          </div>
        </div>

        <div className="surface rounded-lg p-4 flex items-center gap-3">
          <div className="p-2 rounded-md bg-slate-100 dark:bg-[#18181f] text-slate-600 dark:text-zinc-400">
            <BookOpen className="w-4 h-4" />
          </div>
          <div>
            <div className="text-lg font-semibold text-slate-900 dark:text-zinc-100">{totalLecturesAcrossSubjects}</div>
            <div className="text-[11px] text-slate-500">Total Lectures</div>
          </div>
        </div>

        <div className="surface rounded-lg p-4 flex items-center gap-3">
          <div className="p-2 rounded-md bg-slate-100 dark:bg-[#18181f] text-slate-600 dark:text-zinc-400">
            <Users className="w-4 h-4" />
          </div>
          <div>
            <div className="text-lg font-semibold text-slate-900 dark:text-zinc-100">{totalStudentsEnrolled}</div>
            <div className="text-[11px] text-slate-500">Students & Teachers</div>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="surface p-3 rounded-lg flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-72">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-zinc-500" />
          <input
            type="text"
            placeholder="Search subjects or codes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input pl-8 pr-3 py-1.5"
          />
        </div>

        <div className="flex items-center gap-1 bg-slate-100 dark:bg-[#0a0a0f] p-1 border border-slate-200 dark:border-[#1e1e2a] rounded-md w-full sm:w-auto">
          {[
            { label: 'All', val: 'ALL' },
            { label: 'Teaching', val: 'TEACHING' },
            { label: 'Enrolled', val: 'ENROLLED' }
          ].map((tab) => (
            <button
              key={tab.val}
              onClick={() => setFilter(tab.val)}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                filter === tab.val
                  ? 'bg-white dark:bg-[#18181f] text-slate-900 dark:text-zinc-100 shadow-sm border border-slate-200 dark:border-[#2a2a3a]'
                  : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content Section */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-16">
          <Loader2 className="w-6 h-6 text-blue-600 dark:text-brand-400 animate-spin mb-2" />
          <p className="text-slate-500 text-xs">Loading subjects...</p>
        </div>
      ) : error ? (
        <div className="alert alert-error max-w-md mx-auto">
          <p className="text-xs">{error}</p>
          <button
            onClick={fetchSubjects}
            className="btn-secondary mt-2"
          >
            Retry
          </button>
        </div>
      ) : filteredSubjects.length === 0 ? (
        <div className="surface rounded-lg p-10 text-center space-y-3 max-w-md mx-auto">
          <div className="w-10 h-10 rounded-md bg-slate-100 dark:bg-[#18181f] flex items-center justify-center mx-auto text-slate-500">
            <GraduationCap className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-zinc-200">No subjects found</h3>
            <p className="text-slate-500 dark:text-zinc-400 text-xs">
              {searchQuery
                ? `No subjects match "${searchQuery}".`
                : 'Create a subject or join using an invite code.'}
            </p>
          </div>
          <div className="pt-2 flex items-center justify-center gap-2">
            <button
              onClick={() => setIsCreateOpen(true)}
              className="btn-primary"
            >
              Create Subject
            </button>
            <button
              onClick={() => setIsJoinOpen(true)}
              className="btn-secondary"
            >
              Join with Code
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredSubjects.map((sub) => {
            const isTeacher = Boolean(sub.isTeacher || sub.role === 'TEACHER' || sub.userRole === 'TEACHER');
            const lectureCount = sub.lectureCount ?? sub._count?.lectures ?? 0;
            const studentCount = sub.memberCount ?? sub._count?.members ?? 0;

            return (
              <div
                key={sub.id}
                className="surface rounded-lg p-4 flex flex-col justify-between space-y-3 hover:border-slate-300 dark:hover:border-[#2a2a3a] transition-colors"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-1.5">
                      {sub.code && (
                        <span className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-[#2a2a2a] border border-gray-200 dark:border-[#333333] text-[10px] font-medium text-emerald-800 dark:text-emerald-300">
                          {sub.code}
                        </span>
                      )}
                      <span
                        className={`badge ${
                          isTeacher ? 'badge-warning' : 'badge-info'
                        }`}
                      >
                        {isTeacher ? 'Instructor' : 'Enrolled'}
                      </span>
                    </div>

                    {/* Copy Code */}
                    <button
                      onClick={() => handleCopyCode(sub.inviteCode)}
                      title="Copy invite code"
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-gray-100 dark:bg-[#2a2a2a] hover:bg-gray-200 dark:hover:bg-[#333333] border border-gray-200 dark:border-[#333333] text-[11px] text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 transition-colors"
                    >
                      <KeyRound className="w-3 h-3 text-gray-400 dark:text-gray-500" />
                      <span>{sub.inviteCode}</span>
                      {copiedCode === sub.inviteCode ? (
                        <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                      ) : (
                        <Copy className="w-3 h-3 text-gray-400 dark:text-gray-500" />
                      )}
                    </button>
                  </div>

                  {/* Title & Description */}
                  <Link to={`/subjects/${sub.id}`} className="block hover:text-emerald-700 dark:hover:text-emerald-400 transition-colors">
                    <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 tracking-tight line-clamp-1">
                      {sub.name}
                    </h2>
                  </Link>
                  <p className="mt-1 text-gray-600 dark:text-gray-400 text-xs leading-relaxed line-clamp-2 min-h-[2rem]">
                    {sub.description || 'No description provided.'}
                  </p>

                  {/* Instructor */}
                  <div className="mt-3 flex items-center gap-2 text-[11px] text-gray-500 dark:text-gray-400 pt-2 border-t border-gray-100 dark:border-[#333333]">
                    <div className="w-5 h-5 rounded bg-emerald-100 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 flex items-center justify-center font-medium text-[10px]">
                      {sub.teacher?.name?.[0] || 'T'}
                    </div>
                    <span className="truncate">
                      Taught by <strong className="text-gray-700 dark:text-gray-300 font-medium">{sub.teacher?.name || 'Instructor'}</strong>
                    </span>
                  </div>
                </div>

                {/* Footer */}
                <div className="pt-2.5 border-t border-gray-100 dark:border-[#333333] flex items-center justify-between">
                  <div className="flex items-center gap-2.5 text-[11px] text-slate-500">
                    <span className="flex items-center gap-1">
                      <BookOpen className="w-3 h-3 text-slate-400 dark:text-zinc-500" />
                      <span>{lectureCount} lectures</span>
                    </span>
                    <span className="flex items-center gap-1">
                      <Users className="w-3 h-3 text-slate-400 dark:text-zinc-500" />
                      <span>{studentCount} students</span>
                    </span>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleCopyLink(sub.inviteCode)}
                      title="Copy student invite link"
                      className="p-1 rounded text-slate-500 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-[#18181f] transition-colors"
                    >
                      {copiedCode === sub.inviteCode + '_link' ? (
                        <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                      ) : (
                        <ExternalLink className="w-3.5 h-3.5" />
                      )}
                    </button>

                    <Link
                      to={`/subjects/${sub.id}`}
                      className="btn-secondary"
                    >
                      <span>Open</span>
                      <ArrowRight className="w-3 h-3" />
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* CREATE SUBJECT MODAL */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="surface relative w-full max-w-md rounded-lg p-5 shadow-xl animate-in fade-in">
            <button
              onClick={() => setIsCreateOpen(false)}
              className="absolute right-4 top-4 text-slate-400 hover:text-slate-600 dark:text-zinc-400 dark:hover:text-zinc-200"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="mb-4">
              <h3 className="text-base font-semibold text-slate-900 dark:text-zinc-100">Create New Subject</h3>
              <p className="text-xs text-slate-500 dark:text-zinc-400">You will be designated as instructor for this subject.</p>
            </div>

            {createError && (
              <div className="alert alert-error mb-3">
                {createError}
              </div>
            )}

            <form onSubmit={handleCreateSubmit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-zinc-300 mb-1">
                  Subject Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Distributed Systems"
                  value={createForm.name}
                  onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                  className="input"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-zinc-300 mb-1">
                  Course Code (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. CS-401"
                  value={createForm.code}
                  onChange={(e) => setCreateForm({ ...createForm, code: e.target.value })}
                  className="input"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-zinc-300 mb-1">
                  Course Description (Optional)
                </label>
                <textarea
                  rows={3}
                  placeholder="Brief summary of coursework and objectives..."
                  value={createForm.description}
                  onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                  className="input resize-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-zinc-300 mb-1.5">
                  Color Tag
                </label>
                <div className="flex items-center gap-2.5">
                  {THEME_COLORS.map((tc) => (
                    <button
                      key={tc.value}
                      type="button"
                      onClick={() => setCreateForm({ ...createForm, color: tc.value })}
                      style={{ backgroundColor: tc.value }}
                      className={`w-5 h-5 rounded-full transition-all ${
                        createForm.color === tc.value ? 'ring-2 ring-emerald-600 ring-offset-2 ring-offset-white dark:ring-offset-[#222222]' : 'opacity-60 hover:opacity-100'
                      }`}
                      title={tc.name}
                    />
                  ))}
                </div>
              </div>

              <div className="pt-3 border-t border-gray-200 dark:border-[#333333] flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="btn-ghost"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating || !createForm.name.trim()}
                  className="btn-primary"
                >
                  {creating && <Loader2 className="w-3 h-3 animate-spin" />}
                  <span>{creating ? 'Creating...' : 'Create Subject'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* JOIN WITH CODE MODAL */}
      {isJoinOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="surface relative w-full max-w-sm rounded-lg p-5 shadow-xl animate-in fade-in">
            <button
              onClick={() => setIsJoinOpen(false)}
              className="absolute right-4 top-4 text-gray-400 hover:text-gray-600 dark:text-gray-400 dark:hover:text-gray-200"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="mb-4">
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Join a Subject</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">Enter the invite code from your instructor.</p>
            </div>

            {joinError && (
              <div className="alert alert-error mb-3">
                {joinError}
              </div>
            )}

            <form onSubmit={handleJoinSubmit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Invite Code
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. LM-8A3K9B"
                  value={inviteCodeInput}
                  onChange={(e) => setInviteCodeInput(e.target.value.toUpperCase())}
                  className="input text-center text-sm font-semibold tracking-widest text-emerald-700 dark:text-emerald-400 placeholder-gray-400 font-mono"
                />
              </div>

              <div className="pt-3 border-t border-gray-200 dark:border-[#333333] flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsJoinOpen(false)}
                  className="btn-ghost"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={joining || !inviteCodeInput.trim()}
                  className="btn-primary"
                >
                  {joining && <Loader2 className="w-3 h-3 animate-spin" />}
                  <span>{joining ? 'Joining...' : 'Join'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
