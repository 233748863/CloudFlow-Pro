import { Button } from '@/components/common';
import { InfrastructureSelect } from '@/pages/system/_components/InfrastructurePrimitives';
import type { ReportField, ReportFilter, ReportFilterGroup } from '@/services/api/report';

interface Props {
  fields: ReportField[];
  value: ReportFilterGroup | null;
  onChange: (value: ReportFilterGroup | null) => void;
  disabled?: boolean;
}

const operatorNames: Record<string, string> = {
  EQ: '等于', NE: '不等于', GT: '大于', GE: '大于或等于', LT: '小于', LE: '小于或等于',
  IN: '属于列表', BETWEEN: '介于范围', LIKE: '包含文字', IS_NULL: '未填写',
};
const emptyGroup = (): ReportFilterGroup => ({ junction: 'AND', conditions: [], groups: [] });
const initialValues = (operator: string): string[] => operator === 'IS_NULL' || operator === 'IN' ? [] : operator === 'BETWEEN' ? ['', ''] : [''];
const countConditions = (group: ReportFilterGroup): number => group.conditions.length + group.groups.reduce((total, child) => total + countConditions(child), 0);
const hasConditions = (group: ReportFilterGroup) => group.conditions.length > 0 || group.groups.length > 0;

export function ReportFilterEditor({ fields, value, onChange, disabled = false }: Props) {
  const availableFields = fields.filter(field => field.operators.length > 0);
  const root = value ?? emptyGroup();
  const count = countConditions(root);
  const cannotAdd = disabled || count >= 20 || availableFields.length === 0;
  const newCondition = (): ReportFilter => {
    const field = availableFields[0];
    return { field: field.code, operator: field.operators[0], values: initialValues(field.operators[0]) };
  };

  const renderGroup = (group: ReportFilterGroup, depth: number, update: (next: ReportFilterGroup) => void, remove?: () => void) => (
    <fieldset className="report-filter-group" disabled={disabled}>
      <legend>{depth === 1 ? '筛选条件' : '条件子组'}</legend>
      <div className="report-filter-toolbar">
        <InfrastructureSelect aria-label={depth === 1 ? '筛选关系' : '子组筛选关系'} value={group.junction} disabled={disabled}
          options={[{ value: 'AND', label: '同时满足（AND）' }, { value: 'OR', label: '满足任一（OR）' }]}
          onValueChange={junction => update({ ...group, junction: junction as ReportFilterGroup['junction'] })} />
        {remove && <Button type="button" variant="ghost" disabled={disabled} onClick={remove}>移除此子组</Button>}
      </div>
      {group.conditions.map((condition, index) => {
        const field = availableFields.find(entry => entry.code === condition.field);
        const change = (next: ReportFilter) => update({ ...group, conditions: group.conditions.map((entry, position) => position === index ? next : entry) });
        const setValue = (position: number, text: string) => change({ ...condition, values: condition.values.map((entry, valueIndex) => valueIndex === position ? text : entry) });
        return <div className="report-filter-condition" key={index}>
          <InfrastructureSelect aria-label="筛选字段" value={condition.field} disabled={disabled}
            options={availableFields.map(entry => ({ value: entry.code, label: entry.name }))}
            onValueChange={code => {
              const next = availableFields.find(entry => entry.code === code)!;
              change({ field: code, operator: next.operators[0], values: initialValues(next.operators[0]) });
            }} />
          <InfrastructureSelect aria-label="筛选操作" value={condition.operator} disabled={disabled}
            options={(field?.operators ?? []).map(operator => ({ value: operator, label: operatorNames[operator] }))}
            onValueChange={operator => change({ ...condition, operator, values: initialValues(operator) })} />
          <div className="report-filter-values">
            {!field && <p role="alert" className="report-error">该筛选字段已不可用，请重新选择。</p>}
            {condition.operator === 'IN' ? <>
              <textarea aria-label="列表值，每行一个，最多100个" rows={3} disabled={disabled}
                aria-invalid={condition.values.length > 100} value={condition.values.join('\n')}
                placeholder="每行一个值，最多100个"
                onChange={event => change({ ...condition, values: event.target.value === '' ? [] : event.target.value.split(/\r?\n/) })} />
              {condition.values.length > 100 && <p role="alert" className="report-error">列表最多100个值，请删减后查询。</p>}
            </> : condition.operator !== 'IS_NULL' && condition.values.map((entry, position) => <input key={position}
              aria-label={condition.operator === 'BETWEEN' ? position === 0 ? '下界' : '上界' : '筛选值'}
              type={field?.type === 'DATE' ? 'date' : 'text'} inputMode={field?.type === 'NUMBER' ? 'decimal' : field?.type === 'ID' ? 'numeric' : undefined}
              maxLength={field?.type === 'TEXT' ? 200 : undefined} disabled={disabled} value={entry}
              onChange={event => setValue(position, event.target.value)} />)}
          </div>
          <Button type="button" variant="ghost" aria-label="移除此条件" disabled={disabled}
            onClick={() => update({ ...group, conditions: group.conditions.filter((_, position) => position !== index) })}>移除</Button>
        </div>;
      })}
      <div className="report-filter-toolbar">
        <Button type="button" variant="outline" disabled={cannotAdd} onClick={() => update({ ...group, conditions: [...group.conditions, newCondition()] })}>添加条件</Button>
        {depth === 1 && <Button type="button" variant="outline" disabled={cannotAdd}
          onClick={() => update({ ...group, groups: [...group.groups, { ...emptyGroup(), conditions: [newCondition()] }] })}>添加条件子组</Button>}
      </div>
      {group.groups.map((child, index) => <div key={index}>
        {renderGroup(child, depth + 1, next => update({ ...group, groups: group.groups.map((entry, position) => position === index ? next : entry).filter(hasConditions) }),
          () => update({ ...group, groups: group.groups.filter((_, position) => position !== index) }))}
      </div>)}
    </fieldset>
  );

  return <div className="report-filter-editor">
    <p className="text-sm text-cf-muted">最多两层分组，共{count}/20个条件；未添加条件时按当前权限查询。</p>
    {renderGroup(root, 1, next => onChange(hasConditions(next) ? next : null))}
  </div>;
}
