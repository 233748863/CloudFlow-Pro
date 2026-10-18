import { useEffect } from 'react';
import { useAnnouncementStore } from '@/stores/announcementStore';
import { useAuth } from '@/context/AuthContext';

export function useAnnouncementSync(enabled = true) {
  const { hasPermission } = useAuth();
  const authorized = enabled && hasPermission('oa:announcement:list');
  const fetchAnnouncements = useAnnouncementStore((state) => state.fetchAnnouncements);
  const reset = useAnnouncementStore((state) => state.reset);

  useEffect(() => {
    if (!authorized) {
      reset();
      return;
    }

    void fetchAnnouncements(true);

    const handleAnnouncementRead = () => {
      void fetchAnnouncements(true);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void fetchAnnouncements();
      }
    };

    window.addEventListener('announcementRead', handleAnnouncementRead);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('announcementRead', handleAnnouncementRead);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [authorized, fetchAnnouncements, reset]);
}
