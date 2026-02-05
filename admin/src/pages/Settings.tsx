import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import Breadcrumb from '../components/Breadcrumb';
import { getStoredToken } from '../api/client';

interface SettingsData {
  court_name: string;
  court_subtitle: string;
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
    timezone: 'America/Denver',
    default_theme: 'default',
  });
  const [hasChanges, setHasChanges] = useState(false);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-600">Failed to load settings. Please try again.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: 'Settings' }]} />

      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">System Settings</h2>
          <p className="mt-1 text-sm text-gray-500">
            Configure global settings for the courthouse digital signage system.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Court Information Section */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium text-gray-900 border-b pb-2">Court Information</h3>

            <div>
              <label htmlFor="court_name" className="block text-sm font-medium text-gray-700">
                Court Name
              </label>
              <input
                type="text"
                id="court_name"
                value={formData.court_name}
                onChange={(e) => handleInputChange('court_name', e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm"
                placeholder="e.g., U.S. Bankruptcy Court"
              />
              <p className="mt-1 text-xs text-gray-500">
                This name appears on the display header.
              </p>
            </div>

            <div>
              <label htmlFor="court_subtitle" className="block text-sm font-medium text-gray-700">
                Court Subtitle
              </label>
              <input
                type="text"
                id="court_subtitle"
                value={formData.court_subtitle}
                onChange={(e) => handleInputChange('court_subtitle', e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm"
                placeholder="e.g., District of Utah"
              />
              <p className="mt-1 text-xs text-gray-500">
                The district or additional text shown below the court name.
              </p>
            </div>

            {/* Court Logo Upload */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Court Logo
              </label>
              <div className="flex items-start space-x-4">
                {/* Logo Preview */}
                <div className="flex-shrink-0">
                  <div className="w-24 h-24 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center bg-gray-50 overflow-hidden">
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
                      className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:opacity-50"
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
                        className="inline-flex items-center px-3 py-2 border border-red-300 shadow-sm text-sm leading-4 font-medium rounded-md text-red-700 bg-white hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50 ml-2"
                      >
                        {removeLogoMutation.isPending ? 'Removing...' : 'Remove'}
                      </button>
                    )}
                  </div>
                  <p className="mt-2 text-xs text-gray-500">
                    PNG or SVG, max 5MB. Recommended size: 200x200 pixels.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* System Configuration Section */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium text-gray-900 border-b pb-2">System Configuration</h3>

            <div>
              <label htmlFor="timezone" className="block text-sm font-medium text-gray-700">
                Timezone
              </label>
              <select
                id="timezone"
                value={formData.timezone}
                onChange={(e) => handleInputChange('timezone', e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm"
              >
                {timezoneOptions.map((tz) => (
                  <option key={tz.value} value={tz.value}>
                    {tz.label}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-gray-500">
                All times will be displayed in this timezone.
              </p>
            </div>

            <div>
              <label htmlFor="default_theme" className="block text-sm font-medium text-gray-700">
                Default Display Theme
              </label>
              <select
                id="default_theme"
                value={formData.default_theme}
                onChange={(e) => handleInputChange('default_theme', e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm"
              >
                {themeOptions.map((theme) => (
                  <option key={theme.value} value={theme.value}>
                    {theme.label}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-gray-500">
                The default theme for new displays. Individual displays can override this.
              </p>
            </div>
          </div>

          {/* Save Buttons */}
          <div className="flex items-center justify-end space-x-3 pt-4 border-t">
            <button
              type="button"
              onClick={handleReset}
              disabled={!hasChanges || saveMutation.isPending}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Reset
            </button>
            <button
              type="submit"
              disabled={!hasChanges || saveMutation.isPending}
              className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-md hover:bg-secondary focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed"
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
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Last Updated</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            {Object.entries(data.metadata).map(([key, meta]) => (
              <div key={key} className="flex justify-between text-gray-600">
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
    </div>
  );
}
