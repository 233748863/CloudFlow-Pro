import React, { useEffect, useState } from 'react';
import { 
  CheckCircle2, Circle, Clock, AlertCircle, 
  ArrowDown, GitBranch, GitMerge, User, Shield, 
  CreditCard, FileText, Briefcase 
} from 'lucide-react';
import { getProcessTrace, getProcessInstance, getProcessDefinitions, urgeTask } from '../services/api/workflow';
import { WorkflowDefinition, NodeType, WorkflowNode } from '../types';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';
import { BellRing } from 'lucide-react';

interface ProcessTraceProps {
  instanceId: string;
  onClose?: () => void;
}

interface TraceData {
  finished: string[];
  active: string[];
}
// ... NodeIcon component ...
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
    active: "bg-indigo-100 text-indigo-600 ring-2 ring-indigo-500 animate-pulse",
    pending: "bg-slate-100 text-slate-400 ring-2 ring-slate-200"
  };

  return (
    <div className={`${baseClasses} ${statusClasses[status]}`}>
      {getIcon()}
    </div>
  );
};

export const ProcessTrace = ({ instanceId, onClose }: ProcessTraceProps) => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [trace, setTrace] = useState<TraceData>({ finished: [], active: [] });
  const [rootNode, setRootNode] = useState<WorkflowNode | null>(null);
  const [instance, setInstance] = useState<any>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        // 1. Get Trace Status
        const traceRes = await getProcessTrace(instanceId);
        setTrace(traceRes as unknown as TraceData);

        // 2. Get Instance to find Def Key
        const instanceRes = await getProcessInstance(instanceId);
        setInstance(instanceRes);
        
        // 使用 workflowId 或 processDefKey 查找流程定义
        const defKey = (instanceRes as any)?.processDefKey || instanceRes?.workflowId;
        if (instanceRes && defKey) {
            // 3. Get Definition to get Model JSON
            const defs = await getProcessDefinitions();
            const def = (defs as any[]).find(d => 
              d.processKey === defKey || d.key === defKey || d.id === defKey
            );
            
            if (def && def.nodes) {
                setRootNode(def.nodes);
            } else if (def && def.modelJson) {
                setRootNode(JSON.parse(def.modelJson));
            } else {
                setError("流程定义模型缺失");
            }
        } else {
            setError("流程实例不存在");
        }
      } catch (e) {
        console.error(e);
        setError("加载流程追踪失败");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [instanceId]);

  const handleUrge = async (nodeId: string, nodeName: string) => {
      try {
          // 注意：当前后端 urgeTask API 需要 taskId，但 ProcessTrace 只返回 nodeKey
          // 这里我们使用 nodeId 作为 taskId 的临时方案
          // 理想情况下，后端应该提供 urgeByNodeKey API 或在 trace 中返回 taskId
          await urgeTask(nodeId, `催办节点: ${nodeName}`);
          toast.success(`已向 ${nodeName} 节点发送催办提醒`);
      } catch (err) {
          console.error('催办失败:', err);
          toast.error('催办失败，请稍后重试');
      }
  };

  // Recursive Renderer
  const renderNode = (node: WorkflowNode) => {
    if (!node) return null;

    const isFinished = trace.finished.includes(node.id);
    const isActive = trace.active.includes(node.id);
    const status = isActive ? 'active' : (isFinished ? 'finished' : 'pending');
    
    // Check if I am initiator
    const isInitiator = user && instance && String(instance.startUserId) === String(user.id);

    return (
      <div className="flex flex-col items-center">
        {/* Node Card */}
        <div className={`relative flex flex-col items-center group`}>
          <NodeIcon type={node.type} title={node.title} status={status} />
          
          <div className={`mt-2 px-3 py-1.5 rounded-lg border text-xs font-medium max-w-[120px] text-center transition-colors
             ${status === 'active' ? 'bg-indigo-50 border-indigo-200 text-indigo-700 shadow-sm' : 
               status === 'finished' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 
               'bg-white border-slate-200 text-slate-500'}
          `}>
            {node.title}
          </div>
          
          {/* Urge Button for Active Nodes */}
          {isActive && isInitiator && (
              <button 
                onClick={(e) => { e.stopPropagation(); handleUrge(node.id, node.title); }}
                className="absolute -right-8 top-0 bg-amber-100 text-amber-600 p-1 rounded-full hover:bg-amber-200 transition-colors"
                title="催办"
              >
                  <BellRing size={12}/>
              </button>
          )}

          {/* Tooltip for debug/details */}
          <div className="absolute left-full top-0 ml-2 hidden group-hover:block bg-black/80 text-white text-[10px] p-2 rounded w-32 z-50">
             ID: {node.id}<br/>
             Type: {node.type}
          </div>
        </div>


        {/* Branches (if any) */}
        {node.branches && node.branches.length > 0 && (
           <div className="flex flex-col items-center mt-4 w-full">
              {/* Split Line */}
              <div className="h-4 w-0.5 bg-slate-300 mb-2"></div>
              
              {/* Horizontal Connector */}
              <div className="flex justify-center items-start gap-8 relative">
                 {/* Top horizontal bar to connect branches */}
                 <div className="absolute top-0 left-0 right-0 h-0.5 bg-slate-300 mx-auto" style={{ width: `calc(100% - 4rem)` }}></div>
                 
                 {node.branches.map((branch, idx) => (
                    <div key={branch.id || idx} className="flex flex-col items-center pt-4 relative">
                       {/* Vertical line from horizontal bar to branch node */}
                       <div className="absolute top-0 w-0.5 h-4 bg-slate-300"></div>
                       {renderNode(branch)}
                    </div>
                 ))}
              </div>
           </div>
        )}

        {/* Next Node Arrow */}
        {node.next && (
           <div className="flex flex-col items-center">
             <div className={`h-8 w-0.5 ${trace.finished.includes(node.id) ? 'bg-emerald-300' : 'bg-slate-300'}`}></div>
             <ArrowDown size={14} className={`${trace.finished.includes(node.id) ? 'text-emerald-300' : 'text-slate-300'} -mt-1`} />
             <div className="h-4 w-0.5 bg-transparent"></div>
             {renderNode(node.next)}
           </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="p-10 flex flex-col items-center justify-center gap-3">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
        <p className="text-sm text-slate-500">加载流程轨迹中...</p>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="p-10 text-center flex flex-col items-center gap-3">
        <AlertCircle className="text-red-500" size={32} />
        <p className="text-red-500 font-medium">{error}</p>
        <button 
          onClick={() => window.location.reload()} 
          className="mt-2 px-4 py-2 bg-red-100 text-red-600 rounded-lg hover:bg-red-200 transition-colors text-sm"
        >
          重新加载
        </button>
      </div>
    );
  }

  return (
    <div className="bg-slate-50 p-8 rounded-xl overflow-auto min-h-[400px] flex justify-center custom-scrollbar">
       {rootNode ? renderNode(rootNode) : <div className="text-slate-400">空流程</div>}
    </div>
  );
};
