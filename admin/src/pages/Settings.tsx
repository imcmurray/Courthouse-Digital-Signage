import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import Breadcrumb from '../components/Breadcrumb';
import apiClient, { getStoredToken } from '../api/client';

interface SettingsData {
  court_name: string;
  court_subtitle: string;
  courthouse_name: string;
  chief_judge: string;
  clerk_of_court: string;
  timezone: string;
  default_theme: string;
  court_logo?: string;
}

interface SettingsResponse {
  settings: SettingsData;
  metadata: Record<string, { updatedAt: string; updatedBy: { name: string } | null }>;
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

// Timezone options for the dropdown
const timezoneOptions = [
  { value: 'America/Denver', label: 'Mountain Time (America/Denver)' },
  { value: 'America/Chicago', label: 'Central Time (America/Chicago)' },
  { value: 'America/New_York', label: 'Eastern Time (America/New_York)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (America/Los_Angeles)' },
  { value: 'America/Phoenix', label: 'Arizona Time (America/Phoenix)' },
  { value: 'UTC', label: 'UTC' },
];

// Theme options
const themeOptions = [
  { value: 'default', label: 'Default (Navy & Gold)' },
  { value: 'dark', label: 'Dark Theme' },
  { value: 'light', label: 'Light Theme' },
];

export default function Settings() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [formData, setFormData] = useState<SettingsData>({
    court_name: '',
    court_subtitle: '',
    courthouse_name: '',
    chief_judge: '',
    clerk_of_court: '',
    timezone: 'America/Denver',
    default_theme: 'default',
  });
  const [hasChanges, setHasChanges] = useState(false);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Data Management state
  const importFileInputRef = useRef<HTMLInputElement>(null);
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(
    new Set(['settings', 'displays', 'docket', 'announcements', 'users', 'auditLogs'])
  );
  const [isExporting, setIsExporting] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showImportConfirm, setShowImportConfirm] = useState(false);
  const [importData, setImportData] = useState<Record<string, unknown> | null>(null);

  // Fetch settings
  const { data, isLoading, error } = useQuery<SettingsResponse>({
    queryKey: ['settings'],
    queryFn: async () => {
      const token = getStoredToken();
      const response = await fetch(`${API_URL}/api/settings`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!response.ok) {
        throw new Error('Failed to fetch settings');
      }
      return response.json();
    },
  });

  // Update form data when settings are loaded
  useEffect(() => {
    if (data?.settings) {
      setFormData({
        court_name: data.settings.court_name || '',
        court_subtitle: data.settings.court_subtitle || '',
        courthouse_name: data.settings.courthouse_name || '',
        chief_judge: data.settings.chief_judge || '',
        clerk_of_court: data.settings.clerk_of_court || '',
        timezone: data.settings.timezone || 'America/Denver',
        default_theme: data.settings.default_theme || 'default',
        court_logo: data.settings.court_logo,
      });
      if (data.settings.court_logo) {
        setLogoPreview(`${API_URL}${data.settings.court_logo}`);
      } else {
        setLogoPreview(null);
      }
      setHasChanges(false);
    }
  }, [data]);

  // Save settings mutation
  const saveMutation = useMutation({
    mutationFn: async (settings: Omit<SettingsData, 'court_logo'>) => {
      const token = getStoredToken();
      const response = await fetch(`${API_URL}/api/settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ settings }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save settings');
      }
      return response.json();
    },
    onSuccess: () => {
      toast.success('Settings saved successfully');
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      setHasChanges(false);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to save settings');
    },
  });

  // Logo upload mutation
  const uploadLogoMutation = useMutation({
    mutationFn: async (file: File) => {
      const token = getStoredToken();
      const formData = new FormData();
      formData.append('logo', file);

      const response = await fetch(`${API_URL}/api/settings/logo`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to upload logo');
      }
      return response.json();
    },
    onSuccess: (data) => {
      toast.success('Logo uploaded successfully');
      setLogoPreview(`${API_URL}${data.logo}`);
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to upload logo');
    },
  });

  // Remove logo mutation
  const removeLogoMutation = useMutation({
    mutationFn: async () => {
      const token = getStoredToken();
      const response = await fetch(`${API_URL}/api/settings/logo`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to remove logo');
      }
      return response.json();
    },
    onSuccess: () => {
      toast.success('Logo removed successfully');
      setLogoPreview(null);
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to remove logo');
    },
  });

  const handleInputChange = (field: keyof SettingsData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setHasChanges(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const { court_logo, ...settingsToSave } = formData;
    saveMutation.mutate(settingsToSave);
  };

  const handleReset = () => {
    if (data?.settings) {
      setFormData({
        court_name: data.settings.court_name || '',
        court_subtitle: data.settings.court_subtitle || '',
        courthouse_name: data.settings.courthouse_name || '',
        chief_judge: data.settings.chief_judge || '',
        clerk_of_court: data.settings.clerk_of_court || '',
        timezone: data.settings.timezone || 'America/Denver',
        default_theme: data.settings.default_theme || 'default',
        court_logo: data.settings.court_logo,
      });
      setHasChanges(false);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = ['image/png', 'image/svg+xml'];
    if (!allowedTypes.includes(file.type)) {
      toast.error('Only PNG and SVG files are allowed');
      return;
    }

    // Validate file size (5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('File size must be less than 5MB');
      return;
    }

    // Show preview immediately
    const reader = new FileReader();
    reader.onload = (e) => {
      setLogoPreview(e.target?.result as string);
    };
    reader.readAsDataURL(file);

    // Upload
    setIsUploading(true);
    try {
      await uploadLogoMutation.mutateAsync(file);
    } finally {
      setIsUploading(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRemoveLogo = async () => {
    if (confirm('Are you sure you want to remove the court logo?')) {
      await removeLogoMutation.mutateAsync();
    }
  };

  // Data Management category definitions
  const categoryOptions = [
    { key: 'settings', label: 'Settings' },
    { key: 'displays', label: 'Displays' },
    { key: 'docket', label: 'Docket Entries' },
    { key: 'announcements', label: 'Announcements' },
    { key: 'users', label: 'Users' },
    { key: 'auditLogs', label: 'Audit Logs' },
  ];

  const toggleCategory = (key: string) => {
    setSelectedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const handleExport = async () => {
    if (selectedCategories.size === 0) {
      toast.error('Select at least one category to export');
      return;
    }
    setIsExporting(true);
    try {
      const include = Array.from(selectedCategories).join(',');
      const response = await apiClient.get(`/api/export`, {
        params: { include },
        responseType: 'blob',
      });
      const blob = new Blob([response.data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const dateStr = new Date().toISOString().split('T')[0];
      a.download = `courthouse-export-${dateStr}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('Data exported successfully');
    } catch {
      toast.error('Export failed');
    } finally {
      setIsExporting(false);
    }
  };

  const handleClear = async () => {
    setIsClearing(true);
    try {
      const response = await apiClient.delete('/api/clear', {
        data: { categories: Array.from(selectedCategories) },
      });
      const total = Object.values(response.data.cleared as Record<string, number>).reduce((a: number, b: number) => a + b, 0);
      toast.success(`Cleared ${total} records`);
      queryClient.invalidateQueries();
    } catch {
      toast.error('Clear failed');
    } finally {
      setIsClearing(false);
      setShowClearConfirm(false);
    }
  };

  const handleImportFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target?.result as string);
        if (!parsed.version || !parsed.categories) {
          toast.error('Invalid export file format');
          return;
        }
        setImportData(parsed);
        setShowImportConfirm(true);
      } catch {
        toast.error('Failed to parse JSON file');
      }
    };
    reader.readAsText(file);
    // Reset so the same file can be selected again
    if (importFileInputRef.current) importFileInputRef.current.value = '';
  };

  const handleImport = async () => {
    if (!importData) return;
    setIsImporting(true);
    try {
      const response = await apiClient.post('/api/import', importData);
      const total = Object.values(response.data.imported as Record<string, number>).reduce((a: number, b: number) => a + b, 0);
      toast.success(`Imported ${total} records`);
      queryClient.invalidateQueries();
    } catch (err: unknown) {
      const message = (err && typeof err === 'object' && 'response' in err)
        ? (err as { response?: { data?: { error?: string } } }).response?.data?.error || 'Import failed'
        : 'Import failed';
      toast.error(message);
    } finally {
      setIsImporting(false);
      setShowImportConfirm(false);
      setImportData(null);
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
      <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg p-4">
        <p className="text-red-600">Failed to load settings. Please try again.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Breadcrumb />

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow dark:shadow-gray-900/50">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">System Settings</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Configure global settings for the courthouse digital signage system.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Court Information Section */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2">Court Information</h3>

            <div>
              <label htmlFor="court_name" className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                Court Name
              </label>
              <input
                type="text"
                id="court_name"
                value={formData.court_name}
                onChange={(e) => handleInputChange('court_name', e.target.value)}
                className="mt-1 w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary dark:bg-gray-700 dark:text-white"
                placeholder="e.g., U.S. Bankruptcy Court"
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                This name appears on the display header.
              </p>
            </div>

            <div>
              <label htmlFor="court_subtitle" className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                Court Subtitle
              </label>
              <input
                type="text"
                id="court_subtitle"
                value={formData.court_subtitle}
                onChange={(e) => handleInputChange('court_subtitle', e.target.value)}
                className="mt-1 w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary dark:bg-gray-700 dark:text-white"
                placeholder="e.g., District of Utah"
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                The district or additional text shown below the court name.
              </p>
            </div>

            <div>
              <label htmlFor="courthouse_name" className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                Courthouse Name
              </label>
              <input
                type="text"
                id="courthouse_name"
                value={formData.courthouse_name}
                onChange={(e) => handleInputChange('courthouse_name', e.target.value)}
                className="mt-1 w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary dark:bg-gray-700 dark:text-white"
                placeholder="e.g., Frank E. Moss Federal Courthouse"
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                The name of the physical courthouse building, shown on the display.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="chief_judge" className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                  Chief Judge
                </label>
                <input
                  type="text"
                  id="chief_judge"
                  value={formData.chief_judge}
                  onChange={(e) => handleInputChange('chief_judge', e.target.value)}
                  className="mt-1 w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary dark:bg-gray-700 dark:text-white"
                  placeholder="e.g., Honorable Peggy Hunt"
                />
              </div>

              <div>
                <label htmlFor="clerk_of_court" className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                  Clerk of Court
                </label>
                <input
                  type="text"
                  id="clerk_of_court"
                  value={formData.clerk_of_court}
                  onChange={(e) => handleInputChange('clerk_of_court', e.target.value)}
                  className="mt-1 w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary dark:bg-gray-700 dark:text-white"
                  placeholder="e.g., David A. Sime"
                />
              </div>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 -mt-2">
              Displayed on the signage header as "Chief Judge &bull; Clerk of Court".
            </p>

            {/* Court Logo Upload */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
                Court Logo
              </label>
              <div className="flex items-start space-x-4">
                {/* Logo Preview */}
                <div className="flex-shrink-0">
                  <div className="w-24 h-24 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg flex items-center justify-center bg-gray-50 dark:bg-gray-700 overflow-hidden">
                    {logoPreview ? (
                      <img
                        src={logoPreview}
                        alt="Court Logo Preview"
                        className="max-w-full max-h-full object-contain"
                      />
                    ) : (
                      <svg
                        className="w-8 h-8 text-gray-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                        />
                      </svg>
                    )}
                  </div>
                </div>

                {/* Upload Controls */}
                <div className="flex-1">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".png,.svg,image/png,image/svg+xml"
                    onChange={handleLogoUpload}
                    className="hidden"
                    id="logo-upload"
                  />
                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploading || uploadLogoMutation.isPending}
                      className="inline-flex items-center px-3 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-lg text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:opacity-50"
                    >
                      {isUploading || uploadLogoMutation.isPending ? (
                        <>
                          <svg className="animate-spin -ml-0.5 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                          Uploading...
                        </>
                      ) : (
                        <>
                          <svg className="-ml-0.5 mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                          </svg>
                          Upload Logo
                        </>
                      )}
                    </button>
                    {logoPreview && (
                      <button
                        type="button"
                        onClick={handleRemoveLogo}
                        disabled={removeLogoMutation.isPending}
                        className="inline-flex items-center px-3 py-2 border border-red-300 dark:border-red-600 text-sm font-medium rounded-lg text-red-700 dark:text-red-300 bg-white dark:bg-gray-700 hover:bg-red-50 dark:hover:bg-red-900/30 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50 ml-2"
                      >
                        {removeLogoMutation.isPending ? 'Removing...' : 'Remove'}
                      </button>
                    )}
                  </div>
                  <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                    PNG or SVG, max 5MB. Recommended size: 200x200 pixels.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* System Configuration Section */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2">System Configuration</h3>

            <div>
              <label htmlFor="timezone" className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                Timezone
              </label>
              <select
                id="timezone"
                value={formData.timezone}
                onChange={(e) => handleInputChange('timezone', e.target.value)}
                className="mt-1 w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary dark:bg-gray-700 dark:text-white"
              >
                {timezoneOptions.map((tz) => (
                  <option key={tz.value} value={tz.value}>
                    {tz.label}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                All times will be displayed in this timezone.
              </p>
            </div>

            <div>
              <label htmlFor="default_theme" className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                Default Display Theme
              </label>
              <select
                id="default_theme"
                value={formData.default_theme}
                onChange={(e) => handleInputChange('default_theme', e.target.value)}
                className="mt-1 w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary dark:bg-gray-700 dark:text-white"
              >
                {themeOptions.map((theme) => (
                  <option key={theme.value} value={theme.value}>
                    {theme.label}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                The default theme for new displays. Individual displays can override this.
              </p>
            </div>
          </div>

          {/* Save Buttons */}
          <div className="flex items-center justify-end space-x-3 pt-4 border-t dark:border-gray-700">
            <button
              type="button"
              onClick={handleReset}
              disabled={!hasChanges || saveMutation.isPending}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Reset
            </button>
            <button
              type="submit"
              disabled={!hasChanges || saveMutation.isPending}
              className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-secondary focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saveMutation.isPending ? (
                <span className="flex items-center">
                  <svg
                    className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  Saving...
                </span>
              ) : (
                'Save Settings'
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Settings Metadata */}
      {data?.metadata && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow dark:shadow-gray-900/50 p-6">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Last Updated</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            {Object.entries(data.metadata).map(([key, meta]) => (
              <div key={key} className="flex justify-between text-gray-600 dark:text-gray-300">
                <span className="font-medium">{key.replace(/_/g, ' ')}:</span>
                <span>
                  {new Date(meta.updatedAt).toLocaleString()}
                  {meta.updatedBy && ` by ${meta.updatedBy.name}`}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Data Management */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow dark:shadow-gray-900/50 p-6">
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-1">Data Management</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Export, clear, or import system data.
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-5">
          {categoryOptions.map((cat) => (
            <label key={cat.key} className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={selectedCategories.has(cat.key)}
                onChange={() => toggleCategory(cat.key)}
                className="rounded border-gray-300 dark:border-gray-600 text-primary focus:ring-primary dark:bg-gray-700"
              />
              <span className="text-sm text-gray-700 dark:text-gray-200">{cat.label}</span>
            </label>
          ))}
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handleExport}
            disabled={isExporting || selectedCategories.size === 0}
            className="inline-flex items-center px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50"
          >
            {isExporting ? 'Exporting...' : 'Export Selected'}
          </button>
          <button
            type="button"
            onClick={() => {
              if (selectedCategories.size === 0) {
                toast.error('Select at least one category to clear');
                return;
              }
              setShowClearConfirm(true);
            }}
            disabled={isClearing || selectedCategories.size === 0}
            className="inline-flex items-center px-4 py-2 text-sm font-medium text-red-700 dark:text-red-300 bg-white dark:bg-gray-700 border border-red-300 dark:border-red-600 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 disabled:opacity-50"
          >
            {isClearing ? 'Clearing...' : 'Clear Selected'}
          </button>
          <button
            type="button"
            onClick={() => importFileInputRef.current?.click()}
            disabled={isImporting}
            className="inline-flex items-center px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50"
          >
            {isImporting ? 'Importing...' : 'Import...'}
          </button>
          <input
            ref={importFileInputRef}
            type="file"
            accept=".json"
            onChange={handleImportFileSelect}
            className="hidden"
          />
        </div>
      </div>

      {/* Clear Confirmation Modal */}
      {showClearConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Confirm Clear Data</h3>
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
              This will permanently delete all data in the following categories:
            </p>
            <ul className="list-disc list-inside text-sm text-gray-700 dark:text-gray-200 mb-6 space-y-1">
              {categoryOptions
                .filter((c) => selectedCategories.has(c.key))
                .map((c) => (
                  <li key={c.key}>{c.label}</li>
                ))}
            </ul>
            <div className="flex justify-end space-x-3">
              <button
                type="button"
                onClick={() => setShowClearConfirm(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleClear}
                disabled={isClearing}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {isClearing ? 'Clearing...' : 'Clear Data'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import Confirmation Modal */}
      {showImportConfirm && importData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Confirm Import</h3>
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
              This will import the following data (duplicates will be skipped):
            </p>
            <ul className="list-disc list-inside text-sm text-gray-700 dark:text-gray-200 mb-6 space-y-1">
              {Object.entries((importData as { categories: Record<string, unknown[]> }).categories).map(
                ([key, values]) => (
                  <li key={key}>
                    {key}: {Array.isArray(values) ? values.length : 0} records
                  </li>
                )
              )}
            </ul>
            <div className="flex justify-end space-x-3">
              <button
                type="button"
                onClick={() => {
                  setShowImportConfirm(false);
                  setImportData(null);
                }}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleImport}
                disabled={isImporting}
                className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-secondary disabled:opacity-50"
              >
                {isImporting ? 'Importing...' : 'Import Data'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
