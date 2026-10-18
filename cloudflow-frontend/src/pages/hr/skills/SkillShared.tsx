import React, { useState } from 'react';
import { RefreshCw, Search } from 'lucide-react';
import { BaseDialog, Button, ListResultFooter } from '@/components/common';
import { Hr09Input, Hr09State, useHr09Resource, type Hr09Column } from '../components/Hr09Shared';
import { Hr09Error } from '@/services/api/hr/hr09Model';
import { hrSkillApi } from '@/services/api/hr/skills';
import type { SkillDefinition, SkillEmployee, SkillEmployeeGap, SkillPage, SkillPosition, SkillQuery } from '@/services/api/hr/skillTypes';
import './skills.css';

export const skillStatuses = { DRAFT: '草稿', ACTIVE: '启用', DISABLED: '停用' };
export const assessmentStatuses = { PENDING: '待审核', APPROVED: '已核实', REJECTED: '已拒绝', REVOKED: '已撤销', RECORDED: '仅留存证据' };
export const evidenceTypes = { SELF: '本人自报', TRAINING: '培训结业', EXAM: '考试通过', CERTIFICATE: '有效证书', MANAGER_REVIEW: '主管评估' };
export const levelOptions = [1, 2, 3, 4, 5].map(level => ({ value: String(level), label: `${level} 级` }));
export const skillText = (labels: Record<string, string>, value: string) => labels[value] || `未知状态（${value || '缺失'}）`;

export function useSkillQuery(initial: SkillQuery = {}) {
  const [query, setQuery] = useState<SkillQuery>({ pageNum: 1, pageSize: 10, ...initial });
  return { query, change: (patch: SkillQuery) => setQuery(current => ({ ...current, pageNum: 1, ...patch })) };
}

export function SkillSearch({ value, onChange, refresh, label = '名称搜索' }: { value: string; onChange: (value: string) => void; refresh: () => void; label?: string }) {
  return <div className="flex min-w-0 flex-wrap items-end gap-3"><div className="min-w-0 flex-1"><Hr09Input label={label} maxLength={100} value={value} onChange={event => onChange(event.target.value)} placeholder="输入名称筛选" /></div><Button type="button" variant="outline" className="min-h-11" onClick={refresh}><RefreshCw size={16} className="mr-2" />刷新</Button></div>;
}

export function SkillList<Row>({ resource, columns, rowKey, query, onPage, emptyText = '暂无记录' }: {
  resource: { data?: SkillPage<Row>; loading: boolean; error?: Hr09Error; refresh: () => void };
  columns: Hr09Column<Row>[]; rowKey: (row: Row) => string; query: SkillQuery; onPage: (page: number) => void; emptyText?: string;
}) {
  if (resource.loading) return <Hr09State loading title="正在读取记录" />;
  if (resource.error) return <Hr09State error title="读取失败" description={resource.error.message} onRetry={resource.refresh} />;
  if (!resource.data) return <Hr09State error title="未收到完整数据" onRetry={resource.refresh} />;
  return <div className="space-y-3">
    {!resource.data.rows.length ? <Hr09State title={emptyText} /> : <>
      <div className="hidden overflow-x-auto rounded-xl border border-[var(--cf-border)] md:block"><table className="w-full text-left text-sm"><thead><tr className="bg-[var(--cf-surface-muted)]">{columns.map(column => <th scope="col" key={column.key} className="px-4 py-3 font-medium text-cf-subtle">{column.label}</th>)}</tr></thead><tbody>{resource.data.rows.map(row => <tr key={rowKey(row)} className="border-t border-[var(--cf-border)]">{columns.map(column => <td key={column.key} className="max-w-sm break-words px-4 py-3 align-top text-cf-body">{column.render(row)}</td>)}</tr>)}</tbody></table></div>
      <div className="space-y-3 md:hidden">{resource.data.rows.map(row => <article key={rowKey(row)} className="rounded-xl border border-[var(--cf-border)] p-4"><dl className="space-y-3">{columns.map(column => <div key={column.key} className="min-w-0"><dt className="text-xs text-cf-subtle">{column.label}</dt><dd className="mt-1 break-words text-sm text-cf-body">{column.render(row)}</dd></div>)}</dl></article>)}</div>
    </>}
    <ListResultFooter total={resource.data.total} page={query.pageNum || 1} pageSize={query.pageSize || 10} onPageChange={onPage} summary={`共 ${resource.data.total} 条记录`} />
  </div>;
}

interface LookupItem { id: string; name: string; detail: string }

function SkillLookup({ kind, onPick, onClose }: { kind: 'skill' | 'employee' | 'position'; onPick: (row: LookupItem) => void; onClose: () => void }) {
  const { query, change } = useSkillQuery();
  const resource = useHr09Resource(async signal => {
    if (kind === 'skill') {
      const result = await hrSkillApi.definitions({ ...query, status: 'ACTIVE' }, signal);
      return { ...result, rows: result.rows.map((row: SkillDefinition) => ({ id: row.skillId, name: row.skillName, detail: row.skillCode })) };
    }
    if (kind === 'employee') {
      const result = await hrSkillApi.employees(query, signal);
      return { ...result, rows: result.rows.map((row: SkillEmployee) => ({ id: row.employeeId, name: row.employeeName, detail: row.employeeNo })) };
    }
    const result = await hrSkillApi.positions(query, signal);
    return { ...result, rows: result.rows.map((row: SkillPosition) => ({ id: row.positionId, name: row.positionName, detail: `${row.requirements.length} 项技能要求` })) };
  }, [kind, JSON.stringify(query)]);
  const title = { skill: '选择已启用技能', employee: '选择管理范围内员工', position: '选择岗位' }[kind];
  return <BaseDialog open title={title} onClose={onClose} width="wide"><div className="skill-workspace space-y-4"><SkillSearch label="名称或工号搜索" value={query.keyword || ''} onChange={keyword => change({ keyword })} refresh={resource.refresh} /><SkillList resource={resource} query={query} onPage={pageNum => change({ pageNum })} rowKey={row => row.id} columns={[
    { key: 'name', label: '名称', render: row => <>{row.name}<p className="mt-1 text-xs text-cf-subtle">{row.detail}</p></> },
    { key: 'action', label: '操作', render: row => <Button type="button" variant="outline" onClick={() => { onPick(row); onClose(); }} aria-label={`选择${row.name}`}>选择</Button> },
  ]} /></div></BaseDialog>;
}

export function SkillPicker({ kind = 'skill', value, label, onChange, disabled = false }: { kind?: 'skill' | 'employee' | 'position'; value?: { id: string; name: string } | null; label: string; onChange: (row: { id: string; name: string }) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  return <div className="min-w-0 space-y-2"><p className="text-sm font-medium text-cf-title">{label}</p><Button type="button" variant="outline" className="h-auto min-h-11 w-full justify-start whitespace-normal text-left" aria-label={label} disabled={disabled} onClick={() => setOpen(true)}><Search size={16} className="mr-2 shrink-0" /><span className="min-w-0 break-words">{value?.name || '请选择'}</span></Button>{open && <SkillLookup kind={kind} onPick={onChange} onClose={() => setOpen(false)} />}</div>;
}

export function SkillGapDetail({ record }: { record: SkillEmployeeGap }) {
  return <div className="space-y-3"><p className="text-sm text-cf-subtle">{record.employeeName} · {record.positionName || '尚未配置岗位'}</p>{!record.skills.length ? <Hr09State title="当前岗位尚未配置技能要求" /> : record.skills.map(skill => <article key={skill.skillId} className="rounded-xl border border-[var(--cf-border)] p-4"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-medium text-cf-title">{skill.skillName}</h3><span className="text-sm text-cf-subtle">{skill.mandatory ? '必备' : '加分'} · 权重 {skill.weight}</span></div><dl className="mt-3 grid grid-cols-3 gap-2 text-sm"><div><dt className="text-cf-subtle">岗位要求</dt><dd className="mt-1">{skill.requiredLevel} 级</dd></div><div><dt className="text-cf-subtle">有效等级</dt><dd className="mt-1">{skill.currentLevel ? `${skill.currentLevel} 级` : '未认证'}</dd></div><div><dt className="text-cf-subtle">等级差距</dt><dd className="mt-1 font-medium">{skill.gap ? `差 ${skill.gap} 级` : '已达标'}</dd></div></dl>{skill.recommendations.length > 0 ? <div className="mt-4 space-y-2 border-t border-[var(--cf-border)] pt-3"><p className="text-sm font-medium">可报名的补足课程</p>{skill.recommendations.map(course => <p key={`${course.courseId}:${course.sessionId}`} className="break-words text-sm leading-6 text-cf-subtle">{course.courseName} · 目标 {course.targetLevel} 级<br />班次：{course.sessionNo}</p>)}</div> : skill.gap > 0 && <p className="mt-3 text-xs leading-5 text-cf-subtle">当前没有满足等级要求且有权报名的开放班次。</p>}</article>)}</div>;
}
