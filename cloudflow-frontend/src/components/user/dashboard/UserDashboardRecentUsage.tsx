import React from 'react';
import { ArrowRight } from 'lucide-react';
import { EmptyState, LoadingSpinner } from '@/components/common';
import './UserDashboardRecentUsage.css';

export interface UserDashboardRecentUsageItem {
  id: string;
  title: string;
  description: string;
  timeLabel: string;
  typeLabel: string;
  icon: React.ReactNode;
  toneClassName: string;
  onClick: () => void;
}

interface UserDashboardRecentUsageProps {
  items: UserDashboardRecentUsageItem[];
  loading: boolean;
  rangeLabel: string;
}

export const UserDashboardRecentUsage: React.FC<UserDashboardRecentUsageProps> = ({
  items,
  loading,
  rangeLabel,
}) => (
  <article className="recent-usage-card">
    <div className="recent-usage-header">
      <h2>最近活动</h2>
      <span>{rangeLabel}</span>
    </div>

    <div className="recent-usage-body">
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <LoadingSpinner size="lg" />
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          title="当前时间范围没有活动"
          description="可以调整日期范围，或者前往工作台发起新的流程。"
        />
      ) : (
        <div className="recent-usage-list">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={item.onClick}
              className="recent-usage-row group w-full border-0 bg-transparent text-left"
            >
              <div className="recent-usage-left">
                <div
                  className={`recent-usage-icon ${item.toneClassName}`}
                >
                  {item.icon}
                </div>
                <div className="min-w-0">
                  <p className="recent-usage-model">{item.title}</p>
                  <p className="recent-usage-time">
                    {item.timeLabel} · {item.description}
                  </p>
                </div>
              </div>

              <div className="recent-usage-cost">
                <p>{item.typeLabel}</p>
                <span className="inline-flex items-center justify-end gap-1">
                  打开页面
                  <ArrowRight size={12} className="transition-transform group-hover:translate-x-0.5" />
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  </article>
);
