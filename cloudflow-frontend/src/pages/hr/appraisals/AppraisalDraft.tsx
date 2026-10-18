import React, { useState } from 'react';
import { Hr09Input, Hr09Notice, Hr09Select, Hr09State, Hr09Textarea, asOptions, useHr09Resource } from '../components/Hr09Shared';
import { hrAppraisalApi } from '@/services/api/hr/appraisals';
import type { AppraisalCycle, AppraisalDraft as Draft, AppraisalMethod } from '@/services/api/hr/appraisalTypes';
import { AppraisalChoices, AppraisalForm, appraisalMethods, appraisalTypes } from './AppraisalShared';

export function AppraisalDraftEditor({ record, onClose, onSaved }: { record?: AppraisalCycle; onClose: () => void; onSaved: (cycleId?: string) => void }) {
  const options = useHr09Resource(signal => hrAppraisalApi.options(signal), []);
  const [draft, setDraft] = useState<Draft>(record ? { ...record, remark: record.remark || '', scoreConfig: { ...record.scoreConfig } } : {
    cycleName: '', cycleType: 'QUARTERLY', startDate: '', endDate: '', scopeDeptIds: [], scopePositionIds: [], scopeJobLevelIds: [],
    evaluationMethod: 'GOAL_BASED', finalScoreMode: 'WEIGHTED_AVG', finalScoreFormula: '', scoreConfig: { minScore: '0', maxScore: '', kraWeight: null, goalWeight: null }, remark: '',
  });
  const change = (patch: Partial<Draft>) => setDraft(current => ({ ...current, ...patch }));
  return <AppraisalForm title={record ? '修改绩效周期草稿' : '创建绩效周期'} description="保存草稿后配置目标领域；预览并确认参评人员后才能启动。" onClose={onClose}
    blocked={options.loading || !options.data} onReload={() => { onClose(); onSaved(record?.cycleId); }} submitText="保存周期草稿"
    onSubmit={async () => { const cycleId = await hrAppraisalApi.save(draft); onSaved(cycleId); }}>
    <div className="grid gap-4 sm:grid-cols-2"><Hr09Input label="周期名称" value={draft.cycleName} required maxLength={100} onChange={event => change({ cycleName: event.target.value })} />
      <Hr09Select label="周期类型" required value={draft.cycleType} options={asOptions(appraisalTypes)} onChange={cycleType => change({ cycleType: cycleType as Draft['cycleType'] })} />
      <Hr09Input label="开始日期" type="date" required value={draft.startDate} onChange={event => change({ startDate: event.target.value })} />
      <Hr09Input label="结束日期" type="date" required value={draft.endDate} onChange={event => change({ endDate: event.target.value })} />
      <Hr09Select label="评价方式" required value={draft.evaluationMethod} options={asOptions(appraisalMethods)} onChange={evaluationMethod => change({ evaluationMethod: evaluationMethod as AppraisalMethod })} />
      <Hr09Select label="总分计算方式" required value={draft.finalScoreMode} options={asOptions({ WEIGHTED_AVG: '加权平均', FORMULA: '受限公式' })} onChange={finalScoreMode => change({ finalScoreMode: finalScoreMode as Draft['finalScoreMode'] })} />
      <Hr09Input label="核定评分下界" required inputMode="decimal" value={draft.scoreConfig.minScore} onChange={event => change({ scoreConfig: { ...draft.scoreConfig, minScore: event.target.value } })} />
      <Hr09Input label="核定评分上界" required inputMode="decimal" value={draft.scoreConfig.maxScore} onChange={event => change({ scoreConfig: { ...draft.scoreConfig, maxScore: event.target.value } })} />
      {draft.evaluationMethod === 'MIXED' && <><Hr09Input label="成果领域占比" required inputMode="decimal" value={draft.scoreConfig.kraWeight || ''} onChange={event => change({ scoreConfig: { ...draft.scoreConfig, kraWeight: event.target.value } })} /><Hr09Input label="目标权重占比" required inputMode="decimal" value={draft.scoreConfig.goalWeight || ''} onChange={event => change({ scoreConfig: { ...draft.scoreConfig, goalWeight: event.target.value } })} /></>}
    </div>
    {draft.finalScoreMode === 'FORMULA' && <><Hr09Textarea label="得分公式" required maxLength={500} value={draft.finalScoreFormula} onChange={event => change({ finalScoreFormula: event.target.value })} hint="最多500字符、5层括号，只支持加减乘除和七类得分变量。" />
      <Hr09Notice>变量写法：{'${kraScore}'} 成果领域分、{'${goalScore}'} 目标分、{'${selfScore}'} 自评分、{'${managerScore}'} 上级分、{'${peerScore}'} 同事分、{'${subordinateScore}'} 下属分。缺少实际评分时不计算总分。客户评分已停用；接入真实客户身份后启用，当前不能保存引用{'${customerScore}'}的公式。</Hr09Notice></>}
    <Hr09Notice>部门、岗位、职级同时选择时，员工须满足全部维度；每个维度可多选，空选表示该维度不限定。启动前必须核对实际名单。</Hr09Notice>
    {options.loading ? <Hr09State loading title="正在读取可选范围" /> : options.error ? <Hr09State error title="范围选项读取失败" description={options.error.message} onRetry={options.refresh} /> : options.data && <div className="grid gap-4 lg:grid-cols-3">
      <AppraisalChoices label="部门范围" options={options.data.departments} value={draft.scopeDeptIds} onChange={scopeDeptIds => change({ scopeDeptIds })} />
      <AppraisalChoices label="岗位范围" options={options.data.positions} value={draft.scopePositionIds} onChange={scopePositionIds => change({ scopePositionIds })} />
      <AppraisalChoices label="职级范围" options={options.data.jobLevels} value={draft.scopeJobLevelIds} onChange={scopeJobLevelIds => change({ scopeJobLevelIds })} />
    </div>}
    <Hr09Textarea label="内部备注" maxLength={500} value={draft.remark} rows={2} onChange={event => change({ remark: event.target.value })} />
  </AppraisalForm>;
}
