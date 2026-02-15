import React, { useState, useEffect, useRef } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import { useAuth } from '../context/AuthContext';
import { SysScheduleEvent, MeetingRoom } from '../types';
import { getMyEvents, createEvent, deleteEvent, getMeetingRooms } from '../services/api/schedule';
import { Calendar, Plus, MapPin, Clock, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { toBackendDateString, toLocalDatetimeString, toQueryDateString } from '../utils/dateFormat';

export const SchedulePage = () => {
  const { user } = useAuth();
  const [events, setEvents] = useState<any[]>([]);
  const [meetingRooms, setMeetingRooms] = useState<MeetingRoom[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<{start: Date, end: Date} | null>(null);
  // 保存当前日历视图的完整日期范围，用于刷新
  const currentViewRange = useRef<{start: Date, end: Date} | null>(null);
  
  // New Event Form
  const [form, setForm] = useState<Partial<SysScheduleEvent>>({
      title: '',
      type: 'PERSONAL',
      isAllDay: false
  });

  // Fetch meeting rooms on mount
  useEffect(() => {
      const loadRooms = async () => {
          try {
              const rooms = await getMeetingRooms();
              setMeetingRooms(rooms);
          } catch (e) {
              console.error("Failed to load meeting rooms", e);
          }
      };
      loadRooms();
  }, []);

  // Helper function to get room name by ID
  const getRoomName = (roomId?: string) => {
      if (!roomId) return null;
      // Handle both string and number comparison
      const room = meetingRooms.find(r => String(r.roomId) === String(roomId));
      return room?.name || `会议室 ${roomId}`;
  };

  const fetchEvents = async (start: Date, end: Date) => {
      try {
          const res = await getMyEvents(toQueryDateString(start), toQueryDateString(end));
          const eventList = Array.isArray(res) ? res : [];
          const calendarEvents = eventList.map(e => {
              const roomName = getRoomName(e.roomId);
              // Build a more descriptive title
              let displayTitle = e.title;
              if (roomName) {
                  displayTitle = `${e.title} @ ${roomName}`;
              }
              
              return {
                  id: e.eventId,
                  title: displayTitle,
                  start: e.startTime,
                  end: e.endTime,
                  allDay: e.isAllDay,
                  backgroundColor: getEventColor(e.type),
                  borderColor: getEventColor(e.type),
                  extendedProps: {
                      originalTitle: e.title,
                      description: e.description,
                      type: e.type,
                      roomId: e.roomId,
                      roomName: roomName
                  }
              };
          });
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
          startTime: toBackendDateString(selectInfo.start),
          endTime: toBackendDateString(selectInfo.end)
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
          // 使用当前日历视图的完整日期范围刷新事件
          if (currentViewRange.current) {
              fetchEvents(currentViewRange.current.start, currentViewRange.current.end);
          }
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
                        setForm({ title: '', type: 'PERSONAL', isAllDay: false, startTime: toBackendDateString(new Date()), endTime: toBackendDateString(new Date()) });
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
            <style>{`
                /* 月视图事件紧凑样式 */
                .fc-dayGridMonth-view .fc-event {
                    border-radius: 3px !important;
                    padding: 0 !important;
                    margin: 1px 2px !important;
                    font-size: 0.75rem !important;
                    line-height: 1.2 !important;
                }
                .fc-dayGridMonth-view .fc-daygrid-event-harness {
                    margin-top: 0 !important;
                }
                /* 月视图日期格子允许滚动查看更多事件 */
                .fc-dayGridMonth-view .fc-daygrid-day-events {
                    max-height: none !important;
                    overflow-y: auto;
                }
                .fc-dayGridMonth-view .fc-daygrid-day-frame {
                    min-height: 80px;
                }
                /* 隐藏月视图事件的默认圆点指示器 */
                .fc-dayGridMonth-view .fc-daygrid-event-dot {
                    display: none !important;
                }
                /* 弹出层样式 */
                .fc-popover .fc-event {
                    border-radius: 4px;
                    padding: 2px 4px;
                    margin: 2px 0;
                }
            `}</style>
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
                dayMaxEvents={false}
                weekends={true}
                events={events}
                datesSet={(dateInfo) => {
                    currentViewRange.current = { start: dateInfo.start, end: dateInfo.end };
                    fetchEvents(dateInfo.start, dateInfo.end);
                }}
                select={handleDateSelect}
                eventClick={handleEventClick}
                eventContent={(eventInfo) => {
                    const { event, view } = eventInfo;
                    const props = event.extendedProps;
                    const isMonthView = view.type === 'dayGridMonth';
                    
                    // 月视图：紧凑单行显示，最大化可见事件数量
                    if (isMonthView) {
                        return (
                            <div className="flex items-center gap-1 px-1 py-0 text-xs leading-tight truncate w-full" style={{ minHeight: '18px' }}>
                                <span 
                                    className="w-2 h-2 rounded-full shrink-0" 
                                    style={{ backgroundColor: event.backgroundColor || '#64748b' }}
                                />
                                {eventInfo.timeText && (
                                    <span className="opacity-70 shrink-0">{eventInfo.timeText}</span>
                                )}
                                <span className="font-medium truncate">{props.originalTitle || event.title}</span>
                            </div>
                        );
                    }
                    
                    // 周视图/日视图：完整显示详细信息
                    return (
                        <div className="fc-event-main-frame p-1">
                            <div className="fc-event-time text-xs opacity-90">
                                {eventInfo.timeText}
                            </div>
                            <div className="fc-event-title-container">
                                <div className="fc-event-title fc-sticky font-medium">
                                    {props.originalTitle || event.title}
                                </div>
                                {props.roomName && (
                                    <div className="text-xs opacity-75 flex items-center gap-1 mt-0.5">
                                        <MapPin size={10} />
                                        {props.roomName}
                                    </div>
                                )}
                                {props.description && (
                                    <div className="text-xs opacity-75 flex items-center gap-1 mt-0.5 truncate">
                                        <FileText size={10} />
                                        {props.description}
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                }}
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
                                        value={form.startTime ? toLocalDatetimeString(form.startTime) : ''}
                                        onChange={e => setForm({...form, startTime: toBackendDateString(e.target.value)})}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">结束时间</label>
                                    <input 
                                        type="datetime-local"
                                        className="w-full border border-slate-300 rounded-lg p-2 text-xs"
                                        value={form.endTime ? toLocalDatetimeString(form.endTime) : ''}
                                        onChange={e => setForm({...form, endTime: toBackendDateString(e.target.value)})}
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
