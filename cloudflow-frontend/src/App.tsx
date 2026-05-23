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

setNavigator((to, opts) => {
  void router.navigate(to, { replace: opts?.replace });
});

function AppInner() {
  useEffect(() => {
    restoreUnlockedBodyScroll();
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
