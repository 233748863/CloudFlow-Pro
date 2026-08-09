import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Clock3, Diff, Filter, RotateCcw } from 'lucide-react';
import { Button, Input, LoadingSpinner } from '@/components/common';
import { getTimelineDiff, listTimeline, TimelineDiff, TimelineEvent } from '@/services/api/timeline';
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

const formatJson = (value?: string) => {
  if (!value) return '';
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
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
  const [filterEventType, setFilterEventType] = useState('');
  const [rows, setRows] = useState<TimelineEvent[]>(events || []);
  const [loading, setLoading] = useState(false);
  const [expandedSnapshotId, setExpandedSnapshotId] = useState<number | null>(null);
  const [diffs, setDiffs] = useState<Record<number, TimelineDiff>>({});
  const [diffLoadingId, setDiffLoadingId] = useState<number | null>(null);

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

  const visibleRows = useMemo(() => {
    const type = filterEventType.trim().toUpperCase();
    if (!type) return rows;
    return rows.filter((event) => event.eventType?.toUpperCase().includes(type));
  }, [rows, filterEventType]);

  const handleReset = () => {
    setFilterType(businessType);
    setFilterId(businessId ? String(businessId) : '');
    setFilterEventType('');
  };

  const toggleDiff = async (id: number) => {
    if (diffs[id]) {
      setDiffs((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
      return;
    }
    setDiffLoadingId(id);
    try {
      const diff = await getTimelineDiff(id);
      setDiffs((current) => ({ ...current, [id]: diff }));
    } catch {
      setDiffs((current) => ({ ...current, [id]: { eventId: id, businessType: '', businessId: 0, changedFields: [] } }));
    } finally {
      setDiffLoadingId(null);
    }
  };

  return (
    <div className="table-scroll-container admin-inner-table-surface admin-source-panel no-padding">
      <div className="p-4 admin-source-section-head flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm font-medium text-cf-title">{title}</div>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={filterEventType}
            onChange={(event) => setFilterEventType(event.target.value)}
            placeholder="事件类型"
            className="h-9 w-32"
          />
          {showFilters ? (
            <>
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
            </>
          ) : null}
          <Button size="sm" variant="ghost" onClick={handleReset}>
            <RotateCcw size={14} />
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10">
          <LoadingSpinner size="lg" />
        </div>
      ) : visibleRows.length ? (
        <div className="grid gap-3 p-4">
          {visibleRows.map((event, index) => {
            const snapshotOpen = expandedSnapshotId === event.id;
            const diff = diffs[event.id];
            return (
              <div key={event.id} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-cyan-50 text-cyan-600 dark:bg-cyan-950/30 dark:text-cyan-200">
                    <Clock3 size={14} />
                  </div>
                  {index < visibleRows.length - 1 ? (
                    <div className="mt-2 h-full w-px bg-slate-200 dark:bg-slate-800" />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1 px-3 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="truncate text-sm font-medium text-cf-title">
                      {event.title || event.eventType}
                    </div>
                    <div className="text-xs text-cf-faint">{formatDateTime(event.eventTime)}</div>
                  </div>
                  <div className="mt-1 text-sm text-cf-muted">
                    {event.content || '-'}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-cf-faint">
                    <span>{event.operatorName || 'system'}</span>
                    <span className="h-1 w-1 rounded-sm bg-slate-300 dark:bg-slate-700" />
                    <span>{event.businessType}#{event.businessId}</span>
                    <span className="badge badge-gray">{event.eventType}</span>
                    {event.snapshotJson ? (
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setExpandedSnapshotId(snapshotOpen ? null : event.id)}>
                        {snapshotOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                        快照
                      </Button>
                    ) : null}
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => void toggleDiff(event.id)}>
                      <Diff size={13} className={cn(diffLoadingId === event.id && 'text-cyan-600 dark:text-cyan-300')} />
                      差异
                    </Button>
                  </div>
                  {snapshotOpen ? (
                    <pre className="mt-3 max-h-64 overflow-auto rounded-md bg-slate-950 p-3 text-xs text-slate-100">
                      {formatJson(event.snapshotJson)}
                    </pre>
                  ) : null}
                  {diff ? (
                    <div className="mt-3 p-3">
                      {diff.changedFields?.length ? (
                        <div className="admin-dialog-field">
                          {diff.changedFields.map((field) => (
                            <div key={field.field} className="grid gap-2 text-xs md:grid-cols-[150px_1fr_1fr]">
                              <div className="font-mono text-cf-subtle">{field.field}</div>
                              <div className="rounded bg-[var(--cf-surface-muted)] px-2 py-1 text-cf-subtle dark:bg-slate-900">{String(field.beforeValue ?? '-')}</div>
                              <div className="rounded bg-emerald-50 px-2 py-1 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-200">{String(field.afterValue ?? '-')}</div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-xs text-cf-faint">无字段差异</div>
                      )}
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="py-6 text-center text-sm text-cf-faint">暂无链路事件</div>
      )}
    </div>
  );
};

export default BusinessTimeline;
