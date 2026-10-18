import React, { useState } from 'react';
import { Button } from '@/components/common';
import { oaGet, oaPost, type OaActivityType, type OaActivityCost, type Identity } from '@/services/api/oaOperations';
import { OperationsPage, Section, OpsTable, money, labelOf, useRemote, useAccess } from '@/components/oa/operations/OperationsKit';
import { RecordEditor, optionsOf, today, enabledStatuses } from '@/components/oa/operations/RecordEditor';

export default function ActivityCatalogPage() {
  const can = useAccess(); const [type, setType] = useState<OaActivityType | null>(null); const [cost, setCost] = useState<OaActivityCost | null>(null);
  const data = useRemote(async () => ({ types: await oaGet<OaActivityType[]>('/activity-catalog/types'), costs: can('oa:activity-cost:list') ? await oaGet<OaActivityCost[]>('/activity-catalog/costs') : [], employees: can('oa:activity-cost:list') ? await oaGet<Identity[]>('/activity-catalog/employees') : [], levels: can('oa:activity-cost:list') ? await oaGet<Identity[]>('/activity-catalog/job-levels') : [] }));
  return <OperationsPage title="工时活动与单价" description="按员工、职级或默认范围配置单价，审批通过的历史工时保持原单价。" loading={data.loading} error={data.error} refresh={data.refresh}>
    <Section title="活动类型">{can('oa:activity-type:edit') && <Button onClick={() => setType({ status: 'ACTIVE', billableDefaultFlag: 1, sortNo: 0 })}>新增活动</Button>}
      <OpsTable headers={['编码', '名称', '默认计费', '状态', '操作']} empty={!data.data?.types.length}>{data.data?.types.map(item => <tr key={item.typeId}><td>{item.typeCode}</td><td>{item.typeName}</td><td>{item.billableDefaultFlag ? '计费' : '不计费'}</td><td>{labelOf(enabledStatuses, item.status)}</td><td>{can('oa:activity-type:edit') && <Button variant="link" onClick={() => setType(item)}>编辑</Button>}</td></tr>)}</OpsTable>
    </Section>
    {can('oa:activity-cost:list') && <Section title="成本与计费单价">{can('oa:activity-cost:edit') && <Button onClick={() => setCost({ status: 'ACTIVE', currency: 'CNY', employeeId: 0, jobLevelId: 0, effectiveStart: today(), costingRate: 0, billingRate: 0 })}>新增单价</Button>}
      <OpsTable headers={['活动', '适用范围', '成本单价（元/小时）', '计费单价（元/小时）', '有效期', '状态', '操作']} empty={!data.data?.costs.length}>{data.data?.costs.map(item => <tr key={item.costId}><td>{data.data.types.find(activity => String(activity.typeId) === String(item.activityTypeId))?.typeName}</td><td>{Number(item.employeeId) > 0 ? data.data.employees.find(person => String(person.id) === String(item.employeeId))?.name : Number(item.jobLevelId) > 0 ? data.data.levels.find(level => String(level.id) === String(item.jobLevelId))?.name : '默认'}</td><td>{money(item.costingRate)}</td><td>{money(item.billingRate)}</td><td>{item.effectiveStart} ~ {item.effectiveEnd || '长期'}</td><td>{labelOf(enabledStatuses, item.status)}</td><td>{can('oa:activity-cost:edit') && <Button variant="link" onClick={() => setCost(item)}>编辑</Button>}</td></tr>)}</OpsTable>
    </Section>}
    <RecordEditor title="活动类型" value={type} onClose={() => setType(null)} onSave={async value => { await oaPost('/activity-catalog/types', value); data.refresh(); }} fields={[
      { key: 'typeCode', label: '活动编码', required: true, maxLength: 50 }, { key: 'typeName', label: '活动名称', required: true, maxLength: 100 }, { key: 'billableDefaultFlag', label: '默认计费', type: 'checkbox' },
      { key: 'status', label: '状态', type: 'select', options: enabledStatuses }, { key: 'sortNo', label: '排序', type: 'number', step: 1, min: 0 }, { key: 'remark', label: '说明', type: 'textarea', wide: true },
    ]} />
    <RecordEditor title="工时单价" value={cost} onClose={() => setCost(null)} onSave={async value => { await oaPost('/activity-catalog/costs', value); data.refresh(); }} description="员工和职级只能选一项；两项都留空则为默认价格，同一范围的生效日期不能重叠。" fields={[
      { key: 'activityTypeId', label: '活动类型', type: 'select', numeric: true, options: optionsOf(data.data?.types, 'typeId', 'typeName'), required: true },
      { key: 'employeeId', label: '指定员工', type: 'select', numeric: true, options: { '0': '不指定', ...optionsOf(data.data?.employees, 'id', 'name') } }, { key: 'jobLevelId', label: '指定职级', type: 'select', numeric: true, options: { '0': '不指定', ...optionsOf(data.data?.levels, 'id', 'name') } },
      { key: 'costingRate', label: '成本单价（元/小时）', type: 'number', min: 0, max: 9999999999.99, step: 0.01, required: true }, { key: 'billingRate', label: '计费单价（元/小时）', type: 'number', min: 0, max: 9999999999.99, step: 0.01, required: true },
      { key: 'effectiveStart', label: '生效开始日', type: 'date', required: true }, { key: 'effectiveEnd', label: '生效结束日', type: 'date' }, { key: 'status', label: '状态', type: 'select', options: enabledStatuses },
    ]} />
  </OperationsPage>;
}
