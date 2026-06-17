import { useQuery } from '@tanstack/react-query';
import { getRouters, type MenuItem } from '@/services/api/menu';

export const backendMenuQueryKey = ['auth', 'routers'] as const;

export const useBackendMenus = (enabled = true) =>
  useQuery<MenuItem[]>({
    queryKey: backendMenuQueryKey,
    queryFn: getRouters,
    enabled,
  });
