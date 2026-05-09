import React from 'react';
import { Edit, Eye, Pin, Trash2, X } from 'lucide-react';
import type { Announcement } from '@/types';
import { AnnouncementScope } from '@/types';
import { TableActionHead, TableHead, TableHeader, TableRowActions } from '@/components/common';
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

const formatScopeLabel = (announcement: Announcement) => {
  if (announcement.scopeType === AnnouncementScope.DEPT) {
    return '部门';
  }

  if (announcement.scopeType === AnnouncementScope.ROLE) {
    return '角色';
  }

  return '全员';
};

const formatScopeValue = (announcement: Announcement) => {
  if (announcement.scopeType === AnnouncementScope.ALL) {
    return '所有可见范围';
  }

  return announcement.scopeValue || '已设置定向范围';
};

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
      <table className="min-w-[1180px] w-full">
        <TableHeader className="sticky top-0 z-10 bg-white dark:bg-slate-950/95">
          <tr>
            <TableHead className="w-[30%] px-4 py-3 text-left">标题</TableHead>
            <TableHead className="w-[18%] px-4 py-3 text-left">类型 / 优先级</TableHead>
            <TableHead className="w-[14%] px-4 py-3 text-left">状态</TableHead>
            <TableHead className="w-[18%] px-4 py-3 text-left">发布范围</TableHead>
            <TableHead className="w-[20%] px-4 py-3 text-left">时间</TableHead>
            <TableActionHead className="w-[220px] px-4 py-3">操作</TableActionHead>
          </tr>
        </TableHeader>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {announcements.map((item) => {
            const typeMeta = getAnnouncementTypeMeta(item.type);
            const statusMeta = getAnnouncementStatusMeta(item.status);
            const priorityMeta = getAnnouncementPriorityMeta(item.priority);

            return (
              <tr key={item.announcementId} className="hover:bg-slate-50 dark:hover:bg-slate-900/60">
                <td className="px-4 py-3">
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="truncate font-medium text-slate-900 dark:text-slate-100">
                        {item.title}
                      </span>
                      {item.isTop === 1 ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                          <Pin size={10} />
                          置顶
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-1 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <span>#{item.announcementId}</span>
                      <span className="text-slate-300 dark:text-slate-700">·</span>
                      <span>{item.createTime ? new Date(item.createTime).toLocaleString() : '-'}</span>
                    </div>
                  </div>
                </td>

                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    <span
                      className={cn(
                        'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold',
                        typeMeta.className,
                      )}
                    >
                      {typeMeta.icon}
                      {typeMeta.label}
                    </span>
                    <span
                      className={cn(
                        'inline-flex rounded-full px-2.5 py-1 text-xs font-semibold',
                        priorityMeta.className,
                      )}
                    >
                      {priorityMeta.label}
                    </span>
                  </div>
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

                <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
                  <div className="font-medium text-slate-900 dark:text-slate-100">
                    {formatScopeLabel(item)}
                  </div>
                  <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {formatScopeValue(item)}
                  </div>
                </td>

                <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
                  <div>
                    发布时间：{item.publishTime ? new Date(item.publishTime).toLocaleString() : '-'}
                  </div>
                  <div className="mt-1">
                    失效时间：{item.expireTime ? new Date(item.expireTime).toLocaleString() : '长期有效'}
                  </div>
                </td>

                <td className="whitespace-nowrap px-4 py-3">
                  <TableRowActions
                    align="start"
                    className="gap-1"
                    actions={[
                      {
                        label: '阅读状态',
                        icon: <Eye size={16} />,
                        onClick: () => onViewStats(item.announcementId),
                        tone: 'neutral',
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
                        tone: item.isTop === 1 ? 'warning' : 'neutral',
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
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm ring-1 ring-slate-200/70 dark:border-slate-800 dark:bg-slate-950/88 dark:ring-slate-800/70">
      {table}
    </div>
  );
};

