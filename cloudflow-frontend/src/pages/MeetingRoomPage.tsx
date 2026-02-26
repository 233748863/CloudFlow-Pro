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
  Building2, User, Search, ChevronLeft, BarChart3, Filter, CalendarDays
} from 'lucide-react';
import { toast } from 'sonner';
import { toBackendDateString } from '../utils/dateFormat';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';

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
          className="flex items-center gap-1 py-1.5 px-2 hover:bg-slate-50 rounded-md cursor-pointer group"
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
            className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
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
                className="flex items-center gap-1 py-1.5 px-2 hover:bg-slate-50 rounded-md cursor-pointer"
                style={{ paddingLeft: `${(depth + 1) * 16 + 8}px` }}
                onClick={() => toggleUser(user.id)}
              >
                <span className="w-5" />
                <button
                  className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
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
    <div className="border border-slate-200 rounded-lg overflow-hidden">
      {selectedUsers.length > 0 && (
        <div className="p-2 border-b border-slate-100 bg-slate-50/50">
          <div className="flex flex-wrap gap-1">
            {selectedUsers.slice(0, 10).map(u => (
              <span key={u.id} className="inline-flex items-center gap-1 bg-pink-50 text-pink-600 px-2 py-0.5 rounded-full text-xs">
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
      <div className="p-2 border-b border-slate-100">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-2 text-slate-400" />
          <Input
            type="text"
            className="pl-8 py-1.5 text-sm"
            placeholder="搜索部门或人员..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>
      <div className="max-h-64 overflow-y-auto p-1">
        {deptTree.length === 0 ? (
          <div className="p-4 text-sm text-slate-400 text-center">暂无组织架构数据</div>
        ) : (
          deptTree.map(node => renderDeptNode(node, 0))
        )}
      </div>
      <div className="px-3 py-1.5 border-t border-slate-100 bg-slate-50/50 text-xs text-slate-500">
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

  if (loading) return <div className="text-xs text-slate-400 py-1">加载中...</div>;
  if (bookings.length === 0) {
    return (<div className="text-xs text-slate-400 py-1 flex items-center gap-1"><Calendar size={10} /> 今日暂无预订</div>);
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
      <div className="text-xs font-medium text-slate-500 flex items-center gap-1"><Calendar size={10} /> 今日预订 ({bookings.length})</div>
      {bookings.slice(0, 3).map((b, i) => {
        const status = getBookingStatus(b);
        const style = statusStyles[status];
        return (
          <div key={i} className={`flex items-center gap-2 text-xs ${style.bg} rounded px-2 py-1`}>
            <Clock size={10} className={`${status === 'ongoing' ? 'text-emerald-500' : status === 'ended' ? 'text-slate-400' : 'text-pink-400'} shrink-0`} />
            <span className={`${style.text} font-medium whitespace-nowrap`}>{fmt(b.startTime)}-{fmt(b.endTime)}</span>
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
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-6xl flex flex-col max-h-[90vh]">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center">
          <div>
            <h3 className="text-lg font-bold text-slate-800">周日历 - {room.name}</h3>
            <p className="text-xs text-slate-500 mt-1">点击空闲时段快速预订，拖动可选择连续时间段</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>

        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <button onClick={goToPrevWeek} className="p-2 hover:bg-slate-100 rounded-lg">
            <ChevronLeft size={20} />
          </button>
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium text-slate-700">
              {currentWeekStart.getFullYear()}年{currentWeekStart.getMonth() + 1}月
            </span>
            <button onClick={goToToday} className="px-3 py-1 text-sm bg-pink-50 text-pink-500 rounded-lg hover:bg-pink-50">
              今天
            </button>
          </div>
          <button onClick={goToNextWeek} className="p-2 hover:bg-slate-100 rounded-lg">
            <ChevronRight size={20} />
          </button>
        </div>

        {/* 图例说明 */}
        <div className="px-6 py-2 border-b border-slate-100 flex items-center gap-4 text-xs text-slate-500">
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-emerald-50 border border-emerald-200 inline-block"></span> 空闲可选</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-red-100 border border-red-200 inline-block"></span> 已预订</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-slate-50 border border-slate-200 inline-block"></span> 已过期</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-pink-100 border border-pink-300 inline-block"></span> 拖动选中</span>
          <span className="ml-auto text-slate-400">💡 按住鼠标拖动可快速选择连续时间段</span>
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
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg flex flex-col animate-in fade-in zoom-in duration-200">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center">
          <h3 className="text-lg font-bold text-slate-800">{isEdit ? '编辑会议室' : '新增会议室'}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">会议室名称 <span className="text-red-500">*</span></label>
            <Input type="text" value={form.name || ''} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="例如：大会议室A" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">位置 <span className="text-red-500">*</span></label>
              <Input type="text" value={form.location || ''} onChange={e => setForm({ ...form, location: e.target.value })} placeholder="例如：3楼东侧" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">容纳人数 <span className="text-red-500">*</span></label>
              <Input type="number" min={1} value={form.capacity || ''} onChange={e => setForm({ ...form, capacity: parseInt(e.target.value) || 0 })} placeholder="例如：50" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">设备配置</label>
            <Input type="text" value={equipmentInput} onChange={e => setEquipmentInput(e.target.value)} placeholder="多个设备用逗号分隔，例如：投影仪, 白板, 音响" />
            <p className="text-xs text-slate-400 mt-1">多个设备用逗号分隔</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">状态</label>
            <Select value={form.status || '1'} onValueChange={v => setForm({...form, status: v as '0' | '1'})}>
                    <SelectTrigger>
                      <SelectValue placeholder="请选择" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">可用</SelectItem>
                      <SelectItem value="0">维护中</SelectItem>
                    </SelectContent>
                  </Select>
          </div>
        </div>
        <div className="p-6 border-t border-slate-100 bg-slate-50 rounded-b-xl flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-slate-600 hover:text-slate-800">取消</button>
          <button onClick={handleSubmit} className="bg-pink-500 text-white px-6 py-2 rounded-lg hover:bg-pink-600 font-medium flex items-center gap-2">
            <CheckCircle2 size={16} />{isEdit ? '保存修改' : '确认新增'}
          </button>
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
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm flex flex-col animate-in fade-in zoom-in duration-200">
        <div className="p-6">
          <h3 className="text-lg font-bold text-slate-800 mb-2">确认删除</h3>
          <p className="text-slate-600">确定要删除会议室 <span className="font-semibold text-red-600">「{roomName}」</span> 吗？此操作不可撤销。</p>
        </div>
        <div className="p-4 border-t border-slate-100 bg-slate-50 rounded-b-xl flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-slate-600 hover:text-slate-800">取消</button>
          <button onClick={onConfirm} className="bg-red-600 text-white px-6 py-2 rounded-lg hover:bg-red-700 font-medium flex items-center gap-2">
            <Trash2 size={16} />确认删除
          </button>
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

  return (
    <div className="space-y-6">
      {/* 标题栏和Tab切换 */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-4">
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Monitor className="text-pink-500" />会议室资源
          </h2>
          <div className="flex bg-slate-100 rounded-lg p-1">
            <button
              onClick={() => setActiveTab('rooms')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                activeTab === 'rooms' ? 'bg-white text-pink-500 shadow-sm' : 'text-slate-600 hover:text-slate-800'
              }`}
            >
              <Monitor size={16} className="inline mr-1" />会议室列表
            </button>
            <button
              onClick={() => setActiveTab('my-bookings')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                activeTab === 'my-bookings' ? 'bg-white text-pink-500 shadow-sm' : 'text-slate-600 hover:text-slate-800'
              }`}
            >
              <CalendarDays size={16} className="inline mr-1" />我的预订
            </button>
            <button
              onClick={() => setActiveTab('stats')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                activeTab === 'stats' ? 'bg-white text-pink-500 shadow-sm' : 'text-slate-600 hover:text-slate-800'
              }`}
            >
              <BarChart3 size={16} className="inline mr-1" />使用统计
            </button>
          </div>
        </div>
        {activeTab === 'rooms' && (
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setManageMode(!manageMode)}
              className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors ${
                manageMode ? 'bg-pink-500 text-white hover:bg-pink-600' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <Settings size={16} />{manageMode ? '退出管理' : '管理模式'}
            </button>
            {manageMode && (
              <button 
                onClick={handleAddRoom} 
                className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 flex items-center gap-2 transition-colors"
              >
                <Plus size={16} />新增会议室
              </button>
            )}
          </div>
        )}
      </div>

      {/* 会议室列表Tab */}
      {activeTab === 'rooms' && (
        <>
          {/* 筛选栏 */}
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-center gap-4">
              <div className="flex-1 relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input
                  type="text"
                  placeholder="搜索会议室名称或位置..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <div className="flex items-center gap-2">
                <Filter size={16} className="text-slate-500" />
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
              </div>
            </div>
          </div>

          {loading && (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-pink-500"></div>
            </div>
          )}

          {!loading && filteredRooms.length === 0 && (
            <div className="text-center py-16 bg-white rounded-xl border border-slate-200">
              <Monitor size={48} className="mx-auto text-slate-300 mb-4" />
              <p className="text-slate-500 text-lg mb-2">
                {searchQuery || statusFilter !== 'all' ? '没有找到符合条件的会议室' : '暂无会议室'}
              </p>
              {!searchQuery && statusFilter === 'all' && (
                <>
                  <p className="text-slate-400 text-sm mb-6">点击"管理模式"后可新增会议室</p>
                  <button 
                    onClick={() => { setManageMode(true); handleAddRoom(); }}
                    className="bg-pink-500 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-pink-600 inline-flex items-center gap-2"
                  >
                    <Plus size={16} />新增第一个会议室
                  </button>
                </>
              )}
            </div>
          )}

          {!loading && filteredRooms.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredRooms.map(room => {
                const realtimeStatus = getRoomRealtimeStatus(room, roomBookingsMap[room.roomId] || []);
                const statusCfg = roomStatusConfig[realtimeStatus];
                const StatusIcon = realtimeStatus === 'available' ? CheckCircle2 : realtimeStatus === 'in-use' ? Clock : XCircle;
                return (
                  <div key={room.roomId} className="bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-all overflow-hidden relative">
                    {manageMode && (
                      <div className="absolute top-3 left-3 z-10 flex gap-2">
                        <button 
                          onClick={() => handleEditRoom(room)} 
                          className="bg-white/90 backdrop-blur-sm text-pink-500 p-2 rounded-lg shadow-sm hover:bg-pink-50 border border-slate-200" 
                          title="编辑"
                        >
                          <Pencil size={14} />
                        </button>
                        <button 
                          onClick={() => handleDeleteRoom(room)} 
                          className="bg-white/90 backdrop-blur-sm text-red-600 p-2 rounded-lg shadow-sm hover:bg-red-50 border border-slate-200" 
                          title="删除"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )}
                    <div className="h-32 bg-slate-100 flex items-center justify-center relative">
                      <Monitor size={48} className="text-slate-300" />
                      <div className={`absolute top-4 right-4 px-2 py-1 rounded-full text-xs font-bold flex items-center gap-1 ${statusCfg.bg}`}>
                        <StatusIcon size={12} />
                        {statusCfg.label}
                      </div>
                    </div>
                    <div className="p-5">
                      <h3 className="text-lg font-bold text-slate-800 mb-1">{room.name}</h3>
                      <div className="flex items-center gap-4 text-xs text-slate-500 mb-3">
                        <span className="flex items-center gap-1"><MapPin size={12} className="text-pink-400" /> {room.location}</span>
                        <span className="flex items-center gap-1"><Users size={12} className="text-pink-400" /> {room.capacity}人</span>
                      </div>
                      <div className="flex flex-wrap gap-2 mb-3">
                        {parseEquipment(room.equipment).map((eq: string, i: number) => (
                          <span key={i} className="bg-slate-50 text-slate-600 px-2 py-1 rounded text-xs border border-slate-100">{eq}</span>
                        ))}
                        {parseEquipment(room.equipment).length === 0 && <span className="text-xs text-slate-400">暂无设备信息</span>}
                      </div>
                      <div className="mb-4 border-t border-slate-100 pt-3">
                        <RoomBookings key={`${room.roomId}-${refreshKey}`} roomId={room.roomId.toString()} onBookingsLoaded={handleBookingsLoaded} />
                      </div>
                      {!manageMode && (
                        <div className="flex gap-2">
                          <button 
                            onClick={() => { 
                              setSelectedRoom(room); 
                              setSelectedAttendees([]);
                              setBookingForm({
                                title: '',
                                date: getLocalDateString(),
                                startTime: '09:00',
                                endTime: '10:00',
                                description: ''
                              });
                            }} 
                            disabled={realtimeStatus === 'maintenance'}
                            className="flex-1 bg-pink-50 text-pink-500 py-2 rounded-lg font-medium hover:bg-pink-500 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            立即预订
                          </button>
                          <button
                            onClick={() => setWeekCalendarRoom(room)}
                            disabled={realtimeStatus === 'maintenance'}
                            className="px-3 py-2 bg-slate-50 text-slate-600 rounded-lg hover:bg-slate-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            title="周日历"
                          >
                            <CalendarDays size={18} />
                          </button>
                        </div>
                      )}
                      {manageMode && (
                        <div className="flex gap-2">
                          <button 
                            onClick={() => handleEditRoom(room)} 
                            className="flex-1 bg-pink-50 text-pink-500 py-2 rounded-lg font-medium hover:bg-pink-50 flex items-center justify-center gap-1"
                          >
                            <Pencil size={14} />编辑
                          </button>
                          <button 
                            onClick={() => handleDeleteRoom(room)} 
                            className="flex-1 bg-red-50 text-red-600 py-2 rounded-lg font-medium hover:bg-red-100 flex items-center justify-center gap-1"
                          >
                            <Trash2 size={14} />删除
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* 我的预订Tab */}
      {activeTab === 'my-bookings' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-center gap-2">
              <Filter size={16} className="text-slate-500" />
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
            </div>
          </div>

          {myBookings.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-xl border border-slate-200">
              <CalendarDays size={48} className="mx-auto text-slate-300 mb-4" />
              <p className="text-slate-500 text-lg">暂无预订记录</p>
            </div>
          ) : (
            <div className="space-y-3">
              {myBookings.map(booking => {
                const room = rooms.find(r => r.roomId === booking.roomId);
                const now = new Date();
                const start = new Date(booking.startTime);
                const canCancel = start > now;
                
                return (
                  <div key={booking.eventId} className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-md transition-shadow">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className="text-lg font-bold text-slate-800">{booking.title}</h3>
                          {getBookingStatusBadge(booking)}
                        </div>
                        <div className="flex items-center gap-4 text-sm text-slate-600">
                          <span className="flex items-center gap-1">
                            <Monitor size={14} className="text-pink-400" />
                            {room?.name || `会议室 ${booking.roomId}`}
                          </span>
                          <span className="flex items-center gap-1">
                            <MapPin size={14} className="text-pink-400" />
                            {room?.location || '-'}
                          </span>
                        </div>
                      </div>
                      {canCancel && (
                        <button
                          onClick={() => handleCancelBooking(booking.eventId)}
                          className="px-3 py-1.5 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 text-sm font-medium"
                        >
                          取消预订
                        </button>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-sm text-slate-500 mt-3 pt-3 border-t border-slate-100">
                      <span className="flex items-center gap-1">
                        <Clock size={14} />
                        {formatDateTime(booking.startTime)} - {formatDateTime(booking.endTime)}
                      </span>
                    </div>
                    {booking.description && (
                      <p className="text-sm text-slate-600 mt-2">{booking.description}</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 使用统计Tab */}
      {activeTab === 'stats' && (
        <div className="space-y-4">
          {stats.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-xl border border-slate-200">
              <BarChart3 size={48} className="mx-auto text-slate-300 mb-4" />
              <p className="text-slate-500 text-lg">暂无统计数据</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">会议室</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">预订次数</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">使用时长</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">使用天数</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">利用率</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {stats.map((stat, index) => {
                      const hours = Math.floor(stat.totalMinutes / 60);
                      const minutes = stat.totalMinutes % 60;
                      const utilizationRate = stat.usedDays > 0 ? ((stat.totalMinutes / (stat.usedDays * 8 * 60)) * 100).toFixed(1) : '0.0';
                      
                      return (
                        <tr key={index} className="hover:bg-slate-50">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center">
                              <Monitor size={16} className="text-pink-400 mr-2" />
                              <span className="text-sm font-medium text-slate-800">{stat.roomName}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                            {stat.bookingCount} 次
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                            {hours > 0 && `${hours}小时`}{minutes > 0 && `${minutes}分钟`}
                            {hours === 0 && minutes === 0 && '-'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                            {stat.usedDays} 天
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 bg-slate-100 rounded-full h-2 max-w-[100px]">
                                <div 
                                  className="bg-pink-500 h-2 rounded-full" 
                                  style={{ width: `${Math.min(parseFloat(utilizationRate), 100)}%` }}
                                />
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
          )}
        </div>
      )}

      {/* 预订弹窗 */}
      {selectedRoom && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl flex flex-col max-h-[90vh] animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center">
              <div>
                <h3 className="text-lg font-bold text-slate-800">预订会议室 - {selectedRoom.name}</h3>
                <p className="text-xs text-slate-500 mt-1">{selectedRoom.location} · 容纳{selectedRoom.capacity}人</p>
              </div>
              <button onClick={() => setSelectedRoom(null)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">会议主题 <span className="text-red-500">*</span></label>
                <Input
                  type="text"
                  value={bookingForm.title}
                  onChange={e => setBookingForm({ ...bookingForm, title: e.target.value })}
                  placeholder="例如：项目评审会议"
                />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">日期 <span className="text-red-500">*</span></label>
                  <Input
                    type="date"
                    value={bookingForm.date}
                    onChange={e => setBookingForm({ ...bookingForm, date: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">开始时间 <span className="text-red-500">*</span></label>
                  <Input
                    type="time"
                    value={bookingForm.startTime}
                    onChange={e => setBookingForm({ ...bookingForm, startTime: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">结束时间 <span className="text-red-500">*</span></label>
                  <Input
                    type="time"
                    value={bookingForm.endTime}
                    onChange={e => setBookingForm({ ...bookingForm, endTime: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">会议描述</label>
                <Textarea
                  className="h-20"
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
            <div className="p-6 border-t border-slate-100 bg-slate-50 rounded-b-xl flex justify-end gap-3">
              <button onClick={() => setSelectedRoom(null)} className="px-4 py-2 text-slate-600 hover:text-slate-800">
                取消
              </button>
              <button onClick={handleBooking} className="bg-pink-500 text-white px-6 py-2 rounded-lg hover:bg-pink-600 font-medium flex items-center gap-2">
                <CheckCircle2 size={16} />确认预订
              </button>
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
