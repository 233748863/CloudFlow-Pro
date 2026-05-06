import {
  NodeType,
  type WorkflowGraphDefinition,
  type WorkflowGraphEdge,
  type WorkflowGraphNode
} from '@/types'

export const isWorkflowGraphDefinition = (value: unknown): value is WorkflowGraphDefinition => {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return Array.isArray(candidate.nodes) && Array.isArray(candidate.edges)
}

export const parseWorkflowGraphDefinition = (raw: unknown): WorkflowGraphDefinition | null => {
  if (!raw) return null
  if (typeof raw === 'object') return isWorkflowGraphDefinition(raw) ? raw : null
  if (typeof raw !== 'string' || !raw.trim()) return null

  try {
    const parsed = JSON.parse(raw)
    return isWorkflowGraphDefinition(parsed) ? parsed : null
  } catch {
    return null
  }
}

export const createDefaultWorkflowGraph = (): WorkflowGraphDefinition => ({
  nodes: [
    { id: 'start', type: NodeType.START, title: '开始' },
    { id: 'end', type: NodeType.END, title: '流程结束' }
  ],
  edges: [{ id: 'start->end', source: 'start', target: 'end' }]
})

const isDefaultEdge = (edge: WorkflowGraphEdge): boolean => {
  const raw = edge.isDefault
  if (typeof raw === 'boolean') return raw
  if (typeof raw === 'number') return raw !== 0
  if (typeof raw === 'string') {
    const normalized = raw.trim().toLowerCase()
    return ['true', '1', 'yes', 'y'].includes(normalized)
  }
  return false
}

const extractEdgeCondition = (edge: WorkflowGraphEdge): string | undefined => {
  const condition = edge.condition
  return typeof condition === 'string' && condition.trim() ? condition.trim() : undefined
}

const hasNodeCondition = (node?: WorkflowGraphNode): boolean =>
  typeof node?.condition === 'string' && Boolean(node.condition.trim())

const isBranchEdge = (
  edge: WorkflowGraphEdge,
  nodeMap: Map<string, WorkflowGraphNode>
): boolean => {
  if (isDefaultEdge(edge)) return false
  const targetNode = nodeMap.get(edge.target)
  return String(targetNode?.type || '').toUpperCase() === NodeType.CONDITION || Boolean(extractEdgeCondition(edge)) || hasNodeCondition(targetNode)
}

const resolveGraphMainEdge = (
  graph: WorkflowGraphDefinition,
  sourceId: string,
  nodeMap: Map<string, WorkflowGraphNode>
): WorkflowGraphEdge | undefined => {
  const outgoingEdges = graph.edges.filter((edge) => edge.source === sourceId)
  const defaultEdge = outgoingEdges.find((edge) => isDefaultEdge(edge))
  if (defaultEdge) return defaultEdge
  if (outgoingEdges.length !== 1) return undefined
  const [singleEdge] = outgoingEdges
  return isBranchEdge(singleEdge, nodeMap) ? undefined : singleEdge
}

const collectGraphSubtreeIds = (
  graph: WorkflowGraphDefinition,
  startIds: string[]
): Set<string> => {
  const idsToRemove = new Set<string>()
  const stack = [...startIds]

  while (stack.length > 0) {
    const currentId = stack.pop()
    if (!currentId || idsToRemove.has(currentId)) continue
    idsToRemove.add(currentId)
    graph.edges
      .filter((edge) => edge.source === currentId)
      .forEach((edge) => stack.push(edge.target))
  }

  return idsToRemove
}

export const assertWorkflowGraphIntegrity = (graph: WorkflowGraphDefinition): void => {
  if (!Array.isArray(graph.nodes) || graph.nodes.length === 0) {
    throw new Error('流程图节点不能为空')
  }

  const nodeMap = new Map<string, WorkflowGraphNode>()
  graph.nodes.forEach((node) => {
    if (!node?.id) throw new Error('流程图存在缺少 id 的节点')
    if (nodeMap.has(node.id)) throw new Error(`流程图存在重复节点ID: ${node.id}`)
    nodeMap.set(node.id, node)
  })

  const outgoing = new Map<string, WorkflowGraphEdge[]>()
  const incomingCount = new Map<string, number>()
  nodeMap.forEach((_, id) => incomingCount.set(id, 0))

  graph.edges.forEach((edge) => {
    if (!edge.source || !edge.target) throw new Error('流程图存在 source/target 缺失的连线')
    if (!nodeMap.has(edge.source) || !nodeMap.has(edge.target)) {
      throw new Error(`流程图连线引用了不存在的节点: ${edge.source} -> ${edge.target}`)
    }

    const edges = outgoing.get(edge.source) ?? []
    edges.push(edge)
    outgoing.set(edge.source, edges)
    incomingCount.set(edge.target, (incomingCount.get(edge.target) ?? 0) + 1)
  })

  const startNodes = Array.from(nodeMap.values()).filter((node) => String(node.type || '').toUpperCase() === NodeType.START)
  if (startNodes.length !== 1) throw new Error('流程图必须且只能包含一个 START 节点')

  const startNode = startNodes[0]
  incomingCount.forEach((count, nodeId) => {
    if (nodeId !== startNode.id && count > 1) throw new Error(`暂不支持多入边汇聚节点: ${nodeId}`)
  })

  outgoing.forEach((edges, nodeId) => {
    if (edges.filter((edge) => isDefaultEdge(edge)).length > 1) {
      throw new Error(`节点存在多条默认连线: ${nodeId}`)
    }
  })

  const reachable = new Set<string>()
  const collectReachable = (nodeId: string, path: Set<string>) => {
    if (path.has(nodeId)) throw new Error(`流程图存在循环，节点ID: ${nodeId}`)
    if (reachable.has(nodeId)) return
    reachable.add(nodeId)
    const nextPath = new Set(path)
    nextPath.add(nodeId)
    ;(outgoing.get(nodeId) ?? []).forEach((edge) => collectReachable(edge.target, nextPath))
  }
  collectReachable(startNode.id, new Set())

  if (reachable.size !== nodeMap.size) {
    throw new Error('流程图存在不可达节点，请删除孤立节点后重试')
  }
}

export const patchWorkflowGraphNode = (
  graph: WorkflowGraphDefinition,
  nodeId: string,
  patch: Partial<WorkflowGraphNode>
): WorkflowGraphDefinition => {
  let updated = false
  const nodes = graph.nodes.map((node) => {
    if (node.id !== nodeId) return node
    updated = true
    return { ...node, ...patch }
  })

  if (!updated) return graph
  if (!Object.prototype.hasOwnProperty.call(patch, 'condition')) return { nodes, edges: [...graph.edges] }

  const normalizedCondition = typeof patch.condition === 'string' ? patch.condition.trim() : ''
  const edges = graph.edges.map((edge) => {
    if (edge.target !== nodeId || isDefaultEdge(edge)) return edge
    return { ...edge, condition: normalizedCondition || undefined }
  })

  return { nodes, edges }
}

export const appendWorkflowGraphBranch = (
  graph: WorkflowGraphDefinition,
  parentId: string,
  branchNode: WorkflowGraphNode,
  defaultStrategy: NonNullable<WorkflowGraphNode['branchStrategy']>
): WorkflowGraphDefinition => {
  if (!graph.nodes.some((node) => node.id === parentId)) return graph

  const outgoingEdges = graph.edges.filter((edge) => edge.source === parentId)
  const edges = graph.edges.map((edge) => {
    if (edge.source !== parentId) return edge
    if (outgoingEdges.length === 1 && !isDefaultEdge(edge)) return { ...edge, isDefault: true }
    return edge
  })

  const nodes = graph.nodes.map((node) => {
    if (node.id !== parentId) return node
    const branchStrategy: WorkflowGraphNode['branchStrategy'] =
      typeof node.branchStrategy === 'string' && node.branchStrategy.trim()
        ? node.branchStrategy
        : defaultStrategy
    return { ...node, branchStrategy }
  })

  const normalizedCondition = typeof branchNode.condition === 'string' ? branchNode.condition.trim() : ''
  nodes.push(branchNode)
  edges.push({
    id: `${parentId}->${branchNode.id}`,
    source: parentId,
    target: branchNode.id,
    condition: normalizedCondition || undefined
  })

  return { nodes, edges }
}

export const findWorkflowGraphNode = (
  graph: WorkflowGraphDefinition,
  nodeId: string
): WorkflowGraphNode | null => graph.nodes.find((node) => node.id === nodeId) || null

export const findWorkflowGraphParentNodeId = (
  graph: WorkflowGraphDefinition,
  nodeId: string
): string | null => graph.edges.find((edge) => edge.target === nodeId)?.source || null

export const getWorkflowGraphBranchChildIds = (
  graph: WorkflowGraphDefinition,
  nodeId: string
): string[] => {
  const nodeMap = new Map(graph.nodes.map((node) => [node.id, node] as const))
  return graph.edges
    .filter((edge) => edge.source === nodeId && isBranchEdge(edge, nodeMap))
    .map((edge) => edge.target)
}

export const isWorkflowGraphBranchRoot = (
  graph: WorkflowGraphDefinition,
  nodeId: string
): boolean => {
  const incomingEdge = graph.edges.find((edge) => edge.target === nodeId)
  if (!incomingEdge) return false
  const nodeMap = new Map(graph.nodes.map((node) => [node.id, node] as const))
  return isBranchEdge(incomingEdge, nodeMap)
}

export const isWorkflowGraphNodeInsideBranchScope = (
  graph: WorkflowGraphDefinition,
  nodeId: string
): boolean | null => {
  if (!graph.nodes.some((node) => node.id === nodeId)) return null
  const nodeMap = new Map(graph.nodes.map((node) => [node.id, node] as const))
  let currentId: string | null = nodeId

  while (currentId) {
    const incomingEdge = graph.edges.find((edge) => edge.target === currentId)
    if (!incomingEdge) return false
    if (isBranchEdge(incomingEdge, nodeMap)) return true
    currentId = incomingEdge.source
  }

  return false
}

export const isWorkflowGraphNodeInBranchSubtree = (
  graph: WorkflowGraphDefinition,
  ancestorId: string,
  targetId: string
): boolean => {
  const branchChildIds = getWorkflowGraphBranchChildIds(graph, ancestorId)
  if (branchChildIds.length === 0) return false
  return collectGraphSubtreeIds(graph, branchChildIds).has(targetId)
}

export const findWorkflowGraphMainTargetId = (
  graph: WorkflowGraphDefinition,
  nodeId: string
): string | null => {
  const nodeMap = new Map(graph.nodes.map((node) => [node.id, node] as const))
  return resolveGraphMainEdge(graph, nodeId, nodeMap)?.target || null
}

export const countWorkflowGraphBranches = (
  graph: WorkflowGraphDefinition,
  nodeId: string
): number => getWorkflowGraphBranchChildIds(graph, nodeId).length

export const insertWorkflowGraphSubgraphAfter = (
  graph: WorkflowGraphDefinition,
  parentId: string,
  subgraph: WorkflowGraphDefinition,
  rootId: string
): WorkflowGraphDefinition => {
  if (!graph.nodes.some((node) => node.id === parentId)) return graph
  if (!subgraph.nodes.some((node) => node.id === rootId)) return graph

  const existingIds = new Set(graph.nodes.map((node) => node.id))
  if (subgraph.nodes.some((node) => existingIds.has(node.id))) return graph

  const nodeMap = new Map(graph.nodes.map((node) => [node.id, node] as const))
  const mainEdge = resolveGraphMainEdge(graph, parentId, nodeMap)
  const otherOutgoingEdges = graph.edges.filter((edge) => edge.source === parentId && edge !== mainEdge)
  const shouldMarkDefault = otherOutgoingEdges.length > 0 || Boolean(mainEdge && isDefaultEdge(mainEdge))

  const edges = graph.edges.filter((edge) => edge !== mainEdge)
  edges.push(...subgraph.edges)
  edges.push({
    id: `${parentId}->${rootId}`,
    source: parentId,
    target: rootId,
    isDefault: shouldMarkDefault || undefined
  })

  if (mainEdge) {
    edges.push({ id: `${rootId}->${mainEdge.target}`, source: rootId, target: mainEdge.target })
  }

  return { nodes: [...graph.nodes, ...subgraph.nodes], edges }
}

export const insertWorkflowGraphNodeAfter = (
  graph: WorkflowGraphDefinition,
  parentId: string,
  newNode: WorkflowGraphNode
): WorkflowGraphDefinition => insertWorkflowGraphSubgraphAfter(graph, parentId, { nodes: [newNode], edges: [] }, newNode.id)

export const replaceWorkflowGraphNextNode = (
  graph: WorkflowGraphDefinition,
  parentId: string,
  newNode: WorkflowGraphNode
): WorkflowGraphDefinition => {
  if (!graph.nodes.some((node) => node.id === parentId) || graph.nodes.some((node) => node.id === newNode.id)) return graph

  const nodeMap = new Map(graph.nodes.map((node) => [node.id, node] as const))
  const mainEdge = resolveGraphMainEdge(graph, parentId, nodeMap)
  const idsToRemove = mainEdge ? collectGraphSubtreeIds(graph, [mainEdge.target]) : new Set<string>()

  const edges = graph.edges.filter((edge) => !idsToRemove.has(edge.source) && !idsToRemove.has(edge.target))
  const hasRemainingBranches = edges.some((edge) => edge.source === parentId)
  edges.push({
    id: `${parentId}->${newNode.id}`,
    source: parentId,
    target: newNode.id,
    isDefault: hasRemainingBranches || undefined
  })

  return {
    nodes: [...graph.nodes.filter((node) => !idsToRemove.has(node.id)), newNode],
    edges
  }
}

export const moveWorkflowGraphNode = (
  graph: WorkflowGraphDefinition,
  nodeId: string,
  targetParentId: string
): WorkflowGraphDefinition => {
  if (nodeId === targetParentId) return graph
  if (!graph.nodes.some((node) => node.id === nodeId) || !graph.nodes.some((node) => node.id === targetParentId)) return graph

  const nodeMap = new Map(graph.nodes.map((node) => [node.id, node] as const))
  const sourceMainEdge = resolveGraphMainEdge(graph, nodeId, nodeMap)
  const branchTargets = graph.edges
    .filter((edge) => edge.source === nodeId && edge !== sourceMainEdge)
    .map((edge) => edge.target)
  const movedBranchIds = collectGraphSubtreeIds(graph, branchTargets)
  const movedIds = new Set<string>([nodeId, ...movedBranchIds])
  const incomingEdges = graph.edges.filter((edge) => edge.target === nodeId && !movedIds.has(edge.source))

  const buildEdgeKey = (edge: WorkflowGraphEdge) =>
    `${edge.source}->${edge.target}|${extractEdgeCondition(edge) || ''}|${isDefaultEdge(edge) ? '1' : '0'}`

  let edges = graph.edges.filter((edge) => {
    if (incomingEdges.includes(edge)) return false
    if (sourceMainEdge && edge === sourceMainEdge) return false
    return true
  })

  if (sourceMainEdge) {
    const existingEdgeKeys = new Set(edges.map((edge) => buildEdgeKey(edge)))
    incomingEdges.forEach((edge) => {
      const rewiredEdge: WorkflowGraphEdge = { ...edge, id: `${edge.source}->${sourceMainEdge.target}`, target: sourceMainEdge.target }
      const rewiredKey = buildEdgeKey(rewiredEdge)
      if (existingEdgeKeys.has(rewiredKey)) return
      existingEdgeKeys.add(rewiredKey)
      edges.push(rewiredEdge)
    })
  }

  const detachedGraph: WorkflowGraphDefinition = { nodes: [...graph.nodes], edges }
  const targetNodeMap = new Map(detachedGraph.nodes.map((node) => [node.id, node] as const))
  const targetMainEdge = resolveGraphMainEdge(detachedGraph, targetParentId, targetNodeMap)
  const targetOtherOutgoingEdges = edges.filter((edge) => edge.source === targetParentId && edge !== targetMainEdge)
  const shouldMarkDefault = targetOtherOutgoingEdges.length > 0 || Boolean(targetMainEdge && isDefaultEdge(targetMainEdge))

  edges = edges.filter((edge) => edge !== targetMainEdge)
  edges.push({
    id: `${targetParentId}->${nodeId}`,
    source: targetParentId,
    target: nodeId,
    isDefault: shouldMarkDefault || undefined
  })

  if (targetMainEdge) {
    edges.push({ id: `${nodeId}->${targetMainEdge.target}`, source: nodeId, target: targetMainEdge.target })
  }

  return { nodes: [...graph.nodes], edges }
}

export const removeWorkflowGraphNode = (
  graph: WorkflowGraphDefinition,
  nodeId: string
): WorkflowGraphDefinition => {
  if (!graph.nodes.some((node) => node.id === nodeId)) return graph

  const nodeMap = new Map(graph.nodes.map((node) => [node.id, node] as const))
  const incomingEdges = graph.edges.filter((edge) => edge.target === nodeId)
  const outgoingEdges = graph.edges.filter((edge) => edge.source === nodeId)

  const keepEdge = (() => {
    const defaultEdge = outgoingEdges.find((edge) => isDefaultEdge(edge))
    if (defaultEdge) return defaultEdge
    if (outgoingEdges.length !== 1) return undefined
    const [singleEdge] = outgoingEdges
    const singleTarget = nodeMap.get(singleEdge.target)
    if (!singleTarget) return undefined
    const singleTargetType = String(singleTarget.type || '').toUpperCase()
    const targetCondition = typeof singleTarget.condition === 'string' ? singleTarget.condition.trim() : ''
    if (singleTargetType === NodeType.CONDITION || Boolean(extractEdgeCondition(singleEdge)) || Boolean(targetCondition)) return undefined
    return singleEdge
  })()

  const keepTargetId = keepEdge?.target
  const idsToRemove = new Set<string>([nodeId])
  const stack = outgoingEdges
    .filter((edge) => edge.target !== keepTargetId)
    .map((edge) => edge.target)

  while (stack.length > 0) {
    const currentId = stack.pop()
    if (!currentId || idsToRemove.has(currentId)) continue
    idsToRemove.add(currentId)
    graph.edges
      .filter((edge) => edge.source === currentId)
      .forEach((edge) => {
        if (edge.target !== keepTargetId) stack.push(edge.target)
      })
  }

  let edges = graph.edges.filter((edge) => !idsToRemove.has(edge.source) && !idsToRemove.has(edge.target))

  if (keepTargetId) {
    const buildEdgeKey = (edge: WorkflowGraphEdge) =>
      `${edge.source}->${edge.target}|${extractEdgeCondition(edge) || ''}|${isDefaultEdge(edge) ? '1' : '0'}`
    const existingEdgeKeys = new Set(edges.map((edge) => buildEdgeKey(edge)))

    incomingEdges
      .filter((edge) => !idsToRemove.has(edge.source))
      .forEach((edge) => {
        const rewiredEdge: WorkflowGraphEdge = { ...edge, id: `${edge.source}->${keepTargetId}`, target: keepTargetId }
        const rewiredKey = buildEdgeKey(rewiredEdge)
        if (existingEdgeKeys.has(rewiredKey)) return
        existingEdgeKeys.add(rewiredKey)
        edges.push(rewiredEdge)
      })
  }

  return {
    nodes: graph.nodes.filter((node) => !idsToRemove.has(node.id)),
    edges
  }
}

export const removeWorkflowGraphBranch = (
  graph: WorkflowGraphDefinition,
  parentId: string,
  branchId: string
): WorkflowGraphDefinition => {
  if (!graph.nodes.some((node) => node.id === parentId)) return graph

  const idsToRemove = new Set<string>()
  const stack = [branchId]
  while (stack.length > 0) {
    const currentId = stack.pop()
    if (!currentId || idsToRemove.has(currentId)) continue
    idsToRemove.add(currentId)
    graph.edges
      .filter((edge) => edge.source === currentId)
      .forEach((edge) => stack.push(edge.target))
  }

  let edges = graph.edges.filter((edge) => !idsToRemove.has(edge.source) && !idsToRemove.has(edge.target))
  const remainingOutgoing = edges.filter((edge) => edge.source === parentId)
  const hasRemainingBranches = remainingOutgoing.some((edge) => !isDefaultEdge(edge))

  if (!hasRemainingBranches) {
    edges = edges.map((edge) => {
      if (edge.source !== parentId || !isDefaultEdge(edge)) return edge
      const { isDefault: _isDefault, ...rest } = edge
      return rest
    })
  }

  const nodes = graph.nodes
    .filter((node) => !idsToRemove.has(node.id))
    .map((node) => {
      if (node.id !== parentId || hasRemainingBranches) return node
      const { branchStrategy: _branchStrategy, ...rest } = node
      return rest
    })

  return { nodes, edges }
}
