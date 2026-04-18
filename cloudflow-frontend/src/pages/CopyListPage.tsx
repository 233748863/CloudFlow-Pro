import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  CheckCheck,
  Eye,
  FileText,
  Mail,
  MailOpen,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import {
  batchMarkCopyAsRead,
  getCopyUnreadCount,
  getMyCopyList,
  getProcessDefinitions,
  markCopyAsRead,
} from '../services/api/workflow';
import { useAuth } from '../context/AuthContext';
import {
  Button,
  Card,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui';
import { toast } from 'sonner';
import { ProcessTrace } from '../components/ProcessTrace';
import { cn } from '@/utils/cn';
import {
  WorkspaceBackdrop,
  WorkspaceDialogShell,
  WorkspaceEmptyPanel,
  WorkspaceHeroMetricsSection,
  WorkspacePageContent,
  WorkspacePaginationBar,
  WorkspaceResultCard,
  WorkspaceStatusPage,
  WorkspaceWorkbenchCard,
  workspaceGlassSurfaceClassName,
} from '@/components/workspace';

const PAGE_SIZE = 12;
const ALL_PROCESS_VALUE = '__ALL__';

type CopyReadFilter = 'ALL' | 'UNREAD' | 'READ';

interface CopyRecord {
  id: number;
  instanceId: string;
  processDefKey: string;
  title: string;
  nodeId: string;
  nodeName: string;
  startUserId: number;
  startUserName: string;
  userId: number;
  formData: string;
  isRead: number;
  readTime: string | null;
  createTime: string;
  processName: string;
  processStatus: string;
}

export const CopyListPage: React.FC = () => {
  const { user } = useAuth();

  const [records, setRecords] = useState<CopyRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const [pageNum, setPageNum] = useState(1);
  const [total, setTotal] = useState(0);

  const [readFilter, setReadFilter] = useState<CopyReadFilter>('ALL');
  const [keyword, setKeyword] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [processDefKey, setProcessDefKey] = useState('');
  const [processDefOptions, setProcessDefOptions] = useState<{ key: string; name: string }[]>([]);
  const hasShownProcessDefLoadWarningRef = useRef(false);

  const [unreadCount, setUnreadCount] = useState(0);
  const [selectedRecord, setSelectedRecord] = useState<CopyRecord | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const fetchList = useCallback(
    async (showLoading = true) => {
      if (!user) return;

      try {
        if (showLoading) {
          setLoading(true);
        }
        setError(null);

        const res = await getMyCopyList({
          pageNum,
          pageSize: PAGE_SIZE,
          keyword: keyword || undefined,
          isRead: readFilter === 'UNREAD' ? 0 : readFilter === 'READ' ? 1 : undefined,
          processDefKey: processDefKey || undefined,
        });

        let list: CopyRecord[] = [];
        let totalCount = 0;

        if (res && typeof res === 'object' && !Array.isArray(res)) {
          list = res.records || res.rows || [];
          totalCount = res.total || 0;
        } else if (Array.isArray(res)) {
          list = res;
          totalCount = res.length;
        }

        setRecords(list);
        setTotal(totalCount);
      } catch (e) {
        const message = e instanceof Error ? e.message : '加载抄送列表失败';
        setError(message);
        toast.error(message);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [keyword, pageNum, processDefKey, readFilter, user],
  );

  const fetchUnreadCount = useCallback(async () => {
    try {
      const count = await getCopyUnreadCount();
      setUnreadCount(typeof count === 'number' ? count : 0);
    } catch {
      // 未读计数允许静默失败，不阻塞主列表。
    }
  }, []);

  useEffect(() => {
    void fetchList();
  }, [fetchList]);

  useEffect(() => {
    void fetchUnreadCount();
  }, [fetchUnreadCount]);

  useEffect(() => {
    getProcessDefinitions({ latestOnly: false })
      .then((res) => {
        if (!Array.isArray(res)) {
          return;
        }

        const seen = new Set<string>();
        const options: { key: string; name: string }[] = [];

        for (const def of res) {
          const defKey = (def as any).processKey;
          const defName = (def as any).processName || defKey;
          if (defKey && !seen.has(defKey)) {
            seen.add(defKey);
            options.push({ key: defKey, name: defName });
          }
        }

        setProcessDefOptions(options);
      })
      .catch((err) => {
        console.error('加载流程定义选项失败:', err);
        if (!hasShownProcessDefLoadWarningRef.current) {
          toast.warning('流程类型筛选加载失败，已切换为无筛选模式');
          hasShownProcessDefLoadWarningRef.current = true;
        }
      });
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    void fetchList(false);
    void fetchUnreadCount();
  };

  const handleSearch = () => {
    setKeyword(searchInput.trim());
    setPageNum(1);
  };

  const handleSearchKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter') {
      handleSearch();
    }
  };

  const handleReadFilterChange = (value: CopyReadFilter) => {
    setReadFilter(value);
    setPageNum(1);
  };

  const handleProcessTypeChange = (value: string) => {
    setProcessDefKey(value);
    setPageNum(1);
  };

  const hasActiveFilters = readFilter !== 'ALL' || Boolean(keyword) || Boolean(processDefKey);

  const handleClearFilters = () => {
    setReadFilter('ALL');
    setKeyword('');
    setSearchInput('');
    setProcessDefKey('');
    setPageNum(1);
  };

  const handleMarkRead = async (record: CopyRecord) => {
    if (record.isRead === 1) {
      return;
    }

    try {
      await markCopyAsRead(record.id);
      toast.success('已标记为已读');
      void fetchList(false);
      void fetchUnreadCount();
    } catch {
      toast.error('标记已读失败');
    }
  };

  const handleBatchMarkRead = async () => {
    if (selectedIds.size === 0) {
      toast.info('请先选择要标记的记录');
      return;
    }

    try {
      await batchMarkCopyAsRead(Array.from(selectedIds));
      toast.success(`已标记 ${selectedIds.size} 条为已读`);
      setSelectedIds(new Set());
      void fetchList(false);
      void fetchUnreadCount();
    } catch {
      toast.error('批量标记失败');
    }
  };

  const unreadOnPage = records.filter((record) => record.isRead === 0);
  const allUnreadSelected =
    unreadOnPage.length > 0 && unreadOnPage.every((record) => selectedIds.has(record.id));

  const handleToggleSelectAll = () => {
    if (allUnreadSelected) {
      setSelectedIds(new Set());
      return;
    }

    setSelectedIds(new Set(unreadOnPage.map((record) => record.id)));
  };

  const handleToggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleViewDetail = (record: CopyRecord) => {
    setSelectedRecord(record);
    setDetailOpen(true);

    if (record.isRead === 0) {
      markCopyAsRead(record.id)
        .then(() => {
          void fetchList(false);
          void fetchUnreadCount();
        })
        .catch((err) => {
          console.warn('自动标记抄送已读失败:', err);
        });
    }
  };

  const handleCloseDetail = () => {
    setDetailOpen(false);
    setSelectedRecord(null);
  };

  const parseFormData = (formDataStr: string): Record<string, unknown> | null => {
    if (!formDataStr) {
      return null;
    }

    try {
      return JSON.parse(formDataStr);
    } catch {
      return null;
    }
  };

  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'RUNNING':
        return 'border border-cyan-200 bg-cyan-50 text-cyan-700';
      case 'COMPLETED':
        return 'border border-emerald-200 bg-emerald-50 text-emerald-600';
      case 'REJECTED':
        return 'border border-rose-200 bg-rose-50 text-rose-600';
      case 'REVOKED':
        return 'border border-amber-200 bg-amber-50 text-amber-700';
      default:
        return 'border border-slate-200 bg-slate-100 text-slate-600';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'RUNNING':
        return '进行中';
      case 'COMPLETED':
        return '已完成';
      case 'REJECTED':
        return '已驳回';
      case 'REVOKED':
        return '已撤回';
      default:
        return status || '未知';
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const now = new Date();
  const todayLabel = new Intl.DateTimeFormat('zh-CN', {
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  }).format(now);
  const timeLabel = now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  const currentReadFilterLabel =
    readFilter === 'UNREAD' ? '未读' : readFilter === 'READ' ? '已读' : '全部';
  const currentProcessLabel =
    processDefOptions.find((item) => item.key === processDefKey)?.name || '全部流程';
  const readCount = Math.max(total - unreadCount, 0);
  const latestRecord = records[0] || null;
  const latestHint = latestRecord
    ? `${getStatusLabel(latestRecord.processStatus)} · ${latestRecord.title || '未命名流程'}`
    : '新的节点通知会显示在这里';
  const summary =
    total > 0
      ? `当前共 ${total} 条抄送记录，其中 ${unreadCount} 条未读，已读 ${readCount} 条。`
      : '暂无流程抄送，新的节点通知会集中显示在这里。';

  // 统一页头统计和筛选概览，减少页面内部各写一套信息卡。
  const heroMetrics = [
    {
      label: '全部记录',
      value: `${total}`,
      hint: hasActiveFilters ? '当前列表已按筛选条件收敛' : '默认展示当前用户可见的全部抄送',
      icon: <Mail size={17} />,
    },
    {
      label: '未读总数',
      value: `${unreadCount}`,
      hint: unreadCount > 0 ? '建议优先处理未读节点通知' : '当前没有未读抄送',
      icon: <MailOpen size={17} />,
    },
    {
      label: '本页未读',
      value: `${unreadOnPage.length}`,
      hint: unreadOnPage.length > 0 ? '支持当前页批量标记已读' : '当前页没有未读记录',
      icon: <CheckCheck size={17} />,
    },
    {
      label: '已选条数',
      value: `${selectedIds.size}`,
      hint: selectedIds.size > 0 ? '可直接执行批量已读' : `当前流程：${currentProcessLabel}`,
      icon: <Eye size={17} />,
    },
  ];

  const overviewItems = [
    {
      label: '视图状态',
      value: currentReadFilterLabel,
    },
    {
      label: '流程范围',
      value: currentProcessLabel,
    },
    {
      label: '关键字',
      value: keyword || '未设置',
    },
    {
      label: '当前页码',
      value: `${pageNum} / ${totalPages}`,
    },
  ];

  const readQuickFilters = [
    { label: '全部', value: 'ALL' as CopyReadFilter },
    { label: '未读', value: 'UNREAD' as CopyReadFilter },
    { label: '已读', value: 'READ' as CopyReadFilter },
  ];

  if (!user) {
    return null;
  }

  if (loading) {
    return (
      <WorkspaceStatusPage
        icon={<Mail size={26} />}
        title="正在加载抄送记录..."
        description="系统正在整理你的流程抄送和已读状态，请稍候。"
        actions={
          <Button variant="outline" className="rounded-xl" onClick={handleRefresh}>
            <RefreshCw size={16} className="mr-2" />
            刷新状态
          </Button>
        }
        panelClassName="py-14"
      />
    );
  }

  if (error) {
    return (
      <WorkspaceStatusPage
        icon={<Mail size={26} />}
        title="抄送记录加载失败"
        description={error}
        actions={
          <Button className="rounded-xl" onClick={() => void fetchList()}>
            重试加载
          </Button>
        }
        panelClassName="py-14"
      />
    );
  }

  return (
    <div className="relative min-h-screen pb-6">
      <WorkspaceBackdrop />

      <WorkspacePageContent>
        <WorkspaceHeroMetricsSection
          badge={
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium text-slate-500">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-slate-600">
                <Mail size={14} />
                {todayLabel}
              </span>
              <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-slate-500">
                {timeLabel}
              </span>
              <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-slate-500">
                {currentReadFilterLabel}
              </span>
            </div>
          }
          title="抄送我的"
          description={summary}
          actions={
            <div className="flex flex-wrap gap-2 xl:justify-end">
              {selectedIds.size > 0 ? (
                  <Button
                    className="h-9 rounded-xl px-4"
                    onClick={handleBatchMarkRead}
                  >
                  <CheckCheck size={15} className="mr-2" />
                  批量已读 ({selectedIds.size})
                </Button>
              ) : null}
              <Button
                variant="outline"
                className="h-9 rounded-xl px-4"
                onClick={handleRefresh}
                disabled={refreshing}
              >
                <RefreshCw
                  size={15}
                  className={`mr-2 ${refreshing ? 'animate-spin text-slate-500' : 'text-slate-500'}`}
                />
                刷新数据
              </Button>
            </div>
          }
          contentClassName="p-4 sm:p-5"
          metrics={heroMetrics}
        >
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-600">
              抄送工作台
            </span>
            <span className="max-w-full truncate rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-500">
              最新提醒：{latestHint}
            </span>
          </div>
        </WorkspaceHeroMetricsSection>

        <Card className={`${workspaceGlassSurfaceClassName} p-3.5`}>
          <div className="flex flex-col gap-3">
            <WorkspaceWorkbenchCard
              eyebrow="抄送筛选"
              title="抄送记录"
              total={total}
              hasActiveFilters={hasActiveFilters}
              overviewItems={overviewItems}
              quickFilters={readQuickFilters}
              activeQuickFilter={readFilter}
              onQuickFilterChange={(value) => handleReadFilterChange(value as CopyReadFilter)}
              quickFilterAside={
                <div className="flex flex-wrap items-center gap-2">
                  {unreadOnPage.length > 0 ? (
                    <label className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-600">
                      <input
                        type="checkbox"
                        checked={allUnreadSelected}
                        onChange={handleToggleSelectAll}
                        className="h-4 w-4 rounded border-slate-300 text-cyan-600 focus:ring-cyan-400"
                      />
                      全选当前页未读
                    </label>
                  ) : null}

                  {hasActiveFilters ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-9 rounded-xl px-4"
                      onClick={handleClearFilters}
                    >
                      <X size={15} className="mr-2 text-slate-400" />
                      清空筛选
                    </Button>
                  ) : (
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-medium text-slate-400">
                      当前未应用额外筛选
                    </span>
                  )}
                </div>
              }
              filterBar={
                <div className="grid grid-cols-1 gap-2.5 xl:grid-cols-[minmax(0,1fr)_240px_auto]">
                  <div className="relative">
                    <Search
                      size={16}
                      className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                    />
                    <Input
                      type="text"
                      placeholder="搜索流程标题..."
                      value={searchInput}
                      onChange={(e) => setSearchInput(e.target.value)}
                      onKeyDown={handleSearchKeyDown}
                      className="h-10 rounded-xl pl-10 pr-16"
                    />
                    {searchInput && searchInput.trim() !== keyword ? (
                      <button
                        type="button"
                        onClick={handleSearch}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-500 transition hover:text-slate-700"
                      >
                        搜索
                      </button>
                    ) : null}
                  </div>

                  {processDefOptions.length > 0 ? (
                    <Select
                      value={processDefKey || ALL_PROCESS_VALUE}
                      onValueChange={(value) =>
                        handleProcessTypeChange(value === ALL_PROCESS_VALUE ? '' : value)
                      }
                    >
                      <SelectTrigger className="h-10 rounded-xl">
                        <SelectValue placeholder="全部流程类型" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem className="rounded-lg" value={ALL_PROCESS_VALUE}>
                          全部流程类型
                        </SelectItem>
                        {processDefOptions.map((option) => (
                          <SelectItem
                            key={option.key}
                            className="rounded-lg"
                            value={String(option.key)}
                          >
                            {option.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <div />
                  )}

                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <Button
                      size="sm"
                      className="h-10 rounded-xl"
                      onClick={handleSearch}
                    >
                      <Search size={15} className="mr-2" />
                      应用搜索
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-10 rounded-xl px-4"
                      onClick={handleRefresh}
                      disabled={refreshing}
                    >
                      <RefreshCw
                        size={15}
                        className={`mr-2 ${refreshing ? 'animate-spin text-slate-500' : 'text-slate-500'}`}
                      />
                      刷新
                    </Button>
                  </div>
                </div>
              }
            />

            <WorkspaceResultCard
              total={total}
              title="当前抄送"
              description={
                records.length > 0
                  ? '点击记录可查看流程详情、表单快照和处理轨迹。'
                  : '当前条件下暂无抄送记录。'
              }
              footer={
                total > 0 ? (
                  <WorkspacePaginationBar
                    total={total}
                    pageNum={pageNum}
                    totalPages={totalPages}
                    onPrev={() => setPageNum((prev) => Math.max(1, prev - 1))}
                    onNext={() => setPageNum((prev) => Math.min(totalPages, prev + 1))}
                    prevDisabled={pageNum <= 1}
                    nextDisabled={pageNum >= totalPages}
                  />
                ) : undefined
              }
            >
              <div className="p-4">
                {records.length === 0 ? (
                  <WorkspaceEmptyPanel
                    variant="glass"
                    icon={<Mail size={28} />}
                    title="暂无抄送记录"
                    description="后续有流程抄送到你时，这里会展示流程标题、节点和阅读状态。"
                  />
                ) : (
                  <div className="space-y-3">
                    {records.map((record) => (
                      <div
                        key={record.id}
                        className={cn(
                          'card card-hover cursor-pointer rounded-2xl px-4 py-4',
                          record.isRead === 0 ? 'border-cyan-200 bg-cyan-50' : '',
                        )}
                        onClick={() => handleViewDetail(record)}
                      >
                        <div className="flex items-start gap-4">
                          <div className="shrink-0 pt-1" onClick={(e) => e.stopPropagation()}>
                            {record.isRead === 0 ? (
                              <input
                                type="checkbox"
                                checked={selectedIds.has(record.id)}
                                onChange={() => handleToggleSelect(record.id)}
                                className="h-4 w-4 rounded border-slate-300 text-cyan-600 focus:ring-cyan-400"
                              />
                            ) : (
                              <div className="w-4" />
                            )}
                          </div>

                          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-50 ring-1 ring-slate-200">
                            {record.isRead === 0 ? (
                              <Mail size={18} className="text-cyan-600" />
                            ) : (
                              <MailOpen size={18} className="text-slate-400" />
                            )}
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <h4
                                className={`min-w-0 flex-1 truncate text-base font-semibold ${record.isRead === 0 ? 'text-slate-900' : 'text-slate-700'}`}
                              >
                                {record.title || '未命名流程'}
                              </h4>
                              {record.processStatus ? (
                                <span
                                  className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${getStatusStyle(record.processStatus)}`}
                                >
                                  {getStatusLabel(record.processStatus)}
                                </span>
                              ) : null}
                            </div>

                            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
                              <span>发起人：{record.startUserName || '-'}</span>
                              {record.processName ? <span>流程：{record.processName}</span> : null}
                              <span>抄送节点：{record.nodeName || '-'}</span>
                              <span>
                                {record.createTime
                                  ? new Date(record.createTime).toLocaleString()
                                  : '-'}
                              </span>
                            </div>
                          </div>

                          <div
                            className="flex shrink-0 flex-wrap items-center gap-2"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {record.isRead === 0 ? (
                              <Button
                                variant="outline"
                                className="h-10 rounded-xl border-cyan-200 px-4 text-cyan-700 hover:bg-cyan-50"
                                onClick={() => void handleMarkRead(record)}
                              >
                                标记已读
                              </Button>
                            ) : null}
                            <Button
                              variant="outline"
                              className="h-10 rounded-xl px-4"
                              onClick={() => handleViewDetail(record)}
                            >
                              <Eye size={14} className="mr-2 text-slate-400" />
                              查看
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </WorkspaceResultCard>
          </div>
        </Card>
      </WorkspacePageContent>

      {detailOpen && selectedRecord ? (
        <WorkspaceDialogShell
          title={selectedRecord.title || '流程详情'}
          description={`发起人：${selectedRecord.startUserName || '-'} · 抄送节点：${selectedRecord.nodeName || '-'}`}
          onClose={handleCloseDetail}
          maxWidthClassName="max-w-4xl"
          headerAside={
            selectedRecord.processStatus ? (
              <span
                className={`rounded-full px-3 py-1.5 text-xs font-semibold ${getStatusStyle(selectedRecord.processStatus)}`}
              >
                {getStatusLabel(selectedRecord.processStatus)}
              </span>
            ) : undefined
          }
          bodyClassName="space-y-6"
        >
          {selectedRecord.formData ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <h4 className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <FileText size={16} className="text-cyan-600" />
                表单数据快照
              </h4>
              <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                {(() => {
                  const data = parseFormData(selectedRecord.formData);
                  if (!data) {
                    return <p className="text-sm text-slate-400">无法解析表单数据</p>;
                  }

                  return (
                    <div className="grid gap-3 md:grid-cols-2">
                      {Object.entries(data).map(([key, value]) => (
                        <div
                          key={key}
                          className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm"
                        >
                          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                            {key}
                          </div>
                          <div className="mt-2 break-all font-medium text-slate-700">
                            {typeof value === 'object'
                              ? JSON.stringify(value)
                              : String(value ?? '-')}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </div>
          ) : null}

          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-slate-700">流程轨迹</h4>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <ProcessTrace instanceId={selectedRecord.instanceId} />
            </div>
          </div>

          <div className="flex justify-end">
            <Button variant="outline" className="rounded-xl" onClick={handleCloseDetail}>
              关闭
            </Button>
          </div>
        </WorkspaceDialogShell>
      ) : null}
    </div>
  );
};

export default CopyListPage;
