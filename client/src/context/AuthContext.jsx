import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  getMeApi,
  loginApi,
  registerApi,
  logoutApi,
  sendRegistrationOtpApi,
  googleAuthApi,
  updateProfileApi,
  completeOnboardingApi
} from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(null);

  // Check current user session on mount
  useEffect(() => {
    let isMounted = true;

    async function checkCurrentSession() {
      try {
        const data = await getMeApi();
        if (isMounted && data?.success && data?.user) {
          setUser(data.user);
        }
      } catch (err) {
        // User not logged in or session expired
        if (isMounted) {
          setUser(null);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    checkCurrentSession();

    return () => {
      isMounted = false;
    };
  }, []);

  const login = async (email, password) => {
    setAuthError(null);
    try {
      const data = await loginApi({ email, password });
      if (data?.success && data?.user) {
        setUser(data.user);
        return { success: true, user: data.user };
      }
      throw new Error(data?.message || 'Login failed');
    } catch (err) {
      const message = err.message || 'Invalid credentials';
      setAuthError(message);
      return { success: false, error: message };
    }
  };

  const register = async (email, otp) => {
    setAuthError(null);
    try {
      const data = await registerApi({ email, otp });
      if (data?.success && data?.user) {
        setUser(data.user);
        return { success: true, user: data.user };
      }
      throw new Error(data?.message || 'Registration failed');
    } catch (err) {
      const message = err.message || 'Registration failed';
      setAuthError(message);
      return { success: false, error: message };
    }
  };

  const sendRegistrationOtp = async (name, email, password) => {
    setAuthError(null);
    try {
      const data = await sendRegistrationOtpApi({ name, email, password });
      if (data?.success) {
        return { success: true };
      }
      throw new Error(data?.message || 'Failed to send verification code');
    } catch (err) {
      const message = err.message || 'Failed to send verification code';
      setAuthError(message);
      return { success: false, error: message };
    }
  };

  const googleAuth = async (credential) => {
    setAuthError(null);
    try {
      const data = await googleAuthApi({ credential });
      if (data?.success && data?.user) {
        setUser(data.user);
        return { success: true, user: data.user };
      }
      throw new Error(data?.message || 'Google sign-in failed');
    } catch (err) {
      const message = err.message || 'Google sign-in failed';
      setAuthError(message);
      return { success: false, error: message };
    }
  };

  const logout = async () => {
    try {
      await logoutApi();
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      setUser(null);
    }
  };

  const refreshUser = async () => {
    try {
      const data = await getMeApi();
      if (data?.success && data?.user) {
        setUser(data.user);
        return data.user;
      }
    } catch (err) {
      console.warn('Could not refresh user session:', err);
    }
    return null;
  };

  const updateProfile = async (profileData) => {
    setAuthError(null);
    try {
      const data = await updateProfileApi(profileData);
      if (data?.success && data?.user) {
        setUser(data.user);
        return { success: true, user: data.user };
      }
      throw new Error(data?.message || 'Failed to update profile');
    } catch (err) {
      const message = err.message || 'Failed to update profile';
      setAuthError(message);
      return { success: false, error: message };
    }
  };

  const completeOnboarding = async (onboardingData) => {
    setAuthError(null);
    try {
      const data = await completeOnboardingApi(onboardingData);
      if (data?.success && data?.user) {
        setUser(data.user);
        return { success: true, user: data.user };
      }
      throw new Error(data?.message || 'Failed to complete onboarding');
    } catch (err) {
      const message = err.message || 'Failed to complete onboarding';
      setAuthError(message);
      return { success: false, error: message };
    }
  };

  const updateCredits = (newCredits) => {
    setUser((prev) => (prev ? { ...prev, credits: newCredits } : prev));
  };

  const value = {
    user,
    credits: user?.credits ?? 0,
    loading,
    authError,
    isAuthenticated: !!user,
    login,
    register,
    sendRegistrationOtp,
    googleAuth,
    updateProfile,
    completeOnboarding,
    logout,
    refreshUser,
    updateCredits,
    clearError: () => setAuthError(null)
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
