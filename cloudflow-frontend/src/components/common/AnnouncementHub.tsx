import React from 'react';
import { useAnnouncementSync } from '@/hooks/useAnnouncementSync';
import { AnnouncementPopup } from '@/components/common/AnnouncementPopup';

interface AnnouncementHubProps {
  enabled?: boolean;
  showPopup?: boolean;
}

export const AnnouncementHub: React.FC<AnnouncementHubProps> = ({ enabled = true, showPopup = false }) => {
  useAnnouncementSync(enabled);
  return showPopup ? <AnnouncementPopup /> : null;
};
