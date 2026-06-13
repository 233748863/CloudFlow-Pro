import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { getDeptTreeOptions, type DeptTreeNode } from '@/services/api/hr';
import { getErrorMessage } from '@/utils/errorMessage';
import { getCachedOrFetch } from './selectorCache';
import { SelectorShell, type SelectorShellOption } from './SelectorShell';

type DeptId = number | string;

interface BaseProps {
  placeholder?: string;
  disabled?: boolean;
  allowClear?: boolean;
  className?: string;
  dropdownPlacement?: 'bottom' | 'top';
}

interface SingleProps extends BaseProps {
  single: true;
  value: DeptId | null | undefined;
  onChange: (id: number | null, picked: DeptTreeNode | null) => void;
}

interface MultipleProps extends BaseProps {
  single?: false;
  value: DeptId[] | null | undefined;
  onChange: (ids: number[], picked: DeptTreeNode[]) => void;
}

export type DeptSelectorProps = SingleProps | MultipleProps;

const CACHE_KEY = 'dept:tree';

const flattenTree = (
  nodes: DeptTreeNode[] | undefined,
  level: number,
  acc: Array<{ node: DeptTreeNode; level: number }>,
) => {
  if (!nodes) return;
  for (const node of nodes) {
    acc.push({ node, level });
    if (node.children && node.children.length > 0) {
      flattenTree(node.children, level + 1, acc);
    }
  }
};

const loadDepts = () => getCachedOrFetch(CACHE_KEY, () => getDeptTreeOptions());

/**
 * 部门选择器（对接 /auth/system/dept/tree，id 为 sys_dept.dept_id）
 * 树形展示，下拉中通过缩进表达层级
 */
export const DeptSelector: React.FC<DeptSelectorProps> = (props) => {
  const {
    placeholder = '选择部门',
    disabled,
    allowClear,
    className,
    dropdownPlacement,
  } = props;

  const isSingle = (props as SingleProps).single === true;

  const [flat, setFlat] = useState<Array<{ node: DeptTreeNode; level: number }>>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadDepts()
      .then((tree) => {
        if (cancelled) return;
        const acc: Array<{ node: DeptTreeNode; level: number }> = [];
        flattenTree(tree, 0, acc);
        setFlat(acc);
      })
      .catch((err) => toast.error(getErrorMessage(err, '加载部门失败')))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const options: SelectorShellOption[] = useMemo(
    () =>
      flat.map(({ node, level }) => ({
        id: String(node.deptId),
        label: node.deptName,
        indent: level,
      })),
    [flat],
  );

  const valueArray: string[] = useMemo(() => {
    if (isSingle) {
      const v = (props as SingleProps).value;
      return v !== null && v !== undefined && v !== '' ? [String(v)] : [];
    }
    return ((props as MultipleProps).value || []).map((v) => String(v));
  }, [isSingle, props]);

  const find = useCallback(
    (id: string) => flat.find(({ node }) => String(node.deptId) === id)?.node,
    [flat],
  );

  const emitChange = useCallback(
    (next: string[]) => {
      if (isSingle) {
        const single = props as SingleProps;
        const id = next[0];
        single.onChange(id ? Number(id) : null, id ? find(id) || null : null);
      } else {
        const multi = props as MultipleProps;
        multi.onChange(next.map(Number), next.map((v) => find(v)).filter(Boolean) as DeptTreeNode[]);
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
      searchPlaceholder="搜索部门..."
      disabled={disabled}
      allowClear={allowClear}
      emptyText="未找到部门"
      className={className}
      dropdownPlacement={dropdownPlacement}
      showAvatar={false}
    />
  );
};
