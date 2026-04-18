import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Download,
  Eye,
  RefreshCw,
  RotateCcw,
  Search,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import { DatePicker, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, TableActionHead, TableHead, TableHeader, Button, Card, Input } from '@/components/ui';
import { toast } from 'sonner';
import {
  getSysLogPage,
  getSysLogTrend,
  getSysLogDetail,
  deleteSysLogs,
  SysLog,
  SysLogQuery,
  LogTrendItem,
} from '@/services/api/log';
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

const TrendChart: React.FC<{ data: LogTrendItem[] }> = ({ data }) => {
  if (!data.length) return null;

  const width = 900;
  const height = 200;
  const padding = { top: 20, right: 40, bottom: 30, left: 40 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;
  const maxVal = Math.max(...data.map((item) => Math.max(item.success, item.fail)), 1);
  const yStep = Math.ceil(maxVal / 5);
  const yMax = yStep * 5;

  const toX = (i: number) => padding.left + (i / Math.max(data.length - 1, 1)) * chartW;
  const toY = (v: number) => padding.top + chartH - (v / yMax) * chartH;

  const linePath = (key: 'success' | 'fail') =>
    data.map((item, i) => `${i === 0 ? 'M' : 'L'}${toX(i)},${toY(item[key])}`).join(' ');

  const areaPath = (key: 'success' | 'fail') =>
    `${linePath(key)} L${toX(data.length - 1)},${toY(0)} L${toX(0)},${toY(0)} Z`;

  const xLabels = data.filter((_, index) => index % Math.ceil(data.length / 10) === 0 || index === data.length - 1);

  return (
    <div className="card p-4">
      <div className="mb-2 flex items-center justify-end gap-4 text-xs text-slate-500">
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded-full bg-sky-400" />
          成功
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded-full bg-slate-400" />
          失败
        </span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full">
        {Array.from({ length: 6 }, (_, i) => {
          const val = yStep * i;
          const y = toY(val);
          return (
            <g key={i}>
              <line x1={padding.left} y1={y} x2={width - padding.right} y2={y} stroke="#e2e8f0" strokeWidth={1} />
              <text x={padding.left - 6} y={y + 4} textAnchor="end" fontSize={10} fill="#94a3b8">
                {val}
              </text>
            </g>
          );
        })}

        <path d={areaPath('success')} fill="rgba(96,165,250,0.15)" />
        <path d={linePath('success')} fill="none" stroke="#60a5fa" strokeWidth={2} />

        <path d={areaPath('fail')} fill="rgba(148,163,184,0.1)" />
        <path d={linePath('fail')} fill="none" stroke="#94a3b8" strokeWidth={2} />

        {xLabels.map((item) => {
          const i = data.indexOf(item);
          return (
            <text key={item.date} x={toX(i)} y={height - 6} textAnchor="middle" fontSize={10} fill="#94a3b8">
              {item.date.slice(5)}
            </text>
          );
        })}
      </svg>
    </div>
  );
};

const DetailModal: React.FC<{ log: SysLog | null; onClose: () => void }> = ({ log, onClose }) => {
  if (!log) return null;

  const items = [
    { label: '请求时间', value: log.createTime },
    { label: '操作人', value: log.createBy },
    { label: '请求地址', value: log.requestUri },
    { label: 'IP 地址', value: log.remoteAddr },
    { label: '请求方法', value: log.method },
    { label: '客户端', value: log.serviceId },
    { label: '执行耗时', value: log.time ? `${log.time} ms` : '-' },
    { label: '浏览器', value: log.userAgent },
    { label: '请求参数', value: log.params },
  ];

  return (
    <WorkspaceDialogShell
      title="操作日志详情"
      description="查看该条操作日志的技术参数、请求信息与异常内容。"
      onClose={onClose}
      maxWidthClassName="max-w-4xl"
    >
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          {items.map((item) => (
            <div key={item.label} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-medium text-slate-400">{item.label}</div>
              <div className="mt-2 break-all text-sm font-medium text-slate-900">{item.value || '-'}</div>
            </div>
          ))}
        </div>

        {log.logType === '9' && log.exception ? (
          <div className="rounded-3xl border border-rose-100 bg-rose-50 p-4">
            <div className="text-sm font-semibold text-rose-600">异常信息</div>
            <div className="mt-3 break-all text-sm leading-7 text-rose-700">{log.exception}</div>
          </div>
        ) : null}
      </div>
    </WorkspaceDialogShell>
  );
};

export const OperationLogPage: React.FC = () => {
  const [query, setQuery] = useState<SysLogQuery>({ pageNum: 1, pageSize: 10 });
  const [titleKeyword, setTitleKeyword] = useState('');
  const [logType, setLogType] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [records, setRecords] = useState<SysLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [trendData, setTrendData] = useState<LogTrendItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [detailLog, setDetailLog] = useState<SysLog | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params: SysLogQuery = { ...query };
      if (titleKeyword) params.title = titleKeyword;
      if (logType) params.logType = logType;
      if (startTime) params.startTime = startTime;
      if (endTime) params.endTime = endTime;
      const response = await getSysLogPage(params);
      setRecords(response.records || []);
      setTotal(response.total || 0);
      setSelectedIds([]);
    } catch {
      // API 层已做统一提示
    } finally {
      setLoading(false);
    }
  }, [query, titleKeyword, logType, startTime, endTime]);

  const loadTrend = useCallback(async () => {
    try {
      const response = await getSysLogTrend();
      setTrendData(response || []);
    } catch {
      // 静默处理趋势图加载失败
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    void loadTrend();
  }, [loadTrend]);

  const handleSearch = () => {
    setQuery((prev) => ({ ...prev, pageNum: 1 }));
  };

  const handleReset = () => {
    setTitleKeyword('');
    setLogType('');
    setStartTime('');
    setEndTime('');
    setQuery({ pageNum: 1, pageSize: 10 });
  };

  const handleBatchDelete = async () => {
    if (!selectedIds.length) {
      toast.warning('请选择要删除的日志');
      return;
    }
    if (!window.confirm(`确定删除选中的 ${selectedIds.length} 条日志吗？`)) {
      return;
    }
    try {
      await deleteSysLogs(selectedIds);
      toast.success('删除成功');
      await Promise.all([loadData(), loadTrend()]);
    } catch {
      // API 层已做统一提示
    }
  };

  const handleViewDetail = async (id: number) => {
    try {
      const log = await getSysLogDetail(id);
      setDetailLog(log);
    } catch {
      // API 层已做统一提示
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('确定删除该条日志吗？')) {
      return;
    }
    try {
      await deleteSysLogs([id]);
      toast.success('删除成功');
      await Promise.all([loadData(), loadTrend()]);
    } catch {
      // API 层已做统一提示
    }
  };

  const allSelected = records.length > 0 && records.every((item) => selectedIds.includes(item.logId));
  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds([]);
    } else {
      setSelectedIds(records.map((item) => item.logId));
    }
  };
  const toggleOne = (id: number) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  const totalPages = Math.max(1, Math.ceil(total / (query.pageSize || 10)));
  const currentPage = query.pageNum || 1;
  const successCount = records.filter((item) => item.logType === '0').length;
  const errorCount = records.filter((item) => item.logType === '9').length;
  const totalTime = records.reduce((sum, item) => sum + Number(item.time || 0), 0);
  const trendSuccess = trendData.reduce((sum, item) => sum + item.success, 0);
  const trendFail = trendData.reduce((sum, item) => sum + item.fail, 0);
  const hasActiveFilters = Boolean(titleKeyword || logType || startTime || endTime);
  const todayLabel = formatDateCN(new Date());
  const timeLabel = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });

  const overviewItems = [
    { label: '当前结果', value: `${records.length} 条` },
    { label: '正常日志', value: `${successCount} 条` },
    { label: '错误日志', value: `${errorCount} 条` },
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
                <Activity size={14} />
                {todayLabel}
              </span>
              <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1">{timeLabel}</span>
            </div>
          )}
          title="操作日志"
          description="把趋势图、筛选、批量操作和详情查看统一收口到同一套工作台结构中，避免日志页与业务页完全割裂。"
          actions={(
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => { void loadData(); }}>
                <RefreshCw size={15} />
                刷新列表
              </Button>
              <Button variant="outline" onClick={() => { void loadTrend(); }}>
                <Download size={15} />
                刷新趋势
              </Button>
            </div>
          )}
          contentClassName="p-4 sm:p-5"
        >
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <WorkspaceMetricCard
              label="30天成功"
              value={trendSuccess}
              hint="趋势图周期内的成功请求总数"
              aside={<Activity size={18} className="text-sky-500" />}
            />
            <WorkspaceMetricCard
              label="30天失败"
              value={trendFail}
              hint="趋势图周期内的失败请求总数"
              aside={<TriangleAlert size={18} className="text-rose-500" />}
            />
            <WorkspaceMetricCard
              label="当前页日志"
              value={records.length}
              hint="当前分页下实际加载数量"
              aside={<Search size={18} className="text-pink-500" />}
            />
            <WorkspaceMetricCard
              label="总耗时"
              value={`${totalTime} ms`}
              hint="当前页执行耗时汇总"
              aside={<RefreshCw size={18} className="text-amber-500" />}
            />
          </div>
        </WorkspaceHeroCard>

        <TrendChart data={trendData} />

        <Card className={`${workspaceGlassSurfaceClassName} p-3.5`}>
          <div className="flex flex-col gap-3">
            <WorkspaceWorkbenchCard
              title="日志筛选"
              total={total}
              hasActiveFilters={hasActiveFilters}
              overviewItems={overviewItems}
              headerBadges={(
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-full bg-white/82 px-3 py-1.5 text-[11px] font-medium text-slate-500 ring-1 ring-white/80 shadow-[0_8px_18px_rgba(15,23,42,0.04)]">
                    支持批量删除与详情查看
                  </span>
                </div>
              )}
              quickFilters={[
                { label: '全部', value: '' },
                { label: '正常', value: '0' },
                { label: '错误', value: '9' },
              ]}
              activeQuickFilter={logType}
              onQuickFilterChange={setLogType}
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
                <div className="grid grid-cols-1 gap-2.5 xl:grid-cols-[minmax(0,1fr)_220px_220px_auto]">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <Input
                      value={titleKeyword}
                      onChange={(event) => setTitleKeyword(event.target.value)}
                      placeholder="按操作标题搜索"
                      className="pl-10"
                    />
                  </div>
                  <DatePicker className="h-11 rounded-2xl" type="date" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
                  <DatePicker className="h-11 rounded-2xl" type="date" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
                  <Button type="button" onClick={handleSearch}>
                    <Search size={15} />
                    查询日志
                  </Button>
                </div>
              )}
            />

            <WorkspaceResultCard
              total={total}
              description="趋势、筛选、批量操作和详情查看全部统一到工作台页面结构中。"
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
                <table className="min-w-[1220px] w-full text-sm">
                  <TableHeader>
                    <tr>
                      <TableHead className="w-10">
                        <input type="checkbox" checked={allSelected} onChange={toggleAll} className="rounded" />
                      </TableHead>
                      <TableHead className="w-14">#</TableHead>
                      <TableHead>类型</TableHead>
                      <TableHead>标题</TableHead>
                      <TableHead>IP 地址</TableHead>
                      <TableHead>请求方法</TableHead>
                      <TableHead>耗时</TableHead>
                      <TableHead>请求时间</TableHead>
                      <TableHead className="w-28">操作人</TableHead>
                      <TableActionHead className="w-44">操作</TableActionHead>
                    </tr>
                  </TableHeader>
                  <tbody>
                    {loading ? (
                      <WorkspaceTableStateRow colSpan={10} type="loading" title="正在加载操作日志..." />
                    ) : records.length === 0 ? (
                      <WorkspaceTableStateRow colSpan={10} title="暂无操作日志" description="可以调整筛选条件，或等待新的业务操作写入日志。" />
                    ) : (
                      records.map((log, idx) => (
                        <tr key={log.logId} className="border-b border-slate-100 transition-colors hover:bg-slate-50">
                          <td className="px-4 py-3">
                            <input
                              type="checkbox"
                              checked={selectedIds.includes(log.logId)}
                              onChange={() => toggleOne(log.logId)}
                              className="rounded"
                            />
                          </td>
                          <td className="px-4 py-3 text-slate-400">
                            {((query.pageNum || 1) - 1) * (query.pageSize || 10) + idx + 1}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                              log.logType === '0'
                                ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100'
                                : 'bg-rose-50 text-rose-600 ring-1 ring-rose-100'
                            }`}>
                              {log.logType === '0' ? '正常' : '错误'}
                            </span>
                          </td>
                          <td className="max-w-[240px] truncate px-4 py-3 text-slate-700">{log.title}</td>
                          <td className="px-4 py-3 whitespace-nowrap text-slate-500">{log.remoteAddr || '-'}</td>
                          <td className="px-4 py-3 whitespace-nowrap text-slate-500">{log.method || '-'}</td>
                          <td className="px-4 py-3 whitespace-nowrap text-slate-500">{log.time ? `${log.time} ms` : '-'}</td>
                          <td className="px-4 py-3 whitespace-nowrap text-slate-500">{log.createTime || '-'}</td>
                          <td className="px-4 py-3 whitespace-nowrap text-slate-700">{log.createBy || '-'}</td>
                          <td className="px-4 py-3 whitespace-nowrap text-right">
                            <TableRowActions
                              align="end"
                              wrap={false}
                              className="whitespace-nowrap"
                              actions={[
                                {
                                  label: '详情',
                                  icon: <Eye size={14} />,
                                  onClick: () => void handleViewDetail(log.logId),
                                  tone: 'info',
                                },
                                {
                                  label: '删除',
                                  icon: <Trash2 size={14} />,
                                  onClick: () => void handleDelete(log.logId),
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

        <DetailModal log={detailLog} onClose={() => setDetailLog(null)} />
      </WorkspacePageContent>
    </div>
  );
};

export default OperationLogPage;
