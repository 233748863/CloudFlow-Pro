import { useEffect } from 'react';
import { useAnnouncementStore } from '@/stores/announcementStore';

export function useAnnouncementSync(enabled = true) {
  const fetchAnnouncements = useAnnouncementStore((state) => state.fetchAnnouncements);
  const reset = useAnnouncementStore((state) => state.reset);

  useEffect(() => {
    if (!enabled) {
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
  }, [enabled, fetchAnnouncements, reset]);
}

