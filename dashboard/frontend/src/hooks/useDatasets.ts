import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';

export function useDatasets() {
  return useQuery({ queryKey: ['datasets'], queryFn: api.getDatasets });
}

export function useDeleteDataset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.deleteDataset,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['datasets'] }),
  });
}
