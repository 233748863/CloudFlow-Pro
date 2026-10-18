import { useQuery } from '@tanstack/react-query';
import { getRouters, type MenuItem } from '@/services/api/menu';
import { useAuth } from '@/context/AuthContext';
import { getBackendMenuQueryKey } from '@/lib/queryClient';
import { getCurrentUserSnapshot } from '@/utils/authStorage';
import { getMenuSearchIdentity, menuSearchIdentityKey } from '@/utils/menuSearch';

export { backendMenuQueryKey } from '@/lib/queryClient';

export const useBackendMenus = (enabled = true) => {
  const { user, loading, hasPermission } = useAuth();
  const identity = getMenuSearchIdentity(user);
  const identityKey = menuSearchIdentityKey(identity);
  const isCurrentIdentity = () => Boolean(identityKey) && identityKey === menuSearchIdentityKey(getMenuSearchIdentity(getCurrentUserSnapshot()));
  const authenticated = enabled && !loading && isCurrentIdentity();
  const canReadMenus = hasPermission('system:auth:router');
  const active = authenticated && canReadMenus;
  const query = useQuery<MenuItem[]>({
    queryKey: getBackendMenuQueryKey(identity?.tenantId, identity?.userId),
    queryFn: async ({ signal }) => {
      signal.throwIfAborted();
      if (!canReadMenus || !isCurrentIdentity()) throw new Error('菜单读取权限或身份已变化');
      const menus = await getRouters();
      signal.throwIfAborted();
      if (!isCurrentIdentity()) throw new Error('菜单身份已变化');
      return menus;
    },
    enabled: active,
    placeholderData: undefined,
  });
  const isMenuReady = active && query.isSuccess && !query.isFetching;
  return {
    ...query,
    isError: active && query.isError,
    error: active ? query.error : null,
    data: isMenuReady ? query.data : undefined,
    isLoading: active && (query.isPending || query.isFetching),
    isMenuReady,
    identity: authenticated ? identity : null,
  };
};
