import React, { useState } from 'react';
import { Button } from '@/components/common';
import { Hr09Input, Hr09Notice, Hr09Select, Hr09State, Hr09Textarea, asOptions, dateTimeText, useHr09Resource } from '../components/Hr09Shared';
import { hrAppraisalApi } from '@/services/api/hr/appraisals';
import type { AppraisalCalculated, AppraisalDetail, AppraisalGoal, AppraisalResult, AppraisalSession, AppraisalStatus } from '@/services/api/hr/appraisalTypes';
import { AppraisalForm, AppraisalPeoplePicker, AppraisalRows, appraisalStages } from './AppraisalShared';
import type { AppraisalEditorProps } from './AppraisalTargetEditors';

export const nextAppraisalStage = (status: AppraisalStatus): AppraisalStatus | undefined => ({ DRAFT: 'ONGOING', ONGOING: 'SCORING', SCORING: 'CALIBRATING', CALIBRATING: 'COMPLETED' } as Partial<Record<AppraisalStatus, AppraisalStatus>>)[status];

export function AppraisalTransitionEditor(props: AppraisalEditorProps) {
  const target = nextAppraisalStage(props.detail.cycle.status);
  const preview = useHr09Resource(signal => hrAppraisalApi.preview(props.detail.cycle.cycleId, signal), [props.detail.cycle.cycleId], target === 'ONGOING');
  const [acknowledge, setAcknowledge] = useState(false);
  const warning = target === 'COMPLETED' && props.detail.distribution?.enforceMode === 'WARN' && Boolean(props.detail.distribution.violations.length);
  return <AppraisalForm title="推进绩效阶段" submitText="确认推进" onClose={props.onClose} onReload={() => { props.onClose(); props.onSaved(); }}
    blocked={!target || target === 'ONGOING' && (!preview.data?.employees.length || preview.loading) || Boolean(warning && !acknowledge)}
    confirmation="我已核对当前条件，同意按顺序推进并冻结对应依据。" onSubmit={async () => { if (target) { await hrAppraisalApi.transition(props.detail.cycle, target, preview.data?.digest, acknowledge); props.onSaved(); } }}>
    <p className="text-sm text-cf-title">{appraisalStages[props.detail.cycle.status]} → {target ? appraisalStages[target] : '已结束'}</p>
    <Hr09Notice>{target === 'ONGOING' ? '启动时冻结参评名单，后续调岗不会改变该名单。' : target === 'SCORING' ? '进入评分时冻结成果领域、目标树、目标权重及分布规则，须先核对全部员工目标。' : target === 'CALIBRATING' ? '须先完成所有员工的总分计算；评分来源与上次计算一致时才能进入校准。' : '须核定每位员工的最终分数与等级。完成后目标、评分、分布和会议依据均只读，本人可查看最终结果。'}</Hr09Notice>
    {target === 'ONGOING' && (preview.loading ? <Hr09State loading title="正在预览参评名单" /> : preview.error ? <Hr09State error title="名单预览失败" description={preview.error.message} onRetry={preview.refresh} /> : preview.data && <><p className="text-sm">实际参评 {preview.data.employees.length} 人</p><AppraisalRows rows={preview.data.employees} rowKey={row => row.employeeId} columns={[
      { key: 'name', label: '姓名', render: row => row.employeeName }, { key: 'number', label: '工号', render: row => row.employeeNo },
    ]} /></>)}
    {target === 'COMPLETED' && props.detail.distribution?.violations.map(message => <Hr09Notice key={message} danger>{message}</Hr09Notice>)}
    {warning && <label className="appraisal-choice flex items-start gap-3 text-sm"><input type="checkbox" checked={acknowledge} onChange={event => setAcknowledge(event.target.checked)} /><span>已阅读等级分布提醒，确认按当前结果完成。</span></label>}
  </AppraisalForm>;
}

export function AppraisalGoalScoreEditor({ goal, ...props }: AppraisalEditorProps & { goal: AppraisalGoal }) {
  const existing = props.detail.results.flatMap(row => row.goalScores).find(row => row.assignmentId === goal.assignmentId);
  const [score, setScore] = useState(existing?.score ?? '');
  const [summary, setSummary] = useState(existing?.summary || '');
  return <AppraisalForm title="登记目标评分" onClose={props.onClose} onReload={() => { props.onClose(); props.onSaved(); }} onSubmit={async () => { await hrAppraisalApi.score(props.detail.cycle, goal.assignmentId, score, summary); props.onSaved(); }}>
    <Hr09Notice>{goal.assigneeName} · {goal.objectiveName}；只为员工叶子目标记录达成评分，不能为自己登记。</Hr09Notice>
    <Hr09Input label="目标得分" required inputMode="decimal" value={score} onChange={event => setScore(event.target.value)} hint={`${props.detail.cycle.scoreConfig.minScore}—${props.detail.cycle.scoreConfig.maxScore}，最多两位小数`} />
    <Hr09Textarea label="评分依据" required maxLength={2000} value={summary} onChange={event => setSummary(event.target.value)} />
  </AppraisalForm>;
}

export function AppraisalCalibrationEditor({ result, ...props }: AppraisalEditorProps & { result: AppraisalResult }) {
  const [score, setScore] = useState(result.finalScore ?? result.calculatedScore ?? '');
  const [grade, setGrade] = useState(result.grade || '');
  const [reason, setReason] = useState('');
  return <AppraisalForm title="校准员工结果" onClose={props.onClose} onReload={() => { props.onClose(); props.onSaved(); }} onSubmit={async () => { await hrAppraisalApi.calibrate(props.detail.cycle, result, score, grade, reason); props.onSaved(); }}>
    <Hr09Notice>{result.employeeName} · 计算原分 {result.calculatedScore ?? '未计算'}。校准保留计算依据、原分和本次原因；不能校准自己的结果。</Hr09Notice>
    <Hr09Input label="最终得分" required inputMode="decimal" value={score} onChange={event => setScore(event.target.value)} />
    {props.detail.distributionRule ? <Hr09Select label="最终等级" required value={grade} onChange={setGrade} options={props.detail.distributionRule.distribution.map(row => ({ value: row.grade, label: row.grade }))} /> : <Hr09Input label="最终等级" required maxLength={30} value={grade} onChange={event => setGrade(event.target.value)} />}
    <Hr09Textarea label="校准原因" required maxLength={1000} value={reason} onChange={event => setReason(event.target.value)} />
  </AppraisalForm>;
}

export function AppraisalSessionEditor({ session, ...props }: AppraisalEditorProps & { session?: AppraisalSession }) {
  const [draft, setDraft] = useState<AppraisalSession>(session ? { ...session, participantUserIds: [...session.participantUserIds] } : { sessionName: '', scheduledAt: '', location: '', facilitatorUserId: '', participantUserIds: [], agenda: '', minutes: '', status: 'PLANNED' });
  const [names, setNames] = useState<Record<string, string>>(Object.fromEntries(session?.participantNames?.map(person => [person.identifier, person.name]) || []));
  const change = (patch: Partial<AppraisalSession>) => setDraft(current => ({ ...current, ...patch }));
  return <AppraisalForm title={session ? '维护校准会议' : '新增校准会议'} onClose={props.onClose} onReload={() => { props.onClose(); props.onSaved(); }} onSubmit={async () => { await hrAppraisalApi.session(props.detail.cycle, { ...draft, scheduledAt: draft.scheduledAt.length === 16 ? `${draft.scheduledAt}:00` : draft.scheduledAt }); props.onSaved(); }}>
    <Hr09Input label="会议名称" required maxLength={200} value={draft.sessionName} onChange={event => change({ sessionName: event.target.value })} />
    <div className="grid gap-4 sm:grid-cols-2"><Hr09Input label="会议时间" type="datetime-local" required value={draft.scheduledAt.slice(0, 16)} onChange={event => change({ scheduledAt: event.target.value })} /><Hr09Input label="会议地点" required maxLength={200} value={draft.location} onChange={event => change({ location: event.target.value })} /></div>
    <AppraisalPeoplePicker label="主持人" value={names[draft.facilitatorUserId]} onPick={person => { if (person.userId) { change({ facilitatorUserId: person.userId }); setNames(current => ({ ...current, [person.userId as string]: person.employeeName })); } }} />
    <AppraisalPeoplePicker label="添加参会人" onPick={person => { if (person.userId) { change({ participantUserIds: [...new Set([...draft.participantUserIds, person.userId])] }); setNames(current => ({ ...current, [person.userId as string]: person.employeeName })); } }} />
    <ul className="space-y-2">{draft.participantUserIds.map(identifier => <li key={identifier} className="flex items-center justify-between gap-2 text-sm"><span>{names[identifier] || '原参会人员（姓名不可用）'}</span><Button type="button" variant="outline" aria-label={`移除参会人${names[identifier] || ''}`} onClick={() => change({ participantUserIds: draft.participantUserIds.filter(value => value !== identifier) })}>移除</Button></li>)}</ul>
    <Hr09Textarea label="会议议程" required maxLength={2048} value={draft.agenda} onChange={event => change({ agenda: event.target.value })} />
    <Hr09Textarea label="会议纪要" maxLength={4096} value={draft.minutes} onChange={event => change({ minutes: event.target.value })} />
    <Hr09Select label="会议状态" required value={draft.status} onChange={status => change({ status: status as AppraisalSession['status'] })} options={asOptions({ PLANNED: '已计划', ONGOING: '进行中', COMPLETED: '已完成', CANCELLED: '已取消' })} />
  </AppraisalForm>;
}

export function AppraisalCalculationEditor({ detail, onCalculated, ...props }: AppraisalEditorProps & { onCalculated: (value: AppraisalCalculated) => void }) {
  return <AppraisalForm title="计算周期总分" submitText="读取并计算" successText="已读取逐人计算结果" onClose={props.onClose} onReload={() => { props.onClose(); props.onSaved(); }} onSubmit={async () => { const value = await hrAppraisalApi.calculate(detail.cycle); onCalculated(value); props.onSaved(); }}>
    <Hr09Notice>读取冻结目标及实际提交的评分；缺少输入的员工会单独显示原因，不补零，也不覆盖已核定校准结果。</Hr09Notice>
  </AppraisalForm>;
}

export function AppraisalSessions({ detail, canEdit, onEdit }: { detail: AppraisalDetail; canEdit: boolean; onEdit: (session?: AppraisalSession) => void }) {
  return <section className="space-y-3"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-medium text-cf-title">校准会议</h3>{canEdit && <Button variant="outline" onClick={() => onEdit()}>新增校准会议</Button>}</div><AppraisalRows rows={detail.sessions} rowKey={row => row.sessionId as string} columns={[
    { key: 'name', label: '会议', render: row => <>{row.sessionName}<p className="text-xs text-cf-subtle">{dateTimeText(row.scheduledAt)} · {row.location}</p></> },
    { key: 'people', label: '参会人员', render: row => row.participantNames?.map(person => person.name).join('、') || '未提供' },
    { key: 'content', label: '议程 / 纪要', render: row => <><p className="whitespace-pre-wrap">{row.agenda}</p><p className="mt-2 whitespace-pre-wrap text-cf-subtle">{row.minutes || '尚无纪要'}</p></> },
    { key: 'status', label: '状态', render: row => ({ PLANNED: '已计划', ONGOING: '进行中', COMPLETED: '已完成', CANCELLED: '已取消' })[row.status] },
    ...(canEdit ? [{ key: 'actions', label: '操作', render: (row: AppraisalSession) => <Button variant="outline" onClick={() => onEdit(row)}>维护会议</Button> }] : []),
  ]} /></section>;
}
