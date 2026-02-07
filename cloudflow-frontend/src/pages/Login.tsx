import React, { useState } from 'react';
import { UserCheck, Lock, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { login as apiLogin } from '@/services/api/auth';
import { useAuth } from '@/context/AuthContext';
import { useNavigate, Link } from 'react-router-dom';
import { SliderCaptcha } from '@/components/SliderCaptcha';
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
      
      // Open Captcha Modal
      setShowCaptchaModal(true);
  };

  const handleCaptchaVerify = async (token: string) => {
      setShowCaptchaModal(false);
      setLoading(true);

      try {
        // Call backend login to get token
        const res = await apiLogin(username, password, token);
        if (res && res.token) {
          // Login in context (stores token and fetches user info)
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
  <div className="min-h-screen w-full bg-[#0f172a] relative overflow-hidden flex items-center justify-center font-[Inter]">
    <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0">
       <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-indigo-600/30 rounded-full blur-[120px]" />
       <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-blue-600/30 rounded-full blur-[120px]" />
    </div>
    <div className="relative z-10 w-full max-w-md p-8 bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl shadow-2xl">
      <div className="text-center mb-10">
        <h1 className="text-3xl font-bold text-white mb-2">CloudFlow Pro V2.0</h1>
        <p className="text-slate-400">企业级微服务中台 / 可视化工作流 / 低代码平台</p>
      </div>
      
      <form onSubmit={handleLoginClick} className="space-y-6">
        <div>
            <label className="block text-slate-300 text-sm font-bold mb-2" htmlFor="username">账号</label>
            <div className="relative">
                <UserCheck className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input 
                    id="username"
                    type="text" 
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 bg-slate-800/50 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                    placeholder="请输入用户名 (如: admin)"
                    required
                />
            </div>
        </div>

        <div>
            <label className="block text-slate-300 text-sm font-bold mb-2" htmlFor="password">密码</label>
            <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input 
                    id="password"
                    type="password" 
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 bg-slate-800/50 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                    placeholder="请输入密码"
                    required
                />
            </div>
        </div>
        
        {error && <div className="text-red-400 text-sm text-center bg-red-500/10 p-2 rounded-lg">{error}</div>}

        <button 
            type="submit"
            disabled={loading}
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 px-4 rounded-xl shadow-lg shadow-indigo-500/30 transition-all transform hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
            {loading ? <Loader2 className="animate-spin" size={20}/> : '登录系统'}
        </button>
      </form>
      
      <div className="mt-8 text-center text-slate-500 text-xs border-t border-white/10 pt-4">
        <div className="mb-4">
            <Link to="/register" className="text-indigo-400 hover:text-indigo-300 text-sm transition-colors">
                没有账号？立即注册
            </Link>
        </div>
        <p>默认账号: admin, li, wang, zhao, zhang</p>
        <p className="mt-1">系统环境: React 18 + Spring Cloud Alibaba | 当前版本: 2.1.0 (Dev)</p>
      </div>
    </div>

    {/* Captcha Modal */}
    {showCaptchaModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm transition-opacity duration-300 animate-[fadeIn_0.3s_ease-out]">
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
