import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from '../../cloudflow-frontend/src/context/AuthContext';
import { setAuthToken } from '../../cloudflow-frontend/src/utils/authStorage';
import PerformanceStats from '../../cloudflow-frontend/src/pages/PerformanceStats';
import { HrPerformanceDistributionPanel } from '../../cloudflow-frontend/src/pages/hr/components/HrPerformanceDistributionPanel';
import '../../cloudflow-frontend/src/index.css';
import '../../cloudflow-frontend/src/styles/unity2-refresh.css';
import '../../cloudflow-frontend/src/styles/mobile-foundation.css';

setAuthToken('chart-consumer-controlled-session');
createRoot(document.getElementById('root')!).render(<BrowserRouter><AuthProvider>
  {location.pathname === '/hr-chart-check' ? <HrPerformanceDistributionPanel open onClose={() => {}} /> : <PerformanceStats />}
</AuthProvider></BrowserRouter>);
