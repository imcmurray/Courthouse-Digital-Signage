import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
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
import { contentCardsApi, ContentCard, CreateContentCardInput, UpdateContentCardInput, CreateEmergencyCardInput, ContentCardsResponse } from '../api/contentCards';
import { displaysApi } from '../api/displays';

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
  { value: 'warning', label: 'Warning' },
];

const EMERGENCY_LEVELS = [
  { value: 1, label: 'Section Override', description: 'Replaces a single component' },
  { value: 2, label: 'Content Area', description: 'Replaces entire content area' },
  { value: 3, label: 'Full Screen', description: 'Full screen takeover' },
];

const EMERGENCY_TARGETS = [
  { value: 'hearing-table', label: 'Hearing Table' },
  { value: 'hearing-pills', label: 'Schedule Pills' },
  { value: 'direction-cards', label: 'Wayfinding Directions' },
  { value: 'camera-grid', label: 'Camera Grid' },
  { value: 'system-status', label: 'System Status' },
];

const isExpired = (expiresAt: string | null): boolean => {
  if (!expiresAt) return false;
  return new Date(expiresAt) < new Date();
};

interface SortableRowProps {
  card: ContentCard;
  position: number;
  onEdit: (card: ContentCard) => void;
  onDelete: (card: ContentCard) => void;
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

  const isSystem = card.type !== 'info';

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
        {isSystem && (
          <span className="ml-2 inline-flex px-1.5 py-0.5 text-[10px] font-medium rounded bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300">
            System
          </span>
        )}
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
      <td className="px-6 py-4 whitespace-nowrap">
        <div className="flex flex-wrap gap-1">
          {!card.displays || card.displays.length === 0 ? (
            <span className="inline-flex px-1.5 py-0.5 text-[10px] font-medium rounded bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300">
              All Displays
            </span>
          ) : (
            card.displays.map((d) => (
              <span key={d.displayId} className="inline-flex px-1.5 py-0.5 text-[10px] font-medium rounded bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300">
                {d.display.name}
              </span>
            ))
          )}
        </div>
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
        {!isSystem && (
          <button
            onClick={() => onDelete(card)}
            className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
          >
            Delete
          </button>
        )}
      </td>
    </tr>
  );
}

// =============================================
// Emergency Cards Tab
// =============================================

function EmergencyCardsTab() {
  const queryClient = useQueryClient();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingCard, setEditingCard] = useState<ContentCard | null>(null);
  const [deleteConfirmCard, setDeleteConfirmCard] = useState<ContentCard | null>(null);
  const [activateConfirmCard, setActivateConfirmCard] = useState<ContentCard | null>(null);
  const [deactivateConfirmCard, setDeactivateConfirmCard] = useState<ContentCard | null>(null);

  const [formData, setFormData] = useState<CreateEmergencyCardInput>({
    title: '',
    body: '',
    icon: 'warning',
    emergencyLevel: 3,
    emergencyTarget: null,
    sortOrder: 0,
    enabled: false,
    expiresAt: null,
    displayIds: [],
  });
  const [showOnAllDisplays, setShowOnAllDisplays] = useState(true);

  const { data, isLoading, error } = useQuery({
    queryKey: ['content-cards', 'emergency'],
    queryFn: () => contentCardsApi.getAll(false, true),
  });

  const { data: displaysData } = useQuery({
    queryKey: ['displays'],
    queryFn: () => displaysApi.getAll(),
  });
  const displays = displaysData?.displays || [];

  const createMutation = useMutation({
    mutationFn: contentCardsApi.createEmergency,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['content-cards'] });
      toast.success('Emergency card created');
      setIsFormOpen(false);
      resetForm();
    },
    onError: (error: { response?: { data?: { error?: string } } }) => {
      toast.error(error.response?.data?.error || 'Failed to create emergency card');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateContentCardInput }) => contentCardsApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['content-cards'] });
      toast.success('Emergency card updated');
      setEditingCard(null);
      resetForm();
    },
    onError: (error: { response?: { data?: { error?: string } } }) => {
      toast.error(error.response?.data?.error || 'Failed to update card');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: contentCardsApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['content-cards'] });
      toast.success('Emergency card deleted');
      setDeleteConfirmCard(null);
    },
    onError: (error: { response?: { data?: { error?: string } } }) => {
      toast.error(error.response?.data?.error || 'Failed to delete card');
    },
  });

  const activateMutation = useMutation({
    mutationFn: contentCardsApi.activate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['content-cards'] });
      toast.success('Emergency activated! Displays will update immediately.');
      setActivateConfirmCard(null);
    },
    onError: (error: { response?: { data?: { error?: string } } }) => {
      toast.error(error.response?.data?.error || 'Failed to activate emergency');
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: contentCardsApi.deactivate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['content-cards'] });
      toast.success('Emergency deactivated. Normal content restored.');
      setDeactivateConfirmCard(null);
    },
    onError: (error: { response?: { data?: { error?: string } } }) => {
      toast.error(error.response?.data?.error || 'Failed to deactivate emergency');
    },
  });

  const resetForm = () => {
    setFormData({
      title: '',
      body: '',
      icon: 'warning',
      emergencyLevel: 3,
      emergencyTarget: null,
      sortOrder: 0,
      enabled: false,
      expiresAt: null,
      displayIds: [],
    });
    setShowOnAllDisplays(true);
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({
      ...formData,
      displayIds: showOnAllDisplays ? [] : formData.displayIds,
    });
  };

  const handleUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingCard) {
      updateMutation.mutate({
        id: editingCard.id,
        data: {
          title: formData.title,
          body: formData.body,
          icon: formData.icon,
          expiresAt: formData.expiresAt,
          displayIds: showOnAllDisplays ? [] : formData.displayIds,
        },
      });
    }
  };

  const openEditModal = (card: ContentCard) => {
    setEditingCard(card);
    const isAllDisplays = !card.displays || card.displays.length === 0;
    setShowOnAllDisplays(isAllDisplays);
    setFormData({
      title: card.title,
      body: card.body,
      icon: card.icon,
      emergencyLevel: (card.emergencyLevel || 3) as 1 | 2 | 3,
      emergencyTarget: card.emergencyTarget,
      sortOrder: card.sortOrder,
      enabled: card.enabled,
      expiresAt: card.expiresAt,
      displayIds: isAllDisplays ? [] : card.displays!.map(d => d.displayId),
    });
  };

  const getLevelBadge = (level: number | null) => {
    switch (level) {
      case 1: return <span className="inline-flex px-2 py-0.5 text-xs font-semibold rounded bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300">Section</span>;
      case 2: return <span className="inline-flex px-2 py-0.5 text-xs font-semibold rounded bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300">Content Area</span>;
      case 3: return <span className="inline-flex px-2 py-0.5 text-xs font-semibold rounded bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300">Full Screen</span>;
      default: return null;
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
      <div className="bg-red-50 dark:bg-red-900/30 text-red-600 p-4 rounded-lg">
        Failed to load emergency cards. Please try again.
      </div>
    );
  }

  const cards = data?.cards || [];
  const activeCards = cards.filter(c => c.enabled && c.activatedAt);
  const standbyCards = cards.filter(c => !c.enabled || !c.activatedAt);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Emergency cards override display content at various severity levels. Create cards on standby, then activate when needed.
          </p>
        </div>
        <button
          onClick={() => { resetForm(); setIsFormOpen(true); }}
          className="flex items-center px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
        >
          <svg className="h-5 w-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
          New Emergency Card
        </button>
      </div>

      {/* Emergency Cards */}
      <div className="bg-white dark:bg-gray-800 shadow-sm dark:shadow-gray-900/50 rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-700">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Title / Body</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Level</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Displays</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
            {activeCards.map((card) => (
              <tr key={card.id} className="bg-red-50/50 dark:bg-red-900/10 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                <td className="px-6 py-4">
                  <button onClick={() => openEditModal(card)} className="text-sm font-medium text-gray-900 dark:text-white text-left hover:text-primary dark:hover:text-primary-light transition-colors">
                    {card.title}
                  </button>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 max-w-sm truncate">
                    {card.body}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {getLevelBadge(card.emergencyLevel)}
                  {card.emergencyLevel === 1 && card.emergencyTarget && (
                    <div className="text-xs text-gray-400 mt-1">{card.emergencyTarget}</div>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300 animate-pulse">
                    Active
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex flex-wrap gap-1">
                    {!card.displays || card.displays.length === 0 ? (
                      <span className="inline-flex px-1.5 py-0.5 text-[10px] font-medium rounded bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300">
                        All Displays
                      </span>
                    ) : (
                      card.displays.map((d) => (
                        <span key={d.displayId} className="inline-flex px-1.5 py-0.5 text-[10px] font-medium rounded bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300">
                          {d.display.name}
                        </span>
                      ))
                    )}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                  <button
                    onClick={() => setDeactivateConfirmCard(card)}
                    className="px-3 py-1 text-xs font-semibold text-white bg-red-600 rounded hover:bg-red-700 transition-colors"
                  >
                    Deactivate
                  </button>
                  <button
                    onClick={() => openEditModal(card)}
                    className="text-primary dark:text-primary-light hover:text-primary/80 dark:hover:text-primary-light/80"
                  >
                    Edit
                  </button>
                </td>
              </tr>
            ))}
            {standbyCards.map((card) => (
              <tr key={card.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                <td className="px-6 py-4">
                  <button onClick={() => openEditModal(card)} className="text-sm font-medium text-gray-900 dark:text-white text-left hover:text-primary dark:hover:text-primary-light transition-colors">
                    {card.title}
                  </button>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 max-w-sm truncate">
                    {card.body}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {getLevelBadge(card.emergencyLevel)}
                  {card.emergencyLevel === 1 && card.emergencyTarget && (
                    <div className="text-xs text-gray-400 mt-1">{card.emergencyTarget}</div>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400">
                    Standby
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex flex-wrap gap-1">
                    {!card.displays || card.displays.length === 0 ? (
                      <span className="inline-flex px-1.5 py-0.5 text-[10px] font-medium rounded bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300">
                        All Displays
                      </span>
                    ) : (
                      card.displays.map((d) => (
                        <span key={d.displayId} className="inline-flex px-1.5 py-0.5 text-[10px] font-medium rounded bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300">
                          {d.display.name}
                        </span>
                      ))
                    )}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                  <button
                    onClick={() => setActivateConfirmCard(card)}
                    className="px-3 py-1 text-xs font-semibold text-white bg-red-600 rounded hover:bg-red-700 transition-colors"
                  >
                    Activate
                  </button>
                  <button
                    onClick={() => openEditModal(card)}
                    className="text-primary dark:text-primary-light hover:text-primary/80 dark:hover:text-primary-light/80"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => setDeleteConfirmCard(card)}
                    className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {cards.length === 0 && (
          <div className="text-center py-12 text-gray-500 dark:text-gray-400">
            No emergency cards created yet. Create one to have it ready for activation.
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      {(isFormOpen || editingCard) && (
        <ModalPortal>
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              {editingCard ? 'Edit Emergency Card' : 'Create Emergency Card'}
            </h3>
            <form onSubmit={editingCard ? handleUpdate : handleCreate} className="mt-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Title *</label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  required
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 dark:bg-gray-700 dark:text-white"
                  placeholder="e.g., BUILDING EVACUATION"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Body *</label>
                <textarea
                  value={formData.body}
                  onChange={(e) => setFormData({ ...formData, body: e.target.value })}
                  required
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 dark:bg-gray-700 dark:text-white"
                  placeholder="Emergency message to display..."
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Supports **bold**, *italic*, line breaks, and bullet lists
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Icon</label>
                <select
                  value={formData.icon || ''}
                  onChange={(e) => setFormData({ ...formData, icon: e.target.value || null })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 dark:bg-gray-700 dark:text-white"
                >
                  {ICON_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              {!editingCard && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Emergency Level *</label>
                    <select
                      value={formData.emergencyLevel}
                      onChange={(e) => setFormData({ ...formData, emergencyLevel: parseInt(e.target.value) as 1 | 2 | 3 })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 dark:bg-gray-700 dark:text-white"
                    >
                      {EMERGENCY_LEVELS.map(level => (
                        <option key={level.value} value={level.value}>
                          Level {level.value}: {level.label} - {level.description}
                        </option>
                      ))}
                    </select>
                  </div>

                  {formData.emergencyLevel === 1 && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Target Component *</label>
                      <select
                        value={formData.emergencyTarget || ''}
                        onChange={(e) => setFormData({ ...formData, emergencyTarget: e.target.value || null })}
                        required
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 dark:bg-gray-700 dark:text-white"
                      >
                        <option value="">Select component to replace...</option>
                        {EMERGENCY_TARGETS.map(t => (
                          <option key={t.value} value={t.value}>{t.label}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Expires At</label>
                <input
                  type="datetime-local"
                  value={formData.expiresAt ? formData.expiresAt.slice(0, 16) : ''}
                  onChange={(e) => setFormData({
                    ...formData,
                    expiresAt: e.target.value ? new Date(e.target.value).toISOString() : null
                  })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 dark:bg-gray-700 dark:text-white"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Leave empty for manual deactivation only</p>
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="emergency-showOnAllDisplays"
                  checked={showOnAllDisplays}
                  onChange={(e) => {
                    setShowOnAllDisplays(e.target.checked);
                    if (e.target.checked) setFormData({ ...formData, displayIds: [] });
                  }}
                  className="h-4 w-4 text-red-600 focus:ring-red-500 border-gray-300 dark:border-gray-600 rounded"
                />
                <label htmlFor="emergency-showOnAllDisplays" className="ml-2 text-sm text-gray-700 dark:text-gray-200">
                  Target all displays
                </label>
              </div>

              {!showOnAllDisplays && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
                    Select Displays
                  </label>
                  <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg p-3">
                    {displays.length === 0 ? (
                      <p className="text-sm text-gray-500 dark:text-gray-400 col-span-2">No displays available</p>
                    ) : (
                      displays.map((display) => (
                        <label key={display.id} className="flex items-center space-x-2 p-2 hover:bg-gray-50 dark:hover:bg-gray-700 rounded cursor-pointer">
                          <input
                            type="checkbox"
                            checked={formData.displayIds?.includes(display.id) || false}
                            onChange={(e) => {
                              const currentIds = formData.displayIds || [];
                              if (e.target.checked) {
                                setFormData({ ...formData, displayIds: [...currentIds, display.id] });
                              } else {
                                setFormData({ ...formData, displayIds: currentIds.filter(id => id !== display.id) });
                              }
                            }}
                            className="h-4 w-4 text-red-600 focus:ring-red-500 border-gray-300 dark:border-gray-600 rounded"
                          />
                          <span className="text-sm text-gray-700 dark:text-gray-200 truncate">{display.name}</span>
                        </label>
                      ))
                    )}
                  </div>
                </div>
              )}

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
                  className="px-4 py-2 text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50"
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

      {/* Activate Confirmation Modal */}
      {activateConfirmCard && (
        <ModalPortal>
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-red-600 dark:text-red-400">Activate Emergency</h3>
            <p className="mt-2 text-gray-600 dark:text-gray-300">
              This will immediately override display content with the emergency message.
            </p>
            <div className="mt-3 p-3 bg-red-50 dark:bg-red-900/30 rounded-lg border border-red-200 dark:border-red-800">
              <div className="flex items-center gap-2 mb-1">
                {getLevelBadge(activateConfirmCard.emergencyLevel)}
                <span className="text-sm font-bold text-gray-900 dark:text-white">{activateConfirmCard.title}</span>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-300 truncate">{activateConfirmCard.body}</p>
            </div>
            <div className="mt-4 flex justify-end space-x-3">
              <button
                onClick={() => setActivateConfirmCard(null)}
                className="px-4 py-2 text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600"
              >
                Cancel
              </button>
              <button
                onClick={() => activateMutation.mutate(activateConfirmCard.id)}
                disabled={activateMutation.isPending}
                className="px-4 py-2 text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 font-semibold"
              >
                {activateMutation.isPending ? 'Activating...' : 'Activate Emergency'}
              </button>
            </div>
          </div>
        </div>
        </ModalPortal>
      )}

      {/* Deactivate Confirmation Modal */}
      {deactivateConfirmCard && (
        <ModalPortal>
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Deactivate Emergency</h3>
            <p className="mt-2 text-gray-600 dark:text-gray-300">
              Normal display content will be restored immediately.
            </p>
            <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-200">
              {deactivateConfirmCard.title}
            </div>
            <div className="mt-4 flex justify-end space-x-3">
              <button
                onClick={() => setDeactivateConfirmCard(null)}
                className="px-4 py-2 text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600"
              >
                Cancel
              </button>
              <button
                onClick={() => deactivateMutation.mutate(deactivateConfirmCard.id)}
                disabled={deactivateMutation.isPending}
                className="px-4 py-2 text-white bg-primary rounded-lg hover:bg-primary/90 disabled:opacity-50"
              >
                {deactivateMutation.isPending ? 'Deactivating...' : 'Deactivate'}
              </button>
            </div>
          </div>
        </div>
        </ModalPortal>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmCard && (
        <ModalPortal>
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Delete Emergency Card</h3>
            <p className="mt-2 text-gray-600 dark:text-gray-300">
              Are you sure you want to delete this emergency card?
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
                onClick={() => deleteMutation.mutate(deleteConfirmCard.id)}
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

// =============================================
// Main Page Component with Tabs
// =============================================

export default function ContentCards() {
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<'content' | 'emergency'>(
    searchParams.get('tab') === 'emergency' ? 'emergency' : 'content'
  );
  const queryClient = useQueryClient();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingCard, setEditingCard] = useState<ContentCard | null>(null);
  const [deleteConfirmCard, setDeleteConfirmCard] = useState<ContentCard | null>(null);

  const [formData, setFormData] = useState<CreateContentCardInput>({
    title: '',
    body: '',
    icon: null,
    enabled: true,
    expiresAt: null,
    displayIds: [],
  });
  const [showOnAllDisplays, setShowOnAllDisplays] = useState(true);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor)
  );

  const { data, isLoading, error } = useQuery({
    queryKey: ['content-cards', 'regular'],
    queryFn: () => contentCardsApi.getAll(false, false),
  });

  const { data: displaysData } = useQuery({
    queryKey: ['displays'],
    queryFn: () => displaysApi.getAll(),
  });
  const displays = displaysData?.displays || [];

  const createMutation = useMutation({
    mutationFn: contentCardsApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['content-cards'] });
      toast.success('Card created successfully');
      setIsFormOpen(false);
      resetForm();
    },
    onError: (error: { response?: { data?: { error?: string } } }) => {
      toast.error(error.response?.data?.error || 'Failed to create card');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateContentCardInput }) => contentCardsApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['content-cards'] });
      toast.success('Card updated successfully');
      setEditingCard(null);
      resetForm();
    },
    onError: (error: { response?: { data?: { error?: string } } }) => {
      toast.error(error.response?.data?.error || 'Failed to update card');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: contentCardsApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['content-cards'] });
      toast.success('Card deleted successfully');
      setDeleteConfirmCard(null);
    },
    onError: (error: { response?: { data?: { error?: string } } }) => {
      toast.error(error.response?.data?.error || 'Failed to delete card');
    },
  });

  const toggleEnabledMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      contentCardsApi.update(id, { enabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['content-cards'] });
      toast.success('Card updated');
    },
    onError: (error: { response?: { data?: { error?: string } } }) => {
      toast.error(error.response?.data?.error || 'Failed to update card');
    },
  });

  const reorderMutation = useMutation({
    mutationFn: contentCardsApi.reorder,
    onError: () => {
      queryClient.invalidateQueries({ queryKey: ['content-cards'] });
      toast.error('Failed to save new order');
    },
  });

  const resetForm = () => {
    setFormData({ title: '', body: '', icon: null, enabled: true, expiresAt: null, displayIds: [] });
    setShowOnAllDisplays(true);
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({
      ...formData,
      displayIds: showOnAllDisplays ? [] : formData.displayIds,
    });
  };

  const handleUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingCard) {
      updateMutation.mutate({
        id: editingCard.id,
        data: {
          ...formData,
          displayIds: showOnAllDisplays ? [] : formData.displayIds,
        },
      });
    }
  };

  const handleDelete = () => {
    if (deleteConfirmCard) {
      deleteMutation.mutate(deleteConfirmCard.id);
    }
  };

  const openEditModal = (card: ContentCard) => {
    setEditingCard(card);
    const isAllDisplays = !card.displays || card.displays.length === 0;
    setShowOnAllDisplays(isAllDisplays);
    setFormData({
      title: card.title,
      body: card.body,
      icon: card.icon,
      enabled: card.enabled,
      expiresAt: card.expiresAt,
      displayIds: isAllDisplays ? [] : card.displays!.map(d => d.displayId),
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
    queryClient.setQueryData(['content-cards', 'regular'], (old: ContentCardsResponse | undefined) => {
      if (!old) return old;
      return { ...old, cards: updatedCards };
    });

    reorderMutation.mutate(order);
  };

  const cards = data?.cards || [];
  const isSystemEdit = editingCard != null && editingCard.type !== 'info';

  // Active emergencies (polled every 10s)
  const { data: activeEmergencies } = useQuery<ContentCardsResponse>({
    queryKey: ['contentCardsActiveEmergencies'],
    queryFn: () => contentCardsApi.getAll(true, true),
    refetchInterval: 10000,
  });

  const [deactivatingCard, setDeactivatingCard] = useState<ContentCard | null>(null);
  const bannerDeactivateMutation = useMutation({
    mutationFn: contentCardsApi.deactivate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['content-cards'] });
      queryClient.invalidateQueries({ queryKey: ['contentCardsActiveEmergencies'] });
      queryClient.invalidateQueries({ queryKey: ['layoutActiveEmergencies'] });
      toast.success('Emergency deactivated. Normal content restored.');
      setDeactivatingCard(null);
    },
    onError: (error: { response?: { data?: { error?: string } } }) => {
      toast.error(error.response?.data?.error || 'Failed to deactivate emergency');
    },
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Content Cards</h1>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
          Manage content slides and emergency messages for displays.
        </p>
      </div>

      {/* Emergency Alert Banner */}
      {activeEmergencies?.cards && activeEmergencies.cards.filter(c => c.activatedAt).length > 0 && (
        <div className="space-y-3">
          {activeEmergencies.cards.filter(c => c.activatedAt).map((card) => {
            const levelName = card.emergencyLevel === 3 ? 'Full Screen' : card.emergencyLevel === 2 ? 'Content Area' : 'Section Override';
            return (
              <div key={card.id} className="bg-red-50 dark:bg-red-900/20 border-2 border-red-500 rounded-lg p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 min-w-0">
                    <svg className="h-6 w-6 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                    </svg>
                    <div className="min-w-0">
                      <h3 className="text-base font-semibold text-red-800 dark:text-red-200 truncate">
                        Emergency Active: {card.title}
                      </h3>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-sm text-red-700 dark:text-red-300">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-200 dark:bg-red-800 text-red-800 dark:text-red-200">
                          Level {card.emergencyLevel} — {levelName}
                        </span>
                        {card.displays && card.displays.length > 0 ? (
                          <span className="text-xs">
                            Displays: {card.displays.map(d => d.display.name).join(', ')}
                          </span>
                        ) : (
                          <span className="text-xs">All displays</span>
                        )}
                      </div>
                      <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                        Activated {new Date(card.activatedAt!).toLocaleString()}
                        {card.activatedBy && ` by ${card.activatedBy.name}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-shrink-0 gap-2">
                    <button
                      onClick={() => setDeactivatingCard(card)}
                      className="px-3 py-1.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
                    >
                      Deactivate
                    </button>
                    {activeTab !== 'emergency' && (
                      <button
                        onClick={() => setActiveTab('emergency')}
                        className="px-3 py-1.5 text-sm font-medium text-red-700 dark:text-red-300 bg-red-100 dark:bg-red-900/40 hover:bg-red-200 dark:hover:bg-red-900/60 rounded-lg transition-colors"
                      >
                        View Details
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('content')}
            className={`py-3 px-1 border-b-2 text-sm font-medium transition-colors ${
              activeTab === 'content'
                ? 'border-primary text-primary dark:text-primary-light dark:border-primary-light'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
          >
            Content Cards
          </button>
          <button
            onClick={() => setActiveTab('emergency')}
            className={`py-3 px-1 border-b-2 text-sm font-medium transition-colors flex items-center gap-2 ${
              activeTab === 'emergency'
                ? 'border-red-500 text-red-600 dark:text-red-400 dark:border-red-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            Emergency Cards
          </button>
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'emergency' ? (
        <EmergencyCardsTab />
      ) : (
        <>
          {/* Content Cards Tab */}
          {isLoading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : error ? (
            <div className="bg-red-50 dark:bg-red-900/30 text-red-600 p-4 rounded-lg">
              Failed to load content cards. Please try again.
            </div>
          ) : (
            <>
              <div className="flex items-center justify-end">
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
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Displays</th>
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
                    No content cards found. Click "Add Card" to create one.
                  </div>
                )}
              </div>
            </>
          )}

          {/* Create/Edit Modal */}
          {(isFormOpen || editingCard) && (
            <ModalPortal>
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
              <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-lg w-full mx-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {editingCard ? (isSystemEdit ? 'Edit System Card' : 'Edit Card') : 'Create Card'}
                </h3>
                <form onSubmit={editingCard ? handleUpdate : handleCreate} className="mt-4 space-y-4">
                  {!isSystemEdit && (
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
                  )}

                  {!isSystemEdit && (
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
                      placeholder="Content displayed on the slide..."
                    />
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Supports **bold**, *italic*, line breaks, and bullet lists
                    </p>
                  </div>
                  )}

                  {!isSystemEdit && (
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
                  )}

                  {!isSystemEdit && (
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
                  )}

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

                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="card-showOnAllDisplays"
                      checked={showOnAllDisplays}
                      onChange={(e) => {
                        setShowOnAllDisplays(e.target.checked);
                        if (e.target.checked) setFormData({ ...formData, displayIds: [] });
                      }}
                      className="h-4 w-4 text-primary focus:ring-primary border-gray-300 dark:border-gray-600 rounded"
                    />
                    <label htmlFor="card-showOnAllDisplays" className="ml-2 text-sm text-gray-700 dark:text-gray-200">
                      Show on all displays
                    </label>
                  </div>

                  {!showOnAllDisplays && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
                        Select Displays
                      </label>
                      <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg p-3">
                        {displays.length === 0 ? (
                          <p className="text-sm text-gray-500 dark:text-gray-400 col-span-2">No displays available</p>
                        ) : (
                          displays.map((display) => (
                            <label key={display.id} className="flex items-center space-x-2 p-2 hover:bg-gray-50 dark:hover:bg-gray-700 rounded cursor-pointer">
                              <input
                                type="checkbox"
                                checked={formData.displayIds?.includes(display.id) || false}
                                onChange={(e) => {
                                  const currentIds = formData.displayIds || [];
                                  if (e.target.checked) {
                                    setFormData({ ...formData, displayIds: [...currentIds, display.id] });
                                  } else {
                                    setFormData({ ...formData, displayIds: currentIds.filter(id => id !== display.id) });
                                  }
                                }}
                                className="h-4 w-4 text-primary focus:ring-primary border-gray-300 dark:border-gray-600 rounded"
                              />
                              <span className="text-sm text-gray-700 dark:text-gray-200 truncate">{display.name}</span>
                            </label>
                          ))
                        )}
                      </div>
                      {(formData.displayIds?.length || 0) > 0 && (
                        <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
                          {formData.displayIds!.length} display{formData.displayIds!.length !== 1 ? 's' : ''} selected
                        </p>
                      )}
                    </div>
                  )}

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
        </>
      )}

      {/* Banner Deactivate Confirmation Modal */}
      {deactivatingCard && (
        <ModalPortal>
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Deactivate Emergency</h3>
            <p className="mt-2 text-gray-600 dark:text-gray-300">
              Normal display content will be restored immediately.
            </p>
            <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-200">
              {deactivatingCard.title}
            </div>
            <div className="mt-4 flex justify-end space-x-3">
              <button
                onClick={() => setDeactivatingCard(null)}
                className="px-4 py-2 text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600"
              >
                Cancel
              </button>
              <button
                onClick={() => bannerDeactivateMutation.mutate(deactivatingCard.id)}
                disabled={bannerDeactivateMutation.isPending}
                className="px-4 py-2 text-white bg-primary rounded-lg hover:bg-primary/90 disabled:opacity-50"
              >
                {bannerDeactivateMutation.isPending ? 'Deactivating...' : 'Deactivate'}
              </button>
            </div>
          </div>
        </div>
        </ModalPortal>
      )}
    </div>
  );
}
