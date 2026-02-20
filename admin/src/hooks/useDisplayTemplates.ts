import { useQuery } from '@tanstack/react-query';
import { displayTemplatesApi, DisplayTypeTemplate } from '../api/displayTemplates';

export function useDisplayTemplates() {
  return useQuery({
    queryKey: ['display-templates'],
    queryFn: displayTemplatesApi.getAll,
    staleTime: 5 * 60 * 1000,
  });
}

export function useDisplayTypeOptions() {
  const { data, isLoading } = useDisplayTemplates();
  const templates = data?.templates || [];
  const options = templates.map(t => ({ value: t.slug, label: t.name }));
  return { options, isLoading, templates };
}

export function useTemplateBySlug(slug: string | undefined): DisplayTypeTemplate | undefined {
  const { data } = useDisplayTemplates();
  if (!slug || !data?.templates) return undefined;
  return data.templates.find(t => t.slug === slug);
}
