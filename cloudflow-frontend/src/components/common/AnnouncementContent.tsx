import React from 'react';
import { renderAnnouncementHtml } from '@/utils/announcementContent';
import { cn } from '@/utils/cn';
import './announcement-content.css';

interface AnnouncementContentProps {
  content?: string;
  className?: string;
  fallbackHtml?: string;
}

export const AnnouncementContent: React.FC<AnnouncementContentProps> = ({
  content,
  className,
  fallbackHtml,
}) => (
  <div
    className={cn('cf-announcement-content', className)}
    dangerouslySetInnerHTML={{
      __html: renderAnnouncementHtml(content, fallbackHtml),
    }}
  />
);

