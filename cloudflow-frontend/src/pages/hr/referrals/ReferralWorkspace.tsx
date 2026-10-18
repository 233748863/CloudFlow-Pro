import React, { useState } from 'react';
import { Plus, RefreshCw } from 'lucide-react';
import { BaseDialog, Button, ListResultFooter } from '@/components/common';
import { useAuth } from '@/context/AuthContext';
import { downloadBlob } from '@/utils/download';
import { hrReferralApi, referralStatuses, referralBonusStatuses, type ReferralQuery } from '@/services/api/hr/referrals';
import { Hr09ErrorNotice, Hr09Input, Hr09Notice, Hr09Page, Hr09Select, Hr09State, Hr09Value, asOptions, dateTimeText, useHr09Mutation, useHr09Resource } from '../components/Hr09Shared';
import { ReferralBonusDialog, ReferralConvertDialog, ReferralScreeningDialog, ReferralSubmitDialog } from './ReferralDialogs';
import './referrals.css';

function ReferralDetail({ referralId, mine, onClose, onChanged }: { referralId: string; mine: boolean; onClose: () => void; onChanged: () => void }) {
  const { hasPermission } = useAuth();
  const detail = useHr09Resource(signal => hrReferralApi.detail(referralId, mine, signal), [referralId, mine]);
  const [action, setAction] = useState<'screening' | 'convert' | 'bonus'>(); const download = useHr09Mutation();
  const row = detail.data; const changed = () => { setAction(undefined); detail.refresh(); onChanged(); };
  return <><BaseDialog open title={mine ? '本人推荐详情' : '推荐办理'} onClose={onClose} width="wide" panelClassName="referral-workspace"
    footer={<div className="flex flex-wrap justify-end gap-2"><Button variant="outline" onClick={onClose}>关闭</Button><Button variant="outline" onClick={detail.refresh}>刷新详情</Button>
      {row && !mine && !row.candidateId && ['SUBMITTED', 'SCREENING'].includes(row.status) && hasPermission('hr:referral:manage') && <Button onClick={() => setAction('screening')}>记录初筛</Button>}
      {row && !mine && !row.candidateId && row.status === 'SCREENING' && hasPermission('hr:referral:convert') && <Button onClick={() => setAction('convert')}>转入招聘</Button>}
      {row && !mine && row.bonusCanSubmit && hasPermission('hr:referral:bonus') && <Button onClick={() => setAction('bonus')}>核定奖金</Button>}</div>}>
    {detail.loading ? <Hr09State loading title="正在读取推荐" /> : detail.error ? <Hr09State error title="推荐读取失败" description={detail.error.message} onRetry={detail.refresh} /> : row ? <div className="space-y-4">
      <dl className="grid gap-4 sm:grid-cols-2"><Hr09Value label="候选人">{row.candidateName}</Hr09Value><Hr09Value label="推荐单号">{row.referralNo}</Hr09Value>
        <Hr09Value label="招聘进度">{referralStatuses[row.status]}</Hr09Value><Hr09Value label="提交时间">{dateTimeText(row.createTime)}</Hr09Value>
        {!mine && <Hr09Value label="推荐人">{row.referrerName}</Hr09Value>}<Hr09Value label="联系方式">{[row.contactPhone, row.email].filter(Boolean).join(' · ')}</Hr09Value>
        <Hr09Value label="现任公司">{row.currentEmployer}</Hr09Value><Hr09Value label="现任职务">{row.currentJobTitle}</Hr09Value>
        <Hr09Value label="核实入职日期">{row.hireDate}</Hr09Value><Hr09Value label="奖金状态">{row.bonusDecision === 'REJECTED' ? '奖金审批未通过' : referralBonusStatuses[row.bonusStatus]}</Hr09Value>
        {row.bonusConditionRemark && <Hr09Value label="奖金条件说明">{row.bonusConditionRemark}</Hr09Value>}
        {row.bonusAmount != null && <Hr09Value label="核定奖金">{row.bonusAmount}元</Hr09Value>}{row.bonusPayDate && <Hr09Value label="实际发放日期">{row.bonusPayDate}</Hr09Value>}
        <div className="sm:col-span-2"><Hr09Value label="推荐理由">{row.referralReason}</Hr09Value></div></dl>
      {row.status === 'DUPLICATE' && <Hr09Notice>联系方式已有招聘记录，本次推荐未建立新的候选人。</Hr09Notice>}
      <Button variant="outline" disabled={download.busy} onClick={() => void download.run(async () => { const file = await hrReferralApi.download(referralId, mine); downloadBlob(file.blob, `候选人简历-${row.referralNo}.${file.extension}`); })}>下载简历</Button><Hr09ErrorNotice error={download.error} />
    </div> : <Hr09State error title="未取得完整推荐记录" onRetry={detail.refresh} />}
  </BaseDialog>{row && action === 'screening' && <ReferralScreeningDialog row={row} onClose={() => setAction(undefined)} onSaved={changed} />}
    {row && action === 'convert' && <ReferralConvertDialog row={row} onClose={() => setAction(undefined)} onSaved={changed} />}
    {row && action === 'bonus' && <ReferralBonusDialog row={row} onClose={() => setAction(undefined)} onSaved={changed} />}</>;
}

export function ReferralWorkspace({ mine }: { mine: boolean }) {
  const { hasPermission } = useAuth(); const [query, setQuery] = useState<ReferralQuery>({ pageNum: 1, pageSize: 20 });
  const [keyword, setKeyword] = useState(''); const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<string | undefined>(() => new URLSearchParams(window.location.search).get('referralId') || undefined);
  const list = useHr09Resource(signal => hrReferralApi.list(query, mine, signal), [mine, JSON.stringify(query)]);
  const change = (update: ReferralQuery) => setQuery(previous => ({ ...previous, pageNum: 1, ...update }));
  return <div className="referral-workspace"><Hr09Page title={mine ? '我的推荐' : '员工内推管理'} description={mine ? '推荐合适的人选，查看本人推荐的招聘进度与奖金结果。' : '核对员工推荐，完成初筛并接续招聘办理。'}
    actions={<><Button variant="outline" disabled={list.loading} onClick={list.refresh}><RefreshCw size={16} className="mr-2" />刷新</Button>{mine && hasPermission('hr:referral:submit') && <Button onClick={() => setCreating(true)}><Plus size={16} className="mr-2" />推荐候选人</Button>}</>}>
    <form className="referral-filters" onSubmit={event => { event.preventDefault(); change({ keyword: keyword.trim() || undefined }); }}>
      <Hr09Input label="候选人姓名" maxLength={100} value={keyword} onChange={event => setKeyword(event.target.value)} />
      <Hr09Select label="招聘进度" value={query.status || ''} options={asOptions(referralStatuses)} placeholder="全部进度" onChange={status => change({ status: status || undefined })} /><Button type="submit" variant="outline">查询</Button>
    </form>
    {list.loading ? <Hr09State loading title="正在读取推荐记录" /> : list.error ? <Hr09State error title="推荐记录读取失败" description={list.error.message} onRetry={list.refresh} /> : !list.data?.rows.length ? <Hr09State title={mine ? '本人暂无推荐记录' : '当前范围暂无推荐记录'} /> : <div className="referral-list">{list.data.rows.map(row => <article className="referral-card" key={row.referralId}>
      <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><h2 className="break-words font-semibold text-cf-title">{row.candidateName}</h2><p className="mt-1 break-all text-xs text-cf-subtle">{row.referralNo}</p></div><span className="text-sm text-cf-body">{referralStatuses[row.status]}</span></div>
      <p className="mt-4 text-sm text-cf-body">{referralBonusStatuses[row.bonusStatus]}</p><div className="mt-3 flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-cf-subtle">{dateTimeText(row.createTime)}</p><Button variant="outline" onClick={() => setSelected(row.referralId)}>查看推荐</Button></div>
    </article>)}</div>}
    {list.data && <ListResultFooter total={list.data.total} page={query.pageNum || 1} pageSize={20} summary={`共${list.data.total}条推荐`} onPageChange={pageNum => change({ pageNum })} />}
    {creating && <ReferralSubmitDialog onClose={() => setCreating(false)} onSaved={row => { list.refresh(); setSelected(row.referralId); }} />}
    {selected && <ReferralDetail referralId={selected} mine={mine} onClose={() => setSelected(undefined)} onChanged={list.refresh} />}
  </Hr09Page></div>;
}
