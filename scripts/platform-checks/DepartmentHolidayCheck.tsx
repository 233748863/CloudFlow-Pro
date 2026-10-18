import React from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { Toaster } from 'sonner';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { OrgStructure } from '@/components/OrgStructure';
import '@/index.css';
import '@/styles/unity2-refresh.css';
import '@/styles/mobile-foundation.css';

function DepartmentHolidayCheck() {
  const { loading } = useAuth();
  if (loading) return <p>正在准备部门日历检查</p>;
  return <main className="mx-auto max-w-7xl p-4">
    <OrgStructure />
    <Toaster />
  </main>;
}

createRoot(document.getElementById('root')!).render(
  <MemoryRouter><AuthProvider><DepartmentHolidayCheck /></AuthProvider></MemoryRouter>,
);
