import { useEffect, useCallback } from 'react';
import { useAppStore } from '../stores/workflowStore';

/**
 * 离开页面确认 Hook
 * 当有未保存的更改时，阻止用户离开页面
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

  // 路由跳转确认（需要配合 React Router 使用）
  const confirmNavigation = useCallback(() => {
    if (!enabled || !isDirty) return true;
    return window.confirm('您有未保存的更改，确定要离开吗？');
  }, [enabled, isDirty]);

  return { isDirty, confirmNavigation };
}
