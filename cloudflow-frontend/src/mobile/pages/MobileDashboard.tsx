import React from 'react';
import { useAuth } from '@/context/AuthContext';
import { Bell, CheckCircle2, Calendar, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui'


export const MobileDashboard: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const quickActions = [
    { label: '用车申请', path: '/vehicle/booking', color: 'bg-blue-100 text-blue-600' },
    { label: '请假', path: '/leave', color: 'bg-green-100 text-green-600' },
    { label: '报销', path: '/reimburse', color: 'bg-orange-100 text-orange-600' },
    { label: '会议室', path: '/meeting-room', color: 'bg-purple-100 text-purple-600' },
  ];

  return (
    <div className="p-4 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-xl font-bold text-slate-900">早安, {user?.name}</h1>
          <p className="text-sm text-slate-500">今天是 2026年2月7日</p>
        </div>
        <div className="relative">
          <Bell className="text-slate-600" />
          <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full"></span>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-4 gap-4">
        {quickActions.map((action) => (
          <button
            key={action.label}
            onClick={() => navigate(action.path)}
            className="flex flex-col items-center space-y-2"
          >
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${action.color}`}>
              <span className="font-bold text-lg">{action.label[0]}</span>
            </div>
            <span className="text-xs text-slate-600">{action.label}</span>
          </button>
        ))}
      </div>

      {/* Stats Card */}
      <Card className="bg-indigo-600 text-white border-none shadow-indigo-200 shadow-lg">
        <CardContent className="p-4 flex justify-between items-center">
          <div>
            <div className="text-indigo-100 text-sm">待办任务</div>
            <div className="text-3xl font-bold mt-1">12</div>
          </div>
          <div className="h-10 w-[1px] bg-indigo-400"></div>
          <div>
            <div className="text-indigo-100 text-sm">今日日程</div>
            <div className="text-3xl font-bold mt-1">3</div>
          </div>
          <div className="h-10 w-[1px] bg-indigo-400"></div>
          <div>
            <div className="text-indigo-100 text-sm">消息</div>
            <div className="text-3xl font-bold mt-1">5</div>
          </div>
        </CardContent>
      </Card>

      {/* Todo List Preview */}
      <div>
        <div className="flex justify-between items-center mb-3">
          <h2 className="font-bold text-slate-800">待办事项</h2>
          <button onClick={() => navigate('/tasks')} className="text-xs text-indigo-600 flex items-center">
            查看全部 <ChevronRight size={12} />
          </button>
        </div>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white p-3 rounded-lg border border-slate-100 shadow-sm flex items-start gap-3">
              <CheckCircle2 size={18} className="text-slate-400 mt-1" />
              <div>
                <div className="font-medium text-slate-800 text-sm">审批：2024年度部门预算申请</div>
                <div className="text-xs text-slate-500 mt-1">申请人：王财务 · 截止：今天 18:00</div>
              </div>
            </div>
          ))}
        </div>
      </div>

       {/* Schedule Preview */}
       <div>
        <div className="flex justify-between items-center mb-3">
          <h2 className="font-bold text-slate-800">今日日程</h2>
          <button className="text-xs text-indigo-600 flex items-center">
            查看全部 <ChevronRight size={12} />
          </button>
        </div>
        <div className="space-y-3">
          <div className="bg-indigo-50 p-3 rounded-lg border-l-4 border-indigo-500 flex items-start gap-3">
             <div className="text-center min-w-[3rem]">
                <div className="text-xs text-indigo-600 font-bold">10:00</div>
                <div className="text-xs text-indigo-400">AM</div>
             </div>
             <div>
                <div className="font-medium text-slate-800 text-sm">产品发布会筹备会议</div>
                <div className="text-xs text-slate-500 mt-1">会议室 A301</div>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
};
