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
  NodeType,
  WorkflowDefinition,
  FormDefinition,
  User,
  WorkflowGraphEdge,
  WorkflowGraphDefinition,
  WorkflowGraphNode,
} from "../types";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useHistory } from "../hooks/useHistory";
import {
  saveProcessDefinition,
  deployProcessDefinition,
  exportWorkflow,
} from "../services/api/workflow";
import { getRoleList, getUserList, getDeptTree } from "../services/api/auth";
import { toast } from "sonner";
import { downloadBlob } from "../utils/download";
import { ConfirmDialog } from "./common/ConfirmDialog";
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
import { WORKFLOW_CATEGORY_OPTIONS, normalizeWorkflowCategory } from "../utils/workflowCategory";
import { useAuth } from "../context/AuthContext";
import {
  appendWorkflowGraphBranch,
  assertWorkflowGraphIntegrity,
  countWorkflowGraphBranches,
  cloneWorkflowGraphSubgraph,
  findWorkflowGraphMainTargetId,
  findWorkflowGraphNode,
  findWorkflowGraphParentNodeId,
  getWorkflowGraphBranchChildIds,
  isWorkflowGraphNodeInsideBranchScope,
  isWorkflowGraphNodeInBranchSubtree,
  isWorkflowGraphBranchRoot,
  insertWorkflowGraphNodeAfter,
  insertWorkflowGraphSubgraphAfter,
  moveWorkflowGraphNode,
  parseWorkflowGraphDefinition,
  removeWorkflowGraphBranch,
  removeWorkflowGraphNode,
  replaceWorkflowGraphNextNode,
  patchWorkflowGraphNode,
} from "../utils/workflowGraph";

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

type EditableWorkflowNode = WorkflowGraphNode & {
  title: string;
  branchStrategy?: "PARALLEL" | "RACE" | "EXCLUSIVE";
  condition?: string;
  inputs?: Record<string, string>;
  outputs?: Record<string, string>;
  slaHours?: number;
  slaAction?: "AUTO_PASS" | "AUTO_REJECT";
  retry?: {
    maxRetries: number;
    delayMs: number;
  };
  props?: Record<string, any>;
  signType?: "ALL" | "ANY" | "PERCENT" | "SEQUENTIAL";
  passPercent?: number;
  description?: string;
  icon?: string;
  approverType?:
    | "ROLE"
    | "USER"
    | "USERS"
    | "INITIATOR"
    | "DEPT_MANAGER"
    | "DIRECT_LEADER"
    | "DEPT";
  approverValue?: string;
  allowEdit?: boolean;
};

const toEditableWorkflowNode = (
  node: WorkflowGraphNode,
): EditableWorkflowNode =>
  ({
    ...node,
    title: typeof node.title === "string" ? node.title : "",
  }) as EditableWorkflowNode;

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
  INITIATOR: "发起人",
  DEPT_MANAGER: "部门负责人",
  DIRECT_LEADER: "直属上级",
  DEPT: "按部门",
};

const BRANCH_STRATEGY_LABELS: Record<string, string> = {
  EXCLUSIVE: "单选分支",
  PARALLEL: "并行处理",
  RACE: "竞争模式",
};

const neutralNodeVisual = {
  bg: "bg-white dark:bg-slate-950/88",
  iconBg: "bg-cyan-50 dark:bg-cyan-950/30",
  iconColor: "text-cyan-700 dark:text-cyan-200",
  border: "border-slate-200 dark:border-slate-800",
};

// 节点类型视觉配置
const NODE_VISUAL: Record<
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
  [NodeType.START]: {
    ...neutralNodeVisual,
    icon: PlayCircle,
    label: "开始",
  },
  [NodeType.APPROVAL]: {
    ...neutralNodeVisual,
    icon: UserCheck,
    label: "审批",
  },
  [NodeType.CONDITION]: {
    ...neutralNodeVisual,
    icon: GitBranch,
    label: "条件",
  },
  [NodeType.PARALLEL]: {
    ...neutralNodeVisual,
    icon: Layers,
    label: "并行",
  },
  [NodeType.END]: {
    ...neutralNodeVisual,
    icon: Flag,
    label: "完成",
  },
  [NodeType.NOTIFICATION]: {
    ...neutralNodeVisual,
    icon: Bell,
    label: "通知",
  },
  [NodeType.SCRIPT]: {
    ...neutralNodeVisual,
    icon: Code,
    label: "脚本",
  },
  [NodeType.TIMER]: {
    ...neutralNodeVisual,
    icon: Clock,
    label: "定时",
  },
  [NodeType.SUBPROCESS]: {
    ...neutralNodeVisual,
    icon: Workflow,
    label: "子流程",
  },
  [NodeType.MANUAL]: {
    ...neutralNodeVisual,
    icon: ClipboardCheck,
    label: "人工",
  },
  [NodeType.COPY]: {
    ...neutralNodeVisual,
    icon: Send,
    label: "抄送",
  },
};

const getNodeVisual = (type: string) =>
  NODE_VISUAL[type] || NODE_VISUAL[NodeType.APPROVAL];

const getNodeMetaText = (
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

const getNodeAssigneeSummary = (node: EditableWorkflowNode): string => {
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
    parts.length > 2 ? `${parts.slice(0, 2).join(", ")} 等${parts.length}项` : displayText;

  return approverTypeLabel
    ? `${approverTypeLabel} · ${compactText}`
    : compactText;
};

const studioSidePanelClassName =
  "fixed right-0 top-0 z-50 flex h-full w-[20rem] flex-col border-l border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950";

const studioSubtleBlockClassName =
  "border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950";

const studioQuickAddMenuClassName =
  "workflow-quick-add-menu absolute left-1/2 z-[100] min-w-[176px] -translate-x-1/2 rounded-md border border-cyan-100 bg-white p-2 dark:border-cyan-950/40 dark:bg-slate-950";

const studioSectionTitleClassName =
  "text-[11px] font-medium text-cyan-700 dark:text-cyan-300";

interface QuickAddOption {
  type: NodeType;
  icon: React.FC<{ size?: number; className?: string }>;
  label: string;
  isBranch?: boolean;
}

const quickAddOptionIconClassName = "text-slate-500 dark:text-slate-300";

const buildQuickAddOptions = (
  canAddBranch: boolean,
  includeEnd: boolean,
): QuickAddOption[] => {
  const items: QuickAddOption[] = [
    {
      type: NodeType.APPROVAL,
      icon: UserCheck,
      label: "审批节点",
    },
    {
      type: NodeType.PARALLEL,
      icon: Layers,
      label: "会签节点",
    },
    {
      type: NodeType.NOTIFICATION,
      icon: Bell,
      label: "通知节点",
    },
    {
      type: NodeType.SCRIPT,
      icon: Code,
      label: "脚本节点",
    },
    {
      type: NodeType.TIMER,
      icon: Clock,
      label: "定时节点",
    },
    {
      type: NodeType.SUBPROCESS,
      icon: Workflow,
      label: "子流程节点",
    },
    {
      type: NodeType.MANUAL,
      icon: ClipboardCheck,
      label: "人工任务",
    },
    {
      type: NodeType.COPY,
      icon: Send,
      label: "抄送节点",
    },
  ];

  if (canAddBranch) {
    items.push({
      type: NodeType.CONDITION,
      icon: GitBranch,
      label: "条件分支",
      isBranch: true,
    });
  }

  if (includeEnd) {
    items.push({
      type: NodeType.END,
      icon: Flag,
      label: "结束节点",
    });
  }

  return items;
};

// ==================== 模板入口迁移说明 ====================

// 模板选择能力已迁移到独立的创建流程与模板中心，设计器只保留编辑能力。

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
    const userId = String(
      user.id ?? user.userId ?? user.username ?? "anonymous",
    );
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
      className={`min-h-[88px] w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition-all placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:placeholder:text-slate-500 dark:focus:border-slate-500 dark:focus:ring-slate-800 ${className || ""}`}
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
  const [roles, setRoles] = useState<any[]>(
    () => readApproverCache("ROLE") || [],
  );
  const [users, setUsers] = useState<any[]>(
    () => readApproverCache("USER") || [],
  );
  const [depts, setDepts] = useState<any[]>(
    () => readApproverCache("DEPT") || [],
  );
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
        <span className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400">
          选择角色{multiple ? "（可多选）" : ""}
        </span>
        {loading ? (
          <div className="py-2 text-center text-[11px] text-slate-400 dark:text-slate-500">
            加载中...
          </div>
        ) : (
          <>
            {roles.length > 5 && (
              <Input
                className="mb-2 h-8 text-xs"
                placeholder="搜索角色..."
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
              />
            )}
            <div className="max-h-[168px] overflow-y-auto rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
              {filtered.length === 0 ? (
                <div className="py-3 text-center text-[11px] text-slate-400 dark:text-slate-500">
                  暂无角色数据
                </div>
              ) : (
                filtered.map((r) => {
                  const isSelected = selectedValues.includes(r.roleKey);
                  return (
                    <div
                      key={r.roleId}
                      onClick={() => toggleValue(r.roleKey)}
                        className={`flex cursor-pointer items-center gap-2 px-2.5 py-1.5 text-[11px] transition-colors ${
                          isSelected
                            ? "bg-slate-100 text-slate-700 dark:bg-slate-900 dark:text-slate-100"
                            : "text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-900/80"
                        }`}
                      >
                        <div
                          className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border ${
                            isSelected
                              ? "border-slate-700 bg-slate-700 dark:border-slate-200 dark:bg-slate-200"
                              : "border-slate-300 dark:border-slate-700"
                          }`}
                        >
                        {isSelected && (
                          <span className="text-[10px] text-white dark:text-slate-900">✓</span>
                        )}
                      </div>
                      <span className="font-medium">{r.roleName}</span>
                      <span className="ml-auto text-[10px] text-slate-400 dark:text-slate-500">
                        {r.roleKey}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
            {selectedValues.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {selectedValues.map((v) => {
                  const role = roles.find((r) => r.roleKey === v);
                  return (
                    <span
                      key={v}
                      className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] text-slate-600 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-300"
                    >
                      {role?.roleName || v}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleValue(v);
                        }}
                        className="text-slate-400 hover:text-slate-700 dark:text-slate-500 dark:hover:text-slate-200"
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
        <span className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400">
          选择人员{multiple ? "（可多选）" : ""}
        </span>
        {loading ? (
          <div className="py-2 text-center text-[11px] text-slate-400 dark:text-slate-500">
            加载中...
          </div>
        ) : (
          <>
            <Input
              className="mb-2 h-8 text-xs"
              placeholder="搜索人员..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
            />
            <div className="max-h-[168px] overflow-y-auto rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
              {filtered.length === 0 ? (
                <div className="py-3 text-center text-[11px] text-slate-400 dark:text-slate-500">
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
                        className={`flex cursor-pointer items-center gap-2 px-2.5 py-1.5 text-[11px] transition-colors ${
                          isSelected
                            ? "bg-slate-100 text-slate-700 dark:bg-slate-900 dark:text-slate-100"
                            : "text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-900/80"
                        }`}
                      >
                        <div
                          className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border ${
                            isSelected
                              ? "border-slate-700 bg-slate-700 dark:border-slate-200 dark:bg-slate-200"
                              : "border-slate-300 dark:border-slate-700"
                          }`}
                        >
                        {isSelected && (
                          <span className="text-[10px] text-white dark:text-slate-900">✓</span>
                        )}
                      </div>
                      <span className="font-medium">
                        {u.nickName || u.userName}
                      </span>
                      <span className="ml-auto text-[10px] text-slate-400 dark:text-slate-500">
                        {u.userName}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
            {selectedValues.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {selectedValues.map((v) => {
                  const user = users.find((u) => String(u.userId) === v);
                  return (
                    <span
                      key={v}
                      className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] text-slate-600 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-300"
                    >
                      {user?.nickName || user?.userName || v}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleValue(v);
                        }}
                        className="text-slate-400 hover:text-slate-700 dark:text-slate-500 dark:hover:text-slate-200"
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
        <span className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400">
          选择部门{multiple ? "（可多选）" : ""}
        </span>
        {loading ? (
          <div className="py-2 text-center text-[11px] text-slate-400 dark:text-slate-500">
            加载中...
          </div>
        ) : (
          <>
            {depts.length > 5 && (
              <Input
                className="mb-2 h-8 text-xs"
                placeholder="搜索部门..."
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
              />
            )}
            <div className="max-h-[168px] overflow-y-auto rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
              {filtered.length === 0 ? (
                <div className="py-3 text-center text-[11px] text-slate-400 dark:text-slate-500">
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
                        className={`flex cursor-pointer items-center gap-2 px-2.5 py-1.5 text-[11px] transition-colors ${
                          isSelected
                            ? "bg-slate-100 text-slate-700 dark:bg-slate-900 dark:text-slate-100"
                            : "text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-900/80"
                        }`}
                      >
                        <div
                          className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border ${
                            isSelected
                              ? "border-slate-700 bg-slate-700 dark:border-slate-200 dark:bg-slate-200"
                              : "border-slate-300 dark:border-slate-700"
                          }`}
                        >
                        {isSelected && (
                          <span className="text-[10px] text-white dark:text-slate-900">✓</span>
                        )}
                      </div>
                      <span className="font-medium">{d.deptName}</span>
                    </div>
                  );
                })
              )}
            </div>
            {selectedValues.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {selectedValues.map((v) => {
                  const dept = depts.find((d) => String(d.deptId) === v);
                  return (
                    <span
                      key={v}
                      className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] text-slate-600 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-300"
                    >
                      {dept?.deptName || v}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleValue(v);
                        }}
                        className="text-slate-400 hover:text-slate-700 dark:text-slate-500 dark:hover:text-slate-200"
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
  branchCount,
  onClose,
  onUpdate,
  onDelete,
  onConfirmAction,
}: {
  node: EditableWorkflowNode;
  branchCount: number;
  onClose: () => void;
  onUpdate: (id: string, data: Partial<WorkflowGraphNode>) => void;
  onDelete: (id: string) => void;
  onConfirmAction: (message: string, onConfirm: () => void) => void;
}) => {
  const [formData, setFormData] = useState(node);
  // 当节点 ID 变化或节点内容（分支、props）变化时同步 formData
  useEffect(() => {
    setFormData(node);
  }, [node.id, branchCount, node.branchStrategy, node.props]);
  const handleChange = (field: keyof EditableWorkflowNode, value: any) => {
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
    <div className={`workflow-studio-panel ${studioSidePanelClassName}`}>
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-950">
        <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">节点设置</div>
        <button
          onClick={onClose}
          className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-500 dark:hover:bg-slate-900 dark:hover:text-slate-200"
        >
          <X size={18} />
        </button>
      </div>
      <div className="custom-scrollbar flex-1 overflow-y-auto p-4">
        <div className="mb-4 flex items-center justify-between border-b border-slate-200 pb-3 dark:border-slate-800">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
            {NODE_TYPE_LABELS[node.type] || node.type}
          </span>
          {node.type !== NodeType.START && node.type !== NodeType.END && (
            <button
              onClick={() => onDelete(node.id)}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-rose-500 transition-colors hover:bg-rose-50 hover:text-rose-600 dark:text-rose-300 dark:hover:bg-rose-950/30 dark:hover:text-rose-200"
              title="删除节点"
            >
              <Trash2 size={14} /> 删除节点
            </button>
          )}
        </div>
        <div className="space-y-3">
          <div className="space-y-2.5">
            <div className={studioSectionTitleClassName}>基础信息</div>
            <div>
              <span className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400">名称</span>
              <LazyInput
                value={formData.title}
                onChange={(val: any) => handleChange("title", val)}
                placeholder="请输入节点名称"
              />
            </div>
          </div>
          {node.type === NodeType.APPROVAL && (
            <div className="space-y-2 pt-3 border-t border-slate-100/80">
              <div className={studioSectionTitleClassName}>审批人设置</div>
              <div>
                <span className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400">
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
            </div>
          )}
          {node.type === NodeType.PARALLEL && (
            <div className="space-y-2 pt-3 border-t border-slate-100/80">
              <div className={studioSectionTitleClassName}>会签设置</div>
              {/* 会签类型选择 */}
              <div>
                <span className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400">
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
                  <span className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400">
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
                </div>
              )}
              {/* 审批人选择 - 会签场景下隐藏"指定多人"选项，因为会签本身就是多人审批 */}
              <div>
                <span className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400">
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
            </div>
          )}
          {/* P2-12: 表单编辑权限 — 适用于审批节点和人工任务节点 */}
          {(node.type === NodeType.APPROVAL ||
            node.type === NodeType.MANUAL) && (
            <div className="space-y-2 pt-3 border-t border-slate-100/80">
              <div className={studioSectionTitleClassName}>表单权限</div>
              <div className="flex items-center justify-between gap-3 border border-slate-200 px-3 py-2 dark:border-slate-800">
                <span className="text-xs font-medium text-slate-700 dark:text-slate-200">
                  允许编辑表单
                </span>
                <input
                  type="checkbox"
                  className="h-4 w-4 cursor-pointer rounded border-slate-300 text-slate-700 focus:ring-slate-400 dark:text-slate-200 dark:focus:ring-slate-600"
                  checked={formData.allowEdit || false}
                  onChange={(e) => handleChange("allowEdit", e.target.checked)}
                />
              </div>
            </div>
          )}
          {/* P2-11: SLA 超时配置 — 适用于审批节点和人工任务节点 */}
          {(node.type === NodeType.APPROVAL ||
            node.type === NodeType.MANUAL) && (
            <div className="space-y-2 pt-3 border-t border-slate-100/80">
              <div className={studioSectionTitleClassName}>SLA 超时设置</div>
              <div>
                <span className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400">
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
              </div>
              {formData.slaHours && formData.slaHours > 0 && (
                <div>
                  <span className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400">
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
            <div className="space-y-2 pt-3 border-t border-slate-100/80">
              <div className={studioSectionTitleClassName}>通知设置</div>
              <div>
                <span className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400">
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
                <span className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400">
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
                <span className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  通知内容
                </span>
                <LazyTextarea
                  className="min-h-[88px]"
                  placeholder="支持变量: ${initiator}, ${amount}, ${days} 等"
                  value={formData.props?.notificationContent || ""}
                  onChange={(val: any) =>
                    handleChange("props", {
                      ...formData.props,
                      notificationContent: val,
                    })
                  }
                />
              </div>
            </div>
          )}
          {node.type === NodeType.SCRIPT && (
            <div className="space-y-2 pt-3 border-t border-slate-100/80">
              <div className={studioSectionTitleClassName}>脚本设置</div>
              <div>
                <span className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400">
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
                  <span className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    脚本内容
                  </span>
                  <LazyTextarea
                    className="min-h-[112px] font-mono text-[11px]"
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
                </div>
              )}
              {formData.props?.scriptType === "API" && (
                <>
                  <div>
                    <span className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400">
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
                    <span className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400">
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
                    <span className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400">
                      请求头 (JSON)
                    </span>
                    <LazyTextarea
                      className="min-h-[64px] rounded-lg bg-slate-50/60 font-mono text-[11px] dark:bg-slate-950"
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
                    <span className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400">
                      请求体 (JSON)
                    </span>
                    <LazyTextarea
                      className="min-h-[64px] rounded-lg bg-slate-50/60 font-mono text-[11px] dark:bg-slate-950"
                      placeholder='{"amount": "${amount}"}'
                      value={formData.props?.apiBody || ""}
                      onChange={(val: any) =>
                        handleChange("props", {
                          ...formData.props,
                          apiBody: val,
                        })
                      }
                    />
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
            <div className="space-y-2 pt-3 border-t border-slate-100/80">
              <div className={studioSectionTitleClassName}>定时设置</div>
              <div>
                <span className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400">
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
                  <span className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400">
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
                </div>
              )}
              {formData.props?.timerType === "SCHEDULE" && (
                <div>
                  <span className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400">
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
                </div>
              )}
            </div>
          )}
          {node.type === NodeType.SUBPROCESS && (
            <div className="space-y-2 pt-3 border-t border-slate-100/80">
              <div className={studioSectionTitleClassName}>子流程设置</div>
              <div>
                <span className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400">
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
              </div>
              <div>
                <span className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  变量映射 (JSON)
                </span>
                <LazyTextarea
                  className="min-h-[88px] font-mono text-[11px]"
                  placeholder='{"subAmount": "${amount}", "subDays": "${days}"}'
                  value={formData.props?.variableMapping || ""}
                  onChange={(val: any) =>
                    handleChange("props", {
                      ...formData.props,
                      variableMapping: val,
                    })
                  }
                />
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
            <div className="space-y-2 pt-3 border-t border-slate-100/80">
              <div className={studioSectionTitleClassName}>抄送设置</div>
              <div>
                <span className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400">
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
            </div>
          )}
          {node.type === NodeType.MANUAL && (
            <div className="space-y-2 pt-3 border-t border-slate-100/80">
              <div className={studioSectionTitleClassName}>人工任务设置</div>
              <div>
                <span className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  任务描述
                </span>
                <LazyTextarea
                  className="min-h-[88px]"
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
                <span className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400">
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
              <div>
                <span className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400">
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
          {branchCount > 0 && (
            <div className="space-y-2 pt-3 border-t border-slate-100/80">
              <div className={studioSectionTitleClassName}>分支规则</div>
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
          <div className="space-y-2 pt-3 border-t border-slate-100/80">
            <div className={studioSectionTitleClassName}>条件设置</div>
            <div>
              <span className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400">
                触发条件
              </span>
              <LazyInput
                className="font-mono text-[11px]"
                placeholder="例如: amount > 5000"
                value={formData.condition || ""}
                onChange={(val: any) => handleChange("condition", val)}
              />
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
            <div className="space-y-2 pt-3 border-t border-slate-100/80 pb-3">
              <div className={studioSectionTitleClassName}>高级设置</div>

              <div className={studioSubtleBlockClassName}>
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
              </div>

              <div className={studioSubtleBlockClassName}>
                <span className="text-xs text-slate-600 font-medium mb-1 block">
                  输入映射 (Inputs JSON)
                </span>
                <LazyTextarea
                  className="min-h-[64px] rounded-lg bg-white font-mono text-[11px] dark:bg-slate-950"
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

              <div className={studioSubtleBlockClassName}>
                <span className="text-xs text-slate-600 font-medium mb-1 block">
                  输出映射 (Outputs JSON)
                </span>
                <LazyTextarea
                  className="min-h-[64px] rounded-lg bg-white font-mono text-[11px] dark:bg-slate-950"
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
        <div className="h-8 w-0.5 bg-slate-300 dark:bg-slate-700"></div>
        <ArrowDown
          size={14}
          className="-mb-1 -mt-1 text-slate-300 dark:text-slate-700"
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
        <div className="h-8 w-0.5 bg-slate-300 opacity-50 dark:bg-slate-700"></div>
        <ArrowDown
          size={14}
          className="text-slate-300 -mt-1 mb-1 opacity-50 dark:text-slate-700"
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center relative py-1">
      <div
        className={`h-10 w-0.5 transition-all ${isOver ? "bg-slate-500 dark:bg-slate-300" : "bg-slate-300 dark:bg-slate-700"}`}
      ></div>
      <div
        className={`workflow-studio-dropzone absolute left-1/2 top-1/2 z-20 flex h-8 w-28 -translate-x-1/2 -translate-y-1/2 cursor-pointer items-center justify-center gap-1.5 rounded-md border border-dashed transition-colors ${
          isOver
            ? "border-cyan-300 bg-cyan-50 dark:border-cyan-700 dark:bg-cyan-950/20"
            : "border-slate-300 bg-white hover:border-cyan-200 hover:bg-cyan-50 dark:border-slate-700 dark:bg-slate-950 dark:hover:border-cyan-800 dark:hover:bg-cyan-950/20"
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
          className={isOver ? "text-cyan-700 dark:text-cyan-200" : "text-slate-400 dark:text-slate-500"}
        />
        <span
          className={`text-[11px] font-medium ${isOver ? "text-cyan-700 dark:text-cyan-200" : "text-slate-400 dark:text-slate-500"}`}
        >
          {isOver ? "松开放置" : "拖入空位"}
        </span>
      </div>
      <ArrowDown
        size={14}
        className={`-mb-1 -mt-1 ${isOver ? "text-cyan-500 dark:text-cyan-300" : "text-slate-300 dark:text-slate-700"}`}
      />
    </div>
  );
};

interface FlowNodeActionsContextValue {
  onAddNext: (parentId: string, type?: NodeType) => void;
  onAddBranch: (parentId: string) => void;
  onSelect: (nodeId: string) => void;
  onDrop: (dragId: string, dropId: string) => void;
  onCopy: (nodeId: string) => void;
  getNode: (nodeId: string) => EditableWorkflowNode | null;
  getBranchCount: (nodeId: string) => number;
  getBranchChildIds: (nodeId: string) => string[];
  getMainTargetId: (nodeId: string) => string | null;
  setDraggingGlobal: (value: boolean) => void;
  setDraggingNodeId: (id: string | null) => void;
  setActiveQuickAddId: (id: string | null) => void;
  setHoveredNodeId: (id: string | null) => void;
}

const noop = () => {};
const flowNodeActionsFallback: FlowNodeActionsContextValue = {
  onAddNext: noop,
  onAddBranch: noop,
  onSelect: noop as (nodeId: string) => void,
  onDrop: noop as (dragId: string, dropId: string) => void,
  onCopy: noop as (nodeId: string) => void,
  getNode: () => null,
  getBranchCount: () => 0,
  getBranchChildIds: () => [],
  getMainTargetId: () => null,
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
  nodeId,
  invalidNodes,
  draggingNodeId,
  isDraggingGlobal,
  activeQuickAddId,
  hoveredNodeId,
  selectedNodeId,
  isInsideBranch,
}: {
  nodeId: string;
  invalidNodes: string[];
  draggingNodeId: string | null;
  isDraggingGlobal: boolean;
  activeQuickAddId: string | null;
  hoveredNodeId: string | null;
  selectedNodeId: string | null;
  isInsideBranch: boolean;
}) => {
  const actions = React.useContext(FlowNodeActionsContext);
  const displayNode = actions.getNode(nodeId);
  const branchChildIds = actions.getBranchChildIds(nodeId);
  const branchCount = branchChildIds.length || actions.getBranchCount(nodeId);
  const nextNodeId = actions.getMainTargetId(nodeId);
  const nextDisplayNode = nextNodeId ? actions.getNode(nextNodeId) : null;
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

  // 判断能否添加条件分支
  const canAddBranch =
    displayNode.type !== NodeType.PARALLEL ||
    (displayNode.signType &&
      !["ALL", "ANY", "PERCENT", "SEQUENTIAL"].includes(
        String(displayNode.signType),
      ));
  const nodeMetaText = getNodeMetaText(displayNode, branchCount);
  const nodeAssigneeSummary = getNodeAssigneeSummary(displayNode);

  return (
    <div className="flex flex-col items-center relative group/node">
      {/* 节点卡片容器 - 独立的相对定位容器 */}
      <div className={`relative group ${showQuickAdd ? "z-50" : ""}`}>
        {/* 节点卡片 */}
        <div
          className={`workflow-node-card relative z-10 w-[13rem] cursor-pointer rounded-md border transition-colors duration-150 ${visual.bg} ${
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
            actions.setActiveQuickAddId(null);
          }}
          onMouseEnter={() => canShowHover && actions.setHoveredNodeId(nodeId)}
          onMouseLeave={() => canShowHover && actions.setHoveredNodeId(null)}
          draggable={canDrag}
          onDragStart={(e) => {
            e.dataTransfer.setData("nodeId", nodeId);
            e.dataTransfer.effectAllowed = "move";
            setIsDragging(true);
            actions.setDraggingGlobal(true);
            actions.setDraggingNodeId(nodeId);
          }}
          onDragEnd={() => {
            setIsDragging(false);
            actions.setDraggingGlobal(false);
            actions.setDraggingNodeId(null);
          }}
        >
          <div className="p-3">
            <div className="flex items-start gap-2">
              <div
                className="mt-0.5 flex h-6.5 w-6.5 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950"
              >
                <NIcon size={14} className={visual.iconColor} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-slate-700 dark:text-slate-100">
                      {displayNode.title}
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

        {/* END节点的添加按钮 - 在节点上方，稍微拉开距离防止挡住上面的线和卡片 */}
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
                  actions.setActiveQuickAddId(showQuickAdd ? null : nodeId);
                }}
                onMouseEnter={() =>
                  canShowHover && actions.setHoveredNodeId(nodeId)
                }
                onMouseLeave={() =>
                  canShowHover &&
                  !showQuickAdd &&
                  actions.setHoveredNodeId(null)
                }
                className={`flex h-7 w-7 items-center justify-center rounded-md border transition-colors ${
                  showQuickAdd
                    ? "border-cyan-600 bg-cyan-600 text-white dark:border-cyan-400 dark:bg-cyan-500 dark:text-white"
                    : "border-slate-200 bg-white text-slate-500 hover:border-cyan-200 hover:text-cyan-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-400 dark:hover:border-cyan-800 dark:hover:text-cyan-200"
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
                    actions.setHoveredNodeId(nodeId); // 强制保持当前节点的 hover 状态
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
                  {buildQuickAddOptions(canAddBranch, false).map((item) => {
                    const ItemIcon = item.icon;
                    return (
                      <button
                        key={item.type}
                        className="mb-1 flex w-full items-center gap-2 rounded-md border border-transparent px-2 py-1.5 text-left transition-colors hover:bg-cyan-50 dark:hover:bg-cyan-950/20"
                        onClick={(e) => {
                          e.stopPropagation();
                          if ("isBranch" in item && item.isBranch) {
                            actions.onAddBranch(nodeId);
                          } else {
                            actions.onAddNext(nodeId, item.type as NodeType);
                          }
                          actions.setActiveQuickAddId(null);
                        }}
                      >
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-cyan-100 bg-cyan-50 dark:border-cyan-950/40 dark:bg-cyan-950/20">
                          <ItemIcon size={14} className={quickAddOptionIconClassName} />
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

        {/* 非END节点的添加按钮 - 在节点卡片下方 */}
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
                  actions.setActiveQuickAddId(showQuickAdd ? null : nodeId);
                }}
                onMouseEnter={() =>
                  canShowHover && actions.setHoveredNodeId(nodeId)
                }
                onMouseLeave={() =>
                  canShowHover &&
                  !showQuickAdd &&
                  actions.setHoveredNodeId(null)
                }
                className={`flex h-7 w-7 items-center justify-center rounded-md border transition-colors ${
                  showQuickAdd
                    ? "border-cyan-600 bg-cyan-600 text-white dark:border-cyan-400 dark:bg-cyan-500 dark:text-white"
                    : "border-slate-200 bg-white text-slate-500 hover:border-cyan-200 hover:text-cyan-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-400 dark:hover:border-cyan-800 dark:hover:text-cyan-200"
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
                    actions.setHoveredNodeId(nodeId); // 强制保持当前节点的 hover 状态
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
                  {buildQuickAddOptions(canAddBranch, true).map((item) => {
                    const ItemIcon = item.icon;
                    return (
                      <button
                        key={item.type}
                        className="mb-1 flex w-full items-center gap-2 rounded-md border border-transparent px-2 py-1.5 text-left transition-colors hover:bg-cyan-50 dark:hover:bg-cyan-950/20"
                        onClick={(e) => {
                          e.stopPropagation();
                          if ("isBranch" in item && item.isBranch) {
                            actions.onAddBranch(nodeId);
                          } else {
                            actions.onAddNext(nodeId, item.type as NodeType);
                          }
                          actions.setActiveQuickAddId(null);
                        }}
                      >
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-cyan-100 bg-cyan-50 dark:border-cyan-950/40 dark:bg-cyan-950/20">
                          <ItemIcon size={14} className={quickAddOptionIconClassName} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium text-slate-700 dark:text-slate-100">
                            {item.label}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                  <div className="mt-2 border-t border-slate-100 pt-2 dark:border-slate-800">
                    <button
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-slate-600 transition-colors hover:bg-cyan-50 hover:text-cyan-700 dark:text-slate-300 dark:hover:bg-cyan-950/20 dark:hover:text-cyan-200"
                      onClick={(e) => {
                        e.stopPropagation();
                        actions.onCopy(nodeId);
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
      {branchChildIds.length > 0 && (
        <div className="flex flex-col items-center w-full mt-6 flex-none">
          {/* 从父节点到分支点的垂直连接线 */}
          <div className="h-6 w-0.5 bg-slate-300 dark:bg-slate-700"></div>

          {/* 分支点 - 菱形指示器 */}
          <div className="z-10 -mb-[1px] h-2.5 w-2.5 rotate-45 border border-slate-300 bg-slate-100 dark:border-slate-700 dark:bg-slate-900"></div>

          {/* 分支容器 */}
          <div className="flex gap-12 relative pt-6 text-center w-full justify-center">
            {/* 顶部的水平连接线 - 连接所有分支的开始端 */}
            <div
              className="absolute top-0 left-0 right-0 h-0.5 bg-slate-300 dark:bg-slate-700"
              style={{
                left: `${100 / branchChildIds.length / 2}%`,
                right: `${100 / branchChildIds.length / 2}%`,
              }}
            ></div>

            {branchChildIds.map((branchId, index) => (
              <div
                key={branchId}
                className="flex flex-col items-center relative w-full"
              >
                {/* 从顶部水平线往下的垂线 */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-0.5 h-6 bg-slate-300 dark:bg-slate-700 -mt-6"></div>

                {/* 分支入口小标签 */}
                <div className="absolute -top-10 left-1/2 -translate-x-1/2 z-10">
                  <div className="whitespace-nowrap text-[10px] font-medium text-slate-500 dark:text-slate-400">
                    分支 {index + 1}
                  </div>
                </div>

                {/* 节点渲染区块 - 给它包裹 flex-none 保证子节点自然内容高，不被 stretch */}
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

                {/* 关键修复：底部自动填充延长线，利用 flex-1。如果本分支内容较短，这就自动把剩下的高度拉满，延展下垂线以合并入底部主干横线！ */}
                <div className="w-0.5 min-h-[40px] bg-slate-300 flex-1 dark:bg-slate-700"></div>
              </div>
            ))}

            {/* 底部的闭合水平连接线 - 同步汇合所有的下边沿延长线 */}
            <div
              className="absolute bottom-0 left-0 right-0 h-0.5 bg-slate-300 dark:bg-slate-700"
              style={{
                left: `${100 / branchChildIds.length / 2}%`,
                right: `${100 / branchChildIds.length / 2}%`,
              }}
            ></div>
          </div>

          {/* 汇合点：表示所有并行支路收束为一，完美接上后方的流程 */}
          <div className="w-3 h-3 bg-white border-2 border-slate-300 rounded-full z-10 -mt-1.5 dark:border-slate-700 dark:bg-slate-950"></div>
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

      {/* 结束节点: 因为添加节点永远是在被点加号的节点"后面"插入，如果是END节点，则是特例插入到END之前，所以连线也得对应过去 */}
      {nextNodeId && nextDisplayNode?.type === NodeType.END && (
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

// ==================== 校验 ====================

function validateWorkflowGraph(graph: WorkflowGraphDefinition): {
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

  const isDefaultEdge = (edge: WorkflowGraphEdge): boolean => {
    const raw: unknown = edge.isDefault;
    if (typeof raw === "boolean") return raw;
    if (typeof raw === "number") return raw !== 0;
    if (typeof raw === "string") {
      const normalized = raw.trim().toLowerCase();
      return (
        normalized === "true" ||
        normalized === "1" ||
        normalized === "yes" ||
        normalized === "y"
      );
    }
    return false;
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

  // 先完成节点索引和唯一性校验。
  const nodeMap = new Map<string, WorkflowGraphNode>();
  const outgoing = new Map<string, WorkflowGraphEdge[]>();
  const incoming = new Map<string, WorkflowGraphEdge[]>();

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
      const scriptType = props.scriptType;
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
    <div className={`workflow-studio-panel ${studioSidePanelClassName}`}>
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-950">
        <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">全局属性</div>
        <button
          onClick={onClose}
          className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-500 dark:hover:bg-slate-900 dark:hover:text-slate-200"
        >
          <X size={18} />
        </button>
      </div>
      <div className="custom-scrollbar flex-1 overflow-y-auto p-4">
        <div className="space-y-3">
          <div className="space-y-2.5">
            <div className={studioSectionTitleClassName}>基础信息</div>

            <div>
              <span className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400">
                流程描述
              </span>
              <LazyTextarea
                className="min-h-[88px]"
                placeholder="请输入流程描述"
                value={formData.description || ""}
                onChange={(val: string) => handleChange("description", val)}
              />
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <span className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  流程分类
                </span>
                <Select
                  value={formData.category || CATEGORY_NONE_VALUE}
                  onValueChange={(v) =>
                    handleChange("category", v === CATEGORY_NONE_VALUE ? "" : v)
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="请选择分类" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={CATEGORY_NONE_VALUE}>未分类</SelectItem>
                    {WORKFLOW_CATEGORY_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <span className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  关联表单
                </span>
                <LazyInput
                  placeholder="form_leave_01"
                  value={formData.formId || ""}
                  onChange={(val: string) => handleChange("formId", val)}
                />
              </div>
            </div>

            <div>
              <span className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400">
                流程标签
              </span>
              <LazyInput
                placeholder="多个标签用逗号分隔"
                value={formData.tags || ""}
                onChange={(val: string) => handleChange("tags", val)}
              />
            </div>
          </div>

          <div className="space-y-2 pt-3 border-t border-slate-100/80">
            <div className={studioSectionTitleClassName}>发起权限</div>
            <div>
              <span className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400">
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
  onOpenGlobalConfig: () => void;
  onOpenSettings: () => void;
  onViewVersionHistory?: () => void;
  onExport?: () => void;
  saving: boolean;
}) => {
  return (
    <div className="workflow-studio-toolbar relative z-20 flex min-h-[56px] shrink-0 flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white px-4 py-2 dark:border-slate-800 dark:bg-slate-950">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Input
            className="h-8 w-48 max-w-full rounded-md border-slate-200 bg-white px-3 text-sm font-medium shadow-none dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
            value={workflowName}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="流程名称"
          />
          <Input
            className="h-8 w-36 max-w-full rounded-md border-slate-200 bg-white px-3 font-mono text-[11px] shadow-none dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
            value={workflowKey}
            onChange={(e) => onKeyChange(e.target.value)}
            placeholder="流程 Key"
          />
        </div>
      </div>
      <div className="flex min-w-0 shrink-0 flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onOpenSettings}
          className="shrink-0 whitespace-nowrap"
        >
          流程设置
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onOpenGlobalConfig}
          className="shrink-0 whitespace-nowrap"
        >
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
              className="shrink-0 whitespace-nowrap"
              title="查看版本历史"
            >
              版本历史
            </Button>
          )}
        {/* 导出按钮 - 仅在流程已保存时显示 */}
        {workflowId && !workflowId.startsWith("new_") && onExport && (
          <Button
            variant="outline"
            size="sm"
            onClick={onExport}
            className="shrink-0 whitespace-nowrap"
            title="导出流程"
          >
            导出
          </Button>
        )}
        <div className="flex shrink-0 items-center gap-1 rounded-md border border-slate-200 bg-white p-1 dark:border-slate-800 dark:bg-slate-950">
          <Button
            variant="ghost"
            size="icon"
            onClick={onUndo}
            disabled={!canUndo}
            className={`h-7 w-7 rounded-md p-0 ${!canUndo ? "cursor-not-allowed text-slate-300 dark:text-slate-700" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100"}`}
            title="撤销 (Ctrl+Z)"
          >
            <Undo2 size={16} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onRedo}
            disabled={!canRedo}
            className={`h-7 w-7 rounded-md p-0 ${!canRedo ? "cursor-not-allowed text-slate-300 dark:text-slate-700" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100"}`}
            title="重做 (Ctrl+Y)"
          >
            <Redo2 size={16} />
          </Button>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={onSave}
          disabled={saving}
          className="shrink-0 gap-1.5 whitespace-nowrap"
        >
          {saving ? (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-700 border-t-transparent dark:border-slate-200 dark:border-t-transparent"></div>
          ) : null}
          {saving ? "保存中..." : "保存"}
        </Button>
        <Button
          size="sm"
          onClick={onDeploy}
          disabled={saving}
          className="shrink-0 gap-1.5 whitespace-nowrap"
        >
          {saving ? (
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
          ) : null}
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
    undo,
    redo,
    canUndo,
    canRedo,
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

  // 用 ref 保存最新 graphModel，避免回调闭包读取到旧状态。
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
      graph: graphModel,
      name: workflowName,
      key: workflowKey,
      ...buildSettingsState(),
    };
  }, [graphModel, workflowName, workflowKey, buildSettingsState]);

  const initializedRef = useRef(false);

  // P1: 从 workflow 对象初始化流程设置状态，并在切换流程时重置画布状态
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
        if (selectedGraphNode && selectedGraphNode.type !== NodeType.START) {
          e.preventDefault(); // 防止 Backspace 导致页面回退
          handleDeleteNode(selectedGraphNode.id);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [canUndo, canRedo, undo, redo, selectedGraphNode]);

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
  const handleAddNext = (parentId: string, type?: NodeType) => {
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

      const incomingEdge = graph.edges.find((edge) => edge.target === targetId);
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
    });

    const applyInsert = (
      graph: WorkflowGraphDefinition,
      successMessage?: string,
    ) => {
      // 当落点是 END 时，实际应插入到 END 的前驱和 END 之间
      const anchorId = resolveAnchorId(graph, parentId);
      if (!anchorId) {
        toast.error("无法在当前位置添加节点");
        return;
      }

      const nextGraph =
        nodeType === NodeType.END
          ? replaceWorkflowGraphNextNode(graph, anchorId, buildNewNode())
          : insertWorkflowGraphNodeAfter(graph, anchorId, buildNewNode());
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
  };
  const handleAddBranch = (targetId: string) => {
    const currentGraph = graphModelRef.current;
    let parentId = targetId;
    let parentNode = findWorkflowGraphNode(currentGraph, targetId);

    // 修复：如果是在 END 节点上方的 + 点击添加分支，实际应当挂到 END 的前置父节点上
    if (parentNode?.type === NodeType.END) {
      const endParentId = findWorkflowGraphParentNodeId(currentGraph, targetId);
      if (endParentId) {
        parentId = endParentId;
        parentNode = findWorkflowGraphNode(currentGraph, endParentId);
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
  };
  const handleUpdateNode = (id: string, data: Partial<WorkflowGraphNode>) => {
    const nextGraph = patchWorkflowGraphNode(graphModelRef.current, id, data);
    applyGraphChange(nextGraph);
  };

  const handleDeleteNode = (id: string) => {
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
      setConfirmDialog({
        open: true,
        message: `您即将删除整个条件分支，该分支下的所有节点也将一并被删除，是否继续？`,
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

    const nextGraph = removeWorkflowGraphNode(graphModelRef.current, id);
    applyGraphChange(nextGraph, {
      clearSelection: true,
      successMessage: "节点已删除",
    });
  };
  const handleDrop = (dragId: string, dropId: string) => {
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
  };
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

  const handleSave = async () => {
    const { errors, errorNodes } = validateWorkflowGraph(graphModel);
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
    const { errors, errorNodes } = validateWorkflowGraph(graphModel);
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

  // 查看版本历史
  const handleViewVersionHistory = async () => {
    if (currentWorkflowId && !currentWorkflowId.startsWith("new_")) {
      // 在跳转前静默保存当前合法的更改，确保版本历史中包含最新状态
      const { errors } = validateWorkflowGraph(graphModel);
      const isNameValid = workflowName && workflowName.trim() !== "";
      const isKeyValid = workflowKey && /^[a-zA-Z0-9_]+$/.test(workflowKey);

      if (errors.length === 0 && isNameValid && isKeyValid) {
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
        } catch (error) {
          console.error("查看历史前保存失败:", error);
        } finally {
          setSaving(false);
        }
      }

      navigate(`/workflow/versions/${currentWorkflowId}`);
    }
  };

  // 导出流程
  const handleExport = async () => {
    if (!workflow?.id || workflow.id.startsWith("new_")) {
      toast.error("请先保存流程后再导出");
      return;
    }

    // 在导出前静默保存当前合法的更改，确保导出的是最新状态
    const { errors } = validateWorkflowGraph(graphModel);
    const isNameValid = workflowName && workflowName.trim() !== "";
    const isKeyValid = workflowKey && /^[a-zA-Z0-9_]+$/.test(workflowKey);

    if (errors.length === 0 && isNameValid && isKeyValid) {
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
      } catch (error) {
        console.error("导出前保存失败:", error);
      } finally {
        setSaving(false);
      }
    }

    try {
      // 统一走 request 客户端，确保携带认证信息与统一错误处理
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

  const flowNodeActions = useMemo<FlowNodeActionsContextValue>(
    () => ({
      onAddNext: handleAddNext,
      onAddBranch: handleAddBranch,
      onSelect: (nodeId) => {
        setSelectedNodeId(nodeId);
        setShowGlobalConfig(false);
      },
      onDrop: handleDrop,
      onCopy: handleCopyNode,
      getNode: (nodeId) => {
        const node = findWorkflowGraphNode(graphModelRef.current, nodeId);
        return node ? toEditableWorkflowNode(node) : null;
      },
      getBranchCount: (nodeId) =>
        countWorkflowGraphBranches(graphModelRef.current, nodeId),
      getBranchChildIds: (nodeId) =>
        getWorkflowGraphBranchChildIds(graphModelRef.current, nodeId),
      getMainTargetId: (nodeId) =>
        findWorkflowGraphMainTargetId(graphModelRef.current, nodeId),
      setDraggingGlobal,
      setDraggingNodeId,
      setActiveQuickAddId,
      setHoveredNodeId,
    }),
    [handleAddBranch, handleAddNext, handleCopyNode, handleDrop],
  );

  return (
    <FlowNodeActionsContext.Provider value={flowNodeActions}>
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
          saving={saving}
        />

        {/* 画布 */}
        <div
          ref={canvasRef}
          className={`workflow-studio-canvas relative flex flex-1 justify-center overflow-hidden bg-slate-50/60 p-4 transition-all duration-300 ease-out dark:bg-slate-950 ${isPanning ? "cursor-grabbing" : "cursor-default"} ${selectedGraphNode ? "mr-[24rem]" : ""}`}
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
            setSelectedNodeId(null);
          }}
        >
          {/* 动态网格背景，随漫游移动 */}
          <div
            className="absolute inset-0 pointer-events-none workflow-studio-grid"
            style={{
              background:
                "radial-gradient(rgba(148,163,184,0.22) 0.8px, transparent 0.8px)",
              backgroundSize: "24px 24px",
              backgroundPosition: `${panOrigin.x}px ${panOrigin.y}px`,
            }}
          />

          {/* 缩放控件 */}
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

          {/* 拖拽全局提示 */}
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

        {/* 属性面板 */}
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

        {/* 全局属性面板 */}
        <GlobalPropertyPanel
          open={showGlobalConfig}
          onClose={() => setShowGlobalConfig(false)}
          workflow={globalConfig}
          onUpdate={handleGlobalConfigUpdate}
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
          availableForms={availableForms}
          availableRoles={availableRoles}
          availableUsers={availableUsers?.map((user) => ({
            userId: Number(user.id) || undefined,
            userName: user.username || user.name,
            nickName: user.name,
          }))}
          onSave={handleSettingsSave}
        />

        {/* 确认对话框 */}
        <ConfirmDialog
          open={confirmDialog.open}
          title="确认操作"
          message={confirmDialog.message}
          confirmText="确定"
          cancelText="取消"
          onConfirm={() => {
            confirmDialog.onConfirm();
            setConfirmDialog({ open: false, message: "", onConfirm: () => {} });
          }}
          onCancel={() =>
            setConfirmDialog({ open: false, message: "", onConfirm: () => {} })
          }
        />
      </div>
    </FlowNodeActionsContext.Provider>
  );
};

