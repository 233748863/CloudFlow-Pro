import React, { useState, useEffect, useCallback, useRef } from 'react';
import { getMyCopyList, getCopyUnreadCount, markCopyAsRead, batchMarkCopyAsRead, getProcessDefinitions } from '../services/api/workflow';
import { useAuth } from '../context/AuthContext';
import { RefreshCw, Search, ChevronLeft, ChevronRight, Eye, CheckCheck, Mail, MailOpen, X, FileText } from 'lucide-react';
import { Button, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui';
import { toast } from 'sonner';
import { ProcessTrace } from '../components/ProcessTrace';
import { WorkspaceBackdrop, WorkspaceEmptyPanel, WorkspaceStatusPage } from '@/components/workspace/WorkspacePrimitives';
import { WorkspaceDialogShell, WorkspaceHeroCard, WorkspaceMetricCard, WorkspaceResultCard, WorkspaceSectionCard } from '@/components/workspace/WorkspacePanels';

/** 每页条数 */
const PAGE_SIZE = 12;

/** 抄送记录类型 */
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

/**
 * 抄送我的 - 页面组件
 * 展示当前用户收到的所有流程抄送记录，支持筛选、已读标记、查看流程详情
 */
export const CopyListPage: React.FC = () => {
  const { user } = useAuth();

  // 列表数据
  const [records, setRecords] = useState<CopyRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // 分页
  const [pageNum, setPageNum] = useState(1);
  const [total, setTotal] = useState(0);

  // 筛选条件
  const [readFilter, setReadFilter] = useState<'ALL' | 'UNREAD' | 'READ'>('ALL');
  const [keyword, setKeyword] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [processDefKey, setProcessDefKey] = useState('');
  const [processDefOptions, setProcessDefOptions] = useState<{ key: string; name: string }[]>([]);
  const hasShownProcessDefLoadWarningRef = useRef(false);

  // 未读数量（用于标题展示）
  const [unreadCount, setUnreadCount] = useState(0);

  // 详情弹窗
  const [selectedRecord, setSelectedRecord] = useState<CopyRecord | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  // 批量选择
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  /** 加载抄送列表 */
  const fetchList = useCallback(async (showLoading = true) => {
    if (!user) return;
    try {
      if (showLoading) setLoading(true);
      setError(null);

      const res = await getMyCopyList({
        pageNum,
        pageSize: PAGE_SIZE,
        keyword: keyword || undefined,
        isRead: readFilter === 'UNREAD' ? 0 : readFilter === 'READ' ? 1 : undefined,
        processDefKey: processDefKey || undefined,
      });

      // 兼容 PageResult 和数组
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
      const msg = e instanceof Error ? e.message : '加载抄送列表失败';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user, pageNum, keyword, readFilter, processDefKey]);

  /** 加载未读数量 */
  const fetchUnreadCount = useCallback(async () => {
    try {
      const count = await getCopyUnreadCount();
      setUnreadCount(typeof count === 'number' ? count : 0);
    } catch {
      // 静默失败
    }
  }, []);

  // 初始加载
  useEffect(() => {
    fetchList();
  }, [fetchList]);

  useEffect(() => {
    fetchUnreadCount();
  }, [fetchUnreadCount]);

  // 加载流程定义选项
  useEffect(() => {
    getProcessDefinitions({ latestOnly: false }).then(res => {
      if (Array.isArray(res)) {
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
      }
    }).catch((err) => {
      console.error('加载流程定义选项失败:', err);
      if (!hasShownProcessDefLoadWarningRef.current) {
        toast.warning('流程类型筛选加载失败，已切换为无筛选选项模式');
        hasShownProcessDefLoadWarningRef.current = true;
      }
    });
  }, []);

  /** 刷新 */
  const handleRefresh = () => {
    setRefreshing(true);
    fetchList(false);
    fetchUnreadCount();
  };

  /** 搜索提交 */
  const handleSearch = () => {
    setKeyword(searchInput);
    setPageNum(1);
  };

  /** 回车搜索 */
  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  };

  /** 切换已读筛选 */
  const handleReadFilterChange = (val: typeof readFilter) => {
    setReadFilter(val);
    setPageNum(1);
  };

  /** 切换流程类型筛选 */
  const handleProcessTypeChange = (val: string) => {
    setProcessDefKey(val);
    setPageNum(1);
  };

  /** 清除筛选 */
  const hasActiveFilters = readFilter !== 'ALL' || keyword || processDefKey;
  const handleClearFilters = () => {
    setReadFilter('ALL');
    setKeyword('');
    setSearchInput('');
    setProcessDefKey('');
    setPageNum(1);
  };

  /** 标记单条已读 */
  const handleMarkRead = async (record: CopyRecord) => {
    if (record.isRead === 1) return;
    try {
      await markCopyAsRead(record.id);
      toast.success('已标记为已读');
      fetchList(false);
      fetchUnreadCount();
    } catch {
      toast.error('标记已读失败');
    }
  };

  /** 批量标记已读 */
  const handleBatchMarkRead = async () => {
    if (selectedIds.size === 0) {
      toast.info('请先选择要标记的记录');
      return;
    }
    try {
      await batchMarkCopyAsRead(Array.from(selectedIds));
      toast.success(`已标记 ${selectedIds.size} 条为已读`);
      setSelectedIds(new Set());
      fetchList(false);
      fetchUnreadCount();
    } catch {
      toast.error('批量标记失败');
    }
  };

  /** 全选/取消全选当前页未读 */
  const unreadOnPage = records.filter(r => r.isRead === 0);
  const allUnreadSelected = unreadOnPage.length > 0 && unreadOnPage.every(r => selectedIds.has(r.id));
  const handleToggleSelectAll = () => {
    if (allUnreadSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(unreadOnPage.map(r => r.id)));
    }
  };

  /** 切换单条选择 */
  const handleToggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  /** 查看详情（打开流程追踪弹窗） */
  const handleViewDetail = async (record: CopyRecord) => {
    setSelectedRecord(record);
    setDetailOpen(true);

    // 自动标记已读
    if (record.isRead === 0) {
      markCopyAsRead(record.id).then(() => {
        fetchList(false);
        fetchUnreadCount();
      }).catch((err) => {
        console.warn('自动标记抄送已读失败:', err);
      });
    }
  };

  /** 关闭详情弹窗 */
  const handleCloseDetail = () => {
    setDetailOpen(false);
    setSelectedRecord(null);
  };

  /** 解析表单数据用于展示 */
  const parseFormData = (formDataStr: string): Record<string, any> | null => {
    if (!formDataStr) return null;
    try {
      return JSON.parse(formDataStr);
    } catch {
      return null;
    }
  };

  /** 流程状态标签样式 */
  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'RUNNING': return 'bg-pink-50 text-pink-500';
      case 'COMPLETED': return 'bg-emerald-50 text-emerald-600';
      case 'REJECTED': return 'bg-red-50 text-red-600';
      case 'REVOKED': return 'bg-amber-50 text-amber-600';
      default: return 'bg-slate-50 text-slate-600';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'RUNNING': return '进行中';
      case 'COMPLETED': return '已完成';
      case 'REJECTED': return '已拒绝';
      case 'REVOKED': return '已撤回';
      default: return status || '未知';
    }
  };

  // 分页
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const now = new Date();
  const todayLabel = new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' }).format(now);
  const timeLabel = now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  const currentReadFilterLabel = readFilter === 'UNREAD' ? '未读' : readFilter === 'READ' ? '已读' : '全部';
  const currentProcessLabel = processDefOptions.find((item) => item.key === processDefKey)?.name || '全部流程';
  const readCount = Math.max(total - unreadCount, 0);
  const latestRecord = records[0] || null;
  const summary = total > 0
    ? `当前共 ${total} 条抄送记录，其中 ${unreadCount} 条未读，已读 ${readCount} 条。`
    : '暂无流程抄送，新的节点通知会集中显示在这里。';
  const focusItems = [
    {
      label: '已读视图',
      value: currentReadFilterLabel,
      hint: hasActiveFilters ? '当前列表已应用筛选条件' : '当前展示全部抄送记录',
      tone: 'bg-pink-50 text-pink-600',
    },
    {
      label: '流程范围',
      value: currentProcessLabel,
      hint: keyword ? `当前关键词：${keyword}` : '可继续按流程类型和关键词筛选',
      tone: 'bg-amber-50 text-amber-600',
    },
    {
      label: '最新提醒',
      value: latestRecord?.processStatus ? getStatusLabel(latestRecord.processStatus) : '暂无',
      hint: latestRecord?.title || '当前页暂无可查看的抄送记录',
      tone: 'bg-emerald-50 text-emerald-600',
    },
  ];
  const metricCards = [
    {
      label: '全部记录',
      value: total,
      hint: '当前用户可见的抄送总量',
      icon: <Mail size={18} />,
      toneClass: 'bg-pink-50 text-pink-600',
    },
    {
      label: '未读总数',
      value: unreadCount,
      hint: '仍需处理或查看的抄送',
      icon: <MailOpen size={18} />,
      toneClass: 'bg-amber-50 text-amber-600',
    },
    {
      label: '本页未读',
      value: unreadOnPage.length,
      hint: '当前分页内可批量标记的记录',
      icon: <CheckCheck size={18} />,
      toneClass: 'bg-emerald-50 text-emerald-600',
    },
    {
      label: '已选条数',
      value: selectedIds.size,
      hint: selectedIds.size > 0 ? '可直接执行批量已读' : '暂未选择批量处理项',
      icon: <Eye size={18} />,
      toneClass: 'bg-slate-100 text-slate-600',
    },
  ];

  if (!user) return null;

  // Loading
  if (loading) {
    return (
      <WorkspaceStatusPage
        icon={<Mail size={26} />}
        title="正在加载抄送记录..."
        description="我们正在整理你的流程抄送和已读状态，请稍候。"
        actions={(
          <Button variant="outline" className="rounded-2xl" onClick={handleRefresh}>
            <RefreshCw size={16} className="mr-2" />
            刷新状态
          </Button>
        )}
        panelClassName="py-14"
      />
    );
  }

  // Error
  if (error) {
    return (
      <WorkspaceStatusPage
        icon={<Mail size={26} />}
        title="抄送记录加载失败"
        description={error}
        actions={(
          <Button className="rounded-2xl bg-pink-500 text-white hover:bg-pink-600" onClick={() => fetchList()}>
            重试加载
          </Button>
        )}
        panelClassName="py-14"
      />
    );
  }

  return (
    <div className="relative min-h-screen pb-6">
      <WorkspaceBackdrop />

      <div className="relative z-10 space-y-6 p-6">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_360px]">
          <WorkspaceHeroCard
            badge={(
              <div className="flex flex-wrap items-center gap-3 text-sm font-medium text-slate-500">
                <span className="inline-flex items-center gap-2 rounded-full bg-pink-50 px-3 py-1.5 text-pink-600 ring-1 ring-pink-100">
                  <Mail size={14} />
                  {todayLabel}
                </span>
                <span className="rounded-full bg-white/80 px-3 py-1.5 ring-1 ring-slate-200/80">{timeLabel}</span>
                <span className="rounded-full bg-white/80 px-3 py-1.5 ring-1 ring-slate-200/80">{currentReadFilterLabel}</span>
              </div>
            )}
            title="抄送我的"
            description={summary}
            actions={(
              <div className="flex flex-wrap gap-3">
                {selectedIds.size > 0 ? (
                  <Button className="h-12 rounded-2xl bg-pink-500 px-6 text-white shadow-[0_16px_32px_rgba(236,72,153,0.24)] hover:bg-pink-600" onClick={handleBatchMarkRead}>
                    <CheckCheck size={16} className="mr-2" />
                    标记已读 ({selectedIds.size})
                  </Button>
                ) : null}
                <Button variant="outline" className="h-12 rounded-2xl bg-white/85 px-6" onClick={handleRefresh} disabled={refreshing}>
                  <RefreshCw size={16} className={`mr-2 text-pink-500 ${refreshing ? 'animate-spin' : ''}`} />
                  刷新
                </Button>
              </div>
            )}
            contentClassName="p-7 sm:p-8"
            glowClassName="bg-[radial-gradient(circle_at_top_right,rgba(244,114,182,0.18),transparent_52%),radial-gradient(circle_at_bottom_left,rgba(251,191,36,0.16),transparent_42%)]"
          >
            <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-white/78 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-pink-600 ring-1 ring-white/80 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
              <Mail size={14} />
              抄送工作台
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-[24px] border border-white/80 bg-white/72 px-4 py-4 shadow-[0_10px_24px_rgba(15,23,42,0.04)] backdrop-blur">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">未读总数</div>
                <div className="mt-2 text-2xl font-bold tracking-tight text-slate-900">{unreadCount}</div>
                <div className="mt-1 text-xs leading-5 text-slate-500">需要优先查看的流程抄送</div>
              </div>
              <div className="rounded-[24px] border border-white/80 bg-white/72 px-4 py-4 shadow-[0_10px_24px_rgba(15,23,42,0.04)] backdrop-blur">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">当前流程范围</div>
                <div className="mt-2 text-2xl font-bold tracking-tight text-slate-900">{currentProcessLabel}</div>
                <div className="mt-1 text-xs leading-5 text-slate-500">按流程类型收敛查看范围</div>
              </div>
              <div className="rounded-[24px] border border-white/80 bg-white/72 px-4 py-4 shadow-[0_10px_24px_rgba(15,23,42,0.04)] backdrop-blur">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">批量选择</div>
                <div className="mt-2 text-2xl font-bold tracking-tight text-slate-900">{selectedIds.size}</div>
                <div className="mt-1 text-xs leading-5 text-slate-500">已选未读记录可直接批量已读</div>
              </div>
            </div>
          </WorkspaceHeroCard>

          <WorkspaceSectionCard
            eyebrow="今日焦点"
            title="先看这些"
            headerAside={(
              <div className="rounded-full bg-white/82 px-3 py-1.5 text-[11px] font-medium text-slate-500 ring-1 ring-white/80 shadow-[0_8px_18px_rgba(15,23,42,0.04)]">
                已读 {readCount} / 未读 {unreadCount}
              </div>
            )}
            className="rounded-[34px]"
            bodyClassName="space-y-5"
          >
            <div className="space-y-3">
              {focusItems.map((item) => (
                <div key={item.label} className="flex items-start gap-3 rounded-[24px] border border-slate-100 bg-white px-4 py-4">
                  <div className={`rounded-2xl p-3 ${item.tone}`}>
                    <Mail size={16} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-semibold text-slate-900">{item.label}</div>
                      <div className="text-xs font-semibold text-slate-400">{item.value}</div>
                    </div>
                    <div className="mt-1 text-xs leading-5 text-slate-500">{item.hint}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-[24px] border border-slate-100 bg-slate-50/80 px-4 py-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">本页未读</div>
                <div className="mt-2 text-xl font-bold tracking-tight text-slate-900">{unreadOnPage.length}</div>
              </div>
              <div className="rounded-[24px] border border-slate-100 bg-slate-50/80 px-4 py-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">流程筛选</div>
                <div className="mt-2 text-xl font-bold tracking-tight text-slate-900">{processDefKey ? '已启用' : '未启用'}</div>
              </div>
              <div className="rounded-[24px] border border-slate-100 bg-slate-50/80 px-4 py-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">关键词</div>
                <div className="mt-2 truncate text-xl font-bold tracking-tight text-slate-900">{keyword || '未输入'}</div>
              </div>
            </div>
          </WorkspaceSectionCard>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {metricCards.map((card) => (
            <WorkspaceMetricCard
              key={card.label}
              label={card.label}
              value={card.value}
              hint={card.hint}
              aside={<div className={`rounded-2xl p-3 ${card.toneClass}`}>{card.icon}</div>}
              toneClassName="border-white/80 bg-[linear-gradient(135deg,rgba(255,255,255,0.94),rgba(248,250,252,0.8))] shadow-[0_16px_40px_rgba(15,23,42,0.04)]"
              className="rounded-[28px] px-5 py-5"
            />
          ))}
        </div>

        <WorkspaceSectionCard
          eyebrow="抄送工作区"
          title="抄送记录"
          description={hasActiveFilters ? '当前已按筛选条件收敛结果，可继续查看详情或批量处理未读。' : '集中查看流程抄送、批量标记已读，并进入流程追踪。'}
          headerAside={(
            <div className="rounded-full bg-white/82 px-3 py-1.5 text-[11px] font-medium text-slate-500 ring-1 ring-white/80 shadow-[0_8px_18px_rgba(15,23,42,0.04)]">
              第 {pageNum} / {totalPages} 页
            </div>
          )}
          className="rounded-[32px]"
          bodyClassName="space-y-5"
        >
          <div className="rounded-[28px] border border-slate-100 bg-gradient-to-r from-white via-pink-50/35 to-white p-5">
            <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_240px_auto]">
              <div className="relative">
                <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input
                  type="text"
                  placeholder="搜索流程标题..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={handleSearchKeyDown}
                  className="h-11 rounded-2xl border-white/85 bg-white/82 pl-10 pr-16 shadow-[0_10px_22px_rgba(15,23,42,0.04)]"
                />
                {searchInput && searchInput !== keyword ? (
                  <button type="button" onClick={handleSearch} className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-pink-500 transition hover:text-pink-600">
                    搜索
                  </button>
                ) : null}
              </div>

              {processDefOptions.length > 0 ? (
                <Select value={processDefKey} onValueChange={handleProcessTypeChange}>
                  <SelectTrigger className="h-11 rounded-2xl border-white/85 bg-white/82 shadow-[0_10px_22px_rgba(15,23,42,0.04)]">
                    <SelectValue placeholder="全部流程类型" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">全部流程类型</SelectItem>
                    {processDefOptions.map((opt) => (
                      <SelectItem key={opt.key} value={String(opt.key)}>{opt.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <div />
              )}

              <div className="flex flex-wrap items-center justify-end gap-2">
                <Button variant="outline" className="h-11 rounded-2xl bg-white/82 px-4" onClick={handleRefresh} disabled={refreshing}>
                  <RefreshCw size={15} className={`mr-2 ${refreshing ? 'animate-spin text-pink-500' : 'text-pink-500'}`} />
                  刷新
                </Button>
                {hasActiveFilters ? (
                  <Button variant="outline" className="h-11 rounded-2xl bg-white/82 px-4" onClick={handleClearFilters}>
                    <X size={15} className="mr-2 text-slate-400" />
                    清除筛选
                  </Button>
                ) : null}
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <div className="inline-flex h-11 items-center rounded-2xl bg-slate-100 p-1">
                {([
                  { key: 'ALL' as const, label: '全部' },
                  { key: 'UNREAD' as const, label: '未读' },
                  { key: 'READ' as const, label: '已读' },
                ]).map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => handleReadFilterChange(tab.key)}
                    className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${readFilter === tab.key ? 'bg-white text-pink-600 shadow-[0_8px_20px_rgba(15,23,42,0.08)]' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {unreadOnPage.length > 0 ? (
                <label className="inline-flex h-11 items-center gap-3 rounded-2xl border border-white/85 bg-white/82 px-4 text-sm font-medium text-slate-600 shadow-[0_10px_22px_rgba(15,23,42,0.04)]">
                  <input
                    type="checkbox"
                    checked={allUnreadSelected}
                    onChange={handleToggleSelectAll}
                    className="h-4 w-4 rounded border-slate-300 text-pink-500 focus:ring-pink-400"
                  />
                  全选当前页未读
                </label>
              ) : null}

              {!hasActiveFilters ? (
                <span className="rounded-full bg-white/82 px-3 py-1.5 text-[11px] font-medium text-slate-400 ring-1 ring-white/80 shadow-[0_8px_18px_rgba(15,23,42,0.04)]">
                  当前未应用额外筛选
                </span>
              ) : null}
            </div>
          </div>

          <WorkspaceResultCard
            total={total}
            title="当前抄送"
            description={records.length > 0 ? '点击记录可查看流程详情、表单快照和处理轨迹。' : '当前条件下暂无抄送记录。'}
            footer={total > PAGE_SIZE ? (
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/70 bg-[linear-gradient(180deg,rgba(248,250,252,0.72),rgba(255,255,255,0.6))] px-4 py-3">
                <span className="rounded-full bg-white/82 px-3 py-1.5 text-[11px] font-medium text-slate-500 ring-1 ring-white/80 shadow-[0_8px_18px_rgba(15,23,42,0.04)]">
                  共 {total} 条，第 {pageNum}/{totalPages} 页
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setPageNum((p) => Math.max(1, p - 1))}
                    disabled={pageNum <= 1}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-2xl border border-white/80 bg-white/82 text-slate-600 shadow-[0_8px_18px_rgba(15,23,42,0.04)] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let start = Math.max(1, pageNum - 2);
                    const end = Math.min(totalPages, start + 4);
                    start = Math.max(1, end - 4);
                    const page = start + i;
                    if (page > totalPages) return null;
                    return (
                      <button
                        key={page}
                        type="button"
                        onClick={() => setPageNum(page)}
                        className={`h-9 min-w-9 rounded-2xl px-3 text-sm font-semibold transition ${page === pageNum ? 'bg-pink-500 text-white shadow-[0_12px_24px_rgba(236,72,153,0.24)]' : 'border border-white/80 bg-white/82 text-slate-600 shadow-[0_8px_18px_rgba(15,23,42,0.04)] hover:bg-white'}`}
                      >
                        {page}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => setPageNum((p) => Math.min(totalPages, p + 1))}
                    disabled={pageNum >= totalPages}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-2xl border border-white/80 bg-white/82 text-slate-600 shadow-[0_8px_18px_rgba(15,23,42,0.04)] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            ) : undefined}
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
                      className={`cursor-pointer rounded-[24px] border px-4 py-4 shadow-[0_10px_24px_rgba(15,23,42,0.04)] transition hover:-translate-y-0.5 hover:shadow-[0_16px_30px_rgba(15,23,42,0.08)] ${record.isRead === 0 ? 'border-pink-100 bg-[linear-gradient(135deg,rgba(253,242,248,0.74),rgba(255,255,255,0.94))]' : 'border-white/80 bg-[linear-gradient(135deg,rgba(255,255,255,0.94),rgba(248,250,252,0.82))]'}`}
                      onClick={() => handleViewDetail(record)}
                    >
                      <div className="flex items-start gap-4">
                        <div className="pt-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                          {record.isRead === 0 ? (
                            <input
                              type="checkbox"
                              checked={selectedIds.has(record.id)}
                              onChange={() => handleToggleSelect(record.id)}
                              className="h-4 w-4 rounded border-slate-300 text-pink-500 focus:ring-pink-400"
                            />
                          ) : (
                            <div className="w-4" />
                          )}
                        </div>

                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/88 ring-1 ring-white/80 shadow-[0_10px_18px_rgba(15,23,42,0.04)]">
                          {record.isRead === 0 ? (
                            <Mail size={18} className="text-pink-500" />
                          ) : (
                            <MailOpen size={18} className="text-slate-400" />
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h4 className={`min-w-0 flex-1 truncate text-base font-semibold ${record.isRead === 0 ? 'text-slate-900' : 'text-slate-700'}`}>
                              {record.title || '无标题'}
                            </h4>
                            {record.processStatus ? (
                              <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${getStatusStyle(record.processStatus)}`}>
                                {getStatusLabel(record.processStatus)}
                              </span>
                            ) : null}
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
                            <span>发起人：{record.startUserName || '-'}</span>
                            {record.processName ? <span>流程：{record.processName}</span> : null}
                            <span>抄送节点：{record.nodeName || '-'}</span>
                            <span>{record.createTime ? new Date(record.createTime).toLocaleString() : '-'}</span>
                          </div>
                        </div>

                        <div className="flex shrink-0 flex-wrap items-center gap-2" onClick={(e) => e.stopPropagation()}>
                          {record.isRead === 0 ? (
                            <Button variant="outline" className="h-10 rounded-2xl border-pink-100 bg-white/85 px-4 text-pink-600 hover:bg-pink-50" onClick={() => handleMarkRead(record)}>
                              标记已读
                            </Button>
                          ) : null}
                          <Button variant="outline" className="h-10 rounded-2xl bg-white/85 px-4" onClick={() => handleViewDetail(record)}>
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
        </WorkspaceSectionCard>

      </div>

      {detailOpen && selectedRecord ? (
        <WorkspaceDialogShell
          title={selectedRecord.title || '流程详情'}
          description={`发起人：${selectedRecord.startUserName || '-'} · 抄送节点：${selectedRecord.nodeName || '-'}`}
          onClose={handleCloseDetail}
          maxWidthClassName="max-w-4xl"
          headerAside={selectedRecord.processStatus ? (
            <span className={`rounded-full px-3 py-1.5 text-xs font-semibold ${getStatusStyle(selectedRecord.processStatus)}`}>
              {getStatusLabel(selectedRecord.processStatus)}
            </span>
          ) : undefined}
          bodyClassName="space-y-6"
        >
          {selectedRecord.formData ? (
            <div className="rounded-[24px] border border-pink-100 bg-gradient-to-br from-pink-50 via-white to-white p-5">
              <h4 className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <FileText size={16} className="text-pink-500" />
                表单数据快照
              </h4>
              <div className="mt-4 rounded-[20px] border border-white/80 bg-white/82 p-4 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
                {(() => {
                  const data = parseFormData(selectedRecord.formData);
                  if (!data) {
                    return <p className="text-sm text-slate-400">无法解析表单数据</p>;
                  }
                  return (
                    <div className="grid gap-3 md:grid-cols-2">
                      {Object.entries(data).map(([key, value]) => (
                        <div key={key} className="rounded-2xl border border-slate-100 bg-slate-50/80 px-4 py-3 text-sm">
                          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">{key}</div>
                          <div className="mt-2 break-all font-medium text-slate-700">
                            {typeof value === 'object' ? JSON.stringify(value) : String(value ?? '-')}
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
            <h4 className="text-sm font-semibold text-slate-700">流程追踪</h4>
            <div className="rounded-[24px] border border-white/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(248,250,252,0.84))] p-4 shadow-[0_12px_28px_rgba(15,23,42,0.04)]">
              <ProcessTrace instanceId={selectedRecord.instanceId} />
            </div>
          </div>

          <div className="flex justify-end">
            <Button variant="outline" className="rounded-2xl" onClick={handleCloseDetail}>
              关闭
            </Button>
          </div>
        </WorkspaceDialogShell>
      ) : null}
    </div>
  );
};

export default CopyListPage;
