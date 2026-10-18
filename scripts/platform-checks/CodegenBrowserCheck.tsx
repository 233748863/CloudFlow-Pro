import React from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import CodegenPage from '@/pages/system/codegen/Index';
import '@/index.css';
import '@/styles/unity2-refresh.css';
import '@/styles/mobile-foundation.css';

const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

createRoot(document.getElementById('root')!).render(
  <MemoryRouter>
    <QueryClientProvider client={client}>
      <main className="p-4"><CodegenPage /></main>
      <Toaster />
    </QueryClientProvider>
  </MemoryRouter>,
);
