import React, { useState } from 'react';
import { addDays, differenceInCalendarDays, format, parseISO, startOfWeek } from 'date-fns';
import { BaseDialog } from '@/components/common/BaseDialog';
import { Button, Input, Textarea } from '@/components/common';
import type { PageResult } from '@/types';
import type { Project } from '@/services/api/project';
import { oaGet, oaPost, oaDelete, pageRows, type OaTimesheet, type OaTimesheetDetail, type TimesheetDetail, type OaActivityType, type OaProjectTask } from '@/services/api/oaOperations';
import { OperationsPage, Section, OpsTable, OpsSelect, Field, Metric, money, labelOf, useRemote, useMutation, useAccess } from '@/components/oa/operations/OperationsKit';
import { optionsOf, today } from '@/components/oa/operations/RecordEditor';
import './TimesheetPage.css';

const statuses = { DRAFT: '草稿', SUBMITTED: '已提交', APPROVING: '审批中', APPROVED: '已通过', REJECTED: '已驳回' };
interface WeekRow { key: string; groupKey?: string; base: OaTimesheetDetail; days: Record<string, OaTimesheetDetail> }
const shiftDate = (date: string, days: number) => format(addDays(parseISO(date), days), 'yyyy-MM-dd');
const weekStart = (date: string) => format(startOfWeek(parseISO(date), { weekStartsOn: 1 }), 'yyyy-MM-dd');
function groupDetails(details: OaTimesheetDetail[]): WeekRow[] {
  const rows: WeekRow[] = [];
  for (const item of details) {
    const key = [item.projectId, item.taskId, item.activityTypeId, item.billableFlag, item.description, item.reversalOfDetailId, item.fromTime, item.toTime].join('|');
    let row = rows.find(candidate => candidate.groupKey === key && !candidate.days[item.workDate || '']);
    if (!row) { row = { key: key + ':' + rows.length, groupKey: key, base: { ...item }, days: {} }; rows.push(row); }
    row.days[item.workDate || ''] = { ...item };
  }
  return rows;
}
export default function TimesheetPage() {
  const can = useAccess(); const mutation = useMutation(); const [page, setPage] = useState(1); const [status, setStatus] = useState(''); const [review, setReview] = useState(false);
  const [sheet, setSheet] = useState<OaTimesheet | null>(null); const [rows, setRows] = useState<WeekRow[]>([]); const [tasks, setTasks] = useState<Record<string, OaProjectTask[]>>({});
  const [removeId, setRemoveId] = useState<number | null>(null);
  const list = useRemote(() => oaGet<PageResult<OaTimesheet>>('/timesheets', { pageNum: page, pageSize: 10, status: status || undefined, review }), [page, status, review]);
  const projects = useRemote(() => sheet?.startDate && sheet.endDate && !review
    ? oaGet<Project[]>('/timesheets/projects', { from: sheet.startDate, to: sheet.endDate }) : Promise.resolve([]), [sheet?.startDate, sheet?.endDate, review]);
  const activities = useRemote(() => oaGet<OaActivityType[]>('/activity-catalog/types'));
  const editable = !!sheet && !review && can('oa:timesheet:edit') && (!sheet.timesheetId || ['DRAFT', 'REJECTED'].includes(sheet.status || ''));
  const dates = sheet?.startDate && sheet.endDate ? Array.from({ length: Math.min(31, Math.max(0, differenceInCalendarDays(parseISO(sheet.endDate), parseISO(sheet.startDate)) + 1)) }, (value, index) => shiftDate(sheet.startDate!, index)) : [];
  const total = rows.reduce((sum, row) => sum + Object.values(row.days).reduce((amount, item) => amount + Number(item.hours || 0), 0), 0);
  const refresh = () => list.refresh();
  const taskKey = (projectId?: number) => [sheet?.startDate || '', sheet?.endDate || '', projectId || ''].join(':');
  const loadTasks = async (projectId?: number) => {
    const key = taskKey(projectId);
    if (!projectId || !sheet?.startDate || !sheet.endDate || tasks[key]) return;
    const result = await oaGet<OaProjectTask[]>('/timesheets/projects/' + projectId + '/tasks', { from: sheet.startDate, to: sheet.endDate });
    setTasks(value => ({ ...value, [key]: result }));
  };
  const open = async (id: number) => { const detail = await oaGet<TimesheetDetail>('/timesheets/' + id); setSheet(detail.timesheet); setRows(groupDetails(detail.details)); };
  const addRow = () => setRows(value => [...value, { key: crypto.randomUUID(), base: { activityTypeId: activities.data?.find(item => item.status === 'ACTIVE')?.typeId, billableFlag: 1, description: '' }, days: {} }]);
  const changeBase = (key: string, patch: Partial<OaTimesheetDetail>) => setRows(value => value.map(row => row.key === key ? { ...row, base: { ...row.base, ...patch } } : row));
  const changeHours = (key: string, date: string, hours: string) => setRows(value => value.map(row => row.key === key ? { ...row, days: { ...row.days, [date]: { ...row.days[date], hours, fromTime: undefined, toTime: undefined } } } : row));
  const save = async () => { if (!sheet) return; const details = rows.flatMap(row => Object.entries(row.days).filter(([date, item]) => Number(item.hours)).map(([date, item]) => ({ ...item, ...row.base, detailId: undefined, workDate: date, hours: item.hours, reversalOfDetailId: item.reversalOfDetailId ?? row.base.reversalOfDetailId, fromTime: item.fromTime, toTime: item.toTime }))); const id = await oaPost<number>('/timesheets', { timesheet: sheet, details }); await open(id); refresh(); };
  const createReversal = () => { if (!sheet) return; setRows(value => value.map(row => ({ ...row, key: crypto.randomUUID(), base: { ...row.base, description: '冲正：' + (row.base.description || '') }, days: Object.fromEntries(Object.entries(row.days).filter(([date, item]) => Number(item.hours) > 0).map(([date, item]) => [date, { ...item, hours: -Number(item.hours), reversalOfDetailId: item.detailId }])) })).filter(row => Object.keys(row.days).length)); setSheet({ startDate: sheet.startDate, endDate: sheet.endDate, status: 'DRAFT' }); };
  return <OperationsPage title="项目工时" description="按周填写工作时间；提交时锁定成本与计费单价，已批准记录通过冲正调整。" loading={list.loading} error={list.error} refresh={refresh} actions={can('oa:timesheet:edit') && !review ? <Button onClick={() => { const startDate = weekStart(today()); setSheet({ startDate, endDate: shiftDate(startDate, 6), status: 'DRAFT' }); setRows([]); }}>填写本人工时</Button> : undefined} filters={<div className="oa-ops-actions"><OpsSelect label="工时状态" value={status} options={statuses} empty="全部状态" onChange={value => { setStatus(value); setPage(1); }} />{can('oa:timesheet:review') && <label className="flex items-center gap-2"><input type="checkbox" checked={review} onChange={event => { setReview(event.target.checked); setPage(1); setSheet(null); }} />审核范围</label>}</div>}>
    {[projects.error, activities.error].filter(Boolean).map(message => <p key={message} role="alert">{message}</p>)}
    {review && <p className="oa-ops-warning">此处查看本人负责项目的工时；审批操作在待办中心完成。</p>}
    <OpsTable headers={['单号 / 填报人', '期间', '工时 / 计费工时', ...(can('oa:activity-cost:list') ? ['成本金额'] : []), '计费金额', '状态', '操作']} empty={!pageRows(list.data).length}>
      {pageRows(list.data).map(item => <tr key={item.timesheetId}><td>{item.timesheetNo}<div>{item.employeeName}</div></td><td>{item.startDate} ~ {item.endDate}</td><td>{item.totalHours} / {item.billableHours}</td>{can('oa:activity-cost:list') && <td>{money(item.costingAmount)}</td>}<td>{money(item.billingAmount)}</td><td>{labelOf(statuses, item.status)}<p>{item.rejectReason}</p></td><td><div className="oa-ops-actions"><Button variant="link" disabled={mutation.busy} onClick={() => void mutation.run(() => open(item.timesheetId!), undefined, '')}>查看</Button>{!review && ['DRAFT', 'REJECTED'].includes(item.status || '') && <>{can('oa:timesheet:submit') && <Button variant="link" disabled={mutation.busy} onClick={() => void mutation.run(() => oaPost('/timesheets/' + item.timesheetId + '/submit'), refresh)}>提交审批</Button>}{can('oa:timesheet:remove') && <Button variant="link" onClick={() => setRemoveId(item.timesheetId!)}>删除</Button>}</>}</div></td></tr>)}
    </OpsTable><div className="oa-ops-actions"><Button variant="outline" disabled={page === 1} onClick={() => setPage(page - 1)}>上一页</Button><span>第 {page} 页 · 共 {list.data?.total || 0} 条</span><Button variant="outline" disabled={page * 10 >= (list.data?.total || 0)} onClick={() => setPage(page + 1)}>下一页</Button></div>
    <BaseDialog open={!!sheet} title="工时周矩阵" width="full" onClose={() => setSheet(null)} footer={<><Button variant="outline" onClick={() => setSheet(null)}>关闭</Button>{editable && <Button disabled={mutation.busy} onClick={() => void mutation.run(save)}>保存并计算</Button>}{sheet?.status === 'APPROVED' && !review && can('oa:timesheet:edit') && <Button onClick={createReversal}>建立冲正单</Button>}</>}>
      {sheet && <div className="oa-operations space-y-4"><div className="grid gap-4 md:grid-cols-3"><Field label="周期开始（周一）"><Input type="date" value={sheet.startDate || ''} disabled={!editable || rows.some(row => Object.keys(row.days).length > 0)} onChange={event => { const startDate = event.target.value ? weekStart(event.target.value) : ''; setSheet({ ...sheet, startDate, endDate: startDate ? shiftDate(startDate, 6) : '' }); }} /></Field><Metric label="周期结束" value={sheet.endDate || '—'} /><Metric label="本单合计（小时）" value={total.toFixed(2)} /></div>
        <p className="oa-ops-warning">工作内容按行填写；可补报加入日至退出日的工时，未来日期不能填报。冲正 = 用负数工时抵减原已批准记录，关联日期和项目保持不变。</p>
        {projects.error && <p role="alert" className="oa-ops-warning">{projects.error}<Button variant="link" onClick={projects.refresh}>重新加载项目</Button></p>}
        <Section><div className="oa-timesheet-matrix"><OpsTable headers={['项目 / 任务', '活动 / 是否计费', '工作内容', ...dates.map(date => ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][parseISO(date).getDay()] + ' ' + date.slice(5)), '操作']} empty={!rows.length}>{rows.map(row => {
          const reversal = Object.values(row.days).some(item => item.reversalOfDetailId); const projectOptions = { ...optionsOf(projects.data, 'projectId', 'projectName'), ...(row.base.projectId ? { [String(row.base.projectId)]: row.base.projectName || projects.data?.find(project => String(project.projectId) === String(row.base.projectId))?.projectName || '原项目' } : {}) };
          return <tr key={row.key} className="oa-ops-week"><td data-field-label="项目 / 任务"><OpsSelect label="工时项目" value={row.base.projectId} options={projectOptions} empty="请选择项目" disabled={!editable || reversal} onChange={value => { changeBase(row.key, { projectId: value ? Number(value) : undefined, taskId: undefined, projectName: projectOptions[value] }); void mutation.run(() => loadTasks(Number(value)), undefined, ''); }} /><div className="mt-2" onFocus={() => editable && void mutation.run(() => loadTasks(row.base.projectId), undefined, '')}><OpsSelect label="项目任务" value={row.base.taskId} empty="项目级工时" disabled={!editable || reversal} options={{ ...optionsOf(tasks[taskKey(row.base.projectId)], 'taskId', 'subject'), ...(row.base.taskId ? { [String(row.base.taskId)]: tasks[taskKey(row.base.projectId)]?.find(task => String(task.taskId) === String(row.base.taskId))?.subject || '原任务 #' + row.base.taskId } : {}) }} onChange={value => changeBase(row.key, { taskId: value ? Number(value) : undefined })} /></div></td>
            <td data-field-label="活动 / 是否计费"><OpsSelect label="工时活动" value={row.base.activityTypeId} disabled={!editable || reversal} options={optionsOf(activities.data, 'typeId', 'typeName')} empty="选择活动" onChange={value => { const type = activities.data?.find(item => String(item.typeId) === value); changeBase(row.key, { activityTypeId: Number(value), billableFlag: type?.billableDefaultFlag || 0 }); }} /><label className="mt-2 flex gap-2"><input type="checkbox" checked={!!row.base.billableFlag} disabled={!editable || reversal} onChange={event => changeBase(row.key, { billableFlag: event.target.checked ? 1 : 0 })} />计费</label></td>
            <td data-field-label="工作内容"><Textarea aria-label="工作内容" value={row.base.description || ''} disabled={!editable} maxLength={10000} onChange={event => changeBase(row.key, { description: event.target.value })} /></td>
            {dates.map(date => <td key={date} data-field-label={['周日', '周一', '周二', '周三', '周四', '周五', '周六'][parseISO(date).getDay()] + ' ' + date.slice(5)}><Input aria-label={date + ' 工时'} type="number" step={0.01} min={reversal ? -24 : 0} max={reversal ? 0 : 24} value={row.days[date]?.hours ?? ''} disabled={!editable || date > today() || (reversal && !row.days[date])} onChange={event => changeHours(row.key, date, event.target.value)} /></td>)}
            <td>{editable && <Button variant="link" onClick={() => setRows(value => value.filter(item => item.key !== row.key))}>移除</Button>}</td>
          </tr>;
        })}</OpsTable></div>{editable && <Button variant="outline" className="mt-3" onClick={addRow}>添加项目活动行</Button>}</Section>
        {sheet.timesheetId && <div className="grid gap-3 md:grid-cols-3"><Metric label="计费小时" value={sheet.billableHours ?? '—'} />{can('oa:activity-cost:list') && <Metric label="成本金额（元）" value={money(sheet.costingAmount)} />}<Metric label="计费金额（元）" value={money(sheet.billingAmount)} /></div>}
      </div>}
    </BaseDialog>
    <BaseDialog open={!!removeId} title="删除草稿工时单" onClose={() => setRemoveId(null)} footer={<><Button variant="outline" onClick={() => setRemoveId(null)}>取消</Button><Button disabled={mutation.busy} onClick={() => void mutation.run(() => oaDelete('/timesheets/' + removeId), () => { setRemoveId(null); refresh(); })}>确认删除</Button></>}><p>删除后该草稿不能再提交审批。</p></BaseDialog>
  </OperationsPage>;
}
