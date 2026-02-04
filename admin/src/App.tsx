import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import AdminLayout from './components/AdminLayout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Docket from './pages/Docket';
import Users from './pages/Users';
import Announcements from './pages/Announcements';

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            {/* Public routes */}
            <Route path="/" element={<Navigate to="/login" replace />} />
            <Route path="/login" element={<Login />} />

            {/* Protected admin routes */}
            <Route
              path="/admin/dashboard"
              element={
                <ProtectedRoute>
                  <AdminLayout>
                    <Dashboard />
                  </AdminLayout>
                </ProtectedRoute>
              }
            />

            {/* Editor and Admin routes */}
            <Route
              path="/admin/docket"
              element={
                <ProtectedRoute allowedRoles={['admin', 'editor']}>
                  <AdminLayout>
                    <Docket />
                  </AdminLayout>
                </ProtectedRoute>
              }
            />

            <Route
              path="/admin/docket/new"
              element={
                <ProtectedRoute allowedRoles={['admin', 'editor']}>
                  <AdminLayout>
                    <Docket />
                  </AdminLayout>
                </ProtectedRoute>
              }
            />

            <Route
              path="/admin/displays"
              element={
                <ProtectedRoute allowedRoles={['admin', 'editor']}>
                  <AdminLayout>
                    <div className="bg-white p-6 rounded-lg shadow">
                      <h2 className="text-xl font-semibold">Display Management</h2>
                      <p className="mt-2 text-gray-600">Display management will be implemented here.</p>
                    </div>
                  </AdminLayout>
                </ProtectedRoute>
              }
            />

            <Route
              path="/admin/announcements"
              element={
                <ProtectedRoute allowedRoles={['admin', 'editor']}>
                  <AdminLayout>
                    <Announcements />
                  </AdminLayout>
                </ProtectedRoute>
              }
            />

            {/* Admin-only routes */}
            <Route
              path="/admin/users"
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <AdminLayout>
                    <Users />
                  </AdminLayout>
                </ProtectedRoute>
              }
            />

            <Route
              path="/admin/api-keys"
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <AdminLayout>
                    <div className="bg-white p-6 rounded-lg shadow">
                      <h2 className="text-xl font-semibold">API Key Management</h2>
                      <p className="mt-2 text-gray-600">API key management will be implemented here.</p>
                    </div>
                  </AdminLayout>
                </ProtectedRoute>
              }
            />

            <Route
              path="/admin/audit-logs"
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <AdminLayout>
                    <div className="bg-white p-6 rounded-lg shadow">
                      <h2 className="text-xl font-semibold">Audit Logs</h2>
                      <p className="mt-2 text-gray-600">Audit log viewer will be implemented here.</p>
                    </div>
                  </AdminLayout>
                </ProtectedRoute>
              }
            />

            <Route
              path="/admin/settings"
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <AdminLayout>
                    <div className="bg-white p-6 rounded-lg shadow">
                      <h2 className="text-xl font-semibold">System Settings</h2>
                      <p className="mt-2 text-gray-600">System settings will be implemented here.</p>
                    </div>
                  </AdminLayout>
                </ProtectedRoute>
              }
            />

            {/* Redirect /admin to dashboard */}
            <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />

            {/* 404 catch-all */}
            <Route
              path="*"
              element={
                <div className="min-h-screen flex items-center justify-center bg-gray-50">
                  <div className="text-center">
                    <h1 className="text-4xl font-bold text-gray-900">404</h1>
                    <p className="mt-2 text-gray-600">Page not found</p>
                    <a href="/admin/dashboard" className="mt-4 inline-block text-primary hover:underline">
                      Go to Dashboard
                    </a>
                  </div>
                </div>
              }
            />
          </Routes>
        </BrowserRouter>
        <Toaster position="top-right" />
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
