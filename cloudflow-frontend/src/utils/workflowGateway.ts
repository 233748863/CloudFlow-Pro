import { NodeType, type WorkflowBranchStrategy, type WorkflowGraphDefinition, type WorkflowGraphEdge, type WorkflowGraphNode } from '../types';

export const getWorkflowGatewayBranchStrategy = (node?: Pick<WorkflowGraphNode, 'type'> | null): WorkflowBranchStrategy => {
  if (node?.type === NodeType.PARALLEL) return 'PARALLEL';
  if (node?.type === NodeType.INCLUSIVE) return 'INCLUSIVE';
  if (node?.type === NodeType.ROUTE) return 'ROUTE';
  return 'EXCLUSIVE';
};

export const workflowEdgeIsDefault = (edge: WorkflowGraphEdge): boolean =>
  ['true', '1', 'yes', 'y'].includes(String(edge.isDefault ?? false).toLowerCase());

export const isWorkflowGatewaySplit = (node?: WorkflowGraphNode | null): boolean =>
  node?.type === NodeType.INCLUSIVE || (node?.type === NodeType.PARALLEL && !String(node.signType ?? '').trim());

export const getWorkflowGatewayJoinKey = (graph: WorkflowGraphDefinition, node: WorkflowGraphNode): string | undefined => {
  if (!isWorkflowGatewaySplit(node)) return undefined;
  return node.joinNodeKey || (node.type === NodeType.PARALLEL
    ? graph.edges.find(edge => edge.source === node.id && workflowEdgeIsDefault(edge))?.target : undefined);
};

export const isWorkflowGatewayJoin = (graph: WorkflowGraphDefinition, nodeId: string): boolean =>
  graph.nodes.some(node => getWorkflowGatewayJoinKey(graph, node) === nodeId);

export const isWorkflowGatewayPointer = (graph: WorkflowGraphDefinition, edge: WorkflowGraphEdge): boolean => {
  const source = graph.nodes.find(node => node.id === edge.source);
  return source?.type === NodeType.PARALLEL && isWorkflowGatewaySplit(source) && workflowEdgeIsDefault(edge);
};

export const getWorkflowGatewayBranches = (graph: WorkflowGraphDefinition, node: WorkflowGraphNode): WorkflowGraphEdge[] =>
  graph.edges.filter(edge => edge.source === node.id && !isWorkflowGatewayPointer(graph, edge));

export const isWorkflowGatewayRouter = (graph: WorkflowGraphDefinition, node: WorkflowGraphNode): boolean =>
  isWorkflowGatewaySplit(node) || node.type === NodeType.ROUTE
  || ([NodeType.CONDITION, NodeType.GATEWAY].includes(node.type as NodeType)
    && graph.edges.filter(edge => edge.source === node.id).length > 1);

export const collectWorkflowGatewayBranch = (graph: WorkflowGraphDefinition, first: string, join: string): Set<string> => {
  const region = new Set<string>();
  const pending = [first];
  while (pending.length) {
    const current = pending.pop()!;
    if (current === join || region.has(current)) continue;
    region.add(current);
    graph.edges.filter(edge => edge.source === current).forEach(edge => pending.push(edge.target));
  }
  return region;
};

export const validateWorkflowGateways = (graph: WorkflowGraphDefinition): { errors: string[]; errorNodes: string[] } => {
  const errors: string[] = [];
  const errorNodes = new Set<string>();
  const nodes = new Map(graph.nodes.map(node => [node.id, node]));
  const joins = new Set<string>();
  const reject = (message: string, ...identifiers: string[]) => {
    errors.push(message);
    identifiers.forEach(identifier => errorNodes.add(identifier));
  };
  for (const node of graph.nodes) {
    const outgoing = graph.edges.filter(edge => edge.source === node.id);
    if ((isWorkflowGatewaySplit(node) || node.type === NodeType.ROUTE) && !outgoing.length) {
      reject(`网关“${node.title || node.id}”没有有效出口`, node.id);
    }
    if (outgoing.filter(workflowEdgeIsDefault).length > 1) reject('同一网关只能配置一个默认出口', node.id);
    if (outgoing.length > 1 && !isWorkflowGatewaySplit(node) && node.type !== NodeType.ROUTE && !outgoing.some(workflowEdgeIsDefault)) {
      reject('排他路由必须配置一个默认出口', node.id);
    }
    if (node.type === NodeType.GATEWAY && outgoing.length < 2 && (!isWorkflowGatewayJoin(graph, node.id)
      || outgoing.length !== 1 || String(outgoing[0].condition ?? '').trim())) reject('独立汇聚节点必须与分流配对并具有一个无条件后继', node.id);
    if (!isWorkflowGatewaySplit(node)) continue;
    const joinKey = getWorkflowGatewayJoinKey(graph, node);
    const joinNode = joinKey ? nodes.get(joinKey) : undefined;
    if (!joinKey || !joinNode || joinKey === node.id || joinNode.type === NodeType.START) {
      reject(`网关“${node.title || node.id}”必须配置有效的配对汇聚节点`, node.id);
      continue;
    }
    if (joins.has(joinKey)) reject('不同网关不能共用配对汇聚节点', node.id, joinKey);
    joins.add(joinKey);
    if (node.type === NodeType.PARALLEL && outgoing.some(edge => workflowEdgeIsDefault(edge) && edge.target !== joinKey)) {
      reject('并行网关的汇聚关联必须指向配对节点', node.id);
    }
    const branches = getWorkflowGatewayBranches(graph, node);
    if (!branches.length) reject('网关至少需要一个实际分支', node.id);
    const allBranches = new Set<string>();
    for (const branch of branches) {
      const region = collectWorkflowGatewayBranch(graph, branch.target, joinKey);
      for (const member of region) {
        const current = nodes.get(member);
        if (!current || member === node.id || [NodeType.START, NodeType.END].includes(current.type as NodeType)) {
          reject('分支越过配对汇聚节点或返回尚未结束的分流', node.id, member);
          continue;
        }
        if (allBranches.has(member)) reject('分支在配对汇聚节点前相交', node.id, member);
        allBranches.add(member);
        if (!graph.edges.some(edge => edge.source === member)) reject('分支未连接到配对汇聚节点', node.id, member);
        if (graph.edges.some(edge => edge.target === member && !region.has(edge.source) && edge.source !== node.id)) {
          reject('连线跨入其他网关分支', node.id, member);
        }
      }
      const reachesJoin = new Set<string>();
      const pending = [joinKey];
      while (pending.length) {
        const current = pending.pop()!;
        if (reachesJoin.has(current)) continue;
        reachesJoin.add(current);
        graph.edges.filter(edge => edge.target === current && region.has(edge.source)).forEach(edge => pending.push(edge.source));
      }
      if ([...region].some(member => !reachesJoin.has(member))) reject('分支存在无法到达汇聚节点的循环', node.id);
    }
    if (graph.edges.some(edge => edge.target === joinKey && !allBranches.has(edge.source) && edge.source !== node.id)) {
      reject('连线绕过分流直接进入汇聚节点', node.id, joinKey);
    }
  }
  return { errors: [...new Set(errors)], errorNodes: [...errorNodes] };
};
