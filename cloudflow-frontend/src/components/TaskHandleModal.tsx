import React, { useState, useEffect } from 'react';
import { Task, TaskStatus, FormDefinition, User, Role } from '../types';
import { Briefcase, X, GitMerge } from 'lucide-react';
import { DynamicFormViewer } from './DynamicFormViewer';
import { getUserList } from '../services/api/auth';
import { completeTask, readTask } from '../services/api/workflow';
import { mapBackendUserToFrontend } from '../utils/mappers';
import { ProcessTrace } from './ProcessTrace';

export const TaskHandleModal = ({ 
  task, 
  isOpen, 
  onClose, 
  onComplete,
  availableForms,
  currentUser
}: { 
  task: Task | null, 
  isOpen: boolean, 
  onClose: () => void, 
  onComplete: (t: Task) => void,
  availableForms: FormDefinition[],
  currentUser: User
}) => {
  const [activeTab, setActiveTab] = useState<'handle' | 'trace'>('handle');
  const [comment, setComment] = useState('');
  const [modifiedAmount, setModifiedAmount] = useState<number | undefined>(task?.amount);
  const [delegationMode, setDelegationMode] = useState(false);
  const [delegateUser, setDelegateUser] = useState<string>('');
  const [users, setUsers] = useState<User[]>([]);

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

  // Reset tab when task changes
  useEffect(() => {
      if (isOpen) {
          setActiveTab('handle');
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

  const handleAction = (action: 'APPROVED' | 'REJECTED' | 'DELEGATED' | 'RETURNED' | 'REVOKE_DELEGATION') => {
    if (action === 'DELEGATED' && !delegateUser) {
      alert("请选择受托人");
      return;
    }
    
    // Simple mock logic for next status
    let newStatus = TaskStatus.APPROVED;
    if (action === 'REJECTED') newStatus = TaskStatus.REJECTED;
    if (action === 'DELEGATED') newStatus = TaskStatus.DELEGATED;
    if (action === 'RETURNED') newStatus = TaskStatus.RETURNED;
    if (action === 'REVOKE_DELEGATION') newStatus = TaskStatus.PENDING;

    const log = {
      operator: currentUser.name,
      action: action === 'APPROVED' && modifiedAmount !== task.amount ? '修改金额' : (action === 'APPROVED' ? '同意' : (action === 'REJECTED' ? '拒绝' : '其他')),
      comment: comment || (action === 'DELEGATED' ? '转办任务' : '处理完毕'),
      time: new Date().toLocaleString()
    };

    // Call Backend API
    try {
       completeTask({
          taskId: task.id, 
          action: action === 'APPROVED' ? 'APPROVE' : 'REJECT',
          comment: comment,
          variables: { amount: modifiedAmount }
       }).then(() => {
         console.log("后端任务处理完成");
       }).catch(err => console.warn("后端任务处理失败 (使用模拟模式)", err));
    } catch(e) {}

    onComplete({
      ...task,
      status: newStatus,
      approvedAmount: modifiedAmount,
      assigneeId: action === 'DELEGATED' ? delegateUser : task.assigneeId, 
      logs: [...(task.logs || []), log as any]
    });
    
    onClose();
    setDelegationMode(false);
    setComment('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <div className="flex items-center gap-4">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <Briefcase size={18} className="text-indigo-600"/>
                {delegationMode ? '选择转办受托人' : `任务详情`}
              </h3>
              
              {!delegationMode && (
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
                {/* If delegation mode, show user picker */}
                {delegationMode ? (
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

                    {/* Action Area - Only if assignee */}
                    {canAct && (
                        <div className="mt-4 pt-4 border-t">
                            <textarea 
                            className="w-full p-2 border rounded text-sm mb-2" 
                            placeholder="审批意见..."
                            value={comment}
                            onChange={e => setComment(e.target.value)}
                            />
                            <div className="flex gap-2 justify-end">
                            <button onClick={() => setDelegationMode(true)} className="px-3 py-1.5 border rounded text-xs">转办</button>
                            <button onClick={() => handleAction('REJECTED')} className="px-3 py-1.5 border border-red-200 text-red-600 rounded text-xs">拒绝</button>
                            <button onClick={() => handleAction('APPROVED')} className="px-4 py-1.5 bg-indigo-600 text-white rounded text-xs shadow">同意</button>
                            </div>
                        </div>
                    )}
                    {!canAct && task.status === TaskStatus.PENDING && (
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
