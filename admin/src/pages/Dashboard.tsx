import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../api/client';
import DocketForm from '../components/DocketForm';
import { docketApi, CreateDocketEntryInput } from '../api/docket';
import { announcementsApi, CreateAnnouncementInput } from '../api/announcements';
import { displaysApi } from '../api/displays';

interface DashboardStats {
  todaysHearings: number;
  activeDisplays: number;
  totalDisplays: number;
  activeAnnouncements: number;
  activeUsers: number;
}

interface ActivityItem {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  user: string;
  timestamp: string;
  changes: Record<string, unknown> | null;
}

export default function Dashboard() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Quick Action state
  const [isAddHearingOpen, setIsAddHearingOpen] = useState(false);
  const [isNewAnnouncementOpen, setIsNewAnnouncementOpen] = useState(false);
  const [announcementForm, setAnnouncementForm] = useState<CreateAnnouncementInput>({
    text: '',
    priority: 0,
    enabled: true,
    expiresAt: null,
  });

  // Quick Action mutations
  const createHearingMutation = useMutation({
    mutationFn: (data: CreateDocketEntryInput) => docketApi.create(data),
    onSuccess: () => {
      toast.success('Hearing created successfully');
      setIsAddHearingOpen(false);
      queryClient.invalidateQueries({ queryKey: ['dashboardStats'] });
    },
    onError: () => {
      toast.error('Failed to create hearing');
    },
  });

  const createAnnouncementMutation = useMutation({
    mutationFn: (data: CreateAnnouncementInput) => announcementsApi.create(data),
    onSuccess: () => {
      toast.success('Announcement created successfully');
      setIsNewAnnouncementOpen(false);
      setAnnouncementForm({ text: '', priority: 0, enabled: true, expiresAt: null });
      queryClient.invalidateQueries({ queryKey: ['dashboardStats'] });
    },
    onError: () => {
      toast.error('Failed to create announcement');
    },
  });

  const refreshDisplaysMutation = useMutation({
    mutationFn: () => displaysApi.refreshAll(),
    onSuccess: () => {
      toast.success('Refresh signal sent to all displays');
    },
    onError: () => {
      toast.error('Failed to refresh displays');
    },
  });

  const { data: stats, isLoading: statsLoading } = useQuery<DashboardStats>({
    queryKey: ['dashboardStats'],
    queryFn: async () => {
      const response = await api.get('/api/stats');
      return response.data;
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const { data: recentActivity, isLoading: activityLoading } = useQuery<ActivityItem[]>({
    queryKey: ['recentActivity'],
    queryFn: async () => {
      const response = await api.get('/api/recent-activity?limit=10');
      return response.data;
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const formatStat = (value: number | undefined, loading: boolean) => {
    if (loading) return '...';
    if (value === undefined) return '--';
    return value.toString();
  };

  const formatActivityDescription = (activity: ActivityItem) => {
    const actionVerb = {
      create: 'created',
      update: 'updated',
      delete: 'deleted',
      login: 'logged in',
      logout: 'logged out',
    }[activity.action] || activity.action;

    const entityName = {
      docket_entry: 'docket entry',
      announcement: 'announcement',
      display: 'display',
      user: 'user',
      api_key: 'API key',
      setting: 'setting',
    }[activity.entityType] || activity.entityType;

    if (activity.action === 'login' || activity.action === 'logout') {
      return actionVerb;
    }

    return `${actionVerb} ${entityName}`;
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;

    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const getActivityIcon = (action: string) => {
    switch (action) {
      case 'create':
        return (
          <svg className="h-4 w-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
        );
      case 'update':
        return (
          <svg className="h-4 w-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        );
      case 'delete':
        return (
          <svg className="h-4 w-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        );
      default:
        return (
          <svg className="h-4 w-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Welcome message */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm dark:shadow-gray-900/50 p-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Welcome back, {user?.name?.split(' ')[0]}!
        </h1>
        <p className="mt-2 text-gray-600 dark:text-gray-300">
          Here's an overview of your courthouse digital signage system.
        </p>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm dark:shadow-gray-900/50 p-6">
          <div className="flex items-center">
            <div className="h-12 w-12 rounded-lg bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center">
              <svg className="h-6 w-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Today's Hearings</p>
              <p className="text-2xl font-semibold text-gray-900 dark:text-white" data-testid="todays-hearings">
                {formatStat(stats?.todaysHearings, statsLoading)}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm dark:shadow-gray-900/50 p-6">
          <div className="flex items-center">
            <div className="h-12 w-12 rounded-lg bg-green-100 dark:bg-green-900/40 flex items-center justify-center">
              <svg className="h-6 w-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Active Displays</p>
              <p className="text-2xl font-semibold text-gray-900 dark:text-white" data-testid="active-displays">
                {formatStat(stats?.activeDisplays, statsLoading)}
                {stats && stats.totalDisplays > 0 && (
                  <span className="text-sm font-normal text-gray-400 ml-1">
                    / {stats.totalDisplays}
                  </span>
                )}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm dark:shadow-gray-900/50 p-6">
          <div className="flex items-center">
            <div className="h-12 w-12 rounded-lg bg-yellow-100 dark:bg-yellow-900/40 flex items-center justify-center">
              <svg className="h-6 w-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
              </svg>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Announcements</p>
              <p className="text-2xl font-semibold text-gray-900 dark:text-white" data-testid="active-announcements">
                {formatStat(stats?.activeAnnouncements, statsLoading)}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm dark:shadow-gray-900/50 p-6">
          <div className="flex items-center">
            <div className="h-12 w-12 rounded-lg bg-purple-100 dark:bg-purple-900/40 flex items-center justify-center">
              <svg className="h-6 w-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Active Users</p>
              <p className="text-2xl font-semibold text-gray-900 dark:text-white" data-testid="active-users">
                {formatStat(stats?.activeUsers, statsLoading)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm dark:shadow-gray-900/50 p-6">
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Quick Actions</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button
            onClick={() => setIsAddHearingOpen(true)}
            className="flex items-center justify-center px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            <svg className="h-5 w-5 text-gray-600 dark:text-gray-300 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            <span className="text-gray-700 dark:text-gray-200">Add Hearing</span>
          </button>
          <button
            onClick={() => setIsNewAnnouncementOpen(true)}
            className="flex items-center justify-center px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            <svg className="h-5 w-5 text-gray-600 dark:text-gray-300 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
            </svg>
            <span className="text-gray-700 dark:text-gray-200">New Announcement</span>
          </button>
          <button
            onClick={() => refreshDisplaysMutation.mutate()}
            disabled={refreshDisplaysMutation.isPending}
            className="flex items-center justify-center px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg className={`h-5 w-5 text-gray-600 dark:text-gray-300 mr-2 ${refreshDisplaysMutation.isPending ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <span className="text-gray-700 dark:text-gray-200">{refreshDisplaysMutation.isPending ? 'Refreshing...' : 'Refresh Displays'}</span>
          </button>
        </div>
      </div>

      {/* System Status */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm dark:shadow-gray-900/50 p-6">
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">System Status</h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-gray-600 dark:text-gray-300">Backend API</span>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300">
              Online
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-600 dark:text-gray-300">Database</span>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300">
              Connected
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-600 dark:text-gray-300">WebSocket</span>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 dark:bg-yellow-900/40 text-yellow-800 dark:text-yellow-300">
              Initializing
            </span>
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm dark:shadow-gray-900/50 p-6">
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Recent Activity</h3>
        {activityLoading ? (
          <div className="text-gray-500 dark:text-gray-400 text-sm">Loading activity...</div>
        ) : recentActivity && recentActivity.length > 0 ? (
          <div className="space-y-4">
            {recentActivity.map((activity) => (
              <div key={activity.id} className="flex items-start space-x-3">
                <div className="flex-shrink-0 mt-0.5">
                  {getActivityIcon(activity.action)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-900 dark:text-white">
                    <span className="font-medium">{activity.user}</span>{' '}
                    {formatActivityDescription(activity)}
                    {activity.entityId && (
                      <span className="text-gray-500 dark:text-gray-400"> #{activity.entityId.slice(0, 8)}</span>
                    )}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    {formatTimestamp(activity.timestamp)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-gray-500 dark:text-gray-400 text-sm">No recent activity</div>
        )}
      </div>

      {/* Add Hearing Modal */}
      {isAddHearingOpen && (
        <DocketForm
          onSubmit={(data) => createHearingMutation.mutate(data as CreateDocketEntryInput)}
          onClose={() => setIsAddHearingOpen(false)}
          isLoading={createHearingMutation.isPending}
        />
      )}

      {/* New Announcement Modal */}
      {isNewAnnouncementOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-lg w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Create Announcement</h3>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                createAnnouncementMutation.mutate(announcementForm);
              }}
              className="mt-4 space-y-4"
            >
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                  Announcement Text *
                </label>
                <textarea
                  value={announcementForm.text}
                  onChange={(e) => setAnnouncementForm({ ...announcementForm, text: e.target.value })}
                  required
                  maxLength={500}
                  rows={3}
                  className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary focus:border-primary dark:bg-gray-700 dark:text-white dark:placeholder-gray-400 ${
                    announcementForm.text.length >= 500
                      ? 'border-red-500'
                      : announcementForm.text.length >= 450
                        ? 'border-yellow-500'
                        : 'border-gray-300 dark:border-gray-600'
                  }`}
                  placeholder="Enter announcement text..."
                />
                <div className={`text-xs mt-1 flex justify-between ${
                  announcementForm.text.length >= 500
                    ? 'text-red-600'
                    : announcementForm.text.length >= 450
                      ? 'text-yellow-600'
                      : 'text-gray-500 dark:text-gray-400'
                }`}>
                  <span>Maximum 500 characters</span>
                  <span>{announcementForm.text.length}/500</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                    Priority (0-20)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="20"
                    value={announcementForm.priority}
                    onChange={(e) => setAnnouncementForm({ ...announcementForm, priority: parseInt(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary dark:bg-gray-700 dark:text-white"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Higher priority = shown first
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                    Expires At
                  </label>
                  <input
                    type="date"
                    value={announcementForm.expiresAt ? announcementForm.expiresAt.split('T')[0] : ''}
                    onChange={(e) => setAnnouncementForm({
                      ...announcementForm,
                      expiresAt: e.target.value ? new Date(e.target.value).toISOString() : null
                    })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary dark:bg-gray-700 dark:text-white"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Leave empty for no expiration
                  </p>
                </div>
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="dashboard-announcement-enabled"
                  checked={announcementForm.enabled}
                  onChange={(e) => setAnnouncementForm({ ...announcementForm, enabled: e.target.checked })}
                  className="h-4 w-4 text-primary focus:ring-primary border-gray-300 dark:border-gray-600 rounded dark:bg-gray-700"
                />
                <label htmlFor="dashboard-announcement-enabled" className="ml-2 text-sm text-gray-700 dark:text-gray-200">
                  Enabled (show on displays)
                </label>
              </div>

              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setIsNewAnnouncementOpen(false);
                    setAnnouncementForm({ text: '', priority: 0, enabled: true, expiresAt: null });
                  }}
                  className="px-4 py-2 text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createAnnouncementMutation.isPending}
                  className="px-4 py-2 text-white bg-primary rounded-lg hover:bg-primary/90 disabled:opacity-50"
                >
                  {createAnnouncementMutation.isPending ? 'Creating...' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
