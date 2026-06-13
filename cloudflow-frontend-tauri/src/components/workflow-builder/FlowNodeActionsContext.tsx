import React from "react";
import { NodeType } from "../../types";
import type { EditableWorkflowNode } from "./types";

// P0-3：原 FlowNodeActionsContext 单一 context 内含 onAdd*/getNode*/setDragging*/setHover* 等 18 个属性，
// 上层 useMemo 依赖列表只声明了 4 个 handler 漏了所有 setter 与读函数，stale closure 风险高。
// 这里拆成 3 个职责更小的 context：
//  - FlowNodeReadContext: 图谱读访问 (getNode/getBranch*/getMain*/isShared*/isMulti*/isBranchRoot*)
//  - FlowNodeActionsContext: 用户操作动作 (onAdd*/onSelect/onDrop/onCopy)
//  - FlowNodeUiContext: 临时画布 UI 状态 setter (setDragging*/setActive*/setHover*)
// 每个 Provider 各自管理 useMemo 依赖，颗粒度更小，遗漏 deps 的影响面也更小。

export interface FlowNodeReadContextValue {
  getNode: (nodeId: string) => EditableWorkflowNode | null;
  getBranchCount: (nodeId: string) => number;
  getBranchChildIds: (nodeId: string) => string[];
  getBranchSharedEndId: (nodeId: string) => string | null;
  getMainTargetId: (nodeId: string) => string | null;
  isSharedEndNode: (nodeId: string) => boolean;
  isMultiBranchAt: (nodeId: string) => boolean;
  isBranchRootAt: (nodeId: string) => boolean;
}

export interface FlowNodeActionsContextValue {
  onAddNext: (parentId: string, type?: NodeType) => void;
  onAddBranch: (parentId: string) => void;
  onSelect: (nodeId: string) => void;
  onDrop: (dragId: string, dropId: string) => void;
  onCopy: (nodeId: string) => void;
}

export interface FlowNodeUiContextValue {
  setDraggingGlobal: (value: boolean) => void;
  setDraggingNodeId: (id: string | null) => void;
  setActiveQuickAddId: (id: string | null) => void;
  setHoveredNodeId: (id: string | null) => void;
}

const noop = () => {};

const readFallback: FlowNodeReadContextValue = {
  getNode: () => null,
  getBranchCount: () => 0,
  getBranchChildIds: () => [],
  getBranchSharedEndId: () => null,
  getMainTargetId: () => null,
  isSharedEndNode: () => false,
  isMultiBranchAt: () => false,
  isBranchRootAt: () => false,
};

const actionsFallback: FlowNodeActionsContextValue = {
  onAddNext: noop,
  onAddBranch: noop,
  onSelect: noop as (nodeId: string) => void,
  onDrop: noop as (dragId: string, dropId: string) => void,
  onCopy: noop as (nodeId: string) => void,
};

const uiFallback: FlowNodeUiContextValue = {
  setDraggingGlobal: noop as (value: boolean) => void,
  setDraggingNodeId: noop as (id: string | null) => void,
  setActiveQuickAddId: noop as (id: string | null) => void,
  setHoveredNodeId: noop as (id: string | null) => void,
};

export const FlowNodeReadContext =
  React.createContext<FlowNodeReadContextValue>(readFallback);

export const FlowNodeActionsContext =
  React.createContext<FlowNodeActionsContextValue>(actionsFallback);

export const FlowNodeUiContext =
  React.createContext<FlowNodeUiContextValue>(uiFallback);

export const useFlowNodeRead = () => React.useContext(FlowNodeReadContext);
export const useFlowNodeActions = () =>
  React.useContext(FlowNodeActionsContext);
export const useFlowNodeUi = () => React.useContext(FlowNodeUiContext);
