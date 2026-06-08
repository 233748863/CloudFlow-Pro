import React, { useEffect, useMemo, useState } from 'react';
import { getConfigIntSync } from '../hooks/useSystemConfig';
import { SYS_PAGE_DEFAULT_PAGE_SIZE } from '../constants/sysConfig';
import { useWorkflowRefresh } from '@/hooks/useWorkflowRefresh';
import { useLocation, useNavigate } from 'react-router-dom';
import { CalendarRange, Edit, Eye, FolderKanban, Plus, Send, Trash2, Users, AlertTriangle, ListTree, Target, Archive, Link2, RefreshCcw, ArrowRightLeft } from 'lucide-react';
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
import { Pagination } from '@/components/common/Pagination';
import { Card, CardContent, CardHeader, CardTitle, Button, DatePicker, DeptSelector, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, TableActionHead, TableHead, TableHeader, Tabs, TabsContent, TabsList, TabsTrigger, Textarea, UserSelector } from '@/components/common';
import { TablePageLayout, TableSurfaceCard } from '@/components/layout/TablePageLayout';
import { TableRowActions } from '@/components/common/table-row-actions';
import { formatDateTimeDisplay } from '@/utils/dateFormat';
import { useDict } from '@/hooks/useDict';

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
  milestoneName: '',
  status: 'PLANNED',
  progress: 0,
};

const emptyWbs: ProjectWbsTask = {
  title: '',
  status: 'TODO',
  priority: 1,
  progress: 0,
  estimatedHours: 0,
  actualHours: 0,
};

const emptyRisk: ProjectRisk = {
  riskName: '',
  riskLevel: 'MEDIUM',
  status: 'OPEN',
  triggerSource: 'MANUAL',
};

const emptyDependency: ProjectDependency = {
  predecessorType: 'WBS',
  successorType: 'WBS',
  dependencyType: 'FS',
  lagDays: 0,
};

const fieldLabelClassName = 'mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300';

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
  <span className={`min-w-0 flex-1 truncate ${valueText ? 'text-slate-900 dark:text-slate-100' : 'text-slate-400 dark:text-slate-500'}`}>
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
      <span className="truncate font-medium text-slate-900 dark:text-slate-100">{primary || '未命名成员'}</span>
      {secondary ? (
        <span className="truncate text-xs text-slate-500 dark:text-slate-400">{secondary}</span>
      ) : null}
    </div>
  );
};
const addDays = (dateString: string, days: number) => {
  const date = new Date(`${dateString}T00:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};
const diffDays = (start: string, end: string) => {
  const left = new Date(`${start}T00:00:00`).getTime();
  const right = new Date(`${end}T00:00:00`).getTime();
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
}> = ({ id, width, left, baselineLeft, baselineWidth, colorClassName, fullLabel, compactLabel, shortLabel, kind, timelineWidth }) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id });
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
              className="absolute top-1/2 h-3 w-3 -translate-y-1/2 rotate-45 rounded-[3px] border border-slate-300 bg-white/90 dark:border-slate-600 dark:bg-slate-900/90"
              style={{ left: `${baselineLeft + Math.max(0, (baselineWidth || DAY_WIDTH) / 2 - 6)}px` }}
            />
          ) : null}
          <button
            ref={setNodeRef}
            type="button"
            className={`absolute top-1/2 z-10 h-4 w-4 -translate-y-1/2 rounded-[4px] rotate-45 shadow-sm transition ${colorClassName}`}
            style={{ ...baseStyle, left: `${markerLeft}px` }}
            title={`${fullLabel}，拖动可按日改期`}
            {...listeners}
            {...attributes}
          >
            <span className="sr-only">{fullLabel}</span>
          </button>
        </>
      ) : (
        <>
          {baselineLeft !== undefined && baselineWidth ? (
            <div
              className="absolute top-1/2 h-2 -translate-y-1/2 rounded-full bg-slate-300/70 dark:bg-slate-700/70"
              style={{ left: `${baselineLeft}px`, width: `${baselineWidth}px` }}
            />
          ) : null}
          <button
            ref={setNodeRef}
            type="button"
            className={`absolute top-1/2 z-10 h-8 -translate-y-1/2 rounded-lg px-3 text-left text-xs font-medium text-white shadow-sm transition ${colorClassName}`}
            style={{ ...baseStyle, width: `${width}px`, left: `${left}px` }}
            title={`${fullLabel}，拖动可按日改期`}
            {...listeners}
            {...attributes}
          >
            {displayLabel ? <span className="block truncate">{displayLabel}</span> : <span className="sr-only">{fullLabel}</span>}
          </button>
        </>
      )}
      {showExternalLabel ? (
        <div
          className={`pointer-events-none absolute top-1/2 z-20 max-w-[180px] -translate-y-1/2 truncate rounded-md border px-2 py-1 text-[11px] font-medium shadow-sm ${
            kind === 'milestone'
              ? 'border-cyan-200 bg-cyan-50/95 text-cyan-700 dark:border-cyan-900 dark:bg-cyan-950/95 dark:text-cyan-200'
              : 'border-slate-200 bg-white/95 text-slate-600 dark:border-slate-700 dark:bg-slate-900/95 dark:text-slate-200'
          }`}
          style={externalLabelStyle}
          title={fullLabel}
        >
          {externalLabel}
        </div>
      ) : null}
    </>
  );
};

export default function ProjectManagementPage() {
  const { hasPermission } = useAuth();
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

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / 10)), [total]);

  const load = async () => {
    setLoading(true);
    try {
      const result = await projectApi.list({ pageNum, pageSize: getConfigIntSync(SYS_PAGE_DEFAULT_PAGE_SIZE, 10), projectName: keyword, status: status || undefined });
      setRows(result.rows || []);
      setTotal(result.total || 0);
    } catch (error) {
      toast.error(getErrorMessage(error, '加载项目失败'));
    } finally {
      setLoading(false);
    }
  };

  const loadReferences = async () => {
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
    setDetail(result);
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
        if (milestoneForm.milestoneId) await projectApi.editMilestone(payload); else await projectApi.addMilestone(payload);
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

  const ganttRows = useMemo(() => {
    if (!detail) return [];
    const milestoneRows = detail.milestones.map((item) => ({
      key: `m-${item.milestoneId}`,
      label: `里程碑 / ${item.milestoneName}`,
      compactLabel: compactGanttText(item.milestoneName || '里程碑', 10),
      shortLabel: '里程碑',
      start: item.plannedDate || '',
      end: item.actualDate || item.plannedDate || '',
      baselineStart: item.baselineDate || item.plannedDate || '',
      baselineEnd: item.baselineDate || item.plannedDate || '',
      kind: 'milestone' as const,
      overdue: item.plannedDate ? diffDays(item.plannedDate, new Date().toISOString().slice(0, 10)) > 0 && !item.actualDate : false,
    }));
    const wbsRows = detail.wbsTasks.map((item) => ({
      key: `w-${item.taskId}`,
      label: `WBS / ${item.wbsCode || '-'} ${item.title || ''}`,
      compactLabel: `${item.wbsCode || 'WBS'} ${compactGanttText(item.title || '任务', 12)}`,
      shortLabel: item.wbsCode || compactGanttText(item.title || '任务', 4),
      start: item.plannedStartTime ? String(item.plannedStartTime).slice(0, 10) : '',
      end: item.plannedEndTime ? String(item.plannedEndTime).slice(0, 10) : '',
      baselineStart: item.baselineStartTime ? String(item.baselineStartTime).slice(0, 10) : '',
      baselineEnd: item.baselineEndTime ? String(item.baselineEndTime).slice(0, 10) : '',
      kind: 'wbs' as const,
      overdue: item.plannedEndTime ? diffDays(String(item.plannedEndTime).slice(0, 10), new Date().toISOString().slice(0, 10)) > 0 && !item.actualEndTime : false,
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
    if (!event.delta?.x || !detail?.project.projectId || !ganttDateColumns.length) return;
    const offsetDays = Math.round(event.delta.x / DAY_WIDTH);
    if (!offsetDays) return;
    const blockKey = String(event.active.id);
    try {
      if (blockKey.startsWith('m-')) {
        const milestoneId = Number(blockKey.replace('m-', ''));
        const milestone = detail.milestones.find((item) => item.milestoneId === milestoneId);
        if (!milestone?.plannedDate) return;
        await projectApi.editMilestone({
          ...milestone,
          projectId: detail.project.projectId,
          plannedDate: addDays(milestone.plannedDate, offsetDays),
        });
      }
      if (blockKey.startsWith('w-')) {
        const taskId = Number(blockKey.replace('w-', ''));
        const task = detail.wbsTasks.find((item) => item.taskId === taskId);
        if (!task?.plannedStartTime || !task?.plannedEndTime) return;
        const start = addDays(String(task.plannedStartTime).slice(0, 10), offsetDays);
        const end = addDays(String(task.plannedEndTime).slice(0, 10), offsetDays);
        await projectApi.editWbs({
          ...task,
          projectId: detail.project.projectId,
          plannedStartTime: `${start} 00:00:00`,
          plannedEndTime: `${end} 00:00:00`,
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
      { label: '来源对象', value: detail.linkSummary.sourceName || `${sourceTypeDict.getLabel(detail.linkSummary.sourceType || '') || detail.linkSummary.sourceType || '-'} / ${detail.linkSummary.sourceId || '-'}` },
      { label: '合同联动', value: detail.linkSummary.contractNo || '-' },
      { label: '预算摘要', value: detail.linkSummary.budgetSummary || '-' },
      { label: '发票摘要', value: detail.linkSummary.invoiceSummary || '-' },
    ];
  }, [detail]);

  const dependencyTargetOptions = useMemo(() => {
    if (!detail) return [];
    return [
      ...detail.milestones.map((item) => ({ label: `里程碑 / ${item.milestoneName}`, value: item.milestoneId || 0, type: 'MILESTONE' })),
      ...detail.wbsTasks.map((item) => ({ label: `WBS / ${item.wbsCode || '-'} ${item.title || ''}`, value: item.taskId || 0, type: 'WBS' })),
    ];
  }, [detail]);

  return (
    <div className="space-y-4">
      <TablePageLayout
        filters={(
          <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-950/88 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-1 flex-wrap items-center gap-3">
              <Input value={keyword} onChange={(e) => { setPageNum(1); setKeyword(e.target.value); }} placeholder="项目名称 / 客户关键字" className="w-full sm:w-[220px]" />
              <div className="w-full sm:w-[180px]">
                <Select value={status || 'ALL'} onValueChange={(v) => { setPageNum(1); setStatus(v === 'ALL' ? '' : v); }}>
                  <SelectTrigger><SelectValue placeholder="状态" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">全部状态</SelectItem>
                    {STATUS_OPTIONS.map((item) => <SelectItem key={item} value={item}>{statusDict.getLabel(item)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="text-xs text-slate-500">第 {pageNum} / {totalPages} 页，共 {total} 条</div>
            </div>
            <Button size="sm" onClick={() => { setEditing(null); setForm(emptyForm); setDialogOpen(true); }} disabled={!hasPermission('oa:project:add')}>
              <Plus size={14} className="mr-1.5" />新建项目
            </Button>
          </div>
        )}
        table={(<TableSurfaceCard>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1180px]">
              <TableHeader>
                <tr>
                  <TableHead>项目编号</TableHead>
                  <TableHead>项目 / 客户</TableHead>
                  <TableHead>负责人 / 部门</TableHead>
                  <TableHead>预算 / 成本</TableHead>
                  <TableHead>进度 / 风险</TableHead>
                  <TableHead>来源 / 基线</TableHead>
                  <TableActionHead>操作</TableActionHead>
                </tr>
              </TableHeader>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {rows.map((row) => (
                  <tr key={row.projectId}>
                    <td className="px-4 py-3 text-sm">{row.projectNo || '-'}</td>
                    <td className="px-4 py-3 text-sm"><div>{row.projectName}</div><div className="text-xs text-slate-500">{row.customerName || '-'}</div></td>
                    <td className="px-4 py-3 text-sm"><div>{row.ownerName || '-'}</div><div className="text-xs text-slate-500">{row.deptName || '-'}</div></td>
                    <td className="px-4 py-3 text-sm"><div>{formatMoney(row.budgetAmount)}</div><div className="text-xs text-slate-500">成本 {formatMoney(row.actualCostAmount)}</div></td>
                    <td className="px-4 py-3 text-sm"><div>{row.progress || 0}%</div><div className="text-xs text-slate-500">{severityDict.getLabel(row.riskLevel || '') || '-'}</div></td>
                    <td className="px-4 py-3 text-sm"><div>{row.sourceName || sourceTypeDict.getLabel(row.sourceType || 'MANUAL') || row.sourceType || '-'}</div><div className="text-xs text-slate-500">基线 {row.baselineVersion || 0}</div></td>
                    <td className="px-4 py-3 text-right">
                      <TableRowActions
                        align="end"
                        overflowLabel="更多"
                          actions={[
                            { label: '查看详情', icon: <Eye size={14} />, onClick: async () => { try { setDetail(await projectApi.getDetail(row.projectId!)); } catch (error) { toast.error(getErrorMessage(error, '加载项目详情失败')); } }, semantic: 'view', isPrimary: true },
                          { label: '编辑项目', icon: <Edit size={14} />, onClick: () => { setEditing(row); setForm(row); setDialogOpen(true); }, semantic: 'edit', isPrimary: true, permissionKey: 'oa:project:edit' },
                          { label: '提交立项', icon: <Send size={14} />, onClick: () => setConfirm({ type: 'submit', row }), hidden: row.status !== 'DRAFT' && row.status !== 'REJECTED', semantic: 'submit', permissionKey: 'oa:project:submit' },
                          { label: '基线快照', icon: <RefreshCcw size={14} />, onClick: () => setConfirm({ type: 'baseline', row }), hidden: row.status === 'ARCHIVED', semantic: 'reset', permissionKey: 'oa:project:baseline' },
                          { label: '归档项目', icon: <Archive size={14} />, onClick: () => setConfirm({ type: 'archive', row }), hidden: !['APPROVED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'].includes(row.status || ''), semantic: 'archive', danger: true, permissionKey: 'oa:project:archive' },
                          { label: '删除项目', icon: <Trash2 size={14} />, onClick: () => setConfirm({ type: 'delete', row }), semantic: 'delete', danger: true, permissionKey: 'oa:project:remove' },
                        ]}
                      />
                    </td>
                  </tr>
                ))}
                {!loading && rows.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-16 text-center text-sm text-slate-500"><FolderKanban className="mx-auto mb-3 h-4 w-4" />暂无项目。下一步操作：新建项目或从 CRM 商机 / 报价 / 合同生成草稿。</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </TableSurfaceCard>)}
        pagination={total > 0 ? <Pagination total={total} page={pageNum} pageSize={10} showPageSizeSelector={false} showJump={false} onPageChange={setPageNum} onPageSizeChange={() => {}} /> : null}
      />

      <BaseDialog
        open={dialogOpen}
        title={editing ? '编辑项目' : '新建项目'}
        onClose={() => setDialogOpen(false)}
        width="wide"
        footer={<><Button variant="outline" onClick={() => setDialogOpen(false)}>取消</Button><Button onClick={() => void saveProject()}>保存</Button></>}
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-400">
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
            <div>
              <Label className={fieldLabelClassName}>来源类型</Label>
              <Input value={sourceTypeDict.getLabel(form.sourceType || 'MANUAL') || form.sourceType || '手工创建'} disabled />
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

      <BaseDialog open={Boolean(detail)} title={detail?.project.projectName || '项目详情'} onClose={() => setDetail(null)} width="extra-wide">
        {detail ? (
          <div className="space-y-4">
            <Tabs value={detailTab} onValueChange={(value) => setDetailTab(value as DetailTab)}>
              <TabsList className="w-full justify-start overflow-x-auto">
                {tabs.map((tab) => (
                  <TabsTrigger key={tab.value} value={tab.value} className="gap-1.5">
                    {tab.icon}
                    {tab.label}
                  </TabsTrigger>
                ))}
              </TabsList>

              <TabsContent value="overview" className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <Card><CardHeader className="pb-3"><CardTitle className="text-base">项目编号</CardTitle></CardHeader><CardContent className="text-sm">{detail.project.projectNo || '-'}</CardContent></Card>
                  <Card><CardHeader className="pb-3"><CardTitle className="text-base">状态</CardTitle></CardHeader><CardContent className="text-sm">{statusDict.getLabel(detail.project.status || 'DRAFT') || '-'}</CardContent></Card>
                  <Card><CardHeader className="pb-3"><CardTitle className="text-base">预算 / 成本</CardTitle></CardHeader><CardContent className="text-sm">{formatMoney(detail.project.budgetAmount)} / {formatMoney(detail.costSummary?.totalAmount || detail.project.actualCostAmount)}</CardContent></Card>
                  <Card><CardHeader className="pb-3"><CardTitle className="text-base">基线版本</CardTitle></CardHeader><CardContent className="text-sm">{detail.baselineVersion || detail.project.baselineVersion || 0}</CardContent></Card>
                </div>

                <div className="grid gap-4 xl:grid-cols-2">
                  <Card>
                    <CardHeader className="pb-3"><CardTitle className="text-base">来源与 KPI</CardTitle></CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      <div>客户：{detail.project.customerName || '-'}</div>
                      <div>合同：{detail.project.contractNo || '-'}</div>
                      <div>来源：{detail.project.sourceName || sourceTypeDict.getLabel(detail.project.sourceType || 'MANUAL') || detail.project.sourceType || '-'} / {detail.project.sourceId || '-'}</div>
                      <div>逾期里程碑：{detail.kpi?.overdueMilestoneCount || 0}</div>
                      <div>逾期任务：{detail.kpi?.overdueTaskCount || 0}</div>
                      <div>开放风险：{detail.kpi?.openRiskCount || 0}</div>
                      <div>排期偏差：{detail.kpi?.scheduleVarianceDays || 0} 天</div>
                      <div>成本执行率：{Number(detail.kpi?.costExecutionRate || 0).toFixed(1)}%</div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-3"><CardTitle className="text-base">项目成员</CardTitle></CardHeader>
                    <CardContent className="space-y-2">
                      {detail.members.length ? detail.members.map((item) => (
                        <div key={item.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-slate-900">
                          <div>
                            <div>{item.userName || '-'}</div>
                            <div className="text-xs text-slate-500">{item.roleName || item.roleCode || '-'}</div>
                          </div>
                          <TableRowActions actions={[
                          { label: '编辑成员', icon: <Edit size={14} />, onClick: () => openChildDialog({ type: 'member', item }), semantic: 'edit', isPrimary: true, permissionKey: 'oa:project:edit' },
                          { label: '删除成员', icon: <Trash2 size={14} />, onClick: () => void removeChild('member', item.id!), semantic: 'delete', danger: true, permissionKey: 'oa:project:edit' },
                        ]} />
                      </div>
                    )) : <div className="text-sm text-slate-500">暂无项目成员</div>}
                      <Button size="sm" variant="outline" onClick={() => openChildDialog({ type: 'member' })} disabled={!hasPermission('oa:project:edit')}><Users size={14} className="mr-1.5" />新增成员</Button>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="gantt" className="space-y-4">
                <Card>
                  <CardHeader className="pb-3"><CardTitle className="text-base">专业计划版甘特图</CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Button size="sm" variant="outline" onClick={() => setConfirm({ type: 'baseline', row: detail.project })} disabled={!hasPermission('oa:project:baseline')}><RefreshCcw size={14} className="mr-1.5" />重置基线</Button>
                      <div className="text-xs text-slate-500">灰条 = 基线排期；彩色条 = 当前排期；拖动彩条可按日改期。</div>
                    </div>
                    {ganttRows.length ? (
                      <DndContext sensors={sensors} onDragEnd={handleGanttDragEnd}>
                        <div className="overflow-x-auto">
                          <div style={{ minWidth: `${260 + ganttDateColumns.length * DAY_WIDTH}px` }}>
                            <div className="grid border-b border-slate-200 pb-2 text-xs text-slate-500 dark:border-slate-800" style={{ gridTemplateColumns: `260px repeat(${ganttDateColumns.length}, ${DAY_WIDTH}px)` }}>
                              <div>任务 / 里程碑</div>
                              {ganttDateColumns.map((date) => <div key={date} className="text-center">{date.slice(5)}</div>)}
                            </div>
                            <div className="space-y-2 pt-3">
                              {ganttRows.map((item) => {
                                const left = diffDays(ganttDateColumns[0], item.start) * DAY_WIDTH;
                                const width = Math.max(1, diffDays(item.start, item.end) + 1) * DAY_WIDTH;
                                const baselineLeft = item.baselineStart ? diffDays(ganttDateColumns[0], item.baselineStart) * DAY_WIDTH : undefined;
                                const baselineWidth = item.baselineStart && item.baselineEnd ? Math.max(1, diffDays(item.baselineStart, item.baselineEnd) + 1) * DAY_WIDTH : undefined;
                                return (
                                  <div key={item.key} className="grid items-center gap-0 rounded-lg border border-slate-100 bg-slate-50 px-0 py-2 dark:border-slate-800 dark:bg-slate-900" style={{ gridTemplateColumns: `260px 1fr` }}>
                                    <div className="px-3 text-sm">
                                      <div className="font-medium text-slate-900 dark:text-slate-100">{item.label}</div>
                                      <div className="text-xs text-slate-500">{item.start} ~ {item.end}{item.overdue ? ' / 已逾期' : ''}</div>
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
                                      />
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      </DndContext>
                    ) : <div className="text-sm text-slate-500">暂无可渲染的排期数据。先新增里程碑或 WBS 任务。</div>}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="milestone" className="space-y-4">
                <Card>
                  <CardHeader className="pb-3"><CardTitle className="text-base">里程碑维护</CardTitle></CardHeader>
                  <CardContent className="space-y-2">
                    {detail.milestones.length ? detail.milestones.map((item) => (
                      <div key={item.milestoneId} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-slate-900">
                        <div>
                          <div>{item.milestoneName}</div>
                          <div className="text-xs text-slate-500">计划 {item.plannedDate || '-'} / 基线 {item.baselineDate || '-'} / 实际 {item.actualDate || '-'} / {item.status || '-'}</div>
                        </div>
                        <TableRowActions actions={[
                          { label: '编辑里程碑', icon: <Edit size={14} />, onClick: () => openChildDialog({ type: 'milestone', item }), semantic: 'edit', isPrimary: true, permissionKey: 'oa:project:edit' },
                          { label: '删除里程碑', icon: <Trash2 size={14} />, onClick: () => void removeChild('milestone', item.milestoneId!), semantic: 'delete', danger: true, permissionKey: 'oa:project:edit' },
                        ]} />
                      </div>
                    )) : <div className="text-sm text-slate-500">暂无里程碑</div>}
                    <Button size="sm" onClick={() => openChildDialog({ type: 'milestone' })} disabled={!hasPermission('oa:project:edit')}><Plus size={14} className="mr-1.5" />新增里程碑</Button>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="wbs" className="space-y-4">
                <Card>
                  <CardHeader className="pb-3"><CardTitle className="text-base">WBS 树维护</CardTitle></CardHeader>
                  <CardContent className="space-y-2">
                    {detail.wbsTasks.length ? detail.wbsTasks.map((item) => (
                      <div key={item.taskId} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-slate-900">
                        <div>
                          <div>{item.wbsCode || '-'} {item.title || '-'}</div>
                          <div className="text-xs text-slate-500">计划 {item.plannedStartTime ? String(item.plannedStartTime).slice(0, 10) : '-'} ~ {item.plannedEndTime ? String(item.plannedEndTime).slice(0, 10) : '-'} / 基线 {item.baselineStartTime ? String(item.baselineStartTime).slice(0, 10) : '-'} ~ {item.baselineEndTime ? String(item.baselineEndTime).slice(0, 10) : '-'}</div>
                        </div>
                        <TableRowActions actions={[
                          { label: '编辑 WBS', icon: <Edit size={14} />, onClick: () => openChildDialog({ type: 'wbs', item }), semantic: 'edit', isPrimary: true, permissionKey: 'oa:project:wbs' },
                          { label: '删除 WBS', icon: <Trash2 size={14} />, onClick: () => void removeChild('wbs', item.taskId!), semantic: 'delete', danger: true, permissionKey: 'oa:project:wbs' },
                        ]} />
                      </div>
                    )) : <div className="text-sm text-slate-500">暂无 WBS 任务</div>}
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" onClick={() => openChildDialog({ type: 'wbs' })} disabled={!hasPermission('oa:project:wbs')}><Plus size={14} className="mr-1.5" />新增 WBS</Button>
                      <Button size="sm" variant="outline" onClick={() => {
                        if (!detail?.project.projectId) return;
                        const treePayload = detail.wbsTasks.map((item, index) => ({ taskId: item.taskId, parentId: item.parentId, sortOrder: index + 1 }));
                        void projectApi.updateWbsTree(detail.project.projectId, treePayload).then(async () => {
                          toast.success('WBS 树顺序已重排');
                          await refreshDetail(detail.project.projectId!);
                        }).catch((error) => toast.error(getErrorMessage(error, 'WBS 树保存失败')));
                      }} disabled={!hasPermission('oa:project:wbs')}><ArrowRightLeft size={14} className="mr-1.5" />保存当前顺序</Button>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="cost" className="space-y-4">
                <div className="grid gap-4 md:grid-cols-3">
                  <Card><CardHeader className="pb-3"><CardTitle className="text-base">报销成本</CardTitle></CardHeader><CardContent className="text-sm">{formatMoney(detail.costSummary?.expenseAmount)}</CardContent></Card>
                  <Card><CardHeader className="pb-3"><CardTitle className="text-base">采购成本</CardTitle></CardHeader><CardContent className="text-sm">{formatMoney(detail.costSummary?.purchaseAmount)}</CardContent></Card>
                  <Card><CardHeader className="pb-3"><CardTitle className="text-base">付款成本</CardTitle></CardHeader><CardContent className="text-sm">{formatMoney(detail.costSummary?.paymentAmount)}</CardContent></Card>
                </div>
              </TabsContent>

              <TabsContent value="risk" className="space-y-4">
                <div className="grid gap-4 xl:grid-cols-2">
                  <Card>
                    <CardHeader className="pb-3"><CardTitle className="text-base">项目风险维护</CardTitle></CardHeader>
                    <CardContent className="space-y-2">
                      {detail.risks.length ? detail.risks.map((item, index) => (
                        <div key={`${item.riskId || item.riskCode || index}`} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-slate-900">
                          <div>
                            <div>{item.riskName || '-'}</div>
                            <div className="text-xs text-slate-500">{severityDict.getLabel(item.riskLevel || '') || '-'} / {item.triggerSource || '-'} / {item.status || '-'}</div>
                          </div>
                          {item.riskId ? (
                            <TableRowActions actions={[
                              { label: '编辑风险', icon: <Edit size={14} />, onClick: () => openChildDialog({ type: 'risk', item }), semantic: 'edit', isPrimary: true, permissionKey: 'oa:project:edit' },
                              { label: '删除风险', icon: <Trash2 size={14} />, onClick: () => void removeChild('risk', item.riskId!), semantic: 'delete', danger: true, permissionKey: 'oa:project:edit' },
                            ]} />
                          ) : null}
                        </div>
                      )) : <div className="text-sm text-slate-500">暂无项目风险</div>}
                      <Button size="sm" onClick={() => openChildDialog({ type: 'risk' })} disabled={!hasPermission('oa:project:edit')}><Plus size={14} className="mr-1.5" />新增风险</Button>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-3"><CardTitle className="text-base">项目依赖</CardTitle></CardHeader>
                    <CardContent className="space-y-2">
                      {detail.dependencies.length ? detail.dependencies.map((item) => (
                        <div key={item.dependencyId} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-slate-900">
                          <div>
                            <div>{item.predecessorType} {item.predecessorId} → {item.successorType} {item.successorId}</div>
                            <div className="text-xs text-slate-500">{item.dependencyType || 'FS'} / 延迟 {item.lagDays || 0} 天</div>
                          </div>
                          <TableRowActions actions={[
                            { label: '编辑依赖', icon: <Edit size={14} />, onClick: () => openChildDialog({ type: 'dependency', item }), semantic: 'edit', isPrimary: true, permissionKey: 'oa:project:edit' },
                            { label: '删除依赖', icon: <Trash2 size={14} />, onClick: () => void removeChild('dependency', item.dependencyId!), semantic: 'delete', danger: true, permissionKey: 'oa:project:edit' },
                          ]} />
                        </div>
                      )) : <div className="text-sm text-slate-500">暂无项目依赖</div>}
                      <Button size="sm" variant="outline" onClick={() => openChildDialog({ type: 'dependency' })} disabled={!hasPermission('oa:project:edit')}><Link2 size={14} className="mr-1.5" />新增依赖</Button>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="linkage" className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  {linkageCards.map((item) => (
                    <Card key={item.label}>
                      <CardHeader className="pb-3"><CardTitle className="text-base">{item.label}</CardTitle></CardHeader>
                      <CardContent className="text-sm">{item.value}</CardContent>
                    </Card>
                  ))}
                </div>
                <Card>
                  <CardHeader className="pb-3"><CardTitle className="text-base">业务跳转</CardTitle></CardHeader>
                  <CardContent className="flex flex-wrap gap-2">
                    {detail.project.customerId ? <Button size="sm" variant="outline" onClick={() => navigate(`/office/crm/customer/${detail.project.customerId}`)}>打开客户360</Button> : null}
                    {detail.project.contractId ? <Button size="sm" variant="outline" onClick={() => navigate('/office/contracts', { state: { focusContractId: detail.project.contractId } })}>打开 OA 合同</Button> : null}
                    <Button size="sm" variant="outline" onClick={() => navigate('/office/budget')}>查看预算管理</Button>
                    <Button size="sm" variant="outline" onClick={() => navigate('/office/invoice')}>查看发票管理</Button>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        ) : null}
      </BaseDialog>

      <BaseDialog
        open={Boolean(childDialog)}
        title={
          childDialog?.type === 'member' ? (memberForm.id ? '编辑项目成员' : '新增项目成员')
            : childDialog?.type === 'milestone' ? (milestoneForm.milestoneId ? '编辑里程碑' : '新增里程碑')
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

        {childDialog?.type === 'milestone' ? (
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label className={fieldLabelClassName}>里程碑名称</Label>
              <Input value={milestoneForm.milestoneName || ''} onChange={(e) => setMilestoneForm((prev) => ({ ...prev, milestoneName: e.target.value }))} placeholder="例如：完成一期上线验收" />
            </div>
            <div>
              <Label className={fieldLabelClassName}>计划日期</Label>
              <DatePicker value={toDateInput(milestoneForm.plannedDate)} onChange={(e) => setMilestoneForm((prev) => ({ ...prev, plannedDate: e.target.value }))} />
            </div>
            <div>
              <Label className={fieldLabelClassName}>实际完成日期</Label>
              <DatePicker value={toDateInput(milestoneForm.actualDate)} onChange={(e) => setMilestoneForm((prev) => ({ ...prev, actualDate: e.target.value || undefined }))} />
            </div>
          </div>
        ) : null}

        {childDialog?.type === 'wbs' ? (
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label className={fieldLabelClassName}>任务标题</Label>
              <Input value={wbsForm.title || ''} onChange={(e) => setWbsForm((prev) => ({ ...prev, title: e.target.value }))} placeholder="例如：完成主数据初始化" />
            </div>
            <div>
              <Label className={fieldLabelClassName}>WBS 编码</Label>
              <Input value={wbsForm.wbsCode || ''} onChange={(e) => setWbsForm((prev) => ({ ...prev, wbsCode: e.target.value }))} placeholder="留空自动生成" />
            </div>
            <div>
              <Label className={fieldLabelClassName}>计划开始</Label>
              <DatePicker value={toDateInput(wbsForm.plannedStartTime)} onChange={(e) => setWbsForm((prev) => ({ ...prev, plannedStartTime: e.target.value ? `${e.target.value} 00:00:00` : '' }))} />
            </div>
            <div>
              <Label className={fieldLabelClassName}>计划结束</Label>
              <DatePicker value={toDateInput(wbsForm.plannedEndTime)} onChange={(e) => setWbsForm((prev) => ({ ...prev, plannedEndTime: e.target.value ? `${e.target.value} 00:00:00` : '' }))} />
            </div>
          </div>
        ) : null}

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
                  {RISK_LEVELS.map((value) => <SelectItem key={value} value={value}>{severityDict.getLabel(value)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2">
              <Label className={fieldLabelClassName}>风险说明</Label>
              <Textarea value={riskForm.summary || ''} onChange={(e) => setRiskForm((prev) => ({ ...prev, summary: e.target.value }))} placeholder="风险触发点、当前影响与应对方案" />
            </div>
          </div>
        ) : null}

        {childDialog?.type === 'dependency' ? (
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label className={fieldLabelClassName}>前置对象</Label>
              <Select value={dependencyForm.predecessorId ? `${dependencyForm.predecessorType}:${dependencyForm.predecessorId}` : 'NONE'} onValueChange={(value) => {
                if (value === 'NONE') {
                  setDependencyForm((prev) => ({ ...prev, predecessorType: 'WBS', predecessorId: undefined }));
                  return;
                }
                const [type, id] = value.split(':');
                setDependencyForm((prev) => ({ ...prev, predecessorType: type, predecessorId: Number(id) }));
              }}>
                <SelectTrigger><SelectValue placeholder="选择前置对象" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">选择前置对象</SelectItem>
                  {dependencyTargetOptions.map((item) => <SelectItem key={`pre-${item.type}-${item.value}`} value={`${item.type}:${item.value}`}>{item.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className={fieldLabelClassName}>后置对象</Label>
              <Select value={dependencyForm.successorId ? `${dependencyForm.successorType}:${dependencyForm.successorId}` : 'NONE'} onValueChange={(value) => {
                if (value === 'NONE') {
                  setDependencyForm((prev) => ({ ...prev, successorType: 'WBS', successorId: undefined }));
                  return;
                }
                const [type, id] = value.split(':');
                setDependencyForm((prev) => ({ ...prev, successorType: type, successorId: Number(id) }));
              }}>
                <SelectTrigger><SelectValue placeholder="选择后置对象" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">选择后置对象</SelectItem>
                  {dependencyTargetOptions.map((item) => <SelectItem key={`suc-${item.type}-${item.value}`} value={`${item.type}:${item.value}`}>{item.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className={fieldLabelClassName}>依赖类型</Label>
              <Select value={dependencyForm.dependencyType || 'FS'} onValueChange={(value) => setDependencyForm((prev) => ({ ...prev, dependencyType: value }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="FS">FS 完成-开始</SelectItem></SelectContent>
              </Select>
            </div>
            <div>
              <Label className={fieldLabelClassName}>延迟天数</Label>
              <Input type="number" value={String(dependencyForm.lagDays || 0)} onChange={(e) => setDependencyForm((prev) => ({ ...prev, lagDays: Number(e.target.value || 0) }))} placeholder="例如：2" />
            </div>
          </div>
        ) : null}
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

