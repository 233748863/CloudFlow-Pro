import { memo, useState } from "react";
import { Plus, Move, Copy, GitMerge } from "lucide-react";
import { NodeType } from "../../types";
import {
  studioQuickAddMenuClassName,
  quickAddOptionIconClassName,
  workflowConnectorLineClassName,
} from "./constants";
import {
  buildQuickAddOptions,
  getNodeAssigneeSummary,
  getNodeMetaText,
  getNodeVisual,
} from "./helpers";
import { ConnectorDropZone } from "./ConnectorDropZone";
import {
  useFlowNodeRead,
  useFlowNodeActions,
  useFlowNodeUi,
} from "./FlowNodeActionsContext";

interface FlowNodeProps {
  nodeId: string;
  invalidNodes: string[];
  draggingNodeId: string | null;
  isDraggingGlobal: boolean;
  activeQuickAddId: string | null;
  hoveredNodeId: string | null;
  selectedNodeId: string | null;
  isInsideBranch: boolean;
}

/**
 * P2-8: 用 React.memo 包裹（默认 shallow 比较）减少同级节点联动重渲染。
 * 注：handler 来自 Context Provider 应稳定；hoveredNodeId / selectedNodeId / activeQuickAddId
 * 由 props 显式传入，浅比较即可对未涉及的节点跳过重渲染。
 */
const FlowNodeInner = ({
  nodeId,
  invalidNodes,
  draggingNodeId,
  isDraggingGlobal,
  activeQuickAddId,
  hoveredNodeId,
  selectedNodeId,
  isInsideBranch,
}: FlowNodeProps) => {
  const read = useFlowNodeRead();
  const actions = useFlowNodeActions();
  const ui = useFlowNodeUi();

  const displayNode = read.getNode(nodeId);
  const branchChildIds = read.getBranchChildIds(nodeId);
  const branchCount = branchChildIds.length || read.getBranchCount(nodeId);
  const nextNodeId = read.getMainTargetId(nodeId);
  const nextDisplayNode = nextNodeId ? read.getNode(nextNodeId) : null;
  const sharedEndNodeId = read.getBranchSharedEndId(nodeId);
  const sharedEndDisplayNode = sharedEndNodeId
    ? read.getNode(sharedEndNodeId)
    : null;
  const shouldRenderBranchMerge = Boolean(nextNodeId || sharedEndNodeId);
  const [isDragging, setIsDragging] = useState(false);
  const showQuickAdd = activeQuickAddId === nodeId;
  const isSelected = selectedNodeId === nodeId;
  const isInvalid = invalidNodes.includes(nodeId);
  if (!displayNode) {
    return null;
  }
  const visual = getNodeVisual(displayNode.type);
  const NIcon = visual.icon;
  // 分支子树节点禁止拖拽：拖拽会破坏分支结构，改为前置禁用避免误操作
  const canDrag =
    !isInsideBranch &&
    displayNode.type !== NodeType.START &&
    displayNode.type !== NodeType.END;

  // 画布悬停逻辑优化（去鼠标追踪依赖，改为直接点击触发）
  const canShowHover = !activeQuickAddId || activeQuickAddId === nodeId;

  const canAddBranch =
    displayNode.type !== NodeType.PARALLEL ||
    (displayNode.signType &&
      !["ALL", "ANY", "PERCENT", "SEQUENTIAL"].includes(
        String(displayNode.signType),
      ));
  const nodeMetaText = getNodeMetaText(displayNode, branchCount);
  const nodeAssigneeSummary = getNodeAssigneeSummary(displayNode);
  const isSharedEndNode =
    displayNode.type === NodeType.END && read.isSharedEndNode(nodeId);

  return (
    <div
      className="flex flex-col items-center relative group/node"
      data-node-id={nodeId}
    >
      {/* 节点卡片容器 - 独立的相对定位容器 */}
      <div className={`relative group ${showQuickAdd ? "z-50" : ""}`}>
        {/* 节点卡片 */}
        <div
          className={`relative z-10 w-[13rem] cursor-pointer rounded-md border transition-colors duration-150 ${visual.bg} ${
            isDragging
              ? "scale-[0.98] border-slate-300 opacity-40"
              : isInvalid
                ? "border-rose-400 bg-rose-50/40 dark:border-rose-500 dark:bg-rose-950/10"
                : isSelected
                  ? "border-cyan-300 bg-cyan-50/60 dark:border-cyan-700 dark:bg-cyan-950/20"
                  : `${visual.border} hover:border-cyan-200 dark:hover:border-cyan-800`
          } active:scale-[0.99]`}
          onClick={(e) => {
            e.stopPropagation();
            actions.onSelect(nodeId);
            ui.setActiveQuickAddId(null);
          }}
          onMouseEnter={() => canShowHover && ui.setHoveredNodeId(nodeId)}
          onMouseLeave={() => canShowHover && ui.setHoveredNodeId(null)}
          draggable={canDrag}
          onDragStart={(e) => {
            e.dataTransfer.setData("nodeId", nodeId);
            e.dataTransfer.effectAllowed = "move";
            setIsDragging(true);
            ui.setDraggingGlobal(true);
            ui.setDraggingNodeId(nodeId);
          }}
          onDragEnd={() => {
            setIsDragging(false);
            ui.setDraggingGlobal(false);
            ui.setDraggingNodeId(null);
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
                      <div className="truncate text-sm font-semibold text-slate-700 dark:text-slate-100">
                        {displayNode.title}
                      </div>
                      {/* P1-5: 共享 END 节点视觉标识，与普通 END 区分 */}
                      {isSharedEndNode && (
                        <span
                          className="inline-flex shrink-0 items-center gap-0.5 rounded-sm border border-slate-200 bg-[var(--cf-surface-muted)] px-1 py-px text-[10px] font-medium text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400"
                          title="多分支汇聚点，不可在此处插入节点"
                        >
                          <GitMerge size={10} /> 汇聚
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 truncate text-[11px] text-slate-400 dark:text-slate-500">
                      {nodeMetaText}
                    </div>
                  </div>
                  {canDrag && (
                    <div
                      className="mt-0.5 text-slate-300 cursor-grab active:cursor-grabbing"
                      title="拖拽移动"
                    >
                      <Move size={14} />
                    </div>
                  )}
                </div>
                {(nodeAssigneeSummary || displayNode.condition) && (
                  <div className="mt-1.5 space-y-1 text-[11px] leading-5">
                    {nodeAssigneeSummary && (
                      <div className="truncate text-slate-600 dark:text-slate-300">
                        {nodeAssigneeSummary}
                      </div>
                    )}
                    {displayNode.condition && (
                      <div className="truncate font-mono text-[10px] text-slate-500 dark:text-slate-400">
                        条件 · {displayNode.condition}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* END节点的添加按钮 */}
        {displayNode.type === NodeType.END && (
          <div
            className="absolute -top-6 left-1/2 -translate-x-1/2 z-30"
            style={{ pointerEvents: "auto" }}
          >
            <div
              className={`relative transition-opacity duration-200 ${hoveredNodeId === nodeId || showQuickAdd ? "opacity-100" : "opacity-0"}`}
            >
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  ui.setActiveQuickAddId(showQuickAdd ? null : nodeId);
                }}
                onMouseEnter={() => canShowHover && ui.setHoveredNodeId(nodeId)}
                onMouseLeave={() =>
                  canShowHover && !showQuickAdd && ui.setHoveredNodeId(null)
                }
                className={`flex h-7 w-7 items-center justify-center rounded-md border transition-colors ${
                  showQuickAdd
                    ? "border-cyan-600 bg-cyan-600 text-white dark:border-cyan-400 dark:bg-cyan-500 dark:text-white"
                    : "border-slate-200 bg-[var(--cf-surface-strong)] text-slate-500 hover:border-cyan-200 hover:text-cyan-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-400 dark:hover:border-cyan-800 dark:hover:text-cyan-200"
                }`}
                title={showQuickAdd ? "关闭菜单" : "在此之前添加节点"}
              >
                <Plus size={16} />
              </button>
              {showQuickAdd && (
                <div
                  className={`${studioQuickAddMenuClassName} bottom-9`}
                  onClick={(e) => e.stopPropagation()}
                  onMouseEnter={(e) => {
                    e.stopPropagation();
                    ui.setHoveredNodeId(nodeId);
                  }}
                  onMouseLeave={(e) => {
                    e.stopPropagation();
                    ui.setHoveredNodeId(null);
                  }}
                  onMouseMove={(e) => {
                    e.stopPropagation();
                    e.nativeEvent.stopImmediatePropagation();
                  }}
                  style={{ pointerEvents: "auto" }}
                >
                  {buildQuickAddOptions(Boolean(canAddBranch), false, {
                    parentIsMultiBranch: false,
                    parentIsBranchRoot: false,
                  }).map((item) => {
                    const ItemIcon = item.icon;
                    return (
                      <button
                        key={item.type}
                        className="mb-1 flex w-full items-center gap-2 rounded-md border border-transparent px-2 py-1.5 text-left transition-colors hover:bg-cyan-50 dark:hover:bg-cyan-950/20"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (item.isBranch) {
                            actions.onAddBranch(nodeId);
                          } else {
                            actions.onAddNext(nodeId, item.type as NodeType);
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
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium text-slate-700 dark:text-slate-100">
                            {item.label}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* 非END节点的添加按钮 */}
        {displayNode.type !== NodeType.END && (
          <div
            className="absolute -bottom-2 left-1/2 -translate-x-1/2 z-30"
            style={{ pointerEvents: "auto" }}
          >
            <div
              className={`relative transition-opacity duration-200 ${hoveredNodeId === nodeId || showQuickAdd ? "opacity-100" : "opacity-0"}`}
            >
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  ui.setActiveQuickAddId(showQuickAdd ? null : nodeId);
                }}
                onMouseEnter={() => canShowHover && ui.setHoveredNodeId(nodeId)}
                onMouseLeave={() =>
                  canShowHover && !showQuickAdd && ui.setHoveredNodeId(null)
                }
                className={`flex h-7 w-7 items-center justify-center rounded-md border transition-colors ${
                  showQuickAdd
                    ? "border-cyan-600 bg-cyan-600 text-white dark:border-cyan-400 dark:bg-cyan-500 dark:text-white"
                    : "border-slate-200 bg-[var(--cf-surface-strong)] text-slate-500 hover:border-cyan-200 hover:text-cyan-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-400 dark:hover:border-cyan-800 dark:hover:text-cyan-200"
                }`}
                title={showQuickAdd ? "关闭菜单" : "添加节点"}
              >
                <Plus size={16} />
              </button>
              {showQuickAdd && (
                <div
                  className={`${studioQuickAddMenuClassName} top-9`}
                  onClick={(e) => e.stopPropagation()}
                  onMouseEnter={(e) => {
                    e.stopPropagation();
                    ui.setHoveredNodeId(nodeId);
                  }}
                  onMouseLeave={(e) => {
                    e.stopPropagation();
                    ui.setHoveredNodeId(null);
                  }}
                  onMouseMove={(e) => {
                    e.stopPropagation();
                    e.nativeEvent.stopImmediatePropagation();
                  }}
                  style={{ pointerEvents: "auto" }}
                >
                  {buildQuickAddOptions(Boolean(canAddBranch), true, {
                    parentIsMultiBranch: read.isMultiBranchAt(nodeId),
                    parentIsBranchRoot: read.isBranchRootAt(nodeId),
                  }).map((item) => {
                    const ItemIcon = item.icon;
                    return (
                      <button
                        key={item.type}
                        className="mb-1 flex w-full items-center gap-2 rounded-md border border-transparent px-2 py-1.5 text-left transition-colors hover:bg-cyan-50 dark:hover:bg-cyan-950/20"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (item.isBranch) {
                            actions.onAddBranch(nodeId);
                          } else {
                            actions.onAddNext(nodeId, item.type as NodeType);
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
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium text-slate-700 dark:text-slate-100">
                            {item.label}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                  <div className="mt-2 border-t border-slate-200 pt-2 dark:border-slate-800">
                    <button
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-slate-600 transition-colors hover:bg-cyan-50 hover:text-cyan-700 dark:text-slate-300 dark:hover:bg-cyan-950/20 dark:hover:text-cyan-200"
                      onClick={(e) => {
                        e.stopPropagation();
                        actions.onCopy(nodeId);
                        ui.setActiveQuickAddId(null);
                      }}
                    >
                      <Copy size={14} className="text-slate-400" /> 复制此节点
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 分支 */}
      {branchChildIds.length > 0 && (
        <div className="flex flex-col items-center w-full flex-none">
          <div className={`h-6 w-0.5 ${workflowConnectorLineClassName}`}></div>
          <div className="z-10 -mb-[1px] h-2.5 w-2.5 rotate-45 border border-slate-300 bg-[var(--cf-surface-muted)] dark:border-slate-700 dark:bg-slate-900"></div>
          <div className="relative flex w-full justify-center text-center">
            {branchChildIds.map((branchId, index) => (
              <div
                key={branchId}
                className="relative flex min-w-[13rem] flex-1 flex-col items-center"
              >
                <div className="relative h-10 w-full">
                  {index > 0 && (
                    <div
                      className={`absolute left-0 top-0 h-0.5 w-1/2 ${workflowConnectorLineClassName}`}
                    ></div>
                  )}
                  {index < branchChildIds.length - 1 && (
                    <div
                      className={`absolute right-0 top-0 h-0.5 w-1/2 ${workflowConnectorLineClassName}`}
                    ></div>
                  )}
                  <div
                    className={`absolute left-1/2 top-0 h-10 w-0.5 -translate-x-1/2 ${workflowConnectorLineClassName}`}
                  ></div>
                </div>

                <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10">
                  <div className="whitespace-nowrap rounded-sm bg-[var(--cf-surface-muted)] px-1 text-[10px] font-medium text-slate-500 dark:bg-slate-950/95 dark:text-slate-400">
                    分支 {index + 1}
                  </div>
                </div>

                <div className="flex-none flex justify-center w-full">
                  <FlowNode
                    nodeId={branchId}
                    invalidNodes={invalidNodes}
                    selectedNodeId={selectedNodeId}
                    isDraggingGlobal={isDraggingGlobal}
                    draggingNodeId={draggingNodeId}
                    activeQuickAddId={activeQuickAddId}
                    hoveredNodeId={hoveredNodeId}
                    isInsideBranch={true}
                  />
                </div>

                {shouldRenderBranchMerge && (
                  <div
                    className={`w-0.5 min-h-[40px] flex-1 ${workflowConnectorLineClassName}`}
                  ></div>
                )}
              </div>
            ))}
          </div>

          {shouldRenderBranchMerge && (
            <div className="relative flex h-0 w-full justify-center">
              {branchChildIds.map((branchId, index) => (
                <div
                  key={`${branchId}-merge`}
                  className="relative min-w-[13rem] flex-1"
                >
                  {index > 0 && (
                    <div
                      className={`absolute left-0 top-0 h-0.5 w-1/2 ${workflowConnectorLineClassName}`}
                    ></div>
                  )}
                  {index < branchChildIds.length - 1 && (
                    <div
                      className={`absolute right-0 top-0 h-0.5 w-1/2 ${workflowConnectorLineClassName}`}
                    ></div>
                  )}
                </div>
              ))}
              <div className="absolute left-1/2 top-0 z-10 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-sm border-2 border-slate-300 bg-[var(--cf-surface-strong)] dark:border-slate-700 dark:bg-slate-950"></div>
            </div>
          )}
          {sharedEndNodeId && sharedEndDisplayNode && (
            <div className="flex flex-col items-center w-full relative">
              <div className={`h-8 w-0.5 ${workflowConnectorLineClassName}`}></div>
              <FlowNode
                nodeId={sharedEndNodeId}
                invalidNodes={invalidNodes}
                selectedNodeId={selectedNodeId}
                isDraggingGlobal={isDraggingGlobal}
                draggingNodeId={draggingNodeId}
                activeQuickAddId={activeQuickAddId}
                hoveredNodeId={hoveredNodeId}
                isInsideBranch={isInsideBranch}
              />
            </div>
          )}
        </div>
      )}

      {/* 下一个节点 */}
      {nextNodeId && nextDisplayNode?.type !== NodeType.END && (
        <div className="flex flex-col items-center w-full">
          <ConnectorDropZone
            parentId={nodeId}
            isDraggingGlobal={isDraggingGlobal}
            draggingNodeId={draggingNodeId}
            selfNodeId={nextNodeId}
            onDrop={actions.onDrop}
          />
          <FlowNode
            nodeId={nextNodeId}
            invalidNodes={invalidNodes}
            selectedNodeId={selectedNodeId}
            isDraggingGlobal={isDraggingGlobal}
            draggingNodeId={draggingNodeId}
            activeQuickAddId={activeQuickAddId}
            hoveredNodeId={hoveredNodeId}
            isInsideBranch={isInsideBranch}
          />
        </div>
      )}

      {nextNodeId &&
        nextDisplayNode?.type === NodeType.END &&
        !read.isSharedEndNode(nextNodeId) && (
          <div className="flex flex-col items-center w-full relative">
            <ConnectorDropZone
              parentId={nodeId}
              isDraggingGlobal={isDraggingGlobal}
              draggingNodeId={draggingNodeId}
              selfNodeId={nextNodeId}
              onDrop={actions.onDrop}
            />
            <FlowNode
              nodeId={nextNodeId}
              invalidNodes={invalidNodes}
              selectedNodeId={selectedNodeId}
              isDraggingGlobal={isDraggingGlobal}
              draggingNodeId={draggingNodeId}
              activeQuickAddId={activeQuickAddId}
              hoveredNodeId={hoveredNodeId}
              isInsideBranch={isInsideBranch}
            />
          </div>
        )}
    </div>
  );
};

export const FlowNode = memo(FlowNodeInner);
