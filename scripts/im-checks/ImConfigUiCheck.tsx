import React, { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import ImConfigPage from '@/pages/system/ImConfigPage';
import { setAuthToken } from '@/utils/authStorage';
import '@/index.css';
import '@/styles/unity2-refresh.css';
import '@/styles/mobile-foundation.css';

declare global {
  interface Window { imUiIdentity: () => Promise<unknown>; }
}

function Probe() {
  const auth = useAuth();
  useEffect(() => { window.imUiIdentity = async () => { setAuthToken('im-ui-second'); return auth.refreshUser(); }; }, [auth]);
  return auth.loading ? <p>正在读取身份</p> : <ImConfigPage />;
}

setAuthToken('im-ui-initial');
createRoot(document.getElementById('root')!).render(<StrictMode><MemoryRouter><AuthProvider><Probe /></AuthProvider></MemoryRouter></StrictMode>);
