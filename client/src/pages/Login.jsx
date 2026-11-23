import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { GoogleLogin } from '@react-oauth/google';
import { useAuth } from '../context/AuthContext';
import { AlertCircle, Loader2, ArrowRight, Eye, EyeOff, GraduationCap } from 'lucide-react';

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, googleAuth, authError, clearError } = useAuth();

  const [formData, setFormData] = useState({
    email: '',
    password: ''
  });
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState('');
  const [googleError, setGoogleError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const searchParams = new URLSearchParams(location.search);
  const redirectUrl = searchParams.get('redirect');
  const from = redirectUrl || location.state?.from?.pathname || '/dashboard';

  const handleChange = (e) => {
    setLocalError('');
    clearError();
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLocalError('');

    if (!formData.email.trim() || !formData.password) {
      setLocalError('Please enter both email and password.');
      return;
    }

    setIsSubmitting(true);
    const result = await login(formData.email.trim(), formData.password);
    setIsSubmitting(false);

    if (result.success) {
      if (result.user && !result.user.onboardingCompleted) {
        navigate(`/onboarding?redirect=${encodeURIComponent(from)}`, { replace: true });
      } else {
        navigate(from, { replace: true });
      }
    }
  };

  const displayError = localError || authError;

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
    setGoogleError('Google sign-in failed. Please try again or use email and password.');
  };

  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

  return (
    <div className="max-w-sm mx-auto py-12 px-4">
      <div className="surface rounded-lg p-6 space-y-5">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-zinc-100 tracking-tight">Sign in</h2>
          <p className="text-xs text-slate-500 dark:text-zinc-400">
            Enter your credentials to access your account
          </p>
        </div>

        {redirectUrl?.startsWith('/join/') && (
          <div className="alert alert-info flex items-center gap-2">
            <GraduationCap className="h-4 w-4 shrink-0 text-emerald-700 dark:text-emerald-400" />
            <span className="text-xs">Sign in to accept your classroom invitation and enroll in this subject.</span>
          </div>
        )}

        {displayError && (
          <div className="alert alert-error">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{displayError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-zinc-300 mb-1.5">
              Email
            </label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              placeholder="name@university.edu"
              required
              disabled={isSubmitting}
              className="input"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-medium text-slate-700 dark:text-zinc-300">
                Password
              </label>
              <Link
                to="/forgot-password"
                className="text-xs text-teal-600 dark:text-teal-400 hover:underline transition-colors font-semibold"
                id="link-forgot-password"
              >
                Forgot password?
              </Link>
            </div>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                name="password"
                id="input-login-password"
                value={formData.password}
                onChange={handleChange}
                placeholder="••••••••"
                required
                disabled={isSubmitting}
                className="input pr-10"
              />
              <button
                type="button"
                id="btn-toggle-password-visibility"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1 rounded transition-colors"
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
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
                  <span>Signing in...</span>
                </>
              ) : (
                <>
                  <span>Sign in</span>
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
              text="signin_with"
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
              Sign in with Google (not configured)
            </button>
          )}
          {googleError && (
            <p className="text-xs text-red-500 dark:text-red-400 text-center">{googleError}</p>
          )}
        </div>

        <div className="text-center text-xs text-gray-500 dark:text-gray-400 pt-3 border-t border-gray-200 dark:border-[#333333]">
          <span>Don't have an account? </span>
          <Link
            to={redirectUrl ? `/register?redirect=${encodeURIComponent(redirectUrl)}` : '/register'}
            className="text-teal-600 dark:text-teal-400 hover:underline font-bold transition-colors"
          >
            Create an account
          </Link>
        </div>
      </div>
    </div>
  );
}
