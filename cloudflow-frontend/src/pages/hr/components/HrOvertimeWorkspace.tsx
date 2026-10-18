import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Download, Eye, Filter, Plus, RefreshCw } from 'lucide-react';
import { BaseDialog, Button } from '@/components/common';
import { useAuth } from '@/context/AuthContext';
import { useWorkflowRefresh } from '@/hooks/useWorkflowRefresh';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { MobileFilterDrawer } from '@/components/mobile/MobileFilterDrawer';
import { downloadBlob } from '@/utils/download';
import { hrOvertimeApi } from '@/services/api/hr/overtime';
import { Hr09Error, hasHr09Action, overtimeQuery, shanghaiDate } from '@/services/api/hr/hr09Model';
import type { OvertimeDetailVO, OvertimeListVO, OvertimeQuery, OvertimeStatus, SettleMode, SettlementStatus } from '@/services/api/hr/hr09Types';
import { HrOvertimeDraftDialog } from './HrOvertimeDraftDialog';
import { HrOvertimeReviewDialog, type OvertimeReviewAction } from './HrOvertimeReviewDialog';
import { HrOvertimeSettlement, canReadOvertimeSettlement } from './HrOvertimeSettlement';
import { Hr09Blockers, Hr09ErrorNotice, Hr09FormDialog, Hr09Input, Hr09ListLayout, Hr09Notice, Hr09Page, Hr09Segments, Hr09Select, Hr09State, Hr09Status, Hr09Table, Hr09Textarea, Hr09Value, asOptions, dateTimeText, minutesText, overtimeStatuses, settleModes, settlementStatuses, useHr09Mutation, useHr09Resource } from './Hr09Shared';

type OvertimeOperation = 'DELETE' | 'SUBMIT' | 'CANCEL' | OvertimeReviewAction;

export function HrOvertimeWorkspace({ mine }: { mine: boolean }) {
  const { hasPermission } = useAuth();
  const isMobile = useBreakpoint() === 'mobile';
  const [filterOpen, setFilterOpen] = useState(false);
  const [search, setSearch] = useSearchParams();
  const [selectedId, setSelectedId] = useState(search.get('id') || search.get('requestId') || '');
  const [query, setQuery] = useState<OvertimeQuery>({ pageNum: 1, pageSize: 10 });
  const [filters, setFilters] = useState({ workDateFrom: '', workDateTo: '', status: '', settlementStatus: '', settleMode: '' });
  const [filterError, setFilterError] = useState<Hr09Error>();
  const [draft, setDraft] = useState<{ record?: OvertimeDetailVO } | null>(null);
  const [operation, setOperation] = useState<{ action: OvertimeOperation; record: OvertimeDetailVO } | null>(null);
  const [reason, setReason] = useState('');
  const [showSettlement, setShowSettlement] = useState(false);
  const list = useHr09Resource(signal => hrOvertimeApi.list(query, mine, signal), [query, mine]);
  const detail = useHr09Resource(signal => hrOvertimeApi.detail(selectedId, signal), [selectedId], Boolean(selectedId));
  const exporter = useHr09Mutation();
  const canApply = mine && hasPermission('hr:overtime:apply');
  const canExport = hasPermission(mine ? 'hr:overtime:mine' : 'hr:overtime:export');
  const refresh = () => { list.refresh(); detail.refresh(); };
  useWorkflowRefresh(refresh, 'HR_OVERTIME');
  useEffect(() => { if (!isMobile) setFilterOpen(false); }, [isMobile]);
  useEffect(() => { setSelectedId(search.get('id') || search.get('requestId') || ''); setShowSettlement(false); }, [search]);
  const openDetail = (id: string) => { setSelectedId(id); setShowSettlement(false); };
  const closeDetail = () => {
    setSelectedId(''); setShowSettlement(false);
    if (search.has('id') || search.has('requestId')) setSearch(previous => { const next = new URLSearchParams(previous); next.delete('id'); next.delete('requestId'); return next; }, { replace: true });
  };
  const reload = () => { setOperation(null); setDraft(null); refresh(); };
  const saved = (record: OvertimeDetailVO) => { setSelectedId(record.requestId); setShowSettlement(false); refresh(); };
  const can = (record: OvertimeDetailVO, action: OvertimeOperation | 'EDIT') => {
    if (!hasHr09Action(record, action)) return false;
    if (['EDIT', 'DELETE', 'SUBMIT'].includes(action)) return canApply && record.status === 'DRAFT';
    if (action === 'CANCEL') return mine && hasPermission('hr:overtime:cancel') && ['DRAFT', 'SUBMITTED', 'PENDING', 'APPROVING'].includes(record.status);
    return !mine && record.status === 'SUBMITTED' && hasPermission(action === 'REVIEW_PAY' ? 'hr:overtime:price' : 'hr:overtime:verify') && (action !== 'REVIEW_PAY' || record.settleMode === 'PAY' && record.approvedMinutes != null);
  };
  const begin = (record: OvertimeDetailVO, action: OvertimeOperation) => { setReason(''); setOperation({ action, record }); };
  const record = detail.data;
  const resetFilters = () => {
    setFilters({ workDateFrom: '', workDateTo: '', status: '', settlementStatus: '', settleMode: '' });
    setFilterError(undefined);
  };
  const openFilters = () => {
    setFilters({ workDateFrom: query.workDateFrom || '', workDateTo: query.workDateTo || '', status: query.status || '', settlementStatus: query.settlementStatus || '', settleMode: query.settleMode || '' });
    setFilterError(undefined);
    setFilterOpen(true);
  };
  const applyFilters = () => {
    try {
      const next = overtimeQuery({ pageNum: 1, pageSize: query.pageSize, workDateFrom: filters.workDateFrom, workDateTo: filters.workDateTo, status: filters.status as OvertimeStatus || undefined, settlementStatus: filters.settlementStatus as SettlementStatus || undefined, settleMode: filters.settleMode as SettleMode || undefined }, mine);
      setFilterError(undefined); setQuery(next); setFilterOpen(false);
    } catch (error) { setFilterError(error instanceof Hr09Error ? error : new Hr09Error('筛选条件无效。')); }
  };
  const filterFields = <><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5"><Hr09Input label="加班日起" type="date" value={filters.workDateFrom} onChange={event => setFilters(previous => ({ ...previous, workDateFrom: event.target.value }))} /><Hr09Input label="加班日止" type="date" value={filters.workDateTo} onChange={event => setFilters(previous => ({ ...previous, workDateTo: event.target.value }))} /><Hr09Select label="申请状态" value={filters.status} placeholder="全部申请状态" options={asOptions(overtimeStatuses)} onChange={value => setFilters(previous => ({ ...previous, status: value }))} /><Hr09Select label="结算状态" value={filters.settlementStatus} placeholder="全部结算状态" options={asOptions(settlementStatuses)} onChange={value => setFilters(previous => ({ ...previous, settlementStatus: value }))} /><Hr09Select label="补偿方式" value={filters.settleMode} placeholder="全部补偿方式" options={asOptions(settleModes)} onChange={value => setFilters(previous => ({ ...previous, settleMode: value }))} /></div><Hr09ErrorNotice error={filterError} /></>;
  const filterPanel = isMobile ? <Button variant="outline" className="min-h-11" aria-label="筛选加班申请" onClick={openFilters}><Filter size={16} className="mr-2" />筛选</Button> : <form className="card space-y-3 p-4" onSubmit={event => { event.preventDefault(); applyFilters(); }}>{filterFields}<div className="flex flex-wrap gap-2"><Button type="submit" disabled={list.loading}>查询</Button><Button type="button" variant="outline" onClick={() => { resetFilters(); setQuery({ pageNum: 1, pageSize: 10 }); }}>重置筛选</Button></div></form>;
  return <Hr09Page title={mine ? '我的加班' : '加班管理'} description={mine ? '本人登记、提交核定与查看执行结果；工时和补偿均以服务端核定为准。' : '按授权人员范围处理工时与结算，申请审批状态与结算执行状态分别展示。'} actions={<><Button variant="outline" disabled={list.loading} onClick={refresh}><RefreshCw size={16} className="mr-2" />刷新</Button>{canExport && <Button variant="outline" disabled={exporter.busy} onClick={() => void exporter.run(async () => { const blob = await hrOvertimeApi.export(query, mine); downloadBlob(blob, `${mine ? '我的加班' : '加班管理'}-${shanghaiDate()}.xlsx`); })}><Download size={16} className="mr-2" />{exporter.busy ? '正在导出…' : '导出'}</Button>}{canApply && !isMobile && <Button onClick={() => setDraft({})}><Plus size={16} className="mr-2" />登记加班</Button>}</>}>
    <div className={isMobile && canApply ? 'cf-mobile-primary-space' : undefined}>
    <Hr09ErrorNotice error={exporter.error} />
    <Hr09ListLayout filters={filterPanel} total={list.data?.total} page={query.pageNum} pageSize={query.pageSize} onPageChange={pageNum => setQuery(previous => ({ ...previous, pageNum }))} table={<Hr09Table rows={list.data?.rows || []} rowKey={row => row.requestId} loading={list.loading} error={list.error} onRefresh={list.refresh} emptyText={mine ? '尚无本人加班申请' : '当前范围暂无加班申请'} columns={[
      { key: 'requestNo', label: '申请单号', render: row => <span className="font-medium">{row.requestNo}</span> },
      ...(!mine ? [{ key: 'employee', label: '员工 / 部门', render: (row: OvertimeListVO) => <>{row.employeeName}<div className="mt-1 text-xs text-cf-subtle">{row.deptName}</div></> }] : []),
      { key: 'date', label: '自然加班日 / 时段', render: row => <>{row.workDate}<div className="mt-1 whitespace-nowrap text-xs text-cf-subtle">{dateTimeText(row.startTime)}<br />至 {dateTimeText(row.endTime)}</div></> },
      { key: 'type', label: '类型 / 补偿', render: row => <>{row.overtimeTypeName}<div className="mt-1 text-xs text-cf-subtle">{settleModes[row.settleMode] || '未知方式'}</div></> },
      { key: 'hours', label: '实际 / 核定', render: row => <>{minutesText(row.actualMinutes)}<div className="mt-1 text-xs text-cf-subtle">核定：{minutesText(row.approvedMinutes)}</div></> },
      { key: 'status', label: '申请状态', render: row => <Hr09Status kind="overtime" value={row.status} /> },
      { key: 'settlement', label: '结算状态', render: row => <Hr09Status kind="settlement" value={row.settlementStatus} /> },
      { key: 'actions', label: '操作', render: row => <Button size="sm" variant="outline" className="min-h-11 sm:min-h-9" onClick={() => openDetail(row.requestId)}><Eye size={14} className="mr-1" />查看 / 处理</Button> },
    ]} />} />
    </div>
    {isMobile && <MobileFilterDrawer open={filterOpen} onClose={() => setFilterOpen(false)} title="筛选加班申请" onApply={applyFilters} onReset={resetFilters} busy={list.loading}>{filterFields}</MobileFilterDrawer>}
    {isMobile && canApply && !selectedId && !draft && !operation && !filterOpen && <div className="cf-mobile-primary-footer"><Button className="min-h-11 w-full" onClick={() => setDraft({})}><Plus size={16} className="mr-2" />登记加班</Button></div>}
    <BaseDialog open={Boolean(selectedId) && !draft && !operation} title={record ? `${record.requestNo} · 加班详情` : '加班详情'} width="extra-wide" onClose={closeDetail} footer={<Button variant="outline" onClick={detail.refresh}>重新读取详情</Button>}>
      {detail.loading ? <Hr09State loading title="正在读取申请详情" /> : detail.error ? <Hr09State error title="申请详情读取失败" description={detail.error.message} onRetry={detail.refresh} /> : record ? <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-3"><Hr09Status kind="overtime" value={record.status} /><Hr09Status kind="settlement" value={record.settlementStatus} /><span className="text-xs text-cf-subtle">版本 {record.version}</span></div>
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"><Hr09Value label="申请人 / 部门">{record.employeeName} / {record.deptName}</Hr09Value><Hr09Value label="自然加班日">{record.workDate}</Hr09Value><Hr09Value label="考勤归属日">{record.attendanceDate}</Hr09Value><Hr09Value label="申请开始">{dateTimeText(record.startTime)}</Hr09Value><Hr09Value label="申请结束">{dateTimeText(record.endTime)}</Hr09Value><Hr09Value label="自动匹配类型 / 补偿">{record.overtimeTypeName} / {settleModes[record.settleMode]}</Hr09Value><Hr09Value label="申请区间分钟">{minutesText(record.requestedMinutes)}</Hr09Value><Hr09Value label="实际可核定">{minutesText(record.actualMinutes)}{record.actualHours != null ? `（${record.actualHours} 小时）` : ''}</Hr09Value><Hr09Value label="审批报酬核定">{minutesText(record.approvedMinutes)}{record.approvedHours != null ? `（${record.approvedHours} 小时）` : ''}</Hr09Value><Hr09Value label="班次 / 规则">{record.shiftName || record.shiftId || '未配置'} / {record.ruleId || '未配置'}</Hr09Value><Hr09Value label="工时核定时间">{dateTimeText(record.reviewedTime)}</Hr09Value><Hr09Value label="审批流程标识">{record.instanceId || '尚未启动正式审批'}</Hr09Value><Hr09Value label="加班事由">{record.reason}</Hr09Value><Hr09Value label="工时核定依据">{record.reviewNote}</Hr09Value></dl>
        {record.lastErrorCode && <Hr09Notice danger>{record.lastErrorCode}：{record.lastErrorMessage || '业务处理受阻，请核对配置及原始依据。'}</Hr09Notice>}
        <Hr09Blockers blockers={[]} warnings={record.ruleWarnings || []} />
        {record.calculationSummary && <section className="space-y-3"><h3 className="text-sm font-medium text-cf-title">服务端打卡与扣除依据</h3><Hr09Notice>已排除 {record.calculationSummary.excludedMinutes ?? '未提供'} 分钟；班次阈值 {record.calculationSummary.thresholdMinutes ?? '未提供'} 分钟。核定工时独立于原考勤候选值。</Hr09Notice><Hr09Segments segments={record.calculationSummary.segments || []} /></section>}
        <div className="flex flex-wrap gap-2">{can(record, 'EDIT') && <Button variant="outline" onClick={() => setDraft({ record })}>修改草稿</Button>}{can(record, 'DELETE') && <Button variant="destructive" onClick={() => begin(record, 'DELETE')}>删除草稿</Button>}{can(record, 'SUBMIT') && <Button onClick={() => begin(record, 'SUBMIT')}>提交核定</Button>}{can(record, 'CANCEL') && <Button variant="warning" onClick={() => begin(record, 'CANCEL')}>撤回申请</Button>}{can(record, 'REVIEW_HOURS') && <Button onClick={() => begin(record, 'REVIEW_HOURS')}>核定工时</Button>}{can(record, 'REVIEW_PAY') && <Button onClick={() => begin(record, 'REVIEW_PAY')}>财务核价</Button>}{can(record, 'REVIEW_REJECT') && <Button variant="warning" onClick={() => begin(record, 'REVIEW_REJECT')}>拒绝核定</Button>}{canReadOvertimeSettlement(record, mine, hasPermission) && <Button variant="outline" onClick={() => setShowSettlement(value => !value)}>{showSettlement ? '收起结算详情' : '查看授权结算'}</Button>}</div>
        {showSettlement && canReadOvertimeSettlement(record, mine, hasPermission) && <HrOvertimeSettlement record={record} mine={mine} onChanged={refresh} />}
        {!mine && record.settleMode === 'PAY' && !hasPermission('hr:overtime:finance') && <Hr09Notice>当前仅展示工时及执行状态；加班费金额由本人和有权财务查看。</Hr09Notice>}
      </div> : <Hr09State error title="服务端未返回申请详情" onRetry={detail.refresh} />}
    </BaseDialog>
    {draft && canApply && <HrOvertimeDraftDialog record={draft.record} onClose={() => setDraft(null)} onSaved={saved} onReload={reload} />}
    {operation && ['REVIEW_HOURS', 'REVIEW_PAY', 'REVIEW_REJECT'].includes(operation.action) && <HrOvertimeReviewDialog action={operation.action as OvertimeReviewAction} record={operation.record} onClose={() => setOperation(null)} onSaved={saved} onReload={reload} />}
    {operation && ['DELETE', 'SUBMIT', 'CANCEL'].includes(operation.action) && <Hr09FormDialog title={{ DELETE: '确认删除草稿', SUBMIT: '确认提交加班核定', CANCEL: '确认撤回加班申请' }[operation.action as 'DELETE' | 'SUBMIT' | 'CANCEL']} onClose={() => setOperation(null)} onReload={reload} blocked={!can(operation.record, operation.action)} confirmation={operation.action === 'DELETE' ? '确认删除此草稿，保留创建防重记录，不恢复或复用旧申请。' : operation.action === 'CANCEL' ? '确认撤回当前申请；审批通过后不能通过撤回反向取消结算。' : '确认加班时段已经结束，打卡与事由真实；提交后进入业务核定，尚未产生调休或工资。'} successText="操作已完成，请以最新状态为准" onSubmit={async () => {
      if (!can(operation.record, operation.action)) throw new Hr09Error('当前记录不允许此操作。', 403);
      if (operation.action === 'DELETE') { await hrOvertimeApi.remove(operation.record.requestId, operation.record.version); closeDetail(); list.refresh(); }
      else if (operation.action === 'SUBMIT') saved(await hrOvertimeApi.submit(operation.record.requestId, operation.record.version));
      else saved(await hrOvertimeApi.cancel(operation.record.requestId, { version: operation.record.version, reason }));
    }}><Hr09Notice>{operation.record.requestNo} · {operation.record.employeeName} · {dateTimeText(operation.record.startTime)} 至 {dateTimeText(operation.record.endTime)}</Hr09Notice>{operation.action === 'CANCEL' && <Hr09Textarea label="撤回原因" required maxLength={500} rows={3} value={reason} onChange={event => setReason(event.target.value)} />}</Hr09FormDialog>}
  </Hr09Page>;
}
