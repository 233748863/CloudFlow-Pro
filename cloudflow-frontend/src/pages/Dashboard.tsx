import React, { useState, useEffect } from 'react';
import { Card } from '../components/ui/card';
import {
  CheckCircle2, FileText, PlayCircle, MailOpen,
  Calendar, Megaphone, ArrowRight
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/button';
import request from '../services/api/request';

/**
 * 提取总数，兼容 PageResult 格式
 */
function extractTotal(res: unknown): number {
  if (res && typeof res === 'object') {
    const obj = res as Record<string, unknown>;
    if (typeof obj.total === 'number') return obj.total;
  }
  return 0;
}

/**
 * 根据当前时间返回问候语
 */
function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 6) return '夜深了';
  if (hour < 9) return '早上好';
  if (hour < 12) return '上午好';
  if (hour < 14) return '中午好';
  if (hour < 18) return '下午好';
  if (hour < 22) return '晚上好';
  return '夜深了';
}

export const Dashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [pendingCount, setPendingCount] = useState(0);
  const [myAppsCount, setMyAppsCount] = useState(0);
  const [greeting, setGreeting] = useState(getGreeting());

  useEffect(() => {
    if (user) {
      // 使用 silent 模式调用工作流 API，避免服务不可用时弹出错误提示
      request.get('/workflow/todo', {
        params: { pageNum: 1, pageSize: 10 },
        silent: true
      }).then(res => {
        setPendingCount(extractTotal(res));
      }).catch(() => {
        setPendingCount(0);
      });

      request.get('/workflow/my-instances', {
        params: { pageNum: 1, pageSize: 10 },
        silent: true
      }).then(res => {
        setMyAppsCount(extractTotal(res));
      }).catch(() => {
        setMyAppsCount(0);
      });
    }

    // 每分钟更新一次问候语
    const timer = setInterval(() => setGreeting(getGreeting()), 60000);
    return () => clearInterval(timer);
  }, [user]);

  if (!user) return null;

  /** 统计卡片数据 */
  const statCards = [
    {
      label: '待办审批',
      value: pendingCount,
      icon: <CheckCircle2 size={20} />,
      iconBg: 'bg-indigo-50',
      iconColor: 'text-indigo-600',
      path: '/tasks',
    },
    {
      label: '我的申请',
      value: myAppsCount,
      icon: <FileText size={20} />,
      iconBg: 'bg-blue-50',
      iconColor: 'text-blue-600',
      path: '/my-apps',
    },
  ];

  /** 快捷入口 */
  const shortcuts = [
    { label: '发起流程', icon: <PlayCircle size={18} />, path: '/workplace', color: 'text-indigo-600 bg-indigo-50' },
    { label: '抄送我的', icon: <MailOpen size={18} />, path: '/my-copies', color: 'text-amber-600 bg-amber-50' },
    { label: '我的日程', icon: <Calendar size={18} />, path: '/schedule', color: 'text-emerald-600 bg-emerald-50' },
    { label: '公告中心', icon: <Megaphone size={18} />, path: '/announcement', color: 'text-rose-600 bg-rose-50' },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* 欢迎横幅 */}
      <Card className="p-6 bg-gradient-to-r from-indigo-600 to-purple-600 text-white border-none shadow-lg shadow-indigo-200/50">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold mb-1">{greeting}，{user.name}</h2>
            <p className="text-indigo-100 text-sm">
              您有 <span className="font-semibold text-white">{pendingCount}</span> 个审批任务待处理，系统运行正常。
            </p>
          </div>
          <Button
            className="bg-white/20 border border-white/30 text-white hover:bg-white/30 hidden sm:flex items-center gap-1.5 backdrop-blur-sm"
            onClick={() => navigate('/tasks')}
          >
            去处理 <ArrowRight size={14} />
          </Button>
        </div>
      </Card>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map(card => (
          <Card
            key={card.label}
            className="p-5 hover:shadow-md transition-all cursor-pointer group"
            onClick={() => navigate(card.path)}
          >
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm text-slate-500 font-medium">{card.label}</p>
                <h3 className="text-3xl font-bold text-slate-800 mt-1.5">{card.value}</h3>
              </div>
              <div className={`p-2.5 rounded-lg ${card.iconBg} ${card.iconColor} group-hover:scale-110 transition-transform`}>
                {card.icon}
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* 快捷入口 */}
      <Card className="p-5">
        <h3 className="text-sm font-semibold text-slate-700 mb-4">快捷入口</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {shortcuts.map(item => (
            <button
              key={item.label}
              onClick={() => navigate(item.path)}
              className="flex items-center gap-3 p-3 rounded-lg hover:bg-slate-50 transition-colors text-left group"
            >
              <div className={`p-2 rounded-lg ${item.color} group-hover:scale-110 transition-transform`}>
                {item.icon}
              </div>
              <span className="text-sm font-medium text-slate-700">{item.label}</span>
            </button>
          ))}
        </div>
      </Card>
    </div>
  );
};
