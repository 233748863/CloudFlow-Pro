import React, { useEffect, useRef, useState } from 'react';
import DOMPurify from 'dompurify';
import { Button, Input, Pagination } from '@/components/common';
import { crmOperations, type Campaign, type MarketingEmailCommand, type MarketingEmailDraft, type MarketingEmailPreview, type MarketingEmailTask } from '@/services/api/crm/operations';
import { getErrorMessage } from '@/utils/errorMessage';
import { AudienceTable } from './AudienceTable';
import { datePayload, Field, Flag, labelOf, Metric, OpsSelect, OpsTable, Section, useRemote } from './OperationsKit';

const states: Record<string, string> = { DRAFT: '草稿', SCHEDULED: '等待定时', SENDING: '处理中', PENDING: '待提交', QUEUED: '已排队', SENT: '邮件服务器已接纳', PARTIAL: '部分接纳', FAILED: '失败', UNKNOWN: '结果未明', SKIPPED: '已跳过', CANCELLED: '已取消' };
const previewDocument = (html: string) => `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src 'none'; form-action 'none'; base-uri 'none'"><style>body{font:14px/1.7 system-ui,sans-serif;padding:12px;overflow-wrap:anywhere}a{pointer-events:none}img{display:none}</style></head><body>${DOMPurify.sanitize(html, { FORBID_TAGS: ['form', 'input', 'iframe', 'style', 'script'], FORBID_ATTR: ['target'] })}</body></html>`;

export function MarketingEmailPanel({ campaign, writable }: { campaign: Campaign; writable: boolean }) {
  const campaignId = campaign.campaignId!;
  const [selected, setSelected] = useState<number>();
  const [draft, setDraft] = useState<MarketingEmailDraft>();
  const [preview, setPreview] = useState<MarketingEmailPreview>();
  const [testAddress, setTestAddress] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const locked = useRef(false);
  const alive = useRef(true);
  const selection = useRef(selected); selection.current = selected;
  const tasks = useRemote(() => crmOperations.marketingEmailTasks(campaignId), [campaignId]);
  const templates = useRemote(() => writable ? crmOperations.marketingEmailTemplates() : Promise.resolve([]), [writable]);
  const detail = useRemote(() => selected ? crmOperations.marketingEmailDetail(selected, page, pageSize) : Promise.resolve(undefined), [selected, page, pageSize]);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const task = detail.data?.task;
  const editing = draft && (!draft.massEmailId || task?.status === 'DRAFT');
  const unchanged = Boolean(draft?.massEmailId && task && draft.version === task.version && draft.subject === task.subject && draft.templateCode === task.templateCode
    && (draft.fromAddress || '') === (task.fromAddress || '') && (draft.fromName || '') === (task.fromName || '') && (draft.replyTo || '') === (task.replyTo || ''));
  const ended = ['COMPLETED', 'CANCELLED'].includes(campaign.status);
  const maySend = writable && !ended;
  const editTask = (task: MarketingEmailTask) => {
    setSelected(task.massEmailId); setPage(1); setPreview(undefined); setConfirmed(false); setError(''); setNotice('');
    setDraft({ massEmailId: task.massEmailId, campaignId, version: task.version, subject: task.subject, templateCode: task.templateCode,
      fromAddress: task.fromAddress, fromName: task.fromName, replyTo: task.replyTo });
  };
  const run = async <Result,>(operation: () => Promise<Result>, done: (value: Result) => void, message = '') => {
    if (locked.current) return;
    locked.current = true; setBusy(true); setError(''); setNotice('');
    const initialSelection = selection.current;
    try {
      const value = await operation();
      if (alive.current && selection.current === initialSelection) { done(value); setNotice(message); }
    } catch (failure) {
      if (alive.current) { setError(getErrorMessage(failure, '邮件操作失败')); setPreview(undefined); setConfirmed(false); }
    } finally { locked.current = false; if (alive.current) setBusy(false); }
  };
  const refresh = () => { tasks.refresh(); detail.refresh(); setPreview(undefined); setConfirmed(false); };
  const patch = (fields: Partial<MarketingEmailDraft>) => { setDraft(previous => previous ? { ...previous, ...fields } : previous); setPreview(undefined); setConfirmed(false); };
  const command = (): MarketingEmailCommand => ({ version: preview?.version, previewDigest: preview?.previewDigest, confirmLarge: confirmed, confirmedRecipientCount: preview?.recipientCount });
  const submit = (scheduled: boolean) => {
    if (!selected || !preview?.ready || !unchanged || (preview.requiresConfirmation && !confirmed)) return;
    if (!window.confirm(`${scheduled ? '安排定时' : '立即提交'}向 ${preview.recipientCount} 个邮箱发送“${task?.subject}”？排队不代表发送成功。`)) return;
    const request = { ...command(), scheduledTime: scheduled ? datePayload(scheduledTime) : undefined };
    void run(() => scheduled ? crmOperations.scheduleMarketingEmail(selected, request) : crmOperations.sendMarketingEmail(selected, request), saved => {
      editTask(saved); refresh();
    }, scheduled ? '已冻结名单并安排定时，实际结果以逐人状态为准。' : '已冻结名单并提交队列，实际结果以逐人状态为准。');
  };
  const summary: Record<string, number> = (() => { try { return JSON.parse(task?.deliverySummary || '{}'); } catch { return {}; } })();
  const options = Object.fromEntries((templates.data || []).map(template => [template.templateCode, template.templateName]));
  if (draft?.templateCode && !options[draft.templateCode]) options[draft.templateCode] = `${draft.templateCode}（未启用或不可用）`;

  return <Section title="营销邮件"><div className="crm-email-panel space-y-4">
    <p className="text-sm text-cf-muted">邮件服务器接纳 = 对方邮件服务确认接收，不代表进入收件箱；打开记录受图片拦截和代理缓存影响，不证明已阅读。</p>
    <div className="crm-ops-actions">
      {maySend && <Button disabled={busy} onClick={() => { setSelected(undefined); setPreview(undefined); setConfirmed(false); setNotice(''); setError(''); setDraft({ campaignId, subject: '{{campaignName}}', templateCode: templates.data?.some(item => item.templateCode === 'CRM_MARKETING') ? 'CRM_MARKETING' : templates.data?.[0]?.templateCode || '' }); }}>新建邮件草稿</Button>}
      <Button variant="outline" disabled={busy || tasks.loading} onClick={refresh}>刷新邮件结果</Button>
    </div>
    {(error || tasks.error || detail.error || templates.error) && <div role="alert" className="crm-ops-warning">{error || tasks.error || detail.error || templates.error}</div>}
    {notice && <p role="status" className="text-sm text-cf-muted">{notice}</p>}
    <OpsTable headers={['邮件主题', '状态', '接纳 / 总数', '计划时间', '操作']} empty={!tasks.loading && !tasks.data?.length}>{tasks.data?.map(item => <tr key={item.massEmailId}>
      <td>{item.subject}</td><td>{labelOf(states, item.status)}</td><td>{item.sentCount} / {item.totalCount}</td><td>{item.scheduledTime || '—'}</td>
      <td><Button variant="ghost" disabled={busy} onClick={() => editTask(item)}>查看邮件</Button></td>
    </tr>)}</OpsTable>
    {draft && <div className="space-y-4 border-t border-cf-border pt-4">
      {detail.data && <div className="grid gap-3 sm:grid-cols-3"><Metric label="当前状态" value={labelOf(states, task?.status)} /><Metric label="已接纳 / 失败" value={`${task?.sentCount || 0} / ${task?.failedCount || 0}`} /><Metric label="结果未明 / 跳过" value={`${summary.UNKNOWN || 0} / ${summary.SKIPPED || 0}`} /></div>}
      {detail.data && !detail.data.policy.sendingEnabled && <div role="status" className="crm-ops-warning">邮件发送已停用：{detail.data.policy.reason || '未完成必要配置'}。草稿可继续保存。</div>}
      {maySend && editing ? <fieldset className="grid gap-4 md:grid-cols-2" disabled={busy}>
        <Field label="邮件主题"><Input aria-label="邮件主题" maxLength={200} value={draft.subject} onChange={event => patch({ subject: event.target.value })} /></Field>
        <Field label="邮件模板"><OpsSelect label="邮件模板" value={draft.templateCode} options={options} empty="请选择已启用的CRM邮件模板" onChange={templateCode => patch({ templateCode })} /></Field>
        <Field label="发件显示名（留空使用渠道设置）"><Input aria-label="发件显示名" maxLength={120} value={draft.fromName || ''} onChange={event => patch({ fromName: event.target.value || null })} /></Field>
        <Field label="回复邮箱（选填）"><Input aria-label="回复邮箱" type="email" maxLength={100} value={draft.replyTo || ''} onChange={event => patch({ replyTo: event.target.value || null })} /></Field>
        <p className="text-xs text-cf-muted md:col-span-2">正文使用管理员维护的模板，支持联系人、公司与活动名称；实际发件地址受渠道核验，退订链接自动加入。</p>
      </fieldset> : <p className="text-sm text-cf-muted">{draft.subject} · {options[draft.templateCode] || draft.templateCode} · 已冻结的正式名单和内容不可修改。</p>}
      {maySend && editing && <div className="crm-ops-actions">
        <Button disabled={busy || !draft.subject.trim() || !draft.templateCode} onClick={() => void run(() => crmOperations.saveMarketingEmail(draft), saved => { editTask(saved); tasks.refresh(); detail.refresh(); }, '邮件草稿已保存。')}>保存邮件草稿</Button>
        <Button variant="outline" disabled={busy || !selected || !unchanged} onClick={() => selected && void run(() => crmOperations.previewMarketingEmail(selected), value => { setPreview(value); setConfirmed(false); })}>预览名单与正文</Button>
        {!unchanged && <span className="text-xs text-cf-muted">请先保存，再预览确认。</span>}
      </div>}
      {preview && <div className="space-y-4">
        {!preview.ready && <div role="alert" className="crm-ops-warning">当前不能发送：{preview.reason}</div>}
        <div className="grid gap-3 sm:grid-cols-3"><Metric label="精确收件人数" value={preview.recipientCount} /><Metric label="排除 / 退订" value={`${preview.excludedCount} / ${preview.optedOutCount}`} /><Metric label="无效 / 重复邮箱" value={`${preview.invalidEmailCount} / ${preview.duplicateCount}`} /></div>
        <p className="text-xs text-cf-muted">名单仅显示前 {preview.sampleLimit} 名脱敏样本；正文以测试联系人展示，预览不加载外部图片或打开链接。</p>
        <AudienceTable members={preview.members} />
        {preview.previewHtml && <iframe title="营销邮件正文预览" sandbox="" referrerPolicy="no-referrer" className="h-64 w-full rounded-lg border border-cf-border bg-white" srcDoc={previewDocument(preview.previewHtml)} />}
        {preview.requiresConfirmation && <div className="crm-ops-warning"><Flag disabled={busy} label={`我已核对本次 ${preview.recipientCount} 个邮箱（超过 ${preview.confirmationThreshold} 人阈值）`} value={confirmed} onChange={setConfirmed} /></div>}
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="仅向指定邮箱测试"><Input aria-label="营销测试邮箱" type="email" maxLength={254} value={testAddress} onChange={event => setTestAddress(event.target.value)} disabled={busy} /></Field>
          <div className="flex items-end"><Button variant="outline" disabled={busy || !preview.ready || !unchanged || !testAddress.trim()} onClick={() => selected && void run(() => crmOperations.testMarketingEmail(selected, { ...command(), testAddress: testAddress.trim() }), result => { detail.refresh(); setTestAddress(''); }, '测试请求已登记；同任务同邮箱仅保留一次测试，修改内容后请新建任务。测试不计正式统计。')}>提交指定邮箱测试</Button></div>
          <Field label="定时发送时间"><Input aria-label="营销定时发送时间" type="datetime-local" value={scheduledTime} onChange={event => setScheduledTime(event.target.value)} disabled={busy} /></Field>
          <p className="self-center text-xs text-cf-muted">定时确认后立即冻结名单；发送前仍检查退订、权限与当前配置。活动须为已保存的“进行中”。</p>
        </div>
        <div className="crm-ops-actions"><Button disabled={busy || !preview.ready || !unchanged || !preview.recipientCount || campaign.status !== 'ACTIVE' || preview.requiresConfirmation && !confirmed} onClick={() => submit(false)}>确认立即提交</Button>
          <Button variant="outline" disabled={busy || !preview.ready || !unchanged || !preview.recipientCount || !scheduledTime || campaign.status !== 'ACTIVE' || preview.requiresConfirmation && !confirmed} onClick={() => submit(true)}>确认定时发送</Button></div>
      </div>}
      {task && writable && ['DRAFT', 'SCHEDULED', 'SENDING'].includes(task.status) && <Button variant="outline" disabled={busy} onClick={() => {
        if (window.confirm('确认取消尚未发送的部分？已经接纳的邮件与事实记录将保留。')) void run(() => crmOperations.cancelMarketingEmail(task.massEmailId, { version: task.version }), saved => { editTask(saved); refresh(); }, '已取消未发部分；正在投递的邮件以实际回写结果为准。');
      }}>取消未发部分</Button>}
      {detail.data && <><OpsTable headers={['脱敏邮箱', '用途', '真实状态', '首次打开 / 点击', '退订时间']} empty={!detail.data.recipients.rows.length}>{detail.data.recipients.rows.map(recipient => <tr key={recipient.recipientId}>
        <td>{recipient.emailMask}</td><td>{recipient.testFlag ? '测试（不计统计）' : '正式'}</td><td>{labelOf(states, recipient.status)}</td><td>{recipient.firstOpenTime || '—'}<br />{recipient.firstClickTime || '—'}</td><td>{recipient.unsubscribedTime || '—'}</td>
      </tr>)}</OpsTable><Pagination page={page} pageSize={pageSize} total={detail.data.recipients.total} onPageChange={value => { if (!busy) setPage(value); }} onPageSizeChange={value => { if (!busy) { setPageSize(value); setPage(1); } }} /></>}
      {summary.UNKNOWN > 0 && <div className="crm-ops-warning">结果未明不会自动重发或计为送达；须在消息中心核验未被接纳后，才可人工重发。</div>}
    </div>}
  </div></Section>;
}
