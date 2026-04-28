if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    registrations.forEach((registration) => {
      if (registration.scope.includes('/cloudflow-pro/')) {
        registration.unregister();
      }
    });
  });
}

if ('caches' in window) {
  caches.keys().then((keys) => {
    keys.forEach((key) => {
      if (key.includes('workbox') || key.includes('precache') || key.includes('api-cache')) {
        caches.delete(key);
      }
    });
  });
}
