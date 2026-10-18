import React, { useState } from 'react';
import { Button } from '@/components/common';
import type { PageResult } from '@/types';
import { oaGet, oaPost, pageRows, type SysSupplier, type OaSupplierQualification, type OaSupplierScorecard } from '@/services/api/oaOperations';
import { Section, Metric, OpsTable, money, labelOf, useAccess, useRemote, useMutation } from './OperationsKit';
import { RecordEditor, today, standings } from './RecordEditor';
import SupplierScoreEditor from './SupplierScoreEditor';
import AttachmentLinks from '@/components/AttachmentLinks';
import { FileUpload } from '@/components/FileUpload';

const qualificationTypes = { BUSINESS_LICENSE: '营业执照', TAX_REGISTRATION: '税务登记', ISO: 'ISO 认证', INDUSTRY_PERMIT: '行业许可', BANK_INFO: '开户证明', CREDIT_REPORT: '信用报告', OTHER: '其他' };
const qualificationStatuses = { PENDING: '待核验', VERIFIED: '已核验', REJECTED: '未通过', EXPIRED: '已过期' };
export default function SupplierGovernancePanel({ supplierId, onChanged }: { supplierId: number; onChanged: () => void }) {
  const can = useAccess(); const mutation = useMutation();
  const [qualification, setQualification] = useState<OaSupplierQualification | null>(null);
  const [verification, setVerification] = useState<{ qualificationId?: number; accepted: number; reason: string } | null>(null);
  const [decision, setDecision] = useState<{ action: string; reason: string; expireDate?: string } | null>(null);
  const [card, setCard] = useState<OaSupplierScorecard | null>(null); const [scorePage, setScorePage] = useState(1);
  const supplier = useRemote(() => oaGet<SysSupplier>('/supplier/' + supplierId), [supplierId]);
  const qualifications = useRemote(() => oaGet<OaSupplierQualification[]>('/supplier/' + supplierId + '/qualifications'), [supplierId]);
  const cards = useRemote<PageResult<OaSupplierScorecard> | undefined>(() => can('oa:supplier-score:list') ? oaGet<PageResult<OaSupplierScorecard>>('/supplier/scorecards', { supplierId, pageNum: scorePage, pageSize: 10 }) : Promise.resolve(undefined), [supplierId, scorePage]);
  const refresh = () => { supplier.refresh(); qualifications.refresh(); cards.refresh(); onChanged(); };
  const save = async (path: string, value: unknown) => { await oaPost(path, value); refresh(); };
  return <div className="oa-operations space-y-4">
    {[supplier.error, qualifications.error, cards.error].filter(Boolean).map(message => <p key={message} role="alert" className="oa-ops-warning">{message}</p>)}
    <div className="grid gap-3 md:grid-cols-3"><Metric label="当前评分" value={money(supplier.data?.score)} /><Metric label="供应商分档" value={labelOf(standings, supplier.data?.standing)} /><Metric label="准入状态" value={supplier.data?.blacklistFlag ? '黑名单' : supplier.data?.bypassFlag ? '例外放行' : supplier.data?.preventPurchaseFlag || supplier.data?.preventRfqFlag ? '业务受限' : '按准入规则校验'} detail={supplier.data?.instanceId ? '决策审批中' : supplier.data?.bypassExpireDate ? '放行有效期至 ' + supplier.data.bypassExpireDate : undefined} /></div>
    <div className="oa-ops-actions"><Button variant="outline" onClick={refresh}>刷新</Button>{can('oa:supplier:govern') && !supplier.data?.instanceId && <>
      <Button variant="outline" onClick={() => setDecision({ action: supplier.data?.blacklistFlag ? 'UNBLACKLIST' : 'BLACKLIST', reason: '' })}>{supplier.data?.blacklistFlag ? '申请解除黑名单' : '申请加入黑名单'}</Button>
      <Button variant="outline" onClick={() => setDecision({ action: 'BYPASS', reason: '', expireDate: today() })}>申请例外放行</Button>
    </>}</div>
    <Section title="资质证件">{can('oa:supplier-qualification:edit') && <Button onClick={() => setQualification({ supplierId, qualificationType: 'BUSINESS_LICENSE', longTermFlag: 0, reminderDays: 30 })}>新增资质</Button>}
      <OpsTable headers={['证件 / 号码', '类型', '有效期', '核验状态', '操作']} empty={!qualifications.data?.length}>{qualifications.data?.map(item => <tr key={item.qualificationId}><td>{item.certName}<div className="text-xs">{item.certNo}</div><AttachmentLinks value={item.fileUrl} compact previewContext={{ bizType: 'OA_SUPPLIER_QUALIFICATION', bizId: String(supplierId), childId: item.qualificationId }} /></td><td>{labelOf(qualificationTypes, item.qualificationType)}</td><td>{item.longTermFlag ? '长期有效' : item.expireDate}</td><td>{labelOf(qualificationStatuses, item.verifyStatus)}<p className="text-xs">{item.rejectReason}</p></td><td><div className="oa-ops-actions">{can('oa:supplier-qualification:edit') && <Button variant="link" onClick={() => setQualification(item)}>编辑</Button>}{can('oa:supplier-qualification:verify') && <Button variant="link" onClick={() => setVerification({ qualificationId: item.qualificationId, accepted: 1, reason: '' })}>核验</Button>}</div></td></tr>)}</OpsTable>
    </Section>
    {can('oa:supplier-score:list') && <Section title="周期评分">{can('oa:supplier-score:edit') && <Button onClick={() => setCard({ supplierId, periodType: 'MONTHLY', periodStart: today().slice(0, 8) + '01', periodEnd: today(), status: 'DRAFT' })}>新建评分卡</Button>}
      <OpsTable headers={['周期', '总分', '分档', '状态', '操作']} empty={!pageRows(cards.data).length}>{pageRows(cards.data).map(item => <tr key={item.scorecardId}><td>{item.periodStart} ~ {item.periodEnd}</td><td>{money(item.totalScore)}</td><td>{labelOf(standings, item.standing)}</td><td>{item.status === 'CONFIRMED' ? '已确认' : '草稿'}</td><td><div className="oa-ops-actions"><Button variant="link" onClick={() => setCard(item)}>查看维度</Button>{item.status === 'DRAFT' && can('oa:supplier-score:confirm') && <Button variant="link" disabled={mutation.busy} onClick={() => void mutation.run(() => oaPost('/supplier/scorecards/' + item.scorecardId + '/confirm'), refresh)}>确认评分</Button>}</div></td></tr>)}</OpsTable>
      <div className="oa-ops-actions mt-3"><Button variant="outline" disabled={scorePage === 1} onClick={() => setScorePage(scorePage - 1)}>上一页</Button><span>第 {scorePage} 页 · 共 {cards.data?.total || 0} 条</span><Button variant="outline" disabled={scorePage * 10 >= (cards.data?.total || 0)} onClick={() => setScorePage(scorePage + 1)}>下一页</Button></div>
    </Section>}
    <RecordEditor title="供应商资质" value={qualification} onClose={() => setQualification(null)} onSave={value => save('/supplier/qualifications', value)} fields={[
      { key: 'qualificationType', label: '证件类型', type: 'select', options: qualificationTypes, required: true }, { key: 'certName', label: '证件名称', required: true, maxLength: 100 },
      { key: 'certNo', label: '证件号码', maxLength: 100 }, { key: 'issueOrg', label: '签发机构' }, { key: 'issueDate', label: '签发日期', type: 'date' },
      { key: 'longTermFlag', label: '长期有效', type: 'checkbox' }, { key: 'expireDate', label: '到期日期', type: 'date', required: true, when: value => !value.longTermFlag },
      { key: 'reminderDays', label: '提前提醒天数', type: 'number', min: 0, step: 1 }, { key: 'fileUrl', label: '已归档证件地址', maxLength: 500, wide: true },
    ]}>{(draft, setDraft) => <FileUpload value={draft.fileUrl || ''} onChange={fileUrl => setDraft({ ...draft, fileUrl })} maxCount={1} />}</RecordEditor>
    <RecordEditor title="核验资质" value={verification} onClose={() => setVerification(null)} onSave={value => save('/supplier/qualifications/' + value.qualificationId + '/verify', { accepted: value.accepted === 1, reason: value.reason })} fields={[
      { key: 'accepted', label: '核验通过', type: 'checkbox' }, { key: 'reason', label: '不通过原因', type: 'textarea', maxLength: 500, when: value => value.accepted === 0, required: true },
    ]} />
    <RecordEditor title="供应商准入审批" value={decision} onClose={() => setDecision(null)} onSave={value => save('/supplier/' + supplierId + '/decisions', value)} description="审批通过后生效；例外放行需要说明原因及截止日期，到期自动失效。" fields={[
      { key: 'action', label: '申请事项', type: 'select', options: { BLACKLIST: '加入黑名单', UNBLACKLIST: '解除黑名单', BYPASS: '例外放行' }, disabled: true },
      { key: 'reason', label: '原因', type: 'textarea', required: true, maxLength: 500, wide: true }, { key: 'expireDate', label: '放行截止日', type: 'date', required: true, when: value => value.action === 'BYPASS' },
    ]} />
    <SupplierScoreEditor card={card} editable={can('oa:supplier-score:edit')} onClose={() => setCard(null)} onSaved={refresh} />
  </div>;
}
