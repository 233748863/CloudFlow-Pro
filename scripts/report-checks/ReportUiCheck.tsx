import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { ThemeProvider, useTheme } from '@/context/ThemeContext';
import ReportChartPage from '@/pages/ReportChartPage';
import ReportDashboardPage from '@/pages/ReportDashboardPage';
import { setAuthToken } from '@/utils/authStorage';
import '@/index.css';
import '@/styles/unity2-refresh.css';
import '@/styles/mobile-foundation.css';

function ReportUiCheck() {
  const { loading, user, refreshUser } = useAuth();
  const { resolvedTheme, setThemeMode } = useTheme();
  const [mounted, setMounted] = useState(true);
  return <div className="mx-auto max-w-[1600px] p-4">
    <nav className="mb-4 flex flex-wrap gap-4" aria-label="报表检查控制">
      <Link to="/charts">检查图表</Link><Link to="/dashboards">检查仪表盘</Link>
      <button onClick={() => setMounted(value => !value)}>{mounted ? '卸载报表' : '载入报表'}</button>
      <button onClick={() => void refreshUser()}>刷新检查身份</button>
      <button onClick={() => setThemeMode(resolvedTheme === 'dark' ? 'light' : 'dark')}>切换检查主题</button>
      <span aria-label="检查身份">{user?.id ?? '未登录'}</span>
    </nav>
    <section aria-label="报表检查页面">{loading ? <p>正在读取检查身份</p> : !mounted ? <p>报表已卸载</p> : <Routes>
      <Route path="/charts" element={<ReportChartPage />} /><Route path="/dashboards" element={<ReportDashboardPage />} />
    </Routes>}</section>
  </div>;
}

setAuthToken('report-ui-isolated-fixture');
createRoot(document.getElementById('root')!).render(<MemoryRouter initialEntries={['/charts']}><ThemeProvider><AuthProvider><ReportUiCheck /></AuthProvider></ThemeProvider></MemoryRouter>);
