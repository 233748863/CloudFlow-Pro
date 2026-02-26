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
                  
                  // 如果没有历史节点（第一个审批节点），添加"发起人"作为默认驳回目标
                  if (nodes.length === 0) {
                      nodes = [{ key: 'start', name: '发起人（重新提交）' }];
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
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <div className="flex items-center gap-4">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <Briefcase size={18} className="text-pink-500"/>
                {delegationMode ? '选择转办受托人' : rejectMode ? '驳回任务' : `任务详情`}
              </h3>
              
              {!delegationMode && !rejectMode && (
                  <div className="flex bg-slate-200 rounded-lg p-1">
                      <button 
                        onClick={() => setActiveTab('handle')}
                        className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${activeTab === 'handle' ? 'bg-white text-pink-500 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                      >
                          处理
                      </button>
                      <button 
                        onClick={() => setActiveTab('trace')}
                        className={`px-3 py-1 text-xs font-medium rounded-md transition-all flex items-center gap-1 ${activeTab === 'trace' ? 'bg-white text-pink-500 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
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
        
        <div className="p-6 space-y-4 overflow-y-auto flex-1">
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
                          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-pink-500 mx-auto mb-2"></div>
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
                                  ? 'border-pink-400 bg-pink-50 shadow-sm' 
                                  : 'border-slate-200 hover:border-pink-200 hover:bg-slate-50'
                              }`}
                            >
                              <CornerUpLeft size={16} className={rejectTargetNode === node.key ? 'text-pink-500' : 'text-slate-400'} />
                              <span className={rejectTargetNode === node.key ? 'text-pink-600 font-medium' : 'text-slate-700'}>
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
                          className="w-full p-3 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-pink-400 focus:border-pink-400" 
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
                        <div key={u.id} onClick={() => setDelegateUser(u.id)} className={`p-2 border rounded cursor-pointer flex items-center gap-2 ${delegateUser === u.id ? 'border-pink-400 bg-pink-50' : ''}`}>
                            <img src={u.avatar} className="w-6 h-6 rounded-full" alt=""/> <span>{u.name}</span>
                        </div>
                    ))}
                    <div className="flex justify-end gap-2 mt-4">
                        <button onClick={() => setDelegationMode(false)} className="px-3 py-1 text-slate-500">取消</button>
                        <button onClick={() => handleAction('DELEGATED')} className="px-3 py-1 bg-pink-500 text-white rounded">确认</button>
                    </div>
                    </div>
                ) : (
                    <>
                    {/* 基本信息区域 - 完整展示任务数据 */}
                    <div className="bg-pink-50 p-4 rounded-lg border border-pink-50 text-sm space-y-3">
                        {/* 第一行：流程名称 + 状态 */}
                        <div className="flex justify-between items-center">
                            <h4 className="font-bold text-slate-800 text-base">{task.workflowName}</h4>
                            {(() => {
                                // 状态中文映射及样式
                                const statusMap: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
                                    [TaskStatus.PENDING]: { label: '待处理', color: 'bg-pink-50 text-pink-600 ring-pink-500/20', icon: <Clock size={12} /> },
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
                            // 定义摘要优先提取的字段（按优先级排列，跳过 ID 类和系统字段）
                            const summaryKeys = [
                                'reason', 'description', 'destination', 'payeeName',
                                // 补卡/外勤
                                'appealType', 'appealDate', 'checkType', 'address',
                                // 请假
                                'leaveType', 'leaveDays',
                                // 加班
                                'overtimeType', 'compensateType', 'workLocation', 'overtimeHours',
                                // 出差
                                'departure', 'transportType', 'tripDays', 'estimatedCost', 'accommodation',
                                // 用车
                                'vehiclePlate', 'isRoundTrip', 'passengerCount',
                                // 报销/付款
                                'category', 'startTime', 'startDate', 'totalAmount', 'amount',
                            ];
                            const skipKeys = new Set(['formId', 'processDefKey', 'startUserId', 'tenantId', 'instanceId', 'userId', 'appealId', 'leaveId', 'overtimeId', 'tripId', 'claimId', 'paymentId', 'delFlag', 'createBy', 'updateBy', 'createTime', 'updateTime', 'status', 'attachmentUrl', 'id', 'vehicleId', 'applicantId', 'driverId']);
                            // 枚举翻译（复用）
                            const enumQuick: Record<string, Record<string, string>> = {
                                appealType: { MAKEUP: '补卡', FIELD: '外勤' },
                                checkType: { '1': '签到', '2': '签退' },
                                leaveType: { ANNUAL: '年假', SICK: '病假', PERSONAL: '事假', MATERNITY: '产假', MARRIAGE: '婚假', BEREAVEMENT: '丧假', OTHER: '其他' },
                                overtimeType: { WORKDAY: '工作日', WEEKEND: '周末', HOLIDAY: '节假日' },
                                compensateType: { SALARY: '加班费', LEAVE: '调休' },
                                workLocation: { OFFICE: '办公室', HOME: '居家', OTHER: '其他' },
                                transportType: { PLANE: '飞机', TRAIN: '火车', CAR: '自驾', OTHER: '其他' },
                                accommodation: { SELF: '自行安排', COMPANY: '公司安排', NONE: '无需住宿' },
                                isRoundTrip: { '0': '单程', '1': '往返' },
                                category: { TRANSPORT: '交通', MEAL: '餐饮', HOTEL: '住宿', OFFICE: '办公', OTHER: '其他' },
                            };
                            const parts: string[] = [];
                            for (const key of summaryKeys) {
                                if (parts.length >= 3) break;
                                const val = fd[key];
                                if (val === null || val === undefined || val === '') continue;
                                const translated = enumQuick[key]?.[String(val)] || String(val);
                                parts.push(translated);
                            }
                            // 如果优先字段没提取到，回退到非系统字段
                            if (parts.length === 0) {
                                for (const [k, v] of Object.entries(fd)) {
                                    if (parts.length >= 3) break;
                                    if (skipKeys.has(k) || v === null || v === undefined || v === '') continue;
                                    parts.push(String(v));
                                }
                            }
                            return parts.length > 0 ? (
                                <div className="text-xs text-slate-600 bg-white/60 p-2 rounded border border-pink-50/50">
                                    <span className="text-slate-400">业务摘要: </span>{parts.join(' / ')}
                                </div>
                            ) : null;
                        })()}
                    </div>

                    {/* 流程进度信息 */}
                    {task.totalSteps && task.totalSteps > 0 && (
                        <div className="border border-slate-100 rounded-lg p-3 bg-slate-50/50">
                            {/* 步骤进度条 */}
                            <div className="flex items-center justify-between text-xs mb-1.5">
                                <span className="text-slate-500 font-medium">流程进度</span>
                                <span className="text-pink-500 font-semibold">
                                    {task.currentStepIndex || '-'} / {task.totalSteps}
                                </span>
                            </div>
                            <div className="w-full bg-slate-200 rounded-full h-1.5 mb-3">
                                <div
                                    className="bg-pink-400 h-1.5 rounded-full transition-all duration-500"
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
                                                ? 'bg-pink-400 ring-pink-50 animate-pulse'
                                                : 'bg-slate-300 ring-slate-100';
                                        const lineClass = isCompleted ? 'bg-emerald-400' : 'bg-slate-200';

                                        return (
                                            <div key={step.nodeKey + '-' + idx} className="flex items-start flex-shrink-0">
                                                <div className="flex flex-col items-center min-w-[56px] max-w-[72px]">
                                                    <div className={`w-3 h-3 rounded-full ring-2 ${dotClass} flex-shrink-0`} />
                                                    <span className={`text-[9px] mt-1 text-center leading-tight line-clamp-2 ${
                                                        isActive ? 'text-pink-500 font-semibold' : isCompleted ? 'text-emerald-600' : 'text-slate-400'
                                                    }`} title={step.nodeTitle}>
                                                        {step.nodeTitle}
                                                    </span>
                                                    <span className={`text-[8px] mt-0.5 text-center leading-tight truncate max-w-full ${
                                                        isActive ? 'text-pink-400' : isCompleted ? 'text-emerald-500' : 'text-slate-400'
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
                                    <span className="text-pink-500 font-medium truncate max-w-[30%]">
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
                    {currentFormDef && task.formData ? (
                        <div className="border border-slate-100 rounded-lg p-3">
                            <DynamicFormViewer formDef={currentFormDef} data={task.formData}/>
                        </div>
                    ) : task.formData && Object.keys(task.formData).length > 0 && (
                        <div className="border border-slate-100 rounded-lg p-3 bg-slate-50/30">
                            <h4 className="text-xs font-bold text-slate-500 mb-3">业务数据</h4>
                            <div className="grid grid-cols-2 gap-3">
                                {Object.entries(task.formData)
                                    .filter(([key]) => {
                                        // 过滤掉系统内部字段和附件字段（附件单独渲染），只展示业务字段
                                        const systemKeys = ['formId', 'processDefKey', 'startUserId', 'tenantId', 'instanceId', 'attachmentUrl'];
                                        return !systemKeys.includes(key);
                                    })
                                    .map(([key, value]) => {
                                        // 字段名中文映射（常见业务字段）
                                        // OA 全模块业务字段中文映射
                                        const labelMap: Record<string, string> = {
                                            // 通用字段
                                            userName: '申请人',
                                            deptName: '部门',
                                            reason: '申请事由',
                                            description: '说明',
                                            remark: '备注',
                                            title: '标题',
                                            category: '类别',
                                            // 补卡/外勤
                                            appealNo: '申请单号',
                                            appealType: '申请类型',
                                            appealDate: '补卡日期',
                                            appealTime: '补卡时间',
                                            checkType: '打卡类型',
                                            originalRecordId: '原始考勤记录',
                                            originalStatus: '原始打卡状态',
                                            witnessName: '证明人',
                                            location: '外勤经纬度',
                                            address: '外勤地址',
                                            // 请假
                                            leaveNo: '请假单号',
                                            leaveType: '请假类型',
                                            leaveDays: '请假天数',
                                            startTime: '开始时间',
                                            endTime: '结束时间',
                                            startDate: '开始日期',
                                            endDate: '结束日期',
                                            // 加班
                                            overtimeNo: '加班单号',
                                            overtimeType: '加班类型',
                                            overtimeHours: '加班时长(小时)',
                                            compensateType: '补偿方式',
                                            workContent: '加班工作内容',
                                            expectedOutput: '预计产出/成果',
                                            needMeal: '是否需要用餐',
                                            workLocation: '加班地点',
                                            // 出差
                                            tripNo: '出差单号',
                                            departure: '出发地',
                                            destination: '目的地',
                                            tripDays: '出差天数',
                                            estimatedCost: '预计费用',
                                            transportType: '交通方式',
                                            accommodation: '住宿安排',
                                            contactPhone: '联系电话',
                                            emergencyContact: '紧急联系人',
                                            emergencyPhone: '紧急联系人电话',
                                            companions: '同行人员',
                                            itinerary: '行程安排',
                                            // 用车
                                            vehiclePlate: '车牌号',
                                            applicantName: '申请人',
                                            driverName: '驾驶员',
                                            returnLocation: '还车地点',
                                            isRoundTrip: '是否往返',
                                            passengerCount: '乘客人数',
                                            passengers: '乘客',
                                            startMileage: '出发里程',
                                            endMileage: '返回里程',
                                            actualStartTime: '实际出发时间',
                                            actualEndTime: '实际返回时间',
                                            // 报销
                                            claimNo: '报销单号',
                                            totalAmount: '总金额',
                                            expenseType: '费用类型',
                                            invoiceCount: '发票数量',
                                            // 付款
                                            paymentNo: '付款单号',
                                            paymentType: '付款类型',
                                            payeeName: '收款方名称',
                                            payeeAccount: '收款账号',
                                            payeeBank: '开户行',
                                            amount: '付款金额',
                                            contractNo: '合同编号',
                                            // 其他
                                            urgency: '紧急程度',
                                            projectName: '项目名称',
                                            days: '天数',
                                            department: '部门',
                                        };
                                        const label = labelMap[key] || key;

                                        // 枚举值中文翻译映射
                                        const enumMap: Record<string, Record<string, string>> = {
                                            appealType: { MAKEUP: '补卡', FIELD: '外勤' },
                                            checkType: { '1': '签到', '2': '签退' },
                                            originalStatus: { LATE: '迟到', EARLY: '早退', ABSENT: '缺卡', ABNORMAL: '异常' },
                                            leaveType: { ANNUAL: '年假', SICK: '病假', PERSONAL: '事假', MATERNITY: '产假', MARRIAGE: '婚假', BEREAVEMENT: '丧假', OTHER: '其他' },
                                            overtimeType: { WORKDAY: '工作日', WEEKEND: '周末', HOLIDAY: '节假日' },
                                            compensateType: { SALARY: '加班费', LEAVE: '调休' },
                                            needMeal: { '0': '否', '1': '是' },
                                            workLocation: { OFFICE: '办公室', HOME: '居家', OTHER: '其他' },
                                            transportType: { PLANE: '飞机', TRAIN: '火车', CAR: '自驾', OTHER: '其他' },
                                            accommodation: { SELF: '自行安排', COMPANY: '公司安排', NONE: '无需住宿' },
                                            isRoundTrip: { '0': '单程', '1': '往返' },
                                            paymentType: { TRANSFER: '转账', CHECK: '支票', CASH: '现金' },
                                            category: { TRANSPORT: '交通', MEAL: '餐饮', HOTEL: '住宿', OFFICE: '办公', OTHER: '其他' },
                                        };

                                        // 格式化显示值（优先翻译枚举）
                                        let displayValue: string;
                                        if (value === null || value === undefined) {
                                            displayValue = '-';
                                        } else if (enumMap[key] && enumMap[key][String(value)]) {
                                            displayValue = enumMap[key][String(value)];
                                        } else if (typeof value === 'number') {
                                            displayValue = value.toLocaleString();
                                        } else if (typeof value === 'boolean') {
                                            displayValue = value ? '是' : '否';
                                        } else {
                                            displayValue = String(value) || '-';
                                        }
                                        
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
                                                <div key={idx} className="flex items-center gap-2 p-2 bg-white rounded-lg border border-slate-200 hover:border-pink-200 transition-colors group">
                                                    {/* 文件图标 */}
                                                    {file.isImg ? (
                                                        <ImageIcon size={16} className="text-pink-400 flex-shrink-0" />
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
                                                            className="p-1 text-slate-400 hover:text-pink-500 transition-colors"
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
                                                        className="block w-16 h-16 rounded-lg overflow-hidden border border-slate-200 hover:border-pink-300 hover:shadow-md transition-all"
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
                                  <div className="flex gap-2 mb-2">
                                    <button 
                                      onClick={() => { setSignatureMode('add'); setSignatureModalOpen(true); }} 
                                      disabled={submitting}
                                      className="flex-1 px-3 py-1.5 border border-pink-100 text-pink-500 rounded text-xs disabled:opacity-50 hover:bg-pink-50 flex items-center justify-center gap-1"
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
                                      <button onClick={() => setConfirmAction('APPROVED')} disabled={submitting} className="px-4 py-1.5 bg-pink-500 text-white rounded text-xs shadow disabled:opacity-50">
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
                                    className={`px-3 py-1 text-xs text-white rounded disabled:opacity-50 ${confirmAction === 'APPROVED' ? 'bg-pink-500' : 'bg-red-600'}`}
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
