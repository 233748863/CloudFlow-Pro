import React from 'react';
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Home,
  Lock,
  RefreshCw,
  SearchX,
  ServerCrash,
  WifiOff,
  ArrowLeft,
} from 'lucide-react';
import { Button } from './button';
import { cn } from '@/utils/cn';

export type ResultStatus =
  | '401'
  | '403'
  | '404'
  | '500'
  | 'network'
  | 'success'
  | 'warning';

interface StatusConfig {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  code: string;
  title: string;
  subTitle: string;
  iconWrap: string;
  iconColor: string;
}

const STATUS_MAP: Record<ResultStatus, StatusConfig> = {
  '401': {
    icon: Lock,
    code: '401',
    title: '登录已过期',
    subTitle: '您的登录状态已失效，请重新登录后继续。',
    iconWrap:
      'border-amber-200 bg-amber-50/80 dark:border-amber-900/70 dark:bg-amber-950/30',
    iconColor: 'text-amber-600 dark:text-amber-300',
  },
  '403': {
    icon: Ban,
    code: '403',
    title: '无访问权限',
    subTitle: '您当前的角色或权限不允许访问此页面。',
    iconWrap:
      'border-rose-200 bg-rose-50/80 dark:border-rose-900/70 dark:bg-rose-950/30',
    iconColor: 'text-rose-600 dark:text-rose-300',
  },
  '404': {
    icon: SearchX,
    code: '404',
    title: '页面不存在',
    subTitle: '当前地址没有对应页面，请返回首页或使用最新菜单重新进入。',
    iconWrap:
      'border-cyan-200 bg-cyan-50/80 dark:border-cyan-900/70 dark:bg-cyan-950/30',
    iconColor: 'text-cyan-600 dark:text-cyan-300',
  },
  '500': {
    icon: ServerCrash,
    code: '500',
    title: '页面加载失败',
    subTitle: '系统遇到问题，请稍后重试。如多次失败请联系管理员。',
    iconWrap:
      'border-cyan-200 bg-cyan-50/80 dark:border-cyan-900/70 dark:bg-cyan-950/30',
    iconColor: 'text-cyan-600 dark:text-cyan-300',
  },
  network: {
    icon: WifiOff,
    code: 'NETWORK',
    title: '网络连接异常',
    subTitle: '请检查网络后重试，或稍后再试。',
    iconWrap:
      'border-slate-200 bg-[var(--cf-surface-muted)] dark:border-slate-800 dark:bg-slate-900/50',
    iconColor: 'text-cf-subtle',
  },
  success: {
    icon: CheckCircle2,
    code: 'OK',
    title: '操作成功',
    subTitle: '',
    iconWrap:
      'border-emerald-200 bg-emerald-50/80 dark:border-emerald-900/70 dark:bg-emerald-950/30',
    iconColor: 'text-emerald-600 dark:text-emerald-300',
  },
  warning: {
    icon: AlertTriangle,
    code: '!',
    title: '需要注意',
    subTitle: '',
    iconWrap:
      'border-amber-200 bg-amber-50/80 dark:border-amber-900/70 dark:bg-amber-950/30',
    iconColor: 'text-amber-600 dark:text-amber-300',
  },
};

interface ResultPageProps {
  status: ResultStatus;
  title?: string;
  subTitle?: string;
  /** 按钮区，未传则按 status 渲染默认按钮 */
  extra?: React.ReactNode;
  /** 详细内容区（如开发态错误堆栈） */
  details?: React.ReactNode;
  /** true 时 fixed 占满视口；否则嵌入式渲染在父容器内 */
  fullscreen?: boolean;
  className?: string;
}

const DefaultExtra: React.FC<{ status: ResultStatus }> = ({ status }) => {
  const back = () => window.history.back();
  const home = () => {
    window.location.href = '/';
  };
  const reload = () => window.location.reload();
  const login = () => {
    window.location.href = '/login';
  };

  if (status === '401') {
    return (
      <Button onClick={login}>
        <Lock size={14} />
        重新登录
      </Button>
    );
  }
  if (status === '500' || status === 'network') {
    return (
      <>
        <Button onClick={reload}>
          <RefreshCw size={14} />
          重试
        </Button>
        <Button variant="outline" onClick={home}>
          <Home size={14} />
          返回首页
        </Button>
      </>
    );
  }
  if (status === 'success' || status === 'warning') {
    return null;
  }
  // 403 / 404
  return (
    <>
      <Button onClick={back}>
        <ArrowLeft size={14} />
        返回上一页
      </Button>
      <Button variant="outline" onClick={home}>
        <Home size={14} />
        返回首页
      </Button>
    </>
  );
};

/**
 * 统一的"结果页"组件（含错误页 401/403/404/500/network 与成功/警告态）。
 * 视觉规范沿用统一的后台结果面板风格，统一图标外框、按钮组合与暗黑模式。
 */
export const ResultPage: React.FC<ResultPageProps> = ({
  status,
  title,
  subTitle,
  extra,
  details,
  fullscreen = false,
  className,
}) => {
  const cfg = STATUS_MAP[status];
  const Icon = cfg.icon;

  const container = fullscreen
    ? 'fixed inset-0 z-[60] flex items-center justify-center bg-[var(--cf-bg)] px-6 py-10 dark:bg-slate-950'
    : 'flex min-h-[60vh] items-center justify-center bg-[var(--cf-surface-muted)]/80 px-6 py-10 dark:bg-slate-950/70';

  const effectiveTitle = title ?? cfg.title;
  const effectiveSubTitle = subTitle ?? cfg.subTitle;

  return (
    <div className={cn(container, className)}>
      <div className="card w-full max-w-2xl">
        <div className="p-4 px-6 py-7">
          <div
            className={cn(
              'mb-4 flex h-12 w-12 items-center justify-center rounded-md border',
              cfg.iconWrap,
            )}
          >
            <Icon size={24} className={cfg.iconColor} />
          </div>
          <div className="text-xs font-semibold text-cyan-600 dark:text-cyan-300">
            {cfg.code}
          </div>
          <h1 className="mt-3 text-xl font-semibold text-cf-title">
            {effectiveTitle}
          </h1>
          {effectiveSubTitle && (
            <p className="mt-3 max-w-xl text-sm leading-7 text-cf-muted">
              {effectiveSubTitle}
            </p>
          )}
          {details && <div className="mt-5">{details}</div>}
          <div className="mt-8 flex flex-col sm:flex-row flex-wrap gap-3">
            {extra ?? <DefaultExtra status={status} />}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ResultPage;
