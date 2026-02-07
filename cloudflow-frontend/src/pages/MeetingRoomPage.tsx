import React, { useState, useEffect } from 'react';
import { MeetingRoom, SysScheduleEvent } from '../types';
import { getMeetingRooms, createEvent } from '../services/api/schedule';
import { MapPin, Users, Monitor, Clock, CheckCircle2, XCircle, Plus } from 'lucide-react';
import { toast } from 'sonner';

export const MeetingRoomPage = () => {
  const [rooms, setRooms] = useState<MeetingRoom[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<MeetingRoom | null>(null);
  
  // Booking Form
  const [bookingForm, setBookingForm] = useState<{
      title: string;
      date: string;
      startTime: string;
      endTime: string;
      description: string;
  }>({
      title: '',
      date: new Date().toISOString().split('T')[0],
      startTime: '09:00',
      endTime: '10:00',
      description: ''
  });

  const fetchRooms = async () => {
      try {
          const res = await getMeetingRooms();
          setRooms(res);
      } catch (e) {
          console.error("Fetch rooms failed", e);
      }
  };

  useEffect(() => {
      fetchRooms();
  }, []);

  const handleBooking = async () => {
      if (!selectedRoom) return;
      if (!bookingForm.title || !bookingForm.date || !bookingForm.startTime || !bookingForm.endTime) {
          toast.error("请完善预订信息");
          return;
      }

      const startDateTime = new Date(`${bookingForm.date}T${bookingForm.startTime}:00`).toISOString();
      const endDateTime = new Date(`${bookingForm.date}T${bookingForm.endTime}:00`).toISOString();

      if (new Date(startDateTime) >= new Date(endDateTime)) {
          toast.error("结束时间必须晚于开始时间");
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
              attendees: '[]' // TODO: Select attendees
          });
          toast.success("预订成功");
          setSelectedRoom(null);
          // Reset form
          setBookingForm({
            title: '',
            date: new Date().toISOString().split('T')[0],
            startTime: '09:00',
            endTime: '10:00',
            description: ''
          });
      } catch (e: any) {
          // Error message from backend usually contains conflict info
          toast.error("预订失败: " + (e.response?.data?.msg || "时间冲突"));
      }
  };

  const parseEquipment = (json: string) => {
      try {
          return JSON.parse(json);
      } catch {
          return [];
      }
  };

  return (
    <div className="space-y-6">
        <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                <Monitor className="text-indigo-600" />
                会议室资源
            </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {rooms.map(room => (
                <div key={room.roomId} className="bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-all overflow-hidden group">
                    <div className="h-32 bg-slate-100 flex items-center justify-center relative">
                        <Monitor size={48} className="text-slate-300" />
                        <div className={`absolute top-4 right-4 px-2 py-1 rounded-full text-xs font-bold flex items-center gap-1
                            ${room.status === '1' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                            {room.status === '1' ? <CheckCircle2 size={12}/> : <XCircle size={12}/>}
                            {room.status === '1' ? '空闲' : '维护中'}
                        </div>
                    </div>
                    <div className="p-5">
                        <h3 className="text-lg font-bold text-slate-800 mb-1">{room.name}</h3>
                        <div className="flex items-center gap-4 text-xs text-slate-500 mb-4">
                            <span className="flex items-center gap-1"><MapPin size={12}/> {room.location}</span>
                            <span className="flex items-center gap-1"><Users size={12}/> {room.capacity}人</span>
                        </div>
                        
                        <div className="flex flex-wrap gap-2 mb-6">
                            {parseEquipment(room.equipment).map((eq: string, i: number) => (
                                <span key={i} className="bg-slate-50 text-slate-600 px-2 py-1 rounded text-xs border border-slate-100">
                                    {eq}
                                </span>
                            ))}
                        </div>

                        <button 
                            onClick={() => setSelectedRoom(room)}
                            disabled={room.status !== '1'}
                            className="w-full bg-indigo-50 text-indigo-600 py-2 rounded-lg font-medium hover:bg-indigo-600 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            立即预订
                        </button>
                    </div>
                </div>
            ))}
        </div>

        {/* Booking Modal */}
        {selectedRoom && (
            <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-xl shadow-xl w-full max-w-lg flex flex-col animate-in fade-in zoom-in duration-200">
                    <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                        <div>
                            <h3 className="text-lg font-bold text-slate-800">预订会议室</h3>
                            <p className="text-xs text-slate-500 mt-1">当前选择: {selectedRoom.name}</p>
                        </div>
                        <button onClick={() => setSelectedRoom(null)} className="text-slate-400 hover:text-slate-600">
                            <span className="text-2xl">&times;</span>
                        </button>
                    </div>
                    
                    <div className="p-6 space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">会议主题</label>
                            <input 
                                type="text" 
                                className="w-full border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                                value={bookingForm.title}
                                onChange={e => setBookingForm({...bookingForm, title: e.target.value})}
                                placeholder="请输入会议主题"
                            />
                        </div>
                        
                        <div className="grid grid-cols-3 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">日期</label>
                                <input 
                                    type="date" 
                                    className="w-full border border-slate-300 rounded-lg p-2 text-sm"
                                    value={bookingForm.date}
                                    onChange={e => setBookingForm({...bookingForm, date: e.target.value})}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">开始时间</label>
                                <input 
                                    type="time" 
                                    className="w-full border border-slate-300 rounded-lg p-2 text-sm"
                                    value={bookingForm.startTime}
                                    onChange={e => setBookingForm({...bookingForm, startTime: e.target.value})}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">结束时间</label>
                                <input 
                                    type="time" 
                                    className="w-full border border-slate-300 rounded-lg p-2 text-sm"
                                    value={bookingForm.endTime}
                                    onChange={e => setBookingForm({...bookingForm, endTime: e.target.value})}
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">备注说明</label>
                            <textarea 
                                className="w-full border border-slate-300 rounded-lg p-2 h-24 text-sm"
                                value={bookingForm.description}
                                onChange={e => setBookingForm({...bookingForm, description: e.target.value})}
                                placeholder="请输入参会人员、特殊需求等..."
                            />
                        </div>
                    </div>

                    <div className="p-6 border-t border-slate-100 bg-slate-50 rounded-b-xl flex justify-end gap-3">
                        <button 
                            onClick={() => setSelectedRoom(null)}
                            className="px-4 py-2 text-slate-600 hover:text-slate-800"
                        >
                            取消
                        </button>
                        <button 
                            onClick={handleBooking}
                            className="bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700 font-medium flex items-center gap-2"
                        >
                            <CheckCircle2 size={16} />
                            确认预订
                        </button>
                    </div>
                </div>
            </div>
        )}
    </div>
  );
};
