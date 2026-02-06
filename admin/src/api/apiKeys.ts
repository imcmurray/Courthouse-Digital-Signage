import { apiClient } from './client';

export interface ApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  permissions: string[];
  displayId: string | null;
  display: { id: string; name: string } | null;
  expiresAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
}

export interface CreateApiKeyResponse extends ApiKey {
  apiKey: string; // Only returned on creation
}

export interface CreateApiKeyInput {
  name: string;
  permissions: string[];
  displayId?: string | null;
  expiresAt?: string | null;
}

export interface UpdateApiKeyInput {
  name?: string;
  permissions?: string[];
  displayId?: string | null;
  expiresAt?: string | null;
}

export const apiKeysApi = {
  // Get all API keys
  getAll: async (): Promise<{ apiKeys: ApiKey[]; total: number }> => {
    const response = await apiClient.get('/api/api-keys');
    return response.data;
  },

  // Get a single API key
  getById: async (id: string): Promise<ApiKey> => {
    const response = await apiClient.get(`/api/api-keys/${id}`);
    return response.data;
  },

  // Create a new API key
  create: async (data: CreateApiKeyInput): Promise<CreateApiKeyResponse> => {
    const response = await apiClient.post('/api/api-keys', data);
    return response.data;
  },

  // Update an API key
  update: async (id: string, data: UpdateApiKeyInput): Promise<ApiKey> => {
    const response = await apiClient.put<ApiKey>(`/api/api-keys/${id}`, data);
    return response.data;
  },

  // Revoke (delete) an API key
  revoke: async (id: string): Promise<{ success: boolean; message: string }> => {
    const response = await apiClient.delete(`/api/api-keys/${id}`);
    return response.data;
  },
};

export default apiKeysApi;
