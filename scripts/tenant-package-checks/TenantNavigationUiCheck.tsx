import React, { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { ThemeProvider } from '@/context/ThemeContext';
import { queryClient } from '@/lib/queryClient';
import { router } from '@/router';
import { setAuthToken } from '@/utils/authStorage';
import '@/index.css';
import '@/styles/unity2-refresh.css';
import '@/styles/mobile-foundation.css';

function RefreshIdentity() {
  const { refreshUser } = useAuth();
  return <button type="button" data-testid="refresh-identity" style={{ position: 'fixed', right: 0, bottom: 0, zIndex: 99999 }} onClick={() => { void refreshUser(); }}>测试刷新身份</button>;
}

setAuthToken('tenant-navigation-ui-controlled-session');
createRoot(document.getElementById('root')!).render(<StrictMode><QueryClientProvider client={queryClient}>
  <ThemeProvider><AuthProvider><RefreshIdentity /><RouterProvider router={router} /></AuthProvider></ThemeProvider>
</QueryClientProvider></StrictMode>);
