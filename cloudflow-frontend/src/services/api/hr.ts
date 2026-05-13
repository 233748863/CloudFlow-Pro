import request from '@/services/api/request';
import { PageResult } from '@/types';
import { getStoredAuthUser } from '@/utils/authStorage';

export type HrRecord = Record<string, any>;

export type HrPagedResult<T> = {
  total: number;
  rows?: T[];
  records?: T[];
  current?: number;
  size?: number;
  pages?: number;
};

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

export interface PositionOption extends HrRecord {
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

export interface HrEmployee extends HrRecord {
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

export interface HrEmployeePayload extends HrRecord {
  employeeNo: string;
  name: string;
  gender: string;
  employeeType: string;
  employeeStatus: string;
}

export interface EmergencyContact extends HrRecord {
  id: number;
  employeeId: number;
  contactName: string;
  relationship: string;
  phone: string;
}

export interface EmergencyContactPayload extends HrRecord {
  employeeId: number;
  contactName: string;
  relationship: string;
  phone: string;
}

export type EmergencyContactUpdatePayload = Partial<EmergencyContactPayload>;

export interface HrPageQuery {
  pageNum?: number;
  pageSize?: number;
  [key: string]: string | number | boolean | undefined;
}

export interface HrLeaveTypeOption extends HrRecord {
  id: number;
  leaveCode: string;
  leaveName: string;
  needQuota?: boolean;
  isPaid?: boolean;
  unit: string;
  status?: number;
}

export interface HrLeaveQuotaVO extends HrRecord {
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
}

export interface HrLeaveQuotaInitItem extends HrRecord {
  leaveTypeId: number;
  leaveTypeName?: string;
  action: 'CREATED' | 'REFRESHED' | 'SKIPPED';
  message?: string;
  totalQuota?: number;
  expiryDate?: string | null;
}

export interface HrLeaveQuotaInitResult extends HrRecord {
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

export interface HrLeaveQuotaAdjustPayload extends HrRecord {
  employeeId: number;
  leaveTypeId: number;
  year: number;
  adjustmentAmount: number;
  expiryDate?: string | null;
  reason?: string;
}

export interface HrLeaveApplicationVO extends HrRecord {
  id: number;
  applicationNo?: string;
  requestNo?: string;
  employeeId: number;
  leaveTypeId?: number;
  startTime: string;
  endTime: string;
  duration: number;
  unit: string;
  reason?: string | null;
  status: string;
}

export interface HrOvertimeApplicationVO extends HrRecord {
  id: number;
  applicationNo?: string;
  requestNo?: string;
  employeeId: number;
  startTime: string;
  endTime: string;
  duration: number;
  overtimeType?: string;
  reason?: string | null;
  compensationType?: string;
  status: string;
}

export interface RecruitmentRequest extends HrRecord {
  id: number;
  requestNo?: string;
  requisitionNo?: string;
  title?: string;
  deptId?: number;
  deptName?: string;
  positionId?: number;
  positionName?: string;
  headcount?: number;
  status?: string;
  statusDesc?: string;
  expectedDate?: string;
  expectedArrivalDate?: string;
  jobRequirements?: string;
  requirements?: string;
  createTime?: string;
  updateTime?: string;
}

export interface RecruitmentRequestPayload extends HrRecord {
  deptId: number;
  positionId: number;
  headcount: number;
}

export interface Candidate extends HrRecord {
  id: number;
  candidateNo?: string;
  name: string;
  phone?: string;
  email?: string;
  resumeAttachmentUrls?: string[] | string;
  requestId?: number;
  requisitionId?: number;
  deptId?: number;
  deptName?: string;
  positionId?: number;
  positionName?: string;
  source?: string;
  sourceDesc?: string;
  status?: string;
  statusDesc?: string;
  createTime?: string;
  updateTime?: string;
}

export interface CandidatePayload extends HrRecord {
  name: string;
  phone?: string;
  email?: string;
  requestId?: number;
  requisitionId?: number;
  source?: string;
  resumeAttachmentUrls?: string[] | string;
}

export interface Interview extends HrRecord {
  id: number;
  candidateId: number;
  candidateName?: string;
  interviewTime?: string;
  interviewEndTime?: string;
  interviewerId?: number;
  interviewerName?: string;
  interviewerIds?: number[];
  interviewerNames?: string[];
  interviewRound?: string;
  interviewType?: string;
  location?: string;
  meetingRoomName?: string;
  interviewRoundName?: string;
  interviewTypeName?: string;
  statusName?: string;
  statusDesc?: string;
  status?: string;
}

export interface InterviewSchedulePayload extends HrRecord {
  candidateId: number;
  interviewTime: string;
  interviewEndTime: string;
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
  expectedDate?: string;
  expireDate?: string;
  expiryDate?: string;
  statusDesc?: string;
}

export interface OfferPayload extends HrRecord {
  candidateId: number;
  positionId?: number;
  salary?: number;
  expectedArrivalDate?: string;
  expectedDate?: string;
  expireDate?: string;
  expiryDate?: string;
  offerContent?: string;
}

export interface OnboardingApplication extends HrRecord {
  id: number;
  applicationNo?: string;
  type?: string;
  name: string;
  employeeId?: number;
  candidateId?: number;
  deptId?: number;
  postId?: number;
  positionId?: number;
  status?: string;
  statusDesc?: string;
  expectedDate?: string;
  effectiveDate?: string;
  onboardDate?: string;
}

export interface OnboardingApplicationPayload extends HrRecord {
  name: string;
  gender?: string;
  phone?: string;
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
  attachmentUrls?: string[] | string | null;
  status?: string | null;
}

export interface EmployeeContractPayload extends HrRecord {
  employeeId?: number;
  contractType: string;
  contractNo: string;
  signDate: string;
  startDate: string;
  endDate: string;
}

export interface EmployeeDocument extends HrRecord {
  id: number;
  employeeId: number;
  documentType: string;
  documentNo: string;
  issueDate?: string | null;
  expiryDate?: string | null;
  attachmentUrls?: string[] | string | null;
}

export interface EmployeeDocumentPayload extends HrRecord {
  employeeId?: number;
  documentType: string;
  documentNo: string;
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
  targetType?: HeadcountTargetType;
  targetId?: number;
  targetName?: string;
  approvedCount: number;
  actualCount: number;
  vacancyCount: number;
  utilizationRate?: number;
}

export interface ProbationConfirmation extends HrRecord {
  id: number;
  applicationNo?: string;
  employeeId: number;
  status?: string;
}

export interface ProbationConfirmationPayload extends HrRecord {
  employeeId: number;
}

export interface TransferApplication extends HrRecord {
  id: number;
  applicationNo?: string;
  employeeId: number;
  status?: string;
}

export interface TransferApplicationPayload extends HrRecord {
  employeeId: number;
}

export interface ResignationApplication extends HrRecord {
  id: number;
  applicationNo?: string;
  employeeId: number;
  status?: string;
}

export interface ResignationApplicationPayload extends HrRecord {
  employeeId: number;
}

export interface ResignationHandover extends HrRecord {
  id: number;
  applicationId: number;
  taskName?: string;
  status?: string;
}

export interface SalaryItem extends HrRecord {
  id: number;
  itemCode?: string;
  componentCode?: string;
  itemName?: string;
  componentName?: string;
  itemType?: string;
  componentType?: string;
  category?: string;
  isTaxable?: boolean;
  taxable?: boolean;
  status?: number;
}

export type SalaryItemPayload = HrRecord;

export interface SalaryStructure extends HrRecord {
  id: number;
  structureCode: string;
  structureName: string;
  description?: string;
  status?: number;
}

export interface SalaryStructureDetail extends SalaryStructure {
  items?: SalaryItem[];
}

export interface SalaryStructurePayload extends HrRecord {
  structureCode: string;
  structureName: string;
  description?: string;
  itemIds: number[];
  status?: number;
}

export interface SalaryGrade extends HrRecord {
  id: number;
  gradeCode?: string;
  gradeName?: string;
  levelId?: number;
  minSalary: number;
  maxSalary: number;
  midSalary: number;
  currency?: string;
}

export type SalaryGradePayload = HrRecord;

export interface JobLevelOption extends HrRecord {
  id: number;
  levelCode: string;
  levelName: string;
  levelSeries: string;
  levelRank: number;
}

export interface EmployeeSalary extends HrRecord {
  id: number;
  employeeId: number;
  structureId?: number;
  totalSalary: number;
  status?: string;
}

export interface EmployeeSalaryDetail extends EmployeeSalary {
  componentValues?: HrRecord;
  items?: Array<{
    itemId?: number;
    id?: number;
    amount?: number | string | null;
  } & HrRecord>;
}

export type EmployeeSalaryAssignPayload = HrRecord;

export interface SalaryAdjustment extends HrRecord {
  id: number;
  applicationNo?: string;
  changeNo?: string;
  employeeId: number;
  beforeTotal?: number;
  afterTotal?: number;
  adjustmentAmount?: number;
  changeAmount?: number;
  status?: string;
}

export type SalaryAdjustmentPayload = HrRecord;
export type SalaryAdjustmentHistory = SalaryAdjustment;

export interface InsuranceScheme extends HrRecord {
  id: number;
  schemeCode?: string;
  schemeName: string;
  city?: string;
  status?: number;
}

export type InsuranceSchemePayload = HrRecord;

export interface EmployeeInsurance extends HrRecord {
  id: number;
  employeeId: number;
  schemeId: number;
  base?: number;
  baseAmount?: number;
  status?: string;
}

export type EmployeeInsuranceDetail = EmployeeInsurance;
export type EmployeeInsuranceAssignPayload = HrRecord;
export type InsuranceCalculation = HrRecord;

export interface TaxConfig extends HrRecord {
  id?: number;
  threshold?: number;
}

export type TaxConfigPayload = HrRecord;

export interface EmployeeTaxDeduction extends HrRecord {
  id: number;
  employeeId: number;
  deductionType: string;
  amount: number;
  startDate: string;
  endDate?: string;
  status?: string;
}

export type EmployeeTaxDeductionPayload = HrRecord;
export type EmployeeTaxDeductionUpdatePayload = HrRecord;
export type TaxCalculation = HrRecord;

export interface PerformanceMetric extends HrRecord {
  metric?: string;
  metricCode?: string;
  metricName?: string;
  metricUnit?: string;
  metricWeight?: number;
  precision?: number | string | null;
  valueType?: 'DECIMAL' | 'INTEGER' | 'PERCENT' | string;
  weight?: number;
}

export interface PerformanceCategoryDefinition extends HrRecord {
  categoryCode?: string;
  categoryName?: string;
}

export interface PerformanceAssignment extends HrRecord {
  id: number;
  objectiveId: number;
  parentId?: number;
  categoryCode?: string;
  categoryName?: string;
  metricCode?: string;
  metricName?: string;
  metricUnit?: string;
  metricWeight?: number;
  metricPrecision?: number | string | null;
  metricValueType?: 'DECIMAL' | 'INTEGER' | 'PERCENT' | string | null;
  targetAmount?: number;
  actualAmount?: number;
  completionRate?: number;
  score?: number;
  grade?: string;
  quotaSource?: string;
  assigneeType: string;
  assigneeId: number;
  assigneeName?: string;
  targetValue?: number;
  actualValue?: number;
  locked?: boolean;
  status?: string;
  children?: PerformanceAssignment[];
}

export interface PerformanceObjective extends HrRecord {
  id: number;
  objectiveNo?: string;
  cycleName: string;
  cycleStartDate: string;
  cycleEndDate: string;
  objectiveName: string;
  totalTargetAmount?: number;
  actualAmount?: number;
  completionRate?: number;
  score?: number;
  grade?: string;
  scoreCap?: number;
  categoryCodes?: string[];
  categoryDefinitions?: PerformanceCategoryDefinition[];
  metrics?: PerformanceMetric[];
  leafTaskCount?: number;
  departmentCount?: number;
  status?: string;
  assignments?: PerformanceAssignment[];
}

export interface PerformanceOverview extends HrRecord {
  draftCount?: number;
  planApprovingCount?: number;
  objectiveCount?: number;
  runningCount?: number;
  resultApprovingCount?: number;
  completedCount?: number;
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
  workMinutes?: number;
  color?: string;
  status?: number;
}

export interface HrScheduleRule extends HrRecord {
  id: number;
  ruleCode?: string;
  ruleName: string;
  ruleType: string;
  ruleConfig?: string;
  configJson?: string;
  description?: string;
  status?: number;
}

export interface AttendanceRuleConfig {
  shiftId?: number;
  workDays?: number[];
  checkMethods?: string[];
  [key: string]: any;
}

export interface AttendanceRuleAssignment extends HrRecord {
  id: number;
  ruleId: number;
  targetType: 'DEPT' | 'POST' | 'EMPLOYEE';
  targetId: number;
  targetName?: string;
  effectiveStart: string;
  effectiveEnd?: string;
  status?: number | string;
}

export interface WorkCalendarDay extends HrRecord {
  id: number;
  calendarDate: string;
  dayType: 'WORKDAY' | 'REST' | 'HOLIDAY';
  dayName?: string;
  status?: number;
}

export interface EffectiveAttendanceRule {
  ruleId: number;
  ruleName: string;
  ruleType: string;
  sourceType?: 'DEFAULT' | 'DEPT' | 'POST' | 'EMPLOYEE' | string;
  sourceTargetName?: string;
  dayType?: 'WORKDAY' | 'REST' | 'HOLIDAY' | string;
  shiftId?: number;
  shiftName?: string;
  checkInTime?: string;
  checkOutTime?: string;
  lateThreshold?: number;
  earlyThreshold?: number;
  overtimeEnabled?: boolean;
  overtimeMinMinutes?: number;
  radius?: number;
  checkMethods?: string[];
}

export interface HrAttendanceRecord extends HrRecord {
  id: number;
  employeeId: number;
  employeeName?: string;
  checkType?: string;
  checkTime?: string;
  checkMethod?: string;
  location?: string;
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

export interface LifecycleApplication extends HrRecord {
  id: number;
  applicationNo: string;
  type: 'ONBOARDING' | 'PROBATION' | 'TRANSFER' | 'RESIGNATION' | string;
  employeeId?: number;
  candidateId?: number;
  name?: string;
  status?: string;
  statusDesc?: string;
  expectedDate?: string;
  effectiveDate?: string;
  onboardDate?: string;
  actualDate?: string;
}

const withList = <T>(value: T[] | HrPagedResult<T>) =>
  Array.isArray(value) ? value : (value.records || value.rows || []);

const normalizeJsonArray = (value: unknown) => {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    try {
      return JSON.parse(value);
    } catch {
      return value.split(',').map((item) => item.trim()).filter(Boolean);
    }
  }
  return value;
};

const normalizeStringArray = (value: unknown): string[] => {
  const normalized = normalizeJsonArray(value);
  if (Array.isArray(normalized)) {
    return normalized.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof normalized === 'string') {
    return normalized.split(',').map((item) => item.trim()).filter(Boolean);
  }
  return [];
};

const parseMaybeJson = <T = unknown>(value: unknown, fallback: T): T => {
  if (value == null || value === '') return fallback;
  if (typeof value !== 'string') return value as T;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

const normalizeSalaryItem = (item: SalaryItem): SalaryItem => ({
  ...item,
  itemCode: item.itemCode || item.componentCode,
  itemName: item.itemName || item.componentName,
  itemType: item.itemType || item.componentType,
  componentCode: item.componentCode || item.itemCode,
  componentName: item.componentName || item.itemName,
  componentType: item.componentType || item.itemType,
  isTaxable: item.isTaxable ?? item.taxable,
  taxable: item.taxable ?? item.isTaxable,
});

const normalizeSalaryStructure = (item: SalaryStructure): SalaryStructure => {
  const componentConfig = parseMaybeJson<{ itemIds?: number[] }>(item.componentConfig, {});
  return {
    ...item,
    itemIds: item.itemIds || componentConfig.itemIds || [],
  };
};

const normalizeEmployeeSalary = (item: EmployeeSalary): EmployeeSalary => ({
  ...item,
  salaryData: item.salaryData || item.componentValues || {},
});

const normalizeEmployeeSalaryDetail = async (item: EmployeeSalaryDetail): Promise<EmployeeSalaryDetail> => {
  if (!item) return {} as EmployeeSalaryDetail;
  const normalized = normalizeEmployeeSalary(item) as EmployeeSalaryDetail;
  const amountMap = parseMaybeJson<Record<string, number | string | null>>(normalized.salaryData, {});
  const structure = normalized.structureId ? await getSalaryStructure(normalized.structureId).catch(() => null) : null;
  return {
    ...normalized,
    items: (structure?.items || []).map((salaryItem) => ({
      ...salaryItem,
      itemId: salaryItem.id,
      amount: amountMap[String(salaryItem.id)] ?? null,
    })),
  };
};

const normalizeScheduleRule = (item: HrScheduleRule): HrScheduleRule => ({
  ...item,
  ruleConfig: item.ruleConfig || item.configJson || '{}',
});

const statusDescMap: Record<string, string> = {
  DRAFT: '草稿',
  APPROVING: '审批中',
  APPROVED: '已审批',
  RECRUITING: '招聘中',
  SCREENING: '筛选中',
  INTERVIEW: '面试中',
  OFFER: 'Offer阶段',
  SCHEDULED: '已排期',
  COMPLETED: '已完成',
  EFFECTIVE: '已生效',
  SENT: '已发送',
  ACCEPTED: '已接受',
  REJECTED: '已拒绝',
  CANCELLED: '已取消',
};

const sourceDescMap: Record<string, string> = {
  WEBSITE: '招聘网站',
  REFERRAL: '内部推荐',
  HEADHUNTER: '猎头',
  CAMPUS: '校园招聘',
};

const interviewRoundNameMap: Record<string, string> = {
  FIRST: '初试',
  SECOND: '复试',
  FINAL: '终试',
};

const interviewTypeNameMap: Record<string, string> = {
  VIDEO: '视频面试',
  PHONE: '电话面试',
  ONSITE: '现场面试',
};

const normalizeRecruitmentRequest = (item: RecruitmentRequest): RecruitmentRequest => ({
  ...item,
  requestNo: item.requestNo || item.requisitionNo,
  requisitionNo: item.requisitionNo || item.requestNo,
  expectedDate: item.expectedDate || item.expectedArrivalDate,
  expectedArrivalDate: item.expectedArrivalDate || item.expectedDate,
  jobRequirements: item.jobRequirements || item.requirements,
  requirements: item.requirements || item.jobRequirements,
  statusDesc: item.statusDesc || statusDescMap[String(item.status || '')] || item.status,
});

const normalizeCandidate = (item: Candidate): Candidate => ({
  ...item,
  requestId: item.requestId || item.requisitionId,
  requisitionId: item.requisitionId || item.requestId,
  statusDesc: item.statusDesc || statusDescMap[String(item.status || '')] || item.status,
  sourceDesc: item.sourceDesc || sourceDescMap[String(item.source || '')] || item.source,
});

const normalizeInterview = (item: Interview): Interview => ({
  ...item,
  interviewerIds: parseMaybeJson<number[]>(item.interviewerIds, []),
  interviewerNames: parseMaybeJson<string[]>(item.interviewerNames, []),
  interviewRoundName: item.interviewRoundName || interviewRoundNameMap[String(item.interviewRound || '')] || item.interviewRound,
  interviewTypeName: item.interviewTypeName || interviewTypeNameMap[String(item.interviewType || '')] || item.interviewType,
  meetingRoomName: item.meetingRoomName || item.location,
  statusName: item.statusName || item.statusDesc || statusDescMap[String(item.status || '')] || item.status,
});

const normalizeOffer = (item: Offer): Offer => ({
  ...item,
  expectedDate: item.expectedDate || item.expectedArrivalDate,
  expectedArrivalDate: item.expectedArrivalDate || item.expectedDate,
  expiryDate: item.expiryDate || item.expireDate,
  expireDate: item.expireDate || item.expiryDate,
  statusDesc: item.statusDesc || statusDescMap[String(item.status || '')] || item.status,
});

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

const normalizeLifecycleApplication = <T extends HrRecord>(item: T): T => ({
  ...item,
  expectedDate: item.expectedDate || item.onboardDate || item.effectiveDate,
  onboardDate: item.onboardDate || item.expectedDate || item.effectiveDate,
  effectiveDate: item.effectiveDate || item.expectedDate || item.onboardDate || item.actualDate,
  statusDesc: item.statusDesc || statusDescMap[String(item.status || '')] || item.status,
});

const normalizeEmployeeContract = (item: EmployeeContract): EmployeeContract => ({
  ...item,
  attachmentUrls: normalizeStringArray(item.attachmentUrls),
});

const normalizeEmployeeDocument = (item: EmployeeDocument): EmployeeDocument => ({
  ...item,
  attachmentUrls: normalizeStringArray(item.attachmentUrls),
});

const toRecruitmentPayload = (data: RecruitmentRequestPayload) => ({
  ...data,
  requisitionNo: data.requisitionNo || data.requestNo || `HRRQ${Date.now()}`,
  expectedArrivalDate: data.expectedArrivalDate || data.expectedDate,
  requirements: data.requirements || data.jobRequirements,
  title: data.title || '招聘需求',
});

const toCandidatePayload = (data: CandidatePayload) => ({
  ...data,
  requisitionId: data.requisitionId || data.requestId,
  requestId: undefined,
  candidateNo: data.candidateNo || `HRC${Date.now()}`,
  resumeAttachmentUrls: normalizeJsonArray(data.resumeAttachmentUrls),
});

const toOfferPayload = (data: OfferPayload) => ({
  ...data,
  offerNo: data.offerNo || `HROF${Date.now()}`,
  expectedArrivalDate: data.expectedArrivalDate || data.expectedDate,
  expireDate: data.expireDate || data.expiryDate,
});

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

const isCurrentSignedInUser = (userId?: number | string) => {
  if (userId == null) return true;
  const storedUserId = Number(readStoredUserId());
  if (!Number.isFinite(storedUserId) || storedUserId <= 0) return false;
  return Number(userId) === storedUserId;
};

const resolveEmployeeByUserId = async (targetUserId: number) => {
  const employees = await listEmployees();
  const matched = employees.find((employee) => employee.userId === targetUserId);
  if (!matched) {
    throw new Error('当前登录用户未关联 HR 员工档案');
  }
  return matched;
};

export const listEmployees = (params?: HrPageQuery) =>
  request.get<HrEmployee[]>('/hr/employees', { params });

export const getCurrentHrEmployee = () =>
  request.get<HrEmployee>('/hr/employees/current');

export const getEmployeeDetail = (id: number) =>
  request.get<HrEmployee>(`/hr/employees/${id}`);

export const createEmployee = (data: HrEmployeePayload) =>
  request.post<number>('/hr/employees', data);

export const updateEmployee = (id: number, data: Partial<HrEmployeePayload>) =>
  request.put<void>(`/hr/employees/${id}`, data);

export const listEmergencyContacts = (employeeId: number) =>
  request.get<EmergencyContact[]>(`/hr/employees/${employeeId}/emergency-contacts`);

export const getEmergencyContact = async (id: number) => {
  const employees = await listEmployees();
  const lists = await Promise.all(employees.map((employee) => listEmergencyContacts(employee.id).catch(() => [])));
  return lists.flat().find((item) => item.id === id) as EmergencyContact;
};

export const createEmergencyContact = (data: EmergencyContactPayload) =>
  request.post<number>('/hr/employees/emergency-contacts', data);

export const updateEmergencyContact = (id: number, data: EmergencyContactUpdatePayload) =>
  request.put<void>(`/hr/employees/emergency-contacts/${id}`, data);

export const deleteEmergencyContact = (id: number) =>
  request.delete<void>(`/hr/employees/emergency-contacts/${id}`);

export const getDeptTreeOptions = () =>
  request.get<DeptTreeNode[]>('/auth/system/dept/tree');

export const getPostOptions = () =>
  request.get<PageResult<PostOption>>('/auth/system/post/list');

export const getPositionOptions = (params?: HrPageQuery) =>
  request.get<PositionOption[]>('/hr/organization/positions', { params });

export const listPositionFamilies = (params?: HrRecord) =>
  request.get<HrRecord[]>('/hr/organization/families', { params });
export const createPositionFamily = (data: HrRecord) =>
  request.post<number>('/hr/organization/families', { ...data, familyCode: data.familyCode || `FAM${Date.now()}` });
export const updatePositionFamily = (id: number, data: HrRecord) =>
  request.put<void>(`/hr/organization/families/${id}`, data);
export const deletePositionFamily = (id: number) =>
  request.delete<void>(`/hr/organization/families/${id}`);

export const listOrganizationLevels = (params?: HrRecord) =>
  request.get<HrRecord[]>('/hr/organization/levels', { params });
export const createOrganizationLevel = (data: HrRecord) =>
  request.post<number>('/hr/organization/levels', { ...data, levelCode: data.levelCode || `LV${Date.now()}` });
export const updateOrganizationLevel = (id: number, data: HrRecord) =>
  request.put<void>(`/hr/organization/levels/${id}`, data);
export const deleteOrganizationLevel = (id: number) =>
  request.delete<void>(`/hr/organization/levels/${id}`);

export const createPosition = (data: HrRecord) =>
  request.post<number>('/hr/organization/positions', { ...data, positionCode: data.positionCode || `POS${Date.now()}` });
export const updatePosition = (id: number, data: HrRecord) =>
  request.put<void>(`/hr/organization/positions/${id}`, data);
export const deletePosition = (id: number) =>
  request.delete<void>(`/hr/organization/positions/${id}`);

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
      return storeResolvedEmployee(cacheKey, await resolveEmployeeByUserId(targetUserId));
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
    case 'PENDING':
      return '待入职';
    case 'PROBATION':
      return '试用期';
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
  if (!employee) return '当前登录用户未关联 HR 员工档案，暂时无法发起 HR 自助登记，请联系 HR 完成员工档案绑定。';
  if (isHrSelfServiceCreatableEmployee(employee)) return '';
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
  request.get<HrLeaveTypeOption[]>('/hr/attendance/leave-types');
export const createHrLeaveType = (data: HrRecord) =>
  request.post<number>('/hr/attendance/leave-types', { ...data, leaveCode: data.leaveCode || `LV${Date.now()}` });

export const getHrLeaveQuota = async (params: { employeeId: number; leaveTypeId: number; year: number }) =>
  (await listHrLeaveQuotas({ employeeId: params.employeeId, year: params.year }))
    .find((item) => item.leaveTypeId === params.leaveTypeId) as HrLeaveQuotaVO;

export const listHrLeaveQuotaBuckets = (params: { employeeId: number; leaveTypeId: number; year: number }) =>
  request.get<HrLeaveQuotaVO[]>('/hr/attendance/leave-quotas', { params });

export const listHrLeaveQuotas = (params: { employeeId: number; year: number }) =>
  request.get<HrLeaveQuotaVO[]>('/hr/attendance/leave-quotas', { params });

export const initHrLeaveQuota = async (params: { employeeId: number; year: number; leaveTypeId?: number }) => {
  const types = await listHrLeaveTypes();
  const items = (params.leaveTypeId ? types.filter((item) => item.id === params.leaveTypeId) : types)
    .filter((item) => item.needQuota !== false);
  const created: HrLeaveQuotaInitItem[] = [];
  for (const item of items) {
    const totalQuota = item.leaveCode === 'COMP_TIME' ? 0 : 5;
    await request.post<number>('/hr/attendance/leave-quotas', {
      employeeId: params.employeeId,
      leaveTypeId: item.id,
      year: params.year,
      totalQuota,
      usedQuota: 0,
      frozenQuota: 0,
      availableQuota: totalQuota,
    });
    created.push({ leaveTypeId: item.id, leaveTypeName: item.leaveName, action: 'CREATED', totalQuota });
  }
  return {
    employeeId: params.employeeId,
    year: params.year,
    mode: params.leaveTypeId ? 'SINGLE' : 'BATCH',
    requestedCount: items.length,
    createdCount: created.length,
    refreshedCount: 0,
    skippedCount: 0,
    items: created,
  } as HrLeaveQuotaInitResult;
};

export const adjustHrLeaveQuota = async (data: HrLeaveQuotaAdjustPayload) => {
  const current = await getHrLeaveQuota(data);
  await request.put<void>(`/hr/attendance/leave-quotas/${current.id}`, {
    totalQuota: Number(current.totalQuota || 0) + Number(data.adjustmentAmount || 0),
    availableQuota: Number(current.availableQuota || 0) + Number(data.adjustmentAmount || 0),
    expiryDate: data.expiryDate,
  });
};

export const createHrLeaveApplication = (data: HrRecord) =>
  request.post<number>('/hr/attendance/time-requests', { ...data, requestType: 'LEAVE', requestNo: `HRTM${Date.now()}` });
export const submitHrLeaveApplication = (id: number) => request.post<void>(`/hr/attendance/time-requests/${id}/submit`);
export const approveHrLeaveApplication = (id: number) => request.post<void>(`/hr/attendance/time-requests/${id}/approve`);
export const rejectHrLeaveApplication = (id: number) => request.post<void>(`/hr/attendance/time-requests/${id}/reject`);
export const cancelHrLeaveApplication = (id: number) => request.post<void>(`/hr/attendance/time-requests/${id}/cancel`);
export const getHrLeaveApplication = async (id: number) =>
  (await request.get<HrLeaveApplicationVO[]>('/hr/attendance/time-requests', { params: { requestType: 'LEAVE' } })).find((item) => item.id === id) as HrLeaveApplicationVO;
export const listHrLeaveApplications = (params?: HrRecord) =>
  request.get<HrPagedResult<HrLeaveApplicationVO>>('/hr/attendance/time-requests', { params: { ...params, requestType: 'LEAVE' } });
export const listHrApprovedLeaveBoard = (params?: HrRecord) =>
  listHrLeaveApplications({ ...params, status: 'APPROVED' }).then((page) => withList(page));

export const createHrOvertimeApplication = (data: HrRecord) =>
  request.post<number>('/hr/attendance/time-requests', { ...data, requestType: 'OVERTIME', requestNo: `HRTM${Date.now()}` });
export const updateHrOvertimeApplication = (id: number, data: HrRecord) =>
  request.put<void>(`/hr/attendance/time-requests/${id}`, data);
export const deleteHrOvertimeApplication = (id: number) =>
  request.delete<void>(`/hr/attendance/time-requests/${id}`);
export const submitHrOvertimeApplication = (id: number) => request.post<void>(`/hr/attendance/time-requests/${id}/submit`);
export const approveHrOvertimeApplication = (id: number) => request.post<void>(`/hr/attendance/time-requests/${id}/approve`);
export const rejectHrOvertimeApplication = (id: number) => request.post<void>(`/hr/attendance/time-requests/${id}/reject`);
export const cancelHrOvertimeApplication = (id: number) => request.post<void>(`/hr/attendance/time-requests/${id}/cancel`);
export const getHrOvertimeApplication = async (id: number) =>
  (await listHrOvertimeApplications()).find((item) => item.id === id) as HrOvertimeApplicationVO;
export const listHrOvertimeApplications = (params?: HrRecord) =>
  request.get<HrOvertimeApplicationVO[]>('/hr/attendance/time-requests', { params: { ...params, requestType: 'OVERTIME' } });

export const listRecruitmentRequests = async (params?: HrRecord) => {
  const page = await request.get<HrPagedResult<RecruitmentRequest>>('/hr/recruitment/requisitions', { params });
  const rows = withList(page).map(normalizeRecruitmentRequest);
  return { ...page, records: rows, rows } as HrPagedResult<RecruitmentRequest>;
};
export const createRecruitmentRequest = (data: RecruitmentRequestPayload) =>
  request.post<number>('/hr/recruitment/requisitions', toRecruitmentPayload(data));
export const submitRecruitmentRequest = (id: number) => request.post<void>(`/hr/recruitment/requisitions/${id}/submit`);
export const approveRecruitmentRequest = (id: number) => request.post<void>(`/hr/recruitment/requisitions/${id}/approve`);
export const completeRecruitmentRequest = (id: number) => request.post<void>(`/hr/recruitment/requisitions/${id}/complete`);
export const cancelRecruitmentRequest = (id: number) => request.post<void>(`/hr/recruitment/requisitions/${id}/cancel`);

export const listCandidates = async (params?: HrRecord) => {
  const page = await request.get<HrPagedResult<Candidate>>('/hr/recruitment/candidates', { params });
  const rows = withList(page).map(normalizeCandidate);
  return { ...page, records: rows, rows } as HrPagedResult<Candidate>;
};
export const getCandidate = async (id: number) => withList(await listCandidates({ pageNum: 1, pageSize: 500 })).find((item) => item.id === id) as Candidate;
export const createCandidate = (data: CandidatePayload) =>
  request.post<number>('/hr/recruitment/candidates', toCandidatePayload(data));
export const updateCandidateStatus = (id: number, status: string, rejectReason?: string) =>
  request.put<void>(`/hr/recruitment/candidates/${id}/status`, undefined, { params: { status, rejectReason } });

export const listInterviews = async (params?: HrRecord) =>
  (await request.get<Interview[]>('/hr/recruitment/interviews', { params })).map(normalizeInterview);
export const scheduleInterview = (data: InterviewSchedulePayload) =>
  request.post<number>('/hr/recruitment/interviews', data);

export const listOffers = async (params?: HrRecord) =>
  (await request.get<Offer[]>('/hr/recruitment/offers', { params })).map(normalizeOffer);
export const getOffer = async (id: number) => (await listOffers()).find((item) => item.id === id) as Offer;
export const createOffer = (data: OfferPayload) =>
  request.post<number>('/hr/recruitment/offers', toOfferPayload(data));
export const submitOffer = (id: number) => request.post<void>(`/hr/recruitment/offers/${id}/submit`);
export const approveOffer = (id: number) => request.post<void>(`/hr/recruitment/offers/${id}/approve`);
export const sendOffer = (id: number) => request.post<void>(`/hr/recruitment/offers/${id}/send`);
export const acceptOffer = (id: number) => request.post<void>(`/hr/recruitment/offers/${id}/accept`);
export const rejectOffer = (id: number) => request.post<void>(`/hr/recruitment/offers/${id}/reject`);
export const convertOfferToOnboarding = (id: number) =>
  request.post<number>(`/hr/recruitment/offers/${id}/convert-to-onboarding`);

export const listOnboardingApplications = async (params?: HrRecord) =>
  (await request.get<OnboardingApplication[]>('/hr/lifecycle/applications', { params: { ...params, type: 'ONBOARDING' } })).map(normalizeLifecycleApplication);
export const getOnboardingApplication = async (id: number) =>
  (await listOnboardingApplications()).find((item) => item.id === id) as OnboardingApplication;
export const getOnboardingTasks = (id: number) =>
  request.get<OnboardingTask[]>(`/hr/lifecycle/applications/${id}/tasks`);
export const createOnboardingApplication = (data: OnboardingApplicationPayload) =>
  request.post<number>('/hr/lifecycle/applications', { ...data, applicationNo: data.applicationNo || `HRLC${Date.now()}`, type: 'ONBOARDING', effectiveDate: data.expectedDate });
export const submitOnboardingApplication = (id: number) => request.post<void>(`/hr/lifecycle/applications/${id}/submit`);
export const approveOnboarding = (id: number) => request.post<void>(`/hr/lifecycle/applications/${id}/approve`);
export const rejectOnboarding = (id: number) => request.post<void>(`/hr/lifecycle/applications/${id}/reject`);
export const completeOnboardingTask = (taskId: number, remark?: string) =>
  request.post<void>(`/hr/lifecycle/tasks/${taskId}/complete`, { remark });
export const confirmOnboarding = (applicationId: number, confirmDate?: string) =>
  request.post<void>(`/hr/lifecycle/applications/${applicationId}/complete`, { confirmDate });

export const listEmployeeContracts = async (employeeId: number) =>
  (await request.get<EmployeeContract[]>(`/hr/employees/${employeeId}/contracts`)).map(normalizeEmployeeContract);
export const getEmployeeContract = async (id: number) => {
  const employees = await listEmployees();
  const lists = await Promise.all(employees.map((employee) => listEmployeeContracts(employee.id).catch(() => [])));
  return lists.flat().find((item) => item.id === id) as EmployeeContract;
};
export const createEmployeeContract = (data: EmployeeContractPayload) =>
  request.post<number>('/hr/employees/contracts', { ...data, attachmentUrls: normalizeJsonArray(data.attachmentUrls) });
export const updateEmployeeContract = (id: number, data: Partial<EmployeeContractPayload>) =>
  request.put<void>(`/hr/employees/contracts/${id}`, { ...data, attachmentUrls: normalizeJsonArray(data.attachmentUrls) });
export const deleteEmployeeContract = (id: number) =>
  request.delete<void>(`/hr/employees/contracts/${id}`);

export const listEmployeeDocuments = async (employeeId: number) =>
  (await request.get<EmployeeDocument[]>(`/hr/employees/${employeeId}/documents`)).map(normalizeEmployeeDocument);
export const getEmployeeDocument = async (id: number) => {
  const employees = await listEmployees();
  const lists = await Promise.all(employees.map((employee) => listEmployeeDocuments(employee.id).catch(() => [])));
  return lists.flat().find((item) => item.id === id) as EmployeeDocument;
};
export const createEmployeeDocument = (data: EmployeeDocumentPayload) =>
  request.post<number>('/hr/employees/documents', { ...data, attachmentUrls: normalizeJsonArray(data.attachmentUrls) });
export const updateEmployeeDocument = (id: number, data: Partial<EmployeeDocumentPayload>) =>
  request.put<void>(`/hr/employees/documents/${id}`, { ...data, attachmentUrls: normalizeJsonArray(data.attachmentUrls) });
export const deleteEmployeeDocument = (id: number) =>
  request.delete<void>(`/hr/employees/documents/${id}`);

export const listHeadcounts = (params?: HrRecord) =>
  request.get<Headcount[]>('/hr/organization/headcounts', { params });
export const setHeadcount = (data: HeadcountPayload) =>
  data.id
    ? request.put<void>(`/hr/organization/headcounts/${data.id}`, { ...data, vacancyCount: Number(data.approvedCount || 0) - Number(data.actualCount || 0) })
    : request.post<void>('/hr/organization/headcounts', { ...data, vacancyCount: Number(data.approvedCount || 0) - Number(data.actualCount || 0) });
export const getHeadcountStatistics = async (targetType: string, targetId: number) => {
  const rows = await listHeadcounts({ targetType, targetId });
  const item = rows[0];
  return item ? request.get<HeadcountStatistics>(`/hr/organization/headcounts/${item.id}/statistics`) : ({} as HeadcountStatistics);
};
export const updateHeadcountActualCount = async (targetType: string, targetId: number, actualCount: number) => {
  const rows = await listHeadcounts({ targetType, targetId });
  const item = rows[0];
  if (item) {
    await request.put<void>(`/hr/organization/headcounts/${item.id}/actual-count`, undefined, { params: { actualCount } });
  }
};

const createLifecycle = (type: string, data: HrRecord) =>
  request.post<number>('/hr/lifecycle/applications', { ...data, applicationNo: data.applicationNo || `HRLC${Date.now()}`, type, effectiveDate: data.effectiveDate || data.expectedDate || data.actualDate });
const listLifecycle = async (type: string, params?: HrRecord) =>
  (await request.get<LifecycleApplication[]>('/hr/lifecycle/applications', { params: { ...params, type } })).map(normalizeLifecycleApplication);

export const listLifecycleApplications = async (params?: HrRecord) =>
  (await request.get<LifecycleApplication[]>('/hr/lifecycle/applications', { params })).map(normalizeLifecycleApplication);
export const createLifecycleApplication = (type: string, data: HrRecord) =>
  createLifecycle(type, data);
export const changeLifecycleApplicationStatus = (id: number, action: string, data?: HrRecord) =>
  request.post<void>(`/hr/lifecycle/applications/${id}/${action}`, data || {});
export const listLifecycleApplicationTasks = (id: number) =>
  request.get<OnboardingTask[]>(`/hr/lifecycle/applications/${id}/tasks`);

export const createProbationConfirmation = (data: ProbationConfirmationPayload) => createLifecycle('PROBATION', data);
export const submitProbationConfirmation = (id: number) => request.post<void>(`/hr/lifecycle/applications/${id}/submit`);
export const approveProbationConfirmation = (id: number) => request.post<void>(`/hr/lifecycle/applications/${id}/approve`);
export const rejectProbationConfirmation = (id: number, rejectReason?: string, extensionDays?: number) =>
  request.post<void>(`/hr/lifecycle/applications/${id}/reject`, { rejectReason, extensionDays });
export const getProbationConfirmation = async (id: number) => (await listLifecycle('PROBATION')).find((item) => item.id === id) as ProbationConfirmation;
export const listProbationByEmployee = (employeeId: number) => listLifecycle('PROBATION', { employeeId }) as Promise<ProbationConfirmation[]>;
export const sendProbationReminders = () => Promise.resolve();

export const createTransferApplication = (data: TransferApplicationPayload) => createLifecycle('TRANSFER', data);
export const submitTransferApplication = (id: number) => request.post<void>(`/hr/lifecycle/applications/${id}/submit`);
export const approveTransfer = (id: number) => request.post<void>(`/hr/lifecycle/applications/${id}/approve`);
export const effectiveTransfer = (id: number) => request.post<void>(`/hr/lifecycle/applications/${id}/effective`);
export const getTransferApplication = async (id: number) => (await listLifecycle('TRANSFER')).find((item) => item.id === id) as TransferApplication;
export const listTransferByEmployee = (employeeId: number) => listLifecycle('TRANSFER', { employeeId }) as Promise<TransferApplication[]>;

export const createResignationApplication = (data: ResignationApplicationPayload) => createLifecycle('RESIGNATION', data);
export const submitResignationApplication = (id: number) => request.post<void>(`/hr/lifecycle/applications/${id}/submit`);
export const approveResignation = (id: number) => request.post<void>(`/hr/lifecycle/applications/${id}/approve`);
export const conductExitInterview = (id: number, interviewContent: string) =>
  request.put<void>(`/hr/lifecycle/applications/${id}`, { remark: interviewContent });
export const completeResignationHandover = (handoverId: number, remark?: string) =>
  request.post<void>(`/hr/lifecycle/tasks/${handoverId}/complete`, { remark });
export const confirmResignation = (applicationId: number, confirmDate?: string) =>
  request.post<void>(`/hr/lifecycle/applications/${applicationId}/complete`, { confirmDate });
export const getResignationApplication = async (id: number) => (await listLifecycle('RESIGNATION')).find((item) => item.id === id) as ResignationApplication;
export const listResignationByEmployee = (employeeId: number) => listLifecycle('RESIGNATION', { employeeId }) as Promise<ResignationApplication[]>;
export const listResignationHandovers = (applicationId: number) =>
  request.get<ResignationHandover[]>(`/hr/lifecycle/applications/${applicationId}/tasks`);

export const listSalaryItems = async () => (await request.get<SalaryItem[]>('/hr/compensation/components')).map(normalizeSalaryItem);
export const createSalaryItem = (data: SalaryItemPayload) => request.post<number>('/hr/compensation/components', { ...data, componentCode: data.componentCode || data.itemCode, componentName: data.componentName || data.itemName, componentType: data.componentType || data.itemType });
export const updateSalaryItem = (id: number, data: Partial<SalaryItemPayload>) => request.put<void>(`/hr/compensation/components/${id}`, data);
export const deleteSalaryItem = (id: number) => request.delete<void>(`/hr/compensation/components/${id}`);
export const listSalaryStructures = async () => (await request.get<SalaryStructure[]>('/hr/compensation/structures')).map(normalizeSalaryStructure);
export const getSalaryStructure = async (id: number) => {
  const structure = (await listSalaryStructures()).find((item) => item.id === id) as SalaryStructureDetail;
  const items = await listSalaryItems();
  return {
    ...structure,
    items: items.filter((item) => (structure.itemIds || []).includes(item.id)),
  };
};
export const createSalaryStructure = (data: SalaryStructurePayload) =>
  request.post<number>('/hr/compensation/structures', { ...data, componentConfig: { itemIds: data.itemIds || [] } });
export const updateSalaryStructure = (id: number, data: Partial<SalaryStructurePayload>) =>
  request.put<void>(`/hr/compensation/structures/${id}`, { ...data, componentConfig: { itemIds: data.itemIds || [] } });
export const deleteSalaryStructure = (id: number) => request.delete<void>(`/hr/compensation/structures/${id}`);
export const listSalaryGrades = () => request.get<SalaryGrade[]>('/hr/compensation/grades');
export const setSalaryGrade = (data: SalaryGradePayload) => request.post<void>('/hr/compensation/grades', data);
export const deleteSalaryGrade = (levelId: number) => request.delete<void>(`/hr/compensation/grades/${levelId}`);
export const listJobLevels = (params?: { levelSeries?: string }) => request.get<JobLevelOption[]>('/hr/organization/levels', { params });
export const assignSalaryStructure = (data: EmployeeSalaryAssignPayload) =>
  request.post<void>('/hr/compensation/employee-compensations', { ...data, componentValues: data.componentValues || data.salaryData });
export const getEmployeeSalary = async (employeeId: number) =>
  normalizeEmployeeSalaryDetail((await listEmployeeSalaries({ employeeId }))[0] as EmployeeSalaryDetail);
export const listEmployeeSalaries = async (params?: HrRecord) =>
  (await request.get<EmployeeSalary[]>('/hr/compensation/employee-compensations', { params })).map(normalizeEmployeeSalary);
export const createSalaryAdjustment = (data: SalaryAdjustmentPayload) => request.post<number>('/hr/compensation/changes', { ...data, changeNo: data.changeNo || data.applicationNo || `HRCG${Date.now()}` });
export const submitSalaryAdjustment = (id: number) => request.post<void>(`/hr/compensation/changes/${id}/submit`);
export const approveSalaryAdjustment = (id: number) => request.post<void>(`/hr/compensation/changes/${id}/approve`);
export const effectiveSalaryAdjustment = (id: number) => request.post<void>(`/hr/compensation/changes/${id}/effective`);
export const getSalaryAdjustment = async (id: number) => withList(await listSalaryAdjustments({ pageNum: 1, pageSize: 500 })).find((item) => item.id === id) as SalaryAdjustment;
export const listSalaryAdjustments = (params?: HrRecord) => request.get<HrPagedResult<SalaryAdjustment>>('/hr/compensation/changes', { params });
export const getSalaryAdjustmentHistory = async (employeeId: number) => withList(await listSalaryAdjustments({ employeeId, pageNum: 1, pageSize: 500 }));
export const listInsuranceSchemes = () => request.get<InsuranceScheme[]>('/hr/compensation/benefits');
export const createInsuranceScheme = (data: InsuranceSchemePayload) => request.post<number>('/hr/compensation/benefits', { ...data, schemeCode: data.schemeCode || `BEN${Date.now()}`, benefitConfig: data.benefitConfig || {} });
export const updateInsuranceScheme = (id: number, data: Partial<InsuranceSchemePayload>) => request.put<void>(`/hr/compensation/benefits/${id}`, data);
export const assignInsuranceScheme = (data: EmployeeInsuranceAssignPayload) => request.post<void>('/hr/compensation/employee-benefits', data);
export const getEmployeeInsurance = async (employeeId: number) => withList(await listEmployeeInsurances({ employeeId } as HrRecord))[0] as EmployeeInsuranceDetail;
export const listEmployeeInsurances = (params?: HrRecord) => request.get<HrPagedResult<EmployeeInsurance>>('/hr/compensation/employee-benefits', { params });
export const listEmployeeBenefits = (params?: HrRecord) =>
  request.get<HrPagedResult<EmployeeInsurance>>('/hr/compensation/employee-benefits', { params });
export const listTaxProfiles = (params?: HrRecord) =>
  request.get<HrRecord[]>('/hr/compensation/tax-profiles', { params });
export const calculateEmployeeInsurance = async (employeeId: number, salary = 0) => ({
  employeeId,
  salary,
  base: salary,
  personalTotalAmount: 0,
  companyTotalAmount: 0,
}) as InsuranceCalculation;
export const createTaxConfig = (data: TaxConfigPayload) => request.post<number>('/hr/compensation/tax-profiles', data);
export const updateTaxConfig = (id: number, data: Partial<TaxConfigPayload>) => request.put<void>(`/hr/compensation/tax-profiles/${id}`, data);
export const getCurrentTaxConfig = async () => ({ threshold: 5000 }) as TaxConfig;
export const addTaxDeduction = (data: EmployeeTaxDeductionPayload) => request.post<number>('/hr/compensation/tax-deductions', data);
export const updateTaxDeduction = (id: number, data: EmployeeTaxDeductionUpdatePayload) => request.put<void>(`/hr/compensation/tax-deductions/${id}`, data);
export const deleteTaxDeduction = (id: number) => request.delete<void>(`/hr/compensation/tax-deductions/${id}`);
export const listTaxDeductions = (employeeId: number, year?: number, month?: number) =>
  request.get<EmployeeTaxDeduction[]>('/hr/compensation/tax-deductions', { params: { employeeId, year, month } });
export const listTaxDeductionRecords = (params?: HrRecord) =>
  request.get<EmployeeTaxDeduction[]>('/hr/compensation/tax-deductions', { params });
export const listActiveTaxDeductions = (employeeId: number, year?: number, month?: number) =>
  listTaxDeductions(employeeId, year, month);
export const calculateTax = async (data: HrRecord) => {
  const taxableIncome = Number(data.taxableIncome || 0);
  const taxableAmount = Math.max(taxableIncome - 5000, 0);
  return {
    ...data,
    taxableIncome,
    totalDeduction: 0,
    taxableAmount,
    taxAmount: 0,
    afterTaxIncome: Number((taxableIncome - 0).toFixed(2)),
  } as TaxCalculation;
};

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

export const hrCheckIn = (data: HrRecord) => request.post<void>('/hr/attendance/records', { ...data, checkType: 'CHECK_IN', attendanceDate: new Date().toISOString().slice(0, 10), checkTime: new Date().toISOString(), requestNo: `HRAT${Date.now()}` });
export const hrCheckOut = (data: HrRecord) => request.post<void>('/hr/attendance/records', { ...data, checkType: 'CHECK_OUT', attendanceDate: new Date().toISOString().slice(0, 10), checkTime: new Date().toISOString(), requestNo: `HRAT${Date.now()}` });
export const listHrAttendanceRecords = (params?: HrRecord) => request.get<HrAttendanceRecord[]>('/hr/attendance/records', { params });
export const createHrAttendanceRecord = (data: HrRecord) =>
  request.post<number>('/hr/attendance/records', { ...data, attendanceDate: data.attendanceDate || String(data.checkTime || new Date().toISOString()).slice(0, 10) });
export const getHrAttendanceMonthly = async (employeeId: number, year: number, month: number) =>
  (await request.get<HrAttendanceMonthly[]>('/hr/attendance/monthly', { params: { employeeId, year, month } }))[0] as HrAttendanceMonthly;
export const listHrAttendanceMonthly = (params?: HrRecord) =>
  request.get<HrAttendanceMonthly[]>('/hr/attendance/monthly', { params });
export const listHrShifts = () => request.get<HrShift[]>('/hr/attendance/shifts');
export const createHrShift = (data: Omit<HrShift, 'id'> & HrRecord) => request.post<number>('/hr/attendance/shifts', data);
export const updateHrShift = (id: number, data: Partial<HrShift>) => request.put<void>(`/hr/attendance/shifts/${id}`, data);
export const listHrScheduleRules = async () => (await request.get<HrScheduleRule[]>('/hr/attendance/rules')).map(normalizeScheduleRule);
export const getHrScheduleRule = async (id: number) => (await listHrScheduleRules()).find((item) => item.id === id) as HrScheduleRule;
export const createHrScheduleRule = (data: Omit<HrScheduleRule, 'id'> & HrRecord) =>
  request.post<number>('/hr/attendance/rules', { ...data, ruleCode: data.ruleCode || `RULE${Date.now()}`, configJson: data.configJson || data.ruleConfig });
export const updateHrScheduleRule = (id: number, data: Partial<HrScheduleRule>) =>
  request.put<void>(`/hr/attendance/rules/${id}`, { ...data, configJson: data.configJson || data.ruleConfig });
export const deleteHrScheduleRule = (id: number) => request.delete<void>(`/hr/attendance/rules/${id}`);
export const listHrScheduleRuleAssignments = (ruleId: number) => request.get<AttendanceRuleAssignment[]>('/hr/attendance/schedules', { params: { ruleId } });
export const listHrScheduleAssignments = (params?: HrRecord) =>
  request.get<AttendanceRuleAssignment[]>('/hr/attendance/schedules', { params });
export const createHrScheduleRuleAssignment = (ruleId: number, data: Omit<AttendanceRuleAssignment, 'id' | 'ruleId'> & HrRecord) =>
  request.post<number>('/hr/attendance/schedules', { ...data, ruleId });
export const createHrScheduleAssignment = (data: HrRecord) =>
  request.post<number>('/hr/attendance/schedules', data);
export const deleteHrScheduleRuleAssignment = (assignmentId: number) => request.delete<void>(`/hr/attendance/schedules/${assignmentId}`);
export const listHrLeaveQuotaRecords = (params?: HrRecord) =>
  request.get<HrLeaveQuotaVO[]>('/hr/attendance/leave-quotas', { params });
export const createHrLeaveQuota = (data: HrRecord) =>
  request.post<number>('/hr/attendance/leave-quotas', data);
export const updateHrLeaveQuota = (id: number, data: HrRecord) =>
  request.put<void>(`/hr/attendance/leave-quotas/${id}`, data);
export const listHrTimeRequests = (params?: HrRecord) =>
  request.get<HrRecord[]>('/hr/attendance/time-requests', { params });
export const createHrTimeRequest = (data: HrRecord) =>
  request.post<number>('/hr/attendance/time-requests', { ...data, requestNo: data.requestNo || `HRTM${Date.now()}` });
export const changeHrTimeRequestStatus = (id: number, action: string) =>
  request.post<void>(`/hr/attendance/time-requests/${id}/${action}`);
export const getEffectiveAttendanceRule = async () => {
  const rules = await listHrScheduleRules();
  const rule = rules[0];
  if (!rule) return {} as EffectiveAttendanceRule;
  const shifts = await listHrShifts();
  const shift = shifts.find((item) => item.id === rule.shiftId) || shifts[0];
  return {
    ruleId: rule.id,
    ruleName: rule.ruleName,
    ruleType: rule.ruleType,
    sourceType: 'DEFAULT',
    sourceTargetName: '',
    dayType: 'WORKDAY',
    shiftId: shift?.id,
    shiftName: shift?.shiftName,
    checkInTime: shift?.startTime,
    checkOutTime: shift?.endTime,
    checkMethods: ['GPS', 'WIFI'],
  } as EffectiveAttendanceRule;
};
export const listWorkCalendarDays = async (_params?: HrRecord) => [] as WorkCalendarDay[];
export const createWorkCalendarDay = async (_data: Omit<WorkCalendarDay, 'id'> & HrRecord) => 0;
export const updateWorkCalendarDay = async (_id: number, _data: Partial<WorkCalendarDay> & HrRecord) => undefined;
export const deleteWorkCalendarDay = async (_id: number) => undefined;

// ============================================================================
// CRM 销售业绩聚合（HR 绩效看板展示用），透传到 service-crm /inner/crm/performance/*
// ============================================================================

export interface CrmPerformanceSummary {
  dimension: 'OWNER' | 'DEPT' | string;
  targetId: number;
  targetName?: string;
  wonOpportunityCount: number;
  wonAmount: number;
  contractAmount: number;
  receivedAmount: number;
  outstandingAmount: number;
  followUpCount: number;
  customerCount: number;
}

export interface CrmPerformanceRangeQuery {
  startDate?: string;
  endDate?: string;
}

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
