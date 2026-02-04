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
};

export default displaysApi;
