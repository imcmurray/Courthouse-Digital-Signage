import { useState, useCallback, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery } from '@tanstack/react-query';
import { useBlocker } from 'react-router-dom';
import { DocketEntry, CreateDocketEntryInput, UpdateDocketEntryInput } from '../api/docket';
import { displaysApi, Display } from '../api/displays';
import UnsavedChangesDialog from './UnsavedChangesDialog';

const caseNumberRegex = /^(\d{2,4}-\d{1,6}|\d{4,})$/;

const docketSchema = z.object({
  caseNumber: z.string()
    .min(1, 'Case number is required')
    .regex(caseNumberRegex, 'Case number format invalid. Use format: YY-##### (e.g., 25-27186) or YYYY-##### (e.g., 2025-12345)'),
  caseTitle: z.string().min(1, 'Case title is required'),
  caseChapter: z.string().min(1, 'Chapter is required'),
  adversaryNumber: z.string().optional(),
  adversaryTitle: z.string().optional(),
  hearingDate: z.string().min(1, 'Hearing date is required'),
  hearingTime: z.string().min(1, 'Hearing time is required'),
  hearingMatter: z.string().min(1, 'Matter description is required'),
  hearingJudge: z.string().min(1, 'Judge is required'),
  courtroom: z.string().optional(),
  movingParty: z.string().optional(),
  opposingParty: z.string().optional(),
  trustee: z.string().optional(),
  isZoom: z.boolean().optional(),
  zoomMeetingId: z.string().optional(),
  zoomPasscode: z.string().optional(),
  zoomPhone: z.string().optional(),
  status: z.enum(['scheduled', 'in_progress', 'completed', 'cancelled', 'continued', 'stricken', 'reserved']).optional(),
  statusNote: z.string().optional(),
  comment: z.string().optional(),
  displayIds: z.array(z.string()).optional(),
});

type DocketFormData = z.infer<typeof docketSchema>;

interface DocketFormProps {
  entry?: DocketEntry;
  onSubmit: (data: CreateDocketEntryInput | UpdateDocketEntryInput) => void;
  onClose: () => void;
  isLoading?: boolean;
}

export default function DocketForm({ entry, onSubmit, onClose, isLoading }: DocketFormProps) {
  const isEditing = !!entry;
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
  const [pendingCloseAction, setPendingCloseAction] = useState(false);

  // Fetch displays for dropdown
  const { data: displaysData } = useQuery({
    queryKey: ['displays'],
    queryFn: displaysApi.getAll,
  });

  const displays = displaysData?.displays || [];

  // Format the date for the input (YYYY-MM-DD)
  const formatDateForInput = (dateString?: string) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toISOString().split('T')[0];
  };

  // Define default values for reuse
  const getDefaultValues = () => ({
    caseNumber: entry?.caseNumber || '',
    caseTitle: entry?.caseTitle || '',
    caseChapter: entry?.caseChapter || '7',
    adversaryNumber: entry?.adversaryNumber || '',
    adversaryTitle: entry?.adversaryTitle || '',
    hearingDate: formatDateForInput(entry?.hearingDate) || new Date().toISOString().split('T')[0],
    hearingTime: entry?.hearingTime || '09:00',
    hearingMatter: entry?.hearingMatter || '',
    hearingJudge: entry?.hearingJudge || '',
    courtroom: entry?.courtroom || '',
    movingParty: entry?.movingParty || '',
    opposingParty: entry?.opposingParty || '',
    trustee: entry?.trustee || '',
    isZoom: entry?.isZoom || false,
    zoomMeetingId: entry?.zoomMeetingId || '',
    zoomPasscode: entry?.zoomPasscode || '',
    zoomPhone: entry?.zoomPhone || '',
    status: entry?.status || 'scheduled',
    statusNote: entry?.statusNote || '',
    comment: entry?.comment || '',
    displayIds: [],
  });

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isDirty },
  } = useForm<DocketFormData>({
    resolver: zodResolver(docketSchema),
    defaultValues: getDefaultValues(),
  });

  // Handle form reset to defaults
  const handleReset = () => {
    reset(getDefaultValues());
  };

  const isZoom = watch('isZoom');
  const selectedDisplayIds = watch('displayIds') || [];

  // Block navigation when form is dirty
  const blocker = useBlocker(
    useCallback(
      ({ currentLocation, nextLocation }: { currentLocation: { pathname: string }; nextLocation: { pathname: string } }) =>
        isDirty && currentLocation.pathname !== nextLocation.pathname,
      [isDirty]
    )
  );

  // Show dialog when navigation is blocked
  useEffect(() => {
    if (blocker.state === 'blocked') {
      setShowUnsavedDialog(true);
      setPendingCloseAction(false); // This is a navigation block, not a close button click
    }
  }, [blocker.state]);

  const handleFormSubmit = (data: DocketFormData) => {
    // Clean up optional empty strings
    const cleanedData = { ...data };
    Object.keys(cleanedData).forEach((key) => {
      const value = cleanedData[key as keyof DocketFormData];
      if (value === '') {
        delete cleanedData[key as keyof DocketFormData];
      }
    });
    onSubmit(cleanedData as CreateDocketEntryInput);
  };

  // Handle close attempt - check for unsaved changes
  const handleCloseAttempt = () => {
    if (isDirty) {
      setPendingCloseAction(true);
      setShowUnsavedDialog(true);
    } else {
      onClose();
    }
  };

  // Handle stay in unsaved dialog
  const handleStay = () => {
    setShowUnsavedDialog(false);
    // If navigation was blocked, reset the blocker
    if (blocker.state === 'blocked') {
      blocker.reset();
    }
    setPendingCloseAction(false);
  };

  // Handle leave in unsaved dialog
  const handleLeave = () => {
    setShowUnsavedDialog(false);
    // If navigation was blocked, proceed with navigation
    if (blocker.state === 'blocked') {
      blocker.proceed();
    }
    // If close button/cancel was clicked, close the form
    if (pendingCloseAction) {
      onClose();
    }
    setPendingCloseAction(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900">
            {isEditing ? 'Edit Docket Entry' : 'Add New Docket Entry'}
          </h2>
          <button
            onClick={handleCloseAttempt}
            className="text-gray-400 hover:text-gray-600"
            type="button"
            aria-label="Close form"
          >
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit(handleFormSubmit)} className="px-6 py-4 space-y-6">
          {/* Case Information Section */}
          <div>
            <h3 className="text-lg font-medium text-gray-900 mb-4">Case Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label htmlFor="caseNumber" className="block text-sm font-medium text-gray-700 mb-1">
                  Case Number <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  id="caseNumber"
                  {...register('caseNumber')}
                  placeholder="e.g., 25-27186"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                />
                {errors.caseNumber && (
                  <p className="mt-1 text-sm text-red-600">{errors.caseNumber.message}</p>
                )}
              </div>

              <div>
                <label htmlFor="caseTitle" className="block text-sm font-medium text-gray-700 mb-1">
                  Case Title (Debtor Name) <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  id="caseTitle"
                  {...register('caseTitle')}
                  placeholder="e.g., John Smith"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                />
                {errors.caseTitle && (
                  <p className="mt-1 text-sm text-red-600">{errors.caseTitle.message}</p>
                )}
              </div>

              <div>
                <label htmlFor="caseChapter" className="block text-sm font-medium text-gray-700 mb-1">
                  Chapter <span className="text-red-500">*</span>
                </label>
                <select
                  id="caseChapter"
                  {...register('caseChapter')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                >
                  <option value="7">Chapter 7</option>
                  <option value="11">Chapter 11</option>
                  <option value="13">Chapter 13</option>
                </select>
                {errors.caseChapter && (
                  <p className="mt-1 text-sm text-red-600">{errors.caseChapter.message}</p>
                )}
              </div>
            </div>

            {/* Adversary fields */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
              <div>
                <label htmlFor="adversaryNumber" className="block text-sm font-medium text-gray-700 mb-1">
                  Adversary Number (optional)
                </label>
                <input
                  type="text"
                  id="adversaryNumber"
                  {...register('adversaryNumber')}
                  placeholder="e.g., 25-01234"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                />
              </div>
              <div>
                <label htmlFor="adversaryTitle" className="block text-sm font-medium text-gray-700 mb-1">
                  Adversary Title (optional)
                </label>
                <input
                  type="text"
                  id="adversaryTitle"
                  {...register('adversaryTitle')}
                  placeholder="e.g., Smith v. Jones"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                />
              </div>
            </div>
          </div>

          {/* Hearing Information Section */}
          <div>
            <h3 className="text-lg font-medium text-gray-900 mb-4">Hearing Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label htmlFor="hearingDate" className="block text-sm font-medium text-gray-700 mb-1">
                  Hearing Date <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  id="hearingDate"
                  {...register('hearingDate')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                />
                {errors.hearingDate && (
                  <p className="mt-1 text-sm text-red-600">{errors.hearingDate.message}</p>
                )}
              </div>

              <div>
                <label htmlFor="hearingTime" className="block text-sm font-medium text-gray-700 mb-1">
                  Hearing Time <span className="text-red-500">*</span>
                </label>
                <input
                  type="time"
                  id="hearingTime"
                  {...register('hearingTime')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                />
                {errors.hearingTime && (
                  <p className="mt-1 text-sm text-red-600">{errors.hearingTime.message}</p>
                )}
              </div>

              <div>
                <label htmlFor="hearingJudge" className="block text-sm font-medium text-gray-700 mb-1">
                  Judge <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  id="hearingJudge"
                  {...register('hearingJudge')}
                  placeholder="e.g., Judge Anderson"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                />
                {errors.hearingJudge && (
                  <p className="mt-1 text-sm text-red-600">{errors.hearingJudge.message}</p>
                )}
              </div>

              <div>
                <label htmlFor="courtroom" className="block text-sm font-medium text-gray-700 mb-1">
                  Courtroom
                </label>
                <input
                  type="text"
                  id="courtroom"
                  {...register('courtroom')}
                  placeholder="e.g., 321"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                />
              </div>
            </div>

            <div className="mt-4">
              <label htmlFor="hearingMatter" className="block text-sm font-medium text-gray-700 mb-1">
                Matter Description <span className="text-red-500">*</span>
              </label>
              <textarea
                id="hearingMatter"
                {...register('hearingMatter')}
                rows={3}
                placeholder="e.g., Motion for Relief from Stay"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
              />
              {errors.hearingMatter && (
                <p className="mt-1 text-sm text-red-600">{errors.hearingMatter.message}</p>
              )}
            </div>
          </div>

          {/* Parties Section */}
          <div>
            <h3 className="text-lg font-medium text-gray-900 mb-4">Parties (Optional)</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label htmlFor="movingParty" className="block text-sm font-medium text-gray-700 mb-1">
                  Moving Party
                </label>
                <input
                  type="text"
                  id="movingParty"
                  {...register('movingParty')}
                  placeholder="e.g., Bank of America"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                />
              </div>
              <div>
                <label htmlFor="opposingParty" className="block text-sm font-medium text-gray-700 mb-1">
                  Opposing Party
                </label>
                <input
                  type="text"
                  id="opposingParty"
                  {...register('opposingParty')}
                  placeholder="e.g., Debtor"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                />
              </div>
              <div>
                <label htmlFor="trustee" className="block text-sm font-medium text-gray-700 mb-1">
                  Trustee
                </label>
                <input
                  type="text"
                  id="trustee"
                  {...register('trustee')}
                  placeholder="e.g., Jane Doe, Trustee"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                />
              </div>
            </div>
          </div>

          {/* Zoom Information Section */}
          <div>
            <h3 className="text-lg font-medium text-gray-900 mb-4">Remote Hearing</h3>
            <div className="flex items-center mb-4">
              <input
                type="checkbox"
                {...register('isZoom')}
                id="isZoom"
                className="h-4 w-4 text-primary focus:ring-primary border-gray-300 rounded"
              />
              <label htmlFor="isZoom" className="ml-2 text-sm text-gray-700">
                This is a Zoom/remote hearing
              </label>
            </div>

            {isZoom && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pl-6 border-l-2 border-blue-200">
                <div>
                  <label htmlFor="zoomMeetingId" className="block text-sm font-medium text-gray-700 mb-1">
                    Meeting ID
                  </label>
                  <input
                    type="text"
                    id="zoomMeetingId"
                    {...register('zoomMeetingId')}
                    placeholder="e.g., 123 456 7890"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                  />
                </div>
                <div>
                  <label htmlFor="zoomPasscode" className="block text-sm font-medium text-gray-700 mb-1">
                    Passcode
                  </label>
                  <input
                    type="text"
                    id="zoomPasscode"
                    {...register('zoomPasscode')}
                    placeholder="e.g., abc123"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                  />
                </div>
                <div>
                  <label htmlFor="zoomPhone" className="block text-sm font-medium text-gray-700 mb-1">
                    Dial-in Number
                  </label>
                  <input
                    type="text"
                    id="zoomPhone"
                    {...register('zoomPhone')}
                    placeholder="e.g., +1 (123) 456-7890"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Display Assignment Section */}
          <div>
            <h3 className="text-lg font-medium text-gray-900 mb-4">Display Assignment</h3>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Assign to Displays (optional)
              </label>
              <p className="text-sm text-gray-500 mb-3">
                Select which displays should show this docket entry. Leave empty to show on all displays.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-40 overflow-y-auto border border-gray-200 rounded-lg p-3">
                {displays.length === 0 ? (
                  <p className="text-sm text-gray-500 col-span-2">No displays available</p>
                ) : (
                  displays.map((display: Display) => (
                    <label key={display.id} className="flex items-center space-x-2 p-2 hover:bg-gray-50 rounded cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedDisplayIds.includes(display.id)}
                        onChange={(e) => {
                          const currentIds = selectedDisplayIds || [];
                          if (e.target.checked) {
                            setValue('displayIds', [...currentIds, display.id]);
                          } else {
                            setValue('displayIds', currentIds.filter((id: string) => id !== display.id));
                          }
                        }}
                        className="h-4 w-4 text-primary focus:ring-primary border-gray-300 rounded"
                      />
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium text-gray-900 block truncate">{display.name}</span>
                        <span className="text-xs text-gray-500 block truncate">{display.location}</span>
                      </div>
                    </label>
                  ))
                )}
              </div>
              {selectedDisplayIds.length > 0 && (
                <p className="mt-2 text-sm text-gray-600">
                  {selectedDisplayIds.length} display{selectedDisplayIds.length !== 1 ? 's' : ''} selected
                </p>
              )}
            </div>
          </div>

          {/* Status Section */}
          <div>
            <h3 className="text-lg font-medium text-gray-900 mb-4">Status</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="status" className="block text-sm font-medium text-gray-700 mb-1">
                  Status
                </label>
                <select
                  id="status"
                  {...register('status')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                >
                  <option value="scheduled">Scheduled</option>
                  <option value="in_progress">In Progress</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                  <option value="continued">Continued</option>
                  <option value="stricken">Stricken</option>
                  <option value="reserved">Reserved</option>
                </select>
              </div>
              <div>
                <label htmlFor="statusNote" className="block text-sm font-medium text-gray-700 mb-1">
                  Status Note (optional)
                </label>
                <input
                  type="text"
                  id="statusNote"
                  {...register('statusNote')}
                  placeholder="e.g., Continued to next week"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                />
              </div>
            </div>

            <div className="mt-4">
              <label htmlFor="comment" className="block text-sm font-medium text-gray-700 mb-1">
                Internal Comment (optional)
              </label>
              <textarea
                id="comment"
                {...register('comment')}
                rows={2}
                placeholder="Internal notes (not displayed on signage)"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
              />
            </div>
          </div>

          {/* Form Actions */}
          <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={handleCloseAttempt}
              className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleReset}
              disabled={!isDirty}
              className="px-4 py-2 text-gray-700 bg-amber-100 rounded-lg hover:bg-amber-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Reset
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="px-6 py-2 text-white bg-primary rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <span className="flex items-center">
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  {isEditing ? 'Saving...' : 'Creating...'}
                </span>
              ) : (
                isEditing ? 'Save Changes' : 'Create Entry'
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Unsaved Changes Dialog */}
      <UnsavedChangesDialog
        isOpen={showUnsavedDialog}
        onStay={handleStay}
        onLeave={handleLeave}
      />
    </div>
  );
}
