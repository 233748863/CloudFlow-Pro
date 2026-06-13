/**
 * 离线状态管理 Hook
 * 提供网络状态检测、离线提示、自动同步触发
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { syncManager, type SyncStatus, type SyncResult } from '@/services/offline/syncManager';
import { getPendingActionCount, addPendingAction, type PendingAction } from '@/services/offline/offlineDB';
import { toast } from 'sonner';

interface UseOfflineReturn {
  /** 是否在线 */
  isOnline: boolean;
  /** 同步状态 */
  syncStatus: SyncStatus;
  /** 待同步操作数量 */
  pendingCount: number;
  /** 手动触发同步 */
  triggerSync: () => Promise<SyncResult>;
  /** 添加离线操作 */
  addOfflineAction: (action: Omit<PendingAction, 'id' | 'createdAt' | 'retryCount' | 'status'>) => Promise<string>;
  /** 是否正在同步 */
  isSyncing: boolean;
}

/**
 * 离线状态管理 Hook
 */
export function useOffline(): UseOfflineReturn {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const initialized = useRef(false);

  // 初始化同步管理器
  useEffect(() => {
    if (!initialized.current) {
      syncManager.init();
      initialized.current = true;
    }

    // 监听同步事件
    const unsubscribe = syncManager.on((event) => {
      switch (event.type) {
        case 'status_change':
          setSyncStatus(event.data as SyncStatus);
          break;
        case 'sync_start':
          setIsSyncing(true);
          break;
        case 'sync_complete': {
          setIsSyncing(false);
          refreshPendingCount();
          const result = event.data as SyncResult | undefined;
          if (result?.synced && result.synced > 0) {
            toast.success(`已同步 ${result.synced} 条数据`);
          }
          break;
        }
        case 'sync_error':
          setIsSyncing(false);
          toast.error('数据同步失败，将稍后重试');
          break;
        case 'action_synced':
          refreshPendingCount();
          break;
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // 监听网络状态
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      toast.success('网络已恢复，正在同步数据...');
    };

    const handleOffline = () => {
      setIsOnline(false);
      toast.warning('网络已断开，数据将在恢复后自动同步');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // 刷新待同步数量
  const refreshPendingCount = useCallback(async () => {
    try {
      const count = await getPendingActionCount();
      setPendingCount(count);
    } catch {
      // 静默处理
    }
  }, []);

  // 初始加载待同步数量
  useEffect(() => {
    refreshPendingCount();
  }, [refreshPendingCount]);

  // 手动触发同步
  const triggerSync = useCallback(async (): Promise<SyncResult> => {
    if (!navigator.onLine) {
      toast.error('当前处于离线状态，无法同步');
      return { synced: 0, failed: 0, conflicts: 0, errors: ['离线状态'] };
    }
    return syncManager.syncAll();
  }, []);

  // 添加离线操作
  const addOfflineAction = useCallback(async (
    action: Omit<PendingAction, 'id' | 'createdAt' | 'retryCount' | 'status'>
  ): Promise<string> => {
    const id = await addPendingAction(action);
    await refreshPendingCount();

    // 如果在线，立即尝试同步
    if (navigator.onLine) {
      setTimeout(() => syncManager.syncAll(), 1000);
    }

    return id;
  }, [refreshPendingCount]);

  return {
    isOnline,
    syncStatus,
    pendingCount,
    triggerSync,
    addOfflineAction,
    isSyncing,
  };
}

/**
 * 网络状态检测 Hook（轻量版）
 */
export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}
