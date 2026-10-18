import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { CrmSalesView } from '@/pages/hr/HrPerformancePage';
import '@/index.css';
import '@/styles/unity2-refresh.css';
import '@/styles/mobile-foundation.css';

function AvailabilityCheck() {
  const [mounted, setMounted] = useState(true);
  return <main className="mx-auto max-w-7xl p-4">
    <button type="button" onClick={() => setMounted(value => !value)}>{mounted ? '卸载销售业绩检查' : '载入销售业绩检查'}</button>
    <section aria-label="销售业绩检查">{mounted ? <CrmSalesView /> : <p>销售业绩检查已卸载</p>}</section>
  </main>;
}

createRoot(document.getElementById('root')!).render(<MemoryRouter><AvailabilityCheck /></MemoryRouter>);
