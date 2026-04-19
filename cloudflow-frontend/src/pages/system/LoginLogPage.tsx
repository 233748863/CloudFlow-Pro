import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Eye, Lock, RefreshCw, RotateCcw, Search, ShieldAlert, Trash2 } from 'lucide-react';
import { DatePicker, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Button, Card, Input, TableActionHead, TableHead, TableHeader } from '@/components/ui';
import { TableRowActions } from '@/components/ui/table-row-actions';
import { toast } from 'sonner';
import {
  deleteLoginLogs,
  getLoginLogDetail,
  getLoginLogPage,
  type LoginLogQuery,
  type SysLog,
} from '@/services/api/log';
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

const LoginDetailModal: React.FC<{ log: SysLog | null; onClose: () => void }> = ({ log, onClose }) => {
  if (!log) return null;

  return (
    <WorkspaceDialogShell
      title="登录日志详情"
      description="查看该条登录日志的网络、浏览器和异常信息。"
      onClose={onClose}
      maxWidthClassName="max-w-4xl"
    >
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="text-xs text-slate-400">用户</div>
          <div className="mt-2 text-sm font-medium text-slate-900">{log.createBy || '-'}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="text-xs text-slate-400">状态</div>
          <div className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${log.logType === '9' ? 'bg-rose-50 text-rose-600 ring-1 ring-rose-100' : 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100'}`}>
            {log.logType === '9' ? '失败' : '成功'}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="text-xs text-slate-400">客户端 IP</div>
          <div className="mt-2 text-sm font-medium text-slate-900">{log.remoteAddr || '-'}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="text-xs text-slate-400">耗时</div>
          <div className="mt-2 text-sm font-medium text-slate-900">{log.time ?? 0} ms</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 md:col-span-2">
          <div className="text-xs text-slate-400">浏览器 / UA</div>
          <div className="mt-2 break-all text-sm text-slate-900">{log.userAgent || '-'}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 md:col-span-2">
          <div className="text-xs text-slate-400">请求参数</div>
          <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-all text-xs text-slate-700">{log.params || '-'}</pre>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 md:col-span-2">
          <div className="text-xs text-slate-400">异常信息</div>
          <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-all text-xs text-slate-700">{log.exception || '-'}</pre>
        </div>
      </div>
    </WorkspaceDialogShell>
  );
};

export const LoginLogPage: React.FC = () => {
  const [query, setQuery] = useState<LoginLogQuery>({ pageNum: 1, pageSize: 10 });
  const [records, setRecords] = useState<SysLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [detailLog, setDetailLog] = useState<SysLog | null>(null);

  const fetchPage = useCallback(async () => {
    setLoading(true);
    try {
      const params: LoginLogQuery = { ...query };
      if (!params.logType) delete params.logType;
      const response = await getLoginLogPage(params);
      setRecords(response.records || []);
      setTotal(response.total || 0);
      setSelectedIds([]);
    } catch (error) {
      console.error(error);
      toast.error('加载登录日志失败');
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    void fetchPage();
  }, [fetchPage]);

  const handleReset = () => {
    setQuery({ pageNum: 1, pageSize: 10 });
  };

  const handleView = async (id: number) => {
    try {
      const log = await getLoginLogDetail(id);
      setDetailLog(log);
    } catch (error) {
      console.error(error);
      toast.error('加载登录详情失败');
    }
  };

  const handleDelete = async (ids: number[]) => {
    if (!ids.length) {
      toast.error('请选择要删除的日志');
      return;
    }
    if (!window.confirm(`确定删除选中的 ${ids.length} 条登录日志吗？`)) {
      return;
    }
    try {
      await deleteLoginLogs(ids);
      toast.success('删除成功');
      await fetchPage();
    } catch (error) {
      console.error(error);
      toast.error('删除登录日志失败');
    }
  };

  const summary = useMemo(() => {
    const successCount = records.filter((item) => item.logType !== '9').length;
    const failCount = records.filter((item) => item.logType === '9').length;
    return {
      successCount,
      failCount,
      pageTotal: records.length,
    };
  }, [records]);

  const toggleSelect = (logId: number) => {
    setSelectedIds((prev) => (prev.includes(logId) ? prev.filter((id) => id !== logId) : [...prev, logId]));
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === records.length) {
      setSelectedIds([]);
      return;
    }
    setSelectedIds(records.map((item) => item.logId));
  };

  const currentPage = query.pageNum || 1;
  const totalPages = Math.max(1, Math.ceil(total / (query.pageSize || 10)));
  const hasActiveFilters = Boolean(query.createBy || query.remoteAddr || query.logType || query.startTime || query.endTime);
  const todayLabel = formatDateCN(new Date());
  const timeLabel = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });

  const overviewItems = [
    { label: '当前页结果', value: `${summary.pageTotal} 条` },
    { label: '成功登录', value: `${summary.successCount} 条` },
    { label: '失败登录', value: `${summary.failCount} 条` },
    { label: '已勾选', value: `${selectedIds.length} 条` },
  ];

  return (
    <div className="relative min-h-screen pb-6">
      <WorkspaceBackdrop />

      <WorkspacePageContent>
        <WorkspaceHeroCard
          badge={(
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium text-slate-500">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-200 bg-cyan-50 px-2.5 py-1 text-cyan-700">
                <Lock size={14} />
                {todayLabel}
              </span>
              <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1">{timeLabel}</span>
            </div>
          )}
          title="登录日志"
          description="登录日志页统一到工作台结构后，筛选、分页、详情和批量删除的操作成本会更低。"
          actions={(
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => { void fetchPage(); }}>
                <RefreshCw size={15} />
                刷新列表
              </Button>
              <Button variant="destructive" onClick={() => void handleDelete(selectedIds)} disabled={!selectedIds.length}>
                <Trash2 size={15} />
                删除选中
              </Button>
            </div>
          )}
          contentClassName="p-4 sm:p-5"
        >
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <WorkspaceMetricCard
              label="总记录数"
              value={total}
              hint="当前筛选条件下的分页总量"
              aside={<Lock size={18} className="text-cyan-600" />}
            />
            <WorkspaceMetricCard
              label="当前页"
              value={summary.pageTotal}
              hint="当前分页下已加载日志数量"
              aside={<Search size={18} className="text-sky-500" />}
            />
            <WorkspaceMetricCard
              label="成功"
              value={summary.successCount}
              hint="当前页内登录成功的记录"
              aside={<ShieldAlert size={18} className="text-emerald-500" />}
            />
            <WorkspaceMetricCard
              label="失败"
              value={summary.failCount}
              hint="当前页内登录失败的记录"
              aside={<Trash2 size={18} className="text-rose-500" />}
            />
          </div>
        </WorkspaceHeroCard>

        <Card className={`${workspaceGlassSurfaceClassName} p-3.5`}>
          <div className="flex flex-col gap-3">
            <WorkspaceWorkbenchCard
              title="登录筛选"
              total={total}
              hasActiveFilters={hasActiveFilters}
              overviewItems={overviewItems}
              quickFilters={[
                { label: '全部', value: '' },
                { label: '成功', value: '0' },
                { label: '失败', value: '9' },
              ]}
              activeQuickFilter={query.logType || ''}
              onQuickFilterChange={(value) => setQuery((prev) => ({ ...prev, logType: value || undefined, pageNum: 1 }))}
              quickFilterAside={hasActiveFilters ? (
                <Button variant="outline" size="sm" onClick={handleReset}>
                  <RotateCcw size={14} />
                  重置条件
                </Button>
              ) : (
                <span className="rounded-full bg-white px-3 py-1.5 text-[11px] font-medium text-slate-400 border border-slate-200 shadow-sm">
                  当前显示默认视图
                </span>
              )}
              filterBar={(
                <div className="grid gap-2.5 xl:grid-cols-5">
                  <Input
                    value={query.createBy || ''}
                    onChange={(event) => setQuery((prev) => ({ ...prev, createBy: event.target.value, pageNum: 1 }))}
                    placeholder="按用户搜索"
                  />
                  <Input
                    value={query.remoteAddr || ''}
                    onChange={(event) => setQuery((prev) => ({ ...prev, remoteAddr: event.target.value, pageNum: 1 }))}
                    placeholder="按客户端 IP 搜索"
                  />
                  <DatePicker className="h-11 rounded-2xl" type="date" value={query.startTime || ''} onChange={(event) => setQuery((prev) => ({ ...prev, startTime: event.target.value, pageNum: 1 }))} />
                  <DatePicker className="h-11 rounded-2xl" type="date" value={query.endTime || ''} onChange={(event) => setQuery((prev) => ({ ...prev, endTime: event.target.value, pageNum: 1 }))} />
                  <Button type="button" onClick={() => void fetchPage()}>
                    <Search size={15} />
                    查询日志
                  </Button>
                </div>
              )}
            />

            <WorkspaceResultCard
              total={total}
              description="登录状态、IP、UA 和详情查看统一收口到同一工作台页面。"
              footer={(
                <WorkspacePaginationBar
                  total={total}
                  pageNum={currentPage}
                  totalPages={totalPages}
                  onPrev={() => setQuery((prev) => ({ ...prev, pageNum: Math.max((prev.pageNum || 1) - 1, 1) }))}
                  onNext={() => setQuery((prev) => ({ ...prev, pageNum: Math.min(totalPages, (prev.pageNum || 1) + 1) }))}
                  prevDisabled={currentPage <= 1}
                  nextDisabled={currentPage >= totalPages}
                />
              )}
            >
              <div className="overflow-x-auto">
                <table className="min-w-[1040px] w-full text-sm">
                  <TableHeader>
                    <tr>
                      <TableHead>
                        <input
                          type="checkbox"
                          checked={records.length > 0 && selectedIds.length === records.length}
                          onChange={toggleSelectAll}
                          className="rounded"
                        />
                      </TableHead>
                      <TableHead>用户</TableHead>
                      <TableActionHead>状态</TableActionHead>
                      <TableHead>客户端 IP</TableHead>
                      <TableActionHead>耗时</TableActionHead>
                      <TableHead>浏览器</TableHead>
                      <TableHead>登录时间</TableHead>
                      <TableActionHead className="w-40">操作</TableActionHead>
                    </tr>
                  </TableHeader>
                  <tbody>
                    {loading ? (
                      <WorkspaceTableStateRow colSpan={8} type="loading" title="正在加载登录日志..." />
                    ) : !records.length ? (
                      <WorkspaceTableStateRow colSpan={8} title="暂无登录日志" description="可以调整筛选条件，或等待新的登录行为写入日志。" />
                    ) : (
                      records.map((item) => (
                        <tr key={item.logId} className="border-b border-slate-100 transition-colors hover:bg-slate-50">
                          <td className="px-4 py-3">
                            <input
                              type="checkbox"
                              checked={selectedIds.includes(item.logId)}
                              onChange={() => toggleSelect(item.logId)}
                              className="rounded"
                            />
                          </td>
                          <td className="px-4 py-3 font-medium text-slate-900">{item.createBy || '-'}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${item.logType === '9' ? 'bg-rose-50 text-rose-600 ring-1 ring-rose-100' : 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100'}`}>
                              {item.logType === '9' ? '失败' : '成功'}
                            </span>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-slate-600">{item.remoteAddr || '-'}</td>
                          <td className="px-4 py-3 whitespace-nowrap text-slate-600">{item.time ?? 0} ms</td>
                          <td className="max-w-[260px] truncate px-4 py-3 text-slate-500" title={item.userAgent || ''}>
                            {item.userAgent || '-'}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-slate-500">{item.createTime || '-'}</td>
                          <td className="px-4 py-3 whitespace-nowrap text-right">
                            <TableRowActions
                              align="end"
                              wrap={false}
                              className="whitespace-nowrap"
                              actions={[
                                {
                                  label: '详情',
                                  icon: <Eye size={14} />,
                                  onClick: () => void handleView(item.logId),
                                  tone: 'info',
                                },
                                {
                                  label: '删除',
                                  icon: <Trash2 size={14} />,
                                  onClick: () => void handleDelete([item.logId]),
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

        <LoginDetailModal log={detailLog} onClose={() => setDetailLog(null)} />
      </WorkspacePageContent>
    </div>
  );
};

export default LoginLogPage;
