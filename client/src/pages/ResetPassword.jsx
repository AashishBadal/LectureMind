import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Eye, EyeOff, CheckCircle2, AlertCircle, Loader2, ArrowRight, ArrowLeft } from 'lucide-react';

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const initialToken = searchParams.get('token') || '';
  const initialEmail = searchParams.get('email') || '';
  const initialOtp = searchParams.get('otp') || '';

  const [email, setEmail] = useState(initialEmail);
  const [otp, setOtp] = useState(initialOtp);
  const [token, setToken] = useState(initialToken);

  const [formData, setFormData] = useState({
    password: '',
    confirmPassword: ''
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleChange = (e) => {
    setError('');
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const cleanOtp = otp.trim().replace(/\D/g, '');

    if (!token && (!email.trim() || cleanOtp.length !== 6)) {
      setError('Please provide your email address and 6-digit verification code.');
      return;
    }

    if (formData.password.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match. Please verify.');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = token
        ? { token, newPassword: formData.password }
        : { email: email.trim().toLowerCase(), otp: cleanOtp, newPassword: formData.password };

      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error?.message || 'Failed to reset password.');
      }

      setIsSuccess(true);
    } catch (err) {
      setError(err.message || 'An error occurred while resetting your password.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-sm mx-auto py-12 px-4">
      <div className="surface rounded-lg p-6 space-y-5">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-zinc-100 tracking-tight">Set new password</h2>
          <p className="text-xs text-slate-500 dark:text-zinc-400">
            {isSuccess
              ? 'Your password has been updated.'
              : 'Enter your verification details and choose a new password.'}
          </p>
        </div>

        {error && (
          <div className="alert alert-error">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {isSuccess ? (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-teal-50 dark:bg-teal-950/20 border border-teal-200 dark:border-teal-800/40 text-center space-y-2">
              <CheckCircle2 className="h-8 w-8 text-teal-600 dark:text-teal-400 mx-auto" />
              <h3 className="text-sm font-semibold text-slate-900 dark:text-zinc-100">Password Updated</h3>
              <p className="text-xs text-slate-600 dark:text-zinc-400">
                You can now sign in using your new credentials.
              </p>
            </div>

            <div className="pt-1">
              <Link
                to="/login"
                id="btn-login-with-new-password"
                className="btn-primary w-full py-2"
              >
                <span>Sign in</span>
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {!token && (
              <>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-zinc-300 mb-1.5">
                    Email Address
                  </label>
                  <input
                    type="email"
                    name="email"
                    id="input-reset-email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="student@university.edu"
                    required
                    disabled={isSubmitting}
                    className="input"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-zinc-300 mb-1.5">
                    6-Digit Code (OTP)
                  </label>
                  <input
                    type="text"
                    name="otp"
                    id="input-reset-otp"
                    maxLength={6}
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="123456"
                    required
                    disabled={isSubmitting}
                    className="input text-center text-lg tracking-[0.3em] font-semibold"
                  />
                </div>
              </>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-zinc-300 mb-1.5">
                New Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  id="input-reset-password"
                  value={formData.password}
                  onChange={handleChange}
                  placeholder="At least 6 characters"
                  required
                  disabled={isSubmitting}
                  className="input pr-10"
                />
                <button
                  type="button"
                  id="btn-toggle-reset-password"
                  onClick={() => setShowPassword(!showPassword)}
                  tabIndex={-1}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 p-1 rounded transition-colors"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-zinc-300 mb-1.5">
                Confirm New Password
              </label>
              <div className="relative">
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  name="confirmPassword"
                  id="input-reset-confirm-password"
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  placeholder="Re-enter password"
                  required
                  disabled={isSubmitting}
                  className="input pr-10"
                />
                <button
                  type="button"
                  id="btn-toggle-reset-confirm-password"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  tabIndex={-1}
                  aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 p-1 rounded transition-colors"
                >
                  {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="pt-1">
              <button
                type="submit"
                id="btn-submit-reset-password"
                disabled={isSubmitting}
                className="btn-primary w-full py-2"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Updating password...</span>
                  </>
                ) : (
                  <>
                    <span>Reset password</span>
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </div>
          </form>
        )}

        <div className="text-center text-xs text-slate-500 dark:text-zinc-400 pt-3 border-t border-slate-200 dark:border-[#1e1e2a]">
          <Link to="/login" className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-200 transition-colors">
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Back to sign in</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
