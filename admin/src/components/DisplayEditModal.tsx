import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { displaysApi, Display, UpdateDisplayInput, WeekSchedule, DaySchedule } from '../api/displays';
import { docketApi } from '../api/docket';
import AutocompleteInput from './AutocompleteInput';
import ModalPortal from './ModalPortal';
import { useDisplayTypeOptions, useTemplateBySlug } from '../hooks/useDisplayTemplates';

const DAYS_OF_WEEK = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;
const DAY_LABELS: Record<string, string> = {
  monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu',
  friday: 'Fri', saturday: 'Sat', sunday: 'Sun'
};
const DEFAULT_DAY: DaySchedule = { start: '07:00', end: '18:00' };

const ARROW_OPTIONS = [
  'right', 'left', 'up', 'up-right', 'up-left',
  'left-near-up', 'left-mid-up', 'left-far-up',
  'left-near-down', 'left-mid-down', 'left-far-down',
  'right-near-up', 'right-mid-up', 'right-far-up',
  'right-near-down', 'right-mid-down',
];

const ARROW_LABELS: Record<string, string> = {
  'right': 'right',
  'left': 'left',
  'up': 'up (straight)',
  'up-right': 'up-right',
  'up-left': 'up-left',
  'left-near-up': 'left (short) → up',
  'left-mid-up': 'left (mid) → up',
  'left-far-up': 'left (far) → up',
  'left-near-down': 'left (short) → down',
  'left-mid-down': 'left (mid) → down',
  'left-far-down': 'left (far) → down',
  'right-near-up': 'right (short) → up',
  'right-mid-up': 'right (mid) → up',
  'right-far-up': 'right (far) → up',
  'right-near-down': 'right (short) → down',
  'right-mid-down': 'right (mid) → down',
};
const ICON_OPTIONS = ['courtroom', 'intake', 'restroom', 'conference', 'informational', 'emergency'];

interface CameraEntry {
  name: string;
  url: string;
}

interface WayfindingDirection {
  name: string;
  direction: string;
  arrow: string;
  description: string;
  icon: string;
  column: number;  // 1 = left, 2 = right
  row: number;     // 1-based row position
}

function parseScheduleConfig(raw: string): WeekSchedule {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0) return parsed;
  } catch { /* ignore */ }
  return {
    monday: { ...DEFAULT_DAY }, tuesday: { ...DEFAULT_DAY }, wednesday: { ...DEFAULT_DAY },
    thursday: { ...DEFAULT_DAY }, friday: { ...DEFAULT_DAY }, saturday: null, sunday: null
  };
}

function parseWayfindingConfig(raw: string | object | null): WayfindingDirection[] {
  if (!raw) return [];
  try {
    let parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (typeof parsed === 'string') parsed = JSON.parse(parsed); // double-encoded repair
    const directions: WayfindingDirection[] = parsed?.directions || [];
    // Backfill column/row for directions saved before grid support
    return directions.map((d, i) => ({
      ...d,
      column: d.column || 1,
      row: d.row || (i + 1),
    }));
  } catch { return []; }
}

function parseCameraConfig(display: Display): CameraEntry[] {
  // Try new cameraConfig field first
  if (display.cameraConfig) {
    try {
      let parsed = typeof display.cameraConfig === 'string' ? JSON.parse(display.cameraConfig) : display.cameraConfig;
      if (typeof parsed === 'string') parsed = JSON.parse(parsed);
      if (parsed?.cameras && Array.isArray(parsed.cameras)) return parsed.cameras;
    } catch { /* fall through */ }
  }
  // Fall back to old rtspUrl1/2 fields
  const cameras: CameraEntry[] = [];
  if (display.rtspUrl1 || display.cameraLabel1) {
    cameras.push({ name: display.cameraLabel1 || 'Camera 1', url: display.rtspUrl1 || '' });
  }
  if (display.rtspUrl2 || display.cameraLabel2) {
    cameras.push({ name: display.cameraLabel2 || 'Camera 2', url: display.rtspUrl2 || '' });
  }
  return cameras;
}

interface DisplayEditModalProps {
  display: Display;
  onClose: () => void;
  onSaved?: () => void;
}

export default function DisplayEditModal({ display, onClose, onSaved }: DisplayEditModalProps) {
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState<UpdateDisplayInput>({
    name: display.name,
    location: display.location,
    judgeFilter: display.judgeFilter,
    courtroomFilter: display.courtroomFilter,
    showStricken: display.showStricken,
    showZoomInfo: display.showZoomInfo,
    highlightCurrent: display.highlightCurrent,
    showContentCards: display.showContentCards,
    orientation: display.orientation || 'landscape',
    showWeather: display.showWeather,
    weatherLocation: display.weatherLocation,
    noticeText: display.noticeText,
    tickerEnabled: display.tickerEnabled,
    tickerSpeed: display.tickerSpeed,
    scheduleEnabled: display.scheduleEnabled,
    scheduleConfig: parseScheduleConfig(display.scheduleConfig),
    screensaverType: display.screensaverType || 'black',
    docketViewMode: display.docketViewMode || 'all',
    displayType: display.displayType || 'courtroom',
  });

  const [wayfindingDirections, setWayfindingDirections] = useState<WayfindingDirection[]>(
    parseWayfindingConfig(display.wayfindingConfig)
  );

  const [cameras, setCameras] = useState<CameraEntry[]>(
    parseCameraConfig(display)
  );

  const displayType = formData.displayType || 'courtroom';

  const { options: displayTypeOptions } = useDisplayTypeOptions();
  const selectedTemplate = useTemplateBySlug(displayType);

  // Parse template components to determine field visibility
  const templateComponents = useMemo(() => {
    if (!selectedTemplate) return [];
    try {
      return JSON.parse(selectedTemplate.components) as { type: string }[];
    } catch { return []; }
  }, [selectedTemplate]);

  const hasComponent = (type: string) => templateComponents.some(c => c.type === type);

  // Field visibility: for built-in slugs, keep existing behavior as fallback.
  // For custom templates, derive from components.
  const BUILTIN_SLUGS = ['courtroom', 'combined', 'wayfinding', 'it-status', 'chambers'];
  const isBuiltInSlug = BUILTIN_SLUGS.includes(displayType);

  const showJudgeFilter = isBuiltInSlug
    ? (displayType === 'courtroom' || displayType === 'chambers')
    : (hasComponent('hearing-table') || hasComponent('hearing-pills'));
  const showCourtroomFilter = isBuiltInSlug
    ? displayType === 'courtroom'
    : hasComponent('hearing-table');
  const showDocketViewMode = isBuiltInSlug
    ? (displayType === 'courtroom' || displayType === 'combined' || displayType === 'chambers')
    : hasComponent('hearing-table');
  const showDocketOptions = isBuiltInSlug
    ? displayType !== 'wayfinding'
    : (hasComponent('hearing-table') || hasComponent('hearing-pills'));
  const showWayfindingConfig = isBuiltInSlug
    ? displayType === 'wayfinding'
    : hasComponent('direction-cards');
  const showCameraConfig = isBuiltInSlug
    ? displayType === 'it-status'
    : hasComponent('camera-grid');

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

  const updateMutation = useMutation({
    mutationFn: (data: UpdateDisplayInput) => displaysApi.update(display.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['displays'] });
      queryClient.invalidateQueries({ queryKey: ['dashboardDisplays'] });
      queryClient.invalidateQueries({ queryKey: ['dashboardStats'] });
      toast.success('Display updated');
      onSaved?.();
      onClose();
    },
    onError: () => {
      toast.error('Failed to update display');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const submitData: UpdateDisplayInput = { ...formData };
    if (showWayfindingConfig) {
      submitData.wayfindingConfig = { directions: wayfindingDirections };
    }
    if (showCameraConfig) {
      submitData.cameraConfig = { cameras };
    }
    updateMutation.mutate(submitData);
  };

  const addCamera = () => {
    setCameras([...cameras, { name: '', url: '' }]);
  };

  const updateCamera = (index: number, field: keyof CameraEntry, value: string) => {
    const updated = [...cameras];
    updated[index] = { ...updated[index], [field]: value };
    setCameras(updated);
  };

  const removeCamera = (index: number) => {
    setCameras(cameras.filter((_, i) => i !== index));
  };

  const addWayfindingDirection = () => {
    const maxRow = wayfindingDirections
      .filter(d => d.column === 1)
      .reduce((max, d) => Math.max(max, d.row || 0), 0);
    setWayfindingDirections([...wayfindingDirections, {
      name: '', direction: 'right', arrow: 'right', description: '', icon: 'courtroom',
      column: 1, row: maxRow + 1,
    }]);
  };

  const updateWayfindingDirection = (index: number, field: keyof WayfindingDirection, value: string | number) => {
    const updated = [...wayfindingDirections];
    updated[index] = { ...updated[index], [field]: value };
    setWayfindingDirections(updated);
  };

  const removeWayfindingDirection = (index: number) => {
    setWayfindingDirections(wayfindingDirections.filter((_, i) => i !== index));
  };

  return (
    <ModalPortal>
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Edit Display</h3>
          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            {/* Display Type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                Display Type
              </label>
              <select
                value={displayType}
                onChange={(e) => setFormData({ ...formData, displayType: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary dark:bg-gray-700 dark:text-white"
              >
                {displayTypeOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            {/* Basic Info */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                  Display ID
                </label>
                <input
                  type="text"
                  value={display.id}
                  disabled
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg disabled:bg-gray-100 dark:disabled:bg-gray-700 dark:bg-gray-700 dark:text-white"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Unique identifier (cannot be changed)
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                  Display Name *
                </label>
                <input
                  type="text"
                  value={formData.name || ''}
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
                value={formData.location || ''}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                required
                placeholder="e.g., Third Floor, Outside Courtroom 321"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary dark:bg-gray-700 dark:text-white"
              />
            </div>

            {/* Filters (conditional) */}
            {(showJudgeFilter || showCourtroomFilter) && (
              <div className="grid grid-cols-2 gap-4">
                {showCourtroomFilter && (
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
                )}
                {showJudgeFilter && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                      Judge Filter {displayType === 'chambers' && '*'}
                    </label>
                    <AutocompleteInput
                      suggestions={judges}
                      value={formData.judgeFilter || ''}
                      onChange={(val) => setFormData({ ...formData, judgeFilter: val || null })}
                      placeholder="e.g., Smith"
                      inputClassName="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary dark:bg-gray-700 dark:text-white"
                    />
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      {displayType === 'chambers' ? "Required. Shows this judge's full calendar across all courtrooms" : 'Only show entries for this judge'}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Wayfinding Config Editor */}
            {showWayfindingConfig && (
              <div className="border-t dark:border-gray-700 pt-4 mt-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-medium text-gray-900 dark:text-white">Wayfinding Directions</h4>
                  <button
                    type="button"
                    onClick={addWayfindingDirection}
                    className="text-xs px-2 py-1 bg-primary text-white rounded hover:bg-primary/90"
                  >
                    + Add Direction
                  </button>
                </div>
                <div className="space-y-3">
                  {wayfindingDirections.map((dir, idx) => (
                    <div key={idx} className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Direction {idx + 1}</span>
                        <button
                          type="button"
                          onClick={() => removeWayfindingDirection(idx)}
                          className="text-xs text-red-500 hover:text-red-700"
                        >
                          Remove
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="text"
                          value={dir.name}
                          onChange={(e) => updateWayfindingDirection(idx, 'name', e.target.value)}
                          placeholder="Name (e.g., North Courtroom)"
                          className="px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded dark:bg-gray-700 dark:text-white"
                        />
                        <select
                          value={dir.arrow || dir.direction}
                          onChange={(e) => updateWayfindingDirection(idx, 'arrow', e.target.value)}
                          className="px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded dark:bg-gray-700 dark:text-white"
                        >
                          {ARROW_OPTIONS.map((a) => (
                            <option key={a} value={a}>{ARROW_LABELS[a] || a}</option>
                          ))}
                        </select>
                        <input
                          type="text"
                          value={dir.description}
                          onChange={(e) => updateWayfindingDirection(idx, 'description', e.target.value)}
                          placeholder="Description (e.g., Immediately on your right)"
                          className="px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded dark:bg-gray-700 dark:text-white"
                        />
                        <select
                          value={dir.icon}
                          onChange={(e) => updateWayfindingDirection(idx, 'icon', e.target.value)}
                          className="px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded dark:bg-gray-700 dark:text-white"
                        >
                          {ICON_OPTIONS.map((ic) => (
                            <option key={ic} value={ic}>{ic}</option>
                          ))}
                        </select>
                      </div>
                      <div className="flex items-center gap-3 mt-1">
                        <label className="text-xs text-gray-500 dark:text-gray-400">Column</label>
                        <select
                          value={dir.column || 1}
                          onChange={(e) => updateWayfindingDirection(idx, 'column', parseInt(e.target.value, 10))}
                          className="px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded dark:bg-gray-700 dark:text-white w-24"
                        >
                          <option value={1}>Left</option>
                          <option value={2}>Right</option>
                        </select>
                        <label className="text-xs text-gray-500 dark:text-gray-400">Row</label>
                        <input
                          type="number"
                          min={1}
                          value={dir.row || 1}
                          onChange={(e) => updateWayfindingDirection(idx, 'row', Math.max(1, parseInt(e.target.value, 10) || 1))}
                          className="px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded dark:bg-gray-700 dark:text-white w-16"
                        />
                      </div>
                    </div>
                  ))}
                  {wayfindingDirections.length === 0 && (
                    <p className="text-sm text-gray-400 dark:text-gray-500 italic text-center py-4">
                      No directions configured. Click "Add Direction" to start.
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Camera Config (IT Status) */}
            {showCameraConfig && (
              <div className="border-t dark:border-gray-700 pt-4 mt-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-medium text-gray-900 dark:text-white">Cameras</h4>
                  <button
                    type="button"
                    onClick={addCamera}
                    className="text-xs px-2 py-1 bg-primary text-white rounded hover:bg-primary/90"
                  >
                    + Add Camera
                  </button>
                </div>
                <div className="space-y-3">
                  {cameras.map((cam, idx) => (
                    <div key={idx} className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Camera {idx + 1}</span>
                        <button
                          type="button"
                          onClick={() => removeCamera(idx)}
                          className="text-xs text-red-500 hover:text-red-700"
                        >
                          Remove
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="text"
                          value={cam.name}
                          onChange={(e) => updateCamera(idx, 'name', e.target.value)}
                          placeholder="Name (e.g., North Courtroom)"
                          className="px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded dark:bg-gray-700 dark:text-white"
                        />
                        <input
                          type="text"
                          value={cam.url}
                          onChange={(e) => updateCamera(idx, 'url', e.target.value)}
                          placeholder="HLS URL (leave empty for test pattern)"
                          className="px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded dark:bg-gray-700 dark:text-white"
                        />
                      </div>
                    </div>
                  ))}
                  {cameras.length === 0 && (
                    <p className="text-sm text-gray-400 dark:text-gray-500 italic text-center py-4">
                      No cameras configured. Click "+ Add Camera" to start.
                    </p>
                  )}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                  Leave URL empty to show a test pattern for that camera tile.
                </p>
              </div>
            )}

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
                {showDocketViewMode && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                      Docket View Mode
                    </label>
                    <select
                      value={formData.docketViewMode}
                      onChange={(e) => setFormData({ ...formData, docketViewMode: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary dark:bg-gray-700 dark:text-white"
                    >
                      <option value="all">Show All Hearings</option>
                      <option value="smart">Smart Time Priority</option>
                    </select>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Smart mode filters by time relevance, showing nearby hearings first
                    </p>
                  </div>
                )}
              </div>
              {showDocketOptions && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="edit-showWeather"
                      checked={formData.showWeather ?? true}
                      onChange={(e) => setFormData({ ...formData, showWeather: e.target.checked })}
                      className="h-4 w-4 text-primary focus:ring-primary border-gray-300 dark:border-gray-600 rounded"
                    />
                    <label htmlFor="edit-showWeather" className="ml-2 text-sm text-gray-700 dark:text-gray-200">
                      Show Weather Widget
                    </label>
                  </div>
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="edit-tickerEnabled"
                      checked={formData.tickerEnabled ?? true}
                      onChange={(e) => setFormData({ ...formData, tickerEnabled: e.target.checked })}
                      className="h-4 w-4 text-primary focus:ring-primary border-gray-300 dark:border-gray-600 rounded"
                    />
                    <label htmlFor="edit-tickerEnabled" className="ml-2 text-sm text-gray-700 dark:text-gray-200">
                      Enable Announcement Ticker
                    </label>
                  </div>
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="edit-showZoomInfo"
                      checked={formData.showZoomInfo ?? true}
                      onChange={(e) => setFormData({ ...formData, showZoomInfo: e.target.checked })}
                      className="h-4 w-4 text-primary focus:ring-primary border-gray-300 dark:border-gray-600 rounded"
                    />
                    <label htmlFor="edit-showZoomInfo" className="ml-2 text-sm text-gray-700 dark:text-gray-200">
                      Show Zoom Info
                    </label>
                  </div>
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="edit-highlightCurrent"
                      checked={formData.highlightCurrent ?? true}
                      onChange={(e) => setFormData({ ...formData, highlightCurrent: e.target.checked })}
                      className="h-4 w-4 text-primary focus:ring-primary border-gray-300 dark:border-gray-600 rounded"
                    />
                    <label htmlFor="edit-highlightCurrent" className="ml-2 text-sm text-gray-700 dark:text-gray-200">
                      Highlight Current Hearing
                    </label>
                  </div>
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="edit-showStricken"
                      checked={formData.showStricken ?? false}
                      onChange={(e) => setFormData({ ...formData, showStricken: e.target.checked })}
                      className="h-4 w-4 text-primary focus:ring-primary border-gray-300 dark:border-gray-600 rounded"
                    />
                    <label htmlFor="edit-showStricken" className="ml-2 text-sm text-gray-700 dark:text-gray-200">
                      Show Stricken Entries
                    </label>
                  </div>
                </div>
              )}
              <div className="flex items-center mt-4">
                <input
                  type="checkbox"
                  id="edit-showContentCards"
                  checked={formData.showContentCards ?? false}
                  onChange={(e) => setFormData({ ...formData, showContentCards: e.target.checked })}
                  className="h-4 w-4 text-primary focus:ring-primary border-gray-300 dark:border-gray-600 rounded"
                />
                <label htmlFor="edit-showContentCards" className="ml-2 text-sm text-gray-700 dark:text-gray-200">
                  Show Content Cards
                </label>
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
                value={formData.noticeText || ''}
                onChange={(e) => setFormData({ ...formData, noticeText: e.target.value })}
                placeholder="Please turn your phones OFF in the Courthouse"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary dark:bg-gray-700 dark:text-white"
              />
            </div>

            {/* Schedule & Screensaver */}
            <div className="border-t dark:border-gray-700 pt-4 mt-4">
              <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-3">Schedule & Screensaver</h4>
              <div className="flex items-center mb-3">
                <input
                  type="checkbox"
                  id="edit-scheduleEnabled"
                  checked={formData.scheduleEnabled ?? false}
                  onChange={(e) => setFormData({ ...formData, scheduleEnabled: e.target.checked })}
                  className="h-4 w-4 text-primary focus:ring-primary border-gray-300 dark:border-gray-600 rounded"
                />
                <label htmlFor="edit-scheduleEnabled" className="ml-2 text-sm text-gray-700 dark:text-gray-200">
                  Enable Active Hours Schedule
                </label>
              </div>

              {formData.scheduleEnabled && (
                <div className="space-y-2 mb-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
                  {DAYS_OF_WEEK.map((day) => {
                    const schedule = formData.scheduleConfig as WeekSchedule | undefined;
                    const dayConfig = schedule?.[day] ?? null;
                    const isActive = dayConfig !== null;
                    return (
                      <div key={day} className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={isActive}
                          onChange={(e) => {
                            const newSchedule = { ...(schedule || {}) } as WeekSchedule;
                            newSchedule[day] = e.target.checked ? { ...DEFAULT_DAY } : null;
                            setFormData({ ...formData, scheduleConfig: newSchedule });
                          }}
                          className="h-4 w-4 text-primary focus:ring-primary border-gray-300 dark:border-gray-600 rounded"
                        />
                        <span className="w-10 text-sm font-medium text-gray-700 dark:text-gray-200">
                          {DAY_LABELS[day]}
                        </span>
                        {isActive ? (
                          <>
                            <input
                              type="time"
                              value={dayConfig.start}
                              onChange={(e) => {
                                const newSchedule = { ...(schedule || {}) } as WeekSchedule;
                                newSchedule[day] = { ...dayConfig, start: e.target.value };
                                setFormData({ ...formData, scheduleConfig: newSchedule });
                              }}
                              className="px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded dark:bg-gray-700 dark:text-white"
                            />
                            <span className="text-sm text-gray-500 dark:text-gray-400">to</span>
                            <input
                              type="time"
                              value={dayConfig.end}
                              onChange={(e) => {
                                const newSchedule = { ...(schedule || {}) } as WeekSchedule;
                                newSchedule[day] = { ...dayConfig, end: e.target.value };
                                setFormData({ ...formData, scheduleConfig: newSchedule });
                              }}
                              className="px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded dark:bg-gray-700 dark:text-white"
                            />
                          </>
                        ) : (
                          <span className="text-sm text-gray-400 dark:text-gray-500 italic">Inactive</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                  Screensaver Style
                </label>
                <select
                  value={formData.screensaverType}
                  onChange={(e) => setFormData({ ...formData, screensaverType: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary dark:bg-gray-700 dark:text-white"
                >
                  <option value="black">Black Screen</option>
                  <option value="clock">Moving Clock</option>
                  <option value="logo">Bouncing Court Logo</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end space-x-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={updateMutation.isPending}
                className="px-4 py-2 text-white bg-primary rounded-lg hover:bg-primary/90 disabled:opacity-50"
              >
                {updateMutation.isPending ? 'Saving...' : 'Update'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </ModalPortal>
  );
}
