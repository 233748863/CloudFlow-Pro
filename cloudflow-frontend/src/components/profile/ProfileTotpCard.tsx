import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, RefreshCcw, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/common';
import { getTotpStatus, type TotpStatus } from '@/services/api/auth';
import { TotpDisableDialog } from './TotpDisableDialog';
import { TotpSetupModal } from './TotpSetupModal';
import './profile-totp.css';

const initialStatus: TotpStatus = { featureEnabled: false, enabled: false, enabledAt: null };

const formatEnabledAt = (value?: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', { hour12: false });
};

export const ProfileTotpCard: React.FC = () => {
  const [status, setStatus] = useState<TotpStatus>(initialStatus);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [setupOpen, setSetupOpen] = useState(false);
  const [disableOpen, setDisableOpen] = useState(false);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setStatus(await getTotpStatus());
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '安全状态加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  return (
    <section className="card admin-source-panel profile-section-panel profile-totp-card" data-testid="profile-totp-card">
      <div className="profile-totp-card-head">
        <div className="profile-totp-title">
          <span className="profile-totp-icon"><ShieldCheck size={18} /></span>
          <div>
            <h3>双因素认证</h3>
            <p>使用认证器动态码保护账户登录。</p>
          </div>
        </div>
        {!loading && !error && status.featureEnabled ? (
          <span className={status.enabled ? 'badge badge-success' : 'badge badge-gray'}>
            {status.enabled ? '已启用' : '未启用'}
          </span>
        ) : null}
      </div>

      {loading ? (
        <div className="profile-totp-state"><Loader2 size={18} className="profile-totp-spin" /><span>正在读取安全状态</span></div>
      ) : error ? (
        <div className="profile-totp-state is-error">
          <span>{error}</span>
          <Button type="button" variant="ghost" size="icon" onClick={loadStatus} title="重新加载" aria-label="重新加载">
            <RefreshCcw size={16} />
          </Button>
        </div>
      ) : !status.featureEnabled ? (
        <div className="profile-totp-card-actions">
          <p>管理员尚未配置双因素认证加密密钥。</p>
          <Button type="button" variant="outline" disabled>功能未开放</Button>
        </div>
      ) : status.enabled ? (
        <div className="profile-totp-card-actions">
          <p>{status.enabledAt ? `启用时间：${formatEnabledAt(status.enabledAt)}` : '当前登录已受动态验证码保护。'}</p>
          <Button type="button" variant="outline" onClick={() => setDisableOpen(true)}>禁用</Button>
        </div>
      ) : (
        <div className="profile-totp-card-actions">
          <p>启用后，每次登录都需要输入认证器中的六位动态码。</p>
          <Button type="button" onClick={() => setSetupOpen(true)}>启用</Button>
        </div>
      )}

      <TotpSetupModal open={setupOpen} onClose={() => setSetupOpen(false)} onEnabled={loadStatus} />
      <TotpDisableDialog open={disableOpen} onClose={() => setDisableOpen(false)} onDisabled={loadStatus} />
    </section>
  );
};
