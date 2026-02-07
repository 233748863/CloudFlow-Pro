import React from 'react';
import { RouterProvider } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { router } from './router';
import { ErrorBoundary } from './components/ErrorBoundary';

import { Toaster } from 'sonner';

function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <RouterProvider router={router} />
        <Toaster position="top-right" richColors />
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;
