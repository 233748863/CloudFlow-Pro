import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { getMeetingRooms } from '@/services/api/schedule';
import type { MeetingRoom } from '@/types';
import { getErrorMessage } from '@/utils/errorMessage';
import { getCachedOrFetch } from './selectorCache';
import { SelectorShell, type SelectorShellOption } from './SelectorShell';

interface MeetingRoomSelectorProps {
  value: string | null | undefined;
  onChange: (id: string | null, picked: MeetingRoom | null) => void;
  placeholder?: string;
  disabled?: boolean;
  allowClear?: boolean;
  className?: string;
  dropdownPlacement?: 'bottom' | 'top';
}

const CACHE_KEY = 'meetingRoom:list';

const loadRooms = () =>
  getCachedOrFetch(CACHE_KEY, async () => {
    const rooms = await getMeetingRooms();
    return Array.isArray(rooms) ? rooms.filter((r) => r.status === '1') : [];
  });

export const MeetingRoomSelector: React.FC<MeetingRoomSelectorProps> = ({
  value,
  onChange,
  placeholder = '选择会议室',
  disabled,
  allowClear,
  className,
  dropdownPlacement,
}) => {
  const [rooms, setRooms] = useState<MeetingRoom[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadRooms()
      .then((data) => {
        if (!cancelled) setRooms(data);
      })
      .catch((err) => toast.error(getErrorMessage(err, '加载会议室列表失败')))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const options: SelectorShellOption[] = useMemo(
    () =>
      rooms.map((r) => ({
        id: String(r.roomId),
        label: r.name,
        subLabel: r.location ? `${r.location} · ${r.capacity}人` : `${r.capacity}人`,
      })),
    [rooms],
  );

  const valueArray: string[] = useMemo(
    () => (value ? [value] : []),
    [value],
  );

  const find = useCallback((id: string) => rooms.find((r) => String(r.roomId) === id) ?? null, [rooms]);

  const handleToggle = useCallback(
    (id: string) => {
      if (valueArray[0] === id) {
        onChange(null, null);
      } else {
        onChange(id, find(id));
      }
    },
    [find, onChange, valueArray],
  );

  const handleRemove = useCallback(() => {
    onChange(null, null);
  }, [onChange]);

  return (
    <SelectorShell
      options={options}
      loading={loading}
      value={valueArray}
      onToggle={handleToggle}
      onRemove={handleRemove}
      multiple={false}
      placeholder={placeholder}
      searchPlaceholder="搜索会议室名称 / 位置..."
      disabled={disabled}
      allowClear={allowClear}
      emptyText="未找到会议室"
      className={className}
      dropdownPlacement={dropdownPlacement}
      showAvatar={false}
    />
  );
};
