import React, { useEffect, useMemo, useState } from 'react';
import {
  Building2,
  BriefcaseBusiness,
  CalendarDays,
  IdCard,
  KeyRound,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';
import { Button, DefaultAvatar, Input, Label } from '@/components/common';
import { ProfileTotpCard } from '@/components/profile/ProfileTotpCard';
import { InnerTableSurface, TablePageLayout } from '@/components/layout/TablePageLayout';
import { changeProfilePassword, updateProfile } from '@/services/api/auth';
import { cn } from '@/utils/cn';
import './ProfilePage.css';

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

// 权限字符串形如 `模块:实体:动作`（如 crm:customer:list），按模块前缀归组展示。
const permissionModuleLabels: Record<string, string> = {
  crm: '客户经营',
  workflow: '流程中心',
  wf: '流程中心',
  system: '系统管理',
  sys: '系统管理',
  hr: '人力资源',
  oa: '办公协同',
  cloudflow: '平台运维',
  monitor: '系统监控',
  event: '事件中心',
  ratelimit: '限流治理',
  acl: '访问控制',
};

const getPermissionModuleLabel = (moduleKey: string) =>
  permissionModuleLabels[moduleKey] || moduleKey.toUpperCase();

type PermissionGroup = {
  key: string;
  label: string;
  items: string[];
};

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

  const displayName = user?.name || user?.username || 'CloudFlow';
  const statusMeta = getStatusMeta(user?.status);
  const roleLabel = getRoleLabel(String(user?.role || ''));
  const memberSince = formatDate(user?.createTime);
  const contactEmail = formatValue(user?.email);
  const avatarPreview = user?.avatar || '';

  const orgTiles = useMemo(
    () => [
      {
        key: 'tenant',
        tone: 'admin-source-tone-violet',
        icon: <Building2 size={18} />,
        label: '所属租户',
        value: formatValue(user?.tenantName),
        hint: '当前登录的组织',
      },
      {
        key: 'dept',
        tone: 'admin-source-tone-blue',
        icon: <UserRound size={18} />,
        label: '所属部门',
        value: formatValue(user?.deptName),
        hint: '组织架构归属',
      },
      {
        key: 'position',
        tone: 'admin-source-tone-green',
        icon: <BriefcaseBusiness size={18} />,
        label: '岗位职位',
        value: formatValue(user?.position),
        hint: '当前担任岗位',
      },
      {
        key: 'joined',
        tone: 'admin-source-tone-amber',
        icon: <CalendarDays size={18} />,
        label: '入职时间',
        value: memberSince,
        hint: '账户创建月份',
      },
    ],
    [user?.tenantName, user?.deptName, user?.position, memberSince],
  );

  const permissionGroups = useMemo<PermissionGroup[]>(() => {
    const permissions = user?.permissions || [];
    const map = new Map<string, string[]>();

    permissions.forEach((permission) => {
      const normalized = String(permission || '').trim();
      if (!normalized || normalized === '*:*:*') {
        return;
      }
      const moduleKey = normalized.split(':')[0] || 'other';
      const list = map.get(moduleKey) || [];
      list.push(normalized);
      map.set(moduleKey, list);
    });

    return Array.from(map.entries())
      .map(([key, items]) => ({
        key,
        label: getPermissionModuleLabel(key),
        items: items.sort((a, b) => a.localeCompare(b)),
      }))
      .sort((a, b) => b.items.length - a.items.length);
  }, [user?.permissions]);

  const isSuperAdmin = (user?.permissions || []).includes('*:*:*');
  const totalPermissions = (user?.permissions || []).filter((item) => item && item !== '*:*:*').length;

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

  if (!user) {
    return null;
  }

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
                    <IdCard className="admin-source-context-icon" />
                    <strong>工号</strong>
                    <em>{formatValue(user.username)}</em>
                  </span>
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
                </div>
              </div>

              <div className="admin-source-controls profile-account-actions">
                <div className="profile-header-avatar">
                  {avatarPreview ? (
                    <img src={avatarPreview} alt={displayName} />
                  ) : (
                    <DefaultAvatar label={displayName} size="md" />
                  )}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => document.getElementById('profile-nickname')?.focus()}
                >
                  编辑资料
                </Button>
              </div>
            </header>
          )}
          filters={(
            <section className="admin-source-stat-grid profile-overview-stat-grid">
              {orgTiles.map((tile) => (
                <article key={tile.key} className={cn('card admin-source-stat', tile.tone)}>
                  <div className="admin-source-stat-icon">{tile.icon}</div>
                  <div>
                    <p>{tile.label}</p>
                    <strong>{tile.value}</strong>
                    <span>{tile.hint}</span>
                  </div>
                </article>
              ))}
            </section>
          )}
          table={(
            <InnerTableSurface className="profile-workbench-surface" wrapperClassName="profile-workbench-wrapper">
              <div className="profile-main-grid">
                <div className="profile-main-column" data-testid="profile-main-column">
                  <section className="card admin-source-panel profile-section-panel" data-testid="profile-basics-panel">
                    <div className="admin-source-panel-head profile-panel-head">
                      <div>
                        <h3>编辑个人资料</h3>
                        <span>维护展示信息，修改后点击更新即可生效。</span>
                      </div>
                    </div>

                    <form className="profile-edit-panel" onSubmit={handleProfileSubmit}>
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
                  </section>

                  <section className="card admin-source-panel profile-section-panel" data-testid="profile-permissions-panel">
                    <div className="admin-source-panel-head profile-panel-head">
                      <div>
                        <h3>权限概览</h3>
                        <span>
                          {isSuperAdmin
                            ? '当前账号为超级管理员，拥有全部功能权限。'
                            : `当前账号共拥有 ${totalPermissions} 项功能权限，按模块归类如下。`}
                        </span>
                      </div>
                    </div>

                    {isSuperAdmin ? (
                      <div className="profile-perm-super">
                        <KeyRound size={18} />
                        <span>超级管理员（*:*:*）· 不受模块权限限制</span>
                      </div>
                    ) : permissionGroups.length > 0 ? (
                      <div className="profile-perm-grid">
                        {permissionGroups.map((group) => (
                          <article key={group.key} className="profile-perm-card">
                            <header className="profile-perm-card-head">
                              <span className="profile-perm-module">{group.label}</span>
                              <span className="profile-perm-count">{group.items.length}</span>
                            </header>
                            <div className="profile-perm-chip-row">
                              {group.items.map((item) => (
                                <span key={item} className="profile-perm-chip" data-tooltip={item}>
                                  {item.split(':').slice(1).join(':') || item}
                                </span>
                              ))}
                            </div>
                          </article>
                        ))}
                      </div>
                    ) : (
                      <p className="profile-muted-text">当前账号暂未分配功能权限。</p>
                    )}
                  </section>
                </div>

                <div className="profile-side-column" data-testid="profile-side-column">
                  <section className="card admin-source-panel profile-section-panel">
                    <div className="admin-source-panel-head profile-panel-head">
                      <div>
                        <h3>修改密码</h3>
                        <span>定期更新密码以保障账户安全。</span>
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
                        <span className="input-hint">密码至少需要 8 个字符，仅限字母或数字</span>
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
                  <ProfileTotpCard />
                </div>
              </div>
            </InnerTableSurface>
          )}
        />
      </div>
    </section>
  );
};
