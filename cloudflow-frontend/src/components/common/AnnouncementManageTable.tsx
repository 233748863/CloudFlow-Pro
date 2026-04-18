import React from 'react';
import { Edit, Eye, Pin, Trash2, X } from 'lucide-react';
import type { Announcement } from '@/types';
import { TableActionHead, TableHead, TableHeader, TableRowActions } from '@/components/ui';
import { cn } from '@/utils/cn';
import {
  getAnnouncementPriorityMeta,
  getAnnouncementStatusMeta,
  getAnnouncementTypeMeta,
} from '@/utils/announcementMeta';

interface AnnouncementManageTableProps {
  announcements: Announcement[];
  onEdit: (announcement: Announcement) => void;
  onToggleTop: (announcementId: number) => void;
  onRevoke: (announcementId: number) => void;
  onDelete: (announcementId: number) => void;
  onViewStats: (announcementId: number) => void;
  embedded?: boolean;
}

export const AnnouncementManageTable: React.FC<AnnouncementManageTableProps> = ({
  announcements,
  onEdit,
  onToggleTop,
  onRevoke,
  onDelete,
  onViewStats,
  embedded = false,
}) => {
  const table = (
    <div className="overflow-x-auto">
      <table className="min-w-[1100px] w-full">
        <TableHeader className="sticky top-0 z-10">
          <tr>
            <TableHead className="w-[34%] px-4 py-3 text-left">标题</TableHead>
            <TableHead className="px-4 py-3 text-left">类型</TableHead>
            <TableHead className="px-4 py-3 text-left">状态</TableHead>
            <TableHead className="px-4 py-3 text-left">优先级</TableHead>
            <TableHead className="w-44 px-4 py-3 text-left">发布时间</TableHead>
            <TableActionHead className="w-[220px] px-4 py-3">操作</TableActionHead>
          </tr>
        </TableHeader>
        <tbody className="divide-y divide-slate-100">
          {announcements.map((item) => {
            const typeMeta = getAnnouncementTypeMeta(item.type);
            const statusMeta = getAnnouncementStatusMeta(item.status);
            const priorityMeta = getAnnouncementPriorityMeta(item.priority);

            return (
              <tr key={item.announcementId} className="hover:bg-slate-50">
                <td className="w-[34%] px-4 py-3">
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-2">
                      {item.isTop === 1 ? <Pin size={14} className="text-amber-600" /> : null}
                      <span className="truncate font-medium text-slate-900">{item.title}</span>
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                      <span>#{item.announcementId}</span>
                      <span className="text-slate-300">·</span>
                      <span>{item.createTime ? new Date(item.createTime).toLocaleString() : '-'}</span>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold',
                      typeMeta.className,
                    )}
                  >
                    {typeMeta.icon}
                    {typeMeta.label}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={cn(
                      'inline-flex rounded-full px-2.5 py-1 text-xs font-semibold',
                      statusMeta.className,
                    )}
                  >
                    {statusMeta.label}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={cn(
                      'inline-flex rounded-full px-2.5 py-1 text-xs font-semibold',
                      priorityMeta.className,
                    )}
                  >
                    {priorityMeta.label}
                  </span>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">
                  {item.publishTime ? new Date(item.publishTime).toLocaleString() : '-'}
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  <TableRowActions
                    align="start"
                    iconOnly
                    className="gap-1"
                    actions={[
                      {
                        label: '阅读状态',
                        icon: <Eye size={16} />,
                        onClick: () => onViewStats(item.announcementId),
                        tone: 'info',
                      },
                      {
                        label: '编辑',
                        icon: <Edit size={16} />,
                        onClick: () => onEdit(item),
                        tone: 'neutral',
                      },
                      {
                        label: item.isTop === 1 ? '取消置顶' : '置顶',
                        icon: <Pin size={16} />,
                        onClick: () => onToggleTop(item.announcementId),
                        tone: item.isTop === 1 ? 'danger' : 'warning',
                      },
                      {
                        label: '撤销',
                        icon: <X size={16} />,
                        onClick: () => onRevoke(item.announcementId),
                        tone: 'warning',
                        hidden: item.status !== '1',
                      },
                      {
                        label: '删除',
                        icon: <Trash2 size={16} />,
                        onClick: () => onDelete(item.announcementId),
                        tone: 'danger',
                      },
                    ]}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  if (embedded) {
    return table;
  }

  return (
    <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      {table}
    </div>
  );
};
