import { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import toast from 'react-hot-toast';
import { API_BASE_URL } from '../api/client';

interface AdminLayoutProps {
  children: React.ReactNode;
}

// Custom hook to detect mobile viewport
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return isMobile;
}

type UserRole = 'admin' | 'editor' | 'viewer';

interface NavItem {
  path: string;
  label: string;
  icon: string;
  roles: UserRole[];
}

// All navigation items with role-based access
// Admin: all items
// Editor: Dashboard, Docket, Displays, Announcements
// Viewer: Dashboard only
const allNavItems: NavItem[] = [
  { path: '/admin/dashboard', label: 'Dashboard', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6', roles: ['admin', 'editor', 'viewer'] },
  { path: '/admin/docket', label: 'Docket', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01', roles: ['admin', 'editor'] },
  { path: '/admin/calendar-import', label: 'Calendar Import', icon: 'M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4', roles: ['admin'] },
  { path: '/admin/displays', label: 'Displays', icon: 'M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z', roles: ['admin', 'editor'] },
  { path: '/admin/announcements', label: 'Announcements', icon: 'M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z', roles: ['admin', 'editor'] },
  { path: '/admin/idle-content', label: 'Idle Content', icon: 'M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z', roles: ['admin', 'editor'] },
];

// Admin-only navigation items
const adminOnlyNavItems: NavItem[] = [
  { path: '/admin/users', label: 'Users', icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z', roles: ['admin'] },
  { path: '/admin/api-keys', label: 'API Keys', icon: 'M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z', roles: ['admin'] },
  { path: '/admin/display-templates', label: 'Display Templates', icon: 'M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z', roles: ['admin'] },
  { path: '/admin/audit-logs', label: 'Audit Logs', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z', roles: ['admin'] },
  { path: '/admin/settings', label: 'Settings', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z', roles: ['admin'] },
];

interface PublicBranding {
  courtName: string;
  courtSubtitle: string;
  courthouseName: string;
  courtLogo: string | null;
}

export default function AdminLayout({ children }: AdminLayoutProps) {
  const { user, logout } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [isSidebarOpen, setSidebarOpen] = useState(!isMobile);
  const [isMobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [branding, setBranding] = useState<PublicBranding | null>(null);

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/settings/public`)
      .then(res => res.json())
      .then(data => setBranding(data))
      .catch(() => {});
  }, []);

  // Close mobile sidebar when navigating
  useEffect(() => {
    if (isMobile) {
      setMobileSidebarOpen(false);
    }
  }, [location.pathname, isMobile]);

  // Handle clicking outside the mobile sidebar to close it
  const handleOverlayClick = () => {
    setMobileSidebarOpen(false);
  };

  const handleLogout = async () => {
    try {
      await logout();
      toast.success('Logged out successfully');
      navigate('/login');
    } catch (error) {
      toast.error('Logout failed');
    }
  };

  const isActive = (path: string) => location.pathname === path;

  // On mobile, always show labels when sidebar is open; on desktop, respect isSidebarOpen
  const showLabels = isMobile ? true : isSidebarOpen;

  return (
    <div className="min-h-screen flex bg-gray-50 dark:bg-gray-900">
      {/* Mobile overlay */}
      {isMobile && isMobileSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40"
          onClick={handleOverlayClick}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          ${isMobile
            ? `fixed inset-y-0 left-0 z-50 w-64 transform transition-transform duration-300 ease-in-out ${
                isMobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'
              }`
            : `${isSidebarOpen ? 'w-64' : 'w-20'} transition-all duration-300`
          }
          bg-primary text-white flex flex-col
        `}
      >
        {/* Logo/Header */}
        <div className="p-4 border-b border-white/10">
          <div className="flex items-center space-x-3">
            {branding?.courtLogo ? (
              <img
                src={`${API_BASE_URL}${branding.courtLogo}`}
                alt="Court Logo"
                className="h-10 w-10 object-contain flex-shrink-0"
              />
            ) : (
              <div className="h-10 w-10 flex items-center justify-center rounded bg-white/10 flex-shrink-0">
                <svg
                  className="h-6 w-6 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                  />
                </svg>
              </div>
            )}
            {showLabels && (
              <div className="min-w-0">
                <h1 className="font-bold text-lg leading-tight truncate">
                  {branding?.courthouseName || 'Court Signage'}
                </h1>
                <p className="text-xs text-white/60 truncate">
                  {branding ? `${branding.courtName}` : 'Admin Portal'}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-1">
          {/* Main navigation - filtered by user role */}
          {allNavItems
            .filter((item) => user && item.roles.includes(user.role as UserRole))
            .map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center space-x-3 px-3 py-2 rounded-lg transition-colors ${
                  isActive(item.path)
                    ? 'bg-white/20 text-white'
                    : 'text-white/70 hover:bg-white/10 hover:text-white'
                }`}
              >
                <svg className="h-5 w-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.icon} />
                </svg>
                {showLabels && <span>{item.label}</span>}
              </Link>
            ))}

          {/* Admin-only section */}
          {user?.role === 'admin' && (
            <>
              <div className="pt-4 pb-2">
                {showLabels && (
                  <span className="text-xs font-semibold text-white/50 uppercase tracking-wider">
                    Administration
                  </span>
                )}
              </div>
              {adminOnlyNavItems.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center space-x-3 px-3 py-2 rounded-lg transition-colors ${
                    isActive(item.path)
                      ? 'bg-white/20 text-white'
                      : 'text-white/70 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <svg className="h-5 w-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.icon} />
                  </svg>
                  {showLabels && <span>{item.label}</span>}
                </Link>
              ))}
            </>
          )}
        </nav>

        {/* App info footer */}
        {showLabels && (
          <div className="px-4 py-3 border-t border-white/10">
            <p className="text-xs font-semibold text-white/70">
              CDS <span className="font-normal text-white/50">v{__APP_VERSION__}</span>
              {' '}
              <a
                href={`https://github.com/imcmurray/Courthouse-Digital-Signage/commit/${__COMMIT_HASH__}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-white/30 hover:text-white/50 transition-colors"
              >
                ({__COMMIT_HASH__})
              </a>
            </p>
            <p className="text-[10px] text-white/40 mt-0.5">Courthouse Digital Signage</p>
            <div className="flex items-center space-x-2 mt-1">
              <a
                href="https://github.com/imcmurray/Courthouse-Digital-Signage"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] text-white/40 hover:text-white/70 transition-colors"
              >
                GitHub
              </a>
              <span className="text-white/20">·</span>
              <a
                href="https://github.com/imcmurray/Courthouse-Digital-Signage/issues"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] text-white/40 hover:text-white/70 transition-colors"
              >
                Issues
              </a>
            </div>
          </div>
        )}

        {/* Toggle button - only show on desktop */}
        {!isMobile && (
          <button
            onClick={() => setSidebarOpen(!isSidebarOpen)}
            className="p-4 border-t border-white/10 text-white/70 hover:text-white hover:bg-white/10 transition-colors"
            aria-label={isSidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          >
            <svg
              className={`h-5 w-5 transition-transform ${isSidebarOpen ? '' : 'rotate-180'}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
            </svg>
          </button>
        )}

        {/* Close button for mobile sidebar */}
        {isMobile && (
          <button
            onClick={() => setMobileSidebarOpen(false)}
            className="p-4 border-t border-white/10 text-white/70 hover:text-white hover:bg-white/10 transition-colors"
            aria-label="Close menu"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col">
        {/* Top header */}
        <header className="bg-white dark:bg-gray-800 shadow-sm dark:shadow-gray-900/50 border-b border-gray-200 dark:border-gray-700 px-4 md:px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              {/* Hamburger menu button - only show on mobile */}
              {isMobile && (
                <button
                  onClick={() => setMobileSidebarOpen(true)}
                  className="p-2 -ml-2 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                  aria-label="Open menu"
                >
                  <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                </button>
              )}
              <div>
                <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100">
                  {allNavItems.find(item => isActive(item.path))?.label ||
                    adminOnlyNavItems.find(item => isActive(item.path))?.label ||
                    'Admin'}
                </h2>
              </div>
            </div>

            <div className="flex items-center space-x-4">
              {/* User info */}
              <div className="flex items-center space-x-3">
                <div className="text-right">
                  <p className="text-sm font-medium text-gray-900 dark:text-white">{user?.name}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 capitalize">{user?.role}</p>
                </div>
                <div className="h-10 w-10 rounded-full bg-primary flex items-center justify-center text-white font-semibold">
                  {user?.name?.charAt(0).toUpperCase() || 'U'}
                </div>
              </div>

              {/* Dark mode toggle */}
              <button
                onClick={toggleTheme}
                className="px-3 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
              >
                {isDark ? (
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                ) : (
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                  </svg>
                )}
              </button>

              {/* Logout button */}
              <button
                onClick={handleLogout}
                className="px-3 py-2 text-sm text-gray-600 dark:text-gray-300 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                aria-label="Log out"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </button>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 p-6 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
