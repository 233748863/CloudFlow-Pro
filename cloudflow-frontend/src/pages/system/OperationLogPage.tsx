import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Search, RotateCcw, Trash2, Eye, X, RefreshCw, Download } from 'lucide-react';
import { DatePicker, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui';
import { toast } from 'sonner';
import {
  getSysLogPage, getSysLogTrend, getSysLogDetail, deleteSysLogs,
  SysLog, SysLogQuery, LogTrendItem
} from '@/services/api/log';
import { TableRowActions } from '@/components/ui/table-row-actions';

/**
 * 操作日志页面
 * 
 * 功能：趋势图（最近30天成功/失败）、条件筛选、分页表格、详情弹窗、批量删除
 * 参考设计：类似 PigX 的操作日志管理界面
 */

// ==================== 趋势图组件（纯 SVG 实现） ====================
const TrendChart: React.FC<{ data: LogTrendItem[] }> = ({ data }) => {
  if (!data.length) return null;

  const width = 900;
  const height = 200;
  const padding = { top: 20, right: 40, bottom: 30, left: 40 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  // 计算最大值（用于 Y 轴缩放）
  const maxVal = Math.max(...data.map(d => Math.max(d.success, d.fail)), 1);
  // Y 轴刻度（取整到合适的值）
  const yStep = Math.ceil(maxVal / 5);
  const yMax = yStep * 5;

  // 将数据点转换为 SVG 坐标
  const toX = (i: number) => padding.left + (i / (data.length - 1)) * chartW;
  const toY = (v: number) => padding.top + chartH - (v / yMax) * chartH;

  // 生成折线路径
  const linePath = (key: 'success' | 'fail') =>
    data.map((d, i) => `${i === 0 ? 'M' : 'L'}${toX(i)},${toY(d[key])}`).join(' ');

  // 生成面积路径（折线 + 底部闭合）
  const areaPath = (key: 'success' | 'fail') =>
    linePath(key) + ` L${toX(data.length - 1)},${toY(0)} L${toX(0)},${toY(0)} Z`;

  // X 轴标签（每隔几天显示一个日期）
  const xLabels = data.filter((_, i) => i % Math.ceil(data.length / 10) === 0 || i === data.length - 1);

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 mb-6">
      <div className="flex items-center justify-end gap-4 mb-2 text-xs text-slate-500">
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-full bg-pink-300 inline-block" /> 成功
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-full bg-slate-400 inline-block" /> 失败
        </span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto">
        {/* Y 轴刻度线和标签 */}
        {Array.from({ length: 6 }, (_, i) => {
          const val = yStep * i;
          const y = toY(val);
          return (
            <g key={i}>
              <line x1={padding.left} y1={y} x2={width - padding.right} y2={y} stroke="#e2e8f0" strokeWidth={1} />
              <text x={padding.left - 6} y={y + 4} textAnchor="end" fontSize={10} fill="#94a3b8">{val}</text>
            </g>
          );
        })}

        {/* 成功面积 */}
        <path d={areaPath('success')} fill="rgba(96,165,250,0.15)" />
        {/* 成功折线 */}
        <path d={linePath('success')} fill="none" stroke="#60a5fa" strokeWidth={2} />

        {/* 失败面积 */}
        <path d={areaPath('fail')} fill="rgba(148,163,184,0.1)" />
        {/* 失败折线 */}
        <path d={linePath('fail')} fill="none" stroke="#94a3b8" strokeWidth={2} />

        {/* X 轴标签 */}
        {xLabels.map(item => {
          const i = data.indexOf(item);
          // 只显示月-日
          const label = item.date.slice(5);
          return (
            <text key={item.date} x={toX(i)} y={height - 6} textAnchor="middle" fontSize={10} fill="#94a3b8">
              {label}
            </text>
          );
        })}
      </svg>
    </div>
  );
};

// ==================== 详情弹窗组件 ====================
const DetailModal: React.FC<{ log: SysLog | null; onClose: () => void }> = ({ log, onClose }) => {
  if (!log) return null;

  const items = [
    { label: '请求时间', value: log.createTime, color: 'text-orange-500' },
    { label: '操作人', value: log.createBy },
    { label: '请求地址', value: log.requestUri, color: 'text-pink-400' },
    { label: 'IP地址', value: log.remoteAddr },
    { label: '请求方式', value: log.method, color: 'text-pink-400' },
    { label: '客户端', value: log.serviceId },
    { label: '耗时', value: log.time ? `${log.time}/ms` : '-' },
    { label: '浏览器', value: log.userAgent },
    { label: '请求参数', value: log.params },
  ];

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center" onClick={onClose}>
      <div
        className="bg-slate-800 text-white rounded-2xl p-6 max-w-lg w-full mx-4 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* 标题栏（模拟 macOS 窗口按钮） */}
        <div className="flex items-center gap-2 mb-4">
          <span className="w-3 h-3 rounded-full bg-red-500 cursor-pointer" onClick={onClose} />
          <span className="w-3 h-3 rounded-full bg-yellow-500" />
          <span className="w-3 h-3 rounded-full bg-green-500" />
        </div>
        <div className="space-y-3 text-sm">
          {items.map(item => (
            <div key={item.label} className="flex">
              <span className={`w-20 shrink-0 font-medium ${item.color || 'text-slate-300'}`}>{item.label}：</span>
              <span className="text-slate-200 break-all">{item.value || '-'}</span>
            </div>
          ))}
          {/* 异常信息（仅错误日志显示） */}
          {log.logType === '9' && log.exception && (
            <div className="flex">
              <span className="w-20 shrink-0 font-medium text-red-400">异常信息：</span>
              <span className="text-red-300 break-all text-xs">{log.exception}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ==================== 主页面 ====================
export const OperationLogPage: React.FC = () => {
  // 查询参数
  const [query, setQuery] = useState<SysLogQuery>({ pageNum: 1, pageSize: 10 });
  const [logType, setLogType] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');

  // 数据状态
  const [records, setRecords] = useState<SysLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [trendData, setTrendData] = useState<LogTrendItem[]>([]);

  // 选中和详情
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [detailLog, setDetailLog] = useState<SysLog | null>(null);

  // 加载列表
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params: SysLogQuery = { ...query };
      if (logType) params.logType = logType;
      if (startTime) params.startTime = startTime;
      if (endTime) params.endTime = endTime;
      const res = await getSysLogPage(params);
      setRecords(res.records || []);
      setTotal(res.total || 0);
    } catch {
      // API 层已处理错误提示
    } finally {
      setLoading(false);
    }
  }, [query, logType, startTime, endTime]);

  // 加载趋势
  const loadTrend = useCallback(async () => {
    try {
      const res = await getSysLogTrend();
      setTrendData(res || []);
    } catch {
      // 静默处理
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => { loadTrend(); }, [loadTrend]);

  // 查询
  const handleSearch = () => {
    setQuery(prev => ({ ...prev, pageNum: 1 }));
  };

  // 重置
  const handleReset = () => {
    setLogType('');
    setStartTime('');
    setEndTime('');
    setQuery({ pageNum: 1, pageSize: 10 });
  };

  // 批量删除
  const handleBatchDelete = async () => {
    if (!selectedIds.length) {
      toast.warning('请选择要删除的日志');
      return;
    }
    if (!confirm(`确定删除选中的 ${selectedIds.length} 条日志？`)) return;
    try {
      await deleteSysLogs(selectedIds);
      toast.success('删除成功');
      setSelectedIds([]);
      loadData();
      loadTrend();
    } catch {
      // API 层已处理
    }
  };

  // 查看详情
  const handleViewDetail = async (id: number) => {
    try {
      const log = await getSysLogDetail(id);
      setDetailLog(log);
    } catch {
      // API 层已处理
    }
  };

  // 单条删除
  const handleDelete = async (id: number) => {
    if (!confirm('确定删除该条日志？')) return;
    try {
      await deleteSysLogs([id]);
      toast.success('删除成功');
      loadData();
      loadTrend();
    } catch {
      // API 层已处理
    }
  };

  // 全选/取消全选
  const allSelected = records.length > 0 && records.every(r => selectedIds.includes(r.logId));
  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds([]);
    } else {
      setSelectedIds(records.map(r => r.logId));
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
      {/* 趋势图 */}
      <TrendChart data={trendData} />

      {/* 筛选栏 */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm text-slate-600">类型</label>
          <Select value={logType} onValueChange={v => setLogType(v)}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="请选择类型" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">全部</SelectItem>
              <SelectItem value="0">正常</SelectItem>
              <SelectItem value="9">错误</SelectItem>
            </SelectContent>
          </Select>

          <label className="text-sm text-slate-600">请求时间</label>
          <DatePicker
            type="date"
            value={startTime}
            onChange={e => setStartTime(e.target.value)}
          />
          <span className="text-slate-400">至</span>
          <DatePicker
            type="date"
            value={endTime}
            onChange={e => setEndTime(e.target.value)}
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
          {/* 预留最小表格宽度，避免“详情/删除”在窄列里被挤成两行。 */}
          <table className="min-w-[1220px] w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-slate-500 text-left">
                <th className="px-4 py-3 w-10">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} className="rounded" />
                </th>
                <th className="px-4 py-3 w-14">#</th>
                <th className="px-4 py-3">类型</th>
                <th className="px-4 py-3">标题</th>
                <th className="px-4 py-3">IP地址</th>
                <th className="px-4 py-3">请求方式</th>
                <th className="px-4 py-3">耗时</th>
                <th className="px-4 py-3">请求时间</th>
                <th className="px-4 py-3 w-28">操作人</th>
                <th className="px-4 py-3 w-44 text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={10} className="text-center py-12 text-slate-400">加载中...</td>
                </tr>
              ) : records.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-center py-12 text-slate-400">暂无数据</td>
                </tr>
              ) : (
                records.map((log, idx) => (
                  <tr key={log.logId} className="border-t border-slate-50 hover:bg-slate-50/50 transition">
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
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        log.logType === '0'
                          ? 'bg-emerald-50 text-emerald-600'
                          : 'bg-red-50 text-red-600'
                      }`}>
                        {log.logType === '0' ? '正常' : '错误'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-700 max-w-[200px] truncate">{log.title}</td>
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{log.remoteAddr || '-'}</td>
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{log.method || '-'}</td>
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{log.time ? `${log.time}/ms` : '-'}</td>
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{log.createTime || '-'}</td>
                    <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{log.createBy || '-'}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-right">
                      <TableRowActions
                        align="end"
                        wrap={false}
                        className="whitespace-nowrap"
                        actions={[
                          {
                            label: '详情',
                            icon: <Eye size={14} />,
                            onClick: () => handleViewDetail(log.logId),
                            tone: 'info',
                          },
                          {
                            label: '删除',
                            icon: <Trash2 size={14} />,
                            onClick: () => handleDelete(log.logId),
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
      <DetailModal log={detailLog} onClose={() => setDetailLog(null)} />
    </div>
  );
};

export default OperationLogPage;
