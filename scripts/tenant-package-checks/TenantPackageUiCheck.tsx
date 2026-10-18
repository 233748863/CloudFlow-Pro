import React, { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from '@/context/AuthContext';
import { setAuthToken } from '@/utils/authStorage';
import TenantPackagePage from '@/pages/system/TenantPackagePage';
import TenantList from '@/pages/system/TenantList';
import '@/index.css';
import '@/styles/unity2-refresh.css';
import '@/styles/mobile-foundation.css';

function Check() {
  const [mounted, setMounted] = useState(true);
  return <BrowserRouter><button type="button" onClick={() => setMounted(value => !value)}>{mounted ? '卸载检查页面' : '载入检查页面'}</button>
    <AuthProvider>{mounted && (window.location.pathname === '/tenant-ui-check' ? <TenantList /> : <TenantPackagePage />)}</AuthProvider>
  </BrowserRouter>;
}

setAuthToken('tenant-package-ui-controlled-session');
createRoot(document.getElementById('root')!).render(<StrictMode><Check /></StrictMode>);
