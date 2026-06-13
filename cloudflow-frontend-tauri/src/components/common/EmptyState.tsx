import React from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ClipboardList,
  FileText,
  Inbox,
  Lock,
  Plus,
  Search,
  SquareKanban,
} from 'lucide-react';
import { Button } from './button';
import { cn } from '@/utils/cn';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title?: string;
  description?: string;
  message?: string;
  actionText?: string;
  onAction?: () => void;
  actionTo?: string;
  actionIcon?: boolean;
  action?: React.ReactNode;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title = '暂无数据',
  description = '',
  message,
  actionText,
  onAction,
  actionTo,
  actionIcon = true,
  action,
  className,
}) => (
  <div className={cn('empty-state', className)}>
    <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-2xl bg-slate-100 dark:bg-slate-900">
      {icon || <Inbox className="empty-state-icon h-10 w-10" />}
    </div>
    <h3 className="empty-state-title">{title}</h3>
    {(description || message) ? <p className="empty-state-description">{description || message}</p> : null}
    {action ? (
      <div className="mt-6">{action}</div>
    ) : actionText ? (
      <div className="mt-6">
        {actionTo ? (
          <Link className="btn btn-primary btn-md" to={actionTo}>
            {actionIcon ? <Plus className="mr-2 h-4 w-4" /> : null}
            {actionText}
          </Link>
        ) : (
          <Button onClick={onAction}>
            {actionIcon ? <Plus className="mr-2 h-4 w-4" /> : null}
            {actionText}
          </Button>
        )}
      </div>
    ) : null}
  </div>
);

export const EmptyData: React.FC<{ onRefresh?: () => void }> = ({ onRefresh }) => (
  <EmptyState
    icon={<Inbox className="empty-state-icon h-10 w-10" />}
    title="暂无数据"
    description="当前没有可显示的数据"
    actionText={onRefresh ? '刷新' : undefined}
    onAction={onRefresh}
  />
);

export const EmptyTasks: React.FC<{ onCreate?: () => void }> = ({ onCreate }) => (
  <EmptyState
    icon={<ClipboardList className="empty-state-icon h-10 w-10" />}
    title="暂无任务"
    description="您目前没有待处理的任务"
    actionText={onCreate ? '创建任务' : undefined}
    onAction={onCreate}
  />
);

export const EmptyWorkflows: React.FC<{ onCreate?: () => void }> = ({ onCreate }) => (
  <EmptyState
    icon={<SquareKanban className="empty-state-icon h-10 w-10" />}
    title="暂无流程"
    description="还没有创建任何流程定义"
    actionText={onCreate ? '创建流程' : undefined}
    onAction={onCreate}
  />
);

export const EmptyForms: React.FC<{ onCreate?: () => void }> = ({ onCreate }) => (
  <EmptyState
    icon={<FileText className="empty-state-icon h-10 w-10" />}
    title="暂无表单"
    description="还没有创建任何表单定义"
    actionText={onCreate ? '创建表单' : undefined}
    onAction={onCreate}
  />
);

export const EmptySearch: React.FC<{ query?: string; onClear?: () => void }> = ({ query, onClear }) => (
  <EmptyState
    icon={<Search className="empty-state-icon h-10 w-10" />}
    title="未找到结果"
    description={query ? `没有找到与“${query}”相关的结果` : '没有找到匹配的结果'}
    actionText={onClear ? '清除搜索' : undefined}
    onAction={onClear}
  />
);

export const EmptyError: React.FC<{ onRetry?: () => void }> = ({ onRetry }) => (
  <EmptyState
    icon={<AlertTriangle className="empty-state-icon h-10 w-10 text-rose-500" />}
    title="加载失败"
    description="数据加载失败，请稍后重试"
    actionText={onRetry ? '重试' : undefined}
    onAction={onRetry}
  />
);

export const EmptyPermission: React.FC = () => (
  <EmptyState
    icon={<Lock className="empty-state-icon h-10 w-10 text-amber-500" />}
    title="权限不足"
    description="您没有权限访问此内容"
  />
);
