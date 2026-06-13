import React from 'react';
import { AlertCircle, Bell, Megaphone } from 'lucide-react';
import { AnnouncementType } from '@/types';
import { useDict } from '@/hooks/useDict';
import type { DictItem } from '@/types/dict';

interface AnnouncementMeta {
  label: string;
  className: string;
}

interface AnnouncementTypeMeta extends AnnouncementMeta {
  icon: React.ReactNode;
}

const TYPE_ICONS: Record<string, React.ReactNode> = {
  [AnnouncementType.ANNOUNCEMENT]: <Megaphone size={16} className="text-sky-500" />,
  [AnnouncementType.URGENT]: <AlertCircle size={16} className="text-rose-500" />,
  [AnnouncementType.NOTIFICATION]: <Bell size={16} className="text-cyan-500" />,
};

const FALLBACK_CLASS = 'bg-slate-100 text-slate-600 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700';

const resolveClassName = (item: DictItem | undefined): string => item?.fullClass ?? FALLBACK_CLASS;

export const useAnnouncementTypeMeta = () => {
  const { getItem } = useDict('announcement_type');
  return (type: AnnouncementType): AnnouncementTypeMeta => {
    const item = getItem(type);
    const fallbackItem = getItem(AnnouncementType.NOTIFICATION);
    const meta = item ?? fallbackItem;
    return {
      label: meta?.label ?? '通知',
      className: resolveClassName(meta),
      icon: TYPE_ICONS[type] ?? TYPE_ICONS[AnnouncementType.NOTIFICATION],
    };
  };
};

export const useAnnouncementPriorityMeta = () => {
  const { getItem } = useDict('announcement_priority');
  return (priority?: string): AnnouncementMeta => {
    const item = priority ? getItem(priority) : undefined;
    return {
      label: item?.label ?? priority ?? '-',
      className: resolveClassName(item),
    };
  };
};

export const useAnnouncementStatusMeta = () => {
  const { getItem } = useDict('announcement_status');
  return (status?: string): AnnouncementMeta => {
    const item = status ? getItem(status) : undefined;
    return {
      label: item?.label ?? (status ? status : '未知状态'),
      className: resolveClassName(item),
    };
  };
};
