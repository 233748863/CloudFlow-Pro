import React, { useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  CheckCircle2,
  ClipboardList,
  FilePlus2,
  GitBranch,
  Layers3,
  RefreshCcw,
  Search,
  Target,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { getErrorMessage } from '@/utils/errorMessage';
import { BaseDialog, ConfirmDialog, DatePicker } from '@/components/common';
import { TablePageLayout } from '@/components/layout/TablePageLayout';
import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableActionHead,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
} from '@/components/common';
import { StatCard } from '@/components/common/StatCard';
import {
  HrEmployee,
  PerformanceAssignment,
  PerformanceCategoryDefinition,
  PerformanceMetric,
  PerformanceObjective,
  PerformanceOverview,
  CrmPerformanceSummary,
  createPerformanceObjective,
  createPerformanceSalaryAdjustment,
  getDeptTreeOptions,
  getPerformanceObjectiveTree,
  getPerformanceOverview,
  listCrmTopDepartments,
  listCrmTopOwners,
  listEmployees,
  listPerformanceObjectives,
  savePerformanceAssignmentChildren,
  submitPerformancePlan,
  submitPerformanceResult,
  updatePerformanceResult,
} from '@/services/api/hr';
import { buildEmployeeLabel, flattenDeptTree, matchEmployeeKeyword, normalizeRows } from './hrShared';
import { cn } from '@/utils/cn';

const ALL_STATUS = '__all__';

type PerformanceTab = 'tree' | 'matrix' | 'employees' | 'progress' | 'archive' | 'salary' | 'sales';
type CreateCategoryRow = {
  key: string;
  categoryCode: string;
  categoryName: string;
};
type CreateMetricRow = {
  key: string;
  metricCode: string;
  metricName: string;
  metricUnit: string;
  valueType: 'DECIMAL' | 'INTEGER' | 'PERCENT';
  precision: string;
  metricWeight: string;
};
type CreateDeptRow = {
  key: string;
  deptId: string;
  targetAmount: string;
  ownerEmployeeId: string;
  categoryAmounts: Record<string, string>;
};
type SplitRow = {
  key: string;
  categoryCode?: string;
  categoryName?: string;
  metricCode?: string;
  metricName?: string;
  metricUnit?: string;
  metricWeight?: string;
  targetAmount: string;
  employeeId?: string;
  employeeSearch?: string;
  locked?: boolean;
};
type DeleteTarget =
  | { kind: 'dept-row'; key: string }
  | { kind: 'split-row'; key: string };
type TreeRow = PerformanceAssignment & { depth: number };
type DepartmentMatrixRow = {
  id: number;
  assigneeName: string;
  targetAmount: number;
  categoryTotal: number;
  remainAmount: number;
  itemCount: number;
};
type EmployeeSummaryRow = {
  employeeId: number;
  employeeName: string;
  metricSummary: string;
  completionRate: number;
  categories: string;
};
type EmployeeSelectOption = {
  value: string;
  label: string;
  searchLabel: string;
  deptLabel: string;
  employee: HrEmployee;
};
type AssigneeLabelResolver = (node: PerformanceAssignment) => string;

const defaultCreateForm = () => ({
  cycleName: '',
  cycleStartDate: '',
  cycleEndDate: '',
  objectiveName: '',
  totalTargetAmount: '',
  scoreCap: '120',
});

const rowKey = () => `${Date.now()}-${Math.random()}`;
const metricTypeLabel = (valueType?: string | null) => {
  const labels: Record<string, string> = { DECIMAL: '小数', INTEGER: '整数', PERCENT: '百分比' };
  return labels[String(valueType || '').toUpperCase()] || '小数';
};

const EmployeePicker: React.FC<{
  value?: string;
  fallbackLabel?: string;
  options: EmployeeSelectOption[];
  loading: boolean;
  loaded: boolean;
  placeholder: string;
  onChange: (employeeId: string) => void;
}> = ({ value = '', fallbackLabel, options, loading, loaded, placeholder, onChange }) => {
  const [searchText, setSearchText] = useState('');
  const selected = options.find((option) => option.value === value);
  const normalizedSearch = searchText.trim().toLowerCase();
  const filteredOptions = normalizedSearch
    ? options.filter((option) =>
      matchEmployeeKeyword(option.employee, normalizedSearch)
        || option.value.includes(normalizedSearch)
        || option.label.toLowerCase().includes(normalizedSearch)
        || option.deptLabel.toLowerCase().includes(normalizedSearch)
        || option.searchLabel.toLowerCase().includes(normalizedSearch),
    )
    : options;
  const groupedOptions = filteredOptions.reduce<Array<{ deptLabel: string; options: EmployeeSelectOption[] }>>((groups, option) => {
    const group = groups.find((item) => item.deptLabel === option.deptLabel);
    if (group) {
      group.options.push(option);
    } else {
      groups.push({ deptLabel: option.deptLabel, options: [option] });
    }
    return groups;
  }, []);

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="min-h-10 px-3">
        <span className={cn('min-w-0 flex-1 truncate text-left', selected || fallbackLabel ? 'text-slate-900 dark:text-slate-100' : 'text-slate-400 dark:text-slate-500')}>
          {selected?.searchLabel || fallbackLabel || placeholder}
        </span>
      </SelectTrigger>
      <SelectContent className="w-[min(460px,calc(100vw-24px))]">
        <div className="border-b border-slate-100 bg-white p-2 dark:border-slate-800 dark:bg-slate-900">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              className="h-9 rounded-lg pl-9 text-sm"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              onClick={(event) => event.stopPropagation()}
              placeholder="搜索员工、工号或部门"
            />
          </div>
        </div>
        <div className="max-h-64 overflow-y-auto p-1">
          {loading ? (
            <div className="px-3 py-6 text-center text-sm text-slate-500 dark:text-slate-400">员工列表加载中...</div>
          ) : options.length === 0 && loaded ? (
            <div className="px-3 py-6 text-center text-sm text-slate-500 dark:text-slate-400">未加载到员工，请导入员工种子数据</div>
          ) : groupedOptions.length === 0 ? (
            <div className="px-3 py-6 text-center text-sm text-slate-500 dark:text-slate-400">未找到匹配员工</div>
          ) : (
            groupedOptions.map((group) => (
              <div key={group.deptLabel} className="py-1">
                <div className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-slate-500 dark:text-slate-400">
                  <Users size={13} />
                  <span className="truncate">{group.deptLabel}</span>
                </div>
                {group.options.map((option) => (
                  <SelectItem key={option.value} value={option.value} className="items-start py-2">
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="truncate font-medium">{option.employee.name}</span>
                        <span className="shrink-0 text-xs text-slate-500 dark:text-slate-400">{option.employee.employeeNo}</span>
                      </div>
                      <div className="truncate text-xs text-slate-500 dark:text-slate-400">
                        {[option.deptLabel, option.employee.postName || option.employee.positionName].filter(Boolean).join(' / ')}
                      </div>
                    </div>
                  </SelectItem>
                ))}
              </div>
            ))
          )}
        </div>
      </SelectContent>
    </Select>
  );
};

const defaultCategoryRows = (): CreateCategoryRow[] => [
  { key: rowKey(), categoryCode: 'CORE_GOODS', categoryName: '核心商品' },
];

const defaultMetricRows = (): CreateMetricRow[] => [
  { key: rowKey(), metricCode: 'SALES_AMOUNT', metricName: '销售额', metricUnit: '元', valueType: 'DECIMAL', precision: '2', metricWeight: '100' },
];

const createDeptRow = (): CreateDeptRow => ({
  key: rowKey(),
  deptId: '',
  targetAmount: '',
  ownerEmployeeId: '',
  categoryAmounts: {},
});

const formatAmount = (value?: number | null) =>
  Number(value || 0).toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const toAmount = (value: string | number | undefined | null) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : 0;
};

const INTEGER_UNITS = new Set(['件', '个', '单', '次', '人', '台', '套', '箱']);
const resolveValueType = (valueType?: string | null, unit?: string | null) => {
  const normalized = String(valueType || '').toUpperCase();
  if (['DECIMAL', 'INTEGER', 'PERCENT'].includes(normalized)) return normalized as 'DECIMAL' | 'INTEGER' | 'PERCENT';
  return INTEGER_UNITS.has(String(unit || '').trim()) ? 'INTEGER' : 'DECIMAL';
};
const resolvePrecision = (precision?: number | string | null, valueType?: string | null, unit?: string | null) => {
  if (resolveValueType(valueType, unit) === 'INTEGER') return 0;
  const parsed = Number(precision);
  return Number.isFinite(parsed) ? Math.min(4, Math.max(0, Math.round(parsed))) : 2;
};
const metricPrecisionOf = (metric?: {
  precision?: number | string | null;
  metricPrecision?: number | string | null;
  valueType?: string | null;
  metricValueType?: string | null;
  metricUnit?: string | null;
}) => resolvePrecision(metric?.precision ?? metric?.metricPrecision, metric?.valueType ?? metric?.metricValueType, metric?.metricUnit);
const toMetricValue = (value: string | number | undefined | null, metric?: { precision?: number | string | null; metricPrecision?: number | string | null; valueType?: string | null; metricValueType?: string | null; metricUnit?: string | null }) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Number(parsed.toFixed(metricPrecisionOf(metric)));
};
const isMetricValueValid = (value: string | number | undefined | null, metric?: { precision?: number | string | null; metricPrecision?: number | string | null; valueType?: string | null; metricValueType?: string | null; metricUnit?: string | null }) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return false;
  const valueType = resolveValueType(metric?.valueType ?? metric?.metricValueType, metric?.metricUnit);
  if (valueType === 'INTEGER' && !Number.isInteger(parsed)) return false;
  if (valueType === 'PERCENT' && (parsed < 0 || parsed > 100)) return false;
  return true;
};

const toPrecisionUnits = (value: string | number | undefined | null, precision = 2) => Math.round(Number(value || 0) * 10 ** precision);
const normalizeCode = (value?: string | null) => String(value || '').trim().toUpperCase();
const categoryMetricKey = (categoryCode?: string | null, metricCode?: string | null) =>
  `${normalizeCode(categoryCode)}:${normalizeCode(metricCode)}`;

const formatValue = (value?: number | null, unit?: string | null, precision = 2) => {
  const formatted = Number(value || 0).toLocaleString('zh-CN', {
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
  });
  return unit ? `${formatted} ${unit}` : formatted;
};

type MetricDisplay = Pick<PerformanceAssignment, 'metricName' | 'metricCode' | 'metricUnit' | 'metricWeight' | 'metricPrecision' | 'metricValueType'> & {
  precision?: number | string | null;
  valueType?: string | null;
};

const metricDescriptor = (node: Pick<MetricDisplay, 'metricName' | 'metricCode' | 'metricUnit' | 'metricWeight'>) => {
  const name = node.metricName || node.metricCode || '-';
  const unit = node.metricUnit ? ` / ${node.metricUnit}` : '';
  const weight = node.metricWeight != null ? ` / 权重${Number(node.metricWeight).toFixed(0)}` : '';
  return `${name}${unit}${weight}`;
};

const metricDisplayFromDefinition = (metric?: PerformanceMetric): MetricDisplay | null => {
  if (!metric) return null;
  return {
    metricCode: metric.metricCode,
    metricName: metric.metricName,
    metricUnit: metric.metricUnit,
    metricWeight: metric.metricWeight,
    metricPrecision: metric.precision ?? null,
    metricValueType: metric.valueType ?? null,
    precision: metric.precision,
    valueType: metric.valueType,
  };
};

const treeMetricDisplay = (node: PerformanceAssignment, primaryMetric?: PerformanceMetric, isMultiMetric = false): MetricDisplay | null => {
  if (node.metricCode || node.metricName) return node;
  return isMultiMetric ? null : metricDisplayFromDefinition(primaryMetric);
};

const statusLabel = (status?: string) => {
  const labels: Record<string, string> = {
    DRAFT: '草稿',
    PLAN_APPROVING: '计划审批中',
    PLAN_APPROVED: '执行中',
    RESULT_APPROVING: '结果审批中',
    COMPLETED: '已归档',
    REJECTED: '已驳回',
    CANCELLED: '已取消',
  };
  return labels[String(status || '').toUpperCase()] || status || '-';
};

const statusBadgeClass = (status?: string) => {
  switch (String(status || '').toUpperCase()) {
    case 'COMPLETED':
      return 'badge badge-success';
    case 'PLAN_APPROVED':
      return 'badge badge-primary';
    case 'PLAN_APPROVING':
    case 'RESULT_APPROVING':
      return 'badge badge-warning';
    case 'REJECTED':
    case 'CANCELLED':
      return 'rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/30 dark:text-red-300';
    default:
      return 'badge badge-gray';
  }
};

const completionTone = (rate?: number) => {
  const value = Number(rate || 0);
  if (value >= 100) return 'text-emerald-600 dark:text-emerald-400';
  if (value >= 80) return 'text-amber-600 dark:text-amber-400';
  return 'text-red-600 dark:text-red-400';
};

const completionBadgeClass = (rate?: number) => {
  const value = Number(rate || 0);
  if (value >= 100) return 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900';
  if (value >= 80) return 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900';
  return 'bg-red-50 text-red-700 ring-red-200 dark:bg-red-950/40 dark:text-red-300 dark:ring-red-900';
};

const flattenTree = (nodes: PerformanceAssignment[] = [], depth = 0): TreeRow[] =>
  nodes.flatMap((node) => [
    { ...node, depth },
    ...flattenTree(node.children || [], depth + 1),
  ]);

const collectLeaves = (nodes: PerformanceAssignment[] = []): PerformanceAssignment[] =>
  nodes.flatMap((node) => {
    if (!node.children?.length && node.assigneeType === 'EMPLOYEE') {
      return [node];
    }
    return collectLeaves(node.children || []);
  });

const collectCategoryNodes = (nodes: PerformanceAssignment[] = []): PerformanceAssignment[] =>
  nodes.flatMap((node) => [
    ...(node.assigneeType === 'DEPT' && node.categoryCode ? [node] : []),
    ...collectCategoryNodes(node.children || []),
  ]);

const findNode = (nodes: PerformanceAssignment[] = [], id: number): PerformanceAssignment | null => {
  for (const node of nodes) {
    if (node.id === id) return node;
    const child = findNode(node.children || [], id);
    if (child) return child;
  }
  return null;
};

const defaultAssigneeLabel = (node: PerformanceAssignment) =>
  node.assigneeName || (node.assigneeType === 'EMPLOYEE' ? `员工 #${node.assigneeId}` : `部门 #${node.assigneeId}`);

const nodeTitle = (node: PerformanceAssignment, fallbackMetric?: MetricDisplay | null, assigneeLabel = defaultAssigneeLabel(node)) => {
  const metricName = node.metricName || node.metricCode || fallbackMetric?.metricName || fallbackMetric?.metricCode || '-';
  if (node.assigneeType === 'EMPLOYEE') {
    return `${assigneeLabel} / ${node.categoryName || node.categoryCode || '-'} / ${metricName}`;
  }
  if (node.categoryCode) {
    return `${assigneeLabel} / ${node.categoryName || node.categoryCode || '-'} / ${metricName}`;
  }
  return assigneeLabel;
};

const nodeSubtitle = (node: PerformanceAssignment, fallbackMetric?: MetricDisplay | null) => {
  if (node.assigneeType === 'EMPLOYEE') {
    return [node.categoryName || node.categoryCode || '-', node.metricName || node.metricCode || fallbackMetric?.metricName || fallbackMetric?.metricCode || '-']
      .filter(Boolean)
      .join(' / ');
  }
  if (node.categoryCode) {
    return [node.categoryName || node.categoryCode || '-', node.metricName || node.metricCode || fallbackMetric?.metricName || fallbackMetric?.metricCode || '-']
      .filter(Boolean)
      .join(' / ');
  }
  return `#${node.id}`;
};

type AssignmentContext = Pick<PerformanceAssignment,
  'categoryCode'
  | 'categoryName'
  | 'metricCode'
  | 'metricName'
  | 'metricUnit'
  | 'metricWeight'
  | 'metricPrecision'
  | 'metricValueType'
  | 'quotaSource'
>;

const hydrateAssignmentContext = (
  node: PerformanceAssignment,
  parentContext: AssignmentContext = {},
): PerformanceAssignment => {
  const hydrated: PerformanceAssignment = {
    ...node,
    categoryCode: node.categoryCode || parentContext.categoryCode,
    categoryName: node.categoryName || node.categoryCode || parentContext.categoryName || parentContext.categoryCode,
    metricCode: node.metricCode || parentContext.metricCode,
    metricName: node.metricName || node.metricCode || parentContext.metricName || parentContext.metricCode,
    metricUnit: node.metricUnit || parentContext.metricUnit,
    metricWeight: node.metricWeight ?? parentContext.metricWeight,
    metricPrecision: node.metricPrecision ?? parentContext.metricPrecision,
    metricValueType: node.metricValueType || parentContext.metricValueType,
    quotaSource: node.quotaSource || parentContext.quotaSource,
  };
  const nextContext: AssignmentContext = {
    categoryCode: hydrated.categoryCode,
    categoryName: hydrated.categoryName,
    metricCode: hydrated.metricCode,
    metricName: hydrated.metricName,
    metricUnit: hydrated.metricUnit,
    metricWeight: hydrated.metricWeight,
    metricPrecision: hydrated.metricPrecision,
    metricValueType: hydrated.metricValueType,
    quotaSource: hydrated.quotaSource,
  };
  return {
    ...hydrated,
    children: (node.children || []).map((child) => hydrateAssignmentContext(child, nextContext)),
  };
};

const hydrateObjectiveDetail = (
  detail: PerformanceObjective,
  snapshot?: PerformanceObjective | null,
): PerformanceObjective => ({
  ...snapshot,
  ...detail,
  objectiveNo: detail.objectiveNo || snapshot?.objectiveNo,
  cycleName: detail.cycleName || snapshot?.cycleName || '',
  cycleStartDate: detail.cycleStartDate || snapshot?.cycleStartDate || '',
  cycleEndDate: detail.cycleEndDate || snapshot?.cycleEndDate || '',
  objectiveName: detail.objectiveName || snapshot?.objectiveName || '',
  totalTargetAmount: Number(detail.totalTargetAmount || snapshot?.totalTargetAmount || 0),
  actualAmount: Number(detail.actualAmount || snapshot?.actualAmount || 0),
  completionRate: Number(detail.completionRate || snapshot?.completionRate || 0),
  score: detail.score ?? snapshot?.score,
  grade: detail.grade || snapshot?.grade,
  scoreCap: Number(detail.scoreCap || snapshot?.scoreCap || 0) || undefined,
  status: detail.status || snapshot?.status,
  categoryCodes: detail.categoryCodes?.length ? detail.categoryCodes : (snapshot?.categoryCodes || []),
  categoryDefinitions: detail.categoryDefinitions?.length ? detail.categoryDefinitions : (snapshot?.categoryDefinitions || []),
  metrics: detail.metrics?.length ? detail.metrics : (snapshot?.metrics || []),
});

const weightedCompletion = (items: PerformanceAssignment[]) => {
  const map = new Map<string, { target: number; actual: number; weight: number; unit?: string }>();
  items.forEach((item) => {
    const key = categoryMetricKey(item.categoryCode, item.metricCode || 'METRIC_1');
    const current = map.get(key) || {
      target: 0,
      actual: 0,
      weight: Number(item.metricWeight || 100),
      unit: item.metricUnit || undefined,
    };
    current.target += Number(item.targetAmount || 0);
    current.actual += Number(item.actualAmount || 0);
    current.weight = Number(item.metricWeight || current.weight || 100);
    current.unit = item.metricUnit || current.unit;
    map.set(key, current);
  });
  let weightTotal = 0;
  let scoreTotal = 0;
  map.forEach((item) => {
    if (item.weight <= 0) return;
    weightTotal += item.weight;
    scoreTotal += (item.target > 0 ? (item.actual / item.target) * 100 : 0) * item.weight;
  });
  return weightTotal > 0 ? scoreTotal / weightTotal : 0;
};

type PerformanceTableShellProps = {
  minWidthClassName?: string;
  className?: string;
  children: React.ReactNode;
};

const PerformanceTableShell: React.FC<PerformanceTableShellProps> = ({
  minWidthClassName = 'min-w-[1080px]',
  className,
  children,
}) => (
  <div className={cn('performance-table-shell overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950', className)}>
    <div className="performance-table-scroll overflow-auto">
      {React.isValidElement(children)
        ? React.cloneElement(children as React.ReactElement<{ className?: string; disableScrollWrapper?: boolean }>, {
          className: cn('performance-table', minWidthClassName, 'table-fixed', (children as React.ReactElement<{ className?: string }>).props.className),
          disableScrollWrapper: true,
        })
        : children}
    </div>
  </div>
);

const PerformanceSummaryCard = ({
  label,
  value,
  valueClassName,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  valueClassName?: string;
  hint?: string;
}) => (
  <div className="card p-4">
    <div className="truncate text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">{label}</div>
    <div className={cn('mt-1 min-w-0 truncate text-sm font-semibold tabular-nums text-slate-900 dark:text-white', valueClassName)}>{value}</div>
    {hint ? <div className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">{hint}</div> : null}
  </div>
);

const PerformanceCompletionSummaryCard = ({
  label,
  rate,
  hint,
}: {
  label: string;
  rate?: number;
  hint?: string;
}) => {
  const value = Number(rate || 0);
  const progressWidth = Math.max(0, Math.min(value, 100));
  const progressTone = value >= 100
    ? 'bg-emerald-500'
    : value >= 80
      ? 'bg-amber-500'
      : 'bg-red-500';

  return (
    <div className="card p-4">
      <div className="truncate text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">{label}</div>
      <div className="mt-2 flex items-end justify-between gap-3">
        <div className={cn('text-3xl font-bold tabular-nums text-slate-900 dark:text-white', completionTone(value))}>
          {value.toFixed(1)}%
        </div>
        <span className={cn('inline-flex rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums ring-1', completionBadgeClass(value))}>
          综合达成
        </span>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200/90 dark:bg-slate-800">
        <div
          className={cn('h-full rounded-full transition-all', progressTone)}
          style={{ width: `${progressWidth}%` }}
        />
      </div>
      {hint ? <div className="mt-2 truncate text-xs text-slate-500 dark:text-slate-400">{hint}</div> : null}
    </div>
  );
};

const MetricLabelCell = ({
  name,
  unit,
  weight,
  emptyLabel = '多指标汇总',
}: {
  name?: string | null;
  unit?: string | null;
  weight?: number | string | null;
  emptyLabel?: string;
}) => {
  const resolvedName = name || emptyLabel;
  const resolvedUnit = unit ? String(unit) : '';
  const resolvedWeight = weight == null ? '' : `权重${Number(weight).toFixed(0)}`;
  return (
    <div className="min-w-0 text-left">
      <div className="truncate text-sm font-medium text-slate-900 dark:text-white">{resolvedName}</div>
      {(resolvedUnit || resolvedWeight) ? (
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
          {resolvedUnit ? <span className="badge badge-gray">{resolvedUnit}</span> : null}
          {resolvedWeight ? <span className="badge badge-gray">{resolvedWeight}</span> : null}
        </div>
      ) : null}
    </div>
  );
};

const PerformanceNodeCell = ({
  title,
  subtitle,
  icon,
  depth = 0,
}: {
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  depth?: number;
}) => (
  <div className="flex items-center gap-2" style={{ paddingLeft: `${depth * 18}px` }}>
    {icon}
    <div className="min-w-0">
      <div className="truncate font-medium text-slate-900 dark:text-white">{title}</div>
      {subtitle ? <div className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">{subtitle}</div> : null}
    </div>
  </div>
);

const TreeTableColGroup = () => (
  <colgroup>
    <col style={{ width: '360px' }} />
    <col style={{ width: '220px' }} />
    <col style={{ width: '120px' }} />
    <col style={{ width: '120px' }} />
    <col style={{ width: '124px' }} />
    <col style={{ width: '128px' }} />
    <col style={{ width: '192px' }} />
  </colgroup>
);

const MatrixCheckColGroup = () => (
  <colgroup>
    <col style={{ width: '220px' }} />
    <col style={{ width: '180px' }} />
    <col style={{ width: '180px' }} />
    <col style={{ width: '180px' }} />
    <col style={{ width: '156px' }} />
  </colgroup>
);

const MetricMatrixColGroup = () => (
  <colgroup>
    <col style={{ width: '220px' }} />
    <col style={{ width: '120px' }} />
    <col style={{ width: '280px' }} />
    <col style={{ width: '120px' }} />
    <col style={{ width: '120px' }} />
    <col style={{ width: '124px' }} />
    <col style={{ width: '132px' }} />
  </colgroup>
);

const EmployeeSummaryColGroup = () => (
  <colgroup>
    <col style={{ width: '220px' }} />
    <col style={{ width: '120px' }} />
    <col style={{ width: '600px' }} />
    <col style={{ width: '132px' }} />
  </colgroup>
);

const ProgressDeptColGroup = () => (
  <colgroup>
    <col style={{ width: '220px' }} />
    <col style={{ width: '120px' }} />
    <col style={{ width: '280px' }} />
    <col style={{ width: '120px' }} />
    <col style={{ width: '120px' }} />
    <col style={{ width: '124px' }} />
  </colgroup>
);

const ProgressEmployeeColGroup = () => (
  <colgroup>
    <col style={{ width: '220px' }} />
    <col style={{ width: '120px' }} />
    <col style={{ width: '280px' }} />
    <col style={{ width: '120px' }} />
    <col style={{ width: '120px' }} />
    <col style={{ width: '124px' }} />
    <col style={{ width: '192px' }} />
  </colgroup>
);

export const HrPerformancePage: React.FC = () => {
  const [objectives, setObjectives] = useState<PerformanceObjective[]>([]);
  const [overview, setOverview] = useState<PerformanceOverview | null>(null);
  const [currentObjective, setCurrentObjective] = useState<PerformanceObjective | null>(null);
  const [deptOptions, setDeptOptions] = useState<Array<{ label: string; value: number }>>([]);
  const [employees, setEmployees] = useState<HrEmployee[]>([]);
  const [employeeLoading, setEmployeeLoading] = useState(false);
  const [employeeLoaded, setEmployeeLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [treeLoading, setTreeLoading] = useState(false);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [keyword, setKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState(ALL_STATUS);
  const [activeTab, setActiveTab] = useState<PerformanceTab>('tree');
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState(defaultCreateForm);
  const [createCategoryRows, setCreateCategoryRows] = useState<CreateCategoryRow[]>(defaultCategoryRows);
  const [createMetricRows, setCreateMetricRows] = useState<CreateMetricRow[]>(defaultMetricRows);
  const [createMatrixWeights, setCreateMatrixWeights] = useState<Record<string, string>>({});
  const [createDeptRows, setCreateDeptRows] = useState<CreateDeptRow[]>([createDeptRow()]);
  const [splitNodeId, setSplitNodeId] = useState<number | null>(null);
  const [splitRows, setSplitRows] = useState<SplitRow[]>([]);
  const [resultNodeId, setResultNodeId] = useState<number | null>(null);
  const [resultActualAmount, setResultActualAmount] = useState('');
  const [salaryEmployeeId, setSalaryEmployeeId] = useState<string>('');
  const [pendingDeleteTarget, setPendingDeleteTarget] = useState<DeleteTarget | null>(null);
  const [salaryForm, setSalaryForm] = useState({
    adjustmentReason: '',
    minScore: '60',
    afterTotal: '',
    effectiveDate: '',
  });

  const deptLabelById = useMemo(() => {
    const map = new Map<number, string>();
    deptOptions.forEach((option) => {
      map.set(option.value, option.label);
    });
    return map;
  }, [deptOptions]);
  const employeeOptions = useMemo(
    () => employees.map((employee): EmployeeSelectOption => {
      const deptLabel = (employee.deptId ? deptLabelById.get(employee.deptId) : undefined) || employee.deptName || '未分配部门';
      const label = buildEmployeeLabel({ ...employee, deptName: deptLabel });
      return {
        value: String(employee.id),
        label,
        searchLabel: `${employee.id} / ${label}`,
        deptLabel,
        employee,
      };
    }),
    [deptLabelById, employees],
  );
  const employeeDisplayById = useMemo(() => {
    const map = new Map<string, string>();
    employeeOptions.forEach((option) => {
      map.set(option.value, option.searchLabel);
    });
    return map;
  }, [employeeOptions]);
  const employeeInputPlaceholder = employeeLoading
    ? '员工列表加载中...'
    : employees.length
      ? '输入员工ID、工号或姓名'
      : '未加载到员工，请导入员工种子数据';
  const resolveAssigneeLabel: AssigneeLabelResolver = (node) => {
    if (node.assigneeName) return node.assigneeName;
    if (node.assigneeType === 'EMPLOYEE') {
      return employeeDisplayById.get(String(node.assigneeId)) || `员工 #${node.assigneeId}`;
    }
    return deptLabelById.get(Number(node.assigneeId)) || `部门 #${node.assigneeId}`;
  };
  const currentAssignments = useMemo(() => {
    const decorate = (nodes: PerformanceAssignment[] = []): PerformanceAssignment[] =>
      nodes.map((node) => {
        const hydrated = hydrateAssignmentContext(node);
        return {
          ...hydrated,
          assigneeName: resolveAssigneeLabel(hydrated),
          children: decorate(hydrated.children || []),
        };
      });
    return decorate(currentObjective?.assignments || []);
  }, [currentObjective?.assignments, deptLabelById, employeeDisplayById]);
  const categoryNodes = useMemo(() => collectCategoryNodes(currentAssignments), [currentAssignments]);
  const assignmentMetricDefinitions = useMemo(() => {
    const metricMap = new Map<string, PerformanceMetric>();
    categoryNodes.forEach((node) => {
      if (!node.metricCode) return;
      metricMap.set(node.metricCode, {
        metricCode: node.metricCode,
        metricName: node.metricName || node.metricCode,
        metricUnit: node.metricUnit || '个',
        valueType: (node.metricValueType || resolveValueType(undefined, node.metricUnit)) as PerformanceMetric['valueType'],
        precision: metricPrecisionOf(node),
        metricWeight: Number(node.metricWeight || 100),
      });
    });
    return Array.from(metricMap.values());
  }, [categoryNodes]);
  const objectiveCategories = currentObjective?.categoryDefinitions?.length
    ? currentObjective.categoryDefinitions
    : (currentObjective?.categoryCodes || []).map((code) => ({ categoryCode: code, categoryName: code }));
  const objectiveMetrics = currentObjective?.metrics?.length
    ? currentObjective.metrics
    : assignmentMetricDefinitions.length
      ? assignmentMetricDefinitions
    : ([{ metricCode: 'METRIC_1', metricName: '统计指标', metricUnit: '个', valueType: 'INTEGER', precision: 0, metricWeight: 100 }] as PerformanceMetric[]);
  const isMultiMetricObjective = objectiveMetrics.length > 1;
  const splitNode = splitNodeId ? findNode(currentAssignments, splitNodeId) : null;
  const resultNode = resultNodeId ? findNode(currentAssignments, resultNodeId) : null;
  const treeRows = useMemo(() => flattenTree(currentAssignments), [currentAssignments]);
  const leafTasks = useMemo(() => collectLeaves(currentAssignments), [currentAssignments]);
  const metricTotalSummary = useMemo(
    () => categoryNodes
      .map((node) => `${node.categoryName || node.categoryCode || '-'}-${node.metricName || node.metricCode || '-'} ${formatValue(node.targetAmount, node.metricUnit, metricPrecisionOf(node))}`)
      .join(' / '),
    [categoryNodes],
  );
  const departmentMatrixRows = useMemo<DepartmentMatrixRow[]>(
    () => currentAssignments.map((dept) => {
      const children = dept.children || [];
      const categoryTotal = isMultiMetricObjective ? 0 : children.reduce((sum, child) => sum + Number(child.targetAmount || 0), 0);
      const targetAmount = Number(dept.targetAmount || 0);
      return {
        id: dept.id,
        assigneeName: dept.assigneeName || `部门 #${dept.assigneeId}`,
        targetAmount,
        categoryTotal,
        remainAmount: isMultiMetricObjective ? 0 : targetAmount - categoryTotal,
        itemCount: children.length,
      };
    }),
    [currentAssignments, isMultiMetricObjective],
  );
  const employeeSummaryRows = useMemo<EmployeeSummaryRow[]>(() => {
    const map = new Map<number, {
      employeeId: number;
      employeeName: string;
      tasks: PerformanceAssignment[];
      categories: Set<string>;
    }>();
    leafTasks.forEach((item) => {
      const current = map.get(item.assigneeId) || {
        employeeId: item.assigneeId,
        employeeName: item.assigneeName || `员工 #${item.assigneeId}`,
        tasks: [],
        categories: new Set<string>(),
      };
      current.tasks.push(item);
      if (item.categoryName || item.categoryCode) current.categories.add(item.categoryName || item.categoryCode || '');
      map.set(item.assigneeId, current);
    });
    return Array.from(map.values()).map((item) => ({
      employeeId: item.employeeId,
      employeeName: item.employeeName,
      metricSummary: item.tasks
        .map((task) => `${task.categoryName || task.categoryCode || '-'}-${task.metricName || task.metricCode || '-'} ${formatValue(task.targetAmount, task.metricUnit, metricPrecisionOf(task))}`)
        .join(' / '),
      completionRate: weightedCompletion(item.tasks),
      categories: Array.from(item.categories).join('/'),
    }));
  }, [leafTasks]);

  const metricItems = useMemo(() => [
    {
      title: '草稿目标',
      value: overview?.draftCount ?? 0,
      icon: <ClipboardList className="h-6 w-6" />,
      iconVariant: 'primary' as const,
      meta: '待拆解或提交',
    },
    {
      title: '计划审批',
      value: overview?.planApprovingCount ?? 0,
      icon: <GitBranch className="h-6 w-6" />,
      iconVariant: 'warning' as const,
      meta: '等待审批回调',
    },
    {
      title: '执行中',
      value: overview?.runningCount ?? 0,
      icon: <Target className="h-6 w-6" />,
      iconVariant: 'success' as const,
      meta: '可填报实绩',
    },
    {
      title: '已归档',
      value: overview?.completedCount ?? 0,
      icon: <CheckCircle2 className="h-6 w-6" />,
      iconVariant: 'gray' as const,
      meta: '可联动调薪',
    },
  ], [overview]);

  const loadList = async (keepCurrentId = currentObjective?.id) => {
    setLoading(true);
    try {
      const [overviewRes, listRes] = await Promise.all([
        getPerformanceOverview(),
        listPerformanceObjectives({
          keyword: keyword.trim() || undefined,
          status: statusFilter === ALL_STATUS ? undefined : statusFilter,
          pageNum: 1,
          pageSize: 50,
        }),
      ]);
      const rows = normalizeRows<PerformanceObjective>(listRes);
      setOverview(overviewRes);
      setObjectives(rows);
      const nextId = keepCurrentId && rows.some((item) => item.id === keepCurrentId)
        ? keepCurrentId
        : rows[0]?.id;
      if (nextId) {
        await loadTree(nextId, rows.find((item) => item.id === nextId) || null);
      } else {
        setCurrentObjective(null);
      }
    } catch (error) {
      console.error(error);
      toast.error(getErrorMessage(error, '绩效目标加载失败'));
    } finally {
      setLoading(false);
    }
  };

  const loadTree = async (id: number, snapshot?: PerformanceObjective | null) => {
    setTreeLoading(true);
    try {
      const detail = await getPerformanceObjectiveTree(id);
      const preview = snapshot || objectives.find((item) => item.id === id) || null;
      setCurrentObjective(hydrateObjectiveDetail(detail, preview));
    } catch (error) {
      console.error(error);
      toast.error(getErrorMessage(error, '绩效目标树加载失败'));
    } finally {
      setTreeLoading(false);
    }
  };

  const loadEmployees = async () => {
    setEmployeeLoading(true);
    try {
      const employeeRes = await listEmployees();
      const rows = normalizeRows<HrEmployee>(employeeRes);
      setEmployees(rows);
      setEmployeeLoaded(true);
      return rows;
    } finally {
      setEmployeeLoading(false);
    }
  };

  const loadBootstrap = async () => {
    setLoading(true);
    try {
      const [deptRes] = await Promise.all([
        getDeptTreeOptions(),
        loadEmployees(),
      ]);
      setDeptOptions(flattenDeptTree(Array.isArray(deptRes) ? deptRes : []));
      await loadList();
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadBootstrap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resetCreateDialog = () => {
    setCreateForm(defaultCreateForm());
    setCreateCategoryRows(defaultCategoryRows());
    setCreateMetricRows(defaultMetricRows());
    setCreateMatrixWeights({});
    setCreateDeptRows([createDeptRow()]);
  };

  const updateDeptRow = (key: string, patch: Partial<CreateDeptRow>) => {
    setCreateDeptRows((rows) => rows.map((row) => row.key === key ? { ...row, ...patch } : row));
  };

  const updateCreateCategory = (key: string, patch: Partial<CreateCategoryRow>) => {
    setCreateCategoryRows((rows) => rows.map((row) => row.key === key ? { ...row, ...patch } : row));
  };

  const updateCreateMetric = (key: string, patch: Partial<CreateMetricRow>) => {
    setCreateMetricRows((rows) => rows.map((row) => row.key === key ? { ...row, ...patch } : row));
  };

  const updateDeptCategoryAmount = (key: string, amountKey: string, value: string) => {
    setCreateDeptRows((rows) => rows.map((row) => {
      if (row.key !== key) return row;
      return {
        ...row,
        categoryAmounts: {
          ...row.categoryAmounts,
          [amountKey]: value,
        },
      };
    }));
  };

  const updateCreateMatrixWeight = (key: string, value: string) => {
    setCreateMatrixWeights((weights) => ({ ...weights, [key]: value }));
  };

  const applySalesPreset = () => {
    setCreateCategoryRows([
      { key: rowKey(), categoryCode: 'CORE_GOODS', categoryName: '核心商品' },
      { key: rowKey(), categoryCode: 'NEW_GOODS', categoryName: '新品' },
    ]);
    setCreateMetricRows([
      { key: rowKey(), metricCode: 'SALES_AMOUNT', metricName: '销售额', metricUnit: '元', valueType: 'DECIMAL', precision: '2', metricWeight: '60' },
      { key: rowKey(), metricCode: 'SALES_QTY', metricName: '销售量', metricUnit: '件', valueType: 'INTEGER', precision: '0', metricWeight: '40' },
    ]);
    setCreateMatrixWeights({});
    setCreateDeptRows((rows) => rows.map((row) => ({ ...row, categoryAmounts: {} })));
  };

  const applyCountPreset = () => {
    setCreateCategoryRows([{ key: rowKey(), categoryCode: 'DELIVERY', categoryName: '交付目标' }]);
    setCreateMetricRows([{ key: rowKey(), metricCode: 'FINISH_COUNT', metricName: '完成数量', metricUnit: '件', valueType: 'INTEGER', precision: '0', metricWeight: '100' }]);
    setCreateMatrixWeights({});
    setCreateDeptRows((rows) => rows.map((row) => ({ ...row, categoryAmounts: {} })));
  };

  const validCreateCategories = createCategoryRows
    .map((row): PerformanceCategoryDefinition => ({
      categoryCode: normalizeCode(row.categoryCode),
      categoryName: row.categoryName.trim() || normalizeCode(row.categoryCode),
    }))
    .filter((row) => row.categoryCode && row.categoryName);
  const validCreateMetrics = createMetricRows
    .map((row): PerformanceMetric => ({
      metricCode: normalizeCode(row.metricCode),
      metricName: row.metricName.trim() || normalizeCode(row.metricCode),
      metricUnit: row.metricUnit.trim(),
      valueType: row.valueType,
      precision: resolvePrecision(row.precision, row.valueType, row.metricUnit),
      metricWeight: toAmount(row.metricWeight),
    }))
    .filter((row) => row.metricCode && row.metricName && row.metricUnit && row.metricWeight > 0);
  const createMatrixItems = validCreateCategories.flatMap((category) =>
    validCreateMetrics.map((metric) => {
      const key = categoryMetricKey(category.categoryCode, metric.metricCode);
      const weightValue = createMatrixWeights[key];
      return {
        category,
        metric,
        key,
        weight: weightValue == null || weightValue === '' ? metric.metricWeight : toAmount(weightValue),
      };
    }),
  );

  const handleCreateObjective = async () => {
    const firstMetric = validCreateMetrics[0];
    const total = validCreateMetrics.length === 1 ? toMetricValue(createForm.totalTargetAmount, firstMetric) : toAmount(createForm.totalTargetAmount);
    if (!createForm.cycleName || !createForm.cycleStartDate || !createForm.cycleEndDate || !createForm.objectiveName) {
      toast.error('请补齐绩效目标基础信息');
      return;
    }
    if (!validCreateCategories.length || !validCreateMetrics.length) {
      toast.error('请至少配置1个考核类型和1个绩效指标');
      return;
    }
    if (createMatrixItems.some((item) => item.weight <= 0)) {
      toast.error('类型指标权重必须大于0');
      return;
    }
    const deptRows = createDeptRows.filter((row) => row.deptId);
    if (!deptRows.length) {
      toast.error('请至少选择1个部门');
      return;
    }
    if (validCreateMetrics.length === 1 && deptRows.some((row) => !isMetricValueValid(row.targetAmount, firstMetric))) {
      toast.error('部门目标值不符合指标数值类型');
      return;
    }
    if (deptRows.some((row) => createMatrixItems.some(({ key, metric }) => {
      const value = row.categoryAmounts[key];
      return value !== undefined && value !== '' && !isMetricValueValid(value, metric);
    }))) {
      toast.error('类型指标目标值不符合指标数值类型');
      return;
    }
    const deptTotal = deptRows.reduce((sum, row) => sum + (validCreateMetrics.length === 1 ? toMetricValue(row.targetAmount, firstMetric) : toAmount(row.targetAmount)), 0);
    if (validCreateMetrics.length === 1 && total > 0 && toPrecisionUnits(deptTotal, metricPrecisionOf(firstMetric)) !== toPrecisionUnits(total, metricPrecisionOf(firstMetric))) {
      toast.error('单指标模式下，部门目标值合计必须等于总目标值');
      return;
    }

    setPendingAction('create');
    try {
      const id = await createPerformanceObjective({
        cycleName: createForm.cycleName,
        cycleStartDate: createForm.cycleStartDate,
        cycleEndDate: createForm.cycleEndDate,
        objectiveName: createForm.objectiveName,
        totalTargetAmount: total,
        categoryCodes: validCreateCategories.map((item) => item.categoryCode),
        categoryDefinitions: validCreateCategories,
        metrics: validCreateMetrics,
        scoreCap: toAmount(createForm.scoreCap) || 120,
        departmentAssignments: deptRows.map((row) => {
          const dept = deptOptions.find((option) => String(option.value) === row.deptId);
          return {
            deptId: Number(row.deptId),
            deptName: dept?.label,
            targetAmount: validCreateMetrics.length === 1 ? toMetricValue(row.targetAmount, firstMetric) : toAmount(row.targetAmount),
            ownerEmployeeId: row.ownerEmployeeId ? Number(row.ownerEmployeeId) : undefined,
            categories: createMatrixItems
              .map(({ category, metric, key, weight }) => ({
                categoryCode: category.categoryCode,
                categoryName: category.categoryName,
                metricCode: metric.metricCode,
                metricName: metric.metricName,
                metricUnit: metric.metricUnit,
                metricWeight: weight,
                targetAmount: toMetricValue(row.categoryAmounts[key], metric),
                locked: true,
              }))
              .filter((item, index) => {
                const key = createMatrixItems[index]?.key;
                const value = key ? row.categoryAmounts[key] : undefined;
                return value !== undefined && value !== '';
              }),
          };
        }),
      });
      toast.success('绩效目标已创建');
      setCreateOpen(false);
      resetCreateDialog();
      await loadList(id);
    } catch (error) {
      console.error(error);
    } finally {
      setPendingAction(null);
    }
  };

  const openSplitDialog = (node: PerformanceAssignment) => {
    setSplitNodeId(node.id);
    if (!employeeLoaded && !employeeLoading) {
      void loadEmployees().catch((error) => {
        console.error(error);
        toast.error(getErrorMessage(error, '员工列表加载失败'));
      });
    }
    if (node.assigneeType === 'DEPT' && !node.categoryCode) {
      const existing = new Map((node.children || []).map((child) => [categoryMetricKey(child.categoryCode, child.metricCode), child]));
      setSplitRows(objectiveCategories.flatMap((category) => objectiveMetrics.map((metric) => {
        const key = categoryMetricKey(category.categoryCode, metric.metricCode);
        const item = existing.get(key);
        return {
          key,
          categoryCode: category.categoryCode,
          categoryName: category.categoryName,
          metricCode: metric.metricCode,
          metricName: metric.metricName,
          metricUnit: metric.metricUnit,
          metricWeight: String(item?.metricWeight ?? metric.metricWeight ?? ''),
          targetAmount: String(item?.targetAmount ?? ''),
          locked: Boolean(item?.locked),
        };
      })));
      return;
    }
    setSplitRows((node.children || []).map((child) => ({
      key: String(child.id),
      employeeId: String(child.assigneeId),
      employeeSearch: employeeDisplayById.get(String(child.assigneeId)) || `${child.assigneeId} / ${child.assigneeName || `员工 #${child.assigneeId}`}`,
      targetAmount: String(child.targetAmount ?? ''),
    })));
  };

  const handleSaveSplit = async () => {
    if (!splitNode) return;
    if (splitNode.assigneeType === 'DEPT' && !splitNode.categoryCode) {
      const invalid = splitRows.some((row) => {
        if (!row.categoryCode || row.targetAmount === '') return false;
        const metric = objectiveMetrics.find((item) => item.metricCode === row.metricCode);
        return !isMetricValueValid(row.targetAmount, metric);
      });
      if (invalid) {
        toast.error('类型指标目标值不符合指标数值类型');
        return;
      }
    } else if (splitRows.some((row) => row.employeeId && row.targetAmount !== '' && !isMetricValueValid(row.targetAmount, splitNode))) {
      toast.error('员工任务目标值不符合指标数值类型');
      return;
    }
    if (!(splitNode.assigneeType === 'DEPT' && !splitNode.categoryCode)) {
      const rowsWithTarget = splitRows.filter((row) => row.targetAmount !== '');
      if (rowsWithTarget.some((row) => !row.employeeId)) {
        toast.error('请选择员工列表中的员工；若列表为空，请先导入员工种子数据');
        return;
      }
      const employeeIds = rowsWithTarget.map((row) => row.employeeId);
      if (new Set(employeeIds).size !== employeeIds.length) {
        toast.error('员工任务不能重复分配同一员工');
        return;
      }
    }
    setPendingAction('split');
    try {
      if (splitNode.assigneeType === 'DEPT' && !splitNode.categoryCode) {
        await savePerformanceAssignmentChildren(splitNode.id, {
          children: splitRows
            .filter((row) => row.categoryCode && row.targetAmount !== '')
            .map((row) => {
              const metric = objectiveMetrics.find((item) => item.metricCode === row.metricCode);
              return {
                assigneeType: 'DEPT' as const,
                assigneeId: splitNode.assigneeId,
                assigneeName: splitNode.assigneeName || undefined,
                categoryCode: row.categoryCode,
                categoryName: row.categoryName || row.categoryCode,
                metricCode: row.metricCode,
                metricName: row.metricName,
                metricUnit: row.metricUnit,
                metricWeight: row.metricWeight ? toAmount(row.metricWeight) : undefined,
                targetAmount: toMetricValue(row.targetAmount, metric),
                quotaSource: row.locked ? 'MANAGER' as const : 'DEPT_OWNER' as const,
                locked: row.locked,
              };
            }),
        });
      } else {
        await savePerformanceAssignmentChildren(splitNode.id, {
          children: splitRows
            .filter((row) => row.employeeId && row.targetAmount !== '')
            .map((row) => {
              const employee = employees.find((item) => String(item.id) === row.employeeId);
              return {
                assigneeType: 'EMPLOYEE',
                assigneeId: Number(row.employeeId),
                assigneeName: employee?.name,
                targetAmount: toMetricValue(row.targetAmount, splitNode),
              };
            }),
        });
      }
      toast.success('分解已保存');
      setSplitNodeId(null);
      await loadTree(splitNode.objectiveId);
      await loadList(splitNode.objectiveId);
    } catch (error) {
      console.error(error);
    } finally {
      setPendingAction(null);
    }
  };

  const handleUpdateResult = async () => {
    if (!resultNode) return;
    if (!isMetricValueValid(resultActualAmount, resultNode)) {
      toast.error('实际完成值不符合指标数值类型');
      return;
    }
    setPendingAction('result');
    try {
      await updatePerformanceResult({
        assignmentId: resultNode.id,
        actualAmount: toMetricValue(resultActualAmount, resultNode),
      });
      toast.success('实绩已更新');
      setResultNodeId(null);
      await loadTree(resultNode.objectiveId);
      await loadList(resultNode.objectiveId);
    } catch (error) {
      console.error(error);
    } finally {
      setPendingAction(null);
    }
  };

  const handleSubmitPlan = async () => {
    if (!currentObjective) return;
    setPendingAction('submit-plan');
    try {
      await submitPerformancePlan(currentObjective.id);
      toast.success('绩效计划已提交审批');
      await loadList(currentObjective.id);
    } catch (error) {
      console.error(error);
    } finally {
      setPendingAction(null);
    }
  };

  const handleSubmitResult = async () => {
    if (!currentObjective) return;
    setPendingAction('submit-result');
    try {
      await submitPerformanceResult(currentObjective.id);
      toast.success('绩效结果已提交审批');
      await loadList(currentObjective.id);
    } catch (error) {
      console.error(error);
    } finally {
      setPendingAction(null);
    }
  };

  const handleCreateSalaryAdjustment = async () => {
    if (!currentObjective || !salaryEmployeeId) {
      toast.error('请选择员工');
      return;
    }
    setPendingAction('salary');
    try {
      await createPerformanceSalaryAdjustment(currentObjective.id, {
        employeeId: Number(salaryEmployeeId),
        adjustmentReason: salaryForm.adjustmentReason,
        minScore: toAmount(salaryForm.minScore),
        afterSalaryData: JSON.stringify({ totalSalary: toAmount(salaryForm.afterTotal) }),
        afterTotal: toAmount(salaryForm.afterTotal),
        effectiveDate: salaryForm.effectiveDate,
      });
      toast.success('绩效调薪申请已生成');
      setSalaryEmployeeId('');
    } catch (error) {
      console.error(error);
    } finally {
      setPendingAction(null);
    }
  };

  const addSplitRow = () => {
    setSplitRows((rows) => [...rows, { key: rowKey(), targetAmount: '' }]);
  };

  const requestDeleteDeptRow = (key: string) => {
    if (createDeptRows.length <= 1) {
      return;
    }
    setPendingDeleteTarget({ kind: 'dept-row', key });
  };

  const requestDeleteSplitRow = (key: string) => {
    setPendingDeleteTarget({ kind: 'split-row', key });
  };

  const confirmDeleteTarget = () => {
    if (!pendingDeleteTarget) {
      return;
    }

    if (pendingDeleteTarget.kind === 'dept-row') {
      setCreateDeptRows((rows) => rows.filter((row) => row.key !== pendingDeleteTarget.key));
    } else {
      setSplitRows((rows) => rows.filter((row) => row.key !== pendingDeleteTarget.key));
    }

    setPendingDeleteTarget(null);
  };

  const closeDeleteTarget = () => {
    setPendingDeleteTarget(null);
  };

  const renderProgress = (rate?: number) => (
    <div className="flex w-full justify-center">
      <span className={cn('inline-flex min-w-[76px] justify-center rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums ring-1', completionBadgeClass(rate))}>
        {Number(rate || 0).toFixed(1)}%
      </span>
    </div>
  );

  const tabs: Array<{ value: PerformanceTab; label: string }> = [
    { value: 'tree', label: '目标树' },
    { value: 'matrix', label: '类型矩阵' },
    { value: 'employees', label: '员工分解' },
    { value: 'progress', label: '进度填报' },
    { value: 'archive', label: '评分归档' },
    { value: 'salary', label: '调薪联动' },
    { value: 'sales', label: '销售业绩' },
  ];

  const splitMetric = splitNode?.categoryCode ? splitNode : objectiveMetrics[0];
  const splitTargetTotal = splitRows.reduce((sum, row) => sum + toMetricValue(row.targetAmount, splitMetric), 0);
  const currentTargetTotal = toMetricValue(splitNode?.targetAmount, splitMetric);
  const splitRemain = currentTargetTotal - splitTargetTotal;
  const isDepartmentSplit = Boolean(splitNode && splitNode.assigneeType === 'DEPT' && !splitNode.categoryCode);
  const shouldBalanceSplit = !isDepartmentSplit || (objectiveMetrics.length === 1 && currentTargetTotal > 0);
  const isSplitBalanced = !shouldBalanceSplit || toPrecisionUnits(splitRemain, metricPrecisionOf(splitMetric)) === 0;

  return (
    <>
      <TablePageLayout
        className="animate-fade-in"
        actions={
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {metricItems.map((item) => (
              <StatCard
                key={item.title}
                title={item.title}
                value={item.value}
                icon={item.icon}
                iconVariant={item.iconVariant}
                meta={item.meta}
              />
            ))}
          </div>
        }
        filters={
          <div className="card p-4">
            <div className="space-y-4">
              <div className="flex flex-wrap-reverse items-start justify-between gap-3">
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
                  <div className="relative w-full min-w-[240px] sm:w-80">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input
                      className="pl-10"
                      value={keyword}
                      onChange={(event) => setKeyword(event.target.value)}
                      placeholder="搜索目标编号、周期或名称"
                    />
                  </div>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="状态" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL_STATUS}>全部状态</SelectItem>
                      <SelectItem value="DRAFT">草稿</SelectItem>
                      <SelectItem value="PLAN_APPROVING">计划审批中</SelectItem>
                      <SelectItem value="PLAN_APPROVED">执行中</SelectItem>
                      <SelectItem value="RESULT_APPROVING">结果审批中</SelectItem>
                      <SelectItem value="COMPLETED">已归档</SelectItem>
                      <SelectItem value="REJECTED">已驳回</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button variant="outline" onClick={() => void loadList()}>
                    <Search className="h-4 w-4" />
                    查询
                  </Button>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="outline" onClick={() => void loadList()} disabled={loading}>
                    <RefreshCcw className={cn('h-4 w-4', loading && 'animate-spin')} />
                    刷新
                  </Button>
                  <Button onClick={() => setCreateOpen(true)}>
                    <FilePlus2 className="h-4 w-4" />
                    新建绩效目标
                  </Button>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="cf-tabs overflow-x-auto">
                  {tabs.map((tab) => (
                    <button
                      key={tab.value}
                      type="button"
                      className={cn('cf-tab cf-tab-sm', activeTab === tab.value && 'cf-tab-active')}
                      onClick={() => setActiveTab(tab.value)}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {currentObjective ? (
                    <>
                      <span className={statusBadgeClass(currentObjective.status)}>{statusLabel(currentObjective.status)}</span>
                      {['DRAFT', 'REJECTED'].includes(currentObjective.status) ? (
                        <Button size="sm" variant="soft" onClick={() => void handleSubmitPlan()} disabled={pendingAction === 'submit-plan'}>
                          提交计划审批
                        </Button>
                      ) : null}
                      {currentObjective.status === 'PLAN_APPROVED' ? (
                        <Button size="sm" variant="soft" onClick={() => void handleSubmitResult()} disabled={pendingAction === 'submit-result'}>
                          提交结果审批
                        </Button>
                      ) : null}
                    </>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        }
        table={
          <div className="flex min-h-0 flex-col gap-4">
            <div className="grid gap-4 xl:grid-cols-[minmax(280px,340px)_minmax(0,1fr)]">
              <div className="card p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">
                  Performance Objective
                </div>
                <div className="mt-2 truncate text-lg font-semibold text-slate-900 dark:text-slate-100">
                  {currentObjective?.objectiveName || '暂无绩效目标'}
                </div>
                <div className="mt-1 truncate text-sm text-slate-500 dark:text-slate-400">
                  {currentObjective ? `${currentObjective.cycleName} / ${currentObjective.objectiveNo}` : '创建目标后开始分解部门、考核类型与指标'}
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                <PerformanceSummaryCard
                  label="总目标值"
                  value={currentObjective && objectiveMetrics.length > 1 ? (metricTotalSummary || `${objectiveMetrics.length}项指标`) : formatValue(currentObjective?.totalTargetAmount, objectiveMetrics[0]?.metricUnit, metricPrecisionOf(objectiveMetrics[0]))}
                  hint={currentObjective && objectiveMetrics.length > 1 ? `${objectiveMetrics.length}项指标` : objectiveMetrics[0]?.metricUnit || undefined}
                />
                <PerformanceSummaryCard
                  label="指标配置"
                  value={objectiveMetrics.length}
                  hint={objectiveMetrics.map((metric) => `${metric.metricName} · ${metric.metricUnit || '-'} · ${metricTypeLabel(metric.valueType)}`).join(' / ')}
                />
                <PerformanceSummaryCard
                  label="完成率"
                  value={`${Number(currentObjective?.completionRate || 0).toFixed(1)}%`}
                  valueClassName={completionTone(currentObjective?.completionRate)}
                  hint="权重折算后"
                />
                <PerformanceSummaryCard
                  label="评分等级"
                  value={`${currentObjective?.score?.toFixed?.(1) || '0.0'} / ${currentObjective?.grade || 'D'}`}
                  hint={statusLabel(currentObjective?.status)}
                />
              </div>
            </div>

            {loading || treeLoading ? (
              <div className="card flex items-center justify-center py-14 text-sm text-slate-500 dark:text-slate-400">
                <RefreshCcw className="mr-2 h-4 w-4 animate-spin" />
                加载绩效数据...
              </div>
            ) : !currentObjective ? (
              <div className="card empty-state">
                <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-2xl bg-slate-100 dark:bg-slate-900">
                  <Target className="h-10 w-10 text-slate-300 dark:text-slate-600" />
                </div>
                <h3 className="empty-state-title">暂无绩效目标</h3>
                <p className="empty-state-description">创建周期目标后，可按部门、考核类型、指标和员工叶子任务逐层分解。</p>
              </div>
            ) : activeTab === 'tree' ? (
              <TreeTable
                rows={treeRows}
                renderProgress={renderProgress}
                onSelect={loadTree}
                objectives={objectives}
                currentId={currentObjective.id}
                status={currentObjective.status}
                primaryMetric={objectiveMetrics[0]}
                isMultiMetric={isMultiMetricObjective}
                resolveAssigneeLabel={resolveAssigneeLabel}
                onSplit={openSplitDialog}
                onResult={(node) => {
                  setResultNodeId(node.id);
                  setResultActualAmount(String(node.actualAmount || ''));
                }}
              />
              ) : activeTab === 'matrix' ? (
                <MatrixView departmentRows={departmentMatrixRows} categoryNodes={categoryNodes} isMultiMetric={isMultiMetricObjective} primaryMetric={objectiveMetrics[0]} renderProgress={renderProgress} resolveAssigneeLabel={resolveAssigneeLabel} />
              ) : activeTab === 'employees' ? (
                <EmployeeView rows={employeeSummaryRows} renderProgress={renderProgress} />
              ) : activeTab === 'progress' ? (
                <ProgressView categoryNodes={categoryNodes} leafTasks={leafTasks} status={currentObjective.status} renderProgress={renderProgress} resolveAssigneeLabel={resolveAssigneeLabel} onResult={(node) => {
                  setResultNodeId(node.id);
                setResultActualAmount(String(node.actualAmount || ''));
              }} />
            ) : activeTab === 'archive' ? (
              <ArchiveView objective={currentObjective} categoryNodes={categoryNodes} employeeRows={employeeSummaryRows} renderProgress={renderProgress} />
            ) : activeTab === 'sales' ? (
              <CrmSalesView />
            ) : (
              <SalaryLinkView
                objective={currentObjective}
                employeeRows={employeeSummaryRows}
                salaryEmployeeId={salaryEmployeeId}
                setSalaryEmployeeId={setSalaryEmployeeId}
                salaryForm={salaryForm}
                setSalaryForm={setSalaryForm}
                onCreate={handleCreateSalaryAdjustment}
                pending={pendingAction === 'salary'}
              />
            )}
          </div>
        }
      />

      <BaseDialog
        open={createOpen}
        title="新建绩效目标"
        description="经理定义考核类型、指标单位和权重；部门负责人继续把指标目标值拆到员工。"
        width="extra-wide"
        onClose={() => setCreateOpen(false)}
        footer={
          <>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>取消</Button>
            <Button onClick={() => void handleCreateObjective()} disabled={pendingAction === 'create'}>
              创建目标
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-teal-100 bg-teal-50/70 p-4 dark:border-teal-900/50 dark:bg-teal-950/20">
            <div className="grid gap-2 md:grid-cols-5">
              {['基础信息', '考核类型', '指标口径', '权重', '部门目标'].map((item, index) => (
                <div key={item} className="flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm text-slate-700 shadow-sm dark:bg-slate-900 dark:text-slate-200">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-teal-600 text-xs font-semibold text-white">{index + 1}</span>
                  <span className="truncate">{item}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm text-slate-600 dark:text-slate-300">
                当前配置：{validCreateCategories.length}个类型 / {validCreateMetrics.length}个指标 / {createMatrixItems.length}个类型指标
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="soft" onClick={applySalesPreset}>销售额+销售量模板</Button>
                <Button type="button" size="sm" variant="outline" onClick={applyCountPreset}>数量指标模板</Button>
              </div>
            </div>
          </div>

          <CreateSection index="01" title="基础信息" summary="周期、目标名称和计分封顶">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="绩效周期"><Input value={createForm.cycleName} onChange={(e) => setCreateForm((prev) => ({ ...prev, cycleName: e.target.value }))} placeholder="2026 Q2 综合绩效" /></Field>
              <Field label="目标名称"><Input value={createForm.objectiveName} onChange={(e) => setCreateForm((prev) => ({ ...prev, objectiveName: e.target.value }))} placeholder="季度经营目标" /></Field>
              <Field label="开始日期"><DatePicker type="date" className="h-10" value={createForm.cycleStartDate} onChange={(e) => setCreateForm((prev) => ({ ...prev, cycleStartDate: e.target.value }))} /></Field>
              <Field label="结束日期"><DatePicker type="date" className="h-10" value={createForm.cycleEndDate} onChange={(e) => setCreateForm((prev) => ({ ...prev, cycleEndDate: e.target.value }))} /></Field>
              <Field label="总目标值"><Input type="number" value={createForm.totalTargetAmount} onChange={(e) => setCreateForm((prev) => ({ ...prev, totalTargetAmount: e.target.value }))} placeholder="单指标填写，多指标填0" /></Field>
              <Field label="计分封顶"><Input type="number" value={createForm.scoreCap} onChange={(e) => setCreateForm((prev) => ({ ...prev, scoreCap: e.target.value }))} /></Field>
            </div>
          </CreateSection>

          <CreateSection
            index="02"
            title="考核类型"
            summary="例如核心商品、新品、重点项目"
            action={<Button size="sm" variant="outline" onClick={() => setCreateCategoryRows((rows) => [...rows, { key: rowKey(), categoryCode: `TYPE_${rows.length + 1}`, categoryName: `考核类型${rows.length + 1}` }])}>添加类型</Button>}
          >
            <div className="space-y-2">
              <div className="hidden grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_64px] gap-2 px-1 text-xs font-medium text-slate-500 md:grid">
                <span>类型名称</span><span>类型编码</span><span />
              </div>
              {createCategoryRows.map((row) => (
                <div key={row.key} className="grid gap-2 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_64px]">
                  <Input value={row.categoryName} onChange={(e) => updateCreateCategory(row.key, { categoryName: e.target.value })} placeholder="核心商品" />
                  <Input value={row.categoryCode} onChange={(e) => updateCreateCategory(row.key, { categoryCode: e.target.value })} placeholder="CORE_GOODS" />
                  <Button size="sm" variant="ghost" disabled={createCategoryRows.length === 1} onClick={() => setCreateCategoryRows((rows) => rows.filter((item) => item.key !== row.key))}>删除</Button>
                </div>
              ))}
            </div>
          </CreateSection>

          <CreateSection
            index="03"
            title="指标口径"
            summary="例如销售额-元-小数，销售量-件-整数"
            action={<Button size="sm" variant="outline" onClick={() => setCreateMetricRows((rows) => [...rows, { key: rowKey(), metricCode: `METRIC_${rows.length + 1}`, metricName: `指标${rows.length + 1}`, metricUnit: '个', valueType: 'INTEGER', precision: '0', metricWeight: '10' }])}>添加指标</Button>}
          >
            <div className="space-y-2">
              <div className="hidden grid-cols-[minmax(0,1.3fr)_80px_120px_92px_92px_minmax(0,1fr)_64px] gap-2 px-1 text-xs font-medium text-slate-500 xl:grid">
                <span>指标名称</span><span>单位</span><span>数值类型</span><span>小数位</span><span>默认权重</span><span>指标编码</span><span />
              </div>
              {createMetricRows.map((row) => (
                <div key={row.key} className="grid gap-2 xl:grid-cols-[minmax(0,1.3fr)_80px_120px_92px_92px_minmax(0,1fr)_64px]">
                  <Input value={row.metricName} onChange={(e) => updateCreateMetric(row.key, { metricName: e.target.value })} placeholder="销售额" />
                  <Input value={row.metricUnit} onChange={(e) => updateCreateMetric(row.key, { metricUnit: e.target.value })} placeholder="元" maxLength={20} />
                  <Select value={row.valueType} onValueChange={(value) => updateCreateMetric(row.key, { valueType: value as CreateMetricRow['valueType'], precision: value === 'INTEGER' ? '0' : row.precision || '2' })}>
                    <SelectTrigger><SelectValue placeholder="数值类型" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="DECIMAL">小数</SelectItem>
                      <SelectItem value="INTEGER">整数</SelectItem>
                      <SelectItem value="PERCENT">百分比</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input type="number" min={0} max={4} disabled={row.valueType === 'INTEGER'} value={row.precision} onChange={(e) => updateCreateMetric(row.key, { precision: e.target.value })} placeholder="0-4" />
                  <Input type="number" value={row.metricWeight} onChange={(e) => updateCreateMetric(row.key, { metricWeight: e.target.value })} placeholder="100" />
                  <Input value={row.metricCode} onChange={(e) => updateCreateMetric(row.key, { metricCode: e.target.value })} placeholder="SALES_AMOUNT" />
                  <Button size="sm" variant="ghost" disabled={createMetricRows.length === 1} onClick={() => setCreateMetricRows((rows) => rows.filter((item) => item.key !== row.key))}>删除</Button>
                </div>
              ))}
            </div>
          </CreateSection>

          <CreateSection index="04" title="类型指标权重" summary="每个类型与指标组合独立参与综合达成率">
            <div className="grid gap-3 md:grid-cols-2">
              {createMatrixItems.map(({ category, metric, key, weight }) => (
                <div key={key} className="grid grid-cols-[minmax(0,1fr)_120px] items-center gap-2">
                  <Label className="truncate text-sm text-slate-600 dark:text-slate-300">
                    {category.categoryName}-{metric.metricName}（{metric.metricUnit} / {metricTypeLabel(metric.valueType)}）
                  </Label>
                  <Input
                    type="number"
                    value={createMatrixWeights[key] ?? String(weight)}
                    onChange={(e) => updateCreateMatrixWeight(key, e.target.value)}
                    placeholder="权重"
                  />
                </div>
              ))}
            </div>
          </CreateSection>

          <CreateSection
            index="05"
            title="部门目标"
            summary="选择部门后填写已明确的类型指标目标"
            action={<Button size="sm" variant="outline" onClick={() => setCreateDeptRows((rows) => [...rows, createDeptRow()])}>添加部门</Button>}
          >
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {createDeptRows.map((row) => (
                <div key={row.key} className="grid gap-3 py-4 first:pt-0 last:pb-0 lg:grid-cols-[minmax(180px,1fr)_150px_minmax(180px,1fr)_minmax(320px,1.8fr)_64px]">
                  <Select value={row.deptId} onValueChange={(value) => updateDeptRow(row.key, { deptId: value })}>
                    <SelectTrigger><SelectValue placeholder="选择部门" /></SelectTrigger>
                    <SelectContent>
                      {deptOptions.map((option) => <SelectItem key={option.value} value={String(option.value)}>{option.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Input type="number" value={row.targetAmount} onChange={(e) => updateDeptRow(row.key, { targetAmount: e.target.value })} placeholder="单指标总目标" />
                  <Select value={row.ownerEmployeeId} onValueChange={(value) => updateDeptRow(row.key, { ownerEmployeeId: value })}>
                    <SelectTrigger><SelectValue placeholder="部门负责人" /></SelectTrigger>
                    <SelectContent>
                      {employeeOptions.map((option) => <SelectItem key={option.value} value={String(option.value)}>{option.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                    {createMatrixItems.map(({ category, metric, key }) => (
                      <Input
                        key={key}
                        type="number"
                        value={row.categoryAmounts[key] || ''}
                        onChange={(e) => updateDeptCategoryAmount(row.key, key, e.target.value)}
                        placeholder={`${category.categoryName}-${metric.metricName}(${metric.metricUnit})`}
                      />
                    ))}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => requestDeleteDeptRow(row.key)}
                    disabled={createDeptRows.length === 1}
                  >
                    删除
                  </Button>
                </div>
              ))}
            </div>
          </CreateSection>
        </div>
      </BaseDialog>

      <BaseDialog
        open={Boolean(splitNode)}
        title={splitNode ? `分解：${nodeTitle(splitNode, null, resolveAssigneeLabel(splitNode))}` : '分解目标'}
        description={splitNode?.categoryCode ? '把该类型指标目标值拆到具体员工。' : '补齐或调整部门下的考核类型指标，经理锁定值不可变更。'}
        width="wide"
        onClose={() => setSplitNodeId(null)}
        footer={
          <>
            <div className={cn('mr-auto text-sm', isSplitBalanced ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400')}>
              {shouldBalanceSplit ? `剩余目标值 ${formatValue(splitRemain, splitNode?.metricUnit, metricPrecisionOf(splitNode || undefined))}` : '多指标按每个指标节点分别校验'}
            </div>
            <Button variant="outline" onClick={() => setSplitNodeId(null)}>取消</Button>
            <Button onClick={() => void handleSaveSplit()} disabled={pendingAction === 'split' || !isSplitBalanced}>保存分解</Button>
          </>
        }
      >
        <div className="space-y-4">
          {!splitNode?.categoryCode ? (
            <div className="grid gap-3 md:grid-cols-2">
              {splitRows.map((row) => (
                <div key={row.key} className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/60">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-900 dark:text-white">
                      {row.categoryName || row.categoryCode} / {row.metricName || row.metricCode}
                    </span>
                    {row.locked ? <span className="badge badge-warning">经理锁定</span> : <span className="badge badge-gray">部门补齐</span>}
                  </div>
                  <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_120px]">
                    <Input disabled={row.locked} type="number" value={row.targetAmount} onChange={(e) => setSplitRows((rows) => rows.map((item) => item.key === row.key ? { ...item, targetAmount: e.target.value } : item))} placeholder={row.metricUnit ? `目标值（${row.metricUnit}）` : '目标值'} />
                    <Input disabled={row.locked} type="number" value={row.metricWeight || ''} onChange={(e) => setSplitRows((rows) => rows.map((item) => item.key === row.key ? { ...item, metricWeight: e.target.value } : item))} placeholder="权重" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {splitRows.map((row) => (
                <div key={row.key} className="grid gap-3 md:grid-cols-[minmax(0,1fr)_160px_auto]">
                  <EmployeePicker
                    value={row.employeeId || ''}
                    fallbackLabel={row.employeeSearch ?? employeeDisplayById.get(row.employeeId || '')}
                    options={employeeOptions}
                    loading={employeeLoading}
                    loaded={employeeLoaded}
                    placeholder={employeeInputPlaceholder}
                    onChange={(employeeId) => setSplitRows((rows) => rows.map((item) => item.key === row.key ? {
                      ...item,
                      employeeId,
                      employeeSearch: undefined,
                    } : item))}
                  />
                  <Input type="number" value={row.targetAmount} onChange={(e) => setSplitRows((rows) => rows.map((item) => item.key === row.key ? { ...item, targetAmount: e.target.value } : item))} placeholder={splitNode?.metricUnit ? `目标值（${splitNode.metricUnit}）` : '目标值'} />
                  <Button variant="ghost" size="sm" onClick={() => requestDeleteSplitRow(row.key)}>删除</Button>
                </div>
              ))}
              {employeeLoaded && !employeeLoading && employees.length === 0 ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300">
                  当前租户没有 HR 员工档案，员工任务无法从列表选择。
                </div>
              ) : null}
              <Button variant="outline" size="sm" onClick={addSplitRow}>添加员工任务</Button>
            </div>
          )}
        </div>
      </BaseDialog>

      <BaseDialog
        open={Boolean(resultNode)}
        title={resultNode ? `填报实绩：${nodeTitle(resultNode, null, resolveAssigneeLabel(resultNode))}` : '填报实绩'}
        width="narrow"
        onClose={() => setResultNodeId(null)}
        footer={
          <>
            <Button variant="outline" onClick={() => setResultNodeId(null)}>取消</Button>
            <Button onClick={() => void handleUpdateResult()} disabled={pendingAction === 'result'}>保存实绩</Button>
          </>
        }
      >
        <Field label={resultNode?.metricUnit ? `实际完成值（${resultNode.metricUnit}）` : '实际完成值'}>
          <Input type="number" value={resultActualAmount} onChange={(e) => setResultActualAmount(e.target.value)} />
        </Field>
      </BaseDialog>

      <ConfirmDialog
        open={Boolean(pendingDeleteTarget)}
        title={pendingDeleteTarget?.kind === 'dept-row' ? '删除部门目标值' : '删除员工任务'}
        message={
          pendingDeleteTarget?.kind === 'dept-row'
            ? '确定删除这一行部门目标值吗？删除后需要重新补齐该部门的指标分解。'
            : '确定删除这一行员工任务吗？删除后该叶子任务会从当前分解中移除。'
        }
        confirmText="确认删除"
        cancelText="取消"
        danger
        onCancel={closeDeleteTarget}
        onConfirm={confirmDeleteTarget}
      />
    </>
  );
};

const CreateSection = ({
  index,
  title,
  summary,
  action,
  children,
}: {
  index: string;
  title: string;
  summary: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) => (
  <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
    <div className="mb-4 flex items-start justify-between gap-4">
      <div className="flex min-w-0 items-start gap-3">
        <span className="mt-0.5 rounded-lg bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-900 dark:text-slate-300">{index}</span>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-slate-900 dark:text-white">{title}</div>
          <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{summary}</div>
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
    {children}
  </section>
);

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="space-y-1.5">
    <Label>{label}</Label>
    {children}
  </div>
);

const TreeTable = ({
  rows,
  objectives,
  currentId,
  status,
  primaryMetric,
  isMultiMetric,
  resolveAssigneeLabel,
  renderProgress,
  onSelect,
  onSplit,
  onResult,
}: {
  rows: TreeRow[];
  objectives: PerformanceObjective[];
  currentId: number;
  status?: string;
  primaryMetric?: PerformanceMetric;
  isMultiMetric: boolean;
  resolveAssigneeLabel: AssigneeLabelResolver;
  renderProgress: (rate?: number) => React.ReactNode;
  onSelect: (id: number) => void;
  onSplit: (node: PerformanceAssignment) => void;
  onResult: (node: PerformanceAssignment) => void;
}) => {
  const canEditPlan = ['DRAFT', 'REJECTED'].includes(status || '');
  const canFillResult = status === 'PLAN_APPROVED';

  return (
    <div className="card overflow-hidden">
      <div className="grid min-h-0 flex-1 lg:grid-cols-[280px_minmax(0,1fr)]">
        <div className="border-b border-slate-100 p-4 dark:border-slate-800 lg:border-b-0 lg:border-r">
          <div className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">目标列表</div>
          <div className="space-y-2">
            {objectives.map((objective) => (
              <button
                key={objective.id}
                type="button"
                className={cn('cf-side-link cf-side-link-sm', objective.id === currentId && 'cf-side-link-active')}
                onClick={() => onSelect(objective.id)}
              >
                <Target className="h-4 w-4" />
                <span className="min-w-0 flex-1 truncate text-left">{objective.objectiveName}</span>
                <span className="text-xs opacity-70">{objective.grade || '-'}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="min-w-0">
          <div className="hidden md:block">
            <PerformanceTableShell minWidthClassName="min-w-[1216px]">
              <Table>
                <TreeTableColGroup />
                <TableHeader>
                  <TableRow>
                    <TableHead>节点</TableHead>
                    <TableHead>指标</TableHead>
                    <TableHead className="text-right">目标值</TableHead>
                    <TableHead className="text-right">实际值</TableHead>
                    <TableHead className="px-3 text-center">完成率</TableHead>
                    <TableHead className="px-3 text-center">来源</TableHead>
                    <TableActionHead className="w-48 px-4 py-3 text-right">操作</TableActionHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => {
                    const displayMetric = treeMetricDisplay(row, primaryMetric, isMultiMetric);
                    const displayUnit = displayMetric?.metricUnit || row.metricUnit;
                    const displayPrecision = metricPrecisionOf(displayMetric || row);
                    const showActual = Boolean(row.metricCode || !isMultiMetric);
                    return (
                      <TableRow key={row.id}>
                        <TableCell>
                          <PerformanceNodeCell
                            depth={row.depth}
                            icon={row.depth === 0 ? <Layers3 className="h-4 w-4 shrink-0 text-teal-600" /> : row.assigneeType === 'EMPLOYEE' ? <Users className="h-4 w-4 shrink-0 text-slate-400" /> : <GitBranch className="h-4 w-4 shrink-0 text-cyan-600" />}
                            title={row.assigneeType === 'EMPLOYEE' ? resolveAssigneeLabel(row) : nodeTitle(row, null, resolveAssigneeLabel(row))}
                            subtitle={row.assigneeType === 'EMPLOYEE' ? nodeSubtitle(row, displayMetric) : `#${row.id}${row.categoryCode ? ` · ${nodeSubtitle(row, displayMetric)}` : ''}`}
                          />
                        </TableCell>
                        <TableCell className="px-3">
                          <MetricLabelCell
                            name={displayMetric?.metricName}
                            unit={displayMetric?.metricUnit}
                            weight={displayMetric?.metricWeight}
                          />
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{formatValue(row.targetAmount, displayUnit, displayPrecision)}</TableCell>
                        <TableCell className="text-right tabular-nums">{showActual ? formatValue(row.actualAmount, displayUnit, displayPrecision) : '-'}</TableCell>
                        <TableCell className="px-3 text-center">{renderProgress(row.completionRate)}</TableCell>
                        <TableCell className="px-3 text-center">{row.locked ? <span className="badge badge-warning">经理锁定</span> : <span className="badge badge-gray">{row.quotaSource === 'DEPT_OWNER' ? '部门负责人' : '经理'}</span>}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            {row.assigneeType === 'DEPT' && canEditPlan ? <Button size="sm" variant="outline" className="min-w-[72px] justify-center" onClick={() => onSplit(row)}>分解</Button> : null}
                            {row.assigneeType === 'EMPLOYEE' && canFillResult ? <Button size="sm" variant="soft" className="min-w-[72px] justify-center" onClick={() => onResult(row)}>填报</Button> : null}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </PerformanceTableShell>
          </div>
          <div className="space-y-3 p-4 md:hidden">
            {rows.map((row) => {
              const displayMetric = treeMetricDisplay(row, primaryMetric, isMultiMetric);
              const displayUnit = displayMetric?.metricUnit || row.metricUnit;
              const displayPrecision = metricPrecisionOf(displayMetric || row);
              const actualText = row.metricCode || !isMultiMetric ? formatValue(row.actualAmount, displayUnit, displayPrecision) : '-';
              return (
                <div key={row.id} className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-medium text-slate-900 dark:text-white">{nodeTitle(row, displayMetric, resolveAssigneeLabel(row))}</div>
                      <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">目标 {formatValue(row.targetAmount, displayUnit, displayPrecision)} / 实际 {actualText}</div>
                    </div>
                    {row.locked ? <span className="badge badge-warning">锁定</span> : null}
                  </div>
                  <div className="mt-3">{renderProgress(row.completionRate)}</div>
                  <div className="mt-3 flex justify-end gap-2">
                    {row.assigneeType === 'DEPT' && canEditPlan ? <Button size="sm" variant="outline" onClick={() => onSplit(row)}>分解</Button> : null}
                    {row.assigneeType === 'EMPLOYEE' && canFillResult ? <Button size="sm" variant="soft" onClick={() => onResult(row)}>填报</Button> : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

const MatrixView = ({
  departmentRows,
  categoryNodes,
  isMultiMetric,
  primaryMetric,
  renderProgress,
  resolveAssigneeLabel,
}: {
  departmentRows: DepartmentMatrixRow[];
  categoryNodes: PerformanceAssignment[];
  isMultiMetric: boolean;
  primaryMetric?: PerformanceMetric;
  renderProgress: (rate?: number) => React.ReactNode;
  resolveAssigneeLabel: AssigneeLabelResolver;
}) => (
  <div className="space-y-4">
    <div className="card">
      <div className="card-header">
        <div className="text-sm font-semibold text-slate-900 dark:text-white">部门目标值校验</div>
        <div className="text-xs text-slate-500 dark:text-slate-400">单指标按部门总目标值校验，多指标按每个类型指标的员工叶子合计校验。</div>
      </div>
      <PerformanceTableShell minWidthClassName="min-w-[940px]">
        <Table>
          <MatrixCheckColGroup />
          <TableHeader>
            <TableRow>
              <TableHead>部门</TableHead>
              <TableHead className="text-right">部门总目标值</TableHead>
              <TableHead className="text-right">类型指标合计</TableHead>
              <TableHead className="text-right">剩余目标值</TableHead>
              <TableHead className="px-3 text-center">校验</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {departmentRows.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="font-medium">{row.assigneeName}</TableCell>
                <TableCell className="text-right tabular-nums">{isMultiMetric ? '-' : formatValue(row.targetAmount, primaryMetric?.metricUnit, metricPrecisionOf(primaryMetric))}</TableCell>
                <TableCell className="text-right tabular-nums">{isMultiMetric ? `${row.itemCount}项指标` : formatValue(row.categoryTotal, primaryMetric?.metricUnit, metricPrecisionOf(primaryMetric))}</TableCell>
                <TableCell className="text-right tabular-nums">{isMultiMetric ? '-' : formatValue(row.remainAmount, primaryMetric?.metricUnit, metricPrecisionOf(primaryMetric))}</TableCell>
                <TableCell className="px-3 text-center">{isMultiMetric ? <span className="badge badge-gray">按指标校验</span> : toPrecisionUnits(row.remainAmount, metricPrecisionOf(primaryMetric)) === 0 ? <span className="badge badge-success">已平衡</span> : <span className="badge badge-warning">待补齐</span>}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </PerformanceTableShell>
    </div>
    <div className="card">
      <div className="card-header">
        <div className="text-sm font-semibold text-slate-900 dark:text-white">类型指标矩阵</div>
        <div className="text-xs text-slate-500 dark:text-slate-400">经理锁定与部门补齐分开展示，每个指标按自己的单位计算完成率。</div>
      </div>
      <PerformanceTableShell minWidthClassName="min-w-[1160px]">
        <Table>
          <MetricMatrixColGroup />
          <TableHeader>
            <TableRow>
              <TableHead>部门</TableHead>
              <TableHead>考核类型</TableHead>
              <TableHead>指标</TableHead>
              <TableHead className="text-right">目标值</TableHead>
              <TableHead className="text-right">实际值</TableHead>
              <TableHead className="px-3 text-center">完成率</TableHead>
              <TableHead className="px-3 text-center">状态</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {categoryNodes.map((node) => (
              <TableRow key={node.id}>
                <TableCell className="font-medium">{resolveAssigneeLabel(node)}</TableCell>
                <TableCell>{node.categoryName || node.categoryCode || '-'}</TableCell>
                <TableCell className="px-3">
                  <MetricLabelCell name={node.metricName || node.metricCode} unit={node.metricUnit} weight={node.metricWeight} />
                </TableCell>
                <TableCell className="text-right tabular-nums">{formatValue(node.targetAmount, node.metricUnit, metricPrecisionOf(node))}</TableCell>
                <TableCell className="text-right tabular-nums">{formatValue(node.actualAmount, node.metricUnit, metricPrecisionOf(node))}</TableCell>
                <TableCell className="px-3 text-center">{renderProgress(node.completionRate)}</TableCell>
                <TableCell className="px-3 text-center">{node.locked ? <span className="badge badge-warning">经理锁定</span> : <span className="badge badge-primary">部门补齐</span>}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </PerformanceTableShell>
    </div>
  </div>
);

const EmployeeView = ({ rows, renderProgress }: { rows: EmployeeSummaryRow[]; renderProgress: (rate?: number) => React.ReactNode }) => (
  <PerformanceTableShell minWidthClassName="min-w-[1080px]">
    <Table>
      <EmployeeSummaryColGroup />
      <TableHeader>
        <TableRow>
          <TableHead>员工</TableHead>
          <TableHead>覆盖类型</TableHead>
          <TableHead>指标目标</TableHead>
          <TableHead className="px-3 text-center">权重后完成率</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.employeeId}>
            <TableCell className="font-medium">{row.employeeName}</TableCell>
            <TableCell>{row.categories || '-'}</TableCell>
            <TableCell>
              <div className="line-clamp-2 text-sm text-slate-700 dark:text-slate-200">{row.metricSummary || '-'}</div>
            </TableCell>
            <TableCell className="px-3 text-center">{renderProgress(row.completionRate)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  </PerformanceTableShell>
);

const ProgressView = ({
  categoryNodes,
  leafTasks,
  status,
  renderProgress,
  resolveAssigneeLabel,
  onResult,
}: {
  categoryNodes: PerformanceAssignment[];
  leafTasks: PerformanceAssignment[];
  status?: string;
  renderProgress: (rate?: number) => React.ReactNode;
  resolveAssigneeLabel: AssigneeLabelResolver;
  onResult: (node: PerformanceAssignment) => void;
}) => {
  const canFillResult = status === 'PLAN_APPROVED';

  return (
  <div className="space-y-4">
      <div className="card">
        <div className="card-header">
          <div className="text-sm font-semibold text-slate-900 dark:text-white">部门类型指标完成率</div>
          <div className="text-xs text-slate-500 dark:text-slate-400">每个类型指标按自己的单位统计，部门总分由指标权重折算。</div>
        </div>
        <PerformanceTableShell minWidthClassName="min-w-[1120px]">
          <Table>
            <ProgressDeptColGroup />
            <TableHeader>
              <TableRow>
                <TableHead>部门</TableHead>
                <TableHead>考核类型</TableHead>
                <TableHead>指标</TableHead>
                <TableHead className="text-right">目标值</TableHead>
                <TableHead className="text-right">实际值</TableHead>
                <TableHead className="px-3 text-center">完成率</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {categoryNodes.map((node) => (
                <TableRow key={node.id}>
                  <TableCell className="font-medium">{resolveAssigneeLabel(node)}</TableCell>
                  <TableCell>{node.categoryName || node.categoryCode || '-'}</TableCell>
                  <TableCell className="px-3">
                    <MetricLabelCell name={node.metricName || node.metricCode} unit={node.metricUnit} weight={node.metricWeight} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatValue(node.targetAmount, node.metricUnit, metricPrecisionOf(node))}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatValue(node.actualAmount, node.metricUnit, metricPrecisionOf(node))}</TableCell>
                  <TableCell className="px-3 text-center">{renderProgress(node.completionRate)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </PerformanceTableShell>
      </div>
      <div className="card">
        <div className="card-header">
          <div className="text-sm font-semibold text-slate-900 dark:text-white">员工个人完成率</div>
          <div className="text-xs text-slate-500 dark:text-slate-400">叶子任务实绩汇总到个人、类型指标和部门。</div>
        </div>
        <PerformanceTableShell minWidthClassName="min-w-[1180px]">
          <Table>
            <ProgressEmployeeColGroup />
            <TableHeader>
              <TableRow>
                <TableHead>员工叶子任务</TableHead>
                <TableHead>类型</TableHead>
                <TableHead>指标</TableHead>
                <TableHead className="text-right">目标值</TableHead>
                <TableHead className="text-right">实际值</TableHead>
                <TableHead className="px-3 text-center">完成率</TableHead>
                <TableActionHead className="w-48 px-4 py-3 text-right">操作</TableActionHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {leafTasks.map((node) => (
                <TableRow key={node.id}>
                  <TableCell className="font-medium">{resolveAssigneeLabel(node)}</TableCell>
                  <TableCell>{node.categoryName || node.categoryCode || '-'}</TableCell>
                  <TableCell className="px-3">
                    <MetricLabelCell name={node.metricName || node.metricCode} unit={node.metricUnit} weight={node.metricWeight} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatValue(node.targetAmount, node.metricUnit, metricPrecisionOf(node))}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatValue(node.actualAmount, node.metricUnit, metricPrecisionOf(node))}</TableCell>
                  <TableCell className="px-3 text-center">{renderProgress(node.completionRate)}</TableCell>
                  <TableCell className="text-right">
                    {canFillResult ? <Button size="sm" variant="soft" className="min-w-[96px] justify-center" onClick={() => onResult(node)}>填报实绩</Button> : <span className="text-xs text-slate-400">待执行</span>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </PerformanceTableShell>
      </div>
    </div>
  );
};

const ArchiveView = ({ objective, categoryNodes, employeeRows, renderProgress }: { objective: PerformanceObjective; categoryNodes: PerformanceAssignment[]; employeeRows: EmployeeSummaryRow[]; renderProgress: (rate?: number) => React.ReactNode }) => (
  <div className="space-y-6">
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <div className="card p-4">
        <div className="text-sm text-slate-500 dark:text-slate-400">周期总分</div>
        <div className="mt-2 text-3xl font-bold text-slate-900 dark:text-white">{Number(objective.score || 0).toFixed(1)}</div>
        <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">等级 {objective.grade || '-'}</div>
      </div>
      <div className="card p-4">
        <div className="text-sm text-slate-500 dark:text-slate-400">类型指标数</div>
        <div className="mt-2 text-3xl font-bold text-slate-900 dark:text-white">{categoryNodes.length}</div>
        <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">部门类型指标节点</div>
      </div>
      <div className="card p-4">
        <div className="text-sm text-slate-500 dark:text-slate-400">员工叶子数</div>
        <div className="mt-2 text-3xl font-bold text-slate-900 dark:text-white">{objective.leafTaskCount || 0}</div>
        <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">个人绩效口径</div>
      </div>
      <PerformanceCompletionSummaryCard
        label="权重后总完成率"
        rate={objective.completionRate}
        hint="权重折算后"
      />
    </div>
    <PerformanceTableShell minWidthClassName="min-w-[1080px]">
      <Table>
        <EmployeeSummaryColGroup />
        <TableHeader>
          <TableRow>
            <TableHead>员工</TableHead>
            <TableHead>覆盖类型</TableHead>
            <TableHead>指标目标</TableHead>
            <TableHead className="px-3 text-center">权重后完成率</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {employeeRows.map((row) => (
            <TableRow key={row.employeeId}>
              <TableCell className="font-medium">{row.employeeName}</TableCell>
              <TableCell>{row.categories || '-'}</TableCell>
              <TableCell>
                <div className="line-clamp-2 text-sm text-slate-700 dark:text-slate-200">{row.metricSummary || '-'}</div>
              </TableCell>
              <TableCell className="px-3 text-center">{renderProgress(row.completionRate)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </PerformanceTableShell>
  </div>
);

const SalaryLinkView = ({
  objective,
  employeeRows,
  salaryEmployeeId,
  setSalaryEmployeeId,
  salaryForm,
  setSalaryForm,
  onCreate,
  pending,
}: {
  objective: PerformanceObjective;
  employeeRows: Array<{ employeeId: number; employeeName: string }>;
  salaryEmployeeId: string;
  setSalaryEmployeeId: (value: string) => void;
  salaryForm: { adjustmentReason: string; minScore: string; afterTotal: string; effectiveDate: string };
  setSalaryForm: React.Dispatch<React.SetStateAction<{ adjustmentReason: string; minScore: string; afterTotal: string; effectiveDate: string }>>;
  onCreate: () => void;
  pending: boolean;
}) => (
  <div>
    <div className="card max-w-4xl p-5">
      <div className="mb-4 flex items-center gap-3">
        <div className="stat-icon stat-icon-primary"><BarChart3 className="h-6 w-6" /></div>
        <div>
          <div className="text-sm font-semibold text-slate-900 dark:text-white">绩效调薪联动</div>
          <div className="text-xs text-slate-500 dark:text-slate-400">归档后生成调薪申请，后续继续走现有调薪审批。</div>
        </div>
      </div>
      {objective.status !== 'COMPLETED' ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
          当前目标尚未归档，不能生成绩效调薪。
        </div>
      ) : (
        <div className="grid gap-4">
          <Field label="员工">
            <Select value={salaryEmployeeId} onValueChange={setSalaryEmployeeId}>
              <SelectTrigger><SelectValue placeholder="选择员工" /></SelectTrigger>
              <SelectContent>
                {employeeRows.map((row) => <SelectItem key={row.employeeId} value={String(row.employeeId)}>{row.employeeName}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="调薪原因"><Input value={salaryForm.adjustmentReason} onChange={(e) => setSalaryForm((prev) => ({ ...prev, adjustmentReason: e.target.value }))} placeholder="绩效结果调薪" /></Field>
          <Field label="最低绩效分"><Input type="number" value={salaryForm.minScore} onChange={(e) => setSalaryForm((prev) => ({ ...prev, minScore: e.target.value }))} /></Field>
          <Field label="调薪后总额"><Input type="number" value={salaryForm.afterTotal} onChange={(e) => setSalaryForm((prev) => ({ ...prev, afterTotal: e.target.value }))} /></Field>
          <Field label="生效日期"><DatePicker type="date" className="h-11" value={salaryForm.effectiveDate} onChange={(e) => setSalaryForm((prev) => ({ ...prev, effectiveDate: e.target.value }))} /></Field>
          <div><Button onClick={onCreate} disabled={pending}>生成调薪申请</Button></div>
        </div>
      )}
    </div>
  </div>
);

export default HrPerformancePage;

const numberFormatter = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 });
const currencyFormatter = new Intl.NumberFormat('zh-CN', {
  style: 'currency',
  currency: 'CNY',
  maximumFractionDigits: 0,
});

const CrmSalesView: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [topOwners, setTopOwners] = useState<CrmPerformanceSummary[]>([]);
  const [topDepartments, setTopDepartments] = useState<CrmPerformanceSummary[]>([]);

  const fetchAll = React.useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const range = startDate && endDate ? { startDate, endDate } : undefined;
      const [owners, depts] = await Promise.all([
        listCrmTopOwners(10, range),
        listCrmTopDepartments(10, range),
      ]);
      setTopOwners(owners || []);
      setTopDepartments(depts || []);
    } catch (ex) {
      setError(getErrorMessage(ex));
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  const totals = useMemo(() => {
    const seed = {
      wonOpportunityCount: 0,
      contractAmount: 0,
      receivedAmount: 0,
      followUpCount: 0,
    };
    return topOwners.reduce(
      (acc, item) => ({
        wonOpportunityCount: acc.wonOpportunityCount + (item.wonOpportunityCount || 0),
        contractAmount: acc.contractAmount + Number(item.contractAmount || 0),
        receivedAmount: acc.receivedAmount + Number(item.receivedAmount || 0),
        followUpCount: acc.followUpCount + (item.followUpCount || 0),
      }),
      seed,
    );
  }, [topOwners]);

  const cards = [
    {
      title: '赢单数',
      value: numberFormatter.format(totals.wonOpportunityCount),
      icon: <Target className="h-6 w-6" />,
      iconVariant: 'primary' as const,
      meta: '期间新增 WON 商机总数',
    },
    {
      title: '合同金额',
      value: currencyFormatter.format(totals.contractAmount),
      icon: <ClipboardList className="h-6 w-6" />,
      iconVariant: 'success' as const,
      meta: '赢单商机合计（含期望金额近似）',
    },
    {
      title: '已到账回款',
      value: currencyFormatter.format(totals.receivedAmount),
      icon: <CheckCircle2 className="h-6 w-6" />,
      iconVariant: 'success' as const,
      meta: '按回款到账日统计',
    },
    {
      title: '跟进记录',
      value: numberFormatter.format(totals.followUpCount),
      icon: <BarChart3 className="h-6 w-6" />,
      iconVariant: 'primary' as const,
      meta: '期间新增跟进条数',
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="card flex flex-wrap items-end gap-3 p-4">
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-slate-500">起始日期</Label>
          <DatePicker type="date" className="h-9 w-40" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-slate-500">结束日期</Label>
          <DatePicker type="date" className="h-9 w-40" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
        <Button variant="outline" onClick={() => void fetchAll()} disabled={loading}>
          <RefreshCcw className={cn('h-4 w-4', loading && 'animate-spin')} />
          刷新
        </Button>
        {error ? <span className="text-sm text-red-600 dark:text-red-400">{error}</span> : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <StatCard
            key={card.title}
            title={card.title}
            value={card.value}
            icon={card.icon}
            iconVariant={card.iconVariant}
            meta={card.meta}
          />
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <CrmSalesRankTable title="员工业绩 Top 10" subtitle="按已到账回款金额倒序" rows={topOwners} dimensionLabel="员工" />
        <CrmSalesRankTable title="部门业绩 Top 10" subtitle="按已到账回款金额倒序" rows={topDepartments} dimensionLabel="部门" />
      </div>
    </div>
  );
};

type CrmSalesRankTableProps = {
  title: string;
  subtitle: string;
  rows: CrmPerformanceSummary[];
  dimensionLabel: string;
};

const CrmSalesRankTable: React.FC<CrmSalesRankTableProps> = ({ title, subtitle, rows, dimensionLabel }) => (
  <div className="card overflow-hidden">
    <div className="flex items-center justify-between px-4 py-3">
      <div>
        <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</div>
        <div className="text-xs text-slate-500 dark:text-slate-400">{subtitle}</div>
      </div>
      <Users className="h-5 w-5 text-slate-400" />
    </div>
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-12">#</TableHead>
          <TableHead>{dimensionLabel}</TableHead>
          <TableHead className="text-right">赢单</TableHead>
          <TableHead className="text-right">合同金额</TableHead>
          <TableHead className="text-right">已到账</TableHead>
          <TableHead className="text-right">未到账</TableHead>
          <TableHead className="text-right">跟进</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length === 0 ? (
          <TableRow>
            <TableCell colSpan={7} className="py-8 text-center text-sm text-slate-500">
              暂无数据
            </TableCell>
          </TableRow>
        ) : (
          rows.map((row, index) => (
            <TableRow key={`${row.dimension}-${row.targetId}`}>
              <TableCell className="tabular-nums text-slate-500">{index + 1}</TableCell>
              <TableCell className="font-medium text-slate-800 dark:text-slate-200">
                {row.targetName || `#${row.targetId}`}
              </TableCell>
              <TableCell className="text-right tabular-nums">{row.wonOpportunityCount}</TableCell>
              <TableCell className="text-right tabular-nums">{currencyFormatter.format(Number(row.contractAmount || 0))}</TableCell>
              <TableCell className="text-right tabular-nums">{currencyFormatter.format(Number(row.receivedAmount || 0))}</TableCell>
              <TableCell className="text-right tabular-nums text-amber-600 dark:text-amber-400">{currencyFormatter.format(Number(row.outstandingAmount || 0))}</TableCell>
              <TableCell className="text-right tabular-nums">{row.followUpCount}</TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  </div>
);
