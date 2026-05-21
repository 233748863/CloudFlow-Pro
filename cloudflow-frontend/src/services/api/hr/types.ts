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
