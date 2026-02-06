import apiClient from './client';

export interface Display {
  id: string;
  name: string;
  location: string;
  judgeFilter: string | null;
  courtroomFilter: string | null;
  chapterFilter: string | null;
  showStricken: boolean;
  showZoomInfo: boolean;
  highlightCurrent: boolean;
  theme: string;
  columns: string;
  showWeather: boolean;
  weatherLocation: string | null;
  noticeText: string;
  tickerEnabled: boolean;
  tickerSpeed: string;
  status: string;
  lastHeartbeat: string | null;
  ipAddress: string | null;
  apiKey?: string;  // Only returned on creation
  createdAt: string;
  updatedAt: string;
}

export interface CreateDisplayInput {
  id: string;
  name: string;
  location: string;
  judgeFilter?: string | null;
  courtroomFilter?: string | null;
  showStricken?: boolean;
  showZoomInfo?: boolean;
  highlightCurrent?: boolean;
  theme?: string;
  showWeather?: boolean;
  weatherLocation?: string | null;
  noticeText?: string;
  tickerEnabled?: boolean;
  tickerSpeed?: string;
}

export interface UpdateDisplayInput extends Partial<Omit<CreateDisplayInput, 'id'>> {}

export interface DisplaysResponse {
  displays: Display[];
  total: number;
}

export interface PreviewTokenResponse {
  previewToken: string;
  displayId: string;
  expiresIn: number;
}

export const displaysApi = {
  getAll: async (): Promise<DisplaysResponse> => {
    const response = await apiClient.get<DisplaysResponse>('/api/displays');
    return response.data;
  },

  getById: async (id: string): Promise<Display> => {
    const response = await apiClient.get<Display>(`/api/displays/${id}`);
    return response.data;
  },

  create: async (data: CreateDisplayInput): Promise<Display> => {
    const response = await apiClient.post<Display>('/api/displays', data);
    return response.data;
  },

  update: async (id: string, data: UpdateDisplayInput): Promise<Display> => {
    const response = await apiClient.put<Display>(`/api/displays/${id}`, data);
    return response.data;
  },

  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/api/displays/${id}`);
  },

  regenerateKey: async (id: string): Promise<{ apiKey: string; displayId: string }> => {
    const response = await apiClient.post<{ success: boolean; message: string; apiKey: string; displayId: string }>(`/api/displays/${id}/regenerate-key`);
    return response.data;
  },

  getPreviewToken: async (id: string): Promise<PreviewTokenResponse> => {
    const response = await apiClient.post<PreviewTokenResponse>(`/api/displays/${id}/preview-token`);
    return response.data;
  },

  refreshAll: async (): Promise<void> => {
    await apiClient.post('/api/displays/refresh');
  },
};

export default displaysApi;
