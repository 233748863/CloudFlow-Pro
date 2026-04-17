import { useEffect } from 'react';
import { useAnnouncementStore } from '@/stores/announcementStore';

const ANNOUNCEMENT_POLL_INTERVAL_MS = 60 * 1000;

export function useAnnouncementSync(enabled = true) {
  const fetchAnnouncements = useAnnouncementStore((state) => state.fetchAnnouncements);
  const reset = useAnnouncementStore((state) => state.reset);

  useEffect(() => {
    if (!enabled) {
      reset();
      return;
    }

    void fetchAnnouncements(true);

    const intervalId = setInterval(() => {
      void fetchAnnouncements();
    }, ANNOUNCEMENT_POLL_INTERVAL_MS);

    const handleAnnouncementRead = () => {
      void fetchAnnouncements(true);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void fetchAnnouncements(true);
      }
    };

    window.addEventListener('announcementRead', handleAnnouncementRead);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(intervalId);
      window.removeEventListener('announcementRead', handleAnnouncementRead);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [enabled, fetchAnnouncements, reset]);
}

