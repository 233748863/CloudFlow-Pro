import {
  GitBranch,
  UserCheck,
  Layers,
  Bell,
  Code,
  Clock,
  Workflow,
  ClipboardCheck,
  Send,
  Flag,
} from "lucide-react";
import { NodeType, WorkflowGraphNode } from "../../types";
import {
  APPROVER_CACHE_PREFIX,
  APPROVER_CACHE_TTL_MS,
  APPROVER_TYPE_LABELS,
  BRANCH_STRATEGY_LABELS,
  NODE_TYPE_LABELS,
  NODE_VISUAL,
} from "./constants";
import type {
  ApproverCacheEntry,
  ApproverCacheType,
  EditableWorkflowNode,
  QuickAddOption,
} from "./types";

/**
 * 生成唯一节点 ID
 * 使用 crypto.randomUUID（浏览器原生支持）避免 Date.now() 在同一毫秒内产生重复 ID
 */
export const generateNodeId = (prefix: string = "node"): string => {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
};

export const toEditableWorkflowNode = (
  node: WorkflowGraphNode,
): EditableWorkflowNode =>
  ({
    ...node,
    title: typeof node.title === "string" ? node.title : "",
  }) as EditableWorkflowNode;

export const getNodeVisual = (type: string) =>
  NODE_VISUAL[type] || NODE_VISUAL[NodeType.APPROVAL];

export const getNodeMetaText = (
  node: EditableWorkflowNode,
  branchCount: number,
): string => {
  if (node.type === NodeType.PARALLEL) {
    if (branchCount > 0 && node.branchStrategy) {
      const strategyLabel =
        BRANCH_STRATEGY_LABELS[node.branchStrategy] || node.branchStrategy;
      return `${strategyLabel} · ${branchCount} 分支`;
    }
    if (node.signType === "ANY") return "会签 · 或签";
    if (node.signType === "PERCENT")
      return `会签 · 比例签 ${node.passPercent || 0}%`;
    if (node.signType === "SEQUENTIAL") return "会签 · 顺序签";
    return "会签 · 全签";
  }

  if (branchCount > 0 && node.branchStrategy) {
    const strategyLabel =
      BRANCH_STRATEGY_LABELS[node.branchStrategy] || node.branchStrategy;
    return `${strategyLabel} · ${branchCount} 分支`;
  }

  return NODE_TYPE_LABELS[node.type] || node.type;
};

export const getNodeAssigneeSummary = (node: EditableWorkflowNode): string => {
  const approverTypeLabel = node.approverType
    ? APPROVER_TYPE_LABELS[node.approverType] || node.approverType
    : "";
  if (!node.approverValue) return approverTypeLabel;

  const displayText = node.props?.approverLabel || node.approverValue;
  const parts = displayText
    .split(",")
    .map((item: string) => item.trim())
    .filter(Boolean);
  const compactText =
    parts.length > 2
      ? `${parts.slice(0, 2).join(", ")} 等${parts.length}项`
      : displayText;

  return approverTypeLabel
    ? `${approverTypeLabel} · ${compactText}`
    : compactText;
};

export const buildQuickAddOptions = (
  canAddBranch: boolean,
  includeEnd: boolean,
  options?: {
    parentIsMultiBranch?: boolean;
    parentIsBranchRoot?: boolean;
  },
): QuickAddOption[] => {
  // 多分支决策节点：只允许追加分支，禁掉所有顺序节点选项，消除"+号挂 END"歧义
  if (options?.parentIsMultiBranch && canAddBranch) {
    return [
      {
        type: NodeType.CONDITION,
        icon: GitBranch,
        label: "添加分支",
        isBranch: true,
      },
    ];
  }

  const items: QuickAddOption[] = [
    { type: NodeType.APPROVAL, icon: UserCheck, label: "审批节点" },
    { type: NodeType.PARALLEL, icon: Layers, label: "会签节点" },
    { type: NodeType.NOTIFICATION, icon: Bell, label: "通知节点" },
    { type: NodeType.SCRIPT, icon: Code, label: "脚本节点" },
    { type: NodeType.TIMER, icon: Clock, label: "定时节点" },
    { type: NodeType.SUBPROCESS, icon: Workflow, label: "子流程节点" },
    { type: NodeType.MANUAL, icon: ClipboardCheck, label: "人工任务" },
    { type: NodeType.COPY, icon: Send, label: "抄送节点" },
  ];

  // 分支根节点：禁掉「条件分支」选项避免在分支根上再嵌一层分支
  if (canAddBranch && !options?.parentIsBranchRoot) {
    items.push({
      type: NodeType.CONDITION,
      icon: GitBranch,
      label: "条件分支",
      isBranch: true,
    });
  }

  if (includeEnd) {
    items.push({ type: NodeType.END, icon: Flag, label: "结束节点" });
  }

  return items;
};

// 按租户+用户隔离缓存，避免跨租户/跨账号复用审批候选数据
const getApproverCacheKey = (type: ApproverCacheType): string => {
  try {
    const rawUser = localStorage.getItem("user");
    if (!rawUser) return `${APPROVER_CACHE_PREFIX}anonymous_${type}`;
    const user = JSON.parse(rawUser) as Record<string, unknown>;
    const tenantId = String(user.tenantId ?? "default");
    const userId = String(
      user.id ?? user.userId ?? user.username ?? "anonymous",
    );
    return `${APPROVER_CACHE_PREFIX}${tenantId}_${userId}_${type}`;
  } catch {
    return `${APPROVER_CACHE_PREFIX}anonymous_${type}`;
  }
};

export const readApproverCache = (type: ApproverCacheType): any[] | null => {
  try {
    const cacheKey = getApproverCacheKey(type);
    const raw = localStorage.getItem(cacheKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ApproverCacheEntry;
    if (!parsed?.expiresAt || Date.now() > parsed.expiresAt) {
      localStorage.removeItem(cacheKey);
      return null;
    }
    return Array.isArray(parsed.data) ? parsed.data : null;
  } catch {
    return null;
  }
};

export const writeApproverCache = (type: ApproverCacheType, data: any[]) => {
  try {
    const cacheKey = getApproverCacheKey(type);
    const payload: ApproverCacheEntry = {
      data: Array.isArray(data) ? data : [],
      expiresAt: Date.now() + APPROVER_CACHE_TTL_MS,
    };
    localStorage.setItem(cacheKey, JSON.stringify(payload));
  } catch {
    // 忽略缓存写入失败，保持选择器功能可用
  }
};

export const flattenDeptTree = (nodes: any[], result: any[] = []): any[] => {
  nodes.forEach((node) => {
    result.push(node);
    if (Array.isArray(node.children) && node.children.length > 0) {
      flattenDeptTree(node.children, result);
    }
  });
  return result;
};
