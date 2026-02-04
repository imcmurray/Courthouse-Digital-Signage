import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { displaysApi, Display, CreateDisplayInput, UpdateDisplayInput } from '../api/displays';

export default function Displays() {
  const queryClient = useQueryClient();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingDisplay, setEditingDisplay] = useState<Display | null>(null);
  const [deleteConfirmDisplay, setDeleteConfirmDisplay] = useState<Display | null>(null);
  const [newApiKey, setNewApiKey] = useState<string | null>(null);

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
    theme: 'default',
    showWeather: true,
    weatherLocation: null,
    noticeText: 'Please turn your phones OFF in the Courthouse',
    tickerEnabled: true,
    tickerSpeed: 'medium',
  });

  // Fetch displays
  const { data, isLoading, error } = useQuery({
    queryKey: ['displays'],
    queryFn: () => displaysApi.getAll(),
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

  // Update display mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateDisplayInput }) => displaysApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['displays'] });
      toast.success('Display updated successfully');
      setEditingDisplay(null);
      resetForm();
    },
    onError: (error: { response?: { data?: { error?: string } } }) => {
      toast.error(error.response?.data?.error || 'Failed to update display');
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
      theme: 'default',
      showWeather: true,
      weatherLocation: null,
      noticeText: 'Please turn your phones OFF in the Courthouse',
      tickerEnabled: true,
      tickerSpeed: 'medium',
    });
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate(formData);
  };

  const handleUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingDisplay) {
      const { id, ...updateData } = formData;
      updateMutation.mutate({ id: editingDisplay.id, data: updateData });
    }
  };

  const handleDelete = () => {
    if (deleteConfirmDisplay) {
      deleteMutation.mutate(deleteConfirmDisplay.id);
    }
  };

  const openEditModal = (display: Display) => {
    setEditingDisplay(display);
    setFormData({
      id: display.id,
      name: display.name,
      location: display.location,
      judgeFilter: display.judgeFilter,
      courtroomFilter: display.courtroomFilter,
      showStricken: display.showStricken,
      showZoomInfo: display.showZoomInfo,
      highlightCurrent: display.highlightCurrent,
      theme: display.theme,
      showWeather: display.showWeather,
      weatherLocation: display.weatherLocation,
      noticeText: display.noticeText,
      tickerEnabled: display.tickerEnabled,
      tickerSpeed: display.tickerSpeed,
    });
  };

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case 'online':
        return 'bg-green-100 text-green-800';
      case 'offline':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
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
          <h1 className="text-2xl font-bold text-gray-900">Displays</h1>
          <p className="mt-1 text-sm text-gray-600">
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
      <div className="bg-white shadow-sm rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Display
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Location
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Last Heartbeat
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {displays.map((display) => (
              <tr key={display.id}>
                <td className="px-6 py-4">
                  <div className="text-sm font-medium text-gray-900">
                    {display.name}
                  </div>
                  <div className="text-xs text-gray-500 font-mono">
                    {display.id}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
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
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {display.lastHeartbeat
                    ? new Date(display.lastHeartbeat).toLocaleString()
                    : 'Never'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <button
                    onClick={() => openEditModal(display)}
                    className="text-primary hover:text-primary/80 mr-4"
                  >
                    Edit
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
          <div className="text-center py-12 text-gray-500">
            No displays found. Click "Add Display" to register one.
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      {(isFormOpen || editingDisplay) && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold text-gray-900">
              {editingDisplay ? 'Edit Display' : 'Register New Display'}
            </h3>
            <form onSubmit={editingDisplay ? handleUpdate : handleCreate} className="mt-4 space-y-4">
              {/* Basic Info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Display ID *
                  </label>
                  <input
                    type="text"
                    value={formData.id}
                    onChange={(e) => setFormData({ ...formData, id: e.target.value })}
                    required
                    disabled={!!editingDisplay}
                    placeholder="e.g., display-321-main"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary disabled:bg-gray-100"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Unique identifier (cannot be changed later)
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Display Name *
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                    placeholder="e.g., Courtroom 321 Main Display"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Location *
                </label>
                <input
                  type="text"
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  required
                  placeholder="e.g., Third Floor, Outside Courtroom 321"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                />
              </div>

              {/* Filters */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Courtroom Filter
                  </label>
                  <input
                    type="text"
                    value={formData.courtroomFilter || ''}
                    onChange={(e) => setFormData({ ...formData, courtroomFilter: e.target.value || null })}
                    placeholder="e.g., 321"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Only show entries for this courtroom
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Judge Filter
                  </label>
                  <input
                    type="text"
                    value={formData.judgeFilter || ''}
                    onChange={(e) => setFormData({ ...formData, judgeFilter: e.target.value || null })}
                    placeholder="e.g., Smith"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Only show entries for this judge
                  </p>
                </div>
              </div>

              {/* Display Options */}
              <div className="border-t pt-4 mt-4">
                <h4 className="text-sm font-medium text-gray-900 mb-3">Display Options</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="showWeather"
                      checked={formData.showWeather}
                      onChange={(e) => setFormData({ ...formData, showWeather: e.target.checked })}
                      className="h-4 w-4 text-primary focus:ring-primary border-gray-300 rounded"
                    />
                    <label htmlFor="showWeather" className="ml-2 text-sm text-gray-700">
                      Show Weather Widget
                    </label>
                  </div>
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="tickerEnabled"
                      checked={formData.tickerEnabled}
                      onChange={(e) => setFormData({ ...formData, tickerEnabled: e.target.checked })}
                      className="h-4 w-4 text-primary focus:ring-primary border-gray-300 rounded"
                    />
                    <label htmlFor="tickerEnabled" className="ml-2 text-sm text-gray-700">
                      Enable Announcement Ticker
                    </label>
                  </div>
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="showZoomInfo"
                      checked={formData.showZoomInfo}
                      onChange={(e) => setFormData({ ...formData, showZoomInfo: e.target.checked })}
                      className="h-4 w-4 text-primary focus:ring-primary border-gray-300 rounded"
                    />
                    <label htmlFor="showZoomInfo" className="ml-2 text-sm text-gray-700">
                      Show Zoom Info
                    </label>
                  </div>
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="highlightCurrent"
                      checked={formData.highlightCurrent}
                      onChange={(e) => setFormData({ ...formData, highlightCurrent: e.target.checked })}
                      className="h-4 w-4 text-primary focus:ring-primary border-gray-300 rounded"
                    />
                    <label htmlFor="highlightCurrent" className="ml-2 text-sm text-gray-700">
                      Highlight Current Hearing
                    </label>
                  </div>
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="showStricken"
                      checked={formData.showStricken}
                      onChange={(e) => setFormData({ ...formData, showStricken: e.target.checked })}
                      className="h-4 w-4 text-primary focus:ring-primary border-gray-300 rounded"
                    />
                    <label htmlFor="showStricken" className="ml-2 text-sm text-gray-700">
                      Show Stricken Entries
                    </label>
                  </div>
                </div>
              </div>

              {/* Ticker Speed */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Ticker Speed
                  </label>
                  <select
                    value={formData.tickerSpeed}
                    onChange={(e) => setFormData({ ...formData, tickerSpeed: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                  >
                    <option value="slow">Slow</option>
                    <option value="medium">Medium</option>
                    <option value="fast">Fast</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Weather Location
                  </label>
                  <input
                    type="text"
                    value={formData.weatherLocation || ''}
                    onChange={(e) => setFormData({ ...formData, weatherLocation: e.target.value || null })}
                    placeholder="e.g., Salt Lake City"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                  />
                </div>
              </div>

              {/* Notice Text */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Notice Banner Text
                </label>
                <input
                  type="text"
                  value={formData.noticeText}
                  onChange={(e) => setFormData({ ...formData, noticeText: e.target.value })}
                  placeholder="Please turn your phones OFF in the Courthouse"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                />
              </div>

              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setIsFormOpen(false);
                    setEditingDisplay(null);
                    resetForm();
                  }}
                  className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  className="px-4 py-2 text-white bg-primary rounded-lg hover:bg-primary/90 disabled:opacity-50"
                >
                  {createMutation.isPending || updateMutation.isPending
                    ? 'Saving...'
                    : editingDisplay
                    ? 'Update'
                    : 'Register Display'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* API Key Modal (shown after successful creation) */}
      {newApiKey && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-lg w-full mx-4">
            <div className="flex items-center mb-4">
              <div className="flex-shrink-0 h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
                <svg className="h-6 w-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div className="ml-4">
                <h3 className="text-lg font-semibold text-gray-900">Display Registered!</h3>
                <p className="text-sm text-gray-500">Save the API key below - it won't be shown again.</p>
              </div>
            </div>

            <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Display API Key
              </label>
              <div className="flex items-center">
                <code className="flex-1 text-sm bg-white p-2 rounded border font-mono break-all">
                  {newApiKey}
                </code>
                <button
                  onClick={() => copyToClipboard(newApiKey)}
                  className="ml-2 px-3 py-2 text-primary border border-primary rounded hover:bg-primary/10"
                >
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Use this key with the display client: <code className="bg-gray-100 px-1 rounded">?apiKey=YOUR_KEY</code>
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
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmDisplay && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900">Confirm Delete</h3>
            <p className="mt-2 text-gray-600">
              Are you sure you want to delete this display?
            </p>
            <div className="mt-2 p-3 bg-gray-50 rounded-lg">
              <p className="text-sm font-medium text-gray-900">{deleteConfirmDisplay.name}</p>
              <p className="text-xs text-gray-500 font-mono">{deleteConfirmDisplay.id}</p>
            </div>
            <p className="mt-2 text-sm text-red-600">
              This action cannot be undone. The display's API key will be invalidated.
            </p>
            <div className="mt-4 flex justify-end space-x-3">
              <button
                onClick={() => setDeleteConfirmDisplay(null)}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
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
      )}
    </div>
  );
}
