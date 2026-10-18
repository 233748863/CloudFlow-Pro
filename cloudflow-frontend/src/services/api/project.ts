import request from './request';
import type { OaProjectTask, OaProjectDependency } from './oaOperations';
import { PageResult } from '@/types';

export interface Project {
  projectId?: number;
  projectNo?: string;
  projectName: string;
  projectType?: string;
  customerId?: number;
  customerName?: string;
  contractId?: number;
  contractNo?: string;
  ownerId?: number;
  ownerName?: string;
  deptId?: number;
  deptName?: string;
  startDate?: string;
  endDate?: string;
  actualStartDate?: string;
  actualEndDate?: string;
  budgetAmount?: number;
  actualCostAmount?: number;
  version?: number;
  estimatedCost?: number;
  laborCostAmount?: number;
  purchaseCostAmount?: number;
  otherCostAmount?: number;
  billableAmount?: number;
  billedAmount?: number;
  grossMargin?: number;
  grossMarginRate?: number;
  actualHours?: number;
  percentCompleteMode?: string;
  progress?: number;
  priority?: string;
  status?: string;
  riskLevel?: string;
  sourceType?: string;
  sourceId?: number;
  sourceName?: string;
  baselineVersion?: number;
  attachmentUrl?: string;
  remark?: string;
  createTime?: string;
  updateTime?: string;
}

export interface ProjectMember {
  id?: number;
  projectId?: number;
  userId?: number;
  userName?: string;
  roleCode?: string;
  roleName?: string;
  joinDate?: string;
  leaveDate?: string;
  billableFlag?: number;
}

export type ProjectMilestone = OaProjectTask;

export interface ProjectRisk {
  riskId?: number;
  projectId?: number;
  riskCode?: string;
  riskName?: string;
  riskLevel?: string;
  status?: string;
  ownerId?: number;
  ownerName?: string;
  triggerSource?: string;
  summary?: string;
  actionPlan?: string;
  resolvedTime?: string;
}

export type ProjectWbsTask = OaProjectTask;

export type ProjectDependency = OaProjectDependency;

export interface ProjectCostSummary {
  projectId?: number;
  laborAmount?: number;
  otherAmount?: number;
  billableAmount?: number;
  billedAmount?: number;
  expenseAmount?: number;
  purchaseAmount?: number;
  paymentAmount?: number;
  totalAmount?: number;
}

export interface ProjectKpi {
  overdueMilestoneCount?: number;
  overdueTaskCount?: number;
  openRiskCount?: number;
  scheduleVarianceDays?: number;
  costExecutionRate?: number;
}

export interface ProjectLinkSummary {
  sourceType?: string;
  sourceId?: number;
  sourceName?: string;
  contractId?: number;
  contractNo?: string;
  customerName?: string;
  budgetSummary?: string;
  invoiceSummary?: string;
  expenseAmount?: number;
  purchaseAmount?: number;
  paymentAmount?: number;
}

export interface ProjectDetail {
  project: Project;
  members: ProjectMember[];
  milestones: ProjectMilestone[];
  wbsTasks: ProjectWbsTask[];
  dependencies: ProjectDependency[];
  risks: ProjectRisk[];
  costSummary?: ProjectCostSummary;
  kpi?: ProjectKpi;
  linkSummary?: ProjectLinkSummary;
  baselineVersion?: number;
}

export interface ProjectLookupParams {
  pageNum?: number;
  pageSize?: number;
  projectName?: string;
  customerId?: number;
  status?: string;
}

export const projectApi = {
  list: (params: ProjectLookupParams) => request.get('/oa/project/list', { params }) as Promise<PageResult<Project>>,

  getInfo: (id: number) => request.get(`/oa/project/${id}`) as Promise<Project>,

  getDetail: (id: number) => request.get(`/oa/project/${id}/detail`) as Promise<ProjectDetail>,

  listMembers: (id: number) => request.get(`/oa/project/${id}/members`) as Promise<ProjectMember[]>,

  listMilestones: (id: number) => request.get(`/oa/project/${id}/milestones`) as Promise<ProjectMilestone[]>,

  listWbs: (id: number) => request.get(`/oa/project/${id}/wbs`) as Promise<ProjectWbsTask[]>,

  listDependencies: (id: number) => request.get(`/oa/project/${id}/dependency/list`) as Promise<ProjectDependency[]>,

  listRisks: (id: number) => request.get(`/oa/project/${id}/risks`) as Promise<ProjectRisk[]>,

  getCostSummary: (id: number) => request.get(`/oa/project/${id}/cost-summary`) as Promise<ProjectCostSummary>,

  add: (data: Project) => request.post('/oa/project', data),

  addMember: (data: ProjectMember) => request.post('/oa/project/member', data),

  editMember: (data: ProjectMember) => request.put('/oa/project/member', data),

  removeMember: (ids: number[]) => request.delete(`/oa/project/member/${ids.join(',')}`),

  addMilestone: (data: ProjectMilestone) => request.post('/oa/project/milestone', data),

  editMilestone: (data: ProjectMilestone) => request.put('/oa/project/milestone', data),

  removeMilestone: (ids: number[]) => request.delete(`/oa/project/milestone/${ids.join(',')}`),

  addRisk: (data: ProjectRisk) => request.post('/oa/project/risk', data),

  editRisk: (data: ProjectRisk) => request.put('/oa/project/risk', data),

  removeRisk: (ids: number[]) => request.delete(`/oa/project/risk/${ids.join(',')}`),

  addWbs: (data: ProjectWbsTask) => request.post('/oa/project/wbs', data),

  editWbs: (data: ProjectWbsTask) => request.put('/oa/project/wbs', data),

  updateWbsTree: (projectId: number, data: Array<Pick<OaProjectTask, 'taskId' | 'parentTaskId' | 'sortNo' | 'version'>>) => request.put(`/oa/project/wbs/tree?projectId=${projectId}`, data),

  removeWbs: (ids: number[]) => request.delete(`/oa/project/wbs/${ids.join(',')}`),

  addDependency: (data: ProjectDependency) => request.post('/oa/project/dependency', data),

  editDependency: (data: ProjectDependency) => request.put('/oa/project/dependency', data),

  removeDependency: (ids: number[]) => request.delete(`/oa/project/dependency/${ids.join(',')}`),

  edit: (data: Project) => request.put('/oa/project', data),

  submit: (id: number) => request.post(`/oa/project/submit/${id}`),

  snapshotBaseline: (id: number) => request.post(`/oa/project/${id}/baseline/snapshot`),

  archive: (id: number) => request.post(`/oa/project/archive/${id}`),

  remove: (ids: number[]) => request.delete(`/oa/project/${ids.join(',')}`),
};
