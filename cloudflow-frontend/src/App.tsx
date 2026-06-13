import React, { useEffect } from 'react';
import { RouterProvider } from 'react-router-dom';
import { Toaster } from 'sonner';
import { QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from './components/ErrorBoundary';
import { CustomTitleBar } from './components/layout/CustomTitleBar';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { router } from './router';
import { restoreUnlockedBodyScroll } from './utils/bodyScrollLock';
import { queryClient } from './lib/queryClient';
import { subscribeWsTopic, unsubscribeWsTopic } from './hooks/useWebSocket';
import { setNavigator } from './utils/navigation';
import { preloadConfigs } from './hooks/useSystemConfig';
import { SYS_PAGE_DEFAULT_PAGE_SIZE } from './constants/sysConfig';
import { dictDataApi } from './services/api/dict';
import { transformDictData } from './utils/dictMapper';
import { queryKeys } from './lib/queryClient';
import { isTauriRuntime } from './services/desktopConfig';

setNavigator((to, opts) => {
  void router.navigate(to, { replace: opts?.replace });
});

function AppInner() {
  const { user } = useAuth();

  useEffect(() => {
    restoreUnlockedBodyScroll();
  }, []);

  useEffect(() => {
    if (!user) {
      return;
    }

    // 预热常用系统配置，命中后 getConfigIntSync 可在 useState 初值场景同步返回真实值
    void preloadConfigs([SYS_PAGE_DEFAULT_PAGE_SIZE]);

    // 预加载常用字典，减少首次渲染时的 loading 闪烁
    // 包含全部 P0/P1 字典（共 13 个）— React Query staleTime 10 分钟
    // 这些字典体积小（每个 ≤ 8 项），首屏并行预热请求总耗时 < 200ms
    const commonDicts = [
      // P0 - 业务驱动（员工/合同/发票/薪资/线索/请求）
      'employee_status',
      'employee_type',
      'request_status',
      'contract_status',
      'invoice_status',
      'salary_slip_status',
      'crm_lead_status',
      // P1 - 运营配置（风险等级/公告/工作流）
      'severity_level',
      'announcement_status',
      'announcement_type',
      'announcement_priority',
      'workflow_status',
      'workflow_definition_status',
    ];

    commonDicts.forEach((dictType) => {
      queryClient.prefetchQuery({
        queryKey: queryKeys.dict(dictType),
        queryFn: async () => {
          const rawData = await dictDataApi.getByType(dictType);
          return transformDictData(rawData);
        },
        staleTime: 10 * 60 * 1000, // 10 分钟
      });
    });
  }, [user]);

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
  const appInner = isTauriRuntime() ? (
    <div className="cf-desktop-shell">
      <CustomTitleBar />
      <div className="cf-desktop-content">
        <AppInner />
      </div>
    </div>
  ) : (
    <AppInner />
  );

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <AuthProvider>
            {appInner}
            <Toaster />
          </AuthProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
