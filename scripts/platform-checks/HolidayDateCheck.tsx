import React from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { Toaster } from 'sonner';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { HolidayDatePage } from '@/pages/system/holiday/Date';
import '@/index.css';
import '@/styles/unity2-refresh.css';
import '@/styles/mobile-foundation.css';

function HolidayDateCheck() {
  const { loading } = useAuth();
  if (loading) return <p>正在准备年度日历检查</p>;
  return <main className="mx-auto max-w-7xl p-4"><HolidayDatePage /><Toaster /></main>;
}

createRoot(document.getElementById('root')!).render(
  <MemoryRouter initialEntries={[window.location.pathname + window.location.search]}>
    <AuthProvider><HolidayDateCheck /></AuthProvider>
  </MemoryRouter>,
);
