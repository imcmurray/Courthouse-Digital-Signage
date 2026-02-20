import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import ModalPortal from '../components/ModalPortal';
import TemplateEditModal from '../components/TemplateEditModal';
import { displayTemplatesApi, DisplayTypeTemplate } from '../api/displayTemplates';

export default function DisplayTemplates() {
  const queryClient = useQueryClient();
  const [editingTemplate, setEditingTemplate] = useState<DisplayTypeTemplate | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<DisplayTypeTemplate | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['display-templates'],
    queryFn: displayTemplatesApi.getAll,
  });

  const deleteMutation = useMutation({
    mutationFn: displayTemplatesApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['display-templates'] });
      toast.success('Template deleted');
      setDeleteConfirm(null);
    },
    onError: (error: { response?: { data?: { error?: string; displays?: { id: string; name: string }[] } } }) => {
      const msg = error.response?.data?.error || 'Failed to delete template';
      const displays = error.response?.data?.displays;
      if (displays?.length) {
        toast.error(`${msg}: ${displays.map(d => d.name).join(', ')}`, { duration: 6000 });
      } else {
        toast.error(msg);
      }
      setDeleteConfirm(null);
    },
  });

  const handleDelete = () => {
    if (deleteConfirm) {
      deleteMutation.mutate(deleteConfirm.id);
    }
  };

  function getComponentCount(componentsJson: string): number {
    try {
      const arr = JSON.parse(componentsJson);
      return Array.isArray(arr) ? arr.length : 0;
    } catch { return 0; }
  }

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
        Failed to load display templates. Please try again.
      </div>
    );
  }

  const templates = data?.templates || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Display Templates</h1>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
            Define display types as component templates. Built-in types can be customized; create new types for custom layouts.
          </p>
        </div>
        <button
          onClick={() => setIsCreateOpen(true)}
          className="flex items-center px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
        >
          <svg className="h-5 w-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
          Add Template
        </button>
      </div>

      {/* Templates Table */}
      <div className="bg-white dark:bg-gray-800 shadow-sm dark:shadow-gray-900/50 rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-700">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Name
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Slug
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Components
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Type
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Displays Using
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
            {templates.map(template => (
              <tr key={template.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                <td className="px-6 py-4">
                  <button
                    onClick={() => setEditingTemplate(template)}
                    className="text-sm font-medium text-gray-900 dark:text-white text-left hover:text-primary dark:hover:text-primary-light transition-colors"
                  >
                    {template.name}
                  </button>
                  {template.description && (
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 max-w-xs truncate">
                      {template.description}
                    </div>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <code className="text-xs text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded font-mono">
                    {template.slug}
                  </code>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className="inline-flex items-center justify-center w-7 h-7 text-xs font-bold rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300">
                    {getComponentCount(template.components)}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {template.isBuiltIn ? (
                    <span className="inline-flex px-2 py-1 text-xs font-medium rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
                      Built-in
                    </span>
                  ) : (
                    <span className="inline-flex px-2 py-1 text-xs font-medium rounded-full bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300">
                      Custom
                    </span>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                  {template.usageCount || 0}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <button
                    onClick={() => setEditingTemplate(template)}
                    className="text-primary dark:text-primary-light hover:text-primary/80 dark:hover:text-primary-light/80 mr-3"
                  >
                    Edit
                  </button>
                  {!template.isBuiltIn && (
                    <button
                      onClick={() => setDeleteConfirm(template)}
                      className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                    >
                      Delete
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {templates.length === 0 && (
          <div className="text-center py-12 text-gray-500 dark:text-gray-400">
            No templates found. Built-in templates will be created on server startup.
          </div>
        )}
      </div>

      {/* Create Modal */}
      {isCreateOpen && (
        <TemplateEditModal
          template={null}
          onClose={() => setIsCreateOpen(false)}
        />
      )}

      {/* Edit Modal */}
      {editingTemplate && (
        <TemplateEditModal
          template={editingTemplate}
          onClose={() => setEditingTemplate(null)}
        />
      )}

      {/* Delete Confirmation */}
      {deleteConfirm && (
        <ModalPortal>
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Confirm Delete</h3>
              <p className="mt-2 text-gray-600 dark:text-gray-300">
                Are you sure you want to delete this template?
              </p>
              <div className="mt-2 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                <p className="text-sm font-medium text-gray-900 dark:text-white">{deleteConfirm.name}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 font-mono">{deleteConfirm.slug}</p>
              </div>
              {(deleteConfirm.usageCount || 0) > 0 && (
                <p className="mt-2 text-sm text-amber-600 dark:text-amber-400">
                  Warning: {deleteConfirm.usageCount} display(s) are using this template.
                  Deletion will be blocked by the server.
                </p>
              )}
              <p className="mt-2 text-sm text-red-600">This action cannot be undone.</p>
              <div className="mt-4 flex justify-end space-x-3">
                <button
                  onClick={() => setDeleteConfirm(null)}
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
