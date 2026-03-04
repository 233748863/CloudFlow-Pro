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
    /** 重置基线键（如实体ID）；变化时不触发保存，仅更新比较基准 */
    resetKey?: unknown;
    /** 自定义相等判断（默认 Object.is） */
    isEqual?: (prev: T, next: T) => boolean;
  } = {}
) {
  const {
    delay = 3000,
    enabled = true,
    onSuccess,
    onError,
    resetKey,
    isEqual = Object.is,
  } = options;
  const setDirty = useAppStore((s) => s.setDirty);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const dataRef = useRef<T>(data);
  const isSavingRef = useRef(false);
  const initializedRef = useRef(false);
  const resetKeyRef = useRef<unknown>(resetKey);

  useEffect(() => {
    if (!enabled) return;

    // 首次启用自动保存时建立基线，不立即保存
    if (!initializedRef.current) {
      initializedRef.current = true;
      dataRef.current = data;
      resetKeyRef.current = resetKey;
      return;
    }

    // 当外部实体切换（如 workflowId/formId 变化）时，重置基线，不触发自动保存
    if (resetKeyRef.current !== resetKey) {
      resetKeyRef.current = resetKey;
      dataRef.current = data;
      return;
    }

    // 数据未变化
    if (isEqual(dataRef.current, data)) return;

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
  }, [data, delay, enabled, onSave, onSuccess, onError, setDirty, resetKey, isEqual]);

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
