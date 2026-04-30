import request from '@/services/api/request';
import { PageResult } from '@/types';
import { getStoredAuthUser } from '@/utils/authStorage';

export interface DeptTreeNode {
  deptId: number;
  deptName: string;
  parentId?: number;
  children?: DeptTreeNode[];
}

export interface PostOption {
  postId: number;
  postName: string;
  postCode?: string;
  status?: number;
}

export interface PositionOption {
  id: number;
  positionId?: number;
  positionCode?: string;
  positionName: string;
  positionType?: string;
  positionLevel?: string;
  deptId?: number;
  deptName?: string;
  postId?: number;
  postName?: string;
  status?: number;
}

export interface HrEmployee {
  id: number;
  employeeNo: string;
  name: string;
  gender: string;
  birthDate?: string | null;
  phone?: string | null;
  email?: string | null;
  deptId?: number | null;
  deptName?: string | null;
  postId?: number | null;
  postName?: string | null;
  positionId?: number | null;
  positionName?: string | null;
  employeeType: string;
  employeeStatus: string;
  hireDate?: string | null;
  regularDate?: string | null;
  resignDate?: string | null;
  userId?: number | null;
  createTime?: string;
  updateTime?: string;
}

export interface HrEmployeePayload {
  employeeNo: string;
  name: string;
  gender: string;
  birthDate?: string | null;
  phone?: string | null;
  email?: string | null;
  deptId?: number | null;
  postId?: number | null;
  positionId?: number | null;
  employeeType: string;
  employeeStatus: string;
  hireDate?: string | null;
  regularDate?: string | null;
  resignDate?: string | null;
  userId?: number | null;
}

export interface EmergencyContact {
  id: number;
  employeeId: number;
  employeeName?: string | null;
  employeeNo?: string | null;
  contactName: string;
  relationship: string;
  relationshipName?: string | null;
  phone: string;
  address?: string | null;
  priority?: number | null;
  createTime?: string;
  updateTime?: string;
}

export interface EmergencyContactPayload {
  employeeId: number;
  contactName: string;
  relationship: string;
  phone: string;
  address?: string | null;
  priority?: number | null;
}

export interface EmergencyContactUpdatePayload {
  contactName?: string;
  relationship?: string;
  phone?: string;
  address?: string | null;
  priority?: number | null;
}

export interface HrPageQuery {
  pageNum?: number;
  pageSize?: number;
  [key: string]: string | number | boolean | undefined;
}

export const listEmployees = (params?: HrPageQuery) =>
  request.get<HrEmployee[]>('/hr/employee/list', { params });

export const getCurrentHrEmployee = () =>
  request.get<HrEmployee>('/hr/employee/current');

export const getEmployeeDetail = (id: number) =>
  request.get<HrEmployee>(`/hr/employee/${id}`);

export const createEmployee = (data: HrEmployeePayload) =>
  request.post<number>('/hr/employee', data);

export const updateEmployee = (id: number, data: Partial<HrEmployeePayload>) =>
  request.put<void>(`/hr/employee/${id}`, data);

export const listEmergencyContacts = (employeeId: number) =>
  request.get<EmergencyContact[]>(`/hr/employee/${employeeId}/emergency-contacts`);

export const getEmergencyContact = (id: number) =>
  request.get<EmergencyContact>(`/hr/employee/emergency-contact/${id}`);

export const createEmergencyContact = (data: EmergencyContactPayload) =>
  request.post<number>('/hr/employee/emergency-contact', data);

export const updateEmergencyContact = (id: number, data: EmergencyContactUpdatePayload) =>
  request.put<void>(`/hr/employee/emergency-contact/${id}`, data);

export const deleteEmergencyContact = (id: number) =>
  request.delete<void>(`/hr/employee/emergency-contact/${id}`);

export const getDeptTreeOptions = () =>
  request.get<DeptTreeNode[]>('/auth/system/dept/tree');

export const getPostOptions = () =>
  request.get<PageResult<PostOption>>('/auth/system/post/list');

export const getPositionOptions = (params?: HrPageQuery) =>
  request.get<PositionOption[]>('/hr/position/list', { params });

export interface HrLeaveTypeOption {
  id: number;
  leaveCode: string;
  leaveName: string;
  needQuota?: boolean;
  isPaid?: boolean;
  unit: string;
  status?: number;
}

export interface HrLeaveQuotaVO {
  id: number;
  employeeId: number;
  employeeName?: string;
  leaveTypeId: number;
  leaveTypeName?: string;
  year: number;
  totalQuota: number;
  usedQuota: number;
  frozenQuota: number;
  availableQuota: number;
  expiryDate?: string | null;
  createTime?: string;
  updateTime?: string;
}

export interface HrLeaveQuotaInitItem {
  leaveTypeId: number;
  leaveTypeName?: string;
  action: 'CREATED' | 'REFRESHED' | 'SKIPPED';
  message?: string;
  totalQuota?: number;
  expiryDate?: string | null;
}

export interface HrLeaveQuotaInitResult {
  employeeId: number;
  employeeName?: string;
  year: number;
  mode: 'SINGLE' | 'BATCH';
  requestedCount: number;
  createdCount: number;
  refreshedCount: number;
  skippedCount: number;
  items: HrLeaveQuotaInitItem[];
}

export interface HrLeaveQuotaAdjustPayload {
  employeeId: number;
  leaveTypeId: number;
  year: number;
  adjustmentAmount: number;
  expiryDate?: string | null;
  reason?: string;
}

export interface HrLeaveApplicationVO {
  id: number;
  applicationNo: string;
  employeeId: number;
  employeeName?: string;
  leaveTypeId: number;
  leaveTypeName?: string;
  startTime: string;
  endTime: string;
  duration: number;
  unit: string;
  periodType?: 'AM' | 'PM' | 'FULL_DAY' | string;
  reason?: string | null;
  status: string;
  processInstanceId?: string | null;
  createTime?: string;
  updateTime?: string;
}

export interface HrOvertimeApplicationVO {
  id: number;
  applicationNo: string;
  employeeId: number;
  employeeName?: string;
  employeeNo?: string;
  startTime: string;
  endTime: string;
  duration: number;
  overtimeType: string;
  overtimeTypeName?: string;
  reason?: string | null;
  compensationType: string;
  compensationTypeName?: string;
  compensationHours?: number | null;
  quotaAmount?: number | null;
  matchedSlots?: string | null;
  status: string;
  statusName?: string;
  processInstanceId?: string | null;
  createTime?: string;
  updateTime?: string;
}

const employeeResolverMap = new Map<string, Promise<HrEmployee>>();

const readStoredUser = (): Record<string, unknown> | null => {
  try {
    const raw = getStoredAuthUser();
    return raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
  } catch {
    return null;
  }
};

const readStoredUserId = () => {
  const storedUser = readStoredUser();
  return storedUser?.id ?? storedUser?.userId ?? storedUser?.user_id;
};

const getCurrentUserId = (userId?: number | string) => {
  const value = userId ?? readStoredUserId();
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error('未找到当前登录用户');
  }
  return parsed;
};

const getEmployeeCacheKey = (userId?: number | string) => {
  const storedUser = readStoredUser();
  return `hr:employee:${storedUser?.tenantId ?? 'default'}:${getCurrentUserId(userId)}`;
};

const readCachedEmployee = (cacheKey: string) => {
  const cached = sessionStorage.getItem(cacheKey);
  if (!cached) return null;
  try {
    return JSON.parse(cached) as HrEmployee;
  } catch {
    sessionStorage.removeItem(cacheKey);
    return null;
  }
};

const storeResolvedEmployee = (cacheKey: string, employee: HrEmployee) => {
  sessionStorage.setItem(cacheKey, JSON.stringify(employee));
  return employee;
};

const resolveEmployeeByUserId = async (targetUserId: number) => {
  const employees = await listEmployees();
  const matched = employees.find((employee) => employee.userId === targetUserId);
  if (!matched) {
    throw new Error('当前登录用户未关联 HR 员工档案');
  }
  return matched;
};

const isCurrentSignedInUser = (userId?: number | string) => {
  if (userId == null) return true;
  const storedUserId = Number(readStoredUserId());
  if (!Number.isFinite(storedUserId) || storedUserId <= 0) return false;
  return Number(userId) === storedUserId;
};

export const resolveCurrentEmployee = async (userId?: number | string) => {
  const cacheKey = getEmployeeCacheKey(userId);
  const cached = readCachedEmployee(cacheKey);
  if (cached) return cached;

  if (!employeeResolverMap.has(cacheKey)) {
    const targetUserId = getCurrentUserId(userId);
    const promise = (async () => {
      if (isCurrentSignedInUser(userId)) {
        const employee = await getCurrentHrEmployee();
        return storeResolvedEmployee(cacheKey, employee);
      }

      const employee = await resolveEmployeeByUserId(targetUserId);
      return storeResolvedEmployee(cacheKey, employee);
    })().finally(() => {
      employeeResolverMap.delete(cacheKey);
    });
    employeeResolverMap.set(cacheKey, promise);
  }

  return employeeResolverMap.get(cacheKey)!;
};

export const resolveCurrentEmployeeId = async (userId?: number | string) =>
  (await resolveCurrentEmployee(userId)).id;

const HR_SELF_SERVICE_BLOCKED_STATUSES = new Set(['RESIGNED']);

export const getHrEmployeeStatusLabel = (status?: string | null) => {
  switch (String(status || '').toUpperCase()) {
    case 'REGULAR':
      return '正式员工';
    case 'RESIGNED':
      return '已离职';
    default:
      return status || '未知状态';
  }
};

export const isHrSelfServiceCreatableEmployee = (employee?: HrEmployee | null) =>
  !HR_SELF_SERVICE_BLOCKED_STATUSES.has(String(employee?.employeeStatus || '').toUpperCase());

export const getHrSelfServiceRestrictionMessage = (employee?: HrEmployee | null) => {
  if (!employee) {
    return '当前登录用户未关联 HR 员工档案，暂时无法发起 HR 自助登记，请联系 HR 完成员工档案绑定。';
  }

  if (isHrSelfServiceCreatableEmployee(employee)) {
    return '';
  }

  return `当前员工状态为“${getHrEmployeeStatusLabel(employee.employeeStatus)}”，不能再发起 HR 自助登记。`;
};

export const assertCurrentEmployeeCanStartSelfService = async (
  actionLabel: string,
  userId?: number | string,
) => {
  const employee = await resolveCurrentEmployee(userId);
  const restrictionMessage = getHrSelfServiceRestrictionMessage(employee);
  if (restrictionMessage) {
    throw new Error(`${restrictionMessage} 当前操作：${actionLabel}。`);
  }
  return employee;
};

export const listHrLeaveTypes = () =>
  request.get<HrLeaveTypeOption[]>('/hr/leave/type/list');

export const getHrLeaveQuota = (params: {
  employeeId: number;
  leaveTypeId: number;
  year: number;
}) => request.get<HrLeaveQuotaVO>('/hr/leave/quota', { params });

export const listHrLeaveQuotaBuckets = (params: {
  employeeId: number;
  leaveTypeId: number;
  year: number;
}) => request.get<HrLeaveQuotaVO[]>('/hr/leave/quota/buckets', { params });

export const listHrLeaveQuotas = (params: {
  employeeId: number;
  year: number;
}) => request.get<HrLeaveQuotaVO[]>('/hr/leave/quota/list', { params });

export const initHrLeaveQuota = (params: {
  employeeId: number;
  year: number;
  leaveTypeId?: number;
}) => request.post<HrLeaveQuotaInitResult>('/hr/leave/quota/init', undefined, { params });

export const adjustHrLeaveQuota = (data: HrLeaveQuotaAdjustPayload) =>
  request.post<void>('/hr/leave/quota/adjust', data);

export const createHrLeaveApplication = (data: {
  employeeId: number;
  leaveTypeId: number;
  startTime: string;
  endTime: string;
  duration: number;
  unit: string;
  reason?: string;
}) => request.post<number>('/hr/leave/application', data);

export const submitHrLeaveApplication = (id: number) =>
  request.post<void>(`/hr/leave/application/${id}/submit`);

export const approveHrLeaveApplication = (id: number) =>
  request.post<void>(`/hr/leave/application/${id}/approve`);

export const rejectHrLeaveApplication = (id: number) =>
  request.post<void>(`/hr/leave/application/${id}/reject`);

export const cancelHrLeaveApplication = (id: number) =>
  request.post<void>(`/hr/leave/application/${id}/cancel`);

export const getHrLeaveApplication = (id: number) =>
  request.get<HrLeaveApplicationVO>(`/hr/leave/application/${id}`);

export const listHrLeaveApplications = (params?: {
  employeeId?: number;
  leaveTypeId?: number;
  status?: string;
  startTimeFrom?: string;
  startTimeTo?: string;
  pageNum?: number;
  pageSize?: number;
}) => request.get<{ records?: HrLeaveApplicationVO[]; total?: number; current?: number; size?: number }>(
  '/hr/leave/application/page',
  { params },
);

export const listHrApprovedLeaveBoard = (params?: {
  startDate?: string;
  endDate?: string;
}) => listHrLeaveApplications({
  status: 'APPROVED',
  startTimeFrom: params?.startDate,
  startTimeTo: params?.endDate,
  pageNum: 1,
  pageSize: 1000,
}).then((page) => page.records || []);

export const createHrOvertimeApplication = (data: {
  employeeId: number;
  startTime: string;
  endTime: string;
  overtimeType: string;
  reason?: string;
  compensationType: string;
}) => request.post<number>('/hr/overtime/applications', data);

export const updateHrOvertimeApplication = (id: number, data: {
  employeeId: number;
  startTime: string;
  endTime: string;
  overtimeType: string;
  reason?: string;
  compensationType: string;
}) => request.put<void>(`/hr/overtime/applications/${id}`, data);

export const deleteHrOvertimeApplication = (id: number) =>
  request.delete<void>(`/hr/overtime/applications/${id}`);

export const submitHrOvertimeApplication = (id: number) =>
  request.post<void>(`/hr/overtime/applications/${id}/submit`);

export const approveHrOvertimeApplication = (id: number) =>
  request.post<void>(`/hr/overtime/applications/${id}/approve`);

export const rejectHrOvertimeApplication = (id: number) =>
  request.post<void>(`/hr/overtime/applications/${id}/reject`);

export const cancelHrOvertimeApplication = (id: number) =>
  request.post<void>(`/hr/overtime/applications/${id}/cancel`);

export const getHrOvertimeApplication = (id: number) =>
  request.get<HrOvertimeApplicationVO>(`/hr/overtime/applications/${id}`);

export const listHrOvertimeApplications = (params?: {
  employeeId?: number;
  overtimeType?: string;
  status?: string;
  startTimeFrom?: string;
  startTimeTo?: string;
  pageNum?: number;
  pageSize?: number;
}) => request.get<HrOvertimeApplicationVO[]>('/hr/overtime/applications', { params });

export type HrPagedResult<T> = {
  total: number;
  rows?: T[];
  records?: T[];
  current?: number;
  size?: number;
  pages?: number;
};

export type HrRecord = Record<string, any>;

export interface RecruitmentRequest extends HrRecord {
  id: number;
  requestNo?: string;
  deptId?: number;
  deptName?: string;
  positionId?: number;
  positionName?: string;
  headcount?: number;
  status?: string;
  createTime?: string;
  updateTime?: string;
}

export interface RecruitmentRequestPayload extends HrRecord {
  deptId: number;
  positionId: number;
  headcount: number;
  requestReason?: string;
  expectedArrivalDate?: string;
}

export interface Candidate extends HrRecord {
  id: number;
  candidateNo?: string;
  name: string;
  phone?: string;
  email?: string;
  requestId?: number;
  positionId?: number;
  positionName?: string;
  status?: string;
  createTime?: string;
  updateTime?: string;
}

export interface CandidatePayload extends HrRecord {
  name: string;
  phone?: string;
  email?: string;
  requestId?: number;
  source?: string;
}

export interface Interview extends HrRecord {
  id: number;
  candidateId: number;
  candidateName?: string;
  interviewTime?: string;
  interviewerId?: number;
  interviewerName?: string;
  interviewRound?: string;
  status?: string;
}

export interface InterviewSchedulePayload extends HrRecord {
  candidateId: number;
  interviewTime: string;
  interviewerId?: number;
  interviewRound?: string;
  interviewType?: string;
}

export interface Offer extends HrRecord {
  id: number;
  offerNo?: string;
  candidateId: number;
  candidateName?: string;
  positionId?: number;
  positionName?: string;
  salary?: number;
  status?: string;
  expectedArrivalDate?: string;
}

export interface OfferPayload extends HrRecord {
  candidateId: number;
  positionId?: number;
  salary?: number;
  expectedArrivalDate?: string;
  offerContent?: string;
}

export interface OnboardingApplication extends HrRecord {
  id: number;
  applicationNo?: string;
  name: string;
  gender?: string;
  phone?: string;
  email?: string;
  deptId?: number;
  deptName?: string;
  postId?: number;
  postName?: string;
  positionId?: number;
  positionName?: string;
  status?: string;
  expectedDate?: string;
  onboardDate?: string;
}

export interface OnboardingApplicationPayload extends HrRecord {
  name: string;
  gender: string;
  phone: string;
  email?: string;
  deptId: number;
  postId: number;
  positionId?: number;
  expectedDate: string;
}

export interface OnboardingTask extends HrRecord {
  id: number;
  applicationId: number;
  taskName: string;
  taskType?: string;
  status?: string;
  completedTime?: string;
}

export interface EmployeeContract extends HrRecord {
  id: number;
  employeeId: number;
  contractType: string;
  contractNo: string;
  signDate: string;
  startDate: string;
  endDate: string;
  duration?: number | null;
  attachmentUrls?: string[] | null;
  status?: string | null;
  remainingDays?: number | null;
}

export interface EmployeeContractPayload extends HrRecord {
  employeeId?: number;
  contractType: string;
  contractNo: string;
  signDate: string;
  startDate: string;
  endDate: string;
  duration?: number | null;
  attachmentUrls?: string | string[] | null;
  status?: string | null;
}

export interface EmployeeDocument extends HrRecord {
  id: number;
  employeeId: number;
  documentType: string;
  documentNo: string;
  issueDate?: string | null;
  expiryDate?: string | null;
  attachmentUrls?: string[] | null;
}

export interface EmployeeDocumentPayload extends HrRecord {
  employeeId?: number;
  documentType: string;
  documentNo: string;
  issueDate?: string | null;
  expiryDate?: string | null;
  attachmentUrls?: string | string[] | null;
}

export type HeadcountTargetType = 'DEPT' | 'POST' | string;

export interface Headcount extends HrRecord {
  id: number;
  targetType: HeadcountTargetType;
  targetId: number;
  targetName?: string;
  approvedCount: number;
  actualCount: number;
  vacancyCount: number;
  effectiveDate?: string;
  expiryDate?: string;
}

export interface HeadcountPayload extends HrRecord {
  targetType: HeadcountTargetType;
  targetId: number;
  approvedCount: number;
  effectiveDate?: string;
  expiryDate?: string;
}

export interface HeadcountStatistics extends HrRecord {
  targetType: HeadcountTargetType;
  targetId: number;
  targetName?: string;
  approvedCount: number;
  actualCount: number;
  vacancyCount: number;
  utilizationRate?: number;
}

export interface ProbationConfirmation extends HrRecord {
  id: number;
  employeeId: number;
  employeeName?: string;
  status?: string;
  probationStartDate?: string;
  probationEndDate?: string;
  applyDate?: string;
}

export interface ProbationConfirmationPayload extends HrRecord {
  employeeId: number;
  probationStartDate?: string;
  probationEndDate?: string;
  selfEvaluation?: string;
}

export interface TransferApplication extends HrRecord {
  id: number;
  employeeId: number;
  employeeName?: string;
  fromDeptId?: number;
  fromDeptName?: string;
  toDeptId: number;
  toDeptName?: string;
  fromPostId?: number;
  fromPostName?: string;
  toPostId: number;
  toPostName?: string;
  toPositionId?: number;
  toPositionName?: string;
  transferType: string;
  reason?: string;
  effectiveDate?: string;
  salaryChange?: boolean;
  status?: string;
}

export interface TransferApplicationPayload extends HrRecord {
  employeeId: number;
  toDeptId: number;
  toPostId: number;
  toPositionId?: number;
  transferType: string;
  reason?: string;
  effectiveDate?: string;
  salaryChange?: boolean;
}

export interface ResignationApplication extends HrRecord {
  id: number;
  employeeId: number;
  employeeName?: string;
  resignationType: string;
  resignationReason?: string;
  expectedDate?: string;
  status?: string;
}

export interface ResignationApplicationPayload extends HrRecord {
  employeeId: number;
  resignationType: string;
  resignationReason?: string;
  expectedDate?: string;
}

export interface ResignationHandover extends HrRecord {
  id: number;
  applicationId: number;
  handoverType?: string;
  handoverContent?: string;
  status?: string;
}

export interface SalaryItem extends HrRecord {
  id: number;
  itemCode: string;
  itemName: string;
  itemType: string;
  category: string;
  calculationRule?: string;
  defaultAmount?: number;
  isTaxable?: boolean;
  status?: number;
}

export interface SalaryItemPayload extends HrRecord {
  itemCode: string;
  itemName: string;
  itemType: string;
  category: string;
  calculationRule?: string;
  defaultAmount?: number;
  isTaxable?: boolean;
  status?: number;
}

export interface SalaryStructure extends HrRecord {
  id: number;
  structureCode: string;
  structureName: string;
  description?: string;
  itemIds?: number[];
  status?: number;
}

export interface SalaryStructureDetail extends SalaryStructure {
  items?: SalaryItem[];
}

export interface SalaryStructurePayload extends HrRecord {
  structureCode: string;
  structureName: string;
  description?: string;
  itemIds?: number[];
  status?: number;
}

export interface SalaryGrade extends HrRecord {
  id?: number;
  levelId: number;
  levelCode?: string;
  levelName?: string;
  minSalary: number;
  maxSalary: number;
  medianSalary?: number;
}

export interface SalaryGradePayload extends HrRecord {
  levelId: number;
  minSalary: number;
  maxSalary: number;
  medianSalary?: number;
}

export interface JobLevelOption extends HrRecord {
  id: number;
  levelCode: string;
  levelName: string;
  levelSeries?: string;
  levelRank?: number;
  status?: number;
}

export interface EmployeeSalary extends HrRecord {
  id?: number;
  employeeId: number;
  employeeName?: string;
  employeeNo?: string;
  structureId?: number;
  structureName?: string;
  structureCode?: string;
  totalSalary?: number;
  effectiveDate?: string;
  status?: string;
}

export interface EmployeeSalaryDetail extends EmployeeSalary {
  items?: Array<{
    itemId: number;
    itemCode?: string;
    itemName?: string;
    amount?: number;
    [key: string]: any;
  }>;
}

export interface EmployeeSalaryAssignPayload extends HrRecord {
  employeeId: number;
  structureId: number;
  effectiveDate?: string;
  salaryData: Record<string | number, number | string>;
}

export interface SalaryAdjustment extends HrRecord {
  id: number;
  applicationNo?: string;
  employeeId: number;
  employeeName?: string;
  employeeNo?: string;
  adjustmentType: string;
  adjustmentReason?: string;
  beforeTotal?: number;
  afterTotal?: number;
  effectiveDate?: string;
  status?: string;
}

export interface SalaryAdjustmentPayload extends HrRecord {
  employeeId: number;
  adjustmentType: string;
  adjustmentReason?: string;
  beforeTotal?: number;
  afterTotal?: number;
  effectiveDate?: string;
  afterSalaryData?: Record<string | number, number | string> | string;
}

export interface SalaryAdjustmentHistory extends HrRecord {
  id: number;
  employeeId: number;
  adjustmentId?: number;
  beforeTotal?: number;
  afterTotal?: number;
  effectiveDate?: string;
  status?: string;
}

export interface InsuranceScheme extends HrRecord {
  id: number;
  schemeName: string;
  city?: string;
  baseMin?: number;
  baseMax?: number;
  baseRule?: string;
  effectiveDate?: string;
  status?: number;
}

export interface InsuranceSchemePayload extends HrRecord {
  schemeName: string;
  city?: string;
  baseMin?: number;
  baseMax?: number;
  baseRule?: string;
  effectiveDate?: string;
  status?: number;
}

export interface EmployeeInsurance extends HrRecord {
  id?: number;
  employeeId: number;
  employeeName?: string;
  schemeId: number;
  schemeName?: string;
  base?: number;
  effectiveDate?: string;
  status?: string;
}

export interface EmployeeInsuranceDetail extends EmployeeInsurance {
  companyTotal?: number;
  personalTotal?: number;
  totalAmount?: number;
}

export interface EmployeeInsuranceAssignPayload extends HrRecord {
  employeeId: number;
  schemeId: number;
  base: number;
  effectiveDate?: string;
}

export interface InsuranceCalculation extends HrRecord {
  employeeId?: number;
  base?: number;
  companyTotal?: number;
  personalTotal?: number;
  totalAmount?: number;
}

export interface TaxConfig extends HrRecord {
  id: number;
  threshold: number;
  effectiveDate?: string;
  taxBrackets?: string;
  deductionItems?: string;
  status?: number;
}

export interface TaxConfigPayload extends HrRecord {
  threshold: number;
  effectiveDate?: string;
  taxBrackets?: string;
  deductionItems?: string;
  status?: number;
}

export interface EmployeeTaxDeduction extends HrRecord {
  id: number;
  employeeId: number;
  deductionType: string;
  deductionTypeName?: string;
  amount: number;
  startDate?: string;
  endDate?: string;
  status?: string;
  remark?: string;
}

export interface EmployeeTaxDeductionPayload extends HrRecord {
  employeeId: number;
  deductionType: string;
  amount: number;
  startDate?: string;
  endDate?: string;
  status?: string;
  remark?: string;
}

export interface EmployeeTaxDeductionUpdatePayload extends HrRecord {
  deductionType?: string;
  amount?: number;
  startDate?: string;
  endDate?: string;
  status?: string;
  remark?: string;
}

export interface TaxCalculation extends HrRecord {
  employeeId?: number;
  taxableIncome?: number;
  taxAmount?: number;
  afterTaxIncome?: number;
  deductionAmount?: number;
}

export interface PerformanceMetric extends HrRecord {
  metricCode: string;
  metricName: string;
  metricUnit: string;
  valueType?: 'DECIMAL' | 'INTEGER' | 'PERCENT' | string;
  metricValueType?: 'DECIMAL' | 'INTEGER' | 'PERCENT' | string;
  precision?: number;
  metricPrecision?: number;
  metricWeight?: number;
}

export interface PerformanceCategoryDefinition extends HrRecord {
  categoryCode: string;
  categoryName: string;
}

export interface PerformanceAssignment extends HrRecord {
  id: number;
  objectiveId: number;
  parentId?: number;
  assigneeType: 'DEPT' | 'EMPLOYEE' | string;
  assigneeId?: number;
  assigneeName?: string;
  employeeId?: number;
  employeeName?: string;
  categoryCode?: string;
  categoryName?: string;
  metricCode?: string;
  metricName?: string;
  metricUnit?: string;
  metricWeight?: number;
  metricValueType?: string;
  metricPrecision?: number;
  targetAmount?: number;
  actualAmount?: number;
  completionRate?: number;
  quotaSource?: string;
  locked?: boolean;
  children?: PerformanceAssignment[];
}

export interface PerformanceObjective extends HrRecord {
  id: number;
  objectiveNo?: string;
  objectiveName: string;
  cycleName: string;
  cycleStartDate?: string;
  cycleEndDate?: string;
  totalTargetAmount?: number;
  scoreCap?: number;
  status: string;
  completionRate?: number;
  categoryCodes?: string[];
  categoryDefinitions?: PerformanceCategoryDefinition[];
  metrics?: PerformanceMetric[];
  assignments?: PerformanceAssignment[];
}

export interface PerformanceOverview extends HrRecord {
  objectiveCount?: number;
  activeObjectiveCount?: number;
  completedObjectiveCount?: number;
  averageCompletionRate?: number;
}

export interface HrShift extends HrRecord {
  id: number;
  shiftCode: string;
  shiftName: string;
  startTime: string;
  endTime: string;
  breakMinutes?: number;
  lateThreshold?: number;
  earlyThreshold?: number;
  color?: string;
  status?: number;
}

export interface HrScheduleRule extends HrRecord {
  id: number;
  ruleName: string;
  ruleType: string;
  ruleConfig?: string;
  description?: string;
  status?: number;
}

export interface HrAttendanceRecord extends HrRecord {
  id: number;
  employeeId: number;
  employeeName?: string;
  checkType?: string;
  checkTime?: string;
  checkMethod?: string;
  location?: string;
  latitude?: number;
  longitude?: number;
  status?: string;
  remark?: string;
}

export interface HrAttendanceMonthly extends HrRecord {
  employeeId: number;
  year: number;
  month: number;
  workDays?: number;
  actualDays?: number;
  lateTimes?: number;
  earlyTimes?: number;
  absentDays?: number;
}

export const listRecruitmentRequests = (params?: HrRecord) =>
  request.get<HrPagedResult<RecruitmentRequest>>('/hr/recruitment-request/list', { params });
export const createRecruitmentRequest = (data: RecruitmentRequestPayload) =>
  request.post<number>('/hr/recruitment-request', data);
export const submitRecruitmentRequest = (id: number) =>
  request.post<void>(`/hr/recruitment-request/${id}/submit`);
export const approveRecruitmentRequest = (id: number) =>
  request.post<void>(`/hr/recruitment-request/${id}/approve`);
export const completeRecruitmentRequest = (id: number) =>
  request.post<void>(`/hr/recruitment-request/${id}/complete`);
export const cancelRecruitmentRequest = (id: number) =>
  request.post<void>(`/hr/recruitment-request/${id}/cancel`);

export const listCandidates = (params?: HrRecord) =>
  request.get<HrPagedResult<Candidate>>('/hr/candidate/list', { params });
export const getCandidate = (id: number) =>
  request.get<Candidate>(`/hr/candidate/${id}`);
export const createCandidate = (data: CandidatePayload) =>
  request.post<number>('/hr/candidate', data);
export const updateCandidateStatus = (id: number, status: string, rejectReason?: string) =>
  request.put<void>(`/hr/candidate/${id}/status`, undefined, { params: { status, rejectReason } });

export const listInterviews = (params?: HrRecord) =>
  request.get<Interview[]>('/hr/interview/list', { params });
export const scheduleInterview = (data: InterviewSchedulePayload) =>
  request.post<number>('/hr/interview/schedule', data);

export const listOffers = (params?: HrRecord) =>
  request.get<Offer[]>('/hr/offer/list', { params });
export const getOffer = (id: number) =>
  request.get<Offer>(`/hr/offer/${id}`);
export const createOffer = (data: OfferPayload) =>
  request.post<number>('/hr/offer', data);
export const submitOffer = (id: number) =>
  request.post<void>(`/hr/offer/${id}/submit`);
export const approveOffer = (id: number) =>
  request.post<void>(`/hr/offer/${id}/approve`);
export const sendOffer = (id: number) =>
  request.post<void>(`/hr/offer/${id}/send`);
export const acceptOffer = (id: number) =>
  request.post<void>(`/hr/offer/${id}/accept`);
export const rejectOffer = (id: number) =>
  request.post<void>(`/hr/offer/${id}/reject`);
export const convertOfferToOnboarding = (id: number) =>
  request.post<number>(`/hr/offer/${id}/convert-to-onboarding`);

export const listOnboardingApplications = (params?: { keyword?: string; status?: string }) =>
  request.get<OnboardingApplication[]>('/hr/onboarding/application/list', { params });
export const getOnboardingApplication = (id: number) =>
  request.get<OnboardingApplication>(`/hr/onboarding/application/${id}`);
export const getOnboardingTasks = (id: number) =>
  request.get<OnboardingTask[]>(`/hr/onboarding/application/${id}/tasks`);
export const createOnboardingApplication = (data: OnboardingApplicationPayload) =>
  request.post<number>('/hr/onboarding/application', data);
export const submitOnboardingApplication = (id: number) =>
  request.post<void>(`/hr/onboarding/application/${id}/submit`);
export const approveOnboarding = (id: number) =>
  request.post<void>(`/hr/onboarding/application/${id}/approve`);
export const rejectOnboarding = (id: number) =>
  request.post<void>(`/hr/onboarding/application/${id}/reject`);
export const completeOnboardingTask = (taskId: number, remark?: string) =>
  request.post<void>('/hr/onboarding/task/complete', { taskId, remark });
export const confirmOnboarding = (applicationId: number, actualDate: string) =>
  request.post<void>('/hr/onboarding/application/confirm', { applicationId, actualDate });

export const listEmployeeContracts = (employeeId: number) =>
  request.get<EmployeeContract[]>(`/hr/employee/${employeeId}/contracts`);
export const getEmployeeContract = (id: number) =>
  request.get<EmployeeContract>(`/hr/employee/contract/${id}`);
export const createEmployeeContract = (data: EmployeeContractPayload) =>
  request.post<number>('/hr/employee/contract', data);
export const updateEmployeeContract = (id: number, data: Partial<EmployeeContractPayload>) =>
  request.put<void>(`/hr/employee/contract/${id}`, data);
export const deleteEmployeeContract = (id: number) =>
  request.delete<void>(`/hr/employee/contract/${id}`);

export const listEmployeeDocuments = (employeeId: number) =>
  request.get<EmployeeDocument[]>(`/hr/employee/${employeeId}/documents`);
export const getEmployeeDocument = (id: number) =>
  request.get<EmployeeDocument>(`/hr/employee/document/${id}`);
export const createEmployeeDocument = (data: EmployeeDocumentPayload) =>
  request.post<number>('/hr/employee/document', data);
export const updateEmployeeDocument = (id: number, data: Partial<EmployeeDocumentPayload>) =>
  request.put<void>(`/hr/employee/document/${id}`, data);
export const deleteEmployeeDocument = (id: number) =>
  request.delete<void>(`/hr/employee/document/${id}`);

export const listHeadcounts = (params?: HrRecord) =>
  request.get<Headcount[]>('/hr/headcount/list', { params });
export const setHeadcount = (data: HeadcountPayload) =>
  request.post<void>('/hr/headcount/set', data);
export const getHeadcountStatistics = (targetType: string, targetId: number) =>
  request.get<HeadcountStatistics>('/hr/headcount/statistics', { params: { targetType, targetId } });
export const updateHeadcountActualCount = (targetType: string, targetId: number, actualCount: number) =>
  request.put<void>('/hr/headcount/actual-count', undefined, { params: { targetType, targetId, actualCount } });

export const createProbationConfirmation = (data: ProbationConfirmationPayload) =>
  request.post<number>('/hr/probation-confirmation', data);
export const submitProbationConfirmation = (id: number) =>
  request.post<void>(`/hr/probation-confirmation/${id}/submit`);
export const approveProbationConfirmation = (id: number) =>
  request.post<void>(`/hr/probation-confirmation/${id}/approve`);
export const rejectProbationConfirmation = (id: number, reason: string, extensionDays?: number) =>
  request.post<void>(`/hr/probation-confirmation/${id}/reject`, undefined, { params: { reason, extensionDays } });
export const getProbationConfirmation = (id: number) =>
  request.get<ProbationConfirmation>(`/hr/probation-confirmation/${id}`);
export const listProbationByEmployee = (employeeId: number) =>
  request.get<ProbationConfirmation[]>(`/hr/probation-confirmation/employee/${employeeId}`);
export const sendProbationReminders = () =>
  request.post<void>('/hr/probation-confirmation/send-reminders');

export const createTransferApplication = (data: TransferApplicationPayload) =>
  request.post<number>('/hr/transfer', data);
export const submitTransferApplication = (id: number) =>
  request.post<void>(`/hr/transfer/${id}/submit`);
export const approveTransfer = (id: number) =>
  request.post<void>(`/hr/transfer/${id}/approve`);
export const effectiveTransfer = (id: number) =>
  request.post<void>(`/hr/transfer/${id}/effective`);
export const getTransferApplication = (id: number) =>
  request.get<TransferApplication>(`/hr/transfer/${id}`);
export const listTransferByEmployee = (employeeId: number) =>
  request.get<TransferApplication[]>(`/hr/transfer/employee/${employeeId}`);

export const createResignationApplication = (data: ResignationApplicationPayload) =>
  request.post<number>('/hr/resignation', data);
export const submitResignationApplication = (id: number) =>
  request.post<void>(`/hr/resignation/${id}/submit`);
export const approveResignation = (id: number) =>
  request.post<void>(`/hr/resignation/${id}/approve`);
export const conductExitInterview = (id: number, interviewContent: string) =>
  request.post<void>(`/hr/resignation/${id}/interview`, interviewContent);
export const completeResignationHandover = (handoverId: number, remark?: string) =>
  request.post<void>('/hr/resignation/handover/complete', { handoverId, remark });
export const confirmResignation = (applicationId: number, actualDate: string) =>
  request.post<void>('/hr/resignation/confirm', { applicationId, actualDate });
export const getResignationApplication = (id: number) =>
  request.get<ResignationApplication>(`/hr/resignation/${id}`);
export const listResignationByEmployee = (employeeId: number) =>
  request.get<ResignationApplication[]>(`/hr/resignation/employee/${employeeId}`);
export const listResignationHandovers = (applicationId: number) =>
  request.get<ResignationHandover[]>(`/hr/resignation/${applicationId}/handovers`);

export const listSalaryItems = () =>
  request.get<SalaryItem[]>('/hr/salary/item/list');
export const createSalaryItem = (data: SalaryItemPayload) =>
  request.post<number>('/hr/salary/item', data);
export const updateSalaryItem = (id: number, data: Partial<SalaryItemPayload>) =>
  request.put<void>(`/hr/salary/item/${id}`, data);
export const deleteSalaryItem = (id: number) =>
  request.delete<void>(`/hr/salary/item/${id}`);

export const listSalaryStructures = () =>
  request.get<SalaryStructure[]>('/hr/salary/structure/list');
export const getSalaryStructure = (id: number) =>
  request.get<SalaryStructureDetail>(`/hr/salary/structure/${id}`);
export const createSalaryStructure = (data: SalaryStructurePayload) =>
  request.post<number>('/hr/salary/structure', data);
export const updateSalaryStructure = (id: number, data: Partial<SalaryStructurePayload>) =>
  request.put<void>(`/hr/salary/structure/${id}`, data);
export const deleteSalaryStructure = (id: number) =>
  request.delete<void>(`/hr/salary/structure/${id}`);

export const listSalaryGrades = () =>
  request.get<SalaryGrade[]>('/hr/salary/grade/list');
export const setSalaryGrade = (data: SalaryGradePayload) =>
  request.post<void>('/hr/salary/grade', data);
export const deleteSalaryGrade = (levelId: number) =>
  request.delete<void>(`/hr/salary/grade/level/${levelId}`);

export const listJobLevels = (params?: { levelSeries?: string }) =>
  request.get<JobLevelOption[]>('/hr/job-level/list', { params });

export const assignSalaryStructure = (data: EmployeeSalaryAssignPayload) =>
  request.post<void>('/hr/salary/employee', data);
export const getEmployeeSalary = (employeeId: number) =>
  request.get<EmployeeSalaryDetail>(`/hr/salary/employee/${employeeId}`);
export const listEmployeeSalaries = (params?: HrRecord) =>
  request.get<EmployeeSalary[]>('/hr/salary/employee/list', { params });

export const createSalaryAdjustment = (data: SalaryAdjustmentPayload) =>
  request.post<number>('/hr/salary/adjustment', data);
export const submitSalaryAdjustment = (id: number) =>
  request.post<void>(`/hr/salary/adjustment/${id}/submit`);
export const approveSalaryAdjustment = (id: number) =>
  request.post<void>(`/hr/salary/adjustment/${id}/approve`);
export const effectiveSalaryAdjustment = (id: number) =>
  request.post<void>(`/hr/salary/adjustment/${id}/effective`);
export const getSalaryAdjustment = (id: number) =>
  request.get<SalaryAdjustment>(`/hr/salary/adjustment/${id}`);
export const listSalaryAdjustments = (params?: HrRecord) =>
  request.get<HrPagedResult<SalaryAdjustment>>('/hr/salary/adjustment/list', { params });
export const getSalaryAdjustmentHistory = (employeeId: number) =>
  request.get<SalaryAdjustmentHistory[]>(`/hr/salary/adjustment/history/${employeeId}`);

export const listInsuranceSchemes = () =>
  request.get<InsuranceScheme[]>('/hr/insurance/scheme/list');
export const createInsuranceScheme = (data: InsuranceSchemePayload) =>
  request.post<number>('/hr/insurance/scheme', data);
export const updateInsuranceScheme = (id: number, data: Partial<InsuranceSchemePayload>) =>
  request.put<void>(`/hr/insurance/scheme/${id}`, data);
export const assignInsuranceScheme = (data: EmployeeInsuranceAssignPayload) =>
  request.post<void>('/hr/insurance/employee', data);
export const getEmployeeInsurance = (employeeId: number) =>
  request.get<EmployeeInsuranceDetail>(`/hr/insurance/employee/${employeeId}`);
export const listEmployeeInsurances = (params?: HrRecord) =>
  request.get<HrPagedResult<EmployeeInsurance>>('/hr/insurance/employee/list', { params });
export const calculateEmployeeInsurance = (employeeId: number, salary?: number) =>
  request.get<InsuranceCalculation>(`/hr/insurance/employee/${employeeId}/calculate`, { params: { salary } });

export const createTaxConfig = (data: TaxConfigPayload) =>
  request.post<number>('/hr/tax/config', data);
export const updateTaxConfig = (id: number, data: Partial<TaxConfigPayload>) =>
  request.put<void>(`/hr/tax/config/${id}`, data);
export const getCurrentTaxConfig = () =>
  request.get<TaxConfig>('/hr/tax/config/current');
export const addTaxDeduction = (data: EmployeeTaxDeductionPayload) =>
  request.post<number>('/hr/tax/deduction', data);
export const updateTaxDeduction = (id: number, data: EmployeeTaxDeductionUpdatePayload) =>
  request.put<void>(`/hr/tax/deduction/${id}`, data);
export const deleteTaxDeduction = (id: number) =>
  request.delete<void>(`/hr/tax/deduction/${id}`);
export const listTaxDeductions = (employeeId: number) =>
  request.get<EmployeeTaxDeduction[]>(`/hr/tax/deduction/employee/${employeeId}`);
export const listActiveTaxDeductions = (employeeId: number, year: number, month: number) =>
  request.get<EmployeeTaxDeduction[]>(`/hr/tax/deduction/employee/${employeeId}/active`, { params: { year, month } });
export const calculateTax = (data: HrRecord) =>
  request.post<TaxCalculation>('/hr/tax/calculate', data);

export const createPerformanceObjective = (data: HrRecord) =>
  request.post<number>('/hr/performance/objective', data);
export const listPerformanceObjectives = (params?: HrRecord) =>
  request.get<HrPagedResult<PerformanceObjective>>('/hr/performance/objective/list', { params });
export const getPerformanceObjectiveTree = (id: number) =>
  request.get<PerformanceObjective>(`/hr/performance/objective/${id}/tree`);
export const getPerformanceOverview = () =>
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

export const hrCheckIn = (data: HrRecord) =>
  request.post<void>('/hr/attendance/check-in', data);
export const hrCheckOut = (data: HrRecord) =>
  request.post<void>('/hr/attendance/check-out', data);
export const listHrAttendanceRecords = (params?: HrRecord) =>
  request.get<HrAttendanceRecord[]>('/hr/attendance/records', { params });
export const getHrAttendanceMonthly = (employeeId: number, year: number, month: number) =>
  request.get<HrAttendanceMonthly>(`/hr/attendance/statistics/monthly/${employeeId}`, { params: { year, month } });
export const listHrShifts = () =>
  request.get<HrShift[]>('/hr/schedule/shift/list');
export const createHrShift = (data: Omit<HrShift, 'id'> & HrRecord) =>
  request.post<number>('/hr/schedule/shift', data);
export const updateHrShift = (id: number, data: Partial<HrShift>) =>
  request.put<void>(`/hr/schedule/shift/${id}`, data);
export const listHrScheduleRules = () =>
  request.get<HrScheduleRule[]>('/hr/schedule/rule/list');
export const createHrScheduleRule = (data: Omit<HrScheduleRule, 'id'> & HrRecord) =>
  request.post<number>('/hr/schedule/rule', data);
export const updateHrScheduleRule = (id: number, data: Partial<HrScheduleRule>) =>
  request.put<void>(`/hr/schedule/rule/${id}`, data);
