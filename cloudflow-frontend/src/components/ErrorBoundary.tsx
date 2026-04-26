import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCcw } from 'lucide-react';
import { errorReporter } from '@/services/errorReporter';
import { Button } from '@/components/ui';

interface Props {
  children?: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public readonly props!: Readonly<Props>;

  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // 上报错误到错误收集服务
    errorReporter.captureError(error, {
      componentStack: errorInfo.componentStack || undefined,
      context: '顶层ErrorBoundary（应用级）',
    });
  }

  private handleReload = () => {
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
          return this.props.fallback;
      }
      
      return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50/80 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-[0_22px_44px_rgba(15,23,42,0.12)] ring-1 ring-slate-200/70">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 text-red-500">
              <AlertTriangle size={32} />
            </div>
            <h1 className="text-2xl font-bold text-slate-800 mb-2">出错了</h1>
            <p className="text-slate-500 mb-6 text-sm">
              应用程序遇到意外错误。我们已记录此问题，请尝试刷新页面。
            </p>
            
            {/* Dev Only Error Details */}
            {import.meta.env.DEV && this.state.error && (
                <div className="mb-6 max-h-32 overflow-auto rounded-xl border border-slate-200 bg-slate-50 p-3 text-left font-mono text-xs text-red-600">
                    {this.state.error.toString()}
                </div>
            )}

            <Button onClick={this.handleReload}>
              <RefreshCcw size={18} />
              刷新页面
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
