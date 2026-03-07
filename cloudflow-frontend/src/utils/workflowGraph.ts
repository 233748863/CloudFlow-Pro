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

const hasNodeCondition = (node?: WorkflowGraphNode): boolean => {
  const candidate = node?.condition;
  return typeof candidate === 'string' && !!candidate.trim();
};

const isBranchEdge = (
  edge: WorkflowGraphEdge,
  nodeMap: Map<string, WorkflowGraphNode>,
): boolean => {
  if (isDefaultEdge(edge)) {
    return false;
  }

  const targetNode = nodeMap.get(edge.target);
  return (
    String(targetNode?.type || '').toUpperCase() === NodeType.CONDITION ||
    !!extractEdgeCondition(edge) ||
    hasNodeCondition(targetNode)
  );
};

// 默认边优先代表主干，只有单条且非条件边时才回退为主干
const resolveGraphMainEdge = (
  graph: WorkflowGraphDefinition,
  sourceId: string,
  nodeMap: Map<string, WorkflowGraphNode>,
): WorkflowGraphEdge | undefined => {
  const outgoingEdges = graph.edges.filter((edge) => edge.source === sourceId);
  const defaultEdge = outgoingEdges.find((edge) => isDefaultEdge(edge));
  if (defaultEdge) {
    return defaultEdge;
  }

  if (outgoingEdges.length !== 1) {
    return undefined;
  }

  const [singleEdge] = outgoingEdges;
  return isBranchEdge(singleEdge, nodeMap) ? undefined : singleEdge;
};

// 截断后续子图时，要一次性回收被丢弃的整条主干子树
const collectGraphSubtreeIds = (
  graph: WorkflowGraphDefinition,
  startIds: string[],
): Set<string> => {
  const idsToRemove = new Set<string>();
  const stack = [...startIds];

  while (stack.length > 0) {
    const currentId = stack.pop();
    if (!currentId || idsToRemove.has(currentId)) {
      continue;
    }

    idsToRemove.add(currentId);
    graph.edges
      .filter((edge) => edge.source === currentId)
      .forEach((edge) => stack.push(edge.target));
  }

  return idsToRemove;
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
      const singleEdge = nextEdges[0];
      const next = buildFromEdge(singleEdge);
      const targetNode = nodeMap.get(singleEdge.target);
      const shouldTreatAsBranch =
        !isDefaultEdge(singleEdge) &&
        (
          String(targetNode?.type || "").toUpperCase() === NodeType.CONDITION ||
          !!extractEdgeCondition(singleEdge)
        );
      if (next) {
        if (shouldTreatAsBranch) {
          node.branches = [next];
        } else {
          node.next = next;
        }
      }
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

/**
 * 按 ID 查找图模型节点。
 */
export const findWorkflowGraphNode = (
  graph: WorkflowGraphDefinition,
  nodeId: string,
): WorkflowGraphNode | null => {
  return graph.nodes.find((node) => node.id === nodeId) || null;
};

/**
 * 查找节点的唯一入边父节点 ID，无父节点时返回 null。
 */
export const findWorkflowGraphParentNodeId = (
  graph: WorkflowGraphDefinition,
  nodeId: string,
): string | null => {
  return graph.edges.find((edge) => edge.target === nodeId)?.source || null;
};

/**
 * 返回指定节点的条件分支根节点 ID 列表。
 */
export const getWorkflowGraphBranchChildIds = (
  graph: WorkflowGraphDefinition,
  nodeId: string,
): string[] => {
  const nodeMap = new Map(graph.nodes.map((node) => [node.id, node] as const));
  return graph.edges
    .filter((edge) => edge.source === nodeId && isBranchEdge(edge, nodeMap))
    .map((edge) => edge.target);
};

/**
 * 判断节点是否是条件分支的根节点。
 */
export const isWorkflowGraphBranchRoot = (
  graph: WorkflowGraphDefinition,
  nodeId: string,
): boolean => {
  const incomingEdge = graph.edges.find((edge) => edge.target === nodeId);
  if (!incomingEdge) {
    return false;
  }
  const nodeMap = new Map(graph.nodes.map((node) => [node.id, node] as const));
  return isBranchEdge(incomingEdge, nodeMap);
};

/**
 * 判断节点是否位于任意分支作用域内。
 */
export const isWorkflowGraphNodeInsideBranchScope = (
  graph: WorkflowGraphDefinition,
  nodeId: string,
): boolean | null => {
  if (!graph.nodes.some((node) => node.id === nodeId)) {
    return null;
  }
  const nodeMap = new Map(graph.nodes.map((node) => [node.id, node] as const));
  let currentId: string | null = nodeId;
  while (currentId) {
    const incomingEdge = graph.edges.find((edge) => edge.target === currentId);
    if (!incomingEdge) {
      return false;
    }
    if (isBranchEdge(incomingEdge, nodeMap)) {
      return true;
    }
    currentId = incomingEdge.source;
  }
  return false;
};

/**
 * 判断 targetId 是否落在 ancestorId 的分支子树内。
 */
export const isWorkflowGraphNodeInBranchSubtree = (
  graph: WorkflowGraphDefinition,
  ancestorId: string,
  targetId: string,
): boolean => {
  const branchChildIds = getWorkflowGraphBranchChildIds(graph, ancestorId);
  if (branchChildIds.length === 0) {
    return false;
  }
  return collectGraphSubtreeIds(graph, branchChildIds).has(targetId);
};

/**
 * 返回指定节点的主干后继 ID，若不存在则返回 null。
 */
export const findWorkflowGraphMainTargetId = (
  graph: WorkflowGraphDefinition,
  nodeId: string,
): string | null => {
  const nodeMap = new Map(graph.nodes.map((node) => [node.id, node] as const));
  return resolveGraphMainEdge(graph, nodeId, nodeMap)?.target || null;
};

/**
 * 统计指定节点直接挂载的条件分支数量。
 */
export const countWorkflowGraphBranches = (
  graph: WorkflowGraphDefinition,
  nodeId: string,
): number => {
  return getWorkflowGraphBranchChildIds(graph, nodeId).length;
};
/**
 * 在指定节点后插入一段新的子图，并保留原有主干后继。
 */
const resolveWorkflowGraphNodeIdPrefix = (node: WorkflowGraphNode): string => {
  if (node.id?.startsWith('branch')) {
    return 'branch';
  }

  const nodeType = String(node.type || '').toUpperCase();
  if (nodeType === NodeType.START) {
    return 'start';
  }
  if (nodeType === NodeType.END) {
    return 'end';
  }
  return 'node';
};

/**
 * 复制指定节点本身及其分支子图，默认不携带主干后续。
 */
export const cloneWorkflowGraphSubgraph = (
  graph: WorkflowGraphDefinition,
  nodeId: string,
  createNodeId: (prefix?: string) => string,
  options?: { includeMainPath?: boolean; titleSuffix?: string },
): { subgraph: WorkflowGraphDefinition; rootId: string } | null => {
  if (!graph.nodes.some((node) => node.id === nodeId)) {
    return null;
  }

  const nodeMap = new Map(graph.nodes.map((node) => [node.id, node] as const));
  const mainEdge = resolveGraphMainEdge(graph, nodeId, nodeMap);
  const idsToClone = new Set<string>([nodeId]);

  collectGraphSubtreeIds(graph, getWorkflowGraphBranchChildIds(graph, nodeId)).forEach((id) => {
    idsToClone.add(id);
  });

  if (options?.includeMainPath && mainEdge?.target) {
    collectGraphSubtreeIds(graph, [mainEdge.target]).forEach((id) => {
      idsToClone.add(id);
    });
  }

  const idMap = new Map<string, string>();
  const nodes = graph.nodes
    .filter((node) => idsToClone.has(node.id))
    .map((node) => {
      const clonedId = createNodeId(resolveWorkflowGraphNodeIdPrefix(node));
      idMap.set(node.id, clonedId);

      const clonedNode: WorkflowGraphNode = {
        ...node,
        id: clonedId,
      };

      if (node.id === nodeId && options?.titleSuffix) {
        const baseTitle = typeof node.title === 'string' ? node.title : '';
        clonedNode.title = `${baseTitle}${options.titleSuffix}`;
      }

      return clonedNode;
    });

  const edges = graph.edges.reduce((result: WorkflowGraphEdge[], edge) => {
    if (!idsToClone.has(edge.source) || !idsToClone.has(edge.target)) {
      return result;
    }

    const clonedSource = idMap.get(edge.source);
    const clonedTarget = idMap.get(edge.target);
    if (!clonedSource || !clonedTarget) {
      return result;
    }

    result.push({
      ...edge,
      id: `${clonedSource}->${clonedTarget}`,
      source: clonedSource,
      target: clonedTarget,
    });
    return result;
  }, []);

  const rootId = idMap.get(nodeId);
  if (!rootId) {
    return null;
  }

  return {
    subgraph: { nodes, edges },
    rootId,
  };
};

export const insertWorkflowGraphSubgraphAfter = (
  graph: WorkflowGraphDefinition,
  parentId: string,
  subgraph: WorkflowGraphDefinition,
  rootId: string,
): WorkflowGraphDefinition => {
  if (!graph.nodes.some((node) => node.id === parentId)) {
    return graph;
  }
  if (!subgraph.nodes.some((node) => node.id === rootId)) {
    return graph;
  }

  const existingIds = new Set(graph.nodes.map((node) => node.id));
  if (subgraph.nodes.some((node) => existingIds.has(node.id))) {
    return graph;
  }

  const nodeMap = new Map(graph.nodes.map((node) => [node.id, node] as const));
  const mainEdge = resolveGraphMainEdge(graph, parentId, nodeMap);
  const otherOutgoingEdges = graph.edges.filter(
    (edge) => edge.source === parentId && edge !== mainEdge,
  );
  const shouldMarkDefault =
    otherOutgoingEdges.length > 0 || (!!mainEdge && isDefaultEdge(mainEdge));

  const edges = graph.edges.filter((edge) => edge !== mainEdge);
  edges.push(...subgraph.edges);
  edges.push({
    id: `${parentId}->${rootId}`,
    source: parentId,
    target: rootId,
    isDefault: shouldMarkDefault || undefined,
  });

  if (mainEdge) {
    edges.push({
      id: `${rootId}->${mainEdge.target}`,
      source: rootId,
      target: mainEdge.target,
    });
  }

  return {
    nodes: [...graph.nodes, ...subgraph.nodes],
    edges,
  };
};

/**
 * 在指定节点后插入新的主干节点，并保留原有主干后继。
 */
export const insertWorkflowGraphNodeAfter = (
  graph: WorkflowGraphDefinition,
  parentId: string,
  newNode: WorkflowGraphNode,
): WorkflowGraphDefinition => {
  return insertWorkflowGraphSubgraphAfter(
    graph,
    parentId,
    { nodes: [newNode], edges: [] },
    newNode.id,
  );
};
/**
 * 用新的主干节点替换当前后继，并删除被截断的旧后续子图。
 */
export const replaceWorkflowGraphNextNode = (
  graph: WorkflowGraphDefinition,
  parentId: string,
  newNode: WorkflowGraphNode,
): WorkflowGraphDefinition => {
  if (
    !graph.nodes.some((node) => node.id === parentId) ||
    graph.nodes.some((node) => node.id === newNode.id)
  ) {
    return graph;
  }

  const nodeMap = new Map(graph.nodes.map((node) => [node.id, node] as const));
  const mainEdge = resolveGraphMainEdge(graph, parentId, nodeMap);
  const idsToRemove = mainEdge
    ? collectGraphSubtreeIds(graph, [mainEdge.target])
    : new Set<string>();

  const edges = graph.edges.filter(
    (edge) => !idsToRemove.has(edge.source) && !idsToRemove.has(edge.target),
  );
  const hasRemainingBranches = edges.some((edge) => edge.source === parentId);
  edges.push({
    id: `${parentId}->${newNode.id}`,
    source: parentId,
    target: newNode.id,
    isDefault: hasRemainingBranches || undefined,
  });

  return {
    nodes: [...graph.nodes.filter((node) => !idsToRemove.has(node.id)), newNode],
    edges,
  };
};

/**
 * 移动普通节点到新的主干位置，保留节点自身分支，但不携带原主干后续。
 */
export const moveWorkflowGraphNode = (
  graph: WorkflowGraphDefinition,
  nodeId: string,
  targetParentId: string,
): WorkflowGraphDefinition => {
  if (nodeId === targetParentId) {
    return graph;
  }
  if (
    !graph.nodes.some((node) => node.id === nodeId) ||
    !graph.nodes.some((node) => node.id === targetParentId)
  ) {
    return graph;
  }

  const nodeMap = new Map(graph.nodes.map((node) => [node.id, node] as const));
  const sourceMainEdge = resolveGraphMainEdge(graph, nodeId, nodeMap);
  const branchTargets = graph.edges
    .filter((edge) => edge.source === nodeId && edge !== sourceMainEdge)
    .map((edge) => edge.target);
  const movedBranchIds = collectGraphSubtreeIds(graph, branchTargets);
  const movedIds = new Set<string>([nodeId, ...movedBranchIds]);
  const incomingEdges = graph.edges.filter(
    (edge) => edge.target === nodeId && !movedIds.has(edge.source),
  );

  const buildEdgeKey = (edge: WorkflowGraphEdge) =>
    `${edge.source}->${edge.target}|${extractEdgeCondition(edge) || ''}|${isDefaultEdge(edge) ? '1' : '0'}`;

  let edges = graph.edges.filter((edge) => {
    if (incomingEdges.includes(edge)) {
      return false;
    }
    if (sourceMainEdge && edge === sourceMainEdge) {
      return false;
    }
    return true;
  });

  if (sourceMainEdge) {
    const existingEdgeKeys = new Set(edges.map((edge) => buildEdgeKey(edge)));
    incomingEdges.forEach((edge) => {
      const rewiredEdge: WorkflowGraphEdge = {
        ...edge,
        id: `${edge.source}->${sourceMainEdge.target}` ,
        target: sourceMainEdge.target,
      };
      const rewiredKey = buildEdgeKey(rewiredEdge);
      if (existingEdgeKeys.has(rewiredKey)) {
        return;
      }
      existingEdgeKeys.add(rewiredKey);
      edges.push(rewiredEdge);
    });
  }

  const detachedGraph: WorkflowGraphDefinition = {
    nodes: [...graph.nodes],
    edges,
  };
  const targetMainEdge = resolveGraphMainEdge(detachedGraph, targetParentId, nodeMap);
  const targetOtherOutgoingEdges = edges.filter(
    (edge) => edge.source === targetParentId && edge !== targetMainEdge,
  );
  const shouldMarkDefault =
    targetOtherOutgoingEdges.length > 0 ||
    (!!targetMainEdge && isDefaultEdge(targetMainEdge));

  edges = edges.filter((edge) => edge !== targetMainEdge);
  edges.push({
    id: `${targetParentId}->${nodeId}`,
    source: targetParentId,
    target: nodeId,
    isDefault: shouldMarkDefault || undefined,
  });

  if (targetMainEdge) {
    edges.push({
      id: `${nodeId}->${targetMainEdge.target}`,
      source: nodeId,
      target: targetMainEdge.target,
    });
  }

  return {
    nodes: [...graph.nodes],
    edges,
  };
};
/**
 * 删除普通节点并保留主干后继，避免节点删除再次回退到树模型编辑。
 */
export const removeWorkflowGraphNode = (
  graph: WorkflowGraphDefinition,
  nodeId: string,
): WorkflowGraphDefinition => {
  if (!graph.nodes.some((node) => node.id === nodeId)) {
    return graph;
  }

  const nodeMap = new Map(graph.nodes.map((node) => [node.id, node] as const));
  const incomingEdges = graph.edges.filter((edge) => edge.target === nodeId);
  const outgoingEdges = graph.edges.filter((edge) => edge.source === nodeId);

  const keepEdge = (() => {
    const defaultEdge = outgoingEdges.find((edge) => isDefaultEdge(edge));
    if (defaultEdge) {
      return defaultEdge;
    }

    if (outgoingEdges.length !== 1) {
      return undefined;
    }

    const [singleEdge] = outgoingEdges;
    const singleTarget = nodeMap.get(singleEdge.target);
    if (!singleTarget) {
      return undefined;
    }

    const singleTargetType = String(singleTarget.type || '').toUpperCase();
    const targetCondition =
      typeof singleTarget.condition === 'string' ? singleTarget.condition.trim() : '';
    if (
      singleTargetType === NodeType.CONDITION ||
      !!extractEdgeCondition(singleEdge) ||
      !!targetCondition
    ) {
      return undefined;
    }

    return singleEdge;
  })();

  const keepTargetId = keepEdge?.target;
  const idsToRemove = new Set<string>([nodeId]);
  const stack = outgoingEdges
    .filter((edge) => edge.target !== keepTargetId)
    .map((edge) => edge.target);

  while (stack.length > 0) {
    const currentId = stack.pop();
    if (!currentId || idsToRemove.has(currentId)) {
      continue;
    }

    idsToRemove.add(currentId);
    graph.edges
      .filter((edge) => edge.source === currentId)
      .forEach((edge) => {
        if (edge.target !== keepTargetId) {
          stack.push(edge.target);
        }
      });
  }

  let edges = graph.edges.filter(
    (edge) => !idsToRemove.has(edge.source) && !idsToRemove.has(edge.target),
  );

  if (keepTargetId) {
    const buildEdgeKey = (edge: WorkflowGraphEdge) =>
      `${edge.source}->${edge.target}|${extractEdgeCondition(edge) || ''}|${isDefaultEdge(edge) ? '1' : '0'}`;
    const existingEdgeKeys = new Set(edges.map((edge) => buildEdgeKey(edge)));

    incomingEdges
      .filter((edge) => !idsToRemove.has(edge.source))
      .forEach((edge) => {
        const rewiredEdge: WorkflowGraphEdge = {
          ...edge,
          id: `${edge.source}->${keepTargetId}`,
          target: keepTargetId,
        };
        const rewiredKey = buildEdgeKey(rewiredEdge);
        if (existingEdgeKeys.has(rewiredKey)) {
          return;
        }
        existingEdgeKeys.add(rewiredKey);
        edges.push(rewiredEdge);
      });
  }

  const nodes = graph.nodes.filter((node) => !idsToRemove.has(node.id));
  return { nodes, edges };
};

/**
 * 删除指定条件分支的整棵子图，并在最后一个分支被移除时回收父节点分支配置。
 */
export const removeWorkflowGraphBranch = (
  graph: WorkflowGraphDefinition,
  parentId: string,
  branchId: string,
): WorkflowGraphDefinition => {
  const parentNode = graph.nodes.find((node) => node.id === parentId);
  if (!parentNode) {
    return graph;
  }

  const idsToRemove = new Set<string>();
  const stack = [branchId];
  while (stack.length > 0) {
    const currentId = stack.pop();
    if (!currentId || idsToRemove.has(currentId)) {
      continue;
    }
    idsToRemove.add(currentId);
    graph.edges
      .filter((edge) => edge.source === currentId)
      .forEach((edge) => stack.push(edge.target));
  }

  let edges = graph.edges.filter(
    (edge) => !idsToRemove.has(edge.source) && !idsToRemove.has(edge.target),
  );
  const remainingOutgoing = edges.filter((edge) => edge.source === parentId);
  const hasRemainingBranches = remainingOutgoing.some((edge) => !isDefaultEdge(edge));

  if (!hasRemainingBranches) {
    edges = edges.map((edge) => {
      if (edge.source !== parentId || !isDefaultEdge(edge)) {
        return edge;
      }
      const { isDefault, ...rest } = edge;
      return rest;
    });
  }

  const nodes = graph.nodes
    .filter((node) => !idsToRemove.has(node.id))
    .map((node) => {
      if (node.id !== parentId || hasRemainingBranches) {
        return node;
      }
      const { branchStrategy, ...rest } = node;
      return rest;
    });

  return { nodes, edges };
};
