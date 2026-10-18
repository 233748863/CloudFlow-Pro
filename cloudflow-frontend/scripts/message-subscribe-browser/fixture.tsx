// Match the application entry: establish CSS layers before component CSS imports.
import '../../src/index.css';
import '../../src/styles/unity2-refresh.css';
import '../../src/styles/mobile-foundation.css';
import React, { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { AuthProvider, useAuth } from '../../src/context/AuthContext';
import MessageSubscribePage from '../../src/pages/system/message/Subscribe';
import { setNavigator } from '../../src/utils/navigation';

function Fixture() {
  const { loading } = useAuth();
  const navigate = useNavigate();
  useEffect(() => { setNavigator(navigate); }, [navigate]);
  if (loading) return <p>正在验证测试身份</p>;
  return <main className="p-4" data-testid="subscription-fixture-ready">
    <Routes>
      <Route path="/message/subscribe" element={<MessageSubscribePage />} />
      <Route path="/message/mine" element={<output data-testid="my-messages-target">我的消息入口</output>} />
    </Routes>
    <Toaster />
  </main>;
}
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={queryClient}><MemoryRouter initialEntries={['/message/subscribe']}>
    <AuthProvider><Fixture /></AuthProvider>
  </MemoryRouter></QueryClientProvider>,
);
