import React, { useRef, useState } from 'react';
import Decimal from 'decimal.js';
import { Button } from '@/components/common';
import { advanceAmount, advanceDraft, hrAdvanceApi } from '@/services/api/hr/advances';
import type { AdvanceDraft, AdvanceProof, AdvanceRepaymentInput, AdvanceSummary, AdvanceWriteoffInput } from '@/services/api/hr/advanceTypes';
import { Hr09Error, requireDate, requireText, shanghaiDate } from '@/services/api/hr/hr09Model';
import { Hr09ErrorNotice, Hr09FormDialog, Hr09Input, Hr09Notice, Hr09Select, Hr09Textarea, useHr09Mutation } from '../components/Hr09Shared';

const newKey = () => crypto.randomUUID().replaceAll('-', '');
const definitelyRejected = (error: unknown) => error instanceof Hr09Error && error.status != null && error.status >= 400 && error.status < 500;
const preserveUnknownConflict = (error: unknown) => error instanceof Hr09Error && error.status === 409 && !error.code
  ? new Hr09Error('原操作结果尚未确认，请等待5秒后重试原请求；请勿重新登记。', undefined, 'ADVANCE_RESULT_UNCONFIRMED')
  : error;

export function AdvanceApprovalDialog({ record, withdraw, onClose, onSaved }: { record: AdvanceSummary; withdraw: boolean; onClose: () => void; onSaved: () => void }) {
  const [reason, setReason] = useState('');
  const [uncertain, setUncertain] = useState(false);
  const [latest, setLatest] = useState<AdvanceSummary>();
  const checking = useHr09Mutation();
  const checkSaved = async () => {
    const saved = (await hrAdvanceApi.detail(record.advanceId, true)).advance;
    setLatest(saved);
    if (withdraw ? saved.approvalStatus === 'CANCELLED' : saved.approvalStatus !== 'DRAFT') { onSaved(); return; }
    if (saved.version === record.version) setUncertain(false);
  };
  return <Hr09FormDialog title={withdraw ? '撤回借款审批' : '提交借款审批'} onClose={onClose}
    description={withdraw ? '仅尚未审批通过的本人申请可以撤回，请填写原因。' : '系统核对已核定额度后，依次交部门负责人和财务审批；审批通过后等待实际放款。'}
    submitText={withdraw ? '确认撤回' : '提交审批'} successText={withdraw ? '借款申请已撤回' : '借款申请已提交'}
    blocked={uncertain || Boolean(latest && latest.version !== record.version)} onReload={() => void checking.run(checkSaved)}
    onSubmit={async () => {
      if (withdraw) requireText(reason, '撤回原因', 500);
      try {
        if (withdraw) await hrAdvanceApi.withdraw(record.advanceId, record.version, reason);
        else await hrAdvanceApi.submit(record.advanceId, record.version);
        onSaved();
      } catch (failure) {
        const error = preserveUnknownConflict(failure);
        if (!definitelyRejected(error)) setUncertain(true);
        throw error;
      }
    }}>
    <p className="break-words text-sm text-cf-body">{record.purpose} · {record.amount}元</p>
    {withdraw && <Hr09Textarea label="撤回原因" required maxLength={500} value={reason} disabled={uncertain} onChange={event => setReason(event.target.value)} />}
    {uncertain && <Hr09Notice>操作结果尚未确认，已保留输入；请核对原单后继续。</Hr09Notice>}
    {latest && <Hr09Notice>原单当前状态：{latest.approvalStatus === 'DRAFT' ? '尚未提交' : latest.approvalStatus === 'SUBMITTED' ? '审批中' : latest.approvalStatus === 'CANCELLED' ? '已撤回' : latest.approvalStatus === 'REJECTED' ? '已拒绝' : '审批通过'}。{latest.version !== record.version && '记录已变化，请关闭后重新读取详情。'}</Hr09Notice>}
    <Button type="button" variant="outline" disabled={checking.busy} onClick={() => void checking.run(checkSaved)}>核对原单</Button>
    <Hr09ErrorNotice error={checking.error} />
  </Hr09FormDialog>;
}

export function AdvanceDraftDialog({ record, onClose, onSaved }: { record?: AdvanceSummary; onClose: () => void; onSaved: (advanceId: string) => void }) {
  const applicationDate = useRef(record?.applyDate || shanghaiDate()).current;
  const [form, setForm] = useState({ amount: record?.amount || '', purpose: record?.purpose || '', repayMode: record?.repayMode || 'LUMP_SUM',
    repayStartMonth: record?.repayStartMonth || '', repayMonths: record?.repayMonths?.toString() || '', monthlyDeductAmount: record?.monthlyDeductAmount || '' });
  const [fixed, setFixed] = useState(false);
  const attempt = useRef<{ input: AdvanceDraft; key: string } | undefined>(undefined);
  const [latest, setLatest] = useState<AdvanceSummary>();
  const checking = useHr09Mutation();
  const change = (field: keyof typeof form, value: string) => setForm(previous => ({ ...previous, [field]: value }));
  return <Hr09FormDialog title={record ? '修改本人借款草稿' : '新建本人借款草稿'}
    description="草稿不占用借款额度、不产生放款；工资扣还计划的末期按剩余本金归还。"
    onClose={onClose} submitText={fixed ? '重试保存原草稿' : '保存草稿'} successText="借款草稿已保存，尚未提交或放款"
    onReload={record ? () => void checking.run(async () => setLatest((await hrAdvanceApi.detail(record.advanceId, true)).advance)) : undefined}
    onSubmit={async () => {
      if (!attempt.current) {
        const input = advanceDraft({ amount: form.amount, purpose: form.purpose, repayMode: form.repayMode as AdvanceDraft['repayMode'],
          repayStartMonth: form.repayStartMonth || null, repayMonths: form.repayMonths ? Number(form.repayMonths) : null,
          monthlyDeductAmount: form.monthlyDeductAmount || null, ...(record ? { version: record.version } : {}) }, applicationDate);
        attempt.current = { input, key: newKey() };
      }
      setFixed(true);
      try {
        if (record) { await hrAdvanceApi.update(record.advanceId, attempt.current.input, record.applyDate); onSaved(record.advanceId); }
        else onSaved(await hrAdvanceApi.create(attempt.current.input, attempt.current.key, applicationDate));
      } catch (failure) {
        const error = preserveUnknownConflict(failure);
        if (definitelyRejected(error)) { attempt.current = undefined; setFixed(false); }
        throw error;
      }
    }}>
    <div className="advance-workspace space-y-4">
      <fieldset className="min-w-0 space-y-4" disabled={fixed}>
        <Hr09Input label="借款金额（元）" inputMode="decimal" required maxLength={15} value={form.amount} onChange={event => change('amount', event.target.value)} />
        <Hr09Select label="还款方式" value={form.repayMode} required options={[{ value: 'LUMP_SUM', label: '一次性归还' }, { value: 'SALARY_DEDUCT', label: '工资分期扣还' }]} onChange={value => change('repayMode', value)} />
        {form.repayMode === 'SALARY_DEDUCT' && <div className="grid gap-4 sm:grid-cols-3">
          <Hr09Input label="扣还开始月份" type="month" required min={applicationDate.slice(0, 7)} max="9999-12" value={form.repayStartMonth} onChange={event => change('repayStartMonth', event.target.value)} />
          <Hr09Input label="计划扣还期数" inputMode="numeric" required value={form.repayMonths} onChange={event => change('repayMonths', event.target.value)} />
          <Hr09Input label="计划月扣金额（元）" inputMode="decimal" required maxLength={15} value={form.monthlyDeductAmount} onChange={event => change('monthlyDeductAmount', event.target.value)} />
        </div>}
        <Hr09Textarea label="借款用途" required rows={3} maxLength={500} value={form.purpose} onChange={event => change('purpose', event.target.value)} />
      </fieldset>
      {fixed && <Hr09Notice>请求结果尚未确认，输入已保留；重试使用同一请求，避免重复创建。</Hr09Notice>}
      {latest && <Hr09Notice>最新记录版本{latest.version}，金额{latest.amount}元。原输入仍保留；请核对差异，关闭后从最新详情重新编辑。</Hr09Notice>}
      <Hr09ErrorNotice error={checking.error} />
    </div>
  </Hr09FormDialog>;
}

export function AdvanceFinanceDialog({ record, kind, onClose, onSaved }: { record: AdvanceSummary; kind: 'repay' | 'writeoff'; onClose: () => void; onSaved: () => void }) {
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [date, setDate] = useState(shanghaiDate());
  const [file, setFile] = useState<File>();
  const [proof, setProof] = useState<AdvanceProof>();
  const [fixed, setFixed] = useState(false);
  const [latest, setLatest] = useState<AdvanceSummary>();
  const attempt = useRef<AdvanceRepaymentInput | AdvanceWriteoffInput | undefined>(undefined);
  const upload = useHr09Mutation();
  const checking = useHr09Mutation();
  const available = new Decimal(record.outstandingAmount).minus(record.reservedAmount).toFixed(2);
  const repay = kind === 'repay';
  return <Hr09FormDialog title={repay ? '登记实际还款' : '核销借款本金'} description={`${record.employeeName} · ${record.advanceNo}`}
    onClose={onClose} onReload={() => void checking.run(async () => setLatest((await hrAdvanceApi.detail(record.advanceId, false)).advance))}
    submitText={fixed ? '重试原请求' : repay ? '确认真实到账' : '确认核销'} successText={repay ? '实际还款已入账' : '借款核销已记录，未计作实际还款'}
    blocked={upload.busy || repay && !proof} confirmation={repay ? undefined : '我已核对金额及原因，确认核销本金；核销不会生成实际还款流水。'}
    onSubmit={async () => {
      if (!attempt.current) {
        const accepted = advanceAmount(amount);
        if (new Decimal(accepted).greaterThan(repay ? available : record.outstandingAmount)) throw new Hr09Error('填写金额超过当前可处理本金。', 400);
        const note = requireText(reason, repay ? '还款说明' : '核销原因', 500);
        const common = { amount: accepted, version: record.version, sourceEventKey: newKey() };
        if (repay) {
          const acceptedDate = requireDate(date);
          if (!proof || acceptedDate > shanghaiDate() || record.paidTime && acceptedDate < record.paidTime.slice(0, 10)) throw new Hr09Error('请核对凭据和真实还款日期。', 400);
          attempt.current = { ...common, proofFileId: proof.fileId, repayDate: acceptedDate, remark: note };
        } else attempt.current = { ...common, reason: note, confirmed: true };
      }
      setFixed(true);
      try {
        if (repay) await hrAdvanceApi.repay(record.advanceId, attempt.current as AdvanceRepaymentInput);
        else await hrAdvanceApi.writeoff(record.advanceId, attempt.current as AdvanceWriteoffInput);
        onSaved();
      } catch (failure) {
        const error = preserveUnknownConflict(failure);
        if (definitelyRejected(error)) { attempt.current = undefined; setFixed(false); }
        throw error;
      }
    }}>
    <div className="advance-workspace space-y-4">
      <Hr09Notice>{repay ? `当前可人工归还${available}元；工资预约的${record.reservedAmount}元不可重复收取。` : `实际未还${record.outstandingAmount}元；存在工资预约或未决补正时不能核销。`}</Hr09Notice>
      <fieldset className="min-w-0 space-y-4" disabled={fixed || upload.busy}>
        <Hr09Input label={repay ? '实际还款金额（元）' : '核销金额（元）'} inputMode="decimal" required maxLength={15} value={amount} onChange={event => setAmount(event.target.value)} />
        {repay && <>
          <Hr09Input label="实际还款日期" type="date" required min={record.paidTime?.slice(0, 10)} max={shanghaiDate()} value={date} onChange={event => setDate(event.target.value)} />
          <Hr09Input label="真实到账凭据" type="file" accept=".pdf,.png,.jpg,.jpeg" hint="只保存私有文件；支持PDF、PNG、JPEG，最大10MiB。" onChange={event => { setFile(event.target.files?.[0]); setProof(undefined); }} />
          <Button type="button" variant="outline" disabled={!file || upload.busy || fixed} onClick={() => void upload.run(async () => { if (file) setProof(await hrAdvanceApi.uploadProof(record.advanceId, file)); })}>{upload.busy ? '正在上传…' : '上传凭据'}</Button>
          {proof && <p className="break-all text-sm text-cf-body" role="status">已上传：{proof.fileName}（{proof.fileSize}字节）</p>}
        </>}
        <Hr09Textarea label={repay ? '还款说明' : '核销原因'} required rows={3} maxLength={500} value={reason} onChange={event => setReason(event.target.value)} />
      </fieldset>
      <Hr09ErrorNotice error={upload.error} /><Hr09ErrorNotice error={checking.error} />
      {fixed && <Hr09Notice>原金额、日期、凭据和请求标识已固定。结果未确认时请重试原请求，不要重新登记。</Hr09Notice>}
      {latest && <Hr09Notice>最新版本{latest.version}，未还{latest.outstandingAmount}元、预约{latest.reservedAmount}元。原输入仍保留；请核对后从最新记录重新办理。</Hr09Notice>}
    </div>
  </Hr09FormDialog>;
}
