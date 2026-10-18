import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, RefreshCw, Save } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Input, LoadingSpinner, PermissionGuard, Switch } from '@/components/common';
import { useAuth } from '@/context/AuthContext';
import { listMySubscriptions, saveMySubscriptions } from '@/services/api/message';
import type { MessageChannelType, MessageSubscription } from '@/services/api/message';
import { getErrorMessage } from '@/utils/errorMessage';
import { InfrastructureField, InfrastructurePageHeader, InfrastructureSelect } from '../_components/InfrastructurePrimitives';
import { CATEGORY_LABELS, CHANNEL_LABELS } from './options';

export default function MessageSubscribePage() {
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('system:message:subscribe:edit');
  const [settings, setSettings] = useState<MessageSubscription[]>([]);
  const [channel, setChannel] = useState<MessageChannelType>('INTERNAL');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    listMySubscriptions().then((result) => {
      if (!active) return;
      setSettings(result);
      setChannel((current) => result.some((item) => item.channelType === current) ? current : result[0]?.channelType || 'INTERNAL');
    })
      .catch((reason: unknown) => { if (active) setError(getErrorMessage(reason, '读取订阅失败')); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [revision]);

  const update = (target: MessageSubscription, changes: Partial<MessageSubscription>) => {
    if (!canEdit || saving) return;
    setSettings((current) => current.map((item) => item.channelType === target.channelType && item.messageCategory === target.messageCategory ? { ...item, ...changes } : item));
  };

  const save = async () => {
    if (!canEdit || saving || loading || error || !settings.length) return;
    if (settings.some((item) => Boolean(item.quietStart) !== Boolean(item.quietEnd))) {
      toast.error('免打扰开始与结束时间须同时填写，或同时清空');
      return;
    }
    setSaving(true);
    try {
      await saveMySubscriptions(settings.map((item) => ({ ...item, quietStart: item.quietStart || null, quietEnd: item.quietEnd || null })));
      toast.success('消息订阅已保存');
    } catch (reason) { toast.error(getErrorMessage(reason, '保存订阅失败')); }
    finally { setSaving(false); }
  };

  const channels = Array.from(new Set(settings.map((item) => item.channelType)));
  return (
    <div className="admin-source-page space-y-5">
      <InfrastructurePageHeader kicker="MESSAGE SUBSCRIPTIONS" title="订阅与免打扰" description="按分类选择接收消息的方式；安全告警等强制通知仍会送达。">
        <Button variant="outline" size="sm" onClick={() => navigate('/message/mine')}><ArrowLeft size={16} />我的消息</Button>
        <Button variant="outline" size="sm" disabled={loading || saving} onClick={() => setRevision((value) => value + 1)}><RefreshCw size={16} />重新加载</Button>
        <PermissionGuard permissions={['system:message:subscribe:edit']} hidden><Button size="sm" disabled={loading || saving || Boolean(error) || !settings.length} onClick={() => void save()}><Save size={16} />{saving ? '保存中…' : '保存设置'}</Button></PermissionGuard>
      </InfrastructurePageHeader>
      {loading ? <div className="flex items-center gap-3 py-10 text-cf-muted"><LoadingSpinner />正在读取订阅设置</div> : error ? <p role="alert" className="text-sm text-cf-muted">{error}，请重新加载。</p> : !settings.length ? <p role="status" className="py-10 text-sm text-cf-muted">暂无可配置的消息订阅，请重新加载或联系管理员。</p> : <>
        {!canEdit && <p className="text-sm text-cf-subtle">您当前仅可查看订阅设置，修改需消息订阅编辑权限。</p>}
        <InfrastructureField label="通知渠道" className="max-w-xs"><InfrastructureSelect value={channel} options={channels.map((value) => ({ value, label: CHANNEL_LABELS[value] }))} onValueChange={(value) => setChannel(value as MessageChannelType)} /></InfrastructureField>
        {channel !== 'INTERNAL' && <p className="text-sm text-cf-subtle">{CHANNEL_LABELS[channel]}通知需管理员配置并启用对应渠道后才能送达。</p>}
        <div className="space-y-3">{settings.filter((item) => item.channelType === channel).map((item) => (
          <section key={`${item.channelType}-${item.messageCategory}`} aria-label={`${CATEGORY_LABELS[item.messageCategory]}订阅`} className="card grid items-center gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
            <div><h3 className="font-medium text-cf-title">{CATEGORY_LABELS[item.messageCategory]}</h3><p className="mt-1 text-xs text-cf-subtle">{item.enabledFlag === 1 ? '接收此类通知' : '已关闭此类订阅'}</p></div>
            <InfrastructureField label="接收消息"><Switch aria-label={`接收${CATEGORY_LABELS[item.messageCategory]}`} disabled={saving || !canEdit} checked={item.enabledFlag === 1} onCheckedChange={(checked) => update(item, { enabledFlag: checked ? 1 : 0 })} /></InfrastructureField>
            <InfrastructureField label="免打扰开始"><Input type="time" disabled={saving || !canEdit} value={item.quietStart?.slice(0, 5) || ''} onChange={(event) => update(item, { quietStart: event.target.value ? `${event.target.value}:00` : null })} /></InfrastructureField>
            <InfrastructureField label="免打扰结束"><Input type="time" disabled={saving || !canEdit} value={item.quietEnd?.slice(0, 5) || ''} onChange={(event) => update(item, { quietEnd: event.target.value ? `${event.target.value}:00` : null })} /></InfrastructureField>
          </section>
        ))}</div>
        <p className="text-xs leading-6 text-cf-subtle">免打扰可跨越午夜；非强制消息会延迟到时段结束。清空开始和结束时间可取消免打扰；开始和结束时间相同时不启用免打扰。</p>
      </>}
    </div>
  );
}
