import React, { useState } from 'react';
import { ArrowRight, Eye, EyeOff, Layers3, Loader2, Lock, ShieldCheck, UserCheck, Workflow } from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate, Link } from 'react-router-dom';
import { Button, Input, Label } from '@/components/ui';
import { AuthCaptchaDialog, AuthExperienceShell } from '@/components/auth/AuthExperienceShell';
import { useAuth } from '@/context/AuthContext';
import { login as apiLogin } from '@/services/api/auth';
import { logger } from '@/utils/logger';

const loginStats = [
  { label: '入口定位', value: '统一工作台', hint: '登录后进入待办、审批和通知中心' },
  { label: '认证方式', value: '账号密码', hint: '使用已开通的系统账号访问当前工作台' },
  { label: '安全校验', value: '滑块验证', hint: '提交前完成人机校验，降低异常登录风险' },
];

const loginHighlights = [
  {
    title: '登录后按权限加载菜单',
    description: '系统会根据当前账号自动加载可访问模块和数据范围。',
    icon: Layers3,
    tone: 'slate' as const,
  },
  {
    title: '继续日常办公处理',
    description: '进入后可继续处理流程、公告、日程和 HR 相关事项。',
    icon: Workflow,
    tone: 'pink' as const,
  },
];

export const Login = () => {
  const [loading, setLoading] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showCaptchaModal, setShowCaptchaModal] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleLoginClick = (event: React.FormEvent) => {
    event.preventDefault();
    setError('');

    if (!username.trim() || !password) {
      setError('请输入账号和密码');
      return;
    }

    setShowCaptchaModal(true);
  };

  const handleCaptchaVerify = async (token: string) => {
    setShowCaptchaModal(false);
    setLoading(true);

    try {
      const response = await apiLogin(username.trim(), password, token);
      if (response?.token) {
        await login(response.token);
        toast.success('登录成功');
        navigate('/');
        return;
      }

      setError('登录失败：返回结果中没有有效凭证');
      toast.error('登录失败：返回结果中没有有效凭证');
    } catch (error: any) {
      logger.error('Login error:', error);
      const errorMessage = error.message || '登录失败，请检查账号和密码';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <AuthExperienceShell
        formBadge="账号登录"
        formTitle="登录 CloudFlow Pro"
        formDescription="输入系统账号和密码后进入工作台。"
        heroEyebrow="Workspace Access / 办公入口"
        heroTitle="统一办公系统登录入口"
        heroDescription="这里用于进入 CloudFlow Pro 工作台，不承担产品介绍，只保留访问系统需要的关键信息。"
        heroStats={loginStats}
        heroPoints={loginHighlights}
        heroFootnote="当前登录链路已启用账号密码、滑块验证码与会话校验。"
        formAside={{
          label: '系统状态',
          value: '生产环境入口',
          hint: '登录成功后进入统一工作台',
        }}
        footer={
          <div className="flex items-center text-sm">
            <div className="text-slate-500">
              还没有账号？
              <Link to="/register" className="ml-2 font-semibold text-slate-900 transition-colors hover:text-pink-600">
                去创建账户
              </Link>
            </div>
          </div>
        }
      >
        <form onSubmit={handleLoginClick} className="space-y-4">
          <div className="flex items-center gap-2 rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-600">
            <ShieldCheck size={14} className="shrink-0 text-slate-700" />
            登录前将触发滑块验证码，验证通过后再提交账号密码。
          </div>

          <div className="space-y-2">
            <Label htmlFor="username" className="text-sm font-semibold text-slate-700">
              账号
            </Label>
            <div className="group relative">
              <UserCheck className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-pink-500" size={18} />
              <Input
                id="username"
                type="text"
                value={username}
                onChange={event => setUsername(event.target.value)}
                autoComplete="username"
                className="h-12 rounded-[18px] border-slate-200 bg-white pl-12 pr-4 text-base shadow-sm transition-all duration-300 focus:border-slate-300 focus:bg-white focus:ring-4 focus:ring-slate-950/5"
                placeholder="请输入用户名"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="password" className="text-sm font-semibold text-slate-700">
              密码
            </Label>
            <div className="group relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-pink-500" size={18} />
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={event => setPassword(event.target.value)}
                autoComplete="current-password"
                className="h-12 rounded-[18px] border-slate-200 bg-white pl-12 pr-12 text-base shadow-sm transition-all duration-300 focus:border-slate-300 focus:bg-white focus:ring-4 focus:ring-slate-950/5"
                placeholder="请输入登录密码"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(prev => !prev)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 transition-colors hover:text-slate-700"
                aria-label={showPassword ? '隐藏密码' : '显示密码'}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-3 rounded-[20px] border border-red-100 bg-red-50/90 px-4 py-3 text-sm text-red-600">
              <ShieldCheck size={16} className="mt-0.5 shrink-0" />
              <span className="leading-6">{error}</span>
            </div>
          )}

          <Button
            type="submit"
            disabled={loading}
            className="h-12 w-full rounded-[18px] bg-[linear-gradient(135deg,#0f172a,#334155)] text-base font-semibold text-white shadow-[0_18px_36px_rgba(15,23,42,0.2)] transition-all duration-300 hover:translate-y-[-1px] hover:bg-[linear-gradient(135deg,#111827,#1f2937)]"
          >
            {loading ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 size={18} className="animate-spin" />
                正在登录...
              </span>
            ) : (
              <span className="inline-flex items-center gap-2">
                登录系统
                <ArrowRight size={18} />
              </span>
            )}
          </Button>
        </form>
      </AuthExperienceShell>

      <AuthCaptchaDialog
        open={showCaptchaModal}
        title="完成登录前校验"
        description="请先通过下方滑块拼图验证，我们会在验证通过后继续处理账号密码。"
        onClose={() => setShowCaptchaModal(false)}
        onVerify={handleCaptchaVerify}
      />
    </>
  );
};
