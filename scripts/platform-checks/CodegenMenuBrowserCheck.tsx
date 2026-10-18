import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from '@/context/ThemeContext';
import { queryClient } from '@/lib/queryClient';
import { MainLayout } from '@/layouts/MainLayout';
import { DynamicMenuRoute } from '@/router/DynamicMenuRoute';
import request from '@/services/api/request';
import { setAuthToken, setCurrentUserSnapshot } from '@/utils/authStorage';
import type { User } from '@/types';
import '@/index.css';
import '@/styles/unity2-refresh.css';
import '@/styles/mobile-foundation.css';

setAuthToken('owned-menu-fixture-session');
const identity = await request.get<{ user: User }>('/auth/__verification__/identity');
Object.assign(globalThis, { __a1MenuIdentity: identity.user });
setCurrentUserSnapshot(identity.user);

createRoot(document.getElementById('root')!).render(
  <BrowserRouter>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <Routes>
          <Route element={<MainLayout />}>
            <Route path="*" element={<DynamicMenuRoute />} />
          </Route>
        </Routes>
      </ThemeProvider>
    </QueryClientProvider>
  </BrowserRouter>,
);
