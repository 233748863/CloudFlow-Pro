import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { 
  CheckCircle2, Circle, Clock, AlertCircle, 
  ArrowDown, GitBranch, GitMerge, User, Shield, 
  CreditCard, FileText, Briefcase, MessageSquare,
  ChevronDown, ChevronUp
} from 'lucide-react';
import { getProcessTrace, getProcessInstance, getProcessDefinition, urgeTask } from '../services/api/workflow';
import { NodeType, WorkflowGraphDefinition } from '../types';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';
import { BellRing } from 'lucide-react';
import { parseWorkflowGraphDefinition } from '../utils/workflowGraph';

interface ProcessTraceProps {
  instanceId: string;
  onClose?: () => void;
  variant?: 'default' | 'glass';
}

interface HistoryDetail {
  nodeKey: string;
  nodeName: string;
  action: string;
  operatorName: string;
  operatorId?: string;
  comment?: string;
  createTime?: string;
  completeTime?: string;
  duration?: string;
}

interface ActiveDetail {
  taskId?: string;
  nodeKey: string;
  nodeName: string;
  assigneeName?: string;
  assigneeId?: string | number;
  createTime?: string;
}

interface TraceData {
  finished: string[];
  active: string[];
  historyDetails?: HistoryDetail[];
  activeDetails?: ActiveDetail[];
  parallelBranches?: any[];
}

// 节点图标组件
const NodeIcon = ({ type, title, status }: { type: string, title: string, status: 'finished' | 'active' | 'pending' }) => {
  const getIcon = () => {
    if (title.includes('财务')) return <CreditCard size={16} />;
    if (title.includes('经理') || title.includes('上级')) return <User size={16} />;
    if (title.includes('法务') || title.includes('安全')) return <Shield size={16} />;
    if (type === NodeType.START) return <FileText size={16} />;
    if (type === NodeType.END) return <CheckCircle2 size={16} />;
    if (type === NodeType.CONDITION || type === NodeType.PARALLEL) return <GitBranch size={16} />;
    return <Briefcase size={16} />;
  };

  const baseClasses = "w-8 h-8 rounded-full flex items-center justify-center z-10 transition-all duration-500";
  const statusClasses = {
    finished: "bg-emerald-100 text-emerald-600 ring-2 ring-emerald-500",
    active: "bg-cyan-50 text-cyan-700 ring-2 ring-cyan-400 animate-pulse",
    pending: "bg-slate-100 text-slate-400 ring-2 ring-slate-200"
  };

  return (
    <div className={`${baseClasses} ${statusClasses[status]}`}>
      {getIcon()}
    </div>
  );
};

// 操作动作的中文映射和颜色
const getActionStyle = (action: string) => {
  const map: Record<string, { label: string; color: string; bgColor: string }> = {
    'APPROVE': { label: '同意', color: 'text-emerald-700', bgColor: 'bg-emerald-50' },
    'REJECT': { label: '拒绝', color: 'text-red-700', bgColor: 'bg-red-50' },
    'DELEGATE': { label: '转办', color: 'text-purple-700', bgColor: 'bg-purple-50' },
    'RETURN': { label: '驳回', color: 'text-amber-700', bgColor: 'bg-amber-50' },
    'START': { label: '发起', color: 'text-cyan-700', bgColor: 'bg-cyan-50' },
    'SUBMIT': { label: '提交', color: 'text-cyan-700', bgColor: 'bg-cyan-50' },
    'COMPLETE': { label: '完成', color: 'text-emerald-700', bgColor: 'bg-emerald-50' },
  };
  // 尝试匹配，支持中文动作名
  if (action.includes('同意') || action.includes('通过')) return map['APPROVE'];
  if (action.includes('拒绝')) return map['REJECT'];
  if (action.includes('转办') || action.includes('委托')) return map['DELEGATE'];
  if (action.includes('驳回') || action.includes('退回')) return map['RETURN'];
  if (action.includes('发起') || action.includes('提交')) return map['START'];
  return map[action] || { label: action, color: 'text-slate-700', bgColor: 'bg-slate-50' };
};

// 格式化时间
const formatTime = (timeStr?: string) => {
  if (!timeStr) return '-';
  try {
    const d = new Date(timeStr);
    return d.toLocaleString('zh-CN', { 
      month: '2-digit', day: '2-digit', 
      hour: '2-digit', minute: '2-digit' 
    });
  } catch {
    return timeStr;
  }
};

/**
 * 统一解析流程模型，仅接受 nodes+edges 图结构。
 */
const parseWorkflowGraph = (rawModel: unknown): WorkflowGraphDefinition | null => {
  const graph = parseWorkflowGraphDefinition(rawModel);
  if (!graph) {
    return null;
  }
  return graph;
};

const isDefaultEdge = (edge: { isDefault?: unknown }) => {
  const raw = edge.isDefault;
  if (typeof raw === 'boolean') return raw;
  if (typeof raw === 'number') return raw !== 0;
  if (typeof raw === 'string') {
    const normalized = raw.trim().toLowerCase();
    return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'y';
  }
  return false;
};

export const ProcessTrace = ({ instanceId, onClose, variant = 'default' }: ProcessTraceProps) => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [trace, setTrace] = useState<TraceData>({ finished: [], active: [] });
  const [graphModel, setGraphModel] = useState<WorkflowGraphDefinition | null>(null);
  const [rootNodeId, setRootNodeId] = useState<string | null>(null);
  const [instance, setInstance] = useState<any>(null);
  const [error, setError] = useState('');
  // 子Tab：审批记录 / 流程图
  const [subTab, setSubTab] = useState<'timeline' | 'diagram'>('timeline');
  // 流程图展开/折叠
  const [diagramExpanded, setDiagramExpanded] = useState(false);
  const isGlass = variant === 'glass';

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      // 1. 获取流程轨迹（含历史详情）
      const traceRes = await getProcessTrace(instanceId);
      setTrace(traceRes as unknown as TraceData);

      // 2. 获取流程实例信息
      const instanceRes = await getProcessInstance(instanceId);
      setInstance(instanceRes);
      
      // 3. 获取流程定义（用于流程图渲染），严格依赖 definitionId
      const definitionId = String((instanceRes as any)?.definitionId || '').trim();
      if (!definitionId) {
        console.warn('[ProcessTrace] 缺少 definitionId，无法加载流程图', { instanceId });
        setGraphModel(null);
        setRootNodeId(null);
        return;
      }
      const def = await getProcessDefinition(definitionId);
      const parsed = parseWorkflowGraph((def as any)?.modelJson);
      setGraphModel(parsed);
      if (!parsed || parsed.nodes.length === 0) {
        setRootNodeId(null);
        return;
      }
      const startNode = parsed.nodes.find(
        (node) => String((node as any)?.type || '').toUpperCase() === NodeType.START,
      );
      const resolvedRootId = String((startNode || parsed.nodes[0]).id || '').trim();
      setRootNodeId(resolvedRootId || null);
    } catch (e) {
      console.error(e);
      setError("加载流程追踪失败");
    } finally {
      setLoading(false);
    }
  }, [instanceId]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const handleUrge = async (taskId: string, nodeName: string) => {
      try {
          await urgeTask(taskId, `催办节点: ${nodeName}`);
          toast.success(`已向 ${nodeName} 节点发送催办提醒`);
      } catch (err) {
          console.error('催办失败:', err);
          toast.error('催办失败，请稍后重试');
      }
  };

  // 流程图递归渲染
  const nodeMap = useMemo(() => {
    const map = new Map<string, WorkflowGraphDefinition['nodes'][number]>();
    (graphModel?.nodes || []).forEach((node) => {
      const nodeId = String((node as any)?.id || '').trim();
      if (nodeId) {
        map.set(nodeId, node);
      }
    });
    return map;
  }, [graphModel]);

  const outgoingMap = useMemo(() => {
    const map = new Map<string, WorkflowGraphDefinition['edges']>();
    (graphModel?.edges || []).forEach((edge) => {
      const source = String((edge as any)?.source || '').trim();
      const target = String((edge as any)?.target || '').trim();
      if (!source || !target) {
        return;
      }
      const current = map.get(source) || [];
      current.push(edge);
      map.set(source, current);
    });
    return map;
  }, [graphModel]);

  // 流程图递归渲染（直接基于 nodes+edges）
  const renderNode = (nodeId: string, visited = new Set<string>()) => {
    if (!nodeId || visited.has(nodeId)) return null;
    const node = nodeMap.get(nodeId);
    if (!node) return null;

    const nextVisited = new Set(visited);
    nextVisited.add(nodeId);

    const nodeType = String((node as any)?.type || NodeType.APPROVAL);
    const nodeTitle = String((node as any)?.title || '未命名节点');
    const isFinished = trace.finished.includes(nodeId);
    const isActive = trace.active.includes(nodeId);
    const status: 'finished' | 'active' | 'pending' = isActive
      ? 'active'
      : (isFinished ? 'finished' : 'pending');
    const isInitiator = user && instance && String(instance.startUserId) === String(user.id);

    const nodeHistory = trace.historyDetails?.find((h) => h.nodeKey === nodeId);
    const nodeActive = trace.activeDetails?.find((a) => a.nodeKey === nodeId);
    const outgoingEdges = outgoingMap.get(nodeId) || [];

    let nextNodeId: string | null = null;
    let branchNodeIds: string[] = [];
    if (outgoingEdges.length === 1) {
      nextNodeId = String((outgoingEdges[0] as any)?.target || '').trim() || null;
    } else if (outgoingEdges.length > 1) {
      const defaultEdges = outgoingEdges.filter((edge) => isDefaultEdge(edge));
      const defaultEdge = defaultEdges.length === 1 ? defaultEdges[0] : undefined;
      if (defaultEdge) {
        nextNodeId = String((defaultEdge as any)?.target || '').trim() || null;
        branchNodeIds = outgoingEdges
          .filter((edge) => edge !== defaultEdge)
          .map((edge) => String((edge as any)?.target || '').trim())
          .filter(Boolean);
      } else {
        branchNodeIds = outgoingEdges
          .map((edge) => String((edge as any)?.target || '').trim())
          .filter(Boolean);
      }
    }

    return (
      <div className="flex flex-col items-center">
        <div className="relative flex flex-col items-center group">
          <NodeIcon type={nodeType} title={nodeTitle} status={status} />
          
          <div className={`mt-2 px-3 py-1.5 rounded-lg border text-xs font-medium max-w-[140px] text-center transition-colors
             ${status === 'active' ? 'bg-cyan-50 border-cyan-200 text-cyan-700 shadow-sm' : 
               status === 'finished' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 
               'bg-white border-slate-200 text-slate-500'}
          `}>
            {nodeTitle}
            {nodeHistory && (
              <div className="text-[9px] mt-0.5 opacity-75">
                {nodeHistory.operatorName} · {getActionStyle(nodeHistory.action).label}
              </div>
            )}
            {nodeActive && (
              <div className="text-[9px] mt-0.5 text-cyan-500">
                待: {nodeActive.assigneeName || '待认领'}
              </div>
            )}
          </div>
          
          {isActive && isInitiator && nodeActive?.taskId && (
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  void handleUrge(nodeActive.taskId!, nodeTitle);
                }}
                className="absolute -right-8 top-0 bg-amber-100 text-amber-600 p-1 rounded-full hover:bg-amber-200 transition-colors"
                title="催办"
              >
                  <BellRing size={12}/>
              </button>
          )}
        </div>

        {branchNodeIds.length > 0 && (
           <div className="flex flex-col items-center mt-4 w-full">
              <div className="h-4 w-0.5 bg-slate-300 mb-2"></div>
              <div className="flex justify-center items-start gap-8 relative">
                 <div className="absolute top-0 left-0 right-0 h-0.5 bg-slate-300 mx-auto" style={{ width: `calc(100% - 4rem)` }}></div>
                 {branchNodeIds.map((branchId, idx) => (
                    <div key={`${branchId}-${idx}`} className="flex flex-col items-center pt-4 relative">
                       <div className="absolute top-0 w-0.5 h-4 bg-slate-300"></div>
                       {renderNode(branchId, nextVisited)}
                    </div>
                 ))}
              </div>
           </div>
        )}

        {nextNodeId && (
           <div className="flex flex-col items-center">
             <div className={`h-8 w-0.5 ${trace.finished.includes(nodeId) ? 'bg-emerald-300' : 'bg-slate-300'}`}></div>
             <ArrowDown size={14} className={`${trace.finished.includes(nodeId) ? 'text-emerald-300' : 'text-slate-300'} -mt-1`} />
             <div className="h-4 w-0.5 bg-transparent"></div>
             {renderNode(nextNodeId, nextVisited)}
           </div>
        )}
      </div>
    );
  };

  const renderTimeline = () => {
    const historyItems = trace.historyDetails || [];
    const activeItems = trace.activeDetails || [];
    
    // 如果没有任何数据
    if (historyItems.length === 0 && activeItems.length === 0) {
      return (
        <div className={`py-8 text-center text-sm ${isGlass ? 'text-slate-500' : 'text-slate-400'}`}>
          暂无审批记录
        </div>
      );
    }

    return (
      <div className="space-y-0">
        {/* 已完成的历史记录 */}
        {historyItems.map((item, idx) => {
          const actionStyle = getActionStyle(item.action);
          return (
            <div key={`hist-${idx}`} className="flex gap-3 relative">
              {/* 时间线竖线 */}
              <div className="flex flex-col items-center flex-shrink-0 w-8">
                <div className="w-3 h-3 rounded-full bg-emerald-500 ring-2 ring-emerald-100 z-10 mt-1.5" />
                {(idx < historyItems.length - 1 || activeItems.length > 0) && (
                  <div className="w-0.5 flex-1 bg-emerald-200 min-h-[40px]" />
                )}
              </div>
              
              {/* 内容 */}
              <div className="flex-1 pb-4">
                <div className={isGlass ? 'rounded-2xl border border-slate-200 bg-white px-3.5 py-3 shadow-sm' : ''}>
                  <div className="mb-1 flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-800">{item.nodeName}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${actionStyle.bgColor} ${actionStyle.color}`}>
                      {actionStyle.label}
                    </span>
                  </div>
                  <div className="space-y-0.5 text-xs text-slate-500">
                    <div className="flex items-center gap-2">
                      <User size={11} className="text-cyan-500" />
                      <span>{item.operatorName || '系统'}</span>
                      <span className="text-slate-300">·</span>
                      <span>{formatTime(item.completeTime || item.createTime)}</span>
                    </div>
                    {item.comment && (
                      <div className="mt-1 flex items-start gap-2">
                        <MessageSquare size={11} className="mt-0.5 flex-shrink-0 text-slate-400" />
                          <span className={`rounded px-2 py-1 text-[11px] leading-relaxed ${isGlass ? 'border border-slate-200 bg-slate-50 text-slate-600' : 'bg-slate-50 text-slate-600'}`}>
                          {item.comment}
                        </span>
                      </div>
                    )}
                    {item.duration && (
                      <div className="flex items-center gap-2">
                        <Clock size={11} className="text-cyan-500" />
                        <span className="text-slate-400">耗时 {item.duration}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {/* 当前活动节点 */}
        {activeItems.map((item, idx) => (
          <div key={`active-${idx}`} className="flex gap-3 relative">
            <div className="flex flex-col items-center flex-shrink-0 w-8">
              <div className="w-3 h-3 rounded-full bg-cyan-500 ring-2 ring-cyan-100 z-10 mt-1.5 animate-pulse" />
              {idx < activeItems.length - 1 && (
                <div className="w-0.5 flex-1 bg-slate-200 min-h-[40px]" />
              )}
            </div>
            
            <div className="flex-1 pb-4">
              <div className={isGlass ? 'rounded-2xl border border-cyan-200 bg-cyan-50 px-3.5 py-3 shadow-sm' : ''}>
                <div className="mb-1 flex items-center gap-2">
                  <span className="text-sm font-semibold text-cyan-700">{item.nodeName}</span>
                  <span className="animate-pulse rounded-full border border-cyan-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-cyan-700">
                    处理中
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <User size={11} className="text-cyan-500" />
                  <span>待处理: {item.assigneeName || (item.assigneeId ? String(item.assigneeId) : '待认领')}</span>
                  {item.createTime && (
                    <>
                      <span className="text-slate-300">·</span>
                      <span>到达: {formatTime(item.createTime)}</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  if (loading) {
    return (
      <div className={`flex flex-col items-center justify-center gap-3 p-10 ${isGlass ? 'rounded-2xl border border-slate-200 bg-white shadow-sm' : ''}`}>
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-600"></div>
        <p className="text-sm text-slate-500">加载流程轨迹中...</p>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className={`flex flex-col items-center gap-3 p-10 text-center ${isGlass ? 'rounded-2xl border border-slate-200 bg-white shadow-sm' : ''}`}>
        <AlertCircle className="text-red-500" size={32} />
        <p className="text-red-500 font-medium">{error}</p>
        <button 
          onClick={() => {
            void fetchData();
          }} 
          className="mt-2 px-4 py-2 bg-red-100 text-red-600 rounded-lg hover:bg-red-200 transition-colors text-sm"
        >
          重新加载
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 审批记录时间线 - 默认展示 */}
      <div className={isGlass ? 'rounded-2xl border border-slate-200 bg-white p-4 shadow-sm' : 'rounded-xl bg-white p-4'}>
        <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4">审批记录</h4>
        {renderTimeline()}
      </div>

      {/* 流程图 - 可折叠 */}
      {graphModel && rootNodeId && (
        <div className={isGlass ? 'overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm' : 'overflow-hidden rounded-xl border border-slate-100'}>
          <button
            onClick={() => setDiagramExpanded(!diagramExpanded)}
            className={isGlass
              ? 'w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-white transition-colors text-xs font-medium text-slate-500'
              : 'w-full flex items-center justify-between px-4 py-2.5 bg-slate-50 hover:bg-slate-100 transition-colors text-xs font-medium text-slate-500'}
          >
            <span className="flex items-center gap-1.5">
              <GitMerge size={13} />
              流程图
            </span>
            {diagramExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          {diagramExpanded && (
            <div className={isGlass
              ? 'flex max-h-[400px] justify-center overflow-auto bg-slate-50/80 p-5'
              : 'flex max-h-[400px] justify-center overflow-auto bg-slate-50 p-6'}>
              {renderNode(rootNodeId)}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
