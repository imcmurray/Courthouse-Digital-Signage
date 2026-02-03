import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/login" element={<LoginPlaceholder />} />
          <Route path="/admin/*" element={<AdminPlaceholder />} />
        </Routes>
      </BrowserRouter>
      <Toaster position="top-right" />
    </QueryClientProvider>
  );
}

// Placeholder components - will be implemented by coding agents
function LoginPlaceholder() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white p-8 rounded-lg shadow-md max-w-md w-full">
        <h1 className="text-2xl font-bold text-primary mb-6 text-center">
          Courthouse Digital Signage
        </h1>
        <p className="text-gray-600 text-center mb-4">
          Admin Portal Login
        </p>
        <p className="text-sm text-gray-400 text-center">
          Login form will be implemented here
        </p>
      </div>
    </div>
  );
}

function AdminPlaceholder() {
  return (
    <div className="min-h-screen flex">
      <aside className="w-64 bg-primary text-white p-4">
        <h2 className="text-lg font-bold mb-4">Admin Portal</h2>
        <nav className="space-y-2">
          <div className="text-gray-300">Dashboard</div>
          <div className="text-gray-300">Docket</div>
          <div className="text-gray-300">Displays</div>
          <div className="text-gray-300">Announcements</div>
        </nav>
      </aside>
      <main className="flex-1 p-6 bg-gray-50">
        <h1 className="text-2xl font-bold mb-4">Dashboard</h1>
        <p className="text-gray-600">
          Admin dashboard content will be implemented here
        </p>
      </main>
    </div>
  );
}

export default App;
