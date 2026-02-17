import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { displaysApi, Display, UpdateDisplayInput, WeekSchedule, DaySchedule } from '../api/displays';
import { docketApi } from '../api/docket';
import AutocompleteInput from './AutocompleteInput';
import ModalPortal from './ModalPortal';

const DAYS_OF_WEEK = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;
const DAY_LABELS: Record<string, string> = {
  monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu',
  friday: 'Fri', saturday: 'Sat', sunday: 'Sun'
};
const DEFAULT_DAY: DaySchedule = { start: '07:00', end: '18:00' };

const DISPLAY_TYPE_OPTIONS = [
  { value: 'courtroom', label: 'Courtroom Calendar' },
  { value: 'combined', label: 'Combined / All Hearings' },
  { value: 'wayfinding', label: 'Wayfinding Directory' },
  { value: 'it-status', label: 'IT Status Monitor' },
  { value: 'chambers', label: "Judge's Chambers" },
];

const DIRECTION_OPTIONS = ['right', 'left', 'straight', 'down-the-hall'];
const ICON_OPTIONS = ['courtroom', 'intake', 'restroom', 'conference'];

interface WayfindingDirection {
  name: string;
  direction: string;
  description: string;
  icon: string;
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

function parseWayfindingConfig(raw: string | null): WayfindingDirection[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return parsed?.directions || [];
  } catch { return []; }
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
    rtspUrl1: display.rtspUrl1,
    rtspUrl2: display.rtspUrl2,
    cameraLabel1: display.cameraLabel1,
    cameraLabel2: display.cameraLabel2,
    cameraRotateInterval: display.cameraRotateInterval,
  });

  const [wayfindingDirections, setWayfindingDirections] = useState<WayfindingDirection[]>(
    parseWayfindingConfig(display.wayfindingConfig)
  );

  const displayType = formData.displayType || 'courtroom';

  // Field visibility by display type
  const showJudgeFilter = displayType === 'courtroom' || displayType === 'chambers';
  const showCourtroomFilter = displayType === 'courtroom';
  const showDocketViewMode = displayType === 'courtroom' || displayType === 'combined' || displayType === 'chambers';
  const showDocketOptions = displayType !== 'wayfinding';
  const showWayfindingConfig = displayType === 'wayfinding';
  const showCameraConfig = displayType === 'it-status';

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
    updateMutation.mutate(submitData);
  };

  const addWayfindingDirection = () => {
    setWayfindingDirections([...wayfindingDirections, { name: '', direction: 'right', description: '', icon: 'courtroom' }]);
  };

  const updateWayfindingDirection = (index: number, field: keyof WayfindingDirection, value: string) => {
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
                {DISPLAY_TYPE_OPTIONS.map((opt) => (
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
                          value={dir.direction}
                          onChange={(e) => updateWayfindingDirection(idx, 'direction', e.target.value)}
                          className="px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded dark:bg-gray-700 dark:text-white"
                        >
                          {DIRECTION_OPTIONS.map((d) => (
                            <option key={d} value={d}>{d}</option>
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
                <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-3">Camera Configuration</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                      Camera 1 HLS URL
                    </label>
                    <input
                      type="text"
                      value={formData.rtspUrl1 || ''}
                      onChange={(e) => setFormData({ ...formData, rtspUrl1: e.target.value || null })}
                      placeholder="http://server:1984/api/stream.m3u8?src=north-cam"
                      className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary dark:bg-gray-700 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                      Camera 1 Label
                    </label>
                    <input
                      type="text"
                      value={formData.cameraLabel1 || ''}
                      onChange={(e) => setFormData({ ...formData, cameraLabel1: e.target.value || null })}
                      placeholder="e.g., North Courtroom"
                      className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary dark:bg-gray-700 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                      Camera 2 HLS URL
                    </label>
                    <input
                      type="text"
                      value={formData.rtspUrl2 || ''}
                      onChange={(e) => setFormData({ ...formData, rtspUrl2: e.target.value || null })}
                      placeholder="http://server:1984/api/stream.m3u8?src=south-cam"
                      className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary dark:bg-gray-700 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                      Camera 2 Label
                    </label>
                    <input
                      type="text"
                      value={formData.cameraLabel2 || ''}
                      onChange={(e) => setFormData({ ...formData, cameraLabel2: e.target.value || null })}
                      placeholder="e.g., South Courtroom"
                      className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary dark:bg-gray-700 dark:text-white"
                    />
                  </div>
                </div>
                <div className="mt-3">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                    Camera Rotate Interval (seconds)
                  </label>
                  <input
                    type="number"
                    min="5"
                    max="300"
                    value={formData.cameraRotateInterval ?? 30}
                    onChange={(e) => setFormData({ ...formData, cameraRotateInterval: parseInt(e.target.value) || 30 })}
                    className="w-32 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary dark:bg-gray-700 dark:text-white"
                  />
                </div>
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
