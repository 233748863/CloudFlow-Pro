import request from '@/services/api/request';
import { withList } from './internals';
import type {
  CrmPerformanceRangeQuery,
  CrmPerformanceSummary,
  HrPagedResult,
  HrRecord,
  PerformanceAssignment,
  PerformanceMetric,
  PerformanceObjective,
  PerformanceOverview,
} from './types';

const normalizePerformanceStatus = (status?: string | null) => {
  const value = String(status || '').toUpperCase();
  if (value === 'APPROVING') return 'PLAN_APPROVING';
  if (value === 'APPROVED') return 'PLAN_APPROVED';
  return value || 'DRAFT';
};

const normalizePerformanceMetric = (item: PerformanceMetric): PerformanceMetric => ({
  ...item,
  metricCode: item.metricCode || item.metric,
  metricName: item.metricName || item.metric || item.metricCode,
  metricUnit: item.metricUnit || '%',
  metricWeight: Number(item.metricWeight ?? item.weight ?? 100),
  precision: item.precision ?? 2,
  valueType: item.valueType || 'PERCENT',
});

const normalizePerformanceAssignment = (item: PerformanceAssignment): PerformanceAssignment => ({
  ...item,
  categoryCode: item.categoryCode || undefined,
  categoryName: item.categoryName || item.categoryCode || undefined,
  metricCode: item.metricCode || undefined,
  metricName: item.metricName || item.metricCode || undefined,
  metricUnit: item.metricUnit || undefined,
  metricWeight: Number(item.metricWeight ?? item.weight ?? 100),
  metricPrecision: item.metricPrecision ?? item.precision ?? 2,
  metricValueType: item.metricValueType || item.valueType || 'PERCENT',
  targetAmount: Number(item.targetAmount ?? item.targetValue ?? 0),
  targetValue: Number(item.targetAmount ?? item.targetValue ?? 0),
  actualAmount: Number(item.actualAmount ?? item.actualValue ?? 0),
  actualValue: Number(item.actualAmount ?? item.actualValue ?? 0),
  completionRate: Number(item.completionRate ?? 0),
  locked: Boolean(item.locked),
  quotaSource: item.quotaSource || undefined,
  score: item.score == null ? undefined : Number(item.score),
  children: (item.children || []).map(normalizePerformanceAssignment),
});

const normalizePerformanceObjective = (item: PerformanceObjective): PerformanceObjective => ({
  ...item,
  cycleStartDate: item.cycleStartDate ? String(item.cycleStartDate).slice(0, 10) : '',
  cycleEndDate: item.cycleEndDate ? String(item.cycleEndDate).slice(0, 10) : '',
  totalTargetAmount: Number(item.totalTargetAmount ?? 0),
  actualAmount: Number(item.actualAmount ?? 0),
  completionRate: Number(item.completionRate ?? 0),
  score: item.score == null ? undefined : Number(item.score),
  scoreCap: item.scoreCap == null ? undefined : Number(item.scoreCap),
  status: normalizePerformanceStatus(item.status),
  categoryCodes: Array.isArray(item.categoryCodes) ? item.categoryCodes.map((code) => String(code)) : [],
  categoryDefinitions: (item.categoryDefinitions || []).map((row) => ({
    ...row,
    categoryCode: row.categoryCode || '',
    categoryName: row.categoryName || row.categoryCode || '',
  })),
  metrics: (item.metrics || []).map(normalizePerformanceMetric),
  assignments: (item.assignments || []).map(normalizePerformanceAssignment),
  leafTaskCount: Number(item.leafTaskCount ?? 0),
  departmentCount: Number(item.departmentCount ?? 0),
});

export const createPerformanceObjective = (data: HrRecord) =>
  request.post<number>('/hr/performance/objective', {
    ...data,
    objectiveNo: data.objectiveNo || `HRPF${Date.now()}`,
  });
export const listPerformanceObjectives = async (params?: HrRecord) => {
  const page = await request.get<HrPagedResult<PerformanceObjective>>('/hr/performance/objective/list', { params });
  const rows = withList(page).map(normalizePerformanceObjective);
  return { ...page, rows, records: rows };
};
export const getPerformanceObjectiveTree = async (id: number) =>
  normalizePerformanceObjective(await request.get<PerformanceObjective>(`/hr/performance/objective/${id}/tree`));
export const getPerformanceOverview = async () =>
  request.get<PerformanceOverview>('/hr/performance/overview');
export const savePerformanceAssignmentChildren = (parentId: number, data: HrRecord) =>
  request.post<void>(`/hr/performance/assignment/${parentId}/children`, data);
export const updatePerformanceResult = (data: HrRecord) =>
  request.post<void>('/hr/performance/result', data);
export const submitPerformancePlan = (id: number) =>
  request.post<void>(`/hr/performance/objective/${id}/submit-plan`);
export const submitPerformanceResult = (id: number) =>
  request.post<void>(`/hr/performance/objective/${id}/submit-result`);
export const createPerformanceSalaryAdjustment = (id: number, data: HrRecord) =>
  request.post<number>(`/hr/performance/objective/${id}/salary-adjustment`, data);

// ============================================================================
// CRM 销售业绩聚合（HR 绩效看板展示用），透传到 service-crm /inner/crm/performance/*
// ============================================================================

export const summarizeCrmPerformanceByOwner = (ownerIds: number[], range?: CrmPerformanceRangeQuery) =>
  request.get<CrmPerformanceSummary[]>('/hr/performance/crm/owners', {
    params: { ownerIds: ownerIds.join(','), ...(range || {}) },
  });

export const summarizeCrmPerformanceByDept = (deptIds: number[], range?: CrmPerformanceRangeQuery) =>
  request.get<CrmPerformanceSummary[]>('/hr/performance/crm/depts', {
    params: { deptIds: deptIds.join(','), ...(range || {}) },
  });

export const listCrmTopOwners = (limit: number = 10, range?: CrmPerformanceRangeQuery) =>
  request.get<CrmPerformanceSummary[]>('/hr/performance/crm/top-owners', {
    params: { limit, ...(range || {}) },
  });

export const listCrmTopDepartments = (limit: number = 10, range?: CrmPerformanceRangeQuery) =>
  request.get<CrmPerformanceSummary[]>('/hr/performance/crm/top-depts', {
    params: { limit, ...(range || {}) },
  });
