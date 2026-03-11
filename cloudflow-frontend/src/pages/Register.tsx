import React, { useState } from 'react';
import { UserCheck, Lock, Mail, Loader2, X, Activity, ChevronRight } from 'lucide-react';
import { register as apiRegister } from '../services/api/auth';
import { useNavigate, Link } from 'react-router-dom';
import { toast } from 'sonner';
import { SliderCaptcha } from '../components/SliderCaptcha';
import { Button, Input, Label } from '@/components/ui';

export const Register = () => {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
      username: '',
      email: '',
      password: '',
      confirmPassword: ''
  });
  const [showCaptchaModal, setShowCaptchaModal] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      setFormData({
          ...formData,
          [e.target.id]: e.target.value
      });
  };

  const handleRegisterClick = (e: React.FormEvent) => {
      e.preventDefault();
      setError('');

      if (formData.password !== formData.confirmPassword) {
          setError('两次输入的密码不一致');
          return;
      }

      // 打开验证码弹窗
      setShowCaptchaModal(true);
  };

  const handleCaptchaVerify = async (token: string) => {
      setShowCaptchaModal(false);
      setLoading(true);

      try {
        await apiRegister({
            ...formData,
            captchaToken: token
        });
        toast.success('注册成功，请登录');
        navigate('/login');
      } catch (e: any) {
        console.error("Register error:", e);
        setError(e.message || '注册失败，请稍后重试');
      } finally {
        setLoading(false);
      }
  };

  return (
    <div className="flex min-h-screen w-full font-[Inter] bg-white">
      {/* 左侧品牌区域 - 仅在大屏显示 */}
      <div className="hidden lg:flex w-1/2 relative bg-slate-900 flex-col items-center justify-center p-12 text-white overflow-hidden">
        {/* 背景装饰 */}
        <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1550751827-4bd374c3f58b?q=80&w=2670&auto=format&fit=crop')] bg-cover bg-center opacity-20 mix-blend-overlay"></div>
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
            加入我们<br/>
            开启<span className="text-pink-400">高效工作流</span>之旅
          </h2>
          
          <p className="text-lg text-slate-300 leading-relaxed mb-8">
            注册 CloudFlow Pro 账号，立即体验企业级微服务架构带来的灵活性与可扩展性。
          </p>

          <div className="space-y-4">
            <div className="flex items-center gap-3 text-slate-300">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-pink-500/20 text-pink-400">
                <ChevronRight size={14} />
              </div>
              <span>免费试用所有核心功能</span>
            </div>
            <div className="flex items-center gap-3 text-slate-300">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-pink-500/20 text-pink-400">
                <ChevronRight size={14} />
              </div>
              <span>加入数千家企业的数字化转型行列</span>
            </div>
            <div className="flex items-center gap-3 text-slate-300">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-pink-500/20 text-pink-400">
                <ChevronRight size={14} />
              </div>
              <span>7x24小时技术支持与社区帮助</span>
            </div>
          </div>
        </div>

        <div className="absolute bottom-8 text-sm text-slate-500">
          © 2024 CloudFlow Pro. All rights reserved.
        </div>
      </div>

      {/* 右侧注册表单 */}
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
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">创建账户</h1>
            <p className="text-sm text-slate-500">填写以下信息完成注册</p>
          </div>

          <form onSubmit={handleRegisterClick} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="username" className="text-slate-600 font-medium">用户名</Label>
                <div className="relative group">
                  <UserCheck className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-pink-500 transition-colors" size={18} />
                  <Input 
                    id="username"
                    type="text" 
                    value={formData.username}
                    onChange={handleChange}
                    className="pl-11 h-12 bg-slate-50/50 border-slate-100 focus:bg-white focus:border-pink-200 focus:ring-4 focus:ring-pink-500/10 rounded-2xl transition-all duration-300"
                    placeholder="设置用户名"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email" className="text-slate-600 font-medium">邮箱 (可选)</Label>
                <div className="relative group">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-pink-500 transition-colors" size={18} />
                  <Input 
                    id="email"
                    type="email" 
                    value={formData.email}
                    onChange={handleChange}
                    className="pl-11 h-12 bg-slate-50/50 border-slate-100 focus:bg-white focus:border-pink-200 focus:ring-4 focus:ring-pink-500/10 rounded-2xl transition-all duration-300"
                    placeholder="请输入邮箱地址"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-slate-600 font-medium">密码</Label>
                <div className="relative group">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-pink-500 transition-colors" size={18} />
                  <Input 
                    id="password"
                    type="password" 
                    value={formData.password}
                    onChange={handleChange}
                    className="pl-11 h-12 bg-slate-50/50 border-slate-100 focus:bg-white focus:border-pink-200 focus:ring-4 focus:ring-pink-500/10 rounded-2xl transition-all duration-300"
                    placeholder="设置登录密码"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword" className="text-slate-600 font-medium">确认密码</Label>
                <div className="relative group">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-pink-500 transition-colors" size={18} />
                  <Input 
                    id="confirmPassword"
                    type="password" 
                    value={formData.confirmPassword}
                    onChange={handleChange}
                    className="pl-11 h-12 bg-slate-50/50 border-slate-100 focus:bg-white focus:border-pink-200 focus:ring-4 focus:ring-pink-500/10 rounded-2xl transition-all duration-300"
                    placeholder="再次输入密码"
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
                立即注册
              </Button>
            </form>
          
          <div className="text-center text-sm">
            <span className="text-slate-500">已有账号? </span>
            <Link to="/login" className="text-pink-600 hover:text-pink-700 font-semibold hover:underline underline-offset-4 transition-colors">
              去登录
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
                <p className="text-xs text-slate-500 mb-4 text-center">请完成下方拼图验证以继续注册</p>
                <div className="flex justify-center">
                    <SliderCaptcha onVerify={handleCaptchaVerify} width={290} />
                </div>
            </div>
        </div>
      )}
    </div>
  );
};
