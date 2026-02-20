/**
 * 同步管理器
 * 负责将离线操作同步到服务器，处理冲突和重试
 */

import {
  getPendingActions,
  updatePendingAction,
  removePendingAction,
  getSyncMeta,
  updateSyncMeta,
  cacheData,
  getDeviceId,
  type PendingAction,
} from './offlineDB';
import request from '@/services/api/request';

// 同步状态
export type SyncStatus = 'idle' | 'syncing' | 'error' | 'offline';

// 同步结果
export interface SyncResult {
  synced: number;
  failed: number;
  conflicts: number;
  errors: string[];
}

// 冲突项
export interface ConflictItem {
  id: string;
  type: string;
  localData: Record<string, unknown>;
  serverData: Record<string, unknown>;
  resolution?: 'local' | 'server' | 'merge';
}

// 同步事件监听器
type SyncEventListener = (event: SyncEvent) => void;

interface SyncEvent {
  type: 'sync_start' | 'sync_complete' | 'sync_error' | 'conflict_detected' | 'action_synced' | 'status_change';
  data?: unknown;
}

const MAX_RETRY_COUNT = 3;
const SYNC_INTERVAL = 30 * 1000; // 30秒自动同步

class SyncManager {
  private status: SyncStatus = 'idle';
  private listeners: Set<SyncEventListener> = new Set();
  private syncTimer: ReturnType<typeof setInterval> | null = null;
  private isSyncing = false;

  /**
   * 初始化同步管理器
   */
  init() {
    // 监听网络状态变化
    window.addEventListener('online', () => {
      this.setStatus('idle');
      this.syncAll(); // 恢复在线时立即同步
    });

    window.addEventListener('offline', () => {
      this.setStatus('offline');
      this.stopAutoSync();
    });

    // 初始状态
    if (!navigator.onLine) {
      this.setStatus('offline');
    } else {
      this.startAutoSync();
    }
  }

  /**
   * 启动自动同步
   */
  startAutoSync() {
    if (this.syncTimer) return;
    this.syncTimer = setInterval(() => {
      if (navigator.onLine && !this.isSyncing) {
        this.syncAll();
      }
    }, SYNC_INTERVAL);
  }

  /**
   * 停止自动同步
   */
  stopAutoSync() {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
  }

  /**
   * 同步所有待同步操作
   */
  async syncAll(): Promise<SyncResult> {
    if (this.isSyncing) {
      return { synced: 0, failed: 0, conflicts: 0, errors: ['同步正在进行中'] };
    }

    if (!navigator.onLine) {
      this.setStatus('offline');
      return { synced: 0, failed: 0, conflicts: 0, errors: ['当前处于离线状态'] };
    }

    this.isSyncing = true;
    this.setStatus('syncing');
    this.emit({ type: 'sync_start' });

    const result: SyncResult = { synced: 0, failed: 0, conflicts: 0, errors: [] };

    try {
      const pendingActions = await getPendingActions();

      if (pendingActions.length === 0) {
        this.setStatus('idle');
        this.emit({ type: 'sync_complete', data: result });
        return result;
      }

      // 批量上传
      const uploadResult = await this.uploadActions(pendingActions);
      result.synced = uploadResult.synced;
      result.failed = uploadResult.failed;
      result.conflicts = uploadResult.conflicts;
      result.errors = uploadResult.errors;

      // 下载增量数据
      await this.downloadIncrementalData();

      this.setStatus(result.failed > 0 ? 'error' : 'idle');
      this.emit({ type: 'sync_complete', data: result });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '同步失败';
      result.errors.push(message);
      this.setStatus('error');
      this.emit({ type: 'sync_error', data: err });
    } finally {
      this.isSyncing = false;
    }

    return result;
  }

  /**
   * 上传待同步操作到服务器
   */
  private async uploadActions(actions: PendingAction[]): Promise<SyncResult> {
    const result: SyncResult = { synced: 0, failed: 0, conflicts: 0, errors: [] };
    const deviceId = getDeviceId();

    try {
      const response = await request.post('/oa/sync/upload', {
        deviceId,
        timestamp: new Date().toISOString(),
        data: actions.map(action => ({
          type: action.type,
          id: action.id,
          action: action.type,
          payload: action.payload,
          localTimestamp: action.createdAt,
        })),
      }) as any;

      if (response && response.code === 200) {
        const syncData = response.data || response;
        result.synced = syncData.synced || actions.length;
        result.conflicts = syncData.conflicts || 0;
        result.failed = syncData.failed || 0;

        // 删除已成功同步的操作
        for (const action of actions) {
          await removePendingAction(action.id);
          this.emit({ type: 'action_synced', data: action });
        }

        // 更新同步时间
        await updateSyncMeta('last_upload', new Date().toISOString());
      }
    } catch (_batchErr: unknown) {
      // 网络错误时逐个重试
      for (const action of actions) {
        try {
          await this.syncSingleAction(action);
          result.synced++;
        } catch (singleErr: unknown) {
          const errMsg = singleErr instanceof Error ? singleErr.message : '未知错误';
          if (action.retryCount >= MAX_RETRY_COUNT) {
            await updatePendingAction(action.id, { status: 'failed' });
            result.failed++;
            result.errors.push(`操作 ${action.id} 同步失败: ${errMsg}`);
          } else {
            await updatePendingAction(action.id, {
              retryCount: action.retryCount + 1,
              status: 'pending',
            });
            result.failed++;
          }
        }
      }
    }

    return result;
  }

  /**
   * 同步单个操作
   */
  private async syncSingleAction(action: PendingAction): Promise<void> {
    await updatePendingAction(action.id, { status: 'syncing' });

    const endpointMap: Record<string, { method: string; url: string }> = {
      task_complete: { method: 'POST', url: `/workflow/task/complete` },
      task_approve: { method: 'POST', url: `/workflow/task/complete` },
      task_reject: { method: 'POST', url: `/workflow/task/complete` },
      notice_read: { method: 'POST', url: `/oa/notice/read/${action.payload.noticeId}` },
      schedule_create: { method: 'POST', url: `/oa/schedule` },
      leave_request: { method: 'POST', url: `/workflow/process/start` },
      reimbursement_request: { method: 'POST', url: `/workflow/process/start` },
      vehicle_booking: { method: 'POST', url: `/workflow/process/start` },
      meeting_booking: { method: 'POST', url: `/oa/meeting-room` },
    };

    const endpoint = endpointMap[action.type];
    if (!endpoint) {
      throw new Error(`未知的操作类型: ${action.type}`);
    }

    if (endpoint.method === 'POST') {
      await request.post(endpoint.url, action.payload);
    } else {
      await request.get(endpoint.url, { params: action.payload });
    }

    await removePendingAction(action.id);
  }

  /**
   * 下载增量数据
   */
  private async downloadIncrementalData(): Promise<void> {
    try {
      const syncMeta = await getSyncMeta('last_download');
      const lastSyncTime = syncMeta?.lastSyncTime || '1970-01-01T00:00:00Z';
      const deviceId = getDeviceId();

      const response = await request.get('/oa/sync/download', {
        params: { lastSyncTime, deviceId },
      }) as any;

      if (response && response.code === 200) {
        const data = response.data || response;

        // 缓存下载的数据
        if (data.tasks) {
          await cacheData('sync_tasks', data.tasks, 60);
        }
        if (data.messages) {
          await cacheData('sync_messages', data.messages, 60);
        }
        if (data.announcements) {
          await cacheData('sync_announcements', data.announcements, 60);
        }

        // 更新同步时间
        const syncTime = data.syncTime || new Date().toISOString();
        await updateSyncMeta('last_download', syncTime);
      }
    } catch (err) {
      // 下载失败不影响上传结果，静默处理
      console.warn('下载增量数据失败:', err);
    }
  }

  /**
   * 解决冲突
   */
  async resolveConflicts(conflicts: ConflictItem[]): Promise<void> {
    try {
      await request.post('/oa/sync/resolve-conflicts', {
        conflicts: conflicts.map(c => ({
          id: c.id,
          type: c.type,
          resolution: c.resolution || 'server',
          mergedData: c.resolution === 'merge' ? c.localData : undefined,
        })),
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '未知错误';
      throw new Error(`解决冲突失败: ${message}`);
    }
  }

  /**
   * 设置同步状态
   */
  private setStatus(status: SyncStatus) {
    if (this.status !== status) {
      this.status = status;
      this.emit({ type: 'status_change', data: status });
    }
  }

  /**
   * 获取当前同步状态
   */
  getStatus(): SyncStatus {
    return this.status;
  }

  /**
   * 添加事件监听器
   */
  on(listener: SyncEventListener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * 移除事件监听器
   */
  off(listener: SyncEventListener) {
    this.listeners.delete(listener);
  }

  /**
   * 触发事件
   */
  private emit(event: SyncEvent) {
    this.listeners.forEach(listener => {
      try {
        listener(event);
      } catch (err) {
        console.error('同步事件监听器错误:', err);
      }
    });
  }

  /**
   * 销毁同步管理器
   */
  destroy() {
    this.stopAutoSync();
    this.listeners.clear();
    window.removeEventListener('online', () => {});
    window.removeEventListener('offline', () => {});
  }
}

// 单例导出
export const syncManager = new SyncManager();
