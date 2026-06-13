import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { getPostOptions, type PostOption } from '@/services/api/hr';
import { getErrorMessage } from '@/utils/errorMessage';
import { getCachedOrFetch } from './selectorCache';
import { SelectorShell, type SelectorShellOption } from './SelectorShell';

type PostId = number | string;

interface BaseProps {
  placeholder?: string;
  disabled?: boolean;
  allowClear?: boolean;
  className?: string;
  dropdownPlacement?: 'bottom' | 'top';
}

interface SingleProps extends BaseProps {
  single: true;
  value: PostId | null | undefined;
  onChange: (id: number | null, picked: PostOption | null) => void;
}

interface MultipleProps extends BaseProps {
  single?: false;
  value: PostId[] | null | undefined;
  onChange: (ids: number[], picked: PostOption[]) => void;
}

export type PostSelectorProps = SingleProps | MultipleProps;

const CACHE_KEY = 'post:list';

const loadPosts = (): Promise<PostOption[]> =>
  getCachedOrFetch(CACHE_KEY, async () => {
    const res = await getPostOptions();
    const arr = Array.isArray(res)
      ? res
      : ((res as unknown as { rows?: PostOption[]; records?: PostOption[] }).rows ||
         (res as unknown as { rows?: PostOption[]; records?: PostOption[] }).records ||
         []);
    return arr;
  });

/**
 * 岗位选择器（对接 /auth/system/post/list，id 为 sys_post.post_id）
 * 注意：与 hr_position 不同，hr_position 请用 PositionSelector
 */
export const PostSelector: React.FC<PostSelectorProps> = (props) => {
  const {
    placeholder = '选择岗位',
    disabled,
    allowClear,
    className,
    dropdownPlacement,
  } = props;

  const isSingle = (props as SingleProps).single === true;

  const [posts, setPosts] = useState<PostOption[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadPosts()
      .then((arr) => {
        if (!cancelled) setPosts(arr);
      })
      .catch((err) => toast.error(getErrorMessage(err, '加载岗位失败')))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const options: SelectorShellOption[] = useMemo(
    () =>
      posts.map((p) => ({
        id: String(p.postId),
        label: p.postName,
        subLabel: p.postCode,
      })),
    [posts],
  );

  const valueArray: string[] = useMemo(() => {
    if (isSingle) {
      const v = (props as SingleProps).value;
      return v !== null && v !== undefined && v !== '' ? [String(v)] : [];
    }
    return ((props as MultipleProps).value || []).map((v) => String(v));
  }, [isSingle, props]);

  const find = useCallback((id: string) => posts.find((p) => String(p.postId) === id), [posts]);

  const emitChange = useCallback(
    (next: string[]) => {
      if (isSingle) {
        const single = props as SingleProps;
        const id = next[0];
        single.onChange(id ? Number(id) : null, id ? find(id) || null : null);
      } else {
        const multi = props as MultipleProps;
        multi.onChange(next.map(Number), next.map((v) => find(v)).filter(Boolean) as PostOption[]);
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
      searchPlaceholder="搜索岗位..."
      disabled={disabled}
      allowClear={allowClear}
      emptyText="未找到岗位"
      className={className}
      dropdownPlacement={dropdownPlacement}
      showAvatar={false}
    />
  );
};
