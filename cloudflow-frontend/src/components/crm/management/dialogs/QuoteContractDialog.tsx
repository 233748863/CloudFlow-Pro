import React, { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { BaseDialog, Button } from '@/components/common';
import { crmApi, type CrmQuote } from '@/services/api/crm';
import { getErrorMessage } from '@/utils/errorMessage';
import { money } from '../../operations/OperationsKit';
import { useCrmManagement } from '../store';

export function QuoteContractDialog({ quoteId, onClose }: { quoteId: number; onClose: () => void }) {
  const { hasPermission, goToContract, load } = useCrmManagement();
  const [quote, setQuote] = useState<CrmQuote>();
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [unknown, setUnknown] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const lock = useRef(false);
  useEffect(() => {
    let active = true;
    setLoading(true);
    void crmApi.getQuoteDetail(quoteId).then(result => { if (active) setQuote(result); })
      .catch(failure => { if (active) setError(getErrorMessage(failure, '报价读取失败')); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [quoteId]);
  const verify = async () => {
    if (lock.current || loading) return;
    lock.current = true; setWorking(true);
    try {
      const latest = await crmApi.getQuoteDetail(quoteId);
      setQuote(latest); setUnknown(false); setError('');
      setNotice(latest.contractId ? `已核对到关联合同 ${latest.contractNo || latest.contractId}，可直接打开。`
        : '尚未发现合同关联；再次提交会先核对已建立的来源合同，避免重复创建。');
    } catch (failure) { setError(getErrorMessage(failure, '核对失败，请稍后重试')); }
    finally { lock.current = false; setWorking(false); }
  };
  const submit = async () => {
    if (lock.current || loading || unknown || !quote) return;
    if (quote.contractId) {
      if (hasPermission('oa:contract:list')) { onClose(); goToContract(quote.contractId); }
      return;
    }
    if (!hasPermission('crm:contract:draft')) return;
    lock.current = true; setWorking(true); setError(''); setNotice('');
    try {
      const contractId = await crmApi.createContractDraft(quoteId);
      if (!Number.isSafeInteger(contractId) || contractId <= 0) throw new Error('未取得有效合同编号，请先核对处理结果');
      toast.success(`已关联合同草稿 #${contractId}`);
      onClose(); void load();
      if (hasPermission('oa:contract:list')) goToContract(contractId);
    } catch (failure) { setUnknown(true); setError(getErrorMessage(failure, '处理结果未确认，请先核对')); }
    finally { lock.current = false; setWorking(false); }
  };
  const canSubmit = quote?.contractId ? hasPermission('oa:contract:list') : hasPermission('crm:contract:draft');
  return <BaseDialog open title="报价转合同" onClose={() => { if (!lock.current) onClose(); }}
    panelClassName="[&_button]:!min-h-[44px] [&_button]:!min-w-[44px]"
    description="新合同按提交时最新报价复制当前团队和负责人；已有来源合同会恢复关联，不会重复创建。"
    closeOnEscape={!working} closeOnClickOutside={!working} hideCloseButton={working}
    footer={<><Button variant="outline" disabled={working} onClick={onClose}>取消</Button><Button disabled={loading || working || unknown || !quote || !canSubmit} onClick={() => void submit()}>
      {working ? '处理中...' : quote?.contractId ? '打开已关联合同' : notice ? '重试生成或恢复关联' : '生成合同草稿'}
    </Button></>}>
    <div className="min-w-0 space-y-4 break-words">
      {loading && <p role="status">正在读取报价，请稍候。</p>}
      {quote && <dl className="grid min-w-0 gap-2 text-sm"><dt className="text-cf-muted">报价</dt><dd className="font-medium text-cf-title">{quote.quoteName}</dd>
        <dt className="text-cf-muted">客户</dt><dd>{quote.customerName || '—'}</dd><dt className="text-cf-muted">当前金额</dt><dd>{money(quote.totalAmount)} {quote.currency}</dd></dl>}
      {working && <p role="status">正在核验或生成合同，请勿重复提交。</p>}
      {error && <div className="crm-ops-warning space-y-3"><p role="alert">{error}{unknown ? '；处理结果尚未确认，请先核对。' : ''}</p>
        <Button variant="outline" disabled={working || loading} onClick={() => void verify()}>核对处理结果</Button></div>}
      {notice && <p role="status" className="crm-ops-warning">{notice}</p>}
    </div>
  </BaseDialog>;
}
