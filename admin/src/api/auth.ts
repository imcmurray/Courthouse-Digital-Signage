import apiClient, { setStoredTokens, clearStoredTokens } from './client';

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'editor' | 'viewer';
  isActive?: boolean;
  mustChangePassword?: boolean;
  createdAt?: string;
}

export interface LoginResponse {
  accessToken: string;
  user: User;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export const authApi = {
  login: async (credentials: LoginCredentials): Promise<LoginResponse> => {
    const response = await apiClient.post<LoginResponse>('/api/auth/login', credentials);
    const { accessToken } = response.data;

    // Store access token (refresh token is set as HttpOnly cookie by backend)
    setStoredTokens(accessToken);

    return response.data;
  },

  logout: async (): Promise<void> => {
    try {
      await apiClient.post('/api/auth/logout');
    } catch (error) {
      // Ignore errors on logout
    } finally {
      clearStoredTokens();
    }
  },

  getCurrentUser: async (): Promise<User> => {
    const response = await apiClient.get<User>('/api/auth/me');
    return response.data;
  },

  refreshToken: async (): Promise<{ accessToken: string; user: User }> => {
    const response = await apiClient.post('/api/auth/refresh');
    return response.data;
  },
};

export default authApi;
