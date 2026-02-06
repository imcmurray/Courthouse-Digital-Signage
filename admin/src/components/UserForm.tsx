import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { User, CreateUserInput, UpdateUserInput } from '../api/users';

// Schema for creating a new user
const createUserSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().min(1, 'Name is required'),
  role: z.enum(['admin', 'editor', 'viewer']),
});

// Schema for updating an existing user
const updateUserSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters').or(z.literal('')),
  name: z.string().min(1, 'Name is required'),
  role: z.enum(['admin', 'editor', 'viewer']),
  isActive: z.boolean().optional(),
});

type CreateFormData = z.infer<typeof createUserSchema>;
type UpdateFormData = z.infer<typeof updateUserSchema>;

interface UserFormProps {
  user?: User;
  onSubmit: (data: CreateUserInput | UpdateUserInput) => void;
  onClose: () => void;
  isLoading: boolean;
}

export default function UserForm({ user, onSubmit, onClose, isLoading }: UserFormProps) {
  const isEditing = !!user;

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CreateFormData | UpdateFormData>({
    resolver: zodResolver(isEditing ? updateUserSchema : createUserSchema),
    defaultValues: {
      email: user?.email || '',
      password: '',
      name: user?.name || '',
      role: user?.role || 'viewer',
      ...(isEditing && { isActive: user?.isActive }),
    },
  });

  const handleFormSubmit = (data: CreateFormData | UpdateFormData) => {
    if (isEditing) {
      // For updates, only include password if it was changed
      const updateData: UpdateUserInput = {
        email: data.email,
        name: data.name,
        role: data.role,
        ...(data.password && { password: data.password }),
        ...(typeof (data as UpdateFormData).isActive === 'boolean' && {
          isActive: (data as UpdateFormData).isActive,
        }),
      };
      onSubmit(updateData);
    } else {
      onSubmit(data as CreateUserInput);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl dark:shadow-gray-900/50 max-w-md w-full mx-4">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            {isEditing ? 'Edit User' : 'Add New User'}
          </h3>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit(handleFormSubmit)} className="p-6 space-y-4">
          {/* Name */}
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 dark:text-gray-200">
              Full Name
            </label>
            <input
              id="name"
              type="text"
              {...register('name')}
              className={`mt-1 block w-full px-3 py-2 border ${
                errors.name ? 'border-red-300 dark:border-red-600' : 'border-gray-300 dark:border-gray-600'
              } rounded-md shadow-sm dark:shadow-gray-900/50 focus:outline-none focus:ring-primary focus:border-primary dark:bg-gray-700 dark:text-white`}
              placeholder="John Doe"
            />
            {errors.name && (
              <p className="mt-1 text-sm text-red-600" role="alert">{errors.name.message}</p>
            )}
          </div>

          {/* Email */}
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-200">
              Email Address
            </label>
            <input
              id="email"
              type="email"
              {...register('email')}
              className={`mt-1 block w-full px-3 py-2 border ${
                errors.email ? 'border-red-300 dark:border-red-600' : 'border-gray-300 dark:border-gray-600'
              } rounded-md shadow-sm dark:shadow-gray-900/50 focus:outline-none focus:ring-primary focus:border-primary dark:bg-gray-700 dark:text-white`}
              placeholder="user@courthouse.gov"
            />
            {errors.email && (
              <p className="mt-1 text-sm text-red-600" role="alert">{errors.email.message}</p>
            )}
          </div>

          {/* Password */}
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-gray-200">
              Password {isEditing && <span className="text-gray-400">(leave blank to keep current)</span>}
            </label>
            <input
              id="password"
              type="password"
              {...register('password')}
              className={`mt-1 block w-full px-3 py-2 border ${
                errors.password ? 'border-red-300 dark:border-red-600' : 'border-gray-300 dark:border-gray-600'
              } rounded-md shadow-sm dark:shadow-gray-900/50 focus:outline-none focus:ring-primary focus:border-primary dark:bg-gray-700 dark:text-white`}
              placeholder={isEditing ? '••••••••' : 'Minimum 8 characters'}
            />
            {errors.password && (
              <p className="mt-1 text-sm text-red-600" role="alert">{errors.password.message}</p>
            )}
          </div>

          {/* Role */}
          <div>
            <label htmlFor="role" className="block text-sm font-medium text-gray-700 dark:text-gray-200">
              Role
            </label>
            <select
              id="role"
              {...register('role')}
              className={`mt-1 block w-full px-3 py-2 border ${
                errors.role ? 'border-red-300 dark:border-red-600' : 'border-gray-300 dark:border-gray-600'
              } rounded-md shadow-sm dark:shadow-gray-900/50 focus:outline-none focus:ring-primary focus:border-primary dark:bg-gray-700 dark:text-white`}
            >
              <option value="viewer">Viewer - Read-only access</option>
              <option value="editor">Editor - Can manage docket and announcements</option>
              <option value="admin">Admin - Full access including user management</option>
            </select>
            {errors.role && (
              <p className="mt-1 text-sm text-red-600" role="alert">{errors.role.message}</p>
            )}
          </div>

          {/* Active Status (only for editing) */}
          {isEditing && (
            <div className="flex items-center">
              <input
                id="isActive"
                type="checkbox"
                {...register('isActive' as 'isActive')}
                className="h-4 w-4 text-primary focus:ring-primary border-gray-300 dark:border-gray-600 rounded"
              />
              <label htmlFor="isActive" className="ml-2 block text-sm text-gray-700 dark:text-gray-200">
                Account is active
              </label>
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
              disabled={isLoading}
              className="px-4 py-2 text-white bg-primary rounded-lg hover:bg-primary/90 disabled:opacity-50"
            >
              {isLoading ? (isEditing ? 'Saving...' : 'Creating...') : isEditing ? 'Save Changes' : 'Create User'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
