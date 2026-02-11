import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Plus, Settings, Trash2, ChevronRight, 
  GitBranch, GitMerge, FileText, CheckCircle2, 
  ArrowDown, Copy, PlayCircle,
  Undo2, Redo2, Save, UploadCloud, ZoomIn, ZoomOut, Maximize2,
  Flag, Layers, Sparkles, FileCheck,
  DollarSign, Calendar, X,
  Move, UserCheck, ClipboardList,
  Briefcase, Car, Plane, Stamp, ShieldCheck, Server,
  GraduationCap, Heart, Building2, Wrench, Package,
  UserPlus, UserMinus, Award, CreditCard, PiggyBank,
  Rocket, CheckSquare, Stethoscope, BookOpen,
  Bell, Code, Clock, Workflow, ClipboardCheck
} from 'lucide-react';
import { WorkflowNode, NodeType, WorkflowDefinition, FormDefinition, User } from '../types';
import { useHistory } from '../hooks/useHistory';
import { saveProcessDefinition, deployProcessDefinition } from '../services/api/workflow';
import { toast } from 'sonner';
import { ConfirmDialog } from './ui/ConfirmDialog';

// ==================== 辅助函数 ====================

const updateNodeInTree = (
  root: WorkflowNode, targetId: string, updater: (node: WorkflowNode) => WorkflowNode
): WorkflowNode => {
  if (root.id === targetId) return updater(root);
  const newRoot = { ...root };
  if (newRoot.next) newRoot.next = updateNodeInTree(newRoot.next, targetId, updater);
  if (newRoot.branches) newRoot.branches = newRoot.branches.map(b => updateNodeInTree(b, targetId, updater));
  return newRoot;
};

const findNodeById = (root: WorkflowNode, targetId: string): WorkflowNode | null => {
  if (root.id === targetId) return root;
  if (root.next) { const f = findNodeById(root.next, targetId); if (f) return f; }
  if (root.branches) { for (const b of root.branches) { const f = findNodeById(b, targetId); if (f) return f; } }
  return null;
};

const deleteNodeInTree = (root: WorkflowNode, targetId: string): WorkflowNode | null => {
  if (root.id === targetId) return root.next || null;
  const newRoot = { ...root };
  if (newRoot.next) { const res = deleteNodeInTree(newRoot.next, targetId); newRoot.next = res || undefined; }
  if (newRoot.branches) {
    const nb: WorkflowNode[] = [];
    for (const b of newRoot.branches) { const res = deleteNodeInTree(b, targetId); if (res) nb.push(res); }
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

// ==================== 常量配置 ====================

const NODE_TYPE_LABELS: Record<string, string> = {
  [NodeType.START]: '开始', [NodeType.APPROVAL]: '审批',
  [NodeType.CONDITION]: '条件判断', [NodeType.PARALLEL]: '同时处理', [NodeType.END]: '完成',
  [NodeType.NOTIFICATION]: '通知', [NodeType.SCRIPT]: '脚本',
  [NodeType.TIMER]: '定时', [NodeType.SUBPROCESS]: '子流程', [NodeType.MANUAL]: '人工任务'
};

const APPROVER_TYPE_LABELS: Record<string, string> = {
  ROLE: '按角色', USER: '指定人员', DEPT_MANAGER: '部门负责人', DIRECT_LEADER: '直属上级'
};

const BRANCH_STRATEGY_LABELS: Record<string, string> = {
  EXCLUSIVE: '单选分支', PARALLEL: '并行处理', RACE: '竞争模式'
};

// 节点类型视觉配置
const NODE_VISUAL: Record<string, {
  icon: React.FC<{ size?: number; className?: string }>;
  color: string; bg: string; iconBg: string; iconColor: string;
  border: string; hoverBorder: string; label: string;
}> = {
  [NodeType.START]: {
    icon: PlayCircle, color: 'bg-emerald-500', bg: 'bg-emerald-50/80',
    iconBg: 'bg-emerald-100', iconColor: 'text-emerald-600',
    border: 'border-emerald-200', hoverBorder: 'hover:border-emerald-400', label: '开始'
  },
  [NodeType.APPROVAL]: {
    icon: UserCheck, color: 'bg-indigo-500', bg: 'bg-white',
    iconBg: 'bg-indigo-100', iconColor: 'text-indigo-600',
    border: 'border-indigo-200', hoverBorder: 'hover:border-indigo-400', label: '审批'
  },
  [NodeType.CONDITION]: {
    icon: GitBranch, color: 'bg-amber-500', bg: 'bg-amber-50/80',
    iconBg: 'bg-amber-100', iconColor: 'text-amber-600',
    border: 'border-amber-200', hoverBorder: 'hover:border-amber-400', label: '条件'
  },
  [NodeType.PARALLEL]: {
    icon: Layers, color: 'bg-violet-500', bg: 'bg-violet-50/80',
    iconBg: 'bg-violet-100', iconColor: 'text-violet-600',
    border: 'border-violet-200', hoverBorder: 'hover:border-violet-400', label: '并行'
  },
  [NodeType.END]: {
    icon: Flag, color: 'bg-slate-700', bg: 'bg-slate-50/80',
    iconBg: 'bg-slate-200', iconColor: 'text-slate-600',
    border: 'border-slate-300', hoverBorder: 'hover:border-slate-500', label: '完成'
  },
  [NodeType.NOTIFICATION]: {
    icon: Bell, color: 'bg-blue-500', bg: 'bg-blue-50/80',
    iconBg: 'bg-blue-100', iconColor: 'text-blue-600',
    border: 'border-blue-200', hoverBorder: 'hover:border-blue-400', label: '通知'
  },
  [NodeType.SCRIPT]: {
    icon: Code, color: 'bg-green-500', bg: 'bg-green-50/80',
    iconBg: 'bg-green-100', iconColor: 'text-green-600',
    border: 'border-green-200', hoverBorder: 'hover:border-green-400', label: '脚本'
  },
  [NodeType.TIMER]: {
    icon: Clock, color: 'bg-orange-500', bg: 'bg-orange-50/80',
    iconBg: 'bg-orange-100', iconColor: 'text-orange-600',
    border: 'border-orange-200', hoverBorder: 'hover:border-orange-400', label: '定时'
  },
  [NodeType.SUBPROCESS]: {
    icon: Workflow, color: 'bg-purple-500', bg: 'bg-purple-50/80',
    iconBg: 'bg-purple-100', iconColor: 'text-purple-600',
    border: 'border-purple-200', hoverBorder: 'hover:border-purple-400', label: '子流程'
  },
  [NodeType.MANUAL]: {
    icon: ClipboardCheck, color: 'bg-cyan-500', bg: 'bg-cyan-50/80',
    iconBg: 'bg-cyan-100', iconColor: 'text-cyan-600',
    border: 'border-cyan-200', hoverBorder: 'hover:border-cyan-400', label: '人工'
  }
};

const getNodeVisual = (type: string) => NODE_VISUAL[type] || NODE_VISUAL[NodeType.APPROVAL];

// ==================== 预设模板 ====================

interface WorkflowTemplate {
  id: string; name: string; description: string; category: string;
  icon: React.FC<{ size?: number; className?: string }>; color: string; nodes: WorkflowNode;
}

const TEMPLATE_CATEGORIES = [
  { id: 'all', label: '全部' },
  { id: 'office', label: '行政办公' },
  { id: 'finance', label: '财务' },
  { id: 'hr', label: '人事' },
  { id: 'sales', label: '销售业务' },
  { id: 'it', label: 'IT运维' },
  { id: 'industry', label: '行业专属' },
  { id: 'other', label: '其他' },
];

const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  // ===== 行政办公 =====
  {
    id: 'leave', name: '请假审批', description: '员工提交 → 部门经理审批 → 完成', category: 'office',
    icon: Calendar, color: 'text-blue-500 bg-blue-50',
    nodes: { id: 'start', type: NodeType.START, title: '提交请假', next: {
      id: 'n1', type: NodeType.APPROVAL, title: '部门经理审批', approverType: 'DEPT_MANAGER',
      next: { id: 'end', type: NodeType.END, title: '流程结束' }
    }}
  },
  {
    id: 'contract', name: '合同审批', description: '起草 → 法务审核 → 总经理签发 → 盖章归档', category: 'office',
    icon: FileCheck, color: 'text-violet-500 bg-violet-50',
    nodes: { id: 'start', type: NodeType.START, title: '起草合同', next: {
      id: 'n1', type: NodeType.APPROVAL, title: '法务审核', approverType: 'ROLE', approverValue: 'LEGAL', next: {
        id: 'n2', type: NodeType.APPROVAL, title: '总经理签发', approverType: 'ROLE', approverValue: 'MANAGER', next: {
          id: 'n3', type: NodeType.APPROVAL, title: '盖章归档', approverType: 'ROLE', approverValue: 'ADMIN',
          next: { id: 'end', type: NodeType.END, title: '流程结束' }
        }
      }
    }}
  },
  {
    id: 'seal', name: '用印申请', description: '申请用印 → 部门审批 → 行政盖章 → 完成', category: 'office',
    icon: Stamp, color: 'text-rose-500 bg-rose-50',
    nodes: { id: 'start', type: NodeType.START, title: '申请用印', next: {
      id: 'n1', type: NodeType.APPROVAL, title: '部门经理审批', approverType: 'DEPT_MANAGER', next: {
        id: 'n2', type: NodeType.APPROVAL, title: '行政盖章', approverType: 'ROLE', approverValue: 'ADMIN',
        next: { id: 'end', type: NodeType.END, title: '流程结束' }
      }
    }}
  },
  {
    id: 'travel', name: '出差申请', description: '提交出差 → 部门审批 → 总经理审批 → 完成', category: 'office',
    icon: Plane, color: 'text-sky-500 bg-sky-50',
    nodes: { id: 'start', type: NodeType.START, title: '提交出差申请', next: {
      id: 'n1', type: NodeType.APPROVAL, title: '部门经理审批', approverType: 'DEPT_MANAGER', next: {
        id: 'n2', type: NodeType.APPROVAL, title: '总经理审批', approverType: 'ROLE', approverValue: 'MANAGER',
        next: { id: 'end', type: NodeType.END, title: '流程结束' }
      }
    }}
  },
  {
    id: 'vehicle', name: '用车申请', description: '申请用车 → 行政审批 → 车辆调度 → 完成', category: 'office',
    icon: Car, color: 'text-teal-500 bg-teal-50',
    nodes: { id: 'start', type: NodeType.START, title: '申请用车', next: {
      id: 'n1', type: NodeType.APPROVAL, title: '行政审批', approverType: 'ROLE', approverValue: 'ADMIN', next: {
        id: 'n2', type: NodeType.APPROVAL, title: '车辆调度确认', approverType: 'ROLE', approverValue: 'ADMIN',
        next: { id: 'end', type: NodeType.END, title: '流程结束' }
      }
    }}
  },
  // ===== 财务 =====
  {
    id: 'reimbursement', name: '报销审批', description: '提交报销 → 部门经理 → 财务审核 → 完成', category: 'finance',
    icon: DollarSign, color: 'text-emerald-500 bg-emerald-50',
    nodes: { id: 'start', type: NodeType.START, title: '提交报销', next: {
      id: 'n1', type: NodeType.APPROVAL, title: '部门经理审批', approverType: 'DEPT_MANAGER', next: {
        id: 'n2', type: NodeType.APPROVAL, title: '财务审核', approverType: 'ROLE', approverValue: 'FINANCE',
        next: { id: 'end', type: NodeType.END, title: '流程结束' }
      }
    }}
  },
  {
    id: 'purchase', name: '采购审批', description: '提交采购 → 金额判断 → 分级审批 → 完成', category: 'finance',
    icon: ClipboardList, color: 'text-orange-500 bg-orange-50',
    nodes: { id: 'start', type: NodeType.START, title: '提交采购申请', next: {
      id: 'n1', type: NodeType.APPROVAL, title: '部门经理审批', approverType: 'DEPT_MANAGER',
      branches: [
        { id: 'b1', type: NodeType.CONDITION, title: '金额 ≤ 5000', condition: 'amount <= 5000' },
        { id: 'b2', type: NodeType.CONDITION, title: '金额 > 5000', condition: 'amount > 5000',
          next: { id: 'n2', type: NodeType.APPROVAL, title: '总经理审批', approverType: 'ROLE', approverValue: 'MANAGER' }
        }
      ],
      branchStrategy: 'EXCLUSIVE',
      next: { id: 'end', type: NodeType.END, title: '流程结束' }
    }}
  },
  {
    id: 'payment', name: '付款申请', description: '提交付款 → 财务审核 → 总经理审批 → 出纳付款', category: 'finance',
    icon: CreditCard, color: 'text-pink-500 bg-pink-50',
    nodes: { id: 'start', type: NodeType.START, title: '提交付款申请', next: {
      id: 'n1', type: NodeType.APPROVAL, title: '财务审核', approverType: 'ROLE', approverValue: 'FINANCE', next: {
        id: 'n2', type: NodeType.APPROVAL, title: '总经理审批', approverType: 'ROLE', approverValue: 'MANAGER', next: {
          id: 'n3', type: NodeType.APPROVAL, title: '出纳付款', approverType: 'ROLE', approverValue: 'FINANCE',
          next: { id: 'end', type: NodeType.END, title: '流程结束' }
        }
      }
    }}
  },
  {
    id: 'budget', name: '预算审批', description: '编制预算 → 部门审核 → 财务审核 → 总经理批准', category: 'finance',
    icon: PiggyBank, color: 'text-amber-500 bg-amber-50',
    nodes: { id: 'start', type: NodeType.START, title: '编制预算', next: {
      id: 'n1', type: NodeType.APPROVAL, title: '部门负责人审核', approverType: 'DEPT_MANAGER', next: {
        id: 'n2', type: NodeType.APPROVAL, title: '财务部审核', approverType: 'ROLE', approverValue: 'FINANCE', next: {
          id: 'n3', type: NodeType.APPROVAL, title: '总经理批准', approverType: 'ROLE', approverValue: 'MANAGER',
          next: { id: 'end', type: NodeType.END, title: '流程结束' }
        }
      }
    }}
  },
  // ===== 人事 =====
  {
    id: 'onboarding', name: '入职审批', description: '提交入职 → HR审核 → 部门确认 → IT开通账号', category: 'hr',
    icon: UserPlus, color: 'text-green-500 bg-green-50',
    nodes: { id: 'start', type: NodeType.START, title: '提交入职申请', next: {
      id: 'n1', type: NodeType.APPROVAL, title: 'HR审核', approverType: 'ROLE', approverValue: 'HR', next: {
        id: 'n2', type: NodeType.APPROVAL, title: '部门负责人确认', approverType: 'DEPT_MANAGER', next: {
          id: 'n3', type: NodeType.APPROVAL, title: 'IT开通账号', approverType: 'ROLE', approverValue: 'ADMIN',
          next: { id: 'end', type: NodeType.END, title: '流程结束' }
        }
      }
    }}
  },
  {
    id: 'resignation', name: '离职审批', description: '提交离职 → 部门审批 → HR审核 → 资产交接', category: 'hr',
    icon: UserMinus, color: 'text-red-500 bg-red-50',
    nodes: { id: 'start', type: NodeType.START, title: '提交离职申请', next: {
      id: 'n1', type: NodeType.APPROVAL, title: '部门经理审批', approverType: 'DEPT_MANAGER', next: {
        id: 'n2', type: NodeType.APPROVAL, title: 'HR审核', approverType: 'ROLE', approverValue: 'HR', next: {
          id: 'n3', type: NodeType.APPROVAL, title: '资产交接确认', approverType: 'ROLE', approverValue: 'ADMIN',
          next: { id: 'end', type: NodeType.END, title: '流程结束' }
        }
      }
    }}
  },
  {
    id: 'promotion', name: '晋升审批', description: '提名推荐 → 部门审核 → HR评估 → 总经理批准', category: 'hr',
    icon: Award, color: 'text-yellow-500 bg-yellow-50',
    nodes: { id: 'start', type: NodeType.START, title: '提名推荐', next: {
      id: 'n1', type: NodeType.APPROVAL, title: '部门负责人审核', approverType: 'DEPT_MANAGER', next: {
        id: 'n2', type: NodeType.APPROVAL, title: 'HR评估', approverType: 'ROLE', approverValue: 'HR', next: {
          id: 'n3', type: NodeType.APPROVAL, title: '总经理批准', approverType: 'ROLE', approverValue: 'MANAGER',
          next: { id: 'end', type: NodeType.END, title: '流程结束' }
        }
      }
    }}
  },
  {
    id: 'training', name: '培训申请', description: '提交培训 → 部门审批 → HR审核 → 完成', category: 'hr',
    icon: GraduationCap, color: 'text-indigo-500 bg-indigo-50',
    nodes: { id: 'start', type: NodeType.START, title: '提交培训申请', next: {
      id: 'n1', type: NodeType.APPROVAL, title: '部门经理审批', approverType: 'DEPT_MANAGER', next: {
        id: 'n2', type: NodeType.APPROVAL, title: 'HR审核', approverType: 'ROLE', approverValue: 'HR',
        next: { id: 'end', type: NodeType.END, title: '流程结束' }
      }
    }}
  },
  // ===== 销售业务 =====
  {
    id: 'quote', name: '报价审批', description: '提交报价 → 销售主管 → 金额判断 → 分级审批', category: 'sales',
    icon: Briefcase, color: 'text-cyan-500 bg-cyan-50',
    nodes: { id: 'start', type: NodeType.START, title: '提交报价单', next: {
      id: 'n1', type: NodeType.APPROVAL, title: '销售主管审核', approverType: 'DIRECT_LEADER',
      branches: [
        { id: 'b1', type: NodeType.CONDITION, title: '金额 ≤ 10万', condition: 'amount <= 100000' },
        { id: 'b2', type: NodeType.CONDITION, title: '金额 > 10万', condition: 'amount > 100000',
          next: { id: 'n2', type: NodeType.APPROVAL, title: '总经理审批', approverType: 'ROLE', approverValue: 'MANAGER' }
        }
      ],
      branchStrategy: 'EXCLUSIVE',
      next: { id: 'end', type: NodeType.END, title: '流程结束' }
    }}
  },
  {
    id: 'discount', name: '折扣审批', description: '申请折扣 → 销售总监 → 财务确认 → 完成', category: 'sales',
    icon: DollarSign, color: 'text-lime-600 bg-lime-50',
    nodes: { id: 'start', type: NodeType.START, title: '申请折扣', next: {
      id: 'n1', type: NodeType.APPROVAL, title: '销售总监审批', approverType: 'ROLE', approverValue: 'MANAGER', next: {
        id: 'n2', type: NodeType.APPROVAL, title: '财务确认', approverType: 'ROLE', approverValue: 'FINANCE',
        next: { id: 'end', type: NodeType.END, title: '流程结束' }
      }
    }}
  },
  // ===== IT运维 =====
  {
    id: 'server', name: '服务器申请', description: '提交申请 → IT审核 → 安全审查 → 运维部署', category: 'it',
    icon: Server, color: 'text-slate-600 bg-slate-100',
    nodes: { id: 'start', type: NodeType.START, title: '提交服务器申请', next: {
      id: 'n1', type: NodeType.APPROVAL, title: 'IT主管审核', approverType: 'ROLE', approverValue: 'ADMIN', next: {
        id: 'n2', type: NodeType.APPROVAL, title: '安全审查', approverType: 'ROLE', approverValue: 'ADMIN', next: {
          id: 'n3', type: NodeType.APPROVAL, title: '运维部署', approverType: 'ROLE', approverValue: 'ADMIN',
          next: { id: 'end', type: NodeType.END, title: '流程结束' }
        }
      }
    }}
  },
  {
    id: 'permission', name: '权限申请', description: '提交权限 → 部门审批 → IT审核 → 安全确认', category: 'it',
    icon: ShieldCheck, color: 'text-emerald-600 bg-emerald-50',
    nodes: { id: 'start', type: NodeType.START, title: '提交权限申请', next: {
      id: 'n1', type: NodeType.APPROVAL, title: '部门经理审批', approverType: 'DEPT_MANAGER', next: {
        id: 'n2', type: NodeType.APPROVAL, title: 'IT审核', approverType: 'ROLE', approverValue: 'ADMIN', next: {
          id: 'n3', type: NodeType.APPROVAL, title: '安全确认', approverType: 'ROLE', approverValue: 'ADMIN',
          next: { id: 'end', type: NodeType.END, title: '流程结束' }
        }
      }
    }}
  },
  {
    id: 'change', name: '变更发布', description: '提交变更 → 技术评审 → 测试验证 → 上线审批', category: 'it',
    icon: Rocket, color: 'text-purple-500 bg-purple-50',
    nodes: { id: 'start', type: NodeType.START, title: '提交变更申请', next: {
      id: 'n1', type: NodeType.APPROVAL, title: '技术评审', approverType: 'ROLE', approverValue: 'ADMIN', next: {
        id: 'n2', type: NodeType.APPROVAL, title: '测试验证', approverType: 'ROLE', approverValue: 'ADMIN', next: {
          id: 'n3', type: NodeType.APPROVAL, title: '上线审批', approverType: 'ROLE', approverValue: 'MANAGER',
          next: { id: 'end', type: NodeType.END, title: '流程结束' }
        }
      }
    }}
  },
  // ===== 行业专属 =====
  {
    id: 'medical', name: '医疗器械采购', description: '科室申请 → 设备科审核 → 院长审批 → 招标采购', category: 'industry',
    icon: Stethoscope, color: 'text-red-500 bg-red-50',
    nodes: { id: 'start', type: NodeType.START, title: '科室提交申请', next: {
      id: 'n1', type: NodeType.APPROVAL, title: '设备科审核', approverType: 'ROLE', approverValue: 'ADMIN', next: {
        id: 'n2', type: NodeType.APPROVAL, title: '院长审批', approverType: 'ROLE', approverValue: 'MANAGER', next: {
          id: 'n3', type: NodeType.APPROVAL, title: '招标采购', approverType: 'ROLE', approverValue: 'FINANCE',
          next: { id: 'end', type: NodeType.END, title: '流程结束' }
        }
      }
    }}
  },
  {
    id: 'construction', name: '工程验收', description: '提交验收 → 监理审核 → 质检验收 → 甲方确认', category: 'industry',
    icon: Building2, color: 'text-orange-600 bg-orange-50',
    nodes: { id: 'start', type: NodeType.START, title: '提交验收申请', next: {
      id: 'n1', type: NodeType.APPROVAL, title: '监理审核', approverType: 'ROLE', approverValue: 'ADMIN', next: {
        id: 'n2', type: NodeType.APPROVAL, title: '质检验收', approverType: 'ROLE', approverValue: 'ADMIN', next: {
          id: 'n3', type: NodeType.APPROVAL, title: '甲方确认', approverType: 'ROLE', approverValue: 'MANAGER',
          next: { id: 'end', type: NodeType.END, title: '流程结束' }
        }
      }
    }}
  },
  {
    id: 'education', name: '课程审批', description: '教师提交 → 教研组审核 → 教务处审批 → 完成', category: 'industry',
    icon: BookOpen, color: 'text-blue-600 bg-blue-50',
    nodes: { id: 'start', type: NodeType.START, title: '提交课程方案', next: {
      id: 'n1', type: NodeType.APPROVAL, title: '教研组审核', approverType: 'DIRECT_LEADER', next: {
        id: 'n2', type: NodeType.APPROVAL, title: '教务处审批', approverType: 'ROLE', approverValue: 'MANAGER',
        next: { id: 'end', type: NodeType.END, title: '流程结束' }
      }
    }}
  },
  {
    id: 'maintenance', name: '设备维修', description: '报修 → 维修主管派单 → 维修完成 → 验收确认', category: 'industry',
    icon: Wrench, color: 'text-gray-600 bg-gray-100',
    nodes: { id: 'start', type: NodeType.START, title: '提交报修', next: {
      id: 'n1', type: NodeType.APPROVAL, title: '维修主管派单', approverType: 'ROLE', approverValue: 'ADMIN', next: {
        id: 'n2', type: NodeType.APPROVAL, title: '维修完成确认', approverType: 'ROLE', approverValue: 'ADMIN', next: {
          id: 'n3', type: NodeType.APPROVAL, title: '报修人验收', approverType: 'USER',
          next: { id: 'end', type: NodeType.END, title: '流程结束' }
        }
      }
    }}
  },
  {
    id: 'logistics', name: '发货审批', description: '创建发货单 → 仓库确认 → 物流安排 → 完成', category: 'industry',
    icon: Package, color: 'text-yellow-600 bg-yellow-50',
    nodes: { id: 'start', type: NodeType.START, title: '创建发货单', next: {
      id: 'n1', type: NodeType.APPROVAL, title: '仓库确认库存', approverType: 'ROLE', approverValue: 'ADMIN', next: {
        id: 'n2', type: NodeType.APPROVAL, title: '物流安排', approverType: 'ROLE', approverValue: 'ADMIN',
        next: { id: 'end', type: NodeType.END, title: '流程结束' }
      }
    }}
  },
  // ===== 其他 =====
  {
    id: 'checklist', name: '审核清单', description: '提交清单 → 逐项审核 → 最终确认 → 完成', category: 'other',
    icon: CheckSquare, color: 'text-teal-600 bg-teal-50',
    nodes: { id: 'start', type: NodeType.START, title: '提交审核清单', next: {
      id: 'n1', type: NodeType.APPROVAL, title: '逐项审核', approverType: 'ROLE', approverValue: 'ADMIN', next: {
        id: 'n2', type: NodeType.APPROVAL, title: '最终确认', approverType: 'ROLE', approverValue: 'MANAGER',
        next: { id: 'end', type: NodeType.END, title: '流程结束' }
      }
    }}
  },
  {
    id: 'empty', name: '空白流程', description: '从零开始设计你的流程', category: 'other',
    icon: Sparkles, color: 'text-slate-500 bg-slate-50',
    nodes: { id: 'start', type: NodeType.START, title: '开始',
      next: { id: 'end', type: NodeType.END, title: '流程结束' }
    }
  }
];

// ==================== 模板选择器 ====================

const TemplatePickerModal = ({ open, onClose, onSelect }: {
  open: boolean; onClose: () => void; onSelect: (t: WorkflowTemplate) => void;
}) => {
  const [activeCategory, setActiveCategory] = useState('all');
  if (!open) return null;
  const filtered = activeCategory === 'all' ? WORKFLOW_TEMPLATES : WORKFLOW_TEMPLATES.filter(t => t.category === activeCategory);
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-[720px] max-h-[85vh] overflow-hidden flex flex-col">
        <div className="p-5 border-b border-slate-100 flex justify-between items-center shrink-0">
          <div>
            <h2 className="text-lg font-bold text-slate-800">选择流程模板</h2>
            <p className="text-xs text-slate-400 mt-0.5">覆盖行政、财务、人事、销售、IT、行业等 {WORKFLOW_TEMPLATES.length} 个模板</p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
            <X size={18} className="text-slate-400" />
          </button>
        </div>
        {/* 分类标签 */}
        <div className="px-5 pt-4 pb-2 flex gap-2 flex-wrap shrink-0">
          {TEMPLATE_CATEGORIES.map(cat => (
            <button key={cat.id} onClick={() => setActiveCategory(cat.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                activeCategory === cat.id
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
              }`}>
              {cat.label}
              {cat.id !== 'all' && (
                <span className="ml-1 opacity-60">
                  {WORKFLOW_TEMPLATES.filter(t => t.category === cat.id).length}
                </span>
              )}
            </button>
          ))}
        </div>
        {/* 模板列表 */}
        <div className="p-5 pt-2 grid grid-cols-2 gap-3 overflow-y-auto flex-1 custom-scrollbar">
          {filtered.map(t => {
            const TIcon = t.icon;
            return (
              <button key={t.id} onClick={() => { onSelect(t); onClose(); }}
                className="text-left p-4 rounded-xl border-2 border-slate-100 hover:border-indigo-300 hover:shadow-md transition-all group">
                <div className="flex items-start gap-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${t.color} shrink-0`}>
                    <TIcon size={20} />
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold text-sm text-slate-700 group-hover:text-indigo-600 transition-colors">{t.name}</div>
                    <div className="text-xs text-slate-400 mt-1 leading-relaxed">{t.description}</div>
                  </div>
                </div>
              </button>
            );
          })}
          {filtered.length === 0 && (
            <div className="col-span-2 text-center py-10 text-slate-400 text-sm">该分类暂无模板</div>
          )}
        </div>
      </div>
    </div>
  );
};

// ==================== 属性面板 ====================

const PropertyPanel = ({ node, onClose, onUpdate, onDelete }: {
  node: WorkflowNode; onClose: () => void;
  onUpdate: (id: string, data: Partial<WorkflowNode>) => void;
  onDelete: (id: string) => void;
}) => {
  const [formData, setFormData] = useState(node);
  useEffect(() => { setFormData(node); }, [node.id]);
  const handleChange = (field: keyof WorkflowNode, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    onUpdate(node.id, { [field]: value });
  };
  const visual = getNodeVisual(node.type);
  const PIcon = visual.icon;

  return (
    <div className="fixed right-0 top-0 h-full w-80 bg-white shadow-xl z-50 flex flex-col border-l border-slate-200 animate-in slide-in-from-right duration-200">
      <div className="px-4 py-3 border-b flex justify-between items-center bg-gradient-to-r from-slate-50 to-white">
        <div className="flex items-center gap-2.5">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${visual.iconBg}`}>
            <PIcon size={16} className={visual.iconColor} />
          </div>
          <h3 className="font-semibold text-slate-800">节点设置</h3>
        </div>
        <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
          <X size={16} className="text-slate-400" />
        </button>
      </div>
      <div className="p-4 flex-1 overflow-y-auto custom-scrollbar">
        <div className="flex justify-between items-center mb-5">
          <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${visual.iconBg} ${visual.iconColor}`}>
            {NODE_TYPE_LABELS[node.type] || node.type}
          </span>
          {node.type !== NodeType.START && node.type !== NodeType.END && (
            <button onClick={() => onDelete(node.id)} className="text-red-500 hover:bg-red-50 p-1.5 rounded-lg transition-colors" title="删除节点">
              <Trash2 size={15} />
            </button>
          )}
        </div>
        <div className="space-y-5">
          <div className="space-y-3">
            <label className="text-xs font-semibold text-slate-600 flex items-center gap-1.5"><Settings size={12} /> 基础信息</label>
            <div>
              <span className="text-xs text-slate-400 mb-1 block">名称</span>
              <input type="text" className="w-full border border-slate-200 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                value={formData.title} onChange={e => handleChange('title', e.target.value)} placeholder="请输入节点名称" />
            </div>
          </div>
          {node.type === NodeType.APPROVAL && (
            <div className="space-y-3 pt-4 border-t border-slate-100">
              <label className="text-xs font-semibold text-slate-600 flex items-center gap-1.5"><UserCheck size={12} /> 审批人设置</label>
              <div>
                <span className="text-xs text-slate-400 mb-1 block">审批方式</span>
                <select className="w-full border border-slate-200 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  value={formData.approverType || 'ROLE'} onChange={e => handleChange('approverType', e.target.value)}>
                  {Object.entries(APPROVER_TYPE_LABELS).map(([k, v]) => (<option key={k} value={k}>{v}</option>))}
                </select>
              </div>
              {(formData.approverType === 'ROLE' || formData.approverType === 'USER') && (
                <div>
                  <span className="text-xs text-slate-400 mb-1 block">{formData.approverType === 'ROLE' ? '角色标识' : '人员ID'}</span>
                  <input type="text" className="w-full border border-slate-200 rounded-lg p-2.5 text-sm"
                    placeholder={formData.approverType === 'ROLE' ? '例如: MANAGER' : '输入用户ID'}
                    value={formData.approverValue || ''} onChange={e => handleChange('approverValue', e.target.value)} />
                  {formData.approverType === 'ROLE' && <p className="text-[10px] text-slate-400 mt-1">💡 输入系统中定义的角色标识符</p>}
                </div>
              )}
            </div>
          )}
          {node.type === NodeType.PARALLEL && (
            <div className="space-y-3 pt-4 border-t border-slate-100">
              <label className="text-xs font-semibold text-slate-600 flex items-center gap-1.5"><Layers size={12} /> 会签设置</label>
              <div>
                <span className="text-xs text-slate-400 mb-1 block">审批方式</span>
                <select className="w-full border border-slate-200 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-violet-500 outline-none"
                  value={formData.approverType || 'ROLE'} onChange={e => handleChange('approverType', e.target.value)}>
                  {Object.entries(APPROVER_TYPE_LABELS).map(([k, v]) => (<option key={k} value={k}>{v}</option>))}
                </select>
              </div>
              {(formData.approverType === 'ROLE' || formData.approverType === 'USER') && (
                <div>
                  <span className="text-xs text-slate-400 mb-1 block">{formData.approverType === 'ROLE' ? '角色标识（多个用逗号分隔）' : '人员ID（多个用逗号分隔）'}</span>
                  <input type="text" className="w-full border border-slate-200 rounded-lg p-2.5 text-sm"
                    placeholder={formData.approverType === 'ROLE' ? '例如: MANAGER,FINANCE' : '输入多个用户ID'}
                    value={formData.approverValue || ''} onChange={e => handleChange('approverValue', e.target.value)} />
                  <p className="text-[10px] text-slate-400 mt-1">💡 会签需要所有审批人都同意才能通过</p>
                </div>
              )}
            </div>
          )}
          {node.type === NodeType.NOTIFICATION && (
            <div className="space-y-3 pt-4 border-t border-slate-100">
              <label className="text-xs font-semibold text-slate-600 flex items-center gap-1.5"><Bell size={12} /> 通知设置</label>
              <div>
                <span className="text-xs text-slate-400 mb-1 block">接收人类型</span>
                <select className="w-full border border-slate-200 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  value={formData.props?.recipientType || 'INITIATOR'} 
                  onChange={e => handleChange('props', { ...formData.props, recipientType: e.target.value })}>
                  <option value="INITIATOR">发起人</option>
                  <option value="ROLE">按角色</option>
                  <option value="USER">指定人员</option>
                  <option value="DEPT">按部门</option>
                </select>
              </div>
              {(formData.props?.recipientType === 'ROLE' || formData.props?.recipientType === 'USER' || formData.props?.recipientType === 'DEPT') && (
                <div>
                  <span className="text-xs text-slate-400 mb-1 block">
                    {formData.props?.recipientType === 'ROLE' ? '角色标识' : formData.props?.recipientType === 'USER' ? '用户ID' : '部门ID'}
                  </span>
                  <input type="text" className="w-full border border-slate-200 rounded-lg p-2.5 text-sm"
                    placeholder={formData.props?.recipientType === 'ROLE' ? '例如: MANAGER' : formData.props?.recipientType === 'USER' ? '输入用户ID' : '输入部门ID'}
                    value={formData.props?.recipientValue || ''} 
                    onChange={e => handleChange('props', { ...formData.props, recipientValue: e.target.value })} />
                </div>
              )}
              <div>
                <span className="text-xs text-slate-400 mb-1 block">通知标题</span>
                <input type="text" className="w-full border border-slate-200 rounded-lg p-2.5 text-sm"
                  placeholder="例如: 您有新的审批任务"
                  value={formData.props?.notificationTitle || ''} 
                  onChange={e => handleChange('props', { ...formData.props, notificationTitle: e.target.value })} />
              </div>
              <div>
                <span className="text-xs text-slate-400 mb-1 block">通知内容</span>
                <textarea className="w-full border border-slate-200 rounded-lg p-2.5 text-sm min-h-[80px] focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="支持变量: ${initiator}, ${amount}, ${days} 等"
                  value={formData.props?.notificationContent || ''} 
                  onChange={e => handleChange('props', { ...formData.props, notificationContent: e.target.value })} />
                <p className="text-[10px] text-slate-400 mt-1">💡 可使用 ${'{'}变量名{'}'} 引用流程数据</p>
              </div>
            </div>
          )}
          {node.type === NodeType.SCRIPT && (
            <div className="space-y-3 pt-4 border-t border-slate-100">
              <label className="text-xs font-semibold text-slate-600 flex items-center gap-1.5"><Code size={12} /> 脚本设置</label>
              <div>
                <span className="text-xs text-slate-400 mb-1 block">脚本类型</span>
                <select className="w-full border border-slate-200 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-green-500 outline-none"
                  value={formData.props?.scriptType || 'GROOVY'} 
                  onChange={e => handleChange('props', { ...formData.props, scriptType: e.target.value })}>
                  <option value="GROOVY">Groovy 脚本</option>
                  <option value="JAVASCRIPT">JavaScript 脚本</option>
                  <option value="API">HTTP API 调用</option>
                </select>
              </div>
              {(formData.props?.scriptType === 'GROOVY' || formData.props?.scriptType === 'JAVASCRIPT') && (
                <div>
                  <span className="text-xs text-slate-400 mb-1 block">脚本内容</span>
                  <textarea className="w-full border border-slate-200 rounded-lg p-2.5 text-sm font-mono text-xs min-h-[120px] bg-slate-50 focus:ring-2 focus:ring-green-500 outline-none"
                    placeholder={formData.props?.scriptType === 'GROOVY' ? 
                      'def result = amount * 1.1\nreturn result' : 
                      'const result = amount * 1.1;\nreturn result;'}
                    value={formData.props?.scriptContent || ''} 
                    onChange={e => handleChange('props', { ...formData.props, scriptContent: e.target.value })} />
                  <p className="text-[10px] text-slate-400 mt-1">💡 可访问流程变量: amount, days, initiator 等</p>
                </div>
              )}
              {formData.props?.scriptType === 'API' && (
                <>
                  <div>
                    <span className="text-xs text-slate-400 mb-1 block">API URL</span>
                    <input type="text" className="w-full border border-slate-200 rounded-lg p-2.5 text-sm font-mono"
                      placeholder="https://api.example.com/endpoint"
                      value={formData.props?.apiUrl || ''} 
                      onChange={e => handleChange('props', { ...formData.props, apiUrl: e.target.value })} />
                  </div>
                  <div>
                    <span className="text-xs text-slate-400 mb-1 block">请求方法</span>
                    <select className="w-full border border-slate-200 rounded-lg p-2.5 text-sm"
                      value={formData.props?.apiMethod || 'GET'} 
                      onChange={e => handleChange('props', { ...formData.props, apiMethod: e.target.value })}>
                      <option value="GET">GET</option>
                      <option value="POST">POST</option>
                      <option value="PUT">PUT</option>
                      <option value="DELETE">DELETE</option>
                    </select>
                  </div>
                  <div>
                    <span className="text-xs text-slate-400 mb-1 block">请求头 (JSON)</span>
                    <textarea className="w-full border border-slate-200 rounded-lg p-2.5 text-sm font-mono text-xs min-h-[60px] bg-slate-50"
                      placeholder='{"Content-Type": "application/json"}'
                      value={formData.props?.apiHeaders || ''} 
                      onChange={e => handleChange('props', { ...formData.props, apiHeaders: e.target.value })} />
                  </div>
                  <div>
                    <span className="text-xs text-slate-400 mb-1 block">请求体 (JSON)</span>
                    <textarea className="w-full border border-slate-200 rounded-lg p-2.5 text-sm font-mono text-xs min-h-[60px] bg-slate-50"
                      placeholder='{"amount": "${amount}"}'
                      value={formData.props?.apiBody || ''} 
                      onChange={e => handleChange('props', { ...formData.props, apiBody: e.target.value })} />
                    <p className="text-[10px] text-slate-400 mt-1">💡 可使用 ${'{'}变量名{'}'} 引用流程数据</p>
                  </div>
                </>
              )}
              <div className="flex items-center gap-2">
                <input type="checkbox" id="continueOnError" className="rounded border-slate-300"
                  checked={formData.props?.continueOnError || false}
                  onChange={e => handleChange('props', { ...formData.props, continueOnError: e.target.checked })} />
                <label htmlFor="continueOnError" className="text-xs text-slate-600">出错时继续执行</label>
              </div>
            </div>
          )}
          {node.type === NodeType.TIMER && (
            <div className="space-y-3 pt-4 border-t border-slate-100">
              <label className="text-xs font-semibold text-slate-600 flex items-center gap-1.5"><Clock size={12} /> 定时设置</label>
              <div>
                <span className="text-xs text-slate-400 mb-1 block">定时类型</span>
                <select className="w-full border border-slate-200 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-orange-500 outline-none"
                  value={formData.props?.timerType || 'DELAY'} 
                  onChange={e => handleChange('props', { ...formData.props, timerType: e.target.value })}>
                  <option value="DELAY">延迟执行</option>
                  <option value="SCHEDULE">定时执行</option>
                </select>
              </div>
              {formData.props?.timerType === 'DELAY' && (
                <div>
                  <span className="text-xs text-slate-400 mb-1 block">延迟时间（分钟）</span>
                  <input type="number" className="w-full border border-slate-200 rounded-lg p-2.5 text-sm"
                    placeholder="例如: 60"
                    min="1"
                    value={formData.props?.delayMinutes || ''} 
                    onChange={e => handleChange('props', { ...formData.props, delayMinutes: parseInt(e.target.value) || 0 })} />
                  <p className="text-[10px] text-slate-400 mt-1">💡 流程将在指定时间后自动继续</p>
                </div>
              )}
              {formData.props?.timerType === 'SCHEDULE' && (
                <div>
                  <span className="text-xs text-slate-400 mb-1 block">定时时间</span>
                  <input type="datetime-local" className="w-full border border-slate-200 rounded-lg p-2.5 text-sm"
                    value={formData.props?.scheduleTime || ''} 
                    onChange={e => handleChange('props', { ...formData.props, scheduleTime: e.target.value })} />
                  <p className="text-[10px] text-slate-400 mt-1">💡 流程将在指定时间点自动继续</p>
                </div>
              )}
            </div>
          )}
          {node.type === NodeType.SUBPROCESS && (
            <div className="space-y-3 pt-4 border-t border-slate-100">
              <label className="text-xs font-semibold text-slate-600 flex items-center gap-1.5"><Workflow size={12} /> 子流程设置</label>
              <div>
                <span className="text-xs text-slate-400 mb-1 block">子流程ID</span>
                <input type="text" className="w-full border border-slate-200 rounded-lg p-2.5 text-sm"
                  placeholder="输入子流程的ID"
                  value={formData.props?.subprocessId || ''} 
                  onChange={e => handleChange('props', { ...formData.props, subprocessId: e.target.value })} />
                <p className="text-[10px] text-slate-400 mt-1">💡 将调用指定的子流程</p>
              </div>
              <div>
                <span className="text-xs text-slate-400 mb-1 block">变量映射 (JSON)</span>
                <textarea className="w-full border border-slate-200 rounded-lg p-2.5 text-sm font-mono text-xs min-h-[80px] bg-slate-50 focus:ring-2 focus:ring-purple-500 outline-none"
                  placeholder='{"subAmount": "${amount}", "subDays": "${days}"}'
                  value={formData.props?.variableMapping || ''} 
                  onChange={e => handleChange('props', { ...formData.props, variableMapping: e.target.value })} />
                <p className="text-[10px] text-slate-400 mt-1">💡 定义父流程变量到子流程的映射关系</p>
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="waitForCompletion" className="rounded border-slate-300"
                  checked={formData.props?.waitForCompletion !== false}
                  onChange={e => handleChange('props', { ...formData.props, waitForCompletion: e.target.checked })} />
                <label htmlFor="waitForCompletion" className="text-xs text-slate-600">等待子流程完成</label>
              </div>
            </div>
          )}
          {node.type === NodeType.MANUAL && (
            <div className="space-y-3 pt-4 border-t border-slate-100">
              <label className="text-xs font-semibold text-slate-600 flex items-center gap-1.5"><ClipboardCheck size={12} /> 人工任务设置</label>
              <div>
                <span className="text-xs text-slate-400 mb-1 block">任务描述</span>
                <textarea className="w-full border border-slate-200 rounded-lg p-2.5 text-sm min-h-[80px] focus:ring-2 focus:ring-cyan-500 outline-none"
                  placeholder="描述需要人工处理的任务内容"
                  value={formData.props?.taskDescription || ''} 
                  onChange={e => handleChange('props', { ...formData.props, taskDescription: e.target.value })} />
              </div>
              <div>
                <span className="text-xs text-slate-400 mb-1 block">处理人类型</span>
                <select className="w-full border border-slate-200 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-cyan-500 outline-none"
                  value={formData.approverType || 'ROLE'} 
                  onChange={e => handleChange('approverType', e.target.value)}>
                  {Object.entries(APPROVER_TYPE_LABELS).map(([k, v]) => (<option key={k} value={k}>{v}</option>))}
                </select>
              </div>
              {(formData.approverType === 'ROLE' || formData.approverType === 'USER') && (
                <div>
                  <span className="text-xs text-slate-400 mb-1 block">{formData.approverType === 'ROLE' ? '角色标识' : '人员ID'}</span>
                  <input type="text" className="w-full border border-slate-200 rounded-lg p-2.5 text-sm"
                    placeholder={formData.approverType === 'ROLE' ? '例如: ADMIN' : '输入用户ID'}
                    value={formData.approverValue || ''} 
                    onChange={e => handleChange('approverValue', e.target.value)} />
                </div>
              )}
              <div>
                <span className="text-xs text-slate-400 mb-1 block">任务优先级</span>
                <select className="w-full border border-slate-200 rounded-lg p-2.5 text-sm"
                  value={formData.props?.priority || 'MEDIUM'} 
                  onChange={e => handleChange('props', { ...formData.props, priority: e.target.value })}>
                  <option value="LOW">低</option>
                  <option value="MEDIUM">中</option>
                  <option value="HIGH">高</option>
                </select>
              </div>
            </div>
          )}
          {(node.branches && node.branches.length > 0) && (
            <div className="space-y-3 pt-4 border-t border-slate-100">
              <label className="text-xs font-semibold text-slate-600 flex items-center gap-1.5"><GitBranch size={12} /> 分支规则</label>
              <select className="w-full border border-slate-200 rounded-lg p-2.5 text-sm"
                value={formData.branchStrategy || 'EXCLUSIVE'} onChange={e => handleChange('branchStrategy', e.target.value)}>
                {Object.entries(BRANCH_STRATEGY_LABELS).map(([k, v]) => (<option key={k} value={k}>{v}</option>))}
              </select>
            </div>
          )}
          <div className="space-y-3 pt-4 border-t border-slate-100">
            <label className="text-xs font-semibold text-slate-600 flex items-center gap-1.5"><FileText size={12} /> 条件设置</label>
            <div>
              <span className="text-xs text-slate-400 mb-1 block">触发条件</span>
              <input type="text" className="w-full border border-slate-200 rounded-lg p-2.5 text-sm font-mono bg-slate-50"
                placeholder="例如: amount > 5000" value={formData.condition || ''} onChange={e => handleChange('condition', e.target.value)} />
              <p className="text-[10px] text-slate-400 mt-1">💡 示例：amount &gt; 5000 或 days &gt;= 3<br/>可用字段：amount(金额)、days(天数)、deptId(部门)</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ==================== 连接线拖放区域 ====================

const ConnectorDropZone = ({ parentId, isDraggingGlobal, onDrop }: {
  parentId: string; isDraggingGlobal: boolean; onDrop: (dragId: string, dropId: string) => void;
}) => {
  const [isOver, setIsOver] = useState(false);
  if (!isDraggingGlobal) {
    return (<div className="flex flex-col items-center"><div className="h-8 w-0.5 bg-slate-300"></div><ArrowDown size={14} className="text-slate-300 -mt-1 mb-1" /></div>);
  }
  return (
    <div className="flex flex-col items-center relative">
      <div className={`h-10 w-0.5 transition-all ${isOver ? 'bg-indigo-500' : 'bg-slate-300'}`}></div>
      <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-40 h-12 rounded-xl border-2 border-dashed flex items-center justify-center gap-1.5 transition-all cursor-pointer z-20 ${
        isOver ? 'border-indigo-500 bg-indigo-50 scale-110 shadow-lg shadow-indigo-200' : 'border-slate-300 bg-white/80 hover:border-indigo-400 hover:bg-indigo-50/50'
      }`}
        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setIsOver(true); }}
        onDragLeave={() => setIsOver(false)}
        onDrop={(e) => { e.preventDefault(); e.stopPropagation(); setIsOver(false); const dragId = e.dataTransfer.getData('nodeId'); if (dragId) onDrop(dragId, parentId); }}>
        <Move size={14} className={isOver ? 'text-indigo-500' : 'text-slate-400'} />
        <span className={`text-xs font-medium ${isOver ? 'text-indigo-600' : 'text-slate-400'}`}>{isOver ? '松开放置' : '拖到这里'}</span>
      </div>
      <ArrowDown size={14} className={`-mt-1 mb-1 ${isOver ? 'text-indigo-500' : 'text-slate-300'}`} />
    </div>
  );
};

// ==================== 节点组件 ====================

const FlowNode = ({ node, onAddNext, onAddBranch, onSelect, onDrop, onCopy, isDraggingGlobal, setDraggingGlobal, activeQuickAddId, setActiveQuickAddId, hoveredNodeId, setHoveredNodeId }: {
  node: WorkflowNode; onAddNext: (parentId: string, type?: NodeType) => void;
  onAddBranch: (parentId: string) => void; onSelect: (node: WorkflowNode) => void;
  onDrop: (dragId: string, dropId: string) => void; onCopy: (nodeId: string) => void;
  isDraggingGlobal: boolean; setDraggingGlobal: (v: boolean) => void;
  activeQuickAddId: string | null; setActiveQuickAddId: (id: string | null) => void;
  hoveredNodeId: string | null; setHoveredNodeId: (id: string | null) => void;
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const showQuickAdd = activeQuickAddId === node.id;
  const visual = getNodeVisual(node.type);
  const NIcon = visual.icon;
  const canDrag = node.type !== NodeType.START && node.type !== NodeType.END;
  
  // 当有任何菜单打开时，只有拥有该菜单的节点才能响应 hover
  const canShowHover = !activeQuickAddId || activeQuickAddId === node.id;

  return (
    <div className="flex flex-col items-center relative">
      {/* 拖拽放置提示 */}
      {isDragOver && !isDragging && isDraggingGlobal && (
        <div className="absolute -top-9 left-1/2 -translate-x-1/2 z-30 animate-bounce">
          <div className="bg-indigo-500 text-white text-xs px-3 py-1 rounded-full shadow-lg flex items-center gap-1">
            <ArrowDown size={12} /> 放置到此节点后
          </div>
        </div>
      )}

      {/* 节点卡片容器 - 独立的相对定位容器 */}
      <div className="relative group">
        {/* 节点卡片 */}
        <div
          className={`w-64 ${visual.bg} rounded-xl shadow-sm border-2 transition-all cursor-pointer relative z-10 ${
            isDragging ? 'opacity-40 scale-95 border-slate-300 rotate-1' :
            isDragOver && isDraggingGlobal ? 'border-indigo-500 shadow-lg shadow-indigo-200 scale-105' :
            `${visual.border} ${visual.hoverBorder} hover:shadow-md`
          }`}
          onClick={() => { onSelect(node); setActiveQuickAddId(null); }}
          onMouseEnter={() => canShowHover && setHoveredNodeId(node.id)}
          onMouseLeave={() => canShowHover && setHoveredNodeId(null)}
          draggable={canDrag}
          onDragStart={(e) => { e.dataTransfer.setData('nodeId', node.id); e.dataTransfer.effectAllowed = 'move'; setIsDragging(true); setDraggingGlobal(true); }}
          onDragEnd={() => { setIsDragging(false); setDraggingGlobal(false); }}
          onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setIsDragOver(true); }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragOver(false); const dragId = e.dataTransfer.getData('nodeId'); if (dragId && dragId !== node.id) onDrop(dragId, node.id); }}
        >
          {/* 顶部颜色条 */}
          <div className={`h-1.5 rounded-t-xl w-full ${visual.color}`}></div>
          <div className="p-3">
            {/* 图标 + 标题 */}
            <div className="flex items-center gap-2.5 mb-2">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${visual.iconBg} shrink-0`}>
                <NIcon size={16} className={visual.iconColor} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-slate-700 truncate">{node.title}</div>
                <div className="text-[10px] text-slate-400">
                  {node.branches && node.branches.length > 0 && node.branchStrategy
                    ? BRANCH_STRATEGY_LABELS[node.branchStrategy] || node.branchStrategy
                    : NODE_TYPE_LABELS[node.type] || node.type}
                </div>
              </div>
              {canDrag && (
                <div className="text-slate-300 cursor-grab active:cursor-grabbing" title="拖拽移动">
                  <Move size={14} />
                </div>
              )}
            </div>
            {/* 审批人标签 */}
            {node.approverType && (
              <div className="flex items-center gap-1.5 mt-1">
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${visual.iconBg} ${visual.iconColor}`}>
                  {APPROVER_TYPE_LABELS[node.approverType] || node.approverType}
                </span>
                {node.approverValue && <span className="text-[10px] text-slate-500">{node.approverValue}</span>}
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

        {/* END节点的添加按钮 - 在节点上方 */}
        {node.type === NodeType.END && (
        <div className="absolute -top-2 left-1/2 -translate-x-1/2 z-30" style={{ pointerEvents: showQuickAdd ? 'auto' : 'none' }}>
          <div className={`relative transition-opacity duration-200 ${hoveredNodeId === node.id || showQuickAdd ? 'opacity-100' : 'opacity-0'}`} style={{ pointerEvents: 'auto' }}>
            <button
              onClick={(e) => { e.stopPropagation(); setActiveQuickAddId(showQuickAdd ? null : node.id); }}
              onMouseEnter={() => canShowHover && setHoveredNodeId(node.id)}
              onMouseLeave={() => canShowHover && setHoveredNodeId(null)}
              className={`w-8 h-8 rounded-full flex items-center justify-center shadow-md transition-all ${
                showQuickAdd 
                  ? 'bg-red-500 text-white rotate-45 scale-110' 
                  : 'bg-indigo-600 text-white hover:scale-110 hover:shadow-lg'
              }`}
              title={showQuickAdd ? '关闭菜单' : '在此之前添加节点'}
            >
              <Plus size={16} />
            </button>
            {showQuickAdd && (
              <div 
                className="absolute bottom-10 left-1/2 -translate-x-1/2 bg-white rounded-xl shadow-2xl border-2 border-indigo-200 p-3 min-w-[200px] z-[100] animate-in fade-in slide-in-from-bottom-2 duration-200"
                onClick={(e) => e.stopPropagation()}
                onMouseEnter={(e) => { 
                  e.stopPropagation(); 
                  setHoveredNodeId(node.id); // 强制保持当前节点的 hover 状态
                }}
                onMouseLeave={(e) => {
                  e.stopPropagation();
                  setHoveredNodeId(null);
                }}
                onMouseMove={(e) => { e.stopPropagation(); e.nativeEvent.stopImmediatePropagation(); }}
                style={{ pointerEvents: 'auto' }}
              >
                <div className="text-xs text-slate-600 px-2 py-1 font-semibold mb-1 flex items-center gap-1.5">
                  <Sparkles size={12} className="text-indigo-500" />
                  选择节点类型
                </div>
                {([
                  { type: NodeType.APPROVAL, icon: UserCheck, label: '审批节点', desc: '需要审批人处理', color: 'text-indigo-500', bg: 'hover:bg-indigo-50', border: 'hover:border-indigo-200' },
                  { type: NodeType.PARALLEL, icon: Layers, label: '会签节点', desc: '多人同时审批', color: 'text-violet-500', bg: 'hover:bg-violet-50', border: 'hover:border-violet-200' },
                  { type: NodeType.NOTIFICATION, icon: Bell, label: '通知节点', desc: '发送通知消息', color: 'text-blue-500', bg: 'hover:bg-blue-50', border: 'hover:border-blue-200' },
                  { type: NodeType.SCRIPT, icon: Code, label: '脚本节点', desc: '执行自动化脚本', color: 'text-green-500', bg: 'hover:bg-green-50', border: 'hover:border-green-200' },
                  { type: NodeType.TIMER, icon: Clock, label: '定时节点', desc: '延迟或定时触发', color: 'text-orange-500', bg: 'hover:bg-orange-50', border: 'hover:border-orange-200' },
                  { type: NodeType.SUBPROCESS, icon: Workflow, label: '子流程节点', desc: '调用其他流程', color: 'text-purple-500', bg: 'hover:bg-purple-50', border: 'hover:border-purple-200' },
                  { type: NodeType.MANUAL, icon: ClipboardCheck, label: '人工任务', desc: '需要人工处理', color: 'text-cyan-500', bg: 'hover:bg-cyan-50', border: 'hover:border-cyan-200' },
                  { type: NodeType.CONDITION, icon: GitBranch, label: '条件分支', desc: '根据条件分流', color: 'text-amber-500', bg: 'hover:bg-amber-50', border: 'hover:border-amber-200', isBranch: true },
                ] as const).map(item => {
                  const ItemIcon = item.icon;
                  return (
                    <button 
                      key={item.type} 
                      className={`w-full flex items-start gap-3 px-3 py-2.5 rounded-lg text-left border-2 border-transparent ${item.bg} ${item.border} transition-all mb-1.5`}
                      onClick={(e) => { 
                        e.stopPropagation(); 
                        if ('isBranch' in item && item.isBranch) { 
                          onAddBranch(node.id); 
                        } else { 
                          onAddNext(node.id, item.type as NodeType); 
                        } 
                        setActiveQuickAddId(null); 
                      }}
                    >
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${item.bg.replace('hover:', '')} shrink-0 mt-0.5`}>
                        <ItemIcon size={16} className={item.color} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-slate-700">{item.label}</div>
                        <div className="text-[10px] text-slate-400 mt-0.5">{item.desc}</div>
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
        <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 z-30" style={{ pointerEvents: showQuickAdd ? 'auto' : 'none' }}>
          <div className={`relative transition-opacity duration-200 ${hoveredNodeId === node.id || showQuickAdd ? 'opacity-100' : 'opacity-0'}`} style={{ pointerEvents: 'auto' }}>
            <button
              onClick={(e) => { e.stopPropagation(); setActiveQuickAddId(showQuickAdd ? null : node.id); }}
              onMouseEnter={() => canShowHover && setHoveredNodeId(node.id)}
              onMouseLeave={() => canShowHover && setHoveredNodeId(null)}
              className={`w-8 h-8 rounded-full flex items-center justify-center shadow-md transition-all ${
                showQuickAdd 
                  ? 'bg-red-500 text-white rotate-45 scale-110' 
                  : 'bg-indigo-600 text-white hover:scale-110 hover:shadow-lg'
              }`}
              title={showQuickAdd ? '关闭菜单' : '添加节点'}
            >
              <Plus size={16} />
            </button>
            {showQuickAdd && (
              <div 
                className="absolute top-10 left-1/2 -translate-x-1/2 bg-white rounded-xl shadow-2xl border-2 border-indigo-200 p-3 min-w-[200px] z-[100] animate-in fade-in slide-in-from-top-2 duration-200"
                onClick={(e) => e.stopPropagation()}
                onMouseEnter={(e) => { 
                  e.stopPropagation(); 
                  setHoveredNodeId(node.id); // 强制保持当前节点的 hover 状态
                }}
                onMouseLeave={(e) => {
                  e.stopPropagation();
                  setHoveredNodeId(null);
                }}
                onMouseMove={(e) => { e.stopPropagation(); e.nativeEvent.stopImmediatePropagation(); }}
                style={{ pointerEvents: 'auto' }}
              >
                <div className="text-xs text-slate-600 px-2 py-1 font-semibold mb-1 flex items-center gap-1.5">
                  <Sparkles size={12} className="text-indigo-500" />
                  选择节点类型
                </div>
                {([
                  { type: NodeType.APPROVAL, icon: UserCheck, label: '审批节点', desc: '需要审批人处理', color: 'text-indigo-500', bg: 'hover:bg-indigo-50', border: 'hover:border-indigo-200' },
                  { type: NodeType.PARALLEL, icon: Layers, label: '会签节点', desc: '多人同时审批', color: 'text-violet-500', bg: 'hover:bg-violet-50', border: 'hover:border-violet-200' },
                  { type: NodeType.NOTIFICATION, icon: Bell, label: '通知节点', desc: '发送通知消息', color: 'text-blue-500', bg: 'hover:bg-blue-50', border: 'hover:border-blue-200' },
                  { type: NodeType.SCRIPT, icon: Code, label: '脚本节点', desc: '执行自动化脚本', color: 'text-green-500', bg: 'hover:bg-green-50', border: 'hover:border-green-200' },
                  { type: NodeType.TIMER, icon: Clock, label: '定时节点', desc: '延迟或定时触发', color: 'text-orange-500', bg: 'hover:bg-orange-50', border: 'hover:border-orange-200' },
                  { type: NodeType.SUBPROCESS, icon: Workflow, label: '子流程节点', desc: '调用其他流程', color: 'text-purple-500', bg: 'hover:bg-purple-50', border: 'hover:border-purple-200' },
                  { type: NodeType.MANUAL, icon: ClipboardCheck, label: '人工任务', desc: '需要人工处理', color: 'text-cyan-500', bg: 'hover:bg-cyan-50', border: 'hover:border-cyan-200' },
                  { type: NodeType.CONDITION, icon: GitBranch, label: '条件分支', desc: '根据条件分流', color: 'text-amber-500', bg: 'hover:bg-amber-50', border: 'hover:border-amber-200', isBranch: true },
                  { type: NodeType.END, icon: Flag, label: '结束节点', desc: '流程终点', color: 'text-slate-500', bg: 'hover:bg-slate-50', border: 'hover:border-slate-200' },
                ] as const).map(item => {
                  const ItemIcon = item.icon;
                  return (
                    <button 
                      key={item.type} 
                      className={`w-full flex items-start gap-3 px-3 py-2.5 rounded-lg text-left border-2 border-transparent ${item.bg} ${item.border} transition-all mb-1.5`}
                      onClick={(e) => { 
                        e.stopPropagation(); 
                        if ('isBranch' in item && item.isBranch) { 
                          onAddBranch(node.id); 
                        } else { 
                          onAddNext(node.id, item.type as NodeType); 
                        } 
                        setActiveQuickAddId(null); 
                      }}
                    >
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${item.bg.replace('hover:', '')} shrink-0 mt-0.5`}>
                        <ItemIcon size={16} className={item.color} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-slate-700">{item.label}</div>
                        <div className="text-[10px] text-slate-400 mt-0.5">{item.desc}</div>
                      </div>
                    </button>
                  );
                })}
                <div className="border-t border-slate-100 mt-2 pt-2">
                  <button 
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs text-slate-600 hover:bg-slate-50 transition-colors"
                    onClick={(e) => { e.stopPropagation(); onCopy(node.id); setActiveQuickAddId(null); }}
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
        <div className="flex flex-col items-center w-full mt-6">
          {/* 从父节点到分支点的垂直连接线 */}
          <div className="h-6 w-0.5 bg-slate-400"></div>
          
          {/* 分支点 - 菱形指示器 */}
          <div className="w-3 h-3 bg-amber-500 rotate-45 border-2 border-white shadow-md z-10"></div>
          
          {/* 分支容器 */}
          <div className="flex gap-12 relative pt-6">
            {/* 水平连接线 - 连接所有分支 */}
            <div className="absolute top-0 left-0 right-0 h-0.5 bg-slate-400" style={{ 
              left: `${100 / node.branches.length / 2}%`, 
              right: `${100 / node.branches.length / 2}%` 
            }}></div>
            
            {node.branches.map((branch, index) => (
              <div key={branch.id} className="flex flex-col items-center relative">
                {/* 从水平线到分支节点的垂直连接线 */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-0.5 h-6 bg-slate-400 -mt-6"></div>
                
                {/* 分支标签 - 更醒目的设计 */}
                <div className="absolute -top-10 left-1/2 -translate-x-1/2 z-10">
                  <div className="bg-gradient-to-r from-amber-400 to-amber-500 text-white px-3 py-1 rounded-full text-[11px] font-bold whitespace-nowrap shadow-lg border-2 border-white flex items-center gap-1">
                    <GitBranch size={10} />
                    分支 {index + 1}
                  </div>
                </div>
                
                <FlowNode node={branch} onAddNext={onAddNext} onAddBranch={onAddBranch} onSelect={onSelect} onDrop={onDrop} onCopy={onCopy} isDraggingGlobal={isDraggingGlobal} setDraggingGlobal={setDraggingGlobal} activeQuickAddId={activeQuickAddId} setActiveQuickAddId={setActiveQuickAddId} hoveredNodeId={hoveredNodeId} setHoveredNodeId={setHoveredNodeId} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 下一个节点 */}
      {node.next && node.next.type !== NodeType.END && (
        <div className="flex flex-col items-center">
          <ConnectorDropZone parentId={node.id} isDraggingGlobal={isDraggingGlobal} onDrop={onDrop} />
          <FlowNode node={node.next} onAddNext={onAddNext} onAddBranch={onAddBranch} onSelect={onSelect} onDrop={onDrop} onCopy={onCopy} isDraggingGlobal={isDraggingGlobal} setDraggingGlobal={setDraggingGlobal} activeQuickAddId={activeQuickAddId} setActiveQuickAddId={setActiveQuickAddId} hoveredNodeId={hoveredNodeId} setHoveredNodeId={setHoveredNodeId} />
        </div>
      )}
      {/* END 节点特殊处理：只显示连接线，不显示 ConnectorDropZone */}
      {node.next && node.next.type === NodeType.END && (
        <div className="flex flex-col items-center">
          <div className="h-8 w-0.5 bg-slate-300"></div>
          <ArrowDown size={14} className="text-slate-300 -mt-1 mb-1" />
          <FlowNode node={node.next} onAddNext={onAddNext} onAddBranch={onAddBranch} onSelect={onSelect} onDrop={onDrop} onCopy={onCopy} isDraggingGlobal={isDraggingGlobal} setDraggingGlobal={setDraggingGlobal} activeQuickAddId={activeQuickAddId} setActiveQuickAddId={setActiveQuickAddId} hoveredNodeId={hoveredNodeId} setHoveredNodeId={setHoveredNodeId} />
        </div>
      )}

    </div>
  );
};

// ==================== 校验 ====================

function validateWorkflow(root: WorkflowNode): string[] {
  const errors: string[] = [];
  let hasEnd = false;
  const checkEnd = (node: WorkflowNode) => {
    if (node.type === NodeType.END) hasEnd = true;
    if (node.next) checkEnd(node.next);
    if (node.branches) node.branches.forEach(checkEnd);
  };
  checkEnd(root);
  if (!hasEnd) errors.push('流程缺少结束节点');
  const checkApprover = (node: WorkflowNode) => {
    if ((node.type === NodeType.APPROVAL || node.type === NodeType.PARALLEL) && !node.approverType && !node.approverValue) {
      errors.push(`${node.type === NodeType.PARALLEL ? '会签' : '审批'}节点"${node.title}"未配置审批人`);
    }
    if (node.next) checkApprover(node.next);
    if (node.branches) node.branches.forEach(checkApprover);
  };
  checkApprover(root);
  const checkTitle = (node: WorkflowNode) => {
    if (!node.title || node.title.trim() === '') errors.push(`有节点缺少名称`);
    if (node.next) checkTitle(node.next);
    if (node.branches) node.branches.forEach(checkTitle);
  };
  checkTitle(root);
  return errors;
}

// ==================== 主组件 ====================

interface WorkflowBuilderProps {
  workflow?: WorkflowDefinition;
  onChange?: (wf: WorkflowDefinition) => void;
  onSave?: (wf: WorkflowDefinition) => void;
  availableForms?: FormDefinition[];
  availableRoles?: any[];
  availableUsers?: User[];
}

export const WorkflowBuilder: React.FC<WorkflowBuilderProps> = ({ workflow, onChange, onSave, availableForms, availableRoles, availableUsers }) => {
  const defaultRoot: WorkflowNode = {
    id: 'node_start', type: NodeType.START, title: '发起申请',
    next: { id: 'node_1', type: NodeType.APPROVAL, title: '部门经理审批', approverType: 'DEPT_MANAGER',
      next: { id: 'node_end', type: NodeType.END, title: '流程结束' }
    }
  };

  const { state: root, set: setRoot, undo, redo, canUndo, canRedo } = useHistory<WorkflowNode>(workflow?.nodes || defaultRoot);
  const [selectedNode, setSelectedNode] = useState<WorkflowNode | null>(null);
  const [saving, setSaving] = useState(false);
  const [workflowName, setWorkflowName] = useState(workflow?.name || '未命名流程');
  const [workflowKey, setWorkflowKey] = useState(workflow?.key || 'new_process');
  const [zoom, setZoom] = useState(1);
  const [isDraggingGlobal, setDraggingGlobal] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [activeQuickAddId, setActiveQuickAddId] = useState<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    message: string;
    onConfirm: () => void;
  }>({ open: false, message: '', onConfirm: () => {} });
  const canvasRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (onChange && workflow) onChange({ ...workflow, nodes: root, name: workflowName, key: workflowKey });
  }, [root, workflowName, workflowKey]);

  const handleZoomIn = useCallback(() => setZoom(z => Math.min(z + 0.1, 2)), []);
  const handleZoomOut = useCallback(() => setZoom(z => Math.max(z - 0.1, 0.3)), []);
  const handleZoomReset = useCallback(() => setZoom(1), []);

  const handleCopyNode = useCallback((nodeId: string) => {
    const node = findNodeById(root, nodeId);
    if (!node || node.type === NodeType.START || node.type === NodeType.END) {
      toast.error('此节点不可复制'); return;
    }
    const copiedNode: WorkflowNode = { ...node, id: `node_${Date.now()}`, title: `${node.title} (副本)`, next: undefined,
      branches: node.branches ? node.branches.map((b, i) => ({ ...b, id: `branch_${Date.now()}_${i}`, next: undefined })) : undefined
    };
    setRoot(updateNodeInTree(root, nodeId, n => ({ ...n, next: n.next ? { ...copiedNode, next: n.next } : copiedNode })));
    toast.success('节点已复制');
  }, [root]);

  const handleAddNext = (parentId: string, type?: NodeType) => {
    const nodeType = type || NodeType.APPROVAL;
    
    // 如果要添加END节点,检查是否已存在END节点
    if (nodeType === NodeType.END && hasEndNode(root)) {
      // 显示自定义确认对话框
      setConfirmDialog({
        open: true,
        message: '流程中已存在结束节点。添加新的结束节点将会删除当前节点之后的所有节点。是否继续?',
        onConfirm: () => {
          // 用户确认,删除后续节点并添加END节点
          const newNode: WorkflowNode = {
            id: `node_${Date.now()}`, type: NodeType.END, title: '流程结束'
          };
          setRoot(updateNodeInTree(root, parentId, node => ({ ...node, next: newNode })));
          toast.success('已添加结束节点');
        }
      });
      return;
    }
    
    const getTitleByType = (type: NodeType): string => {
      switch (type) {
        case NodeType.END: return '流程结束';
        case NodeType.PARALLEL: return '新会签节点';
        case NodeType.NOTIFICATION: return '新通知节点';
        case NodeType.SCRIPT: return '新脚本节点';
        case NodeType.TIMER: return '新定时节点';
        case NodeType.SUBPROCESS: return '新子流程节点';
        case NodeType.MANUAL: return '新人工任务';
        default: return '新审批节点';
      }
    };
    
    const newNode: WorkflowNode = {
      id: `node_${Date.now()}`, type: nodeType,
      title: getTitleByType(nodeType),
      ...(nodeType === NodeType.APPROVAL || nodeType === NodeType.PARALLEL ? { approverType: 'ROLE' as const } : {}),
      ...(nodeType === NodeType.MANUAL ? { approverType: 'ROLE' as const } : {})
    };
    setRoot(updateNodeInTree(root, parentId, node => ({ ...node, next: node.next ? { ...newNode, next: node.next } : newNode })));
  };

  const handleAddBranch = (parentId: string) => {
    const parentNode = findNodeById(root, parentId);
    const newBranch: WorkflowNode = { id: `branch_${Date.now()}`, type: NodeType.CONDITION, title: '新分支', condition: 'amount > 0' };
    // 根据父节点类型决定默认分支策略
    const defaultStrategy = parentNode?.type === NodeType.PARALLEL ? 'PARALLEL' : 'EXCLUSIVE';
    setRoot(updateNodeInTree(root, parentId, node => ({ 
      ...node, 
      branches: [...(node.branches || []), newBranch], 
      branchStrategy: node.branchStrategy || defaultStrategy 
    })));
  };

  const handleUpdateNode = (id: string, data: Partial<WorkflowNode>) => {
    setRoot(updateNodeInTree(root, id, node => ({ ...node, ...data })));
    setSelectedNode(prev => prev && prev.id === id ? { ...prev, ...data } : prev);
  };

  const handleDeleteNode = (id: string) => {
    if (id === root.id) { toast.error('开始节点不可删除'); return; }
    const node = findNodeById(root, id);
    if (node?.type === NodeType.END) { toast.error('结束节点不可删除'); return; }
    const newRoot = deleteNodeInTree(root, id);
    if (newRoot) { setRoot(newRoot); setSelectedNode(null); toast.success('节点已删除'); }
  };

  const handleDrop = (dragId: string, dropId: string) => {
    const dragNode = findNodeById(root, dragId);
    if (!dragNode) return;
    
    // 检查被拖拽的节点是否是分支节点
    const checkIfBranchNode = (root: WorkflowNode, targetId: string): boolean => {
      if (root.branches) {
        for (const branch of root.branches) {
          if (branch.id === targetId) return true;
          if (checkIfBranchNode(branch, targetId)) return true;
        }
      }
      if (root.next) return checkIfBranchNode(root.next, targetId);
      return false;
    };
    
    // 如果是分支节点，警告用户
    if (checkIfBranchNode(root, dragId)) {
      toast.error('分支节点不能移动，这会破坏流程结构');
      return;
    }
    
    let newRoot = deleteNodeInTree(root, dragId);
    if (newRoot) {
      const nodeToInsert = { ...dragNode, next: undefined };
      newRoot = updateNodeInTree(newRoot, dropId, node => ({ ...node, next: { ...nodeToInsert, next: node.next } }));
      setRoot(newRoot);
      toast.success('节点已移动');
    }
  };

  const handleApplyTemplate = (template: WorkflowTemplate) => {
    setRoot(template.nodes);
    setWorkflowName(template.name);
    toast.success(`已应用模板: ${template.name}`);
  };

  const handleSave = async () => {
    const errors = validateWorkflow(root);
    if (errors.length > 0) { errors.forEach(err => toast.error(err)); return; }
    if (!workflowName || workflowName.trim() === '') { toast.error('请输入流程名称'); return; }
    if (onSave && workflow) {
      setSaving(true);
      try { await onSave({ ...workflow, nodes: root, name: workflowName, key: workflowKey }); } finally { setSaving(false); }
      return;
    }
    try {
      setSaving(true);
      await saveProcessDefinition({ processName: workflowName, processKey: workflowKey, modelJson: JSON.stringify(root) });
      toast.success('流程已保存');
    } catch (e) { console.error(e); toast.error('保存失败'); } finally { setSaving(false); }
  };

  const handleDeploy = async () => {
    const errors = validateWorkflow(root);
    if (errors.length > 0) { errors.forEach(err => toast.error(err)); return; }
    try {
      setSaving(true);
      const definition = { id: workflow?.id?.startsWith('new_') ? undefined : workflow?.id, processName: workflowName, processKey: workflowKey, modelJson: JSON.stringify(root) };
      const saveRes = await saveProcessDefinition(definition);
      const definitionId = (saveRes as any)?.id || saveRes;
      if (definitionId) { await deployProcessDefinition(String(definitionId)); toast.success('流程已发布并上线！'); }
      else { toast.error('发布失败：无法获取流程ID'); }
    } catch (e) { console.error(e); toast.error('发布失败'); } finally { setSaving(false); }
  };

  return (
    <div className="h-full flex flex-col bg-slate-100 overflow-hidden relative">
      {/* 工具栏 */}
      <div className="h-12 bg-white border-b px-4 flex items-center justify-between shadow-sm z-20">
        <div className="flex items-center gap-3">
          <GitMerge size={16} className="text-indigo-600" />
          <input value={workflowName} onChange={e => setWorkflowName(e.target.value)}
            className="text-sm font-bold text-slate-700 bg-transparent border-none focus:ring-0 focus:outline-none hover:bg-slate-50 px-2 py-1 rounded transition-colors"
            placeholder="请输入流程名称" />
        </div>
        <div className="flex items-center gap-3">
          {/* 模板按钮 */}
          <button onClick={() => setShowTemplates(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors">
            <Sparkles size={14} /> 模板
          </button>
          <div className="h-6 w-px bg-slate-200"></div>
          {/* 撤销/重做 */}
          <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
            <button onClick={undo} disabled={!canUndo} className={`p-1.5 rounded ${!canUndo ? 'text-slate-300' : 'text-slate-600 hover:bg-white hover:shadow-sm'}`} title="撤销"><Undo2 size={16} /></button>
            <button onClick={redo} disabled={!canRedo} className={`p-1.5 rounded ${!canRedo ? 'text-slate-300' : 'text-slate-600 hover:bg-white hover:shadow-sm'}`} title="重做"><Redo2 size={16} /></button>
          </div>
          <div className="h-6 w-px bg-slate-200"></div>
          <div className="flex gap-2">
            <button onClick={handleSave} disabled={saving}
              className="flex items-center gap-1 px-3 py-1.5 bg-indigo-50 text-indigo-600 text-xs font-medium rounded-lg hover:bg-indigo-100 transition-colors">
              <Save size={14} /> {saving ? '保存中...' : '保存'}
            </button>
            <button onClick={handleDeploy}
              className="flex items-center gap-1 px-3 py-1.5 bg-indigo-600 text-white text-xs font-medium rounded-lg shadow hover:bg-indigo-700 transition-colors">
              <UploadCloud size={14} /> 发布
            </button>
          </div>
        </div>
      </div>

      {/* 画布 */}
      <div ref={canvasRef} className={`flex-1 overflow-auto p-10 flex justify-center custom-scrollbar cursor-grab active:cursor-grabbing bg-grid-slate-100 relative transition-all duration-200 ${selectedNode ? 'mr-80' : ''}`}>
        {/* 缩放控件 */}
        <div className="absolute bottom-4 right-4 z-20 flex items-center gap-1 bg-white rounded-lg shadow-md border border-slate-200 p-1">
          <button onClick={handleZoomOut} className="p-1.5 hover:bg-slate-100 rounded text-slate-600" title="缩小"><ZoomOut size={16} /></button>
          <span className="text-xs text-slate-500 min-w-[40px] text-center font-mono">{Math.round(zoom * 100)}%</span>
          <button onClick={handleZoomIn} className="p-1.5 hover:bg-slate-100 rounded text-slate-600" title="放大"><ZoomIn size={16} /></button>
          <div className="w-px h-4 bg-slate-200 mx-0.5" />
          <button onClick={handleZoomReset} className="p-1.5 hover:bg-slate-100 rounded text-slate-600" title="重置缩放"><Maximize2 size={16} /></button>
        </div>

        {/* 拖拽全局提示 */}
        {isDraggingGlobal && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 bg-indigo-600 text-white text-xs px-4 py-2 rounded-full shadow-lg flex items-center gap-2">
            <Move size={14} /> 拖拽节点到连接线上的"拖到这里"区域即可移动
          </div>
        )}

        <div className="min-w-[800px] flex justify-center pb-40 transition-transform origin-top" style={{ transform: `scale(${zoom})` }}
          onClick={() => setActiveQuickAddId(null)}>
          <FlowNode 
            node={root} 
            onAddNext={handleAddNext} 
            onAddBranch={handleAddBranch} 
            onSelect={setSelectedNode}
            onDrop={handleDrop} 
            onCopy={handleCopyNode} 
            isDraggingGlobal={isDraggingGlobal} 
            setDraggingGlobal={setDraggingGlobal}
            activeQuickAddId={activeQuickAddId} 
            setActiveQuickAddId={setActiveQuickAddId}
            hoveredNodeId={hoveredNodeId}
            setHoveredNodeId={setHoveredNodeId}
          />
        </div>
      </div>

      {/* 属性面板 */}
      {selectedNode && (
        <PropertyPanel node={selectedNode} onClose={() => setSelectedNode(null)} onUpdate={handleUpdateNode} onDelete={handleDeleteNode} />
      )}

      {/* 模板选择器 */}
      <TemplatePickerModal open={showTemplates} onClose={() => setShowTemplates(false)} onSelect={handleApplyTemplate} />

      {/* 确认对话框 */}
      <ConfirmDialog
        open={confirmDialog.open}
        title="确认操作"
        message={confirmDialog.message}
        confirmText="确定"
        cancelText="取消"
        variant="warning"
        onConfirm={confirmDialog.onConfirm}
        onCancel={() => setConfirmDialog({ open: false, message: '', onConfirm: () => {} })}
      />
    </div>
  );
};
