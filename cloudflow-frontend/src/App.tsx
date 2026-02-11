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
        <Toaster 
          position="top-right" 
          richColors 
          expand={true}
          duration={3000}
          closeButton
          toastOptions={{
            style: {
              animation: 'slideIn 0.3s ease-out',
            },
            className: 'toast-notification',
          }}
        />
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;
