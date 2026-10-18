import React, { useEffect, useState } from 'react';
import { BaseDialog, Button } from '@/components/common';
import { useAuth } from '@/context/AuthContext';
import { Hr09Notice, Hr09State, dateTimeText, useHr09Resource } from '../components/Hr09Shared';
import { hrAppraisalApi } from '@/services/api/hr/appraisals';
import type { AppraisalCalculated, AppraisalDetail, AppraisalGoal, AppraisalResult, AppraisalSession } from '@/services/api/hr/appraisalTypes';
import { AppraisalForm, AppraisalRows, appraisalMethods, appraisalStages, appraisalTypes } from './AppraisalShared';
import { AppraisalDraftEditor } from './AppraisalDraft';
import { AppraisalDistributionEditor, AppraisalGoalEditor, AppraisalKraEditor } from './AppraisalTargetEditors';
import { AppraisalCalculationEditor, AppraisalCalibrationEditor, AppraisalGoalScoreEditor, AppraisalSessionEditor, AppraisalSessions, AppraisalTransitionEditor, nextAppraisalStage } from './AppraisalLifecycle';
import { AppraisalEvaluators, customerScoringDisabled } from './AppraisalEvaluation';

type Editor = { kind: 'draft' | 'kras' | 'distribution' | 'transition' | 'calculate' | 'remove' }
  | { kind: 'goal'; objectiveId?: string }
  | { kind: 'removeGoal'; goal: AppraisalGoal }
  | { kind: 'goalScore' | 'evaluators'; goal: AppraisalGoal }
  | { kind: 'calibration'; result: AppraisalResult }
  | { kind: 'session'; session?: AppraisalSession };

function AppraisalDetailContent({ detail, mine, onRefresh, onClose }: { detail: AppraisalDetail; mine: boolean; onRefresh: () => void; onClose: () => void }) {
  const { user, hasPermission } = useAuth();
  const [editor, setEditor] = useState<Editor>();
  const [calculated, setCalculated] = useState<AppraisalCalculated>();
  const cycle = detail.cycle;
  const stage = cycle.status;
  const manage = !mine && hasPermission('hr:appraisal:manage');
  const score = !mine && hasPermission('hr:appraisal:score');
  const calibrate = !mine && hasPermission('hr:appraisal:calibrate');
  const evaluators = !mine && hasPermission('hr:performance:view');
  const parentIds = new Set(detail.goals.map(goal => goal.parentId).filter(Boolean));
  const ownUser = (result?: AppraisalResult) => result?.userId != null && String(result.userId) === String(user?.id);
  const saved = () => { setEditor(undefined); onRefresh(); };
  const props = { detail, onClose: () => setEditor(undefined), onSaved: saved };
  const groupFirst = (goal: AppraisalGoal) => detail.goals.find(row => row.objectiveId === goal.objectiveId)?.assignmentId === goal.assignmentId;
  return <div className="appraisal-workspace space-y-5">
    <section className="space-y-3"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-medium text-cf-title">{appraisalTypes[cycle.cycleType]} · {appraisalStages[stage]}</p><Button variant="outline" onClick={onRefresh}>刷新周期详情</Button></div>
      <p className="text-sm text-cf-subtle">{cycle.startDate} 至 {cycle.endDate} · {appraisalMethods[cycle.evaluationMethod]} · 当前可见 {detail.results.length} 位参评员工</p>
      <Hr09Notice>{stage === 'COMPLETED' ? `周期已于 ${dateTimeText(cycle.completedTime)} 完成，所有关联依据只读。` : mine ? '本人仅能读取自己的目标和最终结果；阶段性评分与他人评价身份不对本人公开。' : '启动冻结参评名单，进入评分冻结目标与权重，进入校准冻结实际评分，完成后关联写入口全部只读。'}</Hr09Notice>
      {!mine && <p className="break-words text-sm text-cf-subtle">评分范围 {cycle.scoreConfig.minScore}—{cycle.scoreConfig.maxScore}；{cycle.finalScoreMode === 'FORMULA' ? `受限公式：${cycle.finalScoreFormula}` : '加权平均，不执行公式'}。</p>}
      <div className="flex flex-wrap gap-2">
        {manage && stage === 'DRAFT' && <><Button variant="outline" onClick={() => setEditor({ kind: 'draft' })}>编辑周期草稿</Button>{cycle.evaluationMethod !== 'GOAL_BASED' && <Button variant="outline" onClick={() => setEditor({ kind: 'kras' })}>配置成果领域</Button>}<Button variant="outline" onClick={() => setEditor({ kind: 'remove' })}>删除周期草稿</Button></>}
        {manage && stage === 'ONGOING' && <Button onClick={() => setEditor({ kind: 'goal' })}>下达周期目标</Button>}
        {manage && ['DRAFT', 'ONGOING'].includes(stage) && <Button variant="outline" onClick={() => setEditor({ kind: 'distribution' })}>配置等级分布</Button>}
        {score && stage === 'SCORING' && <Button onClick={() => setEditor({ kind: 'calculate' })}>计算周期总分</Button>}
        {!mine && hasPermission('hr:appraisal:transition') && nextAppraisalStage(stage) && <Button variant="outline" onClick={() => setEditor({ kind: 'transition' })}>推进下一阶段</Button>}
      </div>
    </section>
    {calculated && <section className="space-y-2"><h3 className="font-medium text-cf-title">本次计算反馈</h3>{calculated.results.map(row => <Hr09Notice key={row.employeeId} danger={Boolean(row.error)}>{row.employeeName}：{row.error || `计算原分 ${row.calculatedScore}`}</Hr09Notice>)}</section>}
    {detail.kras.length > 0 && <section className="space-y-3"><h3 className="font-medium text-cf-title">成果领域</h3><AppraisalRows rows={detail.kras} rowKey={row => row.kraId} columns={[
      { key: 'name', label: '领域', render: row => row.kraName }, { key: 'weight', label: '权重', render: row => row.weight }, { key: 'description', label: '说明', render: row => row.description || '未填写' },
    ]} /></section>}
    <section className="space-y-3"><h3 className="font-medium text-cf-title">{mine ? '本人目标' : '参评目标'}</h3><AppraisalRows rows={detail.goals} rowKey={row => row.assignmentId} empty={mine && ['DRAFT', 'ONGOING'].includes(stage) ? '目标尚未冻结，进入评分后可查看本人目标。' : '尚未下达周期目标'} columns={[
      { key: 'name', label: '目标 / 承担人', render: goal => <>{goal.objectiveName}<p className="mt-1 text-xs text-cf-subtle">{goal.assigneeName} · {parentIds.has(goal.assignmentId) ? '父节点，不计分' : '叶子节点'}</p></> },
      { key: 'weight', label: '目标值 / 权重', render: goal => <>{goal.targetValue}<p className="mt-1 text-xs text-cf-subtle">权重 {goal.weight}</p></> },
      ...(!mine ? [{ key: 'score', label: '已登记目标分', render: (goal: AppraisalGoal) => detail.results.flatMap(result => result.goalScores).find(input => input.assignmentId === goal.assignmentId)?.score ?? '未登记' },
        { key: 'actions', label: '操作', render: (goal: AppraisalGoal) => <div className="flex flex-wrap gap-2">{manage && stage === 'ONGOING' && groupFirst(goal) && <><Button variant="outline" onClick={() => setEditor({ kind: 'goal', objectiveId: goal.objectiveId })}>修改目标</Button><Button variant="outline" onClick={() => setEditor({ kind: 'removeGoal', goal })}>移除目标</Button></>}
          {goal.assigneeType === 'EMPLOYEE' && !parentIds.has(goal.assignmentId) && <>{score && stage === 'SCORING' && !ownUser(detail.results.find(result => result.employeeId === goal.assigneeId)) && <Button variant="outline" aria-label={`登记${goal.assigneeName}${goal.objectiveName}评分`} onClick={() => setEditor({ kind: 'goalScore', goal })}>登记目标评分</Button>}{evaluators && <Button variant="outline" onClick={() => setEditor({ kind: 'evaluators', goal })}>评价邀请</Button>}</>}</div> }] : []),
    ]} /></section>
    <section className="space-y-3"><h3 className="font-medium text-cf-title">{mine ? '本人最终结果' : '参评名单与结果'}</h3><AppraisalRows rows={detail.results} rowKey={row => row.appraisalResultId} empty={stage === 'DRAFT' ? '启动前请预览实际参评名单。' : '当前范围内没有参评员工'} columns={[
      { key: 'name', label: '员工', render: result => <>{result.employeeName}<p className="mt-1 text-xs text-cf-subtle">{result.employeeNo}</p></> },
      { key: 'score', label: '计算原分 / 最终分', render: result => mine && stage !== 'COMPLETED' ? '完成后公开' : <>{result.calculatedScore ?? '未计算'} / {result.finalScore ?? '未核定'}</> },
      { key: 'grade', label: '等级 / 校准原因', render: result => <>{result.grade || (mine && stage !== 'COMPLETED' ? '完成后公开' : '未核定')}<p className="mt-1 whitespace-pre-wrap text-xs text-cf-subtle">{result.calibrationReason}</p></> },
      ...(calibrate && stage === 'CALIBRATING' ? [{ key: 'action', label: '操作', render: (result: AppraisalResult) => !ownUser(result) && <Button variant="outline" aria-label={`校准${result.employeeName}结果`} onClick={() => setEditor({ kind: 'calibration', result })}>校准结果</Button> }] : []),
    ]} /></section>
    {!mine && detail.distribution && <section className="space-y-3"><h3 className="font-medium text-cf-title">冻结人数与等级分布</h3><p className="text-sm text-cf-subtle">按 {detail.distribution.population} 人核定；{detail.distribution.enforceMode === 'BLOCK' ? '不符合时阻止完成' : '不符合时提醒并要求确认'}。</p><AppraisalRows rows={detail.distribution.grades} rowKey={row => row.grade} columns={[
      { key: 'grade', label: '等级', render: row => row.grade }, { key: 'quota', label: '计算名额', render: row => row.quota }, { key: 'actual', label: '实际人数 / 允许范围', render: row => `${row.actual} / ${row.minimum}—${row.maximum}` },
    ]} />{detail.distribution.violations.map(message => <Hr09Notice key={message} danger>{message}</Hr09Notice>)}</section>}
    {!mine && <AppraisalSessions detail={detail} canEdit={calibrate && stage === 'CALIBRATING'} onEdit={session => setEditor({ kind: 'session', session })} />}
    {!mine && <Hr09Notice>{customerScoringDisabled}</Hr09Notice>}
    {editor?.kind === 'draft' && <AppraisalDraftEditor record={cycle} onClose={props.onClose} onSaved={saved} />}
    {editor?.kind === 'kras' && <AppraisalKraEditor {...props} />}
    {editor?.kind === 'goal' && <AppraisalGoalEditor {...props} objectiveId={editor.objectiveId} />}
    {editor?.kind === 'goalScore' && <AppraisalGoalScoreEditor {...props} goal={editor.goal} />}
    {editor?.kind === 'distribution' && <AppraisalDistributionEditor {...props} />}
    {editor?.kind === 'transition' && <AppraisalTransitionEditor {...props} />}
    {editor?.kind === 'calculate' && <AppraisalCalculationEditor {...props} onCalculated={setCalculated} />}
    {editor?.kind === 'calibration' && <AppraisalCalibrationEditor {...props} result={editor.result} />}
    {editor?.kind === 'session' && <AppraisalSessionEditor {...props} session={editor.session} />}
    {editor?.kind === 'evaluators' && <AppraisalEvaluators goal={editor.goal} writable={score && stage === 'SCORING' && hasPermission('hr:performance:edit')} onClose={props.onClose} />}
    {editor?.kind === 'removeGoal' && <AppraisalForm title="移除未冻结目标" onClose={props.onClose} onReload={saved} confirmation="确认移除该目标及其全部未冻结节点。" onSubmit={async () => { await hrAppraisalApi.removeGoal(cycle, editor.goal.objectiveId); saved(); }}><p className="text-sm">{editor.goal.objectiveName}</p></AppraisalForm>}
    {editor?.kind === 'remove' && <AppraisalForm title="删除周期草稿" onClose={props.onClose} onReload={saved} confirmation="确认删除当前未启动周期草稿。" onSubmit={async () => { await hrAppraisalApi.remove(cycle); onClose(); onRefresh(); }}><p className="text-sm">{cycle.cycleName}</p></AppraisalForm>}
  </div>;
}

export function AppraisalDetailDialog({ cycleId, mine, onClose, onChanged }: { cycleId: string; mine: boolean; onClose: () => void; onChanged: () => void }) {
  const resource = useHr09Resource(signal => hrAppraisalApi.detail(cycleId, mine, signal), [cycleId, mine]);
  const [previous, setPrevious] = useState<AppraisalDetail>();
  useEffect(() => { if (resource.data) setPrevious(resource.data); }, [resource.data]);
  const detail = resource.data || previous;
  return <BaseDialog open title={detail?.cycle.cycleName || '绩效周期详情'} width="extra-wide" onClose={onClose}><div className="appraisal-workspace">{resource.loading && <Hr09State loading title="正在读取周期详情" />}{resource.error && <Hr09State error title="周期详情读取失败" description={resource.error.message} onRetry={resource.refresh} />}{detail && <fieldset disabled={resource.loading || Boolean(resource.error)} className="min-w-0"><AppraisalDetailContent detail={detail} mine={mine} onClose={onClose} onRefresh={() => { resource.refresh(); onChanged(); }} /></fieldset>}</div></BaseDialog>;
}
