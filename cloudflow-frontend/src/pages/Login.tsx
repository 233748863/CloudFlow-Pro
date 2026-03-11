import React, { useState } from 'react';
import { UserCheck, Lock, Loader2, X, Activity, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { login as apiLogin } from '@/services/api/auth';
import { useAuth } from '@/context/AuthContext';
import { useNavigate, Link } from 'react-router-dom';
import { SliderCaptcha } from '@/components/SliderCaptcha';
import { Button, Input, Label } from '@/components/ui';
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
    <div className="flex min-h-screen w-full font-[Inter] bg-white">
      {/* 左侧品牌区域 - 仅在大屏显示 */}
      <div className="hidden lg:flex w-1/2 relative bg-slate-900 flex-col items-center justify-center p-12 text-white overflow-hidden">
        {/* 背景装饰 */}
        <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=2564&auto=format&fit=crop')] bg-cover bg-center opacity-20 mix-blend-overlay"></div>
        <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-900/95 to-pink-900/40"></div>
        
        {/* 内容 */}
        <div className="relative z-10 max-w-lg">
          <div className="mb-8 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-pink-500 text-white shadow-lg shadow-pink-500/30">
              <Activity size={28} />
            </div>
            <span className="text-3xl font-bold tracking-tight">CloudFlow Pro</span>
          </div>
          
          <h2 className="mb-6 text-4xl font-bold leading-tight">
            企业级微服务中台<br/>
            <span className="text-pink-400">可视化工作流</span> & 低代码平台
          </h2>
          
          <p className="text-lg text-slate-300 leading-relaxed mb-8">
            一站式解决企业数字化转型难题。提供强大的流程引擎、灵活的表单设计、完善的权限管理，助您快速构建企业级应用。
          </p>

          <div className="space-y-4">
            <div className="flex items-center gap-3 text-slate-300">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-pink-500/20 text-pink-400">
                <ChevronRight size={14} />
              </div>
              <span>可视化流程编排，拖拽式表单设计</span>
            </div>
            <div className="flex items-center gap-3 text-slate-300">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-pink-500/20 text-pink-400">
                <ChevronRight size={14} />
              </div>
              <span>Spring Cloud Alibaba 微服务架构</span>
            </div>
            <div className="flex items-center gap-3 text-slate-300">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-pink-500/20 text-pink-400">
                <ChevronRight size={14} />
              </div>
              <span>企业级权限控制与多租户支持</span>
            </div>
          </div>
        </div>

        <div className="absolute bottom-8 text-sm text-slate-500">
          © 2024 CloudFlow Pro. All rights reserved.
        </div>
      </div>

      {/* 右侧登录表单 */}
      <div className="flex w-full lg:w-1/2 flex-col items-center justify-center p-8 bg-white relative overflow-hidden">
        {/* iOS 风格装饰背景 */}
        <div className="absolute top-[-10%] right-[-10%] w-[500px] h-[500px] bg-pink-100/40 rounded-full blur-3xl pointer-events-none opacity-60 animate-pulse"></div>
        <div className="absolute bottom-[-10%] left-[-10%] w-[400px] h-[400px] bg-blue-100/40 rounded-full blur-3xl pointer-events-none opacity-60 animate-pulse delay-700"></div>

        <div className="w-full max-w-[400px] space-y-6 relative z-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
          <div className="flex flex-col space-y-2 text-center lg:text-left">
            <div className="lg:hidden flex justify-center mb-4">
               <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-pink-500 to-rose-600 text-white shadow-lg shadow-pink-500/30">
                 <Activity size={20} />
               </div>
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">欢迎回来</h1>
            <p className="text-sm text-slate-500">请输入您的账号和密码以登录系统</p>
          </div>

          <form onSubmit={handleLoginClick} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="username" className="text-slate-600 font-medium">账号</Label>
                <div className="relative group">
                  <UserCheck className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-pink-500 transition-colors" size={18} />
                  <Input 
                    id="username"
                    type="text" 
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="pl-11 h-12 bg-slate-50/50 border-slate-100 focus:bg-white focus:border-pink-200 focus:ring-4 focus:ring-pink-500/10 rounded-2xl transition-all duration-300"
                    placeholder="请输入用户名 (如: admin)"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" className="text-slate-600 font-medium">密码</Label>
                  <Link 
                    to="/forgot-password" 
                    className="text-xs text-pink-500 hover:text-pink-600 font-medium hover:underline underline-offset-2 transition-all"
                    onClick={(e) => e.preventDefault()} // 暂时禁用，因为没有这个页面
                  >
                    忘记密码?
                  </Link>
                </div>
                <div className="relative group">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-pink-500 transition-colors" size={18} />
                  <Input 
                    id="password"
                    type="password" 
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-11 h-12 bg-slate-50/50 border-slate-100 focus:bg-white focus:border-pink-200 focus:ring-4 focus:ring-pink-500/10 rounded-2xl transition-all duration-300"
                    placeholder="请输入密码"
                    required
                  />
                </div>
              </div>
              
              {error && (
                <div className="text-red-500 text-sm flex items-center gap-2 bg-red-50 p-3 rounded-xl border border-red-100 animate-in slide-in-from-top-2">
                  <X size={14} />
                  {error}
                </div>
              )}

              <Button
                type="submit"
                disabled={loading}
                className="w-full h-12 bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600 text-white font-bold rounded-2xl shadow-lg shadow-pink-500/25 transition-all transform hover:scale-[1.02] active:scale-[0.98] duration-200"
              >
                {loading ? <Loader2 className="animate-spin mr-2" size={18}/> : null}
                登录系统
              </Button>
            </form>
          
          <div className="text-center text-sm">
            <span className="text-slate-500">还没有账号? </span>
            <Link to="/register" className="text-pink-600 hover:text-pink-700 font-semibold hover:underline underline-offset-4 transition-colors">
              立即注册
            </Link>
          </div>
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
