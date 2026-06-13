import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { listEmployeesForSelect, type EmployeeBrief } from '@/services/api/hr';
import { getErrorMessage } from '@/utils/errorMessage';
import { getCachedOrFetch } from './selectorCache';
import { SelectorShell, type SelectorShellOption } from './SelectorShell';

type EmployeeId = number | string;

interface BaseProps {
  placeholder?: string;
  disabled?: boolean;
  allowClear?: boolean;
  className?: string;
  onlyActive?: boolean;
  filterOption?: (e: EmployeeBrief) => boolean;
  dropdownPlacement?: 'bottom' | 'top';
}

interface SingleProps extends BaseProps {
  single: true;
  value: EmployeeId | null | undefined;
  onChange: (id: number | null, picked: EmployeeBrief | null) => void;
}

interface MultipleProps extends BaseProps {
  single?: false;
  value: EmployeeId[] | null | undefined;
  onChange: (ids: number[], picked: EmployeeBrief[]) => void;
}

export type EmployeeSelectorProps = SingleProps | MultipleProps;

const CACHE_KEY_ACTIVE = 'employees:active';
const CACHE_KEY_ALL = 'employees:all';

const loadEmployees = (onlyActive: boolean) =>
  getCachedOrFetch(onlyActive ? CACHE_KEY_ACTIVE : CACHE_KEY_ALL, () =>
    listEmployeesForSelect({ onlyActive }),
  );

/**
 * HR 员工选择器（对接 /hr/employees，id 为 HrEmployee.id）
 * 注意：与 UserSelector(SysUser) ID 域不同，禁止互用
 */
export const EmployeeSelector: React.FC<EmployeeSelectorProps> = (props) => {
  const {
    placeholder = '选择员工',
    disabled,
    allowClear,
    className,
    onlyActive = true,
    filterOption,
    dropdownPlacement,
  } = props;

  const isSingle = (props as SingleProps).single === true;

  const [employees, setEmployees] = useState<EmployeeBrief[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadEmployees(onlyActive)
      .then((data) => {
        if (!cancelled) setEmployees(data);
      })
      .catch((err) => toast.error(getErrorMessage(err, '加载员工列表失败')))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [onlyActive]);

  const filtered = useMemo(
    () => (filterOption ? employees.filter(filterOption) : employees),
    [employees, filterOption],
  );

  const options: SelectorShellOption[] = useMemo(
    () =>
      filtered.map((e) => ({
        id: String(e.id),
        label: e.name,
        subLabel: [e.employeeNo, e.deptName, e.postName].filter(Boolean).join(' · ') || undefined,
      })),
    [filtered],
  );

  const valueArray: string[] = useMemo(() => {
    if (isSingle) {
      const v = (props as SingleProps).value;
      return v !== null && v !== undefined && v !== '' ? [String(v)] : [];
    }
    return ((props as MultipleProps).value || []).map((v) => String(v));
  }, [isSingle, props]);

  const find = useCallback((id: string) => employees.find((e) => String(e.id) === id), [employees]);

  const emitChange = useCallback(
    (next: string[]) => {
      if (isSingle) {
        const single = props as SingleProps;
        const id = next[0];
        single.onChange(id ? Number(id) : null, id ? find(id) || null : null);
      } else {
        const multi = props as MultipleProps;
        multi.onChange(next.map(Number), next.map((v) => find(v)).filter(Boolean) as EmployeeBrief[]);
      }
    },
    [find, isSingle, props],
  );

  const handleToggle = useCallback(
    (id: string) => {
      if (isSingle) emitChange(valueArray[0] === id ? [] : [id]);
      else emitChange(valueArray.includes(id) ? valueArray.filter((v) => v !== id) : [...valueArray, id]);
    },
    [emitChange, isSingle, valueArray],
  );

  const handleRemove = useCallback(
    (id: string) => emitChange(valueArray.filter((v) => v !== id)),
    [emitChange, valueArray],
  );

  return (
    <SelectorShell
      options={options}
      loading={loading}
      value={valueArray}
      onToggle={handleToggle}
      onRemove={handleRemove}
      multiple={!isSingle}
      placeholder={placeholder}
      searchPlaceholder="搜索员工姓名 / 工号 / 部门..."
      disabled={disabled}
      allowClear={allowClear}
      emptyText="未找到员工"
      className={className}
      dropdownPlacement={dropdownPlacement}
    />
  );
};
