// Establish CSS layers in the same order as the application entry.
import '../../src/index.css';
import '../../src/styles/unity2-refresh.css';
import '../../src/styles/mobile-foundation.css';
import React, { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { AuthProvider, useAuth } from '../../src/context/AuthContext';
import MessageRecordPage from '../../src/pages/system/message/Record';
import { setNavigator } from '../../src/utils/navigation';

function Fixture() {
  const { loading, refreshUser } = useAuth();
  const navigate = useNavigate();
  useEffect(() => { setNavigator(navigate); }, [navigate]);
  if (loading) return <p>正在验证测试身份</p>;
  return <main className="min-w-0 p-4" data-testid="record-fixture-ready">
    <button type="button" onClick={() => void refreshUser()}>刷新验收权限</button>
    <MessageRecordPage />
    <Toaster />
  </main>;
}
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={queryClient}><MemoryRouter initialEntries={['/system/message/record']}>
    <AuthProvider><Fixture /></AuthProvider>
  </MemoryRouter></QueryClientProvider>,
);
