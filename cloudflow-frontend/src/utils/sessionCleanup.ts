/**
 * 前端会话清理工具：
 * - 统一清理认证态
 * - 清理与用户会话相关的本地缓存，避免同设备切换账号后数据串用
 */

const SESSION_CACHE_PREFIXES = ['api_cache_', 'workflow_approver_options_'];

/**
 * 清理会话级缓存（不包含 token/user）。
 */
export const clearSessionCaches = (): void => {
  try {
    const keys = Object.keys(localStorage);
    keys.forEach((key) => {
      if (SESSION_CACHE_PREFIXES.some((prefix) => key.startsWith(prefix))) {
        localStorage.removeItem(key);
      }
    });
  } catch {
    // 忽略清理失败，避免影响主流程
  }
};

/**
 * 清理认证态与会话缓存。
 */
export const clearAuthSession = (): void => {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  clearSessionCaches();
};

