import { useEffect, useRef, useCallback } from 'react';

/**
 * 定时轮询 Hook
 * 用于定时刷新数据
 */

interface UsePollingOptions {
  /** 轮询间隔（毫秒），默认 30000 (30秒) */
  interval?: number;
  /** 是否立即执行一次，默认 true */
  immediate?: boolean;
  /** 是否启用轮询，默认 true */
  enabled?: boolean;
  /** 错误处理回调 */
  onError?: (error: Error) => void;
}

/**
 * 定时轮询 Hook
 * @param callback 要执行的回调函数
 * @param options 配置选项
 * @returns 控制函数 { start, stop, refresh }
 */
export function usePolling(
  callback: () => void | Promise<void>,
  options: UsePollingOptions = {}
) {
  const {
    interval = 30000,
    immediate = true,
    enabled = true,
    onError,
  } = options;

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const callbackRef = useRef(callback);
  const isRunningRef = useRef(false);

  // 更新回调引用
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  // 执行回调的包装函数
  const execute = useCallback(async () => {
    if (isRunningRef.current) return;

    try {
      isRunningRef.current = true;
      await callbackRef.current();
    } catch (error) {
      onError?.(error as Error);
    } finally {
      isRunningRef.current = false;
    }
  }, [onError]);

  // 启动轮询
  const start = useCallback(() => {
    if (timerRef.current) return;

    if (immediate) {
      execute();
    }

    timerRef.current = setInterval(() => {
      execute();
    }, interval);
  }, [interval, immediate, execute]);

  // 停止轮询
  const stop = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // 手动刷新
  const refresh = useCallback(() => {
    execute();
  }, [execute]);

  // 自动启动/停止
  useEffect(() => {
    if (enabled) {
      start();
    } else {
      stop();
    }

    return () => {
      stop();
    };
  }, [enabled, start, stop]);

  return { start, stop, refresh };
}

/**
 * 任务列表定时刷新 Hook
 * 专门用于任务列表的定时刷新
 */
export function useTaskListPolling(
  refreshCallback: () => void | Promise<void>,
  interval = 30000
) {
  return usePolling(refreshCallback, {
    interval,
    immediate: true,
    enabled: true,
  });
}
