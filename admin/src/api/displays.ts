import apiClient from './client';

export interface DaySchedule {
  start: string;
  end: string;
}

export type WeekSchedule = {
  [key in 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday']: DaySchedule | null;
};

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
  orientation: string;
  theme: string;
  columns: string;
  showWeather: boolean;
  weatherLocation: string | null;
  noticeText: string;
  tickerEnabled: boolean;
  tickerSpeed: string;
  scheduleEnabled: boolean;
  scheduleConfig: string;
  screensaverType: string;
  docketViewMode: string;
  displayType: string;
  wayfindingConfig: string | object | null;
  rtspUrl1: string | null;
  rtspUrl2: string | null;
  cameraLabel1: string | null;
  cameraLabel2: string | null;
  cameraRotateInterval: number | null;
  cameraConfig: string | object | null;
  showContentCards: boolean;
  displayTemplate: DisplayTemplate | null;
  status: string;
  lastHeartbeat: string | null;
  ipAddress: string | null;
  apiKey?: string;  // Only returned on creation
  createdAt: string;
  updatedAt: string;
}

// Template builder types
export interface OrientationLayout {
  columns?: string;         // CSS grid-template-columns, e.g. "40% 60%"
  rows?: string;            // CSS grid-template-rows, e.g. "45% 55%"
  gap?: string;             // CSS gap, e.g. "0" or "4px"
  areas: string[][];        // 2D grid areas, e.g. [["left", "right"]]
}

export interface LayoutConfig {
  landscape: OrientationLayout;
  portrait: OrientationLayout;
}

export interface DisplayTemplateComponent {
  type: 'hearing-table' | 'hearing-pills' | 'content-cards' | 'direction-cards' | 'camera-grid' | 'system-status';
  config: Record<string, any>;
  gridArea?: {
    landscape?: string;
    portrait?: string;
  };
}

export interface DisplayTemplate {
  name: string;
  displayType: string;
  components: DisplayTemplateComponent[];
  layout?: LayoutConfig | null;
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
  orientation?: string;
  theme?: string;
  showWeather?: boolean;
  weatherLocation?: string | null;
  noticeText?: string;
  tickerEnabled?: boolean;
  tickerSpeed?: string;
  scheduleEnabled?: boolean;
  scheduleConfig?: WeekSchedule;
  screensaverType?: string;
  docketViewMode?: string;
  displayType?: string;
  wayfindingConfig?: object | string | null;
  rtspUrl1?: string | null;
  rtspUrl2?: string | null;
  cameraLabel1?: string | null;
  cameraLabel2?: string | null;
  cameraRotateInterval?: number | null;
  cameraConfig?: object | string | null;
  showContentCards?: boolean;
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

  screensaverControl: async (id: string, action: 'activate' | 'deactivate'): Promise<void> => {
    await apiClient.post(`/api/displays/${id}/screensaver`, { action });
  },
};

export default displaysApi;
