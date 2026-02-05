import { createBrowserRouter, RouterProvider, Navigate, Outlet } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import AdminLayout from './components/AdminLayout';
import SessionExpiredModal from './components/SessionExpiredModal';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Docket from './pages/Docket';
import Users from './pages/Users';
import Announcements from './pages/Announcements';
import Displays from './pages/Displays';
import ApiKeys from './pages/ApiKeys';
import AuditLogs from './pages/AuditLogs';

const queryClient = new QueryClient();

// Root layout component that provides auth context
function RootLayout() {
  return (
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
    </AuthProvider>
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
      // Admin-only routes
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
              <div className="bg-white p-6 rounded-lg shadow">
                <h2 className="text-xl font-semibold">System Settings</h2>
                <p className="mt-2 text-gray-600">System settings will be implemented here.</p>
              </div>
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
          <div className="min-h-screen flex items-center justify-center bg-gray-50">
            <div className="text-center">
              <h1 className="text-4xl font-bold text-gray-900">404</h1>
              <p className="mt-2 text-gray-600">Page not found</p>
              <a href="/admin/dashboard" className="mt-4 inline-block text-primary hover:underline">
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
