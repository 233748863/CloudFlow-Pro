import React, { useEffect, useRef, useState } from 'react';
import { BaseDialog, Button, ConfirmDialog, Input, Textarea } from '@/components/common';
import { emailArchive, type CustomerEmail, type CustomerEmailRequest, type EmailBusinessType, type EmailFile } from '@/services/api/crm/emailArchive';
import { getErrorMessage } from '@/utils/errorMessage';
import { Field, OpsSelect, useRemote } from '../operations/OperationsKit';
import { EmailBody, emailPlainText, emailTextHtml } from './EmailBody';
import './email.css';

interface Props { bizType: EmailBusinessType; bizId: number; inbound?: boolean; initial?: CustomerEmail; onClose: () => void; onSaved: () => void; onBusyChange?: (busy: boolean) => void }

export function EmailComposeDialog({ bizType, bizId, inbound = false, initial, onClose, onSaved, onBusyChange }: Props) {
  const context = useRemote(() => emailArchive.context(bizType, bizId), [bizType, bizId]);
  const templates = useRemote(() => inbound ? Promise.resolve([]) : emailArchive.templates(), [inbound]);
  const [requestKey] = useState(() => initial?.requestKey || crypto.randomUUID());
  const [subject, setSubject] = useState(initial?.subject || '');
  const [body, setBody] = useState(() => initial?.sanitizedContent ? emailPlainText(initial.sanitizedContent) : '');
  const [contactId, setContactId] = useState<number | undefined>(initial?.contactId);
  const [templateCode, setTemplateCode] = useState('');
  const [ready, setReady] = useState(false);
  const [configuration, setConfiguration] = useState('请选择联系人和模板并套用，核验当前邮件渠道；保存草稿无需启用外部服务。');
  const [fromAddress, setFromAddress] = useState('');
  const [toAddresses, setToAddresses] = useState('');
  const [ccAddresses, setCcAddresses] = useState('');
  const [remark, setRemark] = useState(initial?.remark || '');
  const [attachments, setAttachments] = useState<EmailFile[]>(initial?.attachments || []);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [discard, setDiscard] = useState(false);
  const [confirmSend, setConfirmSend] = useState(false);
  const locked = useRef(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { onBusyChange?.(busy); return () => onBusyChange?.(false); }, [busy, onBusyChange]);
  useEffect(() => {
    if (!dirty) return;
    const preventLoss = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener('beforeunload', preventLoss);
    return () => window.removeEventListener('beforeunload', preventLoss);
  }, [dirty]);
  const changed = () => { setDirty(true); setNotice(''); };
  const close = () => { if (locked.current) return; if (dirty) setDiscard(true); else onClose(); };
  const run = async (action: () => Promise<void>) => {
    if (locked.current) return;
    locked.current = true; setBusy(true); setError(''); setNotice('');
    try { await action(); }
    catch (failure) { if (alive.current) setError(getErrorMessage(failure, '邮件操作失败，输入已保留')); }
    finally { locked.current = false; if (alive.current) setBusy(false); }
  };
  const addresses = (input: string) => input.split(/[,;\n，；]/).map(value => value.trim()).filter(Boolean);
  const payload = (): CustomerEmailRequest => ({ requestKey, bizType, bizId, contactId, subject: subject.trim(), content: emailTextHtml(body),
    templateCode: inbound ? undefined : templateCode || undefined, fileIds: attachments.map(file => file.fileId), remark: remark.trim() || undefined,
    ...(inbound ? { fromAddress: fromAddress.trim(), toAddresses: addresses(toAddresses), ccAddresses: addresses(ccAddresses) } : {}) });
  const submit = (sending: boolean) => void run(async () => {
    const result = await (inbound ? emailArchive.inbound(payload()) : sending ? emailArchive.send(payload()) : emailArchive.draft(payload()));
    if (!alive.current) return;
    setNotice(result.message); setDirty(false); onSaved();
    if (result.sendStatus !== 'DRAFT') onClose();
    else if (sending && result.code !== 'DRAFT_SAVED') { setReady(false); setConfiguration(result.message); }
  });
  const applyTemplate = () => {
    if (body.trim() && !window.confirm('套用模板将替换当前正文；是否继续？')) return;
    void run(async () => {
      const preview = await emailArchive.template(templateCode, bizType, bizId, contactId);
      if (!alive.current) return;
      setBody(emailPlainText(preview.content)); setReady(preview.ready); setConfiguration(preview.reason); setDirty(true);
      if (!subject.trim()) setSubject(context.data?.businessName || '客户业务往来');
    });
  };
  const upload = (selected: File[]) => void run(async () => {
    if (selected.length + attachments.length > 10 || selected.reduce((total, file) => total + file.size, 0) + attachments.reduce((total, file) => total + file.fileSize, 0) > 10 * 1024 * 1024) throw new Error('附件最多10个、总计10 MB');
    for (const file of selected) {
      if (!/\.(pdf|png|jpe?g)$/i.test(file.name)) throw new Error('仅支持PDF、PNG和JPEG附件');
      const uploaded = await emailArchive.upload(bizType, bizId, file, inbound);
      if (!alive.current) return;
      setAttachments(previous => [...previous, uploaded]); setDirty(true);
    }
  });
  const valid = Boolean(subject.trim() && body.trim() && context.data && (inbound ? fromAddress.trim() && toAddresses.trim() && remark.trim() : contactId));
  const contactOptions = Object.fromEntries((context.data?.contacts || []).map(contact => [contact.contactId, `${contact.contactName} · ${contact.emailMask}`]));

  return <><BaseDialog open title={inbound ? '手工归档客户来信' : '客户邮件草稿'} width="wide" onClose={close} closeOnEscape={!busy && !discard && !confirmSend} hideCloseButton={busy}
    description={context.data ? `${context.data.businessName} · 内容和附件仅对有权访问此业务的人员可见` : '正在核实所属业务'}
    panelClassName="crm-email-compose" footerClassName="flex-wrap" footer={<>
      <Button variant="outline" disabled={busy} onClick={close}>关闭</Button>
      {!inbound && <Button variant="outline" disabled={busy || !valid} onClick={() => submit(false)}>保存邮件草稿</Button>}
      <Button disabled={busy || !valid || !inbound && !ready} onClick={() => inbound ? submit(false) : setConfirmSend(true)}>{busy ? '正在处理…' : inbound ? '归档来信' : '确认发送邮件'}</Button>
    </>}>
    <div className="space-y-4">
      {(error || context.error || templates.error) && <p role="alert" className="crm-ops-warning">{error || context.error || templates.error}</p>}
      {notice && <p role="status" className="crm-ops-warning">{notice}</p>}
      {!inbound && <p role="status" className="crm-ops-warning">{configuration}{!ready && ' 邮件未发送，可保存草稿。'}</p>}
      {inbound && <p className="text-sm text-cf-muted">请粘贴重要来信并填写来源说明；系统不登录或自动读取邮箱。</p>}
      <fieldset disabled={busy || context.loading || Boolean(context.error)} className="grid min-w-0 gap-4 md:grid-cols-2">
        <Field label={inbound ? '客户联系人（选填）' : '收件联系人'}><OpsSelect label="邮件联系人" value={contactId} options={contactOptions} empty={inbound ? '不关联具体联系人' : '请选择有效联系人'} onChange={value => { setContactId(value ? Number(value) : undefined); setReady(false); changed(); }} /></Field>
        {!inbound && <div className="space-y-2"><Field label="邮件模板"><OpsSelect label="客户邮件模板" value={templateCode} options={Object.fromEntries((templates.data || []).map(template => [template.templateCode, template.templateName]))} empty={templates.loading ? '正在读取模板' : '请选择模板'} onChange={value => { setTemplateCode(value); setReady(false); changed(); }} /></Field><Button variant="outline" disabled={!templateCode || !contactId} onClick={applyTemplate}>套用模板并检查渠道</Button></div>}
        {inbound && <><Field label="来信发件邮箱"><Input aria-label="来信发件邮箱" type="email" maxLength={254} value={fromAddress} onChange={event => { setFromAddress(event.target.value); changed(); }} /></Field>
          <Field label="原收件邮箱（多个用逗号分隔）"><Input aria-label="来信收件邮箱" value={toAddresses} maxLength={12750} onChange={event => { setToAddresses(event.target.value); changed(); }} /></Field>
          <Field label="原抄送邮箱（选填）"><Input aria-label="来信抄送邮箱" value={ccAddresses} maxLength={12750} onChange={event => { setCcAddresses(event.target.value); changed(); }} /></Field></>}
        <Field label="邮件主题" wide><Input aria-label="客户邮件主题" maxLength={200} value={subject} onChange={event => { setSubject(event.target.value); changed(); }} /></Field>
        <Field label="邮件正文（纯文字）" wide><Textarea aria-label="客户邮件正文" rows={8} maxLength={170000} value={body} onChange={event => { setBody(event.target.value); changed(); }} /></Field>
        <Field label={inbound ? '来信来源说明（必填）' : '归档备注（选填）'} wide><Textarea aria-label="邮件来源说明" rows={2} maxLength={500} value={remark} onChange={event => { setRemark(event.target.value); changed(); }} /></Field>
        <div className="space-y-2 md:col-span-2"><Field label="私有附件（PDF、PNG、JPEG，最多10个且合计10 MB）"><input aria-label="客户邮件私有附件" type="file" multiple accept=".pdf,.png,.jpg,.jpeg" className="min-h-11 w-full min-w-0 text-sm" onChange={event => { const selected = Array.from(event.currentTarget.files || []); event.currentTarget.value = ''; if (selected.length) upload(selected); }} /></Field>
          {attachments.length > 0 && <ul className="space-y-2">{attachments.map(file => <li key={file.fileId} className="flex items-center justify-between gap-2 rounded border border-cf-border p-2 text-sm"><span className="min-w-0 break-all">{file.fileName} · {(file.fileSize / 1024).toFixed(1)} KB</span><Button variant="ghost" aria-label={`移除附件 ${file.fileName}`} onClick={() => { setAttachments(previous => previous.filter(item => item.fileId !== file.fileId)); changed(); }}>移除</Button></li>)}</ul>}
        </div>
      </fieldset>
      <details><summary className="min-h-11 cursor-pointer py-3 text-sm font-medium">查看安全正文预览</summary><EmailBody html={emailTextHtml(body)} title="客户邮件安全预览" /></details>
      <p className="text-xs text-cf-muted">预览不加载外站图片或链接。邮件服务器接纳后才显示发送成功；打开观察保留30天，像素请求不证明客户已阅读。</p>
    </div>
  </BaseDialog>
    <ConfirmDialog open={discard} title="关闭未保存的邮件？" message="未保存的修改将丢失；已保存的邮件草稿仍保留在归档列表。" confirmText="放弃修改并关闭" cancelText="继续编辑" danger onCancel={() => setDiscard(false)} onConfirm={() => { if (!locked.current) onClose(); }} />
    <ConfirmDialog open={confirmSend} title="确认提交客户邮件？" message={`将向所选客户联系人提交“${subject}”。排队不代表发送成功，结果未明时不能自动重发。`} confirmText="提交发送" cancelText="继续核对" onCancel={() => setConfirmSend(false)} onConfirm={() => { setConfirmSend(false); submit(true); }} />
  </>;
}
