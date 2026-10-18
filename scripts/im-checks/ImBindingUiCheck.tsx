import '@/index.css';
import '@/styles/unity2-refresh.css';
import '@/styles/mobile-foundation.css';
import React, { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import ImBindingMinePage from '@/pages/ImBindingMinePage';
import ImBindingPage from '@/pages/system/ImBindingPage';
import { setAuthToken } from '@/utils/authStorage';

declare global { interface Window { imBindingUiIdentity: () => Promise<unknown>; } }

function Probe() {
  const auth = useAuth();
  useEffect(() => { window.imBindingUiIdentity = async () => { setAuthToken('im-binding-ui-second'); return auth.refreshUser(); }; }, [auth]);
  return auth.loading ? <p>正在读取身份</p> : window.location.pathname === '/system/im/bindings' ? <ImBindingPage /> : <ImBindingMinePage />;
}

setAuthToken('im-binding-ui-initial');
createRoot(document.getElementById('root')!).render(<StrictMode><MemoryRouter><AuthProvider><Probe /></AuthProvider></MemoryRouter></StrictMode>);
