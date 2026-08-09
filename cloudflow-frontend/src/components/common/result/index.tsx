import React from 'react';
import { Copy } from 'lucide-react';
import { toast } from 'sonner';
import { ResultPage } from '../ResultPage';

/** 登录已过期（默认按钮：重新登录） */
export const Result401: React.FC<{
  title?: string;
  subTitle?: string;
  extra?: React.ReactNode;
}> = (props) => <ResultPage status="401" {...props} />;

/** 无访问权限（默认按钮：返回上一页 / 返回首页） */
export const Result403: React.FC<{
  title?: string;
  subTitle?: string;
  extra?: React.ReactNode;
}> = (props) => <ResultPage status="403" {...props} />;

/** 页面不存在（默认按钮：返回上一页 / 返回首页） */
export const Result404: React.FC<{
  title?: string;
  subTitle?: string;
  extra?: React.ReactNode;
}> = (props) => <ResultPage status="404" {...props} />;

interface Result500Props {
  title?: string;
  subTitle?: string;
  /** 错误对象，会用作 subTitle 兜底 & details 中展示 stack */
  error?: Error | null;
  /** 是否展示 stack（默认开发环境为 true） */
  showStack?: boolean;
  /** 替换默认按钮区 */
  extra?: React.ReactNode;
}

/** 服务器错误 / 路由 errorElement / ErrorBoundary 兜底 */
export const Result500: React.FC<Result500Props> = ({
  title,
  subTitle,
  error,
  showStack = import.meta.env.DEV,
  extra,
}) => {
  const effectiveSubTitle = subTitle ?? error?.message ?? undefined;
  const details =
    showStack && error?.stack ? (
      <details className="text-left">
        <summary className="cursor-pointer text-xs text-cf-faint hover:text-cf-muted">
          查看错误详情
        </summary>
        <pre className="mt-2 max-h-48 overflow-auto rounded-md border border-slate-200 bg-[var(--cf-surface-muted)] p-3 text-xs text-cf-muted dark:border-slate-800 dark:bg-slate-900">
          {error.stack}
        </pre>
      </details>
    ) : undefined;
  const copyButton = error ? (
    <button
      type="button"
      onClick={() => {
        const text = [error.message, error.stack].filter(Boolean).join('\n');
        void navigator.clipboard.writeText(text).then(() => toast.success('已复制'));
      }}
      className="mt-3 inline-flex items-center gap-1.5 text-xs text-cf-faint hover:text-cf-muted"
    >
      <Copy size={12} />
      复制报错信息
    </button>
  ) : undefined;

  return (
    <ResultPage
      status="500"
      title={title}
      subTitle={effectiveSubTitle}
      details={details || copyButton ? <>{details}{copyButton}</> : undefined}
      extra={extra}
    />
  );
};

/** 网络异常 */
export const ResultNetworkError: React.FC<{
  title?: string;
  subTitle?: string;
  extra?: React.ReactNode;
}> = (props) => <ResultPage status="network" {...props} />;

export { ResultPage } from '../ResultPage';
export type { ResultStatus } from '../ResultPage';
