import React from 'react';
import { AlertCircle, Bell, Megaphone } from 'lucide-react';
import { AnnouncementType } from '@/types';
import {
  ANNOUNCEMENT_TYPE_META,
  ANNOUNCEMENT_PRIORITY_META,
  getAnnouncementPriorityMeta as priorityMetaFromEnum,
  getAnnouncementStatusMeta as statusMetaFromEnum,
} from './enumLabels';

interface AnnouncementMeta {
  label: string;
  className: string;
}

interface AnnouncementTypeMeta extends AnnouncementMeta {
  icon: React.ReactNode;
}

// 统一公告类型、优先级和状态映射；label + className 委托 utils/enumLabels.ts，
// icon（lucide-react React 节点）保留在本文件以避免 utils 引入 React 依赖。
const TYPE_ICONS: Record<string, React.ReactNode> = {
  [AnnouncementType.ANNOUNCEMENT]: <Megaphone size={16} className="text-sky-500" />,
  [AnnouncementType.URGENT]: <AlertCircle size={16} className="text-rose-500" />,
  [AnnouncementType.NOTIFICATION]: <Bell size={16} className="text-cyan-500" />,
};

const fallback = (className?: string): string =>
  className ?? 'bg-slate-100 text-slate-600 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700';

export const getAnnouncementTypeMeta = (type: AnnouncementType): AnnouncementTypeMeta => {
  const meta = ANNOUNCEMENT_TYPE_META[type] ?? ANNOUNCEMENT_TYPE_META[AnnouncementType.NOTIFICATION] ?? { label: '通知', fullClass: undefined };
  return {
    label: meta.label,
    className: fallback(meta.fullClass),
    icon: TYPE_ICONS[type] ?? TYPE_ICONS[AnnouncementType.NOTIFICATION],
  };
};

export const getAnnouncementPriorityMeta = (priority?: string): AnnouncementMeta => {
  const meta = priorityMetaFromEnum(priority);
  return { label: meta.label, className: fallback(meta.fullClass) };
};

export const getAnnouncementStatusMeta = (status?: string): AnnouncementMeta => {
  const meta = statusMetaFromEnum(status);
  return {
    label: meta.label === '-' ? '未知状态' : meta.label,
    className: fallback(meta.fullClass),
  };
};
