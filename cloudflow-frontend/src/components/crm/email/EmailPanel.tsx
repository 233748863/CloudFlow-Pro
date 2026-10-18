import React, { useEffect, useState } from 'react';
import { BaseDialog, Button, Pagination } from '@/components/common';
import { emailArchive, type CustomerEmail, type EmailBusinessType } from '@/services/api/crm/emailArchive';
import { OpsSelect, useAccess, useRemote } from '../operations/OperationsKit';
import { EmailComposeDialog } from './EmailComposeDialog';
import { EmailRecordDialog } from './EmailRecordDialog';
import { emailBusinessNames, emailStates, EmailStatus } from './EmailBody';

interface Props { bizType?: EmailBusinessType; bizId?: number; customerId?: number; onEditingChange?: (editing: boolean) => void }

export function EmailPanel({ bizType, bizId, customerId, onEditingChange }: Props) {
  const can = useAccess();
  const [page, setPage] = useState(1);
  const [direction, setDirection] = useState('');
  const [status, setStatus] = useState('');
  const [selected, setSelected] = useState<number>();
  const [compose, setCompose] = useState<{ inbound: boolean; initial?: CustomerEmail }>();
  const permitted = can('crm:email:list');
  const source = useRemote(() => permitted ? emailArchive.list({ bizType, bizId, customerId, direction: direction || undefined, sendStatus: status || undefined, pageNum: page, pageSize: 10 }) : Promise.resolve({ rows: [], total: 0 }), [bizType, bizId, customerId, direction, status, page, permitted]);
  useEffect(() => { onEditingChange?.(Boolean(compose)); return () => onEditingChange?.(false); }, [compose, onEditingChange]);
  if (!permitted) return <p role="alert">无权查看客户邮件。</p>;
  return <section aria-label="客户邮件往来" className="min-w-0 space-y-4">
    <p className="text-sm text-cf-muted">统一保存客户业务邮件与重要来信。排队和发送中均不代表邮件服务器已接纳。</p>
    <div className="flex flex-wrap gap-3">
      {bizType && bizId && can('crm:email:send') && <Button onClick={() => setCompose({ inbound: false })}>新建客户邮件</Button>}
      {bizType && bizId && can('crm:email:archive') && <Button variant="outline" onClick={() => setCompose({ inbound: true })}>手工归档来信</Button>}
      <Button variant="outline" disabled={source.loading} onClick={source.refresh}>刷新邮件归档</Button>
    </div>
    <fieldset disabled={Boolean(compose)} className="grid gap-3 sm:grid-cols-2">
      <OpsSelect label="邮件往来方向" value={direction} empty="全部方向" options={{ OUTBOUND: '向客户发信', INBOUND: '手工来信' }} onChange={value => { setDirection(value); setPage(1); }} />
      <OpsSelect label="邮件投递状态" value={status} empty="全部状态" options={emailStates} onChange={value => { setStatus(value); setPage(1); }} />
    </fieldset>
    {source.error && <p role="alert" className="crm-ops-warning">{source.error}</p>}
    {source.loading && <p role="status">正在读取邮件归档…</p>}
    {!source.loading && !source.error && !source.data?.rows.length && <p className="py-8 text-center text-sm text-cf-muted">暂无客户邮件记录</p>}
    <ul className="grid min-w-0 gap-3 lg:grid-cols-2">{source.data?.rows.map(record => <li key={record.emailId} className="min-w-0 rounded-lg border border-cf-border bg-cf-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-2"><span className="text-xs text-cf-muted">{record.direction === 'INBOUND' ? '手工来信' : '向客户发信'} · {emailBusinessNames[record.bizType]} #{record.bizId}</span><EmailStatus value={record.sendStatus} /></div>
      <h4><button type="button" className="min-h-11 w-full break-words py-2 text-left font-semibold text-cf-title focus-visible:outline focus-visible:outline-2" onClick={() => setSelected(record.emailId)}>{record.subject}</button></h4>
      <p className="line-clamp-2 break-words text-sm text-cf-muted">{record.contentSummary}</p>
      <div className="mt-3 flex flex-wrap justify-between gap-2 text-xs text-cf-muted"><time>{record.sendTime || record.createTime}</time><span>{record.attachmentCount} 个私有附件 · {record.createBy || '系统'}</span></div>
    </li>)}</ul>
    <Pagination page={page} pageSize={10} total={source.data?.total || 0} onPageChange={setPage} showPageSizeSelector={false} onPageSizeChange={() => undefined} />
    {selected && <EmailRecordDialog key={selected} emailId={selected} onClose={() => setSelected(undefined)} onEdit={record => { setSelected(undefined); setCompose({ inbound: false, initial: record }); }} />}
    {compose && (compose.initial || bizType && bizId) && <EmailComposeDialog key={compose.initial?.emailId || (compose.inbound ? 'inbound' : 'outbound')} bizType={compose.initial?.bizType || bizType!} bizId={compose.initial?.bizId || bizId!} inbound={compose.inbound} initial={compose.initial} onSaved={source.refresh} onClose={() => setCompose(undefined)} />}
  </section>;
}

export function EmailBusinessButton({ bizType, bizId }: { bizType: EmailBusinessType; bizId?: number }) {
  const can = useAccess();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  if (!bizId || !can('crm:email:list')) return null;
  return <><Button variant="outline" onClick={() => setOpen(true)}>客户邮件往来</Button>{open && <BaseDialog open title={`${emailBusinessNames[bizType]}邮件往来`} width="wide" onClose={() => { if (!editing) setOpen(false); }} closeOnEscape={!editing} hideCloseButton={editing}>
    <EmailPanel bizType={bizType} bizId={bizId} onEditingChange={setEditing} />
  </BaseDialog>}</>;
}
