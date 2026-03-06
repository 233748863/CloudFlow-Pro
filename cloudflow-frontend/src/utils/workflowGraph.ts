import { NodeType, WorkflowNode } from '../types';

export interface WorkflowGraphNode {
  id: string;
  type: string;
  title?: string;
  [key: string]: unknown;
}

export interface WorkflowGraphEdge {
  id?: string;
  source: string;
  target: string;
  condition?: string;
  isDefault?: boolean;
  [key: string]: unknown;
}

export interface WorkflowGraphDefinition {
  nodes: WorkflowGraphNode[];
  edges: WorkflowGraphEdge[];
}

/**
 * 仅判定 nodes+edges 图结构，树结构不再视为合法模型。
 */
export const isWorkflowGraphDefinition = (value: unknown): value is WorkflowGraphDefinition => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return Array.isArray(candidate.nodes) && Array.isArray(candidate.edges);
};

/**
 * 统一解析图模型，支持对象与 JSON 字符串。
 */
export const parseWorkflowGraphDefinition = (raw: unknown): WorkflowGraphDefinition | null => {
  if (!raw) return null;

  if (typeof raw === 'object') {
    return isWorkflowGraphDefinition(raw) ? raw : null;
  }

  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      return isWorkflowGraphDefinition(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  return null;
};

export const createDefaultWorkflowGraph = (): WorkflowGraphDefinition => ({
  nodes: [
    { id: 'start', type: NodeType.START, title: '开始' },
    { id: 'end', type: NodeType.END, title: '流程结束' },
  ],
  edges: [{ id: 'start->end', source: 'start', target: 'end' }],
});

const defaultTreeNode = (): WorkflowNode => ({ type: NodeType.START, title: '开始', id: 'start' });

const isDefaultEdge = (edge: WorkflowGraphEdge): boolean => {
  const raw: unknown = edge.isDefault;
  if (typeof raw === 'boolean') return raw;
  if (typeof raw === 'number') return raw !== 0;
  if (typeof raw === 'string') {
    const normalized = raw.trim().toLowerCase();
    return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'y';
  }
  return false;
};

const extractEdgeCondition = (edge: WorkflowGraphEdge): string | undefined => {
  const candidate = edge.condition;
  if (typeof candidate !== 'string') return undefined;
  const trimmed = candidate.trim();
  return trimmed ? trimmed : undefined;
};

/**
 * 编辑器内部暂时保留树形结构，这里负责图 -> 树适配。
 */
export const convertGraphToWorkflowTree = (graph: WorkflowGraphDefinition): WorkflowNode => {
  if (!Array.isArray(graph.nodes) || graph.nodes.length === 0) {
    return defaultTreeNode();
  }

  const nodeMap = new Map<string, WorkflowGraphNode>();
  graph.nodes.forEach((node) => {
    if (node?.id) nodeMap.set(node.id, node);
  });

  if (nodeMap.size === 0) {
    return defaultTreeNode();
  }

  const outgoing = new Map<string, WorkflowGraphEdge[]>();
  const incoming = new Map<string, number>();
  nodeMap.forEach((_, id) => incoming.set(id, 0));

  (Array.isArray(graph.edges) ? graph.edges : []).forEach((edge) => {
    const source = edge?.source;
    const target = edge?.target;
    if (!source || !target) return;
    if (!nodeMap.has(source) || !nodeMap.has(target)) return;

    const edges = outgoing.get(source) ?? [];
    edges.push(edge);
    outgoing.set(source, edges);
    incoming.set(target, (incoming.get(target) ?? 0) + 1);
  });

  const startNode =
    Array.from(nodeMap.values()).find(
      (node) => String(node.type || '').toUpperCase() === NodeType.START,
    ) ??
    Array.from(nodeMap.values()).find((node) => (incoming.get(node.id) ?? 0) === 0) ??
    Array.from(nodeMap.values())[0];

  const build = (nodeId: string, path: Set<string>): WorkflowNode | undefined => {
    if (path.has(nodeId)) return undefined;
    const source = nodeMap.get(nodeId);
    if (!source) return undefined;

    const { id, type, title, ...rest } = source;
    const node: WorkflowNode = {
      ...(rest as Omit<WorkflowNode, 'id' | 'type' | 'title'>),
      id,
      type: ((type as NodeType) || NodeType.APPROVAL) as NodeType,
      title: String(title || '未命名节点'),
    };

    const nextPath = new Set(path);
    nextPath.add(nodeId);
    const nextEdges = outgoing.get(nodeId) ?? [];
    const buildFromEdge = (edge: WorkflowGraphEdge): WorkflowNode | undefined => {
      const child = build(edge.target, nextPath);
      const edgeCondition = extractEdgeCondition(edge);
      if (child && !child.condition && edgeCondition) {
        child.condition = edgeCondition;
      }
      return child;
    };

    if (nextEdges.length === 1) {
      const next = buildFromEdge(nextEdges[0]);
      if (next) node.next = next;
    } else if (nextEdges.length > 1) {
      const defaultEdge = nextEdges.find((edge) => isDefaultEdge(edge));
      const branchEdges = nextEdges.filter((edge) => edge !== defaultEdge);
      const branches = branchEdges
        .map((edge) => buildFromEdge(edge))
        .filter(Boolean) as WorkflowNode[];
      if (branches.length > 0) {
        node.branches = branches;
      }
      if (defaultEdge) {
        const next = buildFromEdge(defaultEdge);
        if (next) node.next = next;
      }
    }

    return node;
  };

  return build(startNode.id, new Set()) ?? defaultTreeNode();
};

/**
 * 保存时统一输出图结构，避免树模型回写到后端。
 */
export const convertWorkflowTreeToGraph = (root: WorkflowNode): WorkflowGraphDefinition => {
  const nodes: WorkflowGraphNode[] = [];
  const edges: WorkflowGraphEdge[] = [];
  const visited = new Set<string>();
  const edgeIds = new Set<string>();

  const appendEdge = (source: string, target: string, extra: Partial<WorkflowGraphEdge> = {}) => {
    const key = `${source}->${target}`;
    if (edgeIds.has(key)) return;
    edgeIds.add(key);
    edges.push({ id: key, source, target, ...extra });
  };

  const walk = (node?: WorkflowNode) => {
    if (!node || !node.id) return;

    if (!visited.has(node.id)) {
      const rawNode = node as unknown as Record<string, unknown>;
      const { next, branches, ...rest } = rawNode;
      nodes.push(rest as WorkflowGraphNode);
      visited.add(node.id);
    }

    if (node.next?.id) {
      const markDefault = Array.isArray(node.branches) && node.branches.length > 0;
      appendEdge(node.id, node.next.id, markDefault ? { isDefault: true } : {});
      walk(node.next);
    }

    if (Array.isArray(node.branches)) {
      node.branches.forEach((branch) => {
        if (!branch?.id) return;
        const branchCondition = typeof branch.condition === 'string' ? branch.condition.trim() : '';
        appendEdge(node.id, branch.id, branchCondition ? { condition: branchCondition } : {});
        walk(branch);
      });
    }
  };

  walk(root);

  if (nodes.length === 0) {
    return createDefaultWorkflowGraph();
  }

  return { nodes, edges };
};
