import apiClient from './client';

export interface AnnouncementDisplay {
  displayId: string;
  display: { id: string; name: string };
}

export interface Announcement {
  id: string;
  text: string;
  priority: number;
  enabled: boolean;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy?: {
    id: string;
    name: string;
    email: string;
  } | null;
  displays?: AnnouncementDisplay[];
}

export interface CreateAnnouncementInput {
  text: string;
  priority?: number;
  enabled?: boolean;
  expiresAt?: string | null;
  displayIds?: string[];
}

export interface UpdateAnnouncementInput extends Partial<CreateAnnouncementInput> {}

export interface AnnouncementsResponse {
  announcements: Announcement[];
  total: number;
}

export const announcementsApi = {
  getAll: async (activeOnly?: boolean): Promise<AnnouncementsResponse> => {
    const url = activeOnly ? '/api/announcements?active=true' : '/api/announcements';
    const response = await apiClient.get<AnnouncementsResponse>(url);
    return response.data;
  },

  getById: async (id: string): Promise<Announcement> => {
    const response = await apiClient.get<Announcement>(`/api/announcements/${id}`);
    return response.data;
  },

  create: async (data: CreateAnnouncementInput): Promise<Announcement> => {
    const response = await apiClient.post<Announcement>('/api/announcements', data);
    return response.data;
  },

  update: async (id: string, data: UpdateAnnouncementInput): Promise<Announcement> => {
    const response = await apiClient.put<Announcement>(`/api/announcements/${id}`, data);
    return response.data;
  },

  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/api/announcements/${id}`);
  },

  reorder: async (order: { id: string; priority: number }[]) => {
    const response = await apiClient.patch('/api/announcements/reorder', { order });
    return response.data;
  },
};

export default announcementsApi;
