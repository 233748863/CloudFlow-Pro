import { useEffect, useRef } from 'react';
import { useAppStore } from '../stores/workflowStore';

/**
 * 自动保存 Hook
 * 当数据变化时，延迟一段时间后自动保存
 */
export function useAutoSave<T>(
  data: T,
  onSave: (data: T) => Promise<void>,
  options: {
    /** 延迟时间（毫秒），默认 3000ms */
    delay?: number;
    /** 是否启用自动保存，默认 true */
    enabled?: boolean;
    /** 保存成功回调 */
    onSuccess?: () => void;
    /** 保存失败回调 */
    onError?: (error: Error) => void;
  } = {}
) {
  const { delay = 3000, enabled = true, onSuccess, onError } = options;
  const setDirty = useAppStore((s) => s.setDirty);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const dataRef = useRef<T>(data);
  const isSavingRef = useRef(false);

  useEffect(() => {
    // 数据未变化或未启用自动保存
    if (!enabled || dataRef.current === data) return;

    dataRef.current = data;
    setDirty(true);

    // 清除之前的定时器
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    // 设置新的定时器
    timerRef.current = setTimeout(async () => {
      if (isSavingRef.current) return;

      try {
        isSavingRef.current = true;
        await onSave(data);
        setDirty(false);
        onSuccess?.();
      } catch (error) {
        onError?.(error as Error);
      } finally {
        isSavingRef.current = false;
      }
    }, delay);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [data, delay, enabled, onSave, onSuccess, onError, setDirty]);

  // 手动触发保存
  const saveNow = async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    if (isSavingRef.current) return;

    try {
      isSavingRef.current = true;
      await onSave(dataRef.current);
      setDirty(false);
      onSuccess?.();
    } catch (error) {
      onError?.(error as Error);
    } finally {
      isSavingRef.current = false;
    }
  };

  return { saveNow };
}
