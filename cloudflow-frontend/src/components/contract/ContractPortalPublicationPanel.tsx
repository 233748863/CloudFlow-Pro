import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Button } from '@/components/common';
import { contractPortalApi, type ContractPortalPublication, type ContractPortalSelection } from '@/services/api/contractPortal';
import { getErrorMessage } from '@/utils/errorMessage';
import { ContractTermContent, ContractMilestoneContent, ContractPaymentContent } from './PortalContractContent';
import './contract-portal.css';

const emptySelection = (): ContractPortalSelection => ({ termIds: [], milestoneIds: [], paymentScheduleIds: [] });
const selectionOf = (value: ContractPortalSelection): ContractPortalSelection => ({ termIds: [...value.termIds], milestoneIds: [...value.milestoneIds], paymentScheduleIds: [...value.paymentScheduleIds] });
const sameSelection = (left: ContractPortalSelection, right: ContractPortalSelection) =>
  (['termIds', 'milestoneIds', 'paymentScheduleIds'] as const).every(key => JSON.stringify([...left[key]].sort()) === JSON.stringify([...right[key]].sort()));

export default function ContractPortalPublicationPanel({ contractId, onSaved, onProtectionChange }: {
  contractId: number;
  onSaved: (value: ContractPortalPublication) => void;
  onProtectionChange: (protectedDraft: boolean) => void;
}) {
  const [value, setValue] = useState<ContractPortalPublication>();
  const [draft, setDraft] = useState<ContractPortalSelection>(emptySelection);
  const [review, setReview] = useState<ContractPortalPublication>();
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [needsReview, setNeedsReview] = useState(false);
  const [discard, setDiscard] = useState(false);
  const operation = useRef(false);
  const generation = useRef(0);
  const dirty = value !== undefined && !sameSelection(value, draft);
  const protectedDraft = dirty || saving || needsReview;

  useLayoutEffect(() => {
    onProtectionChange(protectedDraft);
    const guard = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    if (protectedDraft) window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [protectedDraft, onProtectionChange]);
  useLayoutEffect(() => () => onProtectionChange(false), [onProtectionChange]);

  const refresh = useCallback(async (preserveDraft: boolean) => {
    if (operation.current) return;
    operation.current = true;
    const current = ++generation.current;
    setLoading(true); setNotice('');
    try {
      const result = await contractPortalApi.read(contractId);
      if (current !== generation.current) return;
      if (preserveDraft) { setReview(result); setNeedsReview(true); }
      else { setValue(result); setDraft(selectionOf(result)); setReview(undefined); setNeedsReview(false); setError(''); }
    } catch (failure) {
      if (current === generation.current) {
        setError(getErrorMessage(failure, '公开范围读取失败，请重新核对；当前勾选已保留'));
        if (preserveDraft) setNeedsReview(true);
      }
    } finally { if (current === generation.current) { operation.current = false; setLoading(false); } }
  }, [contractId]);

  useEffect(() => {
    void refresh(false);
    return () => { generation.current++; operation.current = false; };
  }, [refresh]);

  const choose = (key: keyof ContractPortalSelection, id: string, checked: boolean) => {
    if (operation.current || needsReview || !value || error) return;
    const next = { ...draft, [key]: checked ? [...draft[key], id] : draft[key].filter(selected => selected !== id) };
    if (next[key].length > 1000) { setNotice('每类最多选择1000项，请先取消其他项目。'); return; }
    onProtectionChange(!sameSelection(value, next)); setDraft(next); setNotice(''); setDiscard(false);
  };
  const submit = async () => {
    if (operation.current || !value || !dirty || needsReview || error) return;
    operation.current = true;
    const current = ++generation.current;
    setSaving(true); setError(''); setNotice(''); setDiscard(false);
    try {
      const result = await contractPortalApi.save(contractId, { ...selectionOf(draft), version: value.version });
      if (current !== generation.current) return;
      setValue(result); setDraft(selectionOf(result)); setReview(undefined); setNeedsReview(false);
      setNotice('公开选择已保存；客户仅在合同审批通过且双方签署后可见。'); onSaved(result);
    } catch (failure) {
      if (current === generation.current) {
        setError(getErrorMessage(failure, '保存结果尚未确认，请核对最新结果后再操作'));
        setNeedsReview(true); setReview(undefined);
      }
    } finally { if (current === generation.current) { operation.current = false; setSaving(false); } }
  };
  const adopt = (preserveDraft: boolean) => {
    if (!review || operation.current) return;
    const retained = {
      termIds: draft.termIds.filter(id => review.terms.some(term => term.termId === id)),
      milestoneIds: draft.milestoneIds.filter(id => review.milestones.some(milestone => milestone.id === id)),
      paymentScheduleIds: draft.paymentScheduleIds.filter(id => review.paymentSchedules.some(payment => payment.id === id)),
    };
    setValue(review); setDraft(preserveDraft ? retained : selectionOf(review)); setReview(undefined);
    setNeedsReview(false); setError(''); setDiscard(false); onSaved(review);
    setNotice(preserveDraft ? '仍有效的草稿已保留，已删除项目已移除；请检查勾选，保存后才会生效。' : '已采用服务器当前公开范围，本地草稿已放弃。');
  };
  const abandon = () => {
    if (operation.current) return;
    if (needsReview) { setValue(undefined); setDraft(emptySelection()); setError('已放弃本地草稿，服务器公开结果尚未核对；请重新加载。'); }
    else { setDraft(value ? selectionOf(value) : emptySelection()); setError(''); }
    setNeedsReview(false); setReview(undefined); setDiscard(false); setNotice('本地草稿已放弃；此操作不会撤销已提交到服务器的公开选择。');
  };
  const disabled = loading || saving || needsReview || !!error;
  return <section aria-label="客户门户公开范围" className="contract-portal-panel card space-y-4 border border-cf-border p-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><h4 className="text-sm font-semibold">客户门户公开范围</h4><Button variant="outline" disabled={loading || saving} onClick={() => void refresh(dirty || needsReview)}>{loading ? '正在核对…' : '核对最新结果'}</Button></div>
    <p className="text-sm leading-6 text-cf-muted">逐项勾选并保存后才公开明细；未勾选项目仅内部可见。内部备注、人员信息和合同附件始终不对外显示。</p>
    {value && <p className="text-sm" role="status">{value.contractReady ? '合同审批及双方签署已核实，符合客户查询条件。' : '合同尚未满足开放条件；可预先保存选择，审批通过且双方签署后才对客户开放。'}<span className="ml-2 text-cf-muted">当前版本：{value.version}</span></p>}
    {loading && <p role="status" className="text-sm">正在读取公开范围…</p>}{error && <p role="alert" className="break-words text-sm text-cf-danger">{error}</p>}{notice && <p role="status" className="text-sm text-cf-muted">{notice}</p>}
    {value && <fieldset disabled={disabled} className="min-w-0 space-y-5 border-0 p-0">
      <legend className="sr-only">选择对客户公开的合同项目</legend>
      <section aria-label="选择公开履约条款"><h5 className="text-sm font-semibold">履约条款 · 已选 {draft.termIds.length} 项</h5><div className="mt-3 space-y-3">{value.terms.map(term => <article className="contract-public-item" key={term.termId}>
        <label className="contract-portal-choice"><input type="checkbox" checked={draft.termIds.includes(term.termId)} onChange={event => choose('termIds', term.termId, event.target.checked)} /><span className="text-sm">公开条款 {term.termNo}</span></label><ContractTermContent term={term} />
      </article>)}</div>{!value.terms.length && <p className="mt-3 text-sm text-cf-muted">暂无可选择的履约条款。</p>}</section>
      <section aria-label="选择公开关键节点"><h5 className="text-sm font-semibold">关键节点 · 已选 {draft.milestoneIds.length} 项</h5><div className="mt-3 space-y-3">{value.milestones.map(milestone => <article className="contract-public-item" key={milestone.id}>
        <label className="contract-portal-choice"><input type="checkbox" checked={draft.milestoneIds.includes(milestone.id)} onChange={event => choose('milestoneIds', milestone.id, event.target.checked)} /><span className="text-sm">公开节点 {milestone.milestoneNo} · {milestone.milestoneName}</span></label><ContractMilestoneContent milestone={milestone} />
      </article>)}</div>{!value.milestones.length && <p className="mt-3 text-sm text-cf-muted">暂无可选择的关键节点。</p>}</section>
      <section aria-label="选择公开付款计划"><h5 className="text-sm font-semibold">付款计划 · 已选 {draft.paymentScheduleIds.length} 项</h5><div className="mt-3 space-y-3">{value.paymentSchedules.map(payment => <article className="contract-public-item" key={payment.id}>
        <label className="contract-portal-choice"><input type="checkbox" checked={draft.paymentScheduleIds.includes(payment.id)} onChange={event => choose('paymentScheduleIds', payment.id, event.target.checked)} /><span className="text-sm">公开付款计划 {payment.paymentNo} · {payment.paymentName}</span></label><ContractPaymentContent payment={payment} />
      </article>)}</div>{!value.paymentSchedules.length && <p className="mt-3 text-sm text-cf-muted">暂无可选择的付款计划。</p>}</section>
    </fieldset>}
    {needsReview && <p role="status" className="text-sm text-cf-muted">当前勾选已保留，保存已暂停。核对仅查询当前结果，不会再次提交公开选择。</p>}
    {review && <aside aria-label="公开范围核对结果" className="space-y-3 rounded-lg border border-cf-border p-3 text-sm">
      <p>服务器版本：{review.version}；已选条款 {review.termIds.length} 项、节点 {review.milestoneIds.length} 项、付款计划 {review.paymentScheduleIds.length} 项。</p>
      <p>采用服务器结果会放弃本地草稿；保留草稿会移除已删除项目，并需要再次确认保存。</p>
      <div className="flex flex-wrap gap-3"><Button variant="outline" disabled={loading || saving} onClick={() => adopt(false)}>采用服务器结果</Button><Button variant="outline" disabled={loading || saving} onClick={() => adopt(true)}>保留仍有效的草稿</Button></div>
    </aside>}
    <div className="flex flex-wrap gap-3"><Button disabled={!dirty || disabled} onClick={() => void submit()}>{saving ? '正在保存…' : '保存公开选择'}</Button>{protectedDraft && <Button variant="outline" disabled={loading || saving} onClick={() => setDiscard(true)}>放弃草稿</Button>}</div>
    {discard && <aside aria-label="确认放弃公开草稿" className="space-y-3 rounded-lg border border-cf-border p-3 text-sm"><p>放弃本地勾选不会撤销服务器已收到的公开选择；结果尚未确认时，仍需重新核对。</p><div className="flex flex-wrap gap-3"><Button variant="outline" disabled={loading || saving} onClick={() => setDiscard(false)}>继续核对</Button><Button variant="outline" disabled={loading || saving} onClick={abandon}>确认放弃本地草稿</Button></div></aside>}
    {protectedDraft && <p className="text-xs leading-5 text-cf-muted">公开草稿或提交结果尚未确认，详情关闭及其他合同操作已暂停；保存、核对或明确放弃后恢复。</p>}
  </section>;
}
