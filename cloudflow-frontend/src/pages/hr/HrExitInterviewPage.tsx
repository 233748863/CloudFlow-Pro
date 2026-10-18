import React, { useState } from 'react';
import { Plus, RefreshCw, ShieldCheck } from 'lucide-react';
import { BaseDialog, Button, ListResultFooter } from '@/components/common';
import { downloadBlob } from '@/utils/download';
import { exitInterviewApi, interviewInput, type ExitInterview, type ExitInterviewInput, type ExitInterviewQuery } from '@/services/api/hr/exitInterviews';
import { Hr09Error } from '@/services/api/hr/hr09Model';
import type { Hr09NamedOption } from '@/services/api/hr/hr09Types';
import { Hr09Access, Hr09ErrorNotice, Hr09FormDialog, Hr09Input, Hr09Notice, Hr09Page, Hr09Select, Hr09State, Hr09Textarea, Hr09Value,
  dateTimeText, useHr09Mutation, useHr09Resource } from './components/Hr09Shared';
import './exit-interviews.css';

function InterviewLookup({ kind, selected, sourceId, onChange }: { kind: 'applications' | 'interviewers'; selected?: Hr09NamedOption; sourceId?: string; onChange: (option?: Hr09NamedOption) => void }) {
  const [keyword, setKeyword] = useState(''); const [page, setPage] = useState(1);
  const enabled = kind === 'applications' || Boolean(sourceId);
  const lookup = useHr09Resource(signal => exitInterviewApi.options(kind, { pageNum: page, pageSize: 20, keyword, lifecycleApplicationId: sourceId }, signal), [kind, page, keyword, sourceId], enabled);
  const options = [...(selected && !lookup.data?.rows.some(item => item.value === selected.value) ? [selected] : []), ...(lookup.data?.rows || [])];
  return <div className="space-y-3 rounded-lg border border-[var(--cf-border)] p-3">
    <Hr09Input label={kind === 'applications' ? '搜索离职员工或申请单号' : '搜索面谈人姓名'} value={keyword} maxLength={64} disabled={!enabled} onChange={event => { setKeyword(event.target.value); setPage(1); }} />
    <Hr09Select label={kind === 'applications' ? '离职申请' : '面谈人'} required value={selected?.value || ''} options={options} disabled={!enabled || lookup.loading || Boolean(lookup.error)} onChange={value => onChange(options.find(item => item.value === value))} placeholder={!enabled ? '请先选择离职申请' : '请选择'} />
    {lookup.loading && <p role="status" className="text-sm text-cf-subtle">正在读取可选人员…</p>}
    {lookup.error && <Hr09State error title="可选项读取失败" description={lookup.error.message} onRetry={lookup.refresh} />}
    {lookup.data && !lookup.data.rows.length && <p role="status" className="text-sm text-cf-subtle">没有符合条件的可选项，请调整搜索内容。</p>}
    {lookup.data && lookup.data.total > 20 && <ListResultFooter total={lookup.data.total} page={page} pageSize={20} onPageChange={setPage} summary={`共 ${lookup.data.total} 项`} />}
  </div>;
}

function InterviewEditor({ row, onClose, onSaved, onRecover }: { row?: ExitInterview; onClose: () => void; onSaved: (identifier: string) => void; onRecover: () => void }) {
  const [uncertain, setUncertain] = useState(false);
  const [source, setSource] = useState<Hr09NamedOption | undefined>(row ? { value: row.lifecycleApplicationId, label: `${row.employeeName} · ${row.applicationNo}` } : undefined);
  const [interviewer, setInterviewer] = useState<Hr09NamedOption | undefined>(row ? { value: row.interviewerId, label: row.interviewerName } : undefined);
  const [time, setTime] = useState(row?.interviewTime.slice(0, 16) || ''); const [location, setLocation] = useState(row?.location || '');
  const [reason, setReason] = useState(row?.leavingReason || ''); const [feedback, setFeedback] = useState(row?.employeeFeedback || '');
  const [comment, setComment] = useState(row?.managerComment || ''); const [improvements, setImprovements] = useState(row?.improvementItems.join('\n') || '');
  return <Hr09FormDialog panelClassName="exit-interviews" title={row ? '编辑离职面谈' : '记录离职面谈'} description="意见与附件仅供授权人员查看。保存草稿后可上传附件。" submitText="保存草稿" successText="面谈草稿已保存"
    blocked={uncertain || !source || !interviewer || !time} onClose={onClose} onReload={onRecover} onSubmit={async () => {
      const input: ExitInterviewInput = { ...(row ? interviewInput(row) : {}), lifecycleApplicationId: source!.value, interviewerId: interviewer!.value,
        interviewTime: time, location: location.trim() || null, leavingReason: reason.trim() || null, employeeFeedback: feedback.trim() || null,
        managerComment: comment.trim() || null, improvementItems: improvements.split('\n').map(value => value.trim()).filter(Boolean), status: 'DRAFT' };
      try {
        if (row) { await exitInterviewApi.update(row.interviewId, input); onSaved(row.interviewId); }
        else onSaved(await exitInterviewApi.create(input));
      } catch (error) {
        if (!(error instanceof Hr09Error) || !error.status || error.status >= 500) setUncertain(true);
        throw error;
      }
    }}>
    {uncertain && <Hr09Notice danger>尚未收到保存结果，请先读取已有记录核对。<Button type="button" variant="outline" className="mt-2" onClick={onRecover}>核对已保存记录</Button></Hr09Notice>}
    <fieldset disabled={uncertain} className="min-w-0 space-y-4">
    {row ? <dl><Hr09Value label="离职员工及申请">{source?.label}</Hr09Value></dl> : <InterviewLookup kind="applications" selected={source} onChange={value => { setSource(value); setInterviewer(undefined); }} />}
    <InterviewLookup key={source?.value || 'none'} kind="interviewers" sourceId={source?.value} selected={interviewer} onChange={setInterviewer} />
    <div className="grid gap-4 sm:grid-cols-2"><Hr09Input label="面谈时间" type="datetime-local" required value={time} onChange={event => setTime(event.target.value)} />
      <Hr09Input label="面谈地点" value={location} maxLength={200} onChange={event => setLocation(event.target.value)} /></div>
    <Hr09Textarea label="离职原因" value={reason} maxLength={1000} rows={3} onChange={event => setReason(event.target.value)} />
    <Hr09Textarea label="员工反馈" value={feedback} maxLength={10000} rows={4} onChange={event => setFeedback(event.target.value)} />
    <Hr09Textarea label="内部面谈意见" value={comment} maxLength={10000} rows={4} onChange={event => setComment(event.target.value)} />
    <Hr09Textarea label="改进事项" hint="每行一项，最多50项，每项最多1000个字符。" value={improvements} maxLength={50049} rows={4} onChange={event => setImprovements(event.target.value)} />
    </fieldset>
  </Hr09FormDialog>;
}

function InterviewDetail({ identifier, onClose, onChanged }: { identifier: string; onClose: () => void; onChanged: () => void }) {
  const detail = useHr09Resource(signal => exitInterviewApi.detail(identifier, signal), [identifier]);
  const mutation = useHr09Mutation(); const [action, setAction] = useState<'edit' | 'confirm'>();
  const row = detail.data; const changed = () => { setAction(undefined); detail.refresh(); onChanged(); };
  const busy = mutation.busy || detail.loading;
  return <><BaseDialog open title="离职面谈详情" onClose={() => { if (!mutation.busy) onClose(); }} width="wide" panelClassName="exit-interviews" closeOnEscape={!mutation.busy}
    footer={<div className="flex flex-wrap justify-end gap-2"><Button variant="outline" disabled={mutation.busy} onClick={onClose}>关闭</Button><Button variant="outline" disabled={busy} onClick={detail.refresh}>刷新详情</Button>
      {row?.status === 'DRAFT' && <><Button variant="outline" disabled={busy} onClick={() => setAction('edit')}>编辑草稿</Button><Button disabled={busy} onClick={() => setAction('confirm')}>确认面谈</Button></>}</div>}>
    {detail.loading ? <Hr09State loading title="正在读取面谈" /> : detail.error ? <Hr09State error title="面谈读取失败" description={detail.error.message} onRetry={detail.refresh} /> : row ? <div className="space-y-5">
      <Hr09Notice>{row.status === 'CONFIRMED' ? '面谈已确认，意见和附件保留原记录。' : '当前为草稿，可补充意见及附件后确认。'}</Hr09Notice>
      <dl className="grid gap-4 sm:grid-cols-2"><Hr09Value label="离职员工">{row.employeeName}</Hr09Value><Hr09Value label="离职申请">{row.applicationNo}</Hr09Value>
        <Hr09Value label="面谈人">{row.interviewerName}</Hr09Value><Hr09Value label="面谈时间">{dateTimeText(row.interviewTime)}</Hr09Value><Hr09Value label="面谈地点">{row.location}</Hr09Value>
        <Hr09Value label="记录状态">{row.status === 'DRAFT' ? '草稿' : '已确认'}</Hr09Value></dl>
      <dl className="space-y-4"><Hr09Value label="离职原因">{row.leavingReason}</Hr09Value><Hr09Value label="员工反馈">{row.employeeFeedback}</Hr09Value>
        <Hr09Value label="内部面谈意见">{row.managerComment}</Hr09Value><Hr09Value label="改进事项">{row.improvementItems.join('\n')}</Hr09Value></dl>
      <section aria-label="面谈私有附件" className="space-y-3"><h3 className="text-sm font-medium text-cf-title">私有附件</h3>
        {!row.attachmentFileIds.length && <p className="text-sm text-cf-subtle">尚未上传附件。</p>}
        {row.attachmentFileIds.map(fileId => { const file = row.attachmentFiles.find(item => item.value === fileId); return <div key={fileId} className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--cf-border)] p-3">
          <span className="min-w-0 break-all text-sm text-cf-body">{file?.label || '附件暂不可用'}</span><div className="flex shrink-0 gap-2">
            <Button variant="outline" disabled={busy || !file} onClick={() => void mutation.run(async () => downloadBlob(await exitInterviewApi.download(row, fileId), file!.label))}>下载</Button>
            {row.status === 'DRAFT' && <Button variant="outline" disabled={busy} onClick={() => void mutation.run(async () => { await exitInterviewApi.update(identifier, { ...interviewInput(row), attachmentFileIds: row.attachmentFileIds.filter(value => value !== fileId) }); changed(); })}>移除</Button>}</div>
        </div>; })}
        {row.status === 'DRAFT' && <Hr09Input label="上传面谈附件" type="file" accept=".pdf,.png,.jpg,.jpeg" disabled={busy || row.attachmentFileIds.length >= 50} hint="PDF、PNG或JPEG，每个文件不超过10MiB。" onChange={event => {
          const file = event.target.files?.[0]; event.target.value = ''; if (file) void mutation.run(async () => { await exitInterviewApi.upload(row, file); changed(); });
        }} />}
        <Hr09ErrorNotice error={mutation.error} />
      </section>
    </div> : <Hr09State error title="未取得完整面谈记录" onRetry={detail.refresh} />}
  </BaseDialog>{row && action === 'edit' && <InterviewEditor row={row} onClose={() => setAction(undefined)} onSaved={changed} onRecover={changed} />}
    {row && action === 'confirm' && <Hr09FormDialog panelClassName="exit-interviews" title="确认离职面谈" submitText="确认面谈" successText="面谈已确认" confirmation="我已核对意见和附件；确认后该面谈记录不可修改。"
      onClose={() => setAction(undefined)} onReload={changed} onSubmit={async () => { await exitInterviewApi.update(identifier, { ...interviewInput(row), status: 'CONFIRMED' }); changed(); }}><p className="text-sm leading-6 text-cf-body">{row.employeeName} · {dateTimeText(row.interviewTime)}</p></Hr09FormDialog>}
  </>;
}

function Workspace() {
  const [query, setQuery] = useState<ExitInterviewQuery>({ pageNum: 1, pageSize: 20 }); const [selected, setSelected] = useState<string>(); const [creating, setCreating] = useState(false);
  const list = useHr09Resource(signal => exitInterviewApi.list(query, signal), [query]);
  return <div className="exit-interviews"><Hr09Page title="离职面谈" description="保留员工反馈、内部意见和改进事项，跟进离职交接。" actions={<><Button variant="outline" disabled={list.loading} onClick={list.refresh}><RefreshCw size={16} className="mr-2" />刷新</Button><Button onClick={() => setCreating(true)}><Plus size={16} className="mr-2" />记录面谈</Button></>}>
    <Hr09Notice><span className="inline-flex items-start gap-2"><ShieldCheck className="mt-1 h-4 w-4 shrink-0" />内部意见与附件仅供授权人员查看。</span></Hr09Notice>
    <div className="grid gap-4 rounded-lg border border-[var(--cf-border)] p-4 sm:grid-cols-2"><Hr09Input label="搜索离职员工姓名" value={query.keyword || ''} maxLength={64} onChange={event => setQuery({ ...query, keyword: event.target.value || undefined, pageNum: 1 })} />
      <Hr09Select label="记录状态" value={query.status || ''} options={[{ value: 'DRAFT', label: '草稿' }, { value: 'CONFIRMED', label: '已确认' }]} placeholder="全部状态" onChange={value => setQuery({ ...query, status: value || undefined, pageNum: 1 })} /></div>
    {list.loading ? <Hr09State loading title="正在读取面谈列表" /> : list.error ? <Hr09State error title="面谈列表读取失败" description={list.error.message} onRetry={list.refresh} /> : !list.data?.rows.length ? <Hr09State title="暂无离职面谈" description="可调整查询条件，或记录新的面谈。" /> : <div className="space-y-3">{list.data.rows.map(row => <article key={row.interviewId} className="interview-row rounded-lg border border-[var(--cf-border)] p-4">
      <div className="min-w-0"><h2 className="break-words font-medium text-cf-title">{row.employeeName}</h2><p className="mt-1 break-all text-xs text-cf-subtle">{row.applicationNo}</p></div>
      <div className="min-w-0 text-sm text-cf-body"><p className="break-words">{row.interviewerName}</p><p className="mt-1 text-cf-subtle">{dateTimeText(row.interviewTime)}</p></div>
      <span className="text-sm text-cf-body">{row.status === 'DRAFT' ? '草稿' : '已确认'}</span><Button variant="outline" onClick={() => setSelected(row.interviewId)}>查看面谈</Button>
    </article>)}</div>}
    {list.data && <ListResultFooter total={list.data.total} page={query.pageNum || 1} pageSize={20} onPageChange={pageNum => setQuery({ ...query, pageNum })} summary={`共 ${list.data.total} 条面谈`} />}
  </Hr09Page>{creating && <InterviewEditor onClose={() => setCreating(false)} onRecover={() => { setCreating(false); setQuery({ pageNum: 1, pageSize: 20 }); list.refresh(); }} onSaved={identifier => { setCreating(false); setSelected(identifier); list.refresh(); }} />}
    {selected && <InterviewDetail key={selected} identifier={selected} onClose={() => setSelected(undefined)} onChanged={list.refresh} />}</div>;
}

export default function HrExitInterviewPage() { return <Hr09Access permission="hr:exit-interview:manage"><Workspace /></Hr09Access>; }
