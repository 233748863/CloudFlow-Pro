import React, { useState, useEffect } from 'react';
import { getUsers } from '../../services/api/workflow';
import { Search, X, Check } from 'lucide-react';
import { toast } from 'sonner';

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
      toast.error('加载用户列表失败');
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
    <div className={`relative ${className}`}>
      {/* 选择框 */}
      <div
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={`min-h-[44px] rounded-xl border bg-white px-3.5 py-2.5 transition-all ${
          disabled
            ? 'cursor-not-allowed bg-slate-50'
            : 'cursor-pointer hover:border-slate-300'
        } ${isOpen ? 'border-cyan-500 ring-2 ring-cyan-500/15' : 'border-slate-200'}`}
      >
        {selectedUsers.length === 0 ? (
          <span className="text-slate-400 text-sm">{placeholder}</span>
        ) : (
          <div className="flex flex-wrap gap-1">
            {selectedUsers.map((user) => (
              <span
                key={user.id}
                className="inline-flex items-center gap-1 rounded-lg border border-cyan-100 bg-cyan-50 px-2 py-1 text-xs font-medium text-cyan-700"
              >
                {user.name}
                {!disabled && (
                  <button
                    onClick={(e) => handleRemove(user.id, e)}
                    className="rounded-full p-0.5 transition hover:bg-cyan-100"
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
        <div className="absolute z-50 mt-1.5 max-h-64 w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_18px_36px_rgba(15,23,42,0.12)]">
          {/* 搜索框 */}
          <div className="p-2 border-b border-slate-200">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="搜索用户..."
                className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-8 pr-3 text-sm text-slate-700 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/15"
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
                    className={`flex items-center justify-between px-3 py-2 cursor-pointer transition-colors ${
                      isSelected ? 'bg-cyan-50' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-cyan-50 text-sm font-medium text-cyan-600">
                        {user.name[0]}
                      </div>
                      <div>
                        <div className="text-sm font-medium text-slate-800">{user.name}</div>
                        {user.username && (
                          <div className="text-xs text-slate-500">@{user.username}</div>
                        )}
                      </div>
                    </div>
                    {isSelected && <Check className="text-cyan-600" size={16} />}
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
