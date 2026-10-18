import React, { useState } from 'react';
import Decimal from 'decimal.js';
import { BaseDialog, Button, ListResultFooter } from '@/components/common';
import { Hr09ErrorNotice, Hr09Input, Hr09Notice, Hr09Select, Hr09State, Hr09Textarea, asOptions, dateTimeText, useHr09Resource } from '../components/Hr09Shared';
import { hrAppraisalApi } from '@/services/api/hr/appraisals';
import { Hr09Error } from '@/services/api/hr/hr09Model';
import type { AppraisalEvaluator, AppraisalGoal, AppraisalInvitation, AppraisalPerson, AppraisalQuery } from '@/services/api/hr/appraisalTypes';
import { AppraisalForm, AppraisalPeoplePicker, AppraisalRows, appraisalSources, appraisalStages, appraisalText } from './AppraisalShared';

const invitationStatuses = { PENDING: '待评分', SUBMITTED: '已提交', CANCELLED: '已取消' };
export const customerScoringDisabled = '客户评分已停用；接入真实客户身份后启用。';

function AppraisalInviteEditor({ goal, onClose, onSaved }: { goal: AppraisalGoal; onClose: () => void; onSaved: () => void }) {
  const [source, setSource] = useState('SELF');
  const [person, setPerson] = useState<AppraisalPerson>();
  return <AppraisalForm title="邀请员工评价" submitText="确认邀请" onClose={onClose} onReload={() => { onClose(); onSaved(); }} onSubmit={async () => {
    const evaluatorId = source === 'SELF' ? goal.assigneeId : person?.employeeId;
    if (!evaluatorId) throw new Hr09Error('请选择真实评估人。', 400);
    if (source !== 'SELF' && evaluatorId === goal.assigneeId) throw new Hr09Error('被评员工本人只能使用自评来源。', 400);
    await hrAppraisalApi.invite(goal.objectiveId, goal.assigneeId, evaluatorId, source); onSaved();
  }}>
    <Hr09Notice>被评人：{goal.assigneeName}；目标：{goal.objectiveName}。重复邀请会重置该邀请为待提交，须由本人重新评分。</Hr09Notice>
    <Hr09Select label="评价来源" required value={source} options={asOptions(appraisalSources)} onChange={value => { setSource(value); setPerson(undefined); }} />
    {source === 'SELF' ? <p className="text-sm">由 {goal.assigneeName} 本人提交自评。</p> : <AppraisalPeoplePicker label="评估人" value={person ? `${person.employeeName} · ${person.employeeNo}` : undefined} onPick={setPerson} />}
    <Hr09Notice>{customerScoringDisabled}</Hr09Notice>
  </AppraisalForm>;
}

export function AppraisalEvaluators({ goal, writable, onClose }: { goal: AppraisalGoal; writable: boolean; onClose: () => void }) {
  const resource = useHr09Resource(signal => hrAppraisalApi.evaluators(goal.objectiveId, goal.assigneeId, signal), [goal.objectiveId, goal.assigneeId]);
  const [invite, setInvite] = useState(false);
  const [cancel, setCancel] = useState<AppraisalEvaluator>();
  return <BaseDialog open title="评价邀请" description={`${goal.assigneeName} · ${goal.objectiveName}`} width="wide" onClose={onClose}>
    <div className="appraisal-workspace space-y-4"><Hr09Notice>{customerScoringDisabled} 每位员工仅能在“我的绩效周期 → 受邀评分”提交本人邀请。</Hr09Notice>
      <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={resource.refresh}>刷新邀请</Button>{writable && <Button onClick={() => setInvite(true)}>邀请员工评价</Button>}</div>
      {resource.loading ? <Hr09State loading title="正在读取评价邀请" /> : resource.error ? <Hr09State error title="邀请读取失败" description={resource.error.message} onRetry={resource.refresh} /> : <AppraisalRows rows={resource.data || []} rowKey={row => row.id} columns={[
        { key: 'person', label: '评价人', render: row => row.evaluatorName || '姓名不可用' },
        { key: 'source', label: '来源', render: row => row.evaluatorSource === 'CUSTOMER' ? '客户评分已停用' : appraisalText(appraisalSources, row.evaluatorSource) },
        { key: 'status', label: '提交状态', render: row => appraisalText(invitationStatuses, row.status) },
        { key: 'score', label: '本人已提交内容', render: row => row.status === 'SUBMITTED' ? <>{row.score ?? '未提供'}<p className="mt-1 whitespace-pre-wrap text-xs text-cf-subtle">{row.commentText}</p></> : '尚未提交' },
        ...(writable ? [{ key: 'actions', label: '操作', render: (row: AppraisalEvaluator) => row.status !== 'CANCELLED' && <Button variant="outline" onClick={() => setCancel(row)}>取消邀请</Button> }] : []),
      ]} />}
      {invite && <AppraisalInviteEditor goal={goal} onClose={() => setInvite(false)} onSaved={resource.refresh} />}
      {cancel && <AppraisalForm title="取消评价邀请" onClose={() => setCancel(undefined)} onReload={() => { setCancel(undefined); resource.refresh(); }} confirmation="确认取消该邀请；已提交的对应来源将不再参与计算，之后须重新计算周期总分。" onSubmit={async () => { await hrAppraisalApi.cancelInvitation(cancel.id); resource.refresh(); }}><p className="text-sm">{cancel.evaluatorName} · {appraisalText(appraisalSources, cancel.evaluatorSource)}</p></AppraisalForm>}
    </div>
  </BaseDialog>;
}

function InvitationContent({ record }: { record: AppraisalInvitation }) {
  return <div className="space-y-3 text-sm"><p className="font-medium text-cf-title">{record.cycleName} · {record.objectiveName}</p><p>被评人：{record.evaluateeName} · {appraisalText(appraisalSources, record.evaluatorSource)}</p><p>周期：{appraisalStages[record.cycleStatus]} · 邀请：{invitationStatuses[record.status]}</p>{record.status === 'SUBMITTED' && <Hr09Notice>本人已提交 {record.score ?? '未提供'} 分 · {dateTimeText(record.submitTime)}<p className="mt-2 whitespace-pre-wrap">{record.commentText}</p></Hr09Notice>}</div>;
}

function AppraisalResponseEditor({ record, onClose, onSaved }: { record: AppraisalInvitation; onClose: () => void; onSaved: () => void }) {
  const [score, setScore] = useState('');
  const [comment, setComment] = useState('');
  const [verified, setVerified] = useState<AppraisalInvitation>();
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<unknown>();
  const verify = async () => {
    if (verifying) return;
    setVerifying(true); setVerifyError(undefined);
    try { setVerified(await hrAppraisalApi.invitation(record.invitationId)); onSaved(); }
    catch (error) { setVerifyError(error); }
    finally { setVerifying(false); }
  };
  const matched = verified?.status === 'SUBMITTED' && verified.score != null && /^-?\d+(?:\.\d+)?$/.test(score.trim()) && new Decimal(verified.score).equals(score) && verified.commentText === comment.trim();
  if (verified && verified.status !== 'PENDING') return <BaseDialog open title="本人评价记录" onClose={onClose} width="wide"><div className="appraisal-workspace space-y-4">
    <Hr09Notice danger={!matched}>{matched ? '已确认服务器保存了本次评分，无需再次提交。' : '邀请状态已变化，请核对服务器返回的实际结果。'}</Hr09Notice>
    <InvitationContent record={verified} />
    {!matched && <section className="space-y-2 rounded-lg border border-[var(--cf-border)] p-3 text-sm"><h3 className="font-medium">本次填写内容</h3><p>得分：{score}</p><p className="whitespace-pre-wrap break-words">{comment}</p><p className="text-cf-subtle">此处保留原输入供核对，实际保存结果以服务器记录为准。</p></section>}
  </div></BaseDialog>;
  return <AppraisalForm title="提交本人受邀评分" submitText="提交本人评分" onClose={onClose} blocked={verifying || Boolean(verified)} onReload={() => { void verify(); }} onSubmit={async () => { await hrAppraisalApi.respond(record, score, comment); onSaved(); }}>
    <InvitationContent record={verified || record} /><Hr09Notice>当前邀请绑定登录员工本人，提交后不能自行修改。评分范围 {record.minScore}—{record.maxScore}，最多两位小数。</Hr09Notice>
    <Hr09Input label="本人评价得分" disabled={Boolean(verified)} required inputMode="decimal" value={score} onChange={event => setScore(event.target.value)} />
    <Hr09Textarea label="本人评价依据" disabled={Boolean(verified)} required maxLength={2000} value={comment} onChange={event => setComment(event.target.value)} />
    {verifying && <Hr09State loading title="正在核对服务器记录" />}
    <Hr09ErrorNotice error={verifyError} />
    {verified && <Hr09Notice danger>服务器尚未返回已提交结果，当前内容保持锁定；请稍后再次核对。</Hr09Notice>}
  </AppraisalForm>;
}

function AppraisalInvitationDialog({ invitationId, onClose, onSaved }: { invitationId: string; onClose: () => void; onSaved: () => void }) {
  const resource = useHr09Resource(signal => hrAppraisalApi.invitation(invitationId, signal), [invitationId]);
  if (!resource.loading && resource.data?.status === 'PENDING' && resource.data.cycleStatus === 'SCORING') return <AppraisalResponseEditor record={resource.data} onClose={onClose} onSaved={onSaved} />;
  return <BaseDialog open title="本人评价记录" onClose={onClose} width="wide"><div className="appraisal-workspace space-y-4">{resource.loading ? <Hr09State loading title="正在读取本人邀请" /> : resource.error ? <Hr09State error title="邀请读取失败" description={resource.error.message} onRetry={resource.refresh} /> : resource.data && <><InvitationContent record={resource.data} /><Hr09Notice>只有待提交且周期处于评分阶段的本人邀请可以评分；其他状态只读。</Hr09Notice></>}</div></BaseDialog>;
}

export function AppraisalOwnInvitations() {
  const [query, setQuery] = useState<AppraisalQuery>({ pageNum: 1, pageSize: 10, status: 'PENDING' });
  const [selected, setSelected] = useState<string>();
  const resource = useHr09Resource(signal => hrAppraisalApi.invitations(query, signal), [JSON.stringify(query)]);
  return <section className="space-y-4"><Hr09Notice>此处只显示发给本人的周期评价邀请；评价其他员工时，同样必须由受邀本人提交。{customerScoringDisabled}</Hr09Notice>
    <div className="grid items-end gap-3 sm:grid-cols-[minmax(0,1fr)_180px_auto]"><Hr09Input label="搜索受邀周期或被评人" maxLength={100} value={query.keyword || ''} onChange={event => setQuery({ ...query, keyword: event.target.value, pageNum: 1 })} /><Hr09Select label="邀请状态" value={query.status || ''} options={asOptions(invitationStatuses)} placeholder="全部状态" onChange={status => setQuery({ ...query, status, pageNum: 1 })} /><Button variant="outline" onClick={resource.refresh}>刷新本人邀请</Button></div>
    {resource.loading ? <Hr09State loading title="正在读取本人邀请" /> : resource.error ? <Hr09State error title="本人邀请读取失败" description={resource.error.message} onRetry={resource.refresh} /> : resource.data && <><AppraisalRows rows={resource.data.rows} rowKey={row => row.invitationId} columns={[
      { key: 'cycle', label: '周期 / 目标', render: row => <>{row.cycleName}<p className="mt-1 text-xs text-cf-subtle">{row.objectiveName}</p></> },
      { key: 'person', label: '被评人 / 来源', render: row => <>{row.evaluateeName}<p className="mt-1 text-xs text-cf-subtle">{appraisalText(appraisalSources, row.evaluatorSource)}</p></> },
      { key: 'status', label: '状态', render: row => <>{invitationStatuses[row.status]} · {appraisalStages[row.cycleStatus]}{row.status === 'SUBMITTED' && <p className="mt-1 text-xs">本人已提交 {row.score} 分</p>}</> },
      { key: 'actions', label: '操作', render: row => <Button variant="outline" aria-label={`${row.status === 'PENDING' && row.cycleStatus === 'SCORING' ? '评分' : '查看'}${row.cycleName}邀请`} onClick={() => setSelected(row.invitationId)}>{row.status === 'PENDING' && row.cycleStatus === 'SCORING' ? '填写本人评分' : '查看本人记录'}</Button> },
    ]} /><ListResultFooter summary={`共 ${resource.data.total} 条本人邀请`} total={resource.data.total} page={query.pageNum || 1} pageSize={10} onPageChange={pageNum => setQuery({ ...query, pageNum })} /></>}
    {selected && <AppraisalInvitationDialog invitationId={selected} onClose={() => setSelected(undefined)} onSaved={resource.refresh} />}
  </section>;
}
