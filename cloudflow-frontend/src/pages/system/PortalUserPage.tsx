import React, { useRef, useState } from 'react';
import { Button, Input } from '@/components/common';
import { BaseDialog } from '@/components/common/BaseDialog';
import { Empty, Field, OperationsPage, OpsSelect, useAccess, useRemote } from '@/components/crm/operations/OperationsKit';
import { portalUsers, type PortalAction, type PortalInvite, type PortalUser } from '@/services/api/system/portalUsers';
import { getErrorMessage } from '@/utils/errorMessage';
import '../portal/portal.css';

const statuses = { PENDING: '待激活', ACTIVE: '已启用', DISABLED: '已停用', LOCKED: '暂时锁定' };
const deliveries: Record<string, string> = { NOT_SENT: '未发送', PENDING: '排队中', CLAIMED: '准备发送', SENDING: '发送中', RETRYABLE: '等待安全重试', SUCCESS: '邮件服务已接纳', FAILED: '发送失败', SKIPPED: '未发送', UNKNOWN: '结果未明' };
const actions = { resend: '重发邀请', disable: '停用账号', 'reset-password': '重设密码并邀请' };

export default function PortalUserPage() {
  const hasPermission = useAccess();
  const readable = hasPermission('system:portal:user:list');
  const manageable = hasPermission('system:portal:user:manage');
  const [keyword, setKeyword] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [pageNum, setPageNum] = useState(1);
  const [notice, setNotice] = useState('');
  const records = useRemote(() => readable ? portalUsers.list({ keyword: query, status, pageNum, pageSize: 10 }) : Promise.resolve(undefined), [readable, query, status, pageNum]);
  const readiness = useRemote(() => readable ? portalUsers.readiness() : Promise.resolve(undefined), [readable]);
  const [inviting, setInviting] = useState(false);
  const [draft, setDraft] = useState<PortalInvite>({ contactId: 0, loginAccount: '' });
  const [contactSearch, setContactSearch] = useState('');
  const [contactQuery, setContactQuery] = useState('');
  const [contactPage, setContactPage] = useState(1);
  const choices = useRemote(() => inviting && manageable ? portalUsers.contacts({ keyword: contactQuery, pageNum: contactPage, pageSize: 10 }) : Promise.resolve(undefined), [inviting, manageable, contactQuery, contactPage]);
  const [target, setTarget] = useState<{ row: PortalUser; action: PortalAction }>();
  const [error, setError] = useState('');
  const [uncertain, setUncertain] = useState(false);
  const [reconciled, setReconciled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [discard, setDiscard] = useState(false);
  const lock = useRef(false);
  const refresh = () => { records.refresh(); readiness.refresh(); };
  const run = async (action: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true; setBusy(true);
    try { await action(); } catch (failure) { setError(getErrorMessage(failure, '请求失败，请核对最新结果')); setUncertain(true); }
    finally { lock.current = false; setBusy(false); }
  };
  const closeInvite = () => {
    if (busy) return;
    if (draft.contactId || draft.loginAccount || uncertain) setDiscard(true);
    else setInviting(false);
  };
  const resetDialog = () => { setError(''); setUncertain(false); setReconciled(false); };
  const complete = (row: PortalUser) => {
    setNotice(`${row.loginAccount}：${statuses[row.status]}。${row.pendingReason || ''}`);
    setInviting(false); setTarget(undefined); setDraft({ contactId: 0, loginAccount: '' }); resetDialog(); refresh();
  };
  const confirmInvite = () => run(async () => {
    if (!draft.contactId || !/^[a-z0-9][a-z0-9._@+-]{2,99}$/i.test(draft.loginAccount.trim())) {
      setError('请选择联系人，并填写3—100位字母、数字或邮箱格式的登录账号'); return;
    }
    complete(await portalUsers.invite({ ...draft, loginAccount: draft.loginAccount.trim() }));
  });
  const reconcile = () => run(async () => {
    const account = target?.row.loginAccount || draft.loginAccount.trim().toLowerCase();
    const result = await portalUsers.list({ keyword: account, pageSize: 100 });
    const found = result.rows.find(row => row.loginAccount === account && row.contactId === (target?.row.contactId || draft.contactId));
    if (!target && found) { complete(found); return; }
    if (target && found) {
      setReconciled(found.version !== target.row.version);
      setError(`当前状态：${statuses[found.status]}；版本${found.version}。${found.version !== target.row.version ? '状态已更新，请关闭此窗口后重新选择操作。' : '版本未变化，可以明确重试本次操作。'}`);
      refresh();
    } else setError('尚未查询到匹配记录，可以明确重试相同邀请；原输入已保留。');
    setUncertain(false);
  });
  if (!readable) return <p role="alert">无权查看客户门户账号。</p>;
  return <div className="portal-controls"><OperationsPage title="客户门户账号" description="将独立客户账号绑定到可信联系人，客户账号与内部员工权限隔离。"
    loading={records.loading} error={records.error} refresh={refresh}
    actions={manageable && <Button onClick={() => { resetDialog(); setInviting(true); }}>邀请客户联系人</Button>}
    filters={<form className="grid gap-3 sm:grid-cols-3" onSubmit={event => { event.preventDefault(); setQuery(keyword.trim()); setPageNum(1); }}>
      <Field label="搜索登录账号"><Input value={keyword} maxLength={100} onChange={event => setKeyword(event.target.value)} /></Field>
      <Field label="账号状态"><OpsSelect label="账号状态" value={status} options={statuses} empty="全部状态" onChange={value => { setStatus(value); setPageNum(1); }} /></Field>
      <div className="flex items-end"><Button variant="outline" type="submit">查询</Button></div>
    </form>}>
    <p role="status" className="crm-ops-warning">{readiness.loading ? '正在检查入口与邮件配置…' : readiness.error || (readiness.data?.available ? '入口与邮件已配置，实际邮件投递状态以每条记录为准。' : readiness.data?.reason || '暂时无法确认外部服务配置')} 保存邀请不会直接启用账号。</p>
    {notice && <p role="status" className="text-sm text-cf-body">{notice}</p>}
    <div className="portal-user-list">{records.data?.rows.map(row => <article key={row.portalUserId} aria-label={`门户账号 ${row.loginAccount}`} className="portal-user-card">
      <div className="min-w-0"><h3 className="break-all font-semibold text-cf-title">{row.loginAccount}</h3><p className="mt-1 break-all text-sm text-cf-muted">验证邮箱：{row.emailMask}</p><p className="mt-1 text-xs text-cf-muted">客户编号 {row.customerId} · 联系人编号 {row.contactId}</p></div>
      <div className="min-w-0 text-sm"><strong>{statuses[row.status]}</strong><p className="mt-1 text-cf-muted">邀请邮件：{deliveries[row.deliveryStatus] || '状态待核对'}</p>{row.pendingReason && <p className="mt-1 text-cf-muted">{row.pendingReason}</p>}{row.lockedUntil && row.status === 'LOCKED' && <p>锁定至 {row.lockedUntil}</p>}<p className="mt-1 text-xs text-cf-muted">最近登录：{row.lastLoginTime || '尚未登录'}</p></div>
      {manageable && <div className="flex flex-wrap items-start gap-2">{(['resend', 'disable', 'reset-password'] as const).filter(action => action === 'resend' ? row.status === 'PENDING' : action === 'disable' ? row.status !== 'DISABLED' : true).map(action => <Button key={action} variant="outline" onClick={() => { resetDialog(); setTarget({ row, action }); }}>{actions[action]}</Button>)}</div>}
    </article>)}</div>
    {!records.loading && !records.error && !records.data?.rows.length && <Empty text="当前范围内暂无客户门户账号" />}
    <div className="flex flex-wrap items-center justify-end gap-3 text-sm"><span>共 {records.data?.total || 0} 条 · 第 {pageNum} 页</span><Button variant="outline" disabled={records.loading || pageNum <= 1} onClick={() => setPageNum(value => value - 1)}>上一页</Button><Button variant="outline" disabled={records.loading || pageNum * 10 >= (records.data?.total || 0)} onClick={() => setPageNum(value => value + 1)}>下一页</Button></div>
  </OperationsPage>
  <BaseDialog open={inviting} title="邀请客户联系人" onClose={closeInvite} hideCloseButton={busy} closeOnEscape={!busy} panelClassName="portal-controls" footer={<><Button variant="outline" disabled={busy} onClick={closeInvite}>取消</Button>{uncertain ? <Button disabled={busy} onClick={() => void reconcile()}>核对邀请结果</Button> : <Button disabled={busy} onClick={() => void confirmInvite()}>{busy ? '正在保存…' : '保存并邀请'}</Button>}</>}>
    <div className="space-y-4"><p className="text-sm text-cf-muted">只能选择当前数据范围内的有效客户联系人；客户和验证邮箱由CRM资料确定。外部服务未配置时保存为待激活。</p>
      <form className="flex items-end gap-2" onSubmit={event => { event.preventDefault(); setContactQuery(contactSearch.trim()); setContactPage(1); setDraft(value => ({ ...value, contactId: 0 })); }}><Field label="搜索客户或联系人"><Input value={contactSearch} maxLength={100} disabled={busy || uncertain} onChange={event => setContactSearch(event.target.value)} /></Field><Button variant="outline" type="submit" disabled={busy || uncertain}>搜索</Button></form>
      {choices.error && <p role="alert">{choices.error}<Button variant="link" onClick={choices.refresh}>重新加载联系人</Button></p>}
      <Field label="客户联系人"><select className="cf-control w-full rounded-md px-3" aria-label="客户联系人" value={draft.contactId || ''} disabled={busy || uncertain || choices.loading} onChange={event => setDraft(value => ({ ...value, contactId: Number(event.target.value) }))}><option value="">请选择联系人</option>{choices.data?.rows.map(contact => <option key={contact.contactId} value={contact.contactId}>{contact.customerName} · {contact.contactName} · {contact.emailMask || '未填写邮箱'}</option>)}</select></Field>
      <div className="flex flex-wrap items-center gap-2 text-xs"><span>联系人第 {contactPage} 页</span><Button variant="outline" disabled={busy || uncertain || contactPage <= 1 || choices.loading} onClick={() => { setContactPage(value => value - 1); setDraft(value => ({ ...value, contactId: 0 })); }}>上一页联系人</Button><Button variant="outline" disabled={busy || uncertain || choices.loading || contactPage * 10 >= (choices.data?.total || 0)} onClick={() => { setContactPage(value => value + 1); setDraft(value => ({ ...value, contactId: 0 })); }}>下一页联系人</Button></div>
      <Field label="登录账号"><Input value={draft.loginAccount} maxLength={100} autoComplete="off" disabled={busy || uncertain} onChange={event => setDraft(value => ({ ...value, loginAccount: event.target.value }))} /></Field>
      {error && <p role="alert" className="crm-ops-warning">{error}</p>}
    </div>
  </BaseDialog>
  <BaseDialog open={Boolean(target)} title={target ? actions[target.action] : ''} onClose={() => { if (!busy) setTarget(undefined); }} hideCloseButton={busy} closeOnEscape={!busy} panelClassName="portal-controls" footer={<><Button variant="outline" disabled={busy} onClick={() => setTarget(undefined)}>关闭</Button>{uncertain ? <Button disabled={busy} onClick={() => void reconcile()}>核对当前状态</Button> : <Button disabled={busy || reconciled} onClick={() => void run(async () => { if (target) complete(await portalUsers.action(target.row.portalUserId, target.action, target.row.version)); })}>{busy ? '正在处理…' : '确认操作'}</Button>}</>}>
    <p className="break-all text-sm">{target?.row.loginAccount}</p><p className="mt-3 text-sm text-cf-muted">{target?.action === 'resend' ? '重新发送后旧激活链接立即失效，账号仍须由收件人完成激活。' : target?.action === 'disable' ? '立即停止此账号的客户门户访问，并撤销全部门户会话。' : '清除原密码并撤销全部门户会话，重新核验当前联系人和客户后发送激活邀请。'}</p>{error && <p role="alert" className="crm-ops-warning mt-3">{error}</p>}
  </BaseDialog>
  <BaseDialog open={discard} title="放弃本次邀请输入？" onClose={() => setDiscard(false)} panelClassName="portal-controls" footer={<><Button variant="outline" onClick={() => setDiscard(false)}>继续填写</Button><Button onClick={() => { setDiscard(false); setInviting(false); setDraft({ contactId: 0, loginAccount: '' }); resetDialog(); }}>放弃输入</Button></>}><p className="text-sm text-cf-muted">尚未保存的内容会清空；已提交但结果未明的邀请仍可在列表中核对。</p></BaseDialog>
  </div>;
}
