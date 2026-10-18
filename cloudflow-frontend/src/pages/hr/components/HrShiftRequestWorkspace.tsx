import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Eye, Plus, RefreshCw } from 'lucide-react';
import { BaseDialog, Button } from '@/components/common';
import { useAuth } from '@/context/AuthContext';
import { useWorkflowRefresh } from '@/hooks/useWorkflowRefresh';
import { hrShiftRequestApi } from '@/services/api/hr/shift-request';
import { Hr09Error, hasHr09Action, shiftQuery } from '@/services/api/hr/hr09Model';
import type { ShiftApplicationStatus, ShiftInvitationVO, ShiftRequestDetailVO, ShiftRequestQuery, ShiftStatus } from '@/services/api/hr/hr09Types';
import { HrShiftDraftDialog } from './HrShiftDraftDialog';
import { Hr09ErrorNotice, Hr09FormDialog, Hr09Input, Hr09ListLayout, Hr09Notice, Hr09Page, Hr09Select, Hr09Slots, Hr09State, Hr09Status, Hr09Table, Hr09Textarea, Hr09Value, applicationStatuses, asOptions, dateTimeText, shiftModes, shiftStatuses, useHr09Resource } from './Hr09Shared';

function ShiftFilters({ onApply, invitations = false }: { onApply: (query: ShiftRequestQuery) => void; invitations?: boolean }) {
  const [filters, setFilters] = useState({ dateFrom: '', dateTo: '', status: '', applicationStatus: '' });
  const [error, setError] = useState<Hr09Error>();
  return <form className="card space-y-3 p-4" onSubmit={event => {
    event.preventDefault();
    try { const query = shiftQuery({ ...filters, pageNum: 1, pageSize: 10, status: filters.status as ShiftStatus || undefined, applicationStatus: invitations ? undefined : filters.applicationStatus as ShiftApplicationStatus || undefined }, false); onApply(query); setError(undefined); }
    catch (caught) { setError(caught instanceof Hr09Error ? caught : new Hr09Error('筛选条件无效。')); }
  }}><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Hr09Input label="考勤日起" type="date" value={filters.dateFrom} onChange={event => setFilters(previous => ({ ...previous, dateFrom: event.target.value }))} /><Hr09Input label="考勤日止" type="date" value={filters.dateTo} onChange={event => setFilters(previous => ({ ...previous, dateTo: event.target.value }))} /><Hr09Select label="申请状态" value={filters.status} placeholder="全部申请状态" options={asOptions(shiftStatuses)} onChange={value => setFilters(previous => ({ ...previous, status: value }))} />{!invitations && <Hr09Select label="排班应用状态" value={filters.applicationStatus} placeholder="全部应用状态" options={asOptions(applicationStatuses)} onChange={value => setFilters(previous => ({ ...previous, applicationStatus: value }))} />}</div><div className="flex flex-wrap gap-2"><Button type="submit">查询</Button><Button type="button" variant="outline" onClick={() => { setFilters({ dateFrom: '', dateTo: '', status: '', applicationStatus: '' }); setError(undefined); onApply({ pageNum: 1, pageSize: 10 }); }}>重置筛选</Button></div><Hr09ErrorNotice error={error} /></form>;
}

type ShiftOperation = 'DELETE' | 'SUBMIT' | 'CANCEL' | 'RETRY_APPLICATION';

export function HrShiftRequestWorkspace({ mine }: { mine: boolean }) {
  const { hasPermission } = useAuth();
  const [search, setSearch] = useSearchParams();
  const [selectedId, setSelectedId] = useState(search.get('id') || search.get('requestId') || '');
  const [query, setQuery] = useState<ShiftRequestQuery>({ pageNum: 1, pageSize: 10 });
  const [draft, setDraft] = useState<{ record?: ShiftRequestDetailVO } | null>(null);
  const [operation, setOperation] = useState<{ action: ShiftOperation; record: ShiftRequestDetailVO } | null>(null);
  const [reason, setReason] = useState('');
  const list = useHr09Resource(signal => hrShiftRequestApi.list(query, mine, signal), [query, mine]);
  const detail = useHr09Resource(signal => hrShiftRequestApi.detail(selectedId, signal), [selectedId], Boolean(selectedId));
  const refresh = () => { list.refresh(); detail.refresh(); };
  useWorkflowRefresh(refresh, 'HR_SHIFT_REQUEST');
  useEffect(() => setSelectedId(search.get('id') || search.get('requestId') || ''), [search]);
  const canApply = mine && hasPermission('hr:shift-request:apply');
  const closeDetail = () => {
    setSelectedId('');
    if (search.has('id') || search.has('requestId')) setSearch(previous => { const next = new URLSearchParams(previous); next.delete('id'); next.delete('requestId'); return next; }, { replace: true });
  };
  const reload = () => { setOperation(null); setDraft(null); refresh(); };
  const saved = (record: ShiftRequestDetailVO) => { setSelectedId(record.requestId); refresh(); };
  const can = (record: ShiftRequestDetailVO, action: ShiftOperation | 'EDIT') => {
    if (!hasHr09Action(record, action)) return false;
    if (['EDIT', 'DELETE', 'SUBMIT'].includes(action)) return canApply && record.status === 'DRAFT';
    if (action === 'CANCEL') return mine && hasPermission('hr:shift-request:cancel') && ['DRAFT', 'WAITING_ACCEPTANCE', 'PENDING', 'APPROVING'].includes(record.status);
    return !mine && hasPermission('hr:shift-request:retry') && record.status === 'APPROVED' && record.applicationStatus === 'FAILED';
  };
  const begin = (record: ShiftRequestDetailVO, action: ShiftOperation) => { setReason(''); setOperation({ action, record }); };
  const record = detail.data;
  return <Hr09Page title={mine ? '我的调班' : '调班管理'} description="申请审批与排班应用分开记录；双方互换先由被邀请人本人同意，不允许代同意。" actions={<><Button variant="outline" disabled={list.loading} onClick={refresh}><RefreshCw size={16} className="mr-2" />刷新</Button>{canApply && <Button onClick={() => setDraft({})}><Plus size={16} className="mr-2" />登记调班</Button>}</>}>
    <Hr09ListLayout filters={<ShiftFilters onApply={setQuery} />} total={list.data?.total} page={query.pageNum} pageSize={query.pageSize} onPageChange={pageNum => setQuery(previous => ({ ...previous, pageNum }))} table={<Hr09Table rows={list.data?.rows || []} rowKey={row => row.requestId} loading={list.loading} error={list.error} onRefresh={list.refresh} emptyText={mine ? '尚无本人调班申请' : '当前范围暂无调班申请'} columns={[
      { key: 'request', label: '申请单号 / 申请人', render: row => <>{row.requestNo}<div className="mt-1 text-xs text-cf-subtle">{row.employeeName}{!mine && row.deptName ? ` · ${row.deptName}` : ''}</div></> },
      { key: 'date', label: '考勤日 / 方式', render: row => <>{row.fromDate}<div className="mt-1 text-xs text-cf-subtle">{shiftModes[row.requestMode]}</div></> },
      { key: 'shift', label: '原班次 / 目标班次', render: row => <>{row.fromShiftName}<div className="mt-1 text-xs text-cf-subtle">调整为：{row.toShiftName}</div></> },
      { key: 'peer', label: '互换对象 / 同意', render: row => <>{row.swapEmployeeName || '无需互换对象'}<div className="mt-1"><Hr09Status kind="peer" value={row.peerAcceptanceStatus} /></div></> },
      { key: 'status', label: '申请状态', render: row => <Hr09Status kind="shift" value={row.status} /> },
      { key: 'application', label: '应用状态', render: row => <Hr09Status kind="application" value={row.applicationStatus} /> },
      { key: 'action', label: '操作', render: row => <Button size="sm" variant="outline" className="min-h-11 sm:min-h-9" onClick={() => setSelectedId(row.requestId)}><Eye size={14} className="mr-1" />查看 / 处理</Button> },
    ]} />} />
    <BaseDialog open={Boolean(selectedId) && !draft && !operation} title={record ? `${record.requestNo} · 调班详情` : '调班详情'} width="extra-wide" onClose={closeDetail} footer={<Button variant="outline" onClick={detail.refresh}>重新读取详情</Button>}>
      {detail.loading ? <Hr09State loading title="正在读取调班详情" /> : detail.error ? <Hr09State error title="调班详情读取失败" description={detail.error.message} onRetry={detail.refresh} /> : record ? <div className="space-y-5">
        <div className="flex flex-wrap gap-3"><Hr09Status kind="shift" value={record.status} /><Hr09Status kind="application" value={record.applicationStatus} /><Hr09Status kind="peer" value={record.peerAcceptanceStatus} /><span className="text-xs text-cf-subtle">版本 {record.version}</span></div>
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"><Hr09Value label="申请人 / 部门">{record.employeeName} / {record.deptName}</Hr09Value><Hr09Value label="考勤日期">{record.fromDate}</Hr09Value><Hr09Value label="调班方式">{shiftModes[record.requestMode]}</Hr09Value><Hr09Value label="本人原班次">{record.fromShiftName}</Hr09Value><Hr09Value label="本人目标班次">{record.toShiftName}</Hr09Value><Hr09Value label="互换对象">{record.swapEmployeeName || '无需互换对象'}</Hr09Value><Hr09Value label="已核定最短休息间隔">{record.minimumRestMinutes == null ? '未配置，无法提交' : `${record.minimumRestMinutes} 分钟`}</Hr09Value><Hr09Value label="对方回应时间">{dateTimeText(record.peerRespondedTime)}</Hr09Value><Hr09Value label="应用完成时间">{dateTimeText(record.appliedTime)}</Hr09Value><Hr09Value label="调班事由">{record.reason}</Hr09Value><Hr09Value label="对方回应说明">{record.peerResponseNote}</Hr09Value><Hr09Value label="正式审批标识">{record.instanceId || '尚未启动'}</Hr09Value></dl>
        <Hr09Slots title="服务端确认的排班前后对照" before={record.beforeSlots || []} after={record.afterSlots || []} names={{ [record.employeeId]: record.employeeName, ...(record.swapEmployeeId ? { [record.swapEmployeeId]: record.swapEmployeeName || '互换对象' } : {}) }} />
        {record.lastErrorCode && <Hr09Notice danger>{record.lastErrorCode}：{record.lastErrorMessage || '排班尚未应用，请核查冲突。'}</Hr09Notice>}
        {record.status === 'APPROVED' && record.applicationStatus !== 'APPLIED' && <Hr09Notice>审批已通过，排班尚未应用成功；当前不能视为已经调班。重试保留原排班依据，来源变化时必须重新处理。</Hr09Notice>}
        <div className="flex flex-wrap gap-2">{can(record, 'EDIT') && <Button variant="outline" onClick={() => setDraft({ record })}>修改草稿</Button>}{can(record, 'DELETE') && <Button variant="destructive" onClick={() => begin(record, 'DELETE')}>删除草稿</Button>}{can(record, 'SUBMIT') && <Button onClick={() => begin(record, 'SUBMIT')}>提交调班</Button>}{can(record, 'CANCEL') && <Button variant="warning" onClick={() => begin(record, 'CANCEL')}>撤回申请</Button>}{can(record, 'RETRY_APPLICATION') && <Button variant="warning" onClick={() => begin(record, 'RETRY_APPLICATION')}>重试原排班应用</Button>}</div>
      </div> : <Hr09State error title="服务端未返回调班详情" onRetry={detail.refresh} />}
    </BaseDialog>
    {draft && canApply && <HrShiftDraftDialog record={draft.record} onClose={() => setDraft(null)} onSaved={saved} onReload={reload} />}
    {operation && <Hr09FormDialog title={{ DELETE: '确认删除调班草稿', SUBMIT: '确认提交调班', CANCEL: '确认撤回调班申请', RETRY_APPLICATION: '确认重试排班应用' }[operation.action]} onClose={() => setOperation(null)} onReload={reload} blocked={!can(operation.record, operation.action)} confirmation={operation.action === 'DELETE' ? '确认删除此草稿，保留创建防重记录。' : operation.action === 'CANCEL' ? '确认撤回审批前的申请；原同意不用于其他申请，已通过的申请不能撤回。' : operation.action === 'RETRY_APPLICATION' ? '确认仅按原排班依据重试；双方排班全部成功才算完成，不能选用新的班次或参与人。' : '已核对双方调整前后班次，确认提交；互换由对方本人回应，正式通过后才应用排班。'} successText="操作已完成，请查看申请及应用状态" onSubmit={async () => {
      if (!can(operation.record, operation.action)) throw new Hr09Error('当前记录不允许此操作。', 403);
      const current = operation.record;
      if (operation.action === 'DELETE') { await hrShiftRequestApi.remove(current.requestId, current.version); closeDetail(); list.refresh(); }
      else if (operation.action === 'SUBMIT') saved(await hrShiftRequestApi.submit(current.requestId, current.version));
      else if (operation.action === 'CANCEL') saved(await hrShiftRequestApi.cancel(current.requestId, { version: current.version, reason }));
      else saved(await hrShiftRequestApi.retry(current.requestId, { version: current.version, reason }));
    }}><Hr09Notice>{operation.record.requestNo} · {operation.record.employeeName} · {operation.record.fromDate} · {operation.record.fromShiftName} → {operation.record.toShiftName}</Hr09Notice>{['CANCEL', 'RETRY_APPLICATION'].includes(operation.action) && <Hr09Textarea label={operation.action === 'CANCEL' ? '撤回原因' : '重试原因'} required maxLength={500} rows={3} value={reason} onChange={event => setReason(event.target.value)} />}</Hr09FormDialog>}
  </Hr09Page>;
}

function InvitationSummary({ invitation }: { invitation: ShiftInvitationVO }) {
  const valid = invitation.ownBefore && invitation.ownAfter && invitation.applicantBefore && invitation.applicantAfter;
  return <div className="space-y-4"><div className="flex flex-wrap gap-3"><Hr09Status kind="shift" value={invitation.status} /><Hr09Status kind="peer" value={invitation.peerAcceptanceStatus} /></div><dl className="grid gap-4 sm:grid-cols-2"><Hr09Value label="申请人">{invitation.applicantName}</Hr09Value><Hr09Value label="考勤日期">{invitation.attendanceDate}</Hr09Value><Hr09Value label="互换事由">{invitation.reason}</Hr09Value><Hr09Value label="本次确认版本">{invitation.version}</Hr09Value></dl>{valid ? <Hr09Slots title="本次邀请的固定确认摘要" before={[invitation.ownBefore, invitation.applicantBefore]} after={[invitation.ownAfter, invitation.applicantAfter]} names={{ [invitation.ownBefore.employeeId]: '本人', [invitation.applicantBefore.employeeId]: invitation.applicantName }} /> : <Hr09Notice danger>邀请的双方排班摘要不完整，不能回应。</Hr09Notice>}</div>;
}

export function HrShiftInvitationWorkspace() {
  const { hasPermission } = useAuth();
  const [search, setSearch] = useSearchParams();
  const [selectedId, setSelectedId] = useState(search.get('id') || search.get('requestId') || '');
  const [query, setQuery] = useState<ShiftRequestQuery>({ pageNum: 1, pageSize: 10 });
  const [decision, setDecision] = useState<'ACCEPTED' | 'DECLINED' | null>(null);
  const [note, setNote] = useState('');
  const list = useHr09Resource(signal => hrShiftRequestApi.invitations(query, signal), [query]);
  const detail = useHr09Resource(signal => hrShiftRequestApi.invitation(selectedId, signal), [selectedId], Boolean(selectedId));
  useEffect(() => setSelectedId(search.get('id') || search.get('requestId') || ''), [search]);
  const refresh = () => { list.refresh(); detail.refresh(); };
  useWorkflowRefresh(refresh, 'HR_SHIFT_REQUEST');
  const invitation = detail.data;
  const canRespond = (nextDecision: 'ACCEPTED' | 'DECLINED') => Boolean(invitation && hasPermission('hr:shift-request:respond') && hasHr09Action(invitation, nextDecision === 'ACCEPTED' ? 'ACCEPT_INVITATION' : 'DECLINE_INVITATION') && invitation.status === 'WAITING_ACCEPTANCE' && invitation.peerAcceptanceStatus === 'PENDING' && invitation.ownBefore && invitation.ownAfter && invitation.applicantBefore && invitation.applicantAfter);
  const close = () => {
    setSelectedId('');
    if (search.has('id') || search.has('requestId')) setSearch(previous => { const next = new URLSearchParams(previous); next.delete('id'); next.delete('requestId'); return next; }, { replace: true });
  };
  return <Hr09Page title="换班邀请" description="仅展示本人收到的固定邀请摘要；本人同意后进入正式审批，管理员也不能代为同意。" actions={<Button variant="outline" disabled={list.loading} onClick={refresh}><RefreshCw size={16} className="mr-2" />刷新邀请</Button>}>
    <Hr09ListLayout filters={<ShiftFilters invitations onApply={setQuery} />} total={list.data?.total} page={query.pageNum} pageSize={query.pageSize} onPageChange={pageNum => setQuery(previous => ({ ...previous, pageNum }))} table={<Hr09Table rows={list.data?.rows || []} rowKey={row => row.requestId} loading={list.loading} error={list.error} onRefresh={list.refresh} emptyText="暂无本人收到的换班邀请" columns={[
      { key: 'request', label: '邀请单号', render: row => row.requestNo }, { key: 'applicant', label: '申请人', render: row => row.applicantName }, { key: 'date', label: '考勤日', render: row => row.attendanceDate },
      { key: 'before', label: '本人当前班次', render: row => row.ownBefore ? <>{dateTimeText(row.ownBefore.startTime)}<br />至 {dateTimeText(row.ownBefore.endTime)}</> : '摘要缺失' },
      { key: 'after', label: '本人调整后班次', render: row => row.ownAfter ? <>{dateTimeText(row.ownAfter.startTime)}<br />至 {dateTimeText(row.ownAfter.endTime)}</> : '摘要缺失' },
      { key: 'status', label: '本人回应', render: row => <Hr09Status kind="peer" value={row.peerAcceptanceStatus} /> },
      { key: 'action', label: '操作', render: row => <Button variant="outline" size="sm" className="min-h-11 sm:min-h-9" onClick={() => { setSelectedId(row.requestId); setDecision(null); }}>查看邀请摘要</Button> },
    ]} />} />
    <BaseDialog open={Boolean(selectedId) && !decision} title={invitation ? `${invitation.requestNo} · 换班邀请` : '换班邀请'} onClose={close} width="extra-wide" footer={<div className="flex flex-wrap gap-2"><Button variant="outline" onClick={detail.refresh}>重新读取邀请</Button>{canRespond('DECLINED') && <Button variant="warning" onClick={() => { setNote(''); setDecision('DECLINED'); }}>拒绝邀请</Button>}{canRespond('ACCEPTED') && <Button onClick={() => { setNote(''); setDecision('ACCEPTED'); }}>本人同意</Button>}</div>}>
      {detail.loading ? <Hr09State loading title="正在读取本人邀请摘要" /> : detail.error ? <Hr09State error title="邀请读取失败" description={detail.error.message} onRetry={detail.refresh} /> : invitation ? <InvitationSummary invitation={invitation} /> : <Hr09State error title="未返回可确认的邀请" onRetry={detail.refresh} />}
    </BaseDialog>
    {decision && invitation && <Hr09FormDialog title={decision === 'ACCEPTED' ? '本人确认同意换班' : '本人确认拒绝换班'} onClose={() => setDecision(null)} onReload={() => { setDecision(null); refresh(); }} blocked={!canRespond(decision)} confirmation={decision === 'ACCEPTED' ? '已核对双方班次、日期和本次版本，由本人同意此固定内容；同意后仍需正式审批，不能修改或继承到其他申请。' : '确认拒绝本次邀请；申请结束，不产生审批流程或排班变更。'} successText={decision === 'ACCEPTED' ? '已回应同意，请等待正式审批与排班应用' : '已拒绝本次换班邀请'} onSubmit={async () => {
      if (!canRespond(decision)) throw new Hr09Error('该邀请当前不可回应，请重新读取。', 409);
      await hrShiftRequestApi.respond(invitation.requestId, { version: invitation.version, decision, note });
      refresh();
    }}><InvitationSummary invitation={invitation} /><Hr09Textarea label={decision === 'DECLINED' ? '拒绝原因' : '同意说明（可选）'} required={decision === 'DECLINED'} maxLength={500} rows={3} value={note} onChange={event => setNote(event.target.value)} /></Hr09FormDialog>}
  </Hr09Page>;
}
