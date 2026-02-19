import { useState, useEffect, useRef, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../api/client';
import DocketForm from '../components/DocketForm';
import ModalPortal from '../components/ModalPortal';
import { docketApi, DocketEntry, CreateDocketEntryInput, UpdateDocketEntryInput } from '../api/docket';
import { getLocalDateString } from '../utils/dateUtils';
import { announcementsApi, Announcement, CreateAnnouncementInput, UpdateAnnouncementInput } from '../api/announcements';
import { displaysApi, Display } from '../api/displays';
import DisplayEditModal from '../components/DisplayEditModal';
import { calendarImportApi, ImportStatus } from '../api/calendarImport';

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
    displayIds: [],
  });
  const [showOnAllDisplaysCreate, setShowOnAllDisplaysCreate] = useState(true);
  const [editingAnnouncement, setEditingAnnouncement] = useState<Announcement | null>(null);
  const [editForm, setEditForm] = useState<UpdateAnnouncementInput>({});
  const [showOnAllDisplaysEdit, setShowOnAllDisplaysEdit] = useState(true);
  const [editingDisplay, setEditingDisplay] = useState<Display | null>(null);
  const [editingDocketEntry, setEditingDocketEntry] = useState<DocketEntry | null>(null);
  const [selectedJudge, setSelectedJudge] = useState<string | null>(null);
  const [hideStricken, setHideStricken] = useState(false);

  // Quick Action mutations
  const createHearingMutation = useMutation({
    mutationFn: (data: CreateDocketEntryInput) => docketApi.create(data),
    onSuccess: () => {
      toast.success('Hearing created successfully');
      setIsAddHearingOpen(false);
      queryClient.invalidateQueries({ queryKey: ['dashboardStats'] });
      queryClient.invalidateQueries({ queryKey: ['dashboardHearings'] });
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
      setAnnouncementForm({ text: '', priority: 0, enabled: true, expiresAt: null, displayIds: [] });
      setShowOnAllDisplaysCreate(true);
      queryClient.invalidateQueries({ queryKey: ['dashboardStats'] });
      queryClient.invalidateQueries({ queryKey: ['dashboardAnnouncements'] });
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

  const toggleAnnouncementMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      announcementsApi.update(id, { enabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboardAnnouncements'] });
      queryClient.invalidateQueries({ queryKey: ['dashboardStats'] });
    },
    onError: () => {
      toast.error('Failed to update announcement');
    },
  });

  const updateAnnouncementMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateAnnouncementInput }) =>
      announcementsApi.update(id, data),
    onSuccess: () => {
      toast.success('Announcement updated');
      setEditingAnnouncement(null);
      queryClient.invalidateQueries({ queryKey: ['dashboardAnnouncements'] });
      queryClient.invalidateQueries({ queryKey: ['dashboardStats'] });
    },
    onError: () => {
      toast.error('Failed to update announcement');
    },
  });

  const runImportMutation = useMutation({
    mutationFn: () => calendarImportApi.runImport(),
    onSuccess: () => {
      toast.success('Calendar import started');
      // Immediately refetch status to pick up progress
      queryClient.invalidateQueries({ queryKey: ['dashboardImportStatus'] });
      queryClient.invalidateQueries({ queryKey: ['dashboardImportHistory'] });
    },
    onError: (error: any) => {
      const message = error?.response?.data?.error || 'Failed to start import';
      toast.error(message);
    },
  });

  const updateDocketMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateDocketEntryInput }) => docketApi.update(id, data),
    onSuccess: () => {
      toast.success('Docket entry updated');
      setEditingDocketEntry(null);
      queryClient.invalidateQueries({ queryKey: ['dashboardStats'] });
      queryClient.invalidateQueries({ queryKey: ['dashboardHearings'] });
    },
    onError: () => {
      toast.error('Failed to update docket entry');
    },
  });

  // Queries
  const { data: stats, isLoading: statsLoading } = useQuery<DashboardStats>({
    queryKey: ['dashboardStats'],
    queryFn: async () => {
      const response = await api.get('/api/stats');
      return response.data;
    },
    refetchInterval: 30000,
  });

  const { data: recentActivity, isLoading: activityLoading } = useQuery<ActivityItem[]>({
    queryKey: ['recentActivity'],
    queryFn: async () => {
      const response = await api.get('/api/recent-activity?limit=10');
      return response.data;
    },
    refetchInterval: 30000,
  });

  const todayStr = getLocalDateString();

  // Widget 1: Today's hearings
  const { data: todaysHearings } = useQuery({
    queryKey: ['dashboardHearings', todayStr],
    queryFn: () => docketApi.getAll({ date: todayStr, limit: 500, sortBy: 'hearingTime', sortOrder: 'asc' }),
    refetchInterval: 60000,
  });

  // Stricken count for today (exact from server)
  const { data: strickenData } = useQuery({
    queryKey: ['dashboardHearingsStricken', todayStr],
    queryFn: () => docketApi.getAll({ date: todayStr, status: 'stricken', limit: 1 }),
    refetchInterval: 60000,
  });

  // Widget 2: Display health
  const { data: displaysData } = useQuery({
    queryKey: ['dashboardDisplays'],
    queryFn: () => displaysApi.getAll(),
    refetchInterval: 30000,
  });

  // Widget 3: Active announcements
  const { data: announcementsData } = useQuery({
    queryKey: ['dashboardAnnouncements'],
    queryFn: () => announcementsApi.getAll(),
    refetchInterval: 30000,
  });

  // Widget 4: Import status (poll faster while running)
  const { data: importStatus } = useQuery<ImportStatus>({
    queryKey: ['dashboardImportStatus'],
    queryFn: () => calendarImportApi.getStatus(),
    refetchInterval: (query) => query.state.data?.isRunning ? 2000 : 15000,
    enabled: user?.role === 'admin',
  });

  const { data: importHistory } = useQuery({
    queryKey: ['dashboardImportHistory'],
    queryFn: () => calendarImportApi.getHistory(1, 10),
    refetchInterval: () => importStatus?.isRunning ? 3000 : 30000,
    enabled: user?.role === 'admin',
  });

  // Refresh hearings & stats when import finishes
  const wasRunning = useRef(false);
  useEffect(() => {
    if (importStatus?.isRunning) {
      wasRunning.current = true;
    } else if (wasRunning.current) {
      wasRunning.current = false;
      queryClient.invalidateQueries({ queryKey: ['dashboardHearings'] });
      queryClient.invalidateQueries({ queryKey: ['dashboardHearingsStricken'] });
      queryClient.invalidateQueries({ queryKey: ['dashboardStats'] });
    }
  }, [importStatus?.isRunning, queryClient]);

  // Helpers
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
      calendar: 'calendar',
    }[activity.entityType] || activity.entityType;

    if (activity.action === 'login' || activity.action === 'logout') {
      return actionVerb;
    }

    if (activity.action === 'import' && activity.changes) {
      const c = activity.changes as Record<string, number>;
      const parts: string[] = [];
      if (c.created) parts.push(`${c.created} added`);
      if (c.updated) parts.push(`${c.updated} updated`);
      if (c.removed) parts.push(`${c.removed} removed`);
      if (c.skippedManualEdits) parts.push(`${c.skippedManualEdits} protected`);
      return `imported calendars — ${parts.length > 0 ? parts.join(', ') : 'no changes'}`;
    }

    // Enhanced update descriptions with before/after detail
    if (activity.action === 'update' && activity.changes) {
      const c = activity.changes as Record<string, unknown>;
      // Check if changes have { from, to } structure
      const fieldEntries = Object.entries(c).filter(
        ([, v]) => v && typeof v === 'object' && 'from' in (v as Record<string, unknown>) && 'to' in (v as Record<string, unknown>)
      );
      if (fieldEntries.length > 0) {
        // If status changed, highlight it
        const statusChange = fieldEntries.find(([k]) => k === 'status');
        if (statusChange) {
          const to = (statusChange[1] as { to: unknown }).to;
          const otherCount = fieldEntries.length - 1;
          const suffix = otherCount > 0 ? ` + ${otherCount} more` : '';
          return `updated ${entityName} — status \u2192 ${to}${suffix}`;
        }
        // Otherwise list changed field names
        if (fieldEntries.length <= 2) {
          return `updated ${entityName} — ${fieldEntries.map(([k]) => k).join(', ')} changed`;
        }
        return `updated ${entityName} — ${fieldEntries.length} fields changed`;
      }
    }

    // Enhanced create/delete with identifying info
    if ((activity.action === 'create' || activity.action === 'delete') && activity.changes) {
      const c = activity.changes as Record<string, unknown>;
      const label = c.name || c.caseNumber;
      if (label) {
        return `${actionVerb} ${entityName} "${label}"`;
      }
    }

    return `${actionVerb} ${entityName}`;
  };

  const formatActivityTooltip = (activity: ActivityItem): string | undefined => {
    if (!activity.changes) return undefined;
    const c = activity.changes as Record<string, unknown>;
    const lines: string[] = [];

    // Full timestamp
    lines.push(new Date(activity.timestamp).toLocaleString());
    if (activity.entityId) lines.push(`ID: ${activity.entityId}`);
    lines.push('');

    for (const [key, value] of Object.entries(c)) {
      if (value && typeof value === 'object' && 'from' in (value as Record<string, unknown>) && 'to' in (value as Record<string, unknown>)) {
        const { from, to } = value as { from: unknown; to: unknown };
        lines.push(`${key}: ${from ?? '(empty)'} \u2192 ${to ?? '(empty)'}`);
      } else {
        lines.push(`${key}: ${typeof value === 'object' ? JSON.stringify(value) : String(value)}`);
      }
    }
    return lines.join('\n');
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  };

  const formatTime12h = (time24: string) => {
    const [h, m] = time24.split(':');
    const hour = parseInt(h);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    return `${hour12}:${m} ${ampm}`;
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
      case 'import':
        return (
          <svg className="h-4 w-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
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

  // Build a local Date for a hearing's time today.
  // entry.hearingDate is UTC midnight (e.g. "2026-02-18T00:00:00.000Z") which
  // shifts to the previous day in US timezones.  Since the dashboard already
  // filters to today's hearings, we use new Date() (local today) as the base
  // and only apply the hearing's HH:MM — matching the wayfinder display approach.
  const hearingToLocal = (entry: DocketEntry) => {
    const now = new Date();
    const [h, m] = entry.hearingTime.split(':').map(Number);
    const t = new Date(now);
    t.setHours(h, m, 0, 0);
    return { now, t };
  };

  const isHearingSoon = (entry: DocketEntry) => {
    const { now, t } = hearingToLocal(entry);
    const diffMs = t.getTime() - now.getTime();
    return diffMs > 0 && diffMs <= 30 * 60 * 1000;
  };

  const isHearingPast = (entry: DocketEntry) => {
    const { now, t } = hearingToLocal(entry);
    const diffMs = t.getTime() - now.getTime();
    return diffMs < -15 * 60 * 1000; // more than 15 min ago
  };

  const isHearingImminent = (entry: DocketEntry) => {
    const { now, t } = hearingToLocal(entry);
    const diffMin = (t.getTime() - now.getTime()) / (60 * 1000);
    return diffMin >= -15 && diffMin <= 15;
  };

  const isAnnouncementExpiringSoon = (ann: Announcement) => {
    if (!ann.expiresAt) return false;
    const diffMs = new Date(ann.expiresAt).getTime() - Date.now();
    return diffMs > 0 && diffMs <= 24 * 60 * 60 * 1000;
  };

  const getDisplayStatusColor = (display: Display) => {
    if (display.status === 'online') return 'bg-green-500';
    return 'bg-red-500';
  };

  const getDisplayLastSeen = (display: Display) => {
    if (!display.lastHeartbeat) return 'Never';
    return formatTimestamp(display.lastHeartbeat);
  };

  // Widget 5: Group hearings by courtroom/judge
  const hearingsByJudge = (todaysHearings?.entries || [])
    .reduce<Record<string, DocketEntry[]>>((acc, entry) => {
      const key = entry.hearingJudge || 'Unassigned';
      if (!acc[key]) acc[key] = [];
      acc[key].push(entry);
      return acc;
    }, {});

  const judgeCounts = (todaysHearings?.entries || []).reduce<Record<string, number>>((acc, entry) => {
    const judge = entry.hearingJudge || 'Unassigned';
    acc[judge] = (acc[judge] || 0) + 1;
    return acc;
  }, {});

  const getLastName = (fullName: string) => {
    const parts = fullName.trim().split(/\s+/);
    return parts[parts.length - 1];
  };

  const totalCount = todaysHearings?.total || 0;
  const strickenCount = strickenData?.total || 0;
  const activeCount = totalCount - strickenCount;

  // Aggregate all logs from the most recent import run.
  // Each run creates one log per judge, so we group logs within 10 minutes of the latest.
  const lastImport = useMemo(() => {
    const logs = importHistory?.logs;
    if (!logs || logs.length === 0) return undefined;
    const latest = logs[0];
    const latestTime = new Date(latest.createdAt).getTime();
    const runLogs = logs.filter(
      (l) => latestTime - new Date(l.createdAt).getTime() < 10 * 60 * 1000
    );
    return {
      ...latest,
      entriesCreated: runLogs.reduce((s, l) => s + (l.entriesCreated || 0), 0),
      entriesUpdated: runLogs.reduce((s, l) => s + (l.entriesUpdated || 0), 0),
      entriesRemoved: runLogs.reduce((s, l) => s + (l.entriesRemoved || 0), 0),
      status: runLogs.some((l) => l.status === 'failed')
        ? runLogs.some((l) => l.status === 'success') ? 'partial' : 'failed'
        : runLogs.some((l) => l.status === 'running') ? 'running' : 'success',
    };
  }, [importHistory]);

  return (
    <div className="space-y-4">
      {/* Welcome */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Welcome back, {user?.name?.split(' ')[0]}!
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Here's an overview of your courthouse digital signage system.
          </p>
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm dark:shadow-gray-900/50 p-4">
          <div className="flex items-center">
            <div className="h-10 w-10 rounded-lg bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center flex-shrink-0">
              <svg className="h-5 w-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Today's Hearings</p>
              <p className="text-sm text-gray-900 dark:text-white whitespace-nowrap" data-testid="todays-hearings">
                {todaysHearings && totalCount > 0 ? (
                  <><span className="font-semibold">{activeCount}</span> <span className="text-gray-400">active /</span> <span className="font-semibold">{strickenCount}</span> <span className="text-gray-400">stricken /</span> <span className="font-semibold">{totalCount}</span> <span className="text-gray-400">total</span></>
                ) : (
                  <span className="text-xl font-semibold">{formatStat(stats?.todaysHearings, statsLoading)}</span>
                )}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm dark:shadow-gray-900/50 p-4">
          <div className="flex items-center">
            <div className="h-10 w-10 rounded-lg bg-green-100 dark:bg-green-900/40 flex items-center justify-center flex-shrink-0">
              <svg className="h-5 w-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Active Displays</p>
              <p className="text-xl font-semibold text-gray-900 dark:text-white" data-testid="active-displays">
                {formatStat(stats?.activeDisplays, statsLoading)}
                {stats && stats.totalDisplays > 0 && (
                  <span className="text-sm font-normal text-gray-400 ml-1">/ {stats.totalDisplays}</span>
                )}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm dark:shadow-gray-900/50 p-4">
          <div className="flex items-center">
            <div className="h-10 w-10 rounded-lg bg-yellow-100 dark:bg-yellow-900/40 flex items-center justify-center flex-shrink-0">
              <svg className="h-5 w-5 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Announcements</p>
              <p className="text-xl font-semibold text-gray-900 dark:text-white" data-testid="active-announcements">
                {formatStat(stats?.activeAnnouncements, statsLoading)}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm dark:shadow-gray-900/50 p-4">
          <div className="flex items-center">
            <div className="h-10 w-10 rounded-lg bg-purple-100 dark:bg-purple-900/40 flex items-center justify-center flex-shrink-0">
              <svg className="h-5 w-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Active Users</p>
              <p className="text-xl font-semibold text-gray-900 dark:text-white" data-testid="active-users">
                {formatStat(stats?.activeUsers, statsLoading)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions + System Status + Import Status */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm dark:shadow-gray-900/50 p-4">
          <h3 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Quick Actions</h3>
          <div className="space-y-2">
            <button
              onClick={() => setIsAddHearingOpen(true)}
              className="w-full flex items-center px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              <svg className="h-4 w-4 text-blue-500 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              <span className="text-sm text-gray-700 dark:text-gray-200">Add Hearing</span>
            </button>
            <button
              onClick={() => setIsNewAnnouncementOpen(true)}
              className="w-full flex items-center px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              <svg className="h-4 w-4 text-yellow-500 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
              </svg>
              <span className="text-sm text-gray-700 dark:text-gray-200">New Announcement</span>
            </button>
            <button
              onClick={() => refreshDisplaysMutation.mutate()}
              disabled={refreshDisplaysMutation.isPending}
              className="w-full flex items-center px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg className={`h-4 w-4 text-green-500 mr-2 flex-shrink-0 ${refreshDisplaysMutation.isPending ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <span className="text-sm text-gray-700 dark:text-gray-200">{refreshDisplaysMutation.isPending ? 'Refreshing...' : 'Refresh Displays'}</span>
            </button>
          </div>
        </div>

        {/* Widget 2: Display Health */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm dark:shadow-gray-900/50 p-4">
          <h3 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Display Health</h3>
          {displaysData?.displays && displaysData.displays.length > 0 ? (
            <div className="space-y-2">
              {displaysData.displays.map((display) => (
                <div key={display.id} className="flex items-center justify-between">
                  <div className="flex items-center min-w-0">
                    <div className={`h-2.5 w-2.5 rounded-full ${getDisplayStatusColor(display)} flex-shrink-0`} />
                    <div className="ml-2 min-w-0">
                      <button
                        onClick={() => setEditingDisplay(display)}
                        className="text-sm font-medium text-gray-900 dark:text-white text-left hover:text-primary dark:hover:text-primary-light transition-colors truncate"
                      >
                        {display.name}
                      </button>
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{display.location}</p>
                    </div>
                  </div>
                  <span className="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0 ml-2">
                    {display.status === 'online' ? 'Online' : getDisplayLastSeen(display)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500 dark:text-gray-400">No displays configured</p>
          )}
        </div>

        {/* Widget 4: Import Status (admin only) */}
        {user?.role === 'admin' ? (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm dark:shadow-gray-900/50 p-4">
            <h3 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Calendar Import</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600 dark:text-gray-300">Auto-import</span>
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                  importStatus?.autoImportEnabled
                    ? 'bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                }`}>
                  {importStatus?.autoImportEnabled ? `Every ${importStatus.intervalMinutes}m` : 'Disabled'}
                </span>
              </div>
              {/* Live progress while running */}
              {importStatus?.isRunning && importStatus.progress && (
                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg px-3 py-2 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-blue-700 dark:text-blue-300">
                      {importStatus.progress.currentStep || 'Starting...'}
                    </span>
                  </div>
                  {importStatus.progress.totalCalendars > 0 && (
                    <>
                      <div className="w-full bg-blue-200 dark:bg-blue-800 rounded-full h-1.5">
                        <div
                          className="bg-blue-600 dark:bg-blue-400 h-1.5 rounded-full transition-all duration-300"
                          style={{ width: `${Math.round((importStatus.progress.completedCalendars / importStatus.progress.totalCalendars) * 100)}%` }}
                        />
                      </div>
                      <div className="text-xs text-blue-600 dark:text-blue-400">
                        {importStatus.progress.completedCalendars} / {importStatus.progress.totalCalendars} calendars
                      </div>
                    </>
                  )}
                </div>
              )}
              {lastImport && (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600 dark:text-gray-300">Last run</span>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {formatTimestamp(lastImport.createdAt)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600 dark:text-gray-300">Result</span>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                      lastImport.status === 'success'
                        ? 'bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300'
                        : lastImport.status === 'partial'
                          ? 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-800 dark:text-yellow-300'
                          : lastImport.status === 'running'
                            ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300'
                            : 'bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-300'
                    }`}>
                      {lastImport.status === 'success' && `+${lastImport.entriesCreated} / ~${lastImport.entriesUpdated} / -${lastImport.entriesRemoved}`}
                      {lastImport.status === 'partial' && 'Partial'}
                      {lastImport.status === 'running' && 'Running...'}
                      {lastImport.status === 'failed' && 'Failed'}
                    </span>
                  </div>
                  {lastImport.status === 'failed' && lastImport.errorMessage && (
                    <div className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded px-2 py-1">
                      {lastImport.errorMessage}
                    </div>
                  )}
                </>
              )}
              <button
                onClick={() => runImportMutation.mutate()}
                disabled={runImportMutation.isPending || importStatus?.isRunning}
                className="w-full flex items-center justify-center px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-gray-700 dark:text-gray-200"
              >
                <svg className={`h-4 w-4 mr-1.5 ${(runImportMutation.isPending || importStatus?.isRunning) ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                {importStatus?.isRunning ? 'Importing...' : 'Import Now'}
              </button>
            </div>
          </div>
        ) : (
          /* System Status for non-admin users */
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm dark:shadow-gray-900/50 p-4">
            <h3 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">System Status</h3>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600 dark:text-gray-300">Backend API</span>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300">Online</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600 dark:text-gray-300">Database</span>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300">Connected</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Widget 1: Today's Hearings + Widget 3: Active Announcements */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Today's Hearings Preview */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm dark:shadow-gray-900/50 p-4">
          <div className="flex items-center justify-between mb-3 gap-2">
            <h3 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider flex-shrink-0">
              Today's Hearings
              {todaysHearings && todaysHearings.total > 0 && (
                <span className="ml-2 text-gray-400">({todaysHearings.total})</span>
              )}
            </h3>
            <div className="flex flex-wrap justify-end gap-1">
              <button
                onClick={() => setHideStricken(prev => !prev)}
                className={`inline-flex items-center px-2 py-0.5 rounded text-xs transition-colors ${
                  hideStricken
                    ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                {hideStricken ? 'Stricken Hidden' : 'Hide Stricken'}
              </button>
              {Object.keys(judgeCounts).length > 1 && Object.entries(judgeCounts).map(([judge, count]) => (
                <button
                  key={judge}
                  onClick={() => setSelectedJudge(prev => prev === judge ? null : judge)}
                  className={`inline-flex items-center px-2 py-0.5 rounded text-xs transition-colors ${
                    selectedJudge === judge
                      ? 'bg-primary text-white'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                >
                  {getLastName(judge)} ({count})
                </button>
              ))}
            </div>
          </div>
          {todaysHearings?.entries && todaysHearings.entries.length > 0 ? (
            <div className="max-h-96 overflow-y-auto -mx-2 px-2">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-500 dark:text-gray-400">
                    <th className="pb-2 font-medium">Time</th>
                    <th className="pb-2 font-medium">Case</th>
                    <th className="pb-2 font-medium hidden lg:table-cell">Name</th>
                    <th className="pb-2 font-medium hidden lg:table-cell">Party</th>
                    <th className="pb-2 font-medium hidden md:table-cell">Judge</th>
                    <th className="pb-2 font-medium">Room</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {todaysHearings.entries
                    .filter(entry => !selectedJudge || entry.hearingJudge === selectedJudge)
                    .filter(entry => !hideStricken || entry.status !== 'stricken')
                    .map((entry) => {
                      const isStricken = entry.status === 'stricken';
                      const isContinued = entry.status === 'continued';
                      const isInactive = isStricken || isContinued;
                      const isPast = !isInactive && isHearingPast(entry);
                      return (
                    <tr
                      key={entry.id}
                      className={isStricken ? 'opacity-50' : isPast ? 'opacity-40' : isHearingSoon(entry) ? 'bg-amber-50 dark:bg-amber-900/10' : ''}
                    >
                      <td className="py-1.5 pr-2 whitespace-nowrap">
                        <span className={`${isInactive ? 'line-through text-gray-400 dark:text-gray-500' : isHearingSoon(entry) ? 'text-amber-600 dark:text-amber-400 font-medium' : 'text-gray-900 dark:text-white'}`}>
                          {formatTime12h(entry.hearingTime)}
                        </span>
                        {isStricken && (
                          <span className="ml-1 text-[10px] text-red-500 dark:text-red-400 font-medium">STRICKEN</span>
                        )}
                        {isContinued && (
                          <span className="ml-1 text-[10px] text-yellow-600 dark:text-yellow-400 font-medium">CONT'D</span>
                        )}
                        {!isInactive && isHearingSoon(entry) && (
                          <span className="ml-1 text-[10px] text-amber-500 font-medium">SOON</span>
                        )}
                      </td>
                      <td className="py-1.5 pr-2 truncate max-w-[180px]" title={entry.caseNumber}>
                        <button
                          onClick={() => setEditingDocketEntry(entry)}
                          className={`text-sm font-medium truncate block w-full text-left hover:text-primary dark:hover:text-primary-light transition-colors cursor-pointer ${isInactive ? 'line-through text-gray-400 dark:text-gray-500' : 'text-gray-900 dark:text-white'}`}
                        >
                          {entry.caseNumber}
                        </button>
                      </td>
                      <td className={`py-1.5 pr-2 truncate max-w-[150px] hidden lg:table-cell ${isInactive ? 'line-through text-gray-400 dark:text-gray-500' : 'text-gray-600 dark:text-gray-300'}`} title={entry.caseTitle}>
                        {entry.caseTitle}
                      </td>
                      <td className={`py-1.5 pr-2 truncate max-w-[120px] hidden lg:table-cell ${isInactive ? 'text-gray-400 dark:text-gray-500' : 'text-gray-600 dark:text-gray-300'}`} title={entry.movingParty ? `${entry.movingParty}${entry.hearingMatter ? ` — ${entry.hearingMatter}` : ''}` : undefined}>
                        {entry.movingParty ? getLastName(entry.movingParty) : '--'}
                      </td>
                      <td className={`py-1.5 pr-2 truncate max-w-[120px] hidden md:table-cell ${isInactive ? 'text-gray-400 dark:text-gray-500' : 'text-gray-600 dark:text-gray-300'}`}>
                        {getLastName(entry.hearingJudge)}
                      </td>
                      <td className={`py-1.5 whitespace-nowrap ${isInactive ? 'text-gray-400 dark:text-gray-500' : 'text-gray-600 dark:text-gray-300'}`}>
                        {entry.courtroom || '--'}
                      </td>
                    </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-gray-500 dark:text-gray-400">No hearings scheduled for today</p>
          )}
        </div>

        {/* Active Announcements */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm dark:shadow-gray-900/50 p-4 flex flex-col">
          <h3 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
            Announcements
            {announcementsData && announcementsData.total > 0 && (
              <span className="ml-2 text-gray-400">({announcementsData.total})</span>
            )}
          </h3>
          {announcementsData?.announcements && announcementsData.announcements.length > 0 ? (
            <div className="flex-1 overflow-y-auto -mx-2 px-2 space-y-2">
              {announcementsData.announcements.map((ann) => {
                const isExpired = ann.expiresAt && new Date(ann.expiresAt).getTime() < Date.now();
                const isActive = ann.enabled && !isExpired;
                return (
                <div key={ann.id} className="flex items-start space-x-3 py-1">
                  <button
                    onClick={() => toggleAnnouncementMutation.mutate({ id: ann.id, enabled: !ann.enabled })}
                    className={`mt-0.5 relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      isActive ? 'bg-green-600 dark:bg-green-700' : 'bg-gray-300 dark:bg-gray-600'
                    }`}
                    title={isExpired ? 'Expired' : ann.enabled ? 'Click to disable' : 'Click to enable'}
                  >
                    <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white dark:bg-gray-300 shadow dark:shadow-black/30 ring-0 transition duration-200 ease-in-out ${
                      isActive ? 'translate-x-4' : 'translate-x-0'
                    }`} />
                  </button>
                  <div className="flex-1 min-w-0">
                    <button
                      onClick={() => {
                        setEditingAnnouncement(ann);
                        const isAllDisplays = !ann.displays || ann.displays.length === 0;
                        setShowOnAllDisplaysEdit(isAllDisplays);
                        setEditForm({ text: ann.text, enabled: ann.enabled, expiresAt: ann.expiresAt, displayIds: isAllDisplays ? [] : ann.displays!.map(d => d.displayId) });
                      }}
                      className={`text-sm font-medium truncate block w-full text-left hover:text-primary dark:hover:text-primary-light transition-colors cursor-pointer ${isActive ? 'text-gray-900 dark:text-white' : 'text-gray-400 dark:text-gray-500 line-through'}`}
                    >
                      {ann.text}
                    </button>
                    <div className="flex items-center space-x-2 mt-0.5">
                      {isAnnouncementExpiringSoon(ann) && (
                        <span className="text-[10px] font-medium text-amber-500 dark:text-amber-400">
                          EXPIRES SOON
                        </span>
                      )}
                      {ann.expiresAt && !isAnnouncementExpiringSoon(ann) && (
                        <span className="text-[10px] text-gray-400 dark:text-gray-500">
                          Expires {new Date(ann.expiresAt).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                    {ann.displays && ann.displays.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-0.5">
                        {ann.displays.map((d) => (
                          <span key={d.displayId} className="inline-flex text-[9px] px-1 py-0 font-medium rounded bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300">
                            {d.display.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
              })}
            </div>
          ) : (
            <p className="text-sm text-gray-500 dark:text-gray-400">No announcements</p>
          )}
        </div>
      </div>

      {/* Widget 5: Today's Schedule by Courtroom/Judge + Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Schedule by Judge */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm dark:shadow-gray-900/50 p-4">
          <h3 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
            Today's Schedule by Judge
          </h3>
          {Object.keys(hearingsByJudge).length > 0 ? (
            <div className="max-h-48 overflow-y-auto -mx-2 px-2 space-y-3">
              {Object.entries(hearingsByJudge).map(([judge, entries]) => {
                const judgeActive = entries.filter(e => e.status !== 'stricken').length;
                const judgeStricken = entries.length - judgeActive;
                return (
                <div key={judge}>
                  <div className="mb-1">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                      {judge} <span className="text-xs font-normal text-gray-400 dark:text-gray-500">({judgeActive}/{judgeStricken}/{entries.length})</span>
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {Object.entries(
                      entries.reduce((acc, entry) => {
                        const time = formatTime12h(entry.hearingTime);
                        if (!acc[time]) acc[time] = [];
                        acc[time].push(entry);
                        return acc;
                      }, {} as Record<string, typeof entries>)
                    ).map(([time, groupEntries]) => {
                      const isGroupPast = groupEntries.every(e => isHearingPast(e));
                      const hasImminent = groupEntries.some(e => isHearingImminent(e));
                      const groupActive = groupEntries.filter(e => e.status !== 'stricken').length;
                      const groupStricken = groupEntries.length - groupActive;
                      return (
                        <span
                          key={time}
                          className={`inline-flex items-center bg-accent text-primary font-bold rounded-full px-2.5 py-0.5 text-xs ${
                            isGroupPast
                              ? 'opacity-35'
                              : hasImminent
                                ? 'schedule-pill-imminent'
                                : ''
                          }`}
                          title={groupEntries.map(e => `${e.caseNumber} - ${e.status} - ${e.courtroom || 'No room'}`).join('\n')}
                        >
                          {time}
                          {groupEntries.length > 1 && (
                            <span className="ml-1 opacity-70">{groupActive}/{groupStricken}/{groupEntries.length}</span>
                          )}
                        </span>
                      );
                    })}
                  </div>
                </div>
              );
              })}
            </div>
          ) : (
            <p className="text-sm text-gray-500 dark:text-gray-400">No hearings scheduled for today</p>
          )}
        </div>

        {/* Recent Activity */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm dark:shadow-gray-900/50 p-4">
          <h3 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Recent Activity</h3>
          {activityLoading ? (
            <div className="text-gray-500 dark:text-gray-400 text-sm">Loading activity...</div>
          ) : recentActivity && recentActivity.length > 0 ? (
            <div className="max-h-48 overflow-y-auto space-y-1 -mx-2 px-2">
              {recentActivity.map((activity) => (
                <div key={activity.id} className="flex items-center space-x-3 py-1.5" title={formatActivityTooltip(activity)}>
                  <div className="flex-shrink-0">
                    {getActivityIcon(activity.action)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-900 dark:text-white truncate">
                      <span className="font-medium">{activity.user}</span>{' '}
                      {formatActivityDescription(activity)}
                      {activity.entityId && (
                        <span className="text-gray-500 dark:text-gray-400"> #{activity.entityId.slice(0, 8)}</span>
                      )}
                    </p>
                  </div>
                  <span className="flex-shrink-0 text-xs text-gray-400 dark:text-gray-500">
                    {formatTimestamp(activity.timestamp)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-gray-500 dark:text-gray-400 text-sm">No recent activity</div>
          )}
        </div>
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
        <ModalPortal>
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-lg w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Create Announcement</h3>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                createAnnouncementMutation.mutate({
                  ...announcementForm,
                  displayIds: showOnAllDisplaysCreate ? [] : announcementForm.displayIds,
                });
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

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="dashboard-create-all-displays"
                  checked={showOnAllDisplaysCreate}
                  onChange={(e) => {
                    setShowOnAllDisplaysCreate(e.target.checked);
                    if (e.target.checked) setAnnouncementForm({ ...announcementForm, displayIds: [] });
                  }}
                  className="h-4 w-4 text-primary focus:ring-primary border-gray-300 dark:border-gray-600 rounded dark:bg-gray-700"
                />
                <label htmlFor="dashboard-create-all-displays" className="ml-2 text-sm text-gray-700 dark:text-gray-200">
                  Show on all displays
                </label>
              </div>

              {!showOnAllDisplaysCreate && displaysData?.displays && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
                    Select Displays
                  </label>
                  <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg p-3">
                    {displaysData.displays.length === 0 ? (
                      <p className="text-sm text-gray-500 dark:text-gray-400 col-span-2">No displays available</p>
                    ) : (
                      displaysData.displays.map((display) => (
                        <label key={display.id} className="flex items-center space-x-2 p-2 hover:bg-gray-50 dark:hover:bg-gray-700 rounded cursor-pointer">
                          <input
                            type="checkbox"
                            checked={announcementForm.displayIds?.includes(display.id) || false}
                            onChange={(e) => {
                              const currentIds = announcementForm.displayIds || [];
                              if (e.target.checked) {
                                setAnnouncementForm({ ...announcementForm, displayIds: [...currentIds, display.id] });
                              } else {
                                setAnnouncementForm({ ...announcementForm, displayIds: currentIds.filter(id => id !== display.id) });
                              }
                            }}
                            className="h-4 w-4 text-primary focus:ring-primary border-gray-300 dark:border-gray-600 rounded dark:bg-gray-700"
                          />
                          <span className="text-sm text-gray-700 dark:text-gray-200 truncate">{display.name}</span>
                        </label>
                      ))
                    )}
                  </div>
                  {(announcementForm.displayIds?.length || 0) > 0 && (
                    <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
                      {announcementForm.displayIds!.length} display{announcementForm.displayIds!.length !== 1 ? 's' : ''} selected
                    </p>
                  )}
                </div>
              )}

              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setIsNewAnnouncementOpen(false);
                    setAnnouncementForm({ text: '', priority: 0, enabled: true, expiresAt: null, displayIds: [] });
                    setShowOnAllDisplaysCreate(true);
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
        </ModalPortal>
      )}

      {/* Edit Announcement Modal */}
      {editingAnnouncement && (
        <ModalPortal>
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-lg w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Edit Announcement</h3>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                updateAnnouncementMutation.mutate({
                  id: editingAnnouncement.id,
                  data: {
                    ...editForm,
                    displayIds: showOnAllDisplaysEdit ? [] : editForm.displayIds,
                  },
                });
              }}
              className="mt-4 space-y-4"
            >
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                  Announcement Text *
                </label>
                <textarea
                  value={editForm.text || ''}
                  onChange={(e) => setEditForm({ ...editForm, text: e.target.value })}
                  required
                  maxLength={500}
                  rows={3}
                  className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary focus:border-primary dark:bg-gray-700 dark:text-white dark:placeholder-gray-400 ${
                    (editForm.text?.length || 0) >= 500
                      ? 'border-red-500'
                      : (editForm.text?.length || 0) >= 450
                        ? 'border-yellow-500'
                        : 'border-gray-300 dark:border-gray-600'
                  }`}
                  placeholder="Enter announcement text..."
                />
                <div className={`text-xs mt-1 flex justify-between ${
                  (editForm.text?.length || 0) >= 500
                    ? 'text-red-600'
                    : (editForm.text?.length || 0) >= 450
                      ? 'text-yellow-600'
                      : 'text-gray-500 dark:text-gray-400'
                }`}>
                  <span>Maximum 500 characters</span>
                  <span>{editForm.text?.length || 0}/500</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                  Expires At
                </label>
                <input
                  type="date"
                  value={editForm.expiresAt ? editForm.expiresAt.split('T')[0] : ''}
                  onChange={(e) => setEditForm({
                    ...editForm,
                    expiresAt: e.target.value ? new Date(e.target.value).toISOString() : null
                  })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary dark:bg-gray-700 dark:text-white"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Leave empty for no expiration
                </p>
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="edit-announcement-enabled"
                  checked={editForm.enabled ?? true}
                  onChange={(e) => setEditForm({ ...editForm, enabled: e.target.checked })}
                  className="h-4 w-4 text-primary focus:ring-primary border-gray-300 dark:border-gray-600 rounded dark:bg-gray-700"
                />
                <label htmlFor="edit-announcement-enabled" className="ml-2 text-sm text-gray-700 dark:text-gray-200">
                  Enabled (show on displays)
                </label>
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="edit-all-displays"
                  checked={showOnAllDisplaysEdit}
                  onChange={(e) => {
                    setShowOnAllDisplaysEdit(e.target.checked);
                    if (e.target.checked) setEditForm({ ...editForm, displayIds: [] });
                  }}
                  className="h-4 w-4 text-primary focus:ring-primary border-gray-300 dark:border-gray-600 rounded dark:bg-gray-700"
                />
                <label htmlFor="edit-all-displays" className="ml-2 text-sm text-gray-700 dark:text-gray-200">
                  Show on all displays
                </label>
              </div>

              {!showOnAllDisplaysEdit && displaysData?.displays && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
                    Select Displays
                  </label>
                  <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg p-3">
                    {displaysData.displays.length === 0 ? (
                      <p className="text-sm text-gray-500 dark:text-gray-400 col-span-2">No displays available</p>
                    ) : (
                      displaysData.displays.map((display) => (
                        <label key={display.id} className="flex items-center space-x-2 p-2 hover:bg-gray-50 dark:hover:bg-gray-700 rounded cursor-pointer">
                          <input
                            type="checkbox"
                            checked={editForm.displayIds?.includes(display.id) || false}
                            onChange={(e) => {
                              const currentIds = editForm.displayIds || [];
                              if (e.target.checked) {
                                setEditForm({ ...editForm, displayIds: [...currentIds, display.id] });
                              } else {
                                setEditForm({ ...editForm, displayIds: currentIds.filter(id => id !== display.id) });
                              }
                            }}
                            className="h-4 w-4 text-primary focus:ring-primary border-gray-300 dark:border-gray-600 rounded dark:bg-gray-700"
                          />
                          <span className="text-sm text-gray-700 dark:text-gray-200 truncate">{display.name}</span>
                        </label>
                      ))
                    )}
                  </div>
                  {(editForm.displayIds?.length || 0) > 0 && (
                    <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
                      {editForm.displayIds!.length} display{editForm.displayIds!.length !== 1 ? 's' : ''} selected
                    </p>
                  )}
                </div>
              )}

              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => setEditingAnnouncement(null)}
                  className="px-4 py-2 text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updateAnnouncementMutation.isPending}
                  className="px-4 py-2 text-white bg-primary rounded-lg hover:bg-primary/90 disabled:opacity-50"
                >
                  {updateAnnouncementMutation.isPending ? 'Saving...' : 'Update'}
                </button>
              </div>
            </form>
          </div>
        </div>
        </ModalPortal>
      )}

      {/* Edit Display Modal */}
      {editingDisplay && (
        <DisplayEditModal
          display={editingDisplay}
          onClose={() => setEditingDisplay(null)}
        />
      )}

      {/* Edit Docket Entry Modal */}
      {editingDocketEntry && (
        <DocketForm
          entry={editingDocketEntry}
          onSubmit={(data) => {
            const dataWithVersion = {
              ...data,
              updatedAt: editingDocketEntry.updatedAt,
            };
            updateDocketMutation.mutate({ id: editingDocketEntry.id, data: dataWithVersion as UpdateDocketEntryInput });
          }}
          onClose={() => setEditingDocketEntry(null)}
          isLoading={updateDocketMutation.isPending}
        />
      )}
    </div>
  );
}
