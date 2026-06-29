import React, { useEffect, useState } from 'react';
import { getProcessTrace } from '../../services/api/workflow';
import { ArrowLeft, CheckCircle, Clock, XCircle, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

interface TraceNode {
  id: string;
  nodeKey: string;
  name: string;
  type: string;
  status: 'finished' | 'active' | 'pending' | 'rejected' | 'skipped';
  operator?: string;
  operatorName?: string;
  comment?: string;
  time?: string;
}

interface MobileProcessTraceProps {
  instanceId: string;
  onBack: () => void;
}

const statusConfig: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
  finished: {
    icon: <CheckCircle size={18} className="text-green-500" />,
    color: 'border-green-500 bg-green-50 dark:bg-green-950/40',
    label: '已完成',
  },
  active: {
    icon: <Clock size={18} className="text-cyan-500 animate-pulse" />,
    color: 'border-cyan-400 bg-cyan-50 dark:bg-cyan-950/40',
    label: '处理中',
  },
  pending: {
    icon: <Clock size={18} className="text-slate-400" />,
    color: 'border-slate-300 bg-slate-50 dark:border-slate-700 dark:bg-slate-900',
    label: '待处理',
  },
  rejected: {
    icon: <XCircle size={18} className="text-red-500" />,
    color: 'border-red-500 bg-red-50 dark:bg-red-950/40',
    label: '已拒绝',
  },
  skipped: {
    icon: <AlertCircle size={18} className="text-slate-400" />,
    color: 'border-slate-300 bg-slate-50 dark:border-slate-700 dark:bg-slate-900',
    label: '已跳过',
  },
};

const normalizeStatus = (raw: unknown): TraceNode['status'] => {
  const value = String(raw || '').trim().toLowerCase();
  if (value === 'finished' || value === 'completed') return 'finished';
  if (value === 'active' || value === 'running') return 'active';
  if (value === 'rejected' || value === 'reject') return 'rejected';
  if (value === 'skipped' || value === 'skip') return 'skipped';
  return 'pending';
};

const mapActionToStatus = (action: unknown): TraceNode['status'] => {
  const value = String(action || '').trim().toUpperCase();
  if (value.includes('REJECT') || value.includes('RETURN')) return 'rejected';
  if (value.includes('APPROVE') || value.includes('START') || value.includes('SUBMIT') || value.includes('COMPLETE')) {
    return 'finished';
  }
  return 'finished';
};

const toTimestamp = (value?: string): number => {
  if (!value) return 0;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : 0;
};

/**
 * 仅按 nodes+edges 时代轨迹结构（historyDetails/activeDetails）构建移动端时间线。
 */
const normalizeTraceNodes = (trace: any): TraceNode[] => {
  const historyDetails = Array.isArray(trace?.historyDetails) ? trace.historyDetails : [];
  const activeDetails = Array.isArray(trace?.activeDetails) ? trace.activeDetails : [];

  const historyNodes: TraceNode[] = historyDetails.map((item: any, index: number) => ({
    id: String(item?.historyId || item?.taskId || item?.nodeKey || `history_${index}`),
    nodeKey: String(item?.nodeKey || ''),
    name: String(item?.nodeName || '未命名节点'),
    type: 'HISTORY',
    status: mapActionToStatus(item?.action),
    operator: item?.operatorId !== undefined && item?.operatorId !== null ? String(item.operatorId) : undefined,
    operatorName: item?.operatorName ? String(item.operatorName) : undefined,
    comment: item?.comment ? String(item.comment) : undefined,
    time: item?.completeTime || item?.createTime,
  }));

  const activeNodes: TraceNode[] = activeDetails.map((item: any, index: number) => ({
    id: String(item?.taskId || item?.nodeKey || `active_${index}`),
    nodeKey: String(item?.nodeKey || ''),
    name: String(item?.nodeName || '未命名节点'),
    type: 'ACTIVE',
    status: 'active',
    operator: item?.assigneeId !== undefined && item?.assigneeId !== null ? String(item.assigneeId) : undefined,
    operatorName: item?.assigneeName ? String(item.assigneeName) : undefined,
    comment: undefined,
    time: item?.createTime,
  }));

  const merged = [...historyNodes, ...activeNodes];
  if (merged.length > 0) {
    return merged.sort((a, b) => toTimestamp(a.time) - toTimestamp(b.time));
  }

  return [];
};

/**
 * 移动端流程追踪组件
 * 垂直时间线布局，适配移动端屏幕
 */
export const MobileProcessTrace: React.FC<MobileProcessTraceProps> = ({
  instanceId,
  onBack,
}) => {
  const [nodes, setNodes] = useState<TraceNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadTrace();
  }, [instanceId]);

  const loadTrace = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getProcessTrace(instanceId);
      setNodes(normalizeTraceNodes(data));
    } catch (err) {
      const msg = err instanceof Error ? err.message : '加载流程轨迹失败';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-full flex-col bg-[var(--cf-bg)] text-[var(--cf-text)]">
        <div className="flex items-center gap-3 border-b border-slate-200 bg-[var(--cf-surface-strong)] px-4 py-3 dark:border-slate-800">
          <button onClick={onBack} className="p-1"><ArrowLeft size={20} className="text-slate-600 dark:text-slate-300" /></button>
          <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">流程轨迹</h2>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-600"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full flex-col bg-[var(--cf-bg)] text-[var(--cf-text)]">
        <div className="flex items-center gap-3 border-b border-slate-200 bg-[var(--cf-surface-strong)] px-4 py-3 dark:border-slate-800">
          <button onClick={onBack} className="p-1"><ArrowLeft size={20} className="text-slate-600 dark:text-slate-300" /></button>
          <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">流程轨迹</h2>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center gap-3 px-4">
          <AlertCircle className="text-red-500" size={32} />
          <p className="text-sm text-red-500">{error}</p>
          <button onClick={loadTrace} className="rounded-md bg-cyan-600 px-4 py-2 text-sm text-white">
            重新加载
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-[var(--cf-bg)] text-[var(--cf-text)]">
      <div className="sticky top-0 z-30 flex items-center gap-3 border-b border-slate-200 bg-[var(--cf-surface-strong)] px-4 py-3 dark:border-slate-800">
        <button onClick={onBack} className="p-1">
          <ArrowLeft size={20} className="text-slate-600 dark:text-slate-300" />
        </button>
        <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">流程轨迹</h2>
        <span className="ml-auto text-xs text-slate-500 dark:text-slate-400">{nodes.length} 个节点</span>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {nodes.length === 0 ? (
          <div className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">暂无流程轨迹</div>
        ) : (
          <div className="relative">
            <div className="absolute bottom-4 left-[21px] top-4 w-0.5 bg-slate-200 dark:bg-slate-800" />

            {nodes.map((node, index) => {
              const config = statusConfig[node.status] || statusConfig.pending;
              return (
                <div key={`${node.id}_${index}`} className="relative flex gap-3 mb-4 last:mb-0">
                  <div className={`relative z-10 flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-full border-2 bg-[var(--cf-surface-strong)] ${config.color}`}>
                    {config.icon}
                  </div>

                  <div className="flex-1 min-w-0 pt-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{node.name}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded ${
                        node.status === 'finished' ? 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-200' :
                        node.status === 'active' ? 'bg-cyan-50 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-200' :
                        node.status === 'rejected' ? 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-200' :
                        'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                      }`}>
                        {config.label}
                      </span>
                    </div>

                    {node.operatorName && (
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">处理人: {node.operatorName}</p>
                    )}

                    {node.comment && (
                      <p className="mt-1 break-words rounded bg-slate-50 px-2 py-1 text-xs text-slate-600 dark:bg-slate-900 dark:text-slate-300">
                        "{node.comment}"
                      </p>
                    )}

                    {node.time && (
                      <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                        {new Date(node.time).toLocaleString('zh-CN')}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
