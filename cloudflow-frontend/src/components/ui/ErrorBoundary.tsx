import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

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
    
    // 生产环境可以上报错误
    if (import.meta.env.PROD) {
      // TODO: 接入错误上报服务 (如 Sentry)
      console.error('[ErrorBoundary] Caught error:', error.message);
    } else {
      console.error('[ErrorBoundary] Error:', error);
      console.error('[ErrorBoundary] Component Stack:', errorInfo.componentStack);
    }
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
        <div className="min-h-[400px] flex items-center justify-center p-8">
          <div className="max-w-md w-full text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
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
                <pre className="mt-2 p-3 bg-slate-50 rounded-lg text-xs text-red-600 overflow-auto max-h-48 border border-slate-200">
                  {this.state.error.stack}
                </pre>
                {this.state.errorInfo?.componentStack && (
                  <pre className="mt-2 p-3 bg-slate-50 rounded-lg text-xs text-slate-500 overflow-auto max-h-32 border border-slate-200">
                    {this.state.errorInfo.componentStack}
                  </pre>
                )}
              </details>
            )}

            <div className="flex items-center justify-center gap-3">
              {showRetry && (
                <button
                  onClick={this.handleRetry}
                  className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
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
