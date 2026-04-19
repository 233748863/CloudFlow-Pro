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
        className={`min-h-[44px] rounded-xl border bg-white px-3.5 py-2.5 transition-all ${
          disabled ? 'cursor-not-allowed bg-slate-50' : 'cursor-pointer hover:border-slate-300'
        } ${isOpen ? 'border-cyan-500 ring-2 ring-cyan-500/15' : 'border-slate-200'}`}
      >
        {selectedRoles.length === 0 ? (
          <span className="text-slate-400 text-sm">{placeholder}</span>
        ) : (
          <div className="flex flex-wrap gap-1">
            {selectedRoles.map((role) => (
              <span
                key={getRoleKey(role)}
                className="inline-flex items-center gap-1 rounded-lg border border-cyan-100 bg-cyan-50 px-2 py-1 text-xs font-medium text-cyan-700"
              >
                <Shield size={10} />
                {role.name}
                {!disabled && (
                  <button onClick={(e) => handleRemove(role, e)} className="rounded-full p-0.5 transition hover:bg-cyan-100">
                    <X size={12} />
                  </button>
                )}
              </span>
            ))}
          </div>
        )}
      </div>

      {isOpen && !disabled && (
        <div className="absolute z-50 mt-1.5 max-h-64 w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_18px_36px_rgba(15,23,42,0.12)]">
          <div className="p-2 border-b border-slate-200">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="搜索角色..."
                className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-8 pr-3 text-sm text-slate-700 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/15"
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
                      isSelected ? 'bg-cyan-50' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-cyan-50 text-cyan-600">
                        <Shield size={16} />
                      </div>
                      <div>
                        <div className="text-sm font-medium text-slate-800">{role.name}</div>
                        <div className="text-xs text-slate-500">{key}</div>
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

      {isOpen && <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />}
    </div>
  );
};
