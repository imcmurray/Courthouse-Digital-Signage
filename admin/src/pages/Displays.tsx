import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { displaysApi, Display, CreateDisplayInput, PreviewTokenResponse, DaySchedule } from '../api/displays';
import { API_BASE_URL } from '../api/client';
import { docketApi } from '../api/docket';
import AutocompleteInput from '../components/AutocompleteInput';
import DisplayEditModal from '../components/DisplayEditModal';
import ModalPortal from '../components/ModalPortal';
import { useDisplayTypeOptions } from '../hooks/useDisplayTemplates';

export default function Displays() {
  const queryClient = useQueryClient();
  const { options: displayTypeOptions, templates } = useDisplayTypeOptions();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingDisplay, setEditingDisplay] = useState<Display | null>(null);
  const [deleteConfirmDisplay, setDeleteConfirmDisplay] = useState<Display | null>(null);
  const [regenerateConfirmDisplay, setRegenerateConfirmDisplay] = useState<Display | null>(null);
  const [newApiKey, setNewApiKey] = useState<string | null>(null);
  const [regeneratedApiKey, setRegeneratedApiKey] = useState<string | null>(null);
  const [previewDisplay, setPreviewDisplay] = useState<Display | null>(null);
  const [previewToken, setPreviewToken] = useState<PreviewTokenResponse | null>(null);

  const DEFAULT_DAY: DaySchedule = { start: '07:00', end: '18:00' };

  // Form state
  const [formData, setFormData] = useState<CreateDisplayInput>({
    id: '',
    name: '',
    location: '',
    judgeFilter: null,
    courtroomFilter: null,
    showStricken: false,
    showZoomInfo: true,
    highlightCurrent: true,
    orientation: 'landscape',
    theme: 'default',
    showWeather: true,
    weatherLocation: null,
    noticeText: 'Please turn your phones OFF in the Courthouse',
    tickerEnabled: true,
    tickerSpeed: 'medium',
    scheduleEnabled: false,
    scheduleConfig: {
      monday: { ...DEFAULT_DAY }, tuesday: { ...DEFAULT_DAY }, wednesday: { ...DEFAULT_DAY },
      thursday: { ...DEFAULT_DAY }, friday: { ...DEFAULT_DAY }, saturday: null, sunday: null
    },
    screensaverType: 'black',
    docketViewMode: 'all',
    displayType: 'courtroom',
  });

  // Fetch displays
  const { data, isLoading, error } = useQuery({
    queryKey: ['displays'],
    queryFn: () => displaysApi.getAll(),
  });

  // Fetch judge and courtroom names for autocomplete
  const { data: judges = [] } = useQuery({
    queryKey: ['docket-judges'],
    queryFn: docketApi.getJudges,
    staleTime: 5 * 60 * 1000,
  });

  const { data: courtrooms = [] } = useQuery({
    queryKey: ['docket-courtrooms'],
    queryFn: docketApi.getCourtrooms,
    staleTime: 5 * 60 * 1000,
  });

  // Create display mutation
  const createMutation = useMutation({
    mutationFn: displaysApi.create,
    onSuccess: (newDisplay) => {
      queryClient.invalidateQueries({ queryKey: ['displays'] });
      toast.success('Display registered successfully');
      setIsFormOpen(false);
      // Show the API key modal
      if (newDisplay.apiKey) {
        setNewApiKey(newDisplay.apiKey);
      }
      resetForm();
    },
    onError: (error: { response?: { data?: { error?: string } } }) => {
      toast.error(error.response?.data?.error || 'Failed to create display');
    },
  });

  // Delete display mutation
  const deleteMutation = useMutation({
    mutationFn: displaysApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['displays'] });
      toast.success('Display deleted successfully');
      setDeleteConfirmDisplay(null);
    },
    onError: (error: { response?: { data?: { error?: string } } }) => {
      toast.error(error.response?.data?.error || 'Failed to delete display');
    },
  });

  // Regenerate API key mutation
  const regenerateKeyMutation = useMutation({
    mutationFn: displaysApi.regenerateKey,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['displays'] });
      toast.success('API key regenerated successfully');
      setRegenerateConfirmDisplay(null);
      // Show the new API key modal
      setRegeneratedApiKey(data.apiKey);
    },
    onError: (error: { response?: { data?: { error?: string } } }) => {
      toast.error(error.response?.data?.error || 'Failed to regenerate API key');
    },
  });

  // Screensaver control mutation
  const screensaverMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'activate' | 'deactivate' }) =>
      displaysApi.screensaverControl(id, action),
    onSuccess: (_data, variables) => {
      toast.success(`Screensaver ${variables.action} signal sent`);
    },
    onError: () => {
      toast.error('Failed to control screensaver');
    },
  });

  // Preview token mutation
  const previewTokenMutation = useMutation({
    mutationFn: displaysApi.getPreviewToken,
    onSuccess: (data) => {
      setPreviewToken(data);
    },
    onError: (error: { response?: { data?: { error?: string } } }) => {
      toast.error(error.response?.data?.error || 'Failed to generate preview token');
      setPreviewDisplay(null);
    },
  });

  const handlePreview = (display: Display) => {
    setPreviewDisplay(display);
    setPreviewToken(null);
    previewTokenMutation.mutate(display.id);
  };

  const closePreview = () => {
    setPreviewDisplay(null);
    setPreviewToken(null);
  };

  const handleRegenerateKey = () => {
    if (regenerateConfirmDisplay) {
      regenerateKeyMutation.mutate(regenerateConfirmDisplay.id);
    }
  };

  const resetForm = () => {
    setFormData({
      id: '',
      name: '',
      location: '',
      judgeFilter: null,
      courtroomFilter: null,
      showStricken: false,
      showZoomInfo: true,
      highlightCurrent: true,
      orientation: 'landscape',
      theme: 'default',
      showWeather: true,
      weatherLocation: null,
      noticeText: 'Please turn your phones OFF in the Courthouse',
      tickerEnabled: true,
      tickerSpeed: 'medium',
      scheduleEnabled: false,
      scheduleConfig: {
        monday: { ...DEFAULT_DAY }, tuesday: { ...DEFAULT_DAY }, wednesday: { ...DEFAULT_DAY },
        thursday: { ...DEFAULT_DAY }, friday: { ...DEFAULT_DAY }, saturday: null, sunday: null
      },
      screensaverType: 'black',
      docketViewMode: 'all',
      displayType: 'courtroom',
    });
  };

  const builtInBadgeColors: Record<string, string> = {
    combined: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
    wayfinding: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
    'it-status': 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
    chambers: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
  };

  const getDisplayTypeBadge = (type: string) => {
    if (!type || type === 'courtroom') return null;
    const tmpl = templates.find(t => t.slug === type);
    const label = tmpl?.name || type;
    const color = builtInBadgeColors[type] || 'bg-gray-100 text-gray-700 dark:bg-teal-900/40 dark:text-teal-300';
    return (
      <span className={`ml-2 inline-flex px-1.5 py-0.5 text-[10px] font-medium rounded ${color}`}>
        {label}
      </span>
    );
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate(formData);
  };

  const handleDelete = () => {
    if (deleteConfirmDisplay) {
      deleteMutation.mutate(deleteConfirmDisplay.id);
    }
  };

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case 'online':
        return 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300';
      case 'offline':
        return 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Copied to clipboard!');
    } catch {
      // Fallback for browsers that don't support clipboard API
      const textArea = document.createElement('textarea');
      textArea.value = text;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      toast.success('Copied to clipboard!');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 text-red-600 p-4 rounded-lg">
        Failed to load displays. Please try again.
      </div>
    );
  }

  const displays = data?.displays || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Displays</h1>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
            Manage digital signage displays and their configurations.
          </p>
        </div>
        <button
          onClick={() => {
            resetForm();
            setIsFormOpen(true);
          }}
          className="flex items-center px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
        >
          <svg className="h-5 w-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
          Add Display
        </button>
      </div>

      {/* Displays Table */}
      <div className="bg-white dark:bg-gray-800 shadow-sm dark:shadow-gray-900/50 rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-700">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Display
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Location
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Last Heartbeat
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
            {displays.map((display) => (
              <tr key={display.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                <td className="px-6 py-4">
                  <button
                    onClick={() => setEditingDisplay(display)}
                    className="text-sm font-medium text-gray-900 dark:text-white text-left hover:text-primary dark:hover:text-primary-light transition-colors"
                  >
                    {display.name}
                  </button>
                  <div className="text-xs text-gray-500 dark:text-gray-400 font-mono">
                    {display.id}
                    {getDisplayTypeBadge(display.displayType)}
                    {display.orientation === 'portrait' && (
                      <span className="ml-2 inline-flex px-1.5 py-0.5 text-[10px] font-medium rounded bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">
                        Portrait
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                  {display.location}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span
                    className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusBadgeColor(
                      display.status
                    )}`}
                  >
                    {display.status.charAt(0).toUpperCase() + display.status.slice(1)}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                  {display.lastHeartbeat
                    ? new Date(display.lastHeartbeat).toLocaleString()
                    : 'Never'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  {display.status === 'online' && (
                    <>
                      <button
                        onClick={() => handlePreview(display)}
                        className="text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 mr-3"
                      >
                        Preview
                      </button>
                      <button
                        onClick={() => screensaverMutation.mutate({ id: display.id, action: 'activate' })}
                        disabled={screensaverMutation.isPending}
                        className="text-purple-600 hover:text-purple-800 dark:text-purple-400 dark:hover:text-purple-300 mr-3"
                      >
                        Sleep
                      </button>
                      <button
                        onClick={() => screensaverMutation.mutate({ id: display.id, action: 'deactivate' })}
                        disabled={screensaverMutation.isPending}
                        className="text-teal-600 hover:text-teal-800 dark:text-teal-400 dark:hover:text-teal-300 mr-3"
                      >
                        Wake
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => setEditingDisplay(display)}
                    className="text-primary dark:text-primary-light hover:text-primary/80 dark:hover:text-primary-light/80 mr-3"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => setRegenerateConfirmDisplay(display)}
                    className="text-amber-600 hover:text-amber-800 mr-3"
                  >
                    Regenerate Key
                  </button>
                  <button
                    onClick={() => setDeleteConfirmDisplay(display)}
                    className="text-red-600 hover:text-red-800"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {displays.length === 0 && (
          <div className="text-center py-12 text-gray-500 dark:text-gray-400">
            No displays found. Click "Add Display" to register one.
          </div>
        )}
      </div>

      {/* Create Modal */}
      {isFormOpen && (
        <ModalPortal>
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Register New Display</h3>
            <form onSubmit={handleCreate} className="mt-4 space-y-4">
              {/* Basic Info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                    Display ID *
                  </label>
                  <input
                    type="text"
                    value={formData.id}
                    onChange={(e) => setFormData({ ...formData, id: e.target.value })}
                    required
                    placeholder="e.g., display-321-main"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary dark:bg-gray-700 dark:text-white"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Unique identifier (cannot be changed later)
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                    Display Name *
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                    placeholder="e.g., Courtroom 321 Main Display"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary dark:bg-gray-700 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                  Location *
                </label>
                <input
                  type="text"
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  required
                  placeholder="e.g., Third Floor, Outside Courtroom 321"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary dark:bg-gray-700 dark:text-white"
                />
              </div>

              {/* Display Type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                  Display Type
                </label>
                <select
                  value={formData.displayType || 'courtroom'}
                  onChange={(e) => setFormData({ ...formData, displayType: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary dark:bg-gray-700 dark:text-white"
                >
                  {displayTypeOptions.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              {/* Filters */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                    Courtroom Filter
                  </label>
                  <AutocompleteInput
                    suggestions={courtrooms}
                    value={formData.courtroomFilter || ''}
                    onChange={(val) => setFormData({ ...formData, courtroomFilter: val || null })}
                    placeholder="e.g., 321"
                    inputClassName="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary dark:bg-gray-700 dark:text-white"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Only show entries for this courtroom
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                    Judge Filter
                  </label>
                  <AutocompleteInput
                    suggestions={judges}
                    value={formData.judgeFilter || ''}
                    onChange={(val) => setFormData({ ...formData, judgeFilter: val || null })}
                    placeholder="e.g., Smith"
                    inputClassName="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary dark:bg-gray-700 dark:text-white"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Only show entries for this judge
                  </p>
                </div>
              </div>

              {/* Display Options */}
              <div className="border-t dark:border-gray-700 pt-4 mt-4">
                <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-3">Display Options</h4>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                      Orientation
                    </label>
                    <select
                      value={formData.orientation}
                      onChange={(e) => setFormData({ ...formData, orientation: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary dark:bg-gray-700 dark:text-white"
                    >
                      <option value="landscape">Landscape (1920x1080)</option>
                      <option value="portrait">Portrait (1080x1920)</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="showWeather"
                      checked={formData.showWeather}
                      onChange={(e) => setFormData({ ...formData, showWeather: e.target.checked })}
                      className="h-4 w-4 text-primary focus:ring-primary border-gray-300 dark:border-gray-600 rounded"
                    />
                    <label htmlFor="showWeather" className="ml-2 text-sm text-gray-700 dark:text-gray-200">
                      Show Weather Widget
                    </label>
                  </div>
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="tickerEnabled"
                      checked={formData.tickerEnabled}
                      onChange={(e) => setFormData({ ...formData, tickerEnabled: e.target.checked })}
                      className="h-4 w-4 text-primary focus:ring-primary border-gray-300 dark:border-gray-600 rounded"
                    />
                    <label htmlFor="tickerEnabled" className="ml-2 text-sm text-gray-700 dark:text-gray-200">
                      Enable Announcement Ticker
                    </label>
                  </div>
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="showZoomInfo"
                      checked={formData.showZoomInfo}
                      onChange={(e) => setFormData({ ...formData, showZoomInfo: e.target.checked })}
                      className="h-4 w-4 text-primary focus:ring-primary border-gray-300 dark:border-gray-600 rounded"
                    />
                    <label htmlFor="showZoomInfo" className="ml-2 text-sm text-gray-700 dark:text-gray-200">
                      Show Zoom Info
                    </label>
                  </div>
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="highlightCurrent"
                      checked={formData.highlightCurrent}
                      onChange={(e) => setFormData({ ...formData, highlightCurrent: e.target.checked })}
                      className="h-4 w-4 text-primary focus:ring-primary border-gray-300 dark:border-gray-600 rounded"
                    />
                    <label htmlFor="highlightCurrent" className="ml-2 text-sm text-gray-700 dark:text-gray-200">
                      Highlight Current Hearing
                    </label>
                  </div>
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="showContentCards"
                      checked={formData.showContentCards || false}
                      onChange={(e) => setFormData({ ...formData, showContentCards: e.target.checked })}
                      className="h-4 w-4 text-primary focus:ring-primary border-gray-300 dark:border-gray-600 rounded"
                    />
                    <label htmlFor="showContentCards" className="ml-2 text-sm text-gray-700 dark:text-gray-200">
                      Show Content Cards
                    </label>
                  </div>
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="showStricken"
                      checked={formData.showStricken}
                      onChange={(e) => setFormData({ ...formData, showStricken: e.target.checked })}
                      className="h-4 w-4 text-primary focus:ring-primary border-gray-300 dark:border-gray-600 rounded"
                    />
                    <label htmlFor="showStricken" className="ml-2 text-sm text-gray-700 dark:text-gray-200">
                      Show Stricken Entries
                    </label>
                  </div>
                </div>
              </div>

              {/* Ticker Speed */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                    Ticker Speed
                  </label>
                  <select
                    value={formData.tickerSpeed}
                    onChange={(e) => setFormData({ ...formData, tickerSpeed: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary dark:bg-gray-700 dark:text-white"
                  >
                    <option value="slow">Slow</option>
                    <option value="medium">Medium</option>
                    <option value="fast">Fast</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                    Weather Location
                  </label>
                  <input
                    type="text"
                    value={formData.weatherLocation || ''}
                    onChange={(e) => setFormData({ ...formData, weatherLocation: e.target.value || null })}
                    placeholder="e.g., Salt Lake City"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary dark:bg-gray-700 dark:text-white"
                  />
                </div>
              </div>

              {/* Notice Text */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                  Notice Banner Text
                </label>
                <input
                  type="text"
                  value={formData.noticeText}
                  onChange={(e) => setFormData({ ...formData, noticeText: e.target.value })}
                  placeholder="Please turn your phones OFF in the Courthouse"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary dark:bg-gray-700 dark:text-white"
                />
              </div>

              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setIsFormOpen(false);
                    resetForm();
                  }}
                  className="px-4 py-2 text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="px-4 py-2 text-white bg-primary rounded-lg hover:bg-primary/90 disabled:opacity-50"
                >
                  {createMutation.isPending ? 'Saving...' : 'Register Display'}
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
          onClose={() => {
            setEditingDisplay(null);
            resetForm();
          }}
        />
      )}

      {/* API Key Modal (shown after successful creation) */}
      {newApiKey && (
        <ModalPortal>
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-lg w-full mx-4">
            <div className="flex items-center mb-4">
              <div className="flex-shrink-0 h-12 w-12 rounded-full bg-green-100 dark:bg-green-900/40 flex items-center justify-center">
                <svg className="h-6 w-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div className="ml-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Display Registered!</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">Save the API key below - it won't be shown again.</p>
              </div>
            </div>

            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 border border-gray-200 dark:border-gray-600">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
                Display API Key
              </label>
              <div className="flex items-center">
                <code className="flex-1 text-sm bg-white dark:bg-gray-800 dark:text-gray-200 p-2 rounded border dark:border-gray-600 font-mono break-all">
                  {newApiKey}
                </code>
                <button
                  onClick={() => copyToClipboard(newApiKey)}
                  className="ml-2 px-3 py-2 text-primary dark:text-primary-light border border-primary dark:border-primary-light rounded hover:bg-primary/10"
                >
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </button>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                Use this key with the display client: <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">?apiKey=YOUR_KEY</code>
              </p>
            </div>

            <div className="mt-4 flex justify-end">
              <button
                onClick={() => setNewApiKey(null)}
                className="px-4 py-2 text-white bg-primary rounded-lg hover:bg-primary/90"
              >
                Done
              </button>
            </div>
          </div>
        </div>
        </ModalPortal>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmDisplay && (
        <ModalPortal>
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Confirm Delete</h3>
            <p className="mt-2 text-gray-600 dark:text-gray-300">
              Are you sure you want to delete this display?
            </p>
            <div className="mt-2 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <p className="text-sm font-medium text-gray-900 dark:text-white">{deleteConfirmDisplay.name}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 font-mono">{deleteConfirmDisplay.id}</p>
            </div>
            <p className="mt-2 text-sm text-red-600">
              This action cannot be undone. The display's API key will be invalidated.
            </p>
            <div className="mt-4 flex justify-end space-x-3">
              <button
                onClick={() => setDeleteConfirmDisplay(null)}
                className="px-4 py-2 text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleteMutation.isPending}
                className="px-4 py-2 text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
        </ModalPortal>
      )}

      {/* Regenerate API Key Confirmation Modal */}
      {regenerateConfirmDisplay && (
        <ModalPortal>
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex items-center mb-4">
              <div className="flex-shrink-0 h-12 w-12 rounded-full bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center">
                <svg className="h-6 w-6 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div className="ml-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Regenerate API Key</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">This will invalidate the current key</p>
              </div>
            </div>
            <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <p className="text-sm font-medium text-gray-900 dark:text-white">{regenerateConfirmDisplay.name}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 font-mono">{regenerateConfirmDisplay.id}</p>
            </div>
            <div className="mt-3 p-3 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-lg">
              <p className="text-sm text-amber-800 dark:text-amber-300">
                <strong>Warning:</strong> The current API key will be immediately invalidated.
                The display client will stop working until you update it with the new key.
              </p>
            </div>
            <div className="mt-4 flex justify-end space-x-3">
              <button
                onClick={() => setRegenerateConfirmDisplay(null)}
                className="px-4 py-2 text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600"
              >
                Cancel
              </button>
              <button
                onClick={handleRegenerateKey}
                disabled={regenerateKeyMutation.isPending}
                className="px-4 py-2 text-white bg-amber-600 rounded-lg hover:bg-amber-700 disabled:opacity-50"
              >
                {regenerateKeyMutation.isPending ? 'Regenerating...' : 'Regenerate Key'}
              </button>
            </div>
          </div>
        </div>
        </ModalPortal>
      )}

      {/* Regenerated API Key Modal (shown after successful regeneration) */}
      {regeneratedApiKey && (
        <ModalPortal>
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-lg w-full mx-4">
            <div className="flex items-center mb-4">
              <div className="flex-shrink-0 h-12 w-12 rounded-full bg-green-100 dark:bg-green-900/40 flex items-center justify-center">
                <svg className="h-6 w-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div className="ml-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">API Key Regenerated!</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">Save the new key below - it won't be shown again.</p>
              </div>
            </div>

            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 border border-gray-200 dark:border-gray-600">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
                New Display API Key
              </label>
              <div className="flex items-center">
                <code className="flex-1 text-sm bg-white dark:bg-gray-800 dark:text-gray-200 p-2 rounded border dark:border-gray-600 font-mono break-all">
                  {regeneratedApiKey}
                </code>
                <button
                  onClick={() => copyToClipboard(regeneratedApiKey)}
                  className="ml-2 px-3 py-2 text-primary dark:text-primary-light border border-primary dark:border-primary-light rounded hover:bg-primary/10"
                >
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </button>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                Update the display client with this new key: <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">?apiKey=YOUR_NEW_KEY</code>
              </p>
            </div>

            <div className="mt-4 flex justify-end">
              <button
                onClick={() => setRegeneratedApiKey(null)}
                className="px-4 py-2 text-white bg-primary rounded-lg hover:bg-primary/90"
              >
                Done
              </button>
            </div>
          </div>
        </div>
        </ModalPortal>
      )}

      {/* Display Preview Modal */}
      {previewDisplay && (() => {
        const isPortrait = previewDisplay.orientation === 'portrait';
        const containerW = isPortrait ? 360 : 960;
        const containerH = isPortrait ? 640 : 540;
        const iframeW = isPortrait ? 1080 : 1920;
        const iframeH = isPortrait ? 1920 : 1080;
        const scale = isPortrait ? 1/3 : 0.5;
        return (
        <ModalPortal>
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
          <div className={`bg-gray-900 rounded-lg ${isPortrait ? 'max-w-[460px]' : 'max-w-[1060px]'} w-full mx-4 flex flex-col max-h-[90vh]`}>
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
              <div>
                <h3 className="text-lg font-semibold text-white">{previewDisplay.name}</h3>
                <p className="text-sm text-gray-400">{previewDisplay.location} {isPortrait && '(Portrait)'}</p>
              </div>
              <div className="flex items-center space-x-3">
                {previewToken && (
                  <a
                    href={`${API_BASE_URL}/display/index.html?displayId=${previewDisplay.id}&apiKey=${previewToken.previewToken}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-indigo-400 hover:text-indigo-300 transition-colors"
                  >
                    Open Full Size
                  </a>
                )}
                <button
                  onClick={closePreview}
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Iframe Container */}
            <div className="flex-1 flex items-center justify-center p-4 overflow-hidden">
              {previewTokenMutation.isPending ? (
                <div className="flex flex-col items-center space-y-3">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-400"></div>
                  <p className="text-sm text-gray-400">Generating preview token...</p>
                </div>
              ) : previewToken ? (
                <div
                  className="bg-black rounded overflow-hidden"
                  style={{ width: containerW, height: containerH }}
                >
                  <iframe
                    src={`${API_BASE_URL}/display/index.html?displayId=${previewDisplay.id}&apiKey=${previewToken.previewToken}`}
                    title={`Preview: ${previewDisplay.name}`}
                    style={{
                      width: iframeW,
                      height: iframeH,
                      transform: `scale(${scale})`,
                      transformOrigin: 'top left',
                      border: 'none',
                    }}
                  />
                </div>
              ) : null}
            </div>

            {/* Footer */}
            <div className="px-6 py-3 border-t border-gray-700 flex items-center justify-between">
              <p className="text-xs text-gray-500">Preview token expires in 5 minutes</p>
              <button
                onClick={closePreview}
                className="px-4 py-2 text-sm text-gray-300 bg-gray-700 rounded-lg hover:bg-gray-600 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
        </ModalPortal>
        );
      })()}
    </div>
  );
}
