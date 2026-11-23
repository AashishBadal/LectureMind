import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getSubjectPreviewApi, joinSubjectApi } from '../services/api';
import {
  GraduationCap,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  Loader2,
  LogIn
} from 'lucide-react';

export default function JoinSubject() {
  const { inviteCode } = useParams();
  const navigate = useNavigate();
  const { user, isAuthenticated, loading: authLoading } = useAuth();

  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [joining, setJoining] = useState(false);
  const [joinSuccess, setJoinSuccess] = useState(false);

  useEffect(() => {
    if (!authLoading && !isAuthenticated && inviteCode) {
      navigate(`/login?redirect=/join/${inviteCode}`, { replace: true });
    }
  }, [authLoading, isAuthenticated, inviteCode, navigate]);

  useEffect(() => {
    const fetchPreview = async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await getSubjectPreviewApi(inviteCode);
        if (res?.success) {
          setPreview(res.subject);
        }
      } catch (err) {
        setError(err.message || 'Invalid or expired invite link.');
      } finally {
        setLoading(false);
      }
    };

    if (inviteCode) fetchPreview();
  }, [inviteCode]);

  const handleJoin = async () => {
    try {
      setJoining(true);
      setError(null);
      const res = await joinSubjectApi(inviteCode);
      if (res?.success) {
        setJoinSuccess(true);
        setTimeout(() => {
          navigate(`/subjects/${res.subject?.id || res.subjectId || preview?.id}`);
        }, 1200);
      }
    } catch (err) {
      setError(err.message || 'Failed to join subject.');
      setJoining(false);
    }
  };

  if (loading || authLoading) {
    return (
      <div className="min-h-[40vh] flex flex-col items-center justify-center text-zinc-500">
        <Loader2 className="w-6 h-6 text-brand-400 animate-spin mb-2" />
        <p className="text-xs">Verifying invitation...</p>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto py-10 px-4">
      <div className="surface rounded-lg p-6 text-center space-y-4">
        {error ? (
          <div className="py-4 space-y-3">
            <div className="w-10 h-10 rounded-md bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 flex items-center justify-center mx-auto">
              <AlertCircle className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <h2 className="text-base font-semibold text-slate-900 dark:text-zinc-100">Invitation Invalid</h2>
              <p className="text-slate-600 dark:text-zinc-400 text-xs max-w-xs mx-auto">{error}</p>
            </div>
            <div className="pt-2">
              <Link
                to="/subjects"
                className="btn-secondary"
              >
                <span>Go to Subjects</span>
              </Link>
            </div>
          </div>
        ) : joinSuccess ? (
          <div className="py-4 space-y-3">
            <div className="w-12 h-12 rounded-full bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h2 className="text-base font-semibold text-slate-900 dark:text-zinc-100">Enrollment Confirmed</h2>
              <p className="text-slate-600 dark:text-zinc-400 text-xs">
                You are now enrolled in <strong className="text-slate-900 dark:text-zinc-200">{preview?.name}</strong>.
              </p>
            </div>
            <p className="text-xs text-blue-600 dark:text-blue-400 flex items-center justify-center gap-1.5 pt-1">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Redirecting...</span>
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <div className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 dark:text-blue-400 uppercase tracking-wider">
                <GraduationCap className="w-3.5 h-3.5" />
                <span>Classroom Invitation</span>
              </div>

              <h1 className="text-lg sm:text-xl font-semibold text-slate-900 dark:text-zinc-100 tracking-tight">
                {preview?.name}
              </h1>

              {preview?.code && (
                <div className="inline-block px-2 py-0.5 rounded surface-raised text-xs font-mono font-medium text-slate-700 dark:text-zinc-300">
                  {preview.code}
                </div>
              )}

              <p className="text-slate-600 dark:text-zinc-400 text-xs leading-relaxed max-w-sm mx-auto pt-1">
                {preview?.description || 'You have been invited to participate in this subject.'}
              </p>
            </div>

            {/* Course Metadata */}
            <div className="p-3 rounded-md surface-raised flex items-center justify-around text-xs text-slate-600 dark:text-zinc-300">
              <div>
                <div className="text-slate-400 dark:text-zinc-500 text-[10px]">Instructor</div>
                <div className="font-medium text-slate-800 dark:text-zinc-200 mt-0.5">
                  {preview?.teacherName || preview?.teacher?.name || 'Faculty Member'}
                </div>
              </div>
              <div className="h-6 w-px bg-slate-200 dark:bg-[#282e3f]" />
              <div>
                <div className="text-slate-400 dark:text-zinc-500 text-[10px]">Lectures</div>
                <div className="font-medium text-slate-800 dark:text-zinc-200 mt-0.5">
                  {preview?.lectureCount ?? preview?._count?.lectures ?? 0}
                </div>
              </div>
              <div className="h-6 w-px bg-slate-200 dark:bg-[#282e3f]" />
              <div>
                <div className="text-slate-400 dark:text-zinc-500 text-[10px]">Enrolled</div>
                <div className="font-medium text-slate-800 dark:text-zinc-200 mt-0.5">
                  {preview?.memberCount ?? preview?._count?.members ?? 0}
                </div>
              </div>
            </div>

            {/* Actions depending on Auth status & Membership */}
            {!isAuthenticated ? (
              <div className="space-y-2.5 pt-1">
                <p className="text-xs text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/30 p-2 rounded-md">
                  Please log in or register to join this subject.
                </p>
                <div className="flex items-center justify-center gap-2">
                  <Link
                    to={`/login?redirect=/join/${inviteCode}`}
                    className="btn-primary"
                  >
                    <LogIn className="w-3.5 h-3.5" />
                    <span>Sign In to Join</span>
                  </Link>
                  <Link
                    to={`/register?redirect=/join/${inviteCode}`}
                    className="btn-secondary"
                  >
                    <span>Register</span>
                  </Link>
                </div>
              </div>
            ) : preview?.isAlreadyMember ? (
              <div className="space-y-2.5 pt-1">
                <p className="text-xs text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/30 p-2 rounded-md">
                  You are already enrolled in this subject.
                </p>
                <Link
                  to={`/subjects/${preview.id}`}
                  className="btn-primary w-full py-2 flex items-center justify-center gap-1.5"
                >
                  <span>Go to Subject</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            ) : (
              <div className="pt-1">
                <button
                  onClick={handleJoin}
                  disabled={joining}
                  className="btn-primary w-full py-2"
                >
                  {joining ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Enrolling...</span>
                    </>
                  ) : (
                    <>
                      <span>Join Subject</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
