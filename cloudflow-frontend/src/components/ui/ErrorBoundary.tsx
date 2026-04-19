import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { errorReporter } from '@/services/errorReporter';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  /** 显示重试按钮 */
  showRetry?: boolean;
  /** 显示返回首页按钮 */
  showHome?: boolean;
  /** 自定义标题 */
  title?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

/**
 * 错误边界组件 - 捕获子组件树中的 JavaScript 错误
 * 防止整个应用崩溃，显示友好的错误界面
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });
    
    // 调用外部错误处理回调
    this.props.onError?.(error, errorInfo);
    
    // 上报错误到错误收集服务
    errorReporter.captureError(error, {
      componentStack: errorInfo.componentStack || undefined,
      context: `ErrorBoundary: ${this.props.title || '未知组件'}`,
    });
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  handleGoHome = () => {
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      // 使用自定义 fallback
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const { showRetry = true, showHome = true, title = '页面出现了问题' } = this.props;

      return (
        <div className="flex min-h-[400px] items-center justify-center p-6">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-[0_18px_36px_rgba(15,23,42,0.08)] ring-1 ring-slate-200/70">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50">
              <AlertTriangle className="text-red-500" size={32} />
            </div>
            <h2 className="text-xl font-bold text-slate-800 mb-2">{title}</h2>
            <p className="text-sm text-slate-500 mb-6">
              {this.state.error?.message || '发生了未知错误，请稍后重试'}
            </p>
            
            {/* 开发环境显示错误堆栈 */}
            {import.meta.env.DEV && this.state.error && (
              <details className="mb-6 text-left">
                <summary className="text-xs text-slate-400 cursor-pointer hover:text-slate-600">
                  查看错误详情
                </summary>
                <pre className="mt-2 max-h-48 overflow-auto rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-red-600">
                  {this.state.error.stack}
                </pre>
                {this.state.errorInfo?.componentStack && (
                  <pre className="mt-2 max-h-32 overflow-auto rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
                    {this.state.errorInfo.componentStack}
                  </pre>
                )}
              </details>
            )}

            <div className="flex items-center justify-center gap-3">
              {showRetry && (
                <button
                  onClick={this.handleRetry}
                  className="flex items-center gap-2 rounded-xl bg-cyan-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-cyan-700"
                >
                  <RefreshCw size={14} />
                  重试
                </button>
              )}
              {showHome && (
                <button
                  onClick={this.handleGoHome}
                  className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-600 text-sm font-medium rounded-lg hover:bg-slate-200 transition-colors"
                >
                  <Home size={14} />
                  返回首页
                </button>
              )}
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * 页面级错误边界 - 用于包裹整个页面
 */
export const PageErrorBoundary: React.FC<{ children: ReactNode }> = ({ children }) => (
  <ErrorBoundary
    title="页面加载失败"
    showRetry={true}
    showHome={true}
  >
    {children}
  </ErrorBoundary>
);

/**
 * 组件级错误边界 - 用于包裹单个组件
 */
export const ComponentErrorBoundary: React.FC<{ children: ReactNode; name?: string }> = ({ children, name }) => (
  <ErrorBoundary
    title={name ? `${name}加载失败` : '组件加载失败'}
    showRetry={true}
    showHome={false}
  >
    {children}
  </ErrorBoundary>
);
