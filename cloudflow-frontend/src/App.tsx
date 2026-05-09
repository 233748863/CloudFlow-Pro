import React, { useEffect } from 'react';
import { RouterProvider } from 'react-router-dom';
import { Toaster } from 'sonner';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AuthProvider } from '@/context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { router } from './router';
import { restoreUnlockedBodyScroll } from './utils/bodyScrollLock';

function App() {
  useEffect(() => {
    restoreUnlockedBodyScroll();
  }, []);

  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <RouterProvider router={router} />
          <Toaster />
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
