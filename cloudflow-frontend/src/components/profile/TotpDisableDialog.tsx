import React, { useEffect, useState } from 'react';
import { Loader2, ShieldOff } from 'lucide-react';
import { toast } from 'sonner';
import { BaseDialog, Button, Input, Label } from '@/components/common';
import { disableTotp } from '@/services/api/auth';
import './profile-totp.css';

interface TotpDisableDialogProps {
  open: boolean;
  onClose: () => void;
  onDisabled: () => void;
}

export const TotpDisableDialog: React.FC<TotpDisableDialogProps> = ({ open, onClose, onDisabled }) => {
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setPassword('');
    setError('');
  }, [open]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!password) return;

    setSubmitting(true);
    setError('');
    try {
      await disableTotp(password);
      toast.success('双因素认证已禁用');
      onDisabled();
      onClose();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '禁用失败，请检查当前密码');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!submitting) onClose();
  };

  return (
    <BaseDialog
      open={open}
      title="禁用双因素认证"
      onClose={handleClose}
      width="narrow"
      panelClassName="profile-totp-dialog"
      footer={(
        <>
          <Button type="button" variant="outline" onClick={handleClose} disabled={submitting}>取消</Button>
          <Button type="submit" form="profile-totp-disable-form" variant="destructive" disabled={!password || submitting}>
            {submitting ? <Loader2 size={16} className="profile-totp-spin" /> : <ShieldOff size={16} />}
            {submitting ? '处理中' : '确认禁用'}
          </Button>
        </>
      )}
    >
      <form id="profile-totp-disable-form" className="profile-totp-form" onSubmit={handleSubmit}>
        <p className="profile-totp-warning">禁用后，登录时将不再校验动态验证码，账户安全性会降低。</p>
        <div>
          <Label htmlFor="profile-totp-disable-password" className="input-label">当前密码</Label>
          <Input
            id="profile-totp-disable-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            disabled={submitting}
            data-autofocus
            required
          />
        </div>
        {error ? <p className="profile-totp-error" role="alert">{error}</p> : null}
      </form>
    </BaseDialog>
  );
};
