import {
  ClipboardCheck, Mail, Hand, Users, UserCheck, Percent, ListOrdered, Scale,
  Forward, Share2, Undo2, UserPlus, UserMinus, CornerUpLeft, CornerUpRight,
  CheckCircle2, XCircle, SkipForward, type LucideIcon,
} from 'lucide-react';
import type { WorkflowTaskType } from '@/types/workflowSemantic';
import { cn } from '@/utils/cn';

const neutralTone = 'text-cf-muted';
const approvalTone = 'text-cyan-700 dark:text-cyan-200';
const changeTone = 'text-amber-700 dark:text-amber-200';
const successTone = 'text-emerald-700 dark:text-emerald-200';
const rejectionTone = 'text-rose-700 dark:text-rose-200';

export const WORKFLOW_TASK_SEMANTICS: Record<WorkflowTaskType, { label: string; icon: LucideIcon; tone: string }> = {
  APPROVAL: { label: '审批', icon: ClipboardCheck, tone: approvalTone },
  CC: { label: '抄送', icon: Mail, tone: neutralTone },
  MANUAL: { label: '人工处理', icon: Hand, tone: approvalTone },
  COUNTERSIGN: { label: '会签', icon: Users, tone: approvalTone },
  OR_SIGN: { label: '或签', icon: UserCheck, tone: approvalTone },
  PERCENT_SIGN: { label: '比例签', icon: Percent, tone: approvalTone },
  SEQUENTIAL_SIGN: { label: '顺序签', icon: ListOrdered, tone: approvalTone },
  WEIGHT_SIGN: { label: '权重票签', icon: Scale, tone: approvalTone },
  TRANSFER: { label: '转办', icon: Forward, tone: changeTone },
  DELEGATE: { label: '委派', icon: Share2, tone: changeTone },
  DELEGATE_RETURN: { label: '委派归还', icon: Undo2, tone: changeTone },
  ADD_SIGN: { label: '加签', icon: UserPlus, tone: changeTone },
  REDUCE_SIGN: { label: '减签', icon: UserMinus, tone: changeTone },
  REJECT: { label: '驳回', icon: CornerUpLeft, tone: rejectionTone },
  REJECT_JUMP: { label: '驳回跳转', icon: CornerUpRight, tone: rejectionTone },
  AUTO_PASS: { label: '自动通过', icon: CheckCircle2, tone: successTone },
  AUTO_REJECT: { label: '自动驳回', icon: XCircle, tone: rejectionTone },
  AUTO_SKIP: { label: '自动跳过', icon: SkipForward, tone: neutralTone },
};

export const getTaskSemantic = (taskType?: string) =>
  taskType && Object.prototype.hasOwnProperty.call(WORKFLOW_TASK_SEMANTICS, taskType)
    ? WORKFLOW_TASK_SEMANTICS[taskType as WorkflowTaskType] : null;

export const TaskSemanticIcon = ({ taskType, size = 16, className }: { taskType?: string; size?: number; className?: string }) => {
  const semantic = getTaskSemantic(taskType);
  if (!semantic) return null;
  const Icon = semantic.icon;
  return <Icon size={size} aria-hidden="true" className={cn(semantic.tone, className)} />;
};

export const TaskSemanticBadge = ({ taskType, className }: { taskType?: string; className?: string }) => {
  const semantic = getTaskSemantic(taskType);
  if (!semantic) return null;
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-md border border-current/15 bg-[var(--cf-surface-muted)] px-1.5 py-0.5 text-[10px] font-medium', semantic.tone, className)}>
      <TaskSemanticIcon taskType={taskType} size={12} />{semantic.label}
    </span>
  );
};
