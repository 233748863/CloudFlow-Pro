import { QueryClient, hashKey } from '@tanstack/react-query';
import { getCurrentUserSnapshot } from '@/utils/authStorage';

/**
 * 全局 queryKey 哈希函数（多租户改造 P3.1）。
 *
 * - 把当前登录用户的 tenantId 拼到 hashKey 的前缀
 * - 所有 useQuery / useMutation 不需要任何改动，自动按租户隔离缓存
 * - 切换租户时只要 queryClient.clear() 旧的缓存即可彻底清空（见 AuthContext.switchTenant）
 * - 未登录或 SSR 场景 tenantId 为空字符串，等价于"全局缓存"
 */
const tenantAwareQueryKeyHashFn = (queryKey: readonly unknown[]): string => {
  const tenantId = getCurrentUserSnapshot()?.tenantId ?? '';
  return `t${tenantId}|${hashKey(queryKey)}`;
};

/**
 * React Query 全局配置
 * 用于数据缓存、自动重试、后台刷新等
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // queryKey 自动按租户隔离
      queryKeyHashFn: tenantAwareQueryKeyHashFn,
      // 数据缓存时间 (5 分钟)
      staleTime: 5 * 60 * 1000,
      // 缓存保留时间 (10 分钟)
      gcTime: 10 * 60 * 1000,
      // 失败后重试次数
      retry: 1,
      // 重试延迟 (指数退避)
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
      // 窗口重新获得焦点时重新获取数据
      refetchOnWindowFocus: false,
      // 网络重新连接时重新获取数据
      refetchOnReconnect: true,
      // 组件挂载时重新获取数据
      refetchOnMount: true,
    },
    mutations: {
      // 失败后重试次数
      retry: 0,
    },
  },
});

/**
 * Query Keys 常量 - 统一管理查询键
 */
export const queryKeys = {
  // 工作流相关
  workflows: ['workflows'] as const,
  workflow: (id: string) => ['workflow', id] as const,
  
  // 表单相关
  forms: ['forms'] as const,
  form: (id: string) => ['form', id] as const,
  
  // 任务相关
  todoTasks: ['tasks', 'todo'] as const,
  completedTasks: ['tasks', 'completed'] as const,
  myApplications: ['tasks', 'applications'] as const,
  tasksCount: ['tasks', 'count'] as const,
  task: (id: string) => ['task', id] as const,
  
  // 流程实例相关
  processInstance: (id: string) => ['processInstance', id] as const,
  processTrace: (id: string) => ['processTrace', id] as const,
  myInstances: ['processInstances', 'my'] as const,
  
  // 用户和角色
  users: ['users'] as const,
  roles: ['roles'] as const,
  currentUser: ['user', 'current'] as const,
};
