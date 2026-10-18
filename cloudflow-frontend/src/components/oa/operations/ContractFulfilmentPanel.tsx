import React, { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/common';
import { BaseDialog } from '@/components/common/BaseDialog';
import { contractTemplateApi, type OaContract } from '@/services/api/contractRisk';
import { oaGet, oaPost, oaDelete, type OaContractFulfilmentTerm } from '@/services/api/oaOperations';
import { Section, Metric, OpsTable, OpsSelect, labelOf, useRemote, useMutation, useAccess } from './OperationsKit';
import { RecordEditor, optionsOf, today } from './RecordEditor';
import PrivateFileInput from './PrivateFileInput';
import FilePreviewButton from '@/components/file-preview/FilePreviewButton';
import { downloadAuthorizedFile, type FileDownloadRequest } from '@/services/api/file';
import { downloadBlob } from '@/utils/download';

const saveAttachment = async (context: FileDownloadRequest, name: string) => {
  const blob = await downloadAuthorizedFile(context, new AbortController().signal);
  downloadBlob(blob, name);
};

export const termCategories = { DELIVERY: '交付', PAYMENT: '付款', SERVICE: '服务', QUALITY: '质量', CONFIDENTIALITY: '保密', IP: '知识产权', OTHER: '其他' };
export const responsibleParties = { OUR: '我方', COUNTERPARTY: '对方', BOTH: '双方' };
const fulfilmentStatuses = { NOT_STARTED: '未开始', ONGOING: '履约中', FULFILLED: '已履约', PARTIALLY_BREACHED: '部分违约', BREACHED: '整体违约' };
const signMethods = { OFFLINE: '线下签署', ESIGN: '电子签章', SCAN: '扫描件确认' };
interface TermConfirmation { termId?: number; fulfilledDate?: string; evidenceFileUrl?: string; evidenceRemark?: string; waivedReason?: string; waive: boolean }
interface SignRequest { signMethod: string; counterpartySignee: string; counterpartySignTime?: string; signPlace?: string; signRemark?: string; signedFileUrl?: string }
export default function ContractFulfilmentPanel({ contract, onChanged }: { contract: OaContract; onChanged: () => void }) {
  const can = useAccess(); const mutation = useMutation(); const [term, setTerm] = useState<OaContractFulfilmentTerm | null>(null); const [confirmation, setConfirmation] = useState<TermConfirmation | null>(null);
  const [signing, setSigning] = useState<SignRequest | null>(null); const [templateId, setTemplateId] = useState(''); const [removing, setRemoving] = useState<OaContractFulfilmentTerm | null>(null);
  const terms = useRemote(() => oaGet<OaContractFulfilmentTerm[]>('/contract/' + contract.contractId + '/terms'), [contract.contractId]);
  const templates = useRemote(() => can('oa:contract-template:list') ? contractTemplateApi.listActive() : Promise.resolve([]));
  const refresh = () => { terms.refresh(); onChanged(); };
  return <div className="oa-operations space-y-4"><div className="grid gap-3 md:grid-cols-3"><Metric label="履约状态" value={labelOf(fulfilmentStatuses, contract.fulfilmentStatus)} /><Metric label="条款履约进度" value={(contract.fulfilmentProgress || 0) + '%'} detail={(contract.fulfilledTermCount || 0) + ' / ' + (contract.totalTermCount || 0) + ' 条款'} /><Metric label="签署情况" value={contract.signedFlag ? '已签署' : '待签署'} detail={contract.ourSignTime} /></div>
    {terms.error && <p role="alert">{terms.error}</p>}
    <Section title="合同履约条款"><div className="oa-ops-actions mb-4">{can('oa:contract-term:edit') && <Button onClick={() => setTerm({ contractId: contract.contractId, termNo: Math.max(0, ...(terms.data || []).map(item => item.termNo || 0)) + 1, termCategory: 'DELIVERY', responsibleParty: 'OUR', responsibleId: contract.ownerId, sortNo: terms.data?.length || 0 })}>新增条款</Button>}
      {can('oa:contract-template:list') && <OpsSelect label="合同条款模板" value={templateId} empty="选择合同模板" options={optionsOf(templates.data, 'id', 'templateName')} onChange={setTemplateId} />}
      {can('oa:contract-term:edit') && can('oa:contract-template:list') && <Button variant="outline" disabled={!templateId || !!terms.data?.length || !!contract.signedFlag || mutation.busy} onClick={() => void mutation.run(() => oaPost('/contract/' + contract.contractId + '/template/' + templateId), refresh)}>套用模板条款</Button>}
      {can('oa:contract-template:edit') && <Button variant="outline" disabled={!templateId || !terms.data?.length || mutation.busy} onClick={() => void mutation.run(() => oaPost('/contract/' + contract.contractId + '/save-template/' + templateId))}>当前条款保存到模板</Button>}
    </div><OpsTable headers={['序号 / 类别', '条款 / 要求', '责任方 / 责任人', '截止日', '履约情况', '操作']} empty={!terms.data?.length}>{terms.data?.map(item => <tr key={item.termId}><td>{item.termNo} / {labelOf(termCategories, item.termCategory)}</td><td>{item.termContent}<p className="text-xs">{item.requirement}</p></td><td>{labelOf(responsibleParties, item.responsibleParty)} / {item.responsibleName || '—'}</td><td>{item.deadlineDate || '—'}</td><td>{item.waivedFlag ? '已豁免：' + item.waivedReason : item.fulfilledFlag ? '已履约 ' + item.fulfilledDate : item.overdueFlag ? '已逾期' : '待履约'}<p>{item.evidenceRemark}</p></td><td><div className="oa-ops-actions">
      {item.evidenceFileUrl && <Button variant="link" disabled={mutation.busy} onClick={() => void mutation.run(() => saveAttachment({ bizType: 'OA_CONTRACT_EVIDENCE', bizId: String(contract.contractId), childId: item.termId, reference: item.evidenceFileUrl }, '履约证据'), undefined, '')}>查看证据</Button>}
      {item.evidenceFileUrl && <FilePreviewButton request={{ bizType: 'OA_CONTRACT_EVIDENCE', bizId: String(contract.contractId), childId: item.termId, reference: item.evidenceFileUrl }} fileName="履约证据"
        download={signal => downloadAuthorizedFile({ bizType: 'OA_CONTRACT_EVIDENCE', bizId: String(contract.contractId), childId: item.termId, reference: item.evidenceFileUrl }, signal)} />}
      {!item.fulfilledFlag && !item.waivedFlag && <>{can('oa:contract-term:edit') && !contract.signedFlag && <><Button variant="link" onClick={() => setTerm(item)}>编辑</Button><Button variant="link" onClick={() => setRemoving(item)}>删除</Button></>}{can('oa:contract-term:confirm') && <Button variant="link" onClick={() => setConfirmation({ termId: item.termId, fulfilledDate: today(), waive: false })}>确认履约</Button>}{can('oa:contract-term:waive') && <Button variant="link" onClick={() => setConfirmation({ termId: item.termId, waive: true })}>豁免</Button>}</>}
    </div></td></tr>)}</OpsTable></Section>
    <Section title="签署留痕">{contract.signedFlag ? <div className="space-y-2"><p>签署方式：{labelOf(signMethods, contract.signMethod)}</p><p>我方：{contract.ourSigneeName} · {contract.ourSignTime} · 地址 {contract.ourSignIp}</p><p>对方：{contract.counterpartySignee} · {contract.counterpartySignTime}</p><p>{contract.signPlace} · {contract.signRemark}</p><Button variant="outline" disabled={mutation.busy} onClick={() => void mutation.run(() => saveAttachment({ bizType: 'OA_CONTRACT_SIGNED', bizId: String(contract.contractId), reference: contract.signedFileUrl }, '合同签署文件'), undefined, '')}>下载签署文件</Button>
      {contract.signedFileUrl && <FilePreviewButton request={{ bizType: 'OA_CONTRACT_SIGNED', bizId: String(contract.contractId), reference: contract.signedFileUrl }} fileName="合同签署文件"
        download={signal => downloadAuthorizedFile({ bizType: 'OA_CONTRACT_SIGNED', bizId: String(contract.contractId), reference: contract.signedFileUrl }, signal)} />}
      <p className="text-xs text-cf-muted">签署地址的取证有效性需结合可信代理配置与审计警告核实。</p></div> : <><p className="mb-3 text-sm text-cf-muted">签署人、服务器时间与客户端地址自动留存，签署后不能覆盖。支持人工登记线下签署、电子签章及扫描件确认，并上传签署文件。</p>{can('oa:contract:sign') && <Button disabled={!['APPROVED', 'SEALING', 'SEALED', 'ACTIVE'].includes(contract.status || '')} onClick={() => setSigning({ signMethod: 'OFFLINE', counterpartySignee: '' })}>登记签署</Button>}</>}</Section>
    <RecordEditor title="履约条款" value={term} onClose={() => setTerm(null)} onSave={async value => { await oaPost('/contract/terms', value); refresh(); }} fields={[
      { key: 'termNo', label: '条款序号', type: 'number', min: 1, step: 1, required: true }, { key: 'termCategory', label: '条款类别', type: 'select', options: termCategories, required: true },
      { key: 'termContent', label: '条款内容', type: 'textarea', required: true, wide: true }, { key: 'requirement', label: '履约要求', type: 'textarea', wide: true },
      { key: 'responsibleParty', label: '责任方', type: 'select', options: responsibleParties }, { key: 'responsibleId', label: '内部责任人', type: 'user' }, { key: 'deadlineDate', label: '履约截止日', type: 'date' }, { key: 'sortNo', label: '排序', type: 'number', min: 0, step: 1 },
    ]} />
    <RecordEditor title={confirmation?.waive ? '豁免履约条款' : '确认条款履约'} value={confirmation} onClose={() => setConfirmation(null)} onSave={async value => { await oaPost('/contract/terms/' + value.termId + (value.waive ? '/waive' : '/confirm'), value); refresh(); }} fields={confirmation?.waive ? [{ key: 'waivedReason', label: '豁免原因', type: 'textarea', maxLength: 500, required: true, wide: true }] : [{ key: 'fulfilledDate', label: '实际履约日', type: 'date', required: true }, { key: 'evidenceRemark', label: '履约说明', type: 'textarea', wide: true }]}>{(draft, setDraft) => !draft.waive && <PrivateFileInput path={'/contract/terms/' + draft.termId + '/evidence'} value={draft.evidenceFileUrl} onChange={value => setDraft({ ...draft, evidenceFileUrl: value })} label="履约证据" />}</RecordEditor>
    <RecordEditor title="登记合同签署" value={signing} onClose={() => setSigning(null)} onSave={async value => { if (!value.signedFileUrl) throw new Error('请先上传签署文件'); const result = await oaPost<{ warning: boolean }>('/contract/' + contract.contractId + '/sign', value); if (result.warning) toast.warning('签署已留痕，当前记录为内网或网关地址，取证有效性待运维确认'); refresh(); }} fields={[
      { key: 'signMethod', label: '签署方式', type: 'select', options: signMethods, required: true }, { key: 'counterpartySignee', label: '对方签署人', required: true, maxLength: 64 },
      { key: 'counterpartySignTime', label: '对方签署时间', type: 'datetime-local', required: true }, { key: 'signPlace', label: '签署地点', maxLength: 200 }, { key: 'signRemark', label: '备注', type: 'textarea', maxLength: 500, wide: true },
    ]}>{(draft, setDraft) => <PrivateFileInput path={'/contract/' + contract.contractId + '/signed-file'} value={draft.signedFileUrl} onChange={value => setDraft({ ...draft, signedFileUrl: value })} label="签署文件（必传）" />}</RecordEditor>
    <BaseDialog open={!!removing} title="移除履约条款" onClose={() => setRemoving(null)} footer={<><Button variant="outline" onClick={() => setRemoving(null)}>取消</Button><Button disabled={mutation.busy} onClick={() => void mutation.run(() => oaDelete('/contract/terms/' + removing?.termId), () => { setRemoving(null); refresh(); })}>确认移除</Button></>}><p>确认移除第 {removing?.termNo} 条履约条款？</p></BaseDialog>
  </div>;
}
