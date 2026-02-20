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
import { idleContentCardsApi, IdleContentCard, CreateIdleContentCardInput, UpdateIdleContentCardInput, IdleContentCardsResponse } from '../api/idleContentCards';

const ICON_OPTIONS = [
  { value: '', label: 'None' },
  { value: 'phone', label: 'Phone' },
  { value: 'clock', label: 'Clock' },
  { value: 'gavel', label: 'Gavel' },
  { value: 'info', label: 'Info' },
  { value: 'location', label: 'Location' },
  { value: 'calendar', label: 'Calendar' },
  { value: 'shield', label: 'Shield' },
  { value: 'document', label: 'Document' },
];

const isExpired = (expiresAt: string | null): boolean => {
  if (!expiresAt) return false;
  return new Date(expiresAt) < new Date();
};

interface SortableRowProps {
  card: IdleContentCard;
  position: number;
  onEdit: (card: IdleContentCard) => void;
  onDelete: (card: IdleContentCard) => void;
  onToggle: (id: string, enabled: boolean) => void;
  isToggling: boolean;
}

function SortableRow({ card, position, onEdit, onDelete, onToggle, isToggling }: SortableRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: card.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <tr
      ref={setNodeRef}
      style={style}
      className={`hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors ${!card.enabled ? 'bg-gray-50 dark:bg-gray-700' : ''}`}
    >
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
      <td className="px-3 py-4 whitespace-nowrap">
        <span className="inline-flex items-center justify-center w-7 h-7 text-xs font-bold rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300">
          #{position}
        </span>
      </td>
      <td className="px-6 py-4">
        <button
          onClick={() => onEdit(card)}
          className="text-sm font-medium text-gray-900 dark:text-white text-left hover:text-primary dark:hover:text-primary-light transition-colors"
        >
          {card.title}
        </button>
        <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 max-w-xs truncate">
          {card.body}
        </div>
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        {card.icon ? (
          <span className="inline-flex px-2 py-1 text-xs font-medium rounded bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300">
            {card.icon}
          </span>
        ) : (
          <span className="text-xs text-gray-400">-</span>
        )}
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        {isExpired(card.expiresAt) ? (
          <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300">
            Expired
          </span>
        ) : (
          <button
            onClick={() => onToggle(card.id, !card.enabled)}
            disabled={isToggling}
            className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full cursor-pointer transition-colors ${
              card.enabled
                ? 'bg-green-100 text-green-800 hover:bg-green-200 dark:bg-green-900/40 dark:text-green-300 dark:hover:bg-green-800/40'
                : 'bg-red-100 text-red-800 hover:bg-red-200 dark:bg-red-900/40 dark:text-red-300 dark:hover:bg-red-800/40'
            }`}
          >
            {card.enabled ? 'Active' : 'Disabled'}
          </button>
        )}
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
        {card.expiresAt
          ? new Date(card.expiresAt).toLocaleDateString()
          : 'Never'}
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
        <button
          onClick={() => onEdit(card)}
          className="text-primary dark:text-primary-light hover:text-primary/80 dark:hover:text-primary-light/80 mr-4"
        >
          Edit
        </button>
        <button
          onClick={() => onDelete(card)}
          className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
        >
          Delete
        </button>
      </td>
    </tr>
  );
}

export default function IdleContentCards() {
  const queryClient = useQueryClient();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingCard, setEditingCard] = useState<IdleContentCard | null>(null);
  const [deleteConfirmCard, setDeleteConfirmCard] = useState<IdleContentCard | null>(null);

  const [formData, setFormData] = useState<CreateIdleContentCardInput>({
    title: '',
    body: '',
    icon: null,
    enabled: true,
    expiresAt: null,
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor)
  );

  const { data, isLoading, error } = useQuery({
    queryKey: ['idle-content-cards'],
    queryFn: () => idleContentCardsApi.getAll(),
  });

  const createMutation = useMutation({
    mutationFn: idleContentCardsApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['idle-content-cards'] });
      toast.success('Card created successfully');
      setIsFormOpen(false);
      resetForm();
    },
    onError: (error: { response?: { data?: { error?: string } } }) => {
      toast.error(error.response?.data?.error || 'Failed to create card');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateIdleContentCardInput }) => idleContentCardsApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['idle-content-cards'] });
      toast.success('Card updated successfully');
      setEditingCard(null);
      resetForm();
    },
    onError: (error: { response?: { data?: { error?: string } } }) => {
      toast.error(error.response?.data?.error || 'Failed to update card');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: idleContentCardsApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['idle-content-cards'] });
      toast.success('Card deleted successfully');
      setDeleteConfirmCard(null);
    },
    onError: (error: { response?: { data?: { error?: string } } }) => {
      toast.error(error.response?.data?.error || 'Failed to delete card');
    },
  });

  const toggleEnabledMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      idleContentCardsApi.update(id, { enabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['idle-content-cards'] });
      toast.success('Card updated');
    },
    onError: (error: { response?: { data?: { error?: string } } }) => {
      toast.error(error.response?.data?.error || 'Failed to update card');
    },
  });

  const reorderMutation = useMutation({
    mutationFn: idleContentCardsApi.reorder,
    onError: () => {
      queryClient.invalidateQueries({ queryKey: ['idle-content-cards'] });
      toast.error('Failed to save new order');
    },
  });

  const resetForm = () => {
    setFormData({ title: '', body: '', icon: null, enabled: true, expiresAt: null });
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate(formData);
  };

  const handleUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingCard) {
      updateMutation.mutate({ id: editingCard.id, data: formData });
    }
  };

  const handleDelete = () => {
    if (deleteConfirmCard) {
      deleteMutation.mutate(deleteConfirmCard.id);
    }
  };

  const openEditModal = (card: IdleContentCard) => {
    setEditingCard(card);
    setFormData({
      title: card.title,
      body: card.body,
      icon: card.icon,
      enabled: card.enabled,
      expiresAt: card.expiresAt,
    });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !cards.length) return;

    const oldIndex = cards.findIndex(c => c.id === active.id);
    const newIndex = cards.findIndex(c => c.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(cards, oldIndex, newIndex);

    const order = reordered.map((c, i) => ({
      id: c.id,
      sortOrder: i + 1,
    }));

    // Optimistic update
    const updatedCards = reordered.map((c, i) => ({ ...c, sortOrder: i + 1 }));
    queryClient.setQueryData(['idle-content-cards'], (old: IdleContentCardsResponse | undefined) => {
      if (!old) return old;
      return { ...old, cards: updatedCards };
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
        Failed to load idle content cards. Please try again.
      </div>
    );
  }

  const cards = data?.cards || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Idle Content Cards</h1>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
            Manage information slides shown on displays when no hearings are scheduled. Drag rows to reorder.
          </p>
        </div>
        <button
          onClick={() => { resetForm(); setIsFormOpen(true); }}
          className="flex items-center px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
        >
          <svg className="h-5 w-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
          Add Card
        </button>
      </div>

      {/* Cards Table */}
      <div className="bg-white dark:bg-gray-800 shadow-sm dark:shadow-gray-900/50 rounded-lg overflow-hidden">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="px-2 py-3 w-8"><span className="sr-only">Drag</span></th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">#</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Title / Body</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Icon</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Expires</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <SortableContext items={cards.map(c => c.id)} strategy={verticalListSortingStrategy}>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {cards.map((card, index) => (
                  <SortableRow
                    key={card.id}
                    card={card}
                    position={index + 1}
                    onEdit={openEditModal}
                    onDelete={setDeleteConfirmCard}
                    onToggle={(id, enabled) => toggleEnabledMutation.mutate({ id, enabled })}
                    isToggling={toggleEnabledMutation.isPending}
                  />
                ))}
              </tbody>
            </SortableContext>
          </table>
        </DndContext>

        {cards.length === 0 && (
          <div className="text-center py-12 text-gray-500 dark:text-gray-400">
            No idle content cards found. Click "Add Card" to create one.
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      {(isFormOpen || editingCard) && (
        <ModalPortal>
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-lg w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              {editingCard ? 'Edit Card' : 'Create Card'}
            </h3>
            <form onSubmit={editingCard ? handleUpdate : handleCreate} className="mt-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                  Title *
                </label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  required
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary dark:bg-gray-700 dark:text-white"
                  placeholder="e.g., Phone Policy"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                  Body *
                </label>
                <textarea
                  value={formData.body}
                  onChange={(e) => setFormData({ ...formData, body: e.target.value })}
                  required
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary dark:bg-gray-700 dark:text-white"
                  placeholder="Content displayed on the idle slide..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                  Icon
                </label>
                <select
                  value={formData.icon || ''}
                  onChange={(e) => setFormData({ ...formData, icon: e.target.value || null })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary dark:bg-gray-700 dark:text-white"
                >
                  {ICON_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
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
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Leave empty for no expiration</p>
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="card-enabled"
                  checked={formData.enabled}
                  onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
                  className="h-4 w-4 text-primary focus:ring-primary border-gray-300 dark:border-gray-600 rounded"
                />
                <label htmlFor="card-enabled" className="ml-2 text-sm text-gray-700 dark:text-gray-200">
                  Enabled (show on displays)
                </label>
              </div>

              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => { setIsFormOpen(false); setEditingCard(null); resetForm(); }}
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
                    : editingCard ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
        </ModalPortal>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmCard && (
        <ModalPortal>
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Confirm Delete</h3>
            <p className="mt-2 text-gray-600 dark:text-gray-300">
              Are you sure you want to delete this card?
            </p>
            <div className="mt-2 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg text-sm text-gray-700 dark:text-gray-200 font-medium">
              {deleteConfirmCard.title}
            </div>
            <p className="mt-2 text-sm text-red-600">This action cannot be undone.</p>
            <div className="mt-4 flex justify-end space-x-3">
              <button
                onClick={() => setDeleteConfirmCard(null)}
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
