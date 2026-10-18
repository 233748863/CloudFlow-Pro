import React, { useState } from 'react';
import { Button } from '@/components/common';
import { contractTemplateApi } from '@/services/api/contractRisk';
import { oaGet, oaPost, type OaContractTemplateTerm } from '@/services/api/oaOperations';
import { OperationsPage, OpsTable, OpsSelect, labelOf, useRemote, useMutation, useAccess } from '@/components/oa/operations/OperationsKit';
import { RecordEditor, optionsOf } from '@/components/oa/operations/RecordEditor';
import { termCategories, responsibleParties } from '@/components/oa/operations/ContractFulfilmentPanel';

export default function ContractTermTemplatePage() {
  const can = useAccess(); const mutation = useMutation(); const [templateId, setTemplateId] = useState(''); const [term, setTerm] = useState<OaContractTemplateTerm | null>(null);
  const templates = useRemote(() => contractTemplateApi.listActive());
  const data = useRemote(() => templateId ? oaGet<OaContractTemplateTerm[]>('/contract/templates/' + templateId + '/terms') : Promise.resolve([]), [templateId]);
  const editable = can('oa:contract-template:edit');
  const save = async (items: OaContractTemplateTerm[]) => { await oaPost('/contract/templates/' + templateId + '/terms', items); data.refresh(); };
  return <OperationsPage title="合同履约条款模板" description="维护既有合同模板的标准条款，按合同开始日偏移计算履约期限。" loading={data.loading || templates.loading} error={data.error || templates.error} refresh={data.refresh} filters={<OpsSelect label="合同模板" value={templateId} options={optionsOf(templates.data, 'id', 'templateName')} empty="请选择合同模板" onChange={setTemplateId} />} actions={editable && <Button disabled={!templateId} onClick={() => setTerm({ termNo: Math.max(0, ...(data.data || []).map(item => item.termNo || 0)) + 1, termCategory: 'DELIVERY', responsibleParty: 'OUR', sortNo: data.data?.length || 0 })}>添加标准条款</Button>}>
    <OpsTable headers={['序号', '类别', '条款 / 要求', '责任方', '截止偏移天数', '操作']} empty={!data.data?.length}>{data.data?.map(item => <tr key={item.termNo}><td>{item.termNo}</td><td>{labelOf(termCategories, item.termCategory)}</td><td>{item.termContent}<div>{item.requirement}</div></td><td>{labelOf(responsibleParties, item.responsibleParty)}</td><td>{item.deadlineOffsetDays ?? '不设期限'}</td><td>{editable && <div className="oa-ops-actions"><Button variant="link" onClick={() => setTerm(item)}>编辑</Button><Button variant="link" disabled={mutation.busy} onClick={() => void mutation.run(() => save(data.data!.filter(candidate => candidate.termNo !== item.termNo)))}>移除</Button></div>}</td></tr>)}</OpsTable>
    <RecordEditor title="标准履约条款" value={term} onClose={() => setTerm(null)} onSave={async value => { const others = (data.data || []).filter(item => item.templateTermId ? item.templateTermId !== term?.templateTermId : item.termNo !== term?.termNo); await save([...others, value]); }} fields={[
      { key: 'termNo', label: '条款序号', type: 'number', min: 1, step: 1, required: true }, { key: 'termCategory', label: '条款类别', type: 'select', options: termCategories, required: true },
      { key: 'termContent', label: '条款内容', type: 'textarea', required: true, wide: true }, { key: 'requirement', label: '履约要求', type: 'textarea', wide: true },
      { key: 'responsibleParty', label: '责任方', type: 'select', options: responsibleParties }, { key: 'deadlineOffsetDays', label: '距合同开始日的截止偏移天数', type: 'number', step: 1 }, { key: 'sortNo', label: '排序', type: 'number', min: 0, step: 1 },
    ]} />
  </OperationsPage>;
}
