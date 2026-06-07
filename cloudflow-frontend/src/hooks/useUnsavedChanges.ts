import { useEffect } from 'react';
import { useAppStore } from '../stores/workflowStore';

/**
 * 离开页面确认 Hook
 * 当有未保存的更改时，通过浏览器原生提示阻止刷新/关闭页面。
 */
export function useUnsavedChanges(enabled: boolean = true) {
  const isDirty = useAppStore((s) => s.isDirty);

  // 浏览器刷新/关闭确认
  useEffect(() => {
    if (!enabled || !isDirty) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = ''; // Chrome 需要设置 returnValue
      return ''; // 其他浏览器
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [enabled, isDirty]);

  return { isDirty };
}
