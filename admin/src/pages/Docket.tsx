import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { docketApi, DocketEntry, CreateDocketEntryInput, UpdateDocketEntryInput } from '../api/docket';
import DocketForm from '../components/DocketForm';

export default function Docket() {
  const queryClient = useQueryClient();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<DocketEntry | null>(null);
  const [deleteConfirmEntry, setDeleteConfirmEntry] = useState<DocketEntry | null>(null);

  // Fetch docket entries
  const { data, isLoading, error } = useQuery({
    queryKey: ['docket'],
    queryFn: () => docketApi.getAll(),
  });

  // Create entry mutation
  const createMutation = useMutation({
    mutationFn: docketApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['docket'] });
      toast.success('Docket entry created successfully');
      setIsFormOpen(false);
    },
    onError: (error: { response?: { data?: { error?: string } } }) => {
      toast.error(error.response?.data?.error || 'Failed to create docket entry');
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
    onError: (error: { response?: { data?: { error?: string } } }) => {
      toast.error(error.response?.data?.error || 'Failed to update docket entry');
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
    onError: (error: { response?: { data?: { error?: string } } }) => {
      toast.error(error.response?.data?.error || 'Failed to delete docket entry');
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

      {/* Docket Table */}
      <div className="bg-white shadow-sm rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Time
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Case
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Party
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Matter
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
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
    </div>
  );
}
