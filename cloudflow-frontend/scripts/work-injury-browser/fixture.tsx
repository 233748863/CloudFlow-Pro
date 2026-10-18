import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { HrWorkInjuryPage } from '../../src/pages/hr/laborRelation/HrWorkInjuryPage';
import '../../src/index.css';
import '../../src/styles/unity2-refresh.css';
import '../../src/styles/mobile-foundation.css';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={queryClient}>
    <MemoryRouter><main className="p-4"><HrWorkInjuryPage /></main></MemoryRouter>
  </QueryClientProvider>,
);
