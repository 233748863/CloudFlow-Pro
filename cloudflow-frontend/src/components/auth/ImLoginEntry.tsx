import React, { useEffect, useRef, useState } from 'react';
import { Loader2, MessageCircle } from 'lucide-react';
import { Button } from '@/components/common';
import { imLoginAuthorize, imLoginAvailability, imLoginSecure, imProviderDestination, type ImLoginAvailability } from '@/services/api/imLogin';

interface ImLoginEntryProps {
  tenantCode: string;
  legalReleaseCode: string;
  disabled: boolean;
}

export const ImLoginEntry: React.FC<ImLoginEntryProps> = ({ tenantCode, legalReleaseCode, disabled }) => {
  const [availability, setAvailability] = useState<{ tenantCode: string; value: ImLoginAvailability } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const active = useRef<AbortController | null>(null);
  const purpose = /wxwork/i.test(navigator.userAgent) ? 'EMBEDDED_LOGIN' : 'SCAN_LOGIN';

  useEffect(() => {
    const controller = new AbortController();
    setAvailability(null);
    setError('');
    setBusy(false);
    if (tenantCode && imLoginSecure()) {
      void imLoginAvailability(tenantCode, controller.signal).then((value) => {
        if (!controller.signal.aborted) setAvailability({ tenantCode, value });
      }).catch(() => {
        if (!controller.signal.aborted) setAvailability({ tenantCode, value: { enabled: false, message: '企业微信登录暂不可用，请使用原账号登录' } });
      });
    }
    return () => { controller.abort(); active.current?.abort(); };
  }, [tenantCode]);

  useEffect(() => {
    if (disabled) { active.current?.abort(); setBusy(false); }
  }, [disabled]);

  const current = availability?.tenantCode === tenantCode ? availability.value : null;
  const enabled = imLoginSecure() && current?.enabled === true && !disabled && Boolean(legalReleaseCode) && !busy;
  const start = async () => {
    if (!enabled || active.current && !active.current.signal.aborted) return;
    const controller = new AbortController();
    active.current = controller;
    setBusy(true);
    setError('');
    try {
      const grant = await imLoginAuthorize(tenantCode, purpose, legalReleaseCode, controller.signal);
      if (!controller.signal.aborted) window.location.assign(imProviderDestination(grant.authorizationUrl, purpose));
    } catch {
      if (!controller.signal.aborted) setError('企业微信登录未能发起，请确认套餐与配置后重试；也可使用原账号登录');
    } finally {
      if (active.current === controller) { active.current = null; setBusy(false); }
    }
  };

  const hint = !imLoginSecure() ? '企业微信登录需通过本系统HTTPS页面使用'
    : !tenantCode ? '选择租户后检查企业微信登录状态'
      : !current ? '正在检查企业微信登录状态'
        : !current.enabled ? current.message
          : disabled ? '同意当前条款后可使用企业微信登录' : '仅限已绑定企业微信的员工，随“我的通信绑定”功能启用';

  return (
    <div className="cf-auth-im-entry">
      <Button type="button" variant="outline" className="cf-auth-im-button" disabled={!enabled} onClick={() => void start()} aria-describedby="im-login-status">
        {busy ? <Loader2 size={16} className="cf-auth-spin" /> : <MessageCircle size={16} />}
        {busy ? '正在前往企业微信' : purpose === 'EMBEDDED_LOGIN' ? '企业微信登录' : '企业微信扫码登录'}
      </Button>
      <p id="im-login-status" className="cf-auth-hint" role="status">{error || hint}</p>
    </div>
  );
};
