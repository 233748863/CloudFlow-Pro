import React from 'react';
import { Button } from '@/components/common';
import { InfrastructureSelect } from '@/pages/system/_components/InfrastructurePrimitives';
import type { ReportField, ReportFilter, ReportFilterGroup } from '@/services/api/report';

const operatorNames: Record<string, string> = { EQ: '等于', NE: '不等于', GT: '大于', GE: '大于等于', LT: '小于', LE: '小于等于', IN: '属于列表', BETWEEN: '介于范围', LIKE: '包含文字', IS_NULL: '未填写' };
const emptyGroup = (): ReportFilterGroup => ({ junction: 'AND', conditions: [], groups: [] });
const conditionCount = (group: ReportFilterGroup | null): number => group ? group.conditions.length + group.groups.reduce((count, child) => count + conditionCount(child), 0) : 0;

export function ReportFilterEditor({ fields, value, onChange, disabled }: { fields: ReportField[]; value: ReportFilterGroup | null; onChange: (value: ReportFilterGroup | null) => void; disabled?: boolean }) {
  const available = fields.filter(field => field.operators.length > 0);
  const first = available[0];
  const createCondition = (): ReportFilter => ({ field: first.code, operator: 'EQ', values: [''] });
  const update = (group: ReportFilterGroup) => onChange(group.conditions.length || group.groups.length ? group : null);
  const renderGroup = (group: ReportFilterGroup, depth: number, setGroup: (group: ReportFilterGroup) => void): React.ReactNode => <div className="report-filter-group space-y-3">
    <InfrastructureSelect aria-label={depth ? '子组关系' : '筛选关系'} disabled={disabled} value={group.junction} options={[{ value: 'AND', label: '同时满足' }, { value: 'OR', label: '满足任一' }]} onValueChange={junction => setGroup({ ...group, junction: junction as 'AND' | 'OR' })} />
    {group.conditions.map((condition, index) => {
      const field = available.find(candidate => candidate.code === condition.field) ?? first;
      const setCondition = (updated: ReportFilter) => setGroup({ ...group, conditions: group.conditions.map((existing, position) => position === index ? updated : existing) });
      return <div key={index} className="space-y-2"><div className="grid grid-cols-2 gap-2">
        <InfrastructureSelect aria-label="筛选字段" disabled={disabled} value={condition.field} options={available.map(candidate => ({ value: candidate.code, label: candidate.name }))} onValueChange={fieldCode => setCondition({ field: fieldCode, operator: 'EQ', values: [''] })} />
        <InfrastructureSelect aria-label="筛选操作" disabled={disabled} value={condition.operator} options={field.operators.map(operator => ({ value: operator, label: operatorNames[operator] }))} onValueChange={operator => setCondition({ ...condition, operator, values: operator === 'IS_NULL' ? [] : operator === 'BETWEEN' ? ['', ''] : [''] })} />
      </div>
        {condition.operator === 'IN' ? <label className="report-field">列表值，每行一个，最多100个<textarea disabled={disabled} value={condition.values.join('\n')} onChange={event => setCondition({ ...condition, values: event.target.value.split('\n') })} rows={3} /></label>
          : condition.operator !== 'IS_NULL' && <div className="flex gap-2">{condition.values.map((current, valueIndex) => <label key={valueIndex} className="report-field min-w-0 flex-1">{condition.operator === 'BETWEEN' ? valueIndex ? '上界' : '下界' : '筛选值'}<input disabled={disabled} type={field.type === 'DATE' ? 'date' : 'text'} inputMode={field.type === 'NUMBER' || field.type === 'ID' ? 'decimal' : 'text'} value={current} maxLength={field.type === 'TEXT' ? 200 : 32} onChange={event => setCondition({ ...condition, values: condition.values.map((previous, position) => position === valueIndex ? event.target.value : previous) })} /></label>)}</div>}
        <Button variant="ghost" disabled={disabled} onClick={() => setGroup({ ...group, conditions: group.conditions.filter((unused, position) => position !== index) })}>移除此条件</Button>
      </div>;
    })}
    {group.groups.map((child, index) => <div key={index}>{renderGroup(child, depth + 1, updated => setGroup({ ...group, groups: updated.conditions.length || updated.groups.length ? group.groups.map((previous, position) => position === index ? updated : previous) : group.groups.filter((unused, position) => position !== index) }))}</div>)}
    <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={disabled || !first || conditionCount(value) >= 20} onClick={() => setGroup({ ...group, conditions: [...group.conditions, createCondition()] })}>添加条件</Button>
      {depth === 0 && <Button variant="outline" disabled={disabled || !first || conditionCount(value) >= 20} onClick={() => setGroup({ ...group, groups: [...group.groups, { ...emptyGroup(), conditions: [createCondition()] }] })}>添加条件子组</Button>}
    </div>
  </div>;
  return <div className="space-y-2"><p className="text-sm font-medium">筛选条件（最多20项、两层）</p>{renderGroup(value ?? emptyGroup(), 0, update)}</div>;
}
