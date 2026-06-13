import React, { useEffect, useMemo, useState } from 'react';
import { CheckCheck, RefreshCw, Search, Users } from 'lucide-react';
import type { ReadStatsResponse } from '@/services/api/announcement';
import { BaseDialog, Pagination } from '@/components/common';
import {
  Button,
  Input,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
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
    <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-500">
      {icon || <CheckCheck className="h-4 w-4" />}
    </div>
    <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{title}</div>
    {description ? <div className="mt-2 text-xs leading-6 text-slate-500 dark:text-slate-400">{description}</div> : null}
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
      bodyClassName="space-y-4"
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
        <div className="space-y-2">
          <div className="text-xs text-slate-500 dark:text-slate-400">
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
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
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

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950/88">
        {loading ? (
          <InlineState title="正在加载阅读明细..." className="py-14" />
        ) : pagedUsers.length === 0 ? (
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
            className="py-14"
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table className="min-w-[760px]">
                <TableHeader className="bg-slate-50/80 dark:bg-slate-900/60">
                  <TableRow>
                    <TableHead>用户 ID</TableHead>
                    <TableHead>登录账号</TableHead>
                    <TableHead>显示名称</TableHead>
                    <TableHead>所属部门</TableHead>
                    <TableHead>{view === 'read' ? '阅读时间' : '状态'}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagedUsers.map((user) => (
                    <TableRow key={`${view}-${user.userId}-${user.readTime || 'unknown'}`}>
                      <TableCell className="py-3 text-sm text-slate-600 dark:text-slate-300">
                        {user.userId}
                      </TableCell>
                      <TableCell className="py-3 text-sm font-medium text-slate-900 dark:text-slate-100">
                        {user.userName || '-'}
                      </TableCell>
                      <TableCell className="py-3 text-sm text-slate-700 dark:text-slate-200">
                        {user.nickName || '-'}
                      </TableCell>
                      <TableCell className="py-3 text-sm text-slate-500 dark:text-slate-400">
                        {user.deptName || '-'}
                      </TableCell>
                      <TableCell className="py-3 text-sm text-slate-500 dark:text-slate-400">
                        {view === 'read'
                          ? (user.readTime ? new Date(user.readTime).toLocaleString() : '-')
                          : '未读'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

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
