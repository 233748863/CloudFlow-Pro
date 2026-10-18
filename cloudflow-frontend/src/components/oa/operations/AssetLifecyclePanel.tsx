import React, { useState } from 'react';
import { Button } from '@/components/common';
import { oaGet, oaPost, pageRows, type SysAsset, type SysSupplier, type OaAssetDepreciationSchedule, type OaAssetMaintenancePlan, type OaAssetMaintenanceTask, type OaAssetRepair, type OaAssetMovement } from '@/services/api/oaOperations';
import type { PageResult } from '@/types';
import { Section, Metric, OpsTable, money, labelOf, useAccess, useRemote, useMutation } from './OperationsKit';
import { RecordEditor, optionsOf, today, enabledStatuses } from './RecordEditor';

const purposes = { ISSUE: '领用', RETURN: '归还', TRANSFER: '调拨', SCRAP: '报废', DISPOSE: '处置', LOST: '丢失' };
const repairStatuses = { REPORTED: '已报修', DIAGNOSING: '诊断中', REPAIRING: '维修中', COMPLETED: '已完成', CANNOT_REPAIR: '无法修复' };
const documentStatuses = { DRAFT: '草稿', APPROVING: '审批中', REJECTED: '已驳回', COMPLETED: '已完成' };
export default function AssetLifecyclePanel({ asset, onChanged }: { asset: SysAsset; onChanged: () => void }) {
  const can = useAccess(); const mutation = useMutation(); const assetId = asset.assetId;
  const activeAsset = !['SCRAPPED', 'DISPOSED', 'LOST'].includes(asset.status || '');
  const maximumExtension = asset.usefulLifeMonths == null ? 0 : Math.max(0, 1200 - asset.usefulLifeMonths);
  const tabs = [['depreciation', '折旧计划', 'oa:asset-depreciation:list'], ['maintenance', '维保', 'oa:asset-maintenance:list'], ['repairs', '维修', 'oa:asset-repair:list'], ['movements', '调拨', 'oa:asset-movement:list']].filter(item => can(item[2]));
  const [tab, setTab] = useState(tabs[0]?.[0] || '');
  const [plan, setPlan] = useState<OaAssetMaintenancePlan | null>(null); const [task, setTask] = useState<OaAssetMaintenanceTask | null>(null);
  const [repair, setRepair] = useState<OaAssetRepair | null>(null); const [movement, setMovement] = useState<OaAssetMovement | null>(null);
  const [completion, setCompletion] = useState<{ repairId?: number; repairable: number; actions: string } | null>(null);
  const data = useRemote(async () => ({
    schedules: can('oa:asset-depreciation:list') ? await oaGet<OaAssetDepreciationSchedule[]>('/asset/' + assetId + '/depreciation') : [],
    plans: can('oa:asset-maintenance:list') ? await oaGet<OaAssetMaintenancePlan[]>('/asset/' + assetId + '/maintenance-plans') : [],
    tasks: can('oa:asset-maintenance:list') ? await oaGet<OaAssetMaintenanceTask[]>('/asset/' + assetId + '/maintenance-tasks') : [],
    repairs: can('oa:asset-repair:list') ? await oaGet<OaAssetRepair[]>('/asset/' + assetId + '/repairs') : [],
    movements: can('oa:asset-movement:list') ? await oaGet<OaAssetMovement[]>('/asset/' + assetId + '/movements') : [],
  }), [assetId]);
  const suppliers = useRemote<PageResult<SysSupplier> | undefined>(() => can('oa:supplier:list') ? oaGet<PageResult<SysSupplier>>('/supplier/list', { pageNum: 1, pageSize: 200, status: 'ACTIVE' }) : Promise.resolve(undefined), []);
  const supplierOptions = optionsOf(pageRows(suppliers.data), 'supplierId', 'supplierName');
  const [preview, setPreview] = useState<OaAssetDepreciationSchedule[] | null>(null);
  const changed = () => { data.refresh(); setPreview(null); onChanged(); };
  const save = async (path: string, value: unknown) => { await oaPost(path, value); changed(); };
  const schedules = preview || data.data?.schedules || [];
  return <div className="oa-operations space-y-4">
    <div className="grid gap-3 md:grid-cols-3"><Metric label="资产原值" value={money(asset.purchaseAmount)} /><Metric label="累计折旧" value={money(asset.accumulatedDepreciation)} /><Metric label="账面净值" value={money(asset.netBookValue)} /></div>
    <nav className="oa-ops-tabs" aria-label="资产经营"><Button variant="outline" onClick={data.refresh} disabled={data.loading}>刷新记录</Button>{tabs.map(item => <Button key={item[0]} variant={tab === item[0] ? 'default' : 'outline'} onClick={() => setTab(item[0])}>{item[1]}</Button>)}</nav>
    {data.error && <p role="alert" className="oa-ops-warning">{data.error}</p>}
    {data.loading && <p role="status">正在加载资产记录</p>}
    {tab === 'depreciation' && <Section title={preview ? '折旧预览（尚未保存）' : '折旧计划'}><div className="oa-ops-actions mb-4">
      <Button variant="outline" disabled={mutation.busy} onClick={() => void mutation.run(() => oaGet<OaAssetDepreciationSchedule[]>('/asset/' + assetId + '/depreciation/preview'), setPreview, '')}>预览计划</Button>
      {can('oa:asset-depreciation:generate') && <Button disabled={mutation.busy} onClick={() => void mutation.run(() => oaPost('/asset/' + assetId + '/depreciation/generate'), changed)}>生成计划</Button>}
      {can('oa:asset-depreciation:post') && <Button variant="outline" disabled={mutation.busy} onClick={() => void mutation.run(() => oaPost('/asset/' + assetId + '/depreciation/post'), changed)}>过账到期折旧</Button>}
    </div><OpsTable headers={['期次', '日期', '本期折旧', '累计折旧', '净值', '状态']} empty={!schedules.length}>{schedules.map(item => <tr key={item.periodNo}><td>{item.periodNo}</td><td>{item.periodDate}</td><td>{money(item.depreciationAmount)}</td><td>{money(item.accumulatedAmount)}</td><td>{money(item.netValue)}</td><td>{labelOf({ PLANNED: '待过账', POSTED: '已过账', CANCELLED: '已取消' }, item.status)}</td></tr>)}</OpsTable></Section>}
    {tab === 'maintenance' && <><Section title="维保计划">{activeAsset && can('oa:asset-maintenance:edit') && <Button onClick={() => setPlan({ assetId, frequency: 'MONTHLY', maintenanceType: 'PREVENTIVE', nextDueDate: today(), reminderDays: 7, status: 'ACTIVE' })}>新增计划</Button>}
      <OpsTable headers={['计划', '下次日期', '负责人', '状态', '操作']} empty={!data.data?.plans.length}>{data.data?.plans.map(item => <tr key={item.planId}><td>{item.planName}</td><td>{item.nextDueDate}</td><td>{item.responsibleName}</td><td>{labelOf(enabledStatuses, item.status)}</td><td>{activeAsset && can('oa:asset-maintenance:edit') && <Button variant="link" onClick={() => setPlan(item)}>编辑</Button>}</td></tr>)}</OpsTable></Section>
      <Section title="维保任务"><OpsTable headers={['计划日期', '完成日期', '执行人', '结果', '费用', '操作']} empty={!data.data?.tasks.length}>{data.data?.tasks.map(item => <tr key={item.taskId}><td>{item.plannedDate}</td><td>{item.actualDate || '待执行'}</td><td>{item.executorName}</td><td>{labelOf({ NORMAL: '正常', ABNORMAL: '异常', NEED_REPAIR: '需维修' }, item.result)}</td><td>{money(item.cost)}</td><td>{item.status !== 'COMPLETED' && can('oa:asset-maintenance:complete') && <Button variant="link" onClick={() => setTask({ ...item, actualDate: today(), result: 'NORMAL', cost: 0 })}>完成</Button>}{activeAsset && item.status === 'COMPLETED' && item.result === 'NEED_REPAIR' && can('oa:asset-repair:edit') && <Button variant="link" onClick={() => setRepair({ assetId, failureDate: item.actualDate || today(), faultDescription: item.description?.trim() || `维保发现需维修，计划日期：${item.plannedDate}`, repairCost: 0, downtimeHours: 0, capitalizeFlag: 0, lifeExtensionMonths: 0 })}>登记维修</Button>}</td></tr>)}</OpsTable></Section></>}
    {tab === 'repairs' && <Section title="维修单">{activeAsset && can('oa:asset-repair:edit') && <Button onClick={() => setRepair({ assetId, failureDate: today(), repairCost: 0, downtimeHours: 0, capitalizeFlag: 0, lifeExtensionMonths: 0 })}>登记报修</Button>}
      <OpsTable headers={['单号 / 故障', '状态', '维修费', '资本化 / 延寿', '操作']} empty={!data.data?.repairs.length}>{data.data?.repairs.map(item => <tr key={item.repairId}><td>{item.repairNo}<div>{item.faultDescription}</div></td><td>{item.instanceId && !['COMPLETED', 'CANNOT_REPAIR'].includes(item.repairStatus || '') ? '审批中' : labelOf(repairStatuses, item.repairStatus)}</td><td>{money(item.repairCost)}</td><td>{item.capitalizeFlag ? '是' : '否'} / {item.lifeExtensionMonths || 0} 月</td><td>{activeAsset && !item.instanceId && !['COMPLETED', 'CANNOT_REPAIR'].includes(item.repairStatus || '') && <div className="oa-ops-actions">{can('oa:asset-repair:edit') && <Button variant="link" onClick={() => setRepair(item)}>编辑</Button>}{can('oa:asset-repair:complete') && <Button variant="link" onClick={() => setCompletion({ repairId: item.repairId, repairable: 1, actions: item.actionsPerformed || '' })}>完成维修</Button>}</div>}{activeAsset && item.repairStatus === 'CANNOT_REPAIR' && can('oa:asset-movement:edit') && <Button variant="link" onClick={() => setMovement({ assetId, purpose: 'SCRAP', movementDate: today(), reason: `维修单${item.repairNo || ''}无法修复：${item.actionsPerformed || item.faultDescription || ''}`.slice(0, 500) })}>发起报废</Button>}</td></tr>)}</OpsTable></Section>}
    {tab === 'movements' && <Section title="资产调拨单">{activeAsset && can('oa:asset-movement:edit') && <Button onClick={() => setMovement({ assetId, purpose: 'TRANSFER', movementDate: today() })}>新增调拨</Button>}
      <OpsTable headers={['单号', '用途', '原保管人 → 新保管人', '日期', '状态', '操作']} empty={!data.data?.movements.length}>{data.data?.movements.map(item => <tr key={item.movementId}><td>{item.movementNo}</td><td>{labelOf(purposes, item.purpose)}</td><td>{item.fromCustodianName || '—'} → {item.toCustodianName || '—'}</td><td>{item.movementDate}</td><td>{labelOf(documentStatuses, item.status)}</td><td><div className="oa-ops-actions">{activeAsset && ['DRAFT', 'REJECTED'].includes(item.status || '') && can('oa:asset-movement:edit') && <Button variant="link" onClick={() => setMovement(item)}>编辑</Button>}{activeAsset && item.status === 'DRAFT' && can('oa:asset-movement:execute') && <Button variant="link" disabled={mutation.busy} onClick={() => void mutation.run(() => oaPost('/asset/movements/' + item.movementId + '/execute'), changed)}>提交执行</Button>}</div></td></tr>)}</OpsTable></Section>}
    <RecordEditor title="维保计划" value={plan} onClose={() => setPlan(null)} onSave={value => save('/asset/maintenance-plans', value)} fields={[
      { key: 'planName', label: '计划名称', required: true }, { key: 'maintenanceType', label: '维保类型', type: 'select', options: { PREVENTIVE: '预防维护', CALIBRATION: '校准', INSPECTION: '检查' }, required: true },
      { key: 'frequency', label: '频率', type: 'select', options: { MONTHLY: '每月', QUARTERLY: '每季', HALF_YEARLY: '半年', YEARLY: '每年', CUSTOM: '自定义天数' }, required: true },
      { key: 'customIntervalDays', label: '自定义间隔天数', type: 'number', min: 1, step: 1, when: value => value.frequency === 'CUSTOM', required: true },
      { key: 'responsibleId', label: '负责人', type: 'user', required: true }, { key: 'supplierId', label: '维保供应商', type: 'select', numeric: true, options: supplierOptions },
      { key: 'nextDueDate', label: '下次日期', type: 'date', required: true }, { key: 'reminderDays', label: '提前提醒天数', type: 'number', min: 0, step: 1 }, { key: 'status', label: '状态', type: 'select', options: enabledStatuses },
    ]} />
    <RecordEditor title="完成维保" value={task} onClose={() => setTask(null)} onSave={value => save('/asset/maintenance-tasks/complete', value)} fields={[
      { key: 'actualDate', label: '实际日期', type: 'date', required: true }, { key: 'result', label: '结果', type: 'select', options: { NORMAL: '正常', ABNORMAL: '异常', NEED_REPAIR: '需维修' }, required: true },
      { key: 'cost', label: '费用（元）', type: 'number', min: 0, max: 99999999.99, step: 0.01 }, { key: 'description', label: '执行说明', type: 'textarea', wide: true },
    ]} />
    <RecordEditor title="维修单" value={repair} onClose={() => setRepair(null)} onSave={async value => { await save('/asset/repairs', value); setTab('repairs'); }} description={asset.usefulLifeMonths == null ? '登记延寿前，请先填写资产的使用寿命。' : `当前使用寿命为${asset.usefulLifeMonths}个月，最多可延长${maximumExtension}个月。`} fields={[
      { key: 'failureDate', label: '故障日期', type: 'date', required: true }, { key: 'repairStatus', label: '处理状态', type: 'select', options: { REPORTED: '已报修', DIAGNOSING: '诊断中', REPAIRING: '维修中' } },
      { key: 'faultDescription', label: '故障描述', type: 'textarea', required: true, wide: true }, { key: 'supplierId', label: '维修供应商', type: 'select', numeric: true, options: supplierOptions },
      { key: 'repairerName', label: '维修人员' }, { key: 'repairCost', label: '维修费（元）', type: 'number', min: 0, max: 99999999.99, step: 0.01 }, { key: 'downtimeHours', label: '停机小时', type: 'number', min: 0, step: 0.01 },
      { key: 'capitalizeFlag', label: '费用资本化', type: 'checkbox' }, { key: 'lifeExtensionMonths', label: '延长寿命（月）', type: 'number', min: 0, max: maximumExtension, step: 1 },
    ]} />
    <RecordEditor title="完成维修" value={completion} onClose={() => setCompletion(null)} onSave={value => save('/asset/repairs/' + value.repairId + '/complete', { repairable: value.repairable === 1, actions: value.actions })} description="资本化、延长寿命或达到费用审批条件后，审批通过才计入资产。" fields={[
      { key: 'repairable', label: '已修复（取消勾选表示无法修复）', type: 'checkbox' }, { key: 'actions', label: '处理记录', type: 'textarea', required: true, wide: true },
    ]} />
    <RecordEditor title="资产调拨单" value={movement} onClose={() => setMovement(null)} onSave={async value => { await save('/asset/movements', value); setTab('movements'); }} description="调拨、报废、处置和丢失提交后进入审批；审批通过前保留原资产状态。" fields={[
      { key: 'purpose', label: '用途', type: 'select', options: purposes, required: true }, { key: 'movementDate', label: '日期', type: 'date', required: true },
      { key: 'toCustodianId', label: '目标保管人', type: 'user', when: value => ['ISSUE', 'TRANSFER'].includes(value.purpose || ''), required: true },
      { key: 'toDeptId', label: '目标部门', type: 'department' }, { key: 'toLocation', label: '目标位置' }, { key: 'reason', label: '原因', type: 'textarea', maxLength: 500, required: true, wide: true },
    ]} />
  </div>;
}
