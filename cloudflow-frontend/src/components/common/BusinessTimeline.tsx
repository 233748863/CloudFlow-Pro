import React, { useEffect, useState } from 'react';
import { Clock3, Filter, RotateCcw } from 'lucide-react';
import { Button, Input, LoadingSpinner } from '@/components/common';
import { listTimeline, TimelineEvent } from '@/services/api/timeline';
import { cn } from '@/utils/cn';

interface BusinessTimelineProps {
  businessType?: string;
  businessId?: number;
  title?: string;
  limit?: number;
  showFilters?: boolean;
  events?: TimelineEvent[];
}

const formatDateTime = (value?: string) => {
  if (!value) return '-';
  return value.replace('T', ' ').slice(0, 19);
};

export const BusinessTimeline: React.FC<BusinessTimelineProps> = ({
  businessType = '',
  businessId,
  title = '链路时间线',
  limit = 50,
  showFilters = false,
  events,
}) => {
  const [filterType, setFilterType] = useState(businessType);
  const [filterId, setFilterId] = useState(businessId ? String(businessId) : '');
  const [rows, setRows] = useState<TimelineEvent[]>(events || []);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    if (events) {
      setRows(events);
      return;
    }
    setLoading(true);
    try {
      const data = await listTimeline({
        businessType: filterType.trim() || undefined,
        businessId: filterId ? Number(filterId) : undefined,
        limit,
      });
      setRows(data || []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [businessType, businessId, events]);

  const handleReset = () => {
    setFilterType(businessType);
    setFilterId(businessId ? String(businessId) : '');
  };

  return (
    <div className="rounded-xl border border-slate-200 px-4 py-4 dark:border-slate-800">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{title}</div>
        {showFilters ? (
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={filterType}
              onChange={(event) => setFilterType(event.target.value)}
              placeholder="业务类型"
              className="h-9 w-36"
            />
            <Input
              value={filterId}
              onChange={(event) => setFilterId(event.target.value)}
              placeholder="业务ID"
              className="h-9 w-28"
            />
            <Button size="sm" variant="outline" onClick={() => void load()}>
              <Filter size={14} />
              筛选
            </Button>
            <Button size="sm" variant="ghost" onClick={handleReset}>
              <RotateCcw size={14} />
            </Button>
          </div>
        ) : null}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10">
          <LoadingSpinner size="lg" />
        </div>
      ) : rows.length ? (
        <div className="space-y-3">
          {rows.map((event, index) => (
            <div key={event.id} className="flex gap-3">
              <div className="flex flex-col items-center">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-cyan-50 text-cyan-600 dark:bg-cyan-950/30 dark:text-cyan-200">
                  <Clock3 size={14} />
                </div>
                {index < rows.length - 1 ? (
                  <div className="mt-2 h-full w-px bg-slate-200 dark:bg-slate-800" />
                ) : null}
              </div>
              <div className="min-w-0 flex-1 rounded-lg border border-slate-100 px-3 py-3 dark:border-slate-800">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                    {event.title || event.eventType}
                  </div>
                  <div className="text-xs text-slate-400">{formatDateTime(event.eventTime)}</div>
                </div>
                <div className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                  {event.content || '-'}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                  <span>{event.operatorName || 'system'}</span>
                  <span className="h-1 w-1 rounded-full bg-slate-300 dark:bg-slate-700" />
                  <span>{event.businessType}#{event.businessId}</span>
                  <span
                    className={cn(
                      'rounded-full border border-slate-200 px-2 py-0.5 dark:border-slate-700',
                    )}
                  >
                    {event.eventType}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="py-8 text-center text-sm text-slate-400">暂无链路事件</div>
      )}
    </div>
  );
};

export default BusinessTimeline;
