import '@/index.css';
import '@/styles/unity2-refresh.css';
import '@/styles/mobile-foundation.css';
import React, { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import WorkflowTaskPage from '@/pages/WorkflowTaskPage';
import { setAuthToken } from '@/utils/authStorage';

declare global { interface Window { imTodoUiRefresh: () => Promise<unknown>; } }

function Probe() {
  const auth = useAuth();
  useEffect(() => { window.imTodoUiRefresh = () => auth.refreshUser(); }, [auth]);
  return <Routes><Route path="/workflow/task/:taskId" element={<WorkflowTaskPage />} />
    <Route path="/tasks" element={<p>待办列表入口</p>} /><Route path="/login" element={<p>登录入口</p>} /></Routes>;
}

setAuthToken('im-todo-ui-controlled');
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
createRoot(document.getElementById('root')!).render(<StrictMode><MemoryRouter initialEntries={[window.location.pathname]}>
  <QueryClientProvider client={queryClient}><AuthProvider><Probe /></AuthProvider></QueryClientProvider>
</MemoryRouter></StrictMode>);
