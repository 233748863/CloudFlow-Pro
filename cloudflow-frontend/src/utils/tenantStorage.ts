// 按租户分桶的 localStorage 包装（多租户改造 P3.3）。
//
// 背景：
// - 切换租户后，前一个租户写入的 UI 偏好（如侧边栏折叠、已读公告 id 列表）
//   会原样回到新租户，造成"我没读过却已读"、"新租户折叠到一半"等串数据现象
//
// 策略：
// - 所有按业务隔离的 key 一律改走 tenantStorage.{get,set,remove}
// - 实际存储 key = `t${tenantId}:${key}`，自动以登录用户的 tenantId 分桶
// - 未登录时 tenantId='shared'，避免在登录页写入未识别桶；登录后再写自己的桶
// - 切换租户 / 登出时调 purgeOther 清除其它租户残留，避免桶无限增长
//
// 不应迁移到 tenantStorage 的 key：
// - cloudflow_device_id：设备指纹跨租户共享，独立保留
// - 第三方 SDK 自己写的 key（不在我们控制范围）

import { getCurrentUserSnapshot } from './authStorage';

const STORAGE_PREFIX = 't';

const resolveTenantSegment = (): string => {
  const tenantId = getCurrentUserSnapshot()?.tenantId;
  return tenantId != null && tenantId !== '' ? String(tenantId) : 'shared';
};

const buildKey = (key: string, tenantOverride?: string | number | null): string => {
  const seg = tenantOverride != null && tenantOverride !== ''
    ? String(tenantOverride)
    : resolveTenantSegment();
  return `${STORAGE_PREFIX}${seg}:${key}`;
};

export const tenantStorage = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(buildKey(key));
    } catch {
      return null;
    }
  },
  set(key: string, value: string): void {
    try {
      localStorage.setItem(buildKey(key), value);
    } catch {
      // localStorage 满 / 隐私模式不可写，吞掉
    }
  },
  remove(key: string): void {
    try {
      localStorage.removeItem(buildKey(key));
    } catch {
      // ignore
    }
  },
  /**
   * 清掉其它租户桶（保留当前 tenantId 桶 + 不带前缀的全局 key）。
   * AuthContext.switchTenant 在切换成功后调用。
   */
  purgeOther(currentTenantId: string | number | null | undefined): void {
    try {
      const keepSeg = currentTenantId != null && currentTenantId !== ''
        ? `${STORAGE_PREFIX}${currentTenantId}:`
        : null;
      const removeList: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k == null) continue;
        if (!k.startsWith(STORAGE_PREFIX)) continue;
        // 形如 t100000:foo 才是受管 key
        if (!/^t[^:]+:/.test(k)) continue;
        if (keepSeg != null && k.startsWith(keepSeg)) continue;
        removeList.push(k);
      }
      removeList.forEach((k) => localStorage.removeItem(k));
    } catch {
      // ignore
    }
  },
};
