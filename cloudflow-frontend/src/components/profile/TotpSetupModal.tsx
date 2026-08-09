import React, { useEffect, useState } from 'react';
import { Check, Copy, KeyRound, Loader2, QrCode } from 'lucide-react';
import QRCode from 'qrcode';
import { toast } from 'sonner';
import { BaseDialog, Button, Input, Label } from '@/components/common';
import { enableTotp, setupTotp } from '@/services/api/auth';
import './profile-totp.css';

interface TotpSetupModalProps {
  open: boolean;
  onClose: () => void;
  onEnabled: () => void;
}

const normalizeCode = (value: string) => value.replace(/\D/g, '').slice(0, 6);

export const TotpSetupModal: React.FC<TotpSetupModalProps> = ({ open, onClose, onEnabled }) => {
  const [stage, setStage] = useState<'password' | 'scan'>('password');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [secret, setSecret] = useState('');
  const [qrCode, setQrCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState('');
  const [regenerated, setRegenerated] = useState(false);

  useEffect(() => {
    if (!open) return;
    setStage('password');
    setPassword('');
    setCode('');
    setSecret('');
    setQrCode('');
    setError('');
    setRegenerated(false);
  }, [open]);

  const handleClose = () => {
    if (!loading && !verifying) onClose();
  };

  const handlePrepare = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!password) return;

    setLoading(true);
    setError('');
    try {
      const setup = await setupTotp(password);
      const image = await QRCode.toDataURL(setup.otpAuthUri, {
        width: 192,
        margin: 1,
        errorCorrectionLevel: 'M',
        color: { dark: '#0f172a', light: '#ffffff' },
      });
      setSecret(setup.manualEntryKey);
      setQrCode(image);
      setRegenerated(Boolean(setup.regenerated));
      setStage('scan');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '获取设置信息失败');
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!/^\d{6}$/.test(code)) return;

    setVerifying(true);
    setError('');
    try {
      await enableTotp(password, code);
      toast.success('双因素认证已启用');
      onEnabled();
      onClose();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '验证码错误，请重试');
    } finally {
      setVerifying(false);
    }
  };

  const copySecret = async () => {
    try {
      await navigator.clipboard.writeText(secret);
      toast.success('密钥已复制');
    } catch {
      // 非 HTTPS 或用户拒绝剪贴板权限时会走到这里，不能让按钮看起来「点了没反应」
      toast.error('复制失败，请手动选中密钥复制');
    }
  };

  return (
    <BaseDialog
      open={open}
      title="设置双因素认证"
      description={stage === 'password' ? '验证当前密码后生成专属认证密钥。' : '将认证器与当前账户绑定。'}
      onClose={handleClose}
      width="narrow"
      panelClassName="profile-totp-dialog"
      footer={stage === 'password' ? (
        <>
          <Button type="button" variant="outline" onClick={handleClose} disabled={loading}>取消</Button>
          <Button type="submit" form="profile-totp-password-form" disabled={!password || loading}>
            {loading ? <Loader2 size={16} className="profile-totp-spin" /> : <KeyRound size={16} />}
            {loading ? '验证中' : '继续'}
          </Button>
        </>
      ) : (
        <>
          <Button type="button" variant="outline" onClick={handleClose} disabled={verifying}>取消</Button>
          <Button type="submit" form="profile-totp-verify-form" disabled={!/^\d{6}$/.test(code) || verifying}>
            {verifying ? <Loader2 size={16} className="profile-totp-spin" /> : <Check size={16} />}
            {verifying ? '验证中' : '验证并启用'}
          </Button>
        </>
      )}
    >
      {stage === 'password' ? (
        <form id="profile-totp-password-form" className="profile-totp-form" onSubmit={handlePrepare}>
          <div>
            <Label htmlFor="profile-totp-password" className="input-label">当前密码</Label>
            <Input
              id="profile-totp-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={loading}
              data-autofocus
              required
            />
          </div>
          {error ? <p className="profile-totp-error" role="alert">{error}</p> : null}
        </form>
      ) : (
        <form id="profile-totp-verify-form" className="profile-totp-form" onSubmit={handleVerify}>
          {regenerated ? (
            <p className="profile-totp-notice" role="status">
              已重新生成密钥，此前未完成绑定的二维码作废，请以本次二维码为准。
            </p>
          ) : null}
          <div className="profile-totp-setup-step">
            <div className="profile-totp-step-head">
              <span>1</span>
              <div>
                <strong>扫描二维码</strong>
                <p>使用 Google Authenticator 或其他认证器应用。</p>
              </div>
            </div>
            <div className="profile-totp-qr">
              {qrCode ? <img src={qrCode} alt="双因素认证二维码" /> : <QrCode size={40} />}
            </div>
            <div className="profile-totp-secret-row">
              <code>{secret}</code>
              <Button type="button" variant="ghost" size="icon" onClick={copySecret} title="复制密钥" aria-label="复制密钥">
                <Copy size={16} />
              </Button>
            </div>
          </div>

          <div className="profile-totp-setup-step">
            <div className="profile-totp-step-head">
              <span>2</span>
              <div>
                <strong>输入验证码</strong>
                <p>填写认证器应用当前显示的六位数字。</p>
              </div>
            </div>
            <Input
              value={code}
              onChange={(event) => setCode(normalizeCode(event.target.value))}
              className="profile-totp-code-input"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              aria-label="六位验证码"
              disabled={verifying}
              data-autofocus
            />
          </div>
          {error ? <p className="profile-totp-error" role="alert">{error}</p> : null}
        </form>
      )}
    </BaseDialog>
  );
};
