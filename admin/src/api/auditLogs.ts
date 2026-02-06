import apiClient from './client';

export interface AuditLogUser {
  id: string;
  name: string;
  email: string;
}

export interface AuditLog {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  userId: string | null;
  apiKeyId: string | null;
  changes: string | null;
  ipAddress: string | null;
  createdAt: string;
  user: AuditLogUser | null;
}

export interface AuditLogsResponse {
  logs: AuditLog[];
  total: number;
}

export interface AuditLogFilters {
  action?: string;
  entityType?: string;
  userId?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
  sortOrder?: 'asc' | 'desc';
}

export const auditLogsApi = {
  getAll: async (filters?: AuditLogFilters): Promise<AuditLogsResponse> => {
    const params = new URLSearchParams();
    if (filters?.action) params.append('action', filters.action);
    if (filters?.entityType) params.append('entityType', filters.entityType);
    if (filters?.userId) params.append('userId', filters.userId);
    if (filters?.startDate) params.append('startDate', filters.startDate);
    if (filters?.endDate) params.append('endDate', filters.endDate);
    if (filters?.limit) params.append('limit', filters.limit.toString());
    if (filters?.offset) params.append('offset', filters.offset.toString());
    if (filters?.sortOrder) params.append('sortOrder', filters.sortOrder);

    const queryString = params.toString();
    const url = queryString ? `/api/audit-logs?${queryString}` : '/api/audit-logs';

    const response = await apiClient.get<AuditLogsResponse>(url);
    return response.data;
  },
};

export default auditLogsApi;
