import React, { useState } from 'react';
import { Button, ListResultFooter } from '@/components/common';
import { hrReferralApi, type Referral, type ReferralResume } from '@/services/api/hr/referrals';
import { Hr09ErrorNotice, Hr09FormDialog, Hr09Input, Hr09Notice, Hr09Select, Hr09State, Hr09Textarea, useHr09Mutation, useHr09Resource } from '../components/Hr09Shared';

export function ReferralSubmitDialog({ onClose, onSaved }: { onClose: () => void; onSaved: (row: Referral) => void }) {
  const [form, setForm] = useState({ candidateName: '', contactPhone: '', email: '', currentEmployer: '', currentJobTitle: '', targetPositionId: '', resumeFileId: '', referralReason: '' });
  const [search, setSearch] = useState(''); const [page, setPage] = useState(1);
  const [resume, setResume] = useState<ReferralResume>(); const uploader = useHr09Mutation();
  const positions = useHr09Resource(signal => hrReferralApi.positions({ keyword: search, pageNum: page, pageSize: 20 }, signal), [search, page]);
  const change = (key: keyof typeof form, value: string) => setForm(previous => ({ ...previous, [key]: value }));
  return <Hr09FormDialog title="推荐候选人" description="推荐人使用当前账号关联的员工身份。" onClose={onClose}
    blocked={uploader.busy || !resume || !form.targetPositionId} successText="推荐已受理，请查看处理结果" onSubmit={async () => onSaved(await hrReferralApi.submit(form))}>
    <div className="referral-workspace space-y-4">
      <Hr09Input label="候选人姓名" required maxLength={100} value={form.candidateName} onChange={event => change('candidateName', event.target.value)} />
      <div className="grid gap-4 sm:grid-cols-2"><Hr09Input label="手机号" type="tel" maxLength={32} value={form.contactPhone} hint="须填写“+国家区号”；手机或邮箱至少一项。" onChange={event => change('contactPhone', event.target.value)} />
        <Hr09Input label="邮箱" type="email" maxLength={254} value={form.email} onChange={event => change('email', event.target.value)} /></div>
      <div className="grid gap-4 sm:grid-cols-2"><Hr09Input label="现任公司" maxLength={200} value={form.currentEmployer} onChange={event => change('currentEmployer', event.target.value)} />
        <Hr09Input label="现任职务" maxLength={100} value={form.currentJobTitle} onChange={event => change('currentJobTitle', event.target.value)} /></div>
      <Hr09Input label="搜索目标岗位" maxLength={100} value={search} onChange={event => { setSearch(event.target.value); setPage(1); change('targetPositionId', ''); }} />
      {positions.error ? <Hr09State error title="岗位读取失败" onRetry={positions.refresh} /> : <Hr09Select label="目标岗位" required value={form.targetPositionId} options={positions.data?.rows || []} disabled={positions.loading} onChange={value => change('targetPositionId', value)} />}
      {positions.data && positions.data.total > 20 && <ListResultFooter total={positions.data.total} page={page} pageSize={20} summary={`共${positions.data.total}个岗位`} onPageChange={next => { setPage(next); change('targetPositionId', ''); }} />}
      <Hr09Input label="私有简历" type="file" accept=".pdf,.doc,.docx" disabled={uploader.busy} hint="PDF或Word，最大10MiB；仅本人和获授权的招聘人员可下载。" onChange={event => {
        const file = event.target.files?.[0]; if (!file) return;
        setResume(undefined); change('resumeFileId', '');
        void uploader.run(async () => { const uploaded = await hrReferralApi.upload(file); setResume(uploaded); change('resumeFileId', uploaded.fileId); });
      }} />
      {uploader.busy && <Hr09State loading title="正在上传简历" />}{resume && <Hr09Notice>已上传：{resume.fileName}</Hr09Notice>}<Hr09ErrorNotice error={uploader.error} />
      <Hr09Textarea label="推荐理由" maxLength={1000} value={form.referralReason} onChange={event => change('referralReason', event.target.value)} />
    </div>
  </Hr09FormDialog>;
}

export function ReferralScreeningDialog({ row, onClose, onSaved }: { row: Referral; onClose: () => void; onSaved: () => void }) {
  const [accepted, setAccepted] = useState('yes'); const [reason, setReason] = useState('');
  return <Hr09FormDialog title="记录初筛结果" onClose={onClose} onSubmit={async () => { await hrReferralApi.screening(row, accepted === 'yes', reason); onSaved(); }}>
    <div className="referral-workspace space-y-4"><Hr09Select label="初筛结果" value={accepted} options={[{ value: 'yes', label: '初筛通过' }, { value: 'no', label: '未通过' }]} onChange={setAccepted} />
      <Hr09Textarea label="初筛说明" required maxLength={1000} value={reason} onChange={event => setReason(event.target.value)} /></div>
  </Hr09FormDialog>;
}

export function ReferralConvertDialog({ row, onClose, onSaved }: { row: Referral; onClose: () => void; onSaved: () => void }) {
  const [selected, setSelected] = useState(''); const [search, setSearch] = useState(''); const [page, setPage] = useState(1);
  const options = useHr09Resource(signal => hrReferralApi.requisitions(row.referralId, { pageNum: page, pageSize: 20, keyword: search }, signal), [row.referralId, search, page]);
  return <Hr09FormDialog title="转入招聘" description="选择同一目标岗位正在招聘的需求，转换后继续办理面试及录用。" onClose={onClose} blocked={!selected || options.loading}
    onSubmit={async () => { await hrReferralApi.convert(row, selected); onSaved(); }}>
    <div className="referral-workspace space-y-4"><Hr09Input label="搜索招聘需求" value={search} maxLength={100} onChange={event => { setSearch(event.target.value); setSelected(''); setPage(1); }} />
      {options.error ? <Hr09State error title="招聘需求读取失败" onRetry={options.refresh} /> : <Hr09Select label="招聘需求" required value={selected} options={options.data?.rows || []} onChange={setSelected} />}
      {options.data && options.data.total > 20 && <ListResultFooter total={options.data.total} page={page} pageSize={20} summary={`共${options.data.total}项招聘需求`} onPageChange={next => { setPage(next); setSelected(''); }} />}
      {options.data?.total === 0 && <Hr09Notice>当前范围没有匹配的在招需求，请由人事核对招聘计划。</Hr09Notice>}
    </div>
  </Hr09FormDialog>;
}

function BonusOption({ referralId, components, value, onChange }: { referralId: string; components: boolean; value: string; onChange: (value: string) => void }) {
  const [keyword, setKeyword] = useState(''); const [pageNum, setPageNum] = useState(1);
  const label = components ? '薪资项目' : '发放工资周期';
  const resource = useHr09Resource(signal => hrReferralApi.bonusOptions(referralId, components, { keyword, pageNum, pageSize: 20 }, signal), [referralId, components, keyword, pageNum]);
  return <div className="space-y-3"><Hr09Input label={`搜索${label}`} value={keyword} maxLength={100} onChange={event => { setKeyword(event.target.value); setPageNum(1); onChange(''); }} />
    {resource.error ? <Hr09State error title={`${label}读取失败`} onRetry={resource.refresh} /> : <Hr09Select label={label} required value={value} options={resource.data?.rows || []} disabled={resource.loading} onChange={onChange} />}
    {resource.data?.total === 0 && <Hr09Notice>{components ? '请先配置启用且计税的变动薪资项目。' : '请先设置开放且尚未结束的工资周期。'}</Hr09Notice>}
    {resource.data && resource.data.total > 20 && <ListResultFooter total={resource.data.total} page={pageNum} pageSize={20} summary={`共${resource.data.total}项`} onPageChange={next => { setPageNum(next); onChange(''); }} />}
  </div>;
}

export function ReferralBonusDialog({ row, onClose, onSaved }: { row: Referral; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ amount: '', salaryComponentId: '', payrollPeriodId: '', conditionRemark: '' });
  const change = (key: keyof typeof form, value: string) => setForm(previous => ({ ...previous, [key]: value }));
  return <Hr09FormDialog title="核定推荐奖金" description="核对实际入职及奖金条件后提交审批，通过后随所选周期工资发放。" onClose={onClose}
    blocked={!form.salaryComponentId || !form.payrollPeriodId} confirmation="已核对实际入职记录，确认奖金发放条件已全部满足。"
    onSubmit={async () => { await hrReferralApi.bonus(row, form); onSaved(); }} successText="奖金核定已保存，正在提交审批">
    <div className="referral-workspace space-y-4"><Hr09Notice>核实入职日期：{row.hireDate}。审批通过前不会生成应发奖金。</Hr09Notice>
      <Hr09Input label="奖金金额（元）" required inputMode="decimal" maxLength={15} value={form.amount} onChange={event => change('amount', event.target.value)} />
      <BonusOption referralId={row.referralId} components value={form.salaryComponentId} onChange={value => change('salaryComponentId', value)} />
      <BonusOption referralId={row.referralId} components={false} value={form.payrollPeriodId} onChange={value => change('payrollPeriodId', value)} />
      <Hr09Textarea label="奖金条件说明" required maxLength={500} value={form.conditionRemark} onChange={event => change('conditionRemark', event.target.value)} />
    </div>
  </Hr09FormDialog>;
}
