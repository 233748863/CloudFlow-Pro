import React from "react";
import {
  PlayCircle,
  UserCheck,
  GitBranch,
  Layers,
  Flag,
  Bell,
  Code,
  Clock,
  Workflow,
  ClipboardCheck,
  Send,
} from "lucide-react";
import { NodeType } from "../../types";

export const NODE_TYPE_LABELS: Record<string, string> = {
  [NodeType.START]: "开始",
  [NodeType.APPROVAL]: "审批",
  [NodeType.CONDITION]: "条件判断",
  [NodeType.PARALLEL]: "同时处理",
  [NodeType.END]: "完成",
  [NodeType.NOTIFICATION]: "通知",
  [NodeType.SCRIPT]: "脚本",
  [NodeType.TIMER]: "定时",
  [NodeType.SUBPROCESS]: "子流程",
  [NodeType.MANUAL]: "人工任务",
  [NodeType.COPY]: "抄送",
};

export const APPROVER_TYPE_LABELS: Record<string, string> = {
  ROLE: "按角色",
  USER: "指定人员",
  USERS: "指定多人",
  INITIATOR: "发起人",
  DEPT_MANAGER: "部门负责人",
  DIRECT_LEADER: "直属上级",
  DEPT: "按部门",
};

export const BRANCH_STRATEGY_LABELS: Record<string, string> = {
  EXCLUSIVE: "单选分支",
  PARALLEL: "并行处理",
};

const neutralNodeVisual = {
  bg: "bg-[var(--cf-surface-strong)] dark:bg-slate-950",
  iconBg: "bg-cyan-50 dark:bg-cyan-950/30",
  iconColor: "text-cyan-700 dark:text-cyan-200",
  border: "border-slate-200 dark:border-slate-800",
};

export const NODE_VISUAL: Record<
  string,
  {
    icon: React.FC<{ size?: number; className?: string }>;
    bg: string;
    iconBg: string;
    iconColor: string;
    border: string;
    label: string;
  }
> = {
  [NodeType.START]: { ...neutralNodeVisual, icon: PlayCircle, label: "开始" },
  [NodeType.APPROVAL]: { ...neutralNodeVisual, icon: UserCheck, label: "审批" },
  [NodeType.CONDITION]: { ...neutralNodeVisual, icon: GitBranch, label: "条件" },
  [NodeType.PARALLEL]: { ...neutralNodeVisual, icon: Layers, label: "并行" },
  [NodeType.END]: { ...neutralNodeVisual, icon: Flag, label: "完成" },
  [NodeType.NOTIFICATION]: { ...neutralNodeVisual, icon: Bell, label: "通知" },
  [NodeType.SCRIPT]: { ...neutralNodeVisual, icon: Code, label: "脚本" },
  [NodeType.TIMER]: { ...neutralNodeVisual, icon: Clock, label: "定时" },
  [NodeType.SUBPROCESS]: { ...neutralNodeVisual, icon: Workflow, label: "子流程" },
  [NodeType.MANUAL]: { ...neutralNodeVisual, icon: ClipboardCheck, label: "人工" },
  [NodeType.COPY]: { ...neutralNodeVisual, icon: Send, label: "抄送" },
};

export const studioSidePanelClassName =
  "fixed right-0 top-0 z-50 flex h-full w-[20rem] flex-col border-l border-slate-200 bg-[var(--cf-surface-strong)] dark:border-slate-800 dark:bg-slate-950";

export const studioSubtleBlockClassName =
  "border border-slate-200 bg-[var(--cf-surface-strong)] p-3 dark:border-slate-800 dark:bg-slate-950";

export const studioQuickAddMenuClassName =
  "workflow-quick-add-menu absolute left-1/2 z-[100] min-w-[176px] -translate-x-1/2 rounded-md border border-slate-200 bg-[var(--cf-surface-strong)] p-2 dark:border-slate-800 dark:bg-slate-950";

export const studioSectionTitleClassName =
  "text-[11px] font-medium text-cyan-700 dark:text-cyan-300";

export const quickAddOptionIconClassName = "text-slate-500 dark:text-slate-300";
export const workflowConnectorLineClassName = "bg-slate-300 dark:bg-slate-700";

export const APPROVER_CACHE_PREFIX = "workflow_approver_options_";
export const APPROVER_CACHE_TTL_MS = 5 * 60 * 1000;
