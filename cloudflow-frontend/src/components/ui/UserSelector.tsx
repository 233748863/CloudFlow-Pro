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
        className={`min-h-[38px] px-3 py-2 border rounded-lg bg-white cursor-pointer transition-colors ${
          disabled
            ? 'bg-slate-50 cursor-not-allowed'
            : 'hover:border-pink-300 focus-within:border-pink-400 focus-within:ring-2 focus-within:ring-pink-50'
        } ${isOpen ? 'border-pink-400 ring-2 ring-pink-50' : 'border-slate-300'}`}
      >
        {selectedUsers.length === 0 ? (
          <span className="text-slate-400 text-sm">{placeholder}</span>
        ) : (
          <div className="flex flex-wrap gap-1">
            {selectedUsers.map((user) => (
              <span
                key={user.id}
                className="inline-flex items-center gap-1 px-2 py-0.5 bg-pink-50 text-pink-600 text-xs rounded-md"
              >
                {user.name}
                {!disabled && (
                  <button
                    onClick={(e) => handleRemove(user.id, e)}
                    className="hover:bg-pink-100 rounded-full p-0.5"
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
        <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-64 overflow-hidden">
          {/* 搜索框 */}
          <div className="p-2 border-b border-slate-200">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="搜索用户..."
                className="w-full pl-8 pr-3 py-1.5 text-sm border border-slate-300 rounded-md focus:outline-none focus:border-pink-400"
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
                      isSelected ? 'bg-pink-50' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 bg-pink-50 text-pink-500 rounded-full flex items-center justify-center text-sm font-medium">
                        {user.name[0]}
                      </div>
                      <div>
                        <div className="text-sm font-medium text-slate-800">{user.name}</div>
                        {user.username && (
                          <div className="text-xs text-slate-500">@{user.username}</div>
                        )}
                      </div>
                    </div>
                    {isSelected && <Check className="text-pink-500" size={16} />}
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
