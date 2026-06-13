import React from 'react';
import { useAuth } from '@/context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, User, Mail, Phone, Building, LogOut } from 'lucide-react';
import { Button } from '@/components/common';

export const MobileProfile: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-pink-500 text-white p-6 pb-20">
        <div className="flex items-center justify-between mb-6">
          <button onClick={() => navigate(-1)} className="p-2">
            <ChevronLeft size={24} />
          </button>
          <h1 className="text-lg font-bold">个人中心</h1>
          <div className="w-10"></div>
        </div>
        
        {/* User Avatar and Name */}
        <div className="flex flex-col items-center">
          <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center mb-3">
            <User size={40} />
          </div>
          <h2 className="text-xl font-bold">{user?.name || '用户'}</h2>
          <p className="text-pink-50 text-sm mt-1">{user?.username}</p>
        </div>
      </div>

      {/* Profile Info Card */}
      <div className="px-4 -mt-12">
        <div className="bg-white rounded-2xl shadow-lg p-4 space-y-4">
          <div className="flex items-center gap-3 p-3 hover:bg-slate-50 rounded-lg transition-colors">
            <div className="w-10 h-10 bg-pink-50 rounded-full flex items-center justify-center">
              <Mail size={20} className="text-pink-500" />
            </div>
            <div className="flex-1">
              <div className="text-xs text-slate-500">邮箱</div>
              <div className="text-sm font-medium">{user?.email || '未设置'}</div>
            </div>
          </div>

          <div className="flex items-center gap-3 p-3 hover:bg-slate-50 rounded-lg transition-colors">
            <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
              <Phone size={20} className="text-green-600" />
            </div>
            <div className="flex-1">
              <div className="text-xs text-slate-500">手机号</div>
              <div className="text-sm font-medium">{user?.phone || '未设置'}</div>
            </div>
          </div>

          <div className="flex items-center gap-3 p-3 hover:bg-slate-50 rounded-lg transition-colors">
            <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center">
              <Building size={20} className="text-orange-600" />
            </div>
            <div className="flex-1">
              <div className="text-xs text-slate-500">部门</div>
              <div className="text-sm font-medium">{user?.deptName || '未设置'}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="px-4 mt-6 space-y-3">
        <button className="w-full bg-white p-4 rounded-xl shadow-sm flex items-center justify-between hover:bg-slate-50 transition-colors">
          <span className="font-medium">修改密码</span>
          <ChevronLeft size={20} className="rotate-180 text-slate-400" />
        </button>
        
        <button className="w-full bg-white p-4 rounded-xl shadow-sm flex items-center justify-between hover:bg-slate-50 transition-colors">
          <span className="font-medium">设置</span>
          <ChevronLeft size={20} className="rotate-180 text-slate-400" />
        </button>
      </div>

      {/* Logout Button */}
      <div className="px-4 mt-6 pb-20">
        <Button 
          onClick={handleLogout}
          variant="outline"
          className="w-full h-12 text-red-600 border-red-200 hover:bg-red-50"
        >
          <LogOut size={20} className="mr-2" />
          退出登录
        </Button>
      </div>
    </div>
  );
};
