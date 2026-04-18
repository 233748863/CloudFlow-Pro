import React, { useEffect, useMemo, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import type { ReadStatsResponse } from '@/services/api/announcement';
import { BaseDialog, EmptyState, Pagination, SearchInput } from '@/components/common';
import { Button } from '@/components/ui';

interface AnnouncementReadStatusDialogProps {
  open: boolean;
  announcementId: number | null;
  announcementTitle?: string;
  statsData: ReadStatsResponse | null;
  loading?: boolean;
  onRefresh?: (announcementId: number) => void | Promise<void>;
  onClose: () => void;
}

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
  const [pageSize, setPageSize] = useState(10);

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
      const tokens = [
        String(user.userId),
        user.userName || '',
        user.nickName || '',
      ];

      return tokens.some((token) => token.toLowerCase().includes(keyword));
    });
  }, [search, statsData]);

  const pageCount = Math.max(1, Math.ceil(filteredUsers.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pagedUsers = filteredUsers.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  useEffect(() => {
    if (page > pageCount) {
      setPage(pageCount);
    }
  }, [page, pageCount]);

  return (
    <BaseDialog
      open={open}
      title="阅读状态"
      description={announcementTitle ? `查看“${announcementTitle}”的已读用户明细` : '查看公告已读用户明细'}
      onClose={onClose}
      maxWidthClassName="max-w-5xl"
      footer={(
        <div className="flex justify-end">
          <Button variant="outline" className="rounded-xl" onClick={onClose}>
            关闭
          </Button>
        </div>
      )}
    >
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex-1">
            <SearchInput
              value={search}
              placeholder="搜索用户..."
              onChange={setSearch}
              onSearch={() => setPage(1)}
            />
          </div>
          <Button
            variant="outline"
            className="rounded-xl"
            onClick={() => {
              if (announcementId && onRefresh) {
                void onRefresh(announcementId);
              }
            }}
            disabled={!announcementId || !onRefresh || loading}
            title="刷新阅读状态"
          >
            <RotateCcw size={16} className={loading ? 'animate-spin' : ''} />
          </Button>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="text-3xl font-bold text-cyan-700">
            {statsData?.readCount ?? 0}
          </div>
          <div className="mt-1 text-sm text-slate-500">已读人数</div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">用户ID</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">登录账号</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">显示名称</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">阅读时间</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pagedUsers.map((user) => (
                  <tr key={`${user.userId}-${user.readTime || 'unknown'}`} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-sm text-slate-700">{user.userId}</td>
                    <td className="px-4 py-3 text-sm font-medium text-slate-900">{user.userName || '-'}</td>
                    <td className="px-4 py-3 text-sm text-slate-700">{user.nickName || '-'}</td>
                    <td className="px-4 py-3 text-sm text-slate-500">
                      {user.readTime ? new Date(user.readTime).toLocaleString() : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {!loading && pagedUsers.length === 0 ? (
            <EmptyState
              title={statsData?.readUsers?.length ? '未找到匹配用户' : '暂无阅读记录'}
              description={statsData?.readUsers?.length ? '请尝试调整搜索条件。' : '这条公告还没有被任何用户读取。'}
              className="px-6 py-12"
            />
          ) : null}
        </div>

        {filteredUsers.length > 0 ? (
          <Pagination
            total={filteredUsers.length}
            page={currentPage}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={(nextPageSize) => {
              setPageSize(nextPageSize);
              setPage(1);
            }}
          />
        ) : null}
      </div>
    </BaseDialog>
  );
};
