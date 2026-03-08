import React, { useState, useEffect, useCallback, useRef } from 'react';
import { getMyCopyList, getCopyUnreadCount, markCopyAsRead, batchMarkCopyAsRead, getProcessDefinitions } from '../services/api/workflow';
import { useAuth } from '../context/AuthContext';
import { RefreshCw, Search, ChevronLeft, ChevronRight, Eye, CheckCheck, Mail, MailOpen, X, FileText } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SkeletonCard } from '@/components/ui';
import { toast } from 'sonner';
import { ProcessTrace } from '../components/ProcessTrace';

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

  if (!user) return null;

  // Loading
  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="text-2xl font-bold text-slate-800">抄送我的</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      </div>
    );
  }

  // Error
  if (error) {
    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="text-2xl font-bold text-slate-800">抄送我的</h2>
        </div>
        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
          <p className="mb-4">{error}</p>
          <button onClick={() => fetchList()} className="px-4 py-2 bg-pink-500 text-white rounded-lg hover:bg-pink-600">
            重试
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 h-full flex flex-col">
      {/* 标题栏 */}
      <div className="flex justify-between items-center shrink-0">
        <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          抄送我的
          {unreadCount > 0 && (
            <span className="inline-flex items-center justify-center px-2 py-0.5 text-xs font-medium bg-red-500 text-white rounded-full">
              {unreadCount}
            </span>
          )}
        </h2>

        <div className="flex gap-2 items-center">
          {/* 搜索框 */}
          <div className="relative">
            <input
              type="text"
              placeholder="搜索流程标题..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              className="bg-white border border-slate-200 text-slate-600 text-sm rounded-lg pl-9 pr-3 py-2 w-56 focus:ring-pink-400 focus:border-pink-400 focus:outline-none"
            />
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            {searchInput && searchInput !== keyword && (
              <button onClick={handleSearch} className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-pink-500 hover:text-pink-600">
                搜索
              </button>
            )}
          </div>

          {/* 批量已读 */}
          {selectedIds.size > 0 && (
            <button
              onClick={handleBatchMarkRead}
              className="bg-pink-500 text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-pink-600 flex items-center gap-1"
            >
              <CheckCheck size={16} />
              标记已读 ({selectedIds.size})
            </button>
          )}

          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="bg-white border border-slate-200 text-slate-600 px-3 py-2 rounded-lg text-sm font-medium hover:bg-slate-50 flex items-center gap-1"
          >
            <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
            刷新
          </button>
        </div>
      </div>

      {/* 筛选区域 */}
      <div className="flex items-center gap-3 shrink-0">
        {/* 已读状态筛选 */}
        <div className="flex gap-1 bg-slate-100 p-1 rounded-lg">
          {([
            { key: 'ALL' as const, label: '全部' },
            { key: 'UNREAD' as const, label: '未读' },
            { key: 'READ' as const, label: '已读' },
          ]).map(tab => (
            <button
              key={tab.key}
              onClick={() => handleReadFilterChange(tab.key)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                readFilter === tab.key
                  ? 'bg-white shadow text-slate-800'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* 流程类型筛选 */}
        {processDefOptions.length > 0 && (
          <Select value={processDefKey} onValueChange={handleProcessTypeChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="请选择" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">全部流程类型</SelectItem>
                      {processDefOptions.map(opt => (
                        <SelectItem key={opt.key} value={String(opt.key)}>{opt.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
        )}

        {/* 全选未读 */}
        {unreadOnPage.length > 0 && (
          <label className="flex items-center gap-1.5 text-sm text-slate-500 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={allUnreadSelected}
              onChange={handleToggleSelectAll}
              className="rounded border-slate-300 text-pink-500 focus:ring-pink-400"
            />
            全选未读
          </label>
        )}

        {/* 清除筛选 */}
        {hasActiveFilters && (
          <button
            onClick={handleClearFilters}
            className="text-xs text-slate-400 hover:text-red-500 flex items-center gap-1 transition-colors"
          >
            <X size={12} />
            清除筛选
          </button>
        )}
      </div>

      {/* 列表内容 */}
      <div className="flex-1 overflow-auto min-h-[400px]">
        {records.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <Mail size={48} className="mb-3 opacity-50" />
            <p>暂无抄送记录</p>
          </div>
        ) : (
          <div className="space-y-3">
            {records.map(record => (
              <div
                key={record.id}
                className={`bg-white border rounded-xl p-4 hover:shadow-md transition-all cursor-pointer flex items-start gap-4 ${
                  record.isRead === 0 ? 'border-pink-100 bg-pink-50/30' : 'border-slate-200'
                }`}
                onClick={() => handleViewDetail(record)}
              >
                {/* 选择框（仅未读显示） */}
                <div className="pt-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                  {record.isRead === 0 ? (
                    <input
                      type="checkbox"
                      checked={selectedIds.has(record.id)}
                      onChange={() => handleToggleSelect(record.id)}
                      className="rounded border-slate-300 text-pink-500 focus:ring-pink-400"
                    />
                  ) : (
                    <div className="w-4" />
                  )}
                </div>

                {/* 已读/未读图标 */}
                <div className="pt-0.5 shrink-0">
                  {record.isRead === 0 ? (
                    <Mail size={20} className="text-pink-400" />
                  ) : (
                    <MailOpen size={20} className="text-slate-300" />
                  )}
                </div>

                {/* 主体内容 */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className={`font-semibold truncate ${record.isRead === 0 ? 'text-slate-900' : 'text-slate-600'}`}>
                      {record.title || '无标题'}
                    </h4>
                    {record.processStatus && (
                      <span className={`text-xs px-2 py-0.5 rounded font-medium shrink-0 ${getStatusStyle(record.processStatus)}`}>
                        {getStatusLabel(record.processStatus)}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-xs text-slate-400">
                    <span>发起人：{record.startUserName || '-'}</span>
                    {record.processName && <span>流程：{record.processName}</span>}
                    <span>抄送节点：{record.nodeName || '-'}</span>
                    <span>{record.createTime ? new Date(record.createTime).toLocaleString() : '-'}</span>
                  </div>
                </div>

                {/* 操作按钮 */}
                <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                  {record.isRead === 0 && (
                    <button
                      onClick={() => handleMarkRead(record)}
                      className="text-xs text-pink-500 hover:text-pink-600 px-2 py-1 rounded hover:bg-pink-50 transition-colors"
                    >
                      标记已读
                    </button>
                  )}
                  <button
                    onClick={() => handleViewDetail(record)}
                    className="text-xs text-slate-500 hover:text-slate-700 px-2 py-1 rounded hover:bg-slate-50 transition-colors flex items-center gap-1"
                  >
                    <Eye size={14} />
                    查看
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 分页器 */}
      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between pt-4 border-t border-slate-100 shrink-0">
          <span className="text-sm text-slate-500">
            共 {total} 条，第 {pageNum}/{totalPages} 页
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPageNum(p => Math.max(1, p - 1))}
              disabled={pageNum <= 1}
              className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
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
                  onClick={() => setPageNum(page)}
                  className={`w-8 h-8 rounded-lg text-sm font-medium transition-all ${
                    page === pageNum
                      ? 'bg-pink-500 text-white shadow'
                      : 'border border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {page}
                </button>
              );
            })}
            <button
              onClick={() => setPageNum(p => Math.min(totalPages, p + 1))}
              disabled={pageNum >= totalPages}
              className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* 详情弹窗 */}
      {detailOpen && selectedRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={handleCloseDetail}>
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 弹窗头部 */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div>
                <h3 className="text-lg font-bold text-slate-800">{selectedRecord.title || '流程详情'}</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  发起人：{selectedRecord.startUserName} · 抄送节点：{selectedRecord.nodeName}
                </p>
              </div>
              <button onClick={handleCloseDetail} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>

            {/* 弹窗内容 */}
            <div className="flex-1 overflow-auto px-6 py-4 space-y-6">
              {/* 表单数据快照 */}
              {selectedRecord.formData && (
                <div>
                  <h4 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-1.5">
                    <FileText size={16} />
                    表单数据（抄送时快照）
                  </h4>
                  <div className="bg-slate-50 rounded-lg p-4">
                    {(() => {
                      const data = parseFormData(selectedRecord.formData);
                      if (!data) return <p className="text-sm text-slate-400">无法解析表单数据</p>;
                      return (
                        <div className="grid grid-cols-2 gap-3">
                          {Object.entries(data).map(([key, value]) => (
                            <div key={key} className="text-sm">
                              <span className="text-slate-500">{key}：</span>
                              <span className="text-slate-800 font-medium">
                                {typeof value === 'object' ? JSON.stringify(value) : String(value ?? '-')}
                              </span>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              )}

              {/* 流程追踪 */}
              <div>
                <h4 className="text-sm font-semibold text-slate-700 mb-3">流程追踪</h4>
                <ProcessTrace instanceId={selectedRecord.instanceId} />
              </div>
            </div>

            {/* 弹窗底部 */}
            <div className="px-6 py-3 border-t border-slate-100 flex justify-end">
              <button
                onClick={handleCloseDetail}
                className="px-4 py-2 bg-slate-100 text-slate-600 rounded-lg text-sm font-medium hover:bg-slate-200"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CopyListPage;
