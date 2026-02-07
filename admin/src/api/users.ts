import apiClient from './client';

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'editor' | 'viewer';
  isActive: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface CreateUserInput {
  email: string;
  password: string;
  name: string;
  role: 'admin' | 'editor' | 'viewer';
}

export interface UpdateUserInput {
  email?: string;
  password?: string;
  name?: string;
  role?: 'admin' | 'editor' | 'viewer';
  isActive?: boolean;
}

export interface UsersResponse {
  users: User[];
  total: number;
}

export const usersApi = {
  getAll: async (): Promise<UsersResponse> => {
    const response = await apiClient.get<UsersResponse>('/api/users');
    return response.data;
  },

  getById: async (id: string): Promise<User> => {
    const response = await apiClient.get<User>(`/api/users/${id}`);
    return response.data;
  },

  create: async (data: CreateUserInput): Promise<User> => {
    const response = await apiClient.post<User>('/api/users', data);
    return response.data;
  },

  update: async (id: string, data: UpdateUserInput): Promise<User> => {
    const response = await apiClient.put<User>(`/api/users/${id}`, data);
    return response.data;
  },

  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/api/users/${id}`);
  },

  permanentDelete: async (id: string): Promise<void> => {
    await apiClient.delete(`/api/users/${id}/permanent`);
  },
};

export default usersApi;
