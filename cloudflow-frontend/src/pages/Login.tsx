import React, { useState } from 'react';
import { UserCheck, Lock, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { login as apiLogin } from '@/services/api/auth';
import { useAuth } from '@/context/AuthContext';
import { useNavigate, Link } from 'react-router-dom';
import { SliderCaptcha } from '@/components/SliderCaptcha';
import { Button } from '@/components/ui/button';
import { logger } from '@/utils/logger';

export const Login = () => {
  const [loading, setLoading] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [showCaptchaModal, setShowCaptchaModal] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleLoginClick = (e: React.FormEvent) => {
      e.preventDefault();
      setError('');

      if (!username || !password) {
          setError('请输入账号和密码');
          return;
      }
      
      // 打开验证码弹窗
      setShowCaptchaModal(true);
  };

  const handleCaptchaVerify = async (token: string) => {
      setShowCaptchaModal(false);
      setLoading(true);

      try {
        const res = await apiLogin(username, password, token);
        if (res && res.token) {
          await login(res.token);
          toast.success('登录成功');
          navigate('/');
        } else {
           setError('登录失败: 无效的凭证');
           toast.error('登录失败: 无效的凭证');
        }
      } catch (e: any) {
        logger.error("Login error:", e);
        const errorMsg = e.message || '登录失败，请检查账号密码';
        setError(errorMsg);
        toast.error(errorMsg);
      } finally {
        setLoading(false);
      }
  };

  return (
  <div className="min-h-screen w-full bg-gradient-to-br from-pink-50 via-white to-rose-100 relative overflow-hidden flex items-center justify-center font-[Inter]">
    {/* 背景光晕 */}
    <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0">
       <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-pink-300/40 rounded-full blur-[120px]" />
       <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-rose-200/40 rounded-full blur-[120px]" />
    </div>

    {/* 登录卡片 */}
    <div className="relative z-10 w-full max-w-md p-8 bg-white/70 backdrop-blur-xl border border-pink-100 rounded-2xl shadow-2xl shadow-pink-200/30">
      <div className="text-center mb-10">
        <h1 className="text-3xl font-bold text-slate-800 mb-2">CloudFlow Pro V2.0</h1>
        <p className="text-slate-500">企业级微服务中台 / 可视化工作流 / 低代码平台</p>
      </div>
      
      <form onSubmit={handleLoginClick} className="space-y-6">
        <div>
            <label className="block text-slate-600 text-sm font-bold mb-2" htmlFor="username">账号</label>
            <div className="relative">
                <UserCheck className="absolute left-3 top-1/2 -translate-y-1/2 text-pink-400" size={18} />
                <input 
                    id="username"
                    type="text" 
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 bg-white border border-pink-200 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-pink-400 focus:border-pink-400 transition-all"
                    placeholder="请输入用户名 (如: admin)"
                    required
                />
            </div>
        </div>

        <div>
            <label className="block text-slate-600 text-sm font-bold mb-2" htmlFor="password">密码</label>
            <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-pink-400" size={18} />
                <input 
                    id="password"
                    type="password" 
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 bg-white border border-pink-200 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-pink-400 focus:border-pink-400 transition-all"
                    placeholder="请输入密码"
                    required
                />
            </div>
        </div>
        
        {error && <div className="text-red-500 text-sm text-center bg-red-50 p-2 rounded-lg border border-red-100">{error}</div>}

        <Button
            type="submit"
            disabled={loading}
            className="w-full bg-pink-500 hover:bg-pink-400 text-white font-bold py-3 px-4 rounded-xl shadow-lg shadow-pink-300/30 transition-all transform hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
            {loading ? <Loader2 className="animate-spin" size={20}/> : '登录系统'}
        </Button>
      </form>
      
      <div className="mt-8 text-center text-slate-400 text-xs border-t border-pink-100 pt-4">
        <div className="mb-4">
            <Link to="/register" className="text-pink-500 hover:text-pink-400 text-sm transition-colors">
                没有账号？立即注册
            </Link>
        </div>
        {process.env.NODE_ENV === 'development' && (
          <p className="mb-2 text-slate-400">开发环境 - 默认账号: admin, li, wang, zhao, zhang</p>
        )}
        <p>系统环境: React 18 + Spring Cloud Alibaba | 当前版本: 2.1.0 (Dev)</p>
      </div>
    </div>

    {/* 验证码弹窗 */}
    {showCaptchaModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm transition-opacity duration-300 animate-[fadeIn_0.3s_ease-out]">
            <div className="bg-white rounded-2xl shadow-2xl p-6 w-[340px] relative animate-[zoomIn_0.3s_ease-out]">
                <button 
                  onClick={() => setShowCaptchaModal(false)}
                  className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <X size={20} />
                </button>
                <h3 className="text-lg font-bold text-slate-800 mb-1 text-center">安全验证</h3>
                <p className="text-xs text-slate-500 mb-4 text-center">请完成下方拼图验证以继续登录</p>
                <div className="flex justify-center">
                    <SliderCaptcha onVerify={handleCaptchaVerify} width={290} />
                </div>
            </div>
        </div>
    )}
  </div>
  );
};
