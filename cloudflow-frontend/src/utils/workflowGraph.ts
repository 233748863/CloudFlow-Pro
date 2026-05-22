import {
  NodeType,
  WorkflowGraphDefinition,
  WorkflowGraphEdge,
  WorkflowGraphNode,
} from '../types';

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

const isEndNode = (node?: WorkflowGraphNode): boolean =>
  String(node?.type || '').toUpperCase() === NodeType.END;

const PARALLEL_SIGN_MODES = new Set(['ALL', 'ANY', 'PERCENT', 'SEQUENTIAL']);

// PARALLEL 处于会签模式（signType ∈ ALL/ANY/PERCENT/SEQUENTIAL）时不视为分支决策节点
const isParallelInSignMode = (node?: WorkflowGraphNode): boolean => {
  if (!node) return false;
  if (String(node.type || '').toUpperCase() !== NodeType.PARALLEL) return false;
  const signType = typeof node.signType === 'string' ? node.signType.trim().toUpperCase() : '';
  return PARALLEL_SIGN_MODES.has(signType);
};

/**
 * 判断节点是否是「多分支决策节点」（真正的路由角色）：
 * - 决策类型节点：CONDITION / GATEWAY / PARALLEL 非会签模式
 *   且未被"上游为真路由"的标签模式吸收
 *
 * 这类节点的出边均视为分支边（含 default 边作为默认分支），无"主干后继"概念，
 * 禁止 insertSubgraphAfter 在其后断边重连。
 *
 * 普通业务节点（APPROVAL/CC/...）即使 outgoing ≥ 2（如挂载了条件分支），
 * 仍保留 default 边作为主干，非默认边作为条件分支。
 *
 * 例外：CONDITION/GATEWAY 单出边且上游已是多出边路由——视为"分支标签节点"
 *      （历史模板常见模式：APPROVAL+EXCLUSIVE 路由 → CONDITION 标签 → 业务节点），
 *      此时保持 handleAddNext 的"分支内追加顺序节点"语义。
 */
export const isMultiBranchDecisionNode = (
  node: WorkflowGraphNode | null | undefined,
  graph: WorkflowGraphDefinition,
): boolean => {
  if (!node) return false;
  const type = String(node.type || '').toUpperCase();
  const isDecisionType =
    type === NodeType.CONDITION ||
    type === 'GATEWAY' ||
    (type === NodeType.PARALLEL && !isParallelInSignMode(node));
  if (!isDecisionType) return false;

  // CONDITION/GATEWAY 单出边场景：若上游为真路由，则本节点为分支标签而非独立路由
  if (type === NodeType.CONDITION || type === 'GATEWAY') {
    const outgoingCount = graph.edges.reduce(
      (count, edge) => (edge.source === node.id ? count + 1 : count),
      0,
    );
    if (outgoingCount < 2) {
      const incomingEdges = graph.edges.filter((edge) => edge.target === node.id);
      if (incomingEdges.length === 1) {
        const upstreamId = incomingEdges[0].source;
        const upstreamOutCount = graph.edges.reduce(
          (count, edge) => (edge.source === upstreamId ? count + 1 : count),
          0,
        );
        if (upstreamOutCount >= 2) return false; // 标签节点
      }
    }
  }
  return true;
};

const isBranchEdge = (
  edge: WorkflowGraphEdge,
  nodeMap: Map<string, WorkflowGraphNode>,
  graph?: WorkflowGraphDefinition,
): boolean => {
  if (isDefaultEdge(edge)) {
    return false;
  }

  // 源节点是多分支决策节点时，其任何非默认出边强制视为分支边，避免旧数据缺 condition 字段导致漏判
  const sourceNode = nodeMap.get(edge.source);
  if (graph && isMultiBranchDecisionNode(sourceNode, graph)) {
    return true;
  }

  const targetNode = nodeMap.get(edge.target);
  return !!extractEdgeCondition(edge) || hasNodeCondition(targetNode);
};

// 默认边优先代表主干，只有单条且非条件边时才回退为主干；多分支决策节点无主干
const resolveGraphMainEdge = (
  graph: WorkflowGraphDefinition,
  sourceId: string,
  nodeMap: Map<string, WorkflowGraphNode>,
): WorkflowGraphEdge | undefined => {
  const sourceNode = nodeMap.get(sourceId);
  if (isMultiBranchDecisionNode(sourceNode, graph)) {
    return undefined;
  }

  const outgoingEdges = graph.edges.filter((edge) => edge.source === sourceId);
  const defaultEdge = outgoingEdges.find((edge) => isDefaultEdge(edge));
  if (defaultEdge) {
    return defaultEdge;
  }

  if (outgoingEdges.length !== 1) {
    return undefined;
  }

  const [singleEdge] = outgoingEdges;
  return isBranchEdge(singleEdge, nodeMap, graph) ? undefined : singleEdge;
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

const collectRemovableSubtreeIds = (
  graph: WorkflowGraphDefinition,
  startIds: string[],
): Set<string> => {
  const idsToRemove = collectGraphSubtreeIds(graph, startIds);
  let changed = true;

  while (changed) {
    changed = false;
    idsToRemove.forEach((nodeId) => {
      const hasExternalIncoming = graph.edges.some(
        (edge) => edge.target === nodeId && !idsToRemove.has(edge.source),
      );
      if (hasExternalIncoming) {
        idsToRemove.delete(nodeId);
        changed = true;
      }
    });
  }

  return idsToRemove;
};

const resolveLinearEndNodeId = (
  graph: WorkflowGraphDefinition,
  startId: string,
): string | null => {
  const nodeMap = new Map(graph.nodes.map((node) => [node.id, node] as const));
  const visited = new Set<string>();
  let currentId: string | null = startId;

  while (currentId) {
    if (visited.has(currentId)) {
      return null;
    }
    visited.add(currentId);

    const currentNode = nodeMap.get(currentId);
    if (!currentNode) {
      return null;
    }
    if (isEndNode(currentNode)) {
      return currentId;
    }

    const outgoingEdges = graph.edges.filter((edge) => edge.source === currentId);
    if (outgoingEdges.length !== 1) {
      return null;
    }
    currentId = outgoingEdges[0].target;
  }

  return null;
};

/**
 * 纯图模型结构校验，供设计器在切换状态前快速兜底。
 */
export const assertWorkflowGraphIntegrity = (
  graph: WorkflowGraphDefinition,
): void => {
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
    if (nodeId === startNode.id || count <= 1) {
      return;
    }
    const node = nodeMap.get(nodeId);
    if (!isEndNode(node)) {
      throw new Error(`暂不支持多入边汇聚节点，请先拆分节点: ${nodeId}`);
    }
  });

  outgoing.forEach((edges, nodeId) => {
    const defaultEdges = edges.filter((edge) => isDefaultEdge(edge));
    if (defaultEdges.length > 1) {
      throw new Error(`节点存在多条默认连线: ${nodeId}`);
    }
    if (isEndNode(nodeMap.get(nodeId)) && edges.length > 0) {
      throw new Error(`结束节点不能配置后继连线: ${nodeId}`);
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

};

/**
 * 按节点 ID 局部更新流程图节点，保持其余结构不变。
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

export const getWorkflowGraphIncomingEdges = (
  graph: WorkflowGraphDefinition,
  nodeId: string,
): WorkflowGraphEdge[] => {
  return graph.edges.filter((edge) => edge.target === nodeId);
};

export const isWorkflowGraphSharedEndNode = (
  graph: WorkflowGraphDefinition,
  nodeId: string,
): boolean => {
  const node = findWorkflowGraphNode(graph, nodeId);
  return isEndNode(node) && getWorkflowGraphIncomingEdges(graph, nodeId).length > 1;
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
    .filter((edge) => edge.source === nodeId && isBranchEdge(edge, nodeMap, graph))
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
  return isBranchEdge(incomingEdge, nodeMap, graph);
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
    if (isBranchEdge(incomingEdge, nodeMap, graph)) {
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

export const findWorkflowGraphBranchSharedEndId = (
  graph: WorkflowGraphDefinition,
  nodeId: string,
): string | null => {
  const branchChildIds = getWorkflowGraphBranchChildIds(graph, nodeId);
  if (branchChildIds.length < 2) {
    return null;
  }

  const endIds = branchChildIds.map((branchId) => resolveLinearEndNodeId(graph, branchId));
  const [firstEndId] = endIds;
  if (!firstEndId || endIds.some((endId) => endId !== firstEndId)) {
    return null;
  }

  return isWorkflowGraphSharedEndNode(graph, firstEndId) ? firstEndId : null;
};
/**
 * 在指定节点后插入一段新的子图，并保留原有主干后继。
 */
/**
 * 提取指定节点为根的完整子图，不携带外部入边。
 */
export const extractWorkflowGraphSubgraph = (
  graph: WorkflowGraphDefinition,
  nodeId: string,
): WorkflowGraphDefinition | null => {
  if (!graph.nodes.some((node) => node.id === nodeId)) {
    return null;
  }

  const includedIds = collectGraphSubtreeIds(graph, [nodeId]);
  return {
    nodes: graph.nodes.filter((node) => includedIds.has(node.id)),
    edges: graph.edges.filter(
      (edge) => includedIds.has(edge.source) && includedIds.has(edge.target),
    ),
  };
};

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
  // mainEdge.target 是显式删除锚点：parentId 经 mainEdge 指向它属于预期外部入边，必须强制保留在集合内；
  // 仅当下游节点存在来自集合外的入边（汇聚节点如共享 END）时才从删除集中剥离。
  const idsToRemove = new Set<string>();
  if (mainEdge) {
    const anchorId = mainEdge.target;
    const subtree = collectGraphSubtreeIds(graph, [anchorId]);
    subtree.forEach((id) => idsToRemove.add(id));
    let changed = true;
    while (changed) {
      changed = false;
      idsToRemove.forEach((nodeId) => {
        if (nodeId === anchorId) {
          return;
        }
        const hasExternalIncoming = graph.edges.some(
          (edge) =>
            edge.target === nodeId &&
            edge !== mainEdge &&
            !idsToRemove.has(edge.source),
        );
        if (hasExternalIncoming) {
          idsToRemove.delete(nodeId);
          changed = true;
        }
      });
    }
  }

  const edges = graph.edges.filter(
    (edge) =>
      edge !== mainEdge &&
      !idsToRemove.has(edge.source) &&
      !idsToRemove.has(edge.target),
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
 * 删除普通节点并保留主干后继，保持图编辑主链连通。
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

    const targetCondition =
      typeof singleTarget.condition === 'string' ? singleTarget.condition.trim() : '';
    if (!!extractEdgeCondition(singleEdge) || !!targetCondition) {
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

  const removableIds = collectRemovableSubtreeIds(graph, [...idsToRemove]);
  removableIds.add(nodeId);
  const nodes = graph.nodes.filter((node) => !removableIds.has(node.id));
  let edges = graph.edges.filter(
    (edge) => !removableIds.has(edge.source) && !removableIds.has(edge.target),
  );

  if (keepTargetId && !removableIds.has(keepTargetId)) {
    const buildEdgeKey = (edge: WorkflowGraphEdge) =>
      `${edge.source}->${edge.target}|${extractEdgeCondition(edge) || ''}|${isDefaultEdge(edge) ? '1' : '0'}`;
    const existingEdgeKeys = new Set(edges.map((edge) => buildEdgeKey(edge)));

    incomingEdges
      .filter((edge) => !removableIds.has(edge.source))
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

  // branchId 是显式删除锚点：其入边来自 parentId 属于预期外部入边，必须强制保留在集合内；
  // END 节点是流程终点，永远不属于分支自身，分支删除时必须无条件保留（即使没有其他入边）；
  // 其余下游节点若存在来自集合外的入边（汇聚节点）则从删除集中剥离。
  const nodeMap = new Map(graph.nodes.map((node) => [node.id, node] as const));
  const idsToRemove = collectGraphSubtreeIds(graph, [branchId]);
  idsToRemove.forEach((nodeId) => {
    if (nodeId !== branchId && isEndNode(nodeMap.get(nodeId))) {
      idsToRemove.delete(nodeId);
    }
  });
  let changed = true;
  while (changed) {
    changed = false;
    idsToRemove.forEach((nodeId) => {
      if (nodeId === branchId) {
        return;
      }
      const hasExternalIncoming = graph.edges.some(
        (edge) => edge.target === nodeId && !idsToRemove.has(edge.source),
      );
      if (hasExternalIncoming) {
        idsToRemove.delete(nodeId);
        changed = true;
      }
    });
  }

  // 记录原分支根的下游 END 节点（删除最后一个分支后用于重连，避免 END 不可达）
  const removedBranchEndIds = new Set<string>();
  graph.edges.forEach((edge) => {
    if (!idsToRemove.has(edge.source)) {
      return;
    }
    const targetNode = nodeMap.get(edge.target);
    if (targetNode && isEndNode(targetNode)) {
      removedBranchEndIds.add(edge.target);
    }
  });

  let edges = graph.edges.filter(
    (edge) => !idsToRemove.has(edge.source) && !idsToRemove.has(edge.target),
  );

  // 父节点的多分支决策角色由出边数定义；删完分支后若出边数 <2，决策节点已无存在意义
  // 统一级联：删除父决策节点，并把它的入边重连到剩余出边目标或原分支汇聚的 END
  const upperParentType = String(parentNode.type || "").toUpperCase();
  const isParentDecisionType =
    upperParentType === NodeType.CONDITION ||
    upperParentType === "GATEWAY" ||
    (upperParentType === NodeType.PARALLEL && !isParallelInSignMode(parentNode));

  const remainingParentEdges = edges.filter((edge) => edge.source === parentId);

  let cascadeRemoveParent = false;
  let reconnectTargetId: string | null = null;

  if (remainingParentEdges.length >= 2) {
    // 仍为多分支：若删的是默认分支，提升首条剩余为默认，满足 R9
    const stillHasDefault = remainingParentEdges.some((edge) => isDefaultEdge(edge));
    if (!stillHasDefault) {
      const promoteId = remainingParentEdges[0].id;
      edges = edges.map((edge) =>
        edge.id === promoteId ? { ...edge, isDefault: true } : edge,
      );
    }
  } else if (isParentDecisionType) {
    // 父决策节点剩 0 或 1 条出边：级联删除父节点本身
    cascadeRemoveParent = true;
    if (remainingParentEdges.length === 1) {
      // 1 条出边：父节点入边直连该出边目标，吸收最后一条分支为线性后继
      reconnectTargetId = remainingParentEdges[0].target;
    } else if (removedBranchEndIds.size > 0) {
      // 0 条出边：重连到原分支汇聚的 END
      reconnectTargetId = Array.from(removedBranchEndIds)[0];
    }
  } else if (remainingParentEdges.length === 0 && removedBranchEndIds.size > 0) {
    // 非决策类型父节点失去所有出边：直接补回 parent->END
    edges.push({
      id: `${parentId}->${Array.from(removedBranchEndIds)[0]}`,
      source: parentId,
      target: Array.from(removedBranchEndIds)[0],
    });
  }

  if (cascadeRemoveParent && reconnectTargetId) {
    const parentIncoming = edges.filter((edge) => edge.target === parentId);
    const target = reconnectTargetId;
    edges = edges.filter(
      (edge) => edge.source !== parentId && edge.target !== parentId,
    );
    parentIncoming.forEach((edge) => {
      edges.push({
        ...edge,
        id: `${edge.source}->${target}`,
        target,
      });
    });
  }

  // 级联吸收的分支根节点：清掉 condition 字段，否则 isBranchEdge 因 hasNodeCondition 仍按分支边渲染
  const absorbedBranchRootId =
    cascadeRemoveParent && remainingParentEdges.length === 1 ? reconnectTargetId : null;

  const nodes = graph.nodes
    .filter((node) => {
      if (idsToRemove.has(node.id)) return false;
      if (cascadeRemoveParent && node.id === parentId) return false;
      return true;
    })
    .map((node) => {
      if (node.id === absorbedBranchRootId) {
        const { condition, ...rest } = node;
        return rest;
      }
      if (node.id !== parentId || remainingParentEdges.length >= 2) {
        return node;
      }
      const { branchStrategy, ...rest } = node;
      return rest;
    });

  return { nodes, edges };
};
