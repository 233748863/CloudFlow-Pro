// Token 由 httpOnly cookie 携带于 HTTP 请求；为 WebSocket 握手（不带 cookie）保留 in-memory 副本。
let inMemoryToken: string | null = null;

export const getAuthToken = (): string | null => inMemoryToken;

export const setAuthToken = (token: string) => {
  inMemoryToken = token;
};

export const removeAuthToken = () => {
  inMemoryToken = null;
};

// ============================================================
// 当前登录用户 in-memory 快照（P1-2：单一 source of truth = AuthContext）
// 仅由 AuthContext 写入；request.ts / ProcessTrace / hr-self-service 等非 React 调用方读取。
// 刷新页面后失效，由 AuthContext 重新调 /auth/me 拉取。
// ============================================================
export interface CurrentUserSnapshot {
  id?: string | number;
  userId?: string | number;
  tenantId?: string | number | null;
  forcePasswordChange?: boolean;
}

let currentUserSnapshot: CurrentUserSnapshot | null = null;

export const getCurrentUserSnapshot = (): CurrentUserSnapshot | null => currentUserSnapshot;

export const setCurrentUserSnapshot = (user: CurrentUserSnapshot | null) => {
  currentUserSnapshot = user;
};

export const clearCurrentUserSnapshot = () => {
  currentUserSnapshot = null;
};
