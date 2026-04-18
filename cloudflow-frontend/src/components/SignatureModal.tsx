import React, { useState, useEffect } from 'react';
import { X, UserPlus, UserMinus, AlertTriangle } from 'lucide-react';
import { getUserList } from '../services/api/auth';
import { addSignature, reductionSignature } from '../services/api/workflow';
import { mapBackendUserToFrontend } from '../utils/mappers';
import { User } from '../types';
import { toast } from 'sonner';

interface SignatureModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  taskId: string;
  mode: 'add' | 'reduce';
  currentUser: User;
}

/**
 * 加签/减签模态框组件
 * 用于会签节点动态增加或减少审批人
 */
export const SignatureModal: React.FC<SignatureModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  taskId,
  mode,
  currentUser
}) => {
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<number[]>([]);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState('');

  // 加载用户列表
  useEffect(() => {
    if (isOpen && users.length === 0) {
      getUserList().then(res => {
        if (Array.isArray(res)) {
          setUsers(res.map(mapBackendUserToFrontend));
        }
      }).catch(err => {
        console.error('加载用户列表失败:', err);
        toast.error('加载用户列表失败');
      });
    }
  }, [isOpen, users.length]);

  // 重置状态
  useEffect(() => {
    if (isOpen) {
      setSelectedUserIds([]);
      setComment('');
      setSearchKeyword('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async () => {
    if (selectedUserIds.length === 0) {
      toast.error(`请选择要${mode === 'add' ? '加签' : '减签'}的人员`);
      return;
    }
    if (!comment.trim()) {
      toast.error(`请填写${mode === 'add' ? '加签' : '减签'}说明`);
      return;
    }

    setSubmitting(true);
    try {
      if (mode === 'add') {
        await addSignature(taskId, selectedUserIds, comment);
        toast.success('加签成功');
      } else {
        await reductionSignature(taskId, selectedUserIds, comment);
        toast.success('减签成功');
      }
      onSuccess();
      onClose();
    } catch (err) {
      console.error(`${mode === 'add' ? '加签' : '减签'}失败:`, err);
      toast.error(err instanceof Error ? err.message : `${mode === 'add' ? '加签' : '减签'}失败`);
    } finally {
      setSubmitting(false);
    }
  };

  const toggleUser = (userId: number) => {
    setSelectedUserIds(prev => 
      prev.includes(userId) 
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  };

  // 过滤用户列表
  const filteredUsers = users.filter(u => {
    // 加签时排除当前用户
    if (mode === 'add' && u.id === currentUser.id) return false;
    // 搜索过滤
    if (searchKeyword) {
      const keyword = searchKeyword.toLowerCase();
      return u.name.toLowerCase().includes(keyword) || 
             (u.username && u.username.toLowerCase().includes(keyword));
    }
    return true;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/32 p-4 animate-fade-in">
      <div className="flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
        {/* 标题栏 */}
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <h3 className="font-bold text-slate-800 flex items-center gap-2">
            {mode === 'add' ? (
              <>
                <UserPlus size={18} className="text-cyan-700" />
                加签
              </>
            ) : (
              <>
                <UserMinus size={18} className="text-amber-600" />
                减签
              </>
            )}
          </h3>
          <button onClick={onClose} disabled={submitting} className="rounded-xl border border-slate-200 bg-white p-2 text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-700 disabled:opacity-50">
            <X size={20} />
          </button>
        </div>

        {/* 内容区域 */}
        <div className="p-6 space-y-4 overflow-y-auto flex-1">
          {/* 提示信息 */}
          <div className={`text-sm p-3 rounded-lg border ${
            mode === 'add' 
              ? 'border-cyan-200 bg-cyan-50 text-cyan-700' 
              : 'text-amber-700 bg-amber-50 border-amber-200'
          }`}>
            <div className="flex items-start gap-2">
              <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
              <div>
                {mode === 'add' ? (
                  <>
                    <p className="font-medium mb-1">加签说明：</p>
                    <ul className="text-xs space-y-0.5 list-disc list-inside">
                      <li>仅支持会签节点</li>
                      <li>只有任务处理人可以加签</li>
                      <li>新增的审批人将参与会签投票</li>
                    </ul>
                  </>
                ) : (
                  <>
                    <p className="font-medium mb-1">减签说明：</p>
                    <ul className="text-xs space-y-0.5 list-disc list-inside">
                      <li>仅支持会签节点</li>
                      <li>任务处理人或管理员可以减签</li>
                      <li>不能减签自己</li>
                      <li>已投票的人员不可减签</li>
                      <li>至少保留1人</li>
                    </ul>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* 搜索框 */}
          <div>
            <input
              type="text"
              placeholder="搜索用户姓名或账号..."
              value={searchKeyword}
              onChange={e => setSearchKeyword(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-cyan-400 focus:ring-2 focus:ring-cyan-200"
            />
          </div>

          {/* 用户列表 */}
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {filteredUsers.length === 0 ? (
              <div className="text-center text-slate-400 py-8 text-sm">
                {searchKeyword ? '未找到匹配的用户' : '暂无可选用户'}
              </div>
            ) : (
              filteredUsers.map(u => (
                <div
                  key={u.id}
                  onClick={() => toggleUser(Number(u.id))}
                  className={`p-3 border rounded-lg cursor-pointer transition-all flex items-center gap-3 ${
                    selectedUserIds.includes(Number(u.id))
                      ? 'border-cyan-300 bg-cyan-50 shadow-sm'
                      : 'border-slate-200 hover:border-cyan-200 hover:bg-slate-50'
                  }`}
                >
                  <img 
                    src={u.avatar} 
                    className="w-8 h-8 rounded-full flex-shrink-0" 
                    alt={u.name}
                  />
                  <div className="flex-1 min-w-0">
                    <div className={`font-medium truncate ${
                      selectedUserIds.includes(Number(u.id)) ? 'text-cyan-700' : 'text-slate-700'
                    }`}>
                      {u.name}
                    </div>
                    {u.username && (
                      <div className="text-xs text-slate-400 truncate">
                        @{u.username}
                      </div>
                    )}
                  </div>
                  {selectedUserIds.includes(Number(u.id)) && (
                    <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-cyan-600">
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          {/* 已选择提示 */}
          {selectedUserIds.length > 0 && (
            <div className="text-sm text-slate-600 bg-slate-50 p-2 rounded">
              已选择 <span className="font-bold text-cyan-700">{selectedUserIds.length}</span> 人
            </div>
          )}

          {/* 说明输入框 */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              {mode === 'add' ? '加签' : '减签'}说明 <span className="text-red-500">*</span>
            </label>
            <textarea
              className="w-full rounded-xl border border-slate-200 p-3 text-sm focus:border-cyan-400 focus:ring-2 focus:ring-cyan-200"
              placeholder={`请填写${mode === 'add' ? '加签' : '减签'}原因（必填）...`}
              rows={3}
              value={comment}
              onChange={e => setComment(e.target.value)}
              disabled={submitting}
            />
          </div>
        </div>

        {/* 底部按钮 */}
        <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-2 bg-slate-50">
          <button
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || selectedUserIds.length === 0 || !comment.trim()}
            className={`px-4 py-2 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed ${
              mode === 'add'
                ? 'bg-cyan-600 hover:bg-cyan-700'
                : 'bg-amber-600 hover:bg-amber-700'
            }`}
          >
            {submitting ? '处理中...' : `确认${mode === 'add' ? '加签' : '减签'}`}
          </button>
        </div>
      </div>
    </div>
  );
};
