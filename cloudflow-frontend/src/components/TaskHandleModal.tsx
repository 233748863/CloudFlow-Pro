import React, { useState, useEffect } from 'react';
import { Task, TaskStatus, FormDefinition, User, Role, StepDetail } from '../types';
import { Briefcase, X, GitMerge, AlertTriangle, CornerUpLeft, Clock, CheckCircle2, XCircle, ArrowLeftCircle, UserPlus, UserMinus, Users, GitBranch, ChevronRight, Paperclip, FileText, Image as ImageIcon, Download, ExternalLink } from 'lucide-react';
import { DynamicFormViewer } from './DynamicFormViewer';
import { getUserList } from '../services/api/auth';
import { completeTask, readTask, rejectTask, getProcessTrace } from '../services/api/workflow';
import { mapBackendUserToFrontend } from '../utils/mappers';
import { ProcessTrace } from './ProcessTrace';
import { SignatureModal } from './SignatureModal';
import { toast } from 'sonner';
import {
  formatWorkflowFieldValue,
  getWorkflowFieldLabel,
  getWorkflowSummaryParts,
  isWorkflowHiddenField,
} from '../utils/workflowFormDisplay';

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
  const [editedFormData, setEditedFormData] = useState<Record<string, any>>({});
  const [modifiedAmount, setModifiedAmount] = useState<number | undefined>(task?.amount);
  const [delegationMode, setDelegationMode] = useState(false);
  const [delegateUser, setDelegateUser] = useState<string>('');
  const [users, setUsers] = useState<User[]>([]);
  const [hasTriedLoadUsers, setHasTriedLoadUsers] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'APPROVED' | 'REJECTED' | null>(null);
  const [rejectMode, setRejectMode] = useState(false);
  const [rejectTargetNode, setRejectTargetNode] = useState<string>('');
  const [rejectReason, setRejectReason] = useState('');
  const [historyNodes, setHistoryNodes] = useState<Array<{key: string, name: string}>>([]);
  // 标记历史节点是否已加载完成，区分"未加载"和"加载完成但为空"
  const [historyNodesLoaded, setHistoryNodesLoaded] = useState(false);
  // 加签/减签模态框状态
  const [signatureModalOpen, setSignatureModalOpen] = useState(false);
  const [signatureMode, setSignatureMode] = useState<'add' | 'reduce'>('add');

  useEffect(() => {
    if (isOpen && task && task.assigneeId === currentUser.id) {
        readTask(task.id).catch(console.error);
    }
  }, [isOpen, task, currentUser.id]);

  useEffect(() => {
      if (delegationMode && !hasTriedLoadUsers) {
          setHasTriedLoadUsers(true);
          getUserList().then(res => {
              if (Array.isArray(res)) {
                  setUsers(res.map(mapBackendUserToFrontend));
              }
          }).catch(err => {
              console.error('加载转办用户失败:', err);
              toast.error('加载可转办用户失败，请稍后重试');
          });
      }
  }, [delegationMode, hasTriedLoadUsers]);

  // 加载历史节点用于驳回
  useEffect(() => {
      // 使用 historyNodesLoaded 而非 historyNodes.length 判断是否已加载
      if (rejectMode && task && task.processInstanceId && !historyNodesLoaded) {
          getProcessTrace(task.processInstanceId).then(res => {
              if (res) {
                  let nodes: Array<{key: string, name: string}> = [];
                  
                  // 从已完成的历史节点中提取可驳回目标
                  if (res.historyDetails && Array.isArray(res.historyDetails)) {
                      nodes = res.historyDetails
                          .filter((h: any) => h.nodeKey && h.nodeName)
                          .map((h: any) => ({ key: h.nodeKey, name: h.nodeName }))
                          .filter((node: any, index: number, self: any[]) => 
                              // 去重
                              index === self.findIndex((n: any) => n.key === node.key)
                          );
                  }

                  setHistoryNodes(nodes);
              }
              // 无论结果如何，标记为已加载
              setHistoryNodesLoaded(true);
          }).catch(err => {
              console.error('加载历史节点失败:', err);
              toast.error('加载历史节点失败');
              setHistoryNodesLoaded(true);
          });
      }
  }, [rejectMode, task, historyNodesLoaded]);

  // 弹窗打开或任务切换时，重置所有子界面状态
  useEffect(() => {
      if (isOpen) {
          setActiveTab('handle');
          setDelegationMode(false);
          setDelegateUser('');
          setRejectMode(false);
          setRejectTargetNode('');
          setRejectReason('');
          setHistoryNodes([]);
          setHistoryNodesLoaded(false);
          setComment('');
          setConfirmAction(null);
          setHasTriedLoadUsers(false);
          setUsers([]);
          setEditedFormData(task?.formData ? { ...task.formData } : {});
      }
  }, [isOpen, task?.id, task?.formData]);

  if (!isOpen || !task) return null;

  // Determine if viewing only (not assignee)
  const isAssignee = task.assigneeId === currentUser.id || 
                     (task.assigneeRole && currentUser.role === task.assigneeRole) ||
                     currentUser.role === Role.ADMIN;
  
  const canAct = isAssignee && (task.status === TaskStatus.PENDING || task.status === TaskStatus.DELEGATED);

  const currentFormDef = task.type === 'DYNAMIC' && task.formId 
    ? availableForms.find(f => f.id === task.formId) 
    : null;

  const buildEditableVariables = (): Record<string, any> | undefined => {
    if (!(task.allowEdit && canAct && !viewOnly)) {
      return undefined;
    }

    const source = editedFormData || {};
    if (!currentFormDef || !Array.isArray(currentFormDef.fields) || currentFormDef.fields.length === 0) {
      return source;
    }

    // 仅提交表单定义中的字段，降低误传系统字段风险；保留 id/label 双键兼容历史数据
    const allowedKeys = new Set<string>();
    currentFormDef.fields.forEach((field) => {
      if (field.id) {
        allowedKeys.add(field.id);
      }
      if (field.label) {
        allowedKeys.add(field.label);
      }
    });

    const filtered = Object.fromEntries(
      Object.entries(source).filter(([key]) => allowedKeys.has(key)),
    );

    // 兼容老数据：若过滤后为空，回退原对象，避免误丢用户输入
    return Object.keys(filtered).length > 0 ? filtered : source;
  };

  const handleAction = async (action: 'APPROVED' | 'REJECTED' | 'DELEGATED') => {
    if (action === 'DELEGATED' && !delegateUser) {
      toast.error('请选择受托人');
      return;
    }
    
    setSubmitting(true);
    setConfirmAction(null);

    // 与后端 completeTask 对齐：仅支持 APPROVE/REJECT/DELEGATE 三类动作
    const apiAction = action === 'APPROVED'
      ? 'APPROVE'
      : action === 'REJECTED'
      ? 'REJECT'
      : 'DELEGATE';

    try {
      await completeTask({
        taskId: task.id, 
        action: apiAction,
        comment: comment || undefined,
        delegateUserId: action === 'DELEGATED' ? delegateUser : undefined,
        variables: buildEditableVariables(),
      });

      // Map to frontend status
      let newStatus = TaskStatus.APPROVED;
      if (action === 'REJECTED') newStatus = TaskStatus.REJECTED;
      if (action === 'DELEGATED') newStatus = TaskStatus.DELEGATED;

      const actionLabel = action === 'APPROVED' ? '同意' 
        : action === 'REJECTED' ? '拒绝' 
        : '转办';

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
    <>
      {/* 加签/减签模态框 */}
      <SignatureModal
        isOpen={signatureModalOpen}
        onClose={() => setSignatureModalOpen(false)}
        onSuccess={() => {
          setSignatureModalOpen(false);
          onComplete(task);
        }}
        taskId={task.id}
        mode={signatureMode}
        currentUser={currentUser}
      />

      {/* 主任务处理模态框 */}
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/32 p-4 animate-fade-in">
        <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_22px_44px_rgba(15,23,42,0.14)]">
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-5 py-4">
          <div className="flex items-center gap-4">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <Briefcase size={18} className="text-cyan-700"/>
                {delegationMode ? '选择转办受托人' : rejectMode ? '驳回任务' : `任务详情`}
              </h3>
              
              {!delegationMode && !rejectMode && (
                  <div className="flex bg-slate-200 rounded-lg p-1">
                      <button 
                        onClick={() => setActiveTab('handle')}
                        className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${activeTab === 'handle' ? 'bg-white text-cyan-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                      >
                          处理
                      </button>
                      <button 
                        onClick={() => setActiveTab('trace')}
                        className={`px-3 py-1 text-xs font-medium rounded-md transition-all flex items-center gap-1 ${activeTab === 'trace' ? 'bg-white text-cyan-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                      >
                          <GitMerge size={12}/> 审批记录
                      </button>
                  </div>
              )}
          </div>
          <button onClick={() => {
            // 如果在转办或驳回子界面，先返回详情而不是直接关闭弹窗
            if (delegationMode) {
              setDelegationMode(false);
              setDelegateUser('');
            } else if (rejectMode) {
              setRejectMode(false);
              setRejectTargetNode('');
              setRejectReason('');
            } else {
              onClose();
            }
          }}><X size={20} className="text-slate-400"/></button>
        </div>
        
        <div className="flex-1 space-y-4 overflow-y-auto p-5">
           {activeTab === 'trace' ? (
               <ProcessTrace instanceId={task.processInstanceId} />
           ) : (
               <>
                {/* 驳回模式时显示节点选择器 */}
                {rejectMode ? (
                    <div className="space-y-4">
                      <p className="text-sm text-amber-600 bg-amber-50 p-3 rounded-lg border border-amber-200">
                        选择驳回到哪个节点：
                      </p>
                      
                      {!historyNodesLoaded ? (
                        <div className="text-center text-slate-400 py-4">
                          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-cyan-600 mx-auto mb-2"></div>
                          加载历史节点中...
                        </div>
                      ) : historyNodes.length > 0 ? (
                        <>
                          <div className="space-y-2">
                            {historyNodes.map(node => (
                              <div 
                                key={node.key} 
                                onClick={() => setRejectTargetNode(node.key)} 
                                className={`p-3 border rounded-lg cursor-pointer transition-all flex items-center gap-3 ${
                                  rejectTargetNode === node.key 
                                    ? 'border-cyan-300 bg-cyan-50 shadow-sm' 
                                    : 'border-slate-200 hover:border-cyan-200 hover:bg-slate-50'
                                }`}
                              >
                                <CornerUpLeft size={16} className={rejectTargetNode === node.key ? 'text-cyan-600' : 'text-slate-400'} />
                                <span className={rejectTargetNode === node.key ? 'text-cyan-700 font-medium' : 'text-slate-700'}>
                                  {node.name}
                                </span>
                              </div>
                            ))}
                          </div>
                          
                          <div className="mt-4">
                            <label className="block text-sm font-medium text-slate-700 mb-2">
                              驳回原因 <span className="text-red-500">*</span>
                            </label>
                            <textarea 
                              className="w-full rounded-xl border border-slate-200 p-3 text-sm focus:border-cyan-400 focus:ring-2 focus:ring-cyan-200" 
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
                        </>
                      ) : (
                        <div className="space-y-3">
                          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
                            当前节点没有可驳回的历史节点。若需终止流程，请返回后使用“拒绝”操作。
                          </div>
                          <div className="flex justify-end pt-2 border-t">
                            <button
                              onClick={() => {
                                setRejectMode(false);
                                setRejectTargetNode('');
                                setRejectReason('');
                              }}
                              className="px-4 py-2 text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50"
                            >
                              返回
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                ) : delegationMode ? (
                    <div className="space-y-4">
                    <p className="text-sm text-amber-600 bg-amber-50 p-2 rounded">选择转办给谁：</p>
                    {users.filter(u => u.id !== currentUser.id).map(u => (
                        <div key={u.id} onClick={() => setDelegateUser(u.id)} className={`p-2 border rounded cursor-pointer flex items-center gap-2 ${delegateUser === u.id ? 'border-cyan-300 bg-cyan-50' : ''}`}>
                            <img src={u.avatar} className="w-6 h-6 rounded-full" alt=""/> <span>{u.name}</span>
                        </div>
                    ))}
                    <div className="flex justify-end gap-2 mt-4">
                        <button onClick={() => setDelegationMode(false)} className="px-3 py-1 text-slate-500">取消</button>
                        <button onClick={() => handleAction('DELEGATED')} className="rounded-xl bg-cyan-600 px-3 py-1 text-white hover:bg-cyan-700">确认</button>
                    </div>
                    </div>
                ) : (
                    <>
                    {/* 基本信息区域 - 完整展示任务数据 */}
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-sm space-y-3">
                        {/* 第一行：流程名称 + 状态 */}
                        <div className="flex justify-between items-center">
                            <h4 className="font-bold text-slate-800 text-base">{task.workflowName}</h4>
                            {(() => {
                                // 状态中文映射及样式
                                const statusMap: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
                                    [TaskStatus.PENDING]: { label: '待处理', color: 'bg-cyan-50 text-cyan-700 ring-cyan-500/20', icon: <Clock size={12} /> },
                                    [TaskStatus.APPROVED]: { label: '已通过', color: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20', icon: <CheckCircle2 size={12} /> },
                                    [TaskStatus.REJECTED]: { label: '已拒绝', color: 'bg-red-50 text-red-700 ring-red-600/20', icon: <XCircle size={12} /> },
                                    [TaskStatus.RETURNED]: { label: '已退回', color: 'bg-yellow-50 text-yellow-700 ring-yellow-600/20', icon: <ArrowLeftCircle size={12} /> },
                                    [TaskStatus.DELEGATED]: { label: '已转办', color: 'bg-purple-50 text-purple-700 ring-purple-600/20', icon: <UserPlus size={12} /> },
                                    [TaskStatus.TIMED_OUT]: { label: '已超时', color: 'bg-orange-50 text-orange-700 ring-orange-600/20', icon: <AlertTriangle size={12} /> },
                                };
                                const s = statusMap[task.status] || { label: task.status, color: 'bg-slate-50 text-slate-700 ring-slate-600/20', icon: null };
                                return (
                                    <span className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ring-1 ring-inset ${s.color}`}>
                                        {s.icon} {s.label}
                                    </span>
                                );
                            })()}
                        </div>

                        {/* 详细信息网格 */}
                        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                            <div className="flex items-center justify-between">
                                <span className="text-slate-500">申请人</span>
                                <span className="font-semibold text-slate-700">{task.applicantName}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-slate-500">当前节点</span>
                                <span className="font-semibold text-slate-700">{task.nodeName || task.currentNodeName || '-'}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-slate-500">当前处理人</span>
                                <span className="font-semibold text-slate-700">{task.assigneeName || task.assigneeId || '待认领'}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-slate-500">创建时间</span>
                                <span className="text-slate-600">{task.createdTime ? new Date(task.createdTime).toLocaleString() : '-'}</span>
                            </div>
                            {task.dueDate && (
                                <div className="flex items-center justify-between">
                                    <span className="text-slate-500">截止时间</span>
                                    <span className="text-orange-600 font-medium">{new Date(task.dueDate).toLocaleString()}</span>
                                </div>
                            )}
                        </div>

                        {/* 业务摘要 - 智能提取关键业务信息 */}
                        {(() => {
                            if (!task.formData || Object.keys(task.formData).length === 0) return null;
                            const fd = task.formData as Record<string, any>;
                            const parts = getWorkflowSummaryParts(fd, 3);
                            return parts.length > 0 ? (
                                <div className="text-xs text-slate-600 bg-white p-2 rounded border border-slate-200">
                                    <span className="text-slate-400">业务摘要: </span>{parts.join(' / ')}
                                </div>
                            ) : null;
                        })()}
                    </div>

                    {/* 流程进度信息 */}
                    {task.totalSteps && task.totalSteps > 0 && (
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                            {/* 步骤进度条 */}
                            <div className="flex items-center justify-between text-xs mb-1.5">
                                <span className="text-slate-500 font-medium">流程进度</span>
                                <span className="text-cyan-700 font-semibold">
                                    {task.currentStepIndex || '-'} / {task.totalSteps}
                                </span>
                            </div>
                            <div className="w-full bg-slate-200 rounded-full h-1.5 mb-3">
                                <div
                                    className="bg-cyan-500 h-1.5 rounded-full transition-all duration-500"
                                    style={{ width: `${task.currentStepIndex ? (task.currentStepIndex / task.totalSteps) * 100 : 0}%` }}
                                />
                            </div>

                            {/* 步骤节点详情 */}
                            {task.stepsDetail && task.stepsDetail.length > 0 ? (
                                <div className="flex items-start gap-0 overflow-x-auto pb-1 -mx-1 px-1">
                                    {task.stepsDetail.map((step: StepDetail, idx: number) => {
                                        const isCompleted = step.status === 'completed';
                                        const isActive = step.status === 'active';
                                        const dotClass = isCompleted
                                            ? 'bg-emerald-500 ring-emerald-100'
                                            : isActive
                                                ? 'bg-cyan-500 ring-cyan-100 animate-pulse'
                                                : 'bg-slate-300 ring-slate-100';
                                        const lineClass = isCompleted ? 'bg-emerald-400' : 'bg-slate-200';

                                        return (
                                            <div key={step.nodeKey + '-' + idx} className="flex items-start flex-shrink-0">
                                                <div className="flex flex-col items-center min-w-[56px] max-w-[72px]">
                                                    <div className={`w-3 h-3 rounded-full ring-2 ${dotClass} flex-shrink-0`} />
                                                    <span className={`text-[9px] mt-1 text-center leading-tight line-clamp-2 ${
                                                        isActive ? 'text-cyan-700 font-semibold' : isCompleted ? 'text-emerald-600' : 'text-slate-400'
                                                    }`} title={step.nodeTitle}>
                                                        {step.nodeTitle}
                                                    </span>
                                                    <span className={`text-[8px] mt-0.5 text-center leading-tight truncate max-w-full ${
                                                        isActive ? 'text-cyan-500' : isCompleted ? 'text-emerald-500' : 'text-slate-400'
                                                    }`}>
                                                        {isCompleted && step.operatorName ? step.operatorName : step.approverDescription}
                                                    </span>
                                                    {step.signType && (
                                                        <span className="flex items-center gap-0.5 text-[7px] text-amber-600 bg-amber-50 px-1 rounded mt-0.5">
                                                            <Users size={7} />
                                                            {step.signType === 'ALL' ? '全签' : step.signType === 'ANY' ? '或签' : step.signType === 'SEQUENTIAL' ? '顺序签' : `${step.passPercent}%`}
                                                        </span>
                                                    )}
                                                </div>
                                                {idx < task.stepsDetail!.length - 1 && (
                                                    <div className={`h-[2px] w-4 mt-[5px] flex-shrink-0 ${lineClass}`} />
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                /* 无 stepsDetail 时显示简单的上一步/当前/下一步 */
                                <div className="flex items-center text-[10px] text-slate-400 gap-1">
                                    {task.previousNodeName && (
                                        <span className="truncate max-w-[40%]" title={`上一步: ${task.previousNodeName}`}>
                                            {task.previousOperatorName || task.previousNodeName}
                                        </span>
                                    )}
                                    <ChevronRight size={10} className="text-slate-300 flex-shrink-0" />
                                    <span className="text-cyan-700 font-medium truncate max-w-[30%]">
                                        {task.nodeName || task.currentNodeName || '当前'}
                                    </span>
                                    {task.nextNodeName && (
                                        <>
                                            <ChevronRight size={10} className="text-slate-300 flex-shrink-0" />
                                            <span className="truncate max-w-[30%]">{task.nextNodeName}</span>
                                        </>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                    
                    {/* 表单数据展示 - 有表单定义时用 DynamicFormViewer，否则直接展示 formData */}
                    {task.formId && !currentFormDef && (
                        <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
                          未加载到该任务绑定的表单定义，已回退为原始业务字段展示。
                        </div>
                    )}
                    {currentFormDef && task.formData ? (
                        <div className="border border-slate-100 rounded-lg p-3">
                            <DynamicFormViewer 
                              formDef={currentFormDef} 
                              data={editedFormData}
                              allowEdit={Boolean(canAct && !viewOnly && task.allowEdit)}
                              onChange={(id, val) => setEditedFormData(prev => ({ ...prev, [id]: val }))}
                            />
                        </div>
                    ) : task.formData && Object.keys(task.formData).length > 0 && (
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                            <h4 className="text-xs font-bold text-slate-500 mb-3">业务数据</h4>
                            <div className="grid grid-cols-2 gap-3">
                                {Object.entries(task.formData)
                                    .filter(([key]) => {
                                        return !isWorkflowHiddenField(
                                          key,
                                          task.formData as Record<string, unknown>,
                                        );
                                    })
                                    .map(([key, value]) => {
                                        const formData = task.formData as Record<string, unknown>;
                                        const label = getWorkflowFieldLabel(key);
                                        const displayValue = formatWorkflowFieldValue(key, value, formData);
                                        
                                        return (
                                            <div key={key} className="bg-white p-2.5 rounded-lg border border-slate-100">
                                                <div className="text-[10px] text-slate-400 mb-1">{label}</div>
                                                <div className="text-sm font-medium text-slate-700 truncate" title={String(displayValue)}>
                                                    {displayValue}
                                                </div>
                                            </div>
                                        );
                                    })
                                }
                            </div>

                            {/* 附件展示区域 - 从 formData 中提取 attachmentUrl 渲染为可查看/下载的文件列表 */}
                            {(() => {
                                const fd = task.formData as Record<string, any>;
                                const attachmentUrl = fd?.attachmentUrl;
                                if (!attachmentUrl || typeof attachmentUrl !== 'string' || !attachmentUrl.trim()) return null;

                                // 解析附件列表（多个用逗号分隔）
                                const files = attachmentUrl.split(',').filter(Boolean).map(url => {
                                    const trimmed = url.trim();
                                    const name = decodeURIComponent(trimmed.split('/').pop() || '附件');
                                    const isImg = /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(trimmed);
                                    return { url: trimmed, name, isImg };
                                });

                                if (files.length === 0) return null;

                                return (
                                    <div className="mt-3 pt-3 border-t border-slate-100">
                                        <h5 className="text-xs font-bold text-slate-500 mb-2 flex items-center gap-1">
                                            <Paperclip size={12} />
                                            附件 ({files.length})
                                        </h5>
                                        <div className="space-y-1.5">
                                            {files.map((file, idx) => (
                                                <div key={idx} className="flex items-center gap-2 p-2 bg-white rounded-lg border border-slate-200 hover:border-cyan-200 transition-colors group">
                                                    {/* 文件图标 */}
                                                    {file.isImg ? (
                                                        <ImageIcon size={16} className="text-cyan-500 flex-shrink-0" />
                                                    ) : (
                                                        <FileText size={16} className="text-slate-500 flex-shrink-0" />
                                                    )}
                                                    {/* 文件名 */}
                                                    <span className="text-xs text-slate-700 truncate flex-1" title={file.name}>
                                                        {file.name}
                                                    </span>
                                                    {/* 操作按钮 */}
                                                    <div className="flex items-center gap-1 flex-shrink-0">
                                                        {/* 图片可预览（新窗口打开） */}
                                                        <a
                                                            href={file.url}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="p-1 text-slate-400 hover:text-cyan-600 transition-colors"
                                                            title={file.isImg ? '预览图片' : '查看文件'}
                                                            onClick={e => e.stopPropagation()}
                                                        >
                                                            <ExternalLink size={14} />
                                                        </a>
                                                        {/* 下载按钮 */}
                                                        <a
                                                            href={file.url}
                                                            download={file.name}
                                                            className="p-1 text-slate-400 hover:text-emerald-600 transition-colors"
                                                            title="下载"
                                                            onClick={e => e.stopPropagation()}
                                                        >
                                                            <Download size={14} />
                                                        </a>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                        {/* 图片缩略图预览 */}
                                        {files.some(f => f.isImg) && (
                                            <div className="flex flex-wrap gap-2 mt-2">
                                                {files.filter(f => f.isImg).map((file, idx) => (
                                                    <a
                                                        key={idx}
                                                        href={file.url}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="block w-16 h-16 rounded-lg overflow-hidden border border-slate-200 hover:border-cyan-300 hover:shadow-md transition-all"
                                                        title={file.name}
                                                    >
                                                        <img
                                                            src={file.url}
                                                            alt={file.name}
                                                            className="w-full h-full object-cover"
                                                            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                                        />
                                                    </a>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                );
                            })()}
                        </div>
                    )}

                    {/* 流转记录 */}
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
                            {/* P0-7: 根据 buttonPermissions 动态渲染按钮
                             * 为 null/undefined/空数组时显示所有默认按钮（向后兼容）
                             * 有值时仅显示权限列表中包含的按钮 */}
                            {(() => {
                              const bp = task.buttonPermissions;
                              // 无权限配置时显示所有按钮（向后兼容）
                              const showAll = !bp || bp.length === 0;
                              const hasBtn = (code: string) => showAll || bp!.includes(code);
                              return (
                                <>
                                  {/* 加签/减签按钮行 */}
                                  {hasBtn('ADD_SIGN') && (
                                    <div className="flex gap-2 mb-2">
                                      <button 
                                        onClick={() => { setSignatureMode('add'); setSignatureModalOpen(true); }} 
                                        disabled={submitting}
                                        className="flex-1 px-3 py-1.5 border border-cyan-200 text-cyan-700 rounded text-xs disabled:opacity-50 hover:bg-cyan-50 flex items-center justify-center gap-1"
                                        title="会签节点可动态增加审批人"
                                      >
                                        <UserPlus size={14} />
                                        加签
                                      </button>
                                      <button 
                                        onClick={() => { setSignatureMode('reduce'); setSignatureModalOpen(true); }} 
                                        disabled={submitting}
                                        className="flex-1 px-3 py-1.5 border border-amber-200 text-amber-600 rounded text-xs disabled:opacity-50 hover:bg-amber-50 flex items-center justify-center gap-1"
                                        title="会签节点可动态减少审批人"
                                      >
                                        <UserMinus size={14} />
                                        减签
                                      </button>
                                    </div>
                                  )}
                                  
                                  {/* 主要操作按钮行 */}
                                  <div className="flex gap-2 justify-end">
                                    {hasBtn('RETURN') && (
                                      <button onClick={() => setRejectMode(true)} disabled={submitting} className="px-3 py-1.5 border border-amber-200 text-amber-600 rounded text-xs disabled:opacity-50 hover:bg-amber-50 flex items-center gap-1">
                                        <CornerUpLeft size={14} />
                                        驳回
                                      </button>
                                    )}
                                    {hasBtn('DELEGATE') && (
                                      <button onClick={() => setDelegationMode(true)} disabled={submitting} className="px-3 py-1.5 border rounded text-xs disabled:opacity-50">转办</button>
                                    )}
                                    {hasBtn('REJECT') && (
                                      <button onClick={() => setConfirmAction('REJECTED')} disabled={submitting} className="px-3 py-1.5 border border-red-200 text-red-600 rounded text-xs disabled:opacity-50">拒绝</button>
                                    )}
                                    {hasBtn('APPROVE') && (
                                      <button onClick={() => setConfirmAction('APPROVED')} disabled={submitting} className="px-4 py-1.5 bg-cyan-600 text-white rounded text-xs shadow disabled:opacity-50 hover:bg-cyan-700">
                                        {submitting ? '处理中...' : '同意'}
                                      </button>
                                    )}
                                  </div>
                                </>
                              );
                            })()}

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
                                    className={`px-3 py-1 text-xs text-white rounded disabled:opacity-50 ${confirmAction === 'APPROVED' ? 'bg-cyan-600' : 'bg-red-600'}`}
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
    </>
  );
};
