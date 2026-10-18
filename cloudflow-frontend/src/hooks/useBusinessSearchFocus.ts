import { useCallback, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';
import { businessSearchFocus } from '@/utils/businessSearch';
import { getErrorMessage } from '@/utils/errorMessage';

export function useBusinessSearchFocus(
  open: (identifier: number, signal: AbortSignal) => Promise<void>,
  clear: (identityChanged?: boolean) => void,
) {
  const location = useLocation();
  const { user } = useAuth();
  const callbacks = useRef({ open, clear });
  callbacks.current = { open, clear };
  const pending = useRef<AbortController | null>(null);
  const identity = JSON.stringify(user ? [user.tenantId, user.id, user.permissions] : null);
  const latestIdentity = useRef(identity);
  latestIdentity.current = identity;

  useEffect(() => {
    if (identity === 'null') return;
    let identifier: number | null;
    try {
      identifier = businessSearchFocus(location.search);
    } catch (error) {
      callbacks.current.clear();
      toast.error(getErrorMessage(error, '搜索详情编号无效，请重新搜索。'));
      return;
    }
    if (identifier === null) return;
    const controller = new AbortController();
    pending.current = controller;
    void callbacks.current.open(identifier, controller.signal).catch((error: unknown) => {
      if (!controller.signal.aborted) {
        callbacks.current.clear();
        toast.error(getErrorMessage(error, '搜索详情无法打开，记录可能已删除或查看权限已变更。'));
      }
    });
    return () => {
      controller.abort();
      if (pending.current === controller) pending.current = null;
      callbacks.current.clear(latestIdentity.current !== identity);
    };
  }, [identity, location.pathname, location.search, location.key]);

  return useCallback(() => {
    pending.current?.abort();
    pending.current = null;
    callbacks.current.clear();
  }, []);
}
