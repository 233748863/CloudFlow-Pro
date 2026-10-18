import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { ImportButton } from '@/components/import/ImportButton';
import ImportPage from '@/pages/system/Import';
import '@/index.css';
import '@/styles/unity2-refresh.css';
import '@/styles/mobile-foundation.css';

function ImportInterfaceCheck() {
  const { loading } = useAuth();
  const [completed, setCompleted] = useState(0);
  if (loading) return <p>正在准备检查</p>;
  return <main className="mx-auto max-w-6xl space-y-4 p-4">
    <output id="completed">{completed}</output>
    {new URLSearchParams(window.location.search).has('tasks') ? <ImportPage /> : <ImportButton bizType="EMPLOYEE" permission="hr:employees:import" onSuccess={() => setCompleted((count) => count + 1)} />}
  </main>;
}

createRoot(document.getElementById('root')!).render(<MemoryRouter initialEntries={[window.location.pathname + window.location.search]}><AuthProvider><ImportInterfaceCheck /></AuthProvider></MemoryRouter>);
