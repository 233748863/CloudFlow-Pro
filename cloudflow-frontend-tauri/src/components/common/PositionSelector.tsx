import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { getPositionOptions, type PositionOption } from '@/services/api/hr';
import { getErrorMessage } from '@/utils/errorMessage';
import { getCachedOrFetch } from './selectorCache';
import { SelectorShell, type SelectorShellOption } from './SelectorShell';

type PositionId = number | string;

interface BaseProps {
  placeholder?: string;
  disabled?: boolean;
  allowClear?: boolean;
  className?: string;
  dropdownPlacement?: 'bottom' | 'top';
  /** 按部门 ID 过滤可选职位 */
  deptId?: number | null;
}

interface SingleProps extends BaseProps {
  single: true;
  value: PositionId | null | undefined;
  onChange: (id: number | null, picked: PositionOption | null) => void;
}

interface MultipleProps extends BaseProps {
  single?: false;
  value: PositionId[] | null | undefined;
  onChange: (ids: number[], picked: PositionOption[]) => void;
}

export type PositionSelectorProps = SingleProps | MultipleProps;

const CACHE_KEY = 'position:list';

const loadPositions = (): Promise<PositionOption[]> =>
  getCachedOrFetch(CACHE_KEY, async () => {
    const res = await getPositionOptions({ pageNum: 1, pageSize: 999 });
    const arr = Array.isArray(res)
      ? res
      : ((res as unknown as { rows?: PositionOption[]; records?: PositionOption[] }).rows ||
         (res as unknown as { rows?: PositionOption[]; records?: PositionOption[] }).records ||
         []);
    return arr;
  });

/**
 * HR 职位选择器（对接 /hr/organization/positions，id 为 hr_position.id）
 * 注意：与 sys_post 不同，sys_post 请用 PostSelector
 */
export const PositionSelector: React.FC<PositionSelectorProps> = (props) => {
  const {
    placeholder = '选择职位',
    disabled,
    allowClear,
    className,
    dropdownPlacement,
    deptId,
  } = props;

  const isSingle = (props as SingleProps).single === true;

  const [positions, setPositions] = useState<PositionOption[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadPositions()
      .then((arr) => {
        if (!cancelled) setPositions(arr);
      })
      .catch((err) => toast.error(getErrorMessage(err, '加载职位失败')))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(
    () => (deptId ? positions.filter((p) => !p.deptId || p.deptId === deptId) : positions),
    [positions, deptId],
  );

  const options: SelectorShellOption[] = useMemo(
    () =>
      filtered.map((p) => ({
        id: String(p.id),
        label: p.positionName,
        subLabel: [p.positionCode, p.deptName, p.postName].filter(Boolean).join(' · ') || undefined,
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

  const find = useCallback((id: string) => positions.find((p) => String(p.id) === id), [positions]);

  const emitChange = useCallback(
    (next: string[]) => {
      if (isSingle) {
        const single = props as SingleProps;
        const id = next[0];
        single.onChange(id ? Number(id) : null, id ? find(id) || null : null);
      } else {
        const multi = props as MultipleProps;
        multi.onChange(next.map(Number), next.map((v) => find(v)).filter(Boolean) as PositionOption[]);
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
      searchPlaceholder="搜索职位..."
      disabled={disabled}
      allowClear={allowClear}
      emptyText="未找到职位"
      className={className}
      dropdownPlacement={dropdownPlacement}
      showAvatar={false}
    />
  );
};
