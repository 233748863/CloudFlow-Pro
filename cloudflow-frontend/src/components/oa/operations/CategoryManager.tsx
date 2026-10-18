import React, { useState } from 'react';
import { Button } from '@/components/common';
import { BaseDialog } from '@/components/common/BaseDialog';
import { oaGet, oaPost, oaDelete, type OaAssetCategory } from '@/services/api/oaOperations';
import { OperationsPage, OpsTable, labelOf, useRemote, useAccess, useMutation } from './OperationsKit';
import { RecordEditor, optionsOf, enabledStatuses, depreciationMethods, type FieldSpec } from './RecordEditor';

export default function CategoryManager({ kind }: { kind: 'asset' | 'supplier' }) {
  const can = useAccess(); const mutation = useMutation(); const [record, setRecord] = useState<OaAssetCategory | null>(null); const [removing, setRemoving] = useState<OaAssetCategory | null>(null);
  const data = useRemote(() => oaGet<OaAssetCategory[]>('/' + kind + '/categories'), [kind]);
  const fields: FieldSpec<OaAssetCategory>[] = [
    { key: 'categoryCode', label: '分类编码', required: true, maxLength: 50 }, { key: 'categoryName', label: '分类名称', required: true, maxLength: 100 },
    { key: 'parentId', label: '上级分类', type: 'select', numeric: true, options: { '0': '顶级分类', ...optionsOf(data.data?.filter(item => String(item.categoryId) !== String(record?.categoryId) && (!record?.levelPath || !item.levelPath?.startsWith(record.levelPath))), 'categoryId', 'categoryName') } },
    { key: 'status', label: '状态', type: 'select', options: enabledStatuses }, { key: 'sortNo', label: '排序', type: 'number', min: 0, step: 1 }, { key: 'remark', label: '说明', type: 'textarea', wide: true },
    ...(kind === 'asset' ? [
      { key: 'defaultUsefulLifeMonths', label: '默认使用寿命（月）', type: 'number', min: 1, step: 1, required: true },
      { key: 'defaultDepreciationMethod', label: '默认折旧方法', type: 'select', options: depreciationMethods, required: true },
      { key: 'defaultSalvageRate', label: '默认残值率（0–1）', type: 'number', min: 0, max: 1, step: 0.0001, required: true }, { key: 'maintenanceRequiredFlag', label: '默认需要维保', type: 'checkbox' },
    ] as FieldSpec<OaAssetCategory>[] : []),
  ];
  return <OperationsPage title={kind === 'asset' ? '资产分类' : '供应商分类'} description="维护分类树与默认业务参数，停用分类保留历史引用。" loading={data.loading} error={data.error} refresh={data.refresh} actions={can('oa:' + kind + '-category:edit') && <Button onClick={() => setRecord({ parentId: 0, status: 'ACTIVE', sortNo: 0, ...(kind === 'asset' ? { defaultUsefulLifeMonths: 36, defaultDepreciationMethod: 'STRAIGHT_LINE', defaultSalvageRate: 0.05, maintenanceRequiredFlag: 0 } : {}) })}>新增分类</Button>}>
    <OpsTable headers={['分类名称', '编码', ...(kind === 'asset' ? ['折旧方法 / 寿命 / 残值率'] : []), '状态', '操作']} empty={!data.data?.length}>{data.data?.map(item => <tr key={item.categoryId}><td><span style={{ paddingLeft: Math.max(0, (item.levelPath?.split('/').filter(Boolean).length || 1) - 1) * 20 }}>{item.categoryName}</span></td><td>{item.categoryCode}</td>{kind === 'asset' && <td>{labelOf(depreciationMethods, item.defaultDepreciationMethod)} / {item.defaultUsefulLifeMonths} 月 / {(Number(item.defaultSalvageRate || 0) * 100).toFixed(2)}%</td>}<td>{labelOf(enabledStatuses, item.status)}</td><td><div className="oa-ops-actions">{can('oa:' + kind + '-category:edit') && <Button variant="link" onClick={() => setRecord(item)}>编辑</Button>}{can('oa:' + kind + '-category:remove') && <Button variant="link" onClick={() => setRemoving(item)}>删除</Button>}</div></td></tr>)}</OpsTable>
    <RecordEditor title="分类信息" value={record} fields={fields} onClose={() => setRecord(null)} onSave={async value => { await oaPost('/' + kind + '/categories', value); data.refresh(); }} />
    <BaseDialog open={!!removing} title="删除分类" onClose={() => setRemoving(null)} footer={<><Button variant="outline" onClick={() => setRemoving(null)}>取消</Button><Button disabled={mutation.busy} onClick={() => void mutation.run(() => oaDelete('/' + kind + '/categories/' + removing?.categoryId), () => { setRemoving(null); data.refresh(); })}>确认删除</Button></>}><p>确认删除“{removing?.categoryName}”？存在子分类或业务引用时不能删除。</p></BaseDialog>
  </OperationsPage>;
}
