import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import {
  Plus,
  Settings,
  Trash2,
  ChevronRight,
  GitBranch,
  GitMerge,
  FileText,
  CheckCircle2,
  ArrowDown,
  Copy,
  PlayCircle,
  Undo2,
  Redo2,
  Save,
  UploadCloud,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Flag,
  Layers,
  Sparkles,
  FileCheck,
  DollarSign,
  Calendar,
  X,
  Move,
  UserCheck,
  ClipboardList,
  Briefcase,
  Car,
  Plane,
  Stamp,
  ShieldCheck,
  Server,
  GraduationCap,
  Heart,
  Building2,
  Wrench,
  Package,
  UserPlus,
  UserMinus,
  Award,
  CreditCard,
  PiggyBank,
  Rocket,
  CheckSquare,
  Stethoscope,
  BookOpen,
  Bell,
  Code,
  Clock,
  Workflow,
  ClipboardCheck,
  Send,
  FileDown,
} from "lucide-react";
import {
  WorkflowNode,
  NodeType,
  WorkflowDefinition,
  FormDefinition,
  User,
} from "../types";
import { useHistory } from "../hooks/useHistory";
import {
  saveProcessDefinition,
  deployProcessDefinition,
  exportWorkflow,
} from "../services/api/workflow";
import { getRoleList, getUserList, getDeptTree } from "../services/api/auth";
import { toast } from "sonner";
import { ConfirmDialog } from "./ui/ConfirmDialog";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "./ui/select";
import { Input } from "./ui/input";
import { DatePicker } from "./ui/date-picker";
import { Button } from "./ui/button";
import { WorkflowSettingsModal } from "./WorkflowSettingsModal";
import { useAuth } from "../context/AuthContext";

// ==================== 辅助函数 ====================

/**
 * 生成唯一节点 ID
 * 使用 crypto.randomUUID（浏览器原生支持）避免 Date.now() 在同一毫秒内产生重复 ID
 */
const generateNodeId = (prefix: string = "node"): string => {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
  }
  // 降级方案：时间戳 + 随机字符串
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
};

const updateNodeInTree = (
  root: WorkflowNode,
  targetId: string,
  updater: (node: WorkflowNode) => WorkflowNode,
): WorkflowNode => {
  if (root.id === targetId) return updater(root);
  const newRoot = { ...root };
  if (newRoot.next)
    newRoot.next = updateNodeInTree(newRoot.next, targetId, updater);
  if (newRoot.branches)
    newRoot.branches = newRoot.branches.map((b) =>
      updateNodeInTree(b, targetId, updater),
    );
  return newRoot;
};

const findNodeById = (
  root: WorkflowNode,
  targetId: string,
): WorkflowNode | null => {
  if (root.id === targetId) return root;
  if (root.next) {
    const f = findNodeById(root.next, targetId);
    if (f) return f;
  }
  if (root.branches) {
    for (const b of root.branches) {
      const f = findNodeById(b, targetId);
      if (f) return f;
    }
  }
  return null;
};

const deleteNodeInTree = (
  root: WorkflowNode,
  targetId: string,
): WorkflowNode | null => {
  if (root.id === targetId) return root.next || null;
  const newRoot = { ...root };
  if (newRoot.next) {
    const res = deleteNodeInTree(newRoot.next, targetId);
    newRoot.next = res || undefined;
  }
  if (newRoot.branches) {
    const nb: WorkflowNode[] = [];
    for (const b of newRoot.branches) {
      const res = deleteNodeInTree(b, targetId);
      if (res) nb.push(res);
    }
    newRoot.branches = nb.length > 0 ? nb : undefined;
  }
  return newRoot;
};

const hasEndNode = (root: WorkflowNode): boolean => {
  if (root.type === NodeType.END) return true;
  if (root.next && hasEndNode(root.next)) return true;
  if (root.branches) {
    for (const branch of root.branches) {
      if (hasEndNode(branch)) return true;
    }
  }
  return false;
};

// 检查 targetId 是否在 ancestorId 的 branches 子树中
// 用于拖拽时防止循环引用：不能把节点拖到自己的分支子树中
// 注意：只检查 branches 子树，不检查 next 链。
// 因为 deleteNodeInTree 删除 dragNode 时会把 dragNode.next 重新连接到前驱节点，
// 所以 next 链上的节点在删除后仍然在树中，拖到 next 链上是安全的。
// 但 branches 中的节点会随 dragNode 一起被移除，拖到 branches 内部会导致节点丢失。
const isDescendantOf = (
  root: WorkflowNode,
  ancestorId: string,
  targetId: string,
): boolean => {
  const ancestor = findNodeById(root, ancestorId);
  if (!ancestor || !ancestor.branches) return false;
  // 在 branch 内部递归搜索（包括 branch 的 next 链和嵌套 branches）
  const searchInSubtree = (node: WorkflowNode): boolean => {
    if (node.next) {
      if (node.next.id === targetId) return true;
      if (searchInSubtree(node.next)) return true;
    }
    if (node.branches) {
      for (const b of node.branches) {
        if (b.id === targetId) return true;
        if (searchInSubtree(b)) return true;
      }
    }
    return false;
  };
  // 只从 ancestor 的 branches 开始搜索，不搜索 ancestor.next
  for (const b of ancestor.branches) {
    if (b.id === targetId) return true;
    if (searchInSubtree(b)) return true;
  }
  return false;
};

// 查找指定节点的父节点（即 next 或 branches 中包含 targetId 的节点）
const findParentOfNode = (
  root: WorkflowNode,
  targetId: string,
  parent: WorkflowNode | null = null,
): WorkflowNode | null => {
  if (root.id === targetId) return parent;
  if (root.next) {
    const found = findParentOfNode(root.next, targetId, root);
    if (found) return found;
  }
  if (root.branches) {
    for (const b of root.branches) {
      const found = findParentOfNode(b, targetId, root);
      if (found) return found;
    }
  }
  return null;
};

/**
 * 历史模型兼容处理：
 * 非 PARALLEL 节点若误配置为 PARALLEL/RACE 分支策略，加载时自动回正为 EXCLUSIVE。
 */
const normalizeLegacyBranchStrategy = (
  node: WorkflowNode,
): { node: WorkflowNode; fixedNodeTitles: string[] } => {
  const fixedNodeTitles: string[] = [];

  const nextResult = node.next
    ? normalizeLegacyBranchStrategy(node.next)
    : undefined;
  const branchResults = node.branches?.map((branch) =>
    normalizeLegacyBranchStrategy(branch),
  );

  if (nextResult?.fixedNodeTitles?.length) {
    fixedNodeTitles.push(...nextResult.fixedNodeTitles);
  }
  if (branchResults?.length) {
    branchResults.forEach((result) => {
      if (result.fixedNodeTitles.length) {
        fixedNodeTitles.push(...result.fixedNodeTitles);
      }
    });
  }

  const invalidStrategy =
    node.type !== NodeType.PARALLEL &&
    (node.branchStrategy === "PARALLEL" || node.branchStrategy === "RACE");
  if (invalidStrategy) {
    fixedNodeTitles.push(node.title || node.id);
  }

  const nextNode = nextResult?.node;
  const nextBranches = branchResults?.map((result) => result.node);
  const hasChildChanged =
    (node.next && nextNode && node.next !== nextNode) ||
    (node.branches &&
      nextBranches &&
      node.branches.some((branch, idx) => branch !== nextBranches[idx]));

  if (!invalidStrategy && !hasChildChanged) {
    return { node, fixedNodeTitles };
  }

  return {
    node: {
      ...node,
      branchStrategy: invalidStrategy ? "EXCLUSIVE" : node.branchStrategy,
      next: nextNode,
      branches: nextBranches,
    },
    fixedNodeTitles,
  };
};

// ==================== 常量配置 ====================

const NODE_TYPE_LABELS: Record<string, string> = {
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

const APPROVER_TYPE_LABELS: Record<string, string> = {
  ROLE: "按角色",
  USER: "指定人员",
  USERS: "指定多人",
  DEPT_MANAGER: "部门负责人",
  DIRECT_LEADER: "直属上级",
  DEPT: "按部门",
};

const BRANCH_STRATEGY_LABELS: Record<string, string> = {
  EXCLUSIVE: "单选分支",
  PARALLEL: "并行处理",
  RACE: "竞争模式",
};

// 节点类型视觉配置
const NODE_VISUAL: Record<
  string,
  {
    icon: React.FC<{ size?: number; className?: string }>;
    color: string;
    bg: string;
    iconBg: string;
    iconColor: string;
    border: string;
    hoverBorder: string;
    label: string;
  }
> = {
  [NodeType.START]: {
    icon: PlayCircle,
    color: "bg-emerald-500",
    bg: "bg-emerald-50/80",
    iconBg: "bg-emerald-100",
    iconColor: "text-emerald-600",
    border: "border-emerald-200",
    hoverBorder: "hover:border-emerald-400",
    label: "开始",
  },
  [NodeType.APPROVAL]: {
    icon: UserCheck,
    color: "bg-pink-400",
    bg: "bg-white",
    iconBg: "bg-pink-50",
    iconColor: "text-pink-500",
    border: "border-pink-100",
    hoverBorder: "hover:border-pink-300",
    label: "审批",
  },
  [NodeType.CONDITION]: {
    icon: GitBranch,
    color: "bg-amber-500",
    bg: "bg-amber-50/80",
    iconBg: "bg-amber-100",
    iconColor: "text-amber-600",
    border: "border-amber-200",
    hoverBorder: "hover:border-amber-400",
    label: "条件",
  },
  [NodeType.PARALLEL]: {
    icon: Layers,
    color: "bg-violet-500",
    bg: "bg-violet-50/80",
    iconBg: "bg-violet-100",
    iconColor: "text-violet-600",
    border: "border-violet-200",
    hoverBorder: "hover:border-violet-400",
    label: "并行",
  },
  [NodeType.END]: {
    icon: Flag,
    color: "bg-slate-700",
    bg: "bg-slate-50/80",
    iconBg: "bg-slate-200",
    iconColor: "text-slate-600",
    border: "border-slate-300",
    hoverBorder: "hover:border-slate-500",
    label: "完成",
  },
  [NodeType.NOTIFICATION]: {
    icon: Bell,
    color: "bg-pink-400",
    bg: "bg-pink-50/80",
    iconBg: "bg-pink-50",
    iconColor: "text-pink-500",
    border: "border-pink-100",
    hoverBorder: "hover:border-pink-300",
    label: "通知",
  },
  [NodeType.SCRIPT]: {
    icon: Code,
    color: "bg-green-500",
    bg: "bg-green-50/80",
    iconBg: "bg-green-100",
    iconColor: "text-green-600",
    border: "border-green-200",
    hoverBorder: "hover:border-green-400",
    label: "脚本",
  },
  [NodeType.TIMER]: {
    icon: Clock,
    color: "bg-orange-500",
    bg: "bg-orange-50/80",
    iconBg: "bg-orange-100",
    iconColor: "text-orange-600",
    border: "border-orange-200",
    hoverBorder: "hover:border-orange-400",
    label: "定时",
  },
  [NodeType.SUBPROCESS]: {
    icon: Workflow,
    color: "bg-purple-500",
    bg: "bg-purple-50/80",
    iconBg: "bg-purple-100",
    iconColor: "text-purple-600",
    border: "border-purple-200",
    hoverBorder: "hover:border-purple-400",
    label: "子流程",
  },
  [NodeType.MANUAL]: {
    icon: ClipboardCheck,
    color: "bg-cyan-500",
    bg: "bg-cyan-50/80",
    iconBg: "bg-cyan-100",
    iconColor: "text-cyan-600",
    border: "border-cyan-200",
    hoverBorder: "hover:border-cyan-400",
    label: "人工",
  },
  [NodeType.COPY]: {
    icon: Send,
    color: "bg-pink-500",
    bg: "bg-pink-50/80",
    iconBg: "bg-pink-100",
    iconColor: "text-pink-600",
    border: "border-pink-200",
    hoverBorder: "hover:border-pink-400",
    label: "抄送",
  },
};

const getNodeVisual = (type: string) =>
  NODE_VISUAL[type] || NODE_VISUAL[NodeType.APPROVAL];

// ==================== 预设模板 ====================

interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: React.FC<{ size?: number; className?: string }>;
  color: string;
  nodes: WorkflowNode;
}

const TEMPLATE_CATEGORIES = [
  { id: "all", label: "全部" },
  { id: "office", label: "行政办公" },
  { id: "finance", label: "财务" },
  { id: "hr", label: "人事" },
  { id: "sales", label: "销售业务" },
  { id: "it", label: "IT运维" },
  { id: "industry", label: "行业专属" },
  { id: "other", label: "其他" },
];

const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  // ===== 行政办公 =====
  {
    id: "leave",
    name: "请假审批",
    description: "员工提交 → 部门经理审批 → 完成",
    category: "office",
    icon: Calendar,
    color: "text-pink-400 bg-pink-50",
    nodes: {
      id: "start",
      type: NodeType.START,
      title: "提交请假",
      next: {
        id: "n1",
        type: NodeType.APPROVAL,
        title: "部门经理审批",
        approverType: "DEPT_MANAGER",
        next: { id: "end", type: NodeType.END, title: "流程结束" },
      },
    },
  },
  {
    id: "contract",
    name: "合同审批",
    description: "起草 → 法务审核 → 总经理签发 → 盖章归档",
    category: "office",
    icon: FileCheck,
    color: "text-violet-500 bg-violet-50",
    nodes: {
      id: "start",
      type: NodeType.START,
      title: "起草合同",
      next: {
        id: "n1",
        type: NodeType.APPROVAL,
        title: "法务审核",
        approverType: "ROLE",
        approverValue: "LEGAL",
        next: {
          id: "n2",
          type: NodeType.APPROVAL,
          title: "总经理签发",
          approverType: "ROLE",
          approverValue: "MANAGER",
          next: {
            id: "n3",
            type: NodeType.APPROVAL,
            title: "盖章归档",
            approverType: "ROLE",
            approverValue: "ADMIN",
            next: { id: "end", type: NodeType.END, title: "流程结束" },
          },
        },
      },
    },
  },
  {
    id: "seal",
    name: "用印申请",
    description: "申请用印 → 部门审批 → 行政盖章 → 完成",
    category: "office",
    icon: Stamp,
    color: "text-rose-500 bg-rose-50",
    nodes: {
      id: "start",
      type: NodeType.START,
      title: "申请用印",
      next: {
        id: "n1",
        type: NodeType.APPROVAL,
        title: "部门经理审批",
        approverType: "DEPT_MANAGER",
        next: {
          id: "n2",
          type: NodeType.APPROVAL,
          title: "行政盖章",
          approverType: "ROLE",
          approverValue: "ADMIN",
          next: { id: "end", type: NodeType.END, title: "流程结束" },
        },
      },
    },
  },
  {
    id: "travel",
    name: "出差申请",
    description: "提交出差 → 部门审批 → 总经理审批 → 完成",
    category: "office",
    icon: Plane,
    color: "text-sky-500 bg-sky-50",
    nodes: {
      id: "start",
      type: NodeType.START,
      title: "提交出差申请",
      next: {
        id: "n1",
        type: NodeType.APPROVAL,
        title: "部门经理审批",
        approverType: "DEPT_MANAGER",
        next: {
          id: "n2",
          type: NodeType.APPROVAL,
          title: "总经理审批",
          approverType: "ROLE",
          approverValue: "MANAGER",
          next: { id: "end", type: NodeType.END, title: "流程结束" },
        },
      },
    },
  },
  {
    id: "vehicle",
    name: "用车申请",
    description: "申请用车 → 行政审批 → 车辆调度 → 完成",
    category: "office",
    icon: Car,
    color: "text-teal-500 bg-teal-50",
    nodes: {
      id: "start",
      type: NodeType.START,
      title: "申请用车",
      next: {
        id: "n1",
        type: NodeType.APPROVAL,
        title: "行政审批",
        approverType: "ROLE",
        approverValue: "ADMIN",
        next: {
          id: "n2",
          type: NodeType.APPROVAL,
          title: "车辆调度确认",
          approverType: "ROLE",
          approverValue: "ADMIN",
          next: { id: "end", type: NodeType.END, title: "流程结束" },
        },
      },
    },
  },
  // ===== 财务 =====
  {
    id: "reimbursement",
    name: "报销审批",
    description: "提交报销 → 部门经理 → 财务审核 → 完成",
    category: "finance",
    icon: DollarSign,
    color: "text-emerald-500 bg-emerald-50",
    nodes: {
      id: "start",
      type: NodeType.START,
      title: "提交报销",
      next: {
        id: "n1",
        type: NodeType.APPROVAL,
        title: "部门经理审批",
        approverType: "DEPT_MANAGER",
        next: {
          id: "n2",
          type: NodeType.APPROVAL,
          title: "财务审核",
          approverType: "ROLE",
          approverValue: "FINANCE",
          next: { id: "end", type: NodeType.END, title: "流程结束" },
        },
      },
    },
  },
  {
    id: "purchase",
    name: "采购审批",
    description: "提交采购 → 金额判断 → 分级审批 → 完成",
    category: "finance",
    icon: ClipboardList,
    color: "text-orange-500 bg-orange-50",
    nodes: {
      id: "start",
      type: NodeType.START,
      title: "提交采购申请",
      next: {
        id: "n1",
        type: NodeType.APPROVAL,
        title: "部门经理审批",
        approverType: "DEPT_MANAGER",
        branches: [
          {
            id: "b1",
            type: NodeType.CONDITION,
            title: "金额 ≤ 5000",
            condition: "amount <= 5000",
          },
          {
            id: "b2",
            type: NodeType.CONDITION,
            title: "金额 > 5000",
            condition: "amount > 5000",
            next: {
              id: "n2",
              type: NodeType.APPROVAL,
              title: "总经理审批",
              approverType: "ROLE",
              approverValue: "MANAGER",
            },
          },
        ],
        branchStrategy: "EXCLUSIVE",
        next: { id: "end", type: NodeType.END, title: "流程结束" },
      },
    },
  },
  {
    id: "payment",
    name: "付款申请",
    description: "提交付款 → 财务审核 → 总经理审批 → 出纳付款",
    category: "finance",
    icon: CreditCard,
    color: "text-pink-500 bg-pink-50",
    nodes: {
      id: "start",
      type: NodeType.START,
      title: "提交付款申请",
      next: {
        id: "n1",
        type: NodeType.APPROVAL,
        title: "财务审核",
        approverType: "ROLE",
        approverValue: "FINANCE",
        next: {
          id: "n2",
          type: NodeType.APPROVAL,
          title: "总经理审批",
          approverType: "ROLE",
          approverValue: "MANAGER",
          next: {
            id: "n3",
            type: NodeType.APPROVAL,
            title: "出纳付款",
            approverType: "ROLE",
            approverValue: "FINANCE",
            next: { id: "end", type: NodeType.END, title: "流程结束" },
          },
        },
      },
    },
  },
  {
    id: "budget",
    name: "预算审批",
    description: "编制预算 → 部门审核 → 财务审核 → 总经理批准",
    category: "finance",
    icon: PiggyBank,
    color: "text-amber-500 bg-amber-50",
    nodes: {
      id: "start",
      type: NodeType.START,
      title: "编制预算",
      next: {
        id: "n1",
        type: NodeType.APPROVAL,
        title: "部门负责人审核",
        approverType: "DEPT_MANAGER",
        next: {
          id: "n2",
          type: NodeType.APPROVAL,
          title: "财务部审核",
          approverType: "ROLE",
          approverValue: "FINANCE",
          next: {
            id: "n3",
            type: NodeType.APPROVAL,
            title: "总经理批准",
            approverType: "ROLE",
            approverValue: "MANAGER",
            next: { id: "end", type: NodeType.END, title: "流程结束" },
          },
        },
      },
    },
  },
  // ===== 人事 =====
  {
    id: "onboarding",
    name: "入职审批",
    description: "提交入职 → HR审核 → 部门确认 → IT开通账号",
    category: "hr",
    icon: UserPlus,
    color: "text-green-500 bg-green-50",
    nodes: {
      id: "start",
      type: NodeType.START,
      title: "提交入职申请",
      next: {
        id: "n1",
        type: NodeType.APPROVAL,
        title: "HR审核",
        approverType: "ROLE",
        approverValue: "HR",
        next: {
          id: "n2",
          type: NodeType.APPROVAL,
          title: "部门负责人确认",
          approverType: "DEPT_MANAGER",
          next: {
            id: "n3",
            type: NodeType.APPROVAL,
            title: "IT开通账号",
            approverType: "ROLE",
            approverValue: "ADMIN",
            next: { id: "end", type: NodeType.END, title: "流程结束" },
          },
        },
      },
    },
  },
  {
    id: "resignation",
    name: "离职审批",
    description: "提交离职 → 部门审批 → HR审核 → 资产交接",
    category: "hr",
    icon: UserMinus,
    color: "text-red-500 bg-red-50",
    nodes: {
      id: "start",
      type: NodeType.START,
      title: "提交离职申请",
      next: {
        id: "n1",
        type: NodeType.APPROVAL,
        title: "部门经理审批",
        approverType: "DEPT_MANAGER",
        next: {
          id: "n2",
          type: NodeType.APPROVAL,
          title: "HR审核",
          approverType: "ROLE",
          approverValue: "HR",
          next: {
            id: "n3",
            type: NodeType.APPROVAL,
            title: "资产交接确认",
            approverType: "ROLE",
            approverValue: "ADMIN",
            next: { id: "end", type: NodeType.END, title: "流程结束" },
          },
        },
      },
    },
  },
  {
    id: "promotion",
    name: "晋升审批",
    description: "提名推荐 → 部门审核 → HR评估 → 总经理批准",
    category: "hr",
    icon: Award,
    color: "text-yellow-500 bg-yellow-50",
    nodes: {
      id: "start",
      type: NodeType.START,
      title: "提名推荐",
      next: {
        id: "n1",
        type: NodeType.APPROVAL,
        title: "部门负责人审核",
        approverType: "DEPT_MANAGER",
        next: {
          id: "n2",
          type: NodeType.APPROVAL,
          title: "HR评估",
          approverType: "ROLE",
          approverValue: "HR",
          next: {
            id: "n3",
            type: NodeType.APPROVAL,
            title: "总经理批准",
            approverType: "ROLE",
            approverValue: "MANAGER",
            next: { id: "end", type: NodeType.END, title: "流程结束" },
          },
        },
      },
    },
  },
  {
    id: "training",
    name: "培训申请",
    description: "提交培训 → 部门审批 → HR审核 → 完成",
    category: "hr",
    icon: GraduationCap,
    color: "text-pink-400 bg-pink-50",
    nodes: {
      id: "start",
      type: NodeType.START,
      title: "提交培训申请",
      next: {
        id: "n1",
        type: NodeType.APPROVAL,
        title: "部门经理审批",
        approverType: "DEPT_MANAGER",
        next: {
          id: "n2",
          type: NodeType.APPROVAL,
          title: "HR审核",
          approverType: "ROLE",
          approverValue: "HR",
          next: { id: "end", type: NodeType.END, title: "流程结束" },
        },
      },
    },
  },
  // ===== 销售业务 =====
  {
    id: "quote",
    name: "报价审批",
    description: "提交报价 → 销售主管 → 金额判断 → 分级审批",
    category: "sales",
    icon: Briefcase,
    color: "text-cyan-500 bg-cyan-50",
    nodes: {
      id: "start",
      type: NodeType.START,
      title: "提交报价单",
      next: {
        id: "n1",
        type: NodeType.APPROVAL,
        title: "销售主管审核",
        approverType: "DIRECT_LEADER",
        branches: [
          {
            id: "b1",
            type: NodeType.CONDITION,
            title: "金额 ≤ 10万",
            condition: "amount <= 100000",
          },
          {
            id: "b2",
            type: NodeType.CONDITION,
            title: "金额 > 10万",
            condition: "amount > 100000",
            next: {
              id: "n2",
              type: NodeType.APPROVAL,
              title: "总经理审批",
              approverType: "ROLE",
              approverValue: "MANAGER",
            },
          },
        ],
        branchStrategy: "EXCLUSIVE",
        next: { id: "end", type: NodeType.END, title: "流程结束" },
      },
    },
  },
  {
    id: "discount",
    name: "折扣审批",
    description: "申请折扣 → 销售总监 → 财务确认 → 完成",
    category: "sales",
    icon: DollarSign,
    color: "text-lime-600 bg-lime-50",
    nodes: {
      id: "start",
      type: NodeType.START,
      title: "申请折扣",
      next: {
        id: "n1",
        type: NodeType.APPROVAL,
        title: "销售总监审批",
        approverType: "ROLE",
        approverValue: "MANAGER",
        next: {
          id: "n2",
          type: NodeType.APPROVAL,
          title: "财务确认",
          approverType: "ROLE",
          approverValue: "FINANCE",
          next: { id: "end", type: NodeType.END, title: "流程结束" },
        },
      },
    },
  },
  // ===== IT运维 =====
  {
    id: "server",
    name: "服务器申请",
    description: "提交申请 → IT审核 → 安全审查 → 运维部署",
    category: "it",
    icon: Server,
    color: "text-slate-600 bg-slate-100",
    nodes: {
      id: "start",
      type: NodeType.START,
      title: "提交服务器申请",
      next: {
        id: "n1",
        type: NodeType.APPROVAL,
        title: "IT主管审核",
        approverType: "ROLE",
        approverValue: "ADMIN",
        next: {
          id: "n2",
          type: NodeType.APPROVAL,
          title: "安全审查",
          approverType: "ROLE",
          approverValue: "ADMIN",
          next: {
            id: "n3",
            type: NodeType.APPROVAL,
            title: "运维部署",
            approverType: "ROLE",
            approverValue: "ADMIN",
            next: { id: "end", type: NodeType.END, title: "流程结束" },
          },
        },
      },
    },
  },
  {
    id: "permission",
    name: "权限申请",
    description: "提交权限 → 部门审批 → IT审核 → 安全确认",
    category: "it",
    icon: ShieldCheck,
    color: "text-emerald-600 bg-emerald-50",
    nodes: {
      id: "start",
      type: NodeType.START,
      title: "提交权限申请",
      next: {
        id: "n1",
        type: NodeType.APPROVAL,
        title: "部门经理审批",
        approverType: "DEPT_MANAGER",
        next: {
          id: "n2",
          type: NodeType.APPROVAL,
          title: "IT审核",
          approverType: "ROLE",
          approverValue: "ADMIN",
          next: {
            id: "n3",
            type: NodeType.APPROVAL,
            title: "安全确认",
            approverType: "ROLE",
            approverValue: "ADMIN",
            next: { id: "end", type: NodeType.END, title: "流程结束" },
          },
        },
      },
    },
  },
  {
    id: "change",
    name: "变更发布",
    description: "提交变更 → 技术评审 → 测试验证 → 上线审批",
    category: "it",
    icon: Rocket,
    color: "text-purple-500 bg-purple-50",
    nodes: {
      id: "start",
      type: NodeType.START,
      title: "提交变更申请",
      next: {
        id: "n1",
        type: NodeType.APPROVAL,
        title: "技术评审",
        approverType: "ROLE",
        approverValue: "ADMIN",
        next: {
          id: "n2",
          type: NodeType.APPROVAL,
          title: "测试验证",
          approverType: "ROLE",
          approverValue: "ADMIN",
          next: {
            id: "n3",
            type: NodeType.APPROVAL,
            title: "上线审批",
            approverType: "ROLE",
            approverValue: "MANAGER",
            next: { id: "end", type: NodeType.END, title: "流程结束" },
          },
        },
      },
    },
  },
  // ===== 行业专属 =====
  {
    id: "medical",
    name: "医疗器械采购",
    description: "科室申请 → 设备科审核 → 院长审批 → 招标采购",
    category: "industry",
    icon: Stethoscope,
    color: "text-red-500 bg-red-50",
    nodes: {
      id: "start",
      type: NodeType.START,
      title: "科室提交申请",
      next: {
        id: "n1",
        type: NodeType.APPROVAL,
        title: "设备科审核",
        approverType: "ROLE",
        approverValue: "ADMIN",
        next: {
          id: "n2",
          type: NodeType.APPROVAL,
          title: "院长审批",
          approverType: "ROLE",
          approverValue: "MANAGER",
          next: {
            id: "n3",
            type: NodeType.APPROVAL,
            title: "招标采购",
            approverType: "ROLE",
            approverValue: "FINANCE",
            next: { id: "end", type: NodeType.END, title: "流程结束" },
          },
        },
      },
    },
  },
  {
    id: "construction",
    name: "工程验收",
    description: "提交验收 → 监理审核 → 质检验收 → 甲方确认",
    category: "industry",
    icon: Building2,
    color: "text-orange-600 bg-orange-50",
    nodes: {
      id: "start",
      type: NodeType.START,
      title: "提交验收申请",
      next: {
        id: "n1",
        type: NodeType.APPROVAL,
        title: "监理审核",
        approverType: "ROLE",
        approverValue: "ADMIN",
        next: {
          id: "n2",
          type: NodeType.APPROVAL,
          title: "质检验收",
          approverType: "ROLE",
          approverValue: "ADMIN",
          next: {
            id: "n3",
            type: NodeType.APPROVAL,
            title: "甲方确认",
            approverType: "ROLE",
            approverValue: "MANAGER",
            next: { id: "end", type: NodeType.END, title: "流程结束" },
          },
        },
      },
    },
  },
  {
    id: "education",
    name: "课程审批",
    description: "教师提交 → 教研组审核 → 教务处审批 → 完成",
    category: "industry",
    icon: BookOpen,
    color: "text-pink-500 bg-pink-50",
    nodes: {
      id: "start",
      type: NodeType.START,
      title: "提交课程方案",
      next: {
        id: "n1",
        type: NodeType.APPROVAL,
        title: "教研组审核",
        approverType: "DIRECT_LEADER",
        next: {
          id: "n2",
          type: NodeType.APPROVAL,
          title: "教务处审批",
          approverType: "ROLE",
          approverValue: "MANAGER",
          next: { id: "end", type: NodeType.END, title: "流程结束" },
        },
      },
    },
  },
  {
    id: "maintenance",
    name: "设备维修",
    description: "报修 → 维修主管派单 → 维修完成 → 验收确认",
    category: "industry",
    icon: Wrench,
    color: "text-gray-600 bg-gray-100",
    nodes: {
      id: "start",
      type: NodeType.START,
      title: "提交报修",
      next: {
        id: "n1",
        type: NodeType.APPROVAL,
        title: "维修主管派单",
        approverType: "ROLE",
        approverValue: "ADMIN",
        next: {
          id: "n2",
          type: NodeType.APPROVAL,
          title: "维修完成确认",
          approverType: "ROLE",
          approverValue: "ADMIN",
          next: {
            id: "n3",
            type: NodeType.APPROVAL,
            title: "报修人验收",
            approverType: "USER",
            next: { id: "end", type: NodeType.END, title: "流程结束" },
          },
        },
      },
    },
  },
  {
    id: "logistics",
    name: "发货审批",
    description: "创建发货单 → 仓库确认 → 物流安排 → 完成",
    category: "industry",
    icon: Package,
    color: "text-yellow-600 bg-yellow-50",
    nodes: {
      id: "start",
      type: NodeType.START,
      title: "创建发货单",
      next: {
        id: "n1",
        type: NodeType.APPROVAL,
        title: "仓库确认库存",
        approverType: "ROLE",
        approverValue: "ADMIN",
        next: {
          id: "n2",
          type: NodeType.APPROVAL,
          title: "物流安排",
          approverType: "ROLE",
          approverValue: "ADMIN",
          next: { id: "end", type: NodeType.END, title: "流程结束" },
        },
      },
    },
  },
  // ===== 其他 =====
  {
    id: "checklist",
    name: "审核清单",
    description: "提交清单 → 逐项审核 → 最终确认 → 完成",
    category: "other",
    icon: CheckSquare,
    color: "text-teal-600 bg-teal-50",
    nodes: {
      id: "start",
      type: NodeType.START,
      title: "提交审核清单",
      next: {
        id: "n1",
        type: NodeType.APPROVAL,
        title: "逐项审核",
        approverType: "ROLE",
        approverValue: "ADMIN",
        next: {
          id: "n2",
          type: NodeType.APPROVAL,
          title: "最终确认",
          approverType: "ROLE",
          approverValue: "MANAGER",
          next: { id: "end", type: NodeType.END, title: "流程结束" },
        },
      },
    },
  },
  // ===== 复杂模板 - 使用高级节点类型 =====
  {
    id: "purchase_advanced",
    name: "大额采购全流程",
    description: "部门审批 → 金额分级 → 多级审批 → 通知结果",
    category: "finance",
    icon: ClipboardList,
    color: "text-orange-600 bg-orange-50",
    nodes: {
      id: "start",
      type: NodeType.START,
      title: "提交采购申请",
      next: {
        id: "pa_n1",
        type: NodeType.APPROVAL,
        title: "部门经理审批",
        approverType: "DEPT_MANAGER",
        branches: [
          {
            id: "pa_b1",
            type: NodeType.CONDITION,
            title: "金额 ≤ 5000",
            condition: "amount <= 5000",
          },
          {
            id: "pa_b2",
            type: NodeType.CONDITION,
            title: "5000 < 金额 ≤ 50000",
            condition: "amount > 5000 && amount <= 50000",
            next: {
              id: "pa_n2",
              type: NodeType.APPROVAL,
              title: "财务总监审核",
              approverType: "ROLE",
              approverValue: "FINANCE",
            },
          },
          {
            id: "pa_b3",
            type: NodeType.CONDITION,
            title: "金额 > 50000",
            condition: "amount > 50000",
            next: {
              id: "pa_n3",
              type: NodeType.APPROVAL,
              title: "总经理审批",
              approverType: "ROLE",
              approverValue: "MANAGER",
              next: {
                id: "pa_n4",
                type: NodeType.APPROVAL,
                title: "财务总监审核",
                approverType: "ROLE",
                approverValue: "FINANCE",
              },
            },
          },
        ],
        branchStrategy: "EXCLUSIVE",
        next: {
          id: "pa_n5",
          type: NodeType.NOTIFICATION,
          title: "通知采购结果",
          props: {
            recipientType: "INITIATOR",
            notificationTitle: "采购审批结果通知",
            notificationContent:
              "您的采购申请（金额: ${amount}）已审批完成，请查看结果。",
          },
          next: { id: "pa_end", type: NodeType.END, title: "流程结束" },
        },
      },
    },
  },
  {
    id: "project_approval",
    name: "项目立项审批",
    description: "部门审核 → 技术+财务并行评审 → 总经理审批 → 通知",
    category: "other",
    icon: Rocket,
    color: "text-purple-600 bg-purple-50",
    nodes: {
      id: "start",
      type: NodeType.START,
      title: "提交立项申请",
      next: {
        id: "proj_n1",
        type: NodeType.APPROVAL,
        title: "部门负责人审核",
        approverType: "DEPT_MANAGER",
        next: {
          id: "proj_n2",
          type: NodeType.PARALLEL,
          title: "并行评审（技术+财务）",
          approverType: "ROLE",
          approverValue: "ADMIN,FINANCE",
          branches: [
            {
              id: "proj_b1",
              type: NodeType.CONDITION,
              title: "技术可行性评审",
              next: {
                id: "proj_n3",
                type: NodeType.APPROVAL,
                title: "技术委员会评审",
                approverType: "ROLE",
                approverValue: "ADMIN",
              },
            },
            {
              id: "proj_b2",
              type: NodeType.CONDITION,
              title: "财务预算评估",
              next: {
                id: "proj_n4",
                type: NodeType.APPROVAL,
                title: "财务部预算评估",
                approverType: "ROLE",
                approverValue: "FINANCE",
              },
            },
          ],
          branchStrategy: "PARALLEL",
          next: {
            id: "proj_n5",
            type: NodeType.APPROVAL,
            title: "总经理审批",
            approverType: "ROLE",
            approverValue: "MANAGER",
            next: {
              id: "proj_n6",
              type: NodeType.NOTIFICATION,
              title: "通知立项结果",
              props: {
                recipientType: "INITIATOR",
                notificationTitle: "项目立项结果",
                notificationContent:
                  "您的项目立项申请已完成审批，请登录系统查看详情。",
              },
              next: { id: "proj_end", type: NodeType.END, title: "流程结束" },
            },
          },
        },
      },
    },
  },
  {
    id: "regularization",
    name: "员工转正审批",
    description: "定时提醒 → 部门评估 → HR审核 → 并行办理 → 通知",
    category: "hr",
    icon: UserCheck,
    color: "text-green-600 bg-green-50",
    nodes: {
      id: "start",
      type: NodeType.START,
      title: "发起转正流程",
      next: {
        id: "reg_n1",
        type: NodeType.TIMER,
        title: "试用期到期提醒",
        props: { timerType: "DELAY", delayMinutes: 60 },
        next: {
          id: "reg_n2",
          type: NodeType.APPROVAL,
          title: "部门负责人评估",
          approverType: "DEPT_MANAGER",
          next: {
            id: "reg_n3",
            type: NodeType.APPROVAL,
            title: "HR综合审核",
            approverType: "ROLE",
            approverValue: "HR",
            next: {
              id: "reg_n4",
              type: NodeType.PARALLEL,
              title: "并行办理（IT+行政）",
              approverType: "ROLE",
              approverValue: "ADMIN",
              branches: [
                {
                  id: "reg_b1",
                  type: NodeType.CONDITION,
                  title: "IT权限开通",
                  next: {
                    id: "reg_n5",
                    type: NodeType.MANUAL,
                    title: "IT开通正式权限",
                    approverType: "ROLE",
                    approverValue: "ADMIN",
                    props: {
                      taskDescription: "为转正员工开通正式员工系统权限、邮箱等",
                      priority: "HIGH",
                    },
                  },
                },
                {
                  id: "reg_b2",
                  type: NodeType.CONDITION,
                  title: "行政手续办理",
                  next: {
                    id: "reg_n6",
                    type: NodeType.MANUAL,
                    title: "行政办理工牌社保",
                    approverType: "ROLE",
                    approverValue: "ADMIN",
                    props: {
                      taskDescription:
                        "办理正式工牌、更新社保信息、签订正式合同",
                      priority: "MEDIUM",
                    },
                  },
                },
              ],
              branchStrategy: "PARALLEL",
              next: {
                id: "reg_n7",
                type: NodeType.NOTIFICATION,
                title: "通知转正结果",
                props: {
                  recipientType: "INITIATOR",
                  notificationTitle: "转正审批结果",
                  notificationContent:
                    "恭喜！您的转正申请已通过，欢迎成为正式员工。",
                },
                next: { id: "reg_end", type: NodeType.END, title: "流程结束" },
              },
            },
          },
        },
      },
    },
  },
  {
    id: "incident",
    name: "IT故障处理",
    description: "自动分级 → 按级别分流 → 处理 → 验证确认",
    category: "it",
    icon: Wrench,
    color: "text-red-600 bg-red-50",
    nodes: {
      id: "start",
      type: NodeType.START,
      title: "提交故障报告",
      next: {
        id: "inc_n1",
        type: NodeType.SCRIPT,
        title: "自动故障分级",
        props: {
          scriptType: "JAVASCRIPT",
          scriptContent:
            'const level = severity >= 8 ? "P1" : severity >= 5 ? "P2" : "P3";\nreturn { incidentLevel: level };',
          continueOnError: false,
        },
        branches: [
          {
            id: "inc_b1",
            type: NodeType.CONDITION,
            title: "P1 紧急故障",
            condition: 'incidentLevel == "P1"',
            next: {
              id: "inc_n2",
              type: NodeType.NOTIFICATION,
              title: "紧急通知管理层",
              props: {
                recipientType: "ROLE",
                recipientValue: "MANAGER",
                notificationTitle: "【紧急】P1级故障告警",
                notificationContent:
                  "系统发生P1级紧急故障，请立即关注！故障描述: ${description}",
              },
              next: {
                id: "inc_n3",
                type: NodeType.MANUAL,
                title: "紧急修复处理",
                approverType: "ROLE",
                approverValue: "ADMIN",
                props: {
                  taskDescription: "P1级紧急故障，需立即响应并修复",
                  priority: "HIGH",
                },
              },
            },
          },
          {
            id: "inc_b2",
            type: NodeType.CONDITION,
            title: "P2 重要故障",
            condition: 'incidentLevel == "P2"',
            next: {
              id: "inc_n4",
              type: NodeType.APPROVAL,
              title: "运维主管派单",
              approverType: "ROLE",
              approverValue: "ADMIN",
              next: {
                id: "inc_n5",
                type: NodeType.MANUAL,
                title: "运维工程师处理",
                approverType: "ROLE",
                approverValue: "ADMIN",
                props: {
                  taskDescription: "P2级故障，请在4小时内完成修复",
                  priority: "MEDIUM",
                },
              },
            },
          },
          {
            id: "inc_b3",
            type: NodeType.CONDITION,
            title: "P3 一般故障",
            condition: 'incidentLevel == "P3"',
            next: {
              id: "inc_n6",
              type: NodeType.MANUAL,
              title: "运维工程师处理",
              approverType: "ROLE",
              approverValue: "ADMIN",
              props: {
                taskDescription: "P3级一般故障，请在24小时内处理",
                priority: "LOW",
              },
            },
          },
        ],
        branchStrategy: "EXCLUSIVE",
        next: {
          id: "inc_n7",
          type: NodeType.MANUAL,
          title: "报修人验证确认",
          approverType: "USER",
          props: {
            taskDescription: "请确认故障是否已修复，如未修复请退回重新处理",
            priority: "MEDIUM",
          },
          next: {
            id: "inc_n8",
            type: NodeType.NOTIFICATION,
            title: "通知故障关闭",
            props: {
              recipientType: "INITIATOR",
              notificationTitle: "故障处理完成",
              notificationContent: "您提交的故障报告已处理完成并关闭。",
            },
            next: { id: "inc_end", type: NodeType.END, title: "流程结束" },
          },
        },
      },
    },
  },
  {
    id: "sales_contract",
    name: "销售合同全流程",
    description: "销售审核 → 金额分级 → 法务审核 → 并行盖章 → 通知",
    category: "sales",
    icon: FileCheck,
    color: "text-pink-500 bg-pink-50",
    nodes: {
      id: "start",
      type: NodeType.START,
      title: "提交合同审批",
      next: {
        id: "sc_n1",
        type: NodeType.APPROVAL,
        title: "销售主管审核",
        approverType: "DIRECT_LEADER",
        branches: [
          {
            id: "sc_b1",
            type: NodeType.CONDITION,
            title: "金额 ≤ 10万",
            condition: "amount <= 100000",
            next: {
              id: "sc_n2",
              type: NodeType.APPROVAL,
              title: "销售总监审批",
              approverType: "ROLE",
              approverValue: "MANAGER",
            },
          },
          {
            id: "sc_b2",
            type: NodeType.CONDITION,
            title: "金额 > 10万",
            condition: "amount > 100000",
            next: {
              id: "sc_n3",
              type: NodeType.APPROVAL,
              title: "总经理审批",
              approverType: "ROLE",
              approverValue: "MANAGER",
              next: {
                id: "sc_n4",
                type: NodeType.APPROVAL,
                title: "董事会审批",
                approverType: "ROLE",
                approverValue: "MANAGER",
              },
            },
          },
        ],
        branchStrategy: "EXCLUSIVE",
        next: {
          id: "sc_n5",
          type: NodeType.APPROVAL,
          title: "法务合规审核",
          approverType: "ROLE",
          approverValue: "LEGAL",
          next: {
            id: "sc_n6",
            type: NodeType.PARALLEL,
            title: "并行办理（财务+行政）",
            approverType: "ROLE",
            approverValue: "FINANCE,ADMIN",
            branches: [
              {
                id: "sc_b3",
                type: NodeType.CONDITION,
                title: "财务确认",
                next: {
                  id: "sc_n7",
                  type: NodeType.APPROVAL,
                  title: "财务确认收款条款",
                  approverType: "ROLE",
                  approverValue: "FINANCE",
                },
              },
              {
                id: "sc_b4",
                type: NodeType.CONDITION,
                title: "行政盖章",
                next: {
                  id: "sc_n8",
                  type: NodeType.MANUAL,
                  title: "行政盖章归档",
                  approverType: "ROLE",
                  approverValue: "ADMIN",
                  props: {
                    taskDescription: "合同盖章并归档原件",
                    priority: "HIGH",
                  },
                },
              },
            ],
            branchStrategy: "PARALLEL",
            next: {
              id: "sc_n9",
              type: NodeType.NOTIFICATION,
              title: "通知合同签署完成",
              props: {
                recipientType: "INITIATOR",
                notificationTitle: "合同审批完成",
                notificationContent:
                  "您提交的合同（金额: ${amount}）已完成全部审批流程，请及时跟进签署。",
              },
              next: { id: "sc_end", type: NodeType.END, title: "流程结束" },
            },
          },
        },
      },
    },
  },
  {
    id: "bidding",
    name: "招标采购流程",
    description: "需求审核 → 生成标书 → 等待投标 → 并行评标 → 审批",
    category: "industry",
    icon: ClipboardList,
    color: "text-pink-600 bg-pink-50",
    nodes: {
      id: "start",
      type: NodeType.START,
      title: "提交招标需求",
      next: {
        id: "bid_n1",
        type: NodeType.APPROVAL,
        title: "采购部审核需求",
        approverType: "ROLE",
        approverValue: "ADMIN",
        next: {
          id: "bid_n2",
          type: NodeType.SCRIPT,
          title: "自动生成招标文件",
          props: {
            scriptType: "API",
            apiUrl: "/api/bidding/generate",
            apiMethod: "POST",
            apiBody: '{"projectName": "${projectName}", "budget": "${budget}"}',
            continueOnError: false,
          },
          next: {
            id: "bid_n3",
            type: NodeType.TIMER,
            title: "等待投标截止（7天）",
            props: { timerType: "DELAY", delayMinutes: 10080 },
            next: {
              id: "bid_n4",
              type: NodeType.PARALLEL,
              title: "并行评标",
              approverType: "ROLE",
              approverValue: "ADMIN",
              branches: [
                {
                  id: "bid_b1",
                  type: NodeType.CONDITION,
                  title: "技术评标",
                  next: {
                    id: "bid_n5",
                    type: NodeType.APPROVAL,
                    title: "技术专家评标",
                    approverType: "ROLE",
                    approverValue: "ADMIN",
                  },
                },
                {
                  id: "bid_b2",
                  type: NodeType.CONDITION,
                  title: "商务评标",
                  next: {
                    id: "bid_n6",
                    type: NodeType.APPROVAL,
                    title: "商务专家评标",
                    approverType: "ROLE",
                    approverValue: "FINANCE",
                  },
                },
              ],
              branchStrategy: "PARALLEL",
              next: {
                id: "bid_n7",
                type: NodeType.APPROVAL,
                title: "评标委员会定标",
                approverType: "ROLE",
                approverValue: "MANAGER",
                next: {
                  id: "bid_n8",
                  type: NodeType.NOTIFICATION,
                  title: "通知中标结果",
                  props: {
                    recipientType: "INITIATOR",
                    notificationTitle: "招标结果通知",
                    notificationContent:
                      "招标项目「${projectName}」已完成评标，请查看中标结果。",
                  },
                  next: {
                    id: "bid_end",
                    type: NodeType.END,
                    title: "流程结束",
                  },
                },
              },
            },
          },
        },
      },
    },
  },
  {
    id: "safety_incident",
    name: "安全事故处理",
    description: "自动记录 → 并行处置+通知 → 事故调查 → 整改审批",
    category: "industry",
    icon: ShieldCheck,
    color: "text-red-700 bg-red-50",
    nodes: {
      id: "start",
      type: NodeType.START,
      title: "报告安全事故",
      next: {
        id: "sf_n1",
        type: NodeType.SCRIPT,
        title: "自动记录事故信息",
        props: {
          scriptType: "API",
          apiUrl: "/api/safety/record",
          apiMethod: "POST",
          apiBody: '{"type": "${accidentType}", "location": "${location}"}',
          continueOnError: true,
        },
        next: {
          id: "sf_n2",
          type: NodeType.PARALLEL,
          title: "并行处置（现场+通知）",
          approverType: "ROLE",
          approverValue: "ADMIN",
          branches: [
            {
              id: "sf_b1",
              type: NodeType.CONDITION,
              title: "现场处置",
              next: {
                id: "sf_n3",
                type: NodeType.MANUAL,
                title: "现场紧急处置",
                approverType: "ROLE",
                approverValue: "ADMIN",
                props: {
                  taskDescription: "立即前往事故现场进行紧急处置，确保人员安全",
                  priority: "HIGH",
                },
              },
            },
            {
              id: "sf_b2",
              type: NodeType.CONDITION,
              title: "上报通知",
              next: {
                id: "sf_n4",
                type: NodeType.NOTIFICATION,
                title: "通知安全管理层",
                props: {
                  recipientType: "ROLE",
                  recipientValue: "MANAGER",
                  notificationTitle: "【紧急】安全事故报告",
                  notificationContent:
                    "发生安全事故，地点: ${location}，请立即关注。",
                },
              },
            },
          ],
          branchStrategy: "PARALLEL",
          next: {
            id: "sf_n5",
            type: NodeType.APPROVAL,
            title: "事故调查报告审核",
            approverType: "ROLE",
            approverValue: "MANAGER",
            next: {
              id: "sf_n6",
              type: NodeType.APPROVAL,
              title: "整改方案审批",
              approverType: "ROLE",
              approverValue: "MANAGER",
              next: {
                id: "sf_n7",
                type: NodeType.MANUAL,
                title: "执行整改措施",
                approverType: "ROLE",
                approverValue: "ADMIN",
                props: {
                  taskDescription: "按照整改方案执行安全整改措施",
                  priority: "HIGH",
                },
                next: {
                  id: "sf_n8",
                  type: NodeType.APPROVAL,
                  title: "整改验收确认",
                  approverType: "ROLE",
                  approverValue: "MANAGER",
                  next: { id: "sf_end", type: NodeType.END, title: "流程结束" },
                },
              },
            },
          },
        },
      },
    },
  },
  {
    id: "leave_advanced",
    name: "请假全流程",
    description: "天数判断 → 分级审批 → 子流程交接 → 定时提醒 → 通知",
    category: "office",
    icon: Calendar,
    color: "text-pink-500 bg-pink-50",
    nodes: {
      id: "start",
      type: NodeType.START,
      title: "提交请假申请",
      next: {
        id: "la_n1",
        type: NodeType.APPROVAL,
        title: "直属上级审批",
        approverType: "DIRECT_LEADER",
        branches: [
          {
            id: "la_b1",
            type: NodeType.CONDITION,
            title: "请假 ≤ 3天",
            condition: "days <= 3",
          },
          {
            id: "la_b2",
            type: NodeType.CONDITION,
            title: "3天 < 请假 ≤ 7天",
            condition: "days > 3 && days <= 7",
            next: {
              id: "la_n2",
              type: NodeType.APPROVAL,
              title: "部门经理审批",
              approverType: "DEPT_MANAGER",
            },
          },
          {
            id: "la_b3",
            type: NodeType.CONDITION,
            title: "请假 > 7天",
            condition: "days > 7",
            next: {
              id: "la_n3",
              type: NodeType.APPROVAL,
              title: "部门经理审批",
              approverType: "DEPT_MANAGER",
              next: {
                id: "la_n4",
                type: NodeType.APPROVAL,
                title: "总经理审批",
                approverType: "ROLE",
                approverValue: "MANAGER",
              },
            },
          },
        ],
        branchStrategy: "EXCLUSIVE",
        next: {
          id: "la_n5",
          type: NodeType.SUBPROCESS,
          title: "工作交接子流程",
          props: {
            subprocessId: "handover_process",
            variableMapping: '{"assignee": "${initiator}", "days": "${days}"}',
            waitForCompletion: true,
          },
          next: {
            id: "la_n6",
            type: NodeType.TIMER,
            title: "假期结束前1天提醒",
            props: { timerType: "DELAY", delayMinutes: 1440 },
            next: {
              id: "la_n7",
              type: NodeType.NOTIFICATION,
              title: "通知请假结果",
              props: {
                recipientType: "INITIATOR",
                notificationTitle: "请假审批结果",
                notificationContent:
                  "您的请假申请（${days}天）已审批通过，请做好工作交接。",
              },
              next: { id: "la_end", type: NodeType.END, title: "流程结束" },
            },
          },
        },
      },
    },
  },
  {
    id: "deployment",
    name: "生产环境发布",
    description: "代码审查 → 自动构建 → 等待窗口 → 并行部署+监控 → 验证",
    category: "it",
    icon: Server,
    color: "text-slate-700 bg-slate-100",
    nodes: {
      id: "start",
      type: NodeType.START,
      title: "提交发布申请",
      next: {
        id: "dep_n1",
        type: NodeType.APPROVAL,
        title: "技术负责人代码审查",
        approverType: "ROLE",
        approverValue: "ADMIN",
        next: {
          id: "dep_n2",
          type: NodeType.SCRIPT,
          title: "自动构建与测试",
          props: {
            scriptType: "API",
            apiUrl: "/api/ci/build",
            apiMethod: "POST",
            apiBody: '{"branch": "${branch}", "version": "${version}"}',
            continueOnError: false,
          },
          next: {
            id: "dep_n3",
            type: NodeType.APPROVAL,
            title: "发布审批",
            approverType: "ROLE",
            approverValue: "MANAGER",
            next: {
              id: "dep_n4",
              type: NodeType.TIMER,
              title: "等待发布窗口",
              props: { timerType: "DELAY", delayMinutes: 30 },
              next: {
                id: "dep_n5",
                type: NodeType.PARALLEL,
                title: "并行执行（部署+监控）",
                approverType: "ROLE",
                approverValue: "ADMIN",
                branches: [
                  {
                    id: "dep_b1",
                    type: NodeType.CONDITION,
                    title: "执行部署",
                    next: {
                      id: "dep_n6",
                      type: NodeType.SCRIPT,
                      title: "执行自动部署",
                      props: {
                        scriptType: "API",
                        apiUrl: "/api/deploy/execute",
                        apiMethod: "POST",
                        apiBody: '{"version": "${version}"}',
                        continueOnError: false,
                      },
                    },
                  },
                  {
                    id: "dep_b2",
                    type: NodeType.CONDITION,
                    title: "监控告警",
                    next: {
                      id: "dep_n7",
                      type: NodeType.NOTIFICATION,
                      title: "通知运维团队监控",
                      props: {
                        recipientType: "ROLE",
                        recipientValue: "ADMIN",
                        notificationTitle: "发布监控通知",
                        notificationContent:
                          "版本 ${version} 正在发布，请密切关注系统监控指标。",
                      },
                    },
                  },
                ],
                branchStrategy: "PARALLEL",
                next: {
                  id: "dep_n8",
                  type: NodeType.MANUAL,
                  title: "发布后验证确认",
                  approverType: "ROLE",
                  approverValue: "ADMIN",
                  props: {
                    taskDescription: "验证发布后系统功能正常，检查关键业务指标",
                    priority: "HIGH",
                  },
                  next: {
                    id: "dep_n9",
                    type: NodeType.NOTIFICATION,
                    title: "通知发布完成",
                    props: {
                      recipientType: "INITIATOR",
                      notificationTitle: "发布完成通知",
                      notificationContent:
                        "版本 ${version} 已成功发布到生产环境。",
                    },
                    next: {
                      id: "dep_end",
                      type: NodeType.END,
                      title: "流程结束",
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
  {
    id: "empty",
    name: "空白流程",
    description: "从零开始设计你的流程",
    category: "other",
    icon: Sparkles,
    color: "text-slate-500 bg-slate-50",
    nodes: {
      id: "start",
      type: NodeType.START,
      title: "开始",
      next: { id: "end", type: NodeType.END, title: "流程结束" },
    },
  },
];

// ==================== 模板选择器 ====================

const TemplatePickerModal = ({
  open,
  onClose,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (t: WorkflowTemplate) => void;
}) => {
  const [activeCategory, setActiveCategory] = useState("all");
  if (!open) return null;
  const filtered =
    activeCategory === "all"
      ? WORKFLOW_TEMPLATES
      : WORKFLOW_TEMPLATES.filter((t) => t.category === activeCategory);
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-[720px] max-h-[85vh] overflow-hidden flex flex-col">
        <div className="p-5 border-b border-slate-100 flex justify-between items-center shrink-0">
          <div>
            <h2 className="text-lg font-bold text-slate-800">选择流程模板</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              覆盖行政、财务、人事、销售、IT、行业等 {WORKFLOW_TEMPLATES.length}{" "}
              个模板
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X size={18} className="text-slate-400" />
          </button>
        </div>
        {/* 分类标签 */}
        <div className="px-5 pt-4 pb-2 flex gap-2 flex-wrap shrink-0">
          {TEMPLATE_CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                activeCategory === cat.id
                  ? "bg-pink-500 text-white shadow-sm"
                  : "bg-slate-100 text-slate-500 hover:bg-slate-200"
              }`}
            >
              {cat.label}
              {cat.id !== "all" && (
                <span className="ml-1 opacity-60">
                  {
                    WORKFLOW_TEMPLATES.filter((t) => t.category === cat.id)
                      .length
                  }
                </span>
              )}
            </button>
          ))}
        </div>
        {/* 模板列表 */}
        <div className="p-5 pt-2 grid grid-cols-2 gap-3 overflow-y-auto flex-1">
          {filtered.map((t) => {
            const TIcon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => {
                  onSelect(t);
                  onClose();
                }}
                className="text-left p-4 rounded-xl border-2 border-slate-100 hover:border-pink-200 hover:shadow-md transition-all group"
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`w-10 h-10 rounded-lg flex items-center justify-center ${t.color} shrink-0`}
                  >
                    <TIcon size={20} />
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold text-sm text-slate-700 group-hover:text-pink-500 transition-colors">
                      {t.name}
                    </div>
                    <div className="text-xs text-slate-400 mt-1 leading-relaxed">
                      {t.description}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
          {filtered.length === 0 && (
            <div className="col-span-2 text-center py-10 text-slate-400 text-sm">
              该分类暂无模板
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ==================== 属性面板 ====================

type ApproverCacheType = "ROLE" | "USER" | "DEPT";

interface ApproverCacheEntry {
  data: any[];
  expiresAt: number;
}

const APPROVER_CACHE_PREFIX = "workflow_approver_options_";
const APPROVER_CACHE_TTL_MS = 5 * 60 * 1000;

// 按租户+用户隔离缓存，避免跨租户/跨账号复用审批候选数据
const getApproverCacheKey = (type: ApproverCacheType): string => {
  try {
    const rawUser = localStorage.getItem("user");
    if (!rawUser) return `${APPROVER_CACHE_PREFIX}anonymous_${type}`;
    const user = JSON.parse(rawUser) as Record<string, unknown>;
    const tenantId = String(user.tenantId ?? "default");
    const userId = String(user.id ?? user.userId ?? user.username ?? "anonymous");
    return `${APPROVER_CACHE_PREFIX}${tenantId}_${userId}_${type}`;
  } catch {
    return `${APPROVER_CACHE_PREFIX}anonymous_${type}`;
  }
};

// 使用本地缓存替代模块级 let 变量，避免页面热更新和多实例下缓存状态污染
const readApproverCache = (type: ApproverCacheType): any[] | null => {
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

const writeApproverCache = (type: ApproverCacheType, data: any[]) => {
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

const flattenDeptTree = (nodes: any[], result: any[] = []): any[] => {
  nodes.forEach((node) => {
    result.push(node);
    if (Array.isArray(node.children) && node.children.length > 0) {
      flattenDeptTree(node.children, result);
    }
  });
  return result;
};

// 减少历史撤销记录污染的本地化受控组件
const LazyInput = ({ value, onChange, ...props }: any) => {
  const [val, setVal] = useState(value);
  useEffect(() => {
    setVal(value);
  }, [value]);
  return (
    <Input
      {...props}
      value={val || ""}
      onChange={(e: any) => setVal(e.target.value)}
      onBlur={() => onChange(val)}
      onKeyDown={(e: any) => {
        if (e.key === "Enter") onChange(val);
      }}
    />
  );
};

const LazyTextarea = ({ value, onChange, className, ...props }: any) => {
  const [val, setVal] = useState(value);
  useEffect(() => {
    setVal(value);
  }, [value]);
  return (
    <textarea
      {...props}
      className={className}
      value={val || ""}
      onChange={(e: any) => setVal(e.target.value)}
      onBlur={() => onChange(val)}
    />
  );
};

// 角色/用户/部门选择器子组件 - 支持多选
const ApproverValueSelector = ({
  type,
  value,
  onChange,
  onLabelChange,
  multiple = false,
}: {
  type: string;
  value: string;
  onChange: (val: string) => void;
  onLabelChange?: (label: string) => void;
  multiple?: boolean;
}) => {
  const [roles, setRoles] = useState<any[]>(() => readApproverCache("ROLE") || []);
  const [users, setUsers] = useState<any[]>(() => readApproverCache("USER") || []);
  const [depts, setDepts] = useState<any[]>(() => readApproverCache("DEPT") || []);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState("");

  // 切换类型时清理搜索词，避免上个类型的过滤条件污染当前列表
  useEffect(() => {
    setSearchText("");
  }, [type]);

  // 加载数据（优先命中本地缓存，miss 时请求后写回）
  useEffect(() => {
    let cancelled = false;

    const loadData = async () => {
      try {
        if (type === "ROLE") {
          const cached = readApproverCache("ROLE");
          if (cached) {
            if (!cancelled) setRoles(cached);
            return;
          }
          setLoading(true);
          const res: any = await getRoleList();
          const next = Array.isArray(res) ? res : res?.data || res?.rows || [];
          writeApproverCache("ROLE", next);
          if (!cancelled) setRoles(next);
        } else if (type === "USER") {
          const cached = readApproverCache("USER");
          if (cached) {
            if (!cancelled) setUsers(cached);
            return;
          }
          setLoading(true);
          const res: any = await getUserList();
          const next = Array.isArray(res) ? res : res?.data || res?.rows || [];
          writeApproverCache("USER", next);
          if (!cancelled) setUsers(next);
        } else if (type === "DEPT") {
          const cached = readApproverCache("DEPT");
          if (cached) {
            if (!cancelled) setDepts(cached);
            return;
          }
          setLoading(true);
          const res: any = await getDeptTree();
          const tree = Array.isArray(res) ? res : res?.data || [];
          const next = flattenDeptTree(tree);
          writeApproverCache("DEPT", next);
          if (!cancelled) setDepts(next);
        }
      } catch (e) {
        console.error("加载选项数据失败:", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    if (type === "ROLE" || type === "USER" || type === "DEPT") {
      loadData();
    }

    return () => {
      cancelled = true;
    };
  }, [type]);

  // 当前已选值数组
  const selectedValues = value
    ? value
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean)
    : [];

  // 根据类型和值获取显示名称
  const getDisplayLabel = (vals: string[]): string => {
    return vals
      .map((v) => {
        if (type === "ROLE") {
          const role = roles.find((r) => r.roleKey === v);
          return role?.roleName || v;
        } else if (type === "USER") {
          const user = users.find((u) => String(u.userId) === v);
          return user?.nickName || user?.userName || v;
        } else if (type === "DEPT") {
          const dept = depts.find((d) => String(d.deptId) === v);
          return dept?.deptName || v;
        }
        return v;
      })
      .join(", ");
  };

  // 切换选中
  const toggleValue = (val: string) => {
    if (multiple) {
      const newValues = selectedValues.includes(val)
        ? selectedValues.filter((v) => v !== val)
        : [...selectedValues, val];
      onChange(newValues.join(","));
      onLabelChange?.(getDisplayLabel(newValues));
    } else {
      const newVal = val === value ? "" : val;
      onChange(newVal);
      onLabelChange?.(newVal ? getDisplayLabel([newVal]) : "");
    }
  };

  if (type === "ROLE") {
    const filtered = roles.filter(
      (r) =>
        !searchText ||
        r.roleName?.includes(searchText) ||
        r.roleKey?.includes(searchText),
    );
    return (
      <div>
        <span className="text-xs text-slate-400 mb-1 block">
          选择角色{multiple ? "（可多选）" : ""}
        </span>
        {loading ? (
          <div className="text-xs text-slate-400 py-2 text-center">
            加载中...
          </div>
        ) : (
          <>
            {roles.length > 5 && (
              <Input
                className="text-xs mb-2"
                placeholder="搜索角色..."
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
              />
            )}
            <div className="max-h-[200px] overflow-y-auto border border-slate-200 rounded-lg">
              {filtered.length === 0 ? (
                <div className="text-xs text-slate-400 py-3 text-center">
                  暂无角色数据
                </div>
              ) : (
                filtered.map((r) => {
                  const isSelected = selectedValues.includes(r.roleKey);
                  return (
                    <div
                      key={r.roleId}
                      onClick={() => toggleValue(r.roleKey)}
                      className={`flex items-center gap-2 px-3 py-2 cursor-pointer text-xs transition-colors ${
                        isSelected
                          ? "bg-pink-50 text-pink-600"
                          : "hover:bg-slate-50 text-slate-600"
                      }`}
                    >
                      <div
                        className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                          isSelected
                            ? "bg-pink-400 border-pink-400"
                            : "border-slate-300"
                        }`}
                      >
                        {isSelected && (
                          <span className="text-white text-[10px]">✓</span>
                        )}
                      </div>
                      <span className="font-medium">{r.roleName}</span>
                      <span className="text-slate-400 ml-auto">
                        {r.roleKey}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
            {selectedValues.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {selectedValues.map((v) => {
                  const role = roles.find((r) => r.roleKey === v);
                  return (
                    <span
                      key={v}
                      className="inline-flex items-center gap-1 px-2 py-0.5 bg-pink-50 text-pink-600 rounded-full text-[10px]"
                    >
                      {role?.roleName || v}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleValue(v);
                        }}
                        className="hover:text-pink-700"
                      >
                        ×
                      </button>
                    </span>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  if (type === "USER") {
    const filtered = users.filter(
      (u) =>
        !searchText ||
        u.nickName?.includes(searchText) ||
        u.userName?.includes(searchText),
    );
    return (
      <div>
        <span className="text-xs text-slate-400 mb-1 block">
          选择人员{multiple ? "（可多选）" : ""}
        </span>
        {loading ? (
          <div className="text-xs text-slate-400 py-2 text-center">
            加载中...
          </div>
        ) : (
          <>
            <Input
              className="text-xs mb-2"
              placeholder="搜索人员..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
            />
            <div className="max-h-[200px] overflow-y-auto border border-slate-200 rounded-lg">
              {filtered.length === 0 ? (
                <div className="text-xs text-slate-400 py-3 text-center">
                  暂无人员数据
                </div>
              ) : (
                filtered.map((u) => {
                  const uid = String(u.userId);
                  const isSelected = selectedValues.includes(uid);
                  return (
                    <div
                      key={u.userId}
                      onClick={() => toggleValue(uid)}
                      className={`flex items-center gap-2 px-3 py-2 cursor-pointer text-xs transition-colors ${
                        isSelected
                          ? "bg-pink-50 text-pink-600"
                          : "hover:bg-slate-50 text-slate-600"
                      }`}
                    >
                      <div
                        className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                          isSelected
                            ? "bg-pink-400 border-pink-400"
                            : "border-slate-300"
                        }`}
                      >
                        {isSelected && (
                          <span className="text-white text-[10px]">✓</span>
                        )}
                      </div>
                      <span className="font-medium">
                        {u.nickName || u.userName}
                      </span>
                      <span className="text-slate-400 ml-auto">
                        {u.userName}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
            {selectedValues.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {selectedValues.map((v) => {
                  const user = users.find((u) => String(u.userId) === v);
                  return (
                    <span
                      key={v}
                      className="inline-flex items-center gap-1 px-2 py-0.5 bg-pink-50 text-pink-600 rounded-full text-[10px]"
                    >
                      {user?.nickName || user?.userName || v}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleValue(v);
                        }}
                        className="hover:text-pink-700"
                      >
                        ×
                      </button>
                    </span>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  if (type === "DEPT") {
    const filtered = depts.filter(
      (d) => !searchText || d.deptName?.includes(searchText),
    );
    return (
      <div>
        <span className="text-xs text-slate-400 mb-1 block">
          选择部门{multiple ? "（可多选）" : ""}
        </span>
        {loading ? (
          <div className="text-xs text-slate-400 py-2 text-center">
            加载中...
          </div>
        ) : (
          <>
            {depts.length > 5 && (
              <Input
                className="text-xs mb-2"
                placeholder="搜索部门..."
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
              />
            )}
            <div className="max-h-[200px] overflow-y-auto border border-slate-200 rounded-lg">
              {filtered.length === 0 ? (
                <div className="text-xs text-slate-400 py-3 text-center">
                  暂无部门数据
                </div>
              ) : (
                filtered.map((d) => {
                  const did = String(d.deptId);
                  const isSelected = selectedValues.includes(did);
                  return (
                    <div
                      key={d.deptId}
                      onClick={() => toggleValue(did)}
                      className={`flex items-center gap-2 px-3 py-2 cursor-pointer text-xs transition-colors ${
                        isSelected
                          ? "bg-pink-50 text-pink-600"
                          : "hover:bg-slate-50 text-slate-600"
                      }`}
                    >
                      <div
                        className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                          isSelected
                            ? "bg-pink-400 border-pink-400"
                            : "border-slate-300"
                        }`}
                      >
                        {isSelected && (
                          <span className="text-white text-[10px]">✓</span>
                        )}
                      </div>
                      <span className="font-medium">{d.deptName}</span>
                    </div>
                  );
                })
              )}
            </div>
            {selectedValues.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {selectedValues.map((v) => {
                  const dept = depts.find((d) => String(d.deptId) === v);
                  return (
                    <span
                      key={v}
                      className="inline-flex items-center gap-1 px-2 py-0.5 bg-pink-50 text-pink-600 rounded-full text-[10px]"
                    >
                      {dept?.deptName || v}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleValue(v);
                        }}
                        className="hover:text-pink-700"
                      >
                        ×
                      </button>
                    </span>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  return null;
};

const PropertyPanel = ({
  node,
  onClose,
  onUpdate,
  onDelete,
  onConfirmAction,
}: {
  node: WorkflowNode;
  onClose: () => void;
  onUpdate: (id: string, data: Partial<WorkflowNode>) => void;
  onDelete: (id: string) => void;
  onConfirmAction: (message: string, onConfirm: () => void) => void;
}) => {
  const [formData, setFormData] = useState(node);
  // 当节点 ID 变化或节点内容（分支、props）变化时同步 formData
  useEffect(() => {
    setFormData(node);
  }, [node.id, node.branches, node.branchStrategy, node.props]);
  const handleChange = (field: keyof WorkflowNode, value: any) => {
    // 切换审批方式时，清空之前选择的审批人，避免残留旧数据
    if (field === "approverType") {
      const updated = { ...formData, approverType: value, approverValue: "" };
      setFormData(updated);
      onUpdate(node.id, { approverType: value, approverValue: "" });
      return;
    }
    setFormData((prev) => ({ ...prev, [field]: value }));
    onUpdate(node.id, { [field]: value });
  };
  const visual = getNodeVisual(node.type);
  const PIcon = visual.icon;
  const branchStrategyOptions =
    node.type === NodeType.PARALLEL
      ? (Object.entries(BRANCH_STRATEGY_LABELS).filter(([key]) =>
          ["PARALLEL", "RACE"].includes(key),
        ) as Array<[string, string]>)
      : (Object.entries(BRANCH_STRATEGY_LABELS).filter(
          ([key]) => key === "EXCLUSIVE",
        ) as Array<[string, string]>);
  const branchStrategyValues = branchStrategyOptions.map(([key]) => key);
  const normalizedBranchStrategy = branchStrategyValues.includes(
    String(formData.branchStrategy || ""),
  )
    ? String(formData.branchStrategy)
    : node.type === NodeType.PARALLEL
      ? "PARALLEL"
      : "EXCLUSIVE";

  return (
    <div className="fixed right-0 top-0 h-full w-96 bg-white/90 backdrop-blur-2xl shadow-[0_0_50px_-12px_rgba(0,0,0,0.25)] z-50 flex flex-col border-l border-slate-200/60 animate-in slide-in-from-right duration-300 ease-out">
      <div className="px-5 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
        <div className="flex items-center gap-3">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center ${visual.iconBg} shadow-sm`}
          >
            <PIcon size={20} className={visual.iconColor} />
          </div>
          <div>
            <h3 className="font-bold text-slate-800 text-base">节点设置</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              配置 {NODE_TYPE_LABELS[node.type] || node.type} 的属性
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400 hover:text-slate-600"
        >
          <X size={18} />
        </button>
      </div>
      <div className="p-5 flex-1 overflow-y-auto custom-scrollbar">
        <div className="flex justify-between items-center mb-6 bg-slate-50 p-3 rounded-xl border border-slate-100">
          <span
            className={`px-3 py-1 rounded-full text-xs font-semibold ${visual.iconBg} ${visual.iconColor}`}
          >
            {NODE_TYPE_LABELS[node.type] || node.type}
          </span>
          {node.type !== NodeType.START && node.type !== NodeType.END && (
            <button
              onClick={() => onDelete(node.id)}
              className="text-red-500 hover:bg-red-50 hover:text-red-600 px-3 py-1.5 rounded-lg transition-colors text-xs font-medium flex items-center gap-1"
              title="删除节点"
            >
              <Trash2 size={14} /> 删除节点
            </button>
          )}
        </div>
        <div className="space-y-5">
          <div className="space-y-3">
            <label className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
              <Settings size={12} /> 基础信息
            </label>
            <div>
              <span className="text-xs text-slate-400 mb-1 block">名称</span>
              <LazyInput
                value={formData.title}
                onChange={(val: any) => handleChange("title", val)}
                placeholder="请输入节点名称"
              />
            </div>
          </div>
          {node.type === NodeType.APPROVAL && (
            <div className="space-y-3 pt-4 border-t border-slate-100">
              <label className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
                <UserCheck size={12} /> 审批人设置
              </label>
              <div>
                <span className="text-xs text-slate-400 mb-1 block">
                  审批方式
                </span>
                <Select
                  value={formData.approverType || "ROLE"}
                  onValueChange={(v) => handleChange("approverType", v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="请选择" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(APPROVER_TYPE_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {formData.approverType === "ROLE" && (
                <ApproverValueSelector
                  type="ROLE"
                  value={formData.approverValue || ""}
                  onChange={(val) => handleChange("approverValue", val)}
                  onLabelChange={(label) =>
                    handleChange("props", {
                      ...formData.props,
                      approverLabel: label,
                    })
                  }
                />
              )}
              {formData.approverType === "USER" && (
                <ApproverValueSelector
                  type="USER"
                  value={formData.approverValue || ""}
                  onChange={(val) => handleChange("approverValue", val)}
                  onLabelChange={(label) =>
                    handleChange("props", {
                      ...formData.props,
                      approverLabel: label,
                    })
                  }
                />
              )}
              {formData.approverType === "USERS" && (
                <ApproverValueSelector
                  type="USER"
                  value={formData.approverValue || ""}
                  onChange={(val) => handleChange("approverValue", val)}
                  onLabelChange={(label) =>
                    handleChange("props", {
                      ...formData.props,
                      approverLabel: label,
                    })
                  }
                  multiple={true}
                />
              )}
              {formData.approverType === "DEPT" && (
                <ApproverValueSelector
                  type="DEPT"
                  value={formData.approverValue || ""}
                  onChange={(val) => handleChange("approverValue", val)}
                  onLabelChange={(label) =>
                    handleChange("props", {
                      ...formData.props,
                      approverLabel: label,
                    })
                  }
                />
              )}
              {formData.approverType === "DIRECT_LEADER" && (
                <div className="bg-pink-50 border border-pink-50 rounded-lg px-3 py-2">
                  <p className="text-xs text-pink-600 font-medium">直属上级</p>
                  <p className="text-[10px] text-pink-400 mt-0.5">
                    系统将自动查找流程发起人的直属上级作为审批人。无需手动指定。
                  </p>
                </div>
              )}
              {formData.approverType === "DEPT_MANAGER" && (
                <div className="bg-pink-50 border border-pink-50 rounded-lg px-3 py-2">
                  <p className="text-xs text-pink-600 font-medium">
                    部门负责人
                  </p>
                  <p className="text-[10px] text-pink-400 mt-0.5">
                    系统将自动查找流程发起人所在部门的负责人作为审批人。无需手动指定。
                  </p>
                </div>
              )}
            </div>
          )}
          {node.type === NodeType.PARALLEL && (
            <div className="space-y-3 pt-4 border-t border-slate-100">
              <label className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
                <Layers size={12} /> 会签设置
              </label>
              {/* 会签类型选择 */}
              <div>
                <span className="text-xs text-slate-400 mb-1 block">
                  会签类型
                </span>
                <Select
                  value={formData.signType || "ALL"}
                  onValueChange={(v) => handleChange("signType", v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="请选择" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">全签（所有人同意）</SelectItem>
                    <SelectItem value="ANY">或签（任一人同意）</SelectItem>
                    <SelectItem value="PERCENT">
                      比例签（按比例通过）
                    </SelectItem>
                    <SelectItem value="SEQUENTIAL">
                      顺序签（按顺序逐个审批）
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {/* 比例签 - 通过百分比设置 */}
              {formData.signType === "PERCENT" && (
                <div>
                  <span className="text-xs text-slate-400 mb-1 block">
                    通过比例 (%)
                  </span>
                  <LazyInput
                    type="number"
                    min={1}
                    max={100}
                    placeholder="例如: 60"
                    value={formData.passPercent || ""}
                    onChange={(val: any) =>
                      handleChange("passPercent", parseInt(val) || 0)
                    }
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    💡 当同意人数达到该比例时流程通过
                  </p>
                </div>
              )}
              {/* 审批人选择 - 会签场景下隐藏"指定多人"选项，因为会签本身就是多人审批 */}
              <div>
                <span className="text-xs text-slate-400 mb-1 block">
                  审批方式
                </span>
                <Select
                  value={
                    formData.approverType === "USERS"
                      ? "USER"
                      : formData.approverType || "ROLE"
                  }
                  onValueChange={(v) => handleChange("approverType", v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="请选择" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(APPROVER_TYPE_LABELS)
                      .filter(([k]) => k !== "USERS")
                      .map(([k, v]) => (
                        <SelectItem key={k} value={k}>
                          {v}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              {(formData.approverType === "ROLE" ||
                formData.approverType === "USER" ||
                formData.approverType === "USERS") && (
                <ApproverValueSelector
                  type={
                    formData.approverType === "USERS"
                      ? "USER"
                      : formData.approverType || "ROLE"
                  }
                  value={formData.approverValue || ""}
                  onChange={(val) => handleChange("approverValue", val)}
                  onLabelChange={(label) =>
                    handleChange("props", {
                      ...formData.props,
                      approverLabel: label,
                    })
                  }
                  multiple={true}
                />
              )}
              {/* 根据会签类型显示不同提示 */}
              <p className="text-[10px] text-slate-400 mt-1">
                {formData.signType === "ANY" &&
                  "💡 任意一人同意即可通过，一人拒绝则整体拒绝"}
                {formData.signType === "PERCENT" &&
                  `💡 同意人数 ≥ ${formData.passPercent || 0}% 时通过`}
                {formData.signType === "SEQUENTIAL" &&
                  "💡 按审批人顺序逐个签署，前一人通过后才轮到下一人"}
                {(!formData.signType || formData.signType === "ALL") &&
                  "💡 所有审批人都同意才能通过，任一人拒绝则整体拒绝"}
              </p>
            </div>
          )}
          {/* P2-12: 表单编辑权限 — 适用于审批节点和人工任务节点 */}
          {(node.type === NodeType.APPROVAL ||
            node.type === NodeType.MANUAL) && (
            <div className="space-y-3 pt-4 border-t border-slate-100">
              <label className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
                <FileCheck size={12} /> 表单权限
              </label>
              <div className="flex items-center justify-between bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                <div>
                  <span className="text-xs text-slate-700 font-medium">
                    允许编辑表单
                  </span>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    开启后，处理人可以修改流程表单数据
                  </p>
                </div>
                <input
                  type="checkbox"
                  className="w-4 h-4 rounded border-slate-300 text-pink-500 focus:ring-pink-500 cursor-pointer"
                  checked={formData.allowEdit || false}
                  onChange={(e) => handleChange("allowEdit", e.target.checked)}
                />
              </div>
            </div>
          )}
          {/* P2-11: SLA 超时配置 — 适用于审批节点和人工任务节点 */}
          {(node.type === NodeType.APPROVAL ||
            node.type === NodeType.MANUAL) && (
            <div className="space-y-3 pt-4 border-t border-slate-100">
              <label className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
                <Clock size={12} /> SLA 超时设置
              </label>
              <div>
                <span className="text-xs text-slate-400 mb-1 block">
                  超时时间（小时）
                </span>
                <LazyInput
                  type="number"
                  placeholder="例如: 24"
                  value={formData.slaHours || ""}
                  onChange={(val: any) =>
                    handleChange("slaHours", val ? parseInt(val) : undefined)
                  }
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  💡 设置后，超时未处理将自动触发超时动作。留空表示不限时。
                </p>
              </div>
              {formData.slaHours && formData.slaHours > 0 && (
                <div>
                  <span className="text-xs text-slate-400 mb-1 block">
                    超时动作
                  </span>
                  <Select
                    value={formData.slaAction || "AUTO_PASS"}
                    onValueChange={(v) => handleChange("slaAction", v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="AUTO_PASS">自动通过</SelectItem>
                      <SelectItem value="AUTO_REJECT">自动拒绝</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}
          {node.type === NodeType.NOTIFICATION && (
            <div className="space-y-3 pt-4 border-t border-slate-100">
              <label className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
                <Bell size={12} /> 通知设置
              </label>
              <div>
                <span className="text-xs text-slate-400 mb-1 block">
                  接收人类型
                </span>
                <Select
                  value={formData.props?.recipientType || "INITIATOR"}
                  onValueChange={(v) =>
                    handleChange("props", {
                      ...formData.props,
                      recipientType: v,
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="请选择" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="INITIATOR">发起人</SelectItem>
                    <SelectItem value="ROLE">按角色</SelectItem>
                    <SelectItem value="USER">指定人员</SelectItem>
                    <SelectItem value="DEPT">按部门</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {(formData.props?.recipientType === "ROLE" ||
                formData.props?.recipientType === "USER" ||
                formData.props?.recipientType === "DEPT") && (
                <ApproverValueSelector
                  type={formData.props?.recipientType || "ROLE"}
                  value={formData.props?.recipientValue || ""}
                  onChange={(val) =>
                    handleChange("props", {
                      ...formData.props,
                      recipientValue: val,
                    })
                  }
                />
              )}
              <div>
                <span className="text-xs text-slate-400 mb-1 block">
                  通知标题
                </span>
                <LazyInput
                  placeholder="例如: 您有新的审批任务"
                  value={formData.props?.notificationTitle || ""}
                  onChange={(val: any) =>
                    handleChange("props", {
                      ...formData.props,
                      notificationTitle: val,
                    })
                  }
                />
              </div>
              <div>
                <span className="text-xs text-slate-400 mb-1 block">
                  通知内容
                </span>
                <LazyTextarea
                  className="w-full border border-slate-200 rounded-lg p-2.5 text-sm min-h-[80px] focus:ring-2 focus:ring-pink-400 outline-none"
                  placeholder="支持变量: ${initiator}, ${amount}, ${days} 等"
                  value={formData.props?.notificationContent || ""}
                  onChange={(val: any) =>
                    handleChange("props", {
                      ...formData.props,
                      notificationContent: val,
                    })
                  }
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  💡 可使用 ${"{"}变量名{"}"} 引用流程数据
                </p>
              </div>
            </div>
          )}
          {node.type === NodeType.SCRIPT && (
            <div className="space-y-3 pt-4 border-t border-slate-100">
              <label className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
                <Code size={12} /> 脚本设置
              </label>
              <div>
                <span className="text-xs text-slate-400 mb-1 block">
                  脚本类型
                </span>
                <Select
                  value={formData.props?.scriptType || "GROOVY"}
                  onValueChange={(v) =>
                    handleChange("props", { ...formData.props, scriptType: v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="请选择" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="GROOVY">Groovy 脚本</SelectItem>
                    <SelectItem value="JAVASCRIPT">JavaScript 脚本</SelectItem>
                    <SelectItem value="API">HTTP API 调用</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {(formData.props?.scriptType === "GROOVY" ||
                formData.props?.scriptType === "JAVASCRIPT") && (
                <div>
                  <span className="text-xs text-slate-400 mb-1 block">
                    脚本内容
                  </span>
                  <LazyTextarea
                    className="w-full border border-slate-200 rounded-lg p-2.5 text-sm font-mono text-xs min-h-[120px] bg-slate-50 focus:ring-2 focus:ring-green-500 outline-none"
                    placeholder={
                      formData.props?.scriptType === "GROOVY"
                        ? "def result = amount * 1.1\nreturn result"
                        : "const result = amount * 1.1;\nreturn result;"
                    }
                    value={formData.props?.scriptContent || ""}
                    onChange={(val: any) =>
                      handleChange("props", {
                        ...formData.props,
                        scriptContent: val,
                      })
                    }
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    💡 可访问流程变量: amount, days, initiator 等
                  </p>
                </div>
              )}
              {formData.props?.scriptType === "API" && (
                <>
                  <div>
                    <span className="text-xs text-slate-400 mb-1 block">
                      API URL
                    </span>
                    <LazyInput
                      className="font-mono"
                      placeholder="https://api.example.com/endpoint"
                      value={formData.props?.apiUrl || ""}
                      onChange={(val: any) =>
                        handleChange("props", {
                          ...formData.props,
                          apiUrl: val,
                        })
                      }
                    />
                  </div>
                  <div>
                    <span className="text-xs text-slate-400 mb-1 block">
                      请求方法
                    </span>
                    <Select
                      value={formData.props?.apiMethod || "GET"}
                      onValueChange={(v) =>
                        handleChange("props", {
                          ...formData.props,
                          apiMethod: v,
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="请选择" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="GET">GET</SelectItem>
                        <SelectItem value="POST">POST</SelectItem>
                        <SelectItem value="PUT">PUT</SelectItem>
                        <SelectItem value="DELETE">DELETE</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <span className="text-xs text-slate-400 mb-1 block">
                      请求头 (JSON)
                    </span>
                    <LazyTextarea
                      className="w-full border border-slate-200 rounded-lg p-2.5 text-sm font-mono text-xs min-h-[60px] bg-slate-50"
                      placeholder='{"Content-Type": "application/json"}'
                      value={formData.props?.apiHeaders || ""}
                      onChange={(val: any) =>
                        handleChange("props", {
                          ...formData.props,
                          apiHeaders: val,
                        })
                      }
                    />
                  </div>
                  <div>
                    <span className="text-xs text-slate-400 mb-1 block">
                      请求体 (JSON)
                    </span>
                    <LazyTextarea
                      className="w-full border border-slate-200 rounded-lg p-2.5 text-sm font-mono text-xs min-h-[60px] bg-slate-50"
                      placeholder='{"amount": "${amount}"}'
                      value={formData.props?.apiBody || ""}
                      onChange={(val: any) =>
                        handleChange("props", {
                          ...formData.props,
                          apiBody: val,
                        })
                      }
                    />
                    <p className="text-[10px] text-slate-400 mt-1">
                      💡 可使用 ${"{"}变量名{"}"} 引用流程数据
                    </p>
                  </div>
                </>
              )}
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="continueOnError"
                  className="rounded border-slate-300"
                  checked={formData.props?.continueOnError || false}
                  onChange={(e) =>
                    handleChange("props", {
                      ...formData.props,
                      continueOnError: e.target.checked,
                    })
                  }
                />
                <label
                  htmlFor="continueOnError"
                  className="text-xs text-slate-600"
                >
                  出错时继续执行
                </label>
              </div>
            </div>
          )}
          {node.type === NodeType.TIMER && (
            <div className="space-y-3 pt-4 border-t border-slate-100">
              <label className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
                <Clock size={12} /> 定时设置
              </label>
              <div>
                <span className="text-xs text-slate-400 mb-1 block">
                  定时类型
                </span>
                <Select
                  value={formData.props?.timerType || "DELAY"}
                  onValueChange={(v) =>
                    handleChange("props", { ...formData.props, timerType: v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="请选择" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DELAY">延迟执行</SelectItem>
                    <SelectItem value="SCHEDULE">定时执行</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {formData.props?.timerType === "DELAY" && (
                <div>
                  <span className="text-xs text-slate-400 mb-1 block">
                    延迟时间（分钟）
                  </span>
                  <LazyInput
                    type="number"
                    placeholder="例如: 60"
                    min="1"
                    value={formData.props?.delayMinutes || ""}
                    onChange={(val: any) =>
                      handleChange("props", {
                        ...formData.props,
                        delayMinutes: parseInt(val) || 0,
                      })
                    }
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    💡 流程将在指定时间后自动继续
                  </p>
                </div>
              )}
              {formData.props?.timerType === "SCHEDULE" && (
                <div>
                  <span className="text-xs text-slate-400 mb-1 block">
                    定时时间
                  </span>
                  <DatePicker
                    type="datetime-local"
                    value={formData.props?.scheduleTime || ""}
                    onChange={(e) =>
                      handleChange("props", {
                        ...formData.props,
                        scheduleTime: e.target.value,
                      })
                    }
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    💡 流程将在指定时间点自动继续
                  </p>
                </div>
              )}
            </div>
          )}
          {node.type === NodeType.SUBPROCESS && (
            <div className="space-y-3 pt-4 border-t border-slate-100">
              <label className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
                <Workflow size={12} /> 子流程设置
              </label>
              <div>
                <span className="text-xs text-slate-400 mb-1 block">
                  子流程ID
                </span>
                <LazyInput
                  placeholder="输入子流程的ID"
                  value={formData.props?.subprocessId || ""}
                  onChange={(val: any) =>
                    handleChange("props", {
                      ...formData.props,
                      subprocessId: val,
                    })
                  }
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  💡 将调用指定的子流程
                </p>
              </div>
              <div>
                <span className="text-xs text-slate-400 mb-1 block">
                  变量映射 (JSON)
                </span>
                <LazyTextarea
                  className="w-full border border-slate-200 rounded-lg p-2.5 text-sm font-mono text-xs min-h-[80px] bg-slate-50 focus:ring-2 focus:ring-purple-500 outline-none"
                  placeholder='{"subAmount": "${amount}", "subDays": "${days}"}'
                  value={formData.props?.variableMapping || ""}
                  onChange={(val: any) =>
                    handleChange("props", {
                      ...formData.props,
                      variableMapping: val,
                    })
                  }
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  💡 定义父流程变量到子流程的映射关系
                </p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="waitForCompletion"
                  className="rounded border-slate-300"
                  checked={formData.props?.waitForCompletion !== false}
                  onChange={(e) =>
                    handleChange("props", {
                      ...formData.props,
                      waitForCompletion: e.target.checked,
                    })
                  }
                />
                <label
                  htmlFor="waitForCompletion"
                  className="text-xs text-slate-600"
                >
                  等待子流程完成
                </label>
              </div>
            </div>
          )}
          {node.type === NodeType.COPY && (
            <div className="space-y-3 pt-4 border-t border-slate-100">
              <label className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
                <Send size={12} /> 抄送设置
              </label>
              <div>
                <span className="text-xs text-slate-400 mb-1 block">
                  抄送人类型
                </span>
                <Select
                  value={formData.approverType || "USER"}
                  onValueChange={(v) => handleChange("approverType", v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="请选择" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USER">指定人员</SelectItem>
                    <SelectItem value="USERS">指定多人</SelectItem>
                    <SelectItem value="ROLE">按角色</SelectItem>
                    <SelectItem value="DEPT">按部门</SelectItem>
                    <SelectItem value="DEPT_MANAGER">部门负责人</SelectItem>
                    <SelectItem value="DIRECT_LEADER">直属上级</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {formData.approverType === "ROLE" && (
                <ApproverValueSelector
                  type="ROLE"
                  value={formData.approverValue || ""}
                  onChange={(val) => handleChange("approverValue", val)}
                  onLabelChange={(label) =>
                    handleChange("props", {
                      ...formData.props,
                      approverLabel: label,
                    })
                  }
                />
              )}
              {formData.approverType === "USER" && (
                <ApproverValueSelector
                  type="USER"
                  value={formData.approverValue || ""}
                  onChange={(val) => handleChange("approverValue", val)}
                  onLabelChange={(label) =>
                    handleChange("props", {
                      ...formData.props,
                      approverLabel: label,
                    })
                  }
                />
              )}
              {formData.approverType === "USERS" && (
                <ApproverValueSelector
                  type="USER"
                  value={formData.approverValue || ""}
                  onChange={(val) => handleChange("approverValue", val)}
                  onLabelChange={(label) =>
                    handleChange("props", {
                      ...formData.props,
                      approverLabel: label,
                    })
                  }
                  multiple={true}
                />
              )}
              {formData.approverType === "DEPT" && (
                <ApproverValueSelector
                  type="DEPT"
                  value={formData.approverValue || ""}
                  onChange={(val) => handleChange("approverValue", val)}
                  onLabelChange={(label) =>
                    handleChange("props", {
                      ...formData.props,
                      approverLabel: label,
                    })
                  }
                />
              )}
              {formData.approverType === "DIRECT_LEADER" && (
                <div className="bg-pink-50 border border-pink-100 rounded-lg px-3 py-2">
                  <p className="text-xs text-pink-700 font-medium">直属上级</p>
                  <p className="text-[10px] text-pink-500 mt-0.5">
                    系统将自动抄送给流程发起人的直属上级。
                  </p>
                </div>
              )}
              {formData.approverType === "DEPT_MANAGER" && (
                <div className="bg-pink-50 border border-pink-100 rounded-lg px-3 py-2">
                  <p className="text-xs text-pink-700 font-medium">
                    部门负责人
                  </p>
                  <p className="text-[10px] text-pink-500 mt-0.5">
                    系统将自动抄送给流程发起人所在部门的负责人。
                  </p>
                </div>
              )}
              <p className="text-[10px] text-slate-400 mt-1">
                💡 抄送节点仅发送通知副本，不阻塞流程推进
              </p>
            </div>
          )}
          {node.type === NodeType.MANUAL && (
            <div className="space-y-3 pt-4 border-t border-slate-100">
              <label className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
                <ClipboardCheck size={12} /> 人工任务设置
              </label>
              <div>
                <span className="text-xs text-slate-400 mb-1 block">
                  任务描述
                </span>
                <LazyTextarea
                  className="w-full border border-slate-200 rounded-lg p-2.5 text-sm min-h-[80px] focus:ring-2 focus:ring-cyan-500 outline-none"
                  placeholder="描述需要人工处理的任务内容"
                  value={formData.props?.taskDescription || ""}
                  onChange={(val: any) =>
                    handleChange("props", {
                      ...formData.props,
                      taskDescription: val,
                    })
                  }
                />
              </div>
              <div>
                <span className="text-xs text-slate-400 mb-1 block">
                  处理人类型
                </span>
                <Select
                  value={formData.approverType || "ROLE"}
                  onValueChange={(v) => handleChange("approverType", v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="请选择" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(APPROVER_TYPE_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {formData.approverType === "ROLE" && (
                <ApproverValueSelector
                  type="ROLE"
                  value={formData.approverValue || ""}
                  onChange={(val) => handleChange("approverValue", val)}
                  onLabelChange={(label) =>
                    handleChange("props", {
                      ...formData.props,
                      approverLabel: label,
                    })
                  }
                />
              )}
              {formData.approverType === "USER" && (
                <ApproverValueSelector
                  type="USER"
                  value={formData.approverValue || ""}
                  onChange={(val) => handleChange("approverValue", val)}
                  onLabelChange={(label) =>
                    handleChange("props", {
                      ...formData.props,
                      approverLabel: label,
                    })
                  }
                />
              )}
              {formData.approverType === "USERS" && (
                <ApproverValueSelector
                  type="USER"
                  value={formData.approverValue || ""}
                  onChange={(val) => handleChange("approverValue", val)}
                  onLabelChange={(label) =>
                    handleChange("props", {
                      ...formData.props,
                      approverLabel: label,
                    })
                  }
                  multiple={true}
                />
              )}
              {formData.approverType === "DEPT" && (
                <ApproverValueSelector
                  type="DEPT"
                  value={formData.approverValue || ""}
                  onChange={(val) => handleChange("approverValue", val)}
                  onLabelChange={(label) =>
                    handleChange("props", {
                      ...formData.props,
                      approverLabel: label,
                    })
                  }
                />
              )}
              {formData.approverType === "DIRECT_LEADER" && (
                <div className="bg-pink-50 border border-pink-50 rounded-lg px-3 py-2">
                  <p className="text-xs text-pink-600 font-medium">直属上级</p>
                  <p className="text-[10px] text-pink-400 mt-0.5">
                    系统将自动查找流程发起人的直属上级作为处理人。无需手动指定。
                  </p>
                </div>
              )}
              {formData.approverType === "DEPT_MANAGER" && (
                <div className="bg-pink-50 border border-pink-50 rounded-lg px-3 py-2">
                  <p className="text-xs text-pink-600 font-medium">
                    部门负责人
                  </p>
                  <p className="text-[10px] text-pink-400 mt-0.5">
                    系统将自动查找流程发起人所在部门的负责人作为处理人。无需手动指定。
                  </p>
                </div>
              )}
              <div>
                <span className="text-xs text-slate-400 mb-1 block">
                  任务优先级
                </span>
                <Select
                  value={formData.props?.priority || "MEDIUM"}
                  onValueChange={(v) =>
                    handleChange("props", { ...formData.props, priority: v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="请选择" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="LOW">低</SelectItem>
                    <SelectItem value="MEDIUM">中</SelectItem>
                    <SelectItem value="HIGH">高</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          {node.branches && node.branches.length > 0 && (
            <div className="space-y-3 pt-4 border-t border-slate-100">
              <label className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
                <GitBranch size={12} /> 分支规则
              </label>
              <Select
                value={normalizedBranchStrategy}
                onValueChange={(v) => handleChange("branchStrategy", v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="请选择" />
                </SelectTrigger>
                <SelectContent>
                  {branchStrategyOptions.map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-3 pt-4 border-t border-slate-100">
            <label className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
              <FileText size={12} /> 条件设置
            </label>
            <div>
              <span className="text-xs text-slate-400 mb-1 block">
                触发条件
              </span>
              <LazyInput
                className="font-mono bg-slate-50"
                placeholder="例如: amount > 5000"
                value={formData.condition || ""}
                onChange={(val: any) => handleChange("condition", val)}
              />
              <p className="text-[10px] text-slate-400 mt-1">
                💡 示例：amount {">"} 5000 或 days {">="} 3<br />
                可用字段：amount(金额)、days(天数)、deptId(部门)
              </p>
            </div>
          </div>
          {/* P2-9 & P2-10: 高级设置 (重试与数据流) — 适用于自动执行类节点 */}
          {[
            NodeType.NOTIFICATION,
            NodeType.SCRIPT,
            NodeType.TIMER,
            NodeType.SUBPROCESS,
            NodeType.COPY,
          ].includes(node.type as NodeType) && (
            <div className="space-y-3 pt-4 border-t border-slate-100 pb-4">
              <label className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
                <Settings size={12} /> 高级设置 (重试与数据映射)
              </label>

              <div className="space-y-2 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                <span className="text-xs text-slate-600 font-medium">
                  节点重试策略
                </span>
                <div className="grid grid-cols-2 gap-3 mt-2">
                  <div>
                    <span className="text-[10px] text-slate-400 mb-1 block">
                      最大重试次数
                    </span>
                    <LazyInput
                      type="number"
                      min="0"
                      placeholder="0"
                      value={formData.retry?.maxRetries ?? ""}
                      onChange={(val: any) =>
                        handleChange("retry", {
                          ...formData.retry,
                          maxRetries: val ? parseInt(val) : 0,
                        })
                      }
                    />
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 mb-1 block">
                      重试间隔(毫秒)
                    </span>
                    <LazyInput
                      type="number"
                      min="0"
                      placeholder="1000"
                      value={formData.retry?.delayMs ?? ""}
                      onChange={(val: any) =>
                        handleChange("retry", {
                          ...formData.retry,
                          delayMs: val ? parseInt(val) : 1000,
                        })
                      }
                    />
                  </div>
                </div>
                <p className="text-[10px] text-slate-400 mt-1">
                  💡 节点执行失败时自动重试。设为 0 表示不重试。
                </p>
              </div>

              <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                <span className="text-xs text-slate-600 font-medium mb-1 block">
                  输入映射 (Inputs JSON)
                </span>
                <p className="text-[10px] text-slate-400 mb-2 leading-relaxed">
                  节点执行前，从流程变量提取到节点局部变量。
                  <br />
                  格式:{" "}
                  <code className="bg-slate-200 px-1 rounded text-[9px]">
                    {'{"localVar": "processVar"}'}
                  </code>
                </p>
                <LazyTextarea
                  className="w-full border border-slate-200 rounded focus:ring-2 focus:ring-pink-200 outline-none p-2 text-[10px] font-mono min-h-[60px]"
                  placeholder='{"orderId": "formData.id"}'
                  value={
                    formData.inputs
                      ? JSON.stringify(formData.inputs, null, 2)
                      : ""
                  }
                  onChange={(val: any) => {
                    if (!val) {
                      handleChange("inputs", undefined);
                      return;
                    }
                    try {
                      handleChange("inputs", JSON.parse(val));
                    } catch (e) {}
                  }}
                />
              </div>

              <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                <span className="text-xs text-slate-600 font-medium mb-1 block">
                  输出映射 (Outputs JSON)
                </span>
                <p className="text-[10px] text-slate-400 mb-2 leading-relaxed">
                  节点执行后，将节点产出写回全局流程变量。
                  <br />
                  格式:{" "}
                  <code className="bg-slate-200 px-1 rounded text-[9px]">
                    {'{"processVar": "localVar"}'}
                  </code>
                </p>
                <LazyTextarea
                  className="w-full border border-slate-200 rounded focus:ring-2 focus:ring-pink-200 outline-none p-2 text-[10px] font-mono min-h-[60px]"
                  placeholder='{"formData.status": "resultStatus"}'
                  value={
                    formData.outputs
                      ? JSON.stringify(formData.outputs, null, 2)
                      : ""
                  }
                  onChange={(val: any) => {
                    if (!val) {
                      handleChange("outputs", undefined);
                      return;
                    }
                    try {
                      handleChange("outputs", JSON.parse(val));
                    } catch (e) {}
                  }}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ==================== 连接线拖放区域 ====================

const ConnectorDropZone = ({
  parentId,
  isDraggingGlobal,
  draggingNodeId,
  onDrop,
  selfNodeId,
}: {
  parentId: string;
  isDraggingGlobal: boolean;
  draggingNodeId: string | null;
  onDrop: (dragId: string, dropId: string) => void;
  selfNodeId?: string;
}) => {
  const [isOver, setIsOver] = useState(false);

  // 如果没有在拖拽，显示普通的连线
  if (!isDraggingGlobal) {
    return (
      <div className="flex flex-col items-center">
        <div className="h-8 w-0.5 bg-slate-300 transition-colors duration-300 group-hover/node:bg-slate-400"></div>
        <ArrowDown
          size={14}
          className="text-slate-300 -mt-1 mb-1 transition-colors duration-300 group-hover/node:text-slate-400"
        />
      </div>
    );
  }

  // 杜绝节点紧挨自身的错误拖拽区域亮起（无论是拖到自己的父亲下面，还是拖到自己的身上指向孩子的线）
  const isInvalidSelfDrop =
    draggingNodeId === parentId || draggingNodeId === selfNodeId;

  if (isInvalidSelfDrop) {
    return (
      <div className="flex flex-col items-center">
        <div className="h-8 w-0.5 bg-slate-300 transition-colors duration-300 group-hover/node:bg-slate-400 opacity-50"></div>
        <ArrowDown
          size={14}
          className="text-slate-300 -mt-1 mb-1 transition-colors duration-300 group-hover/node:text-slate-400 opacity-50"
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center relative py-1">
      <div
        className={`h-12 w-0.5 transition-all ${isOver ? "bg-pink-400" : "bg-slate-300"}`}
      ></div>
      <div
        className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-40 h-10 rounded-xl border-2 border-dashed flex items-center justify-center gap-1.5 transition-all cursor-pointer z-20 ${
          isOver
            ? "border-pink-400 bg-pink-50 scale-110 shadow-lg shadow-pink-100"
            : "border-slate-300 bg-white/80 hover:border-pink-300 hover:bg-pink-50/50"
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          setIsOver(true);
        }}
        onDragLeave={() => setIsOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsOver(false);
          const dragId = e.dataTransfer.getData("nodeId");
          if (dragId) onDrop(dragId, parentId);
        }}
      >
        <Move
          size={14}
          className={isOver ? "text-pink-400" : "text-slate-400"}
        />
        <span
          className={`text-xs font-medium ${isOver ? "text-pink-500" : "text-slate-400"}`}
        >
          {isOver ? "松开放置" : "拖入空位"}
        </span>
      </div>
      <ArrowDown
        size={14}
        className={`-mt-1 mb-1 ${isOver ? "text-pink-400" : "text-slate-300"}`}
      />
    </div>
  );
};

interface FlowNodeActionsContextValue {
  onAddNext: (parentId: string, type?: NodeType) => void;
  onAddBranch: (parentId: string) => void;
  onSelect: (node: WorkflowNode) => void;
  onDrop: (dragId: string, dropId: string) => void;
  onCopy: (nodeId: string) => void;
  setDraggingGlobal: (value: boolean) => void;
  setDraggingNodeId: (id: string | null) => void;
  setActiveQuickAddId: (id: string | null) => void;
  setHoveredNodeId: (id: string | null) => void;
}

const noop = () => {};
const flowNodeActionsFallback: FlowNodeActionsContextValue = {
  onAddNext: noop,
  onAddBranch: noop,
  onSelect: noop as (node: WorkflowNode) => void,
  onDrop: noop as (dragId: string, dropId: string) => void,
  onCopy: noop as (nodeId: string) => void,
  setDraggingGlobal: noop as (value: boolean) => void,
  setDraggingNodeId: noop as (id: string | null) => void,
  setActiveQuickAddId: noop as (id: string | null) => void,
  setHoveredNodeId: noop as (id: string | null) => void,
};

const FlowNodeActionsContext = React.createContext<FlowNodeActionsContextValue>(
  flowNodeActionsFallback,
);

// ==================== 节点组件 ====================

const FlowNode = ({
  node,
  invalidNodes,
  draggingNodeId,
  isDraggingGlobal,
  activeQuickAddId,
  hoveredNodeId,
  selectedNodeId,
}: {
  node: WorkflowNode;
  invalidNodes: string[];
  draggingNodeId: string | null;
  isDraggingGlobal: boolean;
  activeQuickAddId: string | null;
  hoveredNodeId: string | null;
  selectedNodeId: string | null;
}) => {
  const actions = React.useContext(FlowNodeActionsContext);
  const [isDragging, setIsDragging] = useState(false);
  const showQuickAdd = activeQuickAddId === node.id;
  const isSelected = selectedNodeId === node.id;
  const isInvalid = invalidNodes.includes(node.id);
  const visual = getNodeVisual(node.type);
  const NIcon = visual.icon;
  const canDrag = node.type !== NodeType.START && node.type !== NodeType.END;

  // 画布悬停逻辑优化（去鼠标追踪依赖，改为直接点击触发）
  const canShowHover = !activeQuickAddId || activeQuickAddId === node.id;

  // 判断能否添加条件分支
  const canAddBranch =
    node.type !== NodeType.PARALLEL ||
    (node.signType &&
      !["ALL", "ANY", "PERCENT", "SEQUENTIAL"].includes(node.signType));

  return (
    <div className="flex flex-col items-center relative group/node animate-in fade-in zoom-in-95 duration-300 ease-out">
      {/* 节点卡片容器 - 独立的相对定位容器 */}
      <div className={`relative group ${showQuickAdd ? "z-50" : ""}`}>
        {/* 错误提示框 */}
        {isInvalid && (
          <div
            className="absolute -top-3 -right-3 w-6 h-6 bg-red-500 rounded-full flex items-center justify-center text-white text-xs font-bold shadow-md z-40 animate-pulse border-2 border-white"
            title="节点配置不完整"
          >
            !
          </div>
        )}

        {/* 节点卡片 */}
        <div
          className={`w-64 ${visual.bg} rounded-xl shadow-md border-2 transition-all duration-300 cursor-pointer relative z-10 ${
            isDragging
              ? "opacity-40 scale-95 border-slate-300 rotate-1"
              : isInvalid
                ? `border-red-500 ring-4 ring-red-100/50 shadow-xl scale-[1.02] bg-red-50/50`
                : isSelected
                  ? `border-pink-500 ring-4 ring-pink-100 ring-offset-2 shadow-xl scale-[1.02] ${visual.bg}`
                  : `${visual.border} ${visual.hoverBorder} hover:shadow-xl hover:-translate-y-1 hover:scale-[1.01]`
          } active:scale-95 active:shadow-sm`}
          onClick={(e) => {
            e.stopPropagation();
            actions.onSelect(node);
            actions.setActiveQuickAddId(null);
          }}
          onMouseEnter={() => canShowHover && actions.setHoveredNodeId(node.id)}
          onMouseLeave={() => canShowHover && actions.setHoveredNodeId(null)}
          draggable={canDrag}
          onDragStart={(e) => {
            e.dataTransfer.setData("nodeId", node.id);
            e.dataTransfer.effectAllowed = "move";
            setIsDragging(true);
            actions.setDraggingGlobal(true);
            actions.setDraggingNodeId(node.id);
          }}
          onDragEnd={() => {
            setIsDragging(false);
            actions.setDraggingGlobal(false);
            actions.setDraggingNodeId(null);
          }}
        >
          {/* 顶部颜色条 */}
          <div className={`h-1.5 rounded-t-xl w-full ${visual.color}`}></div>
          <div className="p-3">
            {/* 图标 + 标题 */}
            <div className="flex items-center gap-2.5 mb-2">
              <div
                className={`w-8 h-8 rounded-lg flex items-center justify-center ${visual.iconBg} shrink-0`}
              >
                <NIcon size={16} className={visual.iconColor} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-slate-700 truncate">
                  {node.title}
                </div>
                <div className="text-[10px] text-slate-400">
                  {node.type === NodeType.PARALLEL
                    ? node.branches &&
                      node.branches.length > 0 &&
                      node.branchStrategy
                      ? BRANCH_STRATEGY_LABELS[node.branchStrategy] ||
                        node.branchStrategy
                      : node.signType === "ANY"
                        ? "或签模式"
                        : node.signType === "PERCENT"
                          ? "比例签模式"
                          : node.signType === "SEQUENTIAL"
                            ? "顺序签模式"
                            : "全签模式"
                    : node.branches &&
                        node.branches.length > 0 &&
                        node.branchStrategy
                      ? BRANCH_STRATEGY_LABELS[node.branchStrategy] ||
                        node.branchStrategy
                      : NODE_TYPE_LABELS[node.type] || node.type}
                </div>
              </div>
              {canDrag && (
                <div
                  className="text-slate-300 cursor-grab active:cursor-grabbing"
                  title="拖拽移动"
                >
                  <Move size={14} />
                </div>
              )}
            </div>
            {/* 会签信息展示 - 仅 PARALLEL 节点 */}
            {node.type === NodeType.PARALLEL && (
              <div className="mt-1.5 space-y-1.5">
                {/* 会签类型标签 */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-violet-100 text-violet-700">
                    {node.signType === "ANY"
                      ? "或签"
                      : node.signType === "PERCENT"
                        ? `比例签 ${node.passPercent || 0}%`
                        : node.signType === "SEQUENTIAL"
                          ? "顺序签"
                          : "全签"}
                  </span>
                  {node.approverType && (
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${visual.iconBg} ${visual.iconColor}`}
                    >
                      {APPROVER_TYPE_LABELS[node.approverType] ||
                        node.approverType}
                    </span>
                  )}
                </div>
                {/* 参与人展示 */}
                {node.approverValue && (
                  <div className="text-[10px] text-slate-500 bg-slate-50 rounded-lg px-2 py-1 border border-slate-100">
                    <span className="text-slate-400">
                      {node.approverType === "ROLE"
                        ? "参与角色: "
                        : node.approverType === "USER"
                          ? "参与人员: "
                          : "参与人: "}
                    </span>
                    <span className="font-medium text-slate-600">
                      {(() => {
                        const displayText =
                          node.props?.approverLabel || node.approverValue;
                        const parts = displayText
                          .split(",")
                          .map((s: string) => s.trim());
                        return parts.length > 3
                          ? `${parts.slice(0, 3).join(", ")} 等${parts.length}人`
                          : displayText;
                      })()}
                    </span>
                  </div>
                )}
                {/* 未配置审批人提示 */}
                {!node.approverValue && (
                  <div className="text-[10px] text-amber-600 bg-amber-50 rounded-lg px-2 py-1 border border-amber-100 flex items-center gap-1">
                    ⚠ 请在右侧面板配置审批人
                  </div>
                )}
              </div>
            )}
            {/* 审批人标签 - 非 PARALLEL 节点 */}
            {node.type !== NodeType.PARALLEL && node.approverType && (
              <div className="flex items-center gap-1.5 mt-1">
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${visual.iconBg} ${visual.iconColor}`}
                >
                  {APPROVER_TYPE_LABELS[node.approverType] || node.approverType}
                </span>
                {node.approverValue && (
                  <span className="text-[10px] text-slate-500 truncate max-w-[140px]">
                    {node.props?.approverLabel || node.approverValue}
                  </span>
                )}
              </div>
            )}
            {/* 条件标签 */}
            {node.condition && (
              <div className="mt-1.5 text-[10px] bg-amber-50 text-amber-700 px-2 py-1 rounded-lg truncate font-mono border border-amber-100">
                条件: {node.condition}
              </div>
            )}
          </div>
        </div>

        {/* END节点的添加按钮 - 在节点上方，稍微拉开距离防止挡住上面的线和卡片 */}
        {node.type === NodeType.END && (
          <div
            className="absolute -top-6 left-1/2 -translate-x-1/2 z-30"
            style={{ pointerEvents: "auto" }}
          >
            <div
              className={`relative transition-opacity duration-200 ${hoveredNodeId === node.id || showQuickAdd ? "opacity-100" : "opacity-0"}`}
            >
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  actions.setActiveQuickAddId(showQuickAdd ? null : node.id);
                }}
                onMouseEnter={() =>
                  canShowHover && actions.setHoveredNodeId(node.id)
                }
                onMouseLeave={() =>
                  canShowHover && !showQuickAdd && actions.setHoveredNodeId(null)
                }
                className={`w-8 h-8 rounded-full flex items-center justify-center shadow-md transition-all duration-300 ${
                  showQuickAdd
                    ? "bg-gradient-to-r from-red-500 to-rose-600 text-white rotate-45 scale-110 shadow-lg"
                    : "bg-gradient-to-r from-pink-500 to-rose-500 text-white hover:scale-110 hover:rotate-90 hover:shadow-lg active:scale-95"
                }`}
                title={showQuickAdd ? "关闭菜单" : "在此之前添加节点"}
              >
                <Plus size={16} />
              </button>
              {showQuickAdd && (
                <div
                  className="absolute bottom-10 left-1/2 -translate-x-1/2 bg-white rounded-xl shadow-2xl border-2 border-pink-100 p-3 min-w-[200px] z-[100] animate-in fade-in slide-in-from-bottom-2 duration-200"
                  onClick={(e) => e.stopPropagation()}
                  onMouseEnter={(e) => {
                    e.stopPropagation();
                    actions.setHoveredNodeId(node.id); // 强制保持当前节点的 hover 状态
                  }}
                  onMouseLeave={(e) => {
                    e.stopPropagation();
                    actions.setHoveredNodeId(null);
                  }}
                  onMouseMove={(e) => {
                    e.stopPropagation();
                    e.nativeEvent.stopImmediatePropagation();
                  }}
                  style={{ pointerEvents: "auto" }}
                >
                  <div className="text-xs text-slate-600 px-2 py-1 font-semibold mb-1 flex items-center gap-1.5">
                    <Sparkles size={12} className="text-pink-400" />
                    选择节点类型
                  </div>
                  {[
                    {
                      type: NodeType.APPROVAL,
                      icon: UserCheck,
                      label: "审批节点",
                      desc: "需要审批人处理",
                      color: "text-pink-400",
                      bg: "hover:bg-pink-50",
                      border: "hover:border-pink-100",
                    },
                    {
                      type: NodeType.PARALLEL,
                      icon: Layers,
                      label: "会签节点",
                      desc: "多人同时审批",
                      color: "text-violet-500",
                      bg: "hover:bg-violet-50",
                      border: "hover:border-violet-200",
                    },
                    {
                      type: NodeType.NOTIFICATION,
                      icon: Bell,
                      label: "通知节点",
                      desc: "发送通知消息",
                      color: "text-pink-400",
                      bg: "hover:bg-pink-50",
                      border: "hover:border-pink-100",
                    },
                    {
                      type: NodeType.SCRIPT,
                      icon: Code,
                      label: "脚本节点",
                      desc: "执行自动化脚本",
                      color: "text-green-500",
                      bg: "hover:bg-green-50",
                      border: "hover:border-green-200",
                    },
                    {
                      type: NodeType.TIMER,
                      icon: Clock,
                      label: "定时节点",
                      desc: "延迟或定时触发",
                      color: "text-orange-500",
                      bg: "hover:bg-orange-50",
                      border: "hover:border-orange-200",
                    },
                    {
                      type: NodeType.SUBPROCESS,
                      icon: Workflow,
                      label: "子流程节点",
                      desc: "调用其他流程",
                      color: "text-purple-500",
                      bg: "hover:bg-purple-50",
                      border: "hover:border-purple-200",
                    },
                    {
                      type: NodeType.MANUAL,
                      icon: ClipboardCheck,
                      label: "人工任务",
                      desc: "需要人工处理",
                      color: "text-cyan-500",
                      bg: "hover:bg-cyan-50",
                      border: "hover:border-cyan-200",
                    },
                    {
                      type: NodeType.COPY,
                      icon: Send,
                      label: "抄送节点",
                      desc: "发送流程副本",
                      color: "text-pink-500",
                      bg: "hover:bg-pink-50",
                      border: "hover:border-pink-200",
                    },
                    ...(canAddBranch
                      ? [
                          {
                            type: NodeType.CONDITION as any,
                            icon: GitBranch,
                            label: "条件分支",
                            desc: "根据条件分流",
                            color: "text-amber-500",
                            bg: "hover:bg-amber-50",
                            border: "hover:border-amber-200",
                            isBranch: true,
                          },
                        ]
                      : []),
                  ].map((item) => {
                    const ItemIcon = item.icon;
                    return (
                      <button
                        key={item.type}
                        className={`w-full flex items-start gap-3 px-3 py-2.5 rounded-lg text-left border-2 border-transparent ${item.bg} ${item.border} transition-all mb-1.5`}
                        onClick={(e) => {
                          e.stopPropagation();
                          if ("isBranch" in item && item.isBranch) {
                            actions.onAddBranch(node.id);
                          } else {
                            actions.onAddNext(node.id, item.type as NodeType);
                          }
                          actions.setActiveQuickAddId(null);
                        }}
                      >
                        <div
                          className={`w-8 h-8 rounded-lg flex items-center justify-center ${item.bg.replace("hover:", "")} shrink-0 mt-0.5`}
                        >
                          <ItemIcon size={16} className={item.color} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-slate-700">
                            {item.label}
                          </div>
                          <div className="text-[10px] text-slate-400 mt-0.5">
                            {item.desc}
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

        {/* 非END节点的添加按钮 - 在节点卡片下方 */}
        {node.type !== NodeType.END && (
          <div
            className="absolute -bottom-2 left-1/2 -translate-x-1/2 z-30"
            style={{ pointerEvents: "auto" }}
          >
            <div
              className={`relative transition-opacity duration-200 ${hoveredNodeId === node.id || showQuickAdd ? "opacity-100" : "opacity-0"}`}
            >
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  actions.setActiveQuickAddId(showQuickAdd ? null : node.id);
                }}
                onMouseEnter={() =>
                  canShowHover && actions.setHoveredNodeId(node.id)
                }
                onMouseLeave={() =>
                  canShowHover && !showQuickAdd && actions.setHoveredNodeId(null)
                }
                className={`w-8 h-8 rounded-full flex items-center justify-center shadow-md transition-all duration-300 ${
                  showQuickAdd
                    ? "bg-gradient-to-r from-red-500 to-rose-600 text-white rotate-45 scale-110 shadow-lg"
                    : "bg-gradient-to-r from-pink-500 to-rose-500 text-white hover:scale-110 hover:rotate-90 hover:shadow-lg active:scale-95"
                }`}
                title={showQuickAdd ? "关闭菜单" : "添加节点"}
              >
                <Plus size={16} />
              </button>
              {showQuickAdd && (
                <div
                  className="absolute top-10 left-1/2 -translate-x-1/2 bg-white rounded-xl shadow-2xl border-2 border-pink-100 p-3 min-w-[200px] z-[100] animate-in fade-in slide-in-from-top-2 duration-200"
                  onClick={(e) => e.stopPropagation()}
                  onMouseEnter={(e) => {
                    e.stopPropagation();
                    actions.setHoveredNodeId(node.id); // 强制保持当前节点的 hover 状态
                  }}
                  onMouseLeave={(e) => {
                    e.stopPropagation();
                    actions.setHoveredNodeId(null);
                  }}
                  onMouseMove={(e) => {
                    e.stopPropagation();
                    e.nativeEvent.stopImmediatePropagation();
                  }}
                  style={{ pointerEvents: "auto" }}
                >
                  <div className="text-xs text-slate-600 px-2 py-1 font-semibold mb-1 flex items-center gap-1.5">
                    <Sparkles size={12} className="text-pink-400" />
                    选择节点类型
                  </div>
                  {[
                    {
                      type: NodeType.APPROVAL,
                      icon: UserCheck,
                      label: "审批节点",
                      desc: "需要审批人处理",
                      color: "text-pink-400",
                      bg: "hover:bg-pink-50",
                      border: "hover:border-pink-100",
                    },
                    {
                      type: NodeType.PARALLEL,
                      icon: Layers,
                      label: "会签节点",
                      desc: "多人同时审批",
                      color: "text-violet-500",
                      bg: "hover:bg-violet-50",
                      border: "hover:border-violet-200",
                    },
                    {
                      type: NodeType.NOTIFICATION,
                      icon: Bell,
                      label: "通知节点",
                      desc: "发送通知消息",
                      color: "text-pink-400",
                      bg: "hover:bg-pink-50",
                      border: "hover:border-pink-100",
                    },
                    {
                      type: NodeType.SCRIPT,
                      icon: Code,
                      label: "脚本节点",
                      desc: "执行自动化脚本",
                      color: "text-green-500",
                      bg: "hover:bg-green-50",
                      border: "hover:border-green-200",
                    },
                    {
                      type: NodeType.TIMER,
                      icon: Clock,
                      label: "定时节点",
                      desc: "延迟或定时触发",
                      color: "text-orange-500",
                      bg: "hover:bg-orange-50",
                      border: "hover:border-orange-200",
                    },
                    {
                      type: NodeType.SUBPROCESS,
                      icon: Workflow,
                      label: "子流程节点",
                      desc: "调用其他流程",
                      color: "text-purple-500",
                      bg: "hover:bg-purple-50",
                      border: "hover:border-purple-200",
                    },
                    {
                      type: NodeType.MANUAL,
                      icon: ClipboardCheck,
                      label: "人工任务",
                      desc: "需要人工处理",
                      color: "text-cyan-500",
                      bg: "hover:bg-cyan-50",
                      border: "hover:border-cyan-200",
                    },
                    {
                      type: NodeType.COPY,
                      icon: Send,
                      label: "抄送节点",
                      desc: "发送流程副本",
                      color: "text-pink-500",
                      bg: "hover:bg-pink-50",
                      border: "hover:border-pink-200",
                    },
                    ...(canAddBranch
                      ? [
                          {
                            type: NodeType.CONDITION as any,
                            icon: GitBranch,
                            label: "条件分支",
                            desc: "根据条件分流",
                            color: "text-amber-500",
                            bg: "hover:bg-amber-50",
                            border: "hover:border-amber-200",
                            isBranch: true,
                          },
                        ]
                      : []),
                    {
                      type: NodeType.END as any,
                      icon: Flag,
                      label: "结束节点",
                      desc: "流程终点",
                      color: "text-slate-500",
                      bg: "hover:bg-slate-50",
                      border: "hover:border-slate-200",
                    },
                  ].map((item) => {
                    const ItemIcon = item.icon;
                    return (
                      <button
                        key={item.type}
                        className={`w-full flex items-start gap-3 px-3 py-2.5 rounded-lg text-left border-2 border-transparent ${item.bg} ${item.border} transition-all mb-1.5`}
                        onClick={(e) => {
                          e.stopPropagation();
                          if ("isBranch" in item && item.isBranch) {
                            actions.onAddBranch(node.id);
                          } else {
                            actions.onAddNext(node.id, item.type as NodeType);
                          }
                          actions.setActiveQuickAddId(null);
                        }}
                      >
                        <div
                          className={`w-8 h-8 rounded-lg flex items-center justify-center ${item.bg.replace("hover:", "")} shrink-0 mt-0.5`}
                        >
                          <ItemIcon size={16} className={item.color} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-slate-700">
                            {item.label}
                          </div>
                          <div className="text-[10px] text-slate-400 mt-0.5">
                            {item.desc}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                  <div className="border-t border-slate-100 mt-2 pt-2">
                    <button
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs text-slate-600 hover:bg-slate-50 transition-colors"
                      onClick={(e) => {
                        e.stopPropagation();
                        actions.onCopy(node.id);
                        actions.setActiveQuickAddId(null);
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
      {node.branches && node.branches.length > 0 && (
        <div className="flex flex-col items-center w-full mt-6 flex-none">
          {/* 从父节点到分支点的垂直连接线 */}
          <div className="h-6 w-0.5 bg-slate-300 transition-colors duration-300 group-hover/node:bg-slate-400"></div>

          {/* 分支点 - 菱形指示器 */}
          <div className="w-3 h-3 bg-amber-500 rotate-45 border-2 border-white shadow-md z-10 -mb-[1px]"></div>

          {/* 分支容器 */}
          <div className="flex gap-12 relative pt-6 text-center w-full justify-center">
            {/* 顶部的水平连接线 - 连接所有分支的开始端 */}
            <div
              className="absolute top-0 left-0 right-0 h-0.5 bg-slate-300 transition-colors duration-300 group-hover/node:bg-slate-400"
              style={{
                left: `${100 / node.branches.length / 2}%`,
                right: `${100 / node.branches.length / 2}%`,
              }}
            ></div>

            {node.branches.map((branch, index) => (
              <div
                key={branch.id}
                className="flex flex-col items-center relative w-full"
              >
                {/* 从顶部水平线往下的垂线 */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-0.5 h-6 bg-slate-300 transition-colors duration-300 group-hover/node:bg-slate-400 -mt-6"></div>

                {/* 分支入口小标签 */}
                <div className="absolute -top-10 left-1/2 -translate-x-1/2 z-10">
                  <div className="bg-gradient-to-r from-amber-400 to-amber-500 text-white px-3 py-1 rounded-full text-[11px] font-bold whitespace-nowrap shadow-lg border-2 border-white flex items-center gap-1">
                    <GitBranch size={10} />
                    分支 {index + 1}
                  </div>
                </div>

                {/* 节点渲染区块 - 给它包裹 flex-none 保证子节点自然内容高，不被 stretch */}
                <div className="flex-none flex justify-center w-full">
                  <FlowNode
                    node={branch}
                    invalidNodes={invalidNodes}
                    selectedNodeId={selectedNodeId}
                    isDraggingGlobal={isDraggingGlobal}
                    draggingNodeId={draggingNodeId}
                    activeQuickAddId={activeQuickAddId}
                    hoveredNodeId={hoveredNodeId}
                  />
                </div>

                {/* 关键修复：底部自动填充延长线，利用 flex-1。如果本分支内容较短，这就自动把剩下的高度拉满，延展下垂线以合并入底部主干横线！ */}
                <div className="w-0.5 min-h-[40px] bg-slate-300 flex-1 transition-colors duration-300 group-hover/node:bg-slate-400"></div>
              </div>
            ))}

            {/* 底部的闭合水平连接线 - 同步汇合所有的下边沿延长线 */}
            <div
              className="absolute bottom-0 left-0 right-0 h-0.5 bg-slate-300 transition-colors duration-300 group-hover/node:bg-slate-400"
              style={{
                left: `${100 / node.branches.length / 2}%`,
                right: `${100 / node.branches.length / 2}%`,
              }}
            ></div>
          </div>

          {/* 汇合点：表示所有并行支路收束为一，完美接上后方的流程 */}
          <div className="w-3 h-3 bg-white border-2 border-slate-300 rounded-full shadow-sm z-10 -mt-1.5 transition-colors duration-300 group-hover/node:border-slate-400"></div>
        </div>
      )}

      {/* 下一个节点 */}
      {node.next && node.next.type !== NodeType.END && (
        <div className="flex flex-col items-center w-full">
          <ConnectorDropZone
            parentId={node.id}
            isDraggingGlobal={isDraggingGlobal}
            draggingNodeId={draggingNodeId}
            selfNodeId={node.next.id}
            onDrop={actions.onDrop}
          />
          <FlowNode
            node={node.next}
            invalidNodes={invalidNodes}
            selectedNodeId={selectedNodeId}
            isDraggingGlobal={isDraggingGlobal}
            draggingNodeId={draggingNodeId}
            activeQuickAddId={activeQuickAddId}
            hoveredNodeId={hoveredNodeId}
          />
        </div>
      )}

      {/* 结束节点: 因为添加节点永远是在被点加号的节点"后面"插入，如果是END节点，则是特例插入到END之前，所以连线也得对应过去 */}
      {node.next && node.next.type === NodeType.END && (
        <div className="flex flex-col items-center w-full relative">
          <ConnectorDropZone
            parentId={node.id}
            isDraggingGlobal={isDraggingGlobal}
            draggingNodeId={draggingNodeId}
            selfNodeId={node.next.id}
            onDrop={actions.onDrop}
          />

          <FlowNode
            node={node.next}
            invalidNodes={invalidNodes}
            selectedNodeId={selectedNodeId}
            isDraggingGlobal={isDraggingGlobal}
            draggingNodeId={draggingNodeId}
            activeQuickAddId={activeQuickAddId}
            hoveredNodeId={hoveredNodeId}
          />
        </div>
      )}
    </div>
  );
};

// ==================== 校验 ====================

function validateWorkflow(root: WorkflowNode): {
  errors: string[];
  errorNodes: string[];
} {
  const errorNodes: string[] = [];
  const errors: string[] = [];

  // 结构完整性校验：节点 ID 必须全局唯一，否则拖拽/编辑时会出现定位错乱
  const nodeIdCounter = new Map<string, number>();
  const collectNodeIds = (node: WorkflowNode) => {
    if (node.id) {
      nodeIdCounter.set(node.id, (nodeIdCounter.get(node.id) || 0) + 1);
    }
    if (node.next) collectNodeIds(node.next);
    if (node.branches) node.branches.forEach(collectNodeIds);
  };
  collectNodeIds(root);

  const duplicateNodeIds = Array.from(nodeIdCounter.entries())
    .filter(([, count]) => count > 1)
    .map(([id]) => id);
  if (duplicateNodeIds.length > 0) {
    errors.push(
      `检测到重复节点ID（${duplicateNodeIds.length}个），请删除重复节点后再保存/发布`,
    );
    errorNodes.push(...duplicateNodeIds);
  }

  let hasEnd = false;
  const checkEnd = (node: WorkflowNode) => {
    if (node.type === NodeType.END) hasEnd = true;
    if (node.next) checkEnd(node.next);
    if (node.branches) node.branches.forEach(checkEnd);
  };
  checkEnd(root);
  if (!hasEnd) {
    errors.push("流程缺少结束节点");
    errorNodes.push(root.id);
  }
  const checkApprover = (node: WorkflowNode) => {
    if (node.type === NodeType.APPROVAL || node.type === NodeType.PARALLEL) {
      if (!node.approverType) {
        errors.push(
          `${node.type === NodeType.PARALLEL ? "会签" : "审批"}节点"${node.title}"未配置审批方式`,
        );
        errorNodes.push(node.id);
      } else if (
        !["DIRECT_LEADER", "DEPT_MANAGER"].includes(node.approverType) &&
        !node.approverValue
      ) {
        errors.push(
          `${node.type === NodeType.PARALLEL ? "会签" : "审批"}节点"${node.title}"未配置具体的审批人`,
        );
        errorNodes.push(node.id);
      }
    }
    if (node.next) checkApprover(node.next);
    if (node.branches) node.branches.forEach(checkApprover);
  };
  checkApprover(root);
  // 会签节点一致性校验
  const checkParallel = (node: WorkflowNode) => {
    if (
      node.branches &&
      node.branches.length > 0 &&
      node.type !== NodeType.PARALLEL &&
      node.branchStrategy &&
      node.branchStrategy !== "EXCLUSIVE"
    ) {
      errors.push(
        `节点"${node.title}"不是并行网关，仅支持单选分支（EXCLUSIVE），请调整分支策略`,
      );
      errorNodes.push(node.id);
    }
    if (node.type === NodeType.PARALLEL) {
      const signType = node.signType || "ALL";
      // 会签模式（ALL/ANY/PERCENT/SEQUENTIAL）不应有条件分支
      if (
        (signType === "ALL" ||
          signType === "ANY" ||
          signType === "PERCENT" ||
          signType === "SEQUENTIAL") &&
        node.branches &&
        node.branches.length > 0
      ) {
        errors.push(
          `会签节点"${node.title}"设置了${signType === "ALL" ? "全签" : signType === "ANY" ? "或签" : signType === "PERCENT" ? "比例签" : "顺序签"}模式，但仍包含 ${node.branches.length} 个条件分支，请先清除分支或改用并行分支策略`,
        );
        errorNodes.push(node.id);
      }
      // 比例签必须设置百分比
      if (
        signType === "PERCENT" &&
        (!node.passPercent || node.passPercent <= 0 || node.passPercent > 100)
      ) {
        errors.push(
          `会签节点"${node.title}"使用比例签模式，但未设置有效的通过比例（1-100%）`,
        );
        errorNodes.push(node.id);
      }
    }
    if (node.next) checkParallel(node.next);
    if (node.branches) node.branches.forEach(checkParallel);
  };
  checkParallel(root);
  // P1-12: 扩展校验，覆盖 NOTIFICATION/SCRIPT/TIMER/SUBPROCESS/MANUAL/COPY 节点的必填字段
  const checkNodeProps = (node: WorkflowNode) => {
    if (node.type === NodeType.NOTIFICATION) {
      if (!node.props?.notificationTitle && !node.props?.notificationContent) {
        errors.push(`通知节点"${node.title}"未配置通知标题或内容`);
        errorNodes.push(node.id);
      }
    }
    if (node.type === NodeType.SCRIPT) {
      const st = node.props?.scriptType;
      if (st === "API" && !node.props?.apiUrl) {
        errors.push(
          `脚本节点"${node.title}"选择了 API 调用模式，但未配置 API URL`,
        );
        errorNodes.push(node.id);
      }
      if (
        (st === "GROOVY" || st === "JAVASCRIPT") &&
        !node.props?.scriptContent
      ) {
        errors.push(`脚本节点"${node.title}"未填写脚本内容`);
        errorNodes.push(node.id);
      }
    }
    if (node.type === NodeType.TIMER) {
      if (
        node.props?.timerType === "DELAY" &&
        (!node.props?.delayMinutes || node.props.delayMinutes <= 0)
      ) {
        errors.push(
          `定时节点"${node.title}"选择了延迟模式，但未设置有效的延迟时间`,
        );
        errorNodes.push(node.id);
      }
      if (node.props?.timerType === "SCHEDULE" && !node.props?.scheduleTime) {
        errors.push(`定时节点"${node.title}"选择了定时模式，但未设置定时时间`);
        errorNodes.push(node.id);
      }
    }
    if (node.type === NodeType.SUBPROCESS) {
      if (!node.props?.subprocessId) {
        errors.push(`子流程节点"${node.title}"未配置子流程 ID`);
        errorNodes.push(node.id);
      }
    }
    if (node.type === NodeType.MANUAL) {
      if (!node.approverType) {
        errors.push(`人工任务节点"${node.title}"未配置处理人方式`);
        errorNodes.push(node.id);
      } else if (
        !["DIRECT_LEADER", "DEPT_MANAGER"].includes(node.approverType) &&
        !node.approverValue
      ) {
        errors.push(`人工任务节点"${node.title}"未配置具体的处理人`);
        errorNodes.push(node.id);
      }
      if (!node.props?.taskDescription) {
        errors.push(`人工任务节点"${node.title}"未配置任务描述`);
        errorNodes.push(node.id);
      }
    }
    if (node.type === NodeType.COPY) {
      if (!node.approverType) {
        errors.push(`抄送节点"${node.title}"未配置抄送方式`);
        errorNodes.push(node.id);
      } else if (
        !["DIRECT_LEADER", "DEPT_MANAGER"].includes(node.approverType) &&
        !node.approverValue
      ) {
        errors.push(`抄送节点"${node.title}"未配置具体的抄送人`);
        errorNodes.push(node.id);
      }
    }
    if (node.type === NodeType.CONDITION) {
      if (!node.condition || node.condition.trim() === "") {
        errors.push(`条件分支"${node.title}"未配置触发条件`);
        errorNodes.push(node.id);
      }
    }
    if (node.next) checkNodeProps(node.next);
    if (node.branches) node.branches.forEach(checkNodeProps);
  };
  checkNodeProps(root);
  const checkTitle = (node: WorkflowNode) => {
    if (!node.title || node.title.trim() === "") {
      errors.push(`有节点缺少名称`);
      errorNodes.push(node.id);
    }
    if (node.next) checkTitle(node.next);
    if (node.branches) node.branches.forEach(checkTitle);
  };
  checkTitle(root);

  // JSON 格式防御性校验
  const checkJSON = (node: WorkflowNode) => {
    try {
      if (node.props?.apiHeaders && typeof node.props.apiHeaders === "string") {
        const text = node.props.apiHeaders.trim();
        if (text && (!text.startsWith("{") || !text.endsWith("}")))
          throw new Error();
      }
      if (node.props?.apiBody && typeof node.props.apiBody === "string") {
        const text = node.props.apiBody.trim();
        if (text && (!text.startsWith("{") || !text.endsWith("}")))
          throw new Error();
      }
      if (
        node.props?.variableMapping &&
        typeof node.props.variableMapping === "string"
      ) {
        const text = node.props.variableMapping.trim();
        if (text && (!text.startsWith("{") || !text.endsWith("}")))
          throw new Error();
      }
    } catch (e) {
      errors.push(
        `节点"${node.title}"配置的 JSON 格式可能不正确，必须完整包含 {}`,
      );
      errorNodes.push(node.id);
    }
    if (node.next) checkJSON(node.next);
    if (node.branches) node.branches.forEach(checkJSON);
  };
  checkJSON(root);

  return {
    errors: Array.from(new Set(errors)),
    errorNodes: Array.from(new Set(errorNodes)),
  };
}

// ==================== 全局属性面板 ====================

const GlobalPropertyPanel = ({
  open,
  onClose,
  workflow,
  onUpdate,
}: {
  open: boolean;
  onClose: () => void;
  workflow: {
    formId?: string;
    description?: string;
    category?: string;
    tags?: string;
    startPermissionType?: string;
    startPermissionValue?: string;
  };
  onUpdate: (data: any) => void;
}) => {
  const CATEGORY_NONE_VALUE = "__NONE__";
  const [formData, setFormData] = useState(workflow || {});

  useEffect(() => {
    if (open) {
      setFormData(workflow || {});
    }
  }, [open, workflow]);

  const handleChange = (field: string, value: any) => {
    const updated = { ...formData, [field]: value };
    setFormData(updated);
    onUpdate(updated);
  };

  if (!open) return null;

  return (
    <div className="fixed right-0 top-0 h-full w-96 bg-white/90 backdrop-blur-2xl shadow-[0_0_50px_-12px_rgba(0,0,0,0.25)] z-50 flex flex-col border-l border-slate-200/60 animate-in slide-in-from-right duration-300 ease-out">
      <div className="px-5 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-purple-100 shadow-sm">
            <Settings size={20} className="text-purple-600" />
          </div>
          <div>
            <h3 className="font-bold text-slate-800 text-base">全局属性</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              配置流程的全局属性和元数据
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400 hover:text-slate-600"
        >
          <X size={18} />
        </button>
      </div>
      <div className="p-5 flex-1 overflow-y-auto custom-scrollbar">
        <div className="space-y-5">
          <div className="space-y-3">
            <label className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
              <FileText size={12} /> 基础信息
            </label>

            <div>
              <span className="text-xs text-slate-400 mb-1 block">
                流程描述
              </span>
              <LazyTextarea
                className="w-full border border-slate-200 rounded-lg p-2.5 text-sm min-h-[80px] focus:ring-2 focus:ring-purple-400 outline-none"
                placeholder="请输入流程描述"
                value={formData.description || ""}
                onChange={(val: string) => handleChange("description", val)}
              />
            </div>

            <div>
              <span className="text-xs text-slate-400 mb-1 block">
                流程分类
              </span>
              <Select
                value={formData.category || CATEGORY_NONE_VALUE}
                onValueChange={(v) =>
                  handleChange(
                    "category",
                    v === CATEGORY_NONE_VALUE ? "" : v,
                  )
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="请选择分类" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={CATEGORY_NONE_VALUE}>未分类</SelectItem>
                  <SelectItem value="office">行政办公</SelectItem>
                  <SelectItem value="finance">财务审批</SelectItem>
                  <SelectItem value="hr">人事管理</SelectItem>
                  <SelectItem value="sales">业务销售</SelectItem>
                  <SelectItem value="it">IT运维</SelectItem>
                  <SelectItem value="other">其他</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <span className="text-xs text-slate-400 mb-1 block">
                流程标签
              </span>
              <LazyInput
                placeholder="多个标签用逗号分隔"
                value={formData.tags || ""}
                onChange={(val: string) => handleChange("tags", val)}
              />
            </div>

            <div>
              <span className="text-xs text-slate-400 mb-1 block">
                关联表单
              </span>
              <LazyInput
                placeholder="请输入表单ID，例如：form_leave_01"
                value={formData.formId || ""}
                onChange={(val: string) => handleChange("formId", val)}
              />
              <p className="text-[10px] text-slate-400 mt-1">
                💡 后续将支持从表单列表中选择
              </p>
            </div>
          </div>

          <div className="space-y-3 pt-4 border-t border-slate-100">
            <label className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
              <ShieldCheck size={12} /> 发起权限
            </label>
            <div>
              <span className="text-xs text-slate-400 mb-1 block">
                谁可以发起此流程
              </span>
              <Select
                value={formData.startPermissionType || "ALL"}
                onValueChange={(v) => {
                  handleChange("startPermissionType", v);
                  if (v === "ALL") handleChange("startPermissionValue", "");
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="请选择" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">所有人</SelectItem>
                  <SelectItem value="ROLE">指定角色</SelectItem>
                  <SelectItem value="USER">指定人员</SelectItem>
                  <SelectItem value="DEPT">指定部门</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {["ROLE", "USER", "DEPT"].includes(
              formData.startPermissionType || "",
            ) && (
              <ApproverValueSelector
                type={formData.startPermissionType as string}
                value={formData.startPermissionValue || ""}
                onChange={(val) => handleChange("startPermissionValue", val)}
                multiple={true}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ==================== 主组件 ====================

interface WorkflowBuilderProps {
  workflow?: WorkflowDefinition;
  onChange?: (wf: WorkflowDefinition) => void;
  onSave?: (
    wf: WorkflowDefinition,
  ) => Promise<{ id?: string } | void> | { id?: string } | void;
  availableForms?: FormDefinition[];
  availableRoles?: any[];
  availableUsers?: User[];
}

const WorkflowToolbar = ({
  workflowName,
  workflowKey,
  workflowId,
  onNameChange,
  onKeyChange,
  onSave,
  onDeploy,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onOpenTemplatePicker,
  onOpenGlobalConfig,
  onOpenSettings,
  onViewVersionHistory,
  onExport,
  saving,
}: {
  workflowName: string;
  workflowKey: string;
  workflowId?: string;
  onNameChange: (name: string) => void;
  onKeyChange: (key: string) => void;
  onSave: () => void;
  onDeploy: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onOpenTemplatePicker: () => void;
  onOpenGlobalConfig: () => void;
  onOpenSettings: () => void;
  onViewVersionHistory?: () => void;
  onExport?: () => void;
  saving: boolean;
}) => {
  return (
    <div className="flex items-center justify-between px-6 py-3 border-b border-slate-200 bg-white shadow-sm shrink-0 h-16 z-20 relative">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 group">
          <div className="w-8 h-8 rounded-lg bg-pink-50 flex items-center justify-center group-hover:bg-pink-100 transition-colors">
            <GitMerge size={18} className="text-pink-500" />
          </div>
          <Input
            className="text-base font-bold !border-none !ring-0 !shadow-none p-1 w-64 bg-transparent hover:bg-slate-50 focus:bg-white rounded transition-colors"
            value={workflowName}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="未命名流程"
          />
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span className="font-mono bg-slate-100 text-slate-500 px-2 py-1 rounded border border-slate-200">
            KEY
          </span>
          <Input
            className="text-xs font-mono !border-none !ring-0 !shadow-none p-1 w-40 bg-transparent hover:bg-slate-50 focus:bg-white rounded transition-colors"
            value={workflowKey}
            onChange={(e) => onKeyChange(e.target.value)}
            placeholder="process_key"
          />
        </div>
      </div>
      <div className="flex items-center gap-2 flex-nowrap shrink-0 min-w-0 overflow-x-auto">
        <Button
          variant="outline"
          size="sm"
          onClick={onOpenTemplatePicker}
          className="h-8 px-3 text-xs font-semibold whitespace-nowrap text-slate-600 hover:bg-slate-50 hover:text-pink-500 hover:border-pink-200 gap-2 shrink-0"
        >
          <Sparkles size={14} className="text-pink-500" />
          模板库
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onOpenSettings}
          className="h-8 px-3 text-xs font-semibold whitespace-nowrap text-slate-600 hover:bg-slate-50 hover:text-blue-500 hover:border-blue-200 gap-2 shrink-0"
        >
          <FileText size={14} className="text-blue-500" />
          流程设置
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onOpenGlobalConfig}
          className="h-8 px-3 text-xs font-semibold whitespace-nowrap text-slate-600 hover:bg-slate-50 hover:text-purple-500 hover:border-purple-200 gap-2 shrink-0"
        >
          <Settings size={14} className="text-purple-500" />
          全局属性
        </Button>
        {/* 版本历史按钮 - 仅在流程已保存时显示 */}
        {workflowId &&
          !workflowId.startsWith("new_") &&
          onViewVersionHistory && (
            <Button
              variant="outline"
              size="sm"
              onClick={onViewVersionHistory}
              className="h-8 px-3 text-xs font-semibold whitespace-nowrap text-slate-600 hover:bg-slate-50 hover:text-indigo-500 hover:border-indigo-200 gap-2 shrink-0"
              title="查看版本历史"
            >
              <Clock size={14} className="text-indigo-500" />
              版本历史
            </Button>
          )}
        {/* 导出按钮 - 仅在流程已保存时显示 */}
        {workflowId && !workflowId.startsWith("new_") && onExport && (
          <Button
            variant="outline"
            size="sm"
            onClick={onExport}
            className="h-8 px-3 text-xs font-semibold whitespace-nowrap text-slate-600 hover:bg-slate-50 hover:text-green-500 hover:border-green-200 gap-2 shrink-0"
            title="导出流程"
          >
            <FileDown size={14} className="text-green-500" />
            导出
          </Button>
        )}
        <div className="w-px h-6 bg-slate-200 mx-1 shrink-0"></div>
        <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1 border border-slate-200 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            onClick={onUndo}
            disabled={!canUndo}
            className={`h-8 w-8 p-0 rounded-md ${!canUndo ? "text-slate-300 cursor-not-allowed" : "text-slate-600 hover:bg-white hover:shadow-sm hover:text-slate-900"}`}
            title="撤销 (Ctrl+Z)"
          >
            <Undo2 size={16} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onRedo}
            disabled={!canRedo}
            className={`h-8 w-8 p-0 rounded-md ${!canRedo ? "text-slate-300 cursor-not-allowed" : "text-slate-600 hover:bg-white hover:shadow-sm hover:text-slate-900"}`}
            title="重做 (Ctrl+Y)"
          >
            <Redo2 size={16} />
          </Button>
        </div>
        <div className="w-px h-6 bg-slate-200 mx-1 shrink-0"></div>
        <Button
          variant="outline"
          size="sm"
          onClick={onSave}
          disabled={saving}
          className="h-9 px-4 text-sm font-medium whitespace-nowrap text-slate-700 border-slate-300 hover:bg-slate-50 hover:border-slate-400 gap-2 shrink-0"
        >
          {saving ? (
            <div className="w-4 h-4 border-2 border-slate-700 border-t-transparent rounded-full animate-spin"></div>
          ) : (
            <Save size={16} />
          )}
          {saving ? "保存中..." : "保存"}
        </Button>
        <Button
          size="sm"
          onClick={onDeploy}
          disabled={saving}
          className="h-9 px-4 text-sm font-semibold whitespace-nowrap text-white bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600 hover:shadow-md gap-2 disabled:opacity-70 shadow-sm shrink-0"
        >
          {saving ? (
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
          ) : (
            <UploadCloud size={16} />
          )}
          {saving ? "发布中..." : "发布"}
        </Button>
      </div>
    </div>
  );
};

export const WorkflowBuilder: React.FC<WorkflowBuilderProps> = ({
  workflow,
  onChange,
  onSave,
  availableForms,
  availableRoles,
  availableUsers,
}) => {
  // P2: 获取当前用户信息（用于数据权限）
  const { user } = useAuth();

  const defaultRoot: WorkflowNode = {
    id: "node_start",
    type: NodeType.START,
    title: "发起申请",
    next: {
      id: "node_1",
      type: NodeType.APPROVAL,
      title: "部门经理审批",
      approverType: "DEPT_MANAGER",
      next: { id: "node_end", type: NodeType.END, title: "流程结束" },
    },
  };

  const {
    state: root,
    set: setRoot,
    reset: resetRoot,
    undo,
    redo,
    canUndo,
    canRedo,
  } = useHistory<WorkflowNode>(workflow?.nodes || defaultRoot);
  // 用 ref 保持最新的 root 引用，解决确认对话框等异步回调中闭包过时的问题
  const rootRef = useRef(root);
  rootRef.current = root;
  const workflowRef = useRef(workflow);
  workflowRef.current = workflow;
  const [selectedNode, setSelectedNode] = useState<WorkflowNode | null>(null);
  const [saving, setSaving] = useState(false);
  const [workflowName, setWorkflowName] = useState(
    workflow?.name || "未命名流程",
  );
  const [workflowKey, setWorkflowKey] = useState(
    workflow?.key || "new_process",
  );
  const [zoom, setZoom] = useState(1);
  const [panOrigin, setPanOrigin] = useState({ x: 0, y: 0 }); // 拖拽平移偏移量
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  const [isDraggingGlobal, setDraggingGlobal] = useState(false);
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);
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

  // P1: 流程设置状态
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [workflowDescription, setWorkflowDescription] = useState("");
  const [workflowCategory, setWorkflowCategory] = useState("");
  const [workflowTags, setWorkflowTags] = useState<string[]>([]);
  const [selectedFormId, setSelectedFormId] = useState("");

  // P2: 启动权限配置状态
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
  const legacyBranchStrategyHintRef = useRef<string>("");

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
      // 兼容逗号分隔标签
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
      // 编辑已有流程时优先保留原有数据权限部门，避免被当前登录人部门覆盖
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
      nodes: rootRef.current,
      name: workflowName,
      key: workflowKey,
      ...buildSettingsState(),
    };
  }, [workflowName, workflowKey, buildSettingsState]);

  // P1: 从 workflow 对象初始化流程设置状态，并在切换流程时重置画布状态
  useEffect(() => {
    if (!workflow) return;

    const normalized = normalizeLegacyBranchStrategy(
      workflow.nodes || defaultRoot,
    );
    const nextRoot = normalized.node;
    const parsedTags = parseTagsToArray(workflow.tags);
    resetRoot(nextRoot);
    rootRef.current = nextRoot;
    setSelectedNode(null);

    if (normalized.fixedNodeTitles.length > 0) {
      const hintKey = `${workflow.id}:${normalized.fixedNodeTitles.join("|")}`;
      if (legacyBranchStrategyHintRef.current !== hintKey) {
        legacyBranchStrategyHintRef.current = hintKey;
        const preview = normalized.fixedNodeTitles.slice(0, 3).join("、");
        const remaining = normalized.fixedNodeTitles.length - 3;
        const summary =
          remaining > 0 ? `${preview} 等${normalized.fixedNodeTitles.length}个节点` : preview;
        toast.warning(
          `检测到历史分支策略配置，已自动兼容修复为单选分支（${summary}）`,
        );
      }
    }

    setWorkflowName(workflow.name || "未命名流程");
    setWorkflowKey(workflow.key || "new_process");
    setWorkflowDescription(workflow.description || "");
    setWorkflowCategory(workflow.category || "");
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
      category: workflow.category || undefined,
      tags: parsedTags.length > 0 ? parsedTags.join(", ") : undefined,
      startPermissionType: workflow.startPermissionType || "ALL",
      startPermissionValue: workflow.startPermissionValue || undefined,
    });
  }, [workflow?.id, parseTagsToArray, resetRoot, normalizeDeptId, user?.deptId]);

  useEffect(() => {
    if (!onChange || !workflowRef.current) return;
    const snapshot = buildWorkflowSnapshot();
    if (snapshot) {
      onChange(snapshot);
    }
  }, [
    onChange,
    workflow?.id,
    root,
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

  // 键盘快捷键支持
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 撤销 Ctrl+Z
      if (
        (e.ctrlKey || e.metaKey) &&
        !e.shiftKey &&
        e.key.toLowerCase() === "z"
      ) {
        e.preventDefault();
        if (canUndo) undo();
      }
      // 重做 Ctrl+Y 或 Ctrl+Shift+Z
      if (
        ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") ||
        ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "z")
      ) {
        e.preventDefault();
        if (canRedo) redo();
      }
      // 删除节点 Delete / Backspace
      if (e.key === "Delete" || e.key === "Backspace") {
        // 如果焦点在输入框中，不触发删除
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
        if (selectedNode && selectedNode.id !== root.id) {
          e.preventDefault(); // 防止 Backspace 导致页面回退
          handleDeleteNode(selectedNode.id);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [canUndo, canRedo, undo, redo, selectedNode, root]); // 依赖项包含 root 以确保 handleDeleteNode 获取最新状态

  const handleZoomIn = useCallback(
    () => setZoom((z) => Math.min(z + 0.1, 2)),
    [],
  );
  const handleZoomOut = useCallback(
    () => setZoom((z) => Math.max(z - 0.1, 0.3)),
    [],
  );
  const handleZoomReset = useCallback(() => setZoom(1), []);

  // 滚轮缩放支持 (Ctrl + Wheel)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleWheel = (e: WheelEvent) => {
      // 只有按住 Ctrl 或 Meta 键时才触发缩放，避免影响正常滚动
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = e.deltaY;
        setZoom((prev) => {
          // 向上滚动 (delta < 0) 是放大，向下滚动 (delta > 0) 是缩小
          // 使用较小的步长以获得更平滑的体验
          const step = 0.05;
          const newZoom = delta < 0 ? prev + step : prev - step;
          return Math.min(Math.max(newZoom, 0.3), 2);
        });
      }
    };

    // 使用 passive: false 以便能够调用 preventDefault
    canvas.addEventListener("wheel", handleWheel, { passive: false });

    return () => {
      canvas.removeEventListener("wheel", handleWheel);
    };
  }, []);

  const handleCopyNode = useCallback(
    (nodeId: string) => {
      const node = findNodeById(root, nodeId);
      if (!node || node.type === NodeType.START || node.type === NodeType.END) {
        toast.error("此节点不可复制");
        return;
      }
      const copiedNode: WorkflowNode = {
        ...node,
        id: generateNodeId("node"),
        title: `${node.title} (副本)`,
        next: undefined,
        branches: node.branches
          ? node.branches.map((b, i) => ({
              ...b,
              id: generateNodeId("branch"),
              next: undefined,
            }))
          : undefined,
      };
      setRoot(
        updateNodeInTree(root, nodeId, (n) => ({
          ...n,
          next: n.next ? { ...copiedNode, next: n.next } : copiedNode,
        })),
      );
      toast.success("节点已复制");
    },
    [root],
  );

  const handleAddNext = (parentId: string, type?: NodeType) => {
    const nodeType = type || NodeType.APPROVAL;

    // 如果要添加END节点,检查是否已存在END节点
    if (nodeType === NodeType.END && hasEndNode(root)) {
      // 显示自定义确认对话框
      setConfirmDialog({
        open: true,
        message:
          "流程中已存在结束节点。添加新的结束节点将会删除当前节点之后的所有节点。是否继续?",
        onConfirm: () => {
          // 用户确认,删除后续节点并添加END节点
          const newNode: WorkflowNode = {
            id: generateNodeId("node"),
            type: NodeType.END,
            title: "流程结束",
          };
          setRoot(
            updateNodeInTree(root, parentId, (node) => ({
              ...node,
              next: newNode,
            })),
          );
          toast.success("已添加结束节点");
        },
      });
      return;
    }

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

    const newNode: WorkflowNode = {
      id: generateNodeId("node"),
      type: nodeType,
      title: getTitleByType(nodeType),
      ...(nodeType === NodeType.APPROVAL
        ? { approverType: "ROLE" as const }
        : {}),
      // 会签节点默认设置 signType='ALL'，避免后端校验器误判为并行网关要求必须有分支
      ...(nodeType === NodeType.PARALLEL
        ? { approverType: "ROLE" as const, signType: "ALL" as const }
        : {}),
      ...(nodeType === NodeType.MANUAL
        ? { approverType: "ROLE" as const }
        : {}),
    };

    // 关键修复：当 parentId 是 END 节点时，新节点应插入到 END 之前，而不是之后
    // 即找到 END 的父节点，把新节点插在父节点和 END 之间
    const targetNode = findNodeById(root, parentId);
    if (targetNode && targetNode.type === NodeType.END) {
      const endParent = findParentOfNode(root, parentId);
      if (endParent) {
        // 在 END 的父节点上操作：把 END 原有的位置替换为新节点，新节点的 next 指向 END
        // 这里必须要在 endParent 处执行更新：让 endParent.next 指向新节点，新节点指向 END

        // 分支下的 END：如果 END 是通过 branches 连接的，而不是 next，此时 endParent 就是条件分支节点。
        // 但通常连线只会通过 next。由于架构里 branches 里只能放一个 node（分支的头部），其余的逻辑都在 next 链里。

        const newRoot = updateNodeInTree(root, endParent.id, (node) => {
          // 如果 END 在这个父节点的 next 上
          if (node.next && node.next.id === targetNode.id) {
            return {
              ...node,
              next: { ...newNode, next: node.next },
            };
          }
          // 如果 END 直接在这个父节点的分支数组里（这通常不发生，因为我们会默认有个分支头）
          if (node.branches) {
            return {
              ...node,
              branches: node.branches.map((b) =>
                b.id === targetNode.id ? { ...newNode, next: b } : b,
              ),
            };
          }
          return node;
        });
        setRoot(newRoot);
        return;
      }
    }

    // 普通情况：在 parentId 节点后面插入新节点
    const newRoot = updateNodeInTree(root, parentId, (node) => ({
      ...node,
      next: node.next ? { ...newNode, next: node.next } : newNode,
    }));
    setRoot(newRoot);
  };

  const handleAddBranch = (targetId: string) => {
    let parentId = targetId;
    let parentNode = findNodeById(root, targetId);

    // 修复: 如果是在 END 节点上方的“+”点击添加分支，其实应当是给 END 的前置父节点添加分支
    if (parentNode?.type === NodeType.END) {
      const endParent = findParentOfNode(root, targetId);
      if (endParent) {
        parentId = endParent.id;
        parentNode = endParent;
      } else {
        toast.error("无法在当前位置添加分支");
        return;
      }
    }

    // P1-8: PARALLEL 节点处于会签模式时，禁止添加分支（两者语义互斥）
    if (parentNode?.type === NodeType.PARALLEL) {
      const signType = parentNode.signType;
      if (
        signType &&
        ["ALL", "ANY", "PERCENT", "SEQUENTIAL"].includes(signType)
      ) {
        toast.error(
          `会签节点"${parentNode.title}"已配置${signType === "ALL" ? "全签" : signType === "ANY" ? "或签" : signType === "PERCENT" ? "比例签" : "顺序签"}模式，不能同时添加分支。如需使用并行分支，请先在属性面板中移除会签配置。`,
        );
        return;
      }
    }

    const newBranch: WorkflowNode = {
      id: generateNodeId("branch"),
      type: NodeType.CONDITION,
      title: "新分支",
      condition: "amount > 0",
    };
    // 根据父节点类型决定默认分支策略
    const defaultStrategy =
      parentNode?.type === NodeType.PARALLEL ? "PARALLEL" : "EXCLUSIVE";
    const newRoot = updateNodeInTree(root, parentId, (node) => ({
      ...node,
      branches: [...(node.branches || []), newBranch],
      branchStrategy: node.branchStrategy || defaultStrategy,
    }));
    setRoot(newRoot);
  };

  const handleUpdateNode = (id: string, data: Partial<WorkflowNode>) => {
    // 通过 rootRef.current 获取最新的 root，解决确认对话框等异步回调中闭包过时的问题
    // 立即更新 ref，确保连续同步调用（如 onChange + onLabelChange）不会互相覆盖
    const newRoot = updateNodeInTree(rootRef.current, id, (node) => ({
      ...node,
      ...data,
    }));
    rootRef.current = newRoot;
    setRoot(newRoot);
    setSelectedNode((prev) =>
      prev && prev.id === id ? { ...prev, ...data } : prev,
    );
  };

  const handleDeleteNode = (id: string) => {
    if (id === root.id) {
      toast.error("开始节点不可删除");
      return;
    }
    const node = findNodeById(root, id);
    if (!node) return;
    if (node.type === NodeType.END) {
      toast.error("结束节点不可删除");
      return;
    }

    // 严禁单独删除条件分支的根节点
    const parentNode = findParentOfNode(root, id);
    if (
      parentNode &&
      parentNode.branches &&
      parentNode.branches.some((b) => b.id === id)
    ) {
      setConfirmDialog({
        open: true,
        message: `您即将删除整个条件分支，该分支下的所有节点也将一并被删除，是否继续？`,
        onConfirm: () => {
          // 只过滤自身，也就是将其从 parentNode.branches 里面移除
          const newRoot = updateNodeInTree(
            rootRef.current,
            parentNode.id,
            (n) => ({
              ...n,
              branches: n.branches?.filter((b) => b.id !== id),
            }),
          );
          setRoot(newRoot);
          setSelectedNode(null);
          toast.success("已删除分支");
        },
      });
      return;
    }

    // P0-2 修复：删除带分支的节点时，提示用户分支内容将丢失
    if (node.branches && node.branches.length > 0) {
      setConfirmDialog({
        open: true,
        message: `节点"${node.title}"自身下方挂载了 ${node.branches.length} 个分支，删除该节点将导致这些分支结构彻底毁坏并丢失。是否继续？`,
        onConfirm: () => {
          const newRoot = deleteNodeInTree(rootRef.current, id);
          if (newRoot) {
            setRoot(newRoot);
            setSelectedNode(null);
            toast.success("节点及其分支已删除");
          }
        },
      });
      return;
    }

    const newRoot = deleteNodeInTree(root, id);
    if (newRoot) {
      setRoot(newRoot);
      setSelectedNode(null);
      toast.success("节点已删除");
    }
  };

  const handleDrop = (dragId: string, dropId: string) => {
    const currentRoot = rootRef.current;

    // 基础校验：不能拖到自身
    if (dragId === dropId) return;

    const dragNode = findNodeById(currentRoot, dragId);
    if (!dragNode) return;

    // 不能拖拽开始/结束节点
    if (dragNode.type === NodeType.START || dragNode.type === NodeType.END) {
      toast.error("开始和结束节点不能移动");
      return;
    }

    // 检查被拖拽的节点是否是分支节点（条件分支不能独立移动）
    const checkIfBranchNode = (
      node: WorkflowNode,
      targetId: string,
    ): boolean => {
      if (node.branches) {
        for (const branch of node.branches) {
          if (branch.id === targetId) return true;
          if (checkIfBranchNode(branch, targetId)) return true;
        }
      }
      if (node.next) return checkIfBranchNode(node.next, targetId);
      return false;
    };

    if (checkIfBranchNode(currentRoot, dragId)) {
      toast.error("分支节点不能移动，这会破坏流程结构");
      return;
    }

    // 防止循环引用：不能把节点拖到自己的子树中
    if (isDescendantOf(currentRoot, dragId, dropId)) {
      toast.error("不能将节点移动到自己的子节点中，这会导致循环引用");
      return;
    }

    // 检查是否是相邻节点的无意义移动（dragNode 已经紧跟在 dropId 后面）
    const dropNode = findNodeById(currentRoot, dropId);
    if (dropNode?.next?.id === dragId) {
      toast.info("节点已在该位置，无需移动");
      return;
    }

    // 执行移动：先从树中删除拖拽节点，再插入到目标位置
    let newRoot = deleteNodeInTree(currentRoot, dragId);
    if (newRoot) {
      // 防御性保护：若删除后落点不存在，则中止本次拖拽，避免异常场景下结构丢失
      const dropNodeAfterDelete = findNodeById(newRoot, dropId);
      if (!dropNodeAfterDelete) {
        toast.error("目标位置已失效，请重试拖拽");
        return;
      }

      // 移动时只移动节点本身，不带子树（next 断开）
      const nodeToInsert = { ...dragNode, next: undefined };

      // 统一处理：插入到落点节点之后。
      // 因为现在所有的拖入都只会触发 ConnectorDropZone（发生在父节点和next节点之间的连线区），dropId就是此连线前方的节点ID
      newRoot = updateNodeInTree(newRoot, dropId, (node) => ({
        ...node,
        next: { ...nodeToInsert, next: node.next },
      }));

      rootRef.current = newRoot;
      setRoot(newRoot);
      // P1-10: 明确提示用户仅移动了当前节点
      toast.success("节点已移动（仅移动当前节点，后续节点保留在原位）");
    }
  };

  const handleApplyTemplate = (template: WorkflowTemplate) => {
    // P1-11: 应用模板时递归重新生成所有节点 ID，避免不同流程定义共享相同 nodeKey
    const regenerateIds = (node: WorkflowNode): WorkflowNode => {
      const newNode: WorkflowNode = {
        ...node,
        id:
          node.type === NodeType.START
            ? generateNodeId("start")
            : node.type === NodeType.END
              ? generateNodeId("end")
              : generateNodeId("node"),
      };
      if (newNode.next) newNode.next = regenerateIds(newNode.next);
      if (newNode.branches)
        newNode.branches = newNode.branches.map((b) => regenerateIds(b));
      return newNode;
    };
    setRoot(regenerateIds(template.nodes));
    setWorkflowName(template.name);
    toast.success(`已应用模板: ${template.name}`);
  };

  const buildDefinitionPayload = useCallback(() => {
    return {
      definitionId: workflowRef.current?.id?.startsWith("new_")
        ? undefined
        : workflowRef.current?.id,
      processName: workflowName,
      processKey: workflowKey,
      modelJson: JSON.stringify(rootRef.current),
      ...buildSettingsState(),
    };
  }, [workflowName, workflowKey, buildSettingsState]);

  const handleSave = async () => {
    const { errors, errorNodes } = validateWorkflow(root);
    setInvalidNodeIds(errorNodes);

    // P1: 增加对 processKey 和 processName 的非空和格式验证
    if (!workflowName || workflowName.trim() === "") {
      toast.error("请输入流程名称");
      return;
    }
    if (!workflowKey || workflowKey.trim() === "") {
      toast.error("请输入流程标识 (KEY)");
      return;
    }
    if (!/^[a-zA-Z0-9_]+$/.test(workflowKey)) {
      toast.error("流程标识格式不正确: 只能包含英文字母、数字和下划线");
      return;
    }

    if (errors.length > 0) {
      errors.forEach((err) => toast.error(err));
      return;
    }

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
      // P1: 包含所有新增字段（description, category, tags, formId）
      // P2: 包含启动权限字段（startPermissionType, startPermissionValue）
      // P2: 包含数据权限字段（deptId - 从用户上下文自动获取）
      const definition = buildDefinitionPayload();
      await saveProcessDefinition(definition);
      toast.success("流程已保存");
    } catch (e) {
      console.error(e);
      toast.error("保存失败");
    } finally {
      setSaving(false);
    }
  };

  const handleDeploy = async () => {
    const { errors, errorNodes } = validateWorkflow(root);
    setInvalidNodeIds(errorNodes);

    // P1: 增加对 processKey 和 processName 的非空和格式验证
    if (!workflowName || workflowName.trim() === "") {
      toast.error("请输入流程名称");
      return;
    }
    if (!workflowKey || workflowKey.trim() === "") {
      toast.error("请输入流程标识 (KEY)");
      return;
    }
    if (!/^[a-zA-Z0-9_]+$/.test(workflowKey)) {
      toast.error("流程标识格式不正确: 只能包含英文字母、数字和下划线");
      return;
    }

    if (errors.length > 0) {
      errors.forEach((err) => toast.error(err));
      return;
    }

    try {
      setSaving(true);
      // P0: 使用 definitionId；P1: 携带所有新增字段；P2: 携带启动权限字段和数据权限字段
      const definition = buildDefinitionPayload();
      const saveRes = await saveProcessDefinition(definition);
      // API 应该返回带 id 字段的对象，如果返回本身就是 ID 则直接用
      const definitionId = (saveRes as any)?.id || saveRes;
      if (!definitionId) {
        toast.error("发布失败：无法获取流程ID");
        return;
      }
      const normalizedDefinitionId = String(definitionId);
      // 同步到外层状态，避免发布后继续使用旧 definitionId
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
      toast.error("发布失败");
    } finally {
      setSaving(false);
    }
  };

  // P1: 处理流程设置保存
  const handleSettingsSave = (settings: {
    description: string;
    category: string;
    tags: string[];
    formId: string;
    startPermissionType: string;
    startPermissionValue: string;
  }) => {
    setWorkflowDescription(settings.description);
    setWorkflowCategory(settings.category);
    setWorkflowTags(settings.tags);
    setSelectedFormId(settings.formId);
    setStartPermissionType(settings.startPermissionType);
    setStartPermissionValue(settings.startPermissionValue);
    setGlobalConfig({
      formId: settings.formId || undefined,
      description: settings.description || undefined,
      category: settings.category || undefined,
      tags: settings.tags && settings.tags.length > 0 ? settings.tags.join(", ") : undefined,
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
      setGlobalConfig(next);
      setWorkflowDescription(next.description || "");
      setWorkflowCategory(next.category || "");
      setSelectedFormId(next.formId || "");
      setStartPermissionType(next.startPermissionType || "ALL");
      setStartPermissionValue(next.startPermissionValue || "");
      setWorkflowTags(parseTagsToArray(next.tags));
    },
    [parseTagsToArray],
  );

  // 查看版本历史
  const handleViewVersionHistory = () => {
    if (workflow?.id && !workflow.id.startsWith("new_")) {
      window.open(`/workflow/versions/${workflow.id}`, "_blank");
    }
  };

  // 导出流程
  const handleExport = async () => {
    if (!workflow?.id || workflow.id.startsWith("new_")) {
      toast.error("请先保存流程后再导出");
      return;
    }

    try {
      // 统一走 request 客户端，确保携带认证信息与统一错误处理
      const blob = await exportWorkflow(workflow.id, false);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `workflow_${workflowName}_${workflow.version || "1.0.0"}_${new Date().toISOString().split("T")[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast.success("流程导出成功");
    } catch (error) {
      console.error("导出失败:", error);
      toast.error("导出失败，请重试");
    }
  };

  const flowNodeActions = useMemo<FlowNodeActionsContextValue>(
    () => ({
      onAddNext: handleAddNext,
      onAddBranch: handleAddBranch,
      onSelect: setSelectedNode,
      onDrop: handleDrop,
      onCopy: handleCopyNode,
      setDraggingGlobal,
      setDraggingNodeId,
      setActiveQuickAddId,
      setHoveredNodeId,
    }),
    [handleAddBranch, handleAddNext, handleCopyNode, handleDrop],
  );

  return (
    <FlowNodeActionsContext.Provider value={flowNodeActions}>
      <div className="h-full flex flex-col bg-slate-100 overflow-hidden relative">
      <WorkflowToolbar
        workflowName={workflowName}
        workflowKey={workflowKey}
        workflowId={workflow?.id}
        onNameChange={setWorkflowName}
        onKeyChange={setWorkflowKey}
        onSave={handleSave}
        onDeploy={handleDeploy}
        onUndo={undo}
        onRedo={redo}
        canUndo={canUndo}
        canRedo={canRedo}
        onOpenTemplatePicker={() => setShowTemplates(true)}
        onOpenSettings={() => setShowSettingsModal(true)}
        onOpenGlobalConfig={() => setShowGlobalConfig(true)}
        onViewVersionHistory={handleViewVersionHistory}
        onExport={handleExport}
        saving={saving}
      />

      {/* 画布 */}
      <div
        ref={canvasRef}
        className={`flex-1 overflow-hidden p-10 flex justify-center relative transition-all duration-300 ease-out bg-slate-50 ${isPanning ? "cursor-grabbing" : "cursor-default"} ${selectedNode ? "mr-96" : ""}`}
        onPointerDown={(e) => {
          // 在空白处左键 或 中键 按下启动漫游 (pan)
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
          setSelectedNode(null);
        }}
      >
        {/* 动态网格背景，随漫游移动 */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: "radial-gradient(#e5e7eb 1px, transparent 1px)",
            backgroundSize: "20px 20px",
            backgroundPosition: `${panOrigin.x}px ${panOrigin.y}px`,
          }}
        />

        {/* 缩放控件 */}
        <div className="absolute bottom-4 right-4 z-20 flex items-center gap-1 bg-white rounded-lg shadow-md border border-slate-200 p-1">
          <button
            onClick={handleZoomOut}
            className="p-1.5 hover:bg-slate-100 rounded text-slate-600"
            title="缩小"
          >
            <ZoomOut size={16} />
          </button>
          <span className="text-xs text-slate-500 min-w-[40px] text-center font-mono">
            {Math.round(zoom * 100)}%
          </span>
          <button
            onClick={handleZoomIn}
            className="p-1.5 hover:bg-slate-100 rounded text-slate-600"
            title="放大"
          >
            <ZoomIn size={16} />
          </button>
          <div className="w-px h-4 bg-slate-200 mx-0.5" />
          <button
            onClick={handleZoomReset}
            className="p-1.5 hover:bg-slate-100 rounded text-slate-600"
            title="重置缩放"
          >
            <Maximize2 size={16} />
          </button>
        </div>

        {/* 拖拽全局提示 */}
        {isDraggingGlobal && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 bg-pink-500 text-white text-xs px-4 py-2 rounded-full shadow-lg flex items-center gap-2">
            <Move size={14} /> 拖拽节点到连接线上的"拖到这里"区域即可移动
          </div>
        )}

        <div
          className="min-w-[800px] flex justify-center pb-40 transition-transform origin-top z-10"
          style={{
            transform: `translate(${panOrigin.x}px, ${panOrigin.y}px) scale(${zoom})`,
          }}
        >
          <FlowNode
            node={root}
            invalidNodes={invalidNodeIds}
            selectedNodeId={selectedNode?.id}
            isDraggingGlobal={isDraggingGlobal}
            draggingNodeId={draggingNodeId}
            activeQuickAddId={activeQuickAddId}
            hoveredNodeId={hoveredNodeId}
          />
        </div>
      </div>

      {/* 属性面板 */}
      {selectedNode && (
        <PropertyPanel
          node={selectedNode}
          onClose={() => setSelectedNode(null)}
          onUpdate={handleUpdateNode}
          onDelete={handleDeleteNode}
          onConfirmAction={(message, onConfirm) =>
            setConfirmDialog({ open: true, message, onConfirm })
          }
        />
      )}

      {/* 全局属性面板 */}
      <GlobalPropertyPanel
        open={showGlobalConfig}
        onClose={() => setShowGlobalConfig(false)}
        workflow={globalConfig}
        onUpdate={handleGlobalConfigUpdate}
      />

      {/* 模板选择器 */}
      <TemplatePickerModal
        open={showTemplates}
        onClose={() => setShowTemplates(false)}
        onSelect={handleApplyTemplate}
      />

      {/* 流程设置模态框 */}
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
        onSave={handleSettingsSave}
      />

      {/* 确认对话框 */}
      <ConfirmDialog
        open={confirmDialog.open}
        title="确认操作"
        message={confirmDialog.message}
        confirmText="确定"
        cancelText="取消"
        variant="warning"
        onConfirm={confirmDialog.onConfirm}
        onCancel={() =>
          setConfirmDialog({ open: false, message: "", onConfirm: () => {} })
        }
      />
      </div>
    </FlowNodeActionsContext.Provider>
  );
};
