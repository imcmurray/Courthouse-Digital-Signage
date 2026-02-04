import { useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { docketApi, DocketEntry, CreateDocketEntryInput, UpdateDocketEntryInput, DocketFilters } from '../api/docket';
import DocketForm from '../components/DocketForm';
import { getErrorMessage } from '../utils/errorHandling';

export default function Docket() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<DocketEntry | null>(null);
  const [deleteConfirmEntry, setDeleteConfirmEntry] = useState<DocketEntry | null>(null);
  const [isClearModalOpen, setIsClearModalOpen] = useState(false);
  const [clearDate, setClearDate] = useState('');
  const [archiveOnClear, setArchiveOnClear] = useState(false);
  const [clearCount, setClearCount] = useState<number | null>(null);

  // Import CSV state
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importPreview, setImportPreview] = useState<CreateDocketEntryInput[]>([]);
  const [importError, setImportError] = useState<string | null>(null);

  // Get filters from URL params
  const dateFilter = searchParams.get('date') || '';
  const courtroomFilter = searchParams.get('courtroom') || '';
  const statusFilter = searchParams.get('status') || '';
  const judgeFilter = searchParams.get('judge') || '';
  const pageParam = searchParams.get('page') || '1';
  const currentPage = Math.max(parseInt(pageParam, 10) || 1, 1);
  const pageSize = 10; // Default 10 entries per page
  const sortBy = searchParams.get('sortBy') || '';
  const sortOrder = (searchParams.get('sortOrder') as 'asc' | 'desc') || 'asc';

  // Update URL params when filters change
  const updateFilter = useCallback((key: string, value: string) => {
    const newParams = new URLSearchParams(searchParams);
    if (value) {
      newParams.set(key, value);
    } else {
      newParams.delete(key);
    }
    // Reset to page 1 when filters change
    if (key !== 'page') {
      newParams.delete('page');
    }
    setSearchParams(newParams, { replace: true });
  }, [searchParams, setSearchParams]);

  // Navigate to a specific page
  const goToPage = useCallback((page: number) => {
    updateFilter('page', page > 1 ? page.toString() : '');
  }, [updateFilter]);

  // Handle column header click for sorting
  const handleSort = useCallback((column: string) => {
    const newParams = new URLSearchParams(searchParams);
    if (sortBy === column) {
      // Toggle sort order
      newParams.set('sortOrder', sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      // New column, default to ascending
      newParams.set('sortBy', column);
      newParams.set('sortOrder', 'asc');
    }
    // Reset to page 1 when sorting changes
    newParams.delete('page');
    setSearchParams(newParams, { replace: true });
  }, [searchParams, setSearchParams, sortBy, sortOrder]);

  // Get sort indicator for column
  const getSortIndicator = (column: string) => {
    if (sortBy !== column) return null;
    return sortOrder === 'asc' ? ' ▲' : ' ▼';
  };

  // Build filters object for API
  const filters: DocketFilters = {
    page: currentPage,
    limit: pageSize
  };
  if (dateFilter) filters.date = dateFilter;
  if (courtroomFilter) filters.courtroom = courtroomFilter;
  if (statusFilter) filters.status = statusFilter;
  if (judgeFilter) filters.judge = judgeFilter;
  if (sortBy) filters.sortBy = sortBy;
  if (sortBy) filters.sortOrder = sortOrder;

  // Fetch docket entries with filters
  const { data, isLoading, error } = useQuery({
    queryKey: ['docket', filters],
    queryFn: () => docketApi.getAll(Object.keys(filters).length > 0 ? filters : undefined),
  });

  // Create entry mutation
  const createMutation = useMutation({
    mutationFn: docketApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['docket'] });
      toast.success('Docket entry created successfully');
      setIsFormOpen(false);
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error, 'Failed to create docket entry'));
    },
  });

  // Update entry mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateDocketEntryInput }) => docketApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['docket'] });
      toast.success('Docket entry updated successfully');
      setEditingEntry(null);
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error, 'Failed to update docket entry'));
    },
  });

  // Delete entry mutation
  const deleteMutation = useMutation({
    mutationFn: docketApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['docket'] });
      toast.success('Docket entry deleted successfully');
      setDeleteConfirmEntry(null);
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error, 'Failed to delete docket entry'));
    },
  });

  // Clear docket mutation
  const clearMutation = useMutation({
    mutationFn: ({ date, archive }: { date: string; archive: boolean }) =>
      docketApi.clearByDate(date, { archive }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['docket'] });
      toast.success(result.message);
      setIsClearModalOpen(false);
      setClearDate('');
      setArchiveOnClear(false);
      setClearCount(null);
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error, 'Failed to clear docket entries'));
    },
  });

  // Bulk import mutation
  const importMutation = useMutation({
    mutationFn: docketApi.bulkImport,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['docket'] });
      toast.success(result.message);
      setIsImportModalOpen(false);
      setImportPreview([]);
      setImportError(null);
    },
    onError: (error: unknown) => {
      const errorMsg = getErrorMessage(error, 'Failed to import docket entries');
      // Check if there are details in the response for import-specific errors
      const axiosError = error as { response?: { data?: { details?: string[] } } };
      const details = axiosError.response?.data?.details;
      if (details && details.length > 0) {
        setImportError(`${errorMsg}: ${details.join(', ')}`);
      } else {
        toast.error(errorMsg);
      }
    },
  });

  const handleCreate = (data: CreateDocketEntryInput) => {
    createMutation.mutate(data);
  };

  const handleUpdate = (data: UpdateDocketEntryInput) => {
    if (editingEntry) {
      updateMutation.mutate({ id: editingEntry.id, data });
    }
  };

  const handleDelete = () => {
    if (deleteConfirmEntry) {
      deleteMutation.mutate(deleteConfirmEntry.id);
    }
  };

  const handleClearDocket = () => {
    if (clearDate) {
      clearMutation.mutate({ date: clearDate, archive: archiveOnClear });
    }
  };

  const handleImportConfirm = () => {
    if (importPreview.length > 0) {
      importMutation.mutate(importPreview);
    }
  };

  // Parse CSV file
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setImportError(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const lines = text.split('\n').filter(line => line.trim());

        if (lines.length < 2) {
          setImportError('CSV file must have a header row and at least one data row');
          return;
        }

        // Parse header
        const headers = lines[0].split(',').map(h => h.trim());
        const requiredHeaders = ['caseNumber', 'caseTitle', 'caseChapter', 'hearingDate', 'hearingTime', 'hearingMatter', 'hearingJudge'];
        const missingHeaders = requiredHeaders.filter(h => !headers.includes(h));

        if (missingHeaders.length > 0) {
          setImportError(`Missing required columns: ${missingHeaders.join(', ')}`);
          return;
        }

        // Parse data rows
        const entries: CreateDocketEntryInput[] = [];
        for (let i = 1; i < lines.length; i++) {
          const values = parseCSVLine(lines[i]);
          if (values.length !== headers.length) {
            setImportError(`Row ${i + 1} has ${values.length} columns, expected ${headers.length}`);
            return;
          }

          const entry: Record<string, string | boolean | undefined> = {};
          headers.forEach((header, index) => {
            const value = values[index]?.trim();
            if (header === 'isZoom') {
              entry[header] = value === 'true' || value === '1' || value === 'yes';
            } else {
              entry[header] = value || undefined;
            }
          });

          entries.push(entry as unknown as CreateDocketEntryInput);
        }

        setImportPreview(entries);
      } catch (err) {
        setImportError('Failed to parse CSV file');
      }
    };
    reader.readAsText(file);
    // Reset the input so the same file can be uploaded again
    event.target.value = '';
  };

  // Parse a CSV line handling quoted values
  const parseCSVLine = (line: string): string[] => {
    const values: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current);
    return values;
  };

  const downloadTemplate = () => {
    const token = localStorage.getItem('auth_token');
    window.open(`http://localhost:3000/api/docket/template?token=${token}`, '_blank');
  };

  // Open clear modal and precompute count
  const openClearModal = () => {
    // Set default to today if no date filter
    const defaultDate = dateFilter || new Date().toISOString().split('T')[0];
    setClearDate(defaultDate);
    setArchiveOnClear(false);
    setIsClearModalOpen(true);
    // Count will be shown based on entries in current filter
    if (data?.entries) {
      // Filter entries matching the date
      const matchingEntries = data.entries.filter(e => {
        const entryDate = new Date(e.hearingDate).toISOString().split('T')[0];
        return entryDate === defaultDate;
      });
      setClearCount(matchingEntries.length);
    } else {
      setClearCount(0);
    }
  };

  // Update count when date changes in clear modal
  const handleClearDateChange = (newDate: string) => {
    setClearDate(newDate);
    if (data?.entries) {
      const matchingEntries = data.entries.filter(e => {
        const entryDate = new Date(e.hearingDate).toISOString().split('T')[0];
        return entryDate === newDate;
      });
      setClearCount(matchingEntries.length);
    } else {
      setClearCount(0);
    }
  };

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case 'scheduled':
        return 'bg-blue-100 text-blue-800';
      case 'in_progress':
        return 'bg-yellow-100 text-yellow-800';
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'cancelled':
        return 'bg-red-100 text-red-800';
      case 'continued':
        return 'bg-purple-100 text-purple-800';
      case 'stricken':
        return 'bg-gray-100 text-gray-800 line-through';
      case 'reserved':
        return 'bg-orange-100 text-orange-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  const formatTime = (timeString: string) => {
    const [hours, minutes] = timeString.split(':');
    const hour = parseInt(hours, 10);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    return `${hour12}:${minutes} ${ampm}`;
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
        Failed to load docket entries. Please try again.
      </div>
    );
  }

  const entries = data?.entries || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Docket Management</h1>
          <p className="mt-1 text-sm text-gray-600">
            Manage hearing calendar entries for court displays.
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={() => setIsImportModalOpen(true)}
            className="flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
          >
            <svg className="h-5 w-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            Import CSV
          </button>
          <button
            onClick={openClearModal}
            className="flex items-center px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
          >
            <svg className="h-5 w-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            Clear Docket
          </button>
          <button
            onClick={() => setIsFormOpen(true)}
            className="flex items-center px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
          >
            <svg className="h-5 w-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            Add Entry
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white shadow-sm rounded-lg p-4">
        <div className="flex flex-wrap gap-4 items-end">
          {/* Date Filter */}
          <div>
            <label htmlFor="date-filter" className="block text-sm font-medium text-gray-700 mb-1">
              Hearing Date
            </label>
            <input
              type="date"
              id="date-filter"
              value={dateFilter}
              onChange={(e) => updateFilter('date', e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
            />
          </div>

          {/* Status Filter */}
          <div>
            <label htmlFor="status-filter" className="block text-sm font-medium text-gray-700 mb-1">
              Status
            </label>
            <select
              id="status-filter"
              value={statusFilter}
              onChange={(e) => updateFilter('status', e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
            >
              <option value="">All Statuses</option>
              <option value="scheduled">Scheduled</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
              <option value="continued">Continued</option>
              <option value="stricken">Stricken</option>
              <option value="reserved">Reserved</option>
            </select>
          </div>

          {/* Courtroom Filter */}
          <div>
            <label htmlFor="courtroom-filter" className="block text-sm font-medium text-gray-700 mb-1">
              Courtroom
            </label>
            <input
              type="text"
              id="courtroom-filter"
              value={courtroomFilter}
              onChange={(e) => updateFilter('courtroom', e.target.value)}
              placeholder="e.g., 321"
              className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary w-32"
            />
          </div>

          {/* Clear Filters Button */}
          {(dateFilter || statusFilter || courtroomFilter || judgeFilter) && (
            <button
              onClick={() => setSearchParams({})}
              className="px-3 py-2 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
            >
              Clear Filters
            </button>
          )}

          {/* Filter Status Indicator */}
          {(dateFilter || statusFilter || courtroomFilter) && (
            <div className="text-sm text-gray-500 ml-auto">
              Showing {entries.length} filtered {entries.length === 1 ? 'entry' : 'entries'}
            </div>
          )}
        </div>
      </div>

      {/* Docket Table */}
      <div className="bg-white shadow-sm rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                  onClick={() => handleSort('hearingTime')}
                >
                  Time{getSortIndicator('hearingTime')}
                </th>
                <th
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                  onClick={() => handleSort('caseNumber')}
                >
                  Case{getSortIndicator('caseNumber')}
                </th>
                <th
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                  onClick={() => handleSort('caseTitle')}
                >
                  Party{getSortIndicator('caseTitle')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Matter
                </th>
                <th
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                  onClick={() => handleSort('status')}
                >
                  Status{getSortIndicator('status')}
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {entries.map((entry) => (
                <tr key={entry.id} className={entry.status === 'stricken' ? 'bg-gray-50' : ''}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">
                      {formatTime(entry.hearingTime)}
                    </div>
                    <div className="text-xs text-gray-500">
                      {formatDate(entry.hearingDate)}
                    </div>
                    {entry.isZoom && (
                      <span className="inline-flex items-center px-2 py-0.5 mt-1 rounded text-xs font-medium bg-blue-100 text-blue-800">
                        <svg className="w-3 h-3 mr-1" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M4 4h10v10H4zM14 8h6l-6 6z" />
                        </svg>
                        Zoom
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">
                      {entry.caseNumber}
                    </div>
                    <div className="text-xs text-gray-500">
                      Ch. {entry.caseChapter} | {entry.courtroom || 'TBD'}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className={`text-sm ${entry.status === 'stricken' ? 'line-through text-gray-400' : 'text-gray-900'}`}>
                      {entry.caseTitle}
                    </div>
                    {entry.adversaryNumber && (
                      <div className="text-xs text-gray-500">
                        Adv: {entry.adversaryNumber}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <div className={`text-sm max-w-xs truncate ${entry.status === 'stricken' ? 'line-through text-gray-400' : 'text-gray-700'}`}>
                      {entry.hearingMatter}
                    </div>
                    <div className="text-xs text-gray-500">
                      {entry.hearingJudge}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full capitalize ${getStatusBadgeColor(
                        entry.status
                      )}`}
                    >
                      {entry.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button
                      onClick={() => setEditingEntry(entry)}
                      className="text-primary hover:text-primary/80 mr-4"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => setDeleteConfirmEntry(entry)}
                      className="text-red-600 hover:text-red-800"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {entries.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            No docket entries found. Click "Add Entry" to create one.
          </div>
        )}

        {/* Pagination */}
        {data && data.totalPages > 1 && (
          <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
            <div className="text-sm text-gray-600">
              Showing {((currentPage - 1) * pageSize) + 1} to {Math.min(currentPage * pageSize, data.total)} of {data.total} entries
            </div>
            <div className="flex items-center space-x-2">
              {/* Previous button */}
              <button
                onClick={() => goToPage(currentPage - 1)}
                disabled={currentPage <= 1}
                className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>

              {/* Page numbers */}
              {Array.from({ length: data.totalPages }, (_, i) => i + 1)
                .filter(page => {
                  // Show first page, last page, current page, and pages around current
                  if (page === 1 || page === data.totalPages) return true;
                  if (Math.abs(page - currentPage) <= 1) return true;
                  return false;
                })
                .reduce((acc: (number | string)[], page, idx, arr) => {
                  // Add ellipsis between non-consecutive pages
                  if (idx > 0 && arr[idx - 1] !== page - 1) {
                    acc.push('...');
                  }
                  acc.push(page);
                  return acc;
                }, [])
                .map((item, idx) =>
                  typeof item === 'string' ? (
                    <span key={`ellipsis-${idx}`} className="px-2 text-gray-400">
                      {item}
                    </span>
                  ) : (
                    <button
                      key={item}
                      onClick={() => goToPage(item)}
                      className={`px-3 py-1 text-sm border rounded ${
                        currentPage === item
                          ? 'bg-primary text-white border-primary'
                          : 'border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      {item}
                    </button>
                  )
                )}

              {/* Next button */}
              <button
                onClick={() => goToPage(currentPage + 1)}
                disabled={currentPage >= data.totalPages}
                className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Create Entry Modal */}
      {isFormOpen && (
        <DocketForm
          onSubmit={handleCreate}
          onClose={() => setIsFormOpen(false)}
          isLoading={createMutation.isPending}
        />
      )}

      {/* Edit Entry Modal */}
      {editingEntry && (
        <DocketForm
          entry={editingEntry}
          onSubmit={handleUpdate}
          onClose={() => setEditingEntry(null)}
          isLoading={updateMutation.isPending}
        />
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmEntry && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900">Confirm Deletion</h3>
            <p className="mt-2 text-gray-600">
              Are you sure you want to delete the docket entry for{' '}
              <strong>{deleteConfirmEntry.caseTitle}</strong> (Case #{deleteConfirmEntry.caseNumber})?
            </p>
            <div className="mt-4 flex justify-end space-x-3">
              <button
                onClick={() => setDeleteConfirmEntry(null)}
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

      {/* Clear Docket Modal */}
      {isClearModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900">Clear Docket Entries</h3>
            <p className="mt-2 text-gray-600">
              Select the date to clear all docket entries for that day.
            </p>

            <div className="mt-4 space-y-4">
              {/* Date Selection */}
              <div>
                <label htmlFor="clear-date" className="block text-sm font-medium text-gray-700 mb-1">
                  Date to Clear
                </label>
                <input
                  type="date"
                  id="clear-date"
                  value={clearDate}
                  onChange={(e) => handleClearDateChange(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                />
              </div>

              {/* Archive Option */}
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="archive-option"
                  checked={archiveOnClear}
                  onChange={(e) => setArchiveOnClear(e.target.checked)}
                  className="h-4 w-4 text-primary border-gray-300 rounded focus:ring-primary"
                />
                <label htmlFor="archive-option" className="ml-2 block text-sm text-gray-700">
                  Archive entries instead of deleting
                </label>
              </div>

              {/* Count Display */}
              {clearCount !== null && (
                <div className={`p-3 rounded-lg ${clearCount > 0 ? 'bg-amber-50 text-amber-800' : 'bg-gray-50 text-gray-600'}`}>
                  <strong>{clearCount}</strong> {clearCount === 1 ? 'entry' : 'entries'} will be {archiveOnClear ? 'archived' : 'deleted'}
                </div>
              )}
            </div>

            <div className="mt-6 flex justify-end space-x-3">
              <button
                onClick={() => {
                  setIsClearModalOpen(false);
                  setClearDate('');
                  setArchiveOnClear(false);
                  setClearCount(null);
                }}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={handleClearDocket}
                disabled={clearMutation.isPending || !clearDate || clearCount === 0}
                className="px-4 py-2 text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {clearMutation.isPending ? 'Clearing...' : archiveOnClear ? 'Archive Entries' : 'Clear Entries'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import CSV Modal */}
      {isImportModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold text-gray-900">Import Docket Entries from CSV</h3>
            <p className="mt-2 text-gray-600">
              Upload a CSV file with docket entries. Download the template first to see the required format.
            </p>

            <div className="mt-4 space-y-4">
              {/* Download Template */}
              <div className="flex items-center space-x-4">
                <button
                  onClick={downloadTemplate}
                  className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  <svg className="h-5 w-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Download CSV Template
                </button>
                <span className="text-sm text-gray-500">
                  Required columns: caseNumber, caseTitle, caseChapter, hearingDate, hearingTime, hearingMatter, hearingJudge
                </span>
              </div>

              {/* File Upload */}
              <div>
                <label htmlFor="csv-file" className="block text-sm font-medium text-gray-700 mb-1">
                  Upload CSV File
                </label>
                <input
                  type="file"
                  id="csv-file"
                  accept=".csv"
                  onChange={handleFileUpload}
                  className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-white hover:file:bg-primary/90"
                />
              </div>

              {/* Error Message */}
              {importError && (
                <div className="p-3 bg-red-50 text-red-600 rounded-lg text-sm">
                  {importError}
                </div>
              )}

              {/* Preview Table */}
              {importPreview.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-gray-700 mb-2">
                    Preview ({importPreview.length} entries)
                  </h4>
                  <div className="overflow-x-auto border rounded-lg max-h-64">
                    <table className="min-w-full divide-y divide-gray-200 text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium text-gray-500">#</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-500">Case #</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-500">Title</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-500">Ch.</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-500">Date</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-500">Time</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-500">Judge</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {importPreview.map((entry, index) => (
                          <tr key={index}>
                            <td className="px-3 py-2 text-gray-500">{index + 1}</td>
                            <td className="px-3 py-2">{entry.caseNumber}</td>
                            <td className="px-3 py-2 max-w-xs truncate">{entry.caseTitle}</td>
                            <td className="px-3 py-2">{entry.caseChapter}</td>
                            <td className="px-3 py-2">{entry.hearingDate}</td>
                            <td className="px-3 py-2">{entry.hearingTime}</td>
                            <td className="px-3 py-2">{entry.hearingJudge}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-6 flex justify-end space-x-3">
              <button
                onClick={() => {
                  setIsImportModalOpen(false);
                  setImportPreview([]);
                  setImportError(null);
                }}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={handleImportConfirm}
                disabled={importMutation.isPending || importPreview.length === 0}
                className="px-4 py-2 text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {importMutation.isPending ? 'Importing...' : `Import ${importPreview.length} Entries`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
