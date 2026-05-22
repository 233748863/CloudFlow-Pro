import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { getUsers } from '../../services/api/workflow';
import { getErrorMessage } from '@/utils/errorMessage';
import type { UserBrief } from '@/types/workflow';
import { getCachedOrFetch } from './selectorCache';
import { SelectorShell, type SelectorShellOption } from './SelectorShell';

interface CommonProps {
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  allowClear?: boolean;
  dropdownPlacement?: 'bottom' | 'top';
}

interface SingleProps extends CommonProps {
  single: true;
  value: string | null | undefined;
  onChange: (id: string | null, picked: UserBrief | null) => void;
  /** 兼容旧用法但单选场景不再使用 */
  onUsersChange?: never;
  multiple?: never;
}

interface MultipleProps extends CommonProps {
  single?: false;
  multiple?: boolean;
  value: string[];
  onChange: (ids: string[], picked: UserBrief[]) => void;
  /** 已废弃但保留以兼容旧调用方；新代码请使用 onChange 第二参 */
  onUsersChange?: (users: UserBrief[]) => void;
}

export type UserSelectorProps = SingleProps | MultipleProps;

const CACHE_KEY = 'sysUser:list';

const loadUsers = () => getCachedOrFetch(CACHE_KEY, () => getUsers());

/**
 * 用户选择器（对接 /auth/system/user/list，id 为 sys_user.user_id）
 * 注意：与 HR 员工 ID 不同，不可与 EmployeeSelector 混用
 *
 * 用法：
 *   单选（推荐）：<UserSelector single value={ownerId} onChange={(id, user) => ...} />
 *   多选：<UserSelector value={ids} onChange={(ids, users) => ...} />
 */
export const UserSelector: React.FC<UserSelectorProps> = (props) => {
  const {
    placeholder = '选择用户',
    disabled,
    className,
    allowClear,
    dropdownPlacement,
  } = props;

  const isSingle = (props as SingleProps).single === true;

  const [users, setUsers] = useState<UserBrief[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadUsers()
      .then((data) => {
        if (!cancelled) setUsers(data);
      })
      .catch((err) => toast.error(getErrorMessage(err, '加载用户列表失败')))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const options: SelectorShellOption[] = useMemo(
    () =>
      users.map((u) => ({
        id: u.id,
        label: u.name,
        subLabel: u.deptName || u.email || undefined,
      })),
    [users],
  );

  const valueArray: string[] = useMemo(() => {
    if (isSingle) {
      const v = (props as SingleProps).value;
      return v !== null && v !== undefined && v !== '' ? [v] : [];
    }
    return (props as MultipleProps).value || [];
  }, [isSingle, props]);

  const selectedUsers = useMemo(
    () => valueArray.map((id) => users.find((u) => u.id === id)).filter(Boolean) as UserBrief[],
    [users, valueArray],
  );

  useEffect(() => {
    const multi = props as MultipleProps;
    if (!isSingle && multi.onUsersChange) {
      multi.onUsersChange(selectedUsers);
    }
  }, [isSingle, props, selectedUsers]);

  const find = useCallback((id: string) => users.find((u) => u.id === id), [users]);

  const emitChange = useCallback(
    (next: string[]) => {
      if (isSingle) {
        const single = props as SingleProps;
        const id = next[0] ?? null;
        single.onChange(id, id ? find(id) || null : null);
      } else {
        const multi = props as MultipleProps;
        multi.onChange(next, next.map((v) => find(v)).filter(Boolean) as UserBrief[]);
      }
    },
    [find, isSingle, props],
  );

  const handleToggle = useCallback(
    (id: string) => {
      if (isSingle) {
        emitChange(valueArray[0] === id ? [] : [id]);
      } else {
        emitChange(valueArray.includes(id) ? valueArray.filter((v) => v !== id) : [...valueArray, id]);
      }
    },
    [emitChange, isSingle, valueArray],
  );

  const handleRemove = useCallback(
    (id: string) => {
      emitChange(valueArray.filter((v) => v !== id));
    },
    [emitChange, valueArray],
  );

  const explicitMultiple = (props as MultipleProps).multiple;
  const shellMultiple = isSingle ? false : explicitMultiple !== false;

  return (
    <SelectorShell
      options={options}
      loading={loading}
      value={valueArray}
      onToggle={handleToggle}
      onRemove={handleRemove}
      multiple={shellMultiple}
      placeholder={placeholder}
      searchPlaceholder="搜索用户姓名 / 部门..."
      disabled={disabled}
      allowClear={allowClear}
      emptyText="未找到用户"
      className={className}
      dropdownPlacement={dropdownPlacement}
    />
  );
};
