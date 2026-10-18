import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import zhLocale from '@fullcalendar/core/locales/zh-cn';
import type { EventApi } from '@fullcalendar/core';
import { Filter, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Input, Pagination } from '@/components/common';
import { useAuth } from '@/context/AuthContext';
import { crmOperations, type ActivityDetail, type CrmActivity } from '@/services/api/crm/operations';
import { getErrorMessage } from '@/utils/errorMessage';
import { ActivityEditor, activityTypes, newActivity, newNextActivity } from '@/components/crm/operations/ActivityEditor';
import { activityStatuses, datePayload, Empty, labelOf, OperationsPage, OpsSelect, OpsTable, useAccess, useMutation, useRemote } from '@/components/crm/operations/OperationsKit';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { MobileFilterDrawer } from '@/components/mobile/MobileFilterDrawer';

export default function CrmActivityPage({ mobile: mobileOverride }: { mobile?: boolean }) {
  const breakpoint = useBreakpoint();
  const mobile = mobileOverride ?? breakpoint === 'mobile';
  const { user } = useAuth();
  const can = useAccess();
  const mutation = useMutation();
  const calendar = useRef<FullCalendar>(null);
  const [mode, setMode] = useState(mobile ? 'list' : 'calendar');
  const displayMode = mobile ? 'list' : mode;
  const [view, setView] = useState('');
  const [subject, setSubject] = useState('');
  const [status, setStatus] = useState('');
  const [activityType, setActivityType] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterDraft, setFilterDraft] = useState({ subject: '', status: '', activityType: '', view: '' });
  useEffect(() => { if (!mobile) setFilterOpen(false); }, [mobile]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [editor, setEditor] = useState<ActivityDetail>();
  const [nextOf, setNextOf] = useState<number>();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedActivityId = searchParams.get('activityId');
  const entryRequest = useRef(0);
  const [entryLoading, setEntryLoading] = useState(false);
  const [entryError, setEntryError] = useState('');
  const [entryRevision, setEntryRevision] = useState(0);
  useEffect(() => {
    const request = ++entryRequest.current;
    let active = true;
    setEditor(undefined); setNextOf(undefined); setEntryError(''); setEntryLoading(false);
    if (requestedActivityId === null) return;
    const id = Number(requestedActivityId);
    if (!/^[1-9][0-9]*$/.test(requestedActivityId) || !Number.isSafeInteger(id)) {
      setEntryError('活动链接无效，请从活动列表重新打开');
      return;
    }
    setEntryLoading(true);
    void crmOperations.activity(id).then(detail => {
      if (active && request === entryRequest.current) setEditor(detail);
    }).catch(failure => {
      if (active && request === entryRequest.current) setEntryError(getErrorMessage(failure, '活动不存在或无权访问'));
    }).finally(() => {
      if (active && request === entryRequest.current) setEntryLoading(false);
    });
    return () => { active = false; };
  }, [requestedActivityId, entryRevision]);
  const closeEditor = () => {
    entryRequest.current += 1;
    setEditor(undefined); setEntryLoading(false); setEntryError('');
    if (searchParams.has('activityId')) {
      const remaining = new URLSearchParams(searchParams);
      remaining.delete('activityId'); setSearchParams(remaining, { replace: true });
    }
  };
  const query = { subject: subject || undefined, status: status || undefined, activityType: activityType || undefined, view: view || undefined };
  const source = useRemote(() => crmOperations.activities({ ...query, pageNum: page, pageSize }), [subject, status, activityType, view, page, pageSize]);
  const refresh = () => { source.refresh(); calendar.current?.getApi().refetchEvents(); };
  const refreshPage = () => { refresh(); if (entryError && requestedActivityId !== null) setEntryRevision(value => value + 1); };
  const createActivity = () => { setNextOf(undefined); setEditor(newActivity()); };
  const openFilters = () => { setFilterDraft({ subject, status, activityType, view }); setFilterOpen(true); };
  const applyFilters = () => { setSubject(filterDraft.subject.trim()); setStatus(filterDraft.status); setActivityType(filterDraft.activityType); setView(filterDraft.view); setPage(1); setFilterOpen(false); };
  const open = (id: number) => {
    entryRequest.current += 1; setEntryLoading(false); setEntryError('');
    void mutation.run(() => crmOperations.activity(id), detail => { setNextOf(undefined); setEditor(detail); }, '');
  };
  const canEdit = (row: CrmActivity) => can('crm:activity:edit') && (row.ownerId === Number(user?.id) || can('crm:activity:assign'));
  const arrangeNext = (id: number) => {
    void mutation.run(() => crmOperations.activity(id), detail => {
      setNextOf(id); setEditor(newNextActivity(detail.activity));
    }, '');
  };
  const reschedule = async ({ event, oldEvent, revert }: { event: EventApi; oldEvent: EventApi; revert: () => void }) => {
    try {
      const detail = await crmOperations.activity(Number(event.id));
      const changed = await crmOperations.saveActivity({ ...detail, activity: { ...detail.activity, version: oldEvent.extendedProps.version, startTime: datePayload(event.startStr), endTime: datePayload(event.endStr || event.startStr), allDayFlag: event.allDay ? 1 : 0 } });
      if (changed.conflicts?.length) toast.warning(`改期成功，但与 ${changed.conflicts.map(item => item.subject).join('、')} 冲突`);
      else toast.success('活动已改期，提醒已重新安排');
      refresh();
    } catch (failure) { revert(); toast.error(getErrorMessage(failure, '改期失败，已恢复原时间')); }
  };
  return <OperationsPage title={mobile ? '客户活动' : '活动日历'} description="安排客户接触，记录每次会议、通话和下一步行动。" loading={entryLoading || displayMode === 'list' && source.loading} error={entryError || source.error} refresh={refreshPage}
    actions={<>{!mobile && can('crm:activity:add') && <Button disabled={entryLoading} onClick={createActivity}><Plus size={16} />创建活动</Button>}</>}
    filters={mobile ? <Button className="min-h-11" variant="outline" aria-label="筛选客户活动" onClick={openFilters}><Filter size={16} />筛选活动</Button> : <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5"><Input aria-label="搜索活动" placeholder="搜索活动主题" value={subject} onChange={event => { setSubject(event.target.value); setPage(1); }} /><OpsSelect label="活动类型筛选" value={activityType} empty="所有活动类型" options={activityTypes} onChange={value => { setActivityType(value); setPage(1); }} /><OpsSelect label="活动状态筛选" value={status} empty="所有状态" options={activityStatuses} onChange={value => { setStatus(value); setPage(1); }} /><OpsSelect label="我的活动" value={view} empty="全部可见活动" options={{ TODAY: '我的今日', WEEK: '我的本周', OVERDUE: '我的逾期任务' }} onChange={value => { setView(value); setMode('list'); setPage(1); }} /><OpsSelect label="显示方式" value={mode} options={{ calendar: '日历视图', list: '列表视图' }} onChange={setMode} /></div>}>
    {mobile && <MobileFilterDrawer open={filterOpen} title="筛选客户活动" onClose={() => setFilterOpen(false)} onApply={applyFilters} onReset={() => setFilterDraft({ subject: '', status: '', activityType: '', view: '' })}>
      <div className="space-y-4"><Input aria-label="搜索活动" placeholder="搜索活动主题" value={filterDraft.subject} onChange={event => setFilterDraft({ ...filterDraft, subject: event.target.value })} />
        <OpsSelect label="活动类型筛选" value={filterDraft.activityType} empty="所有活动类型" options={activityTypes} onChange={value => setFilterDraft({ ...filterDraft, activityType: value })} />
        <OpsSelect label="活动状态筛选" value={filterDraft.status} empty="所有状态" options={activityStatuses} onChange={value => setFilterDraft({ ...filterDraft, status: value })} />
        <OpsSelect label="我的活动" value={filterDraft.view} empty="全部可见活动" options={{ TODAY: '我的今日', WEEK: '我的本周', OVERDUE: '我的逾期任务' }} onChange={value => setFilterDraft({ ...filterDraft, view: value })} />
      </div>
    </MobileFilterDrawer>}
    {displayMode === 'calendar' ? <FullCalendar key={`${subject}:${status}:${activityType}:${view}`} ref={calendar} plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]} locale={zhLocale} initialView="dayGridMonth" height="auto" firstDay={1} nowIndicator selectable={can('crm:activity:add')} editable={can('crm:activity:edit')} headerToolbar={{ left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek,timeGridDay' }}
      events={async (range, success, failure) => {
        try {
          const rows: CrmActivity[] = [];
          let pageNum = 1;
          let total = 1;
          while (rows.length < total) {
            const result = await crmOperations.activities({ ...query, start: datePayload(range.startStr), end: datePayload(range.endStr), pageNum, pageSize: 200 });
            rows.push(...result.rows); total = result.total; pageNum += 1;
            if (!result.rows.length) break;
          }
          success(rows.map(row => ({ id: String(row.activityId), title: `${labelOf(activityTypes, row.activityType)} · ${row.subject}`, start: row.startTime.replace(' ', 'T'), end: row.endTime.replace(' ', 'T'), allDay: Boolean(row.allDayFlag), editable: canEdit(row) && !['COMPLETED', 'CANCELLED', 'NOT_HELD'].includes(row.status), extendedProps: { version: row.version }, color: row.overdueFlag ? '#b45309' : row.status === 'COMPLETED' ? '#047857' : row.status === 'CANCELLED' ? '#64748b' : undefined })));
        } catch (error) { failure(error instanceof Error ? error : new Error('加载日历失败')); toast.error(getErrorMessage(error, '加载日历失败')); }
      }} eventClick={event => open(Number(event.event.id))} select={selection => { setNextOf(undefined); const detail = newActivity(undefined, datePayload(selection.startStr), datePayload(selection.endStr)); detail.activity.allDayFlag = selection.allDay ? 1 : 0; setEditor(detail); }} eventDrop={reschedule} eventResize={reschedule} /> : <>
      {mobile ? <div className="space-y-3">{!source.loading && !source.data?.rows.length && <Empty text="暂无活动" />}{source.data?.rows.map(row => <article key={row.activityId} className="rounded-lg border border-[var(--cf-border)] bg-cf-surface-1 p-4">
        <div className="flex items-start justify-between gap-3"><h3 className="min-w-0 break-words font-medium text-cf-title">{row.subject}</h3><span className="shrink-0 text-sm text-cf-muted">{labelOf(activityStatuses, row.status)}</span></div>
        <p className="mt-2 break-words text-sm text-cf-muted">{labelOf(activityTypes, row.activityType)} · {row.customerName || '独立活动'}{Boolean(row.overdueFlag) && <span className="ml-2 text-amber-700">逾期</span>}</p>
        <p className="mt-2 text-sm text-cf-muted">{row.startTime}<br />至 {row.endTime}</p>
        <p className="mt-2 break-words text-sm text-cf-muted">负责人：{row.ownerName || '—'}</p>
        <Button className="mt-3 min-h-11 w-full" variant="outline" disabled={mutation.busy} onClick={() => open(row.activityId!)}>查看与办理</Button>
      </article>)}</div> : <OpsTable headers={['活动', '客户 / 关联', '时间', '负责人', '状态', '操作']} empty={!source.loading && !source.data?.rows.length}>{source.data?.rows.map(row => <tr key={row.activityId}><td><button className="text-cf-primary" onClick={() => open(row.activityId!)}>{row.subject}</button><div className="text-xs text-cf-muted">{labelOf(activityTypes, row.activityType)}</div></td><td>{row.customerName || '独立活动'}</td><td>{row.startTime}<div className="text-xs text-cf-muted">至 {row.endTime}</div></td><td>{row.ownerName || '—'}</td><td>{labelOf(activityStatuses, row.status)}{Boolean(row.overdueFlag) && <span className="ml-2 text-amber-700">逾期</span>}</td><td><div className="crm-ops-actions"><Button variant="ghost" size="sm" onClick={() => open(row.activityId!)}>详情</Button>{can('crm:activity:add') && (row.ownerId === Number(user?.id) || can('crm:activity:assign')) && <Button variant="ghost" size="sm" disabled={mutation.busy} onClick={() => arrangeNext(row.activityId!)}>后续活动</Button>}{can('crm:activity:remove') && canEdit(row) && <Button variant="ghost" size="sm" disabled={mutation.busy} onClick={() => { if (window.confirm(`确认删除“${row.subject}”？`)) void mutation.run(() => crmOperations.deleteActivity(row.activityId!), refresh); }}>删除</Button>}</div></td></tr>)}</OpsTable>}
      <Pagination page={page} pageSize={pageSize} total={source.data?.total || 0} onPageChange={setPage} onPageSizeChange={value => { setPageSize(value); setPage(1); }} />
    </>}
    {editor && <ActivityEditor key={`${editor.activity.activityId || 'new'}:${nextOf || ''}`} initial={editor} nextOf={nextOf} onClose={closeEditor} onSaved={detail => { refresh(); setNextOf(undefined); setEditor(detail); }} />}
    {mobile && can('crm:activity:add') && <div className="cf-mobile-primary-space"><footer className="cf-mobile-primary-footer"><Button className="min-h-11 w-full" disabled={entryLoading || mutation.busy} onClick={createActivity}><Plus size={16} />创建活动</Button></footer></div>}
  </OperationsPage>;
}
