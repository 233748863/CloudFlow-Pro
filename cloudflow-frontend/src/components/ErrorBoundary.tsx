import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCcw } from 'lucide-react';
import { errorReporter } from '@/services/errorReporter';

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
        <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-4">
          <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full text-center border border-slate-100">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4 text-red-500">
              <AlertTriangle size={32} />
            </div>
            <h1 className="text-2xl font-bold text-slate-800 mb-2">出错了</h1>
            <p className="text-slate-500 mb-6 text-sm">
              应用程序遇到意外错误。我们已记录此问题，请尝试刷新页面。
            </p>
            
            {/* Dev Only Error Details */}
            {import.meta.env.DEV && this.state.error && (
                <div className="text-left bg-slate-100 p-3 rounded text-xs font-mono text-red-600 mb-6 overflow-auto max-h-32">
                    {this.state.error.toString()}
                </div>
            )}

            <button
              onClick={this.handleReload}
              className="inline-flex items-center gap-2 px-6 py-2.5 bg-pink-500 text-white rounded-lg hover:bg-pink-600 transition-colors shadow-lg shadow-pink-100 font-medium"
            >
              <RefreshCcw size={18} />
              刷新页面
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
