import React from 'react';
import { AlertCircle, Bell, Megaphone } from 'lucide-react';
import { AnnouncementType } from '@/types';

interface AnnouncementMeta {
  label: string;
  className: string;
}

interface AnnouncementTypeMeta extends AnnouncementMeta {
  icon: React.ReactNode;
}

// 统一公告类型、优先级和状态映射，避免页面和公共组件各自维护一套文案样式。
export const getAnnouncementTypeMeta = (type: AnnouncementType): AnnouncementTypeMeta => {
  switch (type) {
    case AnnouncementType.ANNOUNCEMENT:
      return {
        label: '公告',
        icon: <Megaphone size={16} className="text-sky-500" />,
        className: 'bg-sky-50 text-sky-600 ring-1 ring-sky-100',
      };
    case AnnouncementType.URGENT:
      return {
        label: '紧急',
        icon: <AlertCircle size={16} className="text-rose-500" />,
        className: 'bg-rose-50 text-rose-600 ring-1 ring-rose-100',
      };
    case AnnouncementType.NOTIFICATION:
    default:
      return {
        label: '通知',
        icon: <Bell size={16} className="text-pink-500" />,
        className: 'bg-pink-50 text-pink-600 ring-1 ring-pink-100',
      };
  }
};

export const getAnnouncementPriorityMeta = (priority?: string): AnnouncementMeta => {
  switch (priority) {
    case 'H':
      return {
        label: '高优先级',
        className: 'bg-rose-50 text-rose-600 ring-1 ring-rose-100',
      };
    case 'L':
      return {
        label: '低优先级',
        className: 'bg-slate-100 text-slate-500 ring-1 ring-slate-200',
      };
    default:
      return {
        label: '中优先级',
        className: 'bg-amber-50 text-amber-600 ring-1 ring-amber-100',
      };
  }
};

export const getAnnouncementStatusMeta = (status?: string): AnnouncementMeta => {
  switch (status) {
    case '0':
      return {
        label: '草稿',
        className: 'bg-slate-100 text-slate-600 ring-1 ring-slate-200',
      };
    case '1':
      return {
        label: '已发布',
        className: 'bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100',
      };
    case '2':
      return {
        label: '已撤销',
        className: 'bg-rose-50 text-rose-600 ring-1 ring-rose-100',
      };
    default:
      return {
        label: '未知状态',
        className: 'bg-slate-100 text-slate-600 ring-1 ring-slate-200',
      };
  }
};
