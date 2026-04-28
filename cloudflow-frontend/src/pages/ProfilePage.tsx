import React, { useEffect, useMemo, useState } from 'react';
import {
  BadgeCheck,
  Building2,
  CalendarDays,
  CheckCircle2,
  IdCard,
  KeyRound,
  LockKeyhole,
  Mail,
  Phone,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label, StatCard } from '@/components/common';
import { changeProfilePassword, updateProfile } from '@/services/api/auth';
import { cn } from '@/utils/cn';

type ProfileFormState = {
  nickName: string;
  email: string;
  phone: string;
};

type PasswordFormState = {
  oldPassword: string;
  newPassword: string;
  confirmPassword: string;
};

const getInitials = (name?: string, username?: string) => {
  const source = String(name || username || 'CF').trim();
  return source.slice(0, 2).toUpperCase();
};

const formatValue = (value?: string | number | null) => {
  const normalized = String(value ?? '').trim();
  return normalized || '-';
};

const formatDate = (value?: string) => {
  if (!value) {
    return '-';
  }

  const parsed = new Date(value.replace(' ', 'T'));
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
};

const getRoleLabel = (role?: string) => {
  const normalized = String(role || '').replace(/^ROLE_/i, '').toUpperCase();
  const labels: Record<string, string> = {
    ADMIN: '管理员',
    HR: '人力资源',
    EMPLOYEE: '员工',
    USER: '用户',
    COMMON: '普通用户',
  };
  return labels[normalized] || normalized || '用户';
};

const getStatusMeta = (status?: string) => {
  const normalized = String(status || '').toUpperCase();
  if (normalized === '0' || normalized === 'ACTIVE' || normalized === 'ENABLE' || normalized === 'ENABLED') {
    return {
      label: '启用',
      className: 'badge-success',
      iconClassName: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-300',
    };
  }

  return {
    label: normalized === '1' || normalized === 'DISABLED' ? '停用' : formatValue(status),
    className: 'badge-gray',
    iconClassName: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300',
  };
};

const ProfileField: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}> = ({ icon, label, value }) => (
  <div className="flex min-w-0 items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/70 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/60">
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-slate-500 shadow-sm dark:bg-slate-950 dark:text-slate-300">
      {icon}
    </div>
    <div className="min-w-0">
      <div className="text-xs text-slate-500 dark:text-slate-400">{label}</div>
      <div className="mt-1 truncate text-sm font-medium text-slate-900 dark:text-slate-100">{value}</div>
    </div>
  </div>
);

export const ProfilePage: React.FC = () => {
  const { user, refreshUser } = useAuth();
  const [profileForm, setProfileForm] = useState<ProfileFormState>({
    nickName: '',
    email: '',
    phone: '',
  });
  const [passwordForm, setPasswordForm] = useState<PasswordFormState>({
    oldPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    setProfileForm({
      nickName: user?.name || '',
      email: user?.email || '',
      phone: user?.phone || '',
    });
  }, [user]);

  const displayName = user?.name || user?.username || '新元用户';
  const initials = getInitials(user?.name, user?.username);
  const statusMeta = getStatusMeta(user?.status);

  const profileRows = useMemo(
    () => [
      { icon: <IdCard size={18} />, label: '用户ID', value: formatValue(user?.id) },
      { icon: <UserRound size={18} />, label: '登录账号', value: formatValue(user?.username) },
      { icon: <Mail size={18} />, label: '邮箱', value: formatValue(user?.email) },
      { icon: <Phone size={18} />, label: '手机号', value: formatValue(user?.phone) },
      { icon: <Building2 size={18} />, label: '部门', value: formatValue(user?.deptName) },
      { icon: <CalendarDays size={18} />, label: '创建时间', value: formatDate(user?.createTime) },
    ],
    [user],
  );

  const handleProfileSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nickName = profileForm.nickName.trim();
    if (!nickName) {
      toast.error('显示名称不能为空');
      return;
    }

    setSavingProfile(true);
    try {
      await updateProfile({
        nickName,
        email: profileForm.email.trim(),
        phone: profileForm.phone.trim(),
      });
      await refreshUser();
      toast.success('个人资料已更新');
    } catch (error) {
      console.error('Failed to update profile:', error);
    } finally {
      setSavingProfile(false);
    }
  };

  const handlePasswordSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast.error('两次输入的新密码不一致');
      return;
    }
    if (passwordForm.newPassword.length < 6) {
      toast.error('新密码至少 6 位');
      return;
    }

    setSavingPassword(true);
    try {
      await changeProfilePassword(passwordForm.oldPassword, passwordForm.newPassword);
      setPasswordForm({ oldPassword: '', newPassword: '', confirmPassword: '' });
      toast.success('密码已更新');
    } catch (error) {
      console.error('Failed to change password:', error);
    } finally {
      setSavingPassword(false);
    }
  };

  if (!user) {
    return null;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950/88">
        <div className="border-b border-slate-100 bg-[linear-gradient(135deg,rgba(8,145,178,0.13),rgba(20,184,166,0.08),rgba(245,158,11,0.08))] px-5 py-6 dark:border-slate-800 dark:bg-[linear-gradient(135deg,rgba(8,145,178,0.20),rgba(20,184,166,0.10),rgba(245,158,11,0.08))] md:px-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex min-w-0 items-center gap-4">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-cyan-500 to-teal-600 text-xl font-semibold text-white shadow-[0_16px_32px_rgba(8,145,178,0.20)]">
                {user.avatar ? (
                  <img src={user.avatar} alt={displayName} className="h-full w-full object-cover" />
                ) : (
                  initials
                )}
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-2xl font-semibold text-slate-950 dark:text-white">{displayName}</h1>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="badge badge-primary">{getRoleLabel(String(user.role))}</span>
                  <span className={cn('badge', statusMeta.className)}>{statusMeta.label}</span>
                  <span className="badge badge-gray">{formatValue(user.tenantName || user.tenantId)}</span>
                </div>
              </div>
            </div>
            <div className="grid gap-2 text-sm text-slate-600 dark:text-slate-300 sm:grid-cols-2 md:min-w-[22rem]">
              <div className="flex min-w-0 items-center gap-2 rounded-xl bg-white/72 px-3 py-2 dark:bg-slate-950/55">
                <Mail size={16} className="shrink-0 text-cyan-600 dark:text-cyan-300" />
                <span className="truncate">{formatValue(user.email)}</span>
              </div>
              <div className="flex min-w-0 items-center gap-2 rounded-xl bg-white/72 px-3 py-2 dark:bg-slate-950/55">
                <Phone size={16} className="shrink-0 text-teal-600 dark:text-teal-300" />
                <span className="truncate">{formatValue(user.phone)}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          title="用户ID"
          value={formatValue(user.id)}
          icon={<IdCard size={20} />}
          iconVariant="primary"
        />
        <StatCard
          title="所属租户"
          value={formatValue(user.tenantName || user.tenantId)}
          icon={<Building2 size={20} />}
          iconVariant="success"
        />
        <StatCard
          title="账号状态"
          value={statusMeta.label}
          icon={<CheckCircle2 size={20} />}
          iconVariant="warning"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
        <div className="space-y-6">
          <Card>
            <CardHeader className="border-b border-slate-100 dark:border-slate-800">
              <CardTitle className="text-base">基础信息</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 pt-5">
              {profileRows.map((item) => (
                <ProfileField key={item.label} icon={item.icon} label={item.label} value={item.value} />
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="border-b border-slate-100 dark:border-slate-800">
              <CardTitle className="text-base">安全状态</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pt-5">
              <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/70 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/60">
                <div className="flex min-w-0 items-center gap-3">
                  <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', statusMeta.iconClassName)}>
                    <ShieldCheck size={18} />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-slate-900 dark:text-slate-100">账号可用性</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">当前状态：{statusMeta.label}</div>
                  </div>
                </div>
                <BadgeCheck size={18} className="shrink-0 text-emerald-500" />
              </div>
              <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/70 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/60">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">
                    <KeyRound size={18} />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-slate-900 dark:text-slate-100">登录密码</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">支持当前页面直接修改</div>
                  </div>
                </div>
                <LockKeyhole size={18} className="shrink-0 text-slate-400" />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader className="border-b border-slate-100 dark:border-slate-800">
              <CardTitle className="text-base">编辑资料</CardTitle>
            </CardHeader>
            <CardContent className="pt-5">
              <form className="space-y-4" onSubmit={handleProfileSubmit}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="profile-username">登录账号</Label>
                    <Input id="profile-username" value={user.username || ''} disabled />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="profile-nickname">显示名称</Label>
                    <Input
                      id="profile-nickname"
                      value={profileForm.nickName}
                      onChange={(event) =>
                        setProfileForm((current) => ({ ...current, nickName: event.target.value }))
                      }
                      autoComplete="name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="profile-email">邮箱</Label>
                    <Input
                      id="profile-email"
                      value={profileForm.email}
                      onChange={(event) =>
                        setProfileForm((current) => ({ ...current, email: event.target.value }))
                      }
                      type="email"
                      autoComplete="email"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="profile-phone">手机号</Label>
                    <Input
                      id="profile-phone"
                      value={profileForm.phone}
                      onChange={(event) =>
                        setProfileForm((current) => ({ ...current, phone: event.target.value }))
                      }
                      autoComplete="tel"
                    />
                  </div>
                </div>
                <div className="flex justify-end pt-2">
                  <Button type="submit" disabled={savingProfile}>
                    {savingProfile ? '保存中...' : '保存资料'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="border-b border-slate-100 dark:border-slate-800">
              <CardTitle className="text-base">修改密码</CardTitle>
            </CardHeader>
            <CardContent className="pt-5">
              <form className="space-y-4" onSubmit={handlePasswordSubmit}>
                <div className="space-y-2">
                  <Label htmlFor="profile-old-password">当前密码</Label>
                  <Input
                    id="profile-old-password"
                    value={passwordForm.oldPassword}
                    onChange={(event) =>
                      setPasswordForm((current) => ({ ...current, oldPassword: event.target.value }))
                    }
                    type="password"
                    autoComplete="current-password"
                    required
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="profile-new-password">新密码</Label>
                    <Input
                      id="profile-new-password"
                      value={passwordForm.newPassword}
                      onChange={(event) =>
                        setPasswordForm((current) => ({ ...current, newPassword: event.target.value }))
                      }
                      type="password"
                      autoComplete="new-password"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="profile-confirm-password">确认新密码</Label>
                    <Input
                      id="profile-confirm-password"
                      value={passwordForm.confirmPassword}
                      onChange={(event) =>
                        setPasswordForm((current) => ({ ...current, confirmPassword: event.target.value }))
                      }
                      type="password"
                      autoComplete="new-password"
                      required
                    />
                  </div>
                </div>
                <div className="flex justify-end pt-2">
                  <Button type="submit" variant="contrast" disabled={savingPassword}>
                    {savingPassword ? '更新中...' : '更新密码'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};
