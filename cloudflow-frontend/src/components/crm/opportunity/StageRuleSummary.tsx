import React from 'react';
import type { SalesStage, StageRequiredField } from '@/services/api/crm/opportunityStages';
import './opportunity.css';

export const stageFieldLabels: Record<StageRequiredField, string> = {
  contactId: '联系人', expectedAmount: '预计金额大于零', expectedSignDate: '预计签约日期', ownerId: '负责人', remark: '备注',
};
export const stagePercent = (stage: SalesStage) => `${(Number(stage.defaultWinRate) * 100).toFixed(2)}%`;
export const terminalStage = (stage: SalesStage) => stage.isWonFlag === 1 || stage.isLostFlag === 1;

export function StageRuleSummary({ stage, reopening = false }: { stage?: SalesStage; reopening?: boolean }) {
  if (!stage) return <p className="crm-ops-warning">阶段规则尚未加载，暂不能推进。</p>;
  return <div className="rounded-lg border border-cf-border p-3 text-sm space-y-2" aria-label="阶段进入要求">
    <p>{stage.stageName} · 默认赢率 {stagePercent(stage)} · {reopening ? '恢复时可选择此进行中阶段' : stage.allowSkipFlag ? '允许跳入' : '须顺序推进'}</p>
    <p>必填：{stage.requiredFields?.length ? stage.requiredFields.map(field => stageFieldLabels[field]).join('、') : '无额外要求'}；{stage.requiredActivityFlag ? '须有本商机有效跟进或已完成活动' : '不要求已有跟进'}。</p>
    <p>{stage.overdueDays ? `停留满 ${stage.overdueDays} 个完整自然日提醒负责人` : '未设置超期提醒'}，进入阶段后按默认赢率重新计算加权金额。</p>
  </div>;
}
