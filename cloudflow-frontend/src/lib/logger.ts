/**
 * 统一日志系统
 * 生产环境自动静默，开发环境正常输出
 * 支持日志级别、模块标签、结构化日志
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const LOG_COLORS: Record<LogLevel, string> = {
  debug: '#9CA3AF',
  info: '#3B82F6',
  warn: '#F59E0B',
  error: '#EF4444',
};

const isDev = import.meta.env.DEV;

/** 当前最低日志级别：开发环境 debug，生产环境 error */
const currentLevel: LogLevel = isDev ? 'debug' : 'error';

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[currentLevel];
}

function formatTime(): string {
  return new Date().toLocaleTimeString('zh-CN', { hour12: false });
}

/**
 * 创建带模块标签的日志器
 * @param module 模块名称
 * @returns 日志器对象
 */
export function createLogger(module: string) {
  const prefix = `[${module}]`;

  return {
    debug: (...args: unknown[]) => {
      if (!shouldLog('debug')) return;
      console.log(
        `%c${formatTime()} ${prefix} [DEBUG]`,
        `color: ${LOG_COLORS.debug}; font-weight: normal`,
        ...args
      );
    },

    info: (...args: unknown[]) => {
      if (!shouldLog('info')) return;
      console.log(
        `%c${formatTime()} ${prefix} [INFO]`,
        `color: ${LOG_COLORS.info}; font-weight: bold`,
        ...args
      );
    },

    warn: (...args: unknown[]) => {
      if (!shouldLog('warn')) return;
      console.warn(
        `%c${formatTime()} ${prefix} [WARN]`,
        `color: ${LOG_COLORS.warn}; font-weight: bold`,
        ...args
      );
    },

    error: (...args: unknown[]) => {
      if (!shouldLog('error')) return;
      console.error(
        `%c${formatTime()} ${prefix} [ERROR]`,
        `color: ${LOG_COLORS.error}; font-weight: bold`,
        ...args
      );
    },

    /** 记录 API 调用 */
    api: (method: string, url: string, data?: unknown) => {
      if (!shouldLog('debug')) return;
      console.log(
        `%c${formatTime()} ${prefix} [API] ${method} ${url}`,
        'color: #8B5CF6; font-weight: bold',
        data ?? ''
      );
    },

    /** 记录性能指标 */
    perf: (label: string, durationMs: number) => {
      if (!shouldLog('debug')) return;
      const color = durationMs > 1000 ? '#EF4444' : durationMs > 300 ? '#F59E0B' : '#10B981';
      console.log(
        `%c${formatTime()} ${prefix} [PERF] ${label}: ${durationMs.toFixed(1)}ms`,
        `color: ${color}; font-weight: bold`
      );
    },

    /** 分组日志 */
    group: (label: string, fn: () => void) => {
      if (!shouldLog('debug')) return;
      console.group(`${prefix} ${label}`);
      fn();
      console.groupEnd();
    },

    /** 表格日志 */
    table: (data: unknown) => {
      if (!shouldLog('debug')) return;
      console.table(data);
    },
  };
}

// 预定义的模块日志器
export const logWorkflow = createLogger('Workflow');
export const logForm = createLogger('Form');
export const logTask = createLogger('Task');
export const logAuth = createLogger('Auth');
export const logApi = createLogger('API');
export const logStore = createLogger('Store');
export const logRouter = createLogger('Router');
