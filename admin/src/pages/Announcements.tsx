import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import ModalPortal from '../components/ModalPortal';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensors,
  useSensor,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { announcementsApi, Announcement, CreateAnnouncementInput, UpdateAnnouncementInput, AnnouncementsResponse } from '../api/announcements';

// Check if an announcement is expired
const isExpired = (expiresAt: string | null): boolean => {
  if (!expiresAt) return false;
  return new Date(expiresAt) < new Date();
};

interface SortableRowProps {
  announcement: Announcement;
  position: number;
  onEdit: (announcement: Announcement) => void;
  onDelete: (announcement: Announcement) => void;
  onToggle: (id: string, enabled: boolean) => void;
  isToggling: boolean;
}

function SortableRow({ announcement, position, onEdit, onDelete, onToggle, isToggling }: SortableRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: announcement.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <tr
      ref={setNodeRef}
      style={style}
      className={`hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors ${!announcement.enabled ? 'bg-gray-50 dark:bg-gray-700' : ''}`}
    >
      {/* Drag handle */}
      <td className="px-2 py-4 w-8">
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          title="Drag to reorder"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <circle cx="5" cy="3" r="1.5" />
            <circle cx="11" cy="3" r="1.5" />
            <circle cx="5" cy="8" r="1.5" />
            <circle cx="11" cy="8" r="1.5" />
            <circle cx="5" cy="13" r="1.5" />
            <circle cx="11" cy="13" r="1.5" />
          </svg>
        </button>
      </td>
      {/* Position badge */}
      <td className="px-3 py-4 whitespace-nowrap">
        <span className="inline-flex items-center justify-center w-7 h-7 text-xs font-bold rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300">
          #{position}
        </span>
      </td>
      <td className="px-6 py-4">
        <button
          onClick={() => onEdit(announcement)}
          className="text-sm text-gray-900 dark:text-white max-w-md truncate text-left hover:text-primary dark:hover:text-primary-light transition-colors"
        >
          {announcement.text}
        </button>
        {announcement.createdBy && (
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Created by {announcement.createdBy.name}
          </div>
        )}
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        {isExpired(announcement.expiresAt) ? (
          <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300">
            Expired
          </span>
        ) : (
          <button
            onClick={() => onToggle(announcement.id, !announcement.enabled)}
            disabled={isToggling}
            className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full cursor-pointer transition-colors ${
              announcement.enabled
                ? 'bg-green-100 text-green-800 hover:bg-green-200 dark:bg-green-900/40 dark:text-green-300 dark:hover:bg-green-800/40'
                : 'bg-red-100 text-red-800 hover:bg-red-200 dark:bg-red-900/40 dark:text-red-300 dark:hover:bg-red-800/40'
            }`}
          >
            {announcement.enabled ? 'Active' : 'Disabled'}
          </button>
        )}
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
        {announcement.expiresAt
          ? new Date(announcement.expiresAt).toLocaleDateString()
          : 'Never'}
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
        <button
          onClick={() => onEdit(announcement)}
          className="text-primary dark:text-primary-light hover:text-primary/80 dark:hover:text-primary-light/80 mr-4"
        >
          Edit
        </button>
        <button
          onClick={() => onDelete(announcement)}
          className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
        >
          Delete
        </button>
      </td>
    </tr>
  );
}

export default function Announcements() {
  const queryClient = useQueryClient();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingAnnouncement, setEditingAnnouncement] = useState<Announcement | null>(null);
  const [deleteConfirmAnnouncement, setDeleteConfirmAnnouncement] = useState<Announcement | null>(null);

  // Form state
  const [formData, setFormData] = useState<CreateAnnouncementInput>({
    text: '',
    enabled: true,
    expiresAt: null,
  });

  // Drag sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor)
  );

  // Fetch announcements
  const { data, isLoading, error } = useQuery({
    queryKey: ['announcements'],
    queryFn: () => announcementsApi.getAll(),
  });

  // Create announcement mutation
  const createMutation = useMutation({
    mutationFn: announcementsApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['announcements'] });
      toast.success('Announcement created successfully');
      setIsFormOpen(false);
      resetForm();
    },
    onError: (error: { response?: { data?: { error?: string } } }) => {
      toast.error(error.response?.data?.error || 'Failed to create announcement');
    },
  });

  // Update announcement mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateAnnouncementInput }) => announcementsApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['announcements'] });
      toast.success('Announcement updated successfully');
      setEditingAnnouncement(null);
      resetForm();
    },
    onError: (error: { response?: { data?: { error?: string } } }) => {
      toast.error(error.response?.data?.error || 'Failed to update announcement');
    },
  });

  // Delete announcement mutation
  const deleteMutation = useMutation({
    mutationFn: announcementsApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['announcements'] });
      toast.success('Announcement deleted successfully');
      setDeleteConfirmAnnouncement(null);
    },
    onError: (error: { response?: { data?: { error?: string } } }) => {
      toast.error(error.response?.data?.error || 'Failed to delete announcement');
    },
  });

  // Toggle enabled mutation
  const toggleEnabledMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      announcementsApi.update(id, { enabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['announcements'] });
      toast.success('Announcement updated');
    },
    onError: (error: { response?: { data?: { error?: string } } }) => {
      toast.error(error.response?.data?.error || 'Failed to update announcement');
    },
  });

  // Reorder mutation
  const reorderMutation = useMutation({
    mutationFn: announcementsApi.reorder,
    onError: () => {
      queryClient.invalidateQueries({ queryKey: ['announcements'] });
      toast.error('Failed to save new order');
    },
  });

  const resetForm = () => {
    setFormData({
      text: '',
      enabled: true,
      expiresAt: null,
    });
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate(formData);
  };

  const handleUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingAnnouncement) {
      updateMutation.mutate({ id: editingAnnouncement.id, data: formData });
    }
  };

  const handleDelete = () => {
    if (deleteConfirmAnnouncement) {
      deleteMutation.mutate(deleteConfirmAnnouncement.id);
    }
  };

  const openEditModal = (announcement: Announcement) => {
    setEditingAnnouncement(announcement);
    setFormData({
      text: announcement.text,
      enabled: announcement.enabled,
      expiresAt: announcement.expiresAt,
    });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !announcements.length) return;

    const oldIndex = announcements.findIndex(a => a.id === active.id);
    const newIndex = announcements.findIndex(a => a.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(announcements, oldIndex, newIndex);
    const count = reordered.length;

    // Assign priorities: top = count (highest), bottom = 1 (lowest)
    const order = reordered.map((a, i) => ({
      id: a.id,
      priority: count - i,
    }));

    // Optimistic update
    const updatedAnnouncements = reordered.map((a, i) => ({
      ...a,
      priority: count - i,
    }));
    queryClient.setQueryData(['announcements'], (old: AnnouncementsResponse | undefined) => {
      if (!old) return old;
      return { ...old, announcements: updatedAnnouncements };
    });

    reorderMutation.mutate(order);
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
        Failed to load announcements. Please try again.
      </div>
    );
  }

  const announcements = data?.announcements || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Announcements</h1>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
            Manage announcements displayed on the digital signage ticker. Drag rows to reorder.
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
          Add Announcement
        </button>
      </div>

      {/* Announcements Table */}
      <div className="bg-white dark:bg-gray-800 shadow-sm dark:shadow-gray-900/50 rounded-lg overflow-hidden">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="px-2 py-3 w-8">
                  <span className="sr-only">Drag</span>
                </th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  #
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Announcement
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Expires
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <SortableContext items={announcements.map(a => a.id)} strategy={verticalListSortingStrategy}>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {announcements.map((announcement, index) => (
                  <SortableRow
                    key={announcement.id}
                    announcement={announcement}
                    position={index + 1}
                    onEdit={openEditModal}
                    onDelete={setDeleteConfirmAnnouncement}
                    onToggle={(id, enabled) => toggleEnabledMutation.mutate({ id, enabled })}
                    isToggling={toggleEnabledMutation.isPending}
                  />
                ))}
              </tbody>
            </SortableContext>
          </table>
        </DndContext>

        {announcements.length === 0 && (
          <div className="text-center py-12 text-gray-500 dark:text-gray-400">
            No announcements found. Click "Add Announcement" to create one.
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      {(isFormOpen || editingAnnouncement) && (
        <ModalPortal>
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-lg w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              {editingAnnouncement ? 'Edit Announcement' : 'Create Announcement'}
            </h3>
            <form onSubmit={editingAnnouncement ? handleUpdate : handleCreate} className="mt-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                  Announcement Text *
                </label>
                <textarea
                  value={formData.text}
                  onChange={(e) => setFormData({ ...formData, text: e.target.value })}
                  required
                  maxLength={500}
                  rows={3}
                  className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary focus:border-primary dark:bg-gray-700 dark:text-white ${
                    formData.text.length >= 500
                      ? 'border-red-500 dark:border-red-400'
                      : formData.text.length >= 450
                        ? 'border-yellow-500 dark:border-yellow-400'
                        : 'border-gray-300 dark:border-gray-600'
                  }`}
                  placeholder="Enter announcement text..."
                />
                <div className={`text-xs mt-1 flex justify-between ${
                  formData.text.length >= 500
                    ? 'text-red-600'
                    : formData.text.length >= 450
                      ? 'text-yellow-600'
                      : 'text-gray-500 dark:text-gray-400'
                }`}>
                  <span>Maximum 500 characters</span>
                  <span>{formData.text.length}/500</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                  Expires At
                </label>
                <input
                  type="date"
                  value={formData.expiresAt ? formData.expiresAt.split('T')[0] : ''}
                  onChange={(e) => setFormData({
                    ...formData,
                    expiresAt: e.target.value ? new Date(e.target.value).toISOString() : null
                  })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary dark:bg-gray-700 dark:text-white"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Leave empty for no expiration
                </p>
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="enabled"
                  checked={formData.enabled}
                  onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
                  className="h-4 w-4 text-primary focus:ring-primary border-gray-300 dark:border-gray-600 rounded"
                />
                <label htmlFor="enabled" className="ml-2 text-sm text-gray-700 dark:text-gray-200">
                  Enabled (show on displays)
                </label>
              </div>

              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setIsFormOpen(false);
                    setEditingAnnouncement(null);
                    resetForm();
                  }}
                  className="px-4 py-2 text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600"
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
                    : editingAnnouncement
                    ? 'Update'
                    : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
        </ModalPortal>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmAnnouncement && (
        <ModalPortal>
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Confirm Delete</h3>
            <p className="mt-2 text-gray-600 dark:text-gray-300">
              Are you sure you want to delete this announcement?
            </p>
            <div className="mt-2 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg text-sm text-gray-700 dark:text-gray-200 italic">
              "{deleteConfirmAnnouncement.text.length > 100
                ? deleteConfirmAnnouncement.text.substring(0, 100) + '...'
                : deleteConfirmAnnouncement.text}"
            </div>
            <p className="mt-2 text-sm text-red-600">
              This action cannot be undone.
            </p>
            <div className="mt-4 flex justify-end space-x-3">
              <button
                onClick={() => setDeleteConfirmAnnouncement(null)}
                className="px-4 py-2 text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600"
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
        </ModalPortal>
      )}
    </div>
  );
}
