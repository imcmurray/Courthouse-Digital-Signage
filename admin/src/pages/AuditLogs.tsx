import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { auditLogsApi, AuditLog, AuditLogFilters } from '../api/auditLogs';

export default function AuditLogs() {
  const [filters, setFilters] = useState<AuditLogFilters>({
    limit: 50,
    offset: 0,
  });

  // Fetch audit logs
  const { data, isLoading, error } = useQuery({
    queryKey: ['audit-logs', filters],
    queryFn: () => auditLogsApi.getAll(filters),
  });

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  const formatAction = (action: string) => {
    switch (action) {
      case 'create':
        return <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded-full">Create</span>;
      case 'update':
        return <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded-full">Update</span>;
      case 'delete':
        return <span className="px-2 py-1 text-xs font-medium bg-red-100 text-red-800 rounded-full">Delete</span>;
      default:
        return <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-800 rounded-full">{action}</span>;
    }
  };

  const formatEntityType = (entityType: string) => {
    return entityType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  const parseChanges = (changes: string | null): Record<string, unknown> | null => {
    if (!changes) return null;
    try {
      return JSON.parse(changes);
    } catch {
      return null;
    }
  };

  const renderChanges = (log: AuditLog) => {
    const changes = parseChanges(log.changes);
    if (!changes) return <span className="text-gray-400">-</span>;

    const entries = Object.entries(changes).slice(0, 3);
    return (
      <div className="text-sm text-gray-600">
        {entries.map(([key, value], index) => (
          <span key={key}>
            <span className="font-medium">{key}:</span> {String(value)}
            {index < entries.length - 1 && ', '}
          </span>
        ))}
        {Object.entries(changes).length > 3 && <span className="text-gray-400"> ...</span>}
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
        Failed to load audit logs. Please try again later.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Audit Logs</h1>
          <p className="mt-1 text-sm text-gray-500">
            View all system activity and changes.
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white shadow rounded-lg p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Action</label>
            <select
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
              value={filters.action || ''}
              onChange={(e) => setFilters({ ...filters, action: e.target.value || undefined, offset: 0 })}
            >
              <option value="">All Actions</option>
              <option value="create">Create</option>
              <option value="update">Update</option>
              <option value="delete">Delete</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Entity Type</label>
            <select
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
              value={filters.entityType || ''}
              onChange={(e) => setFilters({ ...filters, entityType: e.target.value || undefined, offset: 0 })}
            >
              <option value="">All Types</option>
              <option value="docket_entry">Docket Entry</option>
              <option value="announcement">Announcement</option>
              <option value="display">Display</option>
              <option value="user">User</option>
              <option value="api_key">API Key</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
            <input
              type="date"
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
              value={filters.startDate || ''}
              onChange={(e) => setFilters({ ...filters, startDate: e.target.value || undefined, offset: 0 })}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
            <input
              type="date"
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
              value={filters.endDate || ''}
              onChange={(e) => setFilters({ ...filters, endDate: e.target.value || undefined, offset: 0 })}
            />
          </div>
        </div>
      </div>

      {/* Audit Logs Table */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Timestamp
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Action
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Entity Type
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Entity ID
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                User
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Details
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {data?.logs && data.logs.length > 0 ? (
              data.logs.map((log) => (
                <tr key={log.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {formatDate(log.createdAt)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {formatAction(log.action)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {formatEntityType(log.entityType)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-mono">
                    {log.entityId ? log.entityId.substring(0, 8) + '...' : '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {log.user?.name || log.user?.email || 'System'}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate">
                    {renderChanges(log)}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                  No audit logs found.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {/* Pagination */}
        {data && data.total > 0 && (
          <div className="bg-gray-50 px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6">
            <div className="flex-1 flex justify-between sm:hidden">
              <button
                onClick={() => setFilters({ ...filters, offset: Math.max(0, (filters.offset || 0) - (filters.limit || 50)) })}
                disabled={(filters.offset || 0) === 0}
                className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
              >
                Previous
              </button>
              <button
                onClick={() => setFilters({ ...filters, offset: (filters.offset || 0) + (filters.limit || 50) })}
                disabled={(filters.offset || 0) + (filters.limit || 50) >= data.total}
                className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
              >
                Next
              </button>
            </div>
            <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
              <div>
                <p className="text-sm text-gray-700">
                  Showing{' '}
                  <span className="font-medium">{(filters.offset || 0) + 1}</span>
                  {' '}to{' '}
                  <span className="font-medium">
                    {Math.min((filters.offset || 0) + (filters.limit || 50), data.total)}
                  </span>
                  {' '}of{' '}
                  <span className="font-medium">{data.total}</span>
                  {' '}results
                </p>
              </div>
              <div>
                <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px">
                  <button
                    onClick={() => setFilters({ ...filters, offset: Math.max(0, (filters.offset || 0) - (filters.limit || 50)) })}
                    disabled={(filters.offset || 0) === 0}
                    className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setFilters({ ...filters, offset: (filters.offset || 0) + (filters.limit || 50) })}
                    disabled={(filters.offset || 0) + (filters.limit || 50) >= data.total}
                    className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                  >
                    Next
                  </button>
                </nav>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
