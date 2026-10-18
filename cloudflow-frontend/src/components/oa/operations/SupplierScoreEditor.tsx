import React, { useEffect, useState } from 'react';
import { BaseDialog } from '@/components/common/BaseDialog';
import { Button, Input } from '@/components/common';
import { oaGet, oaPost, type ScorecardDetail, type OaSupplierScorecard, type OaSupplierScoreCriteria } from '@/services/api/oaOperations';
import { Field, OpsSelect, useMutation, money, labelOf } from './OperationsKit';
import { FormFields, standings } from './RecordEditor';

export const defaultCriteria = (): OaSupplierScoreCriteria[] => [
  { criteriaCode: 'DELIVERY_ON_TIME', criteriaName: '交付及时率', weight: 0.3, dataSource: 'AUTO', maxScore: 100 },
  { criteriaCode: 'QUALITY', criteriaName: '质量合格率', weight: 0.3, dataSource: 'MANUAL', maxScore: 100 },
  { criteriaCode: 'PRICE', criteriaName: '价格竞争力', weight: 0.2, dataSource: 'MANUAL', maxScore: 100 },
  { criteriaCode: 'SERVICE', criteriaName: '服务响应', weight: 0.2, dataSource: 'MANUAL', maxScore: 100 },
];
export default function SupplierScoreEditor({ card, editable, onClose, onSaved }: { card: OaSupplierScorecard | null; editable: boolean; onClose: () => void; onSaved: () => void }) {
  const [draft, setDraft] = useState<ScorecardDetail | null>(null); const mutation = useMutation();
  const [loadError, setLoadError] = useState(''); const [loadVersion, setLoadVersion] = useState(0);
  useEffect(() => {
    let active = true; setDraft(null); setLoadError('');
    if (!card) return;
    if (card.scorecardId) void oaGet<OaSupplierScoreCriteria[]>('/supplier/scorecards/' + card.scorecardId + '/criteria')
      .then(criteria => { if (active) setDraft({ scorecard: card, criteria }); })
      .catch((error: unknown) => { if (active) setLoadError(error instanceof Error ? error.message : '评分维度加载失败'); });
    else setDraft({ scorecard: card, criteria: defaultCriteria() });
    return () => { active = false; };
  }, [card, loadVersion]);
  const readOnly = !editable || card?.status === 'CONFIRMED';
  const updateCriteria = (index: number, patch: Partial<OaSupplierScoreCriteria>) => setDraft(value => value && ({ ...value, criteria: value.criteria.map((item, position) => position === index ? { ...item, ...patch } : item) }));
  return <BaseDialog open={!!card} title="供应商周期评分" width="extra-wide" onClose={onClose} footer={<><Button variant="outline" onClick={onClose}>关闭</Button>{!readOnly && <Button disabled={mutation.busy || !draft} onClick={() => draft && void mutation.run(() => oaPost('/supplier/scorecards', draft), () => { onSaved(); onClose(); })}>保存并计算</Button>}</>}>
    {draft ? <div className="oa-operations space-y-4"><FormFields value={draft.scorecard} onChange={value => setDraft({ ...draft, scorecard: value })} disabled={readOnly || mutation.busy} fields={[
      { key: 'periodType', label: '周期类型', type: 'select', options: { MONTHLY: '月度', QUARTERLY: '季度', YEARLY: '年度' }, required: true },
      { key: 'periodStart', label: '周期开始', type: 'date', required: true }, { key: 'periodEnd', label: '周期结束', type: 'date', required: true }, { key: 'remark', label: '评价说明', type: 'textarea', wide: true },
    ]} />
      <p className="oa-ops-warning">权重合计必须为 1。交付及时率从实际采购收货记录计算，无收货数据时该维度不参与得分；计算结果和收货依据保存后可查看。</p>
      <div className="space-y-4">{draft.criteria.map((item, index) => <fieldset key={index} className="oa-ops-section min-w-0" disabled={readOnly || mutation.busy}>
        <legend className="px-2 font-semibold text-cf-title">{item.criteriaName || '评分维度 ' + (index + 1)}</legend>
        <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="维度编码"><Input aria-label="维度编码" value={item.criteriaCode || ''} onChange={event => updateCriteria(index, { criteriaCode: event.target.value })} /></Field>
          <Field label="维度名称"><Input aria-label="维度名称" value={item.criteriaName || ''} onChange={event => updateCriteria(index, { criteriaName: event.target.value })} /></Field>
          <Field label="权重（0–1）"><Input aria-label="维度权重" type="number" min={0} max={1} step={0.0001} value={item.weight ?? ''} onChange={event => updateCriteria(index, { weight: event.target.value })} /></Field>
          <Field label="数据来源"><OpsSelect label="数据来源" value={item.dataSource} options={item.criteriaCode === 'DELIVERY_ON_TIME' ? { AUTO: '自动', MANUAL: '人工' } : { MANUAL: '人工' }} onChange={value => updateCriteria(index, { dataSource: value })} /></Field>
          <Field label="得分"><Input aria-label="维度得分" type="number" min={0} max={Number(item.maxScore || 100)} step={0.01} disabled={item.dataSource === 'AUTO'} value={item.score ?? ''} onChange={event => updateCriteria(index, { score: event.target.value })} /></Field>
          <Field label="满分"><Input aria-label="维度满分" type="number" min={0.01} max={999.99} step={0.01} value={item.maxScore ?? 100} onChange={event => updateCriteria(index, { maxScore: event.target.value })} /></Field>
        </div>
        <div className="mt-3 min-w-0 whitespace-normal break-words text-sm" data-score-basis={item.criteriaCode}>
          <p className="mb-1 text-cf-muted">{item.dataSource === 'AUTO' ? '自动计算依据' : '评分方式'}</p>
          {item.dataSource === 'AUTO' ? <><span>{item.autoValue == null ? '保存后计算' : money(item.autoValue) + '%'}</span><p className="mt-1 text-xs leading-5 [overflow-wrap:anywhere]">{item.remark}</p></> : '人工评价'}
        </div>
        {!readOnly && <Button className="mt-3 !min-h-[44px]" variant="link" onClick={() => setDraft({ ...draft, criteria: draft.criteria.filter((_, position) => position !== index) })}>移除</Button>}
      </fieldset>)}</div>
      {!readOnly && <Button variant="outline" onClick={() => setDraft({ ...draft, criteria: [...draft.criteria, { dataSource: 'MANUAL', weight: 0, maxScore: 100 }] })}>添加维度</Button>}
      <p>当前总分：{money(draft.scorecard.totalScore)} · 分档：{labelOf(standings, draft.scorecard.standing)}</p>
    </div> : loadError ? <div role="alert"><p>{loadError}</p><Button variant="outline" onClick={() => setLoadVersion(value => value + 1)}>重新加载</Button></div> : <p role="status">正在加载评分维度</p>}
  </BaseDialog>;
}
