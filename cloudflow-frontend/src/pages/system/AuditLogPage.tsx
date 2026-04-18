import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeftRight, Eye, RefreshCw, RotateCcw, Search, ShieldCheck, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  getAuditLogPage,
  getAuditLogDetail,
  deleteAuditLogs,
  SysAuditLog,
  AuditLogQuery,
} from '@/services/api/log';
import { DatePicker, TableActionHead, TableHead, TableHeader, Button, Card, Input } from '@/components/ui';
import { TableRowActions } from '@/components/ui/table-row-actions';
import {
  WorkspaceBackdrop,
  WorkspaceDialogShell,
  WorkspaceHeroCard,
  WorkspaceMetricCard,
  WorkspacePageContent,
  WorkspacePaginationBar,
  WorkspaceResultCard,
  WorkspaceTableStateRow,
  WorkspaceWorkbenchCard,
  workspaceGlassSurfaceClassName,
} from '@/components/workspace';

const formatDateCN = (date: Date) => {
  const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  return `${date.getMonth() + 1}月${date.getDate()}日 ${weekdays[date.getDay()]}`;
};

const AuditDetailModal: React.FC<{ log: SysAuditLog | null; onClose: () => void }> = ({ log, onClose }) => {
  if (!log) return null;

  return (
    <WorkspaceDialogShell
      title="审计详情"
      description="查看业务字段在本次操作中的变更前后值与操作人信息。"
      onClose={onClose}
      maxWidthClassName="max-w-5xl"
    >
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs text-slate-400">业务名称</div>
            <div className="mt-2 text-sm font-medium text-slate-900">{log.auditName || '-'}</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs text-slate-400">变更字段</div>
            <div className="mt-2 text-sm font-medium text-pink-600">{log.auditField || '-'}</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs text-slate-400">操作人</div>
            <div className="mt-2 text-sm font-medium text-slate-900">{log.createBy || '-'}</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs text-slate-400">操作时间</div>
            <div className="mt-2 text-sm font-medium text-slate-900">{log.createTime || '-'}</div>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="grid grid-cols-[1fr_56px_1fr]">
            <div className="bg-rose-50/70">
              <div className="border-b border-rose-100/70 px-4 py-3 text-xs font-semibold text-rose-600">变更前</div>
              <div className="min-h-[120px] p-4 text-sm leading-7 text-slate-700">
                {log.beforeVal || <span className="italic text-slate-400">（空）</span>}
              </div>
            </div>

            <div className="flex items-center justify-center border-x border-slate-200 bg-slate-50">
              <ArrowLeftRight size={18} className="text-slate-400" />
            </div>

            <div className="bg-emerald-50/70">
              <div className="border-b border-emerald-100/70 px-4 py-3 text-xs font-semibold text-emerald-600">变更后</div>
              <div className="min-h-[120px] p-4 text-sm leading-7 text-slate-700">
                {log.afterVal || <span className="italic text-slate-400">（空）</span>}
              </div>
            </div>
          </div>
        </div>
      </div>
    </WorkspaceDialogShell>
  );
};

export const AuditLogPage: React.FC = () => {
  const [query, setQuery] = useState<AuditLogQuery>({ pageNum: 1, pageSize: 10 });
  const [auditName, setAuditName] = useState('');
  const [createBy, setCreateBy] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [records, setRecords] = useState<SysAuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [detailLog, setDetailLog] = useState<SysAuditLog | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params: AuditLogQuery = { ...query };
      if (auditName) params.auditName = auditName;
      if (createBy) params.createBy = createBy;
      if (startTime) params.startTime = startTime;
      if (endTime) params.endTime = endTime;
      const response = await getAuditLogPage(params);
      setRecords(response.records || []);
      setTotal(response.total || 0);
      setSelectedIds([]);
    } catch {
      // API 层已做统一提示
    } finally {
      setLoading(false);
    }
  }, [query, auditName, createBy, startTime, endTime]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleSearch = () => {
    setQuery((prev) => ({ ...prev, pageNum: 1 }));
  };

  const handleReset = () => {
    setAuditName('');
    setCreateBy('');
    setStartTime('');
    setEndTime('');
    setQuery({ pageNum: 1, pageSize: 10 });
  };

  const handleBatchDelete = async () => {
    if (!selectedIds.length) {
      toast.warning('请选择要删除的审计日志');
      return;
    }
    if (!window.confirm(`确定删除选中的 ${selectedIds.length} 条审计日志吗？`)) {
      return;
    }
    try {
      await deleteAuditLogs(selectedIds);
      toast.success('删除成功');
      await loadData();
    } catch {
      // API 层已做统一提示
    }
  };

  const handleViewDetail = async (id: number) => {
    try {
      const log = await getAuditLogDetail(id);
      setDetailLog(log);
    } catch {
      // API 层已做统一提示
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('确定删除该条审计日志吗？')) {
      return;
    }
    try {
      await deleteAuditLogs([id]);
      toast.success('删除成功');
      await loadData();
    } catch {
      // API 层已做统一提示
    }
  };

  const allSelected = records.length > 0 && records.every((item) => selectedIds.includes(item.auditId));
  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds([]);
    } else {
      setSelectedIds(records.map((item) => item.auditId));
    }
  };
  const toggleOne = (id: number) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  const totalPages = Math.max(1, Math.ceil(total / (query.pageSize || 10)));
  const currentPage = query.pageNum || 1;
  const changedFieldCount = new Set(records.map((item) => item.auditField).filter(Boolean)).size;
  const creatorCount = new Set(records.map((item) => item.createBy).filter(Boolean)).size;
  const hasActiveFilters = Boolean(auditName || createBy || startTime || endTime);
  const todayLabel = formatDateCN(new Date());
  const timeLabel = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });

  const overviewItems = [
    { label: '当前结果', value: `${records.length} 条` },
    { label: '变更字段', value: `${changedFieldCount} 个` },
    { label: '操作人', value: `${creatorCount} 人` },
    { label: '已勾选', value: `${selectedIds.length} 条` },
  ];

  return (
    <div className="relative min-h-screen pb-6">
      <WorkspaceBackdrop />

      <WorkspacePageContent>
        <WorkspaceHeroCard
          badge={(
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium text-slate-500">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-pink-50 px-2.5 py-1 text-pink-600 ring-1 ring-pink-100">
                <ArrowLeftRight size={14} />
                {todayLabel}
              </span>
              <span className="rounded-full bg-white/80 px-2.5 py-1 ring-1 ring-slate-200/80">{timeLabel}</span>
            </div>
          )}
          title="审计日志"
          description="审计页的核心是变更前后对比，所以这次统一的重点是让筛选、列表和对比详情保持同一套层级关系。"
          actions={(
            <Button variant="outline" onClick={() => { void loadData(); }}>
              <RefreshCw size={15} />
              刷新列表
            </Button>
          )}
          contentClassName="p-4 sm:p-5"
        >
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <WorkspaceMetricCard
              label="总记录数"
              value={total}
              hint="当前筛选条件下的分页总量"
              aside={<ShieldCheck size={18} className="text-pink-500" />}
            />
            <WorkspaceMetricCard
              label="当前页"
              value={records.length}
              hint="当前分页下已加载的审计记录"
              aside={<Search size={18} className="text-sky-500" />}
            />
            <WorkspaceMetricCard
              label="字段种类"
              value={changedFieldCount}
              hint="当前页内涉及的不同变更字段数"
              aside={<ArrowLeftRight size={18} className="text-emerald-500" />}
            />
            <WorkspaceMetricCard
              label="操作人"
              value={creatorCount}
              hint="当前页内参与操作的人数"
              aside={<Eye size={18} className="text-amber-500" />}
            />
          </div>
        </WorkspaceHeroCard>

        <Card className={`${workspaceGlassSurfaceClassName} p-3.5`}>
          <div className="flex flex-col gap-3">
            <WorkspaceWorkbenchCard
              title="审计筛选"
              total={total}
              hasActiveFilters={hasActiveFilters}
              overviewItems={overviewItems}
              quickFilterAside={hasActiveFilters ? (
                <Button variant="outline" size="sm" onClick={handleReset}>
                  <RotateCcw size={14} />
                  重置条件
                </Button>
              ) : (
                <span className="rounded-full bg-white/82 px-3 py-1.5 text-[11px] font-medium text-slate-400 ring-1 ring-white/80 shadow-[0_8px_18px_rgba(15,23,42,0.04)]">
                  当前显示默认视图
                </span>
              )}
              filterBar={(
                <div className="grid grid-cols-1 gap-2.5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_220px_220px_auto]">
                  <Input
                    value={auditName}
                    onChange={(event) => setAuditName(event.target.value)}
                    placeholder="按业务名称搜索"
                  />
                  <Input
                    value={createBy}
                    onChange={(event) => setCreateBy(event.target.value)}
                    placeholder="按操作人搜索"
                  />
                  <DatePicker className="h-11 rounded-2xl" type="date" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
                  <DatePicker className="h-11 rounded-2xl" type="date" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
                  <Button type="button" onClick={handleSearch}>
                    <Search size={15} />
                    查询审计
                  </Button>
                </div>
              )}
            />

            <WorkspaceResultCard
              total={total}
              description="业务名称、变更字段、前后值和操作记录统一收纳到同一工作台表格里。"
              footer={(
                <WorkspacePaginationBar
                  total={total}
                  pageNum={currentPage}
                  totalPages={totalPages}
                  onPrev={() => setQuery((prev) => ({ ...prev, pageNum: Math.max(1, (prev.pageNum || 1) - 1) }))}
                  onNext={() => setQuery((prev) => ({ ...prev, pageNum: Math.min(totalPages, (prev.pageNum || 1) + 1) }))}
                  prevDisabled={currentPage <= 1}
                  nextDisabled={currentPage >= totalPages}
                />
              )}
            >
              <div className="border-b border-slate-200 px-4 py-3">
                <Button variant="destructive" size="sm" onClick={() => void handleBatchDelete()}>
                  <Trash2 size={14} />
                  删除选中
                </Button>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-[1120px] w-full text-sm">
                  <TableHeader>
                    <tr>
                      <TableHead className="w-10">
                        <input type="checkbox" checked={allSelected} onChange={toggleAll} className="rounded" />
                      </TableHead>
                      <TableHead className="w-14">#</TableHead>
                      <TableHead>业务名称</TableHead>
                      <TableHead>变更字段</TableHead>
                      <TableHead>变更前</TableHead>
                      <TableHead>变更后</TableHead>
                      <TableHead className="w-28">操作人</TableHead>
                      <TableHead className="w-44">操作时间</TableHead>
                      <TableActionHead className="w-44">操作</TableActionHead>
                    </tr>
                  </TableHeader>
                  <tbody>
                    {loading ? (
                      <WorkspaceTableStateRow colSpan={9} type="loading" title="正在加载审计日志..." />
                    ) : records.length === 0 ? (
                      <WorkspaceTableStateRow colSpan={9} title="暂无审计日志" description="可以调整筛选条件，或等待新的业务字段变更写入日志。" />
                    ) : (
                      records.map((log, idx) => (
                        <tr key={log.auditId} className="border-b border-slate-100 transition-colors hover:bg-slate-50/70">
                          <td className="px-4 py-3">
                            <input
                              type="checkbox"
                              checked={selectedIds.includes(log.auditId)}
                              onChange={() => toggleOne(log.auditId)}
                              className="rounded"
                            />
                          </td>
                          <td className="px-4 py-3 text-slate-400">
                            {((query.pageNum || 1) - 1) * (query.pageSize || 10) + idx + 1}
                          </td>
                          <td className="px-4 py-3 text-slate-700 font-medium">{log.auditName || '-'}</td>
                          <td className="px-4 py-3">
                            <span className="rounded-full bg-pink-50 px-2.5 py-1 text-xs font-medium text-pink-600 ring-1 ring-pink-100">
                              {log.auditField || '-'}
                            </span>
                          </td>
                          <td className="max-w-[150px] truncate px-4 py-3 font-mono text-xs text-rose-600">{log.beforeVal || '-'}</td>
                          <td className="max-w-[150px] truncate px-4 py-3 font-mono text-xs text-emerald-600">{log.afterVal || '-'}</td>
                          <td className="px-4 py-3 whitespace-nowrap text-slate-700">{log.createBy || '-'}</td>
                          <td className="px-4 py-3 whitespace-nowrap text-slate-500">{log.createTime || '-'}</td>
                          <td className="px-4 py-3 whitespace-nowrap text-right">
                            <TableRowActions
                              align="end"
                              wrap={false}
                              className="whitespace-nowrap"
                              actions={[
                                {
                                  label: '详情',
                                  icon: <Eye size={14} />,
                                  onClick: () => void handleViewDetail(log.auditId),
                                  tone: 'info',
                                },
                                {
                                  label: '删除',
                                  icon: <Trash2 size={14} />,
                                  onClick: () => void handleDelete(log.auditId),
                                  tone: 'danger',
                                },
                              ]}
                            />
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </WorkspaceResultCard>
          </div>
        </Card>

        <AuditDetailModal log={detailLog} onClose={() => setDetailLog(null)} />
      </WorkspacePageContent>
    </div>
  );
};

export default AuditLogPage;
