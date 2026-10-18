import { useState } from 'react';
import { Button, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea, UserSelector } from '@/components/common';
import { crmApi, type CrmTicket } from '@/services/api/crm';
import { useCrmManagement } from '../store';
import { Field, OpsSelect, ticketPriorities, ticketStatuses, useMutation } from '../../operations/OperationsKit';
import { EmailBusinessButton } from '../../email/EmailPanel';

export function TicketDialogContent() {
  const { ticketForm, setTicketForm, customerOptions, ticketReady, ticketLoading, ticketSaveError, saving, dialog, openDialog } = useCrmManagement();
  const [latest, setLatest] = useState<CrmTicket>();
  const mutation = useMutation();
  const fromPortal = ticketForm.portalContactId != null;
  const pending = fromPortal && ticketForm.ownerId == null;
  if (!ticketReady) return <div className="space-y-3">{ticketLoading ? <p role="status">正在核对工单当前记录…</p> : <><p role="alert">{ticketSaveError || '工单未读取，暂不能修改'}</p><Button variant="outline" onClick={() => openDialog(dialog)}>重新读取工单</Button></>}</div>;
  return <fieldset disabled={saving} className="grid min-w-0 gap-4 md:grid-cols-2">
    {ticketSaveError && <div className="crm-ops-warning space-y-3 md:col-span-2"><p role="alert">{ticketSaveError}；输入仍保留，请先核对原保存结果。</p>
      {ticketForm.ticketId && <Button variant="outline" disabled={mutation.busy} onClick={() => void mutation.run(() => crmApi.getTicket(ticketForm.ticketId!), setLatest, '')}>读取最新工单（保留草稿）</Button>}
    </div>}
    {latest && <section className="crm-ops-warning space-y-3 md:col-span-2"><p>当前版本 {latest.version} · 负责人 {latest.ownerName || '待分派'} · 状态 {ticketStatuses[latest.status as keyof typeof ticketStatuses] || latest.status}</p><p className="whitespace-pre-wrap break-words">当前内部处理意见：{latest.solution || '未填写'}</p>
      <Button variant="outline" onClick={() => { setTicketForm(previous => ({ ...latest, severity: previous.severity, status: previous.status, solution: previous.solution, ticketTitle: latest.portalContactId ? latest.ticketTitle : previous.ticketTitle, description: latest.portalContactId ? latest.description : previous.description })); setLatest(undefined); }}>已核对，保留处理输入并采用最新版本</Button>
    </section>}
    {ticketForm.ticketId && <div className="md:col-span-2"><EmailBusinessButton bizType="TICKET" bizId={ticketForm.ticketId} /><p className="mt-2 text-xs text-cf-muted">邮件关联已保存的工单；当前工单修改需另行保存。</p></div>}
    {fromPortal && <p className="crm-ops-warning md:col-span-2">客户原始标题与描述固定保留；负责人须通过“门户处理”分派。此处仅保存内部意见，对外方案须明确发布。{pending && '此工单尚未分派，暂不能处理。'}</p>}
    <div className="md:col-span-2"><Select disabled={ticketForm.ticketId != null} value={ticketForm.customerId ? String(ticketForm.customerId) : ''} onValueChange={value => setTicketForm(previous => ({ ...previous, customerId: Number(value) }))}>
      <SelectTrigger aria-label="工单客户"><SelectValue placeholder={ticketForm.customerName || '选择客户'} /></SelectTrigger><SelectContent>{customerOptions.map(item => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
    </Select></div>
    <Field label="工单标题"><Input value={ticketForm.ticketTitle || ''} readOnly={fromPortal} maxLength={120} onChange={event => setTicketForm(previous => ({ ...previous, ticketTitle: event.target.value }))} /></Field>
    <Field label="工单优先级"><OpsSelect label="工单优先级" disabled={pending} value={ticketForm.severity || 'P4'} options={ticketPriorities} onChange={severity => setTicketForm(previous => ({ ...previous, severity }))} /></Field>
    <Field label="处理状态"><OpsSelect label="工单状态" disabled={pending} value={ticketForm.status || 'OPEN'} options={ticketStatuses} onChange={status => setTicketForm(previous => ({ ...previous, status }))} /></Field>
    {fromPortal ? <Field label="负责人（专用分派入口维护）"><Input readOnly value={ticketForm.ownerName || '待分派'} /></Field> : <div className="admin-dialog-field"><UserSelector single value={ticketForm.ownerId ? String(ticketForm.ownerId) : null}
      onChange={(userId, user) => setTicketForm(previous => ({ ...previous, ownerId: userId ? Number(userId) : undefined, ownerName: user?.name || '' }))} placeholder="搜索姓名、邮箱或部门选择负责人" /></div>}
    <Field label={fromPortal ? '客户原始描述（只读）' : '问题描述'} wide><Textarea value={ticketForm.description || ''} readOnly={fromPortal} maxLength={1000} rows={5} onChange={event => setTicketForm(previous => ({ ...previous, description: event.target.value }))} /></Field>
    <Field label="内部处理意见（不会自动对客户发布）" wide><Textarea disabled={pending} maxLength={1000} rows={4} value={ticketForm.solution || ''} onChange={event => setTicketForm(previous => ({ ...previous, solution: event.target.value }))} /></Field>
    <div className="crm-ops-warning md:col-span-2">响应截止：{ticketForm.firstResponseDue || '保存后按日历计算'}<br />解决截止：{ticketForm.resolutionDue || '保存后按策略计算'}{ticketForm.pauseStartTime && <><br />暂停开始：{ticketForm.pauseStartTime}</>}<br />截止时间由系统计算，优先级变更保留已消耗的工作分钟。</div>
  </fieldset>;
}
