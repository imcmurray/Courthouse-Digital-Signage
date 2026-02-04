import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { DocketEntry, CreateDocketEntryInput, UpdateDocketEntryInput } from '../api/docket';

const docketSchema = z.object({
  caseNumber: z.string().min(1, 'Case number is required'),
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

  // Format the date for the input (YYYY-MM-DD)
  const formatDateForInput = (dateString?: string) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toISOString().split('T')[0];
  };

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<DocketFormData>({
    resolver: zodResolver(docketSchema),
    defaultValues: {
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
    },
  });

  const isZoom = watch('isZoom');

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

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900">
            {isEditing ? 'Edit Docket Entry' : 'Add New Docket Entry'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
            type="button"
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
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Case Number <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  {...register('caseNumber')}
                  placeholder="e.g., 25-27186"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                />
                {errors.caseNumber && (
                  <p className="mt-1 text-sm text-red-600">{errors.caseNumber.message}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Case Title (Debtor Name) <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  {...register('caseTitle')}
                  placeholder="e.g., John Smith"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                />
                {errors.caseTitle && (
                  <p className="mt-1 text-sm text-red-600">{errors.caseTitle.message}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Chapter <span className="text-red-500">*</span>
                </label>
                <select
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
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Adversary Number (optional)
                </label>
                <input
                  type="text"
                  {...register('adversaryNumber')}
                  placeholder="e.g., 25-01234"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Adversary Title (optional)
                </label>
                <input
                  type="text"
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
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Hearing Date <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  {...register('hearingDate')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                />
                {errors.hearingDate && (
                  <p className="mt-1 text-sm text-red-600">{errors.hearingDate.message}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Hearing Time <span className="text-red-500">*</span>
                </label>
                <input
                  type="time"
                  {...register('hearingTime')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                />
                {errors.hearingTime && (
                  <p className="mt-1 text-sm text-red-600">{errors.hearingTime.message}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Judge <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  {...register('hearingJudge')}
                  placeholder="e.g., Judge Anderson"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                />
                {errors.hearingJudge && (
                  <p className="mt-1 text-sm text-red-600">{errors.hearingJudge.message}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Courtroom
                </label>
                <input
                  type="text"
                  {...register('courtroom')}
                  placeholder="e.g., 321"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                />
              </div>
            </div>

            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Matter Description <span className="text-red-500">*</span>
              </label>
              <textarea
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
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Moving Party
                </label>
                <input
                  type="text"
                  {...register('movingParty')}
                  placeholder="e.g., Bank of America"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Opposing Party
                </label>
                <input
                  type="text"
                  {...register('opposingParty')}
                  placeholder="e.g., Debtor"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Trustee
                </label>
                <input
                  type="text"
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Meeting ID
                  </label>
                  <input
                    type="text"
                    {...register('zoomMeetingId')}
                    placeholder="e.g., 123 456 7890"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Passcode
                  </label>
                  <input
                    type="text"
                    {...register('zoomPasscode')}
                    placeholder="e.g., abc123"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Dial-in Number
                  </label>
                  <input
                    type="text"
                    {...register('zoomPhone')}
                    placeholder="e.g., +1 (123) 456-7890"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Status Section */}
          <div>
            <h3 className="text-lg font-medium text-gray-900 mb-4">Status</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Status
                </label>
                <select
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
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Status Note (optional)
                </label>
                <input
                  type="text"
                  {...register('statusNote')}
                  placeholder="e.g., Continued to next week"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                />
              </div>
            </div>

            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Internal Comment (optional)
              </label>
              <textarea
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
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Cancel
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
    </div>
  );
}
