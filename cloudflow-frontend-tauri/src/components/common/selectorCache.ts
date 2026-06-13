/**
 * 选择器数据缓存：promise 单例 + TTL，多个选择器实例共享同一次拉取
 * 避免页面打开时同时挂载 N 个 EmployeeSelector 触发 N 次 /hr/employees
 */

type CacheEntry<T> = {
  promise: Promise<T>;
  expiresAt: number;
};

const cache = new Map<string, CacheEntry<unknown>>();

const DEFAULT_TTL_MS = 5 * 60 * 1000;

export function getCachedOrFetch<T>(key: string, fetcher: () => Promise<T>, ttlMs: number = DEFAULT_TTL_MS): Promise<T> {
  const now = Date.now();
  const hit = cache.get(key) as CacheEntry<T> | undefined;
  if (hit && hit.expiresAt > now) {
    return hit.promise;
  }
  const promise = fetcher().catch((err) => {
    cache.delete(key);
    throw err;
  });
  cache.set(key, { promise, expiresAt: now + ttlMs });
  return promise;
}

export function invalidateSelectorCache(key?: string) {
  if (key) cache.delete(key);
  else cache.clear();
}
