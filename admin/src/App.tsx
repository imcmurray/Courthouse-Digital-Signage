import { createBrowserRouter, RouterProvider, Navigate, Outlet } from 'react-router-dom';
import { QueryClient, QueryClientProvider, QueryCache } from '@tanstack/react-query';
import { Toaster, toast } from 'react-hot-toast';
import { getErrorMessage } from './utils/errorHandling';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import ProtectedRoute from './components/ProtectedRoute';
import AdminLayout from './components/AdminLayout';
import SessionExpiredModal from './components/SessionExpiredModal';
import ForcePasswordChangeModal from './components/ForcePasswordChangeModal';
import ErrorBoundary from './components/ErrorBoundary';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Docket from './pages/Docket';
import Users from './pages/Users';
import Announcements from './pages/Announcements';
import ContentCards from './pages/ContentCards';
import Displays from './pages/Displays';
import ApiKeys from './pages/ApiKeys';
import AuditLogs from './pages/AuditLogs';
import Settings from './pages/Settings';
import CalendarImport from './pages/CalendarImport';
import DisplayTemplates from './pages/DisplayTemplates';

// Surface query failures globally so a backend outage reads as an error, not as
// empty data (an empty docket and a failed fetch previously looked identical).
// A fixed toast id dedupes when several polling widgets fail at once. 401/403 are
// left to the axios interceptor (token refresh / session-expired modal).
const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error) => {
      const status = (error as { response?: { status?: number } })?.response?.status;
      if (status === 401 || status === 403) return;
      toast.error(getErrorMessage(error, 'Failed to load data. Please try again.'), {
        id: 'query-error',
      });
    },
  }),
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 5000,
    },
  },
});

// Root layout component that provides auth context
function RootLayout() {
  return (
    <ErrorBoundary>
    <ThemeProvider>
    <AuthProvider>
      <Outlet />
      <Toaster
        position="top-right"
        toastOptions={{
          // Default duration for success toasts
          success: {
            duration: 4000,
            ariaProps: {
              role: 'status',
              'aria-live': 'polite',
            },
          },
          // Error toasts stay longer, have different styling, and use assertive aria-live
          error: {
            duration: 6000,
            style: {
              background: '#FEE2E2',
              color: '#991B1B',
              border: '1px solid #FECACA',
            },
            ariaProps: {
              role: 'alert',
              'aria-live': 'assertive',
            },
          },
        }}
      />
      <SessionExpiredModal />
      <ForcePasswordChangeModal />
    </AuthProvider>
    </ThemeProvider>
    </ErrorBoundary>
  );
}

// Create the data router
const router = createBrowserRouter([
  {
    element: <RootLayout />,
    children: [
      // Public routes
      {
        path: '/',
        element: <Navigate to="/login" replace />,
      },
      {
        path: '/login',
        element: <Login />,
      },
      // Protected admin routes
      {
        path: '/admin/dashboard',
        element: (
          <ProtectedRoute>
            <AdminLayout>
              <Dashboard />
            </AdminLayout>
          </ProtectedRoute>
        ),
      },
      // Editor and Admin routes
      {
        path: '/admin/docket',
        element: (
          <ProtectedRoute allowedRoles={['admin', 'editor']}>
            <AdminLayout>
              <Docket />
            </AdminLayout>
          </ProtectedRoute>
        ),
      },
      {
        path: '/admin/docket/new',
        element: (
          <ProtectedRoute allowedRoles={['admin', 'editor']}>
            <AdminLayout>
              <Docket />
            </AdminLayout>
          </ProtectedRoute>
        ),
      },
      {
        path: '/admin/docket/edit/:id',
        element: (
          <ProtectedRoute allowedRoles={['admin', 'editor']}>
            <AdminLayout>
              <Docket />
            </AdminLayout>
          </ProtectedRoute>
        ),
      },
      {
        path: '/admin/displays',
        element: (
          <ProtectedRoute allowedRoles={['admin', 'editor']}>
            <AdminLayout>
              <Displays />
            </AdminLayout>
          </ProtectedRoute>
        ),
      },
      {
        path: '/admin/announcements',
        element: (
          <ProtectedRoute allowedRoles={['admin', 'editor']}>
            <AdminLayout>
              <Announcements />
            </AdminLayout>
          </ProtectedRoute>
        ),
      },
      {
        path: '/admin/content-cards',
        element: (
          <ProtectedRoute allowedRoles={['admin', 'editor']}>
            <AdminLayout>
              <ContentCards />
            </AdminLayout>
          </ProtectedRoute>
        ),
      },
      // Admin-only routes
      {
        path: '/admin/calendar-import',
        element: (
          <ProtectedRoute allowedRoles={['admin']}>
            <AdminLayout>
              <CalendarImport />
            </AdminLayout>
          </ProtectedRoute>
        ),
      },
      {
        path: '/admin/users',
        element: (
          <ProtectedRoute allowedRoles={['admin']}>
            <AdminLayout>
              <Users />
            </AdminLayout>
          </ProtectedRoute>
        ),
      },
      {
        path: '/admin/api-keys',
        element: (
          <ProtectedRoute allowedRoles={['admin']}>
            <AdminLayout>
              <ApiKeys />
            </AdminLayout>
          </ProtectedRoute>
        ),
      },
      {
        path: '/admin/display-templates',
        element: (
          <ProtectedRoute allowedRoles={['admin']}>
            <AdminLayout>
              <DisplayTemplates />
            </AdminLayout>
          </ProtectedRoute>
        ),
      },
      {
        path: '/admin/audit-logs',
        element: (
          <ProtectedRoute allowedRoles={['admin']}>
            <AdminLayout>
              <AuditLogs />
            </AdminLayout>
          </ProtectedRoute>
        ),
      },
      {
        path: '/admin/settings',
        element: (
          <ProtectedRoute allowedRoles={['admin']}>
            <AdminLayout>
              <Settings />
            </AdminLayout>
          </ProtectedRoute>
        ),
      },
      // Redirect /admin to dashboard
      {
        path: '/admin',
        element: <Navigate to="/admin/dashboard" replace />,
      },
      // 404 catch-all
      {
        path: '*',
        element: (
          <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
            <div className="text-center">
              <h1 className="text-4xl font-bold text-gray-900 dark:text-white">404</h1>
              <p className="mt-2 text-gray-600 dark:text-gray-300">Page not found</p>
              <a href="/admin/dashboard" className="mt-4 inline-block text-primary dark:text-primary-light hover:underline">
                Go to Dashboard
              </a>
            </div>
          </div>
        ),
      },
    ],
  },
]);

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}

export default App;
