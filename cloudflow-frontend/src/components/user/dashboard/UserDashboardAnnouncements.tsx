import React from 'react';
import { Bell } from 'lucide-react';
import { EmptyState, LoadingSpinner } from '@/components/common';
import { Button } from '@/components/ui';
import { getAnnouncementExcerpt } from '@/utils/announcementContent';

interface UserDashboardAnnouncementsProps {
  announcements: any[];
  readIds: Set<string>;
  loading: boolean;
  onOpenList: () => void;
  onOpenItem: (id: string) => void;
}

export const UserDashboardAnnouncements: React.FC<UserDashboardAnnouncementsProps> = ({
  announcements,
  readIds,
  loading,
  onOpenList,
  onOpenItem,
}) => (
  <div className="card">
    <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
      <h2 className="text-lg font-semibold text-slate-900">公告提醒</h2>
      <Button variant="outline" size="sm" onClick={onOpenList}>
        查看全部
      </Button>
    </div>
    <div className="p-6">
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <LoadingSpinner size="lg" />
        </div>
      ) : announcements.length === 0 ? (
        <EmptyState
          icon={<Bell className="empty-state-icon h-10 w-10" />}
          title="暂无公告"
          description="公告发布后会自动显示在这里。"
        />
      ) : (
        <div className="grid gap-3 xl:grid-cols-3">
          {announcements.map((item) => {
            const id = String(item.announcementId || item.id);
            const isRead = readIds.has(id);

            return (
              <button
                key={id}
                type="button"
                onClick={() => onOpenItem(id)}
                className={`rounded-xl border p-4 text-left transition-colors ${
                  isRead
                    ? 'border-slate-200 bg-slate-50 hover:bg-slate-100'
                    : 'border-teal-200 bg-teal-50/60 hover:bg-teal-50'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="line-clamp-1 text-sm font-medium text-slate-900">
                      {item.title || '系统公告'}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      {item.publishTime || '刚刚发布'}
                    </p>
                  </div>
                  {!isRead ? <span className="badge badge-primary">未读</span> : null}
                </div>
                <p className="mt-3 line-clamp-3 text-xs leading-6 text-slate-500">
                  {getAnnouncementExcerpt(item.summary || item.content)}
                </p>
              </button>
            );
          })}
        </div>
      )}
    </div>
  </div>
);

