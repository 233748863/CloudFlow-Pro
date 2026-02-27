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
          duration={4000}
          closeButton
          theme="light"
          toastOptions={{
            style: {
              background: 'rgba(255, 255, 255, 0.95)',
              backdropFilter: 'blur(16px)',
              border: '1px solid rgba(226, 232, 240, 0.9)',
              borderRadius: '16px',
              padding: '16px 20px',
              boxShadow: '0 20px 40px -10px rgba(0, 0, 0, 0.1), 0 10px 20px -10px rgba(0, 0, 0, 0.05)',
              fontSize: '14px',
              fontWeight: 500,
              // 确保过渡平滑
              transition: 'all 0.3s ease-out',
            },
            className: 'toast-notification group',
            classNames: {
              toast: 'group-[.toaster]:shadow-lg',
              title: 'group-[.toast]:font-semibold',
              description: 'group-[.toast]:text-slate-500',
              actionButton: 'group-[.toast]:bg-slate-900 group-[.toast]:text-white',
              cancelButton: 'group-[.toast]:bg-slate-100 group-[.toast]:text-slate-500',
              error: 'group-[.toaster]:border-red-200 group-[.toaster]:bg-red-50/90 group-[.toaster]:text-red-700',
              success: 'group-[.toaster]:border-emerald-200 group-[.toaster]:bg-emerald-50/90 group-[.toaster]:text-emerald-700',
              warning: 'group-[.toaster]:border-amber-200 group-[.toaster]:bg-amber-50/90 group-[.toaster]:text-amber-700',
              info: 'group-[.toaster]:border-blue-200 group-[.toaster]:bg-blue-50/90 group-[.toaster]:text-blue-700',
            },
          }}
        />
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;
