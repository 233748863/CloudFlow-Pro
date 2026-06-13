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
// HR-P0-1 绩效 360 度评估
// ============================================================================

export interface PerformanceEvaluator extends HrRecord {
  id?: number;
  objectiveId?: number;
  assignmentId?: number;
  evaluateeId?: number;
  evaluatorId?: number;
  evaluatorSource?: 'SELF' | 'MANAGER' | 'PEER' | 'SUBORDINATE' | 'CUSTOMER' | string;
  weight?: number;
  status?: string;
}

export interface PerformanceEvaluatorResponsePayload {
  evaluatorId: number;
  score: number;
  dimensionScores?: HrRecord;
  commentText?: string;
}

export interface PerformanceInvitePayload {
  objectiveId: number;
  assignmentId?: number;
  evaluateeId: number;
  evaluators: Array<{
    evaluatorId: number;
    source: string;
    weight?: number;
  }>;
}

export const invitePerformance360 = (data: PerformanceInvitePayload) =>
  request.post<void>('/hr/performance/360/invite', data);

export const submitPerformance360Response = (data: PerformanceEvaluatorResponsePayload) =>
  request.post<void>('/hr/performance/360/response', data);

export const cancelPerformance360Evaluator = (id: number) =>
  request.post<void>(`/hr/performance/360/evaluator/${id}/cancel`);

export const listPerformance360Evaluators = (objectiveId: number, evaluateeId?: number) =>
  request.get<PerformanceEvaluator[]>('/hr/performance/360/evaluators', {
    params: { objectiveId, evaluateeId },
  });

export const listPerformance360Pending = (evaluatorId: number) =>
  request.get<PerformanceEvaluator[]>('/hr/performance/360/pending', { params: { evaluatorId } });

export const aggregatePerformance360 = (objectiveId: number, evaluateeId: number) =>
  request.post<HrRecord>('/hr/performance/360/aggregate', null, {
    params: { objectiveId, evaluateeId },
  });

// ============================================================================
// HR-P0-2 绩效强制分布
// ============================================================================

export interface PerformanceDistributionRule extends HrRecord {
  id?: number;
  objectiveId?: number;
  ruleName?: string;
  distribution?: Array<{ grade: string; percent: number }>;
  enforceMode?: 'BLOCK' | 'WARN';
  status?: string;
}

export const listPerformanceDistributionRules = (objectiveId?: number) =>
  request.get<PerformanceDistributionRule[]>('/hr/performance/distribution/rules', {
    params: { objectiveId },
  });

export const savePerformanceDistributionRule = (data: PerformanceDistributionRule) =>
  request.post<number>('/hr/performance/distribution/rules', data);

export const deletePerformanceDistributionRule = (id: number) =>
  request.delete<void>(`/hr/performance/distribution/rules/${id}`);

export const validatePerformanceDistribution = (data: {
  objectiveId: number;
  grades: Array<{ employeeId: number; grade: string }>;
}) => request.post<HrRecord>('/hr/performance/distribution/validate', data);

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
