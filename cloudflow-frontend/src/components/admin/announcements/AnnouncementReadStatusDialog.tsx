import React, { useEffect, useMemo, useState } from 'react';
import { CheckCheck, RefreshCw, Search } from 'lucide-react';
import type { ReadStatsResponse } from '@/services/api/announcement';
import { BaseDialog } from '@/components/common';
import { Button, Input, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui';
import { WorkspaceInlineState, WorkspacePaginationBar } from '@/components/workspace';

interface AnnouncementReadStatusDialogProps {
  open: boolean;
  announcementId: number | null;
  announcementTitle?: string;
  statsData: ReadStatsResponse | null;
  loading?: boolean;
  onRefresh?: (announcementId: number) => void | Promise<void>;
  onClose: () => void;
}

const surfaceChipClassName =
  'rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300';

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

    const users = [...readUsers].sort((left, right) => {
      const leftTime = left.readTime ? new Date(left.readTime).getTime() : 0;
      const rightTime = right.readTime ? new Date(right.readTime).getTime() : 0;
      return rightTime - leftTime;
    });

    if (!keyword) {
      return users;
    }

    return users.filter((user) => {
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
      description={announcementTitle ? `查看“${announcementTitle}”的已读用户明细` : '查看公告已读用户明细'}
      onClose={onClose}
      maxWidthClassName="max-w-5xl"
      headerAside={
        <div className="flex flex-wrap gap-2">
          <span className={surfaceChipClassName}>已读人数 {statsData?.readCount ?? 0}</span>
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
        </div>
      }
      footer={
        <div className="flex justify-end">
          <Button variant="outline" onClick={onClose}>
            关闭
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="rounded-2xl border border-slate-200 bg-slate-50/90 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
                Read Stats
              </div>
              <div className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">
                已读用户明细
              </div>
              <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                统一查看账号、显示名称和最近阅读时间，减少公告管理里的跳出式查询。
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <span className={surfaceChipClassName}>已读 {statsData?.readCount ?? 0} 人</span>
              <span className={surfaceChipClassName}>筛选结果 {filteredUsers.length} 人</span>
            </div>
          </div>
        </div>

        <div className="relative">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
          <Input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            className="pl-10"
            placeholder="搜索用户 ID、账号或显示名称"
          />
        </div>

        {loading ? (
          <WorkspaceInlineState type="loading" title="正在加载阅读明细..." className="py-14" />
        ) : pagedUsers.length === 0 ? (
          <WorkspaceInlineState
            icon={<CheckCheck className="h-5 w-5" />}
            title={statsData?.readUsers?.length ? '未找到匹配用户' : '暂无阅读记录'}
            description={
              statsData?.readUsers?.length ? '请尝试调整搜索条件。' : '这条公告还没有被任何用户读取。'
            }
            className="py-14"
          />
        ) : (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950/88">
            <Table className="min-w-[760px]">
              <TableHeader>
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
                    <TableCell className="py-4 text-sm text-slate-600 dark:text-slate-300">
                      {user.userId}
                    </TableCell>
                    <TableCell className="py-4 text-sm font-medium text-slate-900 dark:text-slate-100">
                      {user.userName || '-'}
                    </TableCell>
                    <TableCell className="py-4 text-sm text-slate-700 dark:text-slate-200">
                      {user.nickName || '-'}
                    </TableCell>
                    <TableCell className="py-4 text-sm text-slate-500 dark:text-slate-400">
                      {user.readTime ? new Date(user.readTime).toLocaleString() : '-'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {filteredUsers.length > pageSize ? (
              <WorkspacePaginationBar
                total={filteredUsers.length}
                pageNum={currentPage}
                totalPages={totalPages}
                onPrev={() => setPage((prev) => Math.max(1, prev - 1))}
                onNext={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                prevDisabled={currentPage <= 1}
                nextDisabled={currentPage >= totalPages}
              />
            ) : null}
          </div>
        )}
      </div>
    </BaseDialog>
  );
};
