import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import { ZoomIn, ZoomOut, Maximize2, Move } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import {
  NodeType,
  WorkflowDefinition,
  WorkflowGraphDefinition,
  WorkflowGraphNode,
} from "../../types";
import { useHistory } from "../../hooks/useHistory";
import {
  saveProcessDefinition,
  deployProcessDefinition,
  exportWorkflow,
} from "../../services/api/workflow";
import { getErrorMessage } from "@/utils/errorMessage";
import { downloadBlob } from "../../utils/download";
import { ConfirmDialog } from "../common/ConfirmDialog";
import { SimulationDialog } from "../SimulationDialog";
import { WorkflowSettingsModal } from "../WorkflowSettingsModal";
import {
  normalizeWorkflowCategory,
} from "../../utils/workflowCategory";
import { useAuth } from "@/context/AuthContext";
import {
  appendWorkflowGraphBranch,
  assertWorkflowGraphIntegrity,
  countWorkflowGraphBranches,
  cloneWorkflowGraphSubgraph,
  findWorkflowGraphMainTargetId,
  findWorkflowGraphNode,
  findWorkflowGraphParentNodeId,
  findWorkflowGraphBranchSharedMergeId,
  getWorkflowGraphIncomingEdges,
  getWorkflowGraphBranchChildIds,
  isWorkflowGraphNodeInsideBranchScope,
  isWorkflowGraphNodeInBranchSubtree,
  isMultiBranchDecisionNode,
  isWorkflowGraphBranchRoot,
  isWorkflowGraphSharedEndNode,
  insertWorkflowGraphNodeAfter,
  insertWorkflowGraphNodeBeforeMergeEnd,
  insertWorkflowGraphSubgraphAfter,
  moveWorkflowGraphNode,
  parseWorkflowGraphDefinition,
  removeWorkflowGraphBranch,
  removeWorkflowGraphNode,
  replaceWorkflowGraphNextNode,
  patchWorkflowGraphNode,
} from "../../utils/workflowGraph";
import { generateNodeId, toEditableWorkflowNode, writeApproverCache } from "./helpers";
import type { WorkflowBuilderProps } from "./types";
import { WorkflowToolbar } from "./WorkflowToolbar";
import { GlobalPropertyPanel } from "./GlobalPropertyPanel";
import { PropertyPanel } from "./PropertyPanel";
import { FlowNode } from "./FlowNode";
import {
  FlowNodeReadContext,
  FlowNodeActionsContext,
  FlowNodeUiContext,
  type FlowNodeReadContextValue,
  type FlowNodeActionsContextValue,
  type FlowNodeUiContextValue,
} from "./FlowNodeActionsContext";
import { validateWorkflowGraph } from "./validateWorkflowGraph";

export const WorkflowBuilder: React.FC<WorkflowBuilderProps> = ({
  workflow,
  onChange,
  onSave,
  availableForms,
  availableRoles,
  availableUsers,
}) => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const routeWorkflowId = (searchParams.get("id") || "").trim();
  const currentWorkflowId = (workflow?.id || "").trim() || routeWorkflowId;

  // P2: 获取当前用户信息（用于数据权限）
  const { user } = useAuth();

  // 优先使用上层已加载的数据预热审批人缓存，减少设计器内重复请求。
  useEffect(() => {
    if (Array.isArray(availableRoles) && availableRoles.length > 0) {
      writeApproverCache("ROLE", availableRoles);
    }
  }, [availableRoles]);

  useEffect(() => {
    if (!Array.isArray(availableUsers) || availableUsers.length === 0) {
      return;
    }
    const normalizedUsers = availableUsers.map((item) => ({
      userId: Number(item.id) || item.id,
      userName: item.username || item.name,
      nickName: item.name,
    }));
    writeApproverCache("USER", normalizedUsers);
  }, [availableUsers]);

  const defaultGraphModel = useMemo<WorkflowGraphDefinition>(
    () => ({
      nodes: [
        { id: "node_start", type: NodeType.START, title: "发起申请" },
        {
          id: "node_1",
          type: NodeType.APPROVAL,
          title: "部门经理审批",
          approverType: "DEPT_MANAGER",
        },
        { id: "node_end", type: NodeType.END, title: "流程结束" },
      ],
      edges: [
        { id: "node_start->node_1", source: "node_start", target: "node_1" },
        { id: "node_1->node_end", source: "node_1", target: "node_end" },
      ],
    }),
    [],
  );

  const resolveGraphModel = useCallback(
    (raw: unknown): WorkflowGraphDefinition => {
      const graphModel = parseWorkflowGraphDefinition(raw);
      return graphModel || defaultGraphModel;
    },
    [defaultGraphModel],
  );

  const {
    state: graphModel,
    set: setGraphModel,
    reset: resetGraphModel,
    undo: rawUndo,
    redo: rawRedo,
    canUndo: rawCanUndo,
    canRedo: rawCanRedo,
  } = useHistory<WorkflowGraphDefinition>(resolveGraphModel(workflow?.graph));

  const rootNodeId = useMemo(() => {
    const resolveStartNodeId = (currentGraph: WorkflowGraphDefinition) =>
      currentGraph.nodes.find(
        (node) => String(node.type || "").toUpperCase() === NodeType.START,
      )?.id ||
      currentGraph.nodes[0]?.id ||
      null;

    return (
      resolveStartNodeId(graphModel) ?? resolveStartNodeId(defaultGraphModel)
    );
  }, [defaultGraphModel, graphModel]);

  const graphModelRef = useRef(graphModel);
  graphModelRef.current = graphModel;
  const replaceGraphState = useCallback(
    (
      nextGraph: WorkflowGraphDefinition,
      options?: { resetHistory?: boolean; fallbackToDefault?: boolean },
    ) => {
      let nextStateGraph = nextGraph;

      try {
        assertWorkflowGraphIntegrity(nextGraph);
      } catch (error) {
        if (!options?.fallbackToDefault) {
          throw error;
        }
        console.warn(
          "[WorkflowBuilder] failed to apply graph state, fallback to default workflow",
          error,
        );
        nextStateGraph = defaultGraphModel;
      }

      graphModelRef.current = nextStateGraph;

      if (options?.resetHistory) {
        resetGraphModel(nextStateGraph);
      } else {
        setGraphModel(nextStateGraph);
      }
    },
    [defaultGraphModel, resetGraphModel, setGraphModel],
  );

  const workflowRef = useRef(workflow);
  workflowRef.current = workflow;
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const selectedGraphNode = useMemo(
    () =>
      selectedNodeId ? findWorkflowGraphNode(graphModel, selectedNodeId) : null,
    [graphModel, selectedNodeId],
  );
  const selectedEditorNode = useMemo(
    () =>
      selectedGraphNode ? toEditableWorkflowNode(selectedGraphNode) : null,
    [selectedGraphNode],
  );
  const selectedNodeBranchCount = useMemo(
    () =>
      selectedGraphNode
        ? countWorkflowGraphBranches(graphModel, selectedGraphNode.id)
        : 0,
    [graphModel, selectedGraphNode],
  );
  const [saving, setSaving] = useState(false);
  const [simulationOpen, setSimulationOpen] = useState(false);
  const [workflowName, setWorkflowName] = useState(
    workflow?.name || "未命名流程",
  );
  const [workflowKey, setWorkflowKey] = useState(
    workflow?.key || "new_process",
  );
  const [zoom, setZoom] = useState(1);
  const [panOrigin, setPanOrigin] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  const [isDraggingGlobal, setDraggingGlobal] = useState(false);
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [activeQuickAddId, setActiveQuickAddId] = useState<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [invalidNodeIds, setInvalidNodeIds] = useState<string[]>([]);
  const [showGlobalConfig, setShowGlobalConfig] = useState(false);
  const [globalConfig, setGlobalConfig] = useState<{
    formId?: string;
    description?: string;
    category?: string;
    tags?: string;
    startPermissionType?: string;
    startPermissionValue?: string;
  }>({});

  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [workflowDescription, setWorkflowDescription] = useState("");
  const [workflowCategory, setWorkflowCategory] = useState("");
  const [workflowTags, setWorkflowTags] = useState<string[]>([]);
  const [selectedFormId, setSelectedFormId] = useState("");

  const [startPermissionType, setStartPermissionType] = useState("ALL");
  const [startPermissionValue, setStartPermissionValue] = useState("");
  const [workflowDeptId, setWorkflowDeptId] = useState<number | undefined>(
    undefined,
  );

  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    message: string;
    onConfirm: () => void;
  }>({ open: false, message: "", onConfirm: () => {} });
  const canvasRef = useRef<HTMLDivElement>(null);

  const parseTagsToArray = useCallback((raw?: string) => {
    if (!raw || !raw.trim()) return [] as string[];
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed
          .map((item) => String(item).trim())
          .filter((item) => item.length > 0);
      }
    } catch {
      return raw
        .split(",")
        .map((item) => item.trim())
        .filter((item) => item.length > 0);
    }
    return [];
  }, []);

  const normalizeDeptId = useCallback((raw: unknown): number | undefined => {
    if (typeof raw === "number" && Number.isFinite(raw)) {
      return raw;
    }
    if (typeof raw === "string" && raw.trim() !== "") {
      const parsed = Number(raw);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
    return undefined;
  }, []);

  const buildSettingsState = useCallback(() => {
    const tagsText =
      workflowTags.length > 0 ? JSON.stringify(workflowTags) : undefined;
    return {
      formId: selectedFormId || undefined,
      description: workflowDescription || undefined,
      category: workflowCategory || undefined,
      tags: tagsText,
      startPermissionType: startPermissionType || "ALL",
      startPermissionValue: startPermissionValue || undefined,
      deptId: workflowDeptId,
    };
  }, [
    selectedFormId,
    workflowDescription,
    workflowCategory,
    workflowTags,
    startPermissionType,
    startPermissionValue,
    workflowDeptId,
  ]);

  const buildWorkflowSnapshot = useCallback((): WorkflowDefinition | null => {
    const currentWorkflow = workflowRef.current;
    if (!currentWorkflow) return null;
    return {
      ...currentWorkflow,
      graph: graphModel,
      name: workflowName,
      key: workflowKey,
      ...buildSettingsState(),
    };
  }, [graphModel, workflowName, workflowKey, buildSettingsState]);

  const buildDefinitionPayload = useCallback(() => {
    return {
      definitionId: workflowRef.current?.id?.startsWith("new_")
        ? undefined
        : workflowRef.current?.id,
      processName: workflowName,
      processKey: workflowKey,
      modelJson: JSON.stringify(graphModel),
      ...buildSettingsState(),
    };
  }, [graphModel, workflowName, workflowKey, buildSettingsState]);

  const initializedRef = useRef(false);

  useEffect(() => {
    if (!workflow || initializedRef.current) return;
    initializedRef.current = true;

    const nextGraph = resolveGraphModel(workflow.graph);
    replaceGraphState(nextGraph, {
      resetHistory: true,
      fallbackToDefault: true,
    });
    const parsedTags = parseTagsToArray(workflow.tags);
    setSelectedNodeId(null);

    setWorkflowName(workflow.name || "未命名流程");
    setWorkflowKey(workflow.key || "new_process");
    setWorkflowDescription(workflow.description || "");
    setWorkflowCategory(normalizeWorkflowCategory(workflow.category));
    setWorkflowTags(parsedTags);
    setSelectedFormId(workflow.formId || "");
    setStartPermissionType(workflow.startPermissionType || "ALL");
    setStartPermissionValue(workflow.startPermissionValue || "");
    const nextDeptId =
      normalizeDeptId(workflow.deptId) ?? normalizeDeptId(user?.deptId);
    setWorkflowDeptId(nextDeptId);
    setGlobalConfig({
      formId: workflow.formId || undefined,
      description: workflow.description || undefined,
      category: normalizeWorkflowCategory(workflow.category) || undefined,
      tags: parsedTags.length > 0 ? parsedTags.join(", ") : undefined,
      startPermissionType: workflow.startPermissionType || "ALL",
      startPermissionValue: workflow.startPermissionValue || undefined,
    });
  }, [
    workflow,
    parseTagsToArray,
    normalizeDeptId,
    user?.deptId,
    resolveGraphModel,
    replaceGraphState,
  ]);

  useEffect(() => {
    if (!onChange || !workflowRef.current) return;
    const snapshot = buildWorkflowSnapshot();
    if (snapshot) {
      onChange(snapshot);
    }
  }, [
    onChange,
    workflow?.id,
    workflowName,
    workflowKey,
    workflowDescription,
    workflowCategory,
    workflowTags,
    selectedFormId,
    startPermissionType,
    startPermissionValue,
    workflowDeptId,
    buildWorkflowSnapshot,
  ]);

  const handleZoomIn = useCallback(
    () => setZoom((z) => Math.min(z + 0.1, 2)),
    [],
  );
  const handleZoomOut = useCallback(
    () => setZoom((z) => Math.max(z - 0.1, 0.3)),
    [],
  );
  const handleZoomReset = useCallback(() => setZoom(1), []);

  // P2-2: 双击画布空白处 → 适配视口（按所有节点 bbox 计算缩放比，并复位平移）。
  const handleFitToViewport = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const nodeEls = canvas.querySelectorAll<HTMLElement>("[data-node-id]");
    if (nodeEls.length === 0) {
      setZoom(1);
      setPanOrigin({ x: 0, y: 0 });
      return;
    }
    const canvasRect = canvas.getBoundingClientRect();
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    nodeEls.forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.left < minX) minX = r.left;
      if (r.top < minY) minY = r.top;
      if (r.right > maxX) maxX = r.right;
      if (r.bottom > maxY) maxY = r.bottom;
    });
    const padding = 48;
    const scaledW = maxX - minX;
    const scaledH = maxY - minY;
    if (scaledW <= 0 || scaledH <= 0 || zoom <= 0) return;
    const contentW = scaledW / zoom;
    const contentH = scaledH / zoom;
    const fitZoom = Math.min(
      (canvasRect.width - 2 * padding) / contentW,
      (canvasRect.height - 2 * padding) / contentH,
    );
    const newZoom = Math.min(Math.max(fitZoom, 0.3), 2);
    setZoom(newZoom);
    setPanOrigin({ x: 0, y: 0 });
  }, [zoom]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY;
      setZoom((prev) => {
        const step = e.ctrlKey || e.metaKey ? 0.1 : 0.05;
        const newZoom = delta < 0 ? prev + step : prev - step;
        return Math.min(Math.max(newZoom, 0.3), 2);
      });
    };

    canvas.addEventListener("wheel", handleWheel, { passive: false });

    return () => {
      canvas.removeEventListener("wheel", handleWheel);
    };
  }, []);

  // P1-1 + P1-2: 撤销/重做包装 —
  // ① saving 中冻结防止 in-flight 请求与本地状态分叉；
  // ② 撤销/重做后用 findWorkflowGraphNode 校验 selectedNodeId，丢失节点则清空选中。
  const undo = useCallback(() => {
    if (saving) return;
    rawUndo();
  }, [saving, rawUndo]);

  const redo = useCallback(() => {
    if (saving) return;
    rawRedo();
  }, [saving, rawRedo]);

  const canUndo = rawCanUndo && !saving;
  const canRedo = rawCanRedo && !saving;

  // 撤销/重做后图变化触发 effect：若当前 selectedNodeId 已被撤销/重做"恢复删除"或"还原创建"导致缺席，清空选中。
  useEffect(() => {
    if (!selectedNodeId) return;
    if (!findWorkflowGraphNode(graphModel, selectedNodeId)) {
      setSelectedNodeId(null);
    }
  }, [graphModel, selectedNodeId]);

  const applyGraphChange = useCallback(
    (
      nextGraph: WorkflowGraphDefinition,
      options?: {
        clearSelection?: boolean;
        successMessage?: string;
      },
    ) => {
      try {
        replaceGraphState(nextGraph);
      } catch (error) {
        console.error("[WorkflowBuilder] graph edit apply failed", error);
        toast.error("图模型更新失败，请重试");
        return false;
      }

      if (options?.clearSelection) {
        setSelectedNodeId(null);
      }

      if (options?.successMessage) {
        toast.success(options.successMessage);
      }

      return true;
    },
    [replaceGraphState],
  );

  const handleCopyNode = useCallback(
    (nodeId: string) => {
      const currentGraph = graphModelRef.current;
      const node = findWorkflowGraphNode(currentGraph, nodeId);
      if (!node || node.type === NodeType.START || node.type === NodeType.END) {
        toast.error("此节点不可复制");
        return;
      }

      const copiedSubgraph = cloneWorkflowGraphSubgraph(
        currentGraph,
        nodeId,
        generateNodeId,
        { titleSuffix: " (副本)" },
      );
      if (!copiedSubgraph) {
        toast.error("节点复制失败");
        return;
      }

      const nextGraph = insertWorkflowGraphSubgraphAfter(
        currentGraph,
        nodeId,
        copiedSubgraph.subgraph,
        copiedSubgraph.rootId,
      );
      applyGraphChange(nextGraph, { successMessage: "节点已复制" });
    },
    [applyGraphChange],
  );

  const handleAddBranch = useCallback(
    (targetId: string) => {
      const currentGraph = graphModelRef.current;
      let parentId = targetId;
      let parentNode = findWorkflowGraphNode(currentGraph, targetId);

      if (parentNode?.type === NodeType.END) {
        if (isWorkflowGraphSharedEndNode(currentGraph, targetId)) {
          toast.error("共享结束节点不能直接添加分支");
          return;
        }
        const endParentId = findWorkflowGraphParentNodeId(currentGraph, targetId);
        if (endParentId) {
          parentId = endParentId;
          parentNode = findWorkflowGraphNode(currentGraph, endParentId);
        } else {
          toast.error("无法在当前位置添加分支");
          return;
        }
      }

      if (parentNode?.type === NodeType.PARALLEL) {
        const signType = parentNode.signType;
        if (
          signType &&
          ["ALL", "ANY", "PERCENT", "SEQUENTIAL"].includes(String(signType))
        ) {
          toast.error(
            `会签节点"${parentNode.title}"已配置${signType === "ALL" ? "全签" : signType === "ANY" ? "或签" : signType === "PERCENT" ? "比例签" : "顺序签"}模式，不能同时添加分支。如需使用并行分支，请先在属性面板中移除会签配置。`,
          );
          return;
        }
      }

      const newBranch: WorkflowGraphNode = {
        id: generateNodeId("branch"),
        type: NodeType.CONDITION,
        title: "新分支",
        condition: "amount > 0",
      };
      const defaultStrategy =
        parentNode?.type === NodeType.PARALLEL ? "PARALLEL" : "EXCLUSIVE";
      const nextGraph = appendWorkflowGraphBranch(
        currentGraph,
        parentId,
        newBranch,
        defaultStrategy,
      );
      applyGraphChange(nextGraph);
    },
    [applyGraphChange],
  );

  const handleAddNext = useCallback(
    (parentId: string, type?: NodeType) => {
      const currentGraph = graphModelRef.current;
      const nodeType = type || NodeType.APPROVAL;

      const resolveAnchorId = (
        graph: WorkflowGraphDefinition,
        targetId: string,
      ): string | null => {
        const targetNode = graph.nodes.find((node) => node.id === targetId);
        if (!targetNode) {
          return null;
        }

        if (String(targetNode.type || "").toUpperCase() !== NodeType.END) {
          return targetId;
        }

        const incomingEdges = getWorkflowGraphIncomingEdges(graph, targetId);
        if (incomingEdges.length > 1) {
          return targetId;
        }
        const incomingEdge = incomingEdges[0];
        return incomingEdge?.source || null;
      };

      const getTitleByType = (type: NodeType): string => {
        switch (type) {
          case NodeType.END:
            return "流程结束";
          case NodeType.PARALLEL:
            return "新会签节点";
          case NodeType.NOTIFICATION:
            return "新通知节点";
          case NodeType.SCRIPT:
            return "新脚本节点";
          case NodeType.TIMER:
            return "新定时节点";
          case NodeType.SUBPROCESS:
            return "新子流程节点";
          case NodeType.MANUAL:
            return "新人工任务";
          case NodeType.COPY:
            return "新抄送节点";
          default:
            return "新审批节点";
        }
      };

      const buildNewNode = (): WorkflowGraphNode => ({
        id: generateNodeId("node"),
        type: nodeType,
        title: getTitleByType(nodeType),
        ...(nodeType === NodeType.APPROVAL
          ? { approverType: "ROLE" as const }
          : {}),
        ...(nodeType === NodeType.PARALLEL
          ? { approverType: "ROLE" as const, signType: "ALL" as const }
          : {}),
        ...(nodeType === NodeType.MANUAL
          ? { approverType: "ROLE" as const }
          : {}),
        ...(nodeType === NodeType.SCRIPT
          ? { props: { scriptType: "API", apiMethod: "POST" } }
          : {}),
      });

      const applyInsert = (
        graph: WorkflowGraphDefinition,
        successMessage?: string,
      ) => {
        const anchorId = resolveAnchorId(graph, parentId);
        if (!anchorId) {
          toast.error("无法在当前位置添加节点");
          return;
        }

        const anchorNode = findWorkflowGraphNode(graph, anchorId);

        if (
          nodeType !== NodeType.END &&
          anchorNode &&
          isMultiBranchDecisionNode(anchorNode, graph)
        ) {
          handleAddBranch(anchorId);
          return;
        }

        const isSharedEnd =
          anchorNode?.type === NodeType.END &&
          isWorkflowGraphSharedEndNode(graph, anchorId);

        const nextGraph =
          nodeType === NodeType.END
            ? replaceWorkflowGraphNextNode(graph, anchorId, buildNewNode())
            : isSharedEnd
              ? insertWorkflowGraphNodeBeforeMergeEnd(
                  graph,
                  anchorId,
                  buildNewNode(),
                )
              : insertWorkflowGraphNodeAfter(graph, anchorId, buildNewNode());
        if (nextGraph === graph) {
          toast.error("无法在当前位置添加节点");
          return;
        }
        applyGraphChange(
          nextGraph,
          successMessage ? { successMessage } : undefined,
        );
      };

      const hasEndInGraph = currentGraph.nodes.some(
        (node) => String(node.type || "").toUpperCase() === NodeType.END,
      );

      if (nodeType === NodeType.END && hasEndInGraph) {
        setConfirmDialog({
          open: true,
          message:
            "流程中已存在结束节点。添加新的结束节点将会删除当前节点之后的所有节点。是否继续?",
          onConfirm: () => {
            applyInsert(graphModelRef.current, "已添加结束节点");
          },
        });
        return;
      }

      applyInsert(currentGraph);
    },
    [applyGraphChange, handleAddBranch],
  );

  const handleUpdateNode = useCallback(
    (id: string, data: Partial<WorkflowGraphNode>) => {
      const nextGraph = patchWorkflowGraphNode(graphModelRef.current, id, data);
      applyGraphChange(nextGraph);
    },
    [applyGraphChange],
  );

  const handleDeleteNode = useCallback(
    (id: string) => {
      const currentGraph = graphModelRef.current;
      const node = findWorkflowGraphNode(currentGraph, id);
      if (!node) return;
      if (node.type === NodeType.START) {
        toast.error("开始节点不可删除");
        return;
      }
      if (node.type === NodeType.END) {
        toast.error("结束节点不可删除");
        return;
      }

      const parentNodeId = findWorkflowGraphParentNodeId(currentGraph, id);
      if (parentNodeId && isWorkflowGraphBranchRoot(currentGraph, id)) {
        // P1-3: 分支根删除文案明确级联节点数（DFS 子树大小 - 1 = 下属节点数）
        const subtreeIds = new Set<string>();
        const stack = [id];
        while (stack.length > 0) {
          const cur = stack.pop()!;
          if (subtreeIds.has(cur)) continue;
          subtreeIds.add(cur);
          currentGraph.edges
            .filter((e) => e.source === cur)
            .forEach((e) => {
              const t = findWorkflowGraphNode(currentGraph, e.target);
              // END 节点不算分支自身的下属（与 removeWorkflowGraphBranch 语义一致）
              if (t && t.type !== NodeType.END) {
                stack.push(e.target);
              }
            });
        }
        const subordinateCount = Math.max(0, subtreeIds.size - 1);
        const subordinateText =
          subordinateCount > 0 ? `及其下属 ${subordinateCount} 个节点` : "";
        setConfirmDialog({
          open: true,
          message: `将删除整条分支${subordinateText}，是否继续？`,
          onConfirm: () => {
            const nextGraph = removeWorkflowGraphBranch(
              graphModelRef.current,
              parentNodeId,
              id,
            );
            applyGraphChange(nextGraph, {
              clearSelection: true,
              successMessage: "已删除分支",
            });
          },
        });
        return;
      }

      const branchCount = countWorkflowGraphBranches(currentGraph, id);
      if (branchCount > 0) {
        setConfirmDialog({
          open: true,
          message: `节点"${node.title}"自身下方挂载了 ${branchCount} 个分支，删除该节点将导致这些分支结构彻底毁坏并丢失。是否继续？`,
          onConfirm: () => {
            const nextGraph = removeWorkflowGraphNode(graphModelRef.current, id);
            applyGraphChange(nextGraph, {
              clearSelection: true,
              successMessage: "节点及其分支已删除",
            });
          },
        });
        return;
      }

      // P1-3: 普通节点删除也走 confirmDialog，与右键 / 属性面板路径保持一致
      setConfirmDialog({
        open: true,
        message: `确定要删除节点"${node.title}"吗？`,
        onConfirm: () => {
          const nextGraph = removeWorkflowGraphNode(graphModelRef.current, id);
          applyGraphChange(nextGraph, {
            clearSelection: true,
            successMessage: "节点已删除",
          });
        },
      });
    },
    [applyGraphChange],
  );

  const handleDrop = useCallback(
    (dragId: string, dropId: string) => {
      const currentGraph = graphModelRef.current;

      if (dragId === dropId) return;

      const dragNode = findWorkflowGraphNode(currentGraph, dragId);
      if (!dragNode) return;
      const dragInsideBranch = isWorkflowGraphNodeInsideBranchScope(
        currentGraph,
        dragId,
      );
      const dropInsideBranch = isWorkflowGraphNodeInsideBranchScope(
        currentGraph,
        dropId,
      );
      if (dragInsideBranch === null || dropInsideBranch === null) {
        toast.error("拖拽目标已失效，请重试");
        return;
      }
      if (dragInsideBranch !== dropInsideBranch) {
        toast.error("暂不支持主干与分支之间直接拖拽，请使用复制+删除方式调整");
        return;
      }

      if (dragNode.type === NodeType.START || dragNode.type === NodeType.END) {
        toast.error("开始和结束节点不能移动");
        return;
      }
      if (isWorkflowGraphSharedEndNode(currentGraph, dropId)) {
        toast.error("共享结束节点前的公共位置暂不支持拖拽调整");
        return;
      }

      if (dragInsideBranch) {
        toast.error("分支节点不能移动，这会破坏流程结构");
        return;
      }

      if (isWorkflowGraphNodeInBranchSubtree(currentGraph, dragId, dropId)) {
        toast.error("不能将节点移动到自己的子节点中，这会导致循环引用");
        return;
      }

      if (findWorkflowGraphMainTargetId(currentGraph, dropId) === dragId) {
        toast.info("节点已在该位置，无需移动");
        return;
      }

      const nextGraph = moveWorkflowGraphNode(
        graphModelRef.current,
        dragId,
        dropId,
      );
      applyGraphChange(nextGraph, {
        successMessage: "节点已移动（仅移动当前节点，后续节点保留在原位）",
      });
    },
    [applyGraphChange],
  );

  // 键盘快捷键支持
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        (e.ctrlKey || e.metaKey) &&
        !e.shiftKey &&
        e.key.toLowerCase() === "z"
      ) {
        e.preventDefault();
        if (canUndo) undo();
      }
      if (
        ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") ||
        ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "z")
      ) {
        e.preventDefault();
        if (canRedo) redo();
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        const activeElement = document.activeElement;
        if (
          activeElement instanceof HTMLInputElement ||
          activeElement instanceof HTMLTextAreaElement ||
          (activeElement &&
            "isContentEditable" in activeElement &&
            activeElement.isContentEditable)
        ) {
          return;
        }
        if (selectedGraphNode && selectedGraphNode.type !== NodeType.START) {
          e.preventDefault();
          handleDeleteNode(selectedGraphNode.id);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [canUndo, canRedo, undo, redo, selectedGraphNode, handleDeleteNode]);

  // P1-4: 保存/发布前置校验，失败时自动定位首个违规节点。
  const runPreSaveValidation = useCallback((): boolean => {
    const { errors, errorNodes } = validateWorkflowGraph(graphModel);
    setInvalidNodeIds(errorNodes);

    if (!workflowName || workflowName.trim() === "") {
      toast.error("请输入流程名称");
      return false;
    }
    if (!workflowKey || workflowKey.trim() === "") {
      toast.error("请输入流程标识 (KEY)");
      return false;
    }
    if (!/^[a-zA-Z0-9_]+$/.test(workflowKey)) {
      toast.error("流程标识格式不正确: 只能包含英文字母、数字和下划线");
      return false;
    }

    if (errors.length > 0) {
      const firstInvalidId = errorNodes[0];
      const firstInvalidNode = firstInvalidId
        ? findWorkflowGraphNode(graphModel, firstInvalidId)
        : null;
      if (firstInvalidId) {
        setSelectedNodeId(firstInvalidId);
        // 等下一帧 DOM 更新完再滚动，否则 querySelector 找不到刚被选中的卡片。
        requestAnimationFrame(() => {
          const el = document.querySelector(
            `[data-node-id="${firstInvalidId}"]`,
          );
          if (el && "scrollIntoView" in el) {
            (el as HTMLElement).scrollIntoView({
              behavior: "smooth",
              block: "center",
            });
          }
        });
        toast.error(
          `已定位到首个违规节点：${firstInvalidNode?.title || firstInvalidId}`,
        );
      }
      errors.forEach((err) => toast.error(err));
      return false;
    }
    return true;
  }, [graphModel, workflowName, workflowKey]);

  const handleSave = async () => {
    if (!runPreSaveValidation()) return;

    if (onSave && workflow) {
      setSaving(true);
      try {
        const snapshot = buildWorkflowSnapshot();
        if (snapshot) {
          await onSave(snapshot);
        }
      } finally {
        setSaving(false);
      }
      return;
    }
    try {
      setSaving(true);
      const definition = buildDefinitionPayload();
      await saveProcessDefinition(definition);
      toast.success("流程已保存");
    } catch (e) {
      console.error(e);
      toast.error(getErrorMessage(e, "保存失败"));
    } finally {
      setSaving(false);
    }
  };

  const handleDeploy = async () => {
    if (!runPreSaveValidation()) return;

    try {
      setSaving(true);
      const definition = buildDefinitionPayload();
      const saveRes = await saveProcessDefinition(definition);
      const definitionId = (saveRes as any)?.id || saveRes;
      if (!definitionId) {
        toast.error("发布失败：无法获取流程ID");
        return;
      }
      const normalizedDefinitionId = String(definitionId);
      if (onChange) {
        const snapshot = buildWorkflowSnapshot();
        if (snapshot && snapshot.id !== normalizedDefinitionId) {
          onChange({ ...snapshot, id: normalizedDefinitionId });
        }
      }
      await deployProcessDefinition(normalizedDefinitionId);
      toast.success("流程已发布并上线！");
    } catch (e) {
      console.error(e);
      toast.error(getErrorMessage(e, "发布失败"));
    } finally {
      setSaving(false);
    }
  };

  const handleSettingsSave = (settings: {
    description: string;
    category: string;
    tags: string[];
    formId: string;
    startPermissionType: string;
    startPermissionValue: string;
  }) => {
    setWorkflowDescription(settings.description);
    setWorkflowCategory(normalizeWorkflowCategory(settings.category));
    setWorkflowTags(settings.tags);
    setSelectedFormId(settings.formId);
    setStartPermissionType(settings.startPermissionType);
    setStartPermissionValue(settings.startPermissionValue);
    setGlobalConfig({
      formId: settings.formId || undefined,
      description: settings.description || undefined,
      category: normalizeWorkflowCategory(settings.category) || undefined,
      tags:
        settings.tags && settings.tags.length > 0
          ? settings.tags.join(", ")
          : undefined,
      startPermissionType: settings.startPermissionType || "ALL",
      startPermissionValue: settings.startPermissionValue || undefined,
    });
    toast.success("流程设置已更新");
  };

  const handleGlobalConfigUpdate = useCallback(
    (data: {
      formId?: string;
      description?: string;
      category?: string;
      tags?: string;
      startPermissionType?: string;
      startPermissionValue?: string;
    }) => {
      const next = data || {};
      const normalizedCategory = normalizeWorkflowCategory(next.category);
      const normalizedConfig = {
        ...next,
        category: normalizedCategory || undefined,
      };
      setGlobalConfig(normalizedConfig);
      setWorkflowDescription(next.description || "");
      setWorkflowCategory(normalizedCategory);
      setSelectedFormId(next.formId || "");
      setStartPermissionType(next.startPermissionType || "ALL");
      setStartPermissionValue(next.startPermissionValue || "");
      setWorkflowTags(parseTagsToArray(next.tags));
    },
    [parseTagsToArray],
  );

  // P0-4: 静默保存当前合法图谱 - 用于"查看历史"/"导出"前的预保存。
  // 抽取自 handleViewVersionHistory 与 handleExport 中近 60 行的复制逻辑。
  // 由调用方负责后续动作（跳版本页 / 触发导出下载）。
  const silentSaveCurrentGraph = useCallback(async (): Promise<{
    ok: boolean;
    reason?: string;
  }> => {
    const { errors } = validateWorkflowGraph(graphModel);
    if (errors.length > 0) {
      return { ok: false, reason: "validation" };
    }
    if (!workflowName || workflowName.trim() === "") {
      return { ok: false, reason: "name" };
    }
    if (!workflowKey || !/^[a-zA-Z0-9_]+$/.test(workflowKey)) {
      return { ok: false, reason: "key" };
    }
    setSaving(true);
    try {
      if (onSave && workflow) {
        const snapshot = buildWorkflowSnapshot();
        if (snapshot) {
          await onSave(snapshot);
        }
      } else {
        const definition = buildDefinitionPayload();
        await saveProcessDefinition(definition);
      }
      return { ok: true };
    } catch (error) {
      console.error("[WorkflowBuilder] 静默保存失败:", error);
      return { ok: false, reason: "request" };
    } finally {
      setSaving(false);
    }
  }, [
    graphModel,
    workflowName,
    workflowKey,
    onSave,
    workflow,
    buildWorkflowSnapshot,
    buildDefinitionPayload,
  ]);

  const handleViewVersionHistory = async () => {
    if (!currentWorkflowId || currentWorkflowId.startsWith("new_")) {
      return;
    }
    await silentSaveCurrentGraph();
    navigate(`/workflow/versions/${currentWorkflowId}`);
  };

  const handleExport = async () => {
    if (!workflow?.id || workflow.id.startsWith("new_")) {
      toast.error("请先保存流程后再导出");
      return;
    }

    await silentSaveCurrentGraph();

    try {
      const blob = await exportWorkflow(workflow.id, false);
      const fileName = downloadBlob(
        blob,
        `workflow_${workflowName}_${workflow.version || "1.0.0"}_${new Date().toISOString().split("T")[0]}.json`,
      );

      toast.success(`流程已导出，下载文件：${fileName}`);
    } catch (error) {
      console.error("导出失败:", error);
      toast.error("导出失败，请重试");
    }
  };

  // P0-3: 三个 useMemo 分别用各自最小依赖集生成 context value，
  // 避免一个大 context value 漏依赖导致全员 stale closure。
  const flowNodeReadValue = useMemo<FlowNodeReadContextValue>(
    () => ({
      getNode: (nodeId) => {
        const node = findWorkflowGraphNode(graphModelRef.current, nodeId);
        return node ? toEditableWorkflowNode(node) : null;
      },
      getBranchCount: (nodeId) =>
        countWorkflowGraphBranches(graphModelRef.current, nodeId),
      getBranchChildIds: (nodeId) =>
        getWorkflowGraphBranchChildIds(graphModelRef.current, nodeId),
      getBranchSharedEndId: (nodeId) =>
        findWorkflowGraphBranchSharedMergeId(graphModelRef.current, nodeId),
      getMainTargetId: (nodeId) =>
        findWorkflowGraphMainTargetId(graphModelRef.current, nodeId),
      isSharedEndNode: (nodeId) =>
        isWorkflowGraphSharedEndNode(graphModelRef.current, nodeId),
      isMultiBranchAt: (nodeId) => {
        const graph = graphModelRef.current;
        const node = findWorkflowGraphNode(graph, nodeId);
        return isMultiBranchDecisionNode(node, graph);
      },
      isBranchRootAt: (nodeId) =>
        isWorkflowGraphBranchRoot(graphModelRef.current, nodeId),
    }),
    // 读函数全部从 graphModelRef.current 读取，本身无状态依赖。
    // 这里依赖 graphModel 仅是为了在图变化时刷新 children/孙子节点的渲染。
    [graphModel],
  );

  const flowNodeActionsValue = useMemo<FlowNodeActionsContextValue>(
    () => ({
      onAddNext: handleAddNext,
      onAddBranch: handleAddBranch,
      onSelect: (nodeId) => {
        setSelectedNodeId(nodeId);
        setShowGlobalConfig(false);
      },
      onDrop: handleDrop,
      onCopy: handleCopyNode,
    }),
    [handleAddNext, handleAddBranch, handleDrop, handleCopyNode],
  );

  // setter 来自 useState 本身就是稳定引用，无需进 deps。
  const flowNodeUiValue = useMemo<FlowNodeUiContextValue>(
    () => ({
      setDraggingGlobal,
      setDraggingNodeId,
      setActiveQuickAddId,
      setHoveredNodeId,
    }),
    [],
  );

  return (
    <FlowNodeReadContext.Provider value={flowNodeReadValue}>
      <FlowNodeActionsContext.Provider value={flowNodeActionsValue}>
        <FlowNodeUiContext.Provider value={flowNodeUiValue}>
          <div className="workflow-studio-shell relative flex h-full flex-col overflow-hidden bg-white dark:bg-slate-950">
            <WorkflowToolbar
              workflowName={workflowName}
              workflowKey={workflowKey}
              workflowId={currentWorkflowId}
              onNameChange={setWorkflowName}
              onKeyChange={setWorkflowKey}
              onSave={handleSave}
              onDeploy={handleDeploy}
              onUndo={undo}
              onRedo={redo}
              canUndo={canUndo}
              canRedo={canRedo}
              onOpenSettings={() => setShowSettingsModal(true)}
              onOpenGlobalConfig={() => {
                setShowGlobalConfig(true);
                setSelectedNodeId(null);
              }}
              onViewVersionHistory={handleViewVersionHistory}
              onExport={handleExport}
              onSimulate={() => setSimulationOpen(true)}
              saving={saving}
            />

            <div
              ref={canvasRef}
              className={`workflow-studio-canvas relative flex flex-1 justify-center overflow-hidden bg-slate-50/60 p-4 transition-all duration-300 ease-out dark:bg-slate-950 ${isPanning ? "cursor-grabbing" : "cursor-default"} ${selectedGraphNode ? "mr-[24rem]" : ""}`}
              onPointerDown={(e) => {
                if (
                  (e.button === 0 && e.target === canvasRef.current) ||
                  e.button === 1
                ) {
                  e.preventDefault();
                  setIsPanning(true);
                  setPanStart({
                    x: e.clientX - panOrigin.x,
                    y: e.clientY - panOrigin.y,
                  });
                }
              }}
              onPointerMove={(e) => {
                if (isPanning) {
                  setPanOrigin({
                    x: e.clientX - panStart.x,
                    y: e.clientY - panStart.y,
                  });
                }
              }}
              onPointerUp={() => setIsPanning(false)}
              onPointerLeave={() => setIsPanning(false)}
              onClick={() => {
                setActiveQuickAddId(null);
                setSelectedNodeId(null);
              }}
              onDoubleClick={(e) => {
                if (e.target === canvasRef.current) handleFitToViewport();
              }}
            >
              <div
                className="absolute inset-0 pointer-events-none workflow-studio-grid"
                style={{
                  background:
                    "radial-gradient(rgba(148,163,184,0.22) 0.8px, transparent 0.8px)",
                  backgroundSize: "24px 24px",
                  backgroundPosition: `${panOrigin.x}px ${panOrigin.y}px`,
                }}
              />

              <div className="workflow-studio-zoom absolute bottom-4 right-4 z-20 flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1 dark:border-slate-800 dark:bg-slate-950">
                <button
                  onClick={handleZoomOut}
                  className="rounded p-1.5 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-900"
                  title="缩小"
                >
                  <ZoomOut size={16} />
                </button>
                <span className="min-w-[40px] text-center font-mono text-xs text-slate-500 dark:text-slate-400">
                  {Math.round(zoom * 100)}%
                </span>
                <button
                  onClick={handleZoomIn}
                  className="rounded p-1.5 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-900"
                  title="放大"
                >
                  <ZoomIn size={16} />
                </button>
                <div className="mx-0.5 h-4 w-px bg-slate-200 dark:bg-slate-800" />
                <button
                  onClick={handleZoomReset}
                  className="rounded p-1.5 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-900"
                  title="重置缩放"
                >
                  <Maximize2 size={16} />
                </button>
              </div>

              {isDraggingGlobal && (
                <div className="absolute left-1/2 top-4 z-20 flex -translate-x-1/2 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-[11px] text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
                  <Move size={14} /> 拖拽节点到连接线上的"拖到这里"区域即可移动
                </div>
              )}

              <div
                className="min-w-[800px] flex justify-center pb-40 transition-transform origin-top z-10"
                style={{
                  transform: `translate(${panOrigin.x}px, ${panOrigin.y}px) scale(${zoom})`,
                }}
              >
                {rootNodeId && (
                  <FlowNode
                    nodeId={rootNodeId}
                    invalidNodes={invalidNodeIds}
                    selectedNodeId={selectedNodeId}
                    isDraggingGlobal={isDraggingGlobal}
                    draggingNodeId={draggingNodeId}
                    activeQuickAddId={activeQuickAddId}
                    hoveredNodeId={hoveredNodeId}
                    isInsideBranch={false}
                  />
                )}
              </div>
            </div>

            {selectedEditorNode && (
              <PropertyPanel
                node={selectedEditorNode}
                branchCount={selectedNodeBranchCount}
                onClose={() => setSelectedNodeId(null)}
                onUpdate={handleUpdateNode}
                onDelete={handleDeleteNode}
                onConfirmAction={(message, onConfirm) =>
                  setConfirmDialog({ open: true, message, onConfirm })
                }
              />
            )}

            <GlobalPropertyPanel
              open={showGlobalConfig}
              onClose={() => setShowGlobalConfig(false)}
              workflow={globalConfig}
              onUpdate={handleGlobalConfigUpdate}
            />

            <WorkflowSettingsModal
              open={showSettingsModal}
              onClose={() => setShowSettingsModal(false)}
              workflowName={workflowName}
              workflowKey={workflowKey}
              description={workflowDescription}
              category={workflowCategory}
              tags={workflowTags}
              formId={selectedFormId}
              startPermissionType={startPermissionType}
              startPermissionValue={startPermissionValue}
              availableForms={availableForms}
              availableRoles={availableRoles}
              availableUsers={availableUsers?.map((u) => ({
                userId: Number(u.id) || undefined,
                userName: u.username || u.name,
                nickName: u.name,
              }))}
              onSave={handleSettingsSave}
            />

            <ConfirmDialog
              open={confirmDialog.open}
              title="确认操作"
              message={confirmDialog.message}
              confirmText="确定"
              cancelText="取消"
              onConfirm={() => {
                confirmDialog.onConfirm();
                setConfirmDialog({
                  open: false,
                  message: "",
                  onConfirm: () => {},
                });
              }}
              onCancel={() =>
                setConfirmDialog({
                  open: false,
                  message: "",
                  onConfirm: () => {},
                })
              }
            />

            <SimulationDialog
              open={simulationOpen}
              onClose={() => setSimulationOpen(false)}
              definitionId={currentWorkflowId}
            />
          </div>
        </FlowNodeUiContext.Provider>
      </FlowNodeActionsContext.Provider>
    </FlowNodeReadContext.Provider>
  );
};
