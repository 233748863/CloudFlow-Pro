import React from 'react';
import { Edit, Eye, Pin, Trash2, X } from 'lucide-react';
import type { Announcement } from '@/types';
import { TableActionHead, TableHead, TableHeader } from '@/components/ui';
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

// 管理列表动作统一收口到公共组件，后续继续向源码结构贴近时只需要维护这一层。
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
              <tr key={item.announcementId} className="hover:bg-slate-50/80">
                <td className="w-[34%] px-4 py-3">
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-2">
                      {item.isTop === 1 ? <Pin size={14} className="text-red-500" /> : null}
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
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => onViewStats(item.announcementId)}
                      className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-blue-50 hover:text-blue-600"
                      title="阅读状态"
                    >
                      <Eye size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => onEdit(item)}
                      className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
                      title="编辑"
                    >
                      <Edit size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => onToggleTop(item.announcementId)}
                      className={cn(
                        'rounded-lg p-1.5 transition-colors',
                        item.isTop === 1
                          ? 'text-rose-500 hover:bg-rose-50 hover:text-rose-600'
                          : 'text-slate-500 hover:bg-amber-50 hover:text-amber-600',
                      )}
                      title={item.isTop === 1 ? '取消置顶' : '置顶'}
                    >
                      <Pin size={16} />
                    </button>
                    {item.status === '1' ? (
                      <button
                        type="button"
                        onClick={() => onRevoke(item.announcementId)}
                        className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-orange-50 hover:text-orange-600"
                        title="撤销"
                      >
                        <X size={16} />
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => onDelete(item.announcementId)}
                      className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-red-50 hover:text-red-600"
                      title="删除"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
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
    <div className="overflow-hidden rounded-[24px] border border-white/80 bg-white/85 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
      {table}
    </div>
  );
};
