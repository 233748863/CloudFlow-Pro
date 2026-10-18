import React, { useState } from 'react';
import { BaseDialog, Button, ListResultFooter } from '@/components/common';
import { Hr09FormDialog, Hr09Input, Hr09Notice, Hr09State, useHr09Resource, type Hr09Column } from '../components/Hr09Shared';
import { Hr09Error } from '@/services/api/hr/hr09Model';
import { hrAppraisalApi } from '@/services/api/hr/appraisals';
import type { AppraisalOption, AppraisalPerson, AppraisalQuery } from '@/services/api/hr/appraisalTypes';
import './appraisals.css';

export const appraisalStages = { DRAFT: '草稿', ONGOING: '进行中', SCORING: '评分中', CALIBRATING: '校准中', COMPLETED: '已完成' };
export const appraisalMethods = { GOAL_BASED: '按目标权重', KRA_WEIGHTED: '按成果领域权重', MIXED: '两类权重混合' };
export const appraisalTypes = { MONTHLY: '月度', QUARTERLY: '季度', HALF_YEARLY: '半年度', YEARLY: '年度' };
export const appraisalSources = { SELF: '本人自评', MANAGER: '上级评价', PEER: '同事评价', SUBORDINATE: '下属评价' };
export const appraisalText = (values: Record<string, string>, value: string) => values[value] || `未知状态（${value}）`;

export function AppraisalRows<Row>({ rows, columns, rowKey, empty = '暂无记录' }: { rows: Row[]; columns: Hr09Column<Row>[]; rowKey: (row: Row) => string; empty?: string }) {
  if (!rows.length) return <Hr09State title={empty} />;
  return <>
    <div className="hidden overflow-x-auto rounded-xl border border-[var(--cf-border)] md:block"><table className="w-full text-left text-sm"><thead><tr className="bg-[var(--cf-surface-muted)]">{columns.map(column => <th scope="col" key={column.key} className="px-4 py-3 font-medium text-cf-subtle">{column.label}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={rowKey(row)} className="border-t border-[var(--cf-border)]">{columns.map(column => <td key={column.key} className="max-w-sm break-words px-4 py-3 align-top text-cf-body">{column.render(row)}</td>)}</tr>)}</tbody></table></div>
    <div className="space-y-3 md:hidden">{rows.map(row => <article key={rowKey(row)} className="rounded-xl border border-[var(--cf-border)] p-4"><dl className="space-y-3">{columns.map(column => <div key={column.key} className="min-w-0"><dt className="text-xs text-cf-subtle">{column.label}</dt><dd className="mt-1 break-words text-sm text-cf-body">{column.render(row)}</dd></div>)}</dl></article>)}</div>
  </>;
}

export function AppraisalForm({ children, onReload, onSubmit, blocked, ...props }: React.ComponentProps<typeof Hr09FormDialog>) {
  const [uncertain, setUncertain] = useState(false);
  return <Hr09FormDialog {...props} blocked={blocked || uncertain} onReload={onReload} onSubmit={async () => {
    try { return await onSubmit(); }
    catch (error) { if (!(error instanceof Hr09Error) || error.status == null || error.status >= 500) setUncertain(true); throw error; }
  }}><div className="appraisal-workspace space-y-4"><fieldset disabled={uncertain} className="min-w-0 space-y-4">{children}</fieldset>{uncertain && <Hr09Notice danger>本次提交结果尚未确认，已暂停再次提交。请重新读取后核对已保存内容。{onReload && <Button type="button" className="mt-3" variant="outline" onClick={onReload}>核对提交结果</Button>}</Hr09Notice>}</div></Hr09FormDialog>;
}

export function AppraisalChoices({ label, options, value, onChange, hint }: { label: string; options: AppraisalOption[]; value: string[]; onChange: (value: string[]) => void; hint?: string }) {
  const [keyword, setKeyword] = useState('');
  const visible = options.filter(option => option.name.toLocaleLowerCase().includes(keyword.toLocaleLowerCase()));
  return <fieldset className="min-w-0 space-y-2 rounded-lg border border-[var(--cf-border)] p-3"><legend className="px-1 text-sm font-medium text-cf-title">{label}</legend>{hint && <p className="text-xs leading-5 text-cf-subtle">{hint}</p>}
    <Hr09Input label={`搜索${label}`} value={keyword} onChange={event => setKeyword(event.target.value)} />
    <div className="max-h-48 overflow-y-auto">{visible.map(option => <label key={option.identifier} className="appraisal-choice flex items-center gap-3 py-2 text-sm"><input type="checkbox" checked={value.includes(option.identifier)} onChange={event => onChange(event.target.checked ? [...value, option.identifier] : value.filter(identifier => identifier !== option.identifier))} /><span className="min-w-0 break-words">{option.name}</span></label>)}{!visible.length && <p className="py-3 text-sm text-cf-subtle">没有匹配选项</p>}</div><p className="text-xs text-cf-subtle">已选择 {value.length} 项</p>
  </fieldset>;
}

export function AppraisalPeoplePicker({ label, value, onPick }: { label: string; value?: string; onPick: (person: AppraisalPerson) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState<AppraisalQuery>({ pageNum: 1, pageSize: 10 });
  const resource = useHr09Resource(signal => hrAppraisalApi.people(query, signal), [JSON.stringify(query)], open);
  return <div className="min-w-0 space-y-2"><p className="text-sm font-medium text-cf-title">{label}</p><Button type="button" variant="outline" className="h-auto w-full justify-start whitespace-normal text-left" aria-label={label} onClick={() => setOpen(true)}>{value || '按姓名或工号选择'}</Button>{open && <BaseDialog open title="选择授权范围内人员" width="wide" onClose={() => setOpen(false)}><div className="appraisal-workspace space-y-3"><Hr09Input label="人员姓名或工号" value={query.keyword || ''} maxLength={100} onChange={event => setQuery({ ...query, keyword: event.target.value, pageNum: 1 })} />
    {resource.loading ? <Hr09State loading title="正在读取人员" /> : resource.error ? <Hr09State error title="人员读取失败" description={resource.error.message} onRetry={resource.refresh} /> : resource.data && <><AppraisalRows rows={resource.data.rows.filter(row => row.userId != null)} rowKey={row => row.employeeId} columns={[
      { key: 'person', label: '人员', render: row => <>{row.employeeName}<p className="text-xs text-cf-subtle">{row.employeeNo}</p></> },
      { key: 'action', label: '操作', render: row => <Button type="button" variant="outline" aria-label={`选择${row.employeeName}`} onClick={() => { onPick(row); setOpen(false); }}>选择</Button> },
    ]} /><ListResultFooter summary={`共 ${resource.data.total} 位人员`} total={resource.data.total} page={query.pageNum || 1} pageSize={10} onPageChange={pageNum => setQuery({ ...query, pageNum })} /></>}
  </div></BaseDialog>}</div>;
}
