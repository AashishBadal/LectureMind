import React, { createContext, useContext, useEffect, useState } from 'react';

const SidebarContext = createContext({
  collapsed: false,
  toggleSidebar: () => {},
  setCollapsed: () => {}
});

export function SidebarProvider({ children }) {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem('lecturemind_sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('lecturemind_sidebar_collapsed', String(collapsed));
    } catch {
      // Ignore localStorage write failures
    }
  }, [collapsed]);

  // Global keyboard shortcut: Ctrl+\ (or Cmd+\ on Mac) to toggle sidebar
  useEffect(() => {
    const handleKeyDown = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key === '\\') {
        event.preventDefault();
        setCollapsed((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const toggleSidebar = () => setCollapsed((prev) => !prev);

  return (
    <SidebarContext.Provider value={{ collapsed, toggleSidebar, setCollapsed }}>
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar() {
  return useContext(SidebarContext);
}
