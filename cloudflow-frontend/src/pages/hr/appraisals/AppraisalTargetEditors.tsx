import React, { useState } from 'react';
import Decimal from 'decimal.js';
import { Button } from '@/components/common';
import { Hr09Input, Hr09Notice, Hr09Select, Hr09State, Hr09Textarea, asOptions, useHr09Resource } from '../components/Hr09Shared';
import { Hr09Error } from '@/services/api/hr/hr09Model';
import { appraisalNumber, hrAppraisalApi } from '@/services/api/hr/appraisals';
import type { AppraisalDetail, AppraisalGoalNode, AppraisalKra, AppraisalQuota } from '@/services/api/hr/appraisalTypes';
import { AppraisalForm } from './AppraisalShared';

export interface AppraisalEditorProps { detail: AppraisalDetail; onClose: () => void; onSaved: () => void }
const reload = (props: AppraisalEditorProps) => { props.onClose(); props.onSaved(); };

export function AppraisalKraEditor(props: AppraisalEditorProps) {
  const [rows, setRows] = useState<Pick<AppraisalKra, 'kraName' | 'weight' | 'description'>[]>(props.detail.kras.map(row => ({ ...row })));
  const change = (index: number, patch: Partial<AppraisalKra>) => setRows(current => current.map((row, position) => position === index ? { ...row, ...patch } : row));
  return <AppraisalForm title="配置成果领域" onClose={props.onClose} onReload={() => reload(props)} onSubmit={async () => { await hrAppraisalApi.kras(props.detail.cycle, rows); props.onSaved(); }}>
    <Hr09Notice>成果领域用于给目标分类。各领域权重合计为1；每名员工在同一领域内的叶子目标权重也须合计为1，启动后领域配置冻结。</Hr09Notice>
    {rows.map((row, index) => <fieldset key={index} className="space-y-3 rounded-lg border border-[var(--cf-border)] p-3"><legend className="px-1 text-sm">领域 {index + 1}</legend><div className="grid gap-3 sm:grid-cols-2">
      <Hr09Input label={`领域${index + 1}名称`} required maxLength={100} value={row.kraName} onChange={event => change(index, { kraName: event.target.value })} />
      <Hr09Input label={`领域${index + 1}权重`} required inputMode="decimal" value={row.weight} onChange={event => change(index, { weight: event.target.value })} /></div>
      <Hr09Textarea label={`领域${index + 1}说明`} maxLength={500} rows={2} value={row.description || ''} onChange={event => change(index, { description: event.target.value })} />
      <Button type="button" variant="outline" onClick={() => setRows(current => current.filter((_, position) => position !== index))}>移除领域 {index + 1}</Button>
    </fieldset>)}<Button type="button" variant="outline" onClick={() => setRows(current => [...current, { kraName: '', weight: '', description: '' }])}>添加成果领域</Button>
  </AppraisalForm>;
}

export function AppraisalGoalEditor({ objectiveId, ...props }: AppraisalEditorProps & { objectiveId?: string }) {
  const source = props.detail.goals.filter(goal => goal.objectiveId === objectiveId);
  const [name, setName] = useState(source[0]?.objectiveName || '');
  const [kraId, setKraId] = useState(source[0]?.kraId || '');
  const [nodes, setNodes] = useState<AppraisalGoalNode[]>(source.length ? source.map(goal => ({ key: goal.assignmentId, parentKey: goal.parentId, assigneeType: goal.assigneeType, assigneeId: goal.assigneeId, weight: goal.weight, targetValue: goal.targetValue })) : [{ key: crypto.randomUUID(), parentKey: null, assigneeType: 'EMPLOYEE', assigneeId: '', weight: '1', targetValue: '' }]);
  const options = useHr09Resource(signal => hrAppraisalApi.options(signal), []);
  const change = (key: string, patch: Partial<AppraisalGoalNode>) => setNodes(current => current.map(node => node.key === key ? { ...node, ...patch } : node));
  return <AppraisalForm title={objectiveId ? '修改周期目标' : '下达周期目标'} onClose={props.onClose} onReload={() => reload(props)} blocked={!options.data || options.loading}
    onSubmit={async () => { await hrAppraisalApi.goals(props.detail.cycle.cycleId, { version: props.detail.cycle.version, objectiveId, objectiveName: name, kraId: kraId || null, nodes }); props.onSaved(); }}>
    <Hr09Input label="目标名称" required maxLength={200} value={name} onChange={event => setName(event.target.value)} />
    {props.detail.cycle.evaluationMethod !== 'GOAL_BASED' && <Hr09Select label="所属成果领域" required value={kraId} options={props.detail.kras.map(row => ({ value: row.kraId, label: row.kraName }))} onChange={setKraId} />}
    <Hr09Notice>叶子节点 = 没有下级的目标节点。只有分派到员工的叶子节点计分；部门节点用来组织目标。进入评分前核验目标组权重合计为1。</Hr09Notice>
    {options.error && <Hr09State error title="部门选项读取失败" description={options.error.message} onRetry={options.refresh} />}
    {nodes.map((node, index) => <fieldset key={node.key} className="space-y-3 rounded-lg border border-[var(--cf-border)] p-3"><legend className="px-1 text-sm">节点 {index + 1}</legend><div className="grid gap-3 sm:grid-cols-2">
      <Hr09Select label={`节点${index + 1}上级`} value={node.parentKey || ''} placeholder="无上级" options={nodes.map((item, position) => ({ value: item.key, label: `节点 ${position + 1}` })).filter(item => item.value !== node.key)} onChange={parentKey => change(node.key, { parentKey: parentKey || null })} />
      <Hr09Select label={`节点${index + 1}承担类型`} value={node.assigneeType} options={asOptions({ EMPLOYEE: '参评员工', DEPT: '部门' })} required onChange={assigneeType => change(node.key, { assigneeType: assigneeType as AppraisalGoalNode['assigneeType'], assigneeId: '' })} />
      <Hr09Select label={`节点${index + 1}承担人或部门`} value={node.assigneeId} required onChange={assigneeId => change(node.key, { assigneeId })} options={node.assigneeType === 'EMPLOYEE' ? props.detail.results.map(row => ({ value: row.employeeId, label: `${row.employeeName} · ${row.employeeNo}` })) : (options.data?.departments || []).map(row => ({ value: row.identifier, label: row.name }))} />
      <Hr09Input label={`节点${index + 1}权重`} value={node.weight} required inputMode="decimal" hint="0—1，最多四位小数" onChange={event => change(node.key, { weight: event.target.value })} />
      <Hr09Input label={`节点${index + 1}目标值`} value={node.targetValue} required inputMode="decimal" onChange={event => change(node.key, { targetValue: event.target.value })} />
    </div><Button type="button" variant="outline" disabled={nodes.length === 1 || nodes.some(child => child.parentKey === node.key)} onClick={() => setNodes(current => current.filter(item => item.key !== node.key))}>移除节点 {index + 1}</Button></fieldset>)}
    <Button type="button" variant="outline" onClick={() => setNodes(current => [...current, { key: crypto.randomUUID(), parentKey: null, assigneeType: 'EMPLOYEE', assigneeId: '', weight: '', targetValue: '' }])}>添加目标节点</Button>
  </AppraisalForm>;
}

export function AppraisalDistributionEditor(props: AppraisalEditorProps) {
  const rule = props.detail.distributionRule;
  const [name, setName] = useState(rule?.ruleName || `${props.detail.cycle.cycleName}分布规则`);
  const [mode, setMode] = useState<'WARN' | 'BLOCK'>(rule?.enforceMode || 'BLOCK');
  const [rows, setRows] = useState((rule?.distribution || []).map(row => ({ grade: row.grade, percent: row.percent, minCount: row.minCount == null ? '' : String(row.minCount), maxCount: row.maxCount == null ? '' : String(row.maxCount) })));
  const count = (value: string): number | null => {
    if (!value) return null;
    if (!/^\d+$/.test(value) || Number(value) > 2147483647) throw new Hr09Error('人数须为0—2147483647的整数。', 400);
    return Number(value);
  };
  return <AppraisalForm title="配置等级分布" onClose={props.onClose} onReload={() => reload(props)} onSubmit={async () => {
    const distribution: AppraisalQuota[] = rows.map(row => ({ grade: row.grade, percent: appraisalNumber(row.percent, '等级占比', 3, 4), minCount: count(row.minCount), maxCount: count(row.maxCount) }));
    if (!distribution.length || !distribution.reduce((sum, row) => sum.plus(row.percent), new Decimal(0)).equals(100)) throw new Hr09Error('等级占比须合计为100%。', 400);
    await hrAppraisalApi.distribution(props.detail.cycle, name, mode, distribution); props.onSaved();
  }}><Hr09Notice>按冻结人数计算等级名额；余数相同时按此处等级顺序分配。未填人数上限时采用计算出的名额；完成时按“阻止”或“提醒后确认”执行。</Hr09Notice>
    <Hr09Input label="分布规则名称" value={name} maxLength={120} required onChange={event => setName(event.target.value)} />
    <Hr09Select label="不符合分布时" required value={mode} onChange={value => setMode(value as 'WARN' | 'BLOCK')} options={asOptions({ BLOCK: '阻止完成', WARN: '提醒后确认' })} />
    {rows.map((row, index) => <fieldset key={index} className="space-y-3 rounded-lg border border-[var(--cf-border)] p-3"><legend className="px-1 text-sm">等级 {index + 1}</legend><div className="grid gap-3 sm:grid-cols-2">
      {([{ key: 'grade', label: '名称', maxLength: 30 }, { key: 'percent', label: '占比（%）', maxLength: 8 }, { key: 'minCount', label: '最少人数', maxLength: 10 }, { key: 'maxCount', label: '最多人数', maxLength: 10 }] as const).map(field => <Hr09Input key={field.key} label={`等级${index + 1}${field.label}`} required={field.key === 'grade' || field.key === 'percent'} maxLength={field.maxLength} value={row[field.key]} onChange={event => setRows(current => current.map((item, position) => position === index ? { ...item, [field.key]: event.target.value } : item))} />)}
    </div><Button type="button" variant="outline" onClick={() => setRows(current => current.filter((_, position) => position !== index))}>移除等级 {index + 1}</Button></fieldset>)}
    <Button type="button" variant="outline" onClick={() => setRows(current => [...current, { grade: '', percent: '', minCount: '', maxCount: '' }])}>添加等级</Button>
  </AppraisalForm>;
}
