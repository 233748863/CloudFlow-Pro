import React, { useMemo, useState } from 'react';
import { Edit, Eye, Layers, Plus, Power, Radio, RefreshCw, RotateCcw, SendHorizontal, Share2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { BaseDialog, Button, DetailDialog, Input, Pagination, PermissionGuard, Switch, Textarea, WarningConfirmDialog } from '@/components/common';
import { InnerTableSurface, TablePageLayout } from '@/components/layout';
import {
  addMessageChannel, getMessageChannel, listMessageChannels, removeMessageChannels,
  testMessageChannel, updateMessageChannel,
} from '@/services/api/message';
import type { MessageChannel, MessageChannelType, MessagePageQuery, MessageStatus } from '@/services/api/message';
import { getErrorMessage } from '@/utils/errorMessage';
import { cn } from '@/utils/cn';
import { InfrastructureBadge, InfrastructureDialogPanel, InfrastructureField, InfrastructurePageHeader, InfrastructureSelect, InfrastructureStats, InfrastructureTableStateRow } from '../_components/InfrastructurePrimitives';
import { useInfrastructurePage } from '../_components/useInfrastructurePage';
import { CHANNEL_LABELS, channelOptions, statusOptions } from './options';

const EMPTY_FILTERS = {
  channelType: '' as MessageChannelType | '',
  status: '' as MessageStatus | '',
};

const emptyChannel = (): MessageChannel => ({
  channelType: 'INTERNAL', channelCode: '', channelName: '', priority: 100,
  retryCount: 3, retryIntervalSec: 60, status: 'ENABLED', smtpPort: 465, smtpSslFlag: 1,
});

export default function MessageChannelPage() {
  const page = useInfrastructurePage<MessageChannel, MessagePageQuery>(listMessageChannels, { pageNum: 1, pageSize: 10 });
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [form, setForm] = useState<MessageChannel | null>(null);
  const [secretHints, setSecretHints] = useState({ apiSecret: '', smtpPwd: '' });
  const [busy, setBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<MessageChannel | null>(null);
  const [testTarget, setTestTarget] = useState<MessageChannel | null>(null);
  const [testAddress, setTestAddress] = useState('');
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [detailChannel, setDetailChannel] = useState<MessageChannel | null>(null);

  const updateField = <Key extends keyof MessageChannel>(key: Key, value: MessageChannel[Key]) =>
    setForm((current) => current ? { ...current, [key]: value } : current);

  const openEditor = async (channel: MessageChannel) => {
    if (!channel.channelId) return;
    setBusy(true);
    try {
      const detail = await getMessageChannel(channel.channelId);
      setSecretHints({ apiSecret: detail.apiSecret || '', smtpPwd: detail.smtpPwd || '' });
      setForm({ ...detail, apiSecret: '', smtpPwd: '' });
    } catch (reason) {
      toast.error(getErrorMessage(reason, '读取渠道失败'));
    } finally { setBusy(false); }
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form || busy) return;
    setBusy(true);
    try {
      const payload = { ...form, channelName: form.channelName.trim(), channelCode: form.channelCode.trim(), implementedFlag: undefined };
      if (form.channelId) await updateMessageChannel(payload);
      else await addMessageChannel(payload);
      setForm(null);
      toast.success('渠道配置已保存');
      page.refresh();
    } catch (reason) {
      toast.error(getErrorMessage(reason, '保存渠道失败'));
    } finally { setBusy(false); }
  };

  const remove = async () => {
    if (!deleteTarget?.channelId || busy) return;
    setBusy(true);
    try {
      await removeMessageChannels([deleteTarget.channelId]);
      toast.success('渠道已删除');
      page.refresh();
    } catch (reason) {
      toast.error(getErrorMessage(reason, '删除渠道失败'));
    } finally { setBusy(false); }
  };

  const test = async () => {
    if (!testTarget?.channelId || busy) return;
    setBusy(true);
    setTestResult(null);
    try {
      setTestResult(await testMessageChannel(testTarget.channelId, { target: testAddress.trim() || undefined, content: '消息渠道连通性测试' }));
    } catch (reason) {
      setTestResult({ success: false, message: getErrorMessage(reason, '渠道测试失败') });
    } finally { setBusy(false); }
  };

  const stats = useMemo(
    () => [
      {
        label: '渠道总数',
        value: String(page.total),
        meta: `当前页 ${page.rows.length}`,
        icon: <Radio size={18} />,
        tone: 'blue' as const,
      },
      {
        label: '已接入',
        value: String(page.rows.filter((item) => item.implementedFlag === 1).length),
        meta: '本页已接入发送服务',
        icon: <Share2 size={18} />,
        tone: 'green' as const,
      },
      {
        label: '启用中',
        value: String(page.rows.filter((item) => item.status === 'ENABLED').length),
        meta: '本页启用',
        icon: <Power size={18} />,
        tone: 'amber' as const,
      },
      {
        label: '渠道类型',
        value: String(new Set(page.rows.map((item) => item.channelType)).size),
        meta: '本页去重',
        icon: <Layers size={18} />,
        tone: 'violet' as const,
      },
    ],
    [page.rows, page.total],
  );

  const hasActiveFilters = Boolean(page.query.channelType || page.query.status);

  const handleSearch = (event: React.FormEvent) => {
    event.preventDefault();
    page.setQuery((current) => ({
      ...current,
      channelType: filters.channelType,
      status: filters.status,
      pageNum: 1,
    }));
  };

  const handleReset = () => {
    setFilters(EMPTY_FILTERS);
    page.setQuery((current) => ({ ...current, channelType: '', status: '', pageNum: 1 }));
  };

  return (
    <section className="admin-source-page">
      <TablePageLayout
        actions={
          <div className="grid gap-5">
            <InfrastructurePageHeader kicker="MESSAGE CHANNELS" title="消息渠道" description="管理站内消息、邮件和企业微信通知，查看各渠道的配置及实际发送状态。">
              <Button variant="outline" size="sm" onClick={page.refresh} disabled={page.loading}>
                <RefreshCw size={16} className={cn(page.loading && 'animate-spin')} />
                刷新
              </Button>
              <PermissionGuard permissions={['system:message:channel:add']} hidden>
                <Button
                  size="sm"
                  onClick={() => { setSecretHints({ apiSecret: '', smtpPwd: '' }); setForm(emptyChannel()); }}
                  disabled={busy}
                >
                  <Plus size={16} />
                  新增渠道
                </Button>
              </PermissionGuard>
            </InfrastructurePageHeader>
            <InfrastructureStats items={stats} />
          </div>
        }
        filters={<section className="card admin-users-toolbar">
          <form onSubmit={handleSearch} className="admin-message-channel-filter-grid">
            <InfrastructureField label="渠道类型">
              <InfrastructureSelect
                aria-label="筛选渠道类型"
                value={filters.channelType}
                options={[{ value: '', label: '全部渠道' }, ...channelOptions]}
                onValueChange={(value) => setFilters((current) => ({ ...current, channelType: value as MessageChannelType | '' }))}
              />
            </InfrastructureField>
            <InfrastructureField label="状态">
              <InfrastructureSelect
                aria-label="筛选渠道状态"
                value={filters.status}
                options={[{ value: '', label: '全部状态' }, ...statusOptions]}
                onValueChange={(value) => setFilters((current) => ({ ...current, status: value as MessageStatus | '' }))}
              />
            </InfrastructureField>
            <div className="admin-users-toolbar-actions">
              <span className="admin-users-filter-count">共 {page.total} 条</span>
              <Button type="submit" size="sm">查询</Button>
              <Button type="button" variant="outline" size="sm" onClick={handleReset} disabled={!hasActiveFilters}>
                <RotateCcw size={14} />
                重置
              </Button>
            </div>
          </form>
        </section>}
        table={<InnerTableSurface className="flex min-h-0 flex-1 flex-col">
          <div className="admin-horizontal-scroll"><table className="unity-data-table admin-source-table min-w-[760px]">
            <thead><tr>{['渠道', '类型', '接入状态', '优先级', '启用状态', '操作'].map((heading) => <th key={heading}>{heading}</th>)}</tr></thead>
            <tbody>
              {page.loading || page.error || !page.rows.length ? <InfrastructureTableStateRow colSpan={6} loading={page.loading} title={page.loading ? '正在加载渠道' : page.error || '暂无消息渠道'} description={page.error ? '点击刷新重新加载' : '新增渠道后可配置发送方式与限流规则'} /> : page.rows.map((channel) => (
                <tr key={channel.channelId}>
                  <td><p className="font-medium text-cf-title">{channel.channelName}</p><p className="mt-1 font-mono text-xs text-cf-subtle">{channel.channelCode}</p></td>
                  <td>{CHANNEL_LABELS[channel.channelType] || channel.channelType}</td>
                  <td><InfrastructureBadge tone={channel.implementedFlag === 1 ? 'success' : 'warning'}>{channel.implementedFlag === 1 ? '已接入' : '尚未接入'}</InfrastructureBadge></td>
                  <td>{channel.priority}</td>
                  <td><InfrastructureBadge tone={channel.status === 'ENABLED' ? 'success' : 'neutral'}>{channel.status === 'ENABLED' ? '启用' : '停用'}</InfrastructureBadge></td>
                  <td>
                    <div className="admin-users-row-actions">
                      {/* 查看是只读操作，不设权限门禁：能进列表就能看详情，与资产台账、
                          车辆、印章那几个页面的既有约定一致。 */}
                      <button type="button" data-tooltip="查看详情" aria-label="查看详情" onClick={() => setDetailChannel(channel)}><Eye size={15} /></button>
                      <PermissionGuard permissions={['system:message:channel:edit']} hidden>
                        <button type="button" disabled={busy} data-tooltip="编辑渠道" aria-label="编辑渠道" onClick={() => void openEditor(channel)}><Edit size={15} /></button>
                        <button type="button" disabled={busy} data-tooltip="发送测试" aria-label="发送测试" onClick={() => { setTestTarget(channel); setTestAddress(''); setTestResult(null); }}><SendHorizontal size={15} /></button>
                      </PermissionGuard>
                      <PermissionGuard permissions={['system:message:channel:remove']} hidden>
                        <button type="button" className="danger" disabled={busy} data-tooltip="删除渠道" aria-label="删除渠道" onClick={() => setDeleteTarget(channel)}><Trash2 size={15} /></button>
                      </PermissionGuard>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </InnerTableSurface>}
        pagination={<Pagination total={page.total} page={page.query.pageNum} pageSize={page.query.pageSize} onPageChange={(pageNum) => page.setQuery((current) => ({ ...current, pageNum }))} onPageSizeChange={(pageSize) => page.setQuery((current) => ({ ...current, pageNum: 1, pageSize }))} />}
      />
      <BaseDialog open={Boolean(form)} title={form?.channelId ? '编辑消息渠道' : '新增消息渠道'} width="wide" onClose={() => { if (!busy) setForm(null); }} footer={<><Button variant="outline" disabled={busy} onClick={() => setForm(null)}>取消</Button><Button type="submit" form="message-channel-form" disabled={busy}>{busy ? '保存中…' : '保存配置'}</Button></>}>
        {form && <form id="message-channel-form" onSubmit={save} className="admin-source-form-grid">
          <InfrastructureField label="渠道名称"><Input required maxLength={100} value={form.channelName} onChange={(event) => updateField('channelName', event.target.value)} /></InfrastructureField>
          <InfrastructureField label="渠道编码"><Input required maxLength={50} value={form.channelCode} onChange={(event) => updateField('channelCode', event.target.value)} /></InfrastructureField>
          <InfrastructureField label="渠道类型"><InfrastructureSelect value={form.channelType} options={channelOptions} onValueChange={(value) => updateField('channelType', value as MessageChannelType)} /></InfrastructureField>
          <InfrastructureField label="启用状态"><InfrastructureSelect value={form.status} options={statusOptions} onValueChange={(value) => updateField('status', value as MessageStatus)} /></InfrastructureField>
          <InfrastructureField label="优先级" hint="数字越小，越优先使用"><Input type="number" required min={0} value={form.priority} onChange={(event) => updateField('priority', Number(event.target.value))} /></InfrastructureField>
          {form.channelType !== 'WECOM' && <InfrastructureField label="服务商标识"><Input maxLength={50} value={form.provider || ''} onChange={(event) => updateField('provider', event.target.value)} /></InfrastructureField>}
          <InfrastructureField label="每分钟发送上限" hint="留空表示不限制"><Input type="number" min={1} value={form.rateLimitMinute ?? ''} onChange={(event) => updateField('rateLimitMinute', event.target.value ? Number(event.target.value) : null)} /></InfrastructureField>
          <InfrastructureField label="每日发送上限" hint="留空表示不限制"><Input type="number" min={1} value={form.dailyLimit ?? ''} onChange={(event) => updateField('dailyLimit', event.target.value ? Number(event.target.value) : null)} /></InfrastructureField>
          <InfrastructureField label="失败重试次数"><Input type="number" min={0} required value={form.retryCount} onChange={(event) => updateField('retryCount', Number(event.target.value))} /></InfrastructureField>
          <InfrastructureField label="重试间隔（秒）"><Input type="number" min={1} required value={form.retryIntervalSec} onChange={(event) => updateField('retryIntervalSec', Number(event.target.value))} /></InfrastructureField>
          {form.channelType === 'EMAIL' ? <>
            <InfrastructureField label="邮件服务器"><Input value={form.smtpHost || ''} onChange={(event) => updateField('smtpHost', event.target.value)} /></InfrastructureField>
            <InfrastructureField label="服务器端口"><Input type="number" min={1} max={65535} value={form.smtpPort ?? ''} onChange={(event) => updateField('smtpPort', event.target.value ? Number(event.target.value) : undefined)} /></InfrastructureField>
            <InfrastructureField label="登录账号"><Input autoComplete="off" value={form.smtpUsername || ''} onChange={(event) => updateField('smtpUsername', event.target.value)} /></InfrastructureField>
            <InfrastructureField label="邮件密码" hint={secretHints.smtpPwd ? `已保存 ${secretHints.smtpPwd}；留空保留原密码` : '加密保存，不回显完整密码'}><Input type="password" autoComplete="new-password" value={form.smtpPwd || ''} onChange={(event) => updateField('smtpPwd', event.target.value)} /></InfrastructureField>
            <InfrastructureField label="发件地址"><Input type="email" value={form.fromAddress || ''} onChange={(event) => updateField('fromAddress', event.target.value)} /></InfrastructureField>
            <InfrastructureField label="发件名称"><Input value={form.fromName || ''} onChange={(event) => updateField('fromName', event.target.value)} /></InfrastructureField>
            <InfrastructureField label="直接建立加密连接" hint="始终要求加密；465端口直接加密，587端口连接后升级加密。"><Switch checked={form.smtpSslFlag === 1} onCheckedChange={(checked) => updateField('smtpSslFlag', checked ? 1 : 0)} aria-label="直接建立邮件加密连接" /></InfrastructureField>
          </> : form.channelType === 'WECOM' ? <p className="admin-source-form-wide text-sm leading-6 text-cf-muted">企业微信沿用当前租户的“企业通信配置”，请在该页面启用应用消息。仅向已有有效绑定的员工发送通知；此处设置发送限制和重试规则。</p> : form.channelType !== 'INTERNAL' ? <>
            <InfrastructureField label="服务地址"><Input type="url" value={form.endpoint || ''} onChange={(event) => updateField('endpoint', event.target.value)} /></InfrastructureField>
            <InfrastructureField label="接口账号"><Input autoComplete="off" value={form.apiKey || ''} onChange={(event) => updateField('apiKey', event.target.value)} /></InfrastructureField>
            <InfrastructureField label="接口密钥" hint={secretHints.apiSecret ? `已保存 ${secretHints.apiSecret}；留空保留原密钥` : '加密保存，不回显完整密钥'}><Input type="password" autoComplete="new-password" value={form.apiSecret || ''} onChange={(event) => updateField('apiSecret', event.target.value)} /></InfrastructureField>
            <InfrastructureField label="回调地址"><Input type="url" value={form.callbackUrl || ''} onChange={(event) => updateField('callbackUrl', event.target.value)} /></InfrastructureField>
            {form.channelType === 'SMS' && <InfrastructureField label="短信签名"><Input value={form.signature || ''} onChange={(event) => updateField('signature', event.target.value)} /></InfrastructureField>}
          </> : null}
          <InfrastructureField label="备注" className="admin-source-form-wide"><Textarea rows={3} maxLength={500} value={form.remark || ''} onChange={(event) => updateField('remark', event.target.value)} /></InfrastructureField>
        </form>}
      </BaseDialog>
      <BaseDialog open={Boolean(testTarget)} title={`测试渠道：${testTarget?.channelName || ''}`} onClose={() => { if (!busy) setTestTarget(null); }} footer={<Button disabled={busy} onClick={() => void test()}>{busy ? '测试中…' : '开始测试'}</Button>}>
        <div className="admin-dialog-stack">
          {testTarget?.channelType === 'WECOM' ? <p className="text-sm leading-6 text-cf-muted">验证当前租户的企业微信应用凭据，不发送业务消息。接入或应用消息未启用时显示不可用。</p> : <InfrastructureField label="测试接收方" hint="站内消息填写用户编号；其他渠道填写对应接收地址"><Input value={testAddress} onChange={(event) => setTestAddress(event.target.value)} /></InfrastructureField>}
          {testTarget?.implementedFlag !== 1 && <p className="text-sm leading-6 text-cf-muted">该渠道尚未接入实际发送服务，测试会返回未实现提示。</p>}
          {testResult && <InfrastructureDialogPanel title={testResult.success ? '测试成功' : '测试未通过'}>
            <p role="status" className="text-sm leading-7 text-cf-muted">{testResult.message}</p>
          </InfrastructureDialogPanel>}
        </div>
      </BaseDialog>
      <DetailDialog
        open={Boolean(detailChannel)}
        title="渠道详情"
        onClose={() => setDetailChannel(null)}
        heading={detailChannel?.channelName}
        subheading={detailChannel ? `${detailChannel.channelCode} · ${CHANNEL_LABELS[detailChannel.channelType] || detailChannel.channelType}` : undefined}
        headingAside={detailChannel ? (
          <InfrastructureBadge tone={detailChannel.status === 'ENABLED' ? 'success' : 'neutral'}>
            {detailChannel.status === 'ENABLED' ? '启用' : '停用'}
          </InfrastructureBadge>
        ) : undefined}
        sections={detailChannel ? [
          {
            title: '基础信息',
            items: [
              { label: '渠道名称', value: detailChannel.channelName },
              { label: '渠道编码', value: detailChannel.channelCode },
              { label: '渠道类型', value: CHANNEL_LABELS[detailChannel.channelType] || detailChannel.channelType },
              { label: '接入状态', value: detailChannel.implementedFlag === 1 ? '已接入' : '尚未接入' },
              { label: '启用状态', value: detailChannel.status === 'ENABLED' ? '启用' : '停用' },
              { label: '优先级', value: String(detailChannel.priority) },
              { label: '服务商标识', value: detailChannel.provider },
            ],
          },
          {
            title: '发送限制',
            items: [
              { label: '每分钟发送上限', value: detailChannel.rateLimitMinute == null ? '不限制' : String(detailChannel.rateLimitMinute) },
              { label: '每日发送上限', value: detailChannel.dailyLimit == null ? '不限制' : String(detailChannel.dailyLimit) },
              { label: '失败重试次数', value: String(detailChannel.retryCount) },
              { label: '重试间隔', value: `${detailChannel.retryIntervalSec} 秒` },
            ],
          },
          {
            title: '邮件配置',
            visible: detailChannel.channelType === 'EMAIL',
            items: [
              { label: '服务器地址', value: detailChannel.smtpHost },
              { label: '服务器端口', value: detailChannel.smtpPort == null ? '' : String(detailChannel.smtpPort) },
              { label: '登录账号', value: detailChannel.smtpUsername },
              /* 密码和密钥不回显，只给配置状态。详情弹窗是只读视图，
                 没有任何需要看到明文的场景，回显只会扩大泄露面。 */
              { label: '邮件密码', value: detailChannel.smtpPwd ? '已配置' : '未配置' },
              { label: '发件地址', value: detailChannel.fromAddress },
              { label: '发件名称', value: detailChannel.fromName },
              { label: '加密连接', value: detailChannel.smtpSslFlag === 1 ? '直接加密（465）' : '强制升级加密（587）' },
            ],
          },
          {
            title: '接口配置',
            visible: detailChannel.channelType !== 'EMAIL' && detailChannel.channelType !== 'INTERNAL' && detailChannel.channelType !== 'WECOM',
            items: [
              { label: '服务地址', value: detailChannel.endpoint },
              { label: '接口账号', value: detailChannel.apiKey },
              { label: '接口密钥', value: detailChannel.apiSecret ? '已配置' : '未配置' },
              { label: '回调地址', value: detailChannel.callbackUrl },
              { label: '短信签名', value: detailChannel.signature, visible: detailChannel.channelType === 'SMS' },
            ],
          },
          {
            title: '企业微信配置',
            visible: detailChannel.channelType === 'WECOM',
            content: <p className="text-sm leading-7 text-cf-muted">沿用当前租户的企业通信配置；需启用应用消息，且接收员工已有有效绑定。</p>,
          },
          {
            title: '备注',
            visible: Boolean(detailChannel.remark),
            content: <p className="whitespace-pre-wrap break-words text-sm leading-7 text-cf-muted">{detailChannel.remark}</p>,
          },
        ] : []}
      />
      <WarningConfirmDialog open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)} title="删除消息渠道" message={`确认删除“${deleteTarget?.channelName || ''}”？`} description="删除后该渠道不再参与消息投递。" severity="danger" onConfirm={() => void remove()} />
    </section>
  );
}
