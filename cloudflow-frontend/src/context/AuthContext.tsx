import React, { createContext, useContext, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ForcePasswordChangeDialog } from '@/components/auth/ForcePasswordChangeDialog';
import { User } from '@/types';
import { getInfo, logout as logoutApi, switchTenant as switchTenantApi, type UserInfo } from '@/services/api/auth';
import { logger } from '@/utils/logger';
import { clearAuthSession } from '@/utils/sessionCleanup';
import { setAuthToken, setStoredAuthUser } from '@/utils/authStorage';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (token: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<User | null>;
  clearForcePasswordChange: () => void;
  switchTenant: (tenantId: number) => Promise<void>;
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
          setStoredAuthUser(currentUser);
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
        setStoredAuthUser(currentUser);
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
      setStoredAuthUser(nextUser);
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
    try {
      const response = await switchTenantApi(tenantId);
      // Store new token in memory for WebSocket connections
      setAuthToken(response.token);

      const userInfo = await getInfo();
      if (userInfo) {
        const updatedUser = buildAuthUser(userInfo);
        setUser(updatedUser);
        setStoredAuthUser(updatedUser);
        toast.success(`已切换到${updatedUser.tenantName || `租户 ${tenantId}`}`);
      } else {
        toast.success(`已切换到租户 ${tenantId}`);
      }

      window.location.reload();
    } catch (error) {
      logger.error('租户切换失败:', error);
      toast.error('租户切换失败，请重试');
      throw error;
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refreshUser, clearForcePasswordChange, switchTenant }}>
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
