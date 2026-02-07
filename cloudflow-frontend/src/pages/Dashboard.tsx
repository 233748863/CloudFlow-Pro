import React, { useState, useEffect } from 'react';
import { Card } from '../components/ui/card';
import { CheckCircle2, FileText } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { getTodoTasks, getMyInstances } from '../services/api/workflow';

export const Dashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [pendingCount, setPendingCount] = useState(0);
  const [myAppsCount, setMyAppsCount] = useState(0);

  useEffect(() => {
    if (user) {
        getTodoTasks(user.id).then(res => {
            if (Array.isArray(res)) setPendingCount(res.length);
        });
        getMyInstances(user.id).then(res => {
            if (Array.isArray(res)) setMyAppsCount(res.length);
        });
    }
  }, [user]);

  if (!user) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-6 animate-fade-in">
    <Card className="p-6 md:col-span-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white border-none shadow-lg shadow-indigo-200">
        <h2 className="text-2xl font-bold mb-2">早安, {user.name}</h2>
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
