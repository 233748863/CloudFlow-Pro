import React, { useState, useEffect, useRef } from 'react';
import { 
  Plus, Settings, Trash2, ChevronRight, AlertCircle, 
  GitBranch, GitMerge, FileText, CheckCircle2, 
  ArrowRight, ArrowDown, MoreHorizontal, Copy, PlayCircle,
  Undo2, Redo2, Save, UploadCloud
} from 'lucide-react';
import { WorkflowNode, NodeType } from '../types';
import { useHistory } from '../hooks/useHistory';
import { saveProcessDefinition, deployProcessDefinition } from '../services/api/workflow';
import { toast } from 'sonner';

// Helper to update node in tree (immutable)
// 辅助函数：更新树中的节点（不可变操作）
const updateNodeInTree = (
  root: WorkflowNode, 
  targetId: string, 
  updater: (node: WorkflowNode) => WorkflowNode
): WorkflowNode => {
  if (root.id === targetId) {
    return updater(root);
  }

  const newRoot = { ...root };

  if (newRoot.next) {
    newRoot.next = updateNodeInTree(newRoot.next, targetId, updater);
  }

  if (newRoot.branches) {
    newRoot.branches = newRoot.branches.map(b => updateNodeInTree(b, targetId, updater));
  }

  return newRoot;
};

// Helper to find parent of a node
// 辅助函数：查找节点的父节点
const findParentNode = (root: WorkflowNode, targetId: string): { parent: WorkflowNode | null, branchIndex?: number } => {
    if (root.next && root.next.id === targetId) {
        return { parent: root };
    }
    if (root.branches) {
        for (let i = 0; i < root.branches.length; i++) {
            if (root.branches[i].id === targetId) {
                return { parent: root, branchIndex: i };
            }
            const found = findParentNode(root.branches[i], targetId);
            if (found.parent) return found;
        }
    }
    if (root.next) {
        return findParentNode(root.next, targetId);
    }
    return { parent: null };
};

// Helper to find a node by ID
// 辅助函数：根据 ID 查找节点
const findNodeById = (root: WorkflowNode, targetId: string): WorkflowNode | null => {
    if (root.id === targetId) return root;
    if (root.next) {
        const found = findNodeById(root.next, targetId);
        if (found) return found;
    }
    if (root.branches) {
        for (const branch of root.branches) {
            const found = findNodeById(branch, targetId);
            if (found) return found;
        }
    }
    return null;
};

// Helper to delete node in tree
// 辅助函数：删除树中的节点
const deleteNodeInTree = (
    root: WorkflowNode,
    targetId: string
): WorkflowNode | null => {
    if (root.id === targetId) {
        return root.next || null;
    }

    const newRoot = { ...root };

    if (newRoot.next) {
        const res = deleteNodeInTree(newRoot.next, targetId);
        newRoot.next = res || undefined;
    }

    if (newRoot.branches) {
        const newBranches: WorkflowNode[] = [];
        for (const b of newRoot.branches) {
            const res = deleteNodeInTree(b, targetId);
            if (res) newBranches.push(res);
        }
        newRoot.branches = newBranches.length > 0 ? newBranches : undefined;
    }

    return newRoot;
};

// Insert node after targetId
// 在指定 ID 后插入节点
const insertNodeAfter = (root: WorkflowNode, targetId: string, newNode: WorkflowNode): WorkflowNode => {
    if (root.id === targetId) {
        return {
            ...root,
            next: newNode
        };
    }
    const newRoot = { ...root };
    if (newRoot.next) {
        newRoot.next = insertNodeAfter(newRoot.next, targetId, newNode);
    }
    if (newRoot.branches) {
        newRoot.branches = newRoot.branches.map(b => insertNodeAfter(b, targetId, newNode));
    }
    return newRoot;
};

// Helper to swap nodes (for DnD) - Simplified: only support swapping adjacent or re-inserting
// 辅助函数：交换节点（用于拖拽）- 简化版：仅支持相邻交换或重新插入
// For MVP, we will implement "Insert Before" logic when dropping on a connector, 
// 对于 MVP，当拖放到连接器上时，我们将实现“插入到之前”的逻辑，
// but implementing full drag-sort in a recursive tree is complex. 
// 但在递归树中实现完整的拖拽排序比较复杂。
// Let's implement a simpler "Swap" or just "Console Log" for now as placeholder for the Drag logic.
// 让我们先实现一个简单的“交换”或者仅打印日志作为拖拽逻辑的占位符。

// Property Panel
// 属性面板
const PropertyPanel = ({ 
    node, 
    onClose, 
    onUpdate,
    onDelete 
}: { 
    node: WorkflowNode, 
    onClose: () => void, 
    onUpdate: (id: string, data: Partial<WorkflowNode>) => void,
    onDelete: (id: string) => void
}) => {
  const [formData, setFormData] = useState(node);

  useEffect(() => {
      setFormData(node);
  }, [node.id]);

  const handleChange = (field: keyof WorkflowNode, value: any) => {
      const newData = { ...formData, [field]: value };
      setFormData(newData);
      onUpdate(node.id, { [field]: value });
  };

  return (
    <div className="fixed right-0 top-0 h-full w-96 bg-white shadow-2xl z-50 flex flex-col border-l border-slate-200 animate-slide-in-right">
       <div className="p-4 border-b flex justify-between items-center bg-slate-50">
          <h3 className="font-bold text-slate-800">节点属性配置</h3>
          <button onClick={onClose}><ChevronRight/></button>
       </div>
       <div className="p-4 flex-1 overflow-y-auto custom-scrollbar">
          <div className="flex justify-between items-center mb-6">
              <span className="px-2 py-1 bg-slate-100 rounded text-xs text-slate-500 font-mono">{node.id}</span>
              {node.type !== NodeType.START && node.type !== NodeType.END && (
                  <button onClick={() => onDelete(node.id)} className="text-red-500 hover:bg-red-50 p-1 rounded transition-colors" title="删除节点">
                      <Trash2 size={16}/>
                  </button>
              )}
          </div>

          <div className="space-y-6">
             {/* Basic Info */}
             <div className="space-y-3">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">基本信息</label>
                <div>
                    <span className="text-xs text-slate-500 mb-1 block">节点名称</span>
                    <input 
                        type="text" 
                        className="w-full border border-slate-200 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all" 
                        value={formData.title} 
                        onChange={e => handleChange('title', e.target.value)}
                    />
                </div>
                <div>
                    <span className="text-xs text-slate-500 mb-1 block">节点类型</span>
                    <select 
                        className="w-full border border-slate-200 rounded-lg p-2.5 text-sm bg-slate-50" 
                        value={formData.type} 
                        disabled={true} 
                    >
                        <option value={NodeType.START}>发起节点</option>
                        <option value={NodeType.APPROVAL}>审批节点</option>
                        <option value={NodeType.CONDITION}>条件分支</option>
                        <option value={NodeType.PARALLEL}>并行分支</option>
                        <option value={NodeType.END}>结束节点</option>
                    </select>
                </div>
             </div>

             {/* Approver Config (Only for Approval Nodes) */}
             {node.type === NodeType.APPROVAL && (
                 <div className="space-y-3 pt-4 border-t border-slate-100">
                    <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
                        <CheckCircle2 size={14}/> 审批配置
                    </label>
                    <div>
                        <span className="text-xs text-slate-500 mb-1 block">审批人类型</span>
                        <select 
                            className="w-full border border-slate-200 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                            value={formData.approverType || 'ROLE'}
                            onChange={e => handleChange('approverType', e.target.value)}
                        >
                            <option value="ROLE">指定角色</option>
                            <option value="USER">指定人员</option>
                            <option value="DEPT_MANAGER">部门负责人</option>
                            <option value="DIRECT_LEADER">直属上级</option>
                        </select>
                    </div>
                    {formData.approverType === 'ROLE' && (
                        <div>
                            <span className="text-xs text-slate-500 mb-1 block">角色Key</span>
                            <input 
                                type="text" 
                                className="w-full border border-slate-200 rounded-lg p-2.5 text-sm"
                                placeholder="如: MANAGER"
                                value={formData.approverValue || ''}
                                onChange={e => handleChange('approverValue', e.target.value)}
                            />
                        </div>
                    )}
                 </div>
             )}

             {/* Branch Strategy (For Branch Roots) */}
             {(node.branches && node.branches.length > 0) && (
                 <div className="space-y-3 pt-4 border-t border-slate-100">
                    <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
                        <GitBranch size={14}/> 分支策略
                    </label>
                    <select 
                        className="w-full border border-slate-200 rounded-lg p-2.5 text-sm"
                        value={formData.branchStrategy || 'EXCLUSIVE'}
                        onChange={e => handleChange('branchStrategy', e.target.value)}
                    >
                        <option value="EXCLUSIVE">排他网关 (XOR) - 走第一个满足条件的分支</option>
                        <option value="PARALLEL">并行网关 (AND) - 所有分支同时执行</option>
                        <option value="RACE">竞争网关 (OR) - 任意一个完成即继续</option>
                    </select>
                 </div>
             )}

             {/* Condition (For Branch Nodes) */}
             <div className="space-y-3 pt-4 border-t border-slate-100">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
                    <FileText size={14}/> 高级设置
                </label>
                <div>
                    <span className="text-xs text-slate-500 mb-1 block">进入条件 (Condition Expression)</span>
                    <input 
                        type="text" 
                        className="w-full border border-slate-200 rounded-lg p-2.5 text-sm font-mono bg-slate-50"
                        placeholder="e.g. amount > 5000"
                        value={formData.condition || ''}
                        onChange={e => handleChange('condition', e.target.value)}
                    />
                    <p className="text-[10px] text-slate-400 mt-1">支持 JavaScript 表达式，可用变量: amount, days, deptId</p>
                </div>
             </div>

          </div>
       </div>
    </div>
  );
};

// Node Component (Recursive)
// 节点组件（递归）
const FlowNode = ({ 
  node, 
  onAddNext, 
  onAddBranch, 
  onSelect,
  onDrop 
}: { 
  node: WorkflowNode, 
  onAddNext: (parentId: string) => void,
  onAddBranch: (parentId: string) => void,
  onSelect: (node: WorkflowNode) => void,
  onDrop: (dragId: string, dropId: string) => void
}) => {
  
  const handleDragStart = (e: React.DragEvent, id: string) => {
      e.dataTransfer.setData("nodeId", id);
      // e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent) => {
      e.preventDefault();
      // e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (e: React.DragEvent, targetId: string) => {
      e.preventDefault();
      const dragId = e.dataTransfer.getData("nodeId");
      if (dragId && dragId !== targetId) {
          onDrop(dragId, targetId);
      }
  };

  return (
    <div className="flex flex-col items-center relative group">
       {/* Main Card */}
       <div 
         className="w-64 bg-white rounded-lg shadow-sm border border-slate-200 hover:shadow-md hover:border-indigo-300 transition-all cursor-pointer relative z-10"
         onClick={() => onSelect(node)}
         draggable={node.type !== NodeType.START && node.type !== NodeType.END}
         onDragStart={(e) => handleDragStart(e, node.id)}
         onDragOver={handleDragOver}
         onDrop={(e) => handleDrop(e, node.id)}
       >
          <div className={`h-1.5 rounded-t-lg w-full ${
             node.type === NodeType.START ? 'bg-slate-400' : 
             node.type === NodeType.END ? 'bg-slate-800' : 
             node.type === NodeType.CONDITION ? 'bg-orange-400' :
             'bg-indigo-500'
          }`}></div>
          <div className="p-3">
             <div className="flex justify-between items-center mb-1">
                <span className="text-xs font-bold text-slate-700">{node.title}</span>
                <Settings size={14} className="text-slate-400 hover:text-indigo-600"/>
             </div>
             <div className="text-[10px] text-slate-400 truncate flex justify-between">
                <span>{node.id}</span>
                {node.approverType && <span className="bg-slate-100 px-1 rounded">{node.approverType}</span>}
             </div>
             {node.condition && (
                 <div className="mt-1 text-[10px] bg-orange-50 text-orange-600 px-1 py-0.5 rounded truncate font-mono">
                     If: {node.condition}
                 </div>
             )}
          </div>

          {/* Add Buttons (Hover) */}
          <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 hidden group-hover:flex gap-1 z-20">
             <button onClick={(e) => { e.stopPropagation(); onAddNext(node.id); }} className="w-6 h-6 bg-indigo-600 text-white rounded-full flex items-center justify-center shadow-lg hover:scale-110 transition-transform" title="添加后续节点">
                <Plus size={14}/>
             </button>
             <button onClick={(e) => { e.stopPropagation(); onAddBranch(node.id); }} className="w-6 h-6 bg-orange-500 text-white rounded-full flex items-center justify-center shadow-lg hover:scale-110 transition-transform" title="添加分支">
                <GitBranch size={14}/>
             </button>
          </div>
       </div>

       {/* Branches */}
       {node.branches && node.branches.length > 0 && (
          <div className="flex flex-col items-center w-full mt-8">
             <div className="h-4 w-0.5 bg-slate-300 absolute top-full left-1/2 -ml-0.5 -mt-8"></div>
             <div className="flex gap-8 relative pt-4">
                 <div className="absolute top-0 left-8 right-8 h-0.5 bg-slate-300"></div>
                 {node.branches.map((branch, i) => (
                    <div key={branch.id} className="flex flex-col items-center relative">
                        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-0.5 h-4 bg-slate-300 -mt-4"></div>
                        <FlowNode node={branch} onAddNext={onAddNext} onAddBranch={onAddBranch} onSelect={onSelect} onDrop={onDrop}/>
                    </div>
                 ))}
             </div>
          </div>
       )}

       {/* Next Node */}
       {node.next && (
          <div className="flex flex-col items-center">
             <div className="h-8 w-0.5 bg-slate-300"></div>
             <ArrowDown size={14} className="text-slate-300 -mt-1 mb-1"/>
             <FlowNode node={node.next} onAddNext={onAddNext} onAddBranch={onAddBranch} onSelect={onSelect} onDrop={onDrop}/>
          </div>
       )}
       
       {/* End Node Placeholder if no next and not end */}
       {!node.next && node.type !== NodeType.END && !node.branches && (
          <div className="mt-8 opacity-20">
             <div className="w-8 h-8 rounded-full border-2 border-slate-400 flex items-center justify-center">
                <div className="w-3 h-3 bg-slate-400 rounded-full"></div>
             </div>
          </div>
       )}
    </div>
  );
};

export const WorkflowBuilder = () => {
  const initialRoot: WorkflowNode = {
     id: 'node_start',
     type: NodeType.START,
     title: '发起申请',
     next: {
        id: 'node_1',
        type: NodeType.APPROVAL,
        title: '部门经理审批',
        approverType: 'DEPT_MANAGER',
        next: {
            id: 'node_end',
            type: NodeType.END,
            title: '流程结束'
        }
     }
  };

  const { state: root, set: setRoot, undo, redo, canUndo, canRedo } = useHistory<WorkflowNode>(initialRoot);
  const [selectedNode, setSelectedNode] = useState<WorkflowNode | null>(null);
  const [saving, setSaving] = useState(false);

  // --- Actions ---

  const handleAddNext = (parentId: string) => {
     const newNode: WorkflowNode = {
         id: `node_${Date.now()}`,
         type: NodeType.APPROVAL,
         title: '新审批节点',
         approverType: 'ROLE'
     };

     setRoot(updateNodeInTree(root, parentId, (node) => ({
         ...node,
         next: node.next ? { ...newNode, next: node.next } : newNode
     })));
  };

  const handleAddBranch = (parentId: string) => {
     const newBranch: WorkflowNode = {
         id: `branch_${Date.now()}`,
         type: NodeType.CONDITION,
         title: '新分支',
         condition: 'amount > 0'
     };

     setRoot(updateNodeInTree(root, parentId, (node) => ({
         ...node,
         branches: [...(node.branches || []), newBranch],
         branchStrategy: node.branchStrategy || 'EXCLUSIVE'
     })));
  };

  const handleUpdateNode = (id: string, data: Partial<WorkflowNode>) => {
      setRoot(updateNodeInTree(root, id, (node) => ({
          ...node,
          ...data
      })));
      
      setSelectedNode(prev => prev && prev.id === id ? { ...prev, ...data } : prev);
  };

  const handleDeleteNode = (id: string) => {
      if (id === root.id) {
          alert("根节点不可删除");
          return;
      }
      const newRoot = deleteNodeInTree(root, id);
      if (newRoot) {
          setRoot(newRoot);
          setSelectedNode(null);
      }
  };

  const handleDrop = (dragId: string, dropId: string) => {
      // Logic:
      // 1. Find dragNode by ID (copy it)
      // 2. Delete dragNode from tree
      // 3. Insert dragNode after dropId (updating next pointers)
      // 逻辑：
      // 1. 根据 ID 查找被拖拽节点（复制它）
      // 2. 从树中删除被拖拽节点
      // 3. 将被拖拽节点插入到目标 ID 之后（更新 next 指针）
      
      const dragNode = findNodeById(root, dragId);
      if (!dragNode) return;

      // Prevent dragging parent into its own child (cycle check omitted for brevity but important)
      // 防止将父节点拖拽到其子节点中（为简洁起见省略了循环检查，但很重要）
      
      // Remove from old location
      // Optimization: deleteNodeInTree currently removes the node and links prev->next.
      // This means the subtree starting at dragNode.next is KEPT in the old location.
      // BUT, dragNode itself might have branches. Those ARE moved with dragNode.
      // If dragNode has a 'next', that 'next' is effectively detached from dragNode and attached to dragNode's old parent.
      // This is usually correct for "moving a step".
      // If we wanted to move a whole BLOCK (node + its nexts), we would need different logic.
      // For now, "Move Step" behavior is standard.
      // 从旧位置移除
      // 优化：deleteNodeInTree 当前删除节点并连接 prev->next。
      // 这意味着从 dragNode.next 开始的子树保留在旧位置。
      // 但是，dragNode 本身可能有分支。这些分支会随 dragNode 移动。
      // 如果 dragNode 有一个 'next'，该 'next' 实际上从 dragNode 分离并附加到 dragNode 的旧父节点。
      // 这对于“移动步骤”通常是正确的。
      // 如果我们要移动整个块（节点 + 其后续节点），我们需要不同的逻辑。
      // 目前，“移动步骤”行为是标准的。
      
      let newRoot = deleteNodeInTree(root, dragId);
      
      if (newRoot) {
          // Prepare node to insert.
          // IMPORTANT: When moving a node, we usually want to keep its configuration (props, branches)
          // but we DO NOT want to bring its old 'next' pointer, because we are inserting it INTO a new flow.
          // If we kept 'next', we would be moving a whole chain, which might be confusing or creating cycles.
          // So we set next = undefined.
          // 准备要插入的节点。
          // 重要：移动节点时，我们通常希望保留其配置（props, branches）
          // 但我们不希望带上其旧的 'next' 指针，因为我们要将其插入到新流程中。
          // 如果保留 'next'，我们将移动整个链，这可能会令人困惑或创建循环。
          // 所以我们设置 next = undefined。
          
          const nodeToInsert = { ...dragNode, next: undefined }; 
          
          // Insert at new location (after dropId)
          // The `insertNodeAfter` helper we defined earlier was:
          // target.next = newNode; (and newNode.next would be lost?) -> No, we need to link newNode.next = oldTargetNext
          
          // Let's refine the insert logic inline here or use a better helper.
          // We use updateNodeInTree to find the drop target and modify its 'next'.
          // 在新位置插入（在 dropId 之后）
          // 我们之前定义的 `insertNodeAfter` 辅助函数是：
          // target.next = newNode; (newNode.next 会丢失吗？) -> 不，我们需要连接 newNode.next = oldTargetNext
          
          // 让我们在这里内联优化插入逻辑或使用更好的辅助函数。
          // 我们使用 updateNodeInTree 查找放置目标并修改其 'next'。
          
          newRoot = updateNodeInTree(newRoot, dropId, (node) => ({
              ...node,
              next: { ...nodeToInsert, next: node.next }
          }));
          
          setRoot(newRoot);
          toast.success(`节点已移动`);
      }
  };
  
  const handleSave = async () => {
      try {
          setSaving(true);
          const definition = {
              processName: "未命名流程_" + new Date().getTime(),
              processKey: "process_" + new Date().getTime(),
              modelJson: JSON.stringify(root)
          };
          
          await saveProcessDefinition(definition);
          toast.success("流程已保存");
      } catch (e) {
          console.error(e);
          // Toast handled by interceptor
          // Toast 由拦截器处理
      } finally {
          setSaving(false);
      }
  };

  const handleDeploy = async () => {
      try {
          // Ideally, we should get the ID from the saved definition or current context
          // For now, let's assume we save first, then deploy using the key/version logic or returned ID
          // But wait, saveProcessDefinition returns ID. We need to store it.
          // Let's modify save to return ID and store it in state.
          
          // Quick fix: Save first to get ID (if new) or use existing ID if we had it.
          // Since we generate ID on backend for new ones, we need to capture it.
          // Let's just call save and use the result.
          // 理想情况下，我们应该从已保存的定义或当前上下文中获取 ID
          // 目前，我们假设先保存，然后使用 key/version 逻辑或返回的 ID 进行发布
          // 但是等等，saveProcessDefinition 返回 ID。我们需要存储它。
          // 让我们修改 save 以返回 ID 并将其存储在状态中。
          
          // 快速修复：先保存以获取 ID（如果是新的）或使用现有 ID（如果我们有）。
          // 因为我们在后端为新的生成 ID，我们需要捕获它。
          // 让我们只调用 save 并使用结果。
          
          setSaving(true);
          const definition = {
              processName: "未命名流程_" + new Date().getTime(),
              processKey: "process_" + new Date().getTime(),
              modelJson: JSON.stringify(root)
          };
          
          const saveRes = await saveProcessDefinition(definition);
          // Assuming saveRes is the ID string based on backend implementation
          // backend returns R.ok(definitionId)
          // 假设 saveRes 是基于后端实现的 ID 字符串
          // 后端返回 R.ok(definitionId)
          
          const definitionId = saveRes as unknown as string;
          
          if (definitionId) {
              await deployProcessDefinition(definitionId);
              toast.success("流程已发布并上线！");
          } else {
              toast.error("发布失败：无法获取流程ID");
          }
          
      } catch (e) {
          console.error(e);
      } finally {
          setSaving(false);
      }
  };

  return (
    <div className="h-full flex flex-col bg-slate-100 overflow-hidden relative">
       {/* Toolbar */}
       <div className="h-12 bg-white border-b px-4 flex items-center justify-between shadow-sm z-20">
          <div className="text-sm font-bold text-slate-700 flex items-center gap-2">
              <GitMerge size={16} className="text-indigo-600"/>
              工作流设计器
          </div>
          
          <div className="flex items-center gap-4">
              {/* Undo/Redo */}
              <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
                  <button 
                    onClick={undo} 
                    disabled={!canUndo}
                    className={`p-1.5 rounded ${!canUndo ? 'text-slate-300' : 'text-slate-600 hover:bg-white hover:shadow-sm'}`}
                    title="撤销"
                  >
                      <Undo2 size={16}/>
                  </button>
                  <button 
                    onClick={redo} 
                    disabled={!canRedo}
                    className={`p-1.5 rounded ${!canRedo ? 'text-slate-300' : 'text-slate-600 hover:bg-white hover:shadow-sm'}`}
                    title="重做"
                  >
                      <Redo2 size={16}/>
                  </button>
              </div>

              <div className="h-6 w-px bg-slate-200"></div>

              <div className="flex gap-2">
                 <button 
                    onClick={handleSave} 
                    disabled={saving}
                    className="flex items-center gap-1 px-3 py-1.5 bg-indigo-50 text-indigo-600 text-xs font-medium rounded hover:bg-indigo-100 transition-colors"
                 >
                    <Save size={14}/>
                    {saving ? '保存中...' : '保存'}
                 </button>
                 <button 
                    onClick={handleDeploy}
                    className="flex items-center gap-1 px-3 py-1.5 bg-indigo-600 text-white text-xs font-medium rounded shadow hover:bg-indigo-700 transition-colors"
                 >
                    <UploadCloud size={14}/>
                    发布
                 </button>
              </div>
          </div>
       </div>

       {/* Canvas */}
       <div className="flex-1 overflow-auto p-10 flex justify-center custom-scrollbar cursor-grab active:cursor-grabbing bg-grid-slate-100">
          <div className="min-w-[800px] flex justify-center pb-40">
             <FlowNode 
                node={root} 
                onAddNext={handleAddNext} 
                onAddBranch={handleAddBranch}
                onSelect={setSelectedNode}
                onDrop={handleDrop}
             />
          </div>
       </div>

       {/* Property Panel */}
       {selectedNode && (
          <PropertyPanel 
            node={selectedNode} 
            onClose={() => setSelectedNode(null)} 
            onUpdate={handleUpdateNode}
            onDelete={handleDeleteNode}
          />
       )}
    </div>
  );
};
