import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import ModalPortal from '../components/ModalPortal';
import { apiKeysApi, ApiKey, CreateApiKeyInput, UpdateApiKeyInput } from '../api/apiKeys';
import { displaysApi, Display } from '../api/displays';

export default function ApiKeys() {
  const queryClient = useQueryClient();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingKey, setEditingKey] = useState<ApiKey | null>(null);
  const [revokeConfirmKey, setRevokeConfirmKey] = useState<ApiKey | null>(null);
  const [newApiKey, setNewApiKey] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState<CreateApiKeyInput>({
    name: '',
    permissions: ['read'],
    displayId: null,
    expiresAt: null,
  });

  // Fetch API keys
  const { data, isLoading, error } = useQuery({
    queryKey: ['api-keys'],
    queryFn: () => apiKeysApi.getAll(),
  });

  // Fetch displays for linking
  const { data: displaysData } = useQuery({
    queryKey: ['displays'],
    queryFn: () => displaysApi.getAll(),
  });

  // Create API key mutation
  const createMutation = useMutation({
    mutationFn: apiKeysApi.create,
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
      toast.success('API key created successfully');
      setIsFormOpen(false);
      // Show the API key modal
      if (response.apiKey) {
        setNewApiKey(response.apiKey);
      }
      resetForm();
    },
    onError: (error: { response?: { data?: { error?: string } } }) => {
      toast.error(error.response?.data?.error || 'Failed to create API key');
    },
  });

  // Update API key mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateApiKeyInput }) =>
      apiKeysApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
      toast.success('API key updated successfully');
      setIsFormOpen(false);
      setEditingKey(null);
      resetForm();
    },
    onError: (error: { response?: { data?: { error?: string } } }) => {
      toast.error(error.response?.data?.error || 'Failed to update API key');
    },
  });

  // Revoke API key mutation
  const revokeMutation = useMutation({
    mutationFn: apiKeysApi.revoke,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
      toast.success('API key revoked successfully');
      setRevokeConfirmKey(null);
    },
    onError: (error: { response?: { data?: { error?: string } } }) => {
      toast.error(error.response?.data?.error || 'Failed to revoke API key');
    },
  });

  const resetForm = () => {
    setFormData({
      name: '',
      permissions: ['read'],
      displayId: null,
      expiresAt: null,
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingKey) {
      updateMutation.mutate({ id: editingKey.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleEdit = (key: ApiKey) => {
    setEditingKey(key);
    setFormData({
      name: key.name,
      permissions: key.permissions,
      displayId: key.displayId,
      expiresAt: key.expiresAt ? new Date(key.expiresAt).toISOString().slice(0, 16) : null,
    });
    setIsFormOpen(true);
  };

  const handleRevoke = () => {
    if (revokeConfirmKey) {
      revokeMutation.mutate(revokeConfirmKey.id);
    }
  };

  const togglePermission = (perm: string) => {
    if (formData.permissions.includes(perm)) {
      setFormData({
        ...formData,
        permissions: formData.permissions.filter((p) => p !== perm),
      });
    } else {
      setFormData({
        ...formData,
        permissions: [...formData.permissions, perm],
      });
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

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleString();
  };

  const isExpired = (expiresAt: string | null) => {
    if (!expiresAt) return false;
    return new Date(expiresAt) < new Date();
  };

  const getPermissionBadgeColor = (permission: string) => {
    switch (permission) {
      case 'admin':
        return 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300';
      case 'write':
        return 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300';
      case 'read':
      default:
        return 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300';
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
      <div className="bg-red-50 dark:bg-red-900/30 text-red-600 p-4 rounded-lg">
        Failed to load API keys. Please try again.
      </div>
    );
  }

  const apiKeys = data?.apiKeys || [];
  const displays = displaysData?.displays || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">API Keys</h1>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
            Manage API keys for programmatic access to the system.
          </p>
        </div>
        <button
          onClick={() => {
            resetForm();
            setEditingKey(null);
            setIsFormOpen(true);
          }}
          className="flex items-center px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
        >
          <svg className="h-5 w-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
          Create API Key
        </button>
      </div>

      {/* API Keys Table */}
      <div className="bg-white dark:bg-gray-800 shadow-sm dark:shadow-gray-900/50 rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-700">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Name / Key Prefix
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Permissions
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Linked Display
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Last Used
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Expires
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
            {apiKeys.map((key) => (
              <tr key={key.id} className={isExpired(key.expiresAt) ? 'bg-red-50 dark:bg-red-900/30' : ''}>
                <td className="px-6 py-4">
                  <div className="text-sm font-medium text-gray-900 dark:text-white">
                    {key.name}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 font-mono">
                    {key.keyPrefix}...
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex flex-wrap gap-1">
                    {key.permissions.map((perm) => (
                      <span
                        key={perm}
                        className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full ${getPermissionBadgeColor(perm)}`}
                      >
                        {perm}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                  {key.display ? (
                    <div>
                      <div className="font-medium text-gray-900 dark:text-white">{key.display.name}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">{key.display.id}</div>
                    </div>
                  ) : (
                    <span className="text-gray-400">None</span>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                  {formatDate(key.lastUsedAt)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  {key.expiresAt ? (
                    <span className={isExpired(key.expiresAt) ? 'text-red-600 font-medium' : 'text-gray-500 dark:text-gray-400'}>
                      {isExpired(key.expiresAt) ? 'Expired: ' : ''}
                      {formatDate(key.expiresAt)}
                    </span>
                  ) : (
                    <span className="text-gray-400">Never</span>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-3">
                  <button
                    onClick={() => handleEdit(key)}
                    className="text-primary hover:text-primary/80"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => setRevokeConfirmKey(key)}
                    className="text-red-600 hover:text-red-800"
                  >
                    Revoke
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {apiKeys.length === 0 && (
          <div className="text-center py-12 text-gray-500 dark:text-gray-400">
            No API keys found. Click "Create API Key" to create one.
          </div>
        )}
      </div>

      {/* Create API Key Modal */}
      {isFormOpen && (
        <ModalPortal>
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-lg w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              {editingKey ? 'Edit API Key' : 'Create API Key'}
            </h3>
            {!editingKey && (
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                The API key will only be shown once after creation. Make sure to copy it.
              </p>
            )}
            <form onSubmit={handleSubmit} className="mt-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                  Name *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                  placeholder="e.g., Display Client Key, Integration API"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  A descriptive name to identify this key
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
                  Permissions *
                </label>
                <div className="space-y-2">
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="perm-read"
                      checked={formData.permissions.includes('read')}
                      onChange={() => togglePermission('read')}
                      className="h-4 w-4 text-primary focus:ring-primary border-gray-300 dark:border-gray-600 rounded"
                    />
                    <label htmlFor="perm-read" className="ml-2 text-sm text-gray-700 dark:text-gray-200">
                      <span className="font-medium">Read</span> - Access to view docket, announcements, displays
                    </label>
                  </div>
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="perm-write"
                      checked={formData.permissions.includes('write')}
                      onChange={() => togglePermission('write')}
                      className="h-4 w-4 text-primary focus:ring-primary border-gray-300 dark:border-gray-600 rounded"
                    />
                    <label htmlFor="perm-write" className="ml-2 text-sm text-gray-700 dark:text-gray-200">
                      <span className="font-medium">Write</span> - Create and update docket entries, announcements
                    </label>
                  </div>
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="perm-admin"
                      checked={formData.permissions.includes('admin')}
                      onChange={() => togglePermission('admin')}
                      className="h-4 w-4 text-primary focus:ring-primary border-gray-300 dark:border-gray-600 rounded"
                    />
                    <label htmlFor="perm-admin" className="ml-2 text-sm text-gray-700 dark:text-gray-200">
                      <span className="font-medium">Admin</span> - Full access including user management
                    </label>
                  </div>
                </div>
                {formData.permissions.length === 0 && (
                  <p className="text-xs text-red-600 mt-1">At least one permission is required</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                  Link to Display (Optional)
                </label>
                <select
                  value={formData.displayId || ''}
                  onChange={(e) => setFormData({ ...formData, displayId: e.target.value || null })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value="">No display - General purpose key</option>
                  {displays.map((display: Display) => (
                    <option key={display.id} value={display.id}>
                      {display.name} ({display.id})
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Link this key to a specific display for tracking purposes
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                  Expiration (Optional)
                </label>
                <input
                  type="datetime-local"
                  value={formData.expiresAt || ''}
                  onChange={(e) => setFormData({ ...formData, expiresAt: e.target.value || null })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Leave empty for a key that never expires
                </p>
              </div>

              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setIsFormOpen(false);
                    setEditingKey(null);
                    resetForm();
                  }}
                  className="px-4 py-2 text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={(editingKey ? updateMutation.isPending : createMutation.isPending) || formData.permissions.length === 0}
                  className="px-4 py-2 text-white bg-primary rounded-lg hover:bg-primary/90 disabled:opacity-50"
                >
                  {editingKey
                    ? (updateMutation.isPending ? 'Saving...' : 'Save Changes')
                    : (createMutation.isPending ? 'Creating...' : 'Create API Key')}
                </button>
              </div>
            </form>
          </div>
        </div>
        </ModalPortal>
      )}

      {/* API Key Created Modal (shown after successful creation) */}
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
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">API Key Created!</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">Save the key below - it won't be shown again.</p>
              </div>
            </div>

            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 border border-gray-200 dark:border-gray-600">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
                API Key
              </label>
              <div className="flex items-center">
                <code className="flex-1 text-sm bg-white dark:bg-gray-800 p-2 rounded border dark:border-gray-600 font-mono break-all text-gray-900 dark:text-white">
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
                Use this key in the <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">X-API-Key</code> header for API requests.
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

      {/* Revoke Confirmation Modal */}
      {revokeConfirmKey && (
        <ModalPortal>
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex items-center mb-4">
              <div className="flex-shrink-0 h-12 w-12 rounded-full bg-red-100 dark:bg-red-900/40 flex items-center justify-center">
                <svg className="h-6 w-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div className="ml-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Revoke API Key</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">This action cannot be undone</p>
              </div>
            </div>
            <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <p className="text-sm font-medium text-gray-900 dark:text-white">{revokeConfirmKey.name}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 font-mono">{revokeConfirmKey.keyPrefix}...</p>
            </div>
            <div className="mt-3 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg">
              <p className="text-sm text-red-800 dark:text-red-300">
                <strong>Warning:</strong> Any applications or integrations using this API key
                will immediately lose access.
              </p>
            </div>
            <div className="mt-4 flex justify-end space-x-3">
              <button
                onClick={() => setRevokeConfirmKey(null)}
                className="px-4 py-2 text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600"
              >
                Cancel
              </button>
              <button
                onClick={handleRevoke}
                disabled={revokeMutation.isPending}
                className="px-4 py-2 text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {revokeMutation.isPending ? 'Revoking...' : 'Revoke Key'}
              </button>
            </div>
          </div>
        </div>
        </ModalPortal>
      )}
    </div>
  );
}
