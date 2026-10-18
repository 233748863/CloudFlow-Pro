import React, { Suspense, useEffect, useState } from 'react';
import type { FormField } from '../../types';
import { Button, DeptSelector, Input, Switch, Textarea } from '@/components/common';
import { SelectorShell } from '@/components/common/SelectorShell';
import { dictTypeApi, type SysDictType } from '@/services/api/dict';
import { getSubTableColumns, isLayoutField, isStaticField, listFormFields, supportsImSummary } from '@/utils/formTree';
import { FormScalarControl } from '../form-renderer/FormScalarControl';
import { FieldExpressionEditor } from './FieldExpressionEditor';
import type { FieldPropertyEditorProps } from './propertyTypes';

const Toggle: React.FC<{ label: string; checked: boolean; onChange: (checked: boolean) => void }> = ({ label, checked, onChange }) => <label className="flex min-h-11 items-center justify-between gap-3 text-xs text-cf-subtle"><span>{label}</span><Switch checked={checked} onCheckedChange={onChange} /></label>;
const Property: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => <label className="block space-y-1.5"><span className="text-xs font-medium text-cf-subtle">{label}</span>{children}</label>;

const DictionaryTypePicker: React.FC<{ value?: string; onChange: (value: string) => void }> = ({ value, onChange }) => {
  const [types, setTypes] = useState<SysDictType[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true); setFailed(false);
    void dictTypeApi.list().then((rows) => { if (active) setTypes(rows.filter((row) => row.status === undefined || row.status === '0')); })
      .catch(() => { if (active) { setFailed(true); setTypes([]); } }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [attempt]);
  return <div className="space-y-1"><SelectorShell options={types.map((type) => ({ id: type.dictType, label: type.dictName, subLabel: type.dictType }))} value={value ? [value] : []} loading={loading} disabled={failed} multiple={false} showAvatar={false} placeholder="选择数据字典" onToggle={onChange} onRemove={() => onChange('')} />
    {failed ? <Button type="button" variant="link" size="sm" onClick={() => setAttempt((previous) => previous + 1)}>字典类型加载失败，点击重试</Button> : null}</div>;
};

export const FieldPropertyEditor: React.FC<FieldPropertyEditorProps> = ({ field, fieldPath, fields, onChange }) => {
  const numeric = field.type === 'NUMBER' || field.type === 'AMOUNT';
  const layout = isLayoutField(field);
  const staticField = isStaticField(field);
  const choices = ['SELECT', 'MULTI_SELECT', 'RADIO_GROUP', 'CHECKBOX_GROUP'].includes(field.type);
  const references = ['EMPLOYEE', 'DEPT', 'POST', 'POSITION'].includes(field.type);
  const column = fieldPath.includes('.');
  const numericColumns = getSubTableColumns(field).filter((item) => item.type === 'NUMBER' || item.type === 'AMOUNT');
  const setNumber = (property: keyof FormField, text: string) => onChange({ [property]: text === '' ? undefined : Number(text) });
  return <div className="space-y-4">
    <Property label="字段名称"><Input value={field.label} maxLength={200} onChange={(event) => onChange({ label: event.target.value })} /></Property>
    <Property label="字段标识"><Input value={field.id} readOnly className="font-mono text-xs" /></Property>
    {!layout && !staticField ? <div className="grid grid-cols-2 gap-3"><Toggle label="必填" checked={field.required} onChange={(required) => onChange({ required })} /><Toggle label="只读" checked={field.readonly === true} onChange={(readonly) => onChange({ readonly })} /></div> : null}
    {supportsImSummary(field, fieldPath) ? <div className="space-y-1"><Toggle label="允许显示在企业微信待办摘要" checked={field.imSummaryAllowed === true} onChange={(imSummaryAllowed) => onChange({ imSummaryAllowed })} /><p className="text-xs leading-relaxed text-cf-faint">默认关闭。开启后，仅向有权查看此字段的接收人展示；每张卡片按表单顺序最多展示5项。关闭后停止后续外发，已发出的内容仍可能被接收人保留。</p></div> : null}
    {!layout && field.type !== 'SUB_TABLE' && !staticField ? <Property label="填写提示"><Input value={field.placeholder || ''} onChange={(event) => onChange({ placeholder: event.target.value || undefined })} /></Property> : null}
    {layout ? <><Property label="容器标题"><Input value={field.title || ''} placeholder={field.label} onChange={(event) => onChange({ title: event.target.value || undefined })} /></Property>
      {field.type === 'GRID' ? <Property label="网格列数"><select className="cf-control w-full" value={typeof field.columns === 'number' ? field.columns : 2} onChange={(event) => onChange({ columns: Number(event.target.value) })}>{[2, 3, 4].map((count) => <option key={count} value={count}>{count}列</option>)}</select></Property> : null}
      {field.type === 'COLLAPSE' ? <Toggle label="默认展开" checked={field.defaultExpanded !== false} onChange={(defaultExpanded) => onChange({ defaultExpanded })} /> : null}
      <Toggle label="子字段全部只读" checked={field.readonly === true} onChange={(readonly) => onChange({ readonly })} />
    </> : null}
    {numeric ? <><div className="grid grid-cols-2 gap-3"><Property label="最小值"><Input inputMode="decimal" value={field.min ?? ''} onChange={(event) => onChange({ min: event.target.value || undefined })} /></Property><Property label="最大值"><Input inputMode="decimal" value={field.max ?? ''} onChange={(event) => onChange({ max: event.target.value || undefined })} /></Property></div>
      <Property label="小数位数（0—18）"><Input type="number" min={0} max={18} value={field.precision ?? (field.type === 'AMOUNT' ? 2 : '')} onChange={(event) => setNumber('precision', event.target.value)} /></Property></> : null}
    {choices ? <Property label="选项（每行一个）"><Textarea value={(field.options || []).join('\n')} rows={5} onChange={(event) => onChange({ options: event.target.value.split('\n') })} /></Property> : null}
    {field.type === 'DICT_SELECT' ? <><Property label="数据字典"><DictionaryTypePicker value={field.dictType} onChange={(dictType) => onChange({ dictType })} /></Property><Toggle label="允许多选" checked={field.multiple === true} onChange={(multiple) => onChange({ multiple, defaultValue: undefined })} /></> : null}
    {['EMPLOYEE', 'DEPT', 'USER_MULTI', 'DEPT_MULTI'].includes(field.type) ? <Property label="限定部门（含下级）"><DeptSelector single value={field.scopeDeptId || null} allowClear onChange={(identifier, picked) => onChange({ scopeDeptId: picked?.deptId != null ? String(picked.deptId) : identifier === null ? undefined : String(identifier) })} /></Property> : null}
    {references || field.type === 'USER_MULTI' || field.type === 'DEPT_MULTI' ? <Toggle label="仅显示启用记录" checked={field.onlyActive !== false} onChange={(onlyActive) => onChange({ onlyActive })} /> : null}
    {field.type === 'TEXTAREA' ? <Property label="输入框行数"><Input type="number" min={2} max={20} value={field.rows || 4} onChange={(event) => setNumber('rows', event.target.value)} /></Property> : null}
    {field.type.startsWith('UPLOAD_') ? <><Property label="允许格式"><Input value={field.accept || ''} placeholder={field.type === 'UPLOAD_IMAGE' ? 'image/*' : '.pdf,.docx,.xlsx'} onChange={(event) => onChange({ accept: event.target.value || undefined })} /></Property>
      <div className="grid grid-cols-2 gap-3"><Property label="单个文件上限（MB）"><Input type="number" min={1} value={field.maxSize ?? 10} onChange={(event) => setNumber('maxSize', event.target.value)} /></Property><Property label="最多文件数"><Input type="number" min={1} max={column ? 1 : 100} value={column ? 1 : field.maxCount ?? 5} disabled={column} onChange={(event) => setNumber('maxCount', event.target.value)} /></Property></div></> : null}
    {field.type === 'SUB_TABLE' ? <><div className="grid grid-cols-2 gap-3"><Property label="最少行数"><Input type="number" min={0} max={500} value={field.minRows ?? 0} onChange={(event) => setNumber('minRows', event.target.value)} /></Property><Property label="最多行数"><Input type="number" min={1} max={500} value={field.maxRows ?? 100} onChange={(event) => setNumber('maxRows', event.target.value)} /></Property></div>
      <div className="grid grid-cols-2 gap-x-3">{([['allowAdd', '允许新增'], ['allowDelete', '允许删除'], ['allowSort', '允许排序'], ['allowCopyRow', '允许复制']] as const).map(([property, label]) => <Toggle key={property} label={label} checked={field[property] !== false} onChange={(checked) => onChange({ [property]: checked })} />)}</div>
      <Property label="空表提示"><Input value={field.emptyText || ''} placeholder="暂无明细，请新增一条" onChange={(event) => onChange({ emptyText: event.target.value || undefined })} /></Property>
      {numericColumns.length ? <div className="space-y-2"><span className="text-xs font-medium text-cf-subtle">数值列合计</span>{numericColumns.map((item) => <label key={item.id} className="flex items-center gap-2 text-xs text-cf-subtle"><span className="min-w-0 flex-1 truncate">{item.label}</span><select className="cf-control w-24" value={field.summaryColumns?.find((summary) => summary.columnId === item.id)?.aggregation || ''} onChange={(event) => {
        const next = (field.summaryColumns || []).filter((summary) => summary.columnId !== item.id);
        if (event.target.value) next.push({ columnId: item.id, aggregation: event.target.value as 'SUM' | 'COUNT' | 'AVG' });
        onChange({ summaryColumns: next });
      }}><option value="">不合计</option><option value="SUM">求和</option><option value="COUNT">计数</option><option value="AVG">平均</option></select></label>)}</div> : null}
    </> : null}
    {column ? <Property label="列宽（像素）"><Input type="number" min={120} max={800} value={field.width || 160} onChange={(event) => setNumber('width', event.target.value)} /></Property>
      : <Property label="占用网格列数"><select className="cf-control w-full" value={field.span || ''} onChange={(event) => setNumber('span', event.target.value)}><option value="">自动</option>{[1, 2, 3, 4].map((span) => <option key={span} value={span}>{span}列</option>)}</select></Property>}
    {!layout && field.type !== 'SUB_TABLE' && !field.type.startsWith('UPLOAD_') && !['EMPLOYEE', 'DEPT', 'POST', 'POSITION', 'USER_MULTI', 'DEPT_MULTI', 'DIVIDER'].includes(field.type) ? <div className="space-y-2"><div className="flex items-center justify-between"><span className="text-xs font-medium text-cf-subtle">{staticField ? '说明内容' : '默认值'}</span><Button type="button" variant="link" size="sm" onClick={() => onChange({ defaultValue: undefined })}>清空</Button></div>
      {staticField ? <Textarea rows={4} value={String(field.defaultValue || '')} onChange={(event) => onChange({ defaultValue: event.target.value })} />
        : <Suspense fallback={<p className="text-xs text-cf-faint">加载默认值控件…</p>}><FormScalarControl field={{ ...field, readonly: false, required: false }} fieldPath={fieldPath} inputId={`default-${fieldPath}`} value={field.defaultValue} data={{}} disabled={false} readonly={false} onChange={(defaultValue) => onChange({ defaultValue })} /></Suspense>}
    </div> : null}
    {!layout && !staticField && field.type !== 'SUB_TABLE' ? <details className="text-xs text-cf-subtle"><summary className="cursor-pointer py-2">格式校验</summary><div className="mt-2 space-y-3"><Property label="完整匹配规则"><Input value={field.regex || ''} placeholder="^1[0-9]{10}$" className="font-mono" onChange={(event) => onChange({ regex: event.target.value || undefined })} /></Property><Property label="校验提示"><Input value={field.errorMsg || ''} onChange={(event) => onChange({ errorMsg: event.target.value || undefined })} /></Property></div></details> : null}
    {references ? <details className="text-xs text-cf-subtle"><summary className="cursor-pointer py-2">高级回填规则</summary><div className="mt-2 space-y-3"><Property label="名称展示字段"><Input value={field.displayFieldId || ''} onChange={(event) => onChange({ displayFieldId: event.target.value || undefined })} /></Property>
      <Property label="按表单中的部门筛选"><select className="cf-control w-full" value={field.filterByDeptFieldId || ''} onChange={(event) => onChange({ filterByDeptFieldId: event.target.value || undefined })}><option value="">不联动</option>{listFormFields(fields).filter((location) => location.field.type === 'DEPT').map((location) => <option key={location.path} value={location.field.id}>{location.field.label}</option>)}</select></Property>
      {(field.fillMappings || []).map((mapping, index) => <div key={index} className="space-y-1 rounded border border-[var(--cf-border)] p-2"><Input aria-label="回填目标" value={mapping.targetFieldId} placeholder="目标字段" onChange={(event) => onChange({ fillMappings: field.fillMappings?.map((item, mappingIndex) => index === mappingIndex ? { ...item, targetFieldId: event.target.value } : item) })} /><Input aria-label="回填来源" value={mapping.source} placeholder="来源属性" onChange={(event) => onChange({ fillMappings: field.fillMappings?.map((item, mappingIndex) => index === mappingIndex ? { ...item, source: event.target.value } : item) })} /><Button type="button" variant="ghost" size="sm" onClick={() => onChange({ fillMappings: field.fillMappings?.filter((_, mappingIndex) => index !== mappingIndex) })}>移除此规则</Button></div>)}
      <Button type="button" variant="outline" size="sm" onClick={() => onChange({ fillMappings: [...(field.fillMappings || []), { targetFieldId: '', source: '', clearWhenEmpty: true }] })}>新增回填规则</Button>
    </div></details> : null}
    <FieldExpressionEditor fields={fields} fieldPath={fieldPath} value={field.visibleExpr} label="显示条件（成立时显示）" onChange={(visibleExpr) => onChange({ visibleExpr })} />
    <FieldExpressionEditor fields={fields} fieldPath={fieldPath} value={field.disabledExpr} label="只读条件（成立时禁止编辑）" onChange={(disabledExpr) => onChange({ disabledExpr })} />
  </div>;
};
