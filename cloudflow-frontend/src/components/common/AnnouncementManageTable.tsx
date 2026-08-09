import React from 'react';
import { Edit, Eye, Pin, Trash2, X } from 'lucide-react';
import type { Announcement } from '@/types';
import { AnnouncementScope } from '@/types';
import { cn } from '@/utils/cn';
import { InnerTableSurface } from '@/components/layout/TablePageLayout';
import {
  useAnnouncementPriorityMeta,
  useAnnouncementStatusMeta,
  useAnnouncementTypeMeta,
} from '@/utils/announcementMeta';

interface AnnouncementManageTableProps {
  announcements: Announcement[];
  onEdit: (announcement: Announcement) => void;
  onToggleTop: (announcementId: number) => void;
  onRevoke: (announcementId: number) => void;
  onDelete: (announcementId: number) => void;
  onViewStats: (announcementId: number) => void;
  deptNameMap?: Map<string, string>;
  roleNameMap?: Map<string, string>;
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

const parseScopeValues = (value?: string) => (
  value?.split(',').map((item) => item.trim()).filter(Boolean) ?? []
);

const formatScopeDisplay = (
  announcement: Announcement,
  deptNameMap: Map<string, string>,
  roleNameMap: Map<string, string>,
) => {
  if (announcement.scopeType === AnnouncementScope.ALL) {
    return formatScopeValue(announcement);
  }

  const values = parseScopeValues(announcement.scopeValue);
  if (!values.length) {
    return '已设置定向范围';
  }

  const nameMap = announcement.scopeType === AnnouncementScope.DEPT ? deptNameMap : roleNameMap;
  const names = values
    .map((value) => nameMap.get(value))
    .filter((value): value is string => Boolean(value));

  if (names.length > 0) {
    return names.join('、');
  }

  return announcement.scopeType === AnnouncementScope.DEPT
    ? `已设置 ${values.length} 个部门`
    : `已设置 ${values.length} 个角色`;
};

export const AnnouncementManageTable: React.FC<AnnouncementManageTableProps> = ({
  announcements,
  onEdit,
  onToggleTop,
  onRevoke,
  onDelete,
  onViewStats,
  deptNameMap = new Map(),
  roleNameMap = new Map(),
  embedded = false,
}) => {
  const getTypeMeta = useAnnouncementTypeMeta();
  const getStatusMeta = useAnnouncementStatusMeta();
  const getPriorityMeta = useAnnouncementPriorityMeta();
  const table = (
    <table className="unity-data-table admin-source-table admin-announcements-table min-w-[1180px] cf-freeze-edges">
      <thead>
        <tr>
          <th className="w-[30%]">标题</th>
          <th className="w-[18%]">类型 / 优先级</th>
          <th className="w-[14%]">状态</th>
          <th className="w-[18%]">发布范围</th>
          <th className="w-[20%]">时间</th>
          <th className="w-[220px] text-right">操作</th>
        </tr>
      </thead>
      <tbody>
        {announcements.map((item) => {
          const typeMeta = getTypeMeta(item.type);
          const statusMeta = getStatusMeta(item.status);
          const priorityMeta = getPriorityMeta(item.priority);

          return (
            <tr key={item.announcementId} className="hover:bg-[var(--cf-surface-muted)] dark:hover:bg-slate-900/60">
              <td className="px-4 py-3">
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="truncate font-medium text-cf-title">
                      {item.title}
                    </span>
                    {item.isTop === 1 ? (
                      <span className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                        <Pin size={10} />
                        置顶
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-1 text-xs text-cf-subtle">
                    {item.createTime ? new Date(item.createTime).toLocaleString() : '-'}
                  </div>
                </div>
              </td>

              <td className="px-4 py-3">
                <div className="flex flex-wrap gap-2">
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold',
                      typeMeta.className,
                    )}
                  >
                    {typeMeta.icon}
                    {typeMeta.label}
                  </span>
                  <span
                    className={cn(
                      'inline-flex rounded-md px-2.5 py-1 text-xs font-semibold',
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
                    'inline-flex rounded-md px-2.5 py-1 text-xs font-semibold',
                    statusMeta.className,
                  )}
                >
                  {statusMeta.label}
                </span>
              </td>

              <td className="px-4 py-3 text-sm text-cf-muted">
                <div className="font-medium text-cf-title">
                  {formatScopeLabel(item)}
                </div>
                <div className="mt-1 text-xs text-cf-subtle">
                  {formatScopeDisplay(item, deptNameMap, roleNameMap)}
                </div>
              </td>

              <td className="px-4 py-3 text-xs text-cf-subtle">
                <div>
                  发布时间：{item.publishTime ? new Date(item.publishTime).toLocaleString() : '-'}
                </div>
                <div className="mt-1">
                  失效时间：{item.expireTime ? new Date(item.expireTime).toLocaleString() : '长期有效'}
                </div>
              </td>

              <td>
                <div className="admin-users-row-actions">
                  <button type="button" data-tooltip="阅读状态" aria-label="阅读状态" onClick={() => onViewStats(item.announcementId)}>
                    <Eye size={15} />
                  </button>
                  <button type="button" data-tooltip="编辑" aria-label="编辑" onClick={() => onEdit(item)}>
                    <Edit size={15} />
                  </button>
                  <button
                    type="button"
                    data-tooltip={item.isTop === 1 ? '取消置顶' : '置顶'} aria-label={item.isTop === 1 ? '取消置顶' : '置顶'}
                    onClick={() => onToggleTop(item.announcementId)}
                  >
                    <Pin size={15} />
                  </button>
                  {item.status === '1' ? (
                    <button type="button" data-tooltip="撤销" aria-label="撤销" onClick={() => onRevoke(item.announcementId)}>
                      <X size={15} />
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="danger"
                    data-tooltip="删除" aria-label="删除"
                    onClick={() => onDelete(item.announcementId)}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );

  if (embedded) {
    return <InnerTableSurface>{table}</InnerTableSurface>;
  }

  return <InnerTableSurface>{table}</InnerTableSurface>;
};
