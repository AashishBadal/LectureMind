import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { GoogleLogin } from '@react-oauth/google';
import { useAuth } from '../context/AuthContext';
import { AlertCircle, Loader2, ArrowRight, Eye, EyeOff, GraduationCap, Mail, ArrowLeft, RefreshCw } from 'lucide-react';

// Step constants
const STEP_FORM = 'FORM';
const STEP_OTP = 'OTP';

export default function Register() {
  const navigate = useNavigate();
  const location = useLocation();
  const { register, sendRegistrationOtp, googleAuth, authError, clearError } = useAuth();

  const searchParams = new URLSearchParams(location.search);
  const redirectUrl = searchParams.get('redirect');
  const from = redirectUrl || '/dashboard';

  // Form step state
  const [step, setStep] = useState(STEP_FORM);

  // Form fields
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: ''
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // OTP step state
  const [otp, setOtp] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const cooldownRef = useRef(null);

  // Shared state
  const [localError, setLocalError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [googleError, setGoogleError] = useState('');

  // Clean up cooldown timer on unmount
  useEffect(() => {
    return () => {
      if (cooldownRef.current) clearInterval(cooldownRef.current);
    };
  }, []);

  const startCooldown = () => {
    setResendCooldown(60);
    if (cooldownRef.current) clearInterval(cooldownRef.current);
    cooldownRef.current = setInterval(() => {
      setResendCooldown((prev) => {
        if (prev <= 1) {
          clearInterval(cooldownRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleChange = (e) => {
    setLocalError('');
    clearError();
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  // Step 1: Send OTP
  const handleFormSubmit = async (e) => {
    e.preventDefault();
    setLocalError('');

    if (!formData.name.trim()) {
      setLocalError('Please enter your full name.');
      return;
    }
    if (!formData.email.trim()) {
      setLocalError('Please enter a valid email address.');
      return;
    }
    if (formData.password.length < 6) {
      setLocalError('Password must be at least 6 characters long.');
      return;
    }
    if (formData.password !== formData.confirmPassword) {
      setLocalError('Passwords do not match. Please verify.');
      return;
    }

    setIsSubmitting(true);
    const result = await sendRegistrationOtp(
      formData.name.trim(),
      formData.email.trim(),
      formData.password
    );
    setIsSubmitting(false);

    if (result.success) {
      setStep(STEP_OTP);
      startCooldown();
    }
  };

  // Step 2: Verify OTP & create account
  const handleOtpSubmit = async (e) => {
    e.preventDefault();
    setLocalError('');

    const cleanOtp = otp.trim().replace(/\D/g, '');
    if (cleanOtp.length !== 6) {
      setLocalError('Please enter the 6-digit verification code from your email.');
      return;
    }

    setIsSubmitting(true);
    const result = await register(formData.email.trim(), cleanOtp);
    setIsSubmitting(false);

    if (result.success) {
      if (result.user && !result.user.onboardingCompleted) {
        navigate(`/onboarding?redirect=${encodeURIComponent(from)}`, { replace: true });
      } else {
        navigate(from, { replace: true });
      }
    }
  };

  // Resend OTP
  const handleResend = async () => {
    if (resendCooldown > 0 || isSubmitting) return;
    setLocalError('');
    clearError();
    setIsSubmitting(true);
    const result = await sendRegistrationOtp(
      formData.name.trim(),
      formData.email.trim(),
      formData.password
    );
    setIsSubmitting(false);
    if (result.success) {
      startCooldown();
      setOtp('');
    }
  };

  // Google sign-in
  const handleGoogleSuccess = async (credentialResponse) => {
    setGoogleError('');
    clearError();
    const result = await googleAuth(credentialResponse.credential);
    if (result.success) {
      if (result.user && !result.user.onboardingCompleted) {
        navigate(`/onboarding?redirect=${encodeURIComponent(from)}`, { replace: true });
      } else {
        navigate(from, { replace: true });
      }
    }
  };

  const handleGoogleError = () => {
    setGoogleError('Google sign-in failed. Please try again or use email registration.');
  };

  const displayError = localError || authError;
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

  return (
    <div className="max-w-sm mx-auto py-12 px-4">
      <div className="surface rounded-lg p-6 space-y-5">

        {/* Header */}
        <div className="space-y-1">
          {step === STEP_OTP ? (
            <>
              <h2 className="text-xl font-semibold text-slate-900 dark:text-zinc-100 tracking-tight">
                Verify your email
              </h2>
              <p className="text-xs text-slate-500 dark:text-zinc-400">
                We sent a 6-digit code to{' '}
                <span className="font-medium text-slate-700 dark:text-zinc-300">{formData.email}</span>
              </p>
            </>
          ) : (
            <>
              <h2 className="text-xl font-semibold text-slate-900 dark:text-zinc-100 tracking-tight">
                Create account
              </h2>
              <p className="text-xs text-slate-500 dark:text-zinc-400">
                Sign up to start organizing classroom lectures and maps
              </p>
            </>
          )}
        </div>

        {/* Classroom invite banner */}
        {redirectUrl?.startsWith('/join/') && step === STEP_FORM && (
          <div className="alert alert-info flex items-center gap-2">
            <GraduationCap className="h-4 w-4 shrink-0 text-teal-600 dark:text-teal-400" />
            <span className="text-xs">Create an account to accept your classroom invitation and enroll in this subject.</span>
          </div>
        )}

        {/* Error display */}
        {displayError && (
          <div className="alert alert-error">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{displayError}</span>
          </div>
        )}

        {/* ─── STEP 1: Registration Form ─── */}
        {step === STEP_FORM && (
          <>
            <form onSubmit={handleFormSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-zinc-300 mb-1.5">
                  Full Name
                </label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  placeholder="Alex Johnson"
                  required
                  disabled={isSubmitting}
                  className="input"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-zinc-300 mb-1.5">
                  Email
                </label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  placeholder="alex@university.edu"
                  required
                  disabled={isSubmitting}
                  className="input"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-zinc-300 mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    name="password"
                    id="input-register-password"
                    value={formData.password}
                    onChange={handleChange}
                    placeholder="At least 6 characters"
                    required
                    disabled={isSubmitting}
                    className="input pr-10"
                  />
                  <button
                    type="button"
                    id="btn-toggle-register-password"
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
                  Confirm Password
                </label>
                <div className="relative">
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    name="confirmPassword"
                    id="input-register-confirm-password"
                    value={formData.confirmPassword}
                    onChange={handleChange}
                    placeholder="Re-enter password"
                    required
                    disabled={isSubmitting}
                    className="input pr-10"
                  />
                  <button
                    type="button"
                    id="btn-toggle-register-confirm-password"
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
                      <span>Continue</span>
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>
              </div>
            </form>

            {/* Divider */}
            <div className="relative flex items-center gap-3 py-1">
              <div className="flex-1 border-t border-gray-200 dark:border-zinc-700" />
              <span className="text-xs text-gray-400 dark:text-zinc-500 shrink-0">or</span>
              <div className="flex-1 border-t border-gray-200 dark:border-zinc-700" />
            </div>

            {/* Google Sign-In */}
            <div className="flex flex-col items-center gap-2">
              {googleClientId && googleClientId !== 'YOUR_CLIENT_ID_HERE' ? (
                <GoogleLogin
                  onSuccess={handleGoogleSuccess}
                  onError={handleGoogleError}
                  text="signup_with"
                  shape="rectangular"
                  theme="outline"
                  size="large"
                  width="320"
                />
              ) : (
                <button
                  type="button"
                  disabled
                  className="w-full flex items-center justify-center gap-2 py-2 px-3 border border-gray-200 dark:border-zinc-700 rounded-md text-xs text-gray-400 dark:text-zinc-500 cursor-not-allowed bg-gray-50 dark:bg-zinc-800"
                  title="Google Sign-In is not configured"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  Sign up with Google (not configured)
                </button>
              )}
              {googleError && (
                <p className="text-xs text-red-500 dark:text-red-400 text-center">{googleError}</p>
              )}
            </div>
          </>
        )}

        {/* ─── STEP 2: OTP Verification ─── */}
        {step === STEP_OTP && (
          <form onSubmit={handleOtpSubmit} className="space-y-4">
            <div className="flex items-center justify-center w-12 h-12 mx-auto rounded-full bg-sky-100 dark:bg-sky-900/30 mb-2">
              <Mail className="h-6 w-6 text-sky-600 dark:text-sky-400" />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-zinc-300 mb-1.5">
                Verification Code
              </label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={otp}
                onChange={(e) => {
                  setLocalError('');
                  clearError();
                  setOtp(e.target.value.replace(/\D/g, ''));
                }}
                placeholder="123456"
                required
                disabled={isSubmitting}
                className="input text-center text-lg tracking-widest font-mono"
                autoFocus
              />
              <p className="text-xs text-slate-400 dark:text-zinc-500 mt-1.5">
                Enter the 6-digit code sent to your email. It expires in 10 minutes.
              </p>
            </div>

            <div className="pt-1 space-y-3">
              <button
                type="submit"
                disabled={isSubmitting}
                className="btn-primary w-full py-2"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Verifying...</span>
                  </>
                ) : (
                  <>
                    <span>Verify & Create account</span>
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>

              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => {
                    setStep(STEP_FORM);
                    setOtp('');
                    setLocalError('');
                    clearError();
                  }}
                  className="flex items-center gap-1 text-xs text-slate-500 dark:text-zinc-400 hover:text-slate-700 dark:hover:text-zinc-200 transition-colors"
                >
                  <ArrowLeft className="h-3 w-3" />
                  Back
                </button>

                <button
                  type="button"
                  onClick={handleResend}
                  disabled={resendCooldown > 0 || isSubmitting}
                  className="flex items-center gap-1 text-xs text-teal-600 dark:text-teal-400 hover:underline disabled:opacity-50 disabled:cursor-not-allowed disabled:no-underline font-semibold transition-colors"
                >
                  <RefreshCw className="h-3 w-3" />
                  {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend code'}
                </button>
              </div>
            </div>
          </form>
        )}

        {/* Footer link */}
        <div className="text-center text-xs text-slate-500 dark:text-slate-400 pt-3 border-t border-slate-200 dark:border-slate-800">
          <span>Already have an account? </span>
          <Link
            to={redirectUrl ? `/login?redirect=${encodeURIComponent(redirectUrl)}` : '/login'}
            className="text-teal-600 dark:text-teal-400 hover:underline font-bold transition-colors"
          >
            Sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
