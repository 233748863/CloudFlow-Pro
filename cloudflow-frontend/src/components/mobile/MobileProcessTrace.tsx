import React, { useState, useEffect } from 'react';
import { getProcessTrace } from '../../services/api/workflow';
import { ArrowLeft, CheckCircle, Clock, XCircle, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

interface TraceNode {
  id: string;
  name: string;
  type: string;
  status: 'finished' | 'active' | 'pending' | 'rejected' | 'skipped';
  operator?: string;
  operatorName?: string;
  comment?: string;
  time?: string;
  next?: TraceNode;
  branches?: TraceNode[];
}

interface MobileProcessTraceProps {
  instanceId: string;
  onBack: () => void;
}

const statusConfig: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
  finished: {
    icon: <CheckCircle size={18} className="text-green-500" />,
    color: 'border-green-500 bg-green-50',
    label: '已完成',
  },
  active: {
    icon: <Clock size={18} className="text-blue-500 animate-pulse" />,
    color: 'border-blue-500 bg-blue-50',
    label: '处理中',
  },
  pending: {
    icon: <Clock size={18} className="text-slate-400" />,
    color: 'border-slate-300 bg-slate-50',
    label: '待处理',
  },
  rejected: {
    icon: <XCircle size={18} className="text-red-500" />,
    color: 'border-red-500 bg-red-50',
    label: '已拒绝',
  },
  skipped: {
    icon: <AlertCircle size={18} className="text-slate-400" />,
    color: 'border-slate-300 bg-slate-50',
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
  const [nodes, setNodes] = useState<TraceNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadTrace();
  }, [instanceId]);

  const loadTrace = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getProcessTrace(instanceId);
      const flatNodes = flattenNodes(data?.nodes || data);
      setNodes(flatNodes);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '加载流程轨迹失败';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  // 将树形节点展平为线性列表
  const flattenNodes = (node: any): TraceNode[] => {
    if (!node) return [];
    if (Array.isArray(node)) return node;

    const result: TraceNode[] = [];
    let current = node;
    while (current) {
      result.push({
        id: current.id,
        name: current.name || current.title || '未命名节点',
        type: current.type,
        status: current.status || 'pending',
        operator: current.operator,
        operatorName: current.operatorName,
        comment: current.comment,
        time: current.time || current.completedTime,
      });

      // 处理分支
      if (current.branches && current.branches.length > 0) {
        current.branches.forEach((branch: any) => {
          const branchNodes = flattenNodes(branch);
          result.push(...branchNodes);
        });
      }

      current = current.next;
    }
    return result;
  };

  if (loading) {
    return (
      <div className="flex flex-col h-full bg-white">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200">
          <button onClick={onBack} className="p-1"><ArrowLeft size={20} className="text-slate-600" /></button>
          <h2 className="text-base font-semibold text-slate-800">流程轨迹</h2>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col h-full bg-white">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200">
          <button onClick={onBack} className="p-1"><ArrowLeft size={20} className="text-slate-600" /></button>
          <h2 className="text-base font-semibold text-slate-800">流程轨迹</h2>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center gap-3 px-4">
          <AlertCircle className="text-red-500" size={32} />
          <p className="text-sm text-red-500">{error}</p>
          <button onClick={loadTrace} className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg">
            重新加载
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white">
      {/* 顶部导航 */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200 bg-white sticky top-0 z-10">
        <button onClick={onBack} className="p-1">
          <ArrowLeft size={20} className="text-slate-600" />
        </button>
        <h2 className="text-base font-semibold text-slate-800">流程轨迹</h2>
        <span className="text-xs text-slate-500 ml-auto">{nodes.length} 个节点</span>
      </div>

      {/* 时间线 */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {nodes.length === 0 ? (
          <div className="text-center text-sm text-slate-500 py-8">暂无流程轨迹</div>
        ) : (
          <div className="relative">
            {/* 垂直连接线 */}
            <div className="absolute left-[21px] top-4 bottom-4 w-0.5 bg-slate-200" />

            {nodes.map((node, index) => {
              const config = statusConfig[node.status] || statusConfig.pending;
              return (
                <div key={node.id || index} className="relative flex gap-3 mb-4 last:mb-0">
                  {/* 状态图标 */}
                  <div className={`relative z-10 w-[44px] h-[44px] shrink-0 rounded-full border-2 flex items-center justify-center bg-white ${config.color}`}>
                    {config.icon}
                  </div>

                  {/* 节点信息 */}
                  <div className="flex-1 min-w-0 pt-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-slate-800 truncate">{node.name}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded ${
                        node.status === 'finished' ? 'bg-green-100 text-green-700' :
                        node.status === 'active' ? 'bg-blue-100 text-blue-700' :
                        node.status === 'rejected' ? 'bg-red-100 text-red-700' :
                        'bg-slate-100 text-slate-600'
                      }`}>
                        {config.label}
                      </span>
                    </div>

                    {node.operatorName && (
                      <p className="text-xs text-slate-500 mt-1">处理人: {node.operatorName}</p>
                    )}

                    {node.comment && (
                      <p className="text-xs text-slate-600 mt-1 bg-slate-50 rounded px-2 py-1">
                        "{node.comment}"
                      </p>
                    )}

                    {node.time && (
                      <p className="text-xs text-slate-400 mt-1">
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
