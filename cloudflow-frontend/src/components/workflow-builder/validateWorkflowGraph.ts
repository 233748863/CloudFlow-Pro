import {
  NodeType,
  WorkflowGraphDefinition,
  WorkflowGraphEdge,
  WorkflowGraphNode,
} from "../../types";
import { countWorkflowGraphBranches } from "../../utils/workflowGraph";

export function validateWorkflowGraph(graph: WorkflowGraphDefinition): {
  errors: string[];
  errorNodes: string[];
} {
  if (!Array.isArray(graph.nodes) || graph.nodes.length === 0) {
    return {
      errors: ["流程图节点不能为空"],
      errorNodes: [],
    };
  }

  if (!Array.isArray(graph.edges)) {
    return {
      errors: ["流程图连线不能为空"],
      errorNodes: [],
    };
  }

  const errors: string[] = [];
  const errorNodeIds = new Set<string>();

  const pushError = (
    message: string,
    nodeIds: Array<string | undefined | null> = [],
  ) => {
    errors.push(message);
    nodeIds.forEach((nodeId) => {
      if (typeof nodeId === "string" && nodeId.trim()) {
        errorNodeIds.add(nodeId);
      }
    });
  };

  const normalizeNodeType = (type: unknown): string =>
    String(type || "").toUpperCase();

  const getNodeTitle = (node: WorkflowGraphNode): string => {
    const title = typeof node.title === "string" ? node.title.trim() : "";
    return title || "未命名节点";
  };

  const hasNodeCondition = (node: WorkflowGraphNode): boolean =>
    typeof node.condition === "string" && node.condition.trim().length > 0;

  const hasIncomingEdgeCondition = (edges: WorkflowGraphEdge[]): boolean =>
    edges.some(
      (edge) =>
        typeof edge.condition === "string" && edge.condition.trim().length > 0,
    );

  const isJsonObjectText = (value: unknown): boolean => {
    if (typeof value !== "string") {
      return true;
    }
    const text = value.trim();
    return !text || (text.startsWith("{") && text.endsWith("}"));
  };

  const nodeMap = new Map<string, WorkflowGraphNode>();
  const incoming = new Map<string, WorkflowGraphEdge[]>();

  graph.nodes.forEach((node) => {
    const nodeId = typeof node.id === "string" ? node.id : "";
    if (nodeId && !nodeMap.has(nodeId)) {
      nodeMap.set(nodeId, node);
    }
  });

  graph.edges.forEach((edge) => {
    const target = typeof edge.target === "string" ? edge.target : "";
    if (!target) {
      return;
    }
    const edgesOfTarget = incoming.get(target);
    if (edgesOfTarget) {
      edgesOfTarget.push(edge);
    } else {
      incoming.set(target, [edge]);
    }
  });

  const validateApprover = (
    node: WorkflowGraphNode,
    nodeId: string,
    nodeLabel: string,
    subjectLabel: string,
  ) => {
    const nodeTitle = getNodeTitle(node);
    if (!node.approverType) {
      pushError(
        nodeLabel + '节点"' + nodeTitle + '"未配置' + subjectLabel + "方式",
        [nodeId],
      );
      return;
    }
    if (
      !["DIRECT_LEADER", "DEPT_MANAGER", "INITIATOR"].includes(
        String(node.approverType),
      ) &&
      !node.approverValue
    ) {
      pushError(
        nodeLabel + '节点"' + nodeTitle + '"未配置具体的' + subjectLabel + "人",
        [nodeId],
      );
    }
  };

  graph.nodes.forEach((node) => {
    const nodeId = typeof node.id === "string" ? node.id : "";
    if (!nodeId || !nodeMap.has(nodeId)) {
      return;
    }

    const nodeType = normalizeNodeType(node.type);
    const nodeTitle = getNodeTitle(node);
    const branchCount = countWorkflowGraphBranches(graph, nodeId);
    const props =
      node.props && typeof node.props === "object"
        ? (node.props as Record<string, any>)
        : {};
    const incomingEdges = incoming.get(nodeId) ?? [];

    if (!node.title || !String(node.title).trim()) {
      pushError("有节点缺少名称", [nodeId]);
    }

    if (nodeType === NodeType.APPROVAL) {
      validateApprover(node, nodeId, "审批", "审批");
    }

    if (
      branchCount > 0 &&
      nodeType !== NodeType.PARALLEL &&
      node.branchStrategy &&
      node.branchStrategy !== "EXCLUSIVE"
    ) {
      pushError(
        '节点"' +
          nodeTitle +
          '"不是并行网关，仅支持单选分支（EXCLUSIVE），请调整分支策略',
        [nodeId],
      );
    }

    if (nodeType === NodeType.PARALLEL) {
      validateApprover(node, nodeId, "会签", "审批");
      const signType = String(node.signType || "ALL");
      if (
        ["ALL", "ANY", "PERCENT", "SEQUENTIAL"].includes(signType) &&
        branchCount > 0
      ) {
        const signLabel =
          signType === "ALL"
            ? "全签"
            : signType === "ANY"
              ? "或签"
              : signType === "PERCENT"
                ? "比例签"
                : "顺序签";
        pushError(
          '会签节点"' +
            nodeTitle +
            '"设置了' +
            signLabel +
            "模式，但仍包含 " +
            branchCount +
            " 个条件分支，请先清除分支或改用并行分支策略",
          [nodeId],
        );
      }
      const passPercent = Number(node.passPercent);
      if (
        signType === "PERCENT" &&
        (!Number.isFinite(passPercent) || passPercent <= 0 || passPercent > 100)
      ) {
        pushError(
          '会签节点"' +
            nodeTitle +
            '"使用比例签模式，但未设置有效的通过比例（1-100%）',
          [nodeId],
        );
      }
    }

    if (nodeType === NodeType.NOTIFICATION) {
      if (!props.notificationTitle && !props.notificationContent) {
        pushError('通知节点"' + nodeTitle + '"未配置通知标题或内容', [nodeId]);
      }
    }

    if (nodeType === NodeType.SCRIPT) {
      const scriptType = props.scriptType || "API";
      if (scriptType === "JAVASCRIPT") {
        pushError(
          '脚本节点"' + nodeTitle + '"当前不支持 JavaScript，请改用 Groovy 或 API 调用',
          [nodeId],
        );
      }
      if (scriptType === "API" && !props.apiUrl) {
        pushError(
          '脚本节点"' + nodeTitle + '"选择了 API 调用模式，但未配置 API URL',
          [nodeId],
        );
      }
      if (
        (scriptType === "GROOVY" || scriptType === "JAVASCRIPT") &&
        !props.scriptContent
      ) {
        pushError('脚本节点"' + nodeTitle + '"未填写脚本内容', [nodeId]);
      }
    }

    if (nodeType === NodeType.TIMER) {
      if (
        props.timerType === "DELAY" &&
        (!props.delayMinutes || props.delayMinutes <= 0)
      ) {
        pushError(
          '定时节点"' + nodeTitle + '"选择了延迟模式，但未设置有效的延迟时间',
          [nodeId],
        );
      }
      if (props.timerType === "SCHEDULE" && !props.scheduleTime) {
        pushError(
          '定时节点"' + nodeTitle + '"选择了定时模式，但未设置定时时间',
          [nodeId],
        );
      }
    }

    if (nodeType === NodeType.SUBPROCESS) {
      if (!props.subprocessId) {
        pushError('子流程节点"' + nodeTitle + '"未配置子流程 ID', [nodeId]);
      }
    }

    if (nodeType === NodeType.MANUAL) {
      validateApprover(node, nodeId, "人工任务", "处理");
      if (!props.taskDescription) {
        pushError('人工任务节点"' + nodeTitle + '"未配置任务描述', [nodeId]);
      }
    }

    if (nodeType === NodeType.COPY) {
      validateApprover(node, nodeId, "抄送", "抄送");
    }

    if (
      nodeType === NodeType.CONDITION &&
      !hasNodeCondition(node) &&
      !hasIncomingEdgeCondition(incomingEdges)
    ) {
      pushError('条件分支"' + nodeTitle + '"未配置触发条件', [nodeId]);
    }

    if (!isJsonObjectText(props.apiHeaders)) {
      pushError(
        '节点"' +
          nodeTitle +
          '"配置的 API Headers JSON 格式可能不正确，必须完整包含 {}',
        [nodeId],
      );
    }
    if (!isJsonObjectText(props.apiBody)) {
      pushError(
        '节点"' +
          nodeTitle +
          '"配置的 API Body JSON 格式可能不正确，必须完整包含 {}',
        [nodeId],
      );
    }
    if (!isJsonObjectText(props.variableMapping)) {
      pushError(
        '节点"' +
          nodeTitle +
          '"配置的 variableMapping JSON 格式可能不正确，必须完整包含 {}',
        [nodeId],
      );
    }
  });

  return {
    errors: Array.from(new Set(errors)),
    errorNodes: Array.from(errorNodeIds),
  };
}
