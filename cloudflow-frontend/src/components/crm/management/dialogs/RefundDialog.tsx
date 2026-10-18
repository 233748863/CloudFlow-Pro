import React, { useEffect, useRef, useState } from 'react';
import Decimal from 'decimal.js';
import { toast } from 'sonner';
import { BaseDialog, Button, Input, Label, Textarea } from '@/components/common';
import { crmApi, type CrmReceivable } from '@/services/api/crm';
import type { CrmRefundReceipt, CrmRefundSources } from '@/services/api/crm/approval';
import { getErrorMessage } from '@/utils/errorMessage';

interface Props {
  item: CrmReceivable;
  onClose: () => void;
  onSubmitted: () => Promise<void>;
}

const money = (value: number | string) => new Decimal(value).toFixed(2);
const touch = '!min-h-[44px] !min-w-[44px]';

export const RefundDialog: React.FC<Props> = ({ item, onClose, onSubmitted }) => {
  const [sources, setSources] = useState<CrmRefundSources | null>(null);
  const [selected, setSelected] = useState<CrmRefundReceipt | null>(null);
  const [version, setVersion] = useState<number | null>(null);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reviewRequired, setReviewRequired] = useState(false);
  const [latest, setLatest] = useState<CrmRefundSources | null>(null);
  const requestSequence = useRef(0);
  const savingGuard = useRef(false);
  const expectedVersion = useRef<number | null>(null);

  const loadPage = async (pageNum: number, review = false, source = selected) => {
    if (savingGuard.current || !item.receivableId) return;
    const sequence = ++requestSequence.current;
    setLoading(true);
    setError(null);
    try {
      const response = await crmApi.listRefundReceipts(item.receivableId, {
        pageNum, pageSize: 10, receiptEventId: review ? source?.receiptEventId : undefined,
      });
      if (sequence !== requestSequence.current) return;
      setSources(response);
      if (review || expectedVersion.current !== null && expectedVersion.current !== response.version) {
        setLatest(review ? response : null);
        setReviewRequired(true);
        if (!review) setError('回款记录已有变化，请核对所选原收款的最新余额；输入保持不变。');
      } else if (expectedVersion.current === null) {
        expectedVersion.current = response.version;
        setVersion(response.version);
      }
    } catch (failure) {
      if (sequence === requestSequence.current) {
        setError(getErrorMessage(failure, '读取原收款记录失败'));
        if (expectedVersion.current !== null) setReviewRequired(true);
      }
    } finally {
      if (sequence === requestSequence.current) setLoading(false);
    }
  };

  useEffect(() => {
    void loadPage(1, false, null);
    return () => { requestSequence.current++; };
  }, [item.receivableId]);

  const latestSelected = latest?.receipts.rows.find(receipt => receipt.receiptEventId === selected?.receiptEventId);
  const adopt = () => {
    if (!latest || !latestSelected || loading || saving) return;
    expectedVersion.current = latest.version;
    setVersion(latest.version);
    setSelected(latestSelected);
    setReviewRequired(false);
    setLatest(null);
    setError(null);
  };
  const chooseAgain = () => {
    if (!sources || loading || saving) return;
    expectedVersion.current = sources.version;
    setVersion(sources.version);
    setSelected(null);
    setLatest(null);
    setReviewRequired(false);
    void loadPage(1, false, null);
  };

  let validAmount = false;
  if (selected && /^\d{1,12}(?:\.\d{1,2})?$/.test(amount.trim())) {
    const requested = new Decimal(amount.trim());
    validAmount = requested.gt(0) && requested.lte(selected.remainingAmount);
  }
  const disabled = loading || saving;
  const canSubmit = !disabled && !reviewRequired && version !== null && Boolean(selected) && validAmount
    && sources?.workflowConfigured === true && !sources.pendingApprovalId;

  const submit = async () => {
    if (!canSubmit || !selected || !item.receivableId || version === null || savingGuard.current) return;
    savingGuard.current = true;
    setSaving(true);
    setError(null);
    let accepted = false;
    try {
      await crmApi.submitRefund({ receivableId: item.receivableId, receiptEventId: selected.receiptEventId, version,
        refundAmount: new Decimal(amount.trim()).toFixed(2), reason: reason.trim() || undefined });
      accepted = true;
    } catch (failure) {
      setError(getErrorMessage(failure, '退款提交结果需要核对，请读取最新记录后再试'));
      setReviewRequired(true);
      setLatest(null);
    } finally {
      savingGuard.current = false;
      setSaving(false);
    }
    if (accepted) {
      toast.success('已提交，等待客户业务负责人审批及另一名财务复核');
      onClose();
      try { await onSubmitted(); } catch { toast.error('退款审批已提交，列表更新失败，请刷新核对'); }
    }
  };

  return <BaseDialog open title={`退款审批 - ${item.receivableName}`} width="wide"
    description="财务选择原收款，客户业务负责人先审批，再由另一名财务复核；两段通过前不扣减到账金额。"
    onClose={() => { if (!savingGuard.current) onClose(); }} closeOnEscape={!saving} hideCloseButton={saving}
    footer={<>
      <Button className={touch} variant="outline" disabled={saving} onClick={() => { if (!savingGuard.current) onClose(); }}>取消</Button>
      <Button className={touch} disabled={!canSubmit} onClick={() => void submit()}>{saving ? '提交中...' : '提交审批'}</Button>
    </>}>
    <div className="grid min-w-0 gap-4">
      {loading && <p role="status">正在读取原收款记录，请稍候。</p>}
      {error && <p role="alert" className="text-sm text-cf-error">{error}</p>}
      {sources && <div className="grid gap-1 text-sm text-cf-subtle">
        <p>当前累计到账：{sources.currency} {money(sources.receivedAmount)}</p>
        {new Decimal(sources.untrackedAmount).gt(0) && <p role="status">其中 {sources.currency} {money(sources.untrackedAmount)} 缺少逐笔来源，须先核对原记录；不能自动匹配退款。</p>}
        {sources.pendingApprovalId && <p role="status">已有退款审批 #{sources.pendingApprovalId} 待处理，请勿重复提交。</p>}
        {!sources.workflowConfigured && <p role="status">{sources.workflowMessage}</p>}
      </div>}
      {sources?.workflowConfigured && <section aria-label="退款审批顺序" className="grid gap-2 rounded-lg border border-[var(--cf-border)] p-3 text-sm">
        <p className="font-medium">客户业务负责人：{sources.businessOwnerName}</p>
        <p className="text-cf-subtle">首审通过后，由另一名财务复核；现有 {sources.financeReviewerCount} 名符合资格的财务，任意一人实际办理即可。</p>
        <p className="text-cf-subtle">申请人、首审人和复核人相互独立；任一步拒绝均不扣款。</p>
      </section>}
      <fieldset disabled={disabled || reviewRequired} className="grid min-w-0 gap-2">
        <legend className="mb-2 text-sm font-medium">手动选择原收款记录</legend>
        {sources?.receipts.rows.map(receipt => <label key={receipt.receiptEventId}
          className="flex min-h-[44px] min-w-0 cursor-pointer gap-3 rounded-lg border border-[var(--cf-border)] p-3 text-sm transition-colors duration-150 motion-reduce:transition-none">
          <input type="radio" name="refund-receipt" aria-label={`选择原收款 ${receipt.receiptEventId}`}
            checked={selected?.receiptEventId === receipt.receiptEventId}
            disabled={new Decimal(receipt.remainingAmount).lte(0)} onChange={() => setSelected(receipt)} />
          <span className="min-w-0 break-words">
            <span className="block">#{receipt.receiptEventId} · {receipt.occurredTime} · {receipt.source === 'INVOICE' ? '发票收款' : 'CRM收款'}</span>
            <span className="block text-cf-subtle">原收 {receipt.currency} {money(receipt.amount)}；已退 {money(receipt.refundedAmount)}；可退 {money(receipt.remainingAmount)}</span>
          </span>
        </label>)}
        {!loading && sources?.receipts.total === 0 && <p>没有可选的逐笔原收款记录。</p>}
      </fieldset>
      {sources && <div className="flex flex-wrap items-center gap-2">
        <Button className={touch} variant="outline" disabled={disabled || reviewRequired || sources.receipts.pageNum <= 1}
          onClick={() => void loadPage(sources.receipts.pageNum - 1)}>上一页</Button>
        <span className="text-sm">第 {sources.receipts.pageNum} 页 · 共 {sources.receipts.total} 笔</span>
        <Button className={touch} variant="outline" disabled={disabled || reviewRequired || sources.receipts.pageNum * sources.receipts.pageSize >= sources.receipts.total}
          onClick={() => void loadPage(sources.receipts.pageNum + 1)}>下一页</Button>
        <Button className={touch} variant="outline" disabled={disabled} onClick={chooseAgain}>重新选择原收款</Button>
      </div>}
      {selected && <p role="status" data-testid="refund-selected-source" className="text-sm">
        已选原收款 #{selected.receiptEventId} · 历史团队版本 {selected.teamVersion} · 剩余可退 {selected.currency} {money(selected.remainingAmount)}。
      </p>}
      <div className="grid min-w-0 gap-4 sm:grid-cols-2">
        <div className="min-w-0">
          <Label htmlFor="receipt-refund-amount">本次退款金额</Label>
          <Input id="receipt-refund-amount" inputMode="decimal" value={amount} disabled={disabled} maxLength={15}
            onChange={event => setAmount(event.target.value)} placeholder="填写本次金额，最多两位小数" aria-invalid={amount !== '' && !validAmount} />
          {amount !== '' && !validAmount && <p className="text-sm text-cf-error">金额须大于0、最多两位小数且不超过所选原收款可退余额。</p>}
        </div>
        <div className="min-w-0">
          <Label htmlFor="receipt-refund-reason">退款原因</Label>
          <Textarea id="receipt-refund-reason" value={reason} disabled={disabled} maxLength={500} rows={3}
            onChange={event => setReason(event.target.value)} placeholder="例如：合同终止退费" />
        </div>
      </div>
      {reviewRequired && <div className="grid gap-2 text-sm">
        <p role="status">原选择、金额和原因已保留，核对最新余额后才能再次提交。</p>
        <Button className={touch} variant="outline" disabled={disabled} onClick={() => void loadPage(1, true)}>核对最新原收款</Button>
        {latest && <>
          <p>最新累计到账 {latest.currency} {money(latest.receivedAmount)}；所选原收款可退 {latestSelected ? `${latestSelected.currency} ${money(latestSelected.remainingAmount)}` : '无法核实，请重新选择'}。</p>
          <Button className={touch} variant="outline" disabled={disabled || !latestSelected} onClick={adopt}>已核对，采用最新版本</Button>
        </>}
      </div>}
      {!sources && !loading && <Button className={touch} variant="outline" onClick={() => void loadPage(1)}>重新读取原收款</Button>}
    </div>
  </BaseDialog>;
};
