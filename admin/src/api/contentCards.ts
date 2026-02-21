import apiClient from './client';

export interface ContentCardDisplay {
  displayId: string;
  display: { id: string; name: string };
}

export interface ContentCard {
  id: string;
  title: string;
  body: string;
  type: string; // 'info' | 'upcoming_hearings' | 'statistics'
  icon: string | null;
  sortOrder: number;
  enabled: boolean;
  expiresAt: string | null;
  isEmergency: boolean;
  emergencyLevel: number | null; // 1=section, 2=content area, 3=full screen
  emergencyTarget: string | null;
  activatedAt: string | null;
  activatedById: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy?: {
    id: string;
    name: string;
    email: string;
  } | null;
  activatedBy?: {
    id: string;
    name: string;
    email: string;
  } | null;
  displays?: ContentCardDisplay[];
}

export interface CreateContentCardInput {
  title: string;
  body: string;
  icon?: string | null;
  sortOrder?: number;
  enabled?: boolean;
  expiresAt?: string | null;
  displayIds?: string[];
}

export interface UpdateContentCardInput extends Partial<CreateContentCardInput> {}

export interface CreateEmergencyCardInput {
  title: string;
  body: string;
  icon?: string | null;
  emergencyLevel: 1 | 2 | 3;
  emergencyTarget?: string | null;
  sortOrder?: number;
  enabled?: boolean;
  expiresAt?: string | null;
  displayIds?: string[];
}

export interface ContentCardsResponse {
  cards: ContentCard[];
  total: number;
}

export const contentCardsApi = {
  getAll: async (enabledOnly?: boolean, isEmergency?: boolean): Promise<ContentCardsResponse> => {
    const params = new URLSearchParams();
    if (enabledOnly) params.set('enabled', 'true');
    if (isEmergency !== undefined) params.set('isEmergency', String(isEmergency));
    const query = params.toString();
    const url = query ? `/api/content-cards?${query}` : '/api/content-cards';
    const response = await apiClient.get<ContentCardsResponse>(url);
    return response.data;
  },

  create: async (data: CreateContentCardInput): Promise<ContentCard> => {
    const response = await apiClient.post<ContentCard>('/api/content-cards', data);
    return response.data;
  },

  update: async (id: string, data: UpdateContentCardInput): Promise<ContentCard> => {
    const response = await apiClient.put<ContentCard>(`/api/content-cards/${id}`, data);
    return response.data;
  },

  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/api/content-cards/${id}`);
  },

  reorder: async (order: { id: string; sortOrder: number }[]) => {
    const response = await apiClient.patch('/api/content-cards/reorder', { order });
    return response.data;
  },

  createEmergency: async (data: CreateEmergencyCardInput): Promise<ContentCard> => {
    const response = await apiClient.post<ContentCard>('/api/content-cards/emergency', data);
    return response.data;
  },

  activate: async (id: string): Promise<ContentCard> => {
    const response = await apiClient.post<ContentCard>(`/api/content-cards/${id}/activate`);
    return response.data;
  },

  deactivate: async (id: string): Promise<ContentCard> => {
    const response = await apiClient.post<ContentCard>(`/api/content-cards/${id}/deactivate`);
    return response.data;
  },
};

export default contentCardsApi;
