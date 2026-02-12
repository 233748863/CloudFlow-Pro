import React, { useState, useEffect } from 'react';
import { Task, TaskStatus, FormDefinition, User, Role } from '../types';
import { Briefcase, X, GitMerge, AlertTriangle, CornerUpLeft } from 'lucide-react';
import { DynamicFormViewer } from './DynamicFormViewer';
import { getUserList } from '../services/api/auth';
import { completeTask, readTask, rejectTask, getProcessTrace } from '../services/api/workflow';
import { mapBackendUserToFrontend } from '../utils/mappers';
import { ProcessTrace } from './ProcessTrace';
import { toast } from 'sonner';

export const TaskHandleModal = ({ 
  task, 
  isOpen, 
  onClose, 
  onComplete,
  availableForms,
  currentUser,
  viewOnly = false
}: { 
  task: Task | null, 
  isOpen: boolean, 
  onClose: () => void, 
  onComplete: (t: Task) => void,
  availableForms: FormDefinition[],
  currentUser: User,
  /** 只读模式（"我的申请"页面使用），隐藏审批操作按钮 */
  viewOnly?: boolean
}) => {
  const [activeTab, setActiveTab] = useState<'handle' | 'trace'>('handle');
  const [comment, setComment] = useState('');
  const [modifiedAmount, setModifiedAmount] = useState<number | undefined>(task?.amount);
  const [delegationMode, setDelegationMode] = useState(false);
  const [delegateUser, setDelegateUser] = useState<string>('');
  const [users, setUsers] = useState<User[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'APPROVED' | 'REJECTED' | null>(null);
  const [rejectMode, setRejectMode] = useState(false);
  const [rejectTargetNode, setRejectTargetNode] = useState<string>('');
  const [rejectReason, setRejectReason] = useState('');
  const [historyNodes, setHistoryNodes] = useState<Array<{key: string, name: string}>>([]);

  useEffect(() => {
    if (isOpen && task && task.assigneeId === currentUser.id) {
        readTask(task.id).catch(console.error);
    }
  }, [isOpen, task, currentUser.id]);

  useEffect(() => {
      if (delegationMode && users.length === 0) {
          getUserList().then(res => {
              if (Array.isArray(res)) {
                  setUsers(res.map(mapBackendUserToFrontend));
              }
          }).catch(console.error);
      }
  }, [delegationMode, users.length]);

  // 加载历史节点用于驳回
  useEffect(() => {
      if (rejectMode && task && task.processInstanceId && historyNodes.length === 0) {
          getProcessTrace(task.processInstanceId).then(res => {
              if (res && res.historyDetails && Array.isArray(res.historyDetails)) {
                  // 提取已完成的节点作为可驳回目标
                  const nodes = res.historyDetails
                      .filter((h: any) => h.nodeKey && h.nodeName)
                      .map((h: any) => ({ key: h.nodeKey, name: h.nodeName }))
                      .filter((node: any, index: number, self: any[]) => 
                          // 去重
                          index === self.findIndex((n: any) => n.key === node.key)
                      );
                  setHistoryNodes(nodes);
              }
          }).catch(err => {
              console.error('加载历史节点失败:', err);
              toast.error('加载历史节点失败');
          });
      }
  }, [rejectMode, task, historyNodes.length]);

  // Reset tab when task changes
  useEffect(() => {
      if (isOpen) {
          setActiveTab('handle');
          setRejectMode(false);
          setRejectTargetNode('');
          setRejectReason('');
          setHistoryNodes([]);
      }
  }, [isOpen, task?.id]);

  if (!isOpen || !task) return null;

  // Determine if viewing only (not assignee)
  const isAssignee = task.assigneeId === currentUser.id || 
                     (task.assigneeRole && currentUser.role === task.assigneeRole) ||
                     currentUser.role === Role.ADMIN;
  
  const canAct = isAssignee && (task.status === TaskStatus.PENDING || task.status === TaskStatus.DELEGATED);

  const currentFormDef = task.type === 'DYNAMIC' && task.formId 
    ? availableForms.find(f => f.id === task.formId) 
    : null;

  const handleAction = async (action: 'APPROVED' | 'REJECTED' | 'DELEGATED' | 'RETURNED' | 'REVOKE_DELEGATION') => {
    if (action === 'DELEGATED' && !delegateUser) {
      toast.error('请选择受托人');
      return;
    }
    
    setSubmitting(true);
    setConfirmAction(null);

    // Map action to API action type
    const apiAction = action === 'APPROVED' ? 'APPROVE' 
      : action === 'REJECTED' ? 'REJECT' 
      : action === 'DELEGATED' ? 'DELEGATE' 
      : 'RETURN';

    try {
      await completeTask({
        taskId: task.id, 
        action: apiAction,
        comment: comment || undefined,
        delegateUserId: action === 'DELEGATED' ? delegateUser : undefined,
      });

      // Map to frontend status
      let newStatus = TaskStatus.APPROVED;
      if (action === 'REJECTED') newStatus = TaskStatus.REJECTED;
      if (action === 'DELEGATED') newStatus = TaskStatus.DELEGATED;
      if (action === 'RETURNED') newStatus = TaskStatus.RETURNED;
      if (action === 'REVOKE_DELEGATION') newStatus = TaskStatus.PENDING;

      const actionLabel = action === 'APPROVED' ? '同意' 
        : action === 'REJECTED' ? '拒绝' 
        : action === 'DELEGATED' ? '转办' 
        : action === 'RETURNED' ? '退回' 
        : '撤回转办';

      const log = {
        operator: currentUser.name,
        action: actionLabel,
        comment: comment || '处理完毕',
        time: new Date().toLocaleString()
      };

      toast.success(`任务${actionLabel}成功`);

      onComplete({
        ...task,
        status: newStatus,
        assigneeId: action === 'DELEGATED' ? delegateUser : task.assigneeId, 
        logs: [...(task.logs || []), log as any]
      });
      
      onClose();
      setDelegationMode(false);
      setRejectMode(false);
      setComment('');
    } catch (err) {
      console.error('任务处理失败:', err);
      toast.error(err instanceof Error ? err.message : '任务处理失败，请重试');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (!rejectTargetNode) {
      toast.error('请选择驳回目标节点');
      return;
    }
    if (!rejectReason.trim()) {
      toast.error('请填写驳回原因');
      return;
    }

    setSubmitting(true);
    try {
      await rejectTask(task!.id, rejectTargetNode, rejectReason);
      
      const log = {
        operator: currentUser.name,
        action: '驳回',
        comment: rejectReason,
        time: new Date().toLocaleString()
      };

      toast.success('任务已驳回');
      
      onComplete({
        ...task!,
        status: TaskStatus.RETURNED,
        logs: [...(task!.logs || []), log as any]
      });
      
      onClose();
      setRejectMode(false);
      setRejectTargetNode('');
      setRejectReason('');
    } catch (err) {
      console.error('驳回失败:', err);
      toast.error(err instanceof Error ? err.message : '驳回失败，请重试');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <div className="flex items-center gap-4">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <Briefcase size={18} className="text-indigo-600"/>
                {delegationMode ? '选择转办受托人' : rejectMode ? '驳回任务' : `任务详情`}
              </h3>
              
              {!delegationMode && !rejectMode && (
                  <div className="flex bg-slate-200 rounded-lg p-1">
                      <button 
                        onClick={() => setActiveTab('handle')}
                        className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${activeTab === 'handle' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                      >
                          处理
                      </button>
                      <button 
                        onClick={() => setActiveTab('trace')}
                        className={`px-3 py-1 text-xs font-medium rounded-md transition-all flex items-center gap-1 ${activeTab === 'trace' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                      >
                          <GitMerge size={12}/> 流程图
                      </button>
                  </div>
              )}
          </div>
          <button onClick={onClose}><X size={20} className="text-slate-400"/></button>
        </div>
        
        <div className="p-6 space-y-4 overflow-y-auto custom-scrollbar flex-1">
           {activeTab === 'trace' ? (
               <ProcessTrace instanceId={task.processInstanceId} />
           ) : (
               <>
                {/* If reject mode, show node picker */}
                {rejectMode ? (
                    <div className="space-y-4">
                      <p className="text-sm text-amber-600 bg-amber-50 p-3 rounded-lg border border-amber-200">
                        选择驳回到哪个节点：
                      </p>
                      
                      {historyNodes.length === 0 ? (
                        <div className="text-center text-slate-400 py-4">
                          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600 mx-auto mb-2"></div>
                          加载历史节点中...
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {historyNodes.map(node => (
                            <div 
                              key={node.key} 
                              onClick={() => setRejectTargetNode(node.key)} 
                              className={`p-3 border rounded-lg cursor-pointer transition-all flex items-center gap-3 ${
                                rejectTargetNode === node.key 
                                  ? 'border-indigo-500 bg-indigo-50 shadow-sm' 
                                  : 'border-slate-200 hover:border-indigo-300 hover:bg-slate-50'
                              }`}
                            >
                              <CornerUpLeft size={16} className={rejectTargetNode === node.key ? 'text-indigo-600' : 'text-slate-400'} />
                              <span className={rejectTargetNode === node.key ? 'text-indigo-700 font-medium' : 'text-slate-700'}>
                                {node.name}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                      
                      <div className="mt-4">
                        <label className="block text-sm font-medium text-slate-700 mb-2">
                          驳回原因 <span className="text-red-500">*</span>
                        </label>
                        <textarea 
                          className="w-full p-3 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" 
                          placeholder="请填写驳回原因（必填）..."
                          rows={4}
                          value={rejectReason}
                          onChange={e => setRejectReason(e.target.value)}
                        />
                      </div>
                      
                      <div className="flex justify-end gap-2 mt-4 pt-4 border-t">
                        <button 
                          onClick={() => {
                            setRejectMode(false);
                            setRejectTargetNode('');
                            setRejectReason('');
                          }} 
                          disabled={submitting}
                          className="px-4 py-2 text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50"
                        >
                          取消
                        </button>
                        <button 
                          onClick={handleReject} 
                          disabled={submitting || !rejectTargetNode || !rejectReason.trim()}
                          className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {submitting ? '处理中...' : '确认驳回'}
                        </button>
                      </div>
                    </div>
                ) : delegationMode ? (
                    <div className="space-y-4">
                    <p className="text-sm text-amber-600 bg-amber-50 p-2 rounded">选择转办给谁：</p>
                    {users.filter(u => u.id !== currentUser.id).map(u => (
                        <div key={u.id} onClick={() => setDelegateUser(u.id)} className={`p-2 border rounded cursor-pointer flex items-center gap-2 ${delegateUser === u.id ? 'border-indigo-500 bg-indigo-50' : ''}`}>
                            <img src={u.avatar} className="w-6 h-6 rounded-full" alt=""/> <span>{u.name}</span>
                        </div>
                    ))}
                    <div className="flex justify-end gap-2 mt-4">
                        <button onClick={() => setDelegationMode(false)} className="px-3 py-1 text-slate-500">取消</button>
                        <button onClick={() => handleAction('DELEGATED')} className="px-3 py-1 bg-indigo-600 text-white rounded">确认</button>
                    </div>
                    </div>
                ) : (
                    <>
                    <div className="bg-blue-50 p-3 rounded border border-blue-100 text-sm grid grid-cols-2 gap-2">
                        <div>申请人: <b>{task.applicantName}</b></div>
                        <div>当前状态: <b>{task.status}</b></div>
                        <div className="col-span-2">业务摘要: {task.reason}</div>
                    </div>
                    
                    {currentFormDef && task.formData && (
                        <div className="border border-slate-100 rounded p-3">
                            <DynamicFormViewer formDef={currentFormDef} data={task.formData}/>
                        </div>
                    )}

                    {/* Logs */}
                    {task.logs && task.logs.length > 0 && (
                        <div className="mt-4 border-t pt-2">
                            <h4 className="text-xs font-bold text-slate-500 mb-2">流转记录</h4>
                            <div className="space-y-2">
                            {task.logs.map((log, i) => (
                                <div key={i} className="text-xs flex justify-between text-slate-600 bg-slate-50 p-2 rounded">
                                <span>{log.operator} {log.action}</span>
                                <span className="text-slate-400">{log.time}</span>
                                </div>
                            ))}
                            </div>
                        </div>
                    )}

                    {/* 操作区域 - 仅在非只读模式且为当前处理人时显示 */}
                    {canAct && !viewOnly && (
                        <div className="mt-4 pt-4 border-t">
                            <textarea 
                            className="w-full p-2 border rounded text-sm mb-2" 
                            placeholder="审批意见..."
                            value={comment}
                            onChange={e => setComment(e.target.value)}
                            />
                            <div className="flex gap-2 justify-end">
                            <button onClick={() => setRejectMode(true)} disabled={submitting} className="px-3 py-1.5 border border-amber-200 text-amber-600 rounded text-xs disabled:opacity-50 hover:bg-amber-50 flex items-center gap-1">
                              <CornerUpLeft size={14} />
                              驳回
                            </button>
                            <button onClick={() => setDelegationMode(true)} disabled={submitting} className="px-3 py-1.5 border rounded text-xs disabled:opacity-50">转办</button>
                            <button onClick={() => setConfirmAction('REJECTED')} disabled={submitting} className="px-3 py-1.5 border border-red-200 text-red-600 rounded text-xs disabled:opacity-50">拒绝</button>
                            <button onClick={() => setConfirmAction('APPROVED')} disabled={submitting} className="px-4 py-1.5 bg-indigo-600 text-white rounded text-xs shadow disabled:opacity-50">
                              {submitting ? '处理中...' : '同意'}
                            </button>
                            </div>

                            {/* 操作确认弹窗 */}
                            {confirmAction && (
                              <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                                <div className="flex items-center gap-2 text-amber-700 text-sm font-medium mb-2">
                                  <AlertTriangle size={16} />
                                  确认{confirmAction === 'APPROVED' ? '同意' : '拒绝'}此任务？
                                </div>
                                <div className="flex gap-2 justify-end">
                                  <button onClick={() => setConfirmAction(null)} className="px-3 py-1 text-xs text-slate-500 border rounded">取消</button>
                                  <button 
                                    onClick={() => handleAction(confirmAction)} 
                                    disabled={submitting}
                                    className={`px-3 py-1 text-xs text-white rounded disabled:opacity-50 ${confirmAction === 'APPROVED' ? 'bg-indigo-600' : 'bg-red-600'}`}
                                  >
                                    {submitting ? '处理中...' : '确认'}
                                  </button>
                                </div>
                              </div>
                            )}
                        </div>
                    )}
                    {!canAct && !viewOnly && task.status === TaskStatus.PENDING && (
                        <div className="text-center text-xs text-slate-400 italic mt-2">您没有权限处理此任务 (当前待办: {task.assigneeRole || '指定人员'})</div>
                    )}
                    </>
                )}
               </>
           )}
        </div>
      </div>
    </div>
  );
};
