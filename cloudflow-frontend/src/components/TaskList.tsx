import React, { useState } from 'react';
import { Clock, CheckCircle2, AlertTriangle, XCircle, ArrowLeftCircle, Edit3, UserPlus, RotateCcw, Ban, ChevronRight, Users, GitBranch, GitMerge } from 'lucide-react';
import { Task, TaskStatus, StepDetail } from '../types';
import { recallProcess } from '../services/api/workflow';
import { toast } from 'sonner';
import { getWorkflowSummaryParts } from '../utils/workflowFormDisplay';

interface TaskListProps {
  tasks: Task[];
  onTaskClick?: (task: Task) => void;
  showRecallButton?: boolean; // 是否显示撤回按钮（仅在"我的申请"页面显示）
  onRecallSuccess?: () => void; // 撤回成功后的回调
}

export const TaskList: React.FC<TaskListProps> = ({ tasks, onTaskClick, showRecallButton = false, onRecallSuccess }) => {
  const [recalling, setRecalling] = useState<string | null>(null);
  const [confirmRecall, setConfirmRecall] = useState<string | null>(null);

  const handleRecall = async (e: React.MouseEvent, task: Task) => {
    e.stopPropagation(); // 阻止触发任务点击事件
    
    if (!task.processInstanceId) {
      toast.error('无法获取流程实例ID');
      return;
    }

    setRecalling(task.id);
    try {
      await recallProcess(task.processInstanceId);
      toast.success('流程已撤回');
      setConfirmRecall(null);
      onRecallSuccess?.();
    } catch (err) {
      console.error('撤回失败:', err);
      toast.error(err instanceof Error ? err.message : '撤回失败，请重试');
    } finally {
      setRecalling(null);
    }
  };
  // 根据后端原始状态和前端映射状态生成 badge
  const getStatusBadge = (status: TaskStatus, task?: Task) => {
    // 优先根据后端原始状态区分"已撤回"和"已拒绝"
    if (task?.backendStatus === 'REVOKED') {
      return (
        <span className="flex items-center gap-1 bg-amber-50 text-amber-700 px-2 py-1 rounded-full text-xs font-medium ring-1 ring-inset ring-amber-600/20">
          <Ban size={12} />
          已撤回
        </span>
      );
    }
    
    switch (status) {
      case TaskStatus.PENDING:
        return (
          <span className="flex items-center gap-1 bg-cyan-50 text-cyan-700 px-2 py-1 rounded-full text-xs font-medium ring-1 ring-inset ring-cyan-600/20">
            <Clock size={12} />
            待处理
          </span>
        );
      case TaskStatus.APPROVED:
        return (
          <span className="flex items-center gap-1 bg-emerald-50 text-emerald-700 px-2 py-1 rounded-full text-xs font-medium ring-1 ring-inset ring-emerald-600/20">
            <CheckCircle2 size={12} />
            已通过
          </span>
        );
      case TaskStatus.REJECTED:
        return (
          <span className="flex items-center gap-1 bg-red-50 text-red-700 px-2 py-1 rounded-full text-xs font-medium ring-1 ring-inset ring-red-600/20">
            <XCircle size={12} />
            已拒绝
          </span>
        );
      case TaskStatus.TIMED_OUT:
        return (
          <span className="flex items-center gap-1 bg-orange-50 text-orange-700 px-2 py-1 rounded-full text-xs font-medium ring-1 ring-inset ring-orange-600/20">
            <AlertTriangle size={12} />
            已超时
          </span>
        );
      case TaskStatus.RETURNED:
        return (
          <span className="flex items-center gap-1 bg-yellow-50 text-yellow-700 px-2 py-1 rounded-full text-xs font-medium ring-1 ring-inset ring-yellow-600/20">
            <ArrowLeftCircle size={12} />
            已退回
          </span>
        );
       case TaskStatus.MODIFIED:
        return (
          <span className="flex items-center gap-1 bg-cyan-50 text-cyan-700 px-2 py-1 rounded-full text-xs font-medium ring-1 ring-inset ring-cyan-600/20">
            <Edit3 size={12} />
            已修改
          </span>
        );
       case TaskStatus.DELEGATED:
        return (
          <span className="flex items-center gap-1 bg-purple-50 text-purple-700 px-2 py-1 rounded-full text-xs font-medium ring-1 ring-inset ring-purple-600/20">
            <UserPlus size={12} />
            已转办
          </span>
        );
      default:
        return null;
    }
  };

  if (!tasks || tasks.length === 0) {
    return (
      <div className="text-center py-16 bg-slate-50 rounded-xl border border-dashed border-slate-200">
        <svg className="w-12 h-12 mx-auto text-slate-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
        <p className="text-slate-400 text-sm">暂无任务</p>
      </div>
    );
  }

  // 检查任务是否超时
  const isOverdue = (task: Task) => {
    if (!task.dueDate) return false;
    return new Date(task.dueDate) < new Date() && task.status === TaskStatus.PENDING;
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {tasks.map((task) => {
        const canRecall = showRecallButton && task.status === TaskStatus.PENDING;
        
        return (
        <div 
          key={task.id}
          onClick={() => onTaskClick?.(task)}
          className={`bg-white border rounded-xl p-5 hover:shadow-lg transition-all duration-300 cursor-pointer group relative overflow-hidden ${
            isOverdue(task) 
              ? 'border-red-300 hover:border-red-400 ring-1 ring-red-100' 
              : 'border-slate-200 hover:border-cyan-200'
          }`}
        >
          <div className="absolute top-0 right-0 w-16 h-16 bg-slate-50 rounded-bl-full -mr-8 -mt-8 transition-transform group-hover:scale-110"></div>
          
          <div className="flex justify-between items-start mb-3 relative z-10">
            <div>
                <h3 className="text-base font-bold text-slate-800 group-hover:text-cyan-700 transition-colors line-clamp-1" title={task.workflowName}>
                    {task.workflowName}
                </h3>
                <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-300"></span>
                    {task.nodeName}
                </p>
            </div>
            {getStatusBadge(task.status, task)}
          </div>
          
          <div className="space-y-2 mb-4 relative z-10 bg-slate-50/50 p-3 rounded-lg border border-slate-100">
            <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">当前处理:</span>
                <span className="text-slate-700 font-bold">{task.assigneeName || task.assigneeId || '待认领'}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">申请人:</span>
                <span className="text-slate-700">{task.applicantName}</span>
            </div>
            {/* 业务摘要 - 从 formData 中智能提取关键信息 */}
            {task.formData && Object.keys(task.formData).length > 0 && (() => {
                const fd = task.formData as Record<string, any>;
                const parts = getWorkflowSummaryParts(fd, 2);
                return parts.length > 0 ? (
                    <div className="text-[11px] text-slate-500 pt-1 border-t border-slate-100/80 truncate" title={parts.join(' / ')}>
                        {parts.join(' / ')}
                    </div>
                ) : null;
            })()}
          </div>

          {/* 流程步骤进度信息 */}
          {task.totalSteps && task.totalSteps > 0 && (
            <div className="mb-4 relative z-10">
              {/* 步骤进度条 */}
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="text-slate-500">流程进度</span>
                <span className="text-cyan-700 font-semibold">
                  {task.currentStepIndex || '-'} / {task.totalSteps}
                </span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-1.5 mb-2">
                <div
                  className="bg-cyan-500 h-1.5 rounded-full transition-all duration-500"
                  style={{ width: `${task.currentStepIndex ? (task.currentStepIndex / task.totalSteps) * 100 : 0}%` }}
                />
              </div>

              {/* 步骤节点详情（带审批人信息，支持并行/条件/会签） */}
              {task.stepsDetail && task.stepsDetail.length > 0 ? (
                <div className="flex items-start gap-0 overflow-x-auto pb-1 -mx-1 px-1">
                  {task.stepsDetail.map((step: StepDetail, idx: number) => {
                    // 并行/条件网关节点：渲染分支结构
                    if (step.nodeType === 'PARALLEL' || step.nodeType === 'CONDITION') {
                      return (
                        <React.Fragment key={step.nodeKey + '-' + idx}>
                          <div className="flex flex-col items-center flex-shrink-0">
                            {/* 网关图标 */}
                            <div className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 ${
                              step.status === 'completed' ? 'bg-emerald-100 text-emerald-600'
                                : step.status === 'active' ? 'bg-cyan-50 text-cyan-700'
                                : 'bg-slate-100 text-slate-400'
                            }`}>
                              {step.nodeType === 'PARALLEL' ? <GitBranch size={10} /> : <GitMerge size={10} />}
                            </div>
                            <span className={`text-[8px] mt-0.5 text-center leading-tight ${
                              step.status === 'active' ? 'text-cyan-700 font-semibold' : step.status === 'completed' ? 'text-emerald-600' : 'text-slate-400'
                            }`}>{step.nodeTitle}</span>
                            {/* 分支内容 */}
                            {step.branches && step.branches.length > 0 && (
                              <div className="flex flex-col gap-0.5 mt-0.5 border-l border-r border-dashed border-slate-200 px-1">
                                {step.branches.map((branch: StepDetail[], bIdx: number) => (
                                  <div key={bIdx} className="flex items-start gap-0">
                                    {branch.map((bStep: StepDetail, bsIdx: number) => {
                                      const bCompleted = bStep.status === 'completed';
                                      const bActive = bStep.status === 'active';
                                      const bDotClass = bCompleted ? 'bg-emerald-500 ring-emerald-100'
                                        : bActive ? 'bg-cyan-500 ring-cyan-50 animate-pulse' : 'bg-slate-300 ring-slate-100';
                                      const bLineClass = bCompleted ? 'bg-emerald-400' : 'bg-slate-200';
                                      return (
                                        <div key={bStep.nodeKey + '-' + bsIdx} className="flex items-start flex-shrink-0">
                                          <div className="flex flex-col items-center min-w-[48px] max-w-[64px]">
                                            <div className={`w-2.5 h-2.5 rounded-full ring-1 ${bDotClass} flex-shrink-0`} />
                                            <span className={`text-[8px] mt-0.5 text-center leading-tight line-clamp-1 ${
                                              bActive ? 'text-cyan-700 font-semibold' : bCompleted ? 'text-emerald-600' : 'text-slate-400'
                                            }`} title={bStep.nodeTitle}>{bStep.nodeTitle}</span>
                                            <span className={`text-[7px] text-center truncate max-w-full ${
                                              bActive ? 'text-cyan-500' : bCompleted ? 'text-emerald-500' : 'text-slate-400'
                                            }`}>{bCompleted && bStep.operatorName ? bStep.operatorName : bStep.approverDescription}</span>
                                            {/* 会签标识 */}
                                            {bStep.signType && (
                                              <span className="text-[6px] text-amber-500 bg-amber-50 px-1 rounded mt-0.5">
                                                {bStep.signType === 'ALL' ? '全签' : bStep.signType === 'ANY' ? '或签' : bStep.signType === 'SEQUENTIAL' ? '顺序签' : `${bStep.passPercent || 0}%`}
                                              </span>
                                            )}
                                          </div>
                                          {bsIdx < branch.length - 1 && (
                                            <div className={`h-[2px] w-3 mt-[4px] flex-shrink-0 ${bLineClass}`} />
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                          {/* 网关后的连接线 */}
                          {idx < task.stepsDetail!.length - 1 && (
                            <div className="h-[2px] w-4 mt-[7px] flex-shrink-0 bg-slate-200" />
                          )}
                        </React.Fragment>
                      );
                    }

                    // 普通审批/人工/发起节点
                    const isCompleted = step.status === 'completed';
                    const isActive = step.status === 'active';
                    const dotClass = isCompleted
                      ? 'bg-emerald-500 ring-emerald-100'
                      : isActive
                        ? 'bg-cyan-500 ring-cyan-50 animate-pulse'
                        : 'bg-slate-300 ring-slate-100';
                    const lineClass = isCompleted ? 'bg-emerald-400' : 'bg-slate-200';

                    return (
                      <div key={step.nodeKey + '-' + idx} className="flex items-start flex-shrink-0">
                        {/* 节点 */}
                        <div className="flex flex-col items-center min-w-[56px] max-w-[72px] group/step">
                          {/* 圆点 */}
                          <div className={`w-3 h-3 rounded-full ring-2 ${dotClass} flex-shrink-0`} />
                          {/* 节点标题 */}
                          <span className={`text-[9px] mt-1 text-center leading-tight line-clamp-2 ${
                            isActive ? 'text-cyan-700 font-semibold' : isCompleted ? 'text-emerald-600' : 'text-slate-400'
                          }`} title={step.nodeTitle}>
                            {step.nodeTitle}
                          </span>
                          {/* 审批人信息 */}
                          <span className={`text-[8px] mt-0.5 text-center leading-tight truncate max-w-full ${
                            isActive ? 'text-cyan-500' : isCompleted ? 'text-emerald-500' : 'text-slate-400'
                          }`} title={
                            isCompleted && step.operatorName
                              ? `实际处理: ${step.operatorName}`
                              : `${step.approverTypeLabel}: ${step.approverDescription}${
                                  step.approverUsers && step.approverUsers.length > 0
                                    ? ' (' + step.approverUsers.map(u => u.userName).join(', ') + ')'
                                    : ''
                                }`
                          }>
                            {isCompleted && step.operatorName
                              ? step.operatorName
                              : step.approverDescription}
                          </span>
                          {/* 会签标识 */}
                          {step.signType && (
                            <span className="flex items-center gap-0.5 text-[7px] text-amber-600 bg-amber-50 px-1 rounded mt-0.5" title={
                              step.signType === 'ALL' ? '会签-全部同意' : step.signType === 'ANY' ? '会签-任一同意' : step.signType === 'SEQUENTIAL' ? '顺序签署' : `会签-${step.passPercent || 0}%通过`
                            }>
                              <Users size={7} />
                              {step.signType === 'ALL' ? '全签' : step.signType === 'ANY' ? '或签' : step.signType === 'SEQUENTIAL' ? '顺序签' : `${step.passPercent}%`}
                            </span>
                          )}
                          {/* 多人审批标识（非会签时显示） */}
                          {!step.signType && step.approverUsers && step.approverUsers.length > 1 && (
                            <span className="flex items-center gap-0.5 text-[7px] text-slate-400 mt-0.5">
                              <Users size={8} />
                              {step.approverUsers.length}人
                            </span>
                          )}
                        </div>
                        {/* 连接线（最后一个节点不显示） */}
                        {idx < task.stepsDetail!.length - 1 && (
                          <div className={`h-[2px] w-4 mt-[5px] flex-shrink-0 ${lineClass}`} />
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                /* 回退：无 stepsDetail 时显示简单的上一步/下一步 */
                <div className="flex items-center text-[10px] text-slate-400 gap-1">
                  {task.previousNodeName && (
                    <span className="truncate max-w-[40%]" title={`上一步: ${task.previousNodeName}${task.previousOperatorName ? ' (' + task.previousOperatorName + ')' : ''}`}>
                      {task.previousOperatorName || task.previousNodeName}
                    </span>
                  )}
                  <ChevronRight size={10} className="text-slate-300 flex-shrink-0" />
                  <span className="text-cyan-700 font-medium truncate max-w-[30%]" title={task.nodeName || task.currentNodeName}>
                    {task.nodeName || task.currentNodeName || '当前'}
                  </span>
                  {task.nextNodeName && (
                    <>
                      <ChevronRight size={10} className="text-slate-300 flex-shrink-0" />
                      <span className="truncate max-w-[30%]" title={`下一步: ${task.nextNodeName}${task.nextAssigneeName ? ' (' + task.nextAssigneeName + ')' : ''}`}>
                        {task.nextNodeName}
                      </span>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="pt-3 border-t border-slate-100 flex justify-between items-center text-[10px] text-slate-400 font-medium">
            <span>创建: {new Date(task.createdTime).toLocaleDateString()}</span>
            {task.dueDate && (
                 <span className="text-orange-500 flex items-center gap-1 bg-orange-50 px-1.5 py-0.5 rounded">
                    <Clock size={10} />
                    截止: {new Date(task.dueDate).toLocaleDateString()}
                 </span>
            )}
          </div>

          {/* 撤回按钮 - 仅在"我的申请"页面且流程运行中时显示 */}
          {canRecall && (
            <div className="mt-3 pt-3 border-t border-slate-100">
              {confirmRecall === task.id ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-amber-600 flex-1">确认撤回此流程？</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmRecall(null);
                    }}
                    className="px-2 py-1 text-xs text-slate-500 border border-slate-200 rounded hover:bg-slate-50"
                  >
                    取消
                  </button>
                  <button
                    onClick={(e) => handleRecall(e, task)}
                    disabled={recalling === task.id}
                    className="px-2 py-1 text-xs text-white bg-red-600 rounded hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                  >
                    {recalling === task.id ? (
                      <>
                        <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></div>
                        撤回中...
                      </>
                    ) : (
                      <>
                        <RotateCcw size={12} />
                        确认
                      </>
                    )}
                  </button>
                </div>
              ) : (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setConfirmRecall(task.id);
                  }}
                  className="w-full px-3 py-1.5 text-xs text-amber-600 border border-amber-200 rounded-lg hover:bg-amber-50 transition-colors flex items-center justify-center gap-1"
                >
                  <RotateCcw size={12} />
                  撤回流程
                </button>
              )}
            </div>
          )}
        </div>
        );
      })}
    </div>
  );
};
