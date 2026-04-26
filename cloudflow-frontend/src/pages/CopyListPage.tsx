import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  CheckCheck,
  Eye,
  FileText,
  Mail,
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
  Input,
  SegmentedControl,
  SegmentedControlItem,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui';
import { BaseDialog, Pagination } from '@/components/common';
import { TablePageLayout } from '@/components/layout/TablePageLayout';
import { toast } from 'sonner';
import { ProcessTrace } from '../components/ProcessTrace';
import { cn } from '@/utils/cn';

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

const InlineState: React.FC<{
  title: string;
  description?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}> = ({ title, description, icon, action, className }) => (
  <div className={cn('flex flex-col items-center justify-center px-6 py-10 text-center', className)}>
    <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-500">
      {icon || <Mail className="h-4 w-4" />}
    </div>
    <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{title}</div>
    {description ? <div className="mt-2 text-xs leading-6 text-slate-500 dark:text-slate-400">{description}</div> : null}
    {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
  </div>
);

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
        return 'border border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-900/70 dark:bg-cyan-950/30 dark:text-cyan-200';
      case 'COMPLETED':
        return 'border border-emerald-200 bg-emerald-50 text-emerald-600 dark:border-emerald-900/70 dark:bg-emerald-950/30 dark:text-emerald-200';
      case 'REJECTED':
        return 'border border-rose-200 bg-rose-50 text-rose-600 dark:border-rose-900/70 dark:bg-rose-950/30 dark:text-rose-200';
      case 'REVOKED':
        return 'border border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-200';
      default:
        return 'border border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300';
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

  const currentReadFilterLabel =
    readFilter === 'UNREAD' ? '未读' : readFilter === 'READ' ? '已读' : '全部';
  const currentProcessLabel =
    processDefOptions.find((item) => item.key === processDefKey)?.name || '全部流程';
  const readCount = Math.max(total - unreadCount, 0);
  const summary =
    total > 0
      ? `当前共 ${total} 条抄送记录，其中 ${unreadCount} 条未读，已读 ${readCount} 条。`
      : '暂无流程抄送，新的节点通知会集中显示在这里。';

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
      <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950/88">
        <InlineState
          icon={<Mail className="h-4 w-4 text-cyan-600 dark:text-cyan-300" />}
        title="正在加载抄送记录..."
        description="系统正在整理你的流程抄送和已读状态，请稍候。"
        actions={
          <Button variant="outline" onClick={handleRefresh}>
            <RefreshCw size={16} className="mr-2" />
            刷新状态
          </Button>
        }
        className="py-14"
        />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950/88">
        <InlineState
        icon={<Mail className="h-4 w-4 text-rose-500 dark:text-rose-300" />}
        title="抄送记录加载失败"
        description={error}
        actions={
          <Button onClick={() => void fetchList()}>
            重试加载
          </Button>
        }
        className="py-14"
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <TablePageLayout
        className="gap-4"
        filters={(
          <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-950/88">
            <div className="grid grid-cols-1 gap-2.5 xl:grid-cols-[minmax(0,1fr)_240px_auto]">
              <div className="relative">
                <Search
                  size={16}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500"
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
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-500 transition hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
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

            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-1 flex-wrap items-center gap-2">
                <SegmentedControl className="min-h-9 flex-wrap">
                  {readQuickFilters.map((filter) => (
                    <SegmentedControlItem
                      key={filter.value}
                      size="sm"
                      active={readFilter === filter.value}
                      onClick={() => handleReadFilterChange(filter.value)}
                    >
                      {filter.label}
                    </SegmentedControlItem>
                  ))}
                </SegmentedControl>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {unreadOnPage.length > 0 ? (
                  <label className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={allUnreadSelected}
                      onChange={handleToggleSelectAll}
                      className="h-4 w-4 rounded border-slate-300 text-cyan-600 focus:ring-cyan-400 dark:border-slate-700 dark:bg-slate-950"
                    />
                    全选当前页未读
                  </label>
                ) : null}
                {selectedIds.size > 0 ? (
                  <Button size="sm" onClick={handleBatchMarkRead}>
                    <CheckCheck size={15} className="mr-2" />
                    批量已读 ({selectedIds.size})
                  </Button>
                ) : null}
                {hasActiveFilters ? (
                  <Button variant="outline" size="sm" onClick={handleClearFilters}>
                    <X size={15} className="mr-2 text-slate-400" />
                    清空筛选
                  </Button>
                ) : null}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
              <span>{summary}</span>
              <span>{currentReadFilterLabel}</span>
              <span>{currentProcessLabel}</span>
              <span>已选 {selectedIds.size} 条</span>
            </div>
          </div>
        )}
        table={(
          <div className="flex min-h-[40rem] flex-col">
            <div className="flex flex-1 flex-col">
            {records.length === 0 ? (
              <InlineState
                icon={<Mail className="h-4 w-4 text-cyan-600 dark:text-cyan-200" />}
                title="暂无抄送记录"
                description="后续有流程抄送到你时，这里会展示流程标题、节点和阅读状态。"
              />
            ) : (
              <>
                <div className="border-b border-slate-200 px-4 py-3 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
                  {summary}
                </div>
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {records.map((record) => {
                    const isUnread = record.isRead === 0;
                    const isSelected = selectedIds.has(record.id);

                    return (
                      <div
                        key={record.id}
                        className={cn(
                          'cursor-pointer px-4 py-4 transition-colors hover:bg-slate-50 dark:hover:bg-slate-900/40',
                          isSelected && 'bg-slate-50 dark:bg-slate-900/40',
                        )}
                        onClick={() => handleViewDetail(record)}
                      >
                        <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[minmax(0,1.9fr)_180px_180px_auto] lg:items-center">
                          <div className="flex min-w-0 items-start gap-3">
                            <div className="shrink-0 pt-1" onClick={(e) => e.stopPropagation()}>
                              {isUnread ? (
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => handleToggleSelect(record.id)}
                                  className="h-4 w-4 rounded border-slate-300 text-cyan-600 focus:ring-cyan-400 dark:border-slate-700 dark:bg-slate-950"
                                />
                              ) : (
                                <div className="w-4" />
                              )}
                            </div>

                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <h4
                                  className={cn(
                                    'min-w-0 flex-1 truncate text-sm font-semibold',
                                    isUnread ? 'text-slate-900 dark:text-slate-100' : 'text-slate-700 dark:text-slate-200',
                                  )}
                                >
                                  {record.title || '未命名流程'}
                                </h4>
                                <span className={cn('shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold', getStatusStyle(record.processStatus))}>
                                  {getStatusLabel(record.processStatus)}
                                </span>
                                <span className={cn(
                                  'shrink-0 rounded-full px-2.5 py-1 text-xs font-medium',
                                  isUnread
                                    ? 'border border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-900/70 dark:bg-cyan-950/30 dark:text-cyan-200'
                                    : 'border border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300',
                                )}>
                                  {isUnread ? '未读' : '已读'}
                                </span>
                              </div>

                              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                                <span>发起人 {record.startUserName || '-'}</span>
                                {record.processName ? <span>流程 {record.processName}</span> : null}
                                <span>抄送节点 {record.nodeName || '-'}</span>
                                <span>{record.createTime ? new Date(record.createTime).toLocaleString() : '-'}</span>
                              </div>
                            </div>
                          </div>

                          <div className="text-xs text-slate-500 dark:text-slate-400">
                            <div>阅读状态</div>
                            <div className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">
                              {isUnread ? '未读' : '已读'}
                            </div>
                          </div>

                          <div className="text-xs text-slate-500 dark:text-slate-400">
                            <div>流程状态</div>
                            <div className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">
                              {getStatusLabel(record.processStatus)}
                            </div>
                          </div>

                          <div
                            className="flex shrink-0 flex-wrap items-center justify-end gap-2"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {isUnread ? (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => void handleMarkRead(record)}
                              >
                                标记已读
                              </Button>
                            ) : null}
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleViewDetail(record)}
                            >
                              <Eye size={14} className="mr-2 text-slate-400 dark:text-slate-500" />
                              查看
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
            </div>
          </div>
        )}
        pagination={(
          total > 0 ? (
            <Pagination
              total={total}
              page={pageNum}
              pageSize={PAGE_SIZE}
              showPageSizeSelector={false}
              showJump={false}
              onPageChange={(page) => setPageNum(page)}
              onPageSizeChange={() => {}}
            />
          ) : null
        )}
      />

      <BaseDialog
        open={detailOpen && Boolean(selectedRecord)}
        title={selectedRecord?.title || '流程详情'}
        description={selectedRecord ? `发起人：${selectedRecord.startUserName || '-'} · 抄送节点：${selectedRecord.nodeName || '-'}` : undefined}
        onClose={handleCloseDetail}
        width="wide"
        headerAside={
          selectedRecord?.processStatus ? (
            <span
              className={`rounded-full px-3 py-1.5 text-xs font-semibold ${getStatusStyle(selectedRecord.processStatus)}`}
            >
              {getStatusLabel(selectedRecord.processStatus)}
            </span>
          ) : undefined
        }
        bodyClassName="space-y-6"
        footer={(
          <Button variant="outline" onClick={handleCloseDetail}>
            关闭
          </Button>
        )}
      >
        {selectedRecord ? (
          <>
          {selectedRecord.formData ? (
            <div className="space-y-3">
              <h4 className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                <FileText size={16} className="text-cyan-600 dark:text-cyan-300" />
                表单数据快照
              </h4>
              <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
                {(() => {
                  const data = parseFormData(selectedRecord.formData);
                  if (!data) {
                    return (
                      <div className="px-4 py-6 text-sm text-slate-400 dark:text-slate-500">
                        无法解析表单数据
                      </div>
                    );
                  }

                  return (
                    <div className="divide-y divide-slate-100 dark:divide-slate-800">
                      {Object.entries(data).map(([key, value]) => (
                        <div
                          key={key}
                          className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-start sm:gap-4"
                        >
                          <div className="w-28 flex-shrink-0 text-xs text-slate-500 dark:text-slate-400">
                            {key}
                          </div>
                          <div className="min-w-0 flex-1 break-all text-sm text-slate-700 dark:text-slate-200">
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
            <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200">流程轨迹</h4>
            <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950/78">
              <ProcessTrace instanceId={selectedRecord.instanceId} />
            </div>
          </div>
          </>
        ) : null}
      </BaseDialog>
    </div>
  );
};

export default CopyListPage;
