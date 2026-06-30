import React, { useState, useEffect, useCallback } from 'react';
import { MeetingRoom, SysScheduleEvent } from '../types';
import {
  getMeetingRooms, createMeetingRoom, updateMeetingRoom, deleteMeetingRoom,
  createEvent, getRoomEvents, getRoomWeekEvents, getRoomFreeSlots, getMyBookings, cancelBooking,
  getRoomUsageStats, getUserListForAttendees, getDeptTree,
  UserBriefItem, DeptTreeItem, RoomUsageStats
} from '../services/api/schedule';
import {
  MapPin, Users, Monitor, CheckCircle2, XCircle, Plus, Pencil, Trash2,
  Settings, X, Clock, UserPlus, Calendar, ChevronRight, ChevronDown,
  Building2, User, Search, ChevronLeft, BarChart3, CalendarDays,
  LoaderCircle, RefreshCw
} from 'lucide-react';
import { toast } from 'sonner';
import { BaseDialog, ConfirmDialog } from '@/components/common';
import { toBackendDateString } from '../utils/dateFormat';
import { Button, DatePicker, Input, SegmentedControl, SegmentedControlItem, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea } from '@/components/common';
import { cn } from '@/utils/cn';
import { InnerTableSurface, TablePageLayout } from '@/components/layout/TablePageLayout';

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
  'available': { bg: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-200', text: 'text-emerald-700 dark:text-emerald-200', label: '空闲', icon: 'check' },
  'in-use': { bg: 'bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-200', text: 'text-amber-700 dark:text-amber-200', label: '使用中', icon: 'clock' },
  'maintenance': { bg: 'bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-200', text: 'text-red-700 dark:text-red-200', label: '维护中', icon: 'x' },
};

const InlineState: React.FC<{
  title: string;
  description?: string;
  icon?: React.ReactNode;
  className?: string;
}> = ({ title, description, icon, className }) => (
  <div className={cn('flex flex-col items-center justify-center px-6 py-10 text-center', className)}>
    <div className="admin-source-stat-icon mb-3">
      {icon || <LoaderCircle className="h-4 w-4 animate-spin" />}
    </div>
    <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{title}</div>
    {description ? (
      <div className="mt-2 text-xs leading-6 text-slate-500 dark:text-slate-400">{description}</div>
    ) : null}
  </div>
);

const EmptyPanel: React.FC<{
  title: string;
  description: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
}> = ({ title, description, icon, action }) => (
  <InnerTableSurface className="admin-meeting-state-surface">
    <div className="admin-meeting-state-body">
      <div className="admin-source-stat-icon mx-auto text-slate-400 dark:text-slate-500">
        {icon || <Monitor className="h-5 w-5" />}
      </div>
      <div className="mt-4 text-sm font-medium text-slate-900 dark:text-slate-100">{title}</div>
      <div className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">{description}</div>
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  </InnerTableSurface>
);

const StatusPanel: React.FC<{
  title: string;
  description: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}> = ({ title, description, icon, action, className }) => (
  <InnerTableSurface className={cn('admin-meeting-state-surface', className)}>
    <div className="admin-meeting-state-body">
      <div className="admin-source-stat-icon mx-auto text-slate-400 dark:text-slate-500">
        {icon || <Monitor className="h-5 w-5" />}
      </div>
      <div className="mt-4 text-base font-semibold text-slate-900 dark:text-slate-100">{title}</div>
      <div className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">{description}</div>
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  </InnerTableSurface>
);

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
          className="group flex cursor-pointer items-center gap-1 rounded-md px-2 py-1.5 hover:bg-[var(--cf-surface-muted)] dark:hover:bg-slate-900/70"
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
        >
          <button
            onClick={() => toggleExpand(node.deptId)}
            className="w-5 h-5 flex items-center justify-center text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 shrink-0"
          >
            {hasChildren ? (
              isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />
            ) : <span className="w-3.5" />}
          </button>
          <button
            onClick={() => toggleDept(node)}
            className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
              allSelected
                ? 'border-cyan-500 bg-cyan-500'
                : partialSelected
                  ? 'border-cyan-300 bg-cyan-50 dark:border-cyan-800 dark:bg-cyan-950/30'
                  : 'border-slate-300 hover:border-cyan-300 dark:border-slate-700 dark:hover:border-cyan-800'
            }`}
          >
            {allSelected && <CheckCircle2 size={10} className="text-white" />}
            {partialSelected && !allSelected && <div className="h-0.5 w-2 rounded bg-cyan-500" />}
          </button>
          <Building2 size={14} className="text-amber-500 dark:text-amber-300 shrink-0 ml-1" />
          <span className="text-sm font-medium text-slate-700 dark:text-slate-200 flex-1 truncate" onClick={() => toggleExpand(node.deptId)}>
            {node.deptName}
          </span>
          <span className="text-xs text-slate-400 dark:text-slate-500 shrink-0">{userCount}人</span>
        </div>
        {isExpanded && (
          <div>
            {node.children?.map(child => renderDeptNode(child, depth + 1))}
            {filteredUsers.map(user => (
              <div
                key={user.id}
                className="flex cursor-pointer items-center gap-1 rounded-md px-2 py-1.5 hover:bg-[var(--cf-surface-muted)] dark:hover:bg-slate-900/70"
                style={{ paddingLeft: `${(depth + 1) * 16 + 8}px` }}
                onClick={() => toggleUser(user.id)}
              >
                <span className="w-5" />
                <button
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                    selectedIds.includes(user.id) ? 'border-cyan-500 bg-cyan-500' : 'border-slate-300 hover:border-cyan-300 dark:border-slate-700 dark:hover:border-cyan-800'
                  }`}
                >
                  {selectedIds.includes(user.id) && <CheckCircle2 size={10} className="text-white" />}
                </button>
                <User size={14} className="text-slate-400 dark:text-slate-500 shrink-0 ml-1" />
                <span className="text-sm text-slate-600 dark:text-slate-300 truncate">{user.name}</span>
                {user.email && <span className="text-xs text-slate-400 dark:text-slate-500 ml-1 truncate hidden sm:inline">{user.email}</span>}
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
    <InnerTableSurface className="admin-meeting-picker" wrapperClassName="admin-meeting-picker-wrapper">
      {selectedUsers.length > 0 && (
        <div className="admin-meeting-picker-section">
          <div className="mb-2 text-[11px] font-semibold text-slate-500 dark:text-slate-400">已选成员</div>
          <div className="flex flex-wrap gap-1">
            {selectedUsers.slice(0, 10).map(u => (
              <span key={u.id} className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-[var(--cf-surface-strong)] px-2.5 py-1 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
                {u.name}
                <button onClick={(e) => { e.stopPropagation(); toggleUser(u.id); }} className="text-slate-300 hover:text-slate-500 dark:text-slate-600 dark:hover:text-slate-300">
                  <X size={10} />
                </button>
              </span>
            ))}
            {selectedUsers.length > 10 && (
              <span className="text-xs text-slate-400 dark:text-slate-500 px-1 py-0.5">+{selectedUsers.length - 10}人</span>
            )}
          </div>
        </div>
      )}
      <div className="admin-meeting-picker-section">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
          <Input
            type="text"
            className="h-11 rounded-md pl-9 text-sm"
            placeholder="搜索部门或人员..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>
      <div className="admin-meeting-picker-list">
        {deptTree.length === 0 ? (
          <InlineState title="暂无组织架构数据" className="py-6" icon={<User className="h-4 w-4" />} />
        ) : (
          deptTree.map(node => renderDeptNode(node, 0))
        )}
      </div>
      <div className="admin-meeting-picker-footer">
        已选择 <span className="font-medium text-slate-700 dark:text-slate-200">{selectedUsers.length}</span> 人
      </div>
    </InnerTableSurface>
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

  if (loading) {
    return (
      <div className="admin-meeting-inline-note">
        正在读取今日预订...
      </div>
    );
  }
  if (bookings.length === 0) {
    return (
      <div className="admin-meeting-inline-note">
        今日空闲
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
    ongoing: { bg: 'bg-emerald-50 dark:bg-emerald-950/20', text: 'text-emerald-600 dark:text-emerald-200' },
    ended: { bg: 'bg-[var(--cf-surface-muted)] dark:bg-slate-900/70', text: 'text-slate-400 dark:text-slate-500' },
    upcoming: { bg: 'bg-sky-50 dark:bg-sky-950/20', text: 'text-sky-700 dark:text-sky-200' },
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="mb-1 flex items-center justify-between">
        <div className="flex items-center gap-1 text-[11px] font-medium text-slate-400 dark:text-slate-500"><Calendar size={10} /> 今日预订</div>
        <span className="text-[11px] text-slate-400 dark:text-slate-500">{bookings.length} 条</span>
      </div>
      {bookings.slice(0, 3).map((b, i) => {
        const status = getBookingStatus(b);
        const style = statusStyles[status];
        return (
          <div key={i} className={`admin-meeting-booking-row flex items-center gap-2 text-xs ${style.bg}`}>
            <Clock size={10} className={`${status === 'ongoing' ? 'text-emerald-500 dark:text-emerald-300' : status === 'ended' ? 'text-slate-400 dark:text-slate-500' : 'text-sky-500 dark:text-sky-300'} shrink-0`} />
            <span className={`${style.text} whitespace-nowrap font-medium`}>{fmt(b.startTime)}-{fmt(b.endTime)}</span>
            <span className={`${status === 'ended' ? 'text-slate-400 line-through dark:text-slate-500' : 'text-slate-600 dark:text-slate-300'} min-w-0 flex-1 truncate`}>{b.title}</span>
            {status === 'ongoing' && <span className="shrink-0 text-[10px] font-bold text-emerald-600 dark:text-emerald-200">进行中</span>}
            {status === 'ended' && <span className="shrink-0 text-[10px] text-slate-400 dark:text-slate-500">已结束</span>}
          </div>
        );
      })}
      {bookings.length > 3 && <div className="pl-1 text-xs text-slate-400 dark:text-slate-500">还有 {bookings.length - 3} 条预订...</div>}
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
    <BaseDialog
      open
      title="周排期"
      description={(
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <span className="font-medium text-slate-700 dark:text-slate-200">{room.name}</span>
          <span className="rounded-md border border-slate-200 bg-[var(--cf-surface-muted)] px-2.5 py-1 dark:border-slate-800 dark:bg-slate-900">{room.location}</span>
          <span className="rounded-md border border-slate-200 bg-[var(--cf-surface-muted)] px-2.5 py-1 dark:border-slate-800 dark:bg-slate-900">容纳 {room.capacity} 人</span>
        </div>
      )}
      onClose={onClose}
      width="full"
      maxWidthClassName="w-full max-w-6xl"
      panelClassName="max-h-[92vh]"
      bodyClassName="flex flex-col p-0 !overflow-hidden"
    >
        <div className="admin-meeting-dialog-toolbar">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="inline-flex items-center rounded-md border border-slate-200 bg-[var(--cf-surface-muted)] p-1 dark:border-slate-800 dark:bg-slate-900">
                <button
                  type="button"
                  onClick={goToPrevWeek}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-[var(--cf-surface-strong)] hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-950 dark:hover:text-slate-200"
                  aria-label="上一周"
                  title="上一周"
                >
                  <ChevronLeft size={18} />
                </button>
                <button
                  type="button"
                  onClick={goToNextWeek}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-[var(--cf-surface-strong)] hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-950 dark:hover:text-slate-200"
                  aria-label="下一周"
                  title="下一周"
                >
                  <ChevronRight size={18} />
                </button>
              </div>
              <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                {currentWeekStart.getFullYear()}年{currentWeekStart.getMonth() + 1}月
              </div>
              <Button variant="outline" size="sm" onClick={goToToday}>
                本周
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
              <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded border border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/30"></span> 空闲可选</span>
              <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded border border-red-200 bg-red-100 dark:border-red-900 dark:bg-red-950/30"></span> 已预订</span>
              <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded border border-slate-200 bg-[var(--cf-surface-muted)] dark:border-slate-800 dark:bg-slate-900"></span> 已过期</span>
              <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded border border-sky-300 bg-sky-100 dark:border-sky-900 dark:bg-sky-950/30"></span> 拖动选中</span>
            </div>
          </div>
        </div>

        <div className="admin-meeting-week-body">
          {loading ? (
            <InlineState title="正在加载周预订..." className="py-12" />
          ) : (
            <div className="min-w-[800px]">
              <div className="grid grid-cols-8 gap-2 mb-2">
                <div className="text-xs font-medium text-slate-500 dark:text-slate-400 text-center">时间</div>
                {weekDays.map((day, i) => (
                  <div key={i} className={`rounded-md py-2 text-center text-xs font-medium ${isToday(day) ? 'bg-[var(--cf-surface-muted)] text-slate-700 dark:bg-slate-900 dark:text-slate-200' : 'text-slate-600 dark:text-slate-300'}`}>
                    {formatDate(day)}
                  </div>
                ))}
              </div>
              {timeSlots.map(hour => (
                <div key={hour} className="grid grid-cols-8 gap-2 mb-1">
                  <div className="text-xs text-slate-500 dark:text-slate-400 text-center py-2">
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
                        className={`text-xs py-2 px-1 rounded-md text-center select-none transition-colors ${
                          bookedEvent
                            ? 'bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-200 cursor-not-allowed'
                            : isPast
                              ? 'bg-[var(--cf-surface-muted)] text-slate-300 dark:bg-slate-900 dark:text-slate-600 cursor-not-allowed'
                              : inDragRange
                                ? 'bg-sky-100 text-sky-700 border-2 border-sky-300 dark:bg-sky-950/30 dark:text-sky-200 dark:border-sky-900'
                                : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/20 dark:text-emerald-200 dark:hover:bg-emerald-950/40 cursor-pointer'
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
    </BaseDialog>
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
    <BaseDialog
      open={visible}
      title={isEdit ? '编辑会议室' : '新增会议室'}
      description={(
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <span className="rounded-md border border-slate-200 bg-[var(--cf-surface-muted)] px-2.5 py-1 dark:border-slate-800 dark:bg-slate-900">{isEdit ? '修改现有信息' : '录入新会议室'}</span>
          <span className="rounded-md border border-slate-200 bg-[var(--cf-surface-strong)] px-2.5 py-1 text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">保持预订信息一致</span>
        </div>
      )}
      headerAside={(
        <span className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-[var(--cf-surface-muted)] px-3 py-1.5 text-[11px] font-semibold text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
          <Settings size={14} />
          会议室配置
        </span>
      )}
      onClose={onClose}
      maxWidthClassName="w-full max-w-lg"
      bodyClassName="admin-dialog-stack"
      footer={(
        <>
          <Button variant="outline" size="lg" onClick={onClose}>
            取消
          </Button>
          <Button size="lg" onClick={handleSubmit}>
            <CheckCircle2 size={16} className="mr-2" />{isEdit ? '保存修改' : '确认新增'}
          </Button>
        </>
      )}
    >
          <div className="admin-dialog-field">
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">会议室名称 <span className="text-red-500">*</span></label>
            <Input className="h-12" type="text" value={form.name || ''} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="例如：大会议室A" />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="admin-dialog-field">
              <label className="text-xs font-medium text-slate-500 dark:text-slate-400">位置 <span className="text-red-500">*</span></label>
              <Input className="h-12" type="text" value={form.location || ''} onChange={e => setForm({ ...form, location: e.target.value })} placeholder="例如：3楼东侧" />
            </div>
            <div className="admin-dialog-field">
              <label className="text-xs font-medium text-slate-500 dark:text-slate-400">容纳人数 <span className="text-red-500">*</span></label>
              <Input className="h-12" type="number" min={1} value={form.capacity || ''} onChange={e => setForm({ ...form, capacity: parseInt(e.target.value) || 0 })} placeholder="例如：50" />
            </div>
          </div>
          <div className="admin-dialog-field">
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">设备配置</label>
            <Input className="h-12" type="text" value={equipmentInput} onChange={e => setEquipmentInput(e.target.value)} placeholder="多个设备用逗号分隔，例如：投影仪, 白板, 音响" />
            <p className="text-xs text-slate-400 dark:text-slate-500">多个设备用逗号分隔</p>
          </div>
          <div className="admin-dialog-field">
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">状态</label>
            <Select value={form.status || '1'} onValueChange={v => setForm({...form, status: v as '0' | '1'})}>
              <SelectTrigger className="h-12">
                <SelectValue placeholder="请选择" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">可用</SelectItem>
                <SelectItem value="0">维护中</SelectItem>
              </SelectContent>
            </Select>
          </div>
    </BaseDialog>
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
  const [bookingDayEvents, setBookingDayEvents] = useState<SysScheduleEvent[]>([]);
  const [bookingFreeSlots, setBookingFreeSlots] = useState<Array<{ start: string; end: string }>>([]);
  const [bookingTimelineLoading, setBookingTimelineLoading] = useState(false);
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
      const nextRooms = await getMeetingRooms();
      setRooms(Array.isArray(nextRooms) ? nextRooms : []); 
    } catch (e) { 
      console.error("Fetch rooms failed", e); 
      setRooms([]);
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

  // 当预订弹窗打开且选择了日期时，加载该日已预订时段
  useEffect(() => {
    if (!selectedRoom || !bookingForm.date) {
      setBookingDayEvents([]);
      setBookingFreeSlots([]);
      return;
    }
    let cancelled = false;
    setBookingTimelineLoading(true);
    Promise.all([
      getRoomEvents(selectedRoom.roomId, bookingForm.date),
      getRoomFreeSlots(selectedRoom.roomId, bookingForm.date),
    ])
      .then(([events, freeSlots]) => {
        if (!cancelled) {
          setBookingDayEvents(Array.isArray(events) ? events : []);
          setBookingFreeSlots(Array.isArray(freeSlots) ? freeSlots : []);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setBookingDayEvents([]);
          setBookingFreeSlots([]);
        }
      })
      .finally(() => {
        if (!cancelled) setBookingTimelineLoading(false);
      });
    return () => { cancelled = true; };
  }, [selectedRoom, bookingForm.date]);

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

    // 前端冲突校验：检查选择的时间段是否与已预订时段重叠
    const startMs = startDate.getTime();
    const endMs = endDate.getTime();
    const conflict = bookingDayEvents.find((evt) => {
      if (!evt.startTime || !evt.endTime) return false;
      const evtStart = new Date(evt.startTime.replace(' ', 'T')).getTime();
      const evtEnd = new Date(evt.endTime.replace(' ', 'T')).getTime();
      return startMs < evtEnd && endMs > evtStart;
    });
    if (conflict) {
      const conflictStart = conflict.startTime?.substring(11, 16) || '';
      const conflictEnd = conflict.endTime?.substring(11, 16) || '';
      toast.error(`时间段冲突：${conflictStart}-${conflictEnd} 已被"${conflict.title}"预订，请选择其他时段`);
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
      const msg = e.response?.data?.msg || e.message || "时间冲突";
      if (msg.includes("已被预订")) {
        toast.error(msg + "，请查看当日预约情况选择其他时段");
      } else {
        toast.error("预订失败: " + msg);
      }
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
      return <span className="rounded-md bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-700 border border-sky-200 dark:bg-sky-950/30 dark:text-sky-200 dark:border-sky-900">待开始</span>;
    } else if (now >= start && now <= end) {
      return <span className="rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 border border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-200 dark:border-emerald-900">进行中</span>;
    } else {
      return <span className="rounded-md bg-[var(--cf-surface-muted)] px-2.5 py-1 text-xs font-medium text-slate-500 border border-slate-200 dark:bg-slate-900 dark:text-slate-400 dark:border-slate-800">已结束</span>;
    }
  };

  const formatMinutes = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const remainMinutes = minutes % 60;

    if (hours === 0 && remainMinutes === 0) return '0 分钟';
    if (hours === 0) return `${remainMinutes} 分钟`;
    if (remainMinutes === 0) return `${hours} 小时`;
    return `${hours} 小时 ${remainMinutes} 分钟`;
  };

  const getUtilizationRate = (stat: RoomUsageStats) => {
    if (stat.usedDays <= 0) return '0.0';
    return ((stat.totalMinutes / (stat.usedDays * 8 * 60)) * 100).toFixed(1);
  };

  const now = new Date();
  const totalStatBookings = stats.reduce((sum, item) => sum + item.bookingCount, 0);
  const totalStatMinutes = stats.reduce((sum, item) => sum + item.totalMinutes, 0);
  const totalStatUsedDays = stats.reduce((sum, item) => sum + item.usedDays, 0);
  const averageUtilization = stats.length > 0
    ? (stats.reduce((sum, item) => sum + parseFloat(getUtilizationRate(item)), 0) / stats.length).toFixed(1)
    : '0.0';
  const availableRoomCount = rooms.filter((room) => getRoomRealtimeStatus(room, roomBookingsMap[room.roomId] || []) === 'available').length;
  const inUseRoomCount = rooms.filter((room) => getRoomRealtimeStatus(room, roomBookingsMap[room.roomId] || []) === 'in-use').length;
  const visibleRoomCount = filteredRooms.length;
  const meetingRoomSummary = activeTab === 'rooms'
    ? `共 ${visibleRoomCount} 间 · ${availableRoomCount} 间空闲`
    : activeTab === 'my-bookings'
      ? `共 ${myBookings.length} 条 · ${bookingsFilter === 'all' ? '全部预订' : bookingsFilter === 'upcoming' ? '待开始' : '已结束'}`
      : `共 ${stats.length} 条统计 · ${totalStatBookings} 次预订`;
  const tabItems: Array<{ value: TabType; label: string; icon: React.ReactNode }> = [
    { value: 'rooms', label: '会议室列表', icon: <Monitor size={16} /> },
    { value: 'my-bookings', label: '我的预订', icon: <CalendarDays size={16} /> },
    { value: 'stats', label: '使用统计', icon: <BarChart3 size={16} /> },
  ];
  const meetingRoomStats = [
    {
      label: '会议室资源',
      value: rooms.length,
      meta: `${availableRoomCount} 间空闲`,
      icon: <Monitor size={18} />,
      tone: 'blue',
    },
    {
      label: '实时空闲',
      value: availableRoomCount,
      meta: `${inUseRoomCount} 间使用中`,
      icon: <CheckCircle2 size={18} />,
      tone: 'green',
    },
    {
      label: '我的预订',
      value: myBookings.length,
      meta: '当前筛选记录',
      icon: <CalendarDays size={18} />,
      tone: 'amber',
    },
    {
      label: '平均利用率',
      value: `${averageUtilization}%`,
      meta: `${totalStatBookings} 次预订`,
      icon: <BarChart3 size={18} />,
      tone: 'violet',
    },
  ];

  const handleRefreshActiveTab = async () => {
    if (activeTab === 'rooms') {
      await fetchRooms();
      setRefreshKey(prev => prev + 1);
      return;
    }

    if (activeTab === 'my-bookings') {
      await fetchMyBookings();
      return;
    }

    await fetchStats();
  };

  const openBookingModal = (room: MeetingRoom) => {
    setSelectedRoom(room);
    setSelectedAttendees([]);
    setBookingForm({
      title: '',
      date: getLocalDateString(),
      startTime: '09:00',
      endTime: '10:00',
      description: ''
    });
  };

  const renderRoomsView = () => {
    if (loading) {
      return <InlineState title="正在加载会议室..." className="py-10" />;
    }

    if (filteredRooms.length === 0) {
      return (
        <StatusPanel
          icon={<Monitor size={20} />}
          title={searchQuery || statusFilter !== 'all' ? '没有找到符合条件的会议室' : '暂无会议室'}
          description={
            searchQuery || statusFilter !== 'all'
              ? '可以调整关键词或状态筛选，重新查看会议室资源。'
              : '进入管理模式后先创建会议室，再开始预订。'
          }
          className="py-10"
          action={!searchQuery && statusFilter === 'all' ? (
            <Button onClick={() => { setManageMode(true); handleAddRoom(); }}>
              <Plus size={16} className="mr-2" />
              新增第一个会议室
            </Button>
          ) : undefined}
        />
      );
    }

    return (
      <InnerTableSurface className="admin-meeting-room-workbench" wrapperClassName="flex min-h-0 flex-1 flex-col">
        <div className="admin-source-section-head admin-meeting-room-workbench-head border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <div>
            <strong>会议室资源</strong>
            <span>按实时状态查看资源、今日预订和排期操作。</span>
          </div>
          <div className="admin-meeting-room-summary">
            <span>{filteredRooms.length} 间</span>
            <span>{availableRoomCount} 空闲</span>
            <span>{inUseRoomCount} 使用中</span>
          </div>
        </div>
        <div className="admin-meeting-room-list">
        {filteredRooms.map((room) => {
          const realtimeStatus = getRoomRealtimeStatus(room, roomBookingsMap[room.roomId] || []);
          const statusCfg = roomStatusConfig[realtimeStatus];
          const StatusIcon = realtimeStatus === 'available' ? CheckCircle2 : realtimeStatus === 'in-use' ? Clock : XCircle;
          const equipmentList = parseEquipment(room.equipment);

          return (
            <article
              key={room.roomId}
              className="admin-meeting-room-row"
            >
              <div className="admin-meeting-room-main">
                <div className="admin-meeting-room-icon">
                  <Monitor size={16} />
                </div>
                <div className="min-w-0">
                  <div className="admin-meeting-room-titleline">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {room.name}
                    </h3>
                    <span className={cn('inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-medium', statusCfg.bg)}>
                      <StatusIcon size={12} />
                      {statusCfg.label}
                    </span>
                  </div>

                  <div className="admin-meeting-room-meta">
                    <span>
                      <MapPin size={12} />
                      {room.location}
                    </span>
                    <span>
                      <Users size={12} />
                      容纳 {room.capacity} 人
                    </span>
                    <span>
                      <CalendarDays size={12} />
                      今日 {roomBookingsMap[room.roomId]?.length || 0} 条
                    </span>
                  </div>
                </div>
              </div>

              <div className="admin-meeting-room-equipment">
                <span className="admin-meeting-room-cell-label">设备</span>
                <div className="admin-meeting-room-chipline">
                  {equipmentList.length > 0 ? equipmentList.slice(0, 4).map((eq: string, index: number) => (
                    <span
                      key={`${room.roomId}-${eq}-${index}`}
                      className="admin-meeting-room-equipment-chip"
                    >
                      {eq}
                    </span>
                  )) : (
                    <span className="admin-meeting-room-equipment-chip is-empty">
                      未录入设备
                    </span>
                  )}
                  {equipmentList.length > 4 ? (
                    <span className="admin-meeting-room-equipment-chip">+{equipmentList.length - 4}</span>
                  ) : null}
                </div>
              </div>

              <div className="admin-meeting-room-bookings">
                <RoomBookings
                  key={`${room.roomId}-${refreshKey}`}
                  roomId={room.roomId.toString()}
                  onBookingsLoaded={handleBookingsLoaded}
                />
              </div>

              <div className="admin-meeting-room-actions">
                  {manageMode ? (
                    <>
                      <Button variant="outline" size="sm" onClick={() => handleEditRoom(room)}>
                        <Pencil size={14} className="mr-1.5" />
                        编辑
                      </Button>
                      <Button variant="destructive" size="sm" onClick={() => handleDeleteRoom(room)}>
                        <Trash2 size={14} className="mr-1.5" />
                        删除
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        size="sm"
                        onClick={() => openBookingModal(room)}
                        disabled={realtimeStatus === 'maintenance'}
                      >
                        立即预订
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setWeekCalendarRoom(room)}
                        disabled={realtimeStatus === 'maintenance'}
                      >
                        <CalendarDays size={14} className="mr-1.5" />
                        周排期
                      </Button>
                    </>
                  )}
              </div>
            </article>
          );
        })}
        </div>
      </InnerTableSurface>
    );
  };

  const renderMyBookingsView = () => {
    if (myBookings.length === 0) {
      return (
        <EmptyPanel
          icon={<CalendarDays size={20} />}
          title="暂无预订记录"
          description="当前筛选下没有记录。"
        />
      );
    }

    return (
      <InnerTableSurface className="admin-meeting-list-surface" wrapperClassName="admin-meeting-list-wrapper">
        {myBookings.map((booking) => {
          const room = rooms.find(r => r.roomId === booking.roomId);
          const start = new Date(booking.startTime);
          const canCancel = start > now;

          return (
            <article
              key={booking.eventId}
              className="admin-meeting-list-row"
            >
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto] lg:items-center lg:gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="min-w-0 truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {booking.title}
                    </h3>
                    {getBookingStatusBadge(booking)}
                  </div>
                  {booking.description ? (
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500 dark:text-slate-400">
                      {booking.description}
                    </p>
                  ) : null}
                </div>

                <div className="grid gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                  <div className="flex flex-wrap items-center gap-2">
                    <Clock size={12} className="shrink-0" />
                    <span>{formatDateTime(booking.startTime)} - {formatDateTime(booking.endTime)}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Monitor size={12} className="shrink-0" />
                    <span>{room?.name || `会议室 ${booking.roomId}`}</span>
                    <span className="text-slate-300 dark:text-slate-700">/</span>
                    <MapPin size={12} className="shrink-0" />
                    <span>{room?.location || '未设置位置'}</span>
                  </div>
                </div>

                <div className="flex items-center justify-start lg:justify-end">
                  {canCancel ? (
                    <Button variant="destructive" size="sm" onClick={() => handleCancelBooking(booking.eventId)}>
                      取消预订
                    </Button>
                  ) : (
                    <span className="inline-flex items-center rounded-md border border-slate-200 bg-[var(--cf-surface-muted)] px-3 py-1.5 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
                      记录已归档
                    </span>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </InnerTableSurface>
    );
  };

  const renderStatsView = () => {
    if (stats.length === 0) {
      return (
        <EmptyPanel
          icon={<BarChart3 size={20} />}
          title="暂无统计数据"
          description="等待会议室预订记录累计。"
        />
      );
    }

    return (
      <InnerTableSurface>
        <table className="unity-data-table admin-source-table min-w-[720px]">
          <thead>
            <tr>
              <th>会议室</th>
              <th>预订次数</th>
              <th>使用时长</th>
              <th>使用天数</th>
              <th>利用率</th>
            </tr>
          </thead>
          <tbody>
            {stats.map((stat, index) => {
              const utilizationRate = getUtilizationRate(stat);

              return (
                <tr key={index}>
                  <td className="whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <Monitor size={14} className="text-slate-400 dark:text-slate-500" />
                      <span className="text-sm font-medium text-slate-900 dark:text-slate-100">{stat.roomName}</span>
                    </div>
                  </td>
                  <td className="whitespace-nowrap">{stat.bookingCount} 次</td>
                  <td className="whitespace-nowrap">{formatMinutes(stat.totalMinutes)}</td>
                  <td className="whitespace-nowrap">{stat.usedDays} 天</td>
                  <td className="whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <div className="h-2 max-w-[100px] flex-1 rounded-md bg-[var(--cf-surface-muted)] dark:bg-slate-900">
                        <div
                          className="h-2 rounded-md bg-cyan-500 dark:bg-cyan-400"
                          style={{ width: `${Math.min(parseFloat(utilizationRate), 100)}%` }}
                        />
                      </div>
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{utilizationRate}%</span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="border-t border-slate-200 bg-[var(--cf-surface-muted)] dark:border-slate-800 dark:bg-slate-900/40">
            <tr>
              <td>汇总</td>
              <td>{totalStatBookings} 次</td>
              <td>{formatMinutes(totalStatMinutes)}</td>
              <td>{totalStatUsedDays} 天</td>
              <td>{averageUtilization}%</td>
            </tr>
          </tfoot>
        </table>
      </InnerTableSurface>
    );
  };

  const pageActions = (
    <div className="grid gap-5">
        <header className="admin-source-header">
          <div>
            <p className="admin-source-kicker">MEETING ROOMS</p>
            <h2>会议室管理</h2>
            <span>管理会议室资源、预订记录、实时状态和使用统计</span>
          </div>
          <div className="admin-source-controls">
            <Button variant="outline" size="sm" onClick={() => void handleRefreshActiveTab()}>
              <RefreshCw size={14} className="mr-1.5" />
              刷新
            </Button>
            {activeTab === 'rooms' ? (
              <>
                <Button variant={manageMode ? 'secondary' : 'outline'} size="sm" onClick={() => setManageMode(!manageMode)}>
                  <Settings size={14} className="mr-1.5" />
                  {manageMode ? '退出管理' : '管理模式'}
                </Button>
                {manageMode ? (
                  <Button size="sm" onClick={handleAddRoom}>
                    <Plus size={14} className="mr-1.5" />
                    新增会议室
                  </Button>
                ) : null}
              </>
            ) : null}
          </div>
        </header>

        <section className="admin-source-stat-grid">
          {meetingRoomStats.map((stat) => (
            <article key={stat.label} className={`card admin-source-stat admin-source-tone-${stat.tone}`}>
              <div className="admin-source-stat-icon">{stat.icon}</div>
              <div>
                <p>{stat.label}</p>
                <strong>{stat.value}</strong>
                <span>{stat.meta}</span>
              </div>
            </article>
          ))}
        </section>
    </div>
  );

  const pageFilters = (
        <section className="admin-source-inline-toolbar admin-meeting-room-toolbar">
          <div className="admin-meeting-room-tabs">
            <span className="input-label">视图</span>
            <SegmentedControl className="min-h-9">
              {tabItems.map((item) => (
                <SegmentedControlItem key={item.value} size="sm" active={item.value === activeTab} onClick={() => setActiveTab(item.value)}>
                  {item.icon}
                  {item.label}
                </SegmentedControlItem>
              ))}
            </SegmentedControl>
          </div>

          <div className="admin-meeting-room-filter-grid">
            {activeTab === 'rooms' ? (
              <>
                <label className="admin-source-search">
                  <span className="input-label">搜索会议室</span>
                  <div className="admin-source-search-field">
                    <Search size={16} />
                    <Input
                      className="h-[42px]"
                      type="text"
                      placeholder="会议室名称或位置"
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                    />
                  </div>
                </label>
                <label>
                  <span className="input-label">状态</span>
                  <Select value={statusFilter} onValueChange={v => setStatusFilter(v as 'all' | RoomRealtimeStatus)}>
                  <SelectTrigger>
                    <SelectValue placeholder="请选择" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部状态</SelectItem>
                      <SelectItem value="available">空闲</SelectItem>
                      <SelectItem value="in-use">使用中</SelectItem>
                      <SelectItem value="maintenance">维护中</SelectItem>
                    </SelectContent>
                  </Select>
                </label>
                <div className="admin-users-toolbar-actions">
                  <span className="admin-users-filter-count">{meetingRoomSummary}</span>
                </div>
              </>
            ) : null}

            {activeTab === 'my-bookings' ? (
              <label>
                <span className="input-label">预订状态</span>
                <Select value={bookingsFilter} onValueChange={v => setBookingsFilter(v as 'all' | 'upcoming' | 'past')}>
                  <SelectTrigger>
                    <SelectValue placeholder="请选择" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="upcoming">待开始</SelectItem>
                    <SelectItem value="past">已结束</SelectItem>
                    <SelectItem value="all">全部</SelectItem>
                  </SelectContent>
                </Select>
              </label>
            ) : null}

            {activeTab !== 'rooms' ? (
              <div className="admin-users-toolbar-actions">
                <span className="admin-users-filter-count">{meetingRoomSummary}</span>
              </div>
            ) : null}
          </div>
        </section>
  );

  const pageContent = (
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1">
          {activeTab === 'rooms' ? renderRoomsView() : null}
          {activeTab === 'my-bookings' ? renderMyBookingsView() : null}
          {activeTab === 'stats' ? renderStatsView() : null}
        </div>
  );

  return (
    <>
      <section className="admin-source-page admin-meeting-room-page">
        <TablePageLayout
          actions={pageActions}
          filters={pageFilters}
          table={pageContent}
        />
      </section>

      {/* 预订弹窗 */}
      {selectedRoom && (
        <BaseDialog
          open={Boolean(selectedRoom)}
          title={selectedRoom.name}
          description={(
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span className="rounded-md border border-slate-200 bg-[var(--cf-surface-muted)] px-2.5 py-1 dark:border-slate-800 dark:bg-slate-900">{selectedRoom.location}</span>
              <span className="rounded-md border border-slate-200 bg-[var(--cf-surface-muted)] px-2.5 py-1 dark:border-slate-800 dark:bg-slate-900">容纳 {selectedRoom.capacity} 人</span>
            </div>
          )}
          headerAside={(
            <span className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-[var(--cf-surface-muted)] px-3 py-1.5 text-[11px] font-semibold text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
              <CalendarDays size={14} />
              预订会议室
            </span>
          )}
          onClose={() => setSelectedRoom(null)}
          width="wide"
          bodyClassName="admin-dialog-stack"
          footer={(
            <>
              <Button variant="outline" size="lg" onClick={() => setSelectedRoom(null)}>
                取消
              </Button>
              <Button size="lg" onClick={handleBooking}>
                <CheckCircle2 size={16} className="mr-2" />确认预订
              </Button>
            </>
          )}
        >
              <div className="admin-dialog-field">
                <label className="text-xs font-medium text-slate-500 dark:text-slate-400">会议主题 <span className="text-red-500">*</span></label>
                <Input
                  className="h-12"
                  type="text"
                  value={bookingForm.title}
                  onChange={e => setBookingForm({ ...bookingForm, title: e.target.value })}
                  placeholder="例如：项目评审会议"
                />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="admin-dialog-field">
                  <label className="text-xs font-medium text-slate-500 dark:text-slate-400">日期 <span className="text-red-500">*</span></label>
                  <DatePicker
                    type="date"
                    value={bookingForm.date}
                    onChange={e => setBookingForm({ ...bookingForm, date: e.target.value })}
                  />
                </div>
                <div className="admin-dialog-field">
                  <label className="text-xs font-medium text-slate-500 dark:text-slate-400">开始时间 <span className="text-red-500">*</span></label>
                  <DatePicker
                    type="time"
                    value={bookingForm.startTime}
                    onChange={e => setBookingForm({ ...bookingForm, startTime: e.target.value })}
                  />
                </div>
                <div className="admin-dialog-field">
                  <label className="text-xs font-medium text-slate-500 dark:text-slate-400">结束时间 <span className="text-red-500">*</span></label>
                  <DatePicker
                    type="time"
                    value={bookingForm.endTime}
                    onChange={e => setBookingForm({ ...bookingForm, endTime: e.target.value })}
                  />
                </div>
              </div>
              {/* 当日时段展示 */}
              <div className="admin-dialog-subsection">
                <div className="mb-2 flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
                  <Clock size={13} />
                  <span>当日预约情况</span>
                  {bookingTimelineLoading && <LoaderCircle size={12} className="animate-spin" />}
                </div>
                {bookingDayEvents.length > 0 ? (
                  <div className="grid gap-1.5">
                    {bookingDayEvents.map((evt) => {
                      const startStr = evt.startTime ? evt.startTime.substring(11, 16) : '';
                      const endStr = evt.endTime ? evt.endTime.substring(11, 16) : '';
                      return (
                        <div key={evt.eventId} className="flex items-center gap-2 text-xs">
                          <span className="inline-block h-3 w-1.5 shrink-0 rounded-sm bg-rose-400" />
                          <span className="text-slate-600 dark:text-slate-300">{startStr} - {endStr}</span>
                          <span className="text-slate-400 truncate">{evt.title}</span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-xs text-slate-400">{bookingTimelineLoading ? '加载中...' : '当日暂无预约，全部空闲'}</div>
                )}
                {bookingFreeSlots.length > 0 && (
                  <div className="mt-2 border-t border-slate-200 pt-2 dark:border-slate-700">
                    <div className="text-[11px] text-slate-400 mb-1">空闲时段</div>
                    <div className="flex flex-wrap gap-1.5">
                      {bookingFreeSlots.map((slot, i) => {
                        const slotStart = slot.start.substring(11, 16);
                        const slotEnd = slot.end.substring(11, 16);
                        return (
                          <span key={i} className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">
                            {slotStart}-{slotEnd}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
              <div className="admin-dialog-field">
                <label className="text-xs font-medium text-slate-500 dark:text-slate-400">会议描述</label>
                <Textarea
                  className="h-20"
                  rows={3}
                  value={bookingForm.description}
                  onChange={e => setBookingForm({ ...bookingForm, description: e.target.value })}
                  placeholder="会议议程、注意事项等..."
                />
              </div>
              <div className="admin-dialog-field">
                <label className="flex items-center gap-1 text-xs font-medium text-slate-500 dark:text-slate-400">
                  <UserPlus size={14} />参会人员
                </label>
                <OrgTreePicker deptTree={deptTree} selectedIds={selectedAttendees} onChange={setSelectedAttendees} />
              </div>
        </BaseDialog>
      )}

      {/* 会议室表单弹窗 */}
      <RoomFormModal visible={roomFormVisible} room={editingRoom} onClose={() => { setRoomFormVisible(false); setEditingRoom(null); }} onSubmit={handleRoomFormSubmit} />

      {/* 删除确认弹窗 */}
      <ConfirmDialog
        open={deleteConfirmVisible}
        title="确认删除"
        message={`确定要删除会议室“${deletingRoom?.name || ''}”吗？此操作不可撤销。`}
        confirmText="确认删除"
        cancelText="取消"
        danger
        onConfirm={() => void handleDeleteConfirm()}
        onCancel={() => {
          setDeleteConfirmVisible(false);
          setDeletingRoom(null);
        }}
      />

      {/* 周日历弹窗 */}
      {weekCalendarRoom && <WeekCalendar room={weekCalendarRoom} onClose={() => setWeekCalendarRoom(null)} onBookRoom={handleWeekCalendarBook} />}
    </>
  );
};
