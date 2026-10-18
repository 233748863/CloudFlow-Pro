import React, { useEffect, useState } from 'react';
import { Button } from '@/components/common';
import { BaseDialog } from '@/components/common/BaseDialog';
import type { PageResult } from '@/types';
import { ConsumablePicker } from '@/pages/admin/consumable/consumableUi';
import type { Project } from '@/services/api/project';
import { oaGet, oaPost, pageRows, type RfqDetail, type OaPurchaseRfqItem } from '@/services/api/oaOperations';
import { OpsTable, money, useRemote, useAccess, useMutation } from './OperationsKit';
import { FormFields, RecordEditor, optionsOf } from './RecordEditor';
import PrivateFileInput from './PrivateFileInput';

export default function RfqDraftEditor({ value, onClose, onSaved }: { value: RfqDetail | null; onClose: () => void; onSaved: (id: number) => void }) {
  const can = useAccess(); const mutation = useMutation(); const [draft, setDraft] = useState<RfqDetail | null>(value); const [item, setItem] = useState<OaPurchaseRfqItem | null>(null); const [index, setIndex] = useState(-1);
  const [uploading, setUploading] = useState(false);
  useEffect(() => setDraft(value), [value]);
  const projects = useRemote<PageResult<Project> | undefined>(() => can('oa:project:list') ? oaGet<PageResult<Project>>('/project/list', { pageNum: 1, pageSize: 200 }) : Promise.resolve(undefined));
  return <><BaseDialog open={!!value} title="询价单草稿" width="extra-wide" onClose={() => { if (!uploading && !mutation.busy) onClose(); }} footer={<><Button variant="outline" disabled={uploading || mutation.busy} onClick={onClose}>取消</Button><Button disabled={uploading || mutation.busy || !draft?.items.length} onClick={() => draft && void mutation.run(() => oaPost<number>('/rfq', draft), id => { onSaved(id); onClose(); })}>保存询价</Button></>}>
    {draft && <div className="oa-operations space-y-4"><FormFields value={draft.rfq} onChange={rfq => setDraft({ ...draft, rfq })} fields={[
      { key: 'title', label: '询价标题', required: true, maxLength: 200, wide: true }, { key: 'quoteDeadline', label: '报价截止日期', type: 'date', required: true },
      { key: 'expectedDeliveryDate', label: '期望交付日期', type: 'date' }, { key: 'deptId', label: '需求部门', type: 'department' },
      { key: 'projectId', label: '所属项目', type: 'select', numeric: true, options: optionsOf(pageRows(projects.data), 'projectId', 'projectName') },
      { key: 'deliveryAddress', label: '交付地址', maxLength: 500, wide: true }, { key: 'paymentTerms', label: '付款条件', maxLength: 500, wide: true }, { key: 'termsContent', label: '询价要求', type: 'textarea', wide: true },
    ]} />
      <PrivateFileInput path="/rfq/invitation-files" value={draft.rfq.attachmentUrl} label="本询价对外邀请附件" onBusyChange={setUploading} onChange={reference => setDraft(current => current && ({ ...current, rfq: { ...current.rfq, attachmentUrl: reference } }))} />
      {draft.rfq.attachmentUrl && <Button className="!min-h-[44px]" variant="outline" disabled={uploading || mutation.busy} onClick={() => setDraft({ ...draft, rfq: { ...draft.rfq, attachmentUrl: '' } })}>移除本单附件关联</Button>}
      <OpsTable headers={['物料', '规格', '单位', '数量', '预计未税单价', '要求', '操作']} empty={!draft.items.length}>{draft.items.map((line, position) => <tr key={line.itemId || position}><td>{line.itemName}</td><td>{line.spec}</td><td>{line.unit}</td><td>{line.quantity}</td><td>{money(line.expectedPrice)}</td><td>{line.brandRequirement} {line.technicalRequirement}</td><td><div className="oa-ops-actions"><Button variant="link" onClick={() => { setIndex(position); setItem(line); }}>编辑</Button><Button variant="link" onClick={() => setDraft({ ...draft, items: draft.items.filter((candidate, rowIndex) => rowIndex !== position) })}>移除</Button></div></td></tr>)}</OpsTable>
      <Button variant="outline" onClick={() => { setIndex(-1); setItem({ quantity: 1, unit: '个', sortNo: draft.items.length }); }}>添加询价物料</Button>
    </div>}
  </BaseDialog><RecordEditor title="询价物料" value={item} onClose={() => setItem(null)} onSave={async entry => { if (draft) setDraft({ ...draft, items: index < 0 ? [...draft.items, entry] : draft.items.map((candidate, position) => position === index ? entry : candidate) }); }} fields={[
    { key: 'itemName', label: '物料名称', required: true, maxLength: 200 }, { key: 'spec', label: '规格', maxLength: 200 }, { key: 'unit', label: '计量单位', required: true, maxLength: 20 },
    { key: 'quantity', label: '数量', type: 'number', min: 1, step: 1, required: true }, { key: 'expectedPrice', label: '预计未税单价', type: 'number', min: 0, max: 99999999.99, step: 0.01 },
    { key: 'brandRequirement', label: '品牌要求', maxLength: 200 }, { key: 'technicalRequirement', label: '技术要求', type: 'textarea', wide: true }, { key: 'remark', label: '备注', type: 'textarea', maxLength: 500, wide: true },
  ]}>
    {(value, onChange) => can('oa:consumable:list') && <div className="space-y-2"><p className="text-sm text-cf-body">采购耗材关联（计量单位须一致，可选）</p><ConsumablePicker management value={value.consumableId ? { consumableId: String(value.consumableId), name: '已关联 #' + value.consumableId, unit: value.unit || '' } : null} onSelect={material => onChange({ ...value, consumableId: Number(material.consumableId) })} />{value.consumableId && <Button type="button" className="!min-h-[44px]" variant="outline" onClick={() => onChange({ ...value, consumableId: undefined })}>清除耗材关联</Button>}</div>}
  </RecordEditor></>;
}
