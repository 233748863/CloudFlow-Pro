import React, { Component, ErrorInfo, ReactNode } from 'react';
import { RefreshCw, Home } from 'lucide-react';
import { errorReporter } from '@/services/errorReporter';
import { Button } from './button';
import { Result500 } from './result';

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
 * 防止整个应用崩溃，统一渲染 <Result500 /> 错误页。
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

    this.props.onError?.(error, errorInfo);

    errorReporter.captureError(error, {
      componentStack: errorInfo.componentStack || undefined,
      context: `ErrorBoundary: ${this.props.title || '未知组件'}`,
    });
  }

  handleRetry = () => {
    window.location.reload();
  };

  handleGoHome = () => {
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const { showRetry = true, showHome = true, title } = this.props;

      return (
        <Result500
          title={title}
          error={this.state.error}
          showStack={import.meta.env.DEV}
          extra={
            <>
              {showRetry && (
                <Button onClick={this.handleRetry}>
                  <RefreshCw size={14} />
                  重试
                </Button>
              )}
              {showHome && (
                <Button variant="outline" onClick={this.handleGoHome}>
                  <Home size={14} />
                  返回首页
                </Button>
              )}
            </>
          }
        />
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
