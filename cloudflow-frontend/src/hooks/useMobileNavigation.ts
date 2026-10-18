import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Home, ListTodo, MessageSquare, User } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { getUnreadCount } from '@/services/api/notice';
import { getTasksCount } from '@/services/api/workflow';
import type { MobileTabItem } from '@/components/mobile/MobileTabBar';

export const useMobileNavigation = (enabled: boolean, messagePath = '/message/mine'): MobileTabItem[] => {
  const { user, hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const canReadMessages = hasPermission('system:message:mine:list');
  const canCountTasks = hasPermission('workflow:task:count');
  const queryScope = ['mobile-navigation', user?.tenantId, user?.id];
  const messages = useQuery({ queryKey: [...queryScope, 'messages'], queryFn: getUnreadCount, enabled: enabled && Boolean(user) && canReadMessages, refetchInterval: 30000, staleTime: 10000, retry: false });
  const tasks = useQuery({ queryKey: [...queryScope, 'tasks'], queryFn: getTasksCount, enabled: enabled && Boolean(user) && canCountTasks, refetchInterval: 30000, staleTime: 10000, retry: false });

  useEffect(() => {
    if (!enabled || !user) return;
    const refresh = () => { void queryClient.invalidateQueries({ queryKey: ['mobile-navigation', user.tenantId, user.id] }); };
    window.addEventListener('sys-notice-received', refresh);
    window.addEventListener('cloudflow:messages-read', refresh);
    return () => {
      window.removeEventListener('sys-notice-received', refresh);
      window.removeEventListener('cloudflow:messages-read', refresh);
    };
  }, [enabled, user?.tenantId, user?.id, queryClient]);

  return [
    { key: 'workplace', label: '工作台', path: '/', icon: Home },
    { key: 'tasks', label: '待办', path: '/tasks', icon: ListTodo, badge: tasks.data?.pending, disabled: !hasPermission('workflow:task:todo') },
    { key: 'messages', label: '消息', path: messagePath, icon: MessageSquare, badge: messages.data, disabled: !canReadMessages },
    { key: 'profile', label: '我的', path: '/profile', icon: User, disabled: !hasPermission('system:user:profile:view') },
  ];
};
