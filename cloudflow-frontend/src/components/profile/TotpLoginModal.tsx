import React, { useEffect, useState } from 'react';
import { Check, Loader2, ShieldCheck } from 'lucide-react';
import { BaseDialog, Button, Input } from '@/components/common';
import './profile-totp.css';

interface TotpLoginModalProps {
  open: boolean;
  userEmailMasked?: string;
  submitting: boolean;
  error?: string;
  onClose: () => void;
  onVerify: (code: string) => void;
}

export const TotpLoginModal: React.FC<TotpLoginModalProps> = ({
  open,
  userEmailMasked,
  submitting,
  error,
  onClose,
  onVerify,
}) => {
  const [code, setCode] = useState('');

  useEffect(() => {
    if (open) setCode('');
  }, [open]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (/^\d{6}$/.test(code) && !submitting) onVerify(code);
  };

  return (
    <BaseDialog
      open={open}
      title="双因素认证"
      description="请输入认证器应用当前显示的六位动态码。"
      onClose={onClose}
      width="narrow"
      panelClassName="profile-totp-dialog profile-totp-login-dialog"
      footer={(
        <>
          <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>取消登录</Button>
          <Button type="submit" form="totp-login-form" disabled={!/^\d{6}$/.test(code) || submitting}>
            {submitting ? <Loader2 size={16} className="profile-totp-spin" /> : <Check size={16} />}
            {submitting ? '验证中' : '验证'}
          </Button>
        </>
      )}
    >
      <form id="totp-login-form" className="profile-totp-login-form" onSubmit={submit}>
        <span className="profile-totp-login-icon"><ShieldCheck size={24} /></span>
        {userEmailMasked ? <p className="profile-totp-login-account">当前账户：{userEmailMasked}</p> : null}
        <Input
          value={code}
          onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
          className="profile-totp-code-input"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          aria-label="六位动态验证码"
          disabled={submitting}
          data-autofocus
        />
        {error ? <p className="profile-totp-error" role="alert">{error}</p> : null}
      </form>
    </BaseDialog>
  );
};
