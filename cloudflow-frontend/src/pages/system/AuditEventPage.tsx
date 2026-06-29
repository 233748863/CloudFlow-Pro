import React, { useEffect, useMemo, useState } from 'react';
import { getConfigIntSync } from '../../hooks/useSystemConfig';
import { SYS_PAGE_DEFAULT_PAGE_SIZE } from '../../constants/sysConfig';
import { Download, Eye, FileClock, RefreshCw, RotateCcw, Search, ShieldCheck, UserRound } from 'lucide-react';
import { toast } from 'sonner';
import {
  BaseDialog,
  Button,
  DatePicker,
  Input,
  LoadingSpinner,
  Pagination,
} from '@/components/common';
import { AuditEvent, AuditEventQuery, exportAuditEvents, listAuditEvents } from '@/services/api/auditEvent';
import { downloadBlob } from '@/utils/download';
import { cn } from '@/utils/cn';
import { getErrorMessage } from '@/utils/errorMessage';
import { InnerTableSurface, TablePageLayout } from '@/components/layout/TablePageLayout';

const normalizeListResponse = (response: any) => {
  const rows = Array.isArray(response?.records)
    ? response.records
    : Array.isArray(response?.rows)
      ? response.rows
      : Array.isArray(response)
        ? response
        : [];
  return {
    rows: rows as AuditEvent[],
    total: typeof response?.total === 'number' ? response.total : rows.length,
  };
};

const formatDateTime = (value?: string) => value ? value.replace('T', ' ').slice(0, 19) : '-';

const formatJson = (value?: string) => {
  if (!value) return '无快照';
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
};

const TableStateRow: React.FC<{ colSpan: number; title: string; loading?: boolean }> = ({ colSpan, title, loading }) => (
  <tr className="hover:bg-transparent dark:hover:bg-transparent">
    <td colSpan={colSpan} className="px-4 py-10 text-center">
      {loading ? <LoadingSpinner size="lg" className="mx-auto mb-3" /> : null}
      <div className="text-sm text-slate-500 dark:text-slate-400">{title}</div>
    </td>
  </tr>
);

export const AuditEventPage = () => {
  const [rows, setRows] = useState<AuditEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [detail, setDetail] = useState<AuditEvent | null>(null);
  const [query, setQuery] = useState<AuditEventQuery>({ pageNum: 1, pageSize: getConfigIntSync(SYS_PAGE_DEFAULT_PAGE_SIZE, 10) });
  const [filters, setFilters] = useState({
    businessType: '',
    businessId: '',
    eventType: '',
    operatorName: '',
    beginTime: '',
    endTime: '',
  });

  const fetchList = async () => {
    setLoading(true);
    try {
      const response = await listAuditEvents(query);
      const normalized = normalizeListResponse(response);
      setRows(normalized.rows);
      setTotal(normalized.total);
    } catch (error) {
      toast.error(getErrorMessage(error, '加载审计台账失败'));
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchList();
  }, [query]);

  const toQueryParams = (): AuditEventQuery => ({
    businessType: filters.businessType.trim() || undefined,
    businessId: filters.businessId ? Number(filters.businessId) : undefined,
    eventType: filters.eventType.trim() || undefined,
    operatorName: filters.operatorName.trim() || undefined,
    beginTime: filters.beginTime ? filters.beginTime.replace('T', ' ') + ':00' : undefined,
    endTime: filters.endTime ? filters.endTime.replace('T', ' ') + ':00' : undefined,
  });

  const handleSearch = (event: React.FormEvent) => {
    event.preventDefault();
    setQuery((current) => ({ ...current, pageNum: 1, ...toQueryParams() }));
  };

  const handleReset = () => {
    setFilters({ businessType: '', businessId: '', eventType: '', operatorName: '', beginTime: '', endTime: '' });
    setQuery({ pageNum: 1, pageSize: query.pageSize });
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const blob = await exportAuditEvents(toQueryParams());
      const fileName = downloadBlob(blob, `审计台账_${new Date().toISOString().slice(0, 10)}.csv`);
      toast.success(`已导出审计台账：${fileName}`);
    } catch (error) {
      toast.error(getErrorMessage(error, '导出失败，请确认筛选结果不超过5000条'));
    } finally {
      setExporting(false);
    }
  };

  const hasActiveFilters = Boolean(
    query.businessType || query.businessId || query.eventType || query.operatorName || query.beginTime || query.endTime,
  );

  const stats = useMemo(
    () => [
      {
        label: '事件总数',
        value: String(total),
        meta: `当前页 ${rows.length}`,
        icon: <FileClock size={18} />,
        tone: 'blue',
      },
      {
        label: '业务类型',
        value: String(new Set(rows.map((item) => item.businessType).filter(Boolean)).size),
        meta: '本页去重',
        icon: <ShieldCheck size={18} />,
        tone: 'violet',
      },
      {
        label: '操作人',
        value: String(new Set(rows.map((item) => item.operatorName || 'system')).size),
        meta: '本页去重',
        icon: <UserRound size={18} />,
        tone: 'green',
      },
      {
        label: '导出状态',
        value: exporting ? '进行中' : '就绪',
        meta: 'CSV 台账',
        icon: <Download size={18} />,
        tone: 'amber',
      },
    ],
    [exporting, rows, total],
  );

  const pageActions = (
    <>
      <header className="admin-source-header">
        <div>
          <p className="admin-source-kicker">AUDIT EVENTS</p>
          <h2>审计台账</h2>
          <span>按业务、事件、操作人和时间追踪审计事件</span>
        </div>
        <div className="admin-source-controls">
          <Button type="button" variant="outline" size="sm" onClick={() => void fetchList()} disabled={loading}>
            <RefreshCw size={16} className={cn(loading && 'animate-spin')} />
            刷新
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => void handleExport()} disabled={exporting}>
            <Download size={16} className={cn(exporting && 'text-cyan-600 dark:text-cyan-300')} />
            导出
          </Button>
        </div>
      </header>

      <section className="admin-source-stat-grid">
        {stats.map((stat) => (
          <article key={stat.label} className={`card admin-source-stat admin-source-tone-${stat.tone}`}>
            <div className="admin-source-stat-icon">{stat.icon}</div>
            <div>
              <p>{stat.label}</p>
              <strong>{stat.value}</strong>
              <span>{stat.meta}</span>
            </div>
          </article>
        ))}
      </section>
    </>
  );

  const pageFilters = (
    <section className="card admin-users-toolbar">
      <form onSubmit={handleSearch} className="admin-audit-event-filter-grid">
        <label className="admin-source-search">
          <span className="input-label">业务类型</span>
          <div className="admin-source-search-field">
            <Search size={16} />
            <Input
              value={filters.businessType}
              onChange={(event) => setFilters((current) => ({ ...current, businessType: event.target.value }))}
              placeholder="业务类型"
              type="search"
            />
          </div>
        </label>

        <label>
          <span className="input-label">业务 ID</span>
          <Input
            value={filters.businessId}
            onChange={(event) => setFilters((current) => ({ ...current, businessId: event.target.value }))}
            placeholder="业务 ID"
          />
        </label>

        <label>
          <span className="input-label">事件类型</span>
          <Input
            value={filters.eventType}
            onChange={(event) => setFilters((current) => ({ ...current, eventType: event.target.value }))}
            placeholder="事件类型"
          />
        </label>

        <label>
          <span className="input-label">操作人</span>
          <Input
            value={filters.operatorName}
            onChange={(event) => setFilters((current) => ({ ...current, operatorName: event.target.value }))}
            placeholder="操作人"
          />
        </label>

        <label>
          <span className="input-label">开始时间</span>
          <DatePicker
            type="datetime-local"
            value={filters.beginTime}
            onChange={(event) => setFilters((current) => ({ ...current, beginTime: event.target.value }))}
          />
        </label>

        <label>
          <span className="input-label">结束时间</span>
          <DatePicker
            type="datetime-local"
            value={filters.endTime}
            onChange={(event) => setFilters((current) => ({ ...current, endTime: event.target.value }))}
          />
        </label>

        <div className="admin-users-toolbar-actions">
          <span className="admin-users-filter-count">当前 {total} 项</span>
          <Button type="submit" size="sm">
            查询
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleReset}
            disabled={!hasActiveFilters}
          >
            <RotateCcw size={14} />
            重置
          </Button>
        </div>
      </form>
    </section>
  );

  const pageTable = (
    <InnerTableSurface className="admin-audit-event-table-panel">
      <table className="unity-data-table admin-source-table admin-audit-event-table min-w-[1080px]">
          <thead>
            <tr>
              <th>事件</th>
              <th>业务</th>
              <th>事件类型</th>
              <th>操作人</th>
              <th>事件时间</th>
              <th>内容</th>
              <th className="text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <TableStateRow colSpan={7} title="正在加载审计事件..." loading />
            ) : rows.length === 0 ? (
              <TableStateRow colSpan={7} title="暂无审计事件" />
            ) : rows.map((event) => (
              <tr key={event.id}>
                <td>
                  <div className="flex items-center gap-2 font-medium text-slate-900 dark:text-slate-100">
                    <FileClock size={15} className="text-[#0d95b5]" />
                    {event.title || event.eventType}
                  </div>
                </td>
                <td>{event.businessType}#{event.businessId}</td>
                <td>
                  <span className="rounded-md border border-slate-200 px-2.5 py-1 text-xs dark:border-slate-700">
                    {event.eventType}
                  </span>
                </td>
                <td>{event.operatorName || 'system'}</td>
                <td className="whitespace-nowrap">{formatDateTime(event.eventTime)}</td>
                <td>
                  <div className="max-w-[320px] truncate text-sm text-slate-500 dark:text-slate-400" title={event.content}>
                    {event.content || '-'}
                  </div>
                </td>
                <td>
                  <div className="admin-users-row-actions">
                    <button type="button" title="查看详情" onClick={() => setDetail(event)}>
                      <Eye size={15} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
      </table>
    </InnerTableSurface>
  );

  const pagePagination = total > 0 ? (
    <Pagination
      total={total}
      page={query.pageNum || 1}
      pageSize={query.pageSize || 10}
      onPageChange={(pageNum) => setQuery((current) => ({ ...current, pageNum }))}
      onPageSizeChange={(pageSize) => setQuery((current) => ({ ...current, pageNum: 1, pageSize }))}
    />
  ) : null;

  return (
    <>
      <section className="admin-source-page admin-audit-event-page">
        <TablePageLayout
          actions={pageActions}
          filters={pageFilters}
          table={pageTable}
          pagination={pagePagination}
        />
      </section>

      <BaseDialog
        open={Boolean(detail)}
        title="审计事件详情"
        onClose={() => setDetail(null)}
        maxWidthClassName="max-w-3xl"
      >
        {detail ? (
          <div className="admin-dialog-stack">
            <div className="grid gap-3 text-sm md:grid-cols-2">
              <div><span className="text-slate-400">业务：</span>{detail.businessType}#{detail.businessId}</div>
              <div><span className="text-slate-400">事件：</span>{detail.eventType}</div>
              <div><span className="text-slate-400">操作人：</span>{detail.operatorName || 'system'}</div>
              <div><span className="text-slate-400">时间：</span>{formatDateTime(detail.eventTime)}</div>
            </div>
            <div className="rounded-md border border-slate-200 bg-[var(--cf-surface-strong)] p-3 text-sm dark:border-slate-800 dark:bg-slate-950">
              {detail.content || '-'}
            </div>
            <pre className="max-h-[420px] overflow-auto rounded-md bg-slate-950 p-3 text-xs text-slate-100">
              {formatJson(detail.snapshotJson)}
            </pre>
          </div>
        ) : null}
      </BaseDialog>
    </>
  );
};

export default AuditEventPage;
