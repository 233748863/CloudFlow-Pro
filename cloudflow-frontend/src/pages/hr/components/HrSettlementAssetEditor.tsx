import React, { useState } from 'react';
import { Button } from '@/components/common';
import { finalSettlementApi, type AssetReviewInput, type FinalSettlement, type SettlementItem } from '@/services/api/hr/finalSettlements';
import { Hr09Error } from '@/services/api/hr/hr09Model';
import { Hr09ErrorNotice, Hr09FormDialog, Hr09Input, Hr09Notice, Hr09Select, Hr09State, Hr09Textarea, Hr09Value, dateTimeText, useHr09Mutation, useHr09Resource } from './Hr09Shared';

const dispositions: Record<string, string> = { RETURN: '归还', TRANSFER: '调拨', SCRAP: '报废', DISPOSE: '处置', LOST: '丢失' };
const resolutions: Record<string, string> = { LOSS_ASSESSED: '核定损失扣款', RELEASED_NO_LOSS: '责任已解除，不扣款', CLEAR: '撤销旧核定', RETURN_PENDING: '待核定' };
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

export function SettlementAssetEvidence({ evidence }: { evidence: Record<string, unknown> }) {
  const movement = object(evidence.disposition); const review = object(evidence.assetReview);
  return <div className="space-y-3"><dl className="grid gap-3 sm:grid-cols-2">
    <Hr09Value label="资产责任">{evidence.sourceVerified === true ? evidence.responsibilityReleased === true ? '已解除该员工责任' : '该员工仍有保管或领用责任' : '尚未核实'}</Hr09Value>
    <Hr09Value label="责任归属">{evidence.ownershipConsistent === false ? '保管与领用人员存在冲突' : '保管与领用人员未见冲突'}</Hr09Value>
    {movement.purpose != null && <><Hr09Value label="OA处置类型">{dispositions[String(movement.purpose)] || '待核实'}</Hr09Value><Hr09Value label="处置单号">{String(movement.movementNo || '')}</Hr09Value><Hr09Value label="处置日期">{String(movement.movementDate || '')}</Hr09Value></>}
    {review.resolution != null && <><Hr09Value label="已保存资产处理">{resolutions[String(review.resolution)] || '待核定'}</Hr09Value><Hr09Value label="已核定资产金额（元）">{String(review.amount || '0.00')}</Hr09Value>
      <Hr09Value label="资产处理原因">{String(review.reason || '')}</Hr09Value><Hr09Value label="资产核定时间">{dateTimeText(String(review.reviewedTime || ''))}</Hr09Value></>}
  </dl>{review.resolution != null && evidence.assessmentCurrent !== true && <Hr09Notice>当前来源尚未核定通过。原金额和原因已保留，请核对后重新核定。</Hr09Notice>}
    {Array.isArray(evidence.assetReviewHistory) && evidence.assetReviewHistory.length > 0 && <details><summary className="cursor-pointer text-sm text-cf-body">查看历次资产核定</summary><div className="mt-3 space-y-3">{evidence.assetReviewHistory.map((entry, index) => { const previous = object(entry); return <div key={index} className="space-y-1 border-b border-[var(--cf-border)] pb-3 text-sm text-cf-body"><p>{resolutions[String(previous.resolution)] || '待核定'} · {String(previous.amount || '0.00')} 元</p><p className="break-words">{String(previous.reason || '')}</p><p>{dateTimeText(String(previous.reviewedTime || ''))}</p></div>; })}</div></details>}
  </div>;
}

export function HrSettlementAssetEditor({ row, item, onClose, onSaved, onLoad }: { row: FinalSettlement; item: SettlementItem; onClose: () => void; onSaved: () => void; onLoad: (row: FinalSettlement) => void }) {
  const old = object(item.evidence.assetReview);
  const [resolution, setResolution] = useState<AssetReviewInput['resolution']>(old.resolution === 'RELEASED_NO_LOSS' ? 'RELEASED_NO_LOSS' : old.resolution === 'CLEAR' ? 'CLEAR' : 'LOSS_ASSESSED');
  const [amount, setAmount] = useState(String(old.rawAmount || '')); const [reason, setReason] = useState(String(old.reason || ''));
  const [uncertain, setUncertain] = useState(false); const [saved, setSaved] = useState<FinalSettlement>(); const recovery = useHr09Mutation();
  const source = useHr09Resource(signal => finalSettlementApi.assetObservation(row, item, signal), [row.settlementId, row.version, item.itemId]);
  const recover = () => void recovery.run(async () => { setSaved(undefined); setSaved(await finalSettlementApi.detail(row.settlementId)); });
  return <Hr09FormDialog title="核定资产处理" panelClassName="final-settlements" description={item.itemName} submitText="保存资产核定" successText="资产核定已保存，请重新计算"
    blocked={uncertain || source.loading || Boolean(source.error) || !source.data} onClose={onClose} onReload={uncertain ? recover : source.refresh} onSubmit={async () => {
      if (!source.data) throw new Hr09Error('请先读取资产责任。', 400);
      try { await finalSettlementApi.reviewAsset(row, item, { resolution, amount: resolution === 'LOSS_ASSESSED' ? amount : '0', reason, sourceFingerprint: String(source.data.sourceFingerprint) }); onSaved(); }
      catch (error) { if (!(error instanceof Hr09Error) || error.status == null || error.status >= 500 || error.status === 409) setUncertain(true); throw error; }
    }}>
    {source.loading ? <Hr09State loading title="正在核实OA资产责任" /> : source.error ? <Hr09State error title="资产责任读取失败" description={source.error.message} onRetry={source.refresh} /> : source.data && <SettlementAssetEvidence evidence={source.data} />}
    <fieldset disabled={uncertain || source.loading || Boolean(source.error)} className="min-w-0 space-y-4">
      <Hr09Select label="资产处理方式" value={resolution} options={Object.entries(resolutions).filter(([value]) => value !== 'RETURN_PENDING').map(([value, label]) => ({ value, label }))} onChange={value => setResolution(value as AssetReviewInput['resolution'])} />
      {resolution === 'LOSS_ASSESSED' && <Hr09Input label="核定损失金额（元）" value={amount} inputMode="decimal" maxLength={19} onChange={event => setAmount(event.target.value)} hint="须有核定依据，最多6位小数且不超过999999999999.99元，保存时四舍五入到分。" />}
      <Hr09Textarea label="资产处理原因" value={reason} maxLength={2000} onChange={event => setReason(event.target.value)} hint="说明损失金额依据，或责任解除、撤销旧核定的原因。" />
    </fieldset>
    {uncertain && <Hr09Notice>保存结果尚待核对，当前输入已保留并停止重复提交。<div className="mt-2"><Button type="button" variant="outline" disabled={recovery.busy} onClick={recover}>读取已保存资产核定</Button></div></Hr09Notice>}
    {saved && <section aria-label="已保存资产核定" className="space-y-3">{saved.items.find(value => value.itemId === item.itemId) && <SettlementAssetEvidence evidence={saved.items.find(value => value.itemId === item.itemId)!.evidence} />}<Button type="button" variant="outline" onClick={() => onLoad(saved)}>载入已保存资产核定</Button></section>}
    <Hr09ErrorNotice error={recovery.error} />
  </Hr09FormDialog>;
}
