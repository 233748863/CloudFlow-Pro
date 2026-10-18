// Match the application entry: establish CSS layers before component CSS imports.
import '../../src/index.css';
import '../../src/styles/unity2-refresh.css';
import '../../src/styles/mobile-foundation.css';
import React, { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { AuthProvider, useAuth } from '../../src/context/AuthContext';
import { UnifiedMessageBell } from '../../src/components/common/UnifiedMessageBell';
import MyMessagesPage from '../../src/pages/system/message/Mine';
import { setNavigator } from '../../src/utils/navigation';

function Fixture() {
  const { loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  useEffect(() => { setNavigator(navigate); }, [navigate]);
  if (loading) return <p>正在验证测试身份</p>;
  return <main className="p-4" data-testid="message-fixture-ready">
    <header className="mb-4 flex justify-end"><UnifiedMessageBell /></header>
    <Routes>
      <Route path="/" element={<p>消息铃铛验收</p>} />
      <Route path="/message/mine" element={<MyMessagesPage />} />
      <Route path="*" element={<output data-testid="business-target">{location.pathname + location.search + location.hash}</output>} />
    </Routes>
    <Toaster />
  </main>;
}

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const view = new URLSearchParams(window.location.search).get('view');
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={queryClient}><MemoryRouter initialEntries={[view === 'mine' ? '/message/mine' : '/']}>
    <AuthProvider><Fixture /></AuthProvider>
  </MemoryRouter></QueryClientProvider>,
);
