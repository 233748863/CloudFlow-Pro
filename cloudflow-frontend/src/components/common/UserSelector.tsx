import React, { useState, useEffect } from 'react';
import { getUsers } from '../../services/api/workflow';
import { Search, X, Check } from 'lucide-react';
import { toast } from 'sonner';
import { getErrorMessage } from '@/utils/errorMessage';
import { cn } from '@/utils/cn';

// 用户简要信息类型（从 API 返回）
interface UserBrief {
  id: string;
  name: string;
  username?: string;
}

interface UserSelectorProps {
  /** 已选中的用户 ID 列表 */
  value: string[];
  /** 选择变化回调 */
  onChange: (userIds: string[]) => void;
  /** 是否多选，默认 true */
  multiple?: boolean;
  /** 占位符 */
  placeholder?: string;
  /** 是否禁用 */
  disabled?: boolean;
  /** 自定义类名 */
  className?: string;
}

/**
 * 用户选择器组件
 * 支持搜索、多选、单选
 */
export const UserSelector: React.FC<UserSelectorProps> = ({
  value = [],
  onChange,
  multiple = true,
  placeholder = '选择用户',
  disabled = false,
  className = '',
}) => {
  const [users, setUsers] = useState<UserBrief[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      setLoading(true);
      const data = await getUsers();
      setUsers(data);
    } catch (error) {
      toast.error(getErrorMessage(error, '加载用户列表失败'));
    } finally {
      setLoading(false);
    }
  };

  const filteredUsers = users.filter((user) =>
    user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (user.username && user.username.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const selectedUsers = users.filter((u) => value.includes(u.id));

  const handleToggle = (userId: string) => {
    if (multiple) {
      const newValue = value.includes(userId)
        ? value.filter((id) => id !== userId)
        : [...value, userId];
      onChange(newValue);
    } else {
      onChange([userId]);
      setIsOpen(false);
    }
  };

  const handleRemove = (userId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(value.filter((id) => id !== userId));
  };

  return (
    <div className={cn('relative', className)}>
      {/* 选择框 */}
      <div
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={cn(
          'cf-control min-h-[44px] rounded-xl px-3.5 py-2.5',
          disabled ? 'cursor-not-allowed bg-slate-50 dark:bg-slate-900' : 'cursor-pointer',
          isOpen && 'cf-control-active',
        )}
      >
        {selectedUsers.length === 0 ? (
          <span className="text-slate-400 text-sm">{placeholder}</span>
        ) : (
          <div className="flex flex-wrap gap-1">
            {selectedUsers.map((user) => (
              <span
                key={user.id}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
              >
                {user.name}
                {!disabled && (
                  <button
                    onClick={(e) => handleRemove(user.id, e)}
                    className="rounded-full p-0.5 transition hover:bg-slate-200 dark:hover:bg-slate-800"
                  >
                    <X size={12} />
                  </button>
                )}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* 下拉列表 */}
      {isOpen && !disabled && (
        <div className="absolute z-50 mt-1.5 max-h-64 w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_18px_36px_rgba(15,23,42,0.12)] dark:border-slate-800 dark:bg-slate-950 dark:shadow-[0_18px_36px_rgba(2,6,23,0.5)]">
          {/* 搜索框 */}
          <div className="border-b border-slate-200 p-2 dark:border-slate-800">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="搜索用户..."
                className="cf-control h-10 w-full rounded-xl pl-8 pr-3 text-sm"
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          </div>

          {/* 用户列表 */}
          <div className="overflow-y-auto max-h-48">
            {loading ? (
              <div className="p-4 text-center text-sm text-slate-500">加载中...</div>
            ) : filteredUsers.length === 0 ? (
              <div className="p-4 text-center text-sm text-slate-500">未找到用户</div>
            ) : (
              filteredUsers.map((user) => {
                const isSelected = value.includes(user.id);
                return (
                  <div
                    key={user.id}
                    onClick={() => handleToggle(user.id)}
                    className={cn(
                      'flex cursor-pointer items-center justify-between px-3 py-2 transition-colors dark:hover:bg-slate-900',
                      isSelected ? 'cf-option-active' : 'hover:bg-slate-50',
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-sm font-medium text-[color:var(--cf-primary-600)] dark:bg-slate-900 dark:text-[rgb(204,251,241)]">
                        {user.name[0]}
                      </div>
                      <div>
                        <div className="text-sm font-medium text-slate-800 dark:text-slate-100">{user.name}</div>
                        {user.username && (
                          <div className="text-xs text-slate-500 dark:text-slate-400">@{user.username}</div>
                        )}
                      </div>
                    </div>
                    {isSelected && <Check className="text-[color:var(--cf-primary-600)] dark:text-[rgb(204,251,241)]" size={16} />}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* 点击外部关闭 */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setIsOpen(false)}
        />
      )}
    </div>
  );
};
