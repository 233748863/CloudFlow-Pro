import React, { useState, useEffect } from 'react';
import { Card } from '../components/ui/card';
import { CheckCircle2, FileText } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
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
        // 使用 total 字段获取准确的总数，而不是依赖返回的记录数
        request.get('/workflow/todo', { 
            params: { pageNum: 1, pageSize: 10 },
            silent: true 
        }).then(res => {
            const total = extractTotal(res);
            setPendingCount(total);
        }).catch(() => {
            setPendingCount(0);
        });
        request.get('/workflow/my-instances', { 
            params: { pageNum: 1, pageSize: 10 },
            silent: true 
        }).then(res => {
            const total = extractTotal(res);
            setMyAppsCount(total);
        }).catch(() => {
            setMyAppsCount(0);
        });
    }

    // 每分钟更新一次问候语
    const greetingInterval = setInterval(() => {
      setGreeting(getGreeting());
    }, 60000); // 60秒

    return () => clearInterval(greetingInterval);
  }, [user]);

  if (!user) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-6 animate-fade-in">
    <Card className="p-6 md:col-span-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white border-none shadow-lg shadow-indigo-200">
        <h2 className="text-2xl font-bold mb-2">{greeting}, {user.name}</h2>
        <p className="text-indigo-100 text-sm opacity-90">
        您有 {pendingCount} 个审批任务待处理，系统运行正常。
        </p>
    </Card>
    <Card className="p-6 hover:shadow-md transition-all cursor-pointer" onClick={() => navigate('/tasks')}>
        <div className="flex justify-between items-start">
            <div>
            <p className="text-sm text-slate-500 font-medium">待办审批</p>
            <h3 className="text-3xl font-bold text-slate-800 mt-2">{pendingCount}</h3>
            </div>
            <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600"><CheckCircle2 size={20}/></div>
        </div>
    </Card>
    <Card className="p-6 hover:shadow-md transition-all cursor-pointer" onClick={() => navigate('/my-apps')}>
        <div className="flex justify-between items-start">
            <div>
            <p className="text-sm text-slate-500 font-medium">我的申请</p>
            <h3 className="text-3xl font-bold text-slate-800 mt-2">{myAppsCount}</h3>
            </div>
            <div className="p-2 bg-blue-50 rounded-lg text-blue-600"><FileText size={20}/></div>
        </div>
    </Card>
    </div>
  );
};
