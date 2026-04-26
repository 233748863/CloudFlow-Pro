import React, { useEffect, useMemo, useState } from 'react';
import { CheckCheck, RefreshCw, Search } from 'lucide-react';
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
} from '@/components/ui';

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
  const pageSize = 10;

  useEffect(() => {
    if (open) {
      setSearch('');
      setPage(1);
    }
  }, [announcementId, open]);

  const filteredUsers = useMemo(() => {
    const readUsers = statsData?.readUsers ?? [];
    const keyword = search.trim().toLowerCase();

    const sortedUsers = [...readUsers].sort((left, right) => {
      const leftTime = left.readTime ? new Date(left.readTime).getTime() : 0;
      const rightTime = right.readTime ? new Date(right.readTime).getTime() : 0;
      return rightTime - leftTime;
    });

    if (!keyword) {
      return sortedUsers;
    }

    return sortedUsers.filter((user) => {
      const tokens = [String(user.userId), user.userName || '', user.nickName || ''];
      return tokens.some((token) => token.toLowerCase().includes(keyword));
    });
  }, [search, statsData]);

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
        <div className="text-xs text-slate-500 dark:text-slate-400">
          {`${announcementTitle ? `${announcementTitle} · ` : ''}已读 ${statsData?.readCount ?? 0} 人 · 筛选结果 ${filteredUsers.length} 人`}
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
            placeholder="搜索用户 ID、账号或显示名称"
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950/88">
        {loading ? (
          <InlineState title="正在加载阅读明细..." className="py-14" />
        ) : pagedUsers.length === 0 ? (
          <InlineState
            title={statsData?.readUsers?.length ? '未找到匹配用户' : '暂无阅读记录'}
            description={
              statsData?.readUsers?.length ? '请尝试调整搜索条件。' : '这条公告还没有被任何用户读取。'
            }
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
                    <TableHead>阅读时间</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagedUsers.map((user) => (
                    <TableRow key={`${user.userId}-${user.readTime || 'unknown'}`}>
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
                        {user.readTime ? new Date(user.readTime).toLocaleString() : '-'}
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
