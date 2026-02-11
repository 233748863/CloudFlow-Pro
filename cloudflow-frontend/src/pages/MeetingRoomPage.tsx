import React, { useState, useEffect, useCallback } from 'react';
import { MeetingRoom, SysScheduleEvent } from '../types';
import {
  getMeetingRooms, createMeetingRoom, updateMeetingRoom, deleteMeetingRoom,
  createEvent, getRoomEvents, getUserListForAttendees, getDeptTree,
  UserBriefItem, DeptTreeItem
} from '../services/api/schedule';
import {
  MapPin, Users, Monitor, CheckCircle2, XCircle, Plus, Pencil, Trash2,
  Settings, X, Clock, UserPlus, Calendar, ChevronRight, ChevronDown,
  Building2, User, Search
} from 'lucide-react';
import { toast } from 'sonner';
import { toBackendDateString } from '../utils/dateFormat';

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
                ? 'bg-indigo-600 border-indigo-600'
                : partialSelected
                  ? 'bg-indigo-200 border-indigo-400'
                  : 'border-slate-300 hover:border-indigo-400'
            }`}
          >
            {allSelected && <CheckCircle2 size={10} className="text-white" />}
            {partialSelected && !allSelected && <div className="w-2 h-0.5 bg-indigo-600 rounded" />}
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
                    selectedIds.includes(user.id) ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300 hover:border-indigo-400'
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
              <span key={u.id} className="inline-flex items-center gap-1 bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full text-xs">
                {u.name}
                <button onClick={(e) => { e.stopPropagation(); toggleUser(u.id); }} className="text-indigo-400 hover:text-indigo-600">
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
          <input
            type="text"
            className="w-full pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-md focus:ring-2 focus:ring-indigo-500 focus:outline-none"
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
        已选择 <span className="font-medium text-indigo-600">{selectedUsers.length}</span> 人
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
  }, [roomId]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const statusStyles: Record<string, { bg: string; text: string; icon: string }> = {
    ongoing: { bg: 'bg-emerald-50', text: 'text-emerald-600', icon: '🟢' },
    ended: { bg: 'bg-slate-50', text: 'text-slate-400', icon: '⏹' },
    upcoming: { bg: 'bg-indigo-50/50', text: 'text-indigo-600', icon: '🔵' },
  };

  return (
    <div className="space-y-1">
      <div className="text-xs font-medium text-slate-500 flex items-center gap-1"><Calendar size={10} /> 今日预订 ({bookings.length})</div>
      {bookings.slice(0, 3).map((b, i) => {
        const status = getBookingStatus(b);
        const style = statusStyles[status];
        return (
          <div key={i} className={`flex items-center gap-2 text-xs ${style.bg} rounded px-2 py-1`}>
            <Clock size={10} className={`${status === 'ongoing' ? 'text-emerald-500' : status === 'ended' ? 'text-slate-400' : 'text-indigo-500'} shrink-0`} />
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

// ==================== 会议室表单弹窗 ====================
const RoomFormModal: React.FC<{
  visible: boolean; room: Partial<MeetingRoom> | null; onClose: () => void; onSubmit: (room: Partial<MeetingRoom>) => void;
}> = ({ visible, room, onClose, onSubmit }) => {
  const [form, setForm] = useState<Partial<MeetingRoom>>({ name: '', capacity: 10, location: '', equipment: '[]', status: '1' });
  const [equipmentInput, setEquipmentInput] = useState('');

  useEffect(() => {
    if (room) { setForm({ ...room }); try { setEquipmentInput(JSON.parse(room.equipment || '[]').join(', ')); } catch { setEquipmentInput(''); } }
    else { setForm({ name: '', capacity: 10, location: '', equipment: '[]', status: '1' }); setEquipmentInput(''); }
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
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg flex flex-col animate-in fade-in zoom-in duration-200">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center">
          <h3 className="text-lg font-bold text-slate-800">{isEdit ? '编辑会议室' : '新增会议室'}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">会议室名称 <span className="text-red-500">*</span></label>
            <input type="text" className="w-full border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              value={form.name || ''} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="例如：大会议室A" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">位置 <span className="text-red-500">*</span></label>
              <input type="text" className="w-full border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                value={form.location || ''} onChange={e => setForm({ ...form, location: e.target.value })} placeholder="例如：3楼东侧" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">容纳人数 <span className="text-red-500">*</span></label>
              <input type="number" min={1} className="w-full border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                value={form.capacity || ''} onChange={e => setForm({ ...form, capacity: parseInt(e.target.value) || 0 })} placeholder="例如：50" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">设备配置</label>
            <input type="text" className="w-full border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              value={equipmentInput} onChange={e => setEquipmentInput(e.target.value)} placeholder="多个设备用逗号分隔，例如：投影仪, 白板, 音响" />
            <p className="text-xs text-slate-400 mt-1">多个设备用逗号分隔</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">状态</label>
            <select className="w-full border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              value={form.status || '1'} onChange={e => setForm({ ...form, status: e.target.value as '1' | '0' })}>
              <option value="1">可用</option>
              <option value="0">维护中</option>
            </select>
          </div>
        </div>
        <div className="p-6 border-t border-slate-100 bg-slate-50 rounded-b-xl flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-slate-600 hover:text-slate-800">取消</button>
          <button onClick={handleSubmit} className="bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700 font-medium flex items-center gap-2">
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
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
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

// ==================== 工具函数 ====================
// 获取本地日期字符串（YYYY-MM-DD格式），避免时区问题
function getLocalDateString(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function buildDeptTreeWithUsers(deptTree: DeptTreeItem[], users: UserBrief[]): DeptNodeWithUsers[] {
  const mapNode = (node: DeptTreeItem): DeptNodeWithUsers => ({
    ...node,
    users: users.filter(u => u.deptId === node.deptId),
    children: node.children ? node.children.map(mapNode) : [],
  });

  const tree = deptTree.map(mapNode);

  const allDeptIds = new Set<number>();
  const collectIds = (nodes: DeptTreeItem[]) => { for (const n of nodes) { allDeptIds.add(n.deptId); if (n.children) collectIds(n.children); } };
  collectIds(deptTree);

  const unassigned = users.filter(u => !u.deptId || !allDeptIds.has(u.deptId));
  if (unassigned.length > 0) {
    tree.push({ deptId: -1, parentId: 0, deptName: '未分配部门', users: unassigned, children: [] });
  }
  return tree;
}

// ==================== 会议室实时状态计算 ====================
type RoomRealtimeStatus = 'available' | 'in-use' | 'maintenance';

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

// ==================== 主页面 ====================
export const MeetingRoomPage = () => {
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
  // 存储每个会议室的今日预订数据，用于动态计算状态
  const [roomBookingsMap, setRoomBookingsMap] = useState<Record<string, SysScheduleEvent[]>>({});

  const handleBookingsLoaded = useCallback((roomId: string, bookings: SysScheduleEvent[]) => {
    setRoomBookingsMap(prev => ({ ...prev, [roomId]: bookings }));
  }, []);

  const fetchRooms = async () => {
    setLoading(true);
    try { setRooms(await getMeetingRooms()); } catch (e) { console.error("Fetch rooms failed", e); } finally { setLoading(false); }
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
    } catch (e) { console.error("Fetch org data failed", e); }
  };

  useEffect(() => { fetchRooms(); fetchOrgData(); }, []);

  // 每60秒自动刷新状态，确保会议室状态（空闲/使用中）实时更新
  useEffect(() => {
    const timer = setInterval(() => {
      // 触发重新渲染以更新基于当前时间的状态计算
      setRoomBookingsMap(prev => ({ ...prev }));
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  const handleBooking = async () => {
    if (!selectedRoom) return;
    if (!bookingForm.title || !bookingForm.date || !bookingForm.startTime || !bookingForm.endTime) { toast.error("请完善预订信息"); return; }
    const startDate = new Date(`${bookingForm.date}T${bookingForm.startTime}:00`);
    const endDate = new Date(`${bookingForm.date}T${bookingForm.endTime}:00`);
    if (startDate >= endDate) { toast.error("结束时间必须晚于开始时间"); return; }
    const startDateTime = toBackendDateString(startDate);
    const endDateTime = toBackendDateString(endDate);
    if (!startDateTime || !endDateTime) { toast.error("日期格式错误"); return; }
    try {
      await createEvent({
        title: bookingForm.title, description: bookingForm.description,
        startTime: startDateTime, endTime: endDateTime,
        isAllDay: false, type: 'MEETING', roomId: selectedRoom.roomId,
        attendees: JSON.stringify(selectedAttendees)
      });
      toast.success("预订成功");
      setSelectedRoom(null);
      setBookingForm({ title: '', date: new Date().toISOString().split('T')[0], startTime: '09:00', endTime: '10:00', description: '' });
      setSelectedAttendees([]);
      setRefreshKey(prev => prev + 1);
    } catch (e: any) { toast.error("预订失败: " + (e.response?.data?.msg || e.message || "时间冲突")); }
  };

  const handleAddRoom = () => { setEditingRoom(null); setRoomFormVisible(true); };
  const handleEditRoom = (room: MeetingRoom) => { setEditingRoom({ ...room }); setRoomFormVisible(true); };
  const handleDeleteRoom = (room: MeetingRoom) => { setDeletingRoom(room); setDeleteConfirmVisible(true); };

  const handleRoomFormSubmit = async (roomData: Partial<MeetingRoom>) => {
    try {
      if (roomData.roomId) { await updateMeetingRoom(roomData as MeetingRoom); toast.success("会议室更新成功"); }
      else { await createMeetingRoom(roomData); toast.success("会议室创建成功"); }
      setRoomFormVisible(false); setEditingRoom(null); fetchRooms();
    } catch (e: any) { toast.error("操作失败: " + (e.response?.data?.msg || e.message || "未知错误")); }
  };

  const handleDeleteConfirm = async () => {
    if (!deletingRoom) return;
    try {
      await deleteMeetingRoom(deletingRoom.roomId);
      toast.success("会议室已删除"); setDeleteConfirmVisible(false); setDeletingRoom(null); fetchRooms();
    } catch (e: any) { toast.error("删除失败: " + (e.response?.data?.msg || e.message || "未知错误")); }
  };

  const parseEquipment = (json: string) => { try { return JSON.parse(json); } catch { return []; } };

  return (
    <div className="space-y-6">
      {/* 标题栏 */}
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <Monitor className="text-indigo-600" />会议室资源
        </h2>
        <div className="flex items-center gap-3">
          <button onClick={() => setManageMode(!manageMode)}
            className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors ${manageMode ? 'bg-indigo-600 text-white hover:bg-indigo-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
            <Settings size={16} />{manageMode ? '退出管理' : '管理模式'}
          </button>
          {manageMode && (
            <button onClick={handleAddRoom} className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 flex items-center gap-2 transition-colors">
              <Plus size={16} />新增会议室
            </button>
          )}
        </div>
      </div>

      {/* 加载状态 */}
      {loading && (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div></div>
      )}

      {/* 空状态 */}
      {!loading && rooms.length === 0 && (
        <div className="text-center py-16 bg-white rounded-xl border border-slate-200">
          <Monitor size={48} className="mx-auto text-slate-300 mb-4" />
          <p className="text-slate-500 text-lg mb-2">暂无会议室</p>
          <p className="text-slate-400 text-sm mb-6">点击"管理模式"后可新增会议室</p>
          <button onClick={() => { setManageMode(true); handleAddRoom(); }}
            className="bg-indigo-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 inline-flex items-center gap-2">
            <Plus size={16} />新增第一个会议室
          </button>
        </div>
      )}

      {/* 会议室列表 */}
      {!loading && rooms.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {rooms.map(room => {
            const realtimeStatus = getRoomRealtimeStatus(room, roomBookingsMap[room.roomId] || []);
            const statusCfg = roomStatusConfig[realtimeStatus];
            const StatusIcon = realtimeStatus === 'available' ? CheckCircle2 : realtimeStatus === 'in-use' ? Clock : XCircle;
            return (
            <div key={room.roomId} className="bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-all overflow-hidden relative">
              {manageMode && (
                <div className="absolute top-3 left-3 z-10 flex gap-2">
                  <button onClick={() => handleEditRoom(room)} className="bg-white/90 backdrop-blur-sm text-indigo-600 p-2 rounded-lg shadow-sm hover:bg-indigo-50 border border-slate-200" title="编辑"><Pencil size={14} /></button>
                  <button onClick={() => handleDeleteRoom(room)} className="bg-white/90 backdrop-blur-sm text-red-600 p-2 rounded-lg shadow-sm hover:bg-red-50 border border-slate-200" title="删除"><Trash2 size={14} /></button>
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
                  <span className="flex items-center gap-1"><MapPin size={12} /> {room.location}</span>
                  <span className="flex items-center gap-1"><Users size={12} /> {room.capacity}人</span>
                </div>
                <div className="flex flex-wrap gap-2 mb-3">
                  {parseEquipment(room.equipment).map((eq: string, i: number) => (
                    <span key={i} className="bg-slate-50 text-slate-600 px-2 py-1 rounded text-xs border border-slate-100">{eq}</span>
                  ))}
                  {parseEquipment(room.equipment).length === 0 && <span className="text-xs text-slate-400">暂无设备信息</span>}
                </div>
                <div className="mb-4 border-t border-slate-100 pt-3">
                  <RoomBookings key={`${room.roomId}-${refreshKey}`} roomId={room.roomId} onBookingsLoaded={handleBookingsLoaded} />
                </div>
                {!manageMode && (
                  <button onClick={() => { 
                    setSelectedRoom(room); 
                    setSelectedAttendees([]);
                    // 重置表单为今日的日期和默认时间
                    setBookingForm({
                      title: '',
                      date: getLocalDateString(),
                      startTime: '09:00',
                      endTime: '10:00',
                      description: ''
                    });
                  }} disabled={realtimeStatus === 'maintenance'}
                    className="w-full bg-indigo-50 text-indigo-600 py-2 rounded-lg font-medium hover:bg-indigo-600 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                    立即预订
                  </button>
                )}
                {manageMode && (
                  <div className="flex gap-2">
                    <button onClick={() => handleEditRoom(room)} className="flex-1 bg-indigo-50 text-indigo-600 py-2 rounded-lg font-medium hover:bg-indigo-100 flex items-center justify-center gap-1"><Pencil size={14} />编辑</button>
                    <button onClick={() => handleDeleteRoom(room)} className="flex-1 bg-red-50 text-red-600 py-2 rounded-lg font-medium hover:bg-red-100 flex items-center justify-center gap-1"><Trash2 size={14} />删除</button>
                  </div>
                )}
              </div>
            </div>
            );
          })}
        </div>
      )}

      {/* 预订弹窗 */}
      {selectedRoom && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg flex flex-col animate-in fade-in zoom-in duration-200 max-h-[90vh]">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center">
              <div>
                <h3 className="text-lg font-bold text-slate-800">预订会议室</h3>
                <p className="text-xs text-slate-500 mt-1">当前选择: {selectedRoom.name}</p>
              </div>
              <button onClick={() => setSelectedRoom(null)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto flex-1">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">会议主题 <span className="text-red-500">*</span></label>
                <input type="text" className="w-full border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  value={bookingForm.title} onChange={e => setBookingForm({ ...bookingForm, title: e.target.value })} placeholder="请输入会议主题" />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">日期</label>
                  <input 
                    type="date" 
                    className="w-full border border-slate-300 rounded-lg p-2 text-sm"
                    value={bookingForm.date} 
                    min={getLocalDateString()}
                    onChange={e => setBookingForm({ ...bookingForm, date: e.target.value })} 
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">开始时间</label>
                  <input 
                    type="time" 
                    className="w-full border border-slate-300 rounded-lg p-2 text-sm"
                    value={bookingForm.startTime} 
                    onChange={e => {
                      const newStartTime = e.target.value;
                      // 同步结束时间为相同的时间
                      setBookingForm(prev => ({
                        ...prev,
                        startTime: newStartTime,
                        endTime: newStartTime
                      }));
                    }} 
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">结束时间</label>
                  <input 
                    type="time" 
                    className="w-full border border-slate-300 rounded-lg p-2 text-sm"
                    value={bookingForm.endTime}
                    min={bookingForm.startTime}
                    onChange={e => {
                      const newEndTime = e.target.value;
                      // 只有当新的结束时间晚于开始时间时才更新
                      if (newEndTime > bookingForm.startTime) {
                        setBookingForm({ ...bookingForm, endTime: newEndTime });
                      } else {
                        toast.error('结束时间必须晚于开始时间');
                      }
                    }} 
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center gap-1">
                  <Building2 size={14} /> 参与人（按部门选择）
                </label>
                <OrgTreePicker deptTree={deptTree} selectedIds={selectedAttendees} onChange={setSelectedAttendees} />
                <p className="text-xs text-slate-400 mt-1">可选择整个部门或单独选择人员，被选中的参与人也能在自己的日程中看到此会议</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">备注说明</label>
                <textarea className="w-full border border-slate-300 rounded-lg p-2 h-20 text-sm"
                  value={bookingForm.description} onChange={e => setBookingForm({ ...bookingForm, description: e.target.value })}
                  placeholder="请输入参会议题、特殊需求等..." />
              </div>
            </div>
            <div className="p-6 border-t border-slate-100 bg-slate-50 rounded-b-xl flex justify-end gap-3">
              <button onClick={() => setSelectedRoom(null)} className="px-4 py-2 text-slate-600 hover:text-slate-800">取消</button>
              <button onClick={handleBooking} className="bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700 font-medium flex items-center gap-2">
                <CheckCircle2 size={16} />确认预订
              </button>
            </div>
          </div>
        </div>
      )}

      <RoomFormModal visible={roomFormVisible} room={editingRoom}
        onClose={() => { setRoomFormVisible(false); setEditingRoom(null); }} onSubmit={handleRoomFormSubmit} />
      <DeleteConfirmModal visible={deleteConfirmVisible} roomName={deletingRoom?.name || ''}
        onClose={() => { setDeleteConfirmVisible(false); setDeletingRoom(null); }} onConfirm={handleDeleteConfirm} />
    </div>
  );
};
