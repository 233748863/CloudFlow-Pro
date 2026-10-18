import React, { useState } from 'react';
import { Plus, RefreshCw } from 'lucide-react';
import { BaseDialog, Button, ListResultFooter } from '@/components/common';
import { downloadBlob } from '@/utils/download';
import { Hr09Error } from '@/services/api/hr/hr09Model';
import type { Hr09NamedOption } from '@/services/api/hr/hr09Types';
import { trainingRecoveryApi, type TrainingAgreement, type TrainingRecovery, type TrainingRecoveryQuery } from '@/services/api/hr/trainingRecoveries';
import { Hr09Access, Hr09ErrorNotice, Hr09FormDialog, Hr09Input, Hr09Notice, Hr09Page, Hr09Select, Hr09State, Hr09Textarea, Hr09Value, dateTimeText, useHr09Mutation, useHr09Resource } from './components/Hr09Shared';
import './training-recoveries.css';

const statusNames = { DRAFT: '草稿', CONFIRMED: '已核定', CLEARED: '已结清', VOID: '已作废' };
const editable = (row: TrainingRecovery) => row.status === 'DRAFT' && row.settlementId === null && /^0(?:\.0{1,2})?$/.test(row.collectedAmount);

function EnrollmentLookup({ selected, onChange }: { selected?: Hr09NamedOption; onChange: (option?: Hr09NamedOption) => void }) {
  const [keyword, setKeyword] = useState(''); const [page, setPage] = useState(1);
  const lookup = useHr09Resource(signal => trainingRecoveryApi.enrollments({ keyword, pageNum: page, pageSize: 20 }, signal), [keyword, page]);
  const options = [...(selected && !lookup.data?.rows.some(option => option.value === selected.value) ? [selected] : []), ...(lookup.data?.rows || [])];
  return <div className="space-y-3 rounded-lg border border-[var(--cf-border)] p-3">
    <Hr09Input label="搜索培训员工姓名" value={keyword} maxLength={100} onChange={event => { setKeyword(event.target.value); setPage(1); }} />
    <Hr09Select label="培训报名" required value={selected?.value || ''} options={options} disabled={lookup.loading || Boolean(lookup.error)} onChange={value => onChange(options.find(option => option.value === value))} />
    {lookup.loading && <p role="status" className="text-sm text-cf-subtle">正在读取培训报名…</p>}
    {lookup.error && <Hr09State error title="培训报名读取失败" description={lookup.error.message} onRetry={lookup.refresh} />}
    {lookup.data && !lookup.data.rows.length && <p role="status" className="text-sm text-cf-subtle">没有符合条件的已通过报名，请调整搜索条件。</p>}
    {lookup.data && lookup.data.total > 20 && <ListResultFooter total={lookup.data.total} page={page} pageSize={20} onPageChange={setPage} summary={`共 ${lookup.data.total} 项`} />}
  </div>;
}

function Editor({ row, onClose, onSaved, onRecover }: { row?: TrainingRecovery; onClose: () => void; onSaved: (identifier: string) => void; onRecover: () => void }) {
  const [enrollment, setEnrollment] = useState<Hr09NamedOption>(); const [file, setFile] = useState<File>(); const [agreement, setAgreement] = useState<TrainingAgreement>();
  const [amount, setAmount] = useState(row?.assessedAmount || ''); const [reason, setReason] = useState(row?.assessmentReason || ''); const [uncertain, setUncertain] = useState(false);
  return <Hr09FormDialog panelClassName="training-recoveries" title={row ? '编辑追偿草稿' : '新增培训追偿核定'} description="核定须依据实际培训和协议，保存草稿不会收款。" submitText="保存草稿" successText="追偿核定草稿已保存"
    blocked={uncertain || !amount.trim() || !reason.trim() || !row && (!enrollment || !file)} onClose={onClose} onReload={onRecover} onSubmit={async () => {
      const input = trainingRecoveryApi.validate({ assessedAmount: amount, assessmentReason: reason });
      try {
        if (row) { await trainingRecoveryApi.update(row, input); onSaved(row.recoveryId); }
        else {
          const uploaded = agreement || await trainingRecoveryApi.upload(enrollment!.value, file!); setAgreement(uploaded);
          onSaved(await trainingRecoveryApi.create(enrollment!.value, uploaded.fileId, input));
        }
      } catch (error) {
        if (!(error instanceof Hr09Error) || !error.status || error.status >= 500) setUncertain(true);
        throw error;
      }
    }}>
    {uncertain && <Hr09Notice danger>尚未取得保存结果，请先读取已有记录核对。<Button type="button" variant="outline" className="mt-2" onClick={onRecover}>核对已保存记录</Button></Hr09Notice>}
    <fieldset disabled={uncertain} className="min-w-0 space-y-4">
      {row ? <dl className="grid gap-4 sm:grid-cols-2"><Hr09Value label="培训员工">{row.employeeName}</Hr09Value><Hr09Value label="培训课程及班次">{row.courseName} · {row.sessionNo}</Hr09Value><Hr09Value label="核定协议">{row.agreementFileName}</Hr09Value></dl> : <>
        <EnrollmentLookup selected={enrollment} onChange={option => { setEnrollment(option); setAgreement(undefined); }} />
        <Hr09Input label="培训协议" type="file" required accept=".pdf,.png,.jpg,.jpeg" hint="PDF、PNG或JPEG，每个文件不超过10MiB。" onChange={event => { setFile(event.target.files?.[0]); setAgreement(undefined); }} />
      </>}
      <Hr09Input label="核定可追偿金额（元）" required inputMode="decimal" maxLength={15} value={amount} hint="可填写0；最多12位整数、2位小数。" onChange={event => setAmount(event.target.value)} />
      <Hr09Textarea label="核定依据及原因" required maxLength={1000} rows={5} value={reason} onChange={event => setReason(event.target.value)} />
    </fieldset>
  </Hr09FormDialog>;
}

function Detail({ identifier, onClose, onChanged }: { identifier: string; onClose: () => void; onChanged: () => void }) {
  const detail = useHr09Resource(signal => trainingRecoveryApi.detail(identifier, signal), [identifier]); const mutation = useHr09Mutation();
  const [action, setAction] = useState<'edit' | 'confirm'>(); const row = detail.data; const busy = detail.loading || mutation.busy;
  const changed = () => { setAction(undefined); detail.refresh(); onChanged(); };
  return <><BaseDialog open title="培训追偿核定详情" width="wide" panelClassName="training-recoveries" onClose={() => { if (!mutation.busy) onClose(); }} closeOnEscape={!mutation.busy}
    footer={<div className="flex flex-wrap justify-end gap-2"><Button variant="outline" disabled={mutation.busy} onClick={onClose}>关闭</Button><Button variant="outline" disabled={busy} onClick={detail.refresh}>刷新详情</Button>
      {row && editable(row) && <><Button variant="outline" disabled={busy} onClick={() => setAction('edit')}>编辑草稿</Button><Button disabled={busy} onClick={() => setAction('confirm')}>确认核定</Button></>}</div>}>
    {detail.loading ? <Hr09State loading title="正在读取核定记录" /> : detail.error ? <Hr09State error title="核定记录读取失败" description={detail.error.message} onRetry={detail.refresh} /> : row ? <div className="space-y-5">
      <Hr09Notice>{editable(row) ? '当前为草稿，请核对协议和可追偿金额后确认。' : '当前记录只读，金额及协议保留原核定依据。'}</Hr09Notice>
      <dl className="grid gap-4 sm:grid-cols-2"><Hr09Value label="培训员工">{row.employeeName}</Hr09Value><Hr09Value label="培训课程">{row.courseName}</Hr09Value><Hr09Value label="培训班次">{row.sessionNo}</Hr09Value><Hr09Value label="核定状态">{statusNames[row.status]}</Hr09Value>
        <Hr09Value label="核定可追偿金额">{row.assessedAmount} 元</Hr09Value><Hr09Value label="已实际收回">{row.collectedAmount} 元</Hr09Value><Hr09Value label="核定时间">{row.confirmedTime ? dateTimeText(row.confirmedTime) : undefined}</Hr09Value></dl>
      <dl><Hr09Value label="核定依据及原因">{row.assessmentReason}</Hr09Value></dl>
      <section aria-label="私有培训协议" className="space-y-3"><h3 className="text-sm font-medium text-cf-title">培训协议</h3><div className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--cf-border)] p-3">
        <span className="min-w-0 break-all text-sm text-cf-body">{row.agreementFileName}</span><Button variant="outline" disabled={busy} onClick={() => void mutation.run(async () => downloadBlob(await trainingRecoveryApi.download(row), row.agreementFileName))}>下载协议</Button>
      </div><Hr09ErrorNotice error={mutation.error} /></section>
    </div> : <Hr09State error title="未取得完整核定记录" onRetry={detail.refresh} />}
  </BaseDialog>{row && action === 'edit' && <Editor row={row} onClose={() => setAction(undefined)} onSaved={changed} onRecover={changed} />}
    {row && action === 'confirm' && <Hr09FormDialog panelClassName="training-recoveries" title="确认培训追偿核定" submitText="确认核定" successText="培训追偿已核定" confirmation="我已核对培训协议、可追偿金额和依据，确认后原记录不可改写。" onClose={() => setAction(undefined)} onReload={changed}
      onSubmit={async () => { await trainingRecoveryApi.confirm(row); changed(); }}><p className="text-sm leading-6 text-cf-body">{row.employeeName} · {row.assessedAmount} 元</p><Hr09Notice>核定不会标记为已收款；实际收回金额由后续结算入账记录确认。</Hr09Notice></Hr09FormDialog>}
  </>;
}

function Workspace() {
  const [query, setQuery] = useState<TrainingRecoveryQuery>({ pageNum: 1, pageSize: 20 }); const [creating, setCreating] = useState(false); const [selected, setSelected] = useState<string>();
  const list = useHr09Resource(signal => trainingRecoveryApi.list(query, signal), [query]);
  return <div className="training-recoveries"><Hr09Page title="培训追偿核定" description="依据实际培训协议核定可追偿金额，保留依据和处理结果。" actions={<><Button variant="outline" disabled={list.loading} onClick={list.refresh}><RefreshCw size={16} className="mr-2" />刷新</Button><Button onClick={() => setCreating(true)}><Plus size={16} className="mr-2" />新增核定</Button></>}>
    <Hr09Notice>培训费用须结合协议及履行情况核定。确认核定后，金额和依据保留原记录。</Hr09Notice>
    <div className="grid gap-4 rounded-lg border border-[var(--cf-border)] p-4 sm:grid-cols-2"><Hr09Input label="搜索培训员工姓名" value={query.keyword || ''} maxLength={100} onChange={event => setQuery({ ...query, keyword: event.target.value || undefined, pageNum: 1 })} />
      <Hr09Select label="核定状态" value={query.status || ''} placeholder="全部状态" options={Object.entries(statusNames).map(([value, label]) => ({ value, label }))} onChange={status => setQuery({ ...query, status: status || undefined, pageNum: 1 })} /></div>
    {list.loading ? <Hr09State loading title="正在读取核定列表" /> : list.error ? <Hr09State error title="核定列表读取失败" description={list.error.message} onRetry={list.refresh} /> : !list.data?.rows.length ? <Hr09State title="暂无培训追偿核定" description="可调整搜索条件，或新增有协议和依据的核定记录。" /> : <div className="space-y-3">{list.data.rows.map(row => <article key={row.recoveryId} className="training-recovery-row rounded-lg border border-[var(--cf-border)] p-4">
      <div className="min-w-0"><h2 className="break-words font-medium text-cf-title">{row.employeeName}</h2><p className="mt-1 break-words text-sm text-cf-subtle">{row.courseName}</p><p className="mt-1 break-all text-xs text-cf-subtle">{row.sessionNo}</p></div>
      <div className="min-w-0 text-sm text-cf-body"><p>核定 {row.assessedAmount} 元</p><p className="mt-1 text-cf-subtle">已收回 {row.collectedAmount} 元</p></div><span className="text-sm text-cf-body">{statusNames[row.status]}</span><Button variant="outline" onClick={() => setSelected(row.recoveryId)}>查看核定</Button>
    </article>)}</div>}
    {list.data && <ListResultFooter total={list.data.total} page={query.pageNum || 1} pageSize={20} onPageChange={pageNum => setQuery({ ...query, pageNum })} summary={`共 ${list.data.total} 条核定`} />}
  </Hr09Page>{creating && <Editor onClose={() => setCreating(false)} onRecover={() => { setCreating(false); setQuery({ pageNum: 1, pageSize: 20 }); list.refresh(); }} onSaved={identifier => { setCreating(false); setSelected(identifier); list.refresh(); }} />}
    {selected && <Detail key={selected} identifier={selected} onClose={() => setSelected(undefined)} onChanged={list.refresh} />}</div>;
}

export default function HrTrainingRecoveryPage() { return <Hr09Access permission="hr:training-recovery:manage"><Workspace /></Hr09Access>; }
