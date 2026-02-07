import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { API_BASE_URL } from '../api/client';

// Validation schema
const loginSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

type LoginFormData = z.infer<typeof loginSchema>;

interface PublicBranding {
  courtName: string;
  courtSubtitle: string;
  courthouseName: string;
  courtLogo: string | null;
}

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, isAuthenticated, isLoading } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [branding, setBranding] = useState<PublicBranding | null>(null);

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/settings/public`)
      .then(res => res.json())
      .then(data => setBranding(data))
      .catch(() => {});
  }, []);

  // Get the redirect path from state (set by ProtectedRoute)
  const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/admin/dashboard';

  // All hooks must be called before any conditional returns
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  });

  // Redirect authenticated users to the originally requested page or dashboard
  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      navigate(from, { replace: true });
    }
  }, [isAuthenticated, isLoading, navigate, from]);

  // Show loading state while checking authentication
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  // Don't render login form if already authenticated (will redirect via useEffect)
  if (isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-gray-600 dark:text-gray-300">Redirecting to dashboard...</div>
      </div>
    );
  }

  const onSubmit = async (data: LoginFormData) => {
    setIsSubmitting(true);
    try {
      await login(data.email, data.password);
      toast.success('Login successful!');
      navigate(from, { replace: true });
    } catch (error: unknown) {
      // Extract error message from axios error response
      let errorMessage = 'Login failed. Please check your credentials.';

      if (error && typeof error === 'object') {
        const axiosError = error as { response?: { data?: { error?: string } }; message?: string };
        if (axiosError.response?.data?.error) {
          errorMessage = axiosError.response.data.error;
        } else if (axiosError.message && !axiosError.message.includes('status code')) {
          // Don't use generic axios messages like "Request failed with status code 401"
          errorMessage = axiosError.message;
        }
      } else if (error instanceof Error) {
        errorMessage = error.message;
      }

      toast.error(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 py-12 px-4 sm:px-6 lg:px-8 overflow-hidden">
      {branding?.courtLogo && (
        <div
          className="absolute inset-0 bg-center bg-no-repeat bg-contain opacity-[0.07] dark:opacity-[0.05] blur-[6px] scale-150 pointer-events-none"
          style={{ backgroundImage: `url(${API_BASE_URL}${branding.courtLogo})` }}
        />
      )}
      <div className="relative max-w-md w-full space-y-8">
        {/* Header */}
        <div className="text-center">
          {branding?.courtLogo ? (
            <img
              src={`${API_BASE_URL}${branding.courtLogo}`}
              alt="Court Logo"
              className="mx-auto h-20 w-20 object-contain"
            />
          ) : (
            <div className="mx-auto h-16 w-16 flex items-center justify-center rounded-full bg-primary">
              <svg
                className="h-10 w-10 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
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
          <h2 className="mt-6 text-3xl font-extrabold text-gray-900 dark:text-white">
            Courthouse Digital Signage
          </h2>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">Admin Portal</p>
        </div>

        {/* Login Form */}
        <form className="mt-8 space-y-6 bg-white dark:bg-gray-800 p-8 rounded-lg shadow-xl dark:shadow-gray-900/70" onSubmit={handleSubmit(onSubmit)}>
          <div className="space-y-4">
            {/* Email Field */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                Email address
              </label>
              <div className="mt-1">
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  {...register('email')}
                  className={`appearance-none relative block w-full px-3 py-2 border ${
                    errors.email ? 'border-red-300 dark:border-red-600' : 'border-gray-300 dark:border-gray-600'
                  } placeholder-gray-500 dark:placeholder-gray-400 text-gray-900 dark:text-white dark:bg-gray-800 rounded-md focus:outline-none focus:ring-primary focus:border-primary sm:text-sm`}
                  placeholder="admin@courthouse.gov"
                />
                {errors.email && (
                  <p className="mt-1 text-sm text-red-600" role="alert">{errors.email.message}</p>
                )}
              </div>
            </div>

            {/* Password Field */}
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                Password
              </label>
              <div className="mt-1">
                <input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  {...register('password')}
                  className={`appearance-none relative block w-full px-3 py-2 border ${
                    errors.password ? 'border-red-300 dark:border-red-600' : 'border-gray-300 dark:border-gray-600'
                  } placeholder-gray-500 dark:placeholder-gray-400 text-gray-900 dark:text-white dark:bg-gray-800 rounded-md focus:outline-none focus:ring-primary focus:border-primary sm:text-sm`}
                  placeholder="Enter your password"
                />
                {errors.password && (
                  <p className="mt-1 text-sm text-red-600" role="alert">{errors.password.message}</p>
                )}
              </div>
            </div>
          </div>

          {/* Submit Button */}
          <div>
            <button
              type="submit"
              disabled={isSubmitting}
              className={`group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white ${
                isSubmitting
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-primary hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary'
              }`}
            >
              {isSubmitting ? (
                <span className="flex items-center">
                  <svg
                    className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  Signing in...
                </span>
              ) : (
                'Sign in'
              )}
            </button>
          </div>
        </form>

        {/* Footer */}
        <div className="text-center">
          {branding?.courthouseName && (
            <p className="text-sm font-medium text-gray-600 dark:text-gray-300">
              {branding.courthouseName}
            </p>
          )}
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {branding ? `${branding.courtName} \u2022 ${branding.courtSubtitle}` : 'U.S. Bankruptcy Court \u2022 District of Utah'}
          </p>
        </div>
      </div>
    </div>
  );
}
