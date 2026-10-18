import '@/index.css';
import '@/styles/unity2-refresh.css';
import '@/styles/mobile-foundation.css';
import React, { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import ImConfigPage from '@/pages/system/ImConfigPage';
import { setAuthToken } from '@/utils/authStorage';

declare global { interface Window { imTodoManagementRefresh: () => Promise<unknown>; } }
function Probe() {
  const auth = useAuth();
  useEffect(() => { window.imTodoManagementRefresh = () => auth.refreshUser(); }, [auth]);
  return <ImConfigPage />;
}
setAuthToken('im-todo-management-controlled');
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
createRoot(document.getElementById('root')!).render(<MemoryRouter><QueryClientProvider client={queryClient}><AuthProvider><Probe /></AuthProvider></QueryClientProvider></MemoryRouter>);
