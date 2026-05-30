import React, { useEffect } from 'react';
import { RouterProvider } from 'react-router-dom';
import { Toaster } from 'sonner';
import { QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AuthProvider } from '@/context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { router } from './router';
import { restoreUnlockedBodyScroll } from './utils/bodyScrollLock';
import { queryClient } from './lib/queryClient';
import { subscribeWsTopic, unsubscribeWsTopic } from './hooks/useWebSocket';
import { setNavigator } from './utils/navigation';
import { preloadConfigs } from './hooks/useSystemConfig';
import { SYS_PAGE_DEFAULT_PAGE_SIZE } from './constants/sysConfig';

setNavigator((to, opts) => {
  void router.navigate(to, { replace: opts?.replace });
});

function AppInner() {
  useEffect(() => {
    restoreUnlockedBodyScroll();
  }, []);

  useEffect(() => {
    // 预热常用系统配置，命中后 getConfigIntSync 可在 useState 初值场景同步返回真实值
    void preloadConfigs([SYS_PAGE_DEFAULT_PAGE_SIZE]);
  }, []);

  useEffect(() => {
    subscribeWsTopic('workflow.task.completed', (payload: any) => {
      queryClient.invalidateQueries({ queryKey: ['business', payload?.businessType, payload?.businessId] });
      queryClient.invalidateQueries({ queryKey: ['workflow', 'todo'] });
      window.dispatchEvent(new CustomEvent('workflow-task-completed', { detail: payload }));
    });
    return () => unsubscribeWsTopic('workflow.task.completed');
  }, []);

  return (
    <RouterProvider router={router} />
  );
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <AuthProvider>
            <AppInner />
            <Toaster />
          </AuthProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
