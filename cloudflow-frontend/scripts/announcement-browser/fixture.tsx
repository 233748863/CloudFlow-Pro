import '../../src/index.css';
import '../../src/styles/unity2-refresh.css';
import '../../src/styles/mobile-foundation.css';
import React, { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Link, MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { AuthProvider, useAuth } from '../../src/context/AuthContext';
import { AnnouncementPage } from '../../src/pages/AnnouncementPage';
import MyMessagesPage from '../../src/pages/system/message/Mine';
import { setNavigator } from '../../src/utils/navigation';

function Fixture() {
  const { loading } = useAuth();
  const navigate = useNavigate();
  useEffect(() => { setNavigator(navigate); }, [navigate]);
  if (loading) return <p>正在验证测试身份</p>;
  return <main className="p-4" data-testid="announcement-fixture-ready">
    <nav className="mb-4 flex gap-4"><Link to="/announcement">公告页面</Link><Link to="/message/mine">个人消息页面</Link></nav>
    <Routes><Route path="/announcement" element={<AnnouncementPage />} />
      <Route path="/message/mine" element={<MyMessagesPage />} /></Routes>
    <Toaster />
  </main>;
}

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={queryClient}><MemoryRouter initialEntries={['/announcement']}>
    <AuthProvider><Fixture /></AuthProvider>
  </MemoryRouter></QueryClientProvider>,
);
