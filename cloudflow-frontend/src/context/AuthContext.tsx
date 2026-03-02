import React, { createContext, useContext, useState, useEffect } from 'react';
import { toast } from 'sonner';
import { User } from '@/types';
import { getInfo, logout as logoutApi, switchTenant as switchTenantApi } from '@/services/api/auth';
import { logger } from '@/utils/logger';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (token: string) => Promise<void>;
  logout: () => Promise<void>;
  switchTenant: (tenantId: number) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      const token = localStorage.getItem('token');
      if (token) {
        try {
          const userInfo = await getInfo();
          if (userInfo) {
            const user = {
              id: String(userInfo.userId),
              name: userInfo.nickName || userInfo.userName,
              username: userInfo.userName,
              email: userInfo.email || '',
              role: userInfo.role,
              deptId: userInfo.deptId,
              deptName: userInfo.deptName,
              tenantId: userInfo.tenantId,
              position: userInfo.position,
              phone: userInfo.phone,
              status: 'ACTIVE' as const,
              avatar: userInfo.avatar
            };
            setUser(user);
            // 保存用户信息到 localStorage，供 axios 拦截器使用
            localStorage.setItem('user', JSON.stringify(user));
          }
        } catch (e) {
          logger.error('Failed to get user info:', e);
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          toast.error('登录状态已过期，请重新登录');
        }
      }
      setLoading(false);
    };
    initAuth();
  }, []);

  const login = async (token: string) => {
    // 先保存 token
    localStorage.setItem('token', token);
    
    try {
      // 调用 getInfo 获取用户信息
      const userInfo = await getInfo();
      if (userInfo) {
        const user = {
          id: String(userInfo.userId),
          name: userInfo.nickName || userInfo.userName,
          username: userInfo.userName,
          email: userInfo.email || '',
          role: userInfo.role,
          deptId: userInfo.deptId,
          deptName: userInfo.deptName,
          tenantId: userInfo.tenantId,
          position: userInfo.position,
          phone: userInfo.phone,
          status: 'ACTIVE' as const,
          avatar: userInfo.avatar
        };
        setUser(user);
        // 保存用户信息到 localStorage，供 axios 拦截器使用
        localStorage.setItem('user', JSON.stringify(user));
      }
    } catch (error) {
      // 如果获取用户信息失败，清除 token 和用户信息
      logger.error('获取用户信息失败:', error);
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      throw error;
    }
  };

  const logout = async () => {
    const token = localStorage.getItem('token');
    if (token) {
      try {
        // 先通知后端清理 token/缓存，再做本地清理
        await logoutApi();
      } catch (error) {
        // 登出接口失败不阻塞本地退出，避免用户被“卡住”
        logger.warn('调用登出接口失败，继续执行本地退出:', error);
      }
    }

    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  };

  const switchTenant = async (tenantId: number) => {
    try {
      // 调用租户切换API
      const response = await switchTenantApi(tenantId);
      
      // 更新token
      localStorage.setItem('token', response.token);
      
      // 重新获取用户信息
      const userInfo = await getInfo();
      if (userInfo) {
        const updatedUser = {
          id: String(userInfo.userId),
          name: userInfo.nickName || userInfo.userName,
          username: userInfo.userName,
          email: userInfo.email || '',
          role: userInfo.role,
          deptId: userInfo.deptId,
          deptName: userInfo.deptName,
          tenantId: userInfo.tenantId,
          position: userInfo.position,
          phone: userInfo.phone,
          status: 'ACTIVE' as const,
          avatar: userInfo.avatar
        };
        setUser(updatedUser);
        localStorage.setItem('user', JSON.stringify(updatedUser));
      }
      
      toast.success(`已切换到租户 ${tenantId}`);
      
      // 刷新页面以重新加载数据
      window.location.reload();
    } catch (error) {
      logger.error('租户切换失败:', error);
      toast.error('租户切换失败，请重试');
      throw error;
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, switchTenant }}>
      {children}
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
