import React, { createContext, useContext, useState, useEffect } from 'react';
import { toast } from 'sonner';
import { User } from '@/types';
import { getInfo } from '@/services/api/auth';
import { logger } from '@/utils/logger';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (token: string) => Promise<void>;
  logout: () => void;
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
            setUser({
              id: String(userInfo.userId),
              name: userInfo.nickName || userInfo.userName,
              email: userInfo.email || '',
              role: userInfo.role,
              status: 'ACTIVE',
              avatar: userInfo.avatar
            });
          }
        } catch (e) {
          logger.error('Failed to get user info:', e);
          localStorage.removeItem('token');
          toast.error('登录状态已过期，请重新登录');
        }
      }
      setLoading(false);
    };
    initAuth();
  }, []);

  const login = async (token: string) => {
    localStorage.setItem('token', token);
    const userInfo = await getInfo();
    if (userInfo) {
      setUser({
        id: String(userInfo.userId),
        name: userInfo.nickName || userInfo.userName,
        email: userInfo.email || '',
        role: userInfo.role,
        status: 'ACTIVE',
        avatar: userInfo.avatar
      });
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
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
