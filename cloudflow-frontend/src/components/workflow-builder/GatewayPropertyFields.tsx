import { ArrowDown, ArrowUp } from 'lucide-react';
import { Button } from '../common';
import { NodeType, type WorkflowGraphDefinition, type WorkflowGraphEdge, type WorkflowGraphNode } from '../../types';
import { getWorkflowGatewayBranches, getWorkflowGatewayJoinKey, isWorkflowGatewaySplit, workflowEdgeIsDefault } from '../../utils/workflowGateway';
import { LazyTextarea } from './LazyInput';
import { PropertySection, PropertySelect } from './SemanticPropertyFields';

export const GatewayPropertyFields = ({ node, graph, onChange }: {
  node: WorkflowGraphNode;
  graph: WorkflowGraphDefinition;
  onChange: (graph: WorkflowGraphDefinition) => void;
}) => {
  const branches = getWorkflowGatewayBranches(graph, node);
  const parallel = node.type === NodeType.PARALLEL;
  const optionalDefault = node.type === NodeType.INCLUSIVE || node.type === NodeType.ROUTE;
  const joined = isWorkflowGatewaySplit(node);
  const joinKey = getWorkflowGatewayJoinKey(graph, node);
  const targetTitle = (edge: WorkflowGraphEdge) => graph.nodes.find(candidate => candidate.id === edge.target)?.title || edge.target;
  const defaultIndex = branches.findIndex(workflowEdgeIsDefault);
  const updateCondition = (edge: WorkflowGraphEdge, value: string) => {
    const singleIncoming = graph.edges.filter(candidate => candidate.target === edge.target).length === 1;
    onChange({ ...graph,
      nodes: graph.nodes.map(candidate => singleIncoming && candidate.id === edge.target ? { ...candidate, condition: undefined } : candidate),
      edges: graph.edges.map(candidate => candidate === edge ? { ...candidate, condition: value.trim() || undefined } : candidate),
    });
  };
  const reorder = (index: number, direction: number) => {
    const reordered = [...branches];
    const destination = index + direction;
    if (destination < 0 || destination >= reordered.length) return;
    [reordered[index], reordered[destination]] = [reordered[destination], reordered[index]];
    let cursor = 0;
    onChange({ ...graph, edges: graph.edges.map(edge => branches.includes(edge) ? reordered[cursor++] : edge) });
  };
  const setDefault = (value: string) => {
    const selected = value === 'NONE' ? undefined : branches[Number(value)];
    onChange({ ...graph, edges: graph.edges.map(edge => branches.includes(edge)
      ? { ...edge, isDefault: edge === selected || undefined } : edge) });
  };
  const setJoin = (value: string) => onChange({ ...graph,
    nodes: graph.nodes.map(candidate => candidate.id === node.id ? { ...candidate, joinNodeKey: value } : candidate),
    edges: graph.edges.map(edge => parallel && edge.source === node.id && workflowEdgeIsDefault(edge) ? { ...edge, target: value } : edge),
  });
  return (
    <PropertySection title="网关出口设置">
      <p className="text-xs leading-relaxed text-cf-muted">
        {parallel ? '所有出口同时启动，全部到达配对汇聚节点后继续。'
          : node.type === NodeType.INCLUSIVE ? '启动所有条件命中的出口，仅等待本次激活的分支。'
            : '按出口顺序取第一个命中条件的分支；无命中时走默认出口。'}
      </p>
      {joined && <PropertySelect label="配对汇聚节点" value={joinKey || 'NONE'} onChange={setJoin}
        options={Object.fromEntries(graph.nodes.filter(candidate => candidate.id !== node.id && candidate.type !== NodeType.START)
          .map(candidate => [candidate.id, candidate.title || candidate.id]))}
        description="所有分支必须到达同一个配对节点；跨分支、跳过汇聚的连接将被拒绝。" />}
      {!parallel && <PropertySelect label="默认出口" value={defaultIndex < 0 ? 'NONE' : String(defaultIndex)} onChange={setDefault}
        options={{ ...(optionalDefault ? { NONE: '无默认出口' } : {}), ...Object.fromEntries(branches.map((edge, index) => [String(index), `${index + 1} · ${targetTitle(edge)}`])) }}
        description={optionalDefault ? '默认出口仅在普通出口全部未命中时启动；未配置默认出口时停止并报错。' : '排他网关必须指定一个默认出口，用于所有普通出口均未命中的情况。'} />}
      <div className="grid gap-3" aria-label="网关出口顺序">
        {branches.map((edge, index) => (
          <section key={edge.id || `${edge.target}-${index}`} className="grid gap-2 rounded-md border border-slate-200 p-3 dark:border-slate-700">
            <div className="flex items-center justify-between gap-2">
              <span className="min-w-0 break-words text-xs font-medium text-cf-body">{index + 1} · {targetTitle(edge)}</span>
              <div className="flex shrink-0">
                <Button type="button" size="icon" variant="ghost" className="min-h-[44px] min-w-[44px] motion-reduce:transition-none"
                  aria-label={`上移出口${index + 1}`} disabled={index === 0} onClick={() => reorder(index, -1)}><ArrowUp size={16} /></Button>
                <Button type="button" size="icon" variant="ghost" className="min-h-[44px] min-w-[44px] motion-reduce:transition-none"
                  aria-label={`下移出口${index + 1}`} disabled={index === branches.length - 1} onClick={() => reorder(index, 1)}><ArrowDown size={16} /></Button>
              </div>
            </div>
            {parallel ? <p className="text-xs text-cf-muted">始终启动</p> : workflowEdgeIsDefault(edge)
              ? <p className="text-xs text-cf-muted">默认出口 · 普通出口全部未命中时启动</p>
              : <label className="grid gap-1 text-xs text-cf-body">
                <span>出口{index + 1}条件</span>
                <LazyTextarea aria-label={`出口${index + 1}条件`} className="min-h-22 font-mono text-xs" value={edge.condition || graph.nodes.find(candidate => candidate.id === edge.target)?.condition || ''}
                  placeholder="#amount > 5000" onChange={(value: string) => updateCondition(edge, value)} />
                <span className="text-[11px] text-cf-muted">条件表达式 = 根据表单变量计算真或假；留空或 true 表示始终命中。</span>
              </label>}
          </section>
        ))}
      </div>
    </PropertySection>
  );
};
