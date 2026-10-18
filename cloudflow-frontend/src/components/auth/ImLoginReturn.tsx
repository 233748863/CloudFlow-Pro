import React, { useEffect, useRef, useState } from 'react';
import { TotpLoginModal } from '@/components/profile/TotpLoginModal';
import { Button } from '@/components/common';
import { imLocalDestination, imLoginVerify } from '@/services/api/imLogin';

export const ImLoginReturn: React.FC = () => {
  const [submitting, setSubmitting] = useState(false);
  const [failed, setFailed] = useState(false);
  const active = useRef<AbortController | null>(null);

  useEffect(() => () => active.current?.abort(), []);

  const back = () => {
    if (!active.current) window.location.replace('/login');
  };

  const verify = async (code: string) => {
    if (active.current || failed || !/^\d{6}$/.test(code)) return;
    const controller = new AbortController();
    active.current = controller;
    setSubmitting(true);
    try {
      const result = await imLoginVerify(code, controller.signal);
      if (!controller.signal.aborted) window.location.replace(imLocalDestination(result.redirectUrl));
    } catch {
      if (!controller.signal.aborted) setFailed(true);
    } finally {
      if (!controller.signal.aborted) { active.current = null; setSubmitting(false); }
    }
  };

  return (
    <main className="cf-auth-page cf-auth-im-return">
      {failed ? (
        <section className="cf-auth-im-result" aria-labelledby="im-login-result">
          <h1 id="im-login-result">企业微信登录未完成</h1>
          <p role="alert">动态码验证未通过或登录已失效，请返回重新发起；也可使用原账号登录。</p>
          <Button type="button" onClick={back}>返回登录页</Button>
        </section>
      ) : (
        <TotpLoginModal open submitting={submitting} onClose={back} onVerify={(code) => void verify(code)} />
      )}
    </main>
  );
};
