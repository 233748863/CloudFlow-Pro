import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, MapPin, Users, Clock, Calendar, Loader2, RefreshCw, Search, SlidersHorizontal } from 'lucide-react';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { toast } from 'sonner';
import { format, addHours, startOfHour } from 'date-fns';
import { getMeetingRooms, createEvent } from '@/services/api/schedule';
import { DatePicker } from '@/components/common';
import { useMeetingConflictConsent } from '@/pages/meeting/useMeetingConflictConsent';
import { MobileFilterDrawer } from '@/components/mobile/MobileFilterDrawer';
import { useAuth } from '@/context/AuthContext';
import { getAuthSessionVersion } from '@/utils/authStorage';
import type { SysScheduleEvent } from '@/types';

interface MeetingRoom {
  id: string;
  name: string;
  location: string;
  capacity: number;
  facilities: string[];
  status: 'available' | 'occupied' | 'maintenance';
}

interface Booking {
  roomId: string;
  roomName: string;
  date: string;
  startTime: string;
  endTime: string;
  purpose: string;
  attendees: number;
}

const createBooking = (): Booking => ({
  roomId: '', roomName: '', date: format(new Date(), 'yyyy-MM-dd'),
  startTime: format(startOfHour(addHours(new Date(), 1)), 'HH:mm'),
  endTime: format(startOfHour(addHours(new Date(), 2)), 'HH:mm'),
  purpose: '', attendees: 1,
});

const readFacilities = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value !== 'string' || !value.trim()) return [];
  try { const parsed: unknown = JSON.parse(value); if (Array.isArray(parsed)) return parsed.map(String); } catch { /* 兼容旧逗号分隔数据。 */ }
  return value.split(',').map(item => item.trim()).filter(Boolean);
};

export const MobileMeetingRoom: React.FC = () => {
  const { confirmSchedule, conflictDialog } = useMeetingConflictConsent();
  const { user, hasPermission } = useAuth();
  const canRead = Boolean(user && hasPermission('oa:meeting-room:list'));
  const canBook = Boolean(canRead && hasPermission('oa:schedule:add'));
  const navigate = useNavigate();
  const [rooms, setRooms] = useState<MeetingRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterDraft, setFilterDraft] = useState('');
  const [selectedRoom, setSelectedRoom] = useState<MeetingRoom | null>(null);
  const [bookingForm, setBookingForm] = useState<Booking>(createBooking);
  const [submitting, setSubmitting] = useState(false);
  const roomRequest = useRef(0);
  const submitRequest = useRef(0);
  const submission = useRef(false);
  const bookingAllowed = useRef(canBook);
  bookingAllowed.current = canBook;

  /**
   * 将后端会议室数据映射为前端所需格式
   * 后端状态：1可用、0维护；兼容旧数据2使用中。
   */
  const mapRoomStatus = (backendStatus: string | number): 'available' | 'occupied' | 'maintenance' => {
    const statusStr = String(backendStatus);
    switch (statusStr) {
      case '1': return 'available';
      case '2': return 'occupied';
      case '0': return 'maintenance';
      default: return 'maintenance';
    }
  };

  // 获取会议室列表 - 调用真实API
  const fetchRooms = useCallback(async () => {
    const sequence = ++roomRequest.current;
    const session = getAuthSessionVersion();
    const isCurrent = () => sequence === roomRequest.current && session === getAuthSessionVersion();
    if (!canRead) { setRooms([]); setLoading(false); return false; }
    try {
      setLoading(true);
      const data = await getMeetingRooms();
      if (!isCurrent()) return false;
      // 将后端数据映射为前端格式
      const mappedRooms: MeetingRoom[] = (Array.isArray(data) ? data : []).map((room: any) => ({
        id: String(room.roomId ?? room.id),
        name: room.name || room.roomName || '',
        location: room.location || '',
        capacity: room.capacity || 0,
        facilities: readFacilities(room.equipment ?? room.facilities),
        status: mapRoomStatus(room.status),
      }));
      setRooms(mappedRooms);
      return true;
    } catch (err: any) {
      if (!isCurrent()) return false;
      toast.error(err.message || '加载会议室失败');
      return false;
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [canRead, user?.id, user?.tenantId]);

  useEffect(() => {
    setRooms([]); setSelectedRoom(null); setBookingForm(createBooking());
    setSearchQuery(''); setFilterDraft(''); setFilterOpen(false);
    setSubmitting(false); submission.current = false; submitRequest.current++;
    void fetchRooms();
    return () => { roomRequest.current++; submitRequest.current++; };
  }, [fetchRooms]);

  // 下拉刷新
  const handleRefresh = async () => {
    if (await fetchRooms()) toast.success('刷新成功');
  };

  const { isRefreshing, pullDistance, isPulling } = usePullToRefresh({
    onRefresh: handleRefresh,
  });

  // 过滤会议室
  const filteredRooms = rooms.filter(room =>
    room.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    room.location.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // 获取状态样式
  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'available':
        return 'bg-green-100 text-green-600 border-green-200';
      case 'occupied':
        return 'bg-red-100 text-red-600 border-red-200';
      case 'maintenance':
        return 'bg-orange-100 text-orange-600 border-orange-200';
      default:
        return 'bg-cf-surface-3 text-cf-muted border-slate-200';
    }
  };

  // 获取状态标签
  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'available':
        return '可用';
      case 'occupied':
        return '使用中';
      case 'maintenance':
        return '维护中';
      default:
        return '未知';
    }
  };

  // 选择会议室
  const handleSelectRoom = (room: MeetingRoom) => {
    if (!canBook) { toast.error('暂无会议预订权限'); return; }
    if (room.status !== 'available') {
      toast.error('该会议室当前不可用');
      return;
    }
    setSelectedRoom(room);
    setBookingForm(prev => ({
      ...prev,
      roomId: room.id,
      roomName: room.name,
    }));
  };

  // 提交预订 - 调用真实API
  const handleSubmit = async () => {
    if (!canBook) { toast.error('暂无会议预订权限'); return; }
    if (submission.current) return;
    // 验证
    if (!bookingForm.roomId) {
      toast.error('请选择会议室');
      return;
    }
    if (!bookingForm.purpose.trim()) {
      toast.error('请输入会议主题');
      return;
    }
    if (!Number.isInteger(bookingForm.attendees) || bookingForm.attendees < 1) {
      toast.error('参会人数至少为1人');
      return;
    }

    const selectedRoomData = rooms.find(r => r.id === bookingForm.roomId);
    if (selectedRoomData && bookingForm.attendees > selectedRoomData.capacity) {
      toast.error(`该会议室最多容纳${selectedRoomData.capacity}人`);
      return;
    }

    // 验证时间
    const startDateTime = new Date(`${bookingForm.date}T${bookingForm.startTime}`);
    const endDateTime = new Date(`${bookingForm.date}T${bookingForm.endTime}`);
    if (!Number.isFinite(startDateTime.getTime()) || !Number.isFinite(endDateTime.getTime())) {
      toast.error('请选择有效的预订日期和时间'); return;
    }
    if (endDateTime <= startDateTime) {
      toast.error('结束时间必须晚于开始时间');
      return;
    }
    if (startDateTime < new Date()) {
      toast.error('预订时间不能早于当前时间');
      return;
    }

    const sequence = ++submitRequest.current;
    const session = getAuthSessionVersion();
    const isCurrent = () => sequence === submitRequest.current && session === getAuthSessionVersion() && bookingAllowed.current;
    submission.current = true; setSubmitting(true);
    try {
      // 调用日程创建API进行会议室预订
      const payload: Partial<SysScheduleEvent> = {
        title: bookingForm.purpose.trim(),
        roomId: String(bookingForm.roomId),
        startTime: `${bookingForm.date} ${bookingForm.startTime}:00`,
        endTime: `${bookingForm.date} ${bookingForm.endTime}:00`,
        expectedAttendees: bookingForm.attendees,
        type: 'MEETING',
        description: `会议室预订：${bookingForm.roomName}，参会人数：${bookingForm.attendees}`,
      };
      const confirmed = await confirmSchedule(payload);
      if (confirmed === undefined || !isCurrent()) return;
      await createEvent({ ...payload, confirmParticipantConflicts: confirmed });
      if (!isCurrent()) return;
      toast.success('预订成功！');
      navigate('/');
    } catch (err: any) {
      if (!isCurrent()) return;
      toast.error(err.message || '预订失败');
    } finally {
      if (sequence === submitRequest.current && session === getAuthSessionVersion()) { submission.current = false; setSubmitting(false); }
    }
  };

  if (!canRead) return <div className="p-6 text-center text-cf-muted">暂无会议室查看权限</div>;

  // 加载状态
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <Loader2 className="animate-spin text-[#0d95b5] mx-auto mb-3" size={32} />
          <p className="text-sm text-cf-subtle">加载会议室...</p>
        </div>
      </div>
    );
  }

  // 预订表单视图
  if (selectedRoom) {
    return (
      <div className="min-h-screen bg-[var(--cf-bg)]">
        {/* Header */}
        <div className="bg-[var(--cf-surface-strong)] border-b border-slate-200 px-4 py-3 flex items-center gap-3 sticky top-0 z-30">
          <button
            onClick={() => setSelectedRoom(null)}
            disabled={submitting}
            className="min-h-11 min-w-11 p-1 -ml-1 disabled:opacity-50"
            aria-label="返回"
          >
            <ChevronLeft size={24} className="text-cf-muted" />
          </button>
          <h1 className="text-lg font-semibold text-cf-title flex-1">预订会议室</h1>
        </div>

        {conflictDialog}
        {/* Form */}
        <div className="p-4 pb-28 space-y-4">
          {/* 会议室信息 */}
          <div className="bg-[var(--cf-surface-strong)] rounded-lg p-4 shadow-none border border-slate-100">
            <h3 className="font-semibold text-cf-title mb-2">{selectedRoom.name}</h3>
            <div className="space-y-2 text-sm text-cf-muted">
              <div className="flex items-center gap-2">
                <MapPin size={14} />
                <span>{selectedRoom.location}</span>
              </div>
              <div className="flex items-center gap-2">
                <Users size={14} />
                <span>容纳 {selectedRoom.capacity} 人</span>
              </div>
              <div className="flex flex-wrap gap-1 mt-2">
                {selectedRoom.facilities.map(facility => (
                  <span
                    key={facility}
                    className="text-xs bg-[#effbfe] text-[#0d95b5] px-2 py-1 rounded"
                  >
                    {facility}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* 日期选择 */}
          <div className="bg-[var(--cf-surface-strong)] rounded-lg p-4 shadow-none border border-slate-100">
            <label htmlFor="meeting-booking-date" className="block text-sm font-medium text-cf-body mb-2">
              <Calendar size={16} className="inline mr-1" />
              预订日期
            </label>
            <DatePicker
              id="meeting-booking-date"
              type="date"
              value={bookingForm.date}
              onChange={e => setBookingForm({ ...bookingForm, date: e.target.value })}
              min={format(new Date(), 'yyyy-MM-dd')}
              className="w-full"
            />
          </div>

          {/* 时间选择 */}
          <div className="bg-[var(--cf-surface-strong)] rounded-lg p-4 shadow-none border border-slate-100">
            <label className="block text-sm font-medium text-cf-body mb-2">
              <Clock size={16} className="inline mr-1" />
              使用时间
            </label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="meeting-booking-start" className="text-xs text-cf-subtle mb-1 block">开始时间</label>
                <DatePicker
                  id="meeting-booking-start"
                  type="time"
                  value={bookingForm.startTime}
                  onChange={e => setBookingForm({ ...bookingForm, startTime: e.target.value })}
                  className="w-full"
                />
              </div>
              <div>
                <label htmlFor="meeting-booking-end" className="text-xs text-cf-subtle mb-1 block">结束时间</label>
                <DatePicker
                  id="meeting-booking-end"
                  type="time"
                  value={bookingForm.endTime}
                  onChange={e => setBookingForm({ ...bookingForm, endTime: e.target.value })}
                  className="w-full"
                />
              </div>
            </div>
          </div>

          {/* 会议主题 */}
          <div className="bg-[var(--cf-surface-strong)] rounded-lg p-4 shadow-none border border-slate-100">
            <label htmlFor="meeting-booking-purpose" className="block text-sm font-medium text-cf-body mb-2">
              会议主题 <span className="text-red-500">*</span>
            </label>
            <input
              id="meeting-booking-purpose"
              type="text"
              value={bookingForm.purpose}
              onChange={e => setBookingForm({ ...bookingForm, purpose: e.target.value })}
              placeholder="请输入会议主题"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0d95b5]"
            />
          </div>

          {/* 参会人数 */}
          <div className="bg-[var(--cf-surface-strong)] rounded-lg p-4 shadow-none border border-slate-100">
            <label htmlFor="meeting-booking-attendees" className="block text-sm font-medium text-cf-body mb-2">
              <Users size={16} className="inline mr-1" />
              参会人数
            </label>
            <input
              id="meeting-booking-attendees"
              type="number"
              value={bookingForm.attendees}
              onChange={e => setBookingForm({ ...bookingForm, attendees: Number(e.target.value) })}
              min="1"
              max={selectedRoom.capacity}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0d95b5]"
            />
            <p className="text-xs text-cf-subtle mt-1">
              该会议室最多容纳 {selectedRoom.capacity} 人
            </p>
          </div>

        </div>
        <footer className="cf-mobile-booking-footer">
          <button
            onClick={handleSubmit}
            disabled={submitting || !canBook}
            className="w-full bg-[#0d95b5] text-white py-3 rounded-lg font-medium hover:bg-[#0b7894] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {submitting ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                提交中...
              </>
            ) : (
              '确认预订'
            )}
          </button>
        </footer>
      </div>
    );
  }

  // 会议室列表视图
  return (
    <div className="min-h-screen bg-[var(--cf-bg)] relative">
      {/* Pull to Refresh */}
      {isPulling && (
        <div
          className="absolute top-0 left-0 right-0 flex justify-center items-center transition-all duration-200 z-20"
          style={{
            transform: `translateY(${Math.min(pullDistance, 80)}px)`,
            opacity: Math.min(pullDistance / 80, 1),
          }}
        >
          <div className="bg-[var(--cf-surface-strong)] rounded-full p-2 shadow-none">
            {isRefreshing ? (
              <Loader2 className="animate-spin text-[#0d95b5]" size={24} />
            ) : (
              <RefreshCw
                className="text-[#0d95b5] transition-transform"
                size={24}
                style={{ transform: `rotate(${Math.min((pullDistance / 80) * 360, 360)}deg)` }}
              />
            )}
          </div>
        </div>
      )}

      {/* Header */}
      <div className="bg-[var(--cf-surface-strong)] border-b border-slate-200 px-4 py-3 flex items-center gap-3 sticky top-0 z-30">
        <button
          onClick={() => navigate(-1)}
          className="min-h-11 min-w-11 p-1 -ml-1"
          aria-label="返回"
        >
          <ChevronLeft size={24} className="text-cf-muted" />
        </button>
        <h1 className="text-lg font-semibold text-cf-title flex-1">会议室预订</h1>
        <button type="button" aria-label="刷新会议室" onClick={handleRefresh} disabled={isRefreshing} className="min-h-11 min-w-11 p-2"><RefreshCw size={20} /></button>
        <button type="button" aria-label="筛选会议室" onClick={() => { setFilterDraft(searchQuery); setFilterOpen(true); }} className="min-h-11 min-w-11 p-2"><SlidersHorizontal size={20} /></button>
      </div>

      <MobileFilterDrawer open={filterOpen} title="筛选会议室" onClose={() => setFilterOpen(false)} onReset={() => setFilterDraft('')} onApply={() => { setSearchQuery(filterDraft.trim()); setFilterOpen(false); }}>
        <label htmlFor="meeting-room-keyword" className="mb-2 block text-sm text-cf-body">会议室名称或位置</label>
        <div className="relative">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-cf-faint" />
          <input
            id="meeting-room-keyword"
            type="text"
            value={filterDraft}
            onChange={e => setFilterDraft(e.target.value)}
            placeholder="搜索会议室名称或位置"
            className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0d95b5]"
          />
        </div>
      </MobileFilterDrawer>
      {searchQuery && <p className="px-4 pt-3 text-sm text-cf-muted">筛选：{searchQuery}</p>}

      {/* Room List */}
      <div className="p-4 space-y-3">
        {filteredRooms.length > 0 ? (
          filteredRooms.map(room => (
            <div
              key={room.id}
              onClick={() => handleSelectRoom(room)}
              onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); handleSelectRoom(room); } }}
              className={`bg-[var(--cf-surface-strong)] rounded-lg p-4 shadow-none border transition-colors ${
                room.status === 'available'
                  ? 'border-slate-100 active:bg-[var(--cf-bg)] cursor-pointer'
                  : 'border-slate-200 opacity-60'
              }`}
              role="button"
              tabIndex={canBook && room.status === 'available' ? 0 : -1}
              aria-disabled={!canBook || room.status !== 'available'}
              data-meeting-room-id={room.id}
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-semibold text-cf-title">{room.name}</h3>
                  <div className="flex items-center gap-1 text-sm text-cf-subtle mt-1">
                    <MapPin size={14} />
                    <span>{room.location}</span>
                  </div>
                </div>
                <span
                  className={`text-xs px-2 py-1 rounded-full border ${getStatusStyle(room.status)}`}
                >
                  {getStatusLabel(room.status)}
                </span>
              </div>

              <div className="flex items-center gap-4 text-sm text-cf-muted mb-2">
                <div className="flex items-center gap-1">
                  <Users size={14} />
                  <span>{room.capacity}人</span>
                </div>
              </div>

              <div className="flex flex-wrap gap-1">
                {room.facilities.map(facility => (
                  <span
                    key={facility}
                    className="text-xs bg-cf-surface-3 text-cf-muted px-2 py-0.5 rounded"
                  >
                    {facility}
                  </span>
                ))}
              </div>
            </div>
          ))
        ) : (
          <div className="bg-[var(--cf-surface-strong)] rounded-lg p-12 text-center">
            <MapPin size={48} className="text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-cf-subtle">未找到符合条件的会议室</p>
          </div>
        )}
      </div>
      {conflictDialog}
    </div>
  );
};
