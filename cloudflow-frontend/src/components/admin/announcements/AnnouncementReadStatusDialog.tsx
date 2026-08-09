import React, { useEffect, useMemo, useState } from 'react';
import { CheckCheck, RefreshCw, Search, Users } from 'lucide-react';
import type { ReadStatsResponse } from '@/services/api/announcement';
import { BaseDialog, Pagination } from '@/components/common';
import { InnerTableSurface } from '@/components/layout/TablePageLayout';
import {
  Button,
  Input,
} from '@/components/common';

interface AnnouncementReadStatusDialogProps {
  open: boolean;
  announcementId: number | null;
  announcementTitle?: string;
  statsData: ReadStatsResponse | null;
  loading?: boolean;
  onRefresh?: (announcementId: number) => void | Promise<void>;
  onClose: () => void;
}

const InlineState: React.FC<{
  title: string;
  description?: string;
  icon?: React.ReactNode;
  className?: string;
}> = ({ title, description, icon, className }) => (
  <div className={['flex flex-col items-center justify-center px-6 py-10 text-center', className].filter(Boolean).join(' ')}>
    <div className="admin-source-stat-icon mb-3 h-10 w-10 border border-cyan-100 bg-[#effbfe] text-[#0d95b5] dark:border-cyan-900/60 dark:bg-cyan-950/30 dark:text-cyan-200">
      {icon || <CheckCheck className="h-4 w-4" />}
    </div>
    <div className="text-sm font-medium text-cf-title">{title}</div>
    {description ? <div className="mt-2 text-xs leading-6 text-cf-subtle">{description}</div> : null}
  </div>
);

export const AnnouncementReadStatusDialog: React.FC<AnnouncementReadStatusDialogProps> = ({
  open,
  announcementId,
  announcementTitle,
  statsData,
  loading = false,
  onRefresh,
  onClose,
}) => {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [view, setView] = useState<'read' | 'unread'>('read');
  const pageSize = 10;

  useEffect(() => {
    if (open) {
      setSearch('');
      setPage(1);
      setView('read');
    }
  }, [announcementId, open]);

  const filteredUsers = useMemo(() => {
    const sourceUsers = view === 'read'
      ? (statsData?.readUsers ?? [])
      : (statsData?.unreadUsers ?? []);
    const keyword = search.trim().toLowerCase();

    const sortedUsers = [...sourceUsers].sort((left, right) => {
      const leftTime = left.readTime ? new Date(left.readTime).getTime() : 0;
      const rightTime = right.readTime ? new Date(right.readTime).getTime() : 0;
      return rightTime - leftTime;
    });

    if (!keyword) {
      return sortedUsers;
    }

    return sortedUsers.filter((user) => {
      const tokens = [String(user.userId), user.userName || '', user.nickName || '', user.deptName || ''];
      return tokens.some((token) => token.toLowerCase().includes(keyword));
    });
  }, [search, statsData, view]);

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pagedUsers = filteredUsers.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  return (
    <BaseDialog
      open={open}
      title="阅读状态"
      onClose={onClose}
      maxWidthClassName="max-w-5xl"
      panelClassName="max-h-[92vh]"
      bodyClassName="admin-dialog-stack"
      headerAside={
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            if (announcementId && onRefresh) {
              void onRefresh(announcementId);
            }
          }}
          disabled={!announcementId || !onRefresh || loading}
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          刷新
        </Button>
      }
      footer={
        <div className="flex justify-end">
          <Button variant="outline" onClick={onClose}>
            关闭
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="grid gap-2">
          <div className="text-xs text-cf-subtle">
            {`${announcementTitle ? `${announcementTitle} · ` : ''}应读 ${statsData?.expectedCount ?? 0} 人 · 已读 ${statsData?.readCount ?? 0} 人 · 未读 ${statsData?.unreadCount ?? 0} 人`}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant={view === 'read' ? 'default' : 'outline'}
              size="sm"
              onClick={() => {
                setView('read');
                setPage(1);
              }}
            >
              已读
            </Button>
            <Button
              type="button"
              variant={view === 'unread' ? 'default' : 'outline'}
              size="sm"
              onClick={() => {
                setView('unread');
                setPage(1);
              }}
            >
              未读
            </Button>
          </div>
        </div>

        <div className="relative w-full lg:w-80">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-cf-faint" />
          <Input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            className="h-10 pl-10"
            placeholder="搜索用户 ID、账号、姓名或部门"
          />
        </div>
      </div>

      <div className="flex min-h-0 flex-col gap-3">
        {loading ? (
          <InnerTableSurface>
            <InlineState title="正在加载阅读明细..." className="py-10" />
          </InnerTableSurface>
        ) : pagedUsers.length === 0 ? (
          <InnerTableSurface>
            <InlineState
              title={view === 'read'
                ? ((statsData?.readUsers?.length ?? 0) > 0 ? '未找到匹配用户' : '暂无阅读记录')
                : ((statsData?.unreadUsers?.length ?? 0) > 0 ? '未找到匹配用户' : '全部已读')}
              description={
                view === 'read'
                  ? ((statsData?.readUsers?.length ?? 0) > 0 ? '请尝试调整搜索条件。' : '这条公告还没有被任何用户读取。')
                  : ((statsData?.unreadUsers?.length ?? 0) > 0 ? '请尝试调整搜索条件。' : '目标范围内的用户已全部阅读。')
              }
              icon={view === 'unread' ? <Users className="h-4 w-4" /> : undefined}
              className="py-10"
            />
          </InnerTableSurface>
        ) : (
          <>
            <InnerTableSurface>
              <table className="unity-data-table admin-source-table min-w-[760px]">
                <thead>
                  <tr>
                    <th>用户 ID</th>
                    <th>登录账号</th>
                    <th>显示名称</th>
                    <th>所属部门</th>
                    <th>{view === 'read' ? '阅读时间' : '状态'}</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedUsers.map((user) => (
                    <tr key={`${view}-${user.userId}-${user.readTime || 'unknown'}`}>
                      <td className="text-sm text-cf-muted">
                        {user.userId}
                      </td>
                      <td className="text-sm font-medium text-cf-title">
                        {user.userName || '-'}
                      </td>
                      <td className="text-sm text-cf-body">
                        {user.nickName || '-'}
                      </td>
                      <td className="text-sm text-cf-subtle">
                        {user.deptName || '-'}
                      </td>
                      <td className="text-sm text-cf-subtle">
                        {view === 'read'
                          ? (user.readTime ? new Date(user.readTime).toLocaleString() : '-')
                          : '未读'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </InnerTableSurface>

            {filteredUsers.length > pageSize ? (
              <Pagination
                total={filteredUsers.length}
                page={currentPage}
                pageSize={pageSize}
                showPageSizeSelector={false}
                showJump={false}
                onPageChange={setPage}
                onPageSizeChange={() => {}}
              />
            ) : null}
          </>
        )}
      </div>
    </BaseDialog>
  );
};
