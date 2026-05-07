import React, { useState } from 'react';
import { toast } from 'sonner';
import { BaseDialog, Button, Input, Label } from '@/components/common';
import { changeProfilePassword } from '@/services/api/auth';

interface ForcePasswordChangeDialogProps {
  open: boolean;
  onChanged: () => Promise<void>;
  onLogout: () => Promise<void>;
}

export const ForcePasswordChangeDialog: React.FC<ForcePasswordChangeDialogProps> = ({
  open,
  onChanged,
  onLogout,
}) => {
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!oldPassword.trim() || !newPassword.trim()) {
      toast.error('请完整填写密码');
      return;
    }
    if (newPassword.length < 6) {
      toast.error('新密码至少 6 位');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('两次输入的新密码不一致');
      return;
    }

    setSaving(true);
    try {
      await changeProfilePassword(oldPassword, newPassword);
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
      await onChanged();
      toast.success('密码已更新');
    } finally {
      setSaving(false);
    }
  };

  return (
    <BaseDialog
      open={open}
      title="首次登录需修改密码"
      description="当前账号使用初始密码，完成修改后才能继续访问系统。"
      onClose={() => {}}
      closeOnClickOutside={false}
      closeOnEscape={false}
      hideCloseButton
      maxWidthClassName="max-w-md"
      footer={
        <div className="flex w-full justify-between gap-3">
          <Button variant="outline" onClick={() => void onLogout()} disabled={saving}>
            退出登录
          </Button>
          <Button type="submit" form="force-password-change-form" disabled={saving}>
            {saving ? '提交中...' : '更新密码'}
          </Button>
        </div>
      }
    >
      <form id="force-password-change-form" onSubmit={submit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="force-password-old">当前密码</Label>
          <Input
            id="force-password-old"
            type="password"
            value={oldPassword}
            onChange={(event) => setOldPassword(event.target.value)}
            autoComplete="current-password"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="force-password-new">新密码</Label>
          <Input
            id="force-password-new"
            type="password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            autoComplete="new-password"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="force-password-confirm">确认新密码</Label>
          <Input
            id="force-password-confirm"
            type="password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            autoComplete="new-password"
            required
          />
        </div>
      </form>
    </BaseDialog>
  );
};
