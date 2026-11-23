import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Navbar from './Navbar';
import { useAuth } from '../context/AuthContext';
import { useSidebar } from '../context/SidebarContext';

export default function Layout() {
  const { isAuthenticated } = useAuth();
  const { collapsed } = useSidebar();
  const location = useLocation();
  const isOnboarding = location.pathname === '/onboarding';

  return (
    <div
      className={`app-layout${
        isAuthenticated && !isOnboarding ? ' app-layout-workspace' : ''
      }${collapsed && isAuthenticated && !isOnboarding ? ' sidebar-collapsed' : ''}`}
    >
      {!isOnboarding && <Navbar />}
      <div className="app-content-shell">
        <main className={`app-main${isOnboarding ? ' !p-0 !m-0 !w-full !max-w-none' : ''}`}>
          <Outlet />
        </main>
        {!isOnboarding && (
          <footer className="app-footer">
            <span>LECTUREMIND</span>
            <span>Built for ideas that connect.</span>
          </footer>
        )}
      </div>
    </div>
  );
}
