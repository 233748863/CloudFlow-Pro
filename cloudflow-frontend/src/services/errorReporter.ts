/**
 * 前端错误上报服务
 * 
 * 将捕获到的错误上报到后端日志收集接口，便于生产环境排查问题。
 * 同时预留 Sentry 等第三方服务的接入口。
 * 
 * 使用方式：
 *   import { errorReporter } from '@/services/errorReporter';
 *   errorReporter.captureError(error, { componentStack, context: '页面名' });
 */

/** 错误上报的额外上下文信息 */
interface ErrorContext {
  /** React 组件堆栈 */
  componentStack?: string;
  /** 错误发生的上下文描述 */
  context?: string;
  /** 额外的标签信息 */
  tags?: Record<string, string>;
  /** 额外数据 */
  extra?: Record<string, unknown>;
}

/** 错误上报记录（发送到后端的数据结构） */
interface ErrorReport {
  /** 错误消息 */
  message: string;
  /** 错误堆栈 */
  stack?: string;
  /** 组件堆栈 */
  componentStack?: string;
  /** 上下文描述 */
  context?: string;
  /** 页面URL */
  url: string;
  /** 用户代理 */
  userAgent: string;
  /** 时间戳 */
  timestamp: string;
  /** 错误级别 */
  level: 'error' | 'warning' | 'info';
  /** 标签 */
  tags?: Record<string, string>;
  /** 额外数据 */
  extra?: Record<string, unknown>;
}

class ErrorReporter {
  /** 上报接口地址（后端日志收集端点） */
  private endpoint = '/oa/error-report';

  /** 是否启用上报（仅生产环境默认启用） */
  private enabled: boolean;

  /** 防抖：同一错误短时间内不重复上报 */
  private reportedErrors = new Set<string>();
  private readonly DEDUP_INTERVAL = 60_000; // 60秒内同一错误不重复上报

  constructor() {
    this.enabled = import.meta.env.PROD;
    this.setupGlobalHandlers();
  }

  /**
   * 上报一个错误
   * 
   * @param error 错误对象
   * @param context 额外上下文
   */
  captureError(error: Error, context?: ErrorContext): void {
    if (!error) return;

    // 去重检查
    const errorKey = `${error.message}:${error.stack?.slice(0, 200)}`;
    if (this.reportedErrors.has(errorKey)) {
      return;
    }
    this.reportedErrors.add(errorKey);
    setTimeout(() => this.reportedErrors.delete(errorKey), this.DEDUP_INTERVAL);

    const report: ErrorReport = {
      message: error.message,
      stack: error.stack,
      componentStack: context?.componentStack,
      context: context?.context,
      url: window.location.href,
      userAgent: navigator.userAgent,
      timestamp: new Date().toISOString(),
      level: 'error',
      tags: context?.tags,
      extra: context?.extra,
    };

    // 控制台输出（开发环境始终输出）
    if (import.meta.env.DEV) {
      console.group('[ErrorReporter] 捕获到错误');
      console.error('消息:', report.message);
      console.error('堆栈:', report.stack);
      if (report.componentStack) {
        console.error('组件堆栈:', report.componentStack);
      }
      if (report.context) {
        console.info('上下文:', report.context);
      }
      console.groupEnd();
    }

    // 生产环境上报到后端
    if (this.enabled) {
      this.sendReport(report);
    }
  }

  /**
   * 上报一条警告信息
   */
  captureWarning(message: string, context?: ErrorContext): void {
    const report: ErrorReport = {
      message,
      url: window.location.href,
      userAgent: navigator.userAgent,
      timestamp: new Date().toISOString(),
      level: 'warning',
      context: context?.context,
      tags: context?.tags,
      extra: context?.extra,
    };

    if (this.enabled) {
      this.sendReport(report);
    }
  }

  /**
   * 手动启用/禁用上报
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * 设置自定义上报端点
   */
  setEndpoint(endpoint: string): void {
    this.endpoint = endpoint;
  }

  /**
   * 注册全局错误处理器
   * 捕获未被 try-catch 或 ErrorBoundary 捕获的错误
   */
  private setupGlobalHandlers(): void {
    // 捕获未处理的 JS 错误
    window.addEventListener('error', (event) => {
      // 忽略资源加载错误（如图片404）
      if (event.target && (event.target as HTMLElement).tagName) {
        return;
      }
      this.captureError(
        event.error || new Error(event.message),
        { context: '全局未捕获错误 (window.onerror)' }
      );
    });

    // 捕获未处理的 Promise rejection
    window.addEventListener('unhandledrejection', (event) => {
      const error = event.reason instanceof Error
        ? event.reason
        : new Error(String(event.reason));
      this.captureError(error, { context: '未处理的Promise拒绝 (unhandledrejection)' });
    });
  }

  /**
   * 发送错误报告到后端
   * 使用 navigator.sendBeacon 确保页面关闭时也能发送
   * 降级为 fetch
   */
  private sendReport(report: ErrorReport): void {
    const payload = JSON.stringify(report);

    try {
      // 优先使用 sendBeacon（不阻塞页面卸载）
      if (navigator.sendBeacon) {
        const blob = new Blob([payload], { type: 'application/json' });
        const sent = navigator.sendBeacon(this.endpoint, blob);
        if (sent) return;
      }

      // 降级为 fetch
      fetch(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        // 使用 keepalive 确保页面关闭时请求不被取消
        keepalive: true,
      }).catch(() => {
        // 上报失败静默处理，不影响用户体验
      });
    } catch {
      // 上报失败静默处理
    }
  }
}

/** 全局单例 */
export const errorReporter = new ErrorReporter();
