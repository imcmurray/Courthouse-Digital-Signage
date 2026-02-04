import apiClient from './client';

export interface DocketEntry {
  id: string;
  caseNumber: string;
  caseTitle: string;
  caseChapter: string;
  adversaryNumber?: string | null;
  adversaryTitle?: string | null;
  hearingDate: string;
  hearingTime: string;
  hearingMatter: string;
  hearingJudge: string;
  courtroom?: string | null;
  movingParty?: string | null;
  opposingParty?: string | null;
  trustee?: string | null;
  isZoom: boolean;
  zoomMeetingId?: string | null;
  zoomPasscode?: string | null;
  zoomPhone?: string | null;
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled' | 'continued' | 'stricken' | 'reserved';
  statusNote?: string | null;
  comment?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateDocketEntryInput {
  caseNumber: string;
  caseTitle: string;
  caseChapter: string;
  adversaryNumber?: string;
  adversaryTitle?: string;
  hearingDate: string;
  hearingTime: string;
  hearingMatter: string;
  hearingJudge: string;
  courtroom?: string;
  movingParty?: string;
  opposingParty?: string;
  trustee?: string;
  isZoom?: boolean;
  zoomMeetingId?: string;
  zoomPasscode?: string;
  zoomPhone?: string;
  status?: string;
  statusNote?: string;
  comment?: string;
}

export interface UpdateDocketEntryInput extends Partial<CreateDocketEntryInput> {}

export interface DocketResponse {
  entries: DocketEntry[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface DocketFilters {
  date?: string;
  courtroom?: string;
  status?: string;
  judge?: string;
  chapter?: string;
  page?: number;
  limit?: number;
}

export const docketApi = {
  getAll: async (filters?: DocketFilters): Promise<DocketResponse> => {
    const params = new URLSearchParams();
    if (filters?.date) params.append('date', filters.date);
    if (filters?.courtroom) params.append('courtroom', filters.courtroom);
    if (filters?.status) params.append('status', filters.status);
    if (filters?.judge) params.append('judge', filters.judge);
    if (filters?.chapter) params.append('chapter', filters.chapter);
    if (filters?.page) params.append('page', filters.page.toString());
    if (filters?.limit) params.append('limit', filters.limit.toString());

    const queryString = params.toString();
    const url = queryString ? `/api/docket?${queryString}` : '/api/docket';
    const response = await apiClient.get<DocketResponse>(url);
    return response.data;
  },

  getById: async (id: string): Promise<DocketEntry> => {
    const response = await apiClient.get<DocketEntry>(`/api/docket/${id}`);
    return response.data;
  },

  create: async (data: CreateDocketEntryInput): Promise<DocketEntry> => {
    const response = await apiClient.post<DocketEntry>('/api/docket', data);
    return response.data;
  },

  update: async (id: string, data: UpdateDocketEntryInput): Promise<DocketEntry> => {
    const response = await apiClient.put<DocketEntry>(`/api/docket/${id}`, data);
    return response.data;
  },

  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/api/docket/${id}`);
  },

  clearByDate: async (date: string, options?: { courtroom?: string; archive?: boolean }): Promise<{ message: string; count: number; archived: boolean }> => {
    const response = await apiClient.delete<{ message: string; count: number; archived: boolean }>('/api/docket/clear', {
      data: { date, ...options },
    });
    return response.data;
  },

  bulkImport: async (entries: CreateDocketEntryInput[]): Promise<{ message: string; count: number; entries: DocketEntry[] }> => {
    const response = await apiClient.post<{ message: string; count: number; entries: DocketEntry[] }>('/api/docket/bulk', { entries });
    return response.data;
  },

  downloadTemplate: (): string => {
    return '/api/docket/template';
  },
};

export default docketApi;
