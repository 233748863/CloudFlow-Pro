import { getAuthSessionVersion, getCurrentUserSnapshot } from './authStorage';

// 只存本标签页看过的摘要，不存令牌、表单变量、附件或审批操作。
const PREFIX = 'cloudflow_mobile_readonly_v1:';
const ACTIVE = `${PREFIX}active`;
export const MOBILE_SNAPSHOT_TTL = 24 * 60 * 60 * 1000;
export interface MobileTaskSummary {
  id: string; taskName: string; processName: string; applicantName: string; createTime: string;
  dueDate?: string; priority?: 'high' | 'medium' | 'low'; status: string;
}
export interface MobileDashboardSummary {
  stats: { pendingTasks: number; todaySchedules: number; unreadMessages: number };
  tasks: { taskId: string; taskName: string; processName: string; applicant: string; deadline: string; priority: string; status: string }[];
  schedules: { eventId: string; title: string; startTime: string; roomId?: string }[];
}
export interface MobileTodoSummary {
  tasks: MobileTaskSummary[]; total: number;
  counts: { pending: number; completed: number; myApplications: number };
}
interface SnapshotData { dashboard: MobileDashboardSummary; todo: MobileTodoSummary }
export interface SnapshotScope { key: string; version: number }
interface Snapshot<T> { scope: string; savedAt: number; data: T }

export function captureMobileScope(): SnapshotScope | null {
  const user = getCurrentUserSnapshot();
  const id = user?.id ?? user?.userId;
  if (id == null || user?.tenantId == null) return null;
  return { key: `${encodeURIComponent(String(user.tenantId))}:${encodeURIComponent(String(id))}`, version: getAuthSessionVersion() };
}
export function isMobileScopeCurrent(scope: SnapshotScope | null): scope is SnapshotScope {
  const current = captureMobileScope();
  return !!scope && !!current && scope.key === current.key && scope.version === current.version;
}
export function clearMobileSnapshots() {
  try {
    for (const key of Object.keys(sessionStorage)) if (key.startsWith(PREFIX)) sessionStorage.removeItem(key);
  } catch { /* 禁止存储时不影响登录或退出。 */ }
}
export function removeMobileSnapshot(scope: SnapshotScope | null, kind: keyof SnapshotData) {
  if (!isMobileScopeCurrent(scope)) return;
  try { sessionStorage.removeItem(`${PREFIX}${scope.key}:${kind}`); } catch { /* 清理失败不阻断业务。 */ }
}
export function saveMobileSnapshot<K extends keyof SnapshotData>(scope: SnapshotScope | null, kind: K, data: SnapshotData[K]): boolean {
  if (!isMobileScopeCurrent(scope)) return false;
  try {
    const active = sessionStorage.getItem(ACTIVE);
    if (active && active !== scope.key) clearMobileSnapshots();
    // 再次按白名单投影，调用方传入额外字段也不会写入存储。
    const safe = kind === 'todo' ? (() => {
      const value = data as MobileTodoSummary;
      return { total: value.total, counts: { pending: value.counts.pending, completed: value.counts.completed, myApplications: value.counts.myApplications },
        tasks: value.tasks.slice(0, 20).map(({ id, taskName, processName, applicantName, createTime, dueDate, priority, status }) =>
          ({ id, taskName, processName, applicantName, createTime, dueDate, priority, status })) };
    })() : (() => {
      const value = data as MobileDashboardSummary;
      return { stats: { pendingTasks: value.stats.pendingTasks, todaySchedules: value.stats.todaySchedules, unreadMessages: value.stats.unreadMessages },
        tasks: value.tasks.slice(0, 5).map(({ taskId, taskName, processName, applicant, deadline, priority, status }) =>
          ({ taskId, taskName, processName, applicant, deadline, priority, status })),
        schedules: value.schedules.slice(0, 50).map(({ eventId, title, startTime, roomId }) => ({ eventId, title, startTime, roomId })) };
    })();
    sessionStorage.setItem(`${PREFIX}${scope.key}:${kind}`, JSON.stringify({ scope: scope.key, savedAt: Date.now(), data: safe }));
    sessionStorage.setItem(ACTIVE, scope.key);
    return true;
  } catch { return false; }
}
export function readMobileSnapshot<K extends keyof SnapshotData>(scope: SnapshotScope | null, kind: K): Snapshot<SnapshotData[K]> | null {
  if (!scope) return null;
  try {
    const key = `${PREFIX}${scope.key}:${kind}`;
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const saved = JSON.parse(raw) as Snapshot<SnapshotData[K]>;
    const age = Date.now() - saved.savedAt;
    if (saved.scope !== scope.key || !Number.isFinite(age) || age < 0 || age > MOBILE_SNAPSHOT_TTL) {
      sessionStorage.removeItem(key); return null;
    }
    if (!saved.data || typeof saved.data !== 'object') return null;
    if (kind === 'todo') {
      const data = saved.data as MobileTodoSummary;
      if (!Array.isArray(data.tasks) || !data.counts || typeof data.total !== 'number') return null;
    } else {
      const data = saved.data as MobileDashboardSummary;
      if (!Array.isArray(data.tasks) || !Array.isArray(data.schedules) || !data.stats) return null;
    }
    return saved;
  } catch { return null; }
}
// 启动失败时仅供独立只读页使用；此值不能作为登录身份或权限。
export function readLastMobileSnapshots() {
  try {
    const key = sessionStorage.getItem(ACTIVE);
    if (!key) return null;
    const scope = { key, version: -1 };
    const dashboard = readMobileSnapshot(scope, 'dashboard');
    const todo = readMobileSnapshot(scope, 'todo');
    return dashboard || todo ? { dashboard, todo } : null;
  } catch { return null; }
}
