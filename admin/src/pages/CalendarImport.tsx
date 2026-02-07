import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { calendarImportApi, ImportStatus, ImportConfig, ImportLog } from '../api/calendarImport';

export default function CalendarImport() {
  const queryClient = useQueryClient();
  const [configForm, setConfigForm] = useState<Partial<ImportConfig>>({});
  const [configDirty, setConfigDirty] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);

  // Fetch import status
  const { data: status, refetch: refetchStatus } = useQuery<ImportStatus>({
    queryKey: ['calendar-import-status'],
    queryFn: calendarImportApi.getStatus,
    refetchInterval: 5000, // Poll every 5 seconds while running
  });

  // Fetch import config
  const { data: config } = useQuery<ImportConfig>({
    queryKey: ['calendar-import-config'],
    queryFn: calendarImportApi.getConfig,
  });

  // Fetch import history
  const { data: history } = useQuery({
    queryKey: ['calendar-import-history', historyPage],
    queryFn: () => calendarImportApi.getHistory(historyPage, 10),
  });

  // Sync config form when data loads
  useEffect(() => {
    if (config && !configDirty) {
      setConfigForm(config);
    }
  }, [config, configDirty]);

  // Trigger manual import
  const runImportMutation = useMutation({
    mutationFn: calendarImportApi.runImport,
    onSuccess: () => {
      toast.success('Import started');
      refetchStatus();
      // Poll status more frequently
      const interval = setInterval(async () => {
        const s = await calendarImportApi.getStatus();
        queryClient.setQueryData(['calendar-import-status'], s);
        if (!s.isRunning) {
          clearInterval(interval);
          queryClient.invalidateQueries({ queryKey: ['calendar-import-history'] });
        }
      }, 2000);
    },
    onError: (error: any) => {
      const message = error.response?.data?.error || 'Failed to start import';
      toast.error(message);
    },
  });

  // Update config
  const updateConfigMutation = useMutation({
    mutationFn: calendarImportApi.updateConfig,
    onSuccess: (data) => {
      toast.success('Configuration updated');
      queryClient.setQueryData(['calendar-import-config'], data);
      setConfigDirty(false);
      refetchStatus();
    },
    onError: () => {
      toast.error('Failed to update configuration');
    },
  });

  const handleConfigChange = (field: keyof ImportConfig, value: any) => {
    setConfigForm(prev => ({ ...prev, [field]: value }));
    setConfigDirty(true);
  };

  const handleSaveConfig = () => {
    updateConfigMutation.mutate(configForm);
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Never';
    return new Date(dateStr).toLocaleString();
  };

  const formatDuration = (ms: number | null) => {
    if (ms === null) return '-';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const statusBadge = (s: string) => {
    const colors: Record<string, string> = {
      success: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
      running: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
      partial: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
      failed: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
    };
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${colors[s] || 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'}`}>
        {s === 'running' && (
          <svg className="animate-spin -ml-0.5 mr-1.5 h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
        )}
        {s}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Status & Controls */}
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white">Import Status</h3>
        </div>
        <div className="p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="space-y-2">
              <div className="flex items-center space-x-3">
                <span className="text-sm text-gray-500 dark:text-gray-400">Status:</span>
                {status?.isRunning ? statusBadge('running') : (
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Idle</span>
                )}
              </div>
              <div className="flex items-center space-x-3">
                <span className="text-sm text-gray-500 dark:text-gray-400">Last run:</span>
                <span className="text-sm text-gray-700 dark:text-gray-300">{formatDate(status?.lastRunAt || null)}</span>
                {status?.lastRunStatus && statusBadge(status.lastRunStatus)}
              </div>
              <div className="flex items-center space-x-3">
                <span className="text-sm text-gray-500 dark:text-gray-400">Auto-import:</span>
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  {status?.autoImportEnabled
                    ? `Enabled (every ${status.intervalMinutes} min)`
                    : 'Disabled'}
                </span>
              </div>
            </div>
            <button
              onClick={() => runImportMutation.mutate()}
              disabled={status?.isRunning || runImportMutation.isPending}
              className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary hover:bg-primary-dark focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {status?.isRunning ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Importing...
                </>
              ) : (
                <>
                  <svg className="-ml-1 mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Import Now
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Recent Import History */}
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white">Import History</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Time</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Judge</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Found</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Created</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Updated</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Removed</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Duration</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {history?.logs.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-6 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                    No import history yet. Click "Import Now" to run your first import.
                  </td>
                </tr>
              )}
              {history?.logs.map((log: ImportLog) => (
                <tr key={log.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">
                    {formatDate(log.createdAt)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">
                    {log.judgeName || log.judgeCode || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">
                    {log.entriesFound}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-green-600 dark:text-green-400">
                    {log.entriesCreated > 0 ? `+${log.entriesCreated}` : '0'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-blue-600 dark:text-blue-400">
                    {log.entriesUpdated > 0 ? log.entriesUpdated : '0'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-red-600 dark:text-red-400">
                    {log.entriesRemoved > 0 ? `-${log.entriesRemoved}` : '0'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {statusBadge(log.status)}
                    {log.errorMessage && (
                      <p className="mt-1 text-xs text-red-500 dark:text-red-400 max-w-xs truncate" title={log.errorMessage}>
                        {log.errorMessage}
                      </p>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    {formatDuration(log.durationMs)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* Pagination */}
        {history && history.totalPages > 1 && (
          <div className="px-6 py-3 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Showing page {history.page} of {history.totalPages} ({history.total} total)
            </p>
            <div className="flex space-x-2">
              <button
                onClick={() => setHistoryPage(p => Math.max(1, p - 1))}
                disabled={historyPage <= 1}
                className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-md text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <button
                onClick={() => setHistoryPage(p => p + 1)}
                disabled={historyPage >= history.totalPages}
                className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-md text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Configuration */}
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white">Configuration</h3>
        </div>
        <div className="p-6 space-y-4">
          {/* Auto-import toggle */}
          <div className="flex items-center justify-between">
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Auto-import</label>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Automatically import calendars at a regular interval
              </p>
            </div>
            <button
              onClick={() => handleConfigChange('enabled', !configForm.enabled)}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 ${
                configForm.enabled ? 'bg-primary' : 'bg-gray-200 dark:bg-gray-600'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  configForm.enabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Interval */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Import interval (minutes)
            </label>
            <select
              value={configForm.intervalMinutes || 30}
              onChange={(e) => handleConfigChange('intervalMinutes', parseInt(e.target.value))}
              className="mt-1 block w-full sm:w-48 pl-3 pr-10 py-2 text-base border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-primary focus:border-primary rounded-md"
            >
              <option value={15}>15 minutes</option>
              <option value={20}>20 minutes</option>
              <option value={30}>30 minutes</option>
              <option value={60}>60 minutes</option>
              <option value={120}>2 hours</option>
            </select>
          </div>

          {/* Source URL */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Source URL
            </label>
            <input
              type="text"
              value={configForm.sourceUrl || ''}
              onChange={(e) => handleConfigChange('sourceUrl', e.target.value)}
              className="mt-1 block w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary focus:border-primary text-sm"
              placeholder="https://www.utb.uscourts.gov/anticipated-pdf/all"
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              PDF links will be discovered from this page (from both links and embedded viewers).
            </p>
          </div>

          {/* Save button */}
          {configDirty && (
            <div className="pt-2">
              <button
                onClick={handleSaveConfig}
                disabled={updateConfigMutation.isPending}
                className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary hover:bg-primary-dark focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:opacity-50"
              >
                {updateConfigMutation.isPending ? 'Saving...' : 'Save Configuration'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
