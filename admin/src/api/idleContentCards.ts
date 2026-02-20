import apiClient from './client';

export interface IdleContentCardDisplay {
  displayId: string;
  display: { id: string; name: string };
}

export interface IdleContentCard {
  id: string;
  title: string;
  body: string;
  icon: string | null;
  sortOrder: number;
  enabled: boolean;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy?: {
    id: string;
    name: string;
    email: string;
  } | null;
  displays?: IdleContentCardDisplay[];
}

export interface CreateIdleContentCardInput {
  title: string;
  body: string;
  icon?: string | null;
  sortOrder?: number;
  enabled?: boolean;
  expiresAt?: string | null;
  displayIds?: string[];
}

export interface UpdateIdleContentCardInput extends Partial<CreateIdleContentCardInput> {}

export interface IdleContentCardsResponse {
  cards: IdleContentCard[];
  total: number;
}

export const idleContentCardsApi = {
  getAll: async (enabledOnly?: boolean): Promise<IdleContentCardsResponse> => {
    const url = enabledOnly ? '/api/idle-content-cards?enabled=true' : '/api/idle-content-cards';
    const response = await apiClient.get<IdleContentCardsResponse>(url);
    return response.data;
  },

  create: async (data: CreateIdleContentCardInput): Promise<IdleContentCard> => {
    const response = await apiClient.post<IdleContentCard>('/api/idle-content-cards', data);
    return response.data;
  },

  update: async (id: string, data: UpdateIdleContentCardInput): Promise<IdleContentCard> => {
    const response = await apiClient.put<IdleContentCard>(`/api/idle-content-cards/${id}`, data);
    return response.data;
  },

  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/api/idle-content-cards/${id}`);
  },

  reorder: async (order: { id: string; sortOrder: number }[]) => {
    const response = await apiClient.patch('/api/idle-content-cards/reorder', { order });
    return response.data;
  },
};

export default idleContentCardsApi;
