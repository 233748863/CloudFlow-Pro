import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { BaseDialog } from '@/components/common/BaseDialog';
import { Button, DeptSelector, Input, Label, LoadingSpinner, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea, UserSelector } from '@/components/common';
import { crmApi, type CrmSalesTarget, type CrmSalesTargetPreview, type CrmSalesTargetWrite } from '@/services/api/crm';
import { formatDecimalAmount } from '@/utils/amountValue';
import { getErrorMessage } from '@/utils/errorMessage';

export const salesTargetBasisLabel = (basis?: string) => basis === 'TEAM_V2' ? '团队分成' : '旧负责人口径';
export const salesTargetMoney = (amount?: string | number) => formatDecimalAmount(amount, 2) || '—';

type Draft = Omit<CrmSalesTargetWrite, 'targetYear' | 'targetPeriod'> & { targetYear: string; targetPeriod: string };
const initialDraft = (): Draft => ({ targetName: '', dimensionType: 'OWNER', periodType: 'MONTH', targetYear: String(new Date().getFullYear()),
  targetPeriod: String(new Date().getMonth() + 1), targetAmount: '', calculationBasis: 'TEAM_V2', currency: 'CNY', status: 'ACTIVE', remark: '' });
const draftFrom = (row: CrmSalesTarget): Draft => ({ ...initialDraft(), targetName: row.targetName, dimensionType: row.dimensionType,
  periodType: row.periodType, targetYear: String(row.targetYear), targetPeriod: row.targetPeriod == null ? '' : String(row.targetPeriod),
  ownerId: row.ownerId, deptId: row.deptId, targetAmount: String(row.targetAmount), calculationBasis: row.calculationBasis || 'OWNER_V1',
  currency: row.currency || 'CNY', status: row.status || 'ACTIVE', remark: row.remark || '' });

export default function CrmSalesTargetEditor({ id, onClose, onSaved }: {
  id?: number;
  onClose: () => void;
  onSaved: (row: CrmSalesTarget) => void;
}) {
  const prefix = useId();
  const [requestKey] = useState(() => crypto.randomUUID().replaceAll('-', ''));
  const [draft, setDraft] = useState<Draft>(initialDraft);
  const [original, setOriginal] = useState<CrmSalesTarget>();
  const [preview, setPreview] = useState<CrmSalesTargetPreview>();
  const [confirmed, setConfirmed] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(Boolean(id));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [needsReview, setNeedsReview] = useState(false);
  const [review, setReview] = useState<CrmSalesTarget>();
  const [notCreated, setNotCreated] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const operation = useRef(false);
  const protection = useRef(false);
  const generation = useRef(0);
  const changeRequired = Boolean(original && (draft.calculationBasis !== original.calculationBasis || draft.currency !== original.currency));
  const ready = !loading && (!id || original?.version != null);
  const locked = loading || busy || needsReview;

  useLayoutEffect(() => {
    protection.current = dirty || busy || needsReview;
    const guard = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    if (protection.current) window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [dirty, busy, needsReview]);
  useEffect(() => {
    const current = ++generation.current;
    if (id) {
      setLoading(true);
      void crmApi.getSalesTarget(id).then(row => {
        if (current !== generation.current) return;
        if (row.version == null) throw new Error('目标版本缺失，不能编辑');
        setOriginal(row); setDraft(draftFrom(row)); setError('');
      }).catch(failure => { if (current === generation.current) setError(getErrorMessage(failure, '目标读取失败')); })
        .finally(() => { if (current === generation.current) setLoading(false); });
    }
    return () => { generation.current++; };
  }, [id]);

  const close = useCallback(() => {
    if (operation.current || protection.current) { setError('草稿或处理结果尚未核对；放弃编辑请使用“放弃草稿”'); return; }
    onClose();
  }, [onClose]);
  const change = (values: Partial<Draft>) => {
    if (operation.current || locked) return;
    protection.current = true; setDirty(true); setDraft(previous => ({ ...previous, ...values }));
    setPreview(undefined); setConfirmed(false); setError('');
  };
  const request = (): CrmSalesTargetWrite => {
    if (!draft.targetName.trim()) throw new Error('请填写目标名称');
    if (!/^(?:0|[1-9]\d{0,13})(?:\.\d{1,2})?$/.test(draft.targetAmount.trim())) throw new Error('目标金额须为非负十进制金额，最多14位整数和2位小数');
    if (!/^\d{4}$/.test(draft.targetYear) || Number(draft.targetYear) < 1000) throw new Error('目标年份须为1000至9999');
    if (draft.periodType !== 'YEAR' && (!/^\d{1,2}$/.test(draft.targetPeriod) || Number(draft.targetPeriod) < 1
      || Number(draft.targetPeriod) > (draft.periodType === 'MONTH' ? 12 : 4))) throw new Error('请填写有效月份或季度');
    if (!/^[A-Z]{3}$/.test(draft.currency)) throw new Error('币种须为三个大写字母');
    if (draft.dimensionType === 'DEPT' && !draft.deptId) throw new Error('请选择部门');
    return { ...draft, salesTargetId: original?.salesTargetId, version: original?.version, requestKey,
      targetYear: Number(draft.targetYear), targetPeriod: draft.periodType === 'YEAR' ? undefined : Number(draft.targetPeriod),
      targetAmount: draft.targetAmount.trim(), previewFingerprint: preview?.fingerprint, basisChangeConfirmed: confirmed };
  };
  const inspect = async () => {
    if (operation.current || !ready || needsReview) return;
    let body: CrmSalesTargetWrite;
    try { body = request(); } catch (failure) { setError(getErrorMessage(failure)); return; }
    operation.current = true; protection.current = true; setBusy(true); setError('');
    try { setPreview(await crmApi.previewSalesTarget(body)); setConfirmed(false); }
    catch (failure) { setPreview(undefined); setError(getErrorMessage(failure, '预览读取失败，草稿已保留')); }
    finally { operation.current = false; setBusy(false); }
  };
  const save = async () => {
    if (operation.current || !ready || needsReview || changeRequired && (!preview || !confirmed)) return;
    let body: CrmSalesTargetWrite;
    try { body = request(); } catch (failure) { setError(getErrorMessage(failure)); return; }
    operation.current = true; protection.current = true; setBusy(true); setError('');
    try {
      const row = original ? await crmApi.editSalesTarget(body) : await crmApi.addSalesTarget(body);
      protection.current = false; setDirty(false); toast.success(original ? '销售目标已更新' : '销售目标已创建'); onSaved(row);
    } catch (failure) {
      setError(`${getErrorMessage(failure, '未取得保存结果')}；草稿已保留，请先核对最新结果。`);
      setNeedsReview(true); setReview(undefined); setNotCreated(false);
    } finally { operation.current = false; setBusy(false); }
  };
  const refresh = async () => {
    if (operation.current) return;
    operation.current = true; setBusy(true); setError(''); setReview(undefined); setNotCreated(false);
    try {
      const row = id ? await crmApi.getSalesTarget(id) : await crmApi.getSalesTargetCreation(requestKey);
      if (id && !original && row && !dirty) { setOriginal(row); setDraft(draftFrom(row)); setLoading(false); }
      else { setNeedsReview(true); setReview(row || undefined); setNotCreated(!row); }
    } catch (failure) { setError(getErrorMessage(failure, '结果核对失败，草稿未改变')); }
    finally { operation.current = false; setBusy(false); }
  };
  const select = (label: string, field: 'dimensionType' | 'periodType' | 'calculationBasis' | 'status', choices: Array<[string, string]>) => (
    <div><Label htmlFor={`${prefix}-${field}`}>{label}</Label><Select value={draft[field]} disabled={locked} onValueChange={value => change({ [field]: value })}>
      <SelectTrigger id={`${prefix}-${field}`} className="min-h-[44px]"><SelectValue /></SelectTrigger>
      <SelectContent>{choices.map(([value, title]) => <SelectItem key={value} value={value}>{title}</SelectItem>)}</SelectContent>
    </Select></div>
  );

  return <>
    <BaseDialog open title={id ? '编辑销售目标' : '新增销售目标'} onClose={close} width="wide"
      panelClassName="[--cf-density-control-height:44px] [--cf-density-control-height-sm:44px] [&_button]:!min-h-[44px] [&_button]:!min-w-[44px] [&_[role=combobox]]:!h-auto [&_[role=combobox]]:!min-h-[44px]"
      footer={<div className="flex flex-wrap justify-end gap-2">
        <Button className="min-h-[44px]" variant="outline" disabled={busy || loading} onClick={() => dirty || needsReview ? setDiscarding(true) : onClose()}>{dirty || needsReview ? '放弃草稿' : '取消'}</Button>
        <Button className="min-h-[44px]" variant="outline" disabled={!ready || locked} onClick={() => void inspect()}>预览考核差异</Button>
        <Button className="min-h-[44px]" disabled={!ready || locked || changeRequired && (!preview || !confirmed)} onClick={() => void save()}>{busy ? '正在处理…' : '保存销售目标'}</Button>
      </div>}>
      <div className="space-y-4">
        <p className="text-sm text-cf-subtle">团队分成按每笔到账及原分配退款计算；旧负责人口径按最后到账日期计累计金额。不同币种独立考核。</p>
        {loading && <p role="status" className="flex items-center gap-2"><LoadingSpinner />正在读取目标…</p>}
        {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        <fieldset disabled={locked || !ready} className="grid min-w-0 gap-4 md:grid-cols-2">
          <div><Label htmlFor={`${prefix}-name`}>目标名称</Label><Input id={`${prefix}-name`} className="min-h-[44px]" value={draft.targetName} maxLength={120} onChange={event => change({ targetName: event.target.value })} /></div>
          {select('考核口径', 'calculationBasis', [['TEAM_V2', '团队分成'], ['OWNER_V1', '旧负责人口径']])}
          {select('维度类型', 'dimensionType', [['OWNER', '个人'], ['DEPT', '部门']])}
          {draft.dimensionType === 'DEPT' ? <div><Label>部门</Label><DeptSelector single value={draft.deptId ?? null} disabled={locked || !ready}
            onChange={value => change({ deptId: value ?? undefined })} placeholder="选择部门" /></div>
            : <div><Label>负责人</Label><UserSelector single value={draft.ownerId == null ? null : String(draft.ownerId)} disabled={locked || !ready}
              onChange={value => change({ ownerId: value ? Number(value) : undefined })} placeholder="留空采用当前用户" allowClear /></div>}
          {select('周期类型', 'periodType', [['MONTH', '月度'], ['QUARTER', '季度'], ['YEAR', '年度']])}
          <div><Label htmlFor={`${prefix}-year`}>目标年份</Label><Input id={`${prefix}-year`} className="min-h-[44px]" inputMode="numeric" maxLength={4} value={draft.targetYear} onChange={event => change({ targetYear: event.target.value })} /></div>
          <div><Label htmlFor={`${prefix}-period`}>周期值</Label><Input id={`${prefix}-period`} className="min-h-[44px]" inputMode="numeric" maxLength={2} disabled={draft.periodType === 'YEAR'} value={draft.targetPeriod} onChange={event => change({ targetPeriod: event.target.value })} placeholder={draft.periodType === 'YEAR' ? '年度无需填写' : draft.periodType === 'MONTH' ? '月份1—12' : '季度1—4'} /></div>
          <div><Label htmlFor={`${prefix}-amount`}>目标金额</Label><Input id={`${prefix}-amount`} className="min-h-[44px]" inputMode="decimal" value={draft.targetAmount} onChange={event => change({ targetAmount: event.target.value })} /></div>
          <div><Label htmlFor={`${prefix}-currency`}>考核币种</Label><Input id={`${prefix}-currency`} className="min-h-[44px]" maxLength={3} value={draft.currency} onChange={event => change({ currency: event.target.value.toUpperCase() })} placeholder="CNY" /></div>
          {select('状态', 'status', [['ACTIVE', '启用'], ['INACTIVE', '停用']])}
          <div className="md:col-span-2"><Label htmlFor={`${prefix}-remark`}>备注</Label><Textarea id={`${prefix}-remark`} maxLength={500} value={draft.remark} onChange={event => change({ remark: event.target.value })} rows={3} /></div>
        </fieldset>
        {changeRequired && !preview && <p className="text-sm text-cf-subtle">切换口径或币种前，请先预览考核差异并确认。</p>}
        {preview && <aside aria-label="销售目标考核差异" className="rounded-lg border border-[var(--cf-border)] p-3 text-sm">
          <p>拟采用：{salesTargetBasisLabel(preview.calculationBasis)} · {preview.currency}</p>
          {original && <p>原目标已实现：{salesTargetMoney(preview.previousAchievedAmount)} {preview.previousCurrency}（{salesTargetBasisLabel(preview.previousBasis)}）</p>}
          <p>拟定周期旧负责人回款：{salesTargetMoney(preview.ownerReceivedAmount)} {preview.currency}</p>
          <p>拟定周期团队分成回款：{salesTargetMoney(preview.teamReceivedAmount)} {preview.currency}</p>
          <p>期初快照：{salesTargetMoney(preview.baselineAmount)} {preview.currency}，不计本期团队回款。</p>
          <p className="text-cf-subtle">缺少逐笔来源的旧累计不补造分配，可通过旧口径核对；此处不包含提成或工资。</p>
          {preview.confirmationRequired && <label className="flex min-h-[44px] items-center gap-2"><input type="checkbox" checked={confirmed} disabled={locked} onChange={event => setConfirmed(event.target.checked)} />已核对差异，确认切换考核口径或币种</label>}
        </aside>}
        {(id || needsReview || error) && <Button className="min-h-[44px]" variant="outline" disabled={busy || loading} onClick={() => void refresh()}>核对最新结果，保留草稿</Button>}
        {review && <aside aria-label="销售目标最新结果" className="rounded-lg border border-[var(--cf-border)] p-3 text-sm">
          <p>{review.targetNo} · {review.targetName} · 版本{review.version}</p>
          <p>{review.ownerName || review.deptName} · {review.periodLabel} · {salesTargetBasisLabel(review.calculationBasis)}</p>
          <p>目标 {salesTargetMoney(review.targetAmount)} {review.currency}；已实现 {salesTargetMoney(review.achievedAmount)} {review.currency}</p>
          {id ? <Button className="mt-2 min-h-[44px]" disabled={busy || review.version == null} onClick={() => { setOriginal(review); setReview(undefined); setNeedsReview(false); setPreview(undefined); setConfirmed(false); setDirty(true); setError(''); }}>已核对，保留草稿并采用此版本</Button>
            : <Button className="mt-2 min-h-[44px]" disabled={busy} onClick={() => onSaved(review)}>确认原创建结果并关闭</Button>}
        </aside>}
        {notCreated && <aside aria-label="销售目标创建核对" className="text-sm"><p>暂未查到本次创建结果；原操作标识已保留，重试不会新建第二份相同目标。</p>
          <Button className="mt-2 min-h-[44px]" disabled={busy} onClick={() => { setNotCreated(false); setNeedsReview(false); setError(''); }}>已核对，使用同一标识重试</Button></aside>}
      </div>
    </BaseDialog>
    <BaseDialog open={discarding} title="放弃销售目标草稿" width="narrow" onClose={() => setDiscarding(false)}
      panelClassName="[&_button]:!min-h-[44px] [&_button]:!min-w-[44px]"
      footer={<><Button variant="outline" onClick={() => setDiscarding(false)}>取消</Button>
        <Button onClick={() => { if (!operation.current) onClose(); }}>确认放弃</Button></>}>
      <p className="text-sm">关闭会丢弃当前输入；已提交到服务器的结果不会被撤销。</p>
    </BaseDialog>
  </>;
}
