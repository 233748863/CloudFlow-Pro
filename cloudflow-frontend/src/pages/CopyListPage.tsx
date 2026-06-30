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
import { useAuth } from '@/context/AuthContext';
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
} from '@/components/common';
import { BaseDialog, Pagination } from '@/components/common';
import { toast } from 'sonner';
import { getErrorMessage } from '@/utils/errorMessage';
import { ProcessTrace } from '../components/ProcessTrace';
import { cn } from '@/utils/cn';
import { InnerTableSurface, TablePageLayout } from '@/components/layout/TablePageLayout';

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
  <div className={cn('admin-dialog-empty-note', className)}>
    <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-md border border-cyan-100 bg-[#effbfe] text-[#0d95b5] dark:border-cyan-900/60 dark:bg-cyan-950/30 dark:text-cyan-200">
      {icon || <Mail className="h-4 w-4" />}
    </div>
    <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{title}</div>
    {description ? <div className="mt-2 text-xs leading-6 text-slate-500 dark:text-slate-400">{description}</div> : null}
    {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
  </div>
);

const DialogPanel: React.FC<{
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}> = ({ title, description, children, className, bodyClassName }) => (
  <section className={cn('table-scroll-container admin-inner-table-surface', className)}>
    <div className="admin-source-section-head border-b border-slate-200 px-4 py-3 dark:border-slate-800">
      <div>
        <strong>{title}</strong>
        {description ? <span>{description}</span> : null}
      </div>
    </div>
    <div className={cn('p-4', bodyClassName)}>{children}</div>
  </section>
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
          list = (res.records || res.rows || []) as unknown as CopyRecord[];
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
    } catch (error) {
      toast.error(getErrorMessage(error, '标记已读失败'));
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
    } catch (error) {
      toast.error(getErrorMessage(error, '批量标记失败'));
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
        return 'border border-slate-200 bg-[var(--cf-surface-muted)] text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300';
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
  const statCards = [
    { label: '抄送总数', value: String(total), detail: currentReadFilterLabel, icon: Mail, tone: 'blue' },
    { label: '未读', value: String(unreadCount), detail: '待处理', icon: CheckCheck, tone: unreadCount > 0 ? 'amber' : 'green' },
    { label: '当前页', value: String(records.length), detail: `每页 ${PAGE_SIZE}`, icon: FileText, tone: 'violet' },
    { label: '流程类型', value: String(processDefOptions.length), detail: currentProcessLabel, icon: FileText, tone: 'green' },
  ];

  if (!user) {
    return null;
  }

  if (loading) {
    return (
      <section className="admin-source-page">
        <InnerTableSurface className="flex min-h-[24rem] flex-1 flex-col" wrapperClassName="flex min-h-[24rem] flex-1 flex-col">
          <InlineState
            icon={<Mail className="h-4 w-4 text-cyan-600 dark:text-cyan-300" />}
            title="正在加载抄送记录..."
            description="系统正在整理你的流程抄送和已读状态，请稍候。"
            action={
              <Button variant="outline" onClick={handleRefresh}>
                <RefreshCw size={16} className="mr-2" />
                刷新状态
              </Button>
            }
            className="py-10"
          />
        </InnerTableSurface>
      </section>
    );
  }

  if (error) {
    return (
      <section className="admin-source-page">
        <InnerTableSurface className="flex min-h-[24rem] flex-1 flex-col" wrapperClassName="flex min-h-[24rem] flex-1 flex-col">
          <InlineState
            icon={<Mail className="h-4 w-4 text-rose-500 dark:text-rose-300" />}
            title="抄送记录加载失败"
            description={error}
            action={
              <Button onClick={() => void fetchList()}>
                重试加载
              </Button>
            }
            className="py-10"
          />
        </InnerTableSurface>
      </section>
    );
  }

  const pageActions = (
    <div className="space-y-5">
      <header className="admin-source-header">
        <div>
          <p className="admin-source-kicker">COPY TASKS</p>
          <h2>抄送我的</h2>
          <span>集中查看流程抄送、阅读状态和审批轨迹</span>
        </div>
        <div className="admin-source-controls">
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
            <RefreshCw size={16} className={refreshing ? 'animate-spin' : undefined} />
            刷新
          </Button>
          <Button size="sm" onClick={handleBatchMarkRead} disabled={selectedIds.size === 0}>
            <CheckCheck size={16} />
            批量已读
          </Button>
        </div>
      </header>

      <section className="admin-source-stat-grid">
        {statCards.map((stat) => {
          const Icon = stat.icon;
          return (
            <article key={stat.label} className={`card admin-source-stat admin-source-tone-${stat.tone}`}>
              <div className="admin-source-stat-icon"><Icon size={18} /></div>
              <div>
                <p>{stat.label}</p>
                <strong>{stat.value}</strong>
                <span>{stat.detail}</span>
              </div>
            </article>
          );
        })}
      </section>
    </div>
  );

  const pageFilters = (
    <section className="card admin-users-toolbar">
      <div className="admin-oa-filter-grid">
        <label>
          <span className="input-label">流程标题</span>
          <div className="admin-source-search-field">
            <Search size={16} />
            <Input
              type="search"
              placeholder="搜索流程标题"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              className="h-[42px]"
            />
          </div>
        </label>

        {processDefOptions.length > 0 ? (
          <label>
            <span className="input-label">流程类型</span>
            <Select
              value={processDefKey || ALL_PROCESS_VALUE}
              onValueChange={(value) =>
                handleProcessTypeChange(value === ALL_PROCESS_VALUE ? '' : value)
              }
            >
              <SelectTrigger className="h-[42px]">
                <SelectValue placeholder="全部流程类型" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_PROCESS_VALUE}>全部流程类型</SelectItem>
                {processDefOptions.map((option) => (
                  <SelectItem key={option.key} value={String(option.key)}>
                    {option.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
        ) : null}

        <div className="admin-users-toolbar-actions">
          <span className="admin-users-filter-count">{summary}</span>
          <Button variant="outline" size="sm" onClick={handleSearch}>
            <Search size={14} />
            应用
          </Button>
          <Button variant="outline" size="sm" onClick={handleClearFilters} disabled={!hasActiveFilters && !searchInput}>
            <X size={14} />
            重置
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
            <label className="admin-dialog-checkline h-9 min-h-0 py-0">
              <input type="checkbox"
                checked={allUnreadSelected}
                onChange={handleToggleSelectAll}
                className="h-4 w-4 rounded border-slate-300 text-cyan-600 focus:ring-cyan-400 dark:border-slate-700 dark:bg-slate-950"
              />
              全选当前页未读
            </label>
          ) : null}
          <span className="admin-users-filter-count">{currentReadFilterLabel} / {currentProcessLabel} / 已选 {selectedIds.size} 条</span>
        </div>
      </div>
    </section>
  );

  const pageContent = (
    <InnerTableSurface
      className="flex min-h-0 flex-1 flex-col"
      wrapperClassName="flex min-h-0 flex-1 flex-col overflow-hidden"
    >
      {records.length === 0 ? (
        <InlineState
          icon={<Mail className="h-4 w-4 text-cyan-600 dark:text-cyan-200" />}
          title="暂无抄送记录"
          description="后续有流程抄送到你时，这里会展示流程标题、节点和阅读状态。"
          className="flex-1"
        />
      ) : (
        <>
          <div className="border-b border-slate-200 px-4 py-3 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
            {summary}
          </div>
          <div className="min-h-0 flex-1 divide-y divide-slate-200 overflow-auto dark:divide-slate-800">
            {records.map((record) => {
              const isUnread = record.isRead === 0;
              const isSelected = selectedIds.has(record.id);

              return (
                <div
                  key={record.id}
                  className={cn(
                    'cursor-pointer px-4 py-4 transition-colors hover:bg-[var(--cf-surface-muted)] dark:hover:bg-slate-900/40',
                    isSelected && 'bg-[var(--cf-surface-muted)] dark:bg-slate-900/40',
                  )}
                  onClick={() => handleViewDetail(record)}
                >
                  <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                    <div className="flex min-w-0 items-start gap-3">
                      <div className="shrink-0 pt-1" onClick={(e) => e.stopPropagation()}>
                        {isUnread ? (
                          <input type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggleSelect(record.id)}
                            className="h-4 w-4 rounded border-slate-300 text-cyan-600 focus:ring-cyan-400 dark:border-slate-700 dark:bg-slate-950"
                          />
                        ) : (
                          <div className="w-4" />
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                          <h4
                            className={cn(
                              'min-w-0 truncate text-sm font-semibold',
                              isUnread ? 'text-slate-900 dark:text-slate-100' : 'text-slate-700 dark:text-slate-200',
                            )}
                          >
                            {record.title || '未命名流程'}
                          </h4>
                          <span className={cn('shrink-0 rounded-md px-2.5 py-1 text-xs font-semibold', getStatusStyle(record.processStatus))}>
                            {getStatusLabel(record.processStatus)}
                          </span>
                          <span className={cn(
                            'shrink-0 rounded-md px-2.5 py-1 text-xs font-medium',
                            isUnread
                              ? 'border border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-900/70 dark:bg-cyan-950/30 dark:text-cyan-200'
                              : 'border border-slate-200 bg-[var(--cf-surface-muted)] text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300',
                          )}>
                            {isUnread ? '未读' : '已读'}
                          </span>
                        </div>

                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                          <span>发起人 {record.startUserName || '-'}</span>
                          {record.processName ? <span>流程 {record.processName}</span> : null}
                          <span>抄送节点 {record.nodeName || '-'}</span>
                          <span>{record.createTime ? new Date(record.createTime).toLocaleString() : '-'}</span>
                          {record.readTime && !isUnread ? (
                            <span>阅读 {new Date(record.readTime).toLocaleString()}</span>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    <div
                      className="admin-users-row-actions lg:border-l lg:border-slate-200 lg:pl-6 dark:lg:border-slate-800"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {isUnread ? (
                        <button type="button" title="标记已读" aria-label="标记已读" onClick={() => void handleMarkRead(record)}>
                          <CheckCheck size={15} />
                        </button>
                      ) : null}
                      <button type="button" title="查看" aria-label="查看" onClick={() => handleViewDetail(record)}>
                        <Eye size={15} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </InnerTableSurface>
  );

  const pagePagination = total > 0 ? (
    <Pagination
      total={total}
      page={pageNum}
      pageSize={PAGE_SIZE}
      showPageSizeSelector={false}
      showJump={false}
      onPageChange={(page) => setPageNum(page)}
      onPageSizeChange={() => {}}
    />
  ) : null;

  return (
    <section className="admin-source-page">
      <TablePageLayout
        actions={pageActions}
        filters={pageFilters}
        table={pageContent}
        pagination={pagePagination}
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
              className={`rounded-md px-3 py-1.5 text-xs font-semibold ${getStatusStyle(selectedRecord.processStatus)}`}
            >
              {getStatusLabel(selectedRecord.processStatus)}
            </span>
          ) : undefined
        }
        bodyClassName="admin-dialog-stack"
        footer={(
          <Button variant="outline" onClick={handleCloseDetail}>
            关闭
          </Button>
        )}
      >
        {selectedRecord ? (
          <>
          {selectedRecord.formData ? (
            <DialogPanel
              title="表单数据快照"
              description="流程发起时提交的关键字段"
            >
                {(() => {
                  const data = parseFormData(selectedRecord.formData);
                  if (!data) {
                    return (
                      <InlineState title="无法解析表单数据" className="py-6" icon={<FileText className="h-4 w-4" />} />
                    );
                  }

                  return (
                    <div className="admin-copy-snapshot">
                      {Object.entries(data).map(([key, value]) => (
                        <div
                          key={key}
                          className="admin-copy-snapshot-row"
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
            </DialogPanel>
          ) : null}

          <DialogPanel title="流程轨迹" description={selectedRecord.instanceId}>
            <ProcessTrace instanceId={selectedRecord.instanceId} />
          </DialogPanel>
          </>
        ) : null}
      </BaseDialog>
    </section>
  );
};

export default CopyListPage;
