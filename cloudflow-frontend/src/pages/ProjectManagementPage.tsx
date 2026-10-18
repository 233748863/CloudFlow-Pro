import React, { useEffect, useMemo, useRef, useState } from 'react';
import { getConfigIntSync } from '../hooks/useSystemConfig';
import { SYS_PAGE_DEFAULT_PAGE_SIZE } from '../constants/sysConfig';
import { useWorkflowRefresh } from '@/hooks/useWorkflowRefresh';
import { useLocation, useNavigate } from 'react-router-dom';
import { CalendarRange, CircleDollarSign, Coins, Edit, Eye, FolderKanban, Hash, Plus, Send, Trash2, Users, AlertTriangle, ListTree, Target, Archive, Link2, RefreshCcw, Search } from 'lucide-react';
import { toast } from 'sonner';
import { DndContext, DragEndEvent, PointerSensor, useDraggable, useSensor, useSensors } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { projectApi, Project, ProjectDependency, ProjectDetail, ProjectMember, ProjectMilestone, ProjectRisk, ProjectWbsTask } from '@/services/api/project';
import { crmApi, CrmCustomer } from '@/services/api/crm';
import { contractApi, OaContract } from '@/services/api/contractRisk';
import { getDeptTree, getUserList, SysDept, SysUser } from '@/services/api/auth';
import { useAuth } from '@/context/AuthContext';
import { getErrorMessage } from '@/utils/errorMessage';
import { BaseDialog } from '@/components/common/BaseDialog';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { InnerTableSurface, TablePageLayout } from '@/components/layout/TablePageLayout';
import { Pagination } from '@/components/common/Pagination';
import { Button, DatePicker, DeptSelector, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Tabs, TabsContent, TabsList, TabsTrigger, Textarea, UserSelector } from '@/components/common';
import { formatDateTimeDisplay } from '@/utils/dateFormat';
import { useDict } from '@/hooks/useDict';
import { cn } from '@/utils/cn';
import './ProjectManagementPage.css';
import ProjectTaskFields from '@/components/oa/operations/ProjectTaskFields';
import ProjectOperationsPanel from '@/components/oa/operations/ProjectOperationsPanel';
import ProjectTaskTree from '@/components/oa/operations/ProjectTaskTree';
import ProjectGanttDependencies, { projectDependencyLabels } from '@/components/oa/operations/ProjectGanttDependencies';
import { FormFields, optionsOf } from '@/components/oa/operations/RecordEditor';

const STATUS_OPTIONS = ['DRAFT', 'PENDING', 'APPROVED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'ARCHIVED'] as const;
const RISK_LEVELS = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
type DetailTab = 'overview' | 'gantt' | 'milestone' | 'wbs' | 'cost' | 'risk' | 'linkage';
type ChildDialog =
  | { type: 'member'; item?: ProjectMember | null }
  | { type: 'milestone'; item?: ProjectMilestone | null }
  | { type: 'wbs'; item?: ProjectWbsTask | null }
  | { type: 'risk'; item?: ProjectRisk | null }
  | { type: 'dependency'; item?: ProjectDependency | null }
  | null;

const emptyForm: Project = {
  projectName: '',
  projectType: 'DELIVERY',
  budgetAmount: 0,
  progress: 0,
  priority: 'MEDIUM',
  status: 'DRAFT',
  riskLevel: 'LOW',
  sourceType: 'MANUAL',
  remark: '',
};

const emptyMember: ProjectMember = {
  userId: 0,
  userName: '',
  roleCode: 'MEMBER',
  roleName: '项目成员',
  billableFlag: 1,
};

const emptyMilestone: ProjectMilestone = {
  subject: '',
  status: 'NOT_STARTED',
  isMilestoneFlag: 1,
  taskWeight: 3,
  progress: 0,
};

const emptyWbs: ProjectWbsTask = {
  subject: '',
  status: 'NOT_STARTED',
  priority: 1,
  progress: 0,
  plannedHours: 0,
  actualHours: 0,
};

const emptyRisk: ProjectRisk = {
  riskName: '',
  riskLevel: 'MEDIUM',
  status: 'OPEN',
  triggerSource: 'MANUAL',
};

const emptyDependency: ProjectDependency = {


  dependencyType: 'FINISH_TO_START',
  lagDays: 0,
};

const fieldLabelClassName = 'text-xs font-medium text-cf-subtle';

const tabs: Array<{ value: DetailTab; label: string; icon: React.ReactNode }> = [
  { value: 'overview', label: '概览', icon: <FolderKanban size={14} /> },
  { value: 'gantt', label: '甘特图', icon: <CalendarRange size={14} /> },
  { value: 'milestone', label: '里程碑', icon: <Target size={14} /> },
  { value: 'wbs', label: 'WBS', icon: <ListTree size={14} /> },
  { value: 'cost', label: '成本', icon: <Archive size={14} /> },
  { value: 'risk', label: '风险', icon: <AlertTriangle size={14} /> },
  { value: 'linkage', label: '业务联动', icon: <Link2 size={14} /> },
];

const toDateInput = (value?: string) => value ? String(value).slice(0, 10) : '';
const DAY_WIDTH = 40;
const GANTT_FULL_LABEL_MIN_WIDTH = 160;
const GANTT_COMPACT_LABEL_MIN_WIDTH = 96;
const GANTT_SHORT_LABEL_MIN_WIDTH = 48;
const GANTT_MARKER_SIZE = 16;
const formatMoney = (value?: number) => `¥${Number(value || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const ProjectDetailMetric: React.FC<{
  label: string;
  value: React.ReactNode;
  meta?: React.ReactNode;
  icon: React.ReactNode;
  tone?: 'blue' | 'green' | 'amber' | 'violet';
}> = ({ label, value, meta, icon, tone = 'blue' }) => (
  <article className={cn('card admin-source-stat', `admin-source-tone-${tone}`, 'admin-project-detail-metric')}>
    <span className="admin-source-stat-icon">{icon}</span>
    <div className="min-w-0">
      <p>{label}</p>
      <strong title={typeof value === 'string' || typeof value === 'number' ? String(value) : undefined}>{value}</strong>
      {meta ? <span>{meta}</span> : null}
    </div>
  </article>
);

const ProjectDetailPanel: React.FC<{
  title: string;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
}> = ({ title, children, className, contentClassName }) => (
  <section className={cn('admin-project-detail-panel', className)}>
    <div className="admin-project-detail-panel-head">
      <div>
        <h3>{title}</h3>
      </div>
    </div>
    <div className={cn('admin-project-detail-panel-body', contentClassName)}>{children}</div>
  </section>
);
const normalizeRows = <T,>(result: T[] | { rows?: T[]; records?: T[] } | null | undefined): T[] =>
  Array.isArray(result) ? result : result?.rows || result?.records || [];
const flattenDeptOptions = (items: SysDept[] = [], prefix = ''): Array<{ label: string; value: number }> =>
  items.flatMap((item) => {
    const label = prefix ? `${prefix} / ${item.deptName}` : item.deptName;
    const current = item.deptId ? [{ label, value: item.deptId }] : [];
    return [...current, ...flattenDeptOptions(item.children || [], label)];
  });
const getUserDisplayText = (user?: Partial<SysUser> | null, fallbackName?: string) => {
  const primary = String(user?.nickName || fallbackName || user?.userName || '').trim();
  const secondary = [
    user?.userName && user.userName !== primary ? user.userName : '',
    user?.deptName || '',
  ].filter(Boolean).join(' / ');
  if (primary) {
    return secondary ? `${primary} / ${secondary}` : primary;
  }
  return secondary;
};
const renderSelectText = (valueText: string, placeholder: string) => (
  <span className={`min-w-0 flex-1 truncate ${valueText ? 'text-cf-title ' : 'text-cf-faint '}`}>
    {valueText || placeholder}
  </span>
);
const renderUserOption = (user: SysUser) => {
  const primary = String(user.nickName || user.userName || '').trim();
  const secondary = [
    user.userName && user.userName !== primary ? user.userName : '',
    user.deptName || '',
  ].filter(Boolean).join(' / ');

  return (
    <div className="flex min-w-0 flex-col">
      <span className="truncate font-medium text-cf-title">{primary || '未命名成员'}</span>
      {secondary ? (
        <span className="truncate text-xs text-cf-subtle">{secondary}</span>
      ) : null}
    </div>
  );
};
const addDays = (dateString: string, days: number) => {
  const date = new Date(`${dateString}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};
const diffDays = (start: string, end: string) => {
  const left = new Date(`${start}T00:00:00Z`).getTime();
  const right = new Date(`${end}T00:00:00Z`).getTime();
  return Math.round((right - left) / (24 * 60 * 60 * 1000));
};

const compactGanttText = (value: string, maxLength: number) => {
  const normalized = value.trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, maxLength - 1))}…`;
};

const resolveExternalLabelStyle = (anchorLeft: number, timelineWidth: number) => {
  if (anchorLeft > timelineWidth - 140) {
    return { right: `${Math.max(0, timelineWidth - anchorLeft + 8)}px` };
  }
  return { left: `${anchorLeft + 8}px` };
};

const DraggableGanttBar: React.FC<{
  id: string;
  width: number;
  left: number;
  baselineLeft?: number;
  baselineWidth?: number;
  colorClassName: string;
  fullLabel: string;
  compactLabel: string;
  shortLabel: string;
  kind: 'milestone' | 'wbs';
  timelineWidth: number;
  disabled: boolean;
}> = ({ id, width, left, baselineLeft, baselineWidth, colorClassName, fullLabel, compactLabel, shortLabel, kind, timelineWidth, disabled }) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id, disabled });
  const markerLeft = left + Math.max(0, width / 2 - GANTT_MARKER_SIZE / 2);
  const baseStyle = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.8 : 1,
  } as React.CSSProperties;
  const displayLabel = width >= GANTT_FULL_LABEL_MIN_WIDTH
    ? fullLabel
    : width >= GANTT_COMPACT_LABEL_MIN_WIDTH
      ? compactLabel
      : width >= GANTT_SHORT_LABEL_MIN_WIDTH
        ? shortLabel
        : '';
  const showExternalLabel = kind === 'milestone' || width < GANTT_SHORT_LABEL_MIN_WIDTH;
  const externalLabel = kind === 'milestone' ? compactLabel : compactLabel || fullLabel;
  const externalLabelStyle = resolveExternalLabelStyle(kind === 'milestone' ? markerLeft + GANTT_MARKER_SIZE : left + width, timelineWidth);

  return (
    <>
      {kind === 'milestone' ? (
        <>
          {baselineLeft !== undefined ? (
            <div
              className="absolute top-1/2 h-3 w-3 -translate-y-1/2 rotate-45 rounded-[3px] border border-slate-300 bg-[var(--cf-surface-strong)] dark:border-slate-600 dark:bg-slate-900"
              style={{ left: `${baselineLeft + Math.max(0, (baselineWidth || DAY_WIDTH) / 2 - 6)}px` }}
            />
          ) : null}
          <button
            ref={setNodeRef}
            type="button"
            className={`absolute top-1/2 z-10 h-4 w-4 -translate-y-1/2 rounded-[4px] rotate-45 transition ${colorClassName}`}
            style={{ ...baseStyle, left: `${markerLeft}px` }}
            data-tooltip={`${fullLabel}，拖动可按日改期`}
            aria-label={disabled ? `${fullLabel}，当前排期` : `${fullLabel}，拖动可按日改期`}
            data-gantt-task={Number(id.slice(2))}
            disabled={disabled}
            {...listeners}
            {...attributes}
          />
        </>
      ) : (
        <>
          {baselineLeft !== undefined && baselineWidth ? (
            <div
              className="absolute top-1/2 h-2 -translate-y-1/2 rounded-md bg-slate-300/70 dark:bg-slate-700/70"
              style={{ left: `${baselineLeft}px`, width: `${baselineWidth}px` }}
            />
          ) : null}
          <button
            ref={setNodeRef}
            type="button"
            className={`absolute top-1/2 z-10 h-8 -translate-y-1/2 rounded-md px-3 text-left text-xs font-medium text-white transition ${colorClassName}`}
            style={{ ...baseStyle, width: `${width}px`, left: `${left}px` }}
            data-tooltip={`${fullLabel}，拖动可按日改期`}
            aria-label={disabled ? `${fullLabel}，当前排期` : `${fullLabel}，拖动可按日改期`}
            data-gantt-task={Number(id.slice(2))}
            disabled={disabled}
            {...listeners}
            {...attributes}
          >
            {displayLabel ? <span className="block truncate">{displayLabel}</span> : null}
          </button>
        </>
      )}
      {showExternalLabel ? (
        <div
          className={`pointer-events-none absolute top-1/2 z-20 max-w-[180px] -translate-y-1/2 truncate rounded-md border px-2 py-1 text-[11px] font-medium ${
 kind === 'milestone'
 ? 'border-cyan-200 bg-cyan-50/95 text-cyan-700 dark:border-cyan-900 dark:bg-cyan-950/95 dark:text-cyan-200'
 : 'border-slate-200 bg-[var(--cf-surface-strong)] text-cf-muted dark:border-slate-700 dark:bg-slate-900 '
 }`}
          style={externalLabelStyle}
          data-tooltip={fullLabel}
        >
          {externalLabel}
        </div>
      ) : null}
    </>
  );
};

export default function ProjectManagementPage() {
  const { hasPermission } = useAuth();
  const canViewCosts = hasPermission('oa:activity-cost:list');
  const statusDict = useDict('oa_project_status');
  const sourceTypeDict = useDict('oa_project_source_type');
  const severityDict = useDict('severity_level');
  const navigate = useNavigate();
  const location = useLocation();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const [rows, setRows] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [pageNum, setPageNum] = useState(1);
  const [keyword, setKeyword] = useState('');
  const [status, setStatus] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detail, setDetail] = useState<ProjectDetail | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>('overview');
  const [editing, setEditing] = useState<Project | null>(null);
  const [form, setForm] = useState<Project>(emptyForm);
  const [confirm, setConfirm] = useState<{ type: 'delete' | 'submit' | 'archive' | 'baseline'; row: Project } | null>(null);
  const [childDialog, setChildDialog] = useState<ChildDialog>(null);
  const [memberForm, setMemberForm] = useState<ProjectMember>(emptyMember);
  const [milestoneForm, setMilestoneForm] = useState<ProjectMilestone>(emptyMilestone);
  const [wbsForm, setWbsForm] = useState<ProjectWbsTask>(emptyWbs);
  const [riskForm, setRiskForm] = useState<ProjectRisk>(emptyRisk);
  const [dependencyForm, setDependencyForm] = useState<ProjectDependency>(emptyDependency);
  const [customerOptions, setCustomerOptions] = useState<CrmCustomer[]>([]);
  const [contractOptions, setContractOptions] = useState<OaContract[]>([]);
  const [userOptions, setUserOptions] = useState<SysUser[]>([]);
  const [deptOptions, setDeptOptions] = useState<Array<{ label: string; value: number }>>([]);
  const selectedOwner = form.ownerId ? userOptions.find((item) => item.userId === form.ownerId) : undefined;
  const selectedMember = memberForm.userId ? userOptions.find((item) => item.userId === memberForm.userId) : undefined;
  const selectedDept = form.deptId ? deptOptions.find((item) => item.value === form.deptId) : undefined;

  const pageSize = getConfigIntSync(SYS_PAGE_DEFAULT_PAGE_SIZE, 10);
  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [pageSize, total]);

  const load = async () => {
    setLoading(true);
    try {
      const result = await projectApi.list({ pageNum, pageSize, projectName: keyword, status: status || undefined });
      setRows(result.rows || []);
      setTotal(result.total || 0);
    } catch (error) {
      toast.error(getErrorMessage(error, '加载项目失败'));
    } finally {
      setLoading(false);
    }
  };

  const loadReferences = async () => {
    if (!hasPermission('oa:project:add') && !hasPermission('oa:project:edit')) return;
    try {
      const [customerResult, contractResult, userResult, deptTreeResult] = await Promise.all([
        crmApi.listCustomers({ pageNum: 1, pageSize: 200 }),
        contractApi.list({ pageNum: 1, pageSize: 200 }),
        getUserList({ pageNum: 1, pageSize: 200 }) as Promise<SysUser[] | { rows?: SysUser[]; records?: SysUser[] }>,
        getDeptTree() as Promise<SysDept[]>,
      ]);
      setCustomerOptions(customerResult.rows || []);
      setContractOptions(contractResult.rows || []);
      setUserOptions(normalizeRows(userResult));
      setDeptOptions(flattenDeptOptions(deptTreeResult || []));
    } catch (error) {
      toast.error(getErrorMessage(error, '加载项目候选数据失败'));
    }
  };

  useEffect(() => {
    void load();
  }, [pageNum, keyword, status]);

  useWorkflowRefresh(load, 'project_approval');

  useEffect(() => {
    void loadReferences();
  }, []);

  useEffect(() => {
    const state = location.state as { focusProjectId?: number } | null;
    if (!state?.focusProjectId) return;
    const openFocusedDetail = async () => {
      try {
        const result = await projectApi.getDetail(state.focusProjectId!);
        setDetail(result);
      } catch (error) {
        toast.error(getErrorMessage(error, '加载项目详情失败'));
      } finally {
        navigate(location.pathname, { replace: true, state: {} });
      }
    };
    void openFocusedDetail();
  }, [location.pathname, location.state, navigate]);

  const refreshDetail = async (projectId: number) => {
    const result = await projectApi.getDetail(projectId);
    setDetail(previous => previous?.project.projectId === projectId ? result : previous);
    return result.wbsTasks;
  };

  const saveProject = async () => {
    try {
      if (editing?.projectId) {
        await projectApi.edit({ ...form, projectId: editing.projectId });
        toast.success('项目已更新');
      } else {
        await projectApi.add(form);
        toast.success('项目已创建');
      }
      setDialogOpen(false);
      setEditing(null);
      setForm(emptyForm);
      await load();
    } catch (error) {
      toast.error(getErrorMessage(error, '保存项目失败'));
    }
  };

  const openChildDialog = (next: ChildDialog) => {
    setChildDialog(next);
    if (!next) {
      setMemberForm(emptyMember);
      setMilestoneForm(emptyMilestone);
      setWbsForm(emptyWbs);
      setRiskForm(emptyRisk);
      setDependencyForm(emptyDependency);
      return;
    }
    if (next.type === 'member') setMemberForm(next.item || emptyMember);
    if (next.type === 'milestone') setMilestoneForm(next.item || emptyMilestone);
    if (next.type === 'wbs') setWbsForm(next.item || emptyWbs);
    if (next.type === 'risk') setRiskForm(next.item || emptyRisk);
    if (next.type === 'dependency') setDependencyForm(next.item || emptyDependency);
  };

  const saveChild = async () => {
    if (!detail?.project.projectId || !childDialog) return;
    try {
      if (childDialog.type === 'member') {
        const payload = { ...memberForm, projectId: detail.project.projectId };
        if (memberForm.id) await projectApi.editMember(payload); else await projectApi.addMember(payload);
      }
      if (childDialog.type === 'milestone') {
        const payload = { ...milestoneForm, projectId: detail.project.projectId };
        if (milestoneForm.taskId) await projectApi.editMilestone(payload); else await projectApi.addMilestone(payload);
      }
      if (childDialog.type === 'wbs') {
        const payload = { ...wbsForm, projectId: detail.project.projectId };
        if (wbsForm.taskId) await projectApi.editWbs(payload); else await projectApi.addWbs(payload);
      }
      if (childDialog.type === 'risk') {
        const payload = { ...riskForm, projectId: detail.project.projectId };
        if (riskForm.riskId) await projectApi.editRisk(payload); else await projectApi.addRisk(payload);
      }
      if (childDialog.type === 'dependency') {
        const payload = { ...dependencyForm, projectId: detail.project.projectId };
        if (dependencyForm.dependencyId) await projectApi.editDependency(payload); else await projectApi.addDependency(payload);
      }
      toast.success('已保存');
      openChildDialog(null);
      await refreshDetail(detail.project.projectId);
      await load();
    } catch (error) {
      toast.error(getErrorMessage(error, '保存失败'));
    }
  };

  const removeChild = async (type: ChildDialog['type'], id: number) => {
    if (!detail?.project.projectId) return;
    try {
      if (type === 'member') await projectApi.removeMember([id]);
      if (type === 'milestone') await projectApi.removeMilestone([id]);
      if (type === 'wbs') await projectApi.removeWbs([id]);
      if (type === 'risk') await projectApi.removeRisk([id]);
      if (type === 'dependency') await projectApi.removeDependency([id]);
      toast.success('已删除');
      await refreshDetail(detail.project.projectId);
      await load();
    } catch (error) {
      toast.error(getErrorMessage(error, '删除失败'));
    }
  };

  const ganttContainer = useRef<HTMLDivElement>(null);
  const ganttRows = useMemo(() => {
    if (!detail) return [];
    const milestoneRows = detail.milestones.map((item) => ({
      key: `m-${item.taskId}`,
      label: `里程碑 / ${item.subject}`,
      compactLabel: compactGanttText(item.subject || '里程碑', 10),
      shortLabel: '里程碑',
      start: item.plannedEnd?.slice(0, 10) || '',
      end: item.plannedEnd?.slice(0, 10) || '',
      baselineStart: (item.baselineEnd || item.plannedEnd)?.slice(0, 10) || '',
      baselineEnd: (item.baselineEnd || item.plannedEnd)?.slice(0, 10) || '',
      kind: 'milestone' as const,
      overdue: item.plannedEnd ? diffDays(item.plannedEnd, new Date().toISOString().slice(0, 10)) > 0 && !item.actualEnd : false,
    }));
    const wbsRows = detail.wbsTasks.filter(item => !item.isMilestoneFlag).map((item) => ({
      key: `w-${item.taskId}`,
      label: `WBS / ${item.taskNo || '-'} ${item.subject || ''}`,
      compactLabel: `${item.taskNo || 'WBS'} ${compactGanttText(item.subject || '任务', 12)}`,
      shortLabel: item.taskNo || compactGanttText(item.subject || '任务', 4),
      start: item.plannedStart ? String(item.plannedStart).slice(0, 10) : '',
      end: item.plannedEnd ? String(item.plannedEnd).slice(0, 10) : '',
      baselineStart: item.baselineStart ? String(item.baselineStart).slice(0, 10) : '',
      baselineEnd: item.baselineEnd ? String(item.baselineEnd).slice(0, 10) : '',
      kind: 'wbs' as const,
      overdue: item.plannedEnd ? diffDays(String(item.plannedEnd).slice(0, 10), new Date().toISOString().slice(0, 10)) > 0 && !item.actualEnd : false,
    }));
    return [...milestoneRows, ...wbsRows].filter((item) => item.start && item.end);
  }, [detail]);

  const ganttDateColumns = useMemo(() => {
    if (!ganttRows.length) return [];
    const dates = ganttRows.flatMap((item) => [item.start, item.end, item.baselineStart, item.baselineEnd].filter(Boolean));
    const minDate = dates.reduce((acc, item) => acc < item ? acc : item, dates[0]);
    const maxDate = dates.reduce((acc, item) => acc > item ? acc : item, dates[0]);
    const total = diffDays(minDate, maxDate);
    return Array.from({ length: total + 1 }).map((_, index) => addDays(minDate, index));
  }, [ganttRows]);

  const handleGanttDragEnd = async (event: DragEndEvent) => {
    if (!hasPermission('oa:project:wbs') || !event.delta?.x || !detail?.project.projectId || !ganttDateColumns.length) return;
    const offsetDays = Math.round(event.delta.x / DAY_WIDTH);
    if (!offsetDays) return;
    const blockKey = String(event.active.id);
    try {
      if (blockKey.startsWith('m-')) {
        const taskId = Number(blockKey.replace('m-', ''));
        const milestone = detail.milestones.find((item) => item.taskId === taskId);
        if (!milestone?.plannedEnd) return;
        await projectApi.editMilestone({
          ...milestone,
          projectId: detail.project.projectId,
          plannedStart: `${addDays(milestone.plannedEnd.slice(0, 10), offsetDays)} 00:00:00`,
          plannedEnd: `${addDays(milestone.plannedEnd.slice(0, 10), offsetDays)} 00:00:00`,
        });
      }
      if (blockKey.startsWith('w-')) {
        const taskId = Number(blockKey.replace('w-', ''));
        const task = detail.wbsTasks.find((item) => item.taskId === taskId);
        if (!task?.plannedStart || !task?.plannedEnd) return;
        const start = addDays(String(task.plannedStart).slice(0, 10), offsetDays);
        const end = addDays(String(task.plannedEnd).slice(0, 10), offsetDays);
        await projectApi.editWbs({
          ...task,
          projectId: detail.project.projectId,
          plannedStart: `${start} 00:00:00`,
          plannedEnd: `${end} 00:00:00`,
        });
      }
      toast.success('排期已改期');
      await refreshDetail(detail.project.projectId);
      await load();
    } catch (error) {
      toast.error(getErrorMessage(error, '甘特改期失败'));
    }
  };

  const linkageCards = useMemo(() => {
    if (!detail?.linkSummary) return [];
    return [
      { label: '来源对象', value: detail.linkSummary.sourceName || `${sourceTypeDict.getLabel(detail.linkSummary.sourceType || '') || '-'} / ${detail.linkSummary.sourceId || '-'}` },
      { label: '合同联动', value: detail.linkSummary.contractNo || '-' },
      { label: '预算摘要', value: detail.linkSummary.budgetSummary || '-' },
      { label: '发票摘要', value: detail.linkSummary.invoiceSummary || '-' },
    ];
  }, [detail]);



  const pageActions = (
    <div className="grid gap-5">
      <header className="admin-source-header">
        <div>
          <p className="admin-source-kicker">PROJECT MANAGEMENT</p>
          <h2>项目管理</h2>
          <span>管理项目立项、负责人、预算成本、进度风险和业务联动</span>
        </div>
        <div className="admin-source-controls">
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCcw size={14} className={`mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            刷新
          </Button>
          <Button size="sm" onClick={() => { setEditing(null); setForm(emptyForm); setDialogOpen(true); }} disabled={!hasPermission('oa:project:add')}>
            <Plus size={14} className="mr-1.5" />新建项目
          </Button>
        </div>
      </header>

      <section className="admin-source-stat-grid">
        <article className="card admin-source-stat admin-source-tone-blue">
          <div className="admin-source-stat-icon"><FolderKanban size={18} /></div>
          <div><p>项目总数</p><strong>{total}</strong><span>当前条件</span></div>
        </article>
        <article className="card admin-source-stat admin-source-tone-green">
          <div className="admin-source-stat-icon"><Target size={18} /></div>
          <div><p>执行中</p><strong>{rows.filter((row) => row.status === 'IN_PROGRESS').length}</strong><span>本页项目</span></div>
        </article>
        <article className="card admin-source-stat admin-source-tone-amber">
          <div className="admin-source-stat-icon"><AlertTriangle size={18} /></div>
          <div><p>高风险</p><strong>{rows.filter((row) => row.riskLevel === 'HIGH' || row.riskLevel === 'CRITICAL').length}</strong><span>需关注</span></div>
        </article>
        <article className="card admin-source-stat admin-source-tone-violet">
          <div className="admin-source-stat-icon"><Archive size={18} /></div>
          <div><p>预算合计</p><strong>{formatMoney(rows.reduce((sum, row) => sum + Number(row.budgetAmount || 0), 0))}</strong><span>本页汇总</span></div>
        </article>
      </section>
    </div>
  );

  const pageFilters = (
    <section className="card admin-users-toolbar">
      <div className="admin-oa-filter-grid">
        <label className="admin-source-search">
          <span className="input-label">搜索项目</span>
          <div className="admin-source-search-field">
            <Search size={16} />
            <Input
              className="h-[42px]"
              type="search"
              value={keyword}
              onChange={(e) => { setPageNum(1); setKeyword(e.target.value); }}
              placeholder="项目名称 / 客户关键字"
            />
          </div>
        </label>
        <label>
          <span className="input-label">状态</span>
          <Select value={status || 'ALL'} onValueChange={(v) => { setPageNum(1); setStatus(v === 'ALL' ? '' : v); }}>
            <SelectTrigger><SelectValue placeholder="状态" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">全部状态</SelectItem>
              {STATUS_OPTIONS.map((item) => <SelectItem key={item} value={item}>{statusDict.getLabel(item) || '-'}</SelectItem>)}
            </SelectContent>
          </Select>
        </label>
      </div>
    </section>
  );

  const pageTable = (
    <InnerTableSurface>
      <table className="unity-data-table admin-source-table min-w-[1180px]">
          <thead>
            <tr>
              <th>项目编号</th>
              <th>项目 / 客户</th>
              <th>负责人 / 部门</th>
              <th>预算 / 成本</th>
              <th>进度 / 风险</th>
              <th>来源 / 基线</th>
              <th className="text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-sm text-cf-subtle">
                  <FolderKanban className="mx-auto mb-3 h-4 w-4" />正在加载项目...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-sm text-cf-subtle">
                  <FolderKanban className="mx-auto mb-3 h-4 w-4" />暂无项目。下一步操作：新建项目或从 CRM 商机 / 报价 / 合同生成草稿。
                </td>
              </tr>
            ) : rows.map((row) => (
              <tr key={row.projectId}>
                <td>{row.projectNo || '-'}</td>
                <td>
                  <div className="admin-users-identity">
                    <div>
                      <strong>{row.projectName}</strong>
                      <small>{row.customerName || '-'}</small>
                    </div>
                  </div>
                </td>
                <td><div>{row.ownerName || '-'}</div><div className="text-xs text-cf-subtle">{row.deptName || '-'}</div></td>
                <td><div>{formatMoney(row.budgetAmount)}</div>{canViewCosts && <div className="text-xs text-cf-subtle">成本 {formatMoney(row.actualCostAmount)}</div>}</td>
                <td><div>{row.progress || 0}%</div><div className="text-xs text-cf-subtle">{severityDict.getLabel(row.riskLevel || '') || '-'}</div></td>
                <td><div>{row.sourceName || sourceTypeDict.getLabel(row.sourceType || 'MANUAL') || '-'}</div><div className="text-xs text-cf-subtle">基线 {row.baselineVersion || 0}</div></td>
                <td>
                  <div className="admin-users-row-actions">
                    <button
                      type="button"
                      data-tooltip="查看详情"
                      aria-label="查看详情"
                      onClick={async () => {
                        try {
                          setDetail(await projectApi.getDetail(row.projectId!));
                        } catch (error) {
                          toast.error(getErrorMessage(error, '加载项目详情失败'));
                        }
                      }}
                    >
                      <Eye size={15} />
                    </button>
                    {hasPermission('oa:project:edit') ? <button type="button" data-tooltip="编辑项目" aria-label="编辑项目" onClick={() => { setEditing(row); setForm(row); setDialogOpen(true); }}><Edit size={15} /></button> : null}
                    {(row.status === 'DRAFT' || row.status === 'REJECTED') && hasPermission('oa:project:submit') ? <button type="button" data-tooltip="提交立项" aria-label="提交立项" onClick={() => setConfirm({ type: 'submit', row })}><Send size={15} /></button> : null}
                    {row.status !== 'ARCHIVED' && hasPermission('oa:project:baseline') ? <button type="button" data-tooltip="基线快照" aria-label="基线快照" onClick={() => setConfirm({ type: 'baseline', row })}><RefreshCcw size={15} /></button> : null}
                    {['APPROVED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'].includes(row.status || '') && hasPermission('oa:project:archive') ? <button type="button" data-tooltip="归档项目" aria-label="归档项目" onClick={() => setConfirm({ type: 'archive', row })}><Archive size={15} /></button> : null}
                    {hasPermission('oa:project:remove') ? <button type="button" className="danger" data-tooltip="删除项目" aria-label="删除项目" onClick={() => setConfirm({ type: 'delete', row })}><Trash2 size={15} /></button> : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
      </table>
    </InnerTableSurface>
  );

  const pagePagination = total > 0 ? (
    <Pagination total={total} page={pageNum} pageSize={pageSize} showPageSizeSelector={false} showJump={false} onPageChange={setPageNum} onPageSizeChange={() => {}} />
  ) : null;

  return (
    <div className="admin-source-page admin-project-management-page">
      <TablePageLayout
        actions={pageActions}
        filters={pageFilters}
        table={pageTable}
        pagination={pagePagination}
      />

      <BaseDialog
        open={dialogOpen}
        title={editing ? '编辑项目' : '新建项目'}
        onClose={() => setDialogOpen(false)}
        width="wide"
        footer={<><Button variant="outline" onClick={() => setDialogOpen(false)}>取消</Button><Button onClick={() => void saveProject()}>保存</Button></>}
      >
        <div className="admin-dialog-stack">
          <div className="admin-project-detail-note">
            项目立项 = 项目基本信息 + CRM / 合同来源 + 预算与负责人。V3 会保留来源名称与基线版本，方便后续经营复盘。
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <div>
              <Label className={fieldLabelClassName}>项目名称</Label>
              <Input value={form.projectName || ''} onChange={(e) => setForm((prev) => ({ ...prev, projectName: e.target.value }))} placeholder="例如：景曜科技续约交付项目" />
            </div>
            <div>
              <Label className={fieldLabelClassName}>客户</Label>
              <Select value={form.customerId ? String(form.customerId) : 'NONE'} onValueChange={(value) => {
                const customer = customerOptions.find((item) => String(item.customerId) === value);
                setForm((prev) => ({ ...prev, customerId: value === 'NONE' ? undefined : Number(value), customerName: customer?.customerName || '' }));
              }}>
                <SelectTrigger><SelectValue placeholder="选择客户" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">暂不关联客户</SelectItem>
                  {customerOptions.map((item) => <SelectItem key={item.customerId} value={String(item.customerId)}>{item.customerName}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className={fieldLabelClassName}>关联合同</Label>
              <Select value={form.contractId ? String(form.contractId) : 'NONE'} onValueChange={(value) => {
                const contract = contractOptions.find((item) => String(item.contractId) === value);
                setForm((prev) => ({
                  ...prev,
                  contractId: value === 'NONE' ? undefined : Number(value),
                  contractNo: contract?.contractNo || '',
                  customerId: contract?.customerId || prev.customerId,
                  customerName: contract?.customerName || prev.customerName,
                }));
              }}>
                <SelectTrigger><SelectValue placeholder="选择合同" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">暂不关联合同</SelectItem>
                  {contractOptions.map((item) => <SelectItem key={item.contractId} value={String(item.contractId)}>{item.contractNo || item.contractName}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className={fieldLabelClassName}>负责人</Label>
              <UserSelector
                single
                allowClear
                value={form.ownerId ? String(form.ownerId) : null}
                onChange={(id, picked) => setForm((prev) => ({
                  ...prev,
                  ownerId: id ? Number(id) : undefined,
                  ownerName: picked?.name || '',
                  deptId: picked?.deptId != null ? Number(picked.deptId) : prev.deptId,
                  deptName: picked?.deptName || prev.deptName,
                }))}
                placeholder="选择负责人"
              />
            </div>
            <div>
              <Label className={fieldLabelClassName}>部门</Label>
              <DeptSelector
                single
                allowClear
                value={form.deptId ?? null}
                onChange={(id, picked) => setForm((prev) => ({
                  ...prev,
                  deptId: id ?? undefined,
                  deptName: picked?.deptName || '',
                }))}
                placeholder="选择归属部门"
              />
            </div>
            <div>
              <Label className={fieldLabelClassName}>预算金额（元）</Label>
              <Input type="number" min={0} value={String(form.budgetAmount || 0)} onChange={(e) => setForm((prev) => ({ ...prev, budgetAmount: Number(e.target.value || 0) }))} placeholder="例如：368000" />
            </div>
            <FormFields value={form} onChange={setForm} fields={[
              { key: 'percentCompleteMode', label: '进度计算方式', type: 'select', options: { MANUAL: '手工填写', TASK_COMPLETION: '按任务完成数量', TASK_PROGRESS: '按任务进度加权' } },
              { key: 'estimatedCost', label: '预计成本（元）', type: 'number', min: 0, step: 0.01 },
              { key: 'progress', label: '手工进度（0–100%）', type: 'number', min: 0, max: 100, step: 0.01, when: value => value.percentCompleteMode === 'MANUAL' },
            ]} />
            <div>
              <Label className={fieldLabelClassName}>来源类型</Label>
              <Input value={sourceTypeDict.getLabel(form.sourceType || 'MANUAL') || '手工创建'} disabled />
            </div>
            <div>
              <Label className={fieldLabelClassName}>来源名称</Label>
              <Input value={form.sourceName || '-'} disabled />
            </div>
            <div>
              <Label className={fieldLabelClassName}>基线版本</Label>
              <Input value={String(form.baselineVersion || 0)} disabled />
            </div>
            <div className="md:col-span-2 xl:col-span-3">
              <Label className={fieldLabelClassName}>备注</Label>
              <Textarea value={form.remark || ''} onChange={(e) => setForm((prev) => ({ ...prev, remark: e.target.value }))} placeholder="项目说明、当前重点、来源上下文、预算约束" />
            </div>
          </div>
        </div>
      </BaseDialog>

      <BaseDialog open={Boolean(detail)} title={detail?.project.projectName || '项目详情'} onClose={() => setDetail(null)} width="extra-wide" bodyClassName="admin-project-detail-dialog-body overflow-hidden">
        {detail ? (
          <div className="admin-project-detail-shell">
            <Tabs value={!canViewCosts && detailTab === 'cost' ? 'overview' : detailTab} onValueChange={(value) => setDetailTab(value as DetailTab)} className="admin-source-content admin-project-detail-tabs">
              <TabsList className="admin-project-detail-tabbar w-full justify-start overflow-x-auto">
                {tabs.filter(tab => canViewCosts || tab.value !== 'cost').map((tab) => (
                  <TabsTrigger key={tab.value} value={tab.value} className="gap-1.5">
                    {tab.icon}
                    {tab.label}
                  </TabsTrigger>
                ))}
              </TabsList>

              <TabsContent value="overview" className="admin-source-content-grid admin-project-detail-tab">
                <div className="admin-source-stat-grid">
                  <ProjectDetailMetric label="项目编号" value={detail.project.projectNo || '-'} meta="立项编号" icon={<Hash size={18} />} tone="blue" />
                  <ProjectDetailMetric label="状态" value={statusDict.getLabel(detail.project.status || 'DRAFT') || '-'} meta={`基线 v${detail.baselineVersion || detail.project.baselineVersion || 0}`} icon={<Target size={18} />} tone="amber" />
                  <ProjectDetailMetric label="立项预算" value={formatMoney(detail.project.budgetAmount)} meta="预算合计" icon={<CircleDollarSign size={18} />} tone="green" />
                  <ProjectDetailMetric label="已发生成本" value={canViewCosts ? formatMoney(detail.costSummary?.totalAmount ?? detail.project.actualCostAmount) : '仅管理者可见'} meta={canViewCosts ? '人力 / 采购 / 其他' : '内部成本'} icon={<Coins size={18} />} tone="violet" />
                </div>

                <div className="grid gap-4 xl:grid-cols-2">
                  <ProjectDetailPanel title="来源与 KPI" contentClassName="admin-project-detail-facts">
                      <div><span>客户</span><strong>{detail.project.customerName || '-'}</strong></div>
                      <div><span>合同</span><strong>{detail.project.contractNo || '-'}</strong></div>
                      <div><span>来源</span><strong>{detail.project.sourceName || sourceTypeDict.getLabel(detail.project.sourceType || 'MANUAL') || '-'}{detail.project.sourceId ? ` / ${detail.project.sourceId}` : ''}</strong></div>
                      <div><span>逾期里程碑</span><strong>{detail.kpi?.overdueMilestoneCount || 0}</strong></div>
                      <div><span>逾期任务</span><strong>{detail.kpi?.overdueTaskCount || 0}</strong></div>
                      <div><span>开放风险</span><strong>{detail.kpi?.openRiskCount || 0}</strong></div>
                      <div><span>排期偏差</span><strong>{detail.kpi?.scheduleVarianceDays || 0} 天</strong></div>
                      <div><span>成本执行率</span><strong>{canViewCosts ? Number(detail.kpi?.costExecutionRate || 0).toFixed(1) + '%' : '仅管理者可见'}</strong></div>
                  </ProjectDetailPanel>

                  <ProjectDetailPanel title="项目成员" contentClassName="admin-project-detail-stack">
                      {detail.members.length ? detail.members.map((item) => (
                        <div key={item.id} className="admin-project-detail-row text-sm">
                          <div>
                            <div>{item.userName || '-'}</div>
                            <div className="text-xs text-cf-subtle">{item.roleName || item.roleCode || '-'}</div>
                          </div>
                          {hasPermission('oa:project:edit') ? (
                            <div className="admin-users-row-actions">
                              <button type="button" data-tooltip="编辑成员" aria-label="编辑成员" onClick={() => openChildDialog({ type: 'member', item })}>
                                <Edit size={15} />
                              </button>
                              <button className="danger" type="button" data-tooltip="删除成员" aria-label="删除成员" onClick={() => void removeChild('member', item.id!)}>
                                <Trash2 size={15} />
                              </button>
                            </div>
                          ) : <span className="text-sm text-slate-300">-</span>}
                      </div>
                    )) : <div className="text-sm text-cf-subtle">暂无项目成员</div>}
                      <Button size="sm" variant="outline" onClick={() => openChildDialog({ type: 'member' })} disabled={!hasPermission('oa:project:edit')}><Users size={14} className="mr-1.5" />新增成员</Button>
                  </ProjectDetailPanel>
                </div>
              </TabsContent>

              <TabsContent value="gantt" className="admin-source-content-grid admin-project-detail-tab">
                <ProjectDetailPanel title="专业计划版甘特图" contentClassName="admin-project-detail-stack">
                    <div className="flex flex-wrap items-center gap-2">
                      <Button size="sm" variant="outline" onClick={() => setConfirm({ type: 'baseline', row: detail.project })} disabled={!hasPermission('oa:project:baseline')}><RefreshCcw size={14} className="mr-1.5" />重置基线</Button>
                      <div className="text-xs text-cf-subtle">灰条 = 基线排期；彩色条 = 当前排期；拖动彩条可按日改期。</div>
                    </div>
                    {ganttRows.length ? (
                      <DndContext sensors={sensors} onDragEnd={handleGanttDragEnd}>
                        <div className="admin-horizontal-scroll" tabIndex={0} aria-label="项目排期，可横向滚动">
                          <div style={{ minWidth: `${260 + ganttDateColumns.length * DAY_WIDTH}px` }}>
                            <div className="grid border-b border-slate-200 pb-2 text-xs text-cf-subtle dark:border-slate-800" style={{ gridTemplateColumns: `260px repeat(${ganttDateColumns.length}, ${DAY_WIDTH}px)` }}>
                              <div>任务 / 里程碑</div>
                              {ganttDateColumns.map((date) => <div key={date} data-gantt-date={date} className="text-center">{date.slice(5)}</div>)}
                            </div>
                            <div ref={ganttContainer} className="admin-project-gantt-rows relative pt-3">
                              {ganttRows.map((item) => {
                                const left = diffDays(ganttDateColumns[0], item.start) * DAY_WIDTH;
                                const width = Math.max(1, diffDays(item.start, item.end) + 1) * DAY_WIDTH;
                                const baselineLeft = item.baselineStart ? diffDays(ganttDateColumns[0], item.baselineStart) * DAY_WIDTH : undefined;
                                const baselineWidth = item.baselineStart && item.baselineEnd ? Math.max(1, diffDays(item.baselineStart, item.baselineEnd) + 1) * DAY_WIDTH : undefined;
                                return (
                                  <div key={item.key} className="admin-project-gantt-row grid items-center gap-0" style={{ gridTemplateColumns: `260px 1fr` }}>
                                    <div className="px-3 text-sm">
                                      <div className="font-medium text-cf-title">{item.label}</div>
                                      <div className="text-xs text-cf-subtle">{item.start} ~ {item.end}{item.overdue ? ' / 已逾期' : ''}</div>
                                    </div>
                                    <div className="relative h-10 border-l border-slate-200 dark:border-slate-800" style={{ width: `${ganttDateColumns.length * DAY_WIDTH}px` }}>
                                      {ganttDateColumns.map((date) => (
                                        <div key={`${item.key}-${date}`} className="absolute top-0 h-full border-r border-slate-200/70 dark:border-slate-800/70" style={{ left: `${diffDays(ganttDateColumns[0], date) * DAY_WIDTH}px`, width: `${DAY_WIDTH}px` }} />
                                      ))}
                                      <DraggableGanttBar
                                        id={item.key}
                                        width={width}
                                        left={left}
                                        baselineLeft={baselineLeft}
                                        baselineWidth={baselineWidth}
                                        colorClassName={item.kind === 'milestone'
                                          ? item.overdue ? 'bg-rose-500 hover:bg-rose-600' : 'bg-cyan-500 hover:bg-cyan-600'
                                          : item.overdue ? 'bg-amber-500 hover:bg-amber-600' : 'bg-emerald-500 hover:bg-emerald-600'}
                                        fullLabel={item.label}
                                        compactLabel={item.compactLabel}
                                        shortLabel={item.shortLabel}
                                        kind={item.kind}
                                        timelineWidth={ganttDateColumns.length * DAY_WIDTH}
                                        disabled={!hasPermission('oa:project:wbs') || ['ARCHIVED', 'CANCELLED'].includes(detail.project.status || '')}
                                      />
                                    </div>
                                  </div>
                                );
                              })}
                              <ProjectGanttDependencies container={ganttContainer} dependencies={detail.dependencies} tasks={detail.wbsTasks} />
                            </div>
                          </div>
                        </div>
                      </DndContext>
                    ) : <div className="text-sm text-cf-subtle">暂无可渲染的排期数据。先新增里程碑或 WBS 任务。</div>}
                    <section aria-label="任务依赖说明" className="space-y-3">
                      <h3 className="font-semibold text-cf-title">任务依赖</h3>
                      {detail.dependencies.length ? detail.dependencies.map(dependency => <div key={dependency.dependencyId}
                        className="rounded-lg border border-[var(--cf-border)] p-3 text-sm [overflow-wrap:anywhere]" data-dependency-description={dependency.dependencyId}>
                        <p>{detail.wbsTasks.find(task => task.taskId === dependency.predecessorTaskId)?.subject || '前置任务'} → {detail.wbsTasks.find(task => task.taskId === dependency.successorTaskId)?.subject || '后置任务'}</p>
                        <p className="mt-1 text-cf-muted">{projectDependencyLabels[dependency.dependencyType || ''] || dependency.dependencyType} · 间隔 {dependency.lagDays || 0} 天</p>
                      </div>) : <p className="text-sm text-cf-muted">暂无任务依赖</p>}
                    </section>
                </ProjectDetailPanel>
              </TabsContent>

              <TabsContent value="milestone" className="admin-source-content-grid admin-project-detail-tab">
                <ProjectDetailPanel title="里程碑维护" contentClassName="admin-project-detail-stack">
                    {detail.milestones.length ? detail.milestones.map((item) => (
                      <div key={item.taskId} className="admin-project-detail-row text-sm">
                        <div>
                          <div>{item.subject}</div>
                          <div className="text-xs text-cf-subtle">计划 {item.plannedEnd || '-'} / 基线 {item.baselineEnd || '-'} / 实际 {item.actualEnd || '-'} / {item.status || '-'}</div>
                        </div>
                        {hasPermission('oa:project:edit') ? (
                          <div className="admin-users-row-actions">
                            <button type="button" data-tooltip="编辑里程碑" aria-label="编辑里程碑" onClick={() => openChildDialog({ type: 'milestone', item })}>
                              <Edit size={15} />
                            </button>
                            <button className="danger" type="button" data-tooltip="删除里程碑" aria-label="删除里程碑" onClick={() => void removeChild('milestone', item.taskId!)}>
                              <Trash2 size={15} />
                            </button>
                          </div>
                        ) : <span className="text-sm text-slate-300">-</span>}
                      </div>
                    )) : <div className="text-sm text-cf-subtle">暂无里程碑</div>}
                    <Button size="sm" onClick={() => openChildDialog({ type: 'milestone' })} disabled={!hasPermission('oa:project:edit')}><Plus size={14} className="mr-1.5" />新增里程碑</Button>
                </ProjectDetailPanel>
              </TabsContent>

              <TabsContent value="wbs" className="admin-source-content-grid admin-project-detail-tab">
                <ProjectOperationsPanel project={detail.project} onChanged={() => { void refreshDetail(detail.project.projectId!); void load(); }} />
                <ProjectDetailPanel title="WBS 树维护" contentClassName="admin-project-detail-stack">
                  <ProjectTaskTree key={detail.project.projectId} projectId={detail.project.projectId!} tasks={detail.wbsTasks}
                    editable={hasPermission('oa:project:wbs') && !['ARCHIVED', 'CANCELLED'].includes(detail.project.status || '')}
                    onCreate={() => openChildDialog({ type: 'wbs' })}
                    onEdit={item => openChildDialog({ type: 'wbs', item })}
                    onRemove={item => { void removeChild('wbs', item.taskId!); }}
                    onReload={() => refreshDetail(detail.project.projectId!)} />
                </ProjectDetailPanel>
              </TabsContent>

              <TabsContent value="cost" className="admin-source-content-grid admin-project-detail-tab">
                {canViewCosts && (() => {
                  const labor = Number(detail.costSummary?.laborAmount ?? detail.project.laborCostAmount ?? 0);
                  const purchase = Number(detail.costSummary?.purchaseAmount ?? detail.project.purchaseCostAmount ?? 0);
                  const other = Number(detail.costSummary?.otherAmount ?? detail.project.otherCostAmount ?? 0);
                  const total = Number(detail.costSummary?.totalAmount ?? detail.project.actualCostAmount ?? (labor + purchase + other));
                  const budget = Number(detail.project.budgetAmount ?? 0);
                  const billable = Number(detail.costSummary?.billableAmount ?? detail.project.billableAmount ?? 0);
                  const billed = Number(detail.costSummary?.billedAmount ?? detail.project.billedAmount ?? 0);
                  const margin = Number(detail.project.grossMargin ?? (billable - total));
                  const marginRate = billable === 0 ? null : Number(detail.project.grossMarginRate ?? (margin / billable));
                  const execRate = budget > 0 ? (total / budget) * 100 : 0;
                  const pct = (value: number) => total > 0 ? (value / total) * 100 : 0;
                  const composition = [
                    { label: '人力成本', value: labor, color: '#0d95b5' },
                    { label: '采购成本', value: purchase, color: '#059669' },
                    { label: '其他成本', value: other, color: '#d97706' },
                  ];
                  return (
                    <>
                      <div className="admin-source-stat-grid">
                        <ProjectDetailMetric label="总成本" value={formatMoney(total)} meta="人力、采购与其他成本合计" icon={<Archive size={18} />} tone="blue" />
                        <ProjectDetailMetric label="人力成本" value={formatMoney(labor)} meta="已审批工时的内部成本" icon={<Users size={18} />} tone="green" />
                        <ProjectDetailMetric label="采购成本" value={formatMoney(purchase)} meta="已完成收货的采购" icon={<CircleDollarSign size={18} />} tone="violet" />
                        <ProjectDetailMetric label="其他成本" value={formatMoney(other)} meta="项目登记的其他成本" icon={<Coins size={18} />} tone="amber" />
                      </div>
                      <div className="grid gap-4 xl:grid-cols-2">
                        <ProjectDetailPanel title="预算执行" contentClassName="admin-project-detail-stack text-sm">
                          <div>预算合计：{formatMoney(budget)}</div>
                          <div>预计成本：{formatMoney(detail.project.estimatedCost)}</div>
                          <div>已用成本：{formatMoney(total)}</div>
                          <div>成本执行率：{budget > 0 ? execRate.toFixed(1) + '%' : '未设置预算'}</div>
                          <div className="admin-project-cost-track" role="img" aria-label={'成本执行率 ' + (budget > 0 ? execRate.toFixed(1) + '%' : '未设置预算')}>
                            <span className={cn('admin-project-cost-track-fill', execRate > 100 && 'is-over')}
                              style={{ width: Math.min(Math.max(execRate, 0), 100) + '%' }} />
                          </div>
                        </ProjectDetailPanel>
                        <ProjectDetailPanel title="成本构成" contentClassName="admin-project-detail-stack text-sm">
                          {total > 0 ? (
                            <>
                              <div className="admin-project-cost-bar" role="img" aria-label="成本构成占比">
                                {composition.map(item => item.value > 0 && <span key={item.label}
                                  style={{ width: pct(item.value) + '%', background: item.color }}
                                  data-tooltip={item.label + ' ' + formatMoney(item.value)} />)}
                              </div>
                              {composition.map(item => <div key={item.label} className="admin-project-detail-row">
                                <span className="inline-flex items-center gap-2">
                                  <span className="admin-project-cost-dot" style={{ background: item.color }} />{item.label}
                                </span>
                                <span>{formatMoney(item.value)} · {pct(item.value).toFixed(1)}%</span>
                              </div>)}
                            </>
                          ) : <div className="text-sm text-cf-subtle">暂无成本数据</div>}
                        </ProjectDetailPanel>
                      </div>
                      <div className="admin-source-stat-grid" aria-label="项目计费与毛利">
                        <ProjectDetailMetric label="可计费额" value={formatMoney(billable)} meta="已审批工时的对客计费" icon={<CircleDollarSign size={18} />} tone="blue" />
                        <ProjectDetailMetric label="已开票金额" value={formatMoney(billed)} meta="关联合同有效销项发票" icon={<Send size={18} />} tone="green" />
                        <ProjectDetailMetric label="毛利" value={formatMoney(margin)} meta="可计费额减去总成本" icon={<Coins size={18} />} tone="violet" />
                        <ProjectDetailMetric label="毛利率" value={marginRate == null ? '—' : (marginRate * 100).toFixed(2) + '%'} meta="毛利占可计费额的比例" icon={<Target size={18} />} tone="amber" />
                      </div>
                    </>
                  );
                })()}
              </TabsContent>

              <TabsContent value="risk" className="admin-source-content-grid admin-project-detail-tab">
                <div className="grid gap-4 xl:grid-cols-2">
                  <ProjectDetailPanel title="项目风险维护" contentClassName="admin-project-detail-stack">
                      {detail.risks.length ? detail.risks.map((item, index) => (
                        <div key={`${item.riskId || item.riskCode || index}`} className="admin-project-detail-row text-sm">
                          <div>
                            <div>{item.riskName || '-'}</div>
                            <div className="text-xs text-cf-subtle">{severityDict.getLabel(item.riskLevel || '') || '-'} / {item.triggerSource ? '已触发' : '-'} / {item.status ? '已记录' : '-'}</div>
                          </div>
                          {item.riskId && hasPermission('oa:project:edit') ? (
                            <div className="admin-users-row-actions">
                              <button type="button" data-tooltip="编辑风险" aria-label="编辑风险" onClick={() => openChildDialog({ type: 'risk', item })}>
                                <Edit size={15} />
                              </button>
                              <button className="danger" type="button" data-tooltip="删除风险" aria-label="删除风险" onClick={() => void removeChild('risk', item.riskId!)}>
                                <Trash2 size={15} />
                              </button>
                            </div>
                          ) : <span className="text-sm text-slate-300">-</span>}
                        </div>
                      )) : <div className="text-sm text-cf-subtle">暂无项目风险</div>}
                      <Button size="sm" onClick={() => openChildDialog({ type: 'risk' })} disabled={!hasPermission('oa:project:edit')}><Plus size={14} className="mr-1.5" />新增风险</Button>
                  </ProjectDetailPanel>

                  <ProjectDetailPanel title="项目依赖" contentClassName="admin-project-detail-stack">
                      {detail.dependencies.length ? detail.dependencies.map((item) => (
                        <div key={item.dependencyId} className="admin-project-detail-row text-sm">
                          <div>
                            <div>{detail.wbsTasks.find(task => String(task.taskId) === String(item.predecessorTaskId))?.subject} → {detail.wbsTasks.find(task => String(task.taskId) === String(item.successorTaskId))?.subject}</div>
                            <div className="text-xs text-cf-subtle">{item.dependencyType || 'FS'} / 延迟 {item.lagDays || 0} 天</div>
                          </div>
                          {hasPermission('oa:project:edit') ? (
                            <div className="admin-users-row-actions">
                              <button type="button" data-tooltip="编辑依赖" aria-label="编辑依赖" onClick={() => openChildDialog({ type: 'dependency', item })}>
                                <Edit size={15} />
                              </button>
                              <button className="danger" type="button" data-tooltip="删除依赖" aria-label="删除依赖" onClick={() => void removeChild('dependency', item.dependencyId!)}>
                                <Trash2 size={15} />
                              </button>
                            </div>
                          ) : <span className="text-sm text-slate-300">-</span>}
                        </div>
                      )) : <div className="text-sm text-cf-subtle">暂无项目依赖</div>}
                      <Button size="sm" variant="outline" onClick={() => openChildDialog({ type: 'dependency' })} disabled={!hasPermission('oa:project:edit')}><Link2 size={14} className="mr-1.5" />新增依赖</Button>
                  </ProjectDetailPanel>
                </div>
              </TabsContent>

              <TabsContent value="linkage" className="admin-source-content-grid admin-project-detail-tab">
                <ProjectDetailPanel title="联动摘要" contentClassName={linkageCards.length ? 'admin-project-detail-facts' : undefined}>
                  {linkageCards.length
                    ? linkageCards.map((item) => (
                      <div key={item.label}><span>{item.label}</span><strong>{item.value}</strong></div>
                    ))
                    : <div className="text-sm text-cf-subtle">暂无业务联动摘要</div>}
                </ProjectDetailPanel>
                <ProjectDetailPanel title="业务跳转" contentClassName="flex flex-wrap gap-2">
                    {detail.project.customerId ? <Button size="sm" variant="outline" onClick={() => navigate(`/office/crm/customer/${detail.project.customerId}`)}>打开客户360</Button> : null}
                    {detail.project.contractId ? <Button size="sm" variant="outline" onClick={() => navigate('/office/contracts', { state: { focusContractId: detail.project.contractId } })}>打开 OA 合同</Button> : null}
                    <Button size="sm" variant="outline" onClick={() => navigate('/office/budget')}>查看预算管理</Button>
                    <Button size="sm" variant="outline" onClick={() => navigate('/office/invoice')}>查看发票管理</Button>
                </ProjectDetailPanel>
              </TabsContent>
            </Tabs>
          </div>
        ) : null}
      </BaseDialog>

      <BaseDialog
        open={Boolean(childDialog)}
        title={
          childDialog?.type === 'member' ? (memberForm.id ? '编辑项目成员' : '新增项目成员')
            : childDialog?.type === 'milestone' ? (milestoneForm.taskId ? '编辑里程碑' : '新增里程碑')
              : childDialog?.type === 'wbs' ? (wbsForm.taskId ? '编辑 WBS' : '新增 WBS')
                : childDialog?.type === 'risk' ? (riskForm.riskId ? '编辑风险' : '新增风险')
                  : dependencyForm.dependencyId ? '编辑依赖' : '新增依赖'
        }
        onClose={() => openChildDialog(null)}
        width="wide"
        footer={<><Button variant="outline" onClick={() => openChildDialog(null)}>取消</Button><Button onClick={() => void saveChild()}>保存</Button></>}
      >
        {childDialog?.type === 'member' ? (
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label className={fieldLabelClassName}>成员</Label>
              <UserSelector
                single
                value={memberForm.userId ? String(memberForm.userId) : null}
                onChange={(id, picked) => setMemberForm((prev) => ({
                  ...prev,
                  userId: id ? Number(id) : 0,
                  userName: picked?.name || '',
                }))}
                placeholder="选择项目成员"
              />
            </div>
            <div>
              <Label className={fieldLabelClassName}>角色名称</Label>
              <Input value={memberForm.roleName || ''} onChange={(e) => setMemberForm((prev) => ({ ...prev, roleName: e.target.value }))} placeholder="例如：项目经理" />
            </div>
          </div>
        ) : null}

        {childDialog?.type === 'milestone' ? <ProjectTaskFields task={milestoneForm} tasks={detail?.wbsTasks || []} onChange={setMilestoneForm} /> : null}

        {childDialog?.type === 'wbs' ? <ProjectTaskFields task={wbsForm} tasks={detail?.wbsTasks || []} onChange={setWbsForm} /> : null}

        {childDialog?.type === 'risk' ? (
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label className={fieldLabelClassName}>风险名称</Label>
              <Input value={riskForm.riskName || ''} onChange={(e) => setRiskForm((prev) => ({ ...prev, riskName: e.target.value }))} placeholder="例如：客户侧数据准备延期" />
            </div>
            <div>
              <Label className={fieldLabelClassName}>风险等级</Label>
              <Select value={riskForm.riskLevel || 'MEDIUM'} onValueChange={(value) => setRiskForm((prev) => ({ ...prev, riskLevel: value }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {RISK_LEVELS.map((value) => <SelectItem key={value} value={value}>{severityDict.getLabel(value) || '-'}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2">
              <Label className={fieldLabelClassName}>风险说明</Label>
              <Textarea value={riskForm.summary || ''} onChange={(e) => setRiskForm((prev) => ({ ...prev, summary: e.target.value }))} placeholder="风险触发点、当前影响与应对方案" />
            </div>
          </div>
        ) : null}

        {childDialog?.type === 'dependency' ? <FormFields value={dependencyForm} onChange={setDependencyForm} fields={[
          { key: 'predecessorTaskId', label: '前置任务', type: 'select', numeric: true, options: optionsOf(detail?.wbsTasks, 'taskId', 'subject'), required: true },
          { key: 'successorTaskId', label: '后置任务', type: 'select', numeric: true, options: optionsOf(detail?.wbsTasks, 'taskId', 'subject'), required: true },
          { key: 'dependencyType', label: '依赖类型', type: 'select', options: { FINISH_TO_START: '完成后开始', START_TO_START: '开始后开始', FINISH_TO_FINISH: '完成后完成' }, required: true },
          { key: 'lagDays', label: '延迟天数', type: 'number', step: 1 }, { key: 'remark', label: '说明', type: 'textarea', maxLength: 500, wide: true },
        ]} /> : null}
      </BaseDialog>

      <ConfirmDialog
        open={Boolean(confirm)}
        title={confirm?.type === 'submit' ? '提交立项' : confirm?.type === 'archive' ? '归档项目' : confirm?.type === 'baseline' ? '生成基线快照' : '删除项目'}
        message={confirm?.type === 'submit' ? '提交后将进入立项审批流程。'
          : confirm?.type === 'archive' ? '归档后项目仍可查看，但不再参与执行流转。'
            : confirm?.type === 'baseline' ? '当前计划将固化为新的基线版本。'
              : '删除后当前记录不可恢复。'}
        confirmText={confirm?.type === 'submit' ? '提交' : confirm?.type === 'archive' ? '归档' : confirm?.type === 'baseline' ? '生成基线' : '删除'}
        danger={confirm?.type === 'delete'}
        onCancel={() => setConfirm(null)}
        onConfirm={async () => {
          if (!confirm) return;
          try {
            if (confirm.type === 'submit') {
              await projectApi.submit(confirm.row.projectId!);
              toast.success('项目已提交');
            } else if (confirm.type === 'archive') {
              await projectApi.archive(confirm.row.projectId!);
              toast.success('项目已归档');
            } else if (confirm.type === 'baseline') {
              await projectApi.snapshotBaseline(confirm.row.projectId!);
              toast.success('基线快照已生成');
            } else {
              await projectApi.remove([confirm.row.projectId!]);
              toast.success('项目已删除');
            }
            const removedProjectId = confirm.row.projectId;
            setConfirm(null);
            await load();
            if (detail?.project.projectId === removedProjectId && removedProjectId) {
              if (confirm.type === 'delete') {
                setDetail(null);
              } else {
                await refreshDetail(removedProjectId);
              }
            }
          } catch (error) {
            toast.error(getErrorMessage(error, '操作失败'));
          }
        }}
      />
    </div>
  );
}
