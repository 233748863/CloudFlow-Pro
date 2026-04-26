import React from 'react';
import { ArrowRight, Bell } from 'lucide-react';
import { Button, EmptyState, LoadingSpinner } from '@/components/common';
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
  <section className="card overflow-hidden">
    <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 dark:border-slate-800">
      <div>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">公告提醒</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">最新通知与系统广播</p>
      </div>
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
                className={`group rounded-2xl border p-4 text-left transition-all ${
                  isRead
                    ? 'border-slate-200 bg-slate-50/80 hover:bg-white dark:border-slate-800 dark:bg-slate-900/70 dark:hover:bg-slate-900'
                    : 'border-cyan-200 bg-cyan-50/70 hover:bg-cyan-50 dark:border-cyan-900 dark:bg-cyan-950/20 dark:hover:bg-cyan-950/30'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="line-clamp-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {item.title || '系统公告'}
                    </p>
                    <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                      {item.publishTime || '刚刚发布'}
                    </p>
                  </div>
                  {!isRead ? <span className="badge badge-primary">未读</span> : null}
                </div>
                <p className="mt-3 line-clamp-3 text-xs leading-6 text-slate-500 dark:text-slate-400">
                  {getAnnouncementExcerpt(item.summary || item.content)}
                </p>
                <div className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-cyan-700 dark:text-cyan-200">
                  打开公告
                  <ArrowRight size={12} className="transition-transform group-hover:translate-x-0.5" />
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  </section>
);
