/**
 * 组件 Props 类型定义
 * 统一管理所有组件的 Props 接口，确保类型安全
 */

import { FormDefinition, WorkflowDefinition, Task, UnifiedTask, User } from '../types';

// ============================================================
// 页面组件 Props
// ============================================================

/** TaskListPage 页面 Props */
export interface TaskListPageProps {
  /** 任务类型：待办 / 我的申请 */
  type: 'pending' | 'applications';
}

// ============================================================
// 业务组件 Props
// ============================================================

/** WorkflowBuilder 组件 Props */
export interface WorkflowBuilderProps {
  /** 初始流程定义 */
  workflow?: WorkflowDefinition;
  /** 流程变更回调 */
  onChange?: (workflow: WorkflowDefinition) => void;
  /** 保存回调 */
  onSave?: (workflow: WorkflowDefinition) => void;
  /** 可用表单列表 */
  availableForms?: FormDefinition[];
  /** 可用角色列表 */
  availableRoles?: RoleBrief[];
  /** 可用用户列表 */
  availableUsers?: User[];
}

/** FormBuilder 组件 Props */
export interface FormBuilderProps {
  /** 保存回调 */
  onSave: (form: FormDefinition) => void;
  /** 初始表单定义 */
  initialForm?: FormDefinition;
}

/** TaskList 组件 Props */
export interface TaskListProps {
  /** 任务列表 */
  tasks: Task[];
  /** 任务点击回调 */
  onTaskClick: (task: Task) => void;
}

/** TaskBoard 组件 Props */
export interface TaskBoardProps {
  /** 统一任务列表 */
  tasks: UnifiedTask[];
  /** 任务移动回调 */
  onTaskMove: (taskId: string, newStatus: string) => void;
  /** 任务点击回调 */
  onTaskClick: (task: UnifiedTask) => void;
}

/** TaskHandleModal 组件 Props */
export interface TaskHandleModalProps {
  /** 是否打开 */
  isOpen: boolean;
  /** 当前任务 */
  task: Task | null;
  /** 可用表单列表 */
  availableForms: FormDefinition[];
  /** 当前用户 */
  currentUser: User;
  /** 关闭回调 */
  onClose: () => void;
  /** 完成回调 */
  onComplete: () => void;
}

/** ProcessTrace 组件 Props */
export interface ProcessTraceProps {
  /** 流程实例 ID */
  instanceId: string;
  /** 关闭回调 */
  onClose: () => void;
}

/** DynamicFormViewer 组件 Props */
export interface DynamicFormViewerProps {
  /** 表单定义 */
  formDef: FormDefinition;
  /** 表单数据 */
  data: Record<string, unknown>;
}

/** FormRenderer 组件 Props */
export interface FormRendererProps {
  /** 表单定义 */
  formDef: FormDefinition;
  /** 表单数据 */
  data: Record<string, unknown>;
  /** 数据变更回调 */
  onChange: (data: Record<string, unknown>) => void;
  /** 是否只读 */
  readOnly?: boolean;
}

/** SourceCodeViewer 组件 Props */
export interface SourceCodeViewerProps {
  /** 流程定义 */
  workflow: WorkflowDefinition;
}

// ============================================================
// UI 组件 Props
// ============================================================

/** EmptyState 基础 Props */
export interface EmptyStateProps {
  /** 图标 */
  icon?: React.ReactNode;
  /** 标题 */
  title: string;
  /** 描述 */
  description?: string;
  /** 操作按钮文本 */
  actionText?: string;
  /** 操作回调 */
  onAction?: () => void;
}

/** Skeleton 组件 Props */
export interface SkeletonProps {
  /** 自定义类名 */
  className?: string;
  /** 宽度 */
  width?: string | number;
  /** 高度 */
  height?: string | number;
}

/** SkeletonForm Props */
export interface SkeletonFormProps {
  /** 字段数量 */
  fields?: number;
}

/** VirtualList 组件 Props */
export interface VirtualListProps<T> {
  /** 数据列表 */
  items: T[];
  /** 每项高度 */
  itemHeight: number;
  /** 列表高度 */
  height: number;
  /** 列表宽度 */
  width?: number | string;
  /** 渲染函数 */
  renderItem: (item: T, index: number) => React.ReactNode;
  /** 空状态组件 */
  emptyComponent?: React.ReactNode;
}

/** UserSelector 组件 Props */
export interface UserSelectorProps {
  /** 已选用户 ID 列表 */
  value: string[];
  /** 变更回调 */
  onChange: (userIds: string[]) => void;
  /** 是否多选 */
  multiple?: boolean;
  /** 是否禁用 */
  disabled?: boolean;
  /** 占位符 */
  placeholder?: string;
}

/** RoleSelector 组件 Props */
export interface RoleSelectorProps {
  /** 已选角色 ID 列表 */
  value: string[];
  /** 变更回调 */
  onChange: (roleIds: string[]) => void;
  /** 是否多选 */
  multiple?: boolean;
  /** 是否禁用 */
  disabled?: boolean;
  /** 占位符 */
  placeholder?: string;
}

/** PermissionGuard 组件 Props */
export interface PermissionGuardProps {
  /** 子组件 */
  children: React.ReactNode;
  /** 所需权限列表 */
  requiredPermissions?: string[];
  /** 所需角色列表 */
  requiredRoles?: string[];
  /** 是否需要管理员权限 */
  requireAdmin?: boolean;
  /** 无权限时的降级组件 */
  fallback?: React.ReactNode;
}

/** RouteGuard 组件 Props */
export interface RouteGuardProps {
  /** 子组件 */
  children: React.ReactNode;
  /** 所需权限列表 */
  requiredPermissions?: string[];
  /** 所需角色列表 */
  requiredRoles?: string[];
  /** 是否需要认证 */
  requireAuth?: boolean;
  /** 重定向路径 */
  redirectTo?: string;
}

/** ErrorBoundary 组件 Props */
export interface ErrorBoundaryProps {
  /** 子组件 */
  children: React.ReactNode;
  /** 自定义降级 UI */
  fallback?: React.ReactNode;
  /** 错误处理回调 */
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
  /** 标题 */
  title?: string;
  /** 是否显示重试按钮 */
  showRetry?: boolean;
  /** 是否显示返回首页按钮 */
  showHome?: boolean;
}

// ============================================================
// 移动端组件 Props
// ============================================================

/** MobileTaskHandler 组件 Props */
export interface MobileTaskHandlerProps {
  /** 当前任务 */
  task: Task;
  /** 完成回调 */
  onComplete: () => void;
  /** 关闭回调 */
  onClose: () => void;
}

/** MobileProcessTrace 组件 Props */
export interface MobileProcessTraceProps {
  /** 流程实例 ID */
  instanceId: string;
  /** 关闭回调 */
  onClose: () => void;
}

/** MobileFormRenderer 组件 Props */
export interface MobileFormRendererProps {
  /** 表单定义 */
  formDef: FormDefinition;
  /** 表单数据 */
  data: Record<string, unknown>;
  /** 数据变更回调 */
  onChange?: (data: Record<string, unknown>) => void;
  /** 是否只读 */
  readOnly?: boolean;
  /** 提交回调 */
  onSubmit?: (data: Record<string, unknown>) => void;
}

// ============================================================
// 辅助类型
// ============================================================

/** 角色简要信息 */
export interface RoleBrief {
  id: string;
  name: string;
  key?: string;
  roleKey?: string;
}

/** 用户简要信息 */
export interface UserBrief {
  id: string;
  name: string;
  username?: string;
  avatar?: string;
}

/** 分页参数 */
export interface PaginationParams {
  page: number;
  pageSize: number;
  total?: number;
}

/** API 响应包装 */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  code?: number;
}

/** 列表 API 响应 */
export interface ListResponse<T = unknown> {
  list: T[];
  total: number;
  page: number;
  pageSize: number;
}
