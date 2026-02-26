import React, { useState, useEffect, useCallback } from 'react';
import { Search, RotateCcw, Trash2, Eye, RefreshCw, ArrowLeftRight } from 'lucide-react';
import { toast } from 'sonner';
import {
  getAuditLogPage, getAuditLogDetail, deleteAuditLogs,
  SysAuditLog, AuditLogQuery
} from '@/services/api/log';

/**
 * 审计日志页面
 * 
 * 功能：条件筛选、分页表格、变更对比详情弹窗、批量删除
 * 展示数据变更的前后值对比
 */

// ==================== 变更对比详情弹窗 ====================
const AuditDetailModal: React.FC<{ log: SysAuditLog | null; onClose: () => void }> = ({ log, onClose }) => {
  if (!log) return null;

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center" onClick={onClose}>
      <div
        className="bg-white rounded-2xl p-6 max-w-2xl w-full mx-4 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* 标题 */}
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-bold text-slate-800">审计详情</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">✕</button>
        </div>

        {/* 基本信息 */}
        <div className="grid grid-cols-2 gap-4 mb-6 text-sm">
          <div>
            <span className="text-slate-500">业务名称：</span>
            <span className="text-slate-800 font-medium">{log.auditName || '-'}</span>
          </div>
          <div>
            <span className="text-slate-500">变更字段：</span>
            <span className="text-pink-500 font-medium">{log.auditField || '-'}</span>
          </div>
          <div>
            <span className="text-slate-500">操作人：</span>
            <span className="text-slate-800">{log.createBy || '-'}</span>
          </div>
          <div>
            <span className="text-slate-500">操作时间：</span>
            <span className="text-slate-800">{log.createTime || '-'}</span>
          </div>
        </div>

        {/* 变更前后对比 */}
        <div className="border border-slate-200 rounded-xl overflow-hidden">
          <div className="grid grid-cols-[1fr_40px_1fr]">
            {/* 变更前 */}
            <div className="bg-red-50/50">
              <div className="px-4 py-2 bg-red-100/60 text-red-700 text-xs font-semibold border-b border-red-200/50">
                变更前
              </div>
              <div className="p-4 text-sm text-slate-700 break-all min-h-[80px] font-mono">
                {log.beforeVal || <span className="text-slate-400 italic">（空）</span>}
              </div>
            </div>

            {/* 箭头 */}
            <div className="flex items-center justify-center bg-slate-50 border-x border-slate-200">
              <ArrowLeftRight size={16} className="text-slate-400" />
            </div>

            {/* 变更后 */}
            <div className="bg-emerald-50/50">
              <div className="px-4 py-2 bg-emerald-100/60 text-emerald-700 text-xs font-semibold border-b border-emerald-200/50">
                变更后
              </div>
              <div className="p-4 text-sm text-slate-700 break-all min-h-[80px] font-mono">
                {log.afterVal || <span className="text-slate-400 italic">（空）</span>}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ==================== 主页面 ====================
export const AuditLogPage: React.FC = () => {
  // 查询参数
  const [query, setQuery] = useState<AuditLogQuery>({ pageNum: 1, pageSize: 10 });
  const [auditName, setAuditName] = useState('');
  const [createBy, setCreateBy] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');

  // 数据状态
  const [records, setRecords] = useState<SysAuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  // 选中和详情
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [detailLog, setDetailLog] = useState<SysAuditLog | null>(null);

  // 加载列表
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params: AuditLogQuery = { ...query };
      if (auditName) params.auditName = auditName;
      if (createBy) params.createBy = createBy;
      if (startTime) params.startTime = startTime;
      if (endTime) params.endTime = endTime;
      const res = await getAuditLogPage(params);
      setRecords(res.records || []);
      setTotal(res.total || 0);
    } catch {
      // API 层已处理错误提示
    } finally {
      setLoading(false);
    }
  }, [query, auditName, createBy, startTime, endTime]);

  useEffect(() => { loadData(); }, [loadData]);

  // 查询
  const handleSearch = () => {
    setQuery(prev => ({ ...prev, pageNum: 1 }));
  };

  // 重置
  const handleReset = () => {
    setAuditName('');
    setCreateBy('');
    setStartTime('');
    setEndTime('');
    setQuery({ pageNum: 1, pageSize: 10 });
  };

  // 批量删除
  const handleBatchDelete = async () => {
    if (!selectedIds.length) {
      toast.warning('请选择要删除的审计日志');
      return;
    }
    if (!confirm(`确定删除选中的 ${selectedIds.length} 条审计日志？`)) return;
    try {
      await deleteAuditLogs(selectedIds);
      toast.success('删除成功');
      setSelectedIds([]);
      loadData();
    } catch {
      // API 层已处理
    }
  };

  // 查看详情
  const handleViewDetail = async (id: number) => {
    try {
      const log = await getAuditLogDetail(id);
      setDetailLog(log);
    } catch {
      // API 层已处理
    }
  };

  // 单条删除
  const handleDelete = async (id: number) => {
    if (!confirm('确定删除该条审计日志？')) return;
    try {
      await deleteAuditLogs([id]);
      toast.success('删除成功');
      loadData();
    } catch {
      // API 层已处理
    }
  };

  // 全选/取消全选
  const allSelected = records.length > 0 && records.every(r => selectedIds.includes(r.auditId));
  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds([]);
    } else {
      setSelectedIds(records.map(r => r.auditId));
    }
  };
  const toggleOne = (id: number) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  // 分页
  const totalPages = Math.ceil(total / (query.pageSize || 10));
  const goPage = (p: number) => {
    if (p < 1 || p > totalPages) return;
    setQuery(prev => ({ ...prev, pageNum: p }));
  };

  return (
    <div className="space-y-4">
      {/* 筛选栏 */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm text-slate-600">业务名称</label>
          <input
            type="text"
            value={auditName}
            onChange={e => setAuditName(e.target.value)}
            placeholder="请输入业务名称"
            className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm w-40 focus:ring-2 focus:ring-pink-100 focus:border-pink-300 outline-none"
          />

          <label className="text-sm text-slate-600">操作人</label>
          <input
            type="text"
            value={createBy}
            onChange={e => setCreateBy(e.target.value)}
            placeholder="请输入操作人"
            className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm w-32 focus:ring-2 focus:ring-pink-100 focus:border-pink-300 outline-none"
          />

          <label className="text-sm text-slate-600">操作时间</label>
          <input
            type="date"
            value={startTime}
            onChange={e => setStartTime(e.target.value)}
            className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-pink-100 focus:border-pink-300 outline-none"
          />
          <span className="text-slate-400">To</span>
          <input
            type="date"
            value={endTime}
            onChange={e => setEndTime(e.target.value)}
            className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-pink-100 focus:border-pink-300 outline-none"
          />

          <button
            onClick={handleSearch}
            className="flex items-center gap-1.5 bg-pink-500 text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-pink-600 transition"
          >
            <Search size={14} /> 查询
          </button>
          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 border border-slate-300 text-slate-600 px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-slate-50 transition"
          >
            <RotateCcw size={14} /> 重置
          </button>
        </div>
      </div>

      {/* 操作栏 + 表格 */}
      <div className="bg-white rounded-xl border border-slate-200">
        {/* 操作栏 */}
        <div className="flex items-center justify-between p-4 border-b border-slate-100">
          <button
            onClick={handleBatchDelete}
            className="flex items-center gap-1.5 bg-red-50 text-red-600 px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-red-100 transition"
          >
            <Trash2 size={14} /> 删除
          </button>
          <div className="flex items-center gap-2">
            <button onClick={loadData} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition">
              <RefreshCw size={16} />
            </button>
          </div>
        </div>

        {/* 表格 */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-slate-500 text-left">
                <th className="px-4 py-3 w-10">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} className="rounded" />
                </th>
                <th className="px-4 py-3 w-14">#</th>
                <th className="px-4 py-3">业务名称</th>
                <th className="px-4 py-3">变更字段</th>
                <th className="px-4 py-3">变更前</th>
                <th className="px-4 py-3">变更后</th>
                <th className="px-4 py-3">操作人</th>
                <th className="px-4 py-3">操作时间</th>
                <th className="px-4 py-3 w-32">操作</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} className="text-center py-12 text-slate-400">加载中...</td>
                </tr>
              ) : records.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-12 text-slate-400">暂无数据</td>
                </tr>
              ) : (
                records.map((log, idx) => (
                  <tr key={log.auditId} className="border-t border-slate-50 hover:bg-slate-50/50 transition">
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
                      <span className="px-2 py-0.5 rounded bg-pink-50 text-pink-500 text-xs font-medium">
                        {log.auditField || '-'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-red-500 max-w-[150px] truncate text-xs font-mono">
                      {log.beforeVal || '-'}
                    </td>
                    <td className="px-4 py-3 text-emerald-600 max-w-[150px] truncate text-xs font-mono">
                      {log.afterVal || '-'}
                    </td>
                    <td className="px-4 py-3 text-slate-700">{log.createBy || '-'}</td>
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{log.createTime || '-'}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleViewDetail(log.auditId)}
                          className="text-pink-400 hover:text-pink-600 text-xs flex items-center gap-0.5"
                        >
                          <Eye size={13} /> 详情
                        </button>
                        <button
                          onClick={() => handleDelete(log.auditId)}
                          className="text-red-500 hover:text-red-700 text-xs flex items-center gap-0.5"
                        >
                          <Trash2 size={13} /> 删除
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* 分页 */}
        {total > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 text-sm text-slate-500">
            <span>共 {total} 条</span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => goPage((query.pageNum || 1) - 1)}
                disabled={(query.pageNum || 1) <= 1}
                className="px-2 py-1 rounded hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                上一页
              </button>
              {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                let p: number;
                if (totalPages <= 7) {
                  p = i + 1;
                } else {
                  const current = query.pageNum || 1;
                  const start = Math.max(1, Math.min(current - 3, totalPages - 6));
                  p = start + i;
                }
                return (
                  <button
                    key={p}
                    onClick={() => goPage(p)}
                    className={`w-8 h-8 rounded text-sm ${
                      p === (query.pageNum || 1)
                        ? 'bg-pink-500 text-white'
                        : 'hover:bg-slate-100'
                    }`}
                  >
                    {p}
                  </button>
                );
              })}
              <button
                onClick={() => goPage((query.pageNum || 1) + 1)}
                disabled={(query.pageNum || 1) >= totalPages}
                className="px-2 py-1 rounded hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                下一页
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 详情弹窗 */}
      <AuditDetailModal log={detailLog} onClose={() => setDetailLog(null)} />
    </div>
  );
};

export default AuditLogPage;
