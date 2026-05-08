import request from './request';
import { PageResult } from '@/types';

export interface BudgetSubject {
  subjectId?: number;
  subjectCode: string;
  subjectName: string;
  parentId?: number;
  subjectType?: string;
  sortOrder?: number;
  enabled?: number;
  remark?: string;
}

export interface BudgetLine {
  lineId?: number;
  budgetId?: number;
  subjectId?: number;
  subjectCode: string;
  subjectName: string;
  amount?: number;
  reservedAmount?: number;
  actualAmount?: number;
  availableAmount?: number;
  warningRatio?: number;
  alertRatio?: number;
  blockRatio?: number;
  sortOrder?: number;
  remark?: string;
}

export interface BudgetPlan {
  budgetId?: number;
  budgetNo?: string;
  budgetName: string;
  fiscalYear: number;
  periodType?: string;
  targetType: string;
  targetId: number;
  targetName?: string;
  deptId?: number;
  deptName?: string;
  projectId?: number;
  projectName?: string;
  ownerId?: number;
  ownerName?: string;
  totalAmount?: number;
  reservedAmount?: number;
  actualAmount?: number;
  availableAmount?: number;
  versionNo?: number;
  status?: string;
  remark?: string;
  lines?: BudgetLine[];
}

export interface BudgetAdjustment {
  adjustmentId?: number;
  adjustmentNo?: string;
  budgetId: number;
  budgetNo?: string;
  adjustmentType?: string;
  subjectCode?: string;
  subjectName?: string;
  changeAmount: number;
  reason: string;
  status?: string;
}

export interface BudgetLedger {
  ledgerId?: number;
  budgetId?: number;
  lineId?: number;
  targetType?: string;
  targetId?: number;
  businessType?: string;
  businessId?: number;
  businessNo?: string;
  subjectCode?: string;
  subjectName?: string;
  operationType?: string;
  amount?: number;
  availableAfter?: number;
  status?: string;
  remark?: string;
  createBy?: string;
  createTime?: string;
}

export interface BudgetExecutionSummary {
  budgetId?: number;
  budgetNo?: string;
  budgetName?: string;
  totalAmount?: number;
  reservedAmount?: number;
  actualAmount?: number;
  availableAmount?: number;
  executionRatio?: number;
  thresholdStatus?: string;
  warningThreshold?: number;
  alertThreshold?: number;
  blockThreshold?: number;
}

export const budgetApi = {
  listPlans: (params: {
    pageNum?: number;
    pageSize?: number;
    budgetName?: string;
    targetType?: string;
    status?: string;
  }) => request.get('/oa/budget/plan/list', { params }) as Promise<PageResult<BudgetPlan>>,

  listSubjects: (params: {
    pageNum?: number;
    pageSize?: number;
    subjectName?: string;
  }) => request.get('/oa/budget/subject/list', { params }) as Promise<PageResult<BudgetSubject>>,

  listAdjustments: (params: {
    pageNum?: number;
    pageSize?: number;
    budgetId?: number;
    status?: string;
  }) => request.get('/oa/budget/adjustment/list', { params }) as Promise<PageResult<BudgetAdjustment>>,

  getPlanDetail: (id: number) => request.get(`/oa/budget/plan/${id}`) as Promise<BudgetPlan>,

  addPlan: (data: BudgetPlan) => request.post('/oa/budget/plan', data),

  editPlan: (data: BudgetPlan) => request.put('/oa/budget/plan', data),

  submitPlan: (id: number) => request.post(`/oa/budget/plan/submit/${id}`),

  addSubject: (data: BudgetSubject) => request.post('/oa/budget/subject', data),

  editSubject: (data: BudgetSubject) => request.put('/oa/budget/subject', data),

  addAdjustment: (data: BudgetAdjustment) => request.post('/oa/budget/adjustment', data),

  submitAdjustment: (id: number) => request.post(`/oa/budget/adjustment/submit/${id}`),

  listLedger: (params: {
    pageNum?: number;
    pageSize?: number;
    budgetId?: number;
    subjectCode?: string;
    businessType?: string;
    businessId?: number;
  }) => request.get('/oa/budget/execution/ledger', { params }) as Promise<PageResult<BudgetLedger>>,

  getExecutionSummary: (budgetId: number, subjectCode?: string) =>
    request.get('/oa/budget/execution/summary', { params: { budgetId, subjectCode } }) as Promise<BudgetExecutionSummary>,
};
