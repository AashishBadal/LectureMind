import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useSidebar } from '../context/SidebarContext';
import {
  BookOpen,
  Search,
  LayoutDashboard,
  LogOut,
  GraduationCap,
  Sun,
  Moon,
  Library,
  Upload,
  Coins,
  SlidersHorizontal,
  PanelLeftClose,
  PanelLeftOpen
} from 'lucide-react';
import PaymentModal from './PaymentModal';

const navGroups = [
  {
    label: 'WORKSPACE',
    links: [
      { name: 'Overview', path: '/dashboard', icon: LayoutDashboard },
      { name: 'Research Lab', path: '/research', icon: Search },
      { name: 'Lecture library', path: '/lectures', icon: Library },
      { name: 'Subjects', path: '/subjects', icon: GraduationCap }
    ]
  }
];

function Brand({ collapsed = false }) {
  return (
    <Link to="/" className="brand-lockup" title="LectureMind">
      <span className="brand-symbol"><BookOpen size={17} strokeWidth={1.8} /></span>
      {!collapsed && <span className="brand-name">Lecture<span>Mind</span></span>}
    </Link>
  );
}

export default function Navbar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, credits, isAuthenticated, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { collapsed, toggleSidebar } = useSidebar();
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);

  const isActive = (path) => location.pathname === path || (path !== '/dashboard' && location.pathname.startsWith(`${path}/`));
  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  if (location.pathname === '/onboarding') {
    return null;
  }

  if (!isAuthenticated) {
    return (
      <header className="public-header">
        <div className="public-header-inner">
          <Brand />
          <div className="public-actions">
            <button onClick={toggleTheme} aria-label="Toggle color theme" className="icon-button">{theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}</button>
            <Link to="/login" className="public-login">Log in</Link>
            <Link to="/register" className="button-primary button-small">Create account <Upload size={13} /></Link>
          </div>
        </div>
      </header>
    );
  }

  return (
    <>
      <aside className={`workspace-sidebar${collapsed ? ' is-collapsed' : ''}`}>
        <div className="sidebar-header-row">
          <Brand collapsed={collapsed} />
          <button
            onClick={toggleSidebar}
            className="sidebar-collapse-btn"
            title={collapsed ? "Expand sidebar (Ctrl+\\)" : "Collapse sidebar (Ctrl+\\)"}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          </button>
        </div>

        {navGroups.map((group) => (
          <nav key={group.label} className="sidebar-nav" aria-label={group.label}>
            {!collapsed && <div className="sidebar-section-label">{group.label}</div>}
            {group.links.map(({ name, path, icon: Icon }) => (
              <Link
                key={path}
                to={path}
                className={`sidebar-link${isActive(path) ? ' is-active' : ''}`}
                aria-current={isActive(path) ? 'page' : undefined}
                title={collapsed ? name : undefined}
              >
                <Icon size={16} strokeWidth={1.8} />
                {!collapsed && <span>{name}</span>}
                {!collapsed && path === '/research' && <span className="sidebar-link-badge">NEW</span>}
              </Link>
            ))}
          </nav>
        ))}

        <Link
          to="/upload"
          className={`sidebar-create${isActive('/upload') ? ' is-active' : ''}`}
          title={collapsed ? 'New lecture' : undefined}
        >
          <span><Upload size={15} /></span>
          {!collapsed && (
            <span>
              <strong>New lecture</strong>
              <small>Audio or transcript</small>
            </span>
          )}
        </Link>

        <div className="sidebar-bottom">
          <button
            onClick={() => setIsPaymentModalOpen(true)}
            className="credit-summary"
            title={collapsed ? `${credits} credits available · Add more` : undefined}
          >
            <span className="credit-icon"><Coins size={15} /></span>
            {!collapsed && (
              <>
                <span><small>AI CREDITS</small><strong>{credits} available</strong></span>
                <span className="credit-add">+</span>
              </>
            )}
          </button>

          <div className="sidebar-account" title={collapsed ? user?.name || 'Account' : undefined}>
            <span className="account-avatar">{user?.name?.[0]?.toUpperCase() || 'S'}</span>
            {!collapsed && (
              <>
                <span className="account-name">
                  <strong>{user?.name || 'Scholar'}</strong>
                  <small>{user?.role === 'TEACHER' ? 'Educator' : (user?.fieldOfStudy || (user?.role === 'RESEARCHER' ? 'Researcher' : 'Student'))}</small>
                </span>
                <Link to="/onboarding" aria-label="Profile & AI Preferences" title="Profile & AI Preferences" className="icon-button">
                  <SlidersHorizontal size={14} />
                </Link>
                <button onClick={toggleTheme} aria-label="Toggle color theme" title="Toggle theme" className="icon-button account-theme">
                  {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
                </button>
              </>
            )}
            <button onClick={handleLogout} aria-label="Log out" title="Log out" className="icon-button">
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </aside>

      <header className="mobile-workspace-header">
        <Brand />
        <button onClick={toggleTheme} aria-label="Toggle color theme" className="icon-button">{theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}</button>
      </header>
      <nav className="mobile-workspace-nav" aria-label="Workspace">
        {navGroups[0].links.map(({ name, path, icon: Icon }) => (
          <Link key={path} to={path} className={isActive(path) ? 'is-active' : ''}><Icon size={15} /><span>{name === 'Lecture library' ? 'Library' : name}</span></Link>
        ))}
        <Link to="/upload" className={isActive('/upload') ? 'is-active' : ''}><Upload size={15} /><span>New</span></Link>
      </nav>
      <PaymentModal isOpen={isPaymentModalOpen} onClose={() => setIsPaymentModalOpen(false)} />
    </>
  );
}
