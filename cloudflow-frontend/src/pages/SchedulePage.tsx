import React, { useState, useEffect } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import { useAuth } from '../context/AuthContext';
import { SysScheduleEvent } from '../types';
import { getMyEvents, createEvent, deleteEvent } from '../services/api/schedule';
import { Calendar, Plus, MapPin, Clock } from 'lucide-react';
import { toast } from 'sonner';

export const SchedulePage = () => {
  const { user } = useAuth();
  const [events, setEvents] = useState<any[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<{start: Date, end: Date} | null>(null);
  
  // New Event Form
  const [form, setForm] = useState<Partial<SysScheduleEvent>>({
      title: '',
      type: 'PERSONAL',
      isAllDay: false
  });

  const fetchEvents = async (start: Date, end: Date) => {
      try {
          const res = await getMyEvents(start.toISOString(), end.toISOString());
          const calendarEvents = res.map(e => ({
              id: e.eventId,
              title: e.title,
              start: e.startTime,
              end: e.endTime,
              allDay: e.isAllDay,
              backgroundColor: getEventColor(e.type),
              borderColor: getEventColor(e.type),
              extendedProps: {
                  description: e.description,
                  type: e.type,
                  roomId: e.roomId
              }
          }));
          setEvents(calendarEvents);
      } catch (e) {
          console.error("Fetch events failed", e);
      }
  };

  const getEventColor = (type: string) => {
      switch(type) {
          case 'MEETING': return '#6366f1'; // Indigo
          case 'WORK': return '#10b981'; // Emerald
          case 'PERSONAL': return '#f59e0b'; // Amber
          default: return '#64748b'; // Slate
      }
  };

  const handleDateSelect = (selectInfo: any) => {
      setForm({
          title: '',
          type: 'PERSONAL',
          isAllDay: selectInfo.allDay,
          startTime: selectInfo.startStr,
          endTime: selectInfo.endStr
      });
      setSelectedDate({ start: selectInfo.start, end: selectInfo.end });
      setIsModalOpen(true);
  };

  const handleEventClick = async (clickInfo: any) => {
      if (confirm(`确认删除日程 "${clickInfo.event.title}" 吗?`)) {
          try {
              await deleteEvent(clickInfo.event.id);
              clickInfo.event.remove();
              toast.success("删除成功");
          } catch (e) {
              toast.error("删除失败");
          }
      }
  };

  const handleSubmit = async () => {
      if (!form.title || !form.startTime || !form.endTime) {
          toast.error("请完善日程信息");
          return;
      }
      try {
          await createEvent(form);
          toast.success("创建成功");
          setIsModalOpen(false);
          // Refresh events
          if (selectedDate) fetchEvents(selectedDate.start, selectedDate.end); // Simplified refresh
          // Better: Refetch current view range
      } catch (e) {
          toast.error("创建失败，可能是时间冲突");
      }
  };

  if (!user) return null;

  return (
    <div className="h-full flex flex-col space-y-4">
        <div className="flex justify-between items-center shrink-0">
            <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                <Calendar className="text-indigo-600" />
                我的日程
            </h2>
            <div className="flex gap-2">
                <div className="flex items-center gap-2 text-xs text-slate-500 mr-4">
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-indigo-500"></span>会议</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500"></span>工作</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500"></span>个人</span>
                </div>
                <button 
                    onClick={() => {
                        setForm({ title: '', type: 'PERSONAL', isAllDay: false, startTime: new Date().toISOString(), endTime: new Date().toISOString() });
                        setIsModalOpen(true);
                    }}
                    className="bg-indigo-600 text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 flex items-center gap-1"
                >
                    <Plus size={16} />
                    新建日程
                </button>
            </div>
        </div>

        <div className="flex-1 bg-white p-4 rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <FullCalendar
                plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
                headerToolbar={{
                    left: 'prev,next today',
                    center: 'title',
                    right: 'dayGridMonth,timeGridWeek,timeGridDay'
                }}
                initialView="dayGridMonth"
                editable={true}
                selectable={true}
                selectMirror={true}
                dayMaxEvents={true}
                weekends={true}
                events={events}
                datesSet={(dateInfo) => fetchEvents(dateInfo.start, dateInfo.end)}
                select={handleDateSelect}
                eventClick={handleEventClick}
                height="100%"
                locale="zh-cn"
                buttonText={{
                    today: '今天',
                    month: '月',
                    week: '周',
                    day: '日'
                }}
            />
        </div>

        {/* Create Modal */}
        {isModalOpen && (
            <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-xl shadow-xl w-full max-w-md flex flex-col">
                    <div className="p-6 border-b border-slate-100">
                        <h3 className="text-lg font-bold text-slate-800">新建日程</h3>
                    </div>
                    <div className="p-6 space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">主题</label>
                            <input 
                                type="text" 
                                className="w-full border border-slate-300 rounded-lg p-2"
                                value={form.title}
                                onChange={e => setForm({...form, title: e.target.value})}
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">类型</label>
                                <select 
                                    className="w-full border border-slate-300 rounded-lg p-2"
                                    value={form.type}
                                    onChange={e => setForm({...form, type: e.target.value as any})}
                                >
                                    <option value="PERSONAL">个人事务</option>
                                    <option value="WORK">工作安排</option>
                                    <option value="MEETING">会议预订</option>
                                </select>
                            </div>
                            <div className="flex items-center mt-6">
                                <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                                    <input 
                                        type="checkbox"
                                        checked={form.isAllDay}
                                        onChange={e => setForm({...form, isAllDay: e.target.checked})}
                                        className="rounded text-indigo-600 focus:ring-indigo-500"
                                    />
                                    全天事件
                                </label>
                            </div>
                        </div>
                        
                        {!form.isAllDay && (
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">开始时间</label>
                                    <input 
                                        type="datetime-local"
                                        className="w-full border border-slate-300 rounded-lg p-2 text-xs"
                                        value={form.startTime ? new Date(form.startTime).toISOString().slice(0, 16) : ''}
                                        onChange={e => setForm({...form, startTime: new Date(e.target.value).toISOString()})}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">结束时间</label>
                                    <input 
                                        type="datetime-local"
                                        className="w-full border border-slate-300 rounded-lg p-2 text-xs"
                                        value={form.endTime ? new Date(form.endTime).toISOString().slice(0, 16) : ''}
                                        onChange={e => setForm({...form, endTime: new Date(e.target.value).toISOString()})}
                                    />
                                </div>
                            </div>
                        )}

                        {form.type === 'MEETING' && (
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">会议室 (暂未关联列表)</label>
                                <input 
                                    type="text" 
                                    className="w-full border border-slate-300 rounded-lg p-2 bg-slate-50"
                                    disabled
                                    placeholder="请前往会议室管理页面预订"
                                />
                                <p className="text-xs text-amber-500 mt-1">注：当前页面仅支持创建普通日程，预订会议室请使用专用入口。</p>
                            </div>
                        )}

                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">描述</label>
                            <textarea 
                                className="w-full border border-slate-300 rounded-lg p-2 h-20"
                                value={form.description || ''}
                                onChange={e => setForm({...form, description: e.target.value})}
                            />
                        </div>
                    </div>
                    <div className="p-6 border-t border-slate-100 bg-slate-50 rounded-b-xl flex justify-end gap-3">
                        <button 
                            onClick={() => setIsModalOpen(false)}
                            className="px-4 py-2 text-slate-600 hover:text-slate-800"
                        >
                            取消
                        </button>
                        <button 
                            onClick={handleSubmit}
                            className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700"
                        >
                            保存
                        </button>
                    </div>
                </div>
            </div>
        )}
    </div>
  );
};
