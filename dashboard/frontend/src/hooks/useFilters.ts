import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';

export function useFilters() {
  return useQuery({ queryKey: ['filters'], queryFn: api.getFilters });
}

export function useDeleteFilter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.deleteFilter,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['filters'] }),
  });
}
