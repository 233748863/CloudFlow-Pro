import React, { useEffect, useState } from 'react';
import { getProcessTrace } from '../../services/api/workflow';
import { ArrowLeft, CheckCircle, Clock, XCircle, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { TaskSemanticBadge, TaskSemanticIcon, getTaskSemantic } from '../workflow/TaskSemanticBadge';
import { TimerFinishAction } from '../workflow/TimerFinishAction';
import { GatewayRoundProgress } from '../workflow/GatewayRoundProgress';
import type { WorkflowGatewayRound } from '@/types/workflow';
import { normalizeWorkflowTrace, getWorkflowActionLabel, type WorkflowTraceNode } from '@/utils/workflowTrace';

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
    icon: <Clock size={18} className="text-cf-faint" />,
    color: 'border-slate-300 bg-cf-surface-2 dark:border-slate-700',
    label: '待处理',
  },
  rejected: {
    icon: <XCircle size={18} className="text-red-500" />,
    color: 'border-red-500 bg-red-50 dark:bg-red-950/40',
    label: '已拒绝',
  },
  skipped: {
    icon: <AlertCircle size={18} className="text-cf-faint" />,
    color: 'border-slate-300 bg-cf-surface-2 dark:border-slate-700',
    label: '已跳过',
  },
};

/**
 * 移动端流程追踪组件
 * 垂直时间线布局，适配移动端屏幕
 */
export const MobileProcessTrace: React.FC<MobileProcessTraceProps> = ({
  instanceId,
  onBack,
}) => {
  const [nodes, setNodes] = useState<WorkflowTraceNode[]>([]);
  const [processStatus, setProcessStatus] = useState<string>();
  const [gatewayRounds, setGatewayRounds] = useState<WorkflowGatewayRound[]>([]);
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
      setNodes(normalizeWorkflowTrace(data));
      setGatewayRounds(data.gatewayRounds || []);
      setProcessStatus(data.status);
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
          <button onClick={onBack} className="p-1"><ArrowLeft size={20} className="text-cf-muted" /></button>
          <h2 className="text-base font-semibold text-cf-title">流程轨迹</h2>
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
          <button onClick={onBack} className="p-1"><ArrowLeft size={20} className="text-cf-muted" /></button>
          <h2 className="text-base font-semibold text-cf-title">流程轨迹</h2>
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
          <ArrowLeft size={20} className="text-cf-muted" />
        </button>
        <h2 className="text-base font-semibold text-cf-title">流程轨迹</h2>
        <span className="ml-auto text-xs text-cf-subtle">{nodes.length} 个节点</span>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="mb-4"><GatewayRoundProgress rounds={gatewayRounds} /></div>
        {nodes.length === 0 ? (
          <div className="py-8 text-center text-sm text-cf-subtle">暂无流程轨迹</div>
        ) : (
          <div className="relative">
            <div className="absolute bottom-4 left-[21px] top-4 w-0.5 bg-slate-200 dark:bg-slate-800" />

            {nodes.map((node, index) => {
              const config = statusConfig[node.status] || statusConfig.pending;
              return (
                <div key={`${node.id}_${index}`} className="relative flex gap-3 mb-4 last:mb-0">
                  <div className={`relative z-10 flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-full border-2 bg-[var(--cf-surface-strong)] ${config.color}`}>
                    {getTaskSemantic(node.taskType) ? <TaskSemanticIcon taskType={node.taskType} size={18} /> : config.icon}
                  </div>

                  <div className="flex-1 min-w-0 pt-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-cf-title">{node.name}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded ${
 node.status === 'finished' ? 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-200' :
 node.status === 'active' ? 'bg-cyan-50 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-200' :
 node.status === 'rejected' ? 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-200' :
 'bg-cf-surface-3 text-cf-muted '
 }`}>
                        {config.label}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <TaskSemanticBadge taskType={node.taskType} />
                      {node.action && <span className="text-xs text-cf-muted">{getWorkflowActionLabel(node.action)}</span>}
                    </div>

                    {node.operatorName && (
                      <p className="mt-1 text-xs text-cf-subtle">处理人: {node.operatorName}</p>
                    )}

                    {node.comment && (
                      <p className="mt-1 break-words rounded bg-cf-surface-2 px-2 py-1 text-xs text-cf-muted">
                        "{node.comment}"
                      </p>
                    )}

                    {node.time && (
                      <p className="mt-1 text-xs text-cf-faint">
                        {new Date(node.time).toLocaleString('zh-CN')}
                      </p>
                    )}
                    {node.type === 'ACTIVE' && node.nodeType === 'TIMER' && (
                      <TimerFinishAction instanceId={instanceId} nodeKey={node.nodeKey} nodeName={node.name} processStatus={processStatus} onFinished={loadTrace} />
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
