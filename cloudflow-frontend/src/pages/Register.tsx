import React, { useState } from 'react';
import { ArrowRight, Eye, EyeOff, Loader2, Lock, Mail, ShieldCheck, UserCheck } from 'lucide-react';
import { useNavigate, Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Button, Input, Label } from '@/components/ui';
import { AuthCaptchaDialog, AuthExperienceShell } from '@/components/auth/AuthExperienceShell';
import { register as apiRegister } from '@/services/api/auth';

const registerStats = [
  { label: '账号类型', value: '组织成员', hint: '注册后作为办公系统基础账号使用' },
  { label: '开通方式', value: '注册后授权', hint: '管理员继续分配角色、菜单和部门' },
  { label: '安全校验', value: '滑块验证', hint: '提交注册前需要通过安全验证' },
];

const registerHighlights = [
  {
    title: '先完成基础账号创建',
    description: '填写用户名和密码即可提交注册，作为系统登录凭证使用。',
    icon: UserCheck,
    tone: 'slate' as const,
  },
  {
    title: '再补齐权限与组织信息',
    description: '注册成功后由管理员继续配置部门、角色和可访问菜单。',
    icon: ShieldCheck,
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
        formBadge="新账号注册"
        formTitle="创建系统账号"
        formDescription="完成基础信息填写后提交注册，成功后返回登录页。"
        heroEyebrow="Account Setup / 账号开通"
        heroTitle="办公系统账号注册入口"
        heroDescription="这里用于创建 CloudFlow Pro 登录账号，重点是完成注册流程本身，而不是展示业务介绍。"
        heroStats={registerStats}
        heroPoints={registerHighlights}
        heroFootnote="新账号创建成功后，如无菜单权限，需要由管理员继续完成授权。"
        formAside={{
          label: '开通结果',
          value: '创建基础账号',
          hint: '成功后返回登录页继续登录',
        }}
        footer={
          <div className="flex flex-col gap-3 text-sm sm:flex-row sm:items-center sm:justify-between">
            <div className="text-slate-500">
              已经有账号？
              <Link to="/login" className="ml-2 font-semibold text-slate-900 transition-colors hover:text-pink-600">
                回到登录
              </Link>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-500">
              <ShieldCheck size={12} className="text-slate-700" />
              创建成功后返回登录页验证账号
            </div>
          </div>
        }
      >
        <form onSubmit={handleRegisterClick} className="space-y-4">
          <div className="flex items-center gap-2 rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-600">
            <ShieldCheck size={14} className="shrink-0 text-slate-700" />
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
                  className="h-12 rounded-[18px] border-slate-200 bg-white pl-12 pr-4 text-base shadow-sm transition-all duration-300 focus:border-slate-300 focus:bg-white focus:ring-4 focus:ring-slate-950/5"
                  placeholder="设置用户名"
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
                  className="h-12 rounded-[18px] border-slate-200 bg-white pl-12 pr-4 text-base shadow-sm transition-all duration-300 focus:border-slate-300 focus:bg-white focus:ring-4 focus:ring-slate-950/5"
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
                  className="h-12 rounded-[18px] border-slate-200 bg-white pl-12 pr-12 text-base shadow-sm transition-all duration-300 focus:border-slate-300 focus:bg-white focus:ring-4 focus:ring-slate-950/5"
                  placeholder="设置密码"
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
                  className="h-12 rounded-[18px] border-slate-200 bg-white pl-12 pr-12 text-base shadow-sm transition-all duration-300 focus:border-slate-300 focus:bg-white focus:ring-4 focus:ring-slate-950/5"
                  placeholder="再次输入密码"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(prev => !prev)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 transition-colors hover:text-slate-700"
                  aria-label={showConfirmPassword ? '隐藏确认密码' : '显示确认密码'}
                >
                  {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
          </div>

          <div className="rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-500">
            建议使用字母和数字组合密码。创建账号后，可继续在后台分配角色与菜单。
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
