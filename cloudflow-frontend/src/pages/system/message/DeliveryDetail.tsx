import { useEffect, useState } from 'react';
import { Button, Input, PermissionGuard } from '@/components/common';
import { getMessageDelivery, resolveMessageDelivery } from '@/services/api/message';
import type { MessageDelivery } from '@/services/api/message';
import { getErrorMessage } from '@/utils/errorMessage';
import { InfrastructureDetailField, InfrastructureDialogPanel, InfrastructureField, InfrastructureSelect } from '../_components/InfrastructurePrimitives';
import { SEND_STATUS_LABELS, SKIP_REASON_LABELS } from './options';

export function DeliveryDetail({ deliveryId, onResolved }: { deliveryId: number; onResolved: (status: 'SUCCESS' | 'FAILED') => void }) {
  const [delivery, setDelivery] = useState<MessageDelivery | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const [conclusion, setConclusion] = useState<'ACCEPTED' | 'NOT_ACCEPTED'>('ACCEPTED');
  const [evidence, setEvidence] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setDelivery(null);
    setError('');
    setPassword('');
    setTotpCode('');
    getMessageDelivery(deliveryId).then((result) => { if (active) setDelivery(result); })
      .catch((reason: unknown) => { if (active) setError(getErrorMessage(reason, '投递详情读取失败')); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [deliveryId, revision]);

  const resolve = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!delivery || busy) return;
    setBusy(true);
    setError('');
    try {
      const updated = await resolveMessageDelivery(deliveryId, {
        version: delivery.version, conclusion, evidence: evidence.trim(), password, totpCode: totpCode || undefined,
      });
      setDelivery(updated);
      setPassword('');
      setTotpCode('');
      onResolved(updated.status === 'SENT' ? 'SUCCESS' : 'FAILED');
    } catch (reason) {
      setError(getErrorMessage(reason, '核验结论保存失败；保留填写内容，请核对后重试'));
    } finally { setBusy(false); }
  };

  return <InfrastructureDialogPanel title="外部投递核验">
    {loading && <p role="status" className="text-sm text-cf-muted">正在读取实际投递状态…</p>}
    {error && <div role="alert" className="space-y-2 text-sm text-cf-muted"><p>{error}</p>
      <Button variant="outline" className="!min-h-[44px]" disabled={busy || loading} onClick={() => setRevision((value) => value + 1)}>重新读取状态</Button>
    </div>}
    {delivery && <div className="space-y-4" aria-busy={busy}>
      <p className="text-sm text-cf-muted">外部接纳仅表示对方服务器已接收，不代表最终送达或已读；结果未确认时禁止直接重发。</p>
      <div className="admin-message-detail-grid">
        <InfrastructureDetailField label="投递编号" value={String(delivery.deliveryId)} />
        <InfrastructureDetailField label="实际状态" value={delivery.status === 'SENT' ? '外部已接纳' : SEND_STATUS_LABELS[delivery.status]} />
        <InfrastructureDetailField label="尝试次数" value={String(delivery.attemptCount)} />
        <InfrastructureDetailField label="开始外发" value={delivery.sendStartedTime} />
        <InfrastructureDetailField label="确认接纳" value={delivery.acceptedTime} />
        <InfrastructureDetailField label="下次安全尝试" value={delivery.nextAttemptTime} />
        <InfrastructureDetailField label="处理原因" value={delivery.lastErrorCode ? SKIP_REASON_LABELS[delivery.lastErrorCode] || delivery.lastErrorCode : undefined} />
        {delivery.resolutionReason && <InfrastructureDetailField label="核验依据" value={delivery.resolutionReason} />}
      </div>
      {delivery.status === 'UNKNOWN' && <PermissionGuard permissions={['system:message:record:resend']} hidden>
        <form className="space-y-4 rounded-md border p-4" onSubmit={(event) => void resolve(event)}>
          <InfrastructureField label="服务商核验结论">
            <InfrastructureSelect className="!min-h-[44px]" aria-label="服务商核验结论" disabled={busy} value={conclusion} options={[{ value: 'ACCEPTED', label: '核验已接纳，保留原记录' }, { value: 'NOT_ACCEPTED', label: '核验未接纳，允许另行重发' }]}
              onValueChange={(value) => setConclusion(value as 'ACCEPTED' | 'NOT_ACCEPTED')} />
          </InfrastructureField>
          <InfrastructureField label="核验依据" hint="填写服务商查询编号、查询时间和结果，至少10字；请勿填写密钥或完整邮箱。">
            <textarea aria-label="核验依据" className="min-h-24 w-full rounded-md border bg-cf-surface px-3 py-2 text-sm text-cf-title" required minLength={10} maxLength={1000}
              value={evidence} disabled={busy} onChange={(event) => setEvidence(event.target.value)} />
          </InfrastructureField>
          <div className="grid gap-3 md:grid-cols-2">
            <InfrastructureField label="当前账号密码"><Input aria-label="当前账号密码" className="!min-h-[44px]" type="password" autoComplete="current-password" required maxLength={256}
              value={password} disabled={busy} onChange={(event) => setPassword(event.target.value)} /></InfrastructureField>
            <InfrastructureField label="动态口令" hint="账号已启用双重验证时必填。"><Input aria-label="动态口令" className="!min-h-[44px]" inputMode="numeric" autoComplete="one-time-code" maxLength={10}
              value={totpCode} disabled={busy} onChange={(event) => setTotpCode(event.target.value)} /></InfrastructureField>
          </div>
          <p className="text-sm text-cf-muted">保存核验结论不会发送消息；确认未接纳后，须从失败记录另行发起重发。</p>
          <Button type="submit" className="!min-h-[44px]" disabled={busy || evidence.trim().length < 10 || !password}>{busy ? '正在核验…' : '确认并保存核验结论'}</Button>
        </form>
      </PermissionGuard>}
    </div>}
  </InfrastructureDialogPanel>;
}
