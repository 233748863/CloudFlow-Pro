import React, { createContext, useContext, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ForcePasswordChangeDialog } from '@/components/auth/ForcePasswordChangeDialog';
import { User } from '@/types';
import { getInfo, logout as logoutApi, switchTenant as switchTenantApi, type UserInfo } from '@/services/api/auth';
import { logger } from '@/utils/logger';
import { clearAuthSession } from '@/utils/sessionCleanup';
import { setAuthToken, setCurrentUserSnapshot } from '@/utils/authStorage';
import { queryClient } from '@/lib/queryClient';
import { tenantStorage } from '@/utils/tenantStorage';
import { resetWorkflowDesignCaches } from '@/pages/WorkflowDesign';
import { resetWsTopicHandlers } from '@/hooks/useWebSocket';
import { clearEmployeeResolverCache } from '@/services/api/hr/self-service';
import { useAnnouncementStore } from '@/stores/announcementStore';

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
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

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
    const initAuth = async () => {
      const currentPath = window.location.pathname;
      const shouldSkipProbe = currentPath === '/login' || currentPath === '/register';
      if (shouldSkipProbe) {
        setLoading(false);
        return;
      }

      try {
        const userInfo = await getInfo();
        if (userInfo) {
          const currentUser = buildAuthUser(userInfo);
          setUser(currentUser);
          setCurrentUserSnapshot(currentUser);
        }
      } catch (error) {
        logger.error('Failed to get user info:', error);
        clearAuthSession();
      }

      setLoading(false);
    };

    void initAuth();
  }, []);

  const refreshUser = async () => {
    try {
      const userInfo = await getInfo();
      if (userInfo) {
        const currentUser = buildAuthUser(userInfo);
        setUser(currentUser);
        setCurrentUserSnapshot(currentUser);
        return currentUser;
      }
      return null;
    } catch (error) {
      logger.error('获取用户信息失败:', error);
      clearAuthSession();
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
    // Store token in memory for WebSocket connections (httpOnly cookie handles HTTP requests)
    setAuthToken(token);
    await refreshUser();
  };

  const logout = async () => {
    try {
      await logoutApi();
    } catch (error) {
      logger.warn('调用登出接口失败，继续执行本地退出', error);
    }

    clearAuthSession();
    setUser(null);
  };

  const switchTenant = async (tenantId: number) => {
    // 切换前先记下当前租户，用于切换成功后清理其它租户的 localStorage 桶
    const previousTenantId = user?.tenantId ?? null;
    try {
      const response = await switchTenantApi(tenantId);
      // Store new token in memory for WebSocket connections
      setAuthToken(response.token);

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
        // getInfo 失败兜底也要尽量清旧桶
        try {
          tenantStorage.purgeOther(tenantId);
        } catch {
          // ignore
        }
        toast.success(`已切换到租户 ${tenantId}`);
      }
      // P2-1：取消 window.location.reload() 全页刷新，React Context 已更新即可触发树重渲染
    } catch (error) {
      logger.error('租户切换失败:', error);
      // 切换失败时不动 RQ 缓存与 localStorage（保持原状），仅提示
      void previousTenantId;
      toast.error('租户切换失败，请重试');
      throw error;
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refreshUser, clearForcePasswordChange, switchTenant, hasPermission }}>
      {children}
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
