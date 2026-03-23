import React, { useState, useEffect, useCallback } from 'react';
import { MeetingRoom, SysScheduleEvent } from '../types';
import {
  getMeetingRooms, createMeetingRoom, updateMeetingRoom, deleteMeetingRoom,
  createEvent, getRoomEvents, getRoomWeekEvents, getMyBookings, cancelBooking,
  getRoomUsageStats, getUserListForAttendees, getDeptTree,
  UserBriefItem, DeptTreeItem, RoomUsageStats
} from '../services/api/schedule';
import {
  MapPin, Users, Monitor, CheckCircle2, XCircle, Plus, Pencil, Trash2,
  Settings, X, Clock, UserPlus, Calendar, ChevronRight, ChevronDown,
  Building2, User, Search, ChevronLeft, BarChart3, Filter, CalendarDays,
  Sparkles, ArrowRight, CircleDot
} from 'lucide-react';
import { toast } from 'sonner';
import { toBackendDateString } from '../utils/dateFormat';
import { Button, Card, DatePicker, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea, TableHead, TableHeader } from '@/components/ui';
import { TableRowActions } from '@/components/ui/table-row-actions';

// ==================== 类型定义 ====================
interface UserBrief {
  id: string;
  name: string;
  email?: string;
  deptId?: number;
  deptName?: string;
}

interface DeptNodeWithUsers extends DeptTreeItem {
  users: UserBrief[];
  children?: DeptNodeWithUsers[];
}

type TabType = 'rooms' | 'my-bookings' | 'stats';
type RoomRealtimeStatus = 'available' | 'in-use' | 'maintenance';

// ==================== 工具函数 ====================
function getLocalDateString(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // 调整到周一
  return new Date(d.setDate(diff));
}

function formatDateCN(date: Date): string {
  const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  return `${date.getMonth() + 1}月${date.getDate()}日 ${weekdays[date.getDay()]}`;
}

const SectionHeader = ({
  eyebrow,
  title,
  actionLabel,
  onAction,
}: {
  eyebrow: string;
  title: string;
  actionLabel?: string;
  onAction?: () => void;
}) => (
  <div className="flex items-start justify-between gap-4">
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">{eyebrow}</div>
      <div className="mt-2 text-xl font-bold tracking-tight text-slate-900">{title}</div>
    </div>
    {actionLabel && onAction ? (
      <button
        type="button"
        onClick={onAction}
        className="inline-flex items-center gap-1 text-xs font-semibold text-slate-400 transition hover:text-pink-600"
      >
        {actionLabel}
        <ChevronRight size={14} />
      </button>
    ) : null}
  </div>
);

function buildDeptTreeWithUsers(deptTree: DeptTreeItem[], users: UserBrief[]): DeptNodeWithUsers[] {
  const mapNode = (node: DeptTreeItem): DeptNodeWithUsers => ({
    ...node,
    users: users.filter(u => u.deptId === node.deptId),
    children: node.children ? node.children.map(mapNode) : [],
  });

  const tree = deptTree.map(mapNode);
  const allDeptIds = new Set<number>();
  const collectIds = (nodes: DeptTreeItem[]) => { 
    for (const n of nodes) { 
      allDeptIds.add(n.deptId); 
      if (n.children) collectIds(n.children); 
    } 
  };
  collectIds(deptTree);

  const unassigned = users.filter(u => !u.deptId || !allDeptIds.has(u.deptId));
  if (unassigned.length > 0) {
    tree.push({ deptId: -1, parentId: 0, deptName: '未分配部门', users: unassigned, children: [] });
  }
  return tree;
}

function getRoomRealtimeStatus(room: MeetingRoom, bookings: SysScheduleEvent[]): RoomRealtimeStatus {
  if (room.status === '0') return 'maintenance';
  if (!bookings || bookings.length === 0) return 'available';
  
  const now = new Date();
  const isInUse = bookings.some(b => {
    try {
      const start = new Date(b.startTime);
      const end = new Date(b.endTime);
      return now >= start && now <= end;
    } catch { return false; }
  });
  
  return isInUse ? 'in-use' : 'available';
}

const roomStatusConfig: Record<RoomRealtimeStatus, { bg: string; text: string; label: string; icon: 'check' | 'clock' | 'x' }> = {
  'available': { bg: 'bg-emerald-100 text-emerald-700', text: 'text-emerald-700', label: '空闲', icon: 'check' },
  'in-use': { bg: 'bg-amber-100 text-amber-700', text: 'text-amber-700', label: '使用中', icon: 'clock' },
  'maintenance': { bg: 'bg-red-100 text-red-700', text: 'text-red-700', label: '维护中', icon: 'x' },
};

// ==================== 组织架构树选择器 ====================
interface OrgTreePickerProps {
  deptTree: DeptNodeWithUsers[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}

const OrgTreePicker: React.FC<OrgTreePickerProps> = ({ deptTree, selectedIds, onChange }) => {
  const [search, setSearch] = useState('');
  const [expandedDepts, setExpandedDepts] = useState<Set<number>>(new Set());

  const getAllUserIds = useCallback((node: DeptNodeWithUsers): string[] => {
    let ids = node.users.map(u => u.id);
    if (node.children) {
      for (const child of node.children) {
        ids = ids.concat(getAllUserIds(child));
      }
    }
    return ids;
  }, []);

  const isDeptAllSelected = useCallback((node: DeptNodeWithUsers): boolean => {
    const allIds = getAllUserIds(node);
    return allIds.length > 0 && allIds.every(id => selectedIds.includes(id));
  }, [selectedIds, getAllUserIds]);

  const isDeptPartialSelected = useCallback((node: DeptNodeWithUsers): boolean => {
    const allIds = getAllUserIds(node);
    const selectedCount = allIds.filter(id => selectedIds.includes(id)).length;
    return selectedCount > 0 && selectedCount < allIds.length;
  }, [selectedIds, getAllUserIds]);

  const toggleDept = useCallback((node: DeptNodeWithUsers) => {
    const allIds = getAllUserIds(node);
    if (isDeptAllSelected(node)) {
      onChange(selectedIds.filter(id => !allIds.includes(id)));
    } else {
      const newIds = [...new Set([...selectedIds, ...allIds])];
      onChange(newIds);
    }
  }, [selectedIds, onChange, getAllUserIds, isDeptAllSelected]);

  const toggleUser = useCallback((userId: string) => {
    if (selectedIds.includes(userId)) {
      onChange(selectedIds.filter(id => id !== userId));
    } else {
      onChange([...selectedIds, userId]);
    }
  }, [selectedIds, onChange]);

  const toggleExpand = (deptId: number) => {
    setExpandedDepts(prev => {
      const next = new Set(prev);
      if (next.has(deptId)) next.delete(deptId);
      else next.add(deptId);
      return next;
    });
  };

  const nodeMatchesSearch = useCallback((node: DeptNodeWithUsers, keyword: string): boolean => {
    if (!keyword) return true;
    const lk = keyword.toLowerCase();
    if (node.deptName.toLowerCase().includes(lk)) return true;
    if (node.users.some(u => u.name.toLowerCase().includes(lk) || (u.email && u.email.toLowerCase().includes(lk)))) return true;
    if (node.children) return node.children.some(c => nodeMatchesSearch(c, keyword));
    return false;
  }, []);

  const renderDeptNode = (node: DeptNodeWithUsers, depth: number = 0): React.ReactNode => {
    if (search && !nodeMatchesSearch(node, search)) return null;

    const isExpanded = expandedDepts.has(node.deptId) || !!search;
    const hasChildren = (node.children && node.children.length > 0) || node.users.length > 0;
    const allSelected = isDeptAllSelected(node);
    const partialSelected = isDeptPartialSelected(node);
    const userCount = getAllUserIds(node).length;

    const filteredUsers = search
      ? node.users.filter(u => u.name.toLowerCase().includes(search.toLowerCase()) || (u.email && u.email.toLowerCase().includes(search.toLowerCase())))
      : node.users;

    return (
      <div key={node.deptId}>
        <div
          className="group flex cursor-pointer items-center gap-1 rounded-xl px-2 py-1.5 hover:bg-slate-50"
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
        >
          <button
            onClick={() => toggleExpand(node.deptId)}
            className="w-5 h-5 flex items-center justify-center text-slate-400 hover:text-slate-600 shrink-0"
          >
            {hasChildren ? (
              isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />
            ) : <span className="w-3.5" />}
          </button>
          <button
            onClick={() => toggleDept(node)}
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
              allSelected
                ? 'bg-pink-500 border-pink-500'
                : partialSelected
                  ? 'bg-pink-100 border-pink-300'
                  : 'border-slate-300 hover:border-pink-300'
            }`}
          >
            {allSelected && <CheckCircle2 size={10} className="text-white" />}
            {partialSelected && !allSelected && <div className="w-2 h-0.5 bg-pink-500 rounded" />}
          </button>
          <Building2 size={14} className="text-amber-500 shrink-0 ml-1" />
          <span className="text-sm font-medium text-slate-700 flex-1 truncate" onClick={() => toggleExpand(node.deptId)}>
            {node.deptName}
          </span>
          <span className="text-xs text-slate-400 shrink-0">{userCount}人</span>
        </div>
        {isExpanded && (
          <div>
            {node.children?.map(child => renderDeptNode(child, depth + 1))}
            {filteredUsers.map(user => (
              <div
                key={user.id}
                className="flex cursor-pointer items-center gap-1 rounded-xl px-2 py-1.5 hover:bg-slate-50"
                style={{ paddingLeft: `${(depth + 1) * 16 + 8}px` }}
                onClick={() => toggleUser(user.id)}
              >
                <span className="w-5" />
                <button
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                    selectedIds.includes(user.id) ? 'bg-pink-500 border-pink-500' : 'border-slate-300 hover:border-pink-300'
                  }`}
                >
                  {selectedIds.includes(user.id) && <CheckCircle2 size={10} className="text-white" />}
                </button>
                <User size={14} className="text-slate-400 shrink-0 ml-1" />
                <span className="text-sm text-slate-600 truncate">{user.name}</span>
                {user.email && <span className="text-xs text-slate-400 ml-1 truncate hidden sm:inline">{user.email}</span>}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const getSelectedUserNames = useCallback((nodes: DeptNodeWithUsers[]): UserBrief[] => {
    let result: UserBrief[] = [];
    for (const node of nodes) {
      result = result.concat(node.users.filter(u => selectedIds.includes(u.id)));
      if (node.children) result = result.concat(getSelectedUserNames(node.children));
    }
    return result;
  }, [selectedIds]);

  const selectedUsers = getSelectedUserNames(deptTree);

  return (
    <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm">
      {selectedUsers.length > 0 && (
        <div className="border-b border-slate-100 bg-pink-50/45 p-3">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-pink-500">已选成员</div>
          <div className="flex flex-wrap gap-1">
            {selectedUsers.slice(0, 10).map(u => (
              <span key={u.id} className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-xs text-pink-600 ring-1 ring-pink-100">
                {u.name}
                <button onClick={(e) => { e.stopPropagation(); toggleUser(u.id); }} className="text-pink-300 hover:text-pink-500">
                  <X size={10} />
                </button>
              </span>
            ))}
            {selectedUsers.length > 10 && (
              <span className="text-xs text-slate-400 px-1 py-0.5">+{selectedUsers.length - 10}人</span>
            )}
          </div>
        </div>
      )}
      <div className="border-b border-slate-100 bg-slate-50/60 p-3">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input
            type="text"
            className="h-11 rounded-2xl pl-9 text-sm"
            placeholder="搜索部门或人员..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>
      <div className="max-h-64 overflow-y-auto p-2">
        {deptTree.length === 0 ? (
          <div className="p-4 text-sm text-slate-400 text-center">暂无组织架构数据</div>
        ) : (
          deptTree.map(node => renderDeptNode(node, 0))
        )}
      </div>
      <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-2 text-xs text-slate-500">
        已选择 <span className="font-medium text-pink-500">{selectedUsers.length}</span> 人
      </div>
    </div>
  );
};

// ==================== 今日预订列表组件 ====================
interface RoomBookingsProps {
  roomId: string;
  onBookingsLoaded?: (roomId: string, bookings: SysScheduleEvent[]) => void;
}

const RoomBookings: React.FC<RoomBookingsProps> = ({ roomId, onBookingsLoaded }) => {
  const [bookings, setBookings] = useState<SysScheduleEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchBookings = async () => {
      try {
        const today = getLocalDateString();
        const res = await getRoomEvents(roomId, today);
        const list = Array.isArray(res) ? res : [];
        setBookings(list);
        onBookingsLoaded?.(roomId, list);
      } catch { 
        setBookings([]); 
        onBookingsLoaded?.(roomId, []);
      } finally { setLoading(false); }
    };
    fetchBookings();
  }, [roomId, onBookingsLoaded]);

  if (loading) return <div className="py-2 text-xs text-slate-400">正在读取今日预订...</div>;
  if (bookings.length === 0) {
    return (
      <div className="flex items-center gap-2 py-1 text-xs text-slate-400">
        <Calendar size={10} />
        今日暂无预订
      </div>
    );
  }

  const now = new Date();

  const fmt = (dateStr: string) => {
    try { const d = new Date(dateStr); return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`; }
    catch { return '--:--'; }
  };

  const getBookingStatus = (b: SysScheduleEvent) => {
    try {
      const start = new Date(b.startTime);
      const end = new Date(b.endTime);
      if (now >= start && now <= end) return 'ongoing';
      if (now > end) return 'ended';
      return 'upcoming';
    } catch { return 'upcoming'; }
  };

  const statusStyles: Record<string, { bg: string; text: string }> = {
    ongoing: { bg: 'bg-emerald-50', text: 'text-emerald-600' },
    ended: { bg: 'bg-slate-50', text: 'text-slate-400' },
    upcoming: { bg: 'bg-pink-50/50', text: 'text-pink-500' },
  };

  return (
    <div className="space-y-1">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1 text-xs font-medium text-slate-500"><Calendar size={10} /> 今日预订</div>
        <span className="rounded-full bg-pink-50 px-2 py-0.5 text-[11px] font-semibold text-pink-600">{bookings.length} 条</span>
      </div>
      {bookings.slice(0, 3).map((b, i) => {
        const status = getBookingStatus(b);
        const style = statusStyles[status];
        return (
          <div key={i} className={`flex items-center gap-2 rounded-xl border border-white px-2.5 py-2 text-xs ${style.bg}`}>
            <Clock size={10} className={`${status === 'ongoing' ? 'text-emerald-500' : status === 'ended' ? 'text-slate-400' : 'text-pink-400'} shrink-0`} />
            <span className={`${style.text} whitespace-nowrap font-medium`}>{fmt(b.startTime)}-{fmt(b.endTime)}</span>
            <span className={`${status === 'ended' ? 'text-slate-400 line-through' : 'text-slate-600'} truncate`}>{b.title}</span>
            {status === 'ongoing' && <span className="text-emerald-600 text-[10px] font-bold shrink-0">进行中</span>}
            {status === 'ended' && <span className="text-slate-400 text-[10px] shrink-0">已结束</span>}
          </div>
        );
      })}
      {bookings.length > 3 && <div className="text-xs text-slate-400 pl-5">还有 {bookings.length - 3} 条预订...</div>}
    </div>
  );
};

// ==================== 周日历视图组件 ====================
interface WeekCalendarProps {
  room: MeetingRoom;
  onClose: () => void;
  onBookRoom: (room: MeetingRoom, date: string, startTime: string, endTime: string) => void;
}

const WeekCalendar: React.FC<WeekCalendarProps> = ({ room, onClose, onBookRoom }) => {
  const [currentWeekStart, setCurrentWeekStart] = useState(getWeekStart(new Date()));
  const [events, setEvents] = useState<SysScheduleEvent[]>([]);
  const [loading, setLoading] = useState(false);

  // ===== 鼠标拖动选择时间段相关状态 =====
  const [isDragging, setIsDragging] = useState(false);
  const [dragDayIndex, setDragDayIndex] = useState<number | null>(null);
  const [dragStartHour, setDragStartHour] = useState<number | null>(null);
  const [dragEndHour, setDragEndHour] = useState<number | null>(null);

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(currentWeekStart);
    d.setDate(d.getDate() + i);
    return d;
  });

  const timeSlots = Array.from({ length: 14 }, (_, i) => i + 8); // 8:00 - 21:00

  useEffect(() => {
    const fetchWeekEvents = async () => {
      setLoading(true);
      try {
        const weekStartStr = getLocalDateString(currentWeekStart);
        const res = await getRoomWeekEvents(room.roomId.toString(), weekStartStr);
        setEvents(Array.isArray(res) ? res : []);
      } catch (e) {
        console.error('获取周预订失败', e);
        setEvents([]);
      } finally {
        setLoading(false);
      }
    };
    fetchWeekEvents();
  }, [room.roomId, currentWeekStart]);

  const goToPrevWeek = () => {
    const prev = new Date(currentWeekStart);
    prev.setDate(prev.getDate() - 7);
    setCurrentWeekStart(prev);
  };

  const goToNextWeek = () => {
    const next = new Date(currentWeekStart);
    next.setDate(next.getDate() + 7);
    setCurrentWeekStart(next);
  };

  const goToToday = () => {
    setCurrentWeekStart(getWeekStart(new Date()));
  };

  const isSlotBooked = (day: Date, hour: number): SysScheduleEvent | null => {
    const slotStart = new Date(day);
    slotStart.setHours(hour, 0, 0, 0);
    const slotEnd = new Date(slotStart);
    slotEnd.setHours(hour + 1, 0, 0, 0);

    return events.find(e => {
      try {
        const eventStart = new Date(e.startTime);
        const eventEnd = new Date(e.endTime);
        return (eventStart < slotEnd && eventEnd > slotStart);
      } catch {
        return false;
      }
    }) || null;
  };

  // ===== 判断某个格子是否在拖动选中范围内 =====
  const isSlotInDragRange = (dayIndex: number, hour: number): boolean => {
    if (!isDragging || dragDayIndex !== dayIndex || dragStartHour === null || dragEndHour === null) return false;
    const minHour = Math.min(dragStartHour, dragEndHour);
    const maxHour = Math.max(dragStartHour, dragEndHour);
    return hour >= minHour && hour <= maxHour;
  };

  // ===== 鼠标按下：开始拖动 =====
  const handleMouseDown = (dayIndex: number, hour: number, bookedEvent: SysScheduleEvent | null, isPast: boolean) => {
    if (bookedEvent || isPast) return;
    setIsDragging(true);
    setDragDayIndex(dayIndex);
    setDragStartHour(hour);
    setDragEndHour(hour);
  };

  // ===== 鼠标移入：扩展选择范围（仅同一天） =====
  const handleMouseEnter = (dayIndex: number, hour: number) => {
    if (!isDragging || dragDayIndex !== dayIndex) return;
    setDragEndHour(hour);
  };

  // ===== 鼠标松开：结束拖动，计算时间范围并触发预订 =====
  const handleMouseUp = () => {
    if (!isDragging || dragDayIndex === null || dragStartHour === null || dragEndHour === null) {
      setIsDragging(false);
      setDragDayIndex(null);
      setDragStartHour(null);
      setDragEndHour(null);
      return;
    }

    const minHour = Math.min(dragStartHour, dragEndHour);
    const maxHour = Math.max(dragStartHour, dragEndHour);
    const day = weekDays[dragDayIndex];

    // 检查选中范围内是否有冲突
    let hasConflict = false;
    for (let h = minHour; h <= maxHour; h++) {
      const checkDay = new Date(day);
      checkDay.setHours(h, 0, 0, 0);
      if (isSlotBooked(new Date(day), h) || checkDay < new Date()) {
        hasConflict = true;
        break;
      }
    }

    if (hasConflict) {
      toast.error('选中的时间范围内存在已预订或已过期的时段');
    } else {
      const dateStr = getLocalDateString(day);
      const startTimeStr = `${minHour.toString().padStart(2, '0')}:00`;
      // 结束时间 = 最大小时 + 1（例如选了 9-11，结束时间为 12:00）
      const endTimeStr = `${(maxHour + 1).toString().padStart(2, '0')}:00`;
      onBookRoom(room, dateStr, startTimeStr, endTimeStr);
    }

    setIsDragging(false);
    setDragDayIndex(null);
    setDragStartHour(null);
    setDragEndHour(null);
  };

  // ===== 全局鼠标松开监听，防止鼠标在格子外松开导致状态残留 =====
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      if (isDragging) {
        handleMouseUp();
      }
    };
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
  }, [isDragging, dragDayIndex, dragStartHour, dragEndHour]); // eslint-disable-line react-hooks/exhaustive-deps

  const formatDate = (d: Date) => {
    const month = d.getMonth() + 1;
    const date = d.getDate();
    const dayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    return `${month}/${date} ${dayNames[d.getDay()]}`;
  };

  const isToday = (d: Date) => {
    const today = new Date();
    return d.getDate() === today.getDate() && 
           d.getMonth() === today.getMonth() && 
           d.getFullYear() === today.getFullYear();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/28 p-4 backdrop-blur-sm">
      <div className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-[32px] border border-white/80 bg-white/95 shadow-[0_28px_72px_rgba(15,23,42,0.18)] backdrop-blur-xl">
        <div className="relative border-b border-slate-100 px-6 pb-5 pt-6">
          <div className="absolute inset-x-0 top-0 h-32 bg-[radial-gradient(circle_at_top_right,rgba(244,114,182,0.16),transparent_70%)]" />
          <div className="relative flex items-start justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-pink-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-pink-600 ring-1 ring-pink-100">
                <CalendarDays size={14} />
                周视图预订
              </div>
              <h3 className="mt-4 text-2xl font-bold tracking-tight text-slate-900">周日历 - {room.name}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-500">点击空闲时段快速预订，拖动可以一次选择连续时间段。</p>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700">
              <X size={18} />
            </Button>
          </div>
        </div>

        <div className="border-b border-slate-100 px-6 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex h-11 items-center overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <button onClick={goToPrevWeek} className="inline-flex h-11 w-11 items-center justify-center text-slate-500 transition hover:bg-pink-50 hover:text-pink-600">
                <ChevronLeft size={18} />
              </button>
              <div className="h-6 w-px bg-slate-200" />
              <button onClick={goToNextWeek} className="inline-flex h-11 w-11 items-center justify-center text-slate-500 transition hover:bg-pink-50 hover:text-pink-600">
                <ChevronRight size={18} />
              </button>
            </div>
            <div className="text-sm font-semibold text-slate-700">
              {currentWeekStart.getFullYear()}年{currentWeekStart.getMonth() + 1}月
            </div>
            <Button variant="outline" onClick={goToToday} className="h-11 rounded-2xl bg-white px-5">
              今天
            </Button>
          </div>
        </div>

        <div className="border-b border-slate-100 px-6 py-3">
          <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500">
            <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded border border-emerald-200 bg-emerald-50"></span> 空闲可选</span>
            <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded border border-red-200 bg-red-100"></span> 已预订</span>
            <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded border border-slate-200 bg-slate-50"></span> 已过期</span>
            <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded border border-pink-300 bg-pink-100"></span> 拖动选中</span>
            <span className="ml-auto text-slate-400">按住鼠标拖动可快速选择连续时间段</span>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-4">
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-pink-500"></div>
            </div>
          ) : (
            <div className="min-w-[800px]">
              <div className="grid grid-cols-8 gap-2 mb-2">
                <div className="text-xs font-medium text-slate-500 text-center">时间</div>
                {weekDays.map((day, i) => (
                  <div key={i} className={`text-xs font-medium text-center py-2 rounded-lg ${isToday(day) ? 'bg-pink-50 text-pink-500' : 'text-slate-600'}`}>
                    {formatDate(day)}
                  </div>
                ))}
              </div>
              {timeSlots.map(hour => (
                <div key={hour} className="grid grid-cols-8 gap-2 mb-1">
                  <div className="text-xs text-slate-500 text-center py-2">
                    {hour.toString().padStart(2, '0')}:00
                  </div>
                  {weekDays.map((day, i) => {
                    const bookedEvent = isSlotBooked(day, hour);
                    // 用新的 Date 避免修改原始 day 对象
                    const slotTime = new Date(day);
                    slotTime.setHours(hour, 0, 0, 0);
                    const isPast = slotTime < new Date();
                    const inDragRange = isSlotInDragRange(i, hour);
                    return (
                      <div
                        key={i}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          handleMouseDown(i, hour, bookedEvent, isPast);
                        }}
                        onMouseEnter={() => handleMouseEnter(i, hour)}
                        onMouseUp={handleMouseUp}
                        className={`text-xs py-2 px-1 rounded-lg text-center select-none transition-colors ${
                          bookedEvent
                            ? 'bg-red-100 text-red-700 cursor-not-allowed'
                            : isPast
                              ? 'bg-slate-50 text-slate-300 cursor-not-allowed'
                              : inDragRange
                                ? 'bg-pink-100 text-pink-700 ring-2 ring-pink-300'
                                : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 cursor-pointer'
                        }`}
                        title={
                          bookedEvent
                            ? bookedEvent.title
                            : isPast
                              ? '已过期'
                              : inDragRange
                                ? '已选中'
                                : '点击或拖动选择时间段'
                        }
                      >
                        {bookedEvent ? '已预订' : isPast ? '-' : inDragRange ? '✓' : '空闲'}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ==================== 会议室表单弹窗 ====================
const RoomFormModal: React.FC<{
  visible: boolean; room: Partial<MeetingRoom> | null; onClose: () => void; onSubmit: (room: Partial<MeetingRoom>) => void;
}> = ({ visible, room, onClose, onSubmit }) => {
  const [form, setForm] = useState<Partial<MeetingRoom>>({ name: '', capacity: 10, location: '', equipment: '[]', status: '1' });
  const [equipmentInput, setEquipmentInput] = useState('');

  useEffect(() => {
    if (room) { 
      setForm({ ...room }); 
      try { 
        setEquipmentInput(JSON.parse(room.equipment || '[]').join(', ')); 
      } catch { 
        setEquipmentInput(''); 
      } 
    } else { 
      setForm({ name: '', capacity: 10, location: '', equipment: '[]', status: '1' }); 
      setEquipmentInput(''); 
    }
  }, [room, visible]);

  if (!visible) return null;

  const handleSubmit = () => {
    if (!form.name?.trim()) { toast.error('请输入会议室名称'); return; }
    if (!form.location?.trim()) { toast.error('请输入会议室位置'); return; }
    if (!form.capacity || form.capacity <= 0) { toast.error('请输入有效的容纳人数'); return; }
    const eqArr = equipmentInput.split(/[,，]/).map(s => s.trim()).filter(Boolean);
    onSubmit({ ...form, equipment: JSON.stringify(eqArr) });
  };

  const isEdit = room && room.roomId;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/28 p-4 backdrop-blur-sm">
      <div className="flex w-full max-w-lg flex-col overflow-hidden rounded-[32px] border border-white/80 bg-white/95 shadow-[0_28px_72px_rgba(15,23,42,0.18)] backdrop-blur-xl animate-in fade-in zoom-in duration-200">
        <div className="relative border-b border-slate-100 px-6 pb-5 pt-6">
          <div className="absolute inset-x-0 top-0 h-28 bg-[radial-gradient(circle_at_top_right,rgba(244,114,182,0.16),transparent_70%)]" />
          <div className="relative flex items-start justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-pink-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-pink-600 ring-1 ring-pink-100">
                <Settings size={14} />
                会议室配置
              </div>
              <h3 className="mt-4 text-2xl font-bold tracking-tight text-slate-900">{isEdit ? '编辑会议室' : '新增会议室'}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-500">完善会议室名称、位置、容量与设备信息，确保前台预订信息准确。</p>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700">
              <X size={18} />
            </Button>
          </div>
        </div>
        <div className="space-y-4 p-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">会议室名称 <span className="text-red-500">*</span></label>
            <Input className="h-12 rounded-2xl" type="text" value={form.name || ''} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="例如：大会议室A" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">位置 <span className="text-red-500">*</span></label>
              <Input className="h-12 rounded-2xl" type="text" value={form.location || ''} onChange={e => setForm({ ...form, location: e.target.value })} placeholder="例如：3楼东侧" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">容纳人数 <span className="text-red-500">*</span></label>
              <Input className="h-12 rounded-2xl" type="number" min={1} value={form.capacity || ''} onChange={e => setForm({ ...form, capacity: parseInt(e.target.value) || 0 })} placeholder="例如：50" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">设备配置</label>
            <Input className="h-12 rounded-2xl" type="text" value={equipmentInput} onChange={e => setEquipmentInput(e.target.value)} placeholder="多个设备用逗号分隔，例如：投影仪, 白板, 音响" />
            <p className="text-xs text-slate-400 mt-1">多个设备用逗号分隔</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">状态</label>
            <Select value={form.status || '1'} onValueChange={v => setForm({...form, status: v as '0' | '1'})}>
              <SelectTrigger className="h-12 rounded-2xl">
                <SelectValue placeholder="请选择" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">可用</SelectItem>
                <SelectItem value="0">维护中</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex justify-end gap-3 border-t border-slate-100 bg-slate-50/80 px-6 py-5">
          <Button variant="outline" onClick={onClose} className="h-11 rounded-2xl">
            取消
          </Button>
          <Button onClick={handleSubmit} className="h-11 rounded-2xl bg-pink-500 text-white hover:bg-pink-600">
            <CheckCircle2 size={16} className="mr-2" />{isEdit ? '保存修改' : '确认新增'}
          </Button>
        </div>
      </div>
    </div>
  );
};

// ==================== 删除确认弹窗 ====================
const DeleteConfirmModal: React.FC<{
  visible: boolean; roomName: string; onClose: () => void; onConfirm: () => void;
}> = ({ visible, roomName, onClose, onConfirm }) => {
  if (!visible) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/28 p-4 backdrop-blur-sm">
      <div className="flex w-full max-w-sm flex-col overflow-hidden rounded-[32px] border border-white/80 bg-white/95 shadow-[0_28px_72px_rgba(15,23,42,0.18)] backdrop-blur-xl animate-in fade-in zoom-in duration-200">
        <div className="relative px-6 pb-5 pt-6">
          <div className="absolute inset-x-0 top-0 h-24 bg-[radial-gradient(circle_at_top_right,rgba(248,113,113,0.18),transparent_70%)]" />
          <div className="relative">
            <div className="inline-flex items-center gap-2 rounded-full bg-red-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-red-600 ring-1 ring-red-100">
              <Trash2 size={14} />
              删除确认
            </div>
            <h3 className="mt-4 text-2xl font-bold tracking-tight text-slate-900">确认删除</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">确定要删除会议室 <span className="font-semibold text-red-600">「{roomName}」</span> 吗？此操作不可撤销。</p>
          </div>
        </div>
        <div className="flex justify-end gap-3 border-t border-slate-100 bg-slate-50/80 px-6 py-5">
          <Button variant="outline" onClick={onClose} className="h-11 rounded-2xl">
            取消
          </Button>
          <Button variant="destructive" onClick={onConfirm} className="h-11 rounded-2xl">
            <Trash2 size={16} className="mr-2" />确认删除
          </Button>
        </div>
      </div>
    </div>
  );
};

// ==================== 主页面 ====================
export const MeetingRoomPage = () => {
  const [activeTab, setActiveTab] = useState<TabType>('rooms');
  const [rooms, setRooms] = useState<MeetingRoom[]>([]);
  const [loading, setLoading] = useState(false);
  const [deptTree, setDeptTree] = useState<DeptNodeWithUsers[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<MeetingRoom | null>(null);
  const [bookingForm, setBookingForm] = useState({ 
    title: '', 
    date: getLocalDateString(), 
    startTime: '09:00', 
    endTime: '10:00', 
    description: '' 
  });
  const [selectedAttendees, setSelectedAttendees] = useState<string[]>([]);
  const [roomFormVisible, setRoomFormVisible] = useState(false);
  const [editingRoom, setEditingRoom] = useState<Partial<MeetingRoom> | null>(null);
  const [deleteConfirmVisible, setDeleteConfirmVisible] = useState(false);
  const [deletingRoom, setDeletingRoom] = useState<MeetingRoom | null>(null);
  const [manageMode, setManageMode] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [roomBookingsMap, setRoomBookingsMap] = useState<Record<string, SysScheduleEvent[]>>({});
  const [weekCalendarRoom, setWeekCalendarRoom] = useState<MeetingRoom | null>(null);
  const [myBookings, setMyBookings] = useState<SysScheduleEvent[]>([]);
  const [bookingsFilter, setBookingsFilter] = useState<'all' | 'upcoming' | 'past'>('upcoming');
  const [stats, setStats] = useState<RoomUsageStats[]>([]);
  const [statusFilter, setStatusFilter] = useState<'all' | RoomRealtimeStatus>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const handleBookingsLoaded = useCallback((roomId: string, bookings: SysScheduleEvent[]) => {
    setRoomBookingsMap(prev => ({ ...prev, [roomId]: bookings }));
  }, []);

  const fetchRooms = async () => {
    setLoading(true);
    try { 
      setRooms(await getMeetingRooms()); 
    } catch (e) { 
      console.error("Fetch rooms failed", e); 
    } finally { 
      setLoading(false); 
    }
  };

  const fetchOrgData = async () => {
    try {
      const [rawUsers, rawDeptTree] = await Promise.all([getUserListForAttendees(), getDeptTree()]);
      const userList = Array.isArray(rawUsers) ? rawUsers : [];
      const mapped: UserBrief[] = userList.map((u: UserBriefItem) => ({
        id: String(u.userId), name: u.nickName || u.userName, email: u.email, deptId: u.deptId, deptName: u.deptName,
      }));
      const tree = Array.isArray(rawDeptTree) ? rawDeptTree : [];
      setDeptTree(buildDeptTreeWithUsers(tree, mapped));
    } catch (e) { 
      console.error("Fetch org data failed", e); 
    }
  };

  const fetchMyBookings = async () => {
    try {
      const status = bookingsFilter === 'all' ? undefined : bookingsFilter;
      const res = await getMyBookings(status);
      setMyBookings(Array.isArray(res) ? res : []);
    } catch (e) {
      console.error("Fetch my bookings failed", e);
      setMyBookings([]);
    }
  };

  const fetchStats = async () => {
    try {
      const res = await getRoomUsageStats();
      setStats(Array.isArray(res) ? res : []);
    } catch (e) {
      console.error("Fetch stats failed", e);
      setStats([]);
    }
  };

  useEffect(() => { 
    fetchRooms(); 
    fetchOrgData(); 
  }, []);

  useEffect(() => {
    if (activeTab === 'my-bookings') {
      fetchMyBookings();
    } else if (activeTab === 'stats') {
      fetchStats();
    }
  }, [activeTab, bookingsFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const timer = setInterval(() => {
      setRoomBookingsMap(prev => ({ ...prev }));
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  const handleBooking = async () => {
    if (!selectedRoom) return;
    if (!bookingForm.title || !bookingForm.date || !bookingForm.startTime || !bookingForm.endTime) { 
      toast.error("请完善预订信息"); 
      return; 
    }
    const startDate = new Date(`${bookingForm.date}T${bookingForm.startTime}:00`);
    const endDate = new Date(`${bookingForm.date}T${bookingForm.endTime}:00`);
    if (startDate >= endDate) { 
      toast.error("结束时间必须晚于开始时间"); 
      return; 
    }
    const startDateTime = toBackendDateString(startDate);
    const endDateTime = toBackendDateString(endDate);
    if (!startDateTime || !endDateTime) { 
      toast.error("日期格式错误"); 
      return; 
    }
    try {
      await createEvent({
        title: bookingForm.title, 
        description: bookingForm.description,
        startTime: startDateTime, 
        endTime: endDateTime,
        isAllDay: false, 
        type: 'MEETING', 
        roomId: selectedRoom.roomId,
        attendees: JSON.stringify(selectedAttendees)
      });
      toast.success("预订成功");
      setSelectedRoom(null);
      setBookingForm({ title: '', date: getLocalDateString(), startTime: '09:00', endTime: '10:00', description: '' });
      setSelectedAttendees([]);
      setRefreshKey(prev => prev + 1);
      setWeekCalendarRoom(null);
    } catch (e: any) { 
      toast.error("预订失败: " + (e.response?.data?.msg || e.message || "时间冲突")); 
    }
  };

  const handleCancelBooking = async (eventId: string) => {
    try {
      await cancelBooking(Number(eventId));
      toast.success("预订已取消");
      fetchMyBookings();
      setRefreshKey(prev => prev + 1);
    } catch (e: any) {
      toast.error("取消失败: " + (e.response?.data?.msg || e.message || "未知错误"));
    }
  };

  const handleAddRoom = () => { 
    setEditingRoom(null); 
    setRoomFormVisible(true); 
  };
  
  const handleEditRoom = (room: MeetingRoom) => { 
    setEditingRoom({ ...room }); 
    setRoomFormVisible(true); 
  };
  
  const handleDeleteRoom = (room: MeetingRoom) => { 
    setDeletingRoom(room); 
    setDeleteConfirmVisible(true); 
  };

  const handleRoomFormSubmit = async (roomData: Partial<MeetingRoom>) => {
    try {
      if (roomData.roomId) { 
        await updateMeetingRoom(roomData as MeetingRoom); 
        toast.success("会议室更新成功"); 
      } else { 
        await createMeetingRoom(roomData); 
        toast.success("会议室创建成功"); 
      }
      setRoomFormVisible(false); 
      setEditingRoom(null); 
      fetchRooms();
    } catch (e: any) { 
      toast.error("操作失败: " + (e.response?.data?.msg || e.message || "未知错误")); 
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deletingRoom) return;
    try {
      await deleteMeetingRoom(deletingRoom.roomId.toString());
      toast.success("会议室已删除"); 
      setDeleteConfirmVisible(false); 
      setDeletingRoom(null); 
      fetchRooms();
    } catch (e: any) { 
      toast.error("删除失败: " + (e.response?.data?.msg || e.message || "未知错误")); 
    }
  };

  const handleWeekCalendarBook = (room: MeetingRoom, date: string, startTime: string, endTime: string) => {
    setWeekCalendarRoom(null);
    setSelectedRoom(room);
    setBookingForm({
      title: '',
      date: date,
      startTime: startTime,
      endTime: endTime,
      description: ''
    });
    setSelectedAttendees([]);
  };

  const parseEquipment = (json: string) => { 
    try { 
      return JSON.parse(json); 
    } catch { 
      return []; 
    } 
  };

  const filteredRooms = rooms.filter(room => {
    const matchesSearch = !searchQuery || 
      room.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      room.location.toLowerCase().includes(searchQuery.toLowerCase());
    
    if (!matchesSearch) return false;
    
    if (statusFilter === 'all') return true;
    
    const realtimeStatus = getRoomRealtimeStatus(room, roomBookingsMap[room.roomId] || []);
    return realtimeStatus === statusFilter;
  });

  const formatDateTime = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
    } catch {
      return '--';
    }
  };

  const getBookingStatusBadge = (booking: SysScheduleEvent) => {
    const now = new Date();
    const start = new Date(booking.startTime);
    const end = new Date(booking.endTime);
    
    if (now < start) {
      return <span className="px-2 py-0.5 bg-pink-50 text-pink-600 text-xs rounded-full">待开始</span>;
    } else if (now >= start && now <= end) {
      return <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-xs rounded-full">进行中</span>;
    } else {
      return <span className="px-2 py-0.5 bg-slate-100 text-slate-500 text-xs rounded-full">已结束</span>;
    }
  };

  const now = new Date();
  const dateLabel = formatDateCN(now);
  const timeLabel = now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  const roomStatusList = rooms.map(room => ({
    room,
    realtimeStatus: getRoomRealtimeStatus(room, roomBookingsMap[room.roomId] || []),
  }));
  const availableCount = roomStatusList.filter(item => item.realtimeStatus === 'available').length;
  const inUseCount = roomStatusList.filter(item => item.realtimeStatus === 'in-use').length;
  const maintenanceCount = roomStatusList.filter(item => item.realtimeStatus === 'maintenance').length;
  const totalCapacity = rooms.reduce((sum, room) => sum + (room.capacity || 0), 0);
  const todayBookingCount = Object.values(roomBookingsMap).reduce((sum, list) => sum + list.length, 0);
  const usageSummary = activeTab === 'rooms'
    ? `当前共有 ${rooms.length} 间会议室，其中 ${availableCount} 间空闲，可直接发起预订。`
    : activeTab === 'my-bookings'
      ? `集中查看你的会议室预订记录，及时管理待开始、进行中和已结束的安排。`
      : `按预订次数、使用时长和利用率查看会议室资源的整体使用情况。`;
  const activeTabTitle = activeTab === 'rooms' ? '会议室列表' : activeTab === 'my-bookings' ? '我的预订' : '使用统计';
  const focusItems = [
    { label: '当前视图', value: activeTabTitle, hint: activeTab === 'rooms' ? '浏览与预订会议室' : activeTab === 'my-bookings' ? '管理个人预订记录' : '查看会议室使用表现', tone: 'bg-pink-50 text-pink-600' },
    { label: '空闲会议室', value: `${availableCount} 间`, hint: '当前可快速发起预订的会议室数量', tone: 'bg-emerald-50 text-emerald-600' },
    { label: '今日预订', value: `${todayBookingCount} 条`, hint: '已载入今日会议室预订记录', tone: 'bg-amber-50 text-amber-600' },
  ];
  const metricCards = [
    { label: '会议室总数', value: rooms.length, desc: '当前已配置的房间数量', icon: <Monitor size={20} />, iconClass: 'bg-pink-50 text-pink-600', ringClass: 'ring-pink-100' },
    { label: '空闲房间', value: availableCount, desc: '可立即发起预订', icon: <CheckCircle2 size={20} />, iconClass: 'bg-emerald-50 text-emerald-600', ringClass: 'ring-emerald-100' },
    { label: '使用中', value: inUseCount, desc: '当前被占用的房间', icon: <Clock size={20} />, iconClass: 'bg-amber-50 text-amber-600', ringClass: 'ring-amber-100' },
    { label: '总座位数', value: totalCapacity, desc: '全部会议室可容纳人数', icon: <Users size={20} />, iconClass: 'bg-slate-100 text-slate-600', ringClass: 'ring-slate-200' },
  ];
  const topStatRoom = stats.length > 0 ? [...stats].sort((a, b) => b.bookingCount - a.bookingCount)[0] : null;

  return (
    <div className="relative min-h-screen pb-6">
      <div className="pointer-events-none fixed inset-0 z-[-1] overflow-hidden">
        <div className="absolute left-[-10%] top-[-8%] h-[32rem] w-[32rem] rounded-full bg-pink-300/18 blur-[120px]" />
        <div className="absolute right-[-12%] top-[12%] h-[38rem] w-[38rem] rounded-full bg-rose-200/20 blur-[140px]" />
        <div className="absolute bottom-[-12%] left-[18%] h-[26rem] w-[26rem] rounded-full bg-amber-100/45 blur-[110px]" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(248,250,252,0.55),rgba(255,255,255,0.8))]" />
      </div>

      <div className="relative z-10 space-y-6">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_360px]">
          <Card className="overflow-hidden rounded-[34px] border-white/80 bg-white/78 shadow-[0_20px_60px_rgba(15,23,42,0.05)] backdrop-blur-xl">
            <div className="relative p-7 sm:p-8">
              <div className="absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_top_right,rgba(244,114,182,0.16),transparent_55%)]" />
              <div className="absolute -right-16 top-8 h-48 w-48 rounded-full bg-pink-200/30 blur-3xl" />
              <div className="absolute bottom-0 left-1/3 h-24 w-24 rounded-full bg-amber-100/55 blur-2xl" />

              <div className="relative">
                <div className="flex flex-wrap items-center gap-3 text-sm font-medium text-slate-500">
                  <span className="inline-flex items-center gap-2 rounded-full bg-pink-50 px-3 py-1.5 text-pink-600 ring-1 ring-pink-100">
                    <Calendar size={14} />
                    {dateLabel}
                  </span>
                  <span className="rounded-full bg-white/80 px-3 py-1.5 ring-1 ring-slate-200/80">{timeLabel}</span>
                  <span className="rounded-full bg-white/80 px-3 py-1.5 ring-1 ring-slate-200/80">{activeTabTitle}</span>
                </div>

                <div className="mt-6 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                  <div className="max-w-2xl">
                    <div className="inline-flex items-center gap-2 rounded-full bg-white/75 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-pink-600 ring-1 ring-pink-100">
                      <Sparkles size={14} />
                      会议室工作台
                    </div>
                    <h1 className="mt-5 text-4xl font-bold tracking-tight text-slate-950 sm:text-[2.85rem]">会议室资源</h1>
                    <p className="mt-4 max-w-2xl text-base leading-8 text-slate-600">{usageSummary}</p>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <Button className="h-12 rounded-2xl bg-pink-500 px-6 text-white shadow-[0_16px_32px_rgba(236,72,153,0.24)] hover:bg-pink-600" onClick={() => setActiveTab('my-bookings')}>
                      我的预订
                      <ArrowRight size={16} className="ml-2" />
                    </Button>
                    <Button variant="outline" className="h-12 rounded-2xl bg-white/85 px-6" onClick={() => setActiveTab('stats')}>
                      <BarChart3 size={16} className="mr-2 text-pink-500" />
                      使用统计
                    </Button>
                    {activeTab === 'rooms' && (
                      <Button variant={manageMode ? 'default' : 'outline'} className="h-12 rounded-2xl px-6" onClick={() => setManageMode(!manageMode)}>
                        <Settings size={16} className="mr-2" />
                        {manageMode ? '退出管理' : '管理模式'}
                      </Button>
                    )}
                  </div>
                </div>

                <div className="mt-7 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-[24px] border border-white/80 bg-white/72 px-4 py-4 shadow-sm backdrop-blur">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">会议室总数</div>
                    <div className="mt-2 text-2xl font-bold tracking-tight text-slate-900">{rooms.length}</div>
                    <div className="mt-1 text-xs leading-5 text-slate-500">当前已配置的会议室数量</div>
                  </div>
                  <div className="rounded-[24px] border border-white/80 bg-white/72 px-4 py-4 shadow-sm backdrop-blur">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">空闲房间</div>
                    <div className="mt-2 text-2xl font-bold tracking-tight text-slate-900">{availableCount}</div>
                    <div className="mt-1 text-xs leading-5 text-slate-500">可立即发起预订的会议室</div>
                  </div>
                  <div className="rounded-[24px] border border-white/80 bg-white/72 px-4 py-4 shadow-sm backdrop-blur">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">今日预订</div>
                    <div className="mt-2 text-2xl font-bold tracking-tight text-slate-900">{todayBookingCount}</div>
                    <div className="mt-1 text-xs leading-5 text-slate-500">当前已载入的今日预订记录</div>
                  </div>
                </div>
              </div>
            </div>
          </Card>

          <Card className="rounded-[34px] border-white/80 bg-white/82 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.04)] backdrop-blur-xl">
            <SectionHeader eyebrow="今日焦点" title="今天先看这些" />
            <div className="mt-5 space-y-3">
              {focusItems.map(item => (
                <div key={item.label} className="flex items-start gap-3 rounded-[24px] border border-slate-100 bg-white px-4 py-4">
                  <div className={`rounded-2xl p-3 ${item.tone}`}>
                    <CircleDot size={16} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-semibold text-slate-900">{item.label}</div>
                      <div className="text-xs font-semibold text-slate-400">{item.value}</div>
                    </div>
                    <div className="mt-1 text-xs leading-5 text-slate-500">{item.hint}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-5 grid grid-cols-3 gap-3">
              <div className="rounded-[24px] border border-slate-100 bg-slate-50/80 px-4 py-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">使用中</div>
                <div className="mt-2 text-xl font-bold tracking-tight text-slate-900">{inUseCount}</div>
              </div>
              <div className="rounded-[24px] border border-slate-100 bg-slate-50/80 px-4 py-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">维护中</div>
                <div className="mt-2 text-xl font-bold tracking-tight text-slate-900">{maintenanceCount}</div>
              </div>
              <div className="rounded-[24px] border border-slate-100 bg-slate-50/80 px-4 py-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">总座位数</div>
                <div className="mt-2 text-xl font-bold tracking-tight text-slate-900">{totalCapacity}</div>
              </div>
            </div>
          </Card>
        </div>

        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          {metricCards.map(card => (
            <div key={card.label}>
              <Card className={`rounded-[28px] border-white/80 bg-white/78 p-5 shadow-[0_16px_40px_rgba(15,23,42,0.04)] backdrop-blur-xl ring-1 ${card.ringClass}`}>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-sm font-medium text-slate-500">{card.label}</div>
                    <div className="mt-3 text-3xl font-bold tracking-tight text-slate-900">{card.value}</div>
                    <div className="mt-2 text-xs leading-5 text-slate-400">{card.desc}</div>
                  </div>
                  <div className={`rounded-2xl p-3 ${card.iconClass}`}>{card.icon}</div>
                </div>
              </Card>
            </div>
          ))}
        </div>

        <Card className="rounded-[32px] border-white/80 bg-white/78 p-6 shadow-[0_18px_48px_rgba(15,23,42,0.05)] backdrop-blur-xl">
          <div className="flex flex-col gap-5">
            <div className="rounded-[28px] border border-slate-100 bg-gradient-to-r from-white via-pink-50/35 to-white p-5">
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                <div className="min-w-0">
                  <SectionHeader eyebrow="会议室工作区" title={activeTabTitle} />
                  <div className="mt-2 text-sm leading-6 text-slate-500">
                    {activeTab === 'rooms'
                      ? '按状态筛选会议室，查看今日预订，并快速发起预订或管理房间。'
                      : activeTab === 'my-bookings'
                        ? '集中查看你的会议室预订记录，及时取消尚未开始的安排。'
                        : '通过预订次数、使用时长和利用率查看会议室使用表现。'}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3 lg:justify-end">
                  <div className="inline-flex h-11 items-center rounded-2xl bg-slate-100 p-1">
                    <button type="button" onClick={() => setActiveTab('rooms')} className={`flex items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold transition ${activeTab === 'rooms' ? 'bg-white text-pink-600 shadow-[0_8px_20px_rgba(15,23,42,0.08)]' : 'text-slate-500 hover:text-slate-700'}`}>
                      <Monitor size={16} className="mr-2" />
                      会议室列表
                    </button>
                    <button type="button" onClick={() => setActiveTab('my-bookings')} className={`flex items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold transition ${activeTab === 'my-bookings' ? 'bg-white text-pink-600 shadow-[0_8px_20px_rgba(15,23,42,0.08)]' : 'text-slate-500 hover:text-slate-700'}`}>
                      <CalendarDays size={16} className="mr-2" />
                      我的预订
                    </button>
                    <button type="button" onClick={() => setActiveTab('stats')} className={`flex items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold transition ${activeTab === 'stats' ? 'bg-white text-pink-600 shadow-[0_8px_20px_rgba(15,23,42,0.08)]' : 'text-slate-500 hover:text-slate-700'}`}>
                      <BarChart3 size={16} className="mr-2" />
                      使用统计
                    </button>
                  </div>

                  {activeTab === 'rooms' && manageMode && (
                    <Button className="h-11 rounded-2xl bg-emerald-600 px-5 text-white hover:bg-emerald-700" onClick={handleAddRoom}>
                      <Plus size={16} className="mr-2" />
                      新增会议室
                    </Button>
                  )}
                </div>
              </div>
            </div>

            {activeTab === 'rooms' && (
              <>
                <div className="rounded-[24px] border border-slate-100 bg-white/85 p-4 shadow-sm">
                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_240px]">
                    <div className="relative">
                      <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <Input
                        type="text"
                        placeholder="搜索会议室名称或位置..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="h-12 rounded-2xl pl-10"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <Filter size={16} className="text-slate-500" />
                      <Select value={statusFilter} onValueChange={v => setStatusFilter(v as 'all' | RoomRealtimeStatus)}>
                        <SelectTrigger className="h-12 rounded-2xl">
                          <SelectValue placeholder="请选择" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">全部状态</SelectItem>
                          <SelectItem value="available">空闲</SelectItem>
                          <SelectItem value="in-use">使用中</SelectItem>
                          <SelectItem value="maintenance">维护中</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                {loading && (
                  <div className="flex justify-center py-14">
                    <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-pink-500" />
                  </div>
                )}

                {!loading && filteredRooms.length === 0 && (
                  <div className="rounded-[28px] border border-dashed border-slate-200 bg-slate-50/80 px-6 py-16 text-center">
                    <Monitor size={48} className="mx-auto mb-4 text-slate-300" />
                    <p className="mb-2 text-lg text-slate-500">{searchQuery || statusFilter !== 'all' ? '没有找到符合条件的会议室' : '暂无会议室'}</p>
                    {!searchQuery && statusFilter === 'all' && (
                      <>
                        <p className="mb-6 text-sm text-slate-400">进入管理模式后可以新增会议室</p>
                        <Button onClick={() => { setManageMode(true); handleAddRoom(); }} className="rounded-2xl bg-pink-500 px-6 text-white hover:bg-pink-600">
                          <Plus size={16} className="mr-2" />
                          新增第一个会议室
                        </Button>
                      </>
                    )}
                  </div>
                )}

                {!loading && filteredRooms.length > 0 && (
                  <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
                    {filteredRooms.map(room => {
                      const realtimeStatus = getRoomRealtimeStatus(room, roomBookingsMap[room.roomId] || []);
                      const statusCfg = roomStatusConfig[realtimeStatus];
                      const StatusIcon = realtimeStatus === 'available' ? CheckCircle2 : realtimeStatus === 'in-use' ? Clock : XCircle;
                      return (
                        <Card key={room.roomId} className="overflow-hidden rounded-[28px] border-white/80 bg-white/82 shadow-[0_16px_40px_rgba(15,23,42,0.04)] backdrop-blur-xl transition hover:-translate-y-1 hover:shadow-[0_22px_46px_rgba(15,23,42,0.08)]">
                          <div className="relative flex h-36 items-center justify-center bg-[linear-gradient(180deg,rgba(248,250,252,0.92),rgba(255,255,255,0.78))]">
                            {manageMode && (
                              <TableRowActions
                                wrap={false}
                                className="absolute left-4 top-4 z-10"
                                actions={[
                                  { label: '编辑', icon: <Pencil size={14} />, onClick: () => handleEditRoom(room), tone: 'primary', className: 'bg-white/90 backdrop-blur-sm shadow-sm' },
                                  { label: '删除', icon: <Trash2 size={14} />, onClick: () => handleDeleteRoom(room), tone: 'danger', className: 'bg-white/90 backdrop-blur-sm shadow-sm' },
                                ]}
                              />
                            )}
                            <Monitor size={48} className="text-slate-300" />
                            <div className={`absolute right-4 top-4 flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold ${statusCfg.bg}`}>
                              <StatusIcon size={12} />
                              {statusCfg.label}
                            </div>
                          </div>

                          <div className="p-5">
                            <h3 className="text-xl font-bold tracking-tight text-slate-900">{room.name}</h3>
                            <div className="mt-2 flex items-center gap-4 text-xs text-slate-500">
                              <span className="flex items-center gap-1"><MapPin size={12} className="text-pink-400" />{room.location}</span>
                              <span className="flex items-center gap-1"><Users size={12} className="text-pink-400" />{room.capacity} 人</span>
                            </div>

                            <div className="mt-4 flex flex-wrap gap-2">
                              {parseEquipment(room.equipment).map((eq: string, i: number) => (
                                <span key={i} className="rounded-full border border-slate-100 bg-slate-50 px-2.5 py-1 text-xs text-slate-600">{eq}</span>
                              ))}
                              {parseEquipment(room.equipment).length === 0 && <span className="text-xs text-slate-400">暂无设备信息</span>}
                            </div>

                            <div className="mt-4 rounded-[20px] border border-slate-100 bg-slate-50/80 px-3 py-3">
                              <RoomBookings key={`${room.roomId}-${refreshKey}`} roomId={room.roomId.toString()} onBookingsLoaded={handleBookingsLoaded} />
                            </div>

                            {!manageMode && (
                              <div className="mt-4 flex gap-2">
                                <Button
                                  variant="secondary"
                                  onClick={() => {
                                    setSelectedRoom(room);
                                    setSelectedAttendees([]);
                                    setBookingForm({ title: '', date: getLocalDateString(), startTime: '09:00', endTime: '10:00', description: '' });
                                  }}
                                  disabled={realtimeStatus === 'maintenance'}
                                  className="h-11 flex-1 rounded-2xl"
                                >
                                  立即预订
                                </Button>
                                <Button
                                  variant="outline"
                                  onClick={() => setWeekCalendarRoom(room)}
                                  disabled={realtimeStatus === 'maintenance'}
                                  className="h-11 rounded-2xl px-4"
                                  title="周日历"
                                >
                                  <CalendarDays size={18} />
                                </Button>
                              </div>
                            )}

                            {manageMode && (
                              <div className="mt-4">
                                <TableRowActions
                                  wrap={false}
                                  className="w-full"
                                  actions={[
                                    { label: '编辑', icon: <Pencil size={14} />, onClick: () => handleEditRoom(room), tone: 'primary', className: 'flex-1 justify-center' },
                                    { label: '删除', icon: <Trash2 size={14} />, onClick: () => handleDeleteRoom(room), tone: 'danger', className: 'flex-1 justify-center' },
                                  ]}
                                />
                              </div>
                            )}
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </>
            )}

            {activeTab === 'my-bookings' && (
              <div className="space-y-4">
                <div className="rounded-[24px] border border-slate-100 bg-white/85 p-4 shadow-sm">
                  <div className="flex items-center gap-2">
                    <Filter size={16} className="text-slate-500" />
                    <Select value={bookingsFilter} onValueChange={v => setBookingsFilter(v as 'all' | 'upcoming' | 'past')}>
                      <SelectTrigger className="h-12 rounded-2xl max-w-[220px]">
                        <SelectValue placeholder="请选择" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="upcoming">待开始</SelectItem>
                        <SelectItem value="past">已结束</SelectItem>
                        <SelectItem value="all">全部</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {myBookings.length === 0 ? (
                  <div className="rounded-[28px] border border-dashed border-slate-200 bg-slate-50/80 px-6 py-16 text-center">
                    <CalendarDays size={48} className="mx-auto mb-4 text-slate-300" />
                    <p className="text-lg text-slate-500">暂无预订记录</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {myBookings.map(booking => {
                      const room = rooms.find(r => r.roomId === booking.roomId);
                      const start = new Date(booking.startTime);
                      const canCancel = start > now;

                      return (
                        <Card key={booking.eventId} className="rounded-[28px] border-white/80 bg-white/82 p-5 shadow-[0_16px_40px_rgba(15,23,42,0.04)] backdrop-blur-xl">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1">
                              <div className="mb-2 flex items-center gap-2">
                                <h3 className="text-lg font-bold text-slate-800">{booking.title}</h3>
                                {getBookingStatusBadge(booking)}
                              </div>
                              <div className="flex flex-wrap items-center gap-4 text-sm text-slate-600">
                                <span className="flex items-center gap-1"><Monitor size={14} className="text-pink-400" />{room?.name || `会议室 ${booking.roomId}`}</span>
                                <span className="flex items-center gap-1"><MapPin size={14} className="text-pink-400" />{room?.location || '-'}</span>
                              </div>
                            </div>
                            {canCancel && (
                              <Button variant="outline" onClick={() => handleCancelBooking(booking.eventId)} className="rounded-2xl text-red-600 border-red-200 hover:bg-red-50">
                                取消预订
                              </Button>
                            )}
                          </div>
                          <div className="mt-4 flex items-center gap-4 border-t border-slate-100 pt-4 text-sm text-slate-500">
                            <span className="flex items-center gap-1"><Clock size={14} />{formatDateTime(booking.startTime)} - {formatDateTime(booking.endTime)}</span>
                          </div>
                          {booking.description && <p className="mt-3 text-sm text-slate-600">{booking.description}</p>}
                        </Card>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'stats' && (
              <div className="space-y-4">
                {stats.length === 0 ? (
                  <div className="rounded-[28px] border border-dashed border-slate-200 bg-slate-50/80 px-6 py-16 text-center">
                    <BarChart3 size={48} className="mx-auto mb-4 text-slate-300" />
                    <p className="text-lg text-slate-500">暂无统计数据</p>
                  </div>
                ) : (
                  <>
                    {topStatRoom && (
                      <div className="rounded-[28px] border border-pink-100 bg-gradient-to-br from-pink-50 via-white to-white p-5">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-pink-500">最活跃会议室</div>
                        <div className="mt-2 text-2xl font-bold tracking-tight text-slate-900">{topStatRoom.roomName}</div>
                        <div className="mt-2 text-sm leading-6 text-slate-500">累计预订 {topStatRoom.bookingCount} 次，使用 {Math.floor(topStatRoom.totalMinutes / 60)} 小时</div>
                      </div>
                    )}

                    <div className="overflow-hidden rounded-[28px] border border-slate-100 bg-white shadow-sm">
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <TableHeader>
                            <tr>
                              <TableHead className="px-6 py-3 text-left">会议室</TableHead>
                              <TableHead className="px-6 py-3 text-left">预订次数</TableHead>
                              <TableHead className="px-6 py-3 text-left">使用时长</TableHead>
                              <TableHead className="px-6 py-3 text-left">使用天数</TableHead>
                              <TableHead className="px-6 py-3 text-left">利用率</TableHead>
                            </tr>
                          </TableHeader>
                          <tbody className="divide-y divide-slate-200">
                            {stats.map((stat, index) => {
                              const hours = Math.floor(stat.totalMinutes / 60);
                              const minutes = stat.totalMinutes % 60;
                              const utilizationRate = stat.usedDays > 0 ? ((stat.totalMinutes / (stat.usedDays * 8 * 60)) * 100).toFixed(1) : '0.0';

                              return (
                                <tr key={index} className="hover:bg-slate-50/80">
                                  <td className="px-6 py-4 whitespace-nowrap">
                                    <div className="flex items-center">
                                      <Monitor size={16} className="mr-2 text-pink-400" />
                                      <span className="text-sm font-medium text-slate-800">{stat.roomName}</span>
                                    </div>
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">{stat.bookingCount} 次</td>
                                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                                    {hours > 0 && `${hours}小时`}{minutes > 0 && `${minutes}分钟`}
                                    {hours === 0 && minutes === 0 && '-'}
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">{stat.usedDays} 天</td>
                                  <td className="px-6 py-4 whitespace-nowrap">
                                    <div className="flex items-center gap-2">
                                      <div className="h-2 flex-1 max-w-[100px] rounded-full bg-slate-100">
                                        <div className="h-2 rounded-full bg-pink-500" style={{ width: `${Math.min(parseFloat(utilizationRate), 100)}%` }} />
                                      </div>
                                      <span className="text-sm font-medium text-slate-700">{utilizationRate}%</span>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* 预订弹窗 */}
      {selectedRoom && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/28 p-4 backdrop-blur-sm">
          <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-[32px] border border-white/80 bg-white/95 shadow-[0_28px_72px_rgba(15,23,42,0.18)] backdrop-blur-xl animate-in fade-in zoom-in duration-200">
            <div className="relative border-b border-slate-100 px-6 pb-5 pt-6">
              <div className="absolute inset-x-0 top-0 h-32 bg-[radial-gradient(circle_at_top_right,rgba(244,114,182,0.16),transparent_70%)]" />
              <div className="relative flex items-start justify-between gap-4">
                <div>
                  <div className="inline-flex items-center gap-2 rounded-full bg-pink-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-pink-600 ring-1 ring-pink-100">
                    <CalendarDays size={14} />
                    预订会议室
                  </div>
                  <h3 className="mt-4 text-2xl font-bold tracking-tight text-slate-900">预订会议室 - {selectedRoom.name}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-500">{selectedRoom.location} · 容纳 {selectedRoom.capacity} 人</p>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setSelectedRoom(null)} className="rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                  <X size={18} />
                </Button>
              </div>
            </div>
            <div className="flex-1 space-y-4 overflow-y-auto p-6">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">会议主题 <span className="text-red-500">*</span></label>
                <Input
                  className="h-12 rounded-2xl"
                  type="text"
                  value={bookingForm.title}
                  onChange={e => setBookingForm({ ...bookingForm, title: e.target.value })}
                  placeholder="例如：项目评审会议"
                />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">日期 <span className="text-red-500">*</span></label>
                  <DatePicker
                    type="date"
                    value={bookingForm.date}
                    onChange={e => setBookingForm({ ...bookingForm, date: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">开始时间 <span className="text-red-500">*</span></label>
                  <DatePicker
                    type="time"
                    value={bookingForm.startTime}
                    onChange={e => setBookingForm({ ...bookingForm, startTime: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">结束时间 <span className="text-red-500">*</span></label>
                  <DatePicker
                    type="time"
                    value={bookingForm.endTime}
                    onChange={e => setBookingForm({ ...bookingForm, endTime: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">会议描述</label>
                <Textarea
                  className="h-20 rounded-2xl"
                  rows={3}
                  value={bookingForm.description}
                  onChange={e => setBookingForm({ ...bookingForm, description: e.target.value })}
                  placeholder="会议议程、注意事项等..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2 flex items-center gap-1">
                  <UserPlus size={14} />参会人员
                </label>
                <OrgTreePicker deptTree={deptTree} selectedIds={selectedAttendees} onChange={setSelectedAttendees} />
              </div>
            </div>
            <div className="flex justify-end gap-3 border-t border-slate-100 bg-slate-50/80 px-6 py-5">
              <Button variant="outline" onClick={() => setSelectedRoom(null)} className="h-11 rounded-2xl">
                取消
              </Button>
              <Button onClick={handleBooking} className="h-11 rounded-2xl bg-pink-500 text-white hover:bg-pink-600">
                <CheckCircle2 size={16} className="mr-2" />确认预订
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 会议室表单弹窗 */}
      <RoomFormModal visible={roomFormVisible} room={editingRoom} onClose={() => { setRoomFormVisible(false); setEditingRoom(null); }} onSubmit={handleRoomFormSubmit} />

      {/* 删除确认弹窗 */}
      <DeleteConfirmModal visible={deleteConfirmVisible} roomName={deletingRoom?.name || ''} onClose={() => { setDeleteConfirmVisible(false); setDeletingRoom(null); }} onConfirm={handleDeleteConfirm} />

      {/* 周日历弹窗 */}
      {weekCalendarRoom && <WeekCalendar room={weekCalendarRoom} onClose={() => setWeekCalendarRoom(null)} onBookRoom={handleWeekCalendarBook} />}
    </div>
  );
};
