import {
  NodeType,
  WorkflowGraphDefinition,
  WorkflowGraphEdge,
  WorkflowGraphNode,
} from '../types';
import { WorkflowTreeNode } from '../types/workflowEditor';

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
export const convertGraphToWorkflowTree = (graph: WorkflowGraphDefinition): WorkflowTreeNode => {
  if (!Array.isArray(graph.nodes) || graph.nodes.length === 0) {
    throw new Error('流程图节点不能为空');
  }

  const nodeMap = new Map<string, WorkflowGraphNode>();
  graph.nodes.forEach((node) => {
    if (!node?.id) {
      throw new Error('流程图存在缺少 id 的节点');
    }
    if (nodeMap.has(node.id)) {
      throw new Error(`流程图存在重复节点ID: ${node.id}`);
    }
    nodeMap.set(node.id, node);
  });

  const outgoing = new Map<string, WorkflowGraphEdge[]>();
  const incomingCount = new Map<string, number>();
  nodeMap.forEach((_, id) => incomingCount.set(id, 0));

  (Array.isArray(graph.edges) ? graph.edges : []).forEach((edge) => {
    const source = edge?.source;
    const target = edge?.target;
    if (!source || !target) {
      throw new Error('流程图存在 source/target 缺失的连线');
    }
    if (!nodeMap.has(source) || !nodeMap.has(target)) {
      throw new Error(`流程图连线引用了不存在的节点: ${source} -> ${target}`);
    }

    const edges = outgoing.get(source) ?? [];
    edges.push(edge);
    outgoing.set(source, edges);
    incomingCount.set(target, (incomingCount.get(target) ?? 0) + 1);
  });

  const startNodes = Array.from(nodeMap.values()).filter(
    (node) => String(node.type || '').toUpperCase() === NodeType.START,
  );
  if (startNodes.length !== 1) {
    throw new Error('流程图必须且只能包含一个 START 节点');
  }
  const startNode = startNodes[0];

  incomingCount.forEach((count, nodeId) => {
    if (nodeId !== startNode.id && count > 1) {
      throw new Error(`暂不支持多入边汇聚节点，请先拆分节点: ${nodeId}`);
    }
  });

  const reachable = new Set<string>();
  const collectReachable = (nodeId: string, path: Set<string>) => {
    if (path.has(nodeId)) {
      throw new Error(`流程图存在循环，节点ID: ${nodeId}`);
    }
    if (reachable.has(nodeId)) {
      return;
    }
    reachable.add(nodeId);
    const nextPath = new Set(path);
    nextPath.add(nodeId);
    const nextEdges = outgoing.get(nodeId) ?? [];
    nextEdges.forEach((edge) => collectReachable(edge.target, nextPath));
  };
  collectReachable(startNode.id, new Set());
  if (reachable.size !== nodeMap.size) {
    throw new Error('流程图存在不可达节点，请删除孤立节点后重试');
  }

  const build = (nodeId: string, path: Set<string>): WorkflowTreeNode | undefined => {
    if (path.has(nodeId)) {
      throw new Error(`流程图存在循环，节点ID: ${nodeId}`);
    }
    const source = nodeMap.get(nodeId);
    if (!source) return undefined;

    const { id, type, title, ...rest } = source;
    const node: WorkflowTreeNode = {
      ...(rest as Omit<WorkflowTreeNode, 'id' | 'type' | 'title'>),
      id,
      type: ((type as NodeType) || NodeType.APPROVAL) as NodeType,
      title: String(title || '未命名节点'),
    };

    const nextPath = new Set(path);
    nextPath.add(nodeId);
    const nextEdges = outgoing.get(nodeId) ?? [];
    const buildFromEdge = (edge: WorkflowGraphEdge): WorkflowTreeNode | undefined => {
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
      const defaultEdges = nextEdges.filter((edge) => isDefaultEdge(edge));
      if (defaultEdges.length > 1) {
        throw new Error(`节点存在多条默认连线: ${node.id}`);
      }
      const defaultEdge = defaultEdges[0];
      const branchEdges = nextEdges.filter((edge) => edge !== defaultEdge);
      const branches = branchEdges
        .map((edge) => buildFromEdge(edge))
        .filter(Boolean) as WorkflowTreeNode[];
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

  const root = build(startNode.id, new Set());
  if (!root) {
    throw new Error('流程图解析失败，未生成可执行根节点');
  }
  return root;
};

/**
 * 保存时统一输出图结构，避免树模型回写到后端。
 */
export const convertWorkflowTreeToGraph = (root: WorkflowTreeNode): WorkflowGraphDefinition => {
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

  const walk = (node?: WorkflowTreeNode) => {
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

/**
 * 基于图模型直接更新节点字段，避免属性面板修改再绕回树模型。
 */
export const patchWorkflowGraphNode = (
  graph: WorkflowGraphDefinition,
  nodeId: string,
  patch: Partial<WorkflowGraphNode>,
): WorkflowGraphDefinition => {
  let updated = false;
  const nodes = graph.nodes.map((node) => {
    if (node.id !== nodeId) return node;
    updated = true;
    return { ...node, ...patch };
  });

  if (!updated) {
    return graph;
  }

  if (!Object.prototype.hasOwnProperty.call(patch, "condition")) {
    return { nodes, edges: [...graph.edges] };
  }

  const normalizedCondition =
    typeof patch.condition === "string" ? patch.condition.trim() : "";
  const edges = graph.edges.map((edge) => {
    if (edge.target !== nodeId || isDefaultEdge(edge)) {
      return edge;
    }
    return {
      ...edge,
      condition: normalizedCondition || undefined,
    };
  });

  return { nodes, edges };
};

/**
 * 在图模型中给指定父节点追加条件分支，并在首次分支化时保留默认主干。
 */
export const appendWorkflowGraphBranch = (
  graph: WorkflowGraphDefinition,
  parentId: string,
  branchNode: WorkflowGraphNode,
  defaultStrategy: string,
): WorkflowGraphDefinition => {
  const parentNode = graph.nodes.find((node) => node.id === parentId);
  if (!parentNode) {
    return graph;
  }

  const outgoingEdges = graph.edges.filter((edge) => edge.source === parentId);
  const edges = graph.edges.map((edge) => {
    if (edge.source !== parentId) {
      return edge;
    }
    if (outgoingEdges.length === 1 && !isDefaultEdge(edge)) {
      return { ...edge, isDefault: true };
    }
    return edge;
  });

  const normalizedCondition =
    typeof branchNode.condition === "string" ? branchNode.condition.trim() : "";
  const nodes = graph.nodes.map((node) => {
    if (node.id !== parentId) {
      return node;
    }
    const branchStrategy =
      typeof node.branchStrategy === "string" && node.branchStrategy.trim()
        ? node.branchStrategy
        : defaultStrategy;
    return { ...node, branchStrategy };
  });

  nodes.push(branchNode);
  edges.push({
    id: `${parentId}->${branchNode.id}`,
    source: parentId,
    target: branchNode.id,
    condition: normalizedCondition || undefined,
  });

  return { nodes, edges };
};
