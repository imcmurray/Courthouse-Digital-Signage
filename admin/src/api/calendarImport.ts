import apiClient from './client';

export interface ImportProgress {
  currentJudge: string | null;
  currentStep: string | null;
  completedCalendars: number;
  totalCalendars: number;
  lastError: string | null;
}

export interface ImportStatus {
  isRunning: boolean;
  lastRunAt: string | null;
  lastRunStatus: string | null;
  autoImportEnabled: boolean;
  intervalMinutes: number;
  progress: ImportProgress | null;
}

export interface ImportLog {
  id: string;
  source: string;
  judgeName: string | null;
  judgeCode: string | null;
  sourceUrl: string | null;
  filename: string | null;
  entriesFound: number;
  entriesCreated: number;
  entriesUpdated: number;
  entriesSkipped: number;
  entriesRemoved: number;
  status: string;
  errorMessage: string | null;
  durationMs: number | null;
  createdAt: string;
}

export interface ImportHistoryResponse {
  logs: ImportLog[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ImportConfig {
  enabled: boolean;
  intervalMinutes: number;
  sourceUrl: string;
}

export const calendarImportApi = {
  getStatus: async (): Promise<ImportStatus> => {
    const response = await apiClient.get<ImportStatus>('/api/calendar-import/status');
    return response.data;
  },

  runImport: async (): Promise<{ message: string }> => {
    const response = await apiClient.post<{ message: string }>('/api/calendar-import/run');
    return response.data;
  },

  getHistory: async (page = 1, limit = 20): Promise<ImportHistoryResponse> => {
    const response = await apiClient.get<ImportHistoryResponse>(
      `/api/calendar-import/history?page=${page}&limit=${limit}`
    );
    return response.data;
  },

  getConfig: async (): Promise<ImportConfig> => {
    const response = await apiClient.get<ImportConfig>('/api/calendar-import/config');
    return response.data;
  },

  updateConfig: async (data: Partial<ImportConfig>): Promise<ImportConfig> => {
    const response = await apiClient.put<ImportConfig>('/api/calendar-import/config', data);
    return response.data;
  },
};

export default calendarImportApi;
