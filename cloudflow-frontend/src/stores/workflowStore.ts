import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { 
  WorkflowDefinition, FormDefinition, Task, UnifiedTask, User, Role 
} from '../types';

// ============================================================
// 工作流全局状态管理 (Zustand)
// ============================================================

/** 工作流设计器状态 */
interface WorkflowDesignState {
  /** 当前编辑的工作流 */
  currentWorkflow: WorkflowDefinition | null;
  /** 所有工作流定义列表 */
  workflows: WorkflowDefinition[];
  /** 所有表单定义列表 */
  forms: FormDefinition[];
  /** 可用角色列表 */
  roles: Array<{ id: string; name: string; key: string }>;
  /** 可用用户列表 */
  users: User[];
  /** 是否有未保存的更改 */
  isDirty: boolean;
  /** 全局 loading 状态 */
  loading: boolean;
  /** 全局错误信息 */
  error: string | null;
}

/** 任务管理状态 */
interface TaskState {
  /** 待办任务列表 */
  todoTasks: UnifiedTask[];
  /** 已完成任务列表 */
  completedTasks: UnifiedTask[];
  /** 我的申请列表 */
  myApplications: UnifiedTask[];
  /** 任务统计 */
  tasksCount: { pending: number; completed: number; myApplications: number };
  /** 当前选中的任务 */
  selectedTask: UnifiedTask | null;
  /** 任务筛选条件 */
  taskFilter: {
    type: 'ALL' | 'PROCESS' | 'WORK';
    status: string;
    keyword: string;
  };
}

/** 用户和权限状态 */
interface AuthState {
  /** 当前登录用户 */
  currentUser: User | null;
  /** 用户权限列表 */
  permissions: string[];
  /** 是否已认证 */
  isAuthenticated: boolean;
}

/** 完整的应用状态 */
interface AppState extends WorkflowDesignState, TaskState, AuthState {
  // === 工作流设计器 Actions ===
  setCurrentWorkflow: (wf: WorkflowDefinition | null) => void;
  setWorkflows: (wfs: WorkflowDefinition[]) => void;
  setForms: (forms: FormDefinition[]) => void;
  setRoles: (roles: Array<{ id: string; name: string; key: string }>) => void;
  setUsers: (users: User[]) => void;
  setDirty: (dirty: boolean) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;

  // === 任务管理 Actions ===
  setTodoTasks: (tasks: UnifiedTask[]) => void;
  setCompletedTasks: (tasks: UnifiedTask[]) => void;
  setMyApplications: (tasks: UnifiedTask[]) => void;
  setTasksCount: (count: { pending: number; completed: number; myApplications: number }) => void;
  setSelectedTask: (task: UnifiedTask | null) => void;
  setTaskFilter: (filter: Partial<TaskState['taskFilter']>) => void;

  // === 用户和权限 Actions ===
  setCurrentUser: (user: User | null) => void;
  setPermissions: (permissions: string[]) => void;
  login: (user: User, permissions: string[]) => void;
  logout: () => void;

  // === 工具方法 ===
  /** 检查用户是否有指定权限 */
  hasPermission: (permission: string) => boolean;
  /** 检查用户是否有指定角色 */
  hasRole: (role: Role) => boolean;
  /** 重置所有状态 */
  reset: () => void;
}

const initialWorkflowState: WorkflowDesignState = {
  currentWorkflow: null,
  workflows: [],
  forms: [],
  roles: [],
  users: [],
  isDirty: false,
  loading: false,
  error: null,
};

const initialTaskState: TaskState = {
  todoTasks: [],
  completedTasks: [],
  myApplications: [],
  tasksCount: { pending: 0, completed: 0, myApplications: 0 },
  selectedTask: null,
  taskFilter: { type: 'ALL', status: '', keyword: '' },
};

const initialAuthState: AuthState = {
  currentUser: null,
  permissions: [],
  isAuthenticated: false,
};

/**
 * 全局应用状态 Store
 * 使用 Zustand 管理，支持 devtools 调试和部分状态持久化
 */
export const useAppStore = create<AppState>()(
  devtools(
    (set, get) => ({
      // === 初始状态 ===
      ...initialWorkflowState,
      ...initialTaskState,
      ...initialAuthState,

      // === 工作流设计器 Actions ===
      setCurrentWorkflow: (wf) => set({ currentWorkflow: wf, isDirty: false }),
      setWorkflows: (workflows) => set({ workflows }),
      setForms: (forms) => set({ forms }),
      setRoles: (roles) => set({ roles }),
      setUsers: (users) => set({ users }),
      setDirty: (isDirty) => set({ isDirty }),
      setLoading: (loading) => set({ loading }),
      setError: (error) => set({ error }),

      // === 任务管理 Actions ===
      setTodoTasks: (todoTasks) => set({ todoTasks }),
      setCompletedTasks: (completedTasks) => set({ completedTasks }),
      setMyApplications: (myApplications) => set({ myApplications }),
      setTasksCount: (tasksCount) => set({ tasksCount }),
      setSelectedTask: (selectedTask) => set({ selectedTask }),
      setTaskFilter: (filter) => set((state) => ({
        taskFilter: { ...state.taskFilter, ...filter }
      })),

      // === 用户和权限 Actions ===
      setCurrentUser: (currentUser) => set({ currentUser }),
      setPermissions: (permissions) => set({ permissions }),
      login: (user, permissions) => set({
        currentUser: user,
        permissions,
        isAuthenticated: true,
      }),
      logout: () => set({
        ...initialAuthState,
        ...initialTaskState,
      }),

      // === 工具方法 ===
      hasPermission: (permission) => {
        return get().permissions.includes(permission);
      },
      hasRole: (role) => {
        return get().currentUser?.role === role;
      },
      reset: () => set({
        ...initialWorkflowState,
        ...initialTaskState,
      }),
    }),
    { name: 'cloudflow-store' }
  )
);

/**
 * 选择器 Hooks - 避免不必要的重渲染
 */
export const useCurrentWorkflow = () => useAppStore((s) => s.currentWorkflow);
export const useWorkflows = () => useAppStore((s) => s.workflows);
export const useForms = () => useAppStore((s) => s.forms);
export const useIsDirty = () => useAppStore((s) => s.isDirty);
export const useGlobalLoading = () => useAppStore((s) => s.loading);
export const useGlobalError = () => useAppStore((s) => s.error);
export const useTodoTasks = () => useAppStore((s) => s.todoTasks);
export const useTasksCount = () => useAppStore((s) => s.tasksCount);
export const useTaskFilter = () => useAppStore((s) => s.taskFilter);
export const useCurrentUser = () => useAppStore((s) => s.currentUser);
export const useIsAuthenticated = () => useAppStore((s) => s.isAuthenticated);
