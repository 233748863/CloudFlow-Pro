import { useEffect, useState, type ReactNode } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button, UserSelector } from '@/components/common';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/common/select';
import { listJobLevels } from '@/services/api/hr/compensation';
import type { JobLevelOption } from '@/services/api/hr/types';
import { NodeType, type WorkflowGraphDefinition } from '@/types';
import { NODE_OPERATION_LABELS, REJECT_STRATEGY_LABELS, type NodeOperationPermissions } from '@/types/workflowSemantic';
import { getWorkflowUpstreamNodes } from '@/utils/workflowGraph';
import { isWorkflowGatewaySplit } from '@/utils/workflowGateway';
import { ApproverValueSelector } from './ApproverValueSelector';
import { LazyInput } from './LazyInput';
import { studioSectionTitleClassName } from './constants';
import type { EditableWorkflowNode } from './types';

export interface SemanticPropertyProps {
  node: EditableWorkflowNode;
  onChange: (changes: Partial<EditableWorkflowNode>) => void;
}

export const PropertySection = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="admin-dialog-field grid gap-3 border-t border-slate-200 pt-3 dark:border-slate-700">
    <h3 className={studioSectionTitleClassName}>{title}</h3>
    {children}
  </section>
);

export const PropertySelect = ({ label, value, options, onChange, description }: {
  label: string;
  value: string;
  options: Record<string, string>;
  onChange: (value: string) => void;
  description?: string;
}) => (
  <label className="grid gap-1 text-xs text-cf-body">
    <span>{label}</span>
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={label} className="min-h-[44px]"><SelectValue /></SelectTrigger>
      <SelectContent>{Object.entries(options).map(([key, title]) => <SelectItem key={key} value={key}>{title}</SelectItem>)}</SelectContent>
    </Select>
    {description && <span className="text-[11px] leading-relaxed text-cf-muted">{description}</span>}
  </label>
);

export const SemanticPropertyFields = ({ node, graph, onChange }: SemanticPropertyProps & { graph: WorkflowGraphDefinition }) => {
  const isTask = !isWorkflowGatewaySplit(node) && [NodeType.APPROVAL, NodeType.MANUAL, NodeType.PARALLEL].includes(node.type as NodeType);
  const upstream = getWorkflowUpstreamNodes(graph, node.id);
  const [jobLevels, setJobLevels] = useState<JobLevelOption[]>([]);
  const [levelsError, setLevelsError] = useState('');
  const weights = node.assigneeWeights ?? [];
  const weightSource = node.weightSource ?? 'EQUAL';

  useEffect(() => {
    if (node.signType !== 'WEIGHT' || weightSource !== 'BY_JOB_LEVEL') return;
    let cancelled = false;
    setLevelsError('');
    listJobLevels().then((levels) => {
      if (!cancelled) setJobLevels(levels);
    }).catch(() => {
      if (!cancelled) setLevelsError('职级列表加载失败，请检查职级查看权限后重新选择。');
    });
    return () => { cancelled = true; };
  }, [node.signType, weightSource]);

  return <>
    {node.approverType === 'MULTI_LEVEL_MANAGER' && <PropertySection title="多级主管范围">
      <label className="grid gap-1 text-xs text-cf-body">
        <span>向上查找层级</span>
        <LazyInput aria-label="主管层级" type="number" min={1} max={10} step={1} value={String(node.directorLevel ?? 1)}
          onChange={(value: string) => onChange({ directorLevel: value === '' ? undefined : Number(value) })} />
        <span className="text-[11px] text-cf-muted">1 为本部门主管，2 为上级部门主管，最多 10 层。</span>
      </label>
      <PropertySelect label="层级不足时" value={node.directorFallback ?? 'TOP_LEVEL'}
        options={{ TOP_LEVEL: '使用已找到的最高层主管', SKIP: '跳过节点并保留记录', FAIL: '停止并提示配置错误' }}
        onChange={(value) => onChange({ directorFallback: value as EditableWorkflowNode['directorFallback'] })} />
    </PropertySection>}
    {node.approverType === 'INITIATOR_SELECTED' && <PropertySection title="发起人选人范围">
      <p className="text-[11px] leading-relaxed text-cf-muted">不限定时可选本租户有效用户；同时配置角色和部门时，必须同时满足两项。</p>
      <div className="grid gap-1"><span className="text-xs text-cf-body">限定角色</span>
        <ApproverValueSelector type="ROLE" roleValueField="roleId" multiple value={(node.selectableScope?.roleIds ?? []).join(',')}
          onChange={(value) => onChange({ selectableScope: { ...node.selectableScope, roleIds: value ? value.split(',') : [] } })} />
      </div>
      <div className="grid gap-1"><span className="text-xs text-cf-body">限定部门</span>
        <ApproverValueSelector type="DEPT" multiple value={(node.selectableScope?.deptIds ?? []).join(',')}
          onChange={(value) => onChange({ selectableScope: { ...node.selectableScope, deptIds: value ? value.split(',') : [] } })} />
      </div>
      <p className="text-[11px] text-cf-muted">普通节点选 1 人；会签节点可选多人，顺序签按选择顺序处理。</p>
    </PropertySection>}
    {(isTask || node.type === NodeType.TIMER || node.type === NodeType.SUBPROCESS) && <PropertySection title="驳回去向">
      <PropertySelect label="驳回策略" value={node.rejectStrategy ?? '__LEGACY__'}
        options={{ __LEGACY__: '保持原有行为（未配置）', ...REJECT_STRATEGY_LABELS }}
        description="设置后，人工驳回和自动拒绝使用同一去向。"
        onChange={(value) => onChange({ rejectStrategy: value === '__LEGACY__' ? undefined : value as EditableWorkflowNode['rejectStrategy'] })} />
      {node.rejectStrategy === 'TO_SPECIFIED_NODE' && <PropertySelect label="目标节点" value={node.rejectToNodeKey || '__NONE__'}
        options={{ __NONE__: '请选择上游节点', ...Object.fromEntries(upstream.map((candidate) => [candidate.id, candidate.title || candidate.id])) }}
        description="仅列出当前画布的上游节点，保存时由服务端再次校验。"
        onChange={(value) => onChange({ rejectToNodeKey: value === '__NONE__' ? undefined : value })} />}
      {node.rejectStrategy === 'TO_PARENT_NODE' && <p className="text-[11px] text-cf-muted">无父流程时退回发起人；父流程已结束时终止当前流程并留痕。</p>}
    </PropertySection>}
    {isTask && <PropertySection title={node.type === NodeType.MANUAL ? '人工办理与操作权限' : '自审与操作权限'}>
      {node.type === NodeType.MANUAL ? <p className="text-[11px] leading-relaxed text-cf-muted">人工任务必须由指定处理人办理；处理人是发起人本人时仍需完成任务，流程才会继续。</p> : <PropertySelect label="审批人是发起人本人时" value={node.approveSelf ?? 'ALLOW'}
        options={{ ALLOW: '允许本人审批', AUTO_SKIP: '自动跳过本人的审批', TO_DIRECT_LEADER: '转给直属上级', TO_DEPT_MANAGER: '转给部门负责人' }}
        description="转派后仍为本人时允许本人审批并留痕；会签只调整本人的审批项。"
        onChange={(value) => onChange({ approveSelf: value as EditableWorkflowNode['approveSelf'] })} />}
      <details>
        <summary className="cursor-pointer py-2 text-xs font-medium text-cf-body">允许的操作（默认全部允许）</summary>
        <div className="grid gap-1">
          {Object.entries(NODE_OPERATION_LABELS).map(([key, label]) => <label key={key} className="flex min-h-11 items-center gap-2 text-xs text-cf-body">
            <input type="checkbox" className="h-4 w-4" checked={node[key as keyof NodeOperationPermissions] !== false}
              onChange={(event) => onChange({ [key]: event.target.checked })} />
            <span>{label}</span>
          </label>)}
        </div>
      </details>
    </PropertySection>}
    {node.signType === 'WEIGHT' && <PropertySection title="票签权重">
      <label className="grid gap-1 text-xs text-cf-body"><span>通过所需权重</span>
        <LazyInput aria-label="通过所需权重" type="number" min="0.01" max="99999999.99" step="0.01" value={String(node.passWeight ?? '')}
          onChange={(value: string) => onChange({ passWeight: value === '' ? undefined : value })} />
        <span className="text-[11px] text-cf-muted">同意权重达到阈值即通过；阈值不能超过本次参与人的总权重。</span>
      </label>
      <PropertySelect label="票权来源" value={weightSource}
        options={{ EQUAL: '每人 1.00 票', BY_CONFIG: '按人员配置票权', BY_JOB_LEVEL: '按 HR 职级配置票权' }}
        onChange={(value) => onChange({ weightSource: value as EditableWorkflowNode['weightSource'], assigneeWeights: [] })} />
      {weightSource !== 'EQUAL' && <div className="grid gap-3">
        {weights.map((weight, index) => <div key={index} className="grid gap-2 rounded-md border border-slate-200 p-2 dark:border-slate-700">
          {weightSource === 'BY_CONFIG'
            ? <UserSelector single value={weight.userId == null ? null : String(weight.userId)} placeholder="选择票权对应人员"
                onChange={(userId) => onChange({ assigneeWeights: weights.map((entry, entryIndex) => entryIndex === index ? { ...entry, userId: userId ?? undefined } : entry) })} />
            : <PropertySelect label={`第 ${index + 1} 项职级`} value={String(weight.jobLevelId ?? '__NONE__')}
                options={{ __NONE__: '请选择职级', ...Object.fromEntries(jobLevels.map((level) => [String(level.id), level.levelName])) }}
                onChange={(value) => onChange({ assigneeWeights: weights.map((entry, entryIndex) => entryIndex === index ? { ...entry, jobLevelId: value === '__NONE__' ? undefined : value } : entry) })} />}
          <div className="flex items-end gap-2"><label className="grid min-w-0 flex-1 gap-1 text-xs text-cf-body"><span>权重（0.00—9999.99）</span>
            <LazyInput aria-label={`第 ${index + 1} 项权重`} type="number" min="0" max="9999.99" step="0.01" value={String(weight.weight)}
              onChange={(value: string) => onChange({ assigneeWeights: weights.map((entry, entryIndex) => entryIndex === index ? { ...entry, weight: value } : entry) })} />
          </label><Button variant="ghost" className="min-h-11" aria-label={`移除第 ${index + 1} 项票权`}
            onClick={() => onChange({ assigneeWeights: weights.filter((_, entryIndex) => entryIndex !== index) })}><Trash2 size={16} /></Button></div>
        </div>)}
        <Button variant="outline" className="min-h-11" onClick={() => onChange({ assigneeWeights: [...weights, { weight: '1.00' }] })}><Plus size={14} />添加票权</Button>
        {levelsError && weightSource === 'BY_JOB_LEVEL' && <p role="alert" className="text-xs text-[var(--cf-chart-critical)]">{levelsError}</p>}
      </div>}
      <p className="text-[11px] leading-relaxed text-cf-muted">任务生成时固定票权；之后修改配置不影响已生成的票。HR 不可用时降级等权并告警，阈值保持不变。</p>
    </PropertySection>}
  </>;
};
