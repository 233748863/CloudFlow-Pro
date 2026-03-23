import React, { useState } from 'react';
import { ArrowRight, Eye, EyeOff, Loader2, Lock, Mail, ShieldCheck, Sparkles, UserCheck, Users, WandSparkles } from 'lucide-react';
import { useNavigate, Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Button, Input, Label } from '@/components/ui';
import { AuthCaptchaDialog, AuthExperienceShell } from '@/components/auth/AuthExperienceShell';
import { register as apiRegister } from '@/services/api/auth';

const registerStats = [
  { label: '账号定位', value: '组织成员', hint: '注册后作为协同系统登录入口' },
  { label: '接入范围', value: '流程 + OA', hint: '审批、日程、公告、会议室等模块' },
  { label: '后续配置', value: '角色 + 菜单', hint: '注册后由管理员继续分配权限' },
];

const registerHighlights = [
  {
    title: '先创建协同账号',
    description: '账号创建完成后，就可以作为组织成员接入系统工作台。',
    icon: Users,
    tone: 'pink' as const,
  },
  {
    title: '再接入具体业务',
    description: '后续可继续分配角色、菜单、部门，并接入流程、OA 与 HR 能力。',
    icon: WandSparkles,
    tone: 'amber' as const,
  },
];

export const Register = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [showCaptchaModal, setShowCaptchaModal] = useState(false);
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const navigate = useNavigate();

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({
      ...prev,
      [event.target.id]: event.target.value,
    }));
  };

  const handleRegisterClick = (event: React.FormEvent) => {
    event.preventDefault();
    setError('');

    if (formData.password !== formData.confirmPassword) {
      setError('两次输入的密码不一致');
      return;
    }

    setShowCaptchaModal(true);
  };

  const handleCaptchaVerify = async (token: string) => {
    setShowCaptchaModal(false);
    setLoading(true);

    try {
      await apiRegister({
        ...formData,
        username: formData.username.trim(),
        email: formData.email.trim(),
        captchaToken: token,
      });
      toast.success('注册成功，请登录');
      navigate('/login');
    } catch (error: any) {
      const errorMessage = error.message || '注册失败，请稍后重试';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <AuthExperienceShell
        formBadge="创建协同账号"
        formTitle="创建协同账号"
        formDescription="完成注册后，即可作为组织成员接入系统工作流。"
        heroEyebrow="组织成员 / 协同接入"
        heroTitle="先创建账号，再接入你的协同工作台。"
        heroDescription="注册完成后，可继续由管理员分配角色、菜单和部门，接入审批、公告、日程、会议室与 HR 业务。"
        heroStats={registerStats}
        heroPoints={registerHighlights}
        heroFootnote="如果新账号创建成功后没有菜单权限，需要由管理员继续分配角色与菜单。"
        formAside={{
          label: '接入对象',
          value: '系统账号 / 角色权限',
          hint: '创建后可继续绑定部门与角色',
        }}
        footer={
          <div className="flex flex-col gap-3 text-sm sm:flex-row sm:items-center sm:justify-between">
            <div className="text-slate-500">
              已经有账号？
              <Link to="/login" className="ml-2 font-semibold text-pink-600 transition-colors hover:text-pink-700">
                回到登录
              </Link>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-500">
              <Sparkles size={12} className="text-pink-500" />
              创建成功后返回登录页验证账号
            </div>
          </div>
        }
      >
        <form onSubmit={handleRegisterClick} className="space-y-4">
          <div className="flex items-center gap-2 rounded-[20px] border border-pink-100 bg-pink-50/75 px-4 py-3 text-xs leading-5 text-slate-600">
            <ShieldCheck size={14} className="shrink-0 text-pink-500" />
            创建成功后，如无菜单权限，请由管理员继续分配角色、部门和菜单。
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="username" className="text-sm font-semibold text-slate-700">
                用户名
              </Label>
              <div className="group relative">
                <UserCheck className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-pink-500" size={18} />
                <Input
                  id="username"
                  type="text"
                  value={formData.username}
                  onChange={handleChange}
                  autoComplete="username"
                  className="h-12 rounded-[22px] border-slate-200 bg-white/90 pl-12 pr-4 text-base shadow-sm transition-all duration-300 focus:border-pink-200 focus:bg-white focus:ring-4 focus:ring-pink-500/10"
                  placeholder="设置登录用户名"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-semibold text-slate-700">
                邮箱
                <span className="ml-2 text-xs font-medium text-slate-400">可选</span>
              </Label>
              <div className="group relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-pink-500" size={18} />
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={handleChange}
                  autoComplete="email"
                  className="h-12 rounded-[22px] border-slate-200 bg-white/90 pl-12 pr-4 text-base shadow-sm transition-all duration-300 focus:border-pink-200 focus:bg-white focus:ring-4 focus:ring-pink-500/10"
                  placeholder="例如：admin@cloudflow.pro"
                />
              </div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-semibold text-slate-700">
                密码
              </Label>
              <div className="group relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-pink-500" size={18} />
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={formData.password}
                  onChange={handleChange}
                  autoComplete="new-password"
                  className="h-12 rounded-[22px] border-slate-200 bg-white/90 pl-12 pr-12 text-base shadow-sm transition-all duration-300 focus:border-pink-200 focus:bg-white focus:ring-4 focus:ring-pink-500/10"
                  placeholder="设置登录密码"
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

            <div className="space-y-2">
              <Label htmlFor="confirmPassword" className="text-sm font-semibold text-slate-700">
                确认密码
              </Label>
              <div className="group relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-pink-500" size={18} />
                <Input
                  id="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  autoComplete="new-password"
                  className="h-12 rounded-[22px] border-slate-200 bg-white/90 pl-12 pr-12 text-base shadow-sm transition-all duration-300 focus:border-pink-200 focus:bg-white focus:ring-4 focus:ring-pink-500/10"
                  placeholder="再次输入密码"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(prev => !prev)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 transition-colors hover:text-pink-500"
                  aria-label={showConfirmPassword ? '隐藏确认密码' : '显示确认密码'}
                >
                  {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
          </div>

          <div className="rounded-[20px] border border-slate-100 bg-slate-50/80 px-4 py-3 text-xs leading-5 text-slate-500">
            建议使用字母和数字组合密码。创建账号后，可继续在后台分配角色与菜单。
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
            <span className="inline-flex items-center gap-2">
              {loading ? <Loader2 size={18} className="animate-spin" /> : null}
              {loading ? '正在创建账户...' : '创建账户'}
              <ArrowRight size={18} />
            </span>
          </Button>
        </form>
      </AuthExperienceShell>

      <AuthCaptchaDialog
        open={showCaptchaModal}
        title="完成注册前校验"
        description="请先通过下方滑块拼图验证，我们会在验证通过后继续创建新账号。"
        onClose={() => setShowCaptchaModal(false)}
        onVerify={handleCaptchaVerify}
      />
    </>
  );
};
