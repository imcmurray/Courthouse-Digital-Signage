import axios from 'axios';
import { triggerSessionExpired } from '../components/SessionExpiredModal';

export const API_BASE_URL = import.meta.env.VITE_API_URL || '';

// Create axios instance
export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Token management
const TOKEN_KEY = 'auth_token';
const REFRESH_TOKEN_KEY = 'refresh_token';

export const getStoredToken = (): string | null => {
  return localStorage.getItem(TOKEN_KEY);
};

export const getStoredRefreshToken = (): string | null => {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
};

export const setStoredTokens = (accessToken: string, refreshToken: string): void => {
  localStorage.setItem(TOKEN_KEY, accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
};

export const clearStoredTokens = (): void => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
};

// Track if we're already showing the session expired modal
let isSessionExpiredModalShown = false;

export const resetSessionExpiredFlag = (): void => {
  isSessionExpiredModalShown = false;
};

// Request interceptor to add auth token
apiClient.interceptors.request.use(
  (config) => {
    const token = getStoredToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor for token refresh
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // If 401 (no token) or 403 (invalid/expired token) and not already retried
    if ((error.response?.status === 401 || error.response?.status === 403) && !originalRequest._retry) {
      originalRequest._retry = true;

      const refreshToken = getStoredRefreshToken();
      if (refreshToken) {
        try {
          const response = await axios.post(`${API_BASE_URL}/api/auth/refresh`, {
            refreshToken,
          });

          const { accessToken } = response.data;
          localStorage.setItem(TOKEN_KEY, accessToken);

          originalRequest.headers.Authorization = `Bearer ${accessToken}`;
          return apiClient(originalRequest);
        } catch (refreshError) {
          // Refresh failed, show session expired modal instead of redirecting
          if (!isSessionExpiredModalShown) {
            isSessionExpiredModalShown = true;
            triggerSessionExpired();
          }
          return Promise.reject(refreshError);
        }
      } else {
        // No refresh token available, show session expired modal
        if (!isSessionExpiredModalShown && getStoredToken()) {
          isSessionExpiredModalShown = true;
          triggerSessionExpired();
        }
      }
    }

    return Promise.reject(error);
  }
);

export default apiClient;
