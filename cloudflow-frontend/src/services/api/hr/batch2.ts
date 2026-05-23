import request from '@/services/api/request';
import type { PageResult } from '@/types';

// ============================================================
// HR-P1-1 简历解析
// ============================================================
export type ResumeParsedStatus = 'PENDING' | 'CONFIRMED' | 'REJECTED';

export interface HrResumeParsedRecord {
  id: number;
  candidateId: number;
  resumeUrl?: string;
  parsedName?: string;
  parsedPhone?: string;
  parsedEmail?: string;
  parsedEducation?: string;
  parsedWorkExperience?: string;
  parsedSkills?: string;
  rawText?: string;
  status: ResumeParsedStatus;
  confidence?: number;
  reviewerId?: number;
  reviewerName?: string;
  reviewTime?: string;
  reviewRemark?: string;
  createTime?: string;
  updateTime?: string;
}

export interface HrResumeParsedFieldsPayload {
  parsedName?: string;
  parsedPhone?: string;
  parsedEmail?: string;
  parsedEducation?: string;
  parsedWorkExperience?: string;
  parsedSkills?: string;
}

export const hrResumeApi = {
  parse: (data: { candidateId?: number; resumeUrl?: string; rawText?: string }) =>
    request.post('/hr/recruitment/resume/parse', data) as Promise<number>,
  listParsed: (candidateId: number) =>
    request.get('/hr/recruitment/resume/parsed', { params: { candidateId } }) as Promise<HrResumeParsedRecord[]>,
  updateParsed: (id: number, payload: HrResumeParsedFieldsPayload) =>
    request.put(`/hr/recruitment/resume/parsed/${id}`, payload),
  confirmParsed: (id: number) =>
    request.post(`/hr/recruitment/resume/parsed/${id}/confirm`),
  rejectParsed: (id: number, reason?: string) =>
    request.post(`/hr/recruitment/resume/parsed/${id}/reject`, undefined, { params: { reason } }),
};

// ============================================================
// HR-P1-2 薪酬模拟
// ============================================================
export interface HrCompensationSimulateRequest {
  employeeId?: number;
  baseSalary?: number;
  positionLevel?: string;
  positionLevelId?: number;
  socialBaseAdjustment?: number;
  performanceBonus?: number;
  overrideItems?: Array<{ itemCode?: string; amount?: number }>;
}

export interface HrCompensationSimulateResult {
  baseSalary?: number;
  performanceBonus?: number;
  allowanceTotal?: number;
  grossSalary?: number;
  socialInsuranceTotal?: number;
  housingFund?: number;
  individualTax?: number;
  netSalary?: number;
  items?: Array<{ itemCode: string; itemName?: string; amount: number; calcType?: string }>;
}

export const hrCompensationSimulateApi = {
  simulate: (request_: HrCompensationSimulateRequest) =>
    request.post('/hr/compensation/simulate', request_) as Promise<HrCompensationSimulateResult>,
};

// ============================================================
// HR-P1-3 绩效面谈记录
// ============================================================
export type PerformanceInterviewStatus = 'DRAFT' | 'CONFIRMED';

export interface HrPerformanceInterview {
  id?: number;
  tenantId?: number;
  resultId?: number;
  employeeId?: number;
  employeeName?: string;
  interviewerId?: number;
  interviewerName?: string;
  hrWitnessId?: number;
  hrWitnessName?: string;
  interviewTime?: string;
  location?: string;
  consensus?: string;
  improvements?: string;
  status?: PerformanceInterviewStatus;
  createTime?: string;
  updateTime?: string;
}

export const hrPerformanceInterviewApi = {
  list: (params: { resultId?: number; employeeId?: number }) =>
    request.get('/hr/performance/interviews', { params }) as Promise<HrPerformanceInterview[]>,
  create: (payload: HrPerformanceInterview) =>
    request.post('/hr/performance/interviews', payload) as Promise<number>,
  update: (id: number, payload: HrPerformanceInterview) =>
    request.put(`/hr/performance/interviews/${id}`, payload),
  remove: (id: number) =>
    request.delete(`/hr/performance/interviews/${id}`),
  confirm: (id: number) =>
    request.post(`/hr/performance/interviews/${id}/confirm`),
};

// ============================================================
// HR-P1-4 考勤异常申诉
// ============================================================
export type AttendanceAppealStatus = 'DRAFT' | 'SUBMITTED' | 'MANAGER_REVIEWING' | 'HR_REVIEWING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
export type AttendanceAppealReason = 'FORGOT_CLOCK' | 'BUSINESS_TRIP' | 'EQUIPMENT_FAULT' | 'SYSTEM_ERROR' | 'OTHER';

export interface HrAttendanceAppeal {
  id?: number;
  tenantId?: number;
  employeeId?: number;
  employeeName?: string;
  attendanceDate?: string;
  recordId?: number;
  appealReason?: AttendanceAppealReason;
  appealDetail?: string;
  evidenceUrl?: string;
  expectedClockIn?: string;
  expectedClockOut?: string;
  status?: AttendanceAppealStatus;
  managerId?: number;
  managerRemark?: string;
  managerReviewTime?: string;
  hrId?: number;
  hrRemark?: string;
  hrReviewTime?: string;
  finalDecision?: 'ADJUST' | 'KEEP';
  workflowInstanceId?: string;
  createTime?: string;
  updateTime?: string;
}

export const hrAttendanceAppealApi = {
  page: (params: { pageNum?: number; pageSize?: number; status?: string; employeeName?: string }) =>
    request.get('/hr/attendance/appeals', { params }) as Promise<PageResult<HrAttendanceAppeal>>,
  detail: (id: number) =>
    request.get(`/hr/attendance/appeals/${id}`) as Promise<Record<string, unknown>>,
  submit: (payload: HrAttendanceAppeal) =>
    request.post('/hr/attendance/appeals', payload) as Promise<number>,
  managerReview: (id: number, params: { pass: boolean; remark?: string }) =>
    request.post(`/hr/attendance/appeals/${id}/manager-review`, undefined, { params }),
  hrReview: (id: number, params: { finalDecision: 'ADJUST' | 'KEEP'; remark?: string }) =>
    request.post(`/hr/attendance/appeals/${id}/hr-review`, undefined, { params }),
  cancel: (id: number) =>
    request.post(`/hr/attendance/appeals/${id}/cancel`),
};
