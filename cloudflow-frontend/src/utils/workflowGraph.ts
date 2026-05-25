import {
  NodeType,
  PARALLEL_SIGN_MODES,
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

// P2-7: PARALLEL_SIGN_MODES 已迁移到 types.ts 与后端 WfNode.signType 枚举对齐
const PARALLEL_SIGN_MODE_SET = new Set<string>(PARALLEL_SIGN_MODES);

// PARALLEL 处于会签模式（signType ∈ ALL/ANY/PERCENT/SEQUENTIAL）时不视为分支决策节点
const isParallelInSignMode = (node?: WorkflowGraphNode): boolean => {
  if (!node) return false;
  if (String(node.type || '').toUpperCase() !== NodeType.PARALLEL) return false;
  const signType = typeof node.signType === 'string' ? node.signType.trim().toUpperCase() : '';
  return PARALLEL_SIGN_MODE_SET.has(signType);
};

/**
 * P1-7: 统一的出边/入边查询 API。
 * 替代 12+ 处手写 graph.edges.filter(e => e.source === id) / e.target === id，
 * 消除命名分散与边界遗漏（孤儿边）风险。
 */
export const getWorkflowGraphOutgoingEdges = (
  graph: WorkflowGraphDefinition,
  nodeId: string,
): WorkflowGraphEdge[] => {
  return graph.edges.filter((edge) => edge.source === nodeId);
};

/**
 * P2-6: 生成不与现有 edges 列表冲突的 edge id。
 * 简单 `${source}->${target}` 在同一对 source/target 出现多条边时会重复；
 * 重复时回退为 `${source}->${target}__${seq}`（seq 从 2 起递增），保证 id 唯一。
 */
const generateUniqueEdgeId = (
  edges: WorkflowGraphEdge[],
  source: string,
  target: string,
): string => {
  const base = `${source}->${target}`;
  const existing = new Set(edges.map((edge) => edge.id).filter(Boolean) as string[]);
  if (!existing.has(base)) return base;
  let seq = 2;
  while (existing.has(`${base}__${seq}`)) seq++;
  return `${base}__${seq}`;
};

/**
 * P2-5: 维护"同一 source 至多一条 default 出边"的不变量。
 *  - 出边数 0/1：清掉冗余的 isDefault 字段（单条无需 default）；
 *  - 出边数 ≥2：若已有恰好 1 条 default 则保留；多条则只保留第一条；0 条则提升第一条。
 *
 * 适用场景：结构性变更（删除分支 / 追加分支 / 移动节点）后做收尾归一，
 * 避免重复在四个调用点散落手写"是否提升 default"的判断。
 */
const ensureExactlyOneDefault = (
  edges: WorkflowGraphEdge[],
  sourceId: string,
): WorkflowGraphEdge[] => {
  const outgoing = edges.filter((edge) => edge.source === sourceId);
  if (outgoing.length === 0) return edges;
  if (outgoing.length === 1) {
    // 单条出边无需 default 标记，清掉冗余字段，避免与他处"出边数 ≥2 才视为分支"的判定冲突
    return edges.map((edge) => {
      if (edge.source !== sourceId || !isDefaultEdge(edge)) return edge;
      const { isDefault: _isDefault, ...rest } = edge;
      return rest;
    });
  }
  const defaults = outgoing.filter((edge) => isDefaultEdge(edge));
  if (defaults.length === 1) return edges;

  if (defaults.length === 0) {
    const promote = outgoing[0];
    return edges.map((edge) => (edge === promote ? { ...edge, isDefault: true } : edge));
  }

  // 多条 default：只保留第一条
  const keep = defaults[0];
  return edges.map((edge) => {
    if (edge === keep) return edge;
    if (edge.source !== sourceId || !isDefaultEdge(edge)) return edge;
    const { isDefault: _isDefault, ...rest } = edge;
    return rest;
  });
};

/**
 * 判断节点是否是「多分支决策节点」（真正的路由角色）：
 * - 决策类型节点：CONDITION / GATEWAY / PARALLEL 非会签模式
 *   且出边数 ≥ 2（出边数 < 2 时降级为普通顺序节点，无"分支"语义）
 *
 * 这类节点的出边均视为分支边（含 default 边作为默认分支），无"主干后继"概念，
 * 禁止 insertSubgraphAfter 在其后断边重连。
 *
 * 普通业务节点（APPROVAL/CC/...）即使 outgoing ≥ 2（如挂载了条件分支），
 * 仍保留 default 边作为主干，非默认边作为条件分支。
 *
 * 单出边降级（CONDITION/GATEWAY 出边 < 2）同时覆盖"上游已是多出边路由 → 当前作为分支标签节点"
 * 的历史模板模式（APPROVAL+EXCLUSIVE 路由 → CONDITION 标签 → 业务节点），让其按普通串行节点渲染。
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

  // CONDITION/GATEWAY 单出边场景：降级为普通节点（无分支语义），
  // 由 resolveGraphMainEdge 把唯一出边作为主干渲染。
  // 同时覆盖"上游已是多出边路由 → 当前是分支标签节点"的历史模式，
  // 标签节点同样是单出边，被本规则统一收敛。
  if (type === NodeType.CONDITION || type === 'GATEWAY') {
    const outgoingCount = getWorkflowGraphOutgoingEdges(graph, node.id).length;
    if (outgoingCount < 2) {
      return false;
    }
  }
  return true;
};

const isBranchEdge = (
  edge: WorkflowGraphEdge,
  nodeMap: Map<string, WorkflowGraphNode>,
  graph?: WorkflowGraphDefinition,
): boolean => {
  // 优先判定：源节点是多分支决策节点 → 所有出边均视为分支边（含 isDefault 边作为"默认分支"），
  // 与 L155-168 注释"多分支决策节点的出边均视为分支边"对齐。此判定必须先于 isDefaultEdge，
  // 否则 CONDITION/GATEWAY 的默认分支会被错误排除（payment_request seed: gw1→b1 isDefault 漏渲染）。
  const sourceNode = nodeMap.get(edge.source);
  if (graph && isMultiBranchDecisionNode(sourceNode, graph)) {
    return true;
  }

  // 普通业务节点：isDefault 边代表主干，非分支
  if (isDefaultEdge(edge)) {
    return false;
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

  const outgoingEdges = getWorkflowGraphOutgoingEdges(graph, sourceId);
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

/**
 * P1-8: 从 startIds 出发做纯 DFS，收集所有可达后代节点 ID（含 startIds 自身）。
 *
 * **不剔除任何节点**——即使下游节点存在来自集合外的入边（如多分支汇聚到的共享 END），
 * 也一律纳入结果。调用方若需要"保护外部可达节点"，请额外调用
 * {@link pruneExternallyReachableFromSet} 进行二次过滤。
 *
 * 适用场景：subgraph 提取、节点克隆等纯结构遍历。
 *
 * **不可与 {@link pruneExternallyReachableFromSet} 互换**：
 * - 本函数返回完整下游集（用于"知道有哪些"）；
 * - prune 函数返回可安全删除子集（用于"知道哪些能动"）。
 */
const collectDownstreamSubtreeIds = (
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
    getWorkflowGraphOutgoingEdges(graph, currentId).forEach((edge) =>
      stack.push(edge.target),
    );
  }

  return idsToRemove;
};

/**
 * P1-8: 在初始候选集合上反复剔除"存在来自集合外入边的节点"，直到不动点。
 *
 * 适用场景：删除子树时保留多分支汇聚点（共享 END / merge 节点）的语义；
 * replaceWorkflowGraphNextNode / removeWorkflowGraphBranch 的级联截断共用该语义。
 *
 * @param graph 当前图
 * @param ids 初始候选删除集合（会被原地修改）
 * @param protectedAnchor 可选锚点 ID；存在时即使该节点有外部入边也强制保留在删除集中
 *                       （删除场景的"显式锚点"语义，例如 removeBranch 的 branchId）
 */
const pruneExternallyReachableFromSet = (
  graph: WorkflowGraphDefinition,
  ids: Set<string>,
  protectedAnchor?: string,
): void => {
  let changed = true;
  while (changed) {
    changed = false;
    ids.forEach((nodeId) => {
      if (protectedAnchor && nodeId === protectedAnchor) {
        return;
      }
      const hasExternalIncoming = graph.edges.some(
        (edge) => edge.target === nodeId && !ids.has(edge.source),
      );
      if (hasExternalIncoming) {
        ids.delete(nodeId);
        changed = true;
      }
    });
  }
};

const collectRemovableSubtreeIds = (
  graph: WorkflowGraphDefinition,
  startIds: string[],
): Set<string> => {
  const idsToRemove = collectDownstreamSubtreeIds(graph, startIds);
  pruneExternallyReachableFromSet(graph, idsToRemove);
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
 * 嵌套子流程语义版：沿单出边链下探，遇到 END 或"多入边汇合点"即停止并返回该节点 ID。
 * 与 resolveLinearEndNodeId 的差异：后者只在 END 节点处停止；本函数额外把"任意 ≥2 入边的节点"
 * 视为合法汇合点，用于支持 appendWorkflowGraphBranch 生成的"分流 → 业务节点 → end"嵌套结构。
 *
 * 注意：startId 自身不算"汇合点"（它是分支根，入边只有 1 条从父节点指来）。
 */
const resolveLinearEndOrMergeNodeId = (
  graph: WorkflowGraphDefinition,
  startId: string,
): string | null => {
  const nodeMap = new Map(graph.nodes.map((node) => [node.id, node] as const));
  const visited = new Set<string>();
  let currentId: string | null = startId;
  let isStart = true;

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
    // 非起点节点若有 ≥2 入边，视为分支汇合点
    if (!isStart) {
      const incomingCount = graph.edges.filter((edge) => edge.target === currentId).length;
      if (incomingCount >= 2) {
        return currentId;
      }
    }
    isStart = false;

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

  // P2-6: edge id 唯一性校验，承接 generateUniqueEdgeId 的不变量
  const edgeIdSet = new Set<string>();

  (Array.isArray(graph.edges) ? graph.edges : []).forEach((edge) => {
    const source = edge?.source;
    const target = edge?.target;
    if (!source || !target) {
      throw new Error('流程图存在 source/target 缺失的连线');
    }
    if (!nodeMap.has(source) || !nodeMap.has(target)) {
      throw new Error(`流程图连线引用了不存在的节点: ${source} -> ${target}`);
    }
    // P1-9: 自环显式拦截。理论上下方 reachable 的 path 检查也能在递归时捕获，
    // 但自环是合法图模型从不允许的形态，直接在边校验阶段抛出更直观。
    if (source === target) {
      throw new Error(`流程图存在自环连线: ${source} -> ${target}`);
    }

    if (edge.id) {
      if (edgeIdSet.has(edge.id)) {
        throw new Error(`流程图存在重复连线ID: ${edge.id}`);
      }
      edgeIdSet.add(edge.id);
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

  // P1-9: 非 START 节点入度为 0 的孤立检查。
  // 下方"不可达"检查也能间接捕获该问题，但显式校验给出节点级错误更精准。
  incomingCount.forEach((count, nodeId) => {
    if (nodeId === startNode.id) return;
    if (count === 0) {
      throw new Error(`流程图存在孤立节点（无任何入边）: ${nodeId}`);
    }
  });

  incomingCount.forEach((count, nodeId) => {
    if (nodeId === startNode.id || count <= 1) {
      return;
    }
    // 嵌套子流程语义：任意非 START 节点都可以作为多分支汇合点（含普通业务节点）。
    // appendWorkflowGraphBranch / insertWorkflowGraphNodeBeforeMergeEnd 依赖这一放宽，
    // 仅保留 END 出边为 0 的强约束（在下方 outgoing 遍历中校验）。
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
 *
 * BPMN 风格"分流-汇合"语义：新分支末尾自动回流到 parent 原主干后继 (mergeNodeId)，
 * 让"父节点 → 新分支 → 原主干后继"形成嵌套子流程闭环。
 * 例：金额校验 → 总经理审批  追加新分支  ⇒  金额校验 ─┬─ 默认 → 总经理审批 ─┐
 *                                                    └─ 新分支 ─────────┤
 *                                                                       ↓ end
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

  // 在分支化之前先识别本次嵌套子流程的汇合点 mergeNodeId（沿主干下探到 END 或多入边节点）：
  //  - 出边 = 0 → null（无可汇合点，如分支根挂空 condition 节点）
  //  - 否则取 "主干 anchor"（default 边 target，或首条出边 target），沿单出边链下探，
  //    遇 END 或 ≥2 入边节点即停止。anchor 自身作为分支 root，不算汇合点。
  //
  // 注意：mergeNodeId ≠ anchor 是关键设计 — 让 anchor 成为"默认分支 root"，
  // 让其下游的真正汇合点（END 或共享 merge）成为各分支末尾的回流目标，
  // 避免 FlowNode 把同一节点同时作为 branch root 与 sharedMerge 双重渲染。
  const outgoingBefore = getWorkflowGraphOutgoingEdges(graph, parentId);
  const mergeNodeId: string | null = (() => {
    if (outgoingBefore.length === 0) return null;
    const defaultEdge = outgoingBefore.find(isDefaultEdge);
    const anchor = defaultEdge?.target ?? outgoingBefore[0].target;
    return resolveLinearEndOrMergeNodeId(graph, anchor);
  })();

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
  // P2-6: 用 generateUniqueEdgeId 兜底，避免同一 parent→branch 对存在多条边时 id 冲突
  let edges = [...graph.edges, {
    id: generateUniqueEdgeId(graph.edges, parentId, branchNode.id),
    source: parentId,
    target: branchNode.id,
    condition: normalizedCondition || undefined,
  }];

  // 嵌套子流程语义：新分支末尾自动回流到 mergeNode，让"分流-汇合"闭合
  if (mergeNodeId && mergeNodeId !== branchNode.id) {
    edges = [...edges, {
      id: generateUniqueEdgeId(edges, branchNode.id, mergeNodeId),
      source: branchNode.id,
      target: mergeNodeId,
    }];
  }

  // P2-5: 由 ensureExactlyOneDefault 统一收尾——之前"出边数=1 时提升原边为 default"的手写逻辑
  // 等价于"加入新分支后，原边自动成为该 source 的首条 default 候选"。
  edges = ensureExactlyOneDefault(edges, parentId);

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
  return collectDownstreamSubtreeIds(graph, branchChildIds).has(targetId);
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
 * 把"分支汇合到 END"泛化为"分支汇合到任意节点"（含 END 与普通业务节点）。
 * 渲染层走本函数，appendWorkflowGraphBranch 生成的"金额校验 ─┬─→ 总经理审批 ─┐
 *                                                          └─→ 新分支 ─────┤
 *                                                                          ↓ end"
 * 嵌套结构中，"总经理审批"会被识别为各分支的共享汇合点。
 *
 * 旧函数 findWorkflowGraphBranchSharedEndId 保留不动，仅供需要"END 专属汇合"语义的旧调用方使用。
 */
export const findWorkflowGraphBranchSharedMergeId = (
  graph: WorkflowGraphDefinition,
  nodeId: string,
): string | null => {
  const branchChildIds = getWorkflowGraphBranchChildIds(graph, nodeId);
  if (branchChildIds.length < 2) {
    return null;
  }

  const mergeIds = branchChildIds.map((branchId) =>
    resolveLinearEndOrMergeNodeId(graph, branchId),
  );
  const [firstMergeId] = mergeIds;
  if (!firstMergeId || mergeIds.some((id) => id !== firstMergeId)) {
    return null;
  }

  // 汇合点必须有 ≥2 条入边（来自各分支末尾），END 节点天然满足；普通节点经 appendBranch 后亦满足
  return getWorkflowGraphIncomingEdges(graph, firstMergeId).length >= 2
    ? firstMergeId
    : null;
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

  const includedIds = collectDownstreamSubtreeIds(graph, [nodeId]);
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

  collectDownstreamSubtreeIds(graph, getWorkflowGraphBranchChildIds(graph, nodeId)).forEach((id) => {
    idsToClone.add(id);
  });

  if (options?.includeMainPath && mainEdge?.target) {
    collectDownstreamSubtreeIds(graph, [mainEdge.target]).forEach((id) => {
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

  let edges = graph.edges.filter((edge) => edge !== mainEdge);
  edges.push(...subgraph.edges);
  edges.push({
    id: generateUniqueEdgeId(edges, parentId, rootId),
    source: parentId,
    target: rootId,
    isDefault: shouldMarkDefault || undefined,
  });

  if (mainEdge) {
    edges.push({
      id: generateUniqueEdgeId(edges, rootId, mainEdge.target),
      source: rootId,
      target: mainEdge.target,
    });
  }

  // P2-5: 收尾归一 default 不变量
  edges = ensureExactlyOneDefault(edges, parentId);

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
 * 在共享 END（多入边汇合的结束节点）之前插入一个新节点：
 *  - 把所有原来指向 endNodeId 的边重定向到 newNode.id（保留 condition/isDefault 元数据）
 *  - 新增 newNode → endNodeId 一条边
 *  - 节点本身追加到 graph.nodes
 *
 * 语义：让多条分支先汇合到 newNode，再由 newNode 单边走向 endNode。
 * 用于"在共享 END 前追加公共节点"场景；单入边 END 调用此函数效果等价于
 * insertWorkflowGraphNodeAfter(anchor=入边 source)，因此调用方可以无差别使用。
 */
export const insertWorkflowGraphNodeBeforeMergeEnd = (
  graph: WorkflowGraphDefinition,
  endNodeId: string,
  newNode: WorkflowGraphNode,
): WorkflowGraphDefinition => {
  const endNode = graph.nodes.find((node) => node.id === endNodeId);
  if (!endNode) {
    return graph;
  }
  if (graph.nodes.some((node) => node.id === newNode.id)) {
    return graph;
  }

  const nodes = [...graph.nodes, newNode];
  const redirected = graph.edges.map((edge) =>
    edge.target === endNodeId ? { ...edge, target: newNode.id } : edge,
  );
  const edges = [
    ...redirected,
    {
      id: generateUniqueEdgeId(redirected, newNode.id, endNodeId),
      source: newNode.id,
      target: endNodeId,
    },
  ];

  return { nodes, edges };
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
    collectDownstreamSubtreeIds(graph, [anchorId]).forEach((id) =>
      idsToRemove.add(id),
    );
    pruneExternallyReachableFromSet(graph, idsToRemove, anchorId);
  }

  let edges = graph.edges.filter(
    (edge) =>
      edge !== mainEdge &&
      !idsToRemove.has(edge.source) &&
      !idsToRemove.has(edge.target),
  );
  const hasRemainingBranches = edges.some((edge) => edge.source === parentId);
  edges.push({
    id: generateUniqueEdgeId(edges, parentId, newNode.id),
    source: parentId,
    target: newNode.id,
    isDefault: hasRemainingBranches || undefined,
  });

  // P2-5: 收尾归一 default 不变量
  edges = ensureExactlyOneDefault(edges, parentId);

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
  const movedBranchIds = collectDownstreamSubtreeIds(graph, branchTargets);
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
        id: generateUniqueEdgeId(edges, edge.source, sourceMainEdge.target),
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
    id: generateUniqueEdgeId(edges, targetParentId, nodeId),
    source: targetParentId,
    target: nodeId,
    isDefault: shouldMarkDefault || undefined,
  });

  if (targetMainEdge) {
    edges.push({
      id: generateUniqueEdgeId(edges, nodeId, targetMainEdge.target),
      source: nodeId,
      target: targetMainEdge.target,
    });
  }

  // P2-5: 收尾归一 default 不变量（同时覆盖源/目标父节点）
  edges = ensureExactlyOneDefault(edges, targetParentId);
  if (sourceMainEdge) {
    const sourceParent = incomingEdges[0]?.source;
    if (sourceParent && sourceParent !== targetParentId) {
      edges = ensureExactlyOneDefault(edges, sourceParent);
    }
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
          id: generateUniqueEdgeId(edges, edge.source, keepTargetId),
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

  // P2-5: 删除节点后，原父节点出边数变化时归一 default
  incomingEdges.forEach((edge) => {
    if (!removableIds.has(edge.source)) {
      edges = ensureExactlyOneDefault(edges, edge.source);
    }
  });

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
  const idsToRemove = collectDownstreamSubtreeIds(graph, [branchId]);
  idsToRemove.forEach((nodeId) => {
    if (nodeId !== branchId && isEndNode(nodeMap.get(nodeId))) {
      idsToRemove.delete(nodeId);
    }
  });
  pruneExternallyReachableFromSet(graph, idsToRemove, branchId);

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
    // P2-5: 删完分支后仍 ≥2 出边，统一通过 ensureExactlyOneDefault 维护 default 不变量
    // （取代原手写 "若无 default 则把首条提升" 逻辑，满足 R9 同时清理多 default 隐患）
    edges = ensureExactlyOneDefault(edges, parentId);
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
    const endTarget = Array.from(removedBranchEndIds)[0];
    edges.push({
      id: generateUniqueEdgeId(edges, parentId, endTarget),
      source: parentId,
      target: endTarget,
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
        id: generateUniqueEdgeId(edges, edge.source, target),
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
