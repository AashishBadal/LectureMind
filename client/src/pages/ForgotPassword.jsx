import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Mail,
  ArrowLeft,
  ArrowRight,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Eye,
  EyeOff,
  RotateCw
} from 'lucide-react';

export default function ForgotPassword() {
  const [step, setStep] = useState('EMAIL'); // 'EMAIL' | 'OTP' | 'SUCCESS'
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  const [error, setError] = useState('');
  const [statusMsg, setStatusMsg] = useState('');

  useEffect(() => {
    let timer;
    if (resendCooldown > 0) {
      timer = setInterval(() => {
        setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [resendCooldown]);

  const handleSendOtp = async (e) => {
    if (e) e.preventDefault();
    setError('');
    setStatusMsg('');

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      setError('Please enter your email address.');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleanEmail })
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error?.message || 'Failed to send verification code.');
      }

      setStatusMsg(`Verification code sent to ${cleanEmail}. Valid for 10 minutes.`);
      setStep('OTP');
      setResendCooldown(60);
    } catch (err) {
      setError(err.message || 'An error occurred while sending the code.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResendOtp = async () => {
    if (resendCooldown > 0 || isResending) return;
    setError('');
    setStatusMsg('');
    setIsResending(true);

    try {
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase() })
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error?.message || 'Failed to resend code.');
      }

      setStatusMsg('A fresh verification code has been dispatched to your email.');
      setResendCooldown(60);
    } catch (err) {
      setError(err.message || 'Failed to resend verification code.');
    } finally {
      setIsResending(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setError('');

    const cleanOtp = otp.trim().replace(/\D/g, '');
    if (cleanOtp.length !== 6) {
      setError('Please enter the complete 6-digit verification code.');
      return;
    }

    if (newPassword.length < 6) {
      setError('New password must be at least 6 characters long.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match. Please verify.');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          otp: cleanOtp,
          newPassword
        })
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error?.message || 'Failed to reset password. Please verify your OTP code.');
      }

      setStep('SUCCESS');
    } catch (err) {
      setError(err.message || 'Invalid or expired verification code.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-sm mx-auto py-12 px-4">
      <div className="surface rounded-lg p-6 space-y-5">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-zinc-100 tracking-tight">
            {step === 'SUCCESS'
              ? 'Password reset'
              : step === 'OTP'
              ? 'Verification code'
              : 'Forgot password'}
          </h2>
          <p className="text-xs text-slate-500 dark:text-zinc-400">
            {step === 'SUCCESS'
              ? 'Your password has been successfully updated.'
              : step === 'OTP'
              ? 'Enter the 6-digit code sent to your email.'
              : 'Enter your email to receive a password reset code.'}
          </p>
        </div>

        {error && (
          <div className="alert alert-error">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {statusMsg && step === 'OTP' && (
          <div className="alert alert-info">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>{statusMsg}</span>
          </div>
        )}

        {/* Step 1: EMAIL */}
        {step === 'EMAIL' && (
          <form onSubmit={handleSendOtp} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-zinc-300 mb-1.5">
                Email Address
              </label>
              <div className="relative">
                <input
                  type="email"
                  name="email"
                  id="input-forgot-email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setError('');
                  }}
                  placeholder="student@university.edu"
                  required
                  disabled={isSubmitting}
                  className="input pr-10"
                />
                <Mail className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 dark:text-zinc-500 pointer-events-none" />
              </div>
            </div>

            <div className="pt-1">
              <button
                type="submit"
                id="btn-send-otp"
                disabled={isSubmitting}
                className="btn-primary w-full py-2"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Sending code...</span>
                  </>
                ) : (
                  <>
                    <span>Send verification code</span>
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </div>
          </form>
        )}

        {/* Step 2: OTP */}
        {step === 'OTP' && (
          <form onSubmit={handleResetPassword} className="space-y-4">
            <div className="flex items-center justify-between text-xs px-0.5">
              <span className="text-slate-500 dark:text-zinc-400">Sent to: <strong className="text-slate-800 dark:text-zinc-200">{email}</strong></span>
              <button
                type="button"
                onClick={() => {
                  setStep('EMAIL');
                  setError('');
                }}
                className="text-teal-600 dark:text-teal-400 hover:underline font-semibold transition-colors"
              >
                Change
              </button>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-zinc-300 mb-1.5">
                6-Digit Code
              </label>
              <input
                type="text"
                name="otp"
                id="input-otp-code"
                maxLength={6}
                value={otp}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, '').slice(0, 6);
                  setOtp(val);
                  setError('');
                }}
                placeholder="123456"
                autoFocus
                required
                disabled={isSubmitting}
                className="input text-center text-lg tracking-[0.3em] font-semibold"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-zinc-300 mb-1.5">
                New Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  name="newPassword"
                  id="input-new-password"
                  value={newPassword}
                  onChange={(e) => {
                    setNewPassword(e.target.value);
                    setError('');
                  }}
                  placeholder="Minimum 6 characters"
                  required
                  disabled={isSubmitting}
                  className="input pr-10"
                />
                <button
                  type="button"
                  id="btn-toggle-new-password"
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
                  id="input-confirm-password"
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    setError('');
                  }}
                  placeholder="Re-enter password"
                  required
                  disabled={isSubmitting}
                  className="input pr-10"
                />
                <button
                  type="button"
                  id="btn-toggle-confirm-password"
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
                disabled={isSubmitting || otp.length !== 6}
                className="btn-primary w-full py-2"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Resetting password...</span>
                  </>
                ) : (
                  <>
                    <span>Reset password</span>
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </div>

            <div className="text-center pt-1">
              <button
                type="button"
                id="btn-resend-otp"
                disabled={resendCooldown > 0 || isResending}
                onClick={handleResendOtp}
                className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isResending ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin" />
                    <span>Sending code...</span>
                  </>
                ) : resendCooldown > 0 ? (
                  <span>Resend code in {resendCooldown}s</span>
                ) : (
                  <>
                    <RotateCw className="h-3 w-3" />
                    <span>Resend code</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}

        {/* Step 3: SUCCESS */}
        {step === 'SUCCESS' && (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-teal-50 dark:bg-teal-950/20 border border-teal-200 dark:border-teal-800/40 text-center space-y-2">
              <CheckCircle2 className="h-8 w-8 text-teal-600 dark:text-teal-400 mx-auto" />
              <h3 className="text-sm font-semibold text-slate-900 dark:text-zinc-100">Password Changed</h3>
              <p className="text-xs text-slate-600 dark:text-zinc-400">
                Your password has been updated. You can now sign in with your new credentials.
              </p>
            </div>

            <div className="pt-1">
              <Link
                to="/login"
                id="btn-goto-login"
                className="btn-primary w-full py-2"
              >
                <span>Sign in</span>
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        )}

        <div className="text-center text-xs text-gray-500 dark:text-gray-400 pt-3 border-t border-gray-200 dark:border-[#333333]">
          <Link
            to="/login"
            className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-200 transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Back to sign in</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
