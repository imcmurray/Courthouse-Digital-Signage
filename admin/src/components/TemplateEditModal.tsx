import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
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
import ModalPortal from './ModalPortal';
import { displayTemplatesApi, DisplayTypeTemplate } from '../api/displayTemplates';
import { DISPLAY_COMPONENTS, ComponentType, COMPONENT_TYPE_LIST } from '../constants/displayComponents';

interface TemplateComponent {
  id: string; // client-side UUID for dnd-kit
  type: ComponentType;
  config: Record<string, unknown>;
}

interface LayoutConfig {
  type: 'single' | 'two-column' | 'two-column-wide' | 'grid';
  columns?: string;
  rows?: string;
}

const LAYOUT_PRESETS: { value: LayoutConfig['type']; label: string; layout: LayoutConfig }[] = [
  { value: 'single', label: 'Single Column', layout: { type: 'single' } },
  { value: 'two-column', label: 'Two Column', layout: { type: 'two-column', columns: '1fr 1fr' } },
  { value: 'two-column-wide', label: 'Two Column (wide left)', layout: { type: 'two-column', columns: '2fr 1fr' } },
  { value: 'grid', label: 'Grid (2x2)', layout: { type: 'grid', columns: '1fr 1fr', rows: '1fr 1fr' } },
];

function generateId() {
  return crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
}

function parseComponents(json: string): TemplateComponent[] {
  try {
    const arr = JSON.parse(json);
    if (!Array.isArray(arr)) return [];
    return arr.map((c: { type: string; config?: Record<string, unknown> }) => ({
      id: generateId(),
      type: c.type as ComponentType,
      config: c.config || {},
    }));
  } catch { return []; }
}

function parseLayout(json: string | null): LayoutConfig {
  if (!json) return { type: 'single' };
  try {
    return JSON.parse(json);
  } catch { return { type: 'single' }; }
}

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// Sortable component row
interface SortableComponentProps {
  component: TemplateComponent;
  onRemove: () => void;
  onUpdateConfig: (config: Record<string, unknown>) => void;
  isExpanded: boolean;
  onToggleExpand: () => void;
}

function SortableComponent({ component, onRemove, onUpdateConfig, isExpanded, onToggleExpand }: SortableComponentProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: component.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const info = DISPLAY_COMPONENTS[component.type];

  return (
    <div ref={setNodeRef} style={style} className="bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600">
      <div className="flex items-center px-3 py-2">
        <button
          {...attributes}
          {...listeners}
          type="button"
          className="cursor-grab active:cursor-grabbing p-1 mr-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
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
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium text-gray-900 dark:text-white">{info?.name || component.type}</span>
          <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">{info?.description}</span>
        </div>
        <button
          type="button"
          onClick={onToggleExpand}
          className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 mr-2 px-2 py-1"
        >
          {isExpanded ? 'Collapse' : 'Config'}
        </button>
        <button
          type="button"
          onClick={onRemove}
          className="text-xs text-red-500 hover:text-red-700 px-2 py-1"
        >
          Remove
        </button>
      </div>

      {isExpanded && (
        <div className="px-3 pb-3 pt-1 border-t border-gray-200 dark:border-gray-600">
          <ComponentConfigEditor type={component.type} config={component.config} onChange={onUpdateConfig} />
        </div>
      )}
    </div>
  );
}

// Per-component config editor
function ComponentConfigEditor({ type, config, onChange }: {
  type: ComponentType;
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}) {
  switch (type) {
    case 'hearing-table':
      return (
        <div className="space-y-2">
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">View Mode</label>
            <select
              value={(config.viewMode as string) || 'smart'}
              onChange={e => onChange({ ...config, viewMode: e.target.value })}
              className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded dark:bg-gray-700 dark:text-white"
            >
              <option value="smart">Smart (time-filtered)</option>
              <option value="all">All Hearings</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Hide Columns (comma-separated)</label>
            <input
              type="text"
              value={Array.isArray(config.hideColumns) ? (config.hideColumns as string[]).join(', ') : ''}
              onChange={e => {
                const val = e.target.value.trim();
                onChange({ ...config, hideColumns: val ? val.split(',').map(s => s.trim()) : [] });
              }}
              placeholder="e.g., judge, room"
              className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded dark:bg-gray-700 dark:text-white"
            />
          </div>
        </div>
      );
    case 'idle-cards':
      return (
        <div className="space-y-2">
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Mode</label>
            <select
              value={(config.mode as string) || 'interleave-pagination'}
              onChange={e => onChange({ ...config, mode: e.target.value })}
              className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded dark:bg-gray-700 dark:text-white"
            >
              <option value="interleave-pagination">Interleave with Pagination</option>
              <option value="replace-panel">Replace Panel</option>
            </select>
          </div>
          {config.mode === 'replace-panel' && (
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Target Panel</label>
              <input
                type="text"
                value={(config.target as string) || ''}
                onChange={e => onChange({ ...config, target: e.target.value })}
                placeholder="e.g., hearing-pills"
                className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded dark:bg-gray-700 dark:text-white"
              />
            </div>
          )}
        </div>
      );
    default:
      return (
        <p className="text-xs text-gray-500 dark:text-gray-400 italic">No configurable options for this component.</p>
      );
  }
}

interface TemplateEditModalProps {
  template: DisplayTypeTemplate | null; // null = create mode
  onClose: () => void;
}

export default function TemplateEditModal({ template, onClose }: TemplateEditModalProps) {
  const queryClient = useQueryClient();
  const isEditing = !!template;
  const isBuiltIn = template?.isBuiltIn ?? false;

  const [name, setName] = useState(template?.name || '');
  const [slug, setSlug] = useState(template?.slug || '');
  const [description, setDescription] = useState(template?.description || '');
  const [components, setComponents] = useState<TemplateComponent[]>(
    template ? parseComponents(template.components) : []
  );
  const [layout, setLayout] = useState<LayoutConfig>(
    template ? parseLayout(template.layout) : { type: 'single' }
  );
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [autoSlug, setAutoSlug] = useState(!isEditing);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor)
  );

  // Auto-generate slug from name
  useEffect(() => {
    if (autoSlug && !isEditing) {
      setSlug(slugify(name));
    }
  }, [name, autoSlug, isEditing]);

  const createMutation = useMutation({
    mutationFn: displayTemplatesApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['display-templates'] });
      toast.success('Template created');
      onClose();
    },
    onError: (error: { response?: { data?: { error?: string } } }) => {
      toast.error(error.response?.data?.error || 'Failed to create template');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof displayTemplatesApi.update>[1] }) =>
      displayTemplatesApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['display-templates'] });
      toast.success('Template updated');
      onClose();
    },
    onError: (error: { response?: { data?: { error?: string } } }) => {
      toast.error(error.response?.data?.error || 'Failed to update template');
    },
  });

  const resetMutation = useMutation({
    mutationFn: displayTemplatesApi.reset,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['display-templates'] });
      toast.success('Template reset to defaults');
      // Update local state with reset data
      setName(data.name);
      setDescription(data.description || '');
      setComponents(parseComponents(data.components));
      setLayout(parseLayout(data.layout));
    },
    onError: (error: { response?: { data?: { error?: string } } }) => {
      toast.error(error.response?.data?.error || 'Failed to reset template');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const componentData = components.map(c => ({ type: c.type, config: c.config }));

    if (isEditing && template) {
      updateMutation.mutate({
        id: template.id,
        data: {
          name,
          description: description || null,
          components: componentData,
          layout: layout.type === 'single' ? null : layout,
          ...(!isBuiltIn && { slug }),
        },
      });
    } else {
      createMutation.mutate({
        slug,
        name,
        description: description || null,
        components: componentData,
        layout: layout.type === 'single' ? null : layout,
      });
    }
  };

  const addComponent = (type: ComponentType) => {
    setComponents([...components, { id: generateId(), type, config: {} }]);
  };

  const removeComponent = (id: string) => {
    setComponents(components.filter(c => c.id !== id));
  };

  const updateComponentConfig = (id: string, config: Record<string, unknown>) => {
    setComponents(components.map(c => c.id === id ? { ...c, config } : c));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = components.findIndex(c => c.id === active.id);
    const newIndex = components.findIndex(c => c.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    setComponents(arrayMove(components, oldIndex, newIndex));
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  // Component types not already in the list
  const availableComponents = COMPONENT_TYPE_LIST.filter(
    c => !components.some(existing => existing.type === c.type)
  );

  return (
    <ModalPortal>
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            {isEditing ? (isBuiltIn ? 'Edit Built-in Template' : 'Edit Template') : 'Create Template'}
          </h3>

          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            {/* A) Basic Info */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                  Name *
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  required
                  placeholder="e.g., Lobby Info Board"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary dark:bg-gray-700 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                  Slug {!isEditing && <span className="text-xs text-gray-400">(auto)</span>}
                </label>
                <input
                  type="text"
                  value={slug}
                  onChange={e => { setAutoSlug(false); setSlug(e.target.value); }}
                  required
                  disabled={isBuiltIn}
                  placeholder="e.g., lobby-info"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary dark:bg-gray-700 dark:text-white disabled:bg-gray-100 dark:disabled:bg-gray-700"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {isBuiltIn ? 'Cannot change slug of built-in template' : 'Used as the display type value'}
                </p>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                Description
              </label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                rows={2}
                placeholder="Brief description of this template's purpose..."
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary dark:bg-gray-700 dark:text-white"
              />
            </div>

            {/* B) Component List */}
            <div className="border-t dark:border-gray-700 pt-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-medium text-gray-900 dark:text-white">Components</h4>
                {availableComponents.length > 0 && (
                  <select
                    value=""
                    onChange={e => { if (e.target.value) addComponent(e.target.value as ComponentType); }}
                    className="text-xs px-2 py-1 border border-gray-300 dark:border-gray-600 rounded dark:bg-gray-700 dark:text-white"
                  >
                    <option value="">+ Add Component</option>
                    {availableComponents.map(c => (
                      <option key={c.type} value={c.type}>{c.name}</option>
                    ))}
                  </select>
                )}
              </div>

              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={components.map(c => c.id)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-2">
                    {components.map(comp => (
                      <SortableComponent
                        key={comp.id}
                        component={comp}
                        onRemove={() => removeComponent(comp.id)}
                        onUpdateConfig={config => updateComponentConfig(comp.id, config)}
                        isExpanded={expandedId === comp.id}
                        onToggleExpand={() => setExpandedId(expandedId === comp.id ? null : comp.id)}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>

              {components.length === 0 && (
                <p className="text-sm text-gray-400 dark:text-gray-500 italic text-center py-4">
                  No components added. Use the dropdown above to add components.
                </p>
              )}
            </div>

            {/* C) Layout Selector */}
            <div className="border-t dark:border-gray-700 pt-4">
              <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-3">Layout</h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {LAYOUT_PRESETS.map(preset => (
                  <button
                    key={preset.value}
                    type="button"
                    onClick={() => setLayout(preset.layout)}
                    className={`px-3 py-2 text-xs rounded-lg border transition-colors ${
                      layout.type === preset.layout.type &&
                      (layout.columns || '') === (preset.layout.columns || '')
                        ? 'border-primary bg-primary/10 text-primary dark:text-primary-light'
                        : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            {/* D) Reset button for built-in */}
            {isBuiltIn && template && (
              <div className="border-t dark:border-gray-700 pt-4">
                <button
                  type="button"
                  onClick={() => resetMutation.mutate(template.id)}
                  disabled={resetMutation.isPending}
                  className="text-sm px-3 py-2 text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-lg hover:bg-amber-100 dark:hover:bg-amber-900/50 disabled:opacity-50"
                >
                  {resetMutation.isPending ? 'Resetting...' : 'Reset to Defaults'}
                </button>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Restore this template's components and layout to factory defaults.
                </p>
              </div>
            )}

            {/* Actions */}
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
                disabled={isPending || components.length === 0}
                className="px-4 py-2 text-white bg-primary rounded-lg hover:bg-primary/90 disabled:opacity-50"
              >
                {isPending ? 'Saving...' : isEditing ? 'Update' : 'Create'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </ModalPortal>
  );
}
