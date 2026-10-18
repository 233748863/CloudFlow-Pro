import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button, Input, Label } from '@/components/common';
import { useAuth } from '@/context/AuthContext';
import { contractApi, type ContractPerformanceView } from '@/services/api/contractRisk';
import { getErrorMessage } from '@/utils/errorMessage';

const labels: Record<ContractPerformanceView['state'], string> = {
  NOT_APPLICABLE: '不适用', INACTIVE: '未确认', WAITING_APPROVAL: '待审批', WAITING_SIGNATURE: '待双方签署',
  MISSING_START_DATE: '请补齐开始日期', WAITING_START_DATE: '未到开始日期', READY: '待后台确认',
  PENDING_CONFIRMATION: '待后台核对', PENDING_SYNC: '待CRM接收', CONFIRMED: '已计入合同业绩', REVERSED: '已冲正',
};

export default function ContractPerformancePanel({ contractId, onConfirmed, onProtectionChange }: {
  contractId: number;
  onConfirmed: (value: ContractPerformanceView) => void;
  onProtectionChange: (protectedDraft: boolean) => void;
}) {
  const { hasPermission } = useAuth();
  const fieldId = useId();
  const [value, setValue] = useState<ContractPerformanceView>();
  const [review, setReview] = useState<ContractPerformanceView>();
  const [dateDraft, setDateDraft] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [needsReview, setNeedsReview] = useState(false);
  const operation = useRef(false);
  const generation = useRef(0);
  const dirty = dateDraft !== '';

  useLayoutEffect(() => {
    onProtectionChange(dirty || saving);
    const guard = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    if (dirty || saving) window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [dirty, saving, onProtectionChange]);
  useLayoutEffect(() => () => onProtectionChange(false), [onProtectionChange]);

  const refresh = useCallback(async (preserveDraft: boolean) => {
    if (operation.current) return;
    operation.current = true;
    const current = ++generation.current;
    setLoading(true);
    try {
      const result = await contractApi.performance(contractId);
      if (current !== generation.current) return;
      if (preserveDraft) { setReview(result); setNeedsReview(true); }
      else { setValue(result); setError(''); setNeedsReview(false); }
    } catch (failure) {
      if (current === generation.current) setError(getErrorMessage(failure, '业绩状态读取失败，请重试；未确认前不能补填'));
    } finally {
      if (current === generation.current) { setLoading(false); operation.current = false; }
    }
  }, [contractId]);

  useEffect(() => {
    void refresh(false);
    return () => { generation.current++; operation.current = false; };
  }, [refresh]);
  useEffect(() => {
    if (!value || !['READY', 'PENDING_CONFIRMATION', 'PENDING_SYNC'].includes(value.state) || dirty || saving || loading || error) return;
    const timer = window.setTimeout(() => void refresh(false), 5000);
    return () => window.clearTimeout(timer);
  }, [value, dirty, saving, loading, error, refresh]);

  const submit = async () => {
    if (operation.current || !value || needsReview || !dateDraft || error) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateDraft) || value.endDate && dateDraft > value.endDate) {
      setError('开始日期须为有效日期，且不能晚于合同结束日期');
      return;
    }
    operation.current = true;
    const current = ++generation.current;
    setSaving(true); setError('');
    try {
      const result = await contractApi.completeStartDate(contractId, { version: value.businessVersion, startDate: dateDraft });
      if (current !== generation.current) return;
      setValue(result); setDateDraft(''); setReview(undefined); setNeedsReview(false); onConfirmed(result);
      toast.success('开始日期已补齐，业绩以当前确认状态为准');
    } catch (failure) {
      if (current === generation.current) {
        setError(getErrorMessage(failure, '补填结果未明，请核对最新结果后再操作'));
        setNeedsReview(true);
      }
    } finally { if (current === generation.current) { operation.current = false; setSaving(false); } }
  };

  const adoptReview = () => {
    if (!review || operation.current) return;
    setValue(review); setNeedsReview(false); setError('');
    if (review.startDate) { setDateDraft(''); onConfirmed(review); }
    setReview(undefined);
  };
  const canFill = value?.signed && !value.startDate && !['NOT_APPLICABLE', 'INACTIVE'].includes(value.state)
    && hasPermission('oa:contract:edit');

  return <section aria-label="合同销售业绩" className="card min-w-0 space-y-3 border border-[var(--cf-border)] p-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h4 className="text-sm font-semibold text-cf-title">合同销售业绩</h4>
      <Button variant="outline" className="!min-h-[44px] !min-w-[44px]" disabled={loading || saving}
        onClick={() => void refresh(dirty || needsReview)}>{loading ? '正在核对…' : '核对最新结果'}</Button>
    </div>
    <div aria-live="polite" className="space-y-2 text-sm text-cf-body">
      <p className="font-medium text-cf-title">{value ? labels[value.state] : '正在读取业绩条件'}</p>
      {value && <>
        <dl className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div><dt className="text-xs text-cf-muted">审批</dt><dd>{value.approvalPassed ? '已通过并核实' : '待通过或核实'}</dd></div>
          <div><dt className="text-xs text-cf-muted">双方签署</dt><dd>{value.signed ? '已签署' : '未完成'}</dd></div>
          <div><dt className="text-xs text-cf-muted">开始日期</dt><dd>{value.startDate || '未填写'}</dd></div>
        </dl>
        <p className="break-words text-cf-muted">{value.message}</p>
        {value.confirmedAmount != null && <p>已确认金额：{value.currency} {Number(value.confirmedAmount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>}
        {value.confirmedTime && <p className="text-xs text-cf-muted">确认记录时间：{value.confirmedTime}</p>}
        <p className="text-xs text-cf-muted">合同业绩不代表实际到账；到账提成在收款后单独确认。</p>
      </>}
    </div>
    {error && <p role="alert" className="break-words text-sm text-cf-danger">{error}</p>}
    {canFill && <div className="space-y-3 border-t border-[var(--cf-border)] pt-3">
      <div className="min-w-0 space-y-1">
        <Label htmlFor={fieldId}>补填合同开始日期</Label>
        <Input id={fieldId} type="date" className="h-11 w-full min-w-0" value={dateDraft} max={value?.endDate}
          disabled={saving || loading} onChange={event => {
            onProtectionChange(event.target.value !== '' || saving);
            setDateDraft(event.target.value); if (!needsReview) setError('');
          }} />
        <p className="text-xs text-cf-muted">请按已签署合同填写，保存后锁定；仅补齐空缺，不修改已有日期。</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button className="!min-h-[44px] !min-w-[44px]" disabled={!dateDraft || saving || loading || needsReview || !!error}
          onClick={() => void submit()}>{saving ? '正在补填…' : '确认补填'}</Button>
        {dirty && <Button variant="outline" className="!min-h-[44px] !min-w-[44px]" disabled={saving || loading}
          onClick={() => { setDateDraft(''); setReview(undefined); setError(''); void refresh(false); }}>放弃补填草稿</Button>}
      </div>
      {dirty && <p className="text-xs text-cf-muted">补填草稿已保留；提交或放弃草稿后可关闭详情。</p>}
    </div>}
    {review && <aside aria-label="合同补填结果核对" className="space-y-2 rounded-lg border border-[var(--cf-border)] p-3 text-sm text-cf-body">
      <p>服务端开始日期：{review.startDate || '未填写'}；最新版本：{review.businessVersion}</p>
      <p className="break-words">{review.message}</p>
      <Button variant="outline" className="!min-h-[44px] !min-w-[44px] whitespace-normal" disabled={saving || loading}
        onClick={adoptReview}>{review.startDate ? '采用已补填结果' : '已核对，保留草稿继续补填'}</Button>
    </aside>}
  </section>;
}
