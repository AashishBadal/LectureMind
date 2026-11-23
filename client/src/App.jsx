import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { SidebarProvider } from './context/SidebarContext';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import GuestRoute from './components/GuestRoute';
import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Dashboard from './pages/Dashboard';
import Upload from './pages/Upload';
import Lectures from './pages/Lectures';
import LectureDetail from './pages/LectureDetail';
import Subjects from './pages/Subjects';
import SubjectDetail from './pages/SubjectDetail';
import JoinSubject from './pages/JoinSubject';
import PaymentSuccess from './pages/PaymentSuccess';
import PaymentFailure from './pages/PaymentFailure';
import NotFound from './pages/NotFound';
import ResearchLab from './pages/ResearchLab';
import Onboarding from './pages/Onboarding';

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <SidebarProvider>
          <Routes>
          <Route path="/" element={<Layout />}>
          {/* Public Route */}
          <Route index element={<Home />} />

          {/* Guest Only Routes (Redirects to /dashboard if logged in) */}
          <Route
            path="login"
            element={
              <GuestRoute>
                <Login />
              </GuestRoute>
            }
          />
          <Route
            path="register"
            element={
              <GuestRoute>
                <Register />
              </GuestRoute>
            }
          />
          <Route
            path="forgot-password"
            element={
              <GuestRoute>
                <ForgotPassword />
              </GuestRoute>
            }
          />
          <Route
            path="reset-password"
            element={
              <GuestRoute>
                <ResetPassword />
              </GuestRoute>
            }
          />

          {/* Protected Routes (Redirects to /login if unauthenticated) */}
          <Route
            path="onboarding"
            element={
              <ProtectedRoute>
                <Onboarding />
              </ProtectedRoute>
            }
          />
          <Route
            path="dashboard"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="subjects"
            element={
              <ProtectedRoute>
                <Subjects />
              </ProtectedRoute>
            }
          />
          <Route
            path="subjects/:id/research"
            element={
              <ProtectedRoute>
                <ResearchLab />
              </ProtectedRoute>
            }
          />
          <Route
            path="subjects/:id"
            element={
              <ProtectedRoute>
                <SubjectDetail />
              </ProtectedRoute>
            }
          />
          <Route
            path="join/:inviteCode"
            element={<JoinSubject />}
          />
          <Route
            path="upload"
            element={
              <ProtectedRoute>
                <Upload />
              </ProtectedRoute>
            }
          />
          <Route
            path="lectures"
            element={
              <ProtectedRoute>
                <Lectures />
              </ProtectedRoute>
            }
          />
          <Route
            path="research"
            element={
              <ProtectedRoute>
                <ResearchLab />
              </ProtectedRoute>
            }
          />
          <Route
            path="lectures/:id"
            element={
              <ProtectedRoute>
                <LectureDetail />
              </ProtectedRoute>
            }
          />
          <Route
            path="payment/success"
            element={
              <ProtectedRoute>
                <PaymentSuccess />
              </ProtectedRoute>
            }
          />
          <Route
            path="payment/failure"
            element={
              <ProtectedRoute>
                <PaymentFailure />
              </ProtectedRoute>
            }
          />

          {/* 404 Catch-all */}
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
        </SidebarProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
