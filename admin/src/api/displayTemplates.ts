import apiClient from './client';

export interface DisplayTypeTemplate {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  isBuiltIn: boolean;
  components: string;  // JSON
  layout: string | null;  // JSON
  usageCount?: number;
  createdAt: string;
  updatedAt: string;
  createdBy?: {
    id: string;
    name: string;
    email: string;
  } | null;
}

export interface CreateDisplayTemplateInput {
  slug: string;
  name: string;
  description?: string | null;
  components: object[] | string;
  layout?: object | string | null;
}

export interface UpdateDisplayTemplateInput {
  slug?: string;
  name?: string;
  description?: string | null;
  components?: object[] | string;
  layout?: object | string | null;
}

export interface DisplayTemplatesResponse {
  templates: DisplayTypeTemplate[];
  total: number;
}

export const displayTemplatesApi = {
  getAll: async (): Promise<DisplayTemplatesResponse> => {
    const response = await apiClient.get<DisplayTemplatesResponse>('/api/display-templates');
    return response.data;
  },

  getById: async (id: string): Promise<DisplayTypeTemplate> => {
    const response = await apiClient.get<DisplayTypeTemplate>(`/api/display-templates/${id}`);
    return response.data;
  },

  create: async (data: CreateDisplayTemplateInput): Promise<DisplayTypeTemplate> => {
    const response = await apiClient.post<DisplayTypeTemplate>('/api/display-templates', data);
    return response.data;
  },

  update: async (id: string, data: UpdateDisplayTemplateInput): Promise<DisplayTypeTemplate> => {
    const response = await apiClient.put<DisplayTypeTemplate>(`/api/display-templates/${id}`, data);
    return response.data;
  },

  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/api/display-templates/${id}`);
  },

  reset: async (id: string): Promise<DisplayTypeTemplate> => {
    const response = await apiClient.post<DisplayTypeTemplate>(`/api/display-templates/${id}/reset`);
    return response.data;
  },
};

export default displayTemplatesApi;
