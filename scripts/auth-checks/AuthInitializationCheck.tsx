import React, { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { RouteGuard } from '@/components/common/RouteGuard';
import { PermissionButton, PermissionGuard } from '@/components/common/PermissionGuard';
import { setAuthToken } from '@/utils/authStorage';
import { setNavigator } from '@/utils/navigation';
import '@/index.css';
import '@/styles/unity2-refresh.css';
import '@/styles/mobile-foundation.css';

declare global {
  interface Window {
    authCheck: ReturnType<typeof useAuth>;
  }
}

function Probe() {
  const auth = useAuth();
  const navigate = useNavigate();
  useEffect(() => { setNavigator((destination, options) => { void navigate(destination, options); }); }, [navigate]);
  useEffect(() => { window.authCheck = auth; }, [auth]);
  return <>
    <output data-testid="auth-state">{JSON.stringify({ user: auth.user?.username ?? null, tenant: auth.user?.tenantId ?? null, loading: auth.loading })}</output>
    <RouteGuard><div data-testid="protected-content">受保护的业务内容</div></RouteGuard>
    <PermissionGuard permissions={['system:search:business']} hidden><div data-testid="search-feature">业务搜索</div></PermissionGuard>
    <PermissionButton permissions={['system:search:business']} data-testid="search-button">搜索按钮</PermissionButton>
    <PermissionGuard permissions={['system:search:business', 'system:user:profile:edit']} requireAll hidden>
      <div data-testid="all-features">同时具备两项功能</div>
    </PermissionGuard>
  </>;
}

function Check() {
  const [mounted, setMounted] = useState(true);
  return <MemoryRouter>
    <button type="button" onClick={() => setMounted(value => !value)}>{mounted ? '卸载身份检查' : '载入身份检查'}</button>
    {mounted && <AuthProvider><Probe /></AuthProvider>}
  </MemoryRouter>;
}

setAuthToken('auth-check-initial');
createRoot(document.getElementById('root')!).render(<StrictMode><Check /></StrictMode>);
