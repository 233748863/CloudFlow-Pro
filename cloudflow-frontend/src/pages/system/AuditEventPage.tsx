import React, { useEffect, useState } from 'react';
import { getConfigIntSync } from '../../hooks/useSystemConfig';
import { SYS_PAGE_DEFAULT_PAGE_SIZE } from '../../constants/sysConfig';
import { Download, Eye, FileClock, RefreshCw, RotateCcw, Search } from 'lucide-react';
import { toast } from 'sonner';
import {
  BaseDialog,
  Button,
  DatePicker,
  Input,
  LoadingSpinner,
  Pagination,
  Table,
  TableActionHead,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/common';
import { TablePageLayout, TableSurfaceCard } from '@/components/layout/TablePageLayout';
import { TableRowActions } from '@/components/common/table-row-actions';
import { AuditEvent, AuditEventQuery, exportAuditEvents, listAuditEvents } from '@/services/api/auditEvent';
import { downloadBlob } from '@/utils/download';
import { cn } from '@/utils/cn';
import { getErrorMessage } from '@/utils/errorMessage';

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
  <TableRow className="hover:bg-transparent dark:hover:bg-transparent">
    <TableCell colSpan={colSpan} className="px-4 py-14 text-center">
      {loading ? <LoadingSpinner size="lg" className="mx-auto mb-3" /> : null}
      <div className="text-sm text-slate-500 dark:text-slate-400">{title}</div>
    </TableCell>
  </TableRow>
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

  return (
    <>
      <TablePageLayout
        filters={(
          <div className="space-y-3 rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-950/88">
            <form onSubmit={handleSearch} className="grid gap-3 lg:grid-cols-[1fr_auto]">
              <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
                <div className="relative">
                  <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <Input value={filters.businessType} onChange={(event) => setFilters((current) => ({ ...current, businessType: event.target.value }))} placeholder="业务类型" className="h-10 pl-10" />
                </div>
                <Input value={filters.businessId} onChange={(event) => setFilters((current) => ({ ...current, businessId: event.target.value }))} placeholder="业务ID" className="h-10" />
                <Input value={filters.eventType} onChange={(event) => setFilters((current) => ({ ...current, eventType: event.target.value }))} placeholder="事件类型" className="h-10" />
                <Input value={filters.operatorName} onChange={(event) => setFilters((current) => ({ ...current, operatorName: event.target.value }))} placeholder="操作人" className="h-10" />
                <DatePicker type="datetime-local" value={filters.beginTime} onChange={(event) => setFilters((current) => ({ ...current, beginTime: event.target.value }))} className="h-10" />
                <DatePicker type="datetime-local" value={filters.endTime} onChange={(event) => setFilters((current) => ({ ...current, endTime: event.target.value }))} className="h-10" />
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Button type="submit" size="sm">查询</Button>
                <Button type="button" variant="outline" size="sm" onClick={handleReset}><RotateCcw size={14} />重置</Button>
                <Button type="button" variant="outline" size="sm" onClick={() => void fetchList()} disabled={loading}>
                  <RefreshCw size={15} className={cn(loading && 'animate-spin')} />刷新
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => void handleExport()} disabled={exporting}>
                  <Download size={15} className={cn(exporting && 'animate-pulse')} />导出
                </Button>
              </div>
            </form>
          </div>
        )}
        table={(<TableSurfaceCard fill>
          <div className="overflow-x-auto">
            <Table className="min-w-[1080px]">
              <TableHeader>
                <TableRow>
                  <TableHead>事件</TableHead>
                  <TableHead>业务</TableHead>
                  <TableHead>事件类型</TableHead>
                  <TableHead>操作人</TableHead>
                  <TableHead>事件时间</TableHead>
                  <TableHead>内容</TableHead>
                  <TableActionHead className="w-20">操作</TableActionHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableStateRow colSpan={7} title="正在加载审计事件..." loading />
                ) : rows.length === 0 ? (
                  <TableStateRow colSpan={7} title="暂无审计事件" />
                ) : rows.map((event) => (
                  <TableRow key={event.id}>
                    <TableCell>
                      <div className="flex items-center gap-2 font-medium text-slate-900 dark:text-slate-100">
                        <FileClock size={15} className="text-cyan-600" />
                        {event.title || event.eventType}
                      </div>
                    </TableCell>
                    <TableCell>{event.businessType}#{event.businessId}</TableCell>
                    <TableCell><span className="rounded-full border border-slate-200 px-2.5 py-1 text-xs dark:border-slate-700">{event.eventType}</span></TableCell>
                    <TableCell>{event.operatorName || 'system'}</TableCell>
                    <TableCell>{formatDateTime(event.eventTime)}</TableCell>
                    <TableCell className="max-w-[320px] truncate text-sm text-slate-500" title={event.content}>{event.content || '-'}</TableCell>
                    <TableCell>
                      <TableRowActions
                        align="end"
                        actions={[{ label: '查看详情', icon: <Eye size={15} />, onClick: () => setDetail(event), tone: 'neutral' }]}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TableSurfaceCard>)}
        pagination={total > 0 ? (
          <Pagination
            total={total}
            page={query.pageNum || 1}
            pageSize={query.pageSize || 10}
            onPageChange={(pageNum) => setQuery((current) => ({ ...current, pageNum }))}
            onPageSizeChange={(pageSize) => setQuery((current) => ({ ...current, pageNum: 1, pageSize }))}
          />
        ) : null}
      />

      <BaseDialog
        open={Boolean(detail)}
        title="审计事件详情"
        onClose={() => setDetail(null)}
        maxWidthClassName="max-w-3xl"
      >
        {detail ? (
          <div className="space-y-4">
            <div className="grid gap-3 text-sm md:grid-cols-2">
              <div><span className="text-slate-400">业务：</span>{detail.businessType}#{detail.businessId}</div>
              <div><span className="text-slate-400">事件：</span>{detail.eventType}</div>
              <div><span className="text-slate-400">操作人：</span>{detail.operatorName || 'system'}</div>
              <div><span className="text-slate-400">时间：</span>{formatDateTime(detail.eventTime)}</div>
            </div>
            <div className="rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-800">
              {detail.content || '-'}
            </div>
            <pre className="max-h-[420px] overflow-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-100">
              {formatJson(detail.snapshotJson)}
            </pre>
          </div>
        ) : null}
      </BaseDialog>
    </>
  );
};

export default AuditEventPage;
