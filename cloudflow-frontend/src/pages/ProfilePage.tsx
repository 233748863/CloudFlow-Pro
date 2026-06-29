import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CalendarDays,
  Clipboard,
  Gauge,
  Link2,
  Mail,
  MessageCircleMore,
  Phone,
  ShieldCheck,
  Trash2,
  Upload,
  UserRound,
  WalletCards,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';
import { BaseDialog, Button, Input, Label } from '@/components/common';
import { InnerTableSurface, TablePageLayout } from '@/components/layout/TablePageLayout';
import { changeProfilePassword, updateProfile } from '@/services/api/auth';
import { cn } from '@/utils/cn';

type BindingProvider = 'email' | 'phone' | 'account' | 'wechat';
type SourceProvider = 'linuxdo' | 'oidc' | 'wechat' | 'github' | 'google';

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

type EmailBindingFormState = {
  email: string;
  verifyCode: string;
  password: string;
};

type BindingRow = {
  provider: BindingProvider;
  label: string;
  value: string;
  bound: boolean;
  canBind: boolean;
  canUnbind: boolean;
  initial: string;
  tone: string;
  icon: React.ReactNode;
};

type NotifyEmail = {
  email: string;
  verified: boolean;
  disabled: boolean;
};

type PendingNotifyEmail = {
  email: string;
  codeSent: boolean;
  code: string;
  sending: boolean;
  verifying: boolean;
  countdown: number;
};

const sourceProviderLabels: Record<SourceProvider, string> = {
  linuxdo: 'LinuxDo',
  oidc: 'OIDC',
  wechat: '微信',
  github: 'GitHub',
  google: 'Google',
};

const setupSecret = 'JBSWY3DPEHPK3PXP';

const getInitials = (name?: string, username?: string) => {
  const source = String(name || username || 'CF').trim();
  return Array.from(source).slice(0, 2).join('').toUpperCase() || 'CF';
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

  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'short',
  }).format(parsed);
};

const getRoleLabel = (role?: string) => {
  const normalized = String(role || '').replace(/^ROLE_/i, '').toUpperCase();
  const labels: Record<string, string> = {
    ADMIN: '管理员',
    MANAGER: '经理',
    HR: '人力资源',
    FINANCE: '财务',
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
    };
  }

  return {
    label: normalized === '1' || normalized === 'DISABLED' ? '停用' : formatValue(status),
    className: 'badge-gray',
  };
};

const getEmailDomain = (email?: string, fallback = 'cloudflow.local') => {
  const [, domain] = String(email || '').split('@');
  return domain || fallback;
};

const normalizeSourceProvider = (value: unknown): SourceProvider | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === 'linuxdo' || normalized === 'wechat' || normalized === 'github' || normalized === 'google') {
    return normalized;
  }
  if (normalized === 'oidc' || normalized.startsWith('oidc:') || normalized.startsWith('oidc/')) {
    return 'oidc';
  }
  return null;
};

const pickString = (record: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return '';
};

const resolveProfileSource = (value: unknown) => {
  if (typeof value === 'string') {
    const provider = normalizeSourceProvider(value);
    return provider ? { provider, label: sourceProviderLabels[provider] } : null;
  }

  if (!value || typeof value !== 'object') {
    return null;
  }

  const record = value as Record<string, unknown>;
  const provider = normalizeSourceProvider(pickString(record, ['provider', 'source', 'provider_type', 'auth_provider']));
  if (!provider) {
    return null;
  }

  return {
    provider,
    label: pickString(record, ['provider_label', 'label', 'provider_name', 'providerName']) || sourceProviderLabels[provider],
  };
};

const makeQrDataUri = () => {
  const rects = Array.from({ length: 15 }, (_, y) =>
    Array.from({ length: 15 }, (_, x) =>
      (x * 7 + y * 11 + x * y) % 5 < 2
        ? `<rect x="${x * 10}" y="${y * 10}" width="10" height="10"/>`
        : '',
    ).join(''),
  ).join('');
  return `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="150" height="150" viewBox="0 0 150 150"><rect width="150" height="150" fill="white"/><g fill="black">${rects}</g></svg>`,
  )}`;
};

const ToggleSwitch: React.FC<{
  checked: boolean;
  onChange: () => void;
  ariaLabel: string;
  small?: boolean;
}> = ({ checked, onChange, ariaLabel, small = false }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={ariaLabel}
    className={cn('profile-switch', checked && 'is-on', small && 'is-small')}
    onClick={onChange}
  >
    <span />
  </button>
);

export const ProfilePage: React.FC = () => {
  const { user, refreshUser } = useAuth();
  const digitRefs = useRef<Array<HTMLInputElement | null>>([]);
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
  const [emailForm, setEmailForm] = useState<EmailBindingFormState>({
    email: '',
    verifyCode: '',
    password: '',
  });
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState('');
  const [avatarChanged, setAvatarChanged] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [notifyEnabled, setNotifyEnabled] = useState(true);
  const [notifyThreshold, setNotifyThreshold] = useState(10);
  const [notifyEmails, setNotifyEmails] = useState<NotifyEmail[]>([]);
  const [pendingNotifyEmails, setPendingNotifyEmails] = useState<PendingNotifyEmail[]>([]);
  const [extraEmail, setExtraEmail] = useState('');
  const [verifyingEmail, setVerifyingEmail] = useState('');
  const [verifyCode, setVerifyCode] = useState('');
  const [verifyCountdown, setVerifyCountdown] = useState(0);
  const [verifySending, setVerifySending] = useState(false);
  const [verifyConfirming, setVerifyConfirming] = useState(false);
  const [totpEnabled, setTotpEnabled] = useState(false);
  const [showTotpSetup, setShowTotpSetup] = useState(false);
  const [showTotpDisable, setShowTotpDisable] = useState(false);
  const [setupStep, setSetupStep] = useState(0);
  const [setupPassword, setSetupPassword] = useState('');
  const [setupEmailCode, setSetupEmailCode] = useState('');
  const [setupCountdown, setSetupCountdown] = useState(0);
  const [setupDigits, setSetupDigits] = useState(['', '', '', '', '', '']);
  const [disablePassword, setDisablePassword] = useState('');
  const [disableCode, setDisableCode] = useState('');
  const [disableCountdown, setDisableCountdown] = useState(0);

  useEffect(() => {
    const primaryEmail = user?.email || `${user?.username || 'user'}@cloudflow.local`;
    const domain = getEmailDomain(primaryEmail);

    setProfileForm({
      nickName: user?.name || '',
      email: user?.email || '',
      phone: user?.phone || '',
    });
    setEmailForm({
      email: primaryEmail,
      verifyCode: '',
      password: '',
    });
    setAvatarPreview(user?.avatar || '');
    setAvatarChanged(false);
    setNotifyEmails([
      { email: primaryEmail, verified: Boolean(user?.email), disabled: false },
      { email: `finance@${domain}`, verified: false, disabled: false },
    ]);
    setPendingNotifyEmails([]);
    setExtraEmail(`alerts@${domain}`);
    setVerifyingEmail('');
    setVerifyCode('');
  }, [user]);

  useEffect(() => {
    if (verifyCountdown <= 0) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      setVerifyCountdown((current) => Math.max(current - 1, 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [verifyCountdown]);

  useEffect(() => {
    if (setupCountdown <= 0) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      setSetupCountdown((current) => Math.max(current - 1, 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [setupCountdown]);

  useEffect(() => {
    if (disableCountdown <= 0) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      setDisableCountdown((current) => Math.max(current - 1, 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [disableCountdown]);

  useEffect(() => {
    if (!pendingNotifyEmails.some((item) => item.countdown > 0)) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      setPendingNotifyEmails((current) =>
        current.map((item) => ({
          ...item,
          countdown: Math.max(item.countdown - 1, 0),
        })),
      );
    }, 1000);
    return () => window.clearInterval(timer);
  }, [pendingNotifyEmails]);

  const displayName = user?.name || user?.username || 'CloudFlow';
  const initials = getInitials(user?.name, user?.username);
  const statusMeta = getStatusMeta(user?.status);
  const roleLabel = getRoleLabel(String(user?.role || ''));
  const memberSince = formatDate(user?.createTime);
  const qrDataUri = useMemo(makeQrDataUri, []);

  const accountSources = useMemo(() => {
    const record = (user || {}) as Record<string, unknown>;
    const sourceMap = record.profile_sources && typeof record.profile_sources === 'object'
      ? (record.profile_sources as Record<string, unknown>)
      : {};
    const avatar = resolveProfileSource(sourceMap.avatar ?? record.avatar_source);
    const username = resolveProfileSource(
      sourceMap.username
        ?? sourceMap.display_name
        ?? sourceMap.nickname
        ?? record.display_name_source
        ?? record.username_source
        ?? record.nickname_source,
    );
    const rows: Array<{ key: string; text: string }> = [];
    if (avatar) {
      rows.push({ key: 'avatar', text: `头像来自 ${avatar.label}` });
    }
    if (username) {
      rows.push({ key: 'username', text: `用户名来自 ${username.label}` });
    }
    return rows;
  }, [user]);

  const bindingRows = useMemo<BindingRow[]>(
    () => [
      {
        provider: 'email',
        label: '邮箱',
        bound: Boolean(user?.email),
        value: formatValue(user?.email),
        canBind: false,
        canUnbind: false,
        initial: 'E',
        tone: 'is-primary',
        icon: <Mail size={18} />,
      },
      {
        provider: 'phone',
        label: '手机号',
        bound: Boolean(user?.phone),
        value: formatValue(user?.phone),
        canBind: !user?.phone,
        canUnbind: false,
        initial: 'P',
        tone: 'is-amber',
        icon: <Phone size={18} />,
      },
      {
        provider: 'account',
        label: '企业账号',
        bound: true,
        value: formatValue(user?.username),
        canBind: false,
        canUnbind: false,
        initial: 'A',
        tone: 'is-sky',
        icon: <UserRound size={18} />,
      },
      {
        provider: 'wechat',
        label: '微信',
        bound: false,
        value: '',
        canBind: true,
        canUnbind: false,
        initial: 'W',
        tone: 'is-green',
        icon: <MessageCircleMore size={18} />,
      },
    ],
    [user],
  );

  const setupSubtitle = useMemo(() => {
    if (setupStep === 1) {
      return '使用认证器应用扫描下方二维码';
    }
    if (setupStep === 2) {
      return '输入应用显示的 6 位验证码';
    }
    return '请先验证您的身份';
  }, [setupStep]);

  const setupReady = setupPassword.length > 0 || setupEmailCode.length === 6;
  const canAddNotifyEmail = notifyEmails.length + pendingNotifyEmails.length < 3;

  const handleAvatarFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setAvatarPreview(reader.result);
        setAvatarChanged(true);
      }
    };
    reader.readAsDataURL(file);
    event.currentTarget.value = '';
  };

  const handleAvatarSave = () => {
    setAvatarChanged(false);
    toast.info('头像预览已更新，当前服务未开放头像保存接口');
  };

  const handleAvatarDelete = () => {
    setAvatarPreview('');
    setAvatarChanged(true);
  };

  const handleProfileSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nickName = profileForm.nickName.trim();
    if (!nickName) {
      toast.error('用户名不能为空');
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
    if (passwordForm.newPassword.length < 8) {
      toast.error('新密码至少需要 8 个字符');
      return;
    }
    if (!/^[A-Za-z0-9]+$/.test(passwordForm.newPassword)) {
      toast.error('新密码只能包含字母或数字');
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

  const sendEmailCode = () => {
    setEmailForm((current) => ({ ...current, verifyCode: '123456' }));
    toast.info('验证码已填入演示值');
  };

  const submitEmailBinding = () => {
    setProfileForm((current) => ({ ...current, email: emailForm.email.trim() }));
    setShowEmailForm(false);
    toast.info('主邮箱已写入资料表单，保存资料后生效');
  };

  const notifyEmailExists = (email: string) => {
    const normalized = email.trim().toLowerCase();
    return notifyEmails.some((item) => item.email.toLowerCase() === normalized)
      || pendingNotifyEmails.some((item) => item.email.toLowerCase() === normalized);
  };

  const toggleNotifyEmail = (email: string) => {
    setNotifyEmails((current) =>
      current.map((item) => (item.email === email ? { ...item, disabled: !item.disabled } : item)),
    );
  };

  const sendExistingVerifyCode = (email: string) => {
    setVerifySending(true);
    setVerifyingEmail(email);
    setVerifyCode('');
    setVerifyCountdown(60);
    window.setTimeout(() => {
      setVerifySending(false);
      toast.info('验证码已发送');
    }, 120);
  };

  const confirmExistingVerify = (email: string) => {
    if (verifyCode.length !== 6) {
      return;
    }

    setVerifyConfirming(true);
    window.setTimeout(() => {
      setNotifyEmails((current) =>
        current.map((item) => (item.email === email ? { ...item, verified: true } : item)),
      );
      setVerifyConfirming(false);
      setVerifyingEmail('');
      setVerifyCode('');
      setVerifyCountdown(0);
      toast.success('通知邮箱已验证');
    }, 120);
  };

  const cancelVerifyExisting = () => {
    setVerifyingEmail('');
    setVerifyCode('');
    setVerifyCountdown(0);
  };

  const removeNotifyEmail = (email: string) => {
    setNotifyEmails((current) => current.filter((item) => item.email !== email));
    if (verifyingEmail === email) {
      cancelVerifyExisting();
    }
  };

  const addNotifyEmail = () => {
    const email = extraEmail.trim();
    if (!email) {
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error('请输入有效邮箱地址');
      return;
    }
    if (notifyEmailExists(email)) {
      toast.error('该邮箱已存在');
      return;
    }
    if (!canAddNotifyEmail) {
      toast.error('已达到通知邮箱数量上限');
      return;
    }

    setPendingNotifyEmails((current) => [
      ...current,
      {
        email,
        codeSent: false,
        code: '',
        sending: false,
        verifying: false,
        countdown: 0,
      },
    ]);
    setExtraEmail('');
  };

  const sendPendingCode = (index: number) => {
    setPendingNotifyEmails((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index
          ? {
              ...item,
              codeSent: true,
              sending: false,
              code: item.code || '',
              countdown: 60,
            }
          : item,
      ),
    );
    toast.info('验证码已发送');
  };

  const updatePendingCode = (index: number, code: string) => {
    setPendingNotifyEmails((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, code: code.replace(/\D/g, '').slice(0, 6) } : item,
      ),
    );
  };

  const confirmPendingEmail = (index: number) => {
    const item = pendingNotifyEmails[index];
    if (!item || item.code.length !== 6) {
      return;
    }

    setNotifyEmails((current) => [
      ...current,
      {
        email: item.email,
        verified: true,
        disabled: false,
      },
    ]);
    setPendingNotifyEmails((current) => current.filter((_, itemIndex) => itemIndex !== index));
    toast.success('通知邮箱已验证');
  };

  const removePendingEmail = (index: number) => {
    setPendingNotifyEmails((current) => current.filter((_, itemIndex) => itemIndex !== index));
  };

  const sendSetupCode = () => {
    setSetupEmailCode('123456');
    setSetupCountdown(60);
    toast.info('验证码已填入演示值');
  };

  const sendDisableCode = () => {
    setDisableCode('123456');
    setDisableCountdown(60);
    toast.info('验证码已填入演示值');
  };

  const moveSetupStep = (step: number) => {
    setSetupStep(step);
    if (step === 2) {
      window.setTimeout(() => digitRefs.current[0]?.focus(), 0);
    }
  };

  const closeSetup = () => {
    setShowTotpSetup(false);
    setSetupStep(0);
    setSetupPassword('');
    setSetupEmailCode('');
    setSetupDigits(['', '', '', '', '', '']);
  };

  const closeDisable = () => {
    setShowTotpDisable(false);
    setDisablePassword('');
    setDisableCode('');
  };

  const handleSetupDigit = (value: string, index: number) => {
    const digit = value.replace(/\D/g, '').slice(-1);
    setSetupDigits((current) => {
      const next = [...current];
      next[index] = digit;
      return next;
    });
    if (digit && index < 5) {
      digitRefs.current[index + 1]?.focus();
    }
  };

  const handleSetupKeyDown = (event: React.KeyboardEvent<HTMLInputElement>, index: number) => {
    if (event.key === 'Backspace' && !setupDigits[index] && index > 0) {
      digitRefs.current[index - 1]?.focus();
    }
  };

  const handleSetupPaste = (event: React.ClipboardEvent<HTMLInputElement>) => {
    const digits = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!digits) {
      return;
    }

    event.preventDefault();
    setSetupDigits(Array.from({ length: 6 }, (_, index) => digits[index] || ''));
    window.setTimeout(() => digitRefs.current[Math.min(digits.length, 5)]?.focus(), 0);
  };

  const confirmSetup = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (setupDigits.join('').length !== 6) {
      return;
    }

    setTotpEnabled(true);
    closeSetup();
    toast.success('双因素认证已启用');
  };

  const confirmDisable = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!disablePassword && disableCode.length !== 6) {
      return;
    }

    setTotpEnabled(false);
    closeDisable();
    toast.success('双因素认证已关闭');
  };

  const copySetupSecret = async () => {
    try {
      await navigator.clipboard.writeText(setupSecret);
      toast.success('密钥已复制');
    } catch {
      toast.error('复制失败');
    }
  };

  if (!user) {
    return null;
  }

  const record = user as unknown as Record<string, unknown>;
  const balanceValue = typeof record.balance === 'number' ? record.balance : 0;
  const concurrencyValue = typeof record.concurrency === 'number' ? record.concurrency : 16;
  const contactEmail = formatValue(user.email || emailForm.email);

  return (
    <section className="admin-source-page cf-profile-page">
      <div className="profile-shell" data-testid="profile-shell">
        <TablePageLayout
          className="profile-table-layout"
          tableSurfaceClassName="profile-table-layout-surface"
          actions={(
            <header className="admin-source-header profile-account-header" data-testid="profile-overview-summary">
              <div className="profile-account-title">
                <p className="admin-source-kicker">ACCOUNT PROFILE</p>
                <h2>{displayName}</h2>
                <span>{contactEmail}</span>
                <div className="admin-source-context-row">
                  <span className="admin-source-context-chip">
                    <UserRound className="admin-source-context-icon" />
                    <strong>角色</strong>
                    <em>{roleLabel}</em>
                  </span>
                  <span className="admin-source-context-chip">
                    <ShieldCheck className="admin-source-context-icon" />
                    <strong>状态</strong>
                    <em>{statusMeta.label}</em>
                  </span>
                  {accountSources.map((source) => (
                    <span key={source.key} className="admin-source-context-chip">
                      <Link2 className="admin-source-context-icon" />
                      <strong>来源</strong>
                      <em>{source.text}</em>
                    </span>
                  ))}
                </div>
              </div>

              <div className="admin-source-controls profile-account-actions">
                <div className="profile-header-avatar">
                  {avatarPreview ? (
                    <img src={avatarPreview} alt={displayName} />
                  ) : (
                    <div className="profile-default-avatar">
                      <span>{initials}</span>
                    </div>
                  )}
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => document.getElementById('profile-nickname')?.focus()}>
                  编辑资料
                </Button>
                <Button type="button" size="sm" onClick={() => setShowTotpSetup(true)}>
                  <ShieldCheck size={14} />
                  安全设置
                </Button>
              </div>
            </header>
          )}
          filters={(
            <section className="admin-source-stat-grid profile-overview-stat-grid">
              <article className="card admin-source-stat admin-source-tone-green" data-testid="profile-overview-metric-balance">
                <div className="admin-source-stat-icon"><WalletCards size={18} /></div>
                <div>
                  <p>账户余额</p>
                  <strong>${balanceValue.toFixed(2)}</strong>
                  <span>余额不足提醒已配置</span>
                </div>
              </article>
              <article className="card admin-source-stat admin-source-tone-blue" data-testid="profile-overview-metric-concurrency">
                <div className="admin-source-stat-icon"><Gauge size={18} /></div>
                <div>
                  <p>并发限制</p>
                  <strong>{concurrencyValue}</strong>
                  <span>当前账户配额</span>
                </div>
              </article>
              <article className="card admin-source-stat admin-source-tone-violet">
                <div className="admin-source-stat-icon"><Mail size={18} /></div>
                <div>
                  <p>通知邮箱</p>
                  <strong>{notifyEmails.length}</strong>
                  <span>{notifyEmails.filter((item) => item.verified).length} 个已验证</span>
                </div>
              </article>
              <article className="card admin-source-stat admin-source-tone-amber" data-testid="profile-overview-metric-member-since">
                <div className="admin-source-stat-icon"><CalendarDays size={18} /></div>
                <div>
                  <p>注册时间</p>
                  <strong>{memberSince}</strong>
                  <span>账户创建月份</span>
                </div>
              </article>
            </section>
          )}
          table={(
            <InnerTableSurface className="profile-workbench-surface" wrapperClassName="profile-workbench-wrapper">
              <div className="profile-main-grid">
                <div className="profile-main-column" data-testid="profile-main-column">
                  <section className="card admin-source-panel profile-section-panel" data-testid="profile-basics-panel">
                    <div className="admin-source-panel-head profile-panel-head">
                      <div>
                        <h3>资料与头像</h3>
                        <span>维护公开展示信息，并保持头像与昵称风格一致。</span>
                      </div>
                    </div>

                    <div className="profile-basics-grid">
                      <div className="profile-avatar-panel">
                        <div className="profile-avatar-preview">
                          {avatarPreview ? (
                            <img data-testid="profile-avatar-preview" src={avatarPreview} alt={displayName} />
                          ) : (
                            <div className="profile-default-avatar">
                              <span>{initials}</span>
                            </div>
                          )}
                        </div>
                        <div>
                          <h4>资料头像</h4>
                          <p>上传图片时会自动压缩静态图片到 20KB 以内，GIF 需自行控制在 20KB 以内</p>
                        </div>
                        <div className="profile-button-row">
                          <label className="btn btn-secondary btn-sm cursor-pointer">
                            <input
                              data-testid="profile-avatar-file-input"
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={handleAvatarFile}
                            />
                            <Upload size={14} />
                            上传图片
                          </label>
                          <Button
                            data-testid="profile-avatar-save"
                            type="button"
                            size="sm"
                            disabled={!avatarChanged && !avatarPreview}
                            onClick={handleAvatarSave}
                          >
                            保存
                          </Button>
                          <Button data-testid="profile-avatar-delete" type="button" size="sm" variant="outline" onClick={handleAvatarDelete}>
                            <Trash2 size={14} />
                            删除
                          </Button>
                        </div>
                      </div>

                      <form className="profile-edit-panel" onSubmit={handleProfileSubmit}>
                        <h4>编辑个人资料</h4>
                        <div className="profile-form-grid">
                          <div>
                            <Label htmlFor="profile-username" className="input-label">登录账号</Label>
                            <Input id="profile-username" value={user.username || ''} disabled />
                          </div>
                          <div>
                            <Label htmlFor="profile-nickname" className="input-label">用户名</Label>
                            <Input
                              id="profile-nickname"
                              value={profileForm.nickName}
                              placeholder="输入用户名"
                              onChange={(event) =>
                                setProfileForm((current) => ({ ...current, nickName: event.target.value }))
                              }
                              autoComplete="name"
                            />
                          </div>
                          <div>
                            <Label htmlFor="profile-email" className="input-label">邮箱</Label>
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
                          <div>
                            <Label htmlFor="profile-phone" className="input-label">手机号</Label>
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
                        <div className="profile-form-actions">
                          <Button type="submit" disabled={savingProfile}>
                            {savingProfile ? '更新中...' : '更新资料'}
                          </Button>
                        </div>
                      </form>
                    </div>
                  </section>

                  <section className="card admin-source-panel profile-section-panel" data-testid="profile-auth-bindings-panel">
                    <div className="admin-source-panel-head profile-panel-head">
                      <div>
                        <h3>登录方式绑定</h3>
                        <span>查看当前绑定状态，并将更多登录方式关联到这个账号。</span>
                      </div>
                    </div>

              <div className="profile-binding-list">
                {bindingRows.map((row) => (
                  <article key={row.provider} className="profile-binding-row">
                    <div className="profile-binding-main">
                      <div className={cn('profile-binding-icon', row.tone)}>
                        {row.icon || row.initial}
                      </div>
                      <div className="profile-binding-content">
                        <div className="profile-binding-title">
                          <h3>{row.label}</h3>
                          <span
                            data-testid={`profile-binding-${row.provider}-status`}
                            className={cn('badge', row.bound ? 'badge-success' : 'badge-gray')}
                          >
                            {row.bound ? '已绑定' : '未绑定'}
                          </span>
                        </div>
                        {row.value ? <p>{row.value}</p> : null}
                        {row.provider === 'email' && showEmailForm ? (
                          <div data-testid="profile-binding-email-form" className="profile-email-form">
                            <Input
                              data-testid="profile-binding-email-input"
                              type="email"
                              value={emailForm.email}
                              placeholder="邮箱地址"
                              onChange={(event) => setEmailForm((current) => ({ ...current, email: event.target.value }))}
                            />
                            <Button data-testid="profile-binding-email-send-code" type="button" variant="outline" size="sm" onClick={sendEmailCode}>
                              发送验证码
                            </Button>
                            <Input
                              data-testid="profile-binding-email-code-input"
                              value={emailForm.verifyCode}
                              inputMode="numeric"
                              maxLength={6}
                              placeholder="验证码"
                              onChange={(event) =>
                                setEmailForm((current) => ({ ...current, verifyCode: event.target.value.replace(/\D/g, '').slice(0, 6) }))
                              }
                            />
                            <Input
                              data-testid="profile-binding-email-password-input"
                              type="password"
                              value={emailForm.password}
                              placeholder="输入当前密码"
                              onChange={(event) => setEmailForm((current) => ({ ...current, password: event.target.value }))}
                            />
                            <Button
                              data-testid="profile-binding-email-submit"
                              type="button"
                              size="sm"
                              className="profile-email-submit"
                              onClick={submitEmailBinding}
                            >
                              更换主邮箱
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    </div>
                    <div className="profile-binding-actions">
                      {row.provider === 'email' ? (
                        <Button
                          data-testid="profile-binding-email-toggle"
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setShowEmailForm((current) => !current)}
                        >
                          {showEmailForm ? '收起邮箱表单' : '管理邮箱'}
                        </Button>
                      ) : null}
                      {row.canBind ? (
                        <Button data-testid={`profile-binding-${row.provider}-action`} type="button" size="sm">
                          绑定 {row.label}
                        </Button>
                      ) : null}
                      {row.canUnbind ? (
                        <Button data-testid={`profile-binding-${row.provider}-unbind`} type="button" variant="outline" size="sm">
                          解绑
                        </Button>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </div>

          <div className="profile-side-column" data-testid="profile-side-column">
            {accountSources.length > 0 ? (
              <section className="card admin-source-panel profile-section-panel">
                <div className="admin-source-panel-head profile-panel-head">
                  <div>
                    <h3>资料来源</h3>
                    <span>绑定账号会同步头像或用户名来源。</span>
                  </div>
                </div>
                <div className="profile-source-list">
                  {accountSources.map((source) => (
                    <div key={source.key}>
                      <Link2 size={15} />
                      <span>{source.text}</span>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            <section className="card admin-source-panel profile-contact-panel">
              <div className="profile-contact-icon">
                <MessageCircleMore size={20} />
              </div>
              <div>
                <h3>联系客服</h3>
                <p>{contactEmail}</p>
              </div>
            </section>

            <section className="card admin-source-panel profile-section-panel">
              <div className="admin-source-panel-head profile-panel-head">
                <div>
                  <h3>修改密码</h3>
                </div>
              </div>
              <form className="profile-password-form" onSubmit={handlePasswordSubmit}>
                <div>
                  <Label htmlFor="profile-old-password" className="input-label">当前密码</Label>
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
                <div>
                  <Label htmlFor="profile-new-password" className="input-label">新密码</Label>
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
                  <span className="input-hint">密码至少需要 8 个字符</span>
                </div>
                <div>
                  <Label htmlFor="profile-confirm-password" className="input-label">确认新密码</Label>
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
                <div className="profile-form-actions">
                  <Button type="submit" disabled={savingPassword}>
                    {savingPassword ? '更新中...' : '修改密码'}
                  </Button>
                </div>
              </form>
            </section>

            <section className="card admin-source-panel profile-section-panel">
              <div className="admin-source-panel-head profile-panel-head">
                <div>
                  <h3>余额不足提醒</h3>
                  <span>当账户余额低于阈值时发送邮件提醒</span>
                </div>
              </div>
              <div className="profile-notify-body">
                <div className="profile-notify-toggle">
                  <div>
                    <Label className="input-label">启用余额不足提醒</Label>
                  </div>
                  <ToggleSwitch
                    checked={notifyEnabled}
                    ariaLabel="启用余额不足提醒"
                    onChange={() => setNotifyEnabled((current) => !current)}
                  />
                </div>

                {notifyEnabled ? (
                  <>
                    <div>
                      <Label htmlFor="profile-notify-threshold" className="input-label">
                        自定义提醒阈值 <span>留空使用系统默认值</span>
                      </Label>
                      <div className="profile-threshold-row">
                        <span>$</span>
                        <Input
                          id="profile-notify-threshold"
                          type="number"
                          min="0"
                          step="0.01"
                          value={notifyThreshold}
                          placeholder="系统默认 $5"
                          onChange={(event) => setNotifyThreshold(Number(event.target.value))}
                        />
                        <Button type="button" size="sm">保存</Button>
                      </div>
                    </div>

                    <div>
                      <Label className="input-label">通知邮箱</Label>
                      <p className="profile-warning-text">必须添加并验证邮箱后，余额不足时才能收到提醒邮件</p>
                      <div className="profile-notify-list">
                        {notifyEmails.map((item) => (
                          <div key={item.email} className="profile-notify-email-row">
                            <div className="profile-notify-email-main">
                              <ToggleSwitch
                                small
                                checked={!item.disabled}
                                ariaLabel={`${item.email} 通知开关`}
                                onChange={() => toggleNotifyEmail(item.email)}
                              />
                              <span>{item.email}</span>
                            </div>
                            <div className="profile-notify-email-actions">
                              {item.verified ? (
                                <span className="profile-verified-text">已验证</span>
                              ) : verifyingEmail === item.email ? (
                                <>
                                  <Input
                                    value={verifyCode}
                                    maxLength={6}
                                    inputMode="numeric"
                                    className="profile-code-input"
                                    placeholder="验证码"
                                    onChange={(event) => setVerifyCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                                  />
                                  <button type="button" disabled={verifyCode.length !== 6 || verifyConfirming} onClick={() => confirmExistingVerify(item.email)}>
                                    验证
                                  </button>
                                  {verifyCountdown > 0 ? (
                                    <span>{verifyCountdown}s</span>
                                  ) : (
                                    <button type="button" disabled={verifySending} onClick={() => sendExistingVerifyCode(item.email)}>
                                      重发
                                    </button>
                                  )}
                                  <button type="button" onClick={cancelVerifyExisting}>取消</button>
                                </>
                              ) : (
                                <>
                                  <button type="button" disabled={verifySending} onClick={() => sendExistingVerifyCode(item.email)}>
                                    验证
                                  </button>
                                  <span className="profile-unverified-text">未验证</span>
                                </>
                              )}
                              <button type="button" className="is-danger" onClick={() => removeNotifyEmail(item.email)}>
                                移除
                              </button>
                            </div>
                          </div>
                        ))}

                        {pendingNotifyEmails.map((item, index) => (
                          <div key={item.email} className="profile-notify-pending-row">
                            <span>{item.email}</span>
                            {item.codeSent ? (
                              <div>
                                <Input
                                  value={item.code}
                                  maxLength={6}
                                  inputMode="numeric"
                                  className="profile-code-input"
                                  placeholder="验证码"
                                  onChange={(event) => updatePendingCode(index, event.target.value)}
                                />
                                <button type="button" disabled={item.code.length !== 6 || item.verifying} onClick={() => confirmPendingEmail(index)}>
                                  验证
                                </button>
                                {item.countdown > 0 ? (
                                  <span>{item.countdown}s</span>
                                ) : (
                                  <button type="button" disabled={item.sending} onClick={() => sendPendingCode(index)}>
                                    重发
                                  </button>
                                )}
                              </div>
                            ) : (
                              <div>
                                <button type="button" disabled={item.sending} onClick={() => sendPendingCode(index)}>
                                  发送验证码
                                </button>
                                <button type="button" className="is-danger" onClick={() => removePendingEmail(index)}>
                                  移除
                                </button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>

                      {canAddNotifyEmail ? (
                        <div className="profile-add-email-row">
                          <Input
                            type="email"
                            value={extraEmail}
                            placeholder="输入邮箱地址"
                            onChange={(event) => setExtraEmail(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') {
                                event.preventDefault();
                                addNotifyEmail();
                              }
                            }}
                          />
                          <Button type="button" variant="outline" disabled={!extraEmail.trim()} onClick={addNotifyEmail}>
                            添加
                          </Button>
                        </div>
                      ) : (
                        <p className="profile-muted-text">已达到通知邮箱数量上限</p>
                      )}
                    </div>
                  </>
                ) : null}
              </div>
            </section>

            <section className="card admin-source-panel profile-section-panel">
              <div className="admin-source-panel-head profile-panel-head">
                <div>
                  <h3>双因素认证 (2FA)</h3>
                  <span>使用 Google Authenticator 等应用增强账户安全</span>
                </div>
              </div>
              <div className="profile-2fa-row">
                <div className="profile-2fa-main">
                  <div>
                    <ShieldCheck size={24} />
                  </div>
                  <div>
                    <p>{totpEnabled ? '已启用' : '未启用'}</p>
                    <span>{totpEnabled ? '登录时需要认证器验证码' : '启用双因素认证可以增强账户安全性'}</span>
                  </div>
                </div>
                <Button
                  type="button"
                  variant={totpEnabled ? 'destructive' : 'default'}
                  onClick={() => (totpEnabled ? setShowTotpDisable(true) : setShowTotpSetup(true))}
                >
                  {totpEnabled ? '禁用' : '启用'}
                </Button>
              </div>
            </section>
          </div>
              </div>
            </InnerTableSurface>
          )}
        />
      </div>

      <BaseDialog
        open={showTotpSetup}
        title="设置双因素认证"
        description={setupSubtitle}
        onClose={closeSetup}
        width="narrow"
        bodyClassName="admin-dialog-stack"
      >
        {setupStep === 0 ? (
          <div className="admin-dialog-stack">
            <div className="admin-dialog-field">
              <Label htmlFor="profile-setup-password" className="input-label">当前密码</Label>
              <Input
                id="profile-setup-password"
                type="password"
                value={setupPassword}
                autoComplete="current-password"
                placeholder="输入当前密码"
                onChange={(event) => setSetupPassword(event.target.value)}
              />
            </div>
            <div className="admin-dialog-field">
              <Label className="input-label">邮箱验证码</Label>
              <div className="profile-dialog-code-row">
                <Input
                  value={setupEmailCode}
                  maxLength={6}
                  inputMode="numeric"
                  placeholder="输入邮箱验证码"
                  onChange={(event) => setSetupEmailCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                />
                <Button type="button" variant="outline" disabled={setupCountdown > 0} onClick={sendSetupCode}>
                  {setupCountdown > 0 ? `${setupCountdown}s` : '发送验证码'}
                </Button>
              </div>
            </div>
            <div className="profile-dialog-actions">
              <Button type="button" variant="outline" onClick={closeSetup}>取消</Button>
              <Button type="button" disabled={!setupReady} onClick={() => moveSetupStep(1)}>下一步</Button>
            </div>
          </div>
        ) : setupStep === 1 ? (
          <div className="admin-dialog-stack">
            <div className="profile-qr-wrap">
              <img src={qrDataUri} alt="QR Code" />
            </div>
            <div className="profile-secret-row">
              <p>无法扫码？手动输入密钥：</p>
              <div>
                <code>{setupSecret}</code>
                <Button type="button" size="icon" variant="ghost" aria-label="复制密钥" onClick={copySetupSecret}>
                  <Clipboard size={18} />
                </Button>
              </div>
            </div>
            <div className="profile-dialog-actions">
              <Button type="button" variant="outline" onClick={closeSetup}>取消</Button>
              <Button type="button" onClick={() => moveSetupStep(2)}>下一步</Button>
            </div>
          </div>
        ) : (
          <form className="admin-dialog-stack" onSubmit={confirmSetup}>
            <div className="admin-dialog-field profile-digit-group">
              <Label className="input-label">输入验证码</Label>
              <div>
                {setupDigits.map((digit, index) => (
                  <Input
                    key={index}
                    ref={(node) => {
                      digitRefs.current[index] = node;
                    }}
                    value={digit}
                    type="text"
                    maxLength={1}
                    inputMode="numeric"
                    pattern="[0-9]"
                    className="profile-digit-input"
                    onChange={(event) => handleSetupDigit(event.target.value, index)}
                    onKeyDown={(event) => handleSetupKeyDown(event, index)}
                    onPaste={handleSetupPaste}
                  />
                ))}
              </div>
            </div>
            <div className="profile-dialog-actions">
              <Button type="button" variant="outline" onClick={() => moveSetupStep(1)}>返回</Button>
              <Button type="submit" disabled={setupDigits.join('').length !== 6}>验证</Button>
            </div>
          </form>
        )}
      </BaseDialog>

      <BaseDialog
        open={showTotpDisable}
        title="禁用双因素认证"
        description="禁用后，登录时将不再需要验证码。这可能会降低您的账户安全性。"
        onClose={closeDisable}
        width="narrow"
        headerAside={<AlertTriangle size={18} className="text-rose-500" />}
        bodyClassName="admin-dialog-stack"
      >
        <form className="admin-dialog-stack" onSubmit={confirmDisable}>
          <div className="admin-dialog-field">
            <Label htmlFor="profile-disable-password" className="input-label">当前密码</Label>
            <Input
              id="profile-disable-password"
              type="password"
              value={disablePassword}
              autoComplete="current-password"
              placeholder="输入当前密码"
              onChange={(event) => setDisablePassword(event.target.value)}
            />
          </div>
          <div className="admin-dialog-field">
            <Label className="input-label">邮箱验证码</Label>
            <div className="profile-dialog-code-row">
              <Input
                value={disableCode}
                maxLength={6}
                inputMode="numeric"
                placeholder="输入邮箱验证码"
                onChange={(event) => setDisableCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
              />
              <Button type="button" variant="outline" disabled={disableCountdown > 0} onClick={sendDisableCode}>
                {disableCountdown > 0 ? `${disableCountdown}s` : '发送验证码'}
              </Button>
            </div>
          </div>
          <div className="profile-dialog-actions">
            <Button type="button" variant="outline" onClick={closeDisable}>取消</Button>
            <Button type="submit" variant="destructive" disabled={!disablePassword && disableCode.length !== 6}>
              确认关闭
            </Button>
          </div>
        </form>
      </BaseDialog>
    </section>
  );
};
