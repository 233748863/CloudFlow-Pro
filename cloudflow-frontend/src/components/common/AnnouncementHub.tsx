import React from 'react';
import { useAnnouncementSync } from '@/hooks/useAnnouncementSync';
import { AnnouncementPopup } from '@/components/common/AnnouncementPopup';

interface AnnouncementHubProps {
  enabled?: boolean;
}

export const AnnouncementHub: React.FC<AnnouncementHubProps> = ({ enabled = true }) => {
  useAnnouncementSync(enabled);
  return <AnnouncementPopup />;
};

