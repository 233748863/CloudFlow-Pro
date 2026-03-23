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
  { label: '流程中心', value: '审批 + 申请', hint: '发起流程、待办审批、我的申请' },
  { label: '协同办公', value: '日程 + 公告', hint: '会议室、通讯录等能力已接入' },
  { label: 'HR 业务', value: '招聘 + 转正', hint: '登录后可进入 HR 工作台' },
];

const loginHighlights = [
  {
    title: '继续处理日常协同',
    description: '登录后可以继续处理审批、日程、公告、会议室等日常办公事项。',
    icon: Workflow,
    tone: 'pink' as const,
  },
  {
    title: '回到统一工作台',
    description: '流程中心、OA 办公和 HR 页面已经在同一套桌面端里联动。',
    icon: Layers3,
    tone: 'rose' as const,
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
        formBadge="协同办公入口"
        formTitle="回到你的协同工作台"
        formDescription="继续处理审批、日程、公告、会议室与 HR 业务。"
        heroEyebrow="协同办公 / 统一入口"
        heroTitle="登录后继续你的审批、日程与协同工作。"
        heroDescription="CloudFlow Pro 已整合流程中心、OA 办公和 HR 桌面端，适合作为团队日常工作的统一入口。"
        heroStats={loginStats}
        heroPoints={loginHighlights}
        heroFootnote="当前登录链路已接入 JWT、Redis 会话和自研滑块验证码。"
        formAside={{
          label: '当前版本',
          value: 'v2.0 生产就绪',
          hint: '登录后进入统一工作台',
        }}
        footer={
          <div className="flex items-center text-sm">
            <div className="text-slate-500">
              还没有账号？
              <Link to="/register" className="ml-2 font-semibold text-pink-600 transition-colors hover:text-pink-700">
                去创建账户
              </Link>
            </div>
          </div>
        }
      >
        <form onSubmit={handleLoginClick} className="space-y-4">
          <div className="flex items-center gap-2 rounded-[20px] border border-pink-100 bg-pink-50/75 px-4 py-3 text-xs leading-5 text-slate-600">
            <ShieldCheck size={14} className="shrink-0 text-pink-500" />
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
                className="h-12 rounded-[22px] border-slate-200 bg-white/90 pl-12 pr-4 text-base shadow-sm transition-all duration-300 focus:border-pink-200 focus:bg-white focus:ring-4 focus:ring-pink-500/10"
                placeholder="请输入用户名，例如：admin"
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
                className="h-12 rounded-[22px] border-slate-200 bg-white/90 pl-12 pr-12 text-base shadow-sm transition-all duration-300 focus:border-pink-200 focus:bg-white focus:ring-4 focus:ring-pink-500/10"
                placeholder="请输入登录密码"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(prev => !prev)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 transition-colors hover:text-pink-500"
                aria-label={showPassword ? '隐藏密码' : '显示密码'}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-3 rounded-[24px] border border-red-100 bg-red-50/90 px-4 py-3 text-sm text-red-600">
              <ShieldCheck size={16} className="mt-0.5 shrink-0" />
              <span className="leading-6">{error}</span>
            </div>
          )}

          <Button
            type="submit"
            disabled={loading}
            className="h-12 w-full rounded-[22px] bg-gradient-to-r from-pink-500 via-pink-500 to-rose-500 text-base font-semibold text-white shadow-[0_18px_36px_rgba(236,72,153,0.28)] transition-all duration-300 hover:translate-y-[-1px] hover:from-pink-600 hover:to-rose-600"
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
