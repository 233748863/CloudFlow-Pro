import React, { useState, useEffect } from 'react';
import { getRoles } from '../../services/api/workflow';
import { Search, X, Check, Shield } from 'lucide-react';
import { toast } from 'sonner';
import { getErrorMessage } from '@/utils/errorMessage';
import { cn } from '@/utils/cn';

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
      toast.error(getErrorMessage(error, '加载角色列表失败'));
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
    <div className={cn('relative', className)}>
      <div
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={cn(
          'cf-control min-h-[44px] rounded-md px-3.5 py-2.5',
          disabled ? 'cursor-not-allowed bg-[var(--cf-surface-muted)] dark:bg-slate-900' : 'cursor-pointer',
          isOpen && 'cf-control-active',
        )}
      >
        {selectedRoles.length === 0 ? (
          <span className="text-slate-400 text-sm">{placeholder}</span>
        ) : (
          <div className="flex flex-wrap gap-1">
            {selectedRoles.map((role) => (
              <span
                key={getRoleKey(role)}
                className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-[var(--cf-surface-muted)] px-2 py-1 text-xs font-medium text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
              >
                <Shield size={10} className="text-[color:var(--cf-primary-600)] dark:text-[rgb(204,251,241)]" />
                {role.name}
                {!disabled && (
                  <button onClick={(e) => handleRemove(role, e)} className="rounded-md p-0.5 transition hover:bg-slate-200 dark:hover:bg-slate-800">
                    <X size={12} />
                  </button>
                )}
              </span>
            ))}
          </div>
        )}
      </div>

      {isOpen && !disabled && (
        <div className="absolute z-50 mt-1.5 max-h-64 w-full overflow-hidden rounded-md border border-slate-200 bg-[var(--cf-surface-strong)] shadow-none dark:border-slate-800 dark:bg-slate-950 dark:shadow-none">
          <div className="border-b border-slate-200 p-2 dark:border-slate-800">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="搜索角色..."
                className="cf-control h-10 w-full rounded-md pl-8 pr-3 text-sm"
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
                    className={cn(
                      'flex cursor-pointer items-center justify-between px-3 py-2 transition-colors dark:hover:bg-slate-900',
                      isSelected ? 'cf-option-active' : 'hover:bg-[var(--cf-surface-muted)]',
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-md bg-[var(--cf-surface-muted)] text-[color:var(--cf-primary-600)] dark:bg-slate-900 dark:text-[rgb(204,251,241)]">
                        <Shield size={16} />
                      </div>
                      <div>
                        <div className="text-sm font-medium text-slate-800 dark:text-slate-100">{role.name}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">{key}</div>
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

      {isOpen && <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />}
    </div>
  );
};
