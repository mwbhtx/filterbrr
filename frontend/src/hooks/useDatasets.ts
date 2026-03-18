import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import type { Dataset } from '../types';

export function useDatasets() {
  return useQuery({ queryKey: ['datasets'], queryFn: api.getDatasets });
}

export function useDeleteDataset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.deleteDataset,
    onSuccess: (_data, filename) => {
      qc.setQueryData<Dataset[]>(['datasets'], (prev) =>
        prev?.filter((d) => d.filename !== filename) ?? []
      );
    },
  });
}
