import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { CanceledError } from 'axios';
import { toast } from 'sonner';
import { ForcePasswordChangeDialog } from '@/components/auth/ForcePasswordChangeDialog';
import { User } from '@/types';
import { getInfo, logout as logoutApi, switchTenant as switchTenantApi, type UserInfo } from '@/services/api/auth';
import { logger } from '@/utils/logger';
import { clearAuthSession } from '@/utils/sessionCleanup';
import { getAuthSessionVersion, invalidateAuthRequests, setAuthToken, setCurrentUserSnapshot } from '@/utils/authStorage';
import { Button } from '@/components/common/button';
import { ResultPage } from '@/components/common/ResultPage';
import { clearBackendMenuQueries, getBackendMenuQueryKey, queryClient } from '@/lib/queryClient';
import { tenantStorage } from '@/utils/tenantStorage';
import { resetWorkflowDesignCaches } from '@/pages/workflowDesignCache';
import { resetWsTopicHandlers } from '@/hooks/useWebSocket';
import { clearEmployeeResolverCache } from '@/services/api/hr/self-service';
import { useAnnouncementStore } from '@/stores/announcementStore';
import { clearMobileSnapshots, readLastMobileSnapshots } from '@/utils/mobileSnapshots';
import { useNetworkStatus } from '@/hooks/useOffline';
const MobileOfflineWorkspace = React.lazy(() => import('@/mobile/pages/MobileOfflineWorkspace'));

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (token: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<User | null>;
  clearForcePasswordChange: () => void;
  switchTenant: (tenantId: number) => Promise<void>;
  hasPermission: (permission: string | string[], requireAll?: boolean) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const buildAuthUser = (userInfo: UserInfo): User => ({
  id: String(userInfo.userId),
  name: userInfo.nickName || userInfo.userName,
  username: userInfo.userName,
  email: userInfo.email || '',
  role: userInfo.role,
  deptId: userInfo.deptId,
  deptName: userInfo.deptName,
  tenantId: userInfo.tenantId,
  tenantName: userInfo.tenantName,
  position: userInfo.position,
  phone: userInfo.phone,
  status: userInfo.status || 'ACTIVE',
  createTime: userInfo.createTime,
  avatar: userInfo.avatar,
  permissions: userInfo.permissions || [],
  forcePasswordChange: userInfo.forcePasswordChange,
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const isOnline = useNetworkStatus();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [initializationFailed, setInitializationFailed] = useState(false);
  const [initializationAttempt, setInitializationAttempt] = useState(0);
  const operation = useRef(0);
  const mounted = useRef(false);

  useEffect(() => {
    if (isOnline && initializationFailed) setInitializationAttempt(value => value + 1);
  }, [isOnline]);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const hasPermission = (permission: string | string[], requireAll = false) => {
    const permissionList = Array.isArray(permission) ? permission : [permission];
    const userPermissions = user?.permissions || [];
    const check = (item: string) =>
      userPermissions.includes(item)
      || userPermissions.includes('*:*:*')
      || userPermissions.includes('*');
    return requireAll ? permissionList.every(check) : permissionList.some(check);
  };

  useEffect(() => {
    let active = true;
    const currentOperation = operation.current;
    const version = getAuthSessionVersion();
    const isCurrent = () => active && currentOperation === operation.current && version === getAuthSessionVersion();
    const initAuth = async () => {
      const currentPath = window.location.pathname;
      const shouldSkipProbe = currentPath.endsWith('/login') || currentPath.endsWith('/register')
        || currentPath === '/portal' || currentPath.startsWith('/portal/');
      if (shouldSkipProbe) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setInitializationFailed(false);
      try {
        const userInfo = await getInfo({ silent: true });
        if (isCurrent()) {
          const currentUser = buildAuthUser(userInfo);
          setUser(currentUser);
          setCurrentUserSnapshot(currentUser);
        }
      } catch {
        if (isCurrent()) setInitializationFailed(true);
      } finally {
        if (isCurrent()) setLoading(false);
      }
    };

    void initAuth();
    return () => { active = false; };
  }, [initializationAttempt]);

  useEffect(() => {
    const handleAuthExpired = () => {
      operation.current++;
      useAnnouncementStore.getState().reset();
      setInitializationFailed(false);
      setLoading(false);
      setUser(null);
    };

    window.addEventListener('cloudflow:auth-expired', handleAuthExpired);
    return () => window.removeEventListener('cloudflow:auth-expired', handleAuthExpired);
  }, []);

  const refreshUser = async () => {
    const currentOperation = operation.current;
    const version = getAuthSessionVersion();
    const isCurrent = () => mounted.current && currentOperation === operation.current && version === getAuthSessionVersion();
    try {
      const userInfo = await getInfo();
      if (!isCurrent()) throw new CanceledError('登录身份已变化，请重新读取');
      if (userInfo) {
        const currentUser = buildAuthUser(userInfo);
        setCurrentUserSnapshot(currentUser);
        void queryClient.cancelQueries({ queryKey: getBackendMenuQueryKey(currentUser.tenantId, currentUser.id), exact: true });
        void queryClient.invalidateQueries({ queryKey: getBackendMenuQueryKey(currentUser.tenantId, currentUser.id), exact: true });
        setUser(currentUser);
        setInitializationFailed(false);
        setLoading(false);
        return currentUser;
      }
      return null;
    } catch (error) {
      if (isCurrent()) logger.error('获取用户信息失败:', error);
      throw error;
    }
  };

  const clearForcePasswordChange = () => {
    setUser((prev) => {
      if (!prev) {
        return prev;
      }
      const nextUser = { ...prev, forcePasswordChange: false };
      setCurrentUserSnapshot(nextUser);
      return nextUser;
    });
  };

  const login = async (token: string) => {
    operation.current++;
    useAnnouncementStore.getState().reset();
    clearMobileSnapshots();
    clearBackendMenuQueries();
    // Store token in memory for HTTP Authorization and WebSocket AUTH frame.
    setAuthToken(token);
    setCurrentUserSnapshot(null);
    setUser(null);
    setInitializationFailed(false);
    await refreshUser();
  };

  const logout = async () => {
    const currentOperation = ++operation.current;
    const version = invalidateAuthRequests();
    useAnnouncementStore.getState().reset();
    clearMobileSnapshots();
    setCurrentUserSnapshot(null);
    setUser(null);
    setInitializationFailed(false);
    setLoading(false);
    try {
      await logoutApi();
    } catch (error) {
      logger.warn('调用登出接口失败，继续执行本地退出', error);
    }

    if (currentOperation === operation.current && version === getAuthSessionVersion()) {
      clearAuthSession();
      if (mounted.current) setUser(null);
    }
  };

  const switchTenant = async (tenantId: number) => {
    const currentOperation = ++operation.current;
    let version = invalidateAuthRequests();
    const isCurrent = () => mounted.current && currentOperation === operation.current && version === getAuthSessionVersion();
    setLoading(true);
    setInitializationFailed(false);
    let tenantChanged = false;
    // 切换前先记下当前租户，用于切换成功后清理其它租户的 localStorage 桶
    const previousTenantId = user?.tenantId ?? null;
    try {
      const response = await switchTenantApi(tenantId);
      if (!isCurrent()) throw new CanceledError('登录身份已变化，请重新读取');
      tenantChanged = true;
      clearMobileSnapshots();
      setUser(null);
      setCurrentUserSnapshot(null);
      // Store new token in memory for WebSocket connections
      setAuthToken(response.token);
      version = getAuthSessionVersion();

      // 切换租户=换"会话身份"，把上一个租户在 RQ 中缓存的所有数据清干净，避免串数据
      // queryKey 已带 tenantId 维度（lib/queryClient.ts 的 queryKeyHashFn），
      // 不 clear 也不会读到旧租户数据，但旧缓存会一直占内存且首次切回时仍会用旧值，
      // 一律 clear 是最稳妥的做法。
      queryClient.clear();

      // 清模块级（module-scope）缓存：这些不属于 RQ / localStorage / React state，
      // queryClient.clear() / tenantStorage.purgeOther() 都覆盖不到，
      // 必须显式调用各自的 reset/clear，否则跨租户切换会读到旧租户 Promise/Map 值。
      resetWorkflowDesignCaches();
      resetWsTopicHandlers();
      clearEmployeeResolverCache();
      useAnnouncementStore.getState().reset();

      const userInfo = await getInfo();
      if (!isCurrent()) throw new CanceledError('登录身份已变化，请重新读取');
      if (userInfo) {
        const updatedUser = buildAuthUser(userInfo);
        setUser(updatedUser);
        setCurrentUserSnapshot(updatedUser);

        // 清掉旧租户 localStorage 桶（侧边栏折叠、已读公告 id、api 缓存等）
        // 注意要在 setCurrentUserSnapshot 之后调用，purgeOther 用"当前租户 id"做白名单
        try {
          tenantStorage.purgeOther(updatedUser.tenantId ?? null);
        } catch {
          // 清理失败不影响切换主流程
        }

        // WebSocket 自动重连：useWebSocket 依赖 user 引用变化，setUser 后会自动 close 老连接 + 重发 AUTH 帧
        toast.success(`已切换到${updatedUser.tenantName || `租户 ${tenantId}`}`);
      } else {
        throw new Error('无法确认切换后的身份');
      }
      // P2-1：取消 window.location.reload() 全页刷新，React Context 已更新即可触发树重渲染
    } catch (error) {
      if (!isCurrent()) throw error;
      if (tenantChanged) {
        clearAuthSession();
        version = getAuthSessionVersion();
        setUser(null);
      } else {
        setInitializationFailed(true);
      }
      logger.error('租户切换失败:', error);
      void previousTenantId;
      toast.error('租户切换结果未确认，请重新验证当前身份');
      throw error;
    } finally {
      if (isCurrent()) setLoading(false);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refreshUser, clearForcePasswordChange, switchTenant, hasPermission }}>
      {initializationFailed && !isOnline && readLastMobileSnapshots() ? <React.Suspense fallback={<p role="status">正在读取离线摘要…</p>}>
        <MobileOfflineWorkspace onRetry={() => setInitializationAttempt(value => value + 1)} onLogout={() => { void logout(); }} />
      </React.Suspense> : initializationFailed ? <ResultPage status="network" title="身份验证暂不可用"
        subTitle="当前无法读取登录信息，业务页面暂不开放，请重试或退出登录。"
        extra={<><Button className="min-h-11" onClick={() => setInitializationAttempt(value => value + 1)}>重新验证</Button>
          <Button className="min-h-11" variant="outline" onClick={() => { void logout(); }}>退出登录</Button></>} /> : children}
      <ForcePasswordChangeDialog
        open={Boolean(user?.forcePasswordChange)}
        clearForcePasswordChange={clearForcePasswordChange}
        onChanged={async () => {
          return refreshUser();
        }}
        onLogout={logout}
      />
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
