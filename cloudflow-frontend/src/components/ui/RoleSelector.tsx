import React, { useState, useEffect } from 'react';
import { getRoles } from '../../services/api/workflow';
import { Search, X, Check, Shield } from 'lucide-react';
import { toast } from 'sonner';

// 角色信息类型（兼容 API 返回的 RoleInfo）
interface RoleBrief {
  id: string;
  name: string;
  key?: string;
  roleKey?: string;
}

interface RoleSelectorProps {
  /** 已选中的角色 Key 列表 */
  value: string[];
  /** 选择变化回调 */
  onChange: (roleKeys: string[]) => void;
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
 * 角色选择器组件
 * 支持搜索、多选、单选
 */
export const RoleSelector: React.FC<RoleSelectorProps> = ({
  value = [],
  onChange,
  multiple = true,
  placeholder = '选择角色',
  disabled = false,
  className = '',
}) => {
  const [roles, setRoles] = useState<RoleBrief[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    loadRoles();
  }, []);

  const loadRoles = async () => {
    try {
      setLoading(true);
      const data = await getRoles();
      setRoles(data);
    } catch (error) {
      toast.error('加载角色列表失败');
    } finally {
      setLoading(false);
    }
  };

  const getRoleKey = (role: RoleBrief): string => role.key || role.roleKey || role.id;

  const filteredRoles = roles.filter((role) =>
    role.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    getRoleKey(role).toLowerCase().includes(searchTerm.toLowerCase())
  );

  const selectedRoles = roles.filter((r) => value.includes(getRoleKey(r)));

  const handleToggle = (role: RoleBrief) => {
    const key = getRoleKey(role);
    if (multiple) {
      const newValue = value.includes(key)
        ? value.filter((k) => k !== key)
        : [...value, key];
      onChange(newValue);
    } else {
      onChange([key]);
      setIsOpen(false);
    }
  };

  const handleRemove = (role: RoleBrief, e: React.MouseEvent) => {
    e.stopPropagation();
    const key = getRoleKey(role);
    onChange(value.filter((k) => k !== key));
  };

  return (
    <div className={`relative ${className}`}>
      <div
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={`min-h-[38px] px-3 py-2 border rounded-lg bg-white cursor-pointer transition-colors ${
          disabled ? 'bg-slate-50 cursor-not-allowed' : 'hover:border-pink-300'
        } ${isOpen ? 'border-pink-400 ring-2 ring-pink-50' : 'border-slate-300'}`}
      >
        {selectedRoles.length === 0 ? (
          <span className="text-slate-400 text-sm">{placeholder}</span>
        ) : (
          <div className="flex flex-wrap gap-1">
            {selectedRoles.map((role) => (
              <span
                key={getRoleKey(role)}
                className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-100 text-emerald-700 text-xs rounded-md"
              >
                <Shield size={10} />
                {role.name}
                {!disabled && (
                  <button onClick={(e) => handleRemove(role, e)} className="hover:bg-emerald-200 rounded-full p-0.5">
                    <X size={12} />
                  </button>
                )}
              </span>
            ))}
          </div>
        )}
      </div>

      {isOpen && !disabled && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-64 overflow-hidden">
          <div className="p-2 border-b border-slate-200">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="搜索角色..."
                className="w-full pl-8 pr-3 py-1.5 text-sm border border-slate-300 rounded-md focus:outline-none focus:border-pink-400"
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          </div>

          <div className="overflow-y-auto max-h-48">
            {loading ? (
              <div className="p-4 text-center text-sm text-slate-500">加载中...</div>
            ) : filteredRoles.length === 0 ? (
              <div className="p-4 text-center text-sm text-slate-500">未找到角色</div>
            ) : (
              filteredRoles.map((role) => {
                const key = getRoleKey(role);
                const isSelected = value.includes(key);
                return (
                  <div
                    key={key}
                    onClick={() => handleToggle(role)}
                    className={`flex items-center justify-between px-3 py-2 cursor-pointer transition-colors ${
                      isSelected ? 'bg-emerald-50' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center">
                        <Shield size={16} />
                      </div>
                      <div>
                        <div className="text-sm font-medium text-slate-800">{role.name}</div>
                        <div className="text-xs text-slate-500">{key}</div>
                      </div>
                    </div>
                    {isSelected && <Check className="text-emerald-600" size={16} />}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {isOpen && <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />}
    </div>
  );
};
