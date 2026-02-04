import { Link, useLocation } from 'react-router-dom';

// Map of path segments to display names
const pathNames: Record<string, string> = {
  admin: 'Admin',
  dashboard: 'Dashboard',
  docket: 'Docket',
  displays: 'Displays',
  announcements: 'Announcements',
  users: 'Users',
  'api-keys': 'API Keys',
  'audit-logs': 'Audit Logs',
  settings: 'Settings',
  new: 'New Entry',
  edit: 'Edit',
};

export default function Breadcrumb() {
  const location = useLocation();

  // Split pathname into segments, filter empty strings
  const pathSegments = location.pathname.split('/').filter(Boolean);

  // If we're on the dashboard, don't show breadcrumbs
  if (pathSegments.length <= 2 && pathSegments[1] === 'dashboard') {
    return null;
  }

  // Start with Dashboard as the root
  const displayBreadcrumbs: { path: string; displayName: string; isLast: boolean }[] = [
    { path: '/admin/dashboard', displayName: 'Dashboard', isLast: false },
  ];

  // Add remaining segments (skip 'admin')
  pathSegments.forEach((segment, index) => {
    if (segment === 'admin') return; // Skip 'admin' segment

    // Build the path up to this segment
    const path = '/' + pathSegments.slice(0, index + 1).join('/');

    // Get display name (capitalize if not in pathNames)
    const displayName = pathNames[segment] || segment.charAt(0).toUpperCase() + segment.slice(1);

    // Check if this is the last segment (current page)
    const isLast = index === pathSegments.length - 1;

    displayBreadcrumbs.push({
      path,
      displayName,
      isLast,
    });
  });

  // Update the last item to mark it as current
  if (displayBreadcrumbs.length > 1) {
    displayBreadcrumbs[displayBreadcrumbs.length - 1].isLast = true;
  }

  // If we only have Dashboard (shouldn't happen due to early return), don't show
  if (displayBreadcrumbs.length <= 1) {
    return null;
  }

  return (
    <nav className="flex items-center space-x-2 text-sm text-gray-500 mb-2" aria-label="Breadcrumb">
      {displayBreadcrumbs.map((crumb, index) => (
        <span key={crumb.path} className="flex items-center">
          {index > 0 && (
            <svg
              className="w-4 h-4 mx-2 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5l7 7-7 7"
              />
            </svg>
          )}
          {crumb.isLast ? (
            <span className="text-gray-700 font-medium">{crumb.displayName}</span>
          ) : (
            <Link
              to={crumb.path}
              className="text-primary hover:text-primary-light hover:underline transition-colors"
            >
              {crumb.displayName}
            </Link>
          )}
        </span>
      ))}
    </nav>
  );
}
