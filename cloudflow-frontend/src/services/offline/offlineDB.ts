/**
 * IndexedDB 离线存储服务
 * 用于在离线状态下缓存数据，在线时同步到服务器
 */

const DB_NAME = 'cloudflow_offline';
const DB_VERSION = 1;

// 存储表名
export const STORES = {
  PENDING_ACTIONS: 'pending_actions',   // 待同步的操作
  CACHED_DATA: 'cached_data',           // 缓存的数据
  SYNC_META: 'sync_meta',              // 同步元数据
} as const;

// 待同步操作类型
export interface PendingAction {
  id: string;
  type: 'task_complete' | 'task_approve' | 'task_reject' | 'notice_read' | 'schedule_create' | 'hr_leave_request' | 'reimbursement_request' | 'vehicle_booking' | 'meeting_booking';
  payload: Record<string, any>;
  createdAt: string;
  retryCount: number;
  status: 'pending' | 'syncing' | 'failed';
}

// 缓存数据类型
export interface CachedData {
  key: string;
  data: any;
  cachedAt: string;
  expiresAt: string;
}

// 同步元数据
export interface SyncMeta {
  key: string;
  lastSyncTime: string;
  deviceId: string;
}

/**
 * 打开 IndexedDB 数据库
 */
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // 创建待同步操作表
      if (!db.objectStoreNames.contains(STORES.PENDING_ACTIONS)) {
        const actionStore = db.createObjectStore(STORES.PENDING_ACTIONS, { keyPath: 'id' });
        actionStore.createIndex('status', 'status', { unique: false });
        actionStore.createIndex('createdAt', 'createdAt', { unique: false });
        actionStore.createIndex('type', 'type', { unique: false });
      }

      // 创建缓存数据表
      if (!db.objectStoreNames.contains(STORES.CACHED_DATA)) {
        const cacheStore = db.createObjectStore(STORES.CACHED_DATA, { keyPath: 'key' });
        cacheStore.createIndex('expiresAt', 'expiresAt', { unique: false });
      }

      // 创建同步元数据表
      if (!db.objectStoreNames.contains(STORES.SYNC_META)) {
        db.createObjectStore(STORES.SYNC_META, { keyPath: 'key' });
      }
    };
  });
}

/**
 * 添加待同步操作
 */
export async function addPendingAction(action: Omit<PendingAction, 'id' | 'createdAt' | 'retryCount' | 'status'>): Promise<string> {
  const db = await openDB();
  const id = `action_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const pendingAction: PendingAction = {
    ...action,
    id,
    createdAt: new Date().toISOString(),
    retryCount: 0,
    status: 'pending',
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.PENDING_ACTIONS, 'readwrite');
    const store = tx.objectStore(STORES.PENDING_ACTIONS);
    const request = store.add(pendingAction);
    request.onsuccess = () => resolve(id);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
}

/**
 * 获取所有待同步操作
 */
export async function getPendingActions(): Promise<PendingAction[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.PENDING_ACTIONS, 'readonly');
    const store = tx.objectStore(STORES.PENDING_ACTIONS);
    const index = store.index('status');
    const request = index.getAll('pending');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
}

/**
 * 更新待同步操作状态
 */
export async function updatePendingAction(id: string, updates: Partial<PendingAction>): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.PENDING_ACTIONS, 'readwrite');
    const store = tx.objectStore(STORES.PENDING_ACTIONS);
    const getRequest = store.get(id);
    getRequest.onsuccess = () => {
      const action = getRequest.result;
      if (action) {
        const updated = { ...action, ...updates };
        store.put(updated);
      }
    };
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * 删除已同步的操作
 */
export async function removePendingAction(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.PENDING_ACTIONS, 'readwrite');
    const store = tx.objectStore(STORES.PENDING_ACTIONS);
    store.delete(id);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * 缓存数据
 */
export async function cacheData(key: string, data: any, ttlMinutes: number = 30): Promise<void> {
  const db = await openDB();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlMinutes * 60 * 1000);

  const cached: CachedData = {
    key,
    data,
    cachedAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.CACHED_DATA, 'readwrite');
    const store = tx.objectStore(STORES.CACHED_DATA);
    store.put(cached);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * 获取缓存数据
 */
export async function getCachedData<T = any>(key: string): Promise<T | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.CACHED_DATA, 'readonly');
    const store = tx.objectStore(STORES.CACHED_DATA);
    const request = store.get(key);
    request.onsuccess = () => {
      const result = request.result as CachedData | undefined;
      if (result && new Date(result.expiresAt) > new Date()) {
        resolve(result.data as T);
      } else {
        resolve(null);
      }
    };
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
}

/**
 * 清除过期缓存
 */
export async function clearExpiredCache(): Promise<number> {
  const db = await openDB();
  const now = new Date().toISOString();
  let count = 0;

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.CACHED_DATA, 'readwrite');
    const store = tx.objectStore(STORES.CACHED_DATA);
    const request = store.openCursor();

    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
      if (cursor) {
        const cached = cursor.value as CachedData;
        if (cached.expiresAt < now) {
          cursor.delete();
          count++;
        }
        cursor.continue();
      }
    };

    tx.oncomplete = () => { db.close(); resolve(count); };
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * 更新同步元数据
 */
export async function updateSyncMeta(key: string, lastSyncTime: string): Promise<void> {
  const db = await openDB();
  const deviceId = getDeviceId();
  const meta: SyncMeta = { key, lastSyncTime, deviceId };

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.SYNC_META, 'readwrite');
    const store = tx.objectStore(STORES.SYNC_META);
    store.put(meta);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * 获取同步元数据
 */
export async function getSyncMeta(key: string): Promise<SyncMeta | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.SYNC_META, 'readonly');
    const store = tx.objectStore(STORES.SYNC_META);
    const request = store.get(key);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
}

/**
 * 获取待同步操作数量
 */
export async function getPendingActionCount(): Promise<number> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.PENDING_ACTIONS, 'readonly');
    const store = tx.objectStore(STORES.PENDING_ACTIONS);
    const index = store.index('status');
    const request = index.count('pending');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
}

/**
 * 清除所有离线数据
 */
export async function clearAllOfflineData(): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const storeNames = [STORES.PENDING_ACTIONS, STORES.CACHED_DATA, STORES.SYNC_META];
    const tx = db.transaction(storeNames, 'readwrite');
    storeNames.forEach(name => tx.objectStore(name).clear());
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * 获取或生成设备 ID
 */
function getDeviceId(): string {
  let deviceId = localStorage.getItem('cloudflow_device_id');
  if (!deviceId) {
    deviceId = `device_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    localStorage.setItem('cloudflow_device_id', deviceId);
  }
  return deviceId;
}

export { getDeviceId };
