import { removeAuthToken, clearCurrentUserSnapshot } from '@/utils/authStorage';

// 兼容历史保留：仍清掉 SESSION_CACHE_PREFIXES 前缀的 key；
// 同时统一兜底清掉所有 tenantStorage 桶（t<tenantId>:xxx）与历史 api_cache_ 残留
// 退出登录后下一位登录用户的 sidebar / 公告已读 / api 缓存等应全部归零。
const SESSION_CACHE_PREFIXES = ['cloudflow_pro_api_cache_'];

export const clearSessionCaches = (): void => {
  try {
    const removeList: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k == null) continue;
      if (SESSION_CACHE_PREFIXES.some((prefix) => k.startsWith(prefix))) {
        removeList.push(k);
        continue;
      }
      // 所有按租户分桶的 key 一律清掉（形如 t100000:foo）
      if (/^t[^:]+:/.test(k)) {
        removeList.push(k);
        continue;
      }
      // 历史 api_cache_ 残留（未分桶时代写入的）
      if (k.includes('api_cache_')) {
        removeList.push(k);
      }
    }
    removeList.forEach((k) => localStorage.removeItem(k));
  } catch {
    // Ignore cleanup failures so sign-out can continue.
  }
};

export const clearAuthSession = (): void => {
  removeAuthToken();
  clearCurrentUserSnapshot();
  clearSessionCaches();
};
