import { memo, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  BaseEdge,
  Controls,
  EdgeLabelRenderer,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  applyNodeChanges,
  getSmoothStepPath,
  useReactFlow,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeChange,
  type NodeProps,
  type OnMoveEnd,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Copy, GitMerge, GripVertical, Plus } from "lucide-react";
import { NodeType, type WorkflowGraphDefinition } from "../../types";
import {
  studioQuickAddMenuClassName,
  quickAddOptionIconClassName,
} from "./constants";
import {
  buildQuickAddOptions,
  getNodeAssigneeSummary,
  getNodeMetaText,
  getNodeVisual,
} from "./helpers";
import {
  useFlowNodeActions,
  useFlowNodeRead,
  useFlowNodeUi,
} from "./FlowNodeActionsContext";

type WorkflowCanvasNodeData = {
  invalidNodes: string[];
  selectedNodeId: string | null;
  activeQuickAddId: string | null;
};

type WorkflowCanvasEdgeData = {
  isDraggingGlobal: boolean;
  draggingNodeId: string | null;
  condition?: string;
  isDefault?: boolean;
};

type WorkflowCanvasNode = Node<WorkflowCanvasNodeData, "workflowNode">;
type WorkflowCanvasEdge = Edge<WorkflowCanvasEdgeData, "workflowEdge">;

interface WorkflowCanvasProps {
  graph: WorkflowGraphDefinition;
  invalidNodeIds: string[];
  selectedNodeId: string | null;
  activeQuickAddId: string | null;
  hoveredNodeId: string | null;
  draggingNodeId: string | null;
  isDraggingGlobal: boolean;
  hasSelectedNode: boolean;
  fitViewSignal?: number;
  onNodePositionChange: (nodeId: string, position: { x: number; y: number }) => void;
  onViewportChange: (viewport: { x: number; y: number; zoom: number }) => void;
}

const WorkflowCanvasNodeView = memo(
  ({ id, data }: NodeProps<WorkflowCanvasNode>) => {
    const read = useFlowNodeRead();
    const actions = useFlowNodeActions();
    const ui = useFlowNodeUi();
    const displayNode = read.getNode(id);
    const branchCount = read.getBranchCount(id);
    const branchChildIds = read.getBranchChildIds(id);
    const showQuickAdd = data.activeQuickAddId === id;
    const isSelected = data.selectedNodeId === id;
    const isInvalid = data.invalidNodes.includes(id);

    if (!displayNode) {
      return null;
    }

    const visual = getNodeVisual(displayNode.type);
    const NIcon = visual.icon;
    const canStructureDrag =
      displayNode.type !== NodeType.START && displayNode.type !== NodeType.END;
    const canAddBranch =
      displayNode.type !== NodeType.PARALLEL ||
      (displayNode.signType &&
        !["ALL", "ANY", "PERCENT", "SEQUENTIAL"].includes(
          String(displayNode.signType),
        ));
    const nodeMetaText = getNodeMetaText(displayNode, branchCount);
    const nodeAssigneeSummary = getNodeAssigneeSummary(displayNode);
    const isSharedEndNode =
      displayNode.type === NodeType.END && read.isSharedEndNode(id);
    const includeEnd = displayNode.type !== NodeType.END;
    const quickAddPosition = displayNode.type === NodeType.END ? "bottom-9" : "top-9";

    return (
      <div
        className="workflow-flow-node relative group"
        data-node-id={id}
      >
        {displayNode.type !== NodeType.START && (
          <Handle
            type="target"
            position={Position.Left}
            className="workflow-flow-handle"
          />
        )}
        {displayNode.type !== NodeType.END && (
          <Handle
            type="source"
            position={Position.Right}
            className="workflow-flow-handle"
          />
        )}
        <div
          className={`relative z-10 w-[13rem] cursor-grab rounded-md border transition-colors duration-150 ${visual.bg} ${
            isInvalid
              ? "border-rose-400 bg-rose-50/40 dark:border-rose-500 dark:bg-rose-950/10"
              : isSelected
                ? "border-cyan-300 bg-cyan-50/60 dark:border-cyan-700 dark:bg-cyan-950/20"
                : `${visual.border} hover:border-cyan-200 dark:hover:border-cyan-800`
          } active:cursor-grabbing`}
          onClick={(e) => {
            e.stopPropagation();
            actions.onSelect(id);
            ui.setActiveQuickAddId(null);
          }}
        >
          <div className="p-3">
            <div className="flex items-start gap-2">
              <div className="mt-0.5 flex h-6.5 w-6.5 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-[var(--cf-surface-strong)] dark:border-slate-800 dark:bg-slate-950">
                <NIcon size={14} className={visual.iconColor} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <div className="truncate text-sm font-semibold text-cf-body">
                        {displayNode.title}
                      </div>
                      {isSharedEndNode && (
                        <span
                          className="nodrag inline-flex shrink-0 items-center gap-0.5 rounded-sm border border-slate-200 bg-[var(--cf-surface-muted)] px-1 py-px text-[10px] font-medium text-cf-subtle dark:border-slate-700 dark:bg-slate-900"
                          data-tooltip="多分支汇聚点"
                        >
                          <GitMerge size={10} /> 汇聚
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 truncate text-[11px] text-cf-faint">
                      {nodeMetaText}
                    </div>
                  </div>
                  {canStructureDrag && (
                    <div
                      className="nodrag mt-0.5 cursor-grab text-slate-300 active:cursor-grabbing"
                      data-tooltip="拖到连线空位调整顺序"
                      draggable
                      onClick={(e) => e.stopPropagation()}
                      onDragStart={(e) => {
                        e.stopPropagation();
                        e.dataTransfer.setData("nodeId", id);
                        e.dataTransfer.effectAllowed = "move";
                        ui.setDraggingGlobal(true);
                        ui.setDraggingNodeId(id);
                      }}
                      onDragEnd={() => {
                        ui.setDraggingGlobal(false);
                        ui.setDraggingNodeId(null);
                      }}
                    >
                      <GripVertical size={14} />
                    </div>
                  )}
                </div>
                {(nodeAssigneeSummary || displayNode.condition) && (
                  <div className="mt-1.5 space-y-1 text-[11px] leading-5">
                    {nodeAssigneeSummary && (
                      <div className="truncate text-cf-muted">
                        {nodeAssigneeSummary}
                      </div>
                    )}
                    {displayNode.condition && (
                      <div className="truncate font-mono text-[10px] text-cf-subtle">
                        条件 · {displayNode.condition}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div
          className={`nodrag absolute ${
            displayNode.type === NodeType.END ? "-top-6" : "-bottom-3"
          } left-1/2 z-30 -translate-x-1/2`}
        >
          <div
            className={`relative transition-opacity duration-200 ${
              showQuickAdd
                ? "opacity-100"
                : "opacity-0 group-hover:opacity-100 focus-within:opacity-100"
            }`}
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                ui.setActiveQuickAddId(showQuickAdd ? null : id);
              }}
              className={`flex h-7 w-7 items-center justify-center rounded-md border transition-colors ${
 showQuickAdd
 ? "border-cyan-600 bg-cyan-600 text-white dark:border-cyan-400 dark:bg-cyan-500"
 : "border-slate-200 bg-[var(--cf-surface-strong)] text-cf-subtle hover:border-cyan-200 hover:text-cyan-700 dark:border-slate-700 dark:bg-slate-950 dark:hover:border-cyan-800 dark:hover:text-cyan-200"
 }`}
              data-tooltip={showQuickAdd ? "关闭菜单" : "添加节点"} aria-label={showQuickAdd ? "关闭菜单" : "添加节点"}
            >
              <Plus size={16} />
            </button>
            {showQuickAdd && (
              <div
                className={`${studioQuickAddMenuClassName} ${quickAddPosition}`}
                onClick={(e) => e.stopPropagation()}
              >
                {buildQuickAddOptions(Boolean(canAddBranch), includeEnd, {
                  parentIsMultiBranch: read.isMultiBranchAt(id),
                  parentIsBranchRoot: read.isBranchRootAt(id),
                }).map((item) => {
                  const ItemIcon = item.icon;
                  return (
                    <button
                      key={item.type}
                      className="mb-1 flex w-full items-center gap-2 rounded-md border border-transparent px-2 py-1.5 text-left transition-colors hover:bg-cyan-50 dark:hover:bg-cyan-950/20"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (item.isBranch) {
                          actions.onAddBranch(id);
                        } else {
                          actions.onAddNext(id, item.type as NodeType);
                        }
                        ui.setActiveQuickAddId(null);
                      }}
                    >
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-cyan-100 bg-cyan-50 dark:border-cyan-950/40 dark:bg-cyan-950/20">
                        <ItemIcon
                          size={14}
                          className={quickAddOptionIconClassName}
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-medium text-cf-body">
                          {item.label}
                        </div>
                      </div>
                    </button>
                  );
                })}
                {displayNode.type !== NodeType.END && (
                  <div className="mt-2 border-t border-slate-200 pt-2 dark:border-slate-800">
                    <button
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-cf-muted transition-colors hover:bg-cyan-50 hover:text-cyan-700 dark:hover:bg-cyan-950/20 dark:hover:text-cyan-200"
                      onClick={(e) => {
                        e.stopPropagation();
                        actions.onCopy(id);
                        ui.setActiveQuickAddId(null);
                      }}
                    >
                      <Copy size={14} className="text-cf-faint" /> 复制此节点
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {branchChildIds.length > 0 && (
          <div className="nodrag pointer-events-none absolute -right-2 -top-2 rounded-sm border border-slate-200 bg-[var(--cf-surface-strong)] px-1.5 py-0.5 text-[10px] font-medium text-cf-subtle dark:border-slate-700 dark:bg-slate-950">
            {branchChildIds.length} 分支
          </div>
        )}
      </div>
    );
  },
);

WorkflowCanvasNodeView.displayName = "WorkflowCanvasNodeView";

const WorkflowCanvasEdgeView = ({
  id,
  source,
  target,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  style,
  data,
}: EdgeProps<WorkflowCanvasEdge>) => {
  const actions = useFlowNodeActions();
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 12,
  });
  const isInvalidDrop = data?.draggingNodeId === source || data?.draggingNodeId === target;
  const label = data?.condition || (data?.isDefault ? "默认" : "");

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={style}
        className="workflow-flow-edge"
      />
      <EdgeLabelRenderer>
        <div
          className="nodrag nopan absolute z-20 -translate-x-1/2 -translate-y-1/2"
          style={{
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            pointerEvents: "all",
          }}
        >
          {data?.isDraggingGlobal && !isInvalidDrop ? (
            <div
              className="workflow-flow-dropzone flex h-8 w-28 cursor-pointer items-center justify-center rounded-md border border-dashed border-slate-300 bg-[var(--cf-surface-strong)] text-[11px] font-medium text-cf-subtle shadow-sm transition-colors hover:border-cyan-300 hover:bg-cyan-50 hover:text-cyan-700 dark:border-slate-700 dark:bg-slate-950 dark:hover:border-cyan-700 dark:hover:bg-cyan-950/20 dark:hover:text-cyan-200"
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const dragId = e.dataTransfer.getData("nodeId");
                if (dragId) actions.onDrop(dragId, source);
              }}
            >
              拖入空位
            </div>
          ) : label ? (
            <span className="rounded-sm border border-slate-200 bg-[var(--cf-surface-strong)] px-1.5 py-0.5 text-[10px] font-medium text-cf-subtle dark:border-slate-700 dark:bg-slate-950">
              {label}
            </span>
          ) : null}
        </div>
      </EdgeLabelRenderer>
    </>
  );
};

const nodeTypes = { workflowNode: WorkflowCanvasNodeView };
const edgeTypes = { workflowEdge: WorkflowCanvasEdgeView };

const WorkflowCanvasInner = ({
  graph,
  invalidNodeIds,
  selectedNodeId,
  activeQuickAddId,
  draggingNodeId,
  isDraggingGlobal,
  hasSelectedNode,
  fitViewSignal,
  onNodePositionChange,
  onViewportChange,
}: WorkflowCanvasProps) => {
  const actions = useFlowNodeActions();
  const ui = useFlowNodeUi();
  const { setViewport, fitView } = useReactFlow();
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const [canvasReady, setCanvasReady] = useState(false);
  const canvasNodes = useMemo<WorkflowCanvasNode[]>(
    () =>
      graph.nodes.map((node) => ({
        id: node.id,
        type: "workflowNode",
        position: graph.layout?.nodes?.[node.id] ?? { x: 0, y: 0 },
        data: {
          invalidNodes: invalidNodeIds,
          selectedNodeId,
          activeQuickAddId,
        },
      })),
    [activeQuickAddId, graph.layout?.nodes, graph.nodes, invalidNodeIds, selectedNodeId],
  );
  const canvasEdges = useMemo<WorkflowCanvasEdge[]>(
    () =>
      graph.edges.map((edge) => ({
        id: edge.id || `${edge.source}->${edge.target}`,
        source: edge.source,
        target: edge.target,
        type: "workflowEdge",
        markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
        style: { strokeWidth: 1.4 },
        data: {
          isDraggingGlobal,
          draggingNodeId,
          condition: typeof edge.condition === "string" ? edge.condition : undefined,
          isDefault: Boolean(edge.isDefault),
        },
      })),
    [draggingNodeId, graph.edges, isDraggingGlobal],
  );
  const [nodes, setNodes] = useState<WorkflowCanvasNode[]>(canvasNodes);

  useEffect(() => {
    setNodes(canvasNodes);
  }, [canvasNodes]);

  const defaultViewport = graph.layout?.viewport ?? { x: 0, y: 0, zoom: 1 };

  // B17: 持久化视口仅在画布首次获得尺寸时恢复一次；此后属性面板开合等容器尺寸变化
  // 不再把用户当前的平移/缩放重置回旧值（切换流程时组件经 key 重挂载后重新恢复）
  const viewportRestoredRef = useRef(false);
  const defaultViewportRef = useRef(defaultViewport);
  defaultViewportRef.current = defaultViewport;

  useEffect(() => {
    const canvasElement = canvasRef.current;
    if (!canvasElement) {
      return;
    }

    let frameId = 0;
    const syncViewport = () => {
      window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(() => {
        const { width, height } = canvasElement.getBoundingClientRect();
        if (width <= 0 || height <= 0) {
          return;
        }
        setCanvasReady(true);
        if (!viewportRestoredRef.current) {
          viewportRestoredRef.current = true;
          setViewport(defaultViewportRef.current, { duration: 0 });
        }
        // 视口已恢复，后续尺寸变化交给 React Flow 自身处理，不再重置
        resizeObserver.disconnect();
      });
    };
    const resizeObserver = new ResizeObserver(syncViewport);

    syncViewport();
    resizeObserver.observe(canvasElement);

    return () => {
      window.cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
    };
  }, [setViewport]);

  const handleNodesChange = (changes: NodeChange<WorkflowCanvasNode>[]) => {
    setNodes((current) => applyNodeChanges(changes, current));
  };

  const handleMoveEnd: OnMoveEnd = (_event, viewport) => {
    onViewportChange(viewport);
  };

  // 一键整理后重排了全部节点坐标，将视图重新适配到全部节点（信号首次为空时不触发，
  // 避免与持久化视口的首帧恢复相互冲突）
  const fitViewSignalRef = useRef(fitViewSignal);
  useEffect(() => {
    if (fitViewSignal === undefined || fitViewSignal === fitViewSignalRef.current) {
      fitViewSignalRef.current = fitViewSignal;
      return;
    }
    fitViewSignalRef.current = fitViewSignal;
    const frameId = window.requestAnimationFrame(() => {
      fitView({ duration: 400, padding: 0.2 });
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [fitView, fitViewSignal]);

  return (
    <div
      ref={canvasRef}
      className={`workflow-studio-canvas workflow-flow-canvas relative h-full min-h-0 flex-1 basis-0 overflow-hidden bg-[var(--cf-bg)] dark:bg-slate-950 ${
 hasSelectedNode ? "mr-[24rem]" : ""
 }`}
      onClick={() => {
        actions.onSelect("");
        ui.setActiveQuickAddId(null);
      }}
    >
      {canvasReady && (
        <ReactFlow
          nodes={nodes}
          edges={canvasEdges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={handleNodesChange}
          onNodeDragStop={(_event, node) =>
            onNodePositionChange(node.id, node.position)
          }
          onMoveEnd={handleMoveEnd}
          defaultViewport={defaultViewport}
          minZoom={0.2}
          maxZoom={2}
          fitView={false}
          nodesConnectable={false}
          elementsSelectable={false}
          deleteKeyCode={null}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={18} size={1} color="rgba(148, 163, 184, 0.32)" />
          <MiniMap
            pannable
            zoomable
            nodeStrokeWidth={2}
            className="workflow-flow-minimap"
          />
          <Controls position="bottom-right" showInteractive={false} />
        </ReactFlow>
      )}
    </div>
  );
};

export const WorkflowCanvas = (props: WorkflowCanvasProps) => (
  <ReactFlowProvider>
    <WorkflowCanvasInner {...props} />
  </ReactFlowProvider>
);
