import React, { useState } from 'react';
import { UserCheck, Lock, Loader2, X, Activity, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { login as apiLogin } from '@/services/api/auth';
import { useAuth } from '@/context/AuthContext';
import { useNavigate, Link } from 'react-router-dom';
import { SliderCaptcha } from '@/components/SliderCaptcha';
import { Button, Input, Label, Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui';
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
      <div className="flex w-full lg:w-1/2 flex-col items-center justify-center p-8 bg-white">
        <div className="w-full max-w-[400px] space-y-6">
          <div className="flex flex-col space-y-2 text-center lg:text-left">
            <div className="lg:hidden flex justify-center mb-4">
               <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-pink-500 text-white shadow-lg shadow-pink-500/30">
                 <Activity size={20} />
               </div>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">欢迎回来</h1>
            <p className="text-sm text-slate-500">请输入您的账号和密码以登录系统</p>
          </div>

          <Card className="border-0 shadow-none p-0">
            <form onSubmit={handleLoginClick} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="username">账号</Label>
                <div className="relative">
                  <UserCheck className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                  <Input 
                    id="username"
                    type="text" 
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="pl-10 h-11"
                    placeholder="请输入用户名 (如: admin)"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">密码</Label>
                  <Link 
                    to="/forgot-password" 
                    className="text-xs text-pink-500 hover:text-pink-600 font-medium"
                    onClick={(e) => e.preventDefault()} // 暂时禁用，因为没有这个页面
                  >
                    忘记密码?
                  </Link>
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                  <Input 
                    id="password"
                    type="password" 
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10 h-11"
                    placeholder="请输入密码"
                    required
                  />
                </div>
              </div>
              
              {error && (
                <div className="text-red-500 text-sm flex items-center gap-2 bg-red-50 p-3 rounded-lg border border-red-100">
                  <X size={14} />
                  {error}
                </div>
              )}

              <Button
                type="submit"
                disabled={loading}
                className="w-full h-11 bg-pink-500 hover:bg-pink-600 text-white font-bold shadow-lg shadow-pink-500/20 transition-all"
              >
                {loading ? <Loader2 className="animate-spin mr-2" size={18}/> : null}
                登录系统
              </Button>
            </form>
          </Card>
          
          <div className="text-center text-sm">
            <span className="text-slate-500">还没有账号? </span>
            <Link to="/register" className="text-pink-500 hover:text-pink-600 font-medium hover:underline underline-offset-4">
              立即注册
            </Link>
          </div>

          {process.env.NODE_ENV === 'development' && (
            <div className="mt-8 p-4 rounded-lg bg-slate-50 border border-slate-100 text-xs text-slate-500">
              <p className="font-semibold mb-1">开发环境提示:</p>
              <p>默认账号: admin, li, wang, zhao, zhang</p>
              <p className="mt-1">React 18 + Spring Cloud Alibaba</p>
            </div>
          )}
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
