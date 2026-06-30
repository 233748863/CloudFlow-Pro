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

export interface EmployeeBrief {
  id: number;
  name: string;
  employeeNo?: string;
  deptId?: number | null;
  deptName?: string | null;
  postId?: number | null;
  postName?: string | null;
  positionId?: number | null;
  positionName?: string | null;
  employeeStatus?: string | null;
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
  channelId?: number;
  channelName?: string;
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
  channelId?: number;
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

// ========== ESS / 培训 增量类型（2026-05 P0）==========

export interface HrSalarySlip extends HrRecord {
  id: number;
  employeeId: number;
  employeeName?: string;
  periodMonth: string;
  grossTotal?: number | string;
  deductionTotal?: number | string;
  netTotal?: number | string;
  taxAmount?: number | string;
  benefitAmount?: number | string;
  components?: Record<string, number | string>;
  payDate?: string | null;
  status: 'DRAFT' | 'CONFIRMED' | 'PAID' | 'RELEASED' | string;
  employeeConfirmed?: boolean;
  confirmedTime?: string | null;
}

export interface HrCertificateRequest extends HrRecord {
  id: number;
  requestNo: string;
  employeeId: number;
  certificateType: 'EMPLOYMENT' | 'INCOME' | 'SOCIAL_INSURANCE' | 'CUSTOM' | string;
  purpose?: string;
  language?: string;
  recipientOrg?: string;
  copies?: number;
  status: 'DRAFT' | 'PENDING' | 'APPROVING' | 'APPROVED' | 'REJECTED' | 'ISSUED' | 'CANCELLED' | string;
  processInstanceId?: string;
  issuedAt?: string;
  pdfFileId?: number | null;
  remark?: string;
}

export interface HrCertificateRequestPayload {
  certificateType: string;
  purpose?: string;
  language?: string;
  recipientOrg?: string;
  copies?: number;
  remark?: string;
}

export interface HrBankCard extends HrRecord {
  id: number;
  employeeId: number;
  bankName: string;
  bankBranch?: string;
  accountNo: string;
  accountHolder: string;
  isPrimary?: boolean;
  status?: string;
}

export type HrBankCardPayload = Omit<HrBankCard, 'id'> & { id?: number };

export interface HrFamilyMember extends HrRecord {
  id: number;
  employeeId: number;
  memberName: string;
  relationship: string;
  idCardNo?: string;
  birthDate?: string;
  occupation?: string;
  phone?: string;
  isDependent?: boolean;
}

export type HrFamilyMemberPayload = Omit<HrFamilyMember, 'id'> & { id?: number };

export interface HrBenefitPayment extends HrRecord {
  id: number;
  employeeId: number;
  schemeId: number;
  periodMonth: string;
  baseAmount?: number | string;
  companyAmount?: number | string;
  personalAmount?: number | string;
  items?: Record<string, number | string>;
  status?: string;
  payDate?: string | null;
}

export interface HrContractSignature extends HrRecord {
  id: number;
  contractId: number;
  signerType: 'EMPLOYEE' | 'COMPANY' | string;
  signerId: number;
  signMethod?: 'E_SIGN' | 'MANUAL' | string;
  signStatus: 'PENDING' | 'SIGNED' | 'REJECTED' | 'EXPIRED' | 'CANCELLED' | string;
  signTime?: string | null;
  ipAddress?: string;
  signatureFileId?: number | null;
  processInstanceId?: string;
  expireTime?: string | null;
}

export interface HrContractSignaturePayload {
  signerType?: string;
  signMethod?: string;
  comment?: string;
}

export interface HrSelfServiceMessage extends HrRecord {
  id: number;
  employeeId: number;
  category?: string;
  title: string;
  summary?: string;
  linkUrl?: string;
  readFlag: boolean;
  relatedId?: number | null;
  createTime?: string;
}

export interface HrEssPortalSummary {
  employee: Partial<HrEmployee>;
  leaveBalances: Array<{
    leaveTypeId: number;
    leaveTypeName?: string;
    leaveCode?: string;
    unit?: string;
    totalQuota?: number | string;
    usedQuota?: number | string;
    remainQuota?: number | string;
    year?: number;
  }>;
  latestSlip: HrSalarySlip | Record<string, never>;
  pendingContracts: Array<HrRecord>;
  recentCertificates: HrCertificateRequest[];
  unreadMessages: HrSelfServiceMessage[];
  unreadCount: number;
}

// ========== 培训 ==========

export interface HrTrainingPlan extends HrRecord {
  id: number;
  planNo?: string;
  planName: string;
  planType?: 'ANNUAL' | 'QUARTERLY' | 'DEPT' | 'ADHOC' | string;
  year?: number;
  quarter?: number;
  deptId?: number;
  ownerId?: number;
  budget?: number | string;
  status?: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED' | string;
  description?: string;
}

export type HrTrainingPlanPayload = Omit<HrTrainingPlan, 'id'> & { id?: number };

export interface HrTrainingCategory extends HrRecord {
  id: number;
  parentId?: number;
  name: string;
  sort?: number;
  status?: string;
}

export type HrTrainingCategoryPayload = Omit<HrTrainingCategory, 'id'> & { id?: number };

export interface HrTrainingInstructor extends HrRecord {
  id: number;
  instructorName: string;
  instructorType?: 'INTERNAL' | 'EXTERNAL' | string;
  employeeId?: number;
  expertise?: string;
  bio?: string;
  contact?: string;
  hourlyRate?: number | string;
  status?: string;
}

export type HrTrainingInstructorPayload = Omit<HrTrainingInstructor, 'id'> & { id?: number };

export interface HrTrainingCourse extends HrRecord {
  id: number;
  courseCode?: string;
  courseName: string;
  categoryId?: number;
  instructorId?: number;
  mode?: 'ONLINE' | 'OFFLINE' | 'BLENDED' | string;
  durationHours?: number | string;
  creditHours?: number | string;
  coverUrl?: string;
  materials?: number[];
  description?: string;
  status?: string;
}

export type HrTrainingCoursePayload = Omit<HrTrainingCourse, 'id'> & { id?: number };

export interface HrTrainingSession extends HrRecord {
  id: number;
  planId?: number;
  courseId: number;
  sessionNo?: string;
  location?: string;
  startTime: string;
  endTime: string;
  capacity: number;
  enrolledCount?: number;
  instructorId?: number;
  status?: 'PLANNED' | 'REGISTERING' | 'ONGOING' | 'COMPLETED' | 'CANCELLED' | string;
  remark?: string;
}

export type HrTrainingSessionPayload = Omit<HrTrainingSession, 'id'> & { id?: number };

export interface HrTrainingEnrollment extends HrRecord {
  id: number;
  sessionId: number;
  employeeId: number;
  enrollType?: 'SELF' | 'ASSIGNED' | string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'WITHDRAWN' | string;
  processInstanceId?: string;
  attended?: boolean;
  checkInTime?: string | null;
  completionStatus?: 'PENDING' | 'PASSED' | 'FAILED' | string;
  score?: number | string;
  comment?: string;
}

export interface HrExamQuestionBank extends HrRecord {
  id: number;
  categoryId?: number;
  questionType: 'SINGLE' | 'MULTI' | 'JUDGE' | 'FILL' | 'ESSAY' | string;
  content: string;
  options?: Array<{ key: string; text: string }> | Record<string, string>;
  answer?: unknown[];
  score?: number | string;
  difficulty?: number;
  analysis?: string;
  status?: string;
}

export type HrExamQuestionBankPayload = Omit<HrExamQuestionBank, 'id'> & { id?: number };

export interface HrExamPaper extends HrRecord {
  id: number;
  courseId?: number;
  paperName: string;
  totalScore?: number | string;
  passScore?: number | string;
  durationMinutes?: number;
  questionCount?: number;
  questionIds?: number[];
  generateMode?: 'MANUAL' | 'RANDOM' | string;
  config?: Record<string, unknown>;
  status?: 'DRAFT' | 'PUBLISHED' | string;
}

export type HrExamPaperPayload = Omit<HrExamPaper, 'id'> & { id?: number };

export interface HrExamAttempt extends HrRecord {
  id: number;
  paperId: number;
  employeeId: number;
  sessionId?: number;
  startTime?: string;
  submitTime?: string | null;
  score?: number | string;
  passFlag?: boolean | null;
  answers?: Array<Record<string, unknown>>;
  status: 'IN_PROGRESS' | 'SUBMITTED' | 'GRADED' | string;
}

export interface HrTrainingCertificate extends HrRecord {
  id: number;
  certNo: string;
  employeeId: number;
  courseId: number;
  sessionId?: number;
  templateId?: number;
  issueDate?: string;
  expireDate?: string | null;
  pdfFileId?: number | null;
  status: 'VALID' | 'REVOKED' | string;
  revokedReason?: string;
}

export interface HrTrainingCertificateIssuePayload {
  employeeId: number;
  courseId: number;
  sessionId?: number;
  templateId?: number;
}

export interface HrTrainingArchive {
  employee: Partial<HrEmployee>;
  totalCreditHours: number | string;
  completedCount: number;
  ongoingCount: number;
  certificateCount: number;
  enrollments: Array<HrRecord>;
  certificates: HrTrainingCertificate[];
}

// ===== 人才盘点（Talent Review）域类型 =====

export type TalentBand = 'HIGH' | 'MEDIUM' | 'LOW' | string;
export type TalentReviewStatus =
  | 'DRAFT'
  | 'IN_PROGRESS'
  | 'CALIBRATING'
  | 'PUBLISHED'
  | 'ARCHIVED'
  | 'REJECTED'
  | string;

export interface HrTalentReview extends HrRecord {
  id: number;
  tenantId?: number;
  reviewNo: string;
  reviewName: string;
  reviewYear: number;
  cycleType: 'ANNUAL' | 'H1' | 'H2' | 'QUARTER' | string;
  scopeType: 'GLOBAL' | 'DEPT' | 'POSITION' | string;
  scopeValue?: string;
  ownerId?: number;
  deadline?: string;
  status: TalentReviewStatus;
  processInstanceId?: string;
  performanceSourceObjectiveId?: number;
  publishTime?: string;
  description?: string;
}

export type HrTalentReviewPayload = Omit<HrTalentReview, 'id'> & { id?: number };

export interface HrTalentReviewParticipant extends HrRecord {
  id: number;
  reviewId: number;
  employeeId: number;
  performanceScore?: number | string;
  performanceBand?: TalentBand;
  potentialScore?: number;
  potentialBand?: TalentBand;
  gridCell?: number;
  calibrationNotes?: string;
  developActionSummary?: string;
  decidedBy?: number;
  decidedAt?: string;
}

export interface HrTalentNineBoxGrid {
  [cell: number]: HrTalentReviewParticipant[];
}

export interface HrTalentCalibrationSession extends HrRecord {
  id: number;
  reviewId: number;
  sessionNo: string;
  scheduledAt?: string;
  location?: string;
  facilitatorId?: number;
  participants?: number[];
  agenda?: string;
  minutes?: string;
  status: 'PLANNED' | 'ONGOING' | 'COMPLETED' | 'CANCELLED' | string;
}

export type HrTalentCalibrationSessionPayload = Omit<HrTalentCalibrationSession, 'id'> & { id?: number };

export interface HrTalentSuccessionPlan extends HrRecord {
  id: number;
  planNo: string;
  planName: string;
  positionId?: number;
  incumbentEmployeeId?: number;
  keyRoleFlag?: boolean;
  riskLevel?: 'LOW' | 'MID' | 'HIGH' | 'CRITICAL' | string;
  retentionRisk?: string;
  description?: string;
  ownerId?: number;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED' | 'REJECTED' | string;
  processInstanceId?: string;
  publishTime?: string;
  successors?: HrTalentSuccessor[];
}

export type HrTalentSuccessionPlanPayload = Omit<HrTalentSuccessionPlan, 'id' | 'successors'> & { id?: number };

export interface HrTalentSuccessor extends HrRecord {
  id: number;
  planId: number;
  employeeId: number;
  readiness?: 'READY_NOW' | 'IN_1_2_YEARS' | 'IN_3_5_YEARS' | string;
  rankOrder?: number;
  talentReviewParticipantId?: number;
  developmentGap?: string;
  retentionAction?: string;
  status: 'ACTIVE' | 'REMOVED' | string;
}

export interface HrTalentPool extends HrRecord {
  id: number;
  poolNo: string;
  poolName: string;
  poolType: 'CORE' | 'HIPO' | 'SUCCESSOR' | 'CRITICAL_SKILL' | 'EXTERNAL_BENCH' | string;
  description?: string;
  ownerId?: number;
  status: 'ACTIVE' | 'ARCHIVED' | string;
}

export type HrTalentPoolPayload = Omit<HrTalentPool, 'id'> & { id?: number };

export interface HrTalentPoolMember extends HrRecord {
  id: number;
  poolId: number;
  employeeId: number;
  joinedAt?: string;
  joinedReviewId?: number;
  exitAt?: string;
  exitReason?: 'PROMOTED' | 'RESIGNED' | 'DOWNGRADE' | 'MANUAL' | string;
  status: 'IN' | 'OUT' | string;
}

export interface HrTalentDevelopmentAction extends HrRecord {
  id: number;
  employeeId: number;
  sourceReviewId?: number;
  sourcePoolId?: number;
  actionType: 'TRAINING' | 'MENTOR' | 'JOB_ROTATION' | 'STRETCH_PROJECT' | 'EXTERNAL_COURSE' | string;
  actionName: string;
  mentorId?: number;
  ownerId?: number;
  startDate?: string;
  endDate?: string;
  trainingSessionId?: number;
  status: 'PLANNED' | 'ONGOING' | 'COMPLETED' | 'CANCELLED' | string;
  evaluationScore?: number | string;
  evaluationNotes?: string;
  description?: string;
}

export type HrTalentDevelopmentActionPayload = Omit<HrTalentDevelopmentAction, 'id'> & { id?: number };

export interface HrTalentArchive {
  employee: Partial<HrEmployee> & { employeeId?: number; employeeNo?: string };
  reviews: Array<HrRecord>;
  pools: Array<HrRecord>;
  developmentActions: Array<HrRecord>;
  successorOf: Array<HrRecord>;
}

export interface HrBenefitRequest extends HrRecord {
  id: number;
  requestNo: string;
  employeeId: number;
  schemeId?: number;
  requestType: 'BENEFIT_CLAIM' | 'POINT_TOPUP' | 'POINT_ADJUST' | string;
  amount?: number | string;
  pointAmount?: number;
  reason?: string;
  attachments?: unknown[];
  status: 'DRAFT' | 'SUBMITTED' | 'APPROVING' | 'APPROVED' | 'REJECTED' | 'PAID' | 'CANCELLED' | string;
  processInstanceId?: string;
  approverId?: number;
  paidAt?: string;
}

export type HrBenefitRequestPayload = Omit<HrBenefitRequest, 'id'> & { id?: number };

export interface HrPointAccount extends HrRecord {
  id: number;
  employeeId: number;
  availablePoints: number;
  totalEarned: number;
  totalSpent: number;
  frozenPoints: number;
  lastActiveAt?: string;
}

export interface HrPointTransaction extends HrRecord {
  id: number;
  accountId: number;
  txnNo: string;
  direction: 'IN' | 'OUT' | 'FROZEN' | 'UNFROZEN' | string;
  sourceType: 'BENEFIT' | 'MALL_ORDER' | 'MANUAL_ADJUST' | 'EXPIRE' | string;
  sourceId?: number;
  points: number;
  balanceAfter?: number;
  effectiveDate?: string;
  expireDate?: string;
  remark?: string;
  createTime?: string;
}

export interface HrMallItem extends HrRecord {
  id: number;
  itemNo: string;
  itemName: string;
  category?: string;
  pointPrice: number;
  stock: number;
  salesCount?: number;
  coverImage?: string;
  images?: string[];
  detailHtml?: string;
  status: 'ON_SHELF' | 'OFF_SHELF' | string;
  approvalThreshold?: number;
}

export type HrMallItemPayload = Omit<HrMallItem, 'id'> & { id?: number };

export interface HrMallOrderItem extends HrRecord {
  id?: number;
  orderId?: number;
  itemId: number;
  itemName?: string;
  pointPrice?: number;
  quantity: number;
  subtotal?: number;
}

export interface HrMallOrder extends HrRecord {
  id: number;
  orderNo: string;
  employeeId: number;
  totalPoints: number;
  receiverName?: string;
  receiverPhone?: string;
  receiverAddress?: string;
  expressNo?: string;
  status: 'PENDING' | 'APPROVING' | 'APPROVED' | 'SHIPPED' | 'COMPLETED' | 'CANCELLED' | string;
  processInstanceId?: string;
  shippedAt?: string;
  completedAt?: string;
  remark?: string;
  items?: HrMallOrderItem[];
}

export interface HrMallOrderPayload {
  employeeId?: number;
  receiverName?: string;
  receiverPhone?: string;
  receiverAddress?: string;
  remark?: string;
  items: HrMallOrderItem[];
}

export interface HrBenefitMineSummary {
  activeBenefits: HrRecord[];
  pointAccount: HrPointAccount | HrRecord;
  inFlightOrders: HrMallOrder[];
  recentRequests: HrBenefitRequest[];
}

export interface HrWorkInjury extends HrRecord {
  id: number;
  injuryNo: string;
  employeeId: number;
  occurredAt?: string;
  location?: string;
  eventDescription?: string;
  injuryPart?: string;
  injuryLevel?: 'MINOR' | 'MODERATE' | 'SEVERE' | 'DEATH' | string;
  status: 'REPORTED' | 'INVESTIGATING' | 'DETERMINING' | 'DETERMINED' | 'COMPENSATING' | 'REHABILITATING' | 'CLOSED' | string;
  processInstanceId?: string;
  determinedAt?: string;
  determinedGrade?: number;
  remark?: string;
}

export type HrWorkInjuryPayload = Omit<HrWorkInjury, 'id'> & { id?: number };

export interface HrWorkInjuryInvestigation extends HrRecord {
  id: number;
  injuryId: number;
  investigatorId?: number;
  investigationDate?: string;
  scenePhotos?: string[];
  witnessStatements?: string;
  conclusion?: string;
  responsibilityType?: 'WORK_RELATED' | 'COMMUTE' | 'THIRD_PARTY' | string;
}

export type HrWorkInjuryInvestigationPayload = Omit<HrWorkInjuryInvestigation, 'id'> & { id?: number };

export interface HrWorkInjuryTreatment extends HrRecord {
  id: number;
  injuryId: number;
  hospitalName?: string;
  admitDate?: string;
  dischargeDate?: string;
  totalCost?: number | string;
  insuranceCovered?: number | string;
  selfPaid?: number | string;
  diagnosis?: string;
  treatmentSummary?: string;
  receipts?: number[];
}

export type HrWorkInjuryTreatmentPayload = Omit<HrWorkInjuryTreatment, 'id'> & { id?: number };

export interface HrWorkInjuryCompensation extends HrRecord {
  id: number;
  injuryId: number;
  itemType?: 'MEDICAL' | 'DISABILITY_ALLOWANCE' | 'LUMP_SUM' | 'FUNERAL' | 'DEPENDENT_SUPPORT' | string;
  amount?: number | string;
  paymentStatus: 'PLANNED' | 'PAID' | 'REJECTED' | string;
  paidAt?: string;
  bankAccount?: string;
  remark?: string;
}

export type HrWorkInjuryCompensationPayload = Omit<HrWorkInjuryCompensation, 'id'> & { id?: number };

export interface HrWorkInjuryRehabilitation extends HrRecord {
  id: number;
  injuryId: number;
  returnDate?: string;
  positionAdjustment?: 'SAME' | 'RELIGHTED' | 'CHANGED' | string;
  newPositionId?: number;
  abilityAssessment?: string;
  followUpAt?: string;
  status: 'IN_REHAB' | 'RETURNED' | 'UNABLE_RETURN' | string;
}

export type HrWorkInjuryRehabilitationPayload = Omit<HrWorkInjuryRehabilitation, 'id'> & { id?: number };

export interface HrLaborDispute extends HrRecord {
  id: number;
  disputeNo: string;
  applicantEmployeeId?: number;
  applicantExternalName?: string;
  applicantExternalPhone?: string;
  disputeType?: 'SALARY' | 'CONTRACT' | 'DISMISSAL' | 'SOCIAL_INSURANCE' | 'OTHER' | string;
  claimAmount?: number | string;
  claimDescription?: string;
  status: 'REGISTERED' | 'MEDIATING' | 'MEDIATED' | 'ARBITRATING' | 'AWARDED' | 'EXECUTED' | 'CLOSED' | string;
  processInstanceId?: string;
  openedAt?: string;
  closedAt?: string;
  remark?: string;
}

export type HrLaborDisputePayload = Omit<HrLaborDispute, 'id'> & { id?: number };

export interface HrDisputeMediation extends HrRecord {
  id: number;
  disputeId: number;
  mediatorId?: number;
  mediationDate?: string;
  location?: string;
  processSummary?: string;
  result?: 'SUCCESS' | 'PARTIAL' | 'FAILED' | string;
  agreementUrl?: string;
  signedAt?: string;
}

export type HrDisputeMediationPayload = Omit<HrDisputeMediation, 'id'> & { id?: number };

export interface HrDisputeArbitration extends HrRecord {
  id: number;
  disputeId: number;
  arbitrationCommittee?: string;
  caseNo?: string;
  acceptedAt?: string;
  hearingDates?: string[];
  awardNo?: string;
  awardResult?: string;
  awardAmount?: number | string;
  effectiveDate?: string;
  awardDocUrl?: string;
}

export type HrDisputeArbitrationPayload = Omit<HrDisputeArbitration, 'id'> & { id?: number };

export interface HrDisputeEvidence extends HrRecord {
  id: number;
  disputeId: number;
  evidenceType?: 'CONTRACT' | 'PAYSLIP' | 'MEDICAL' | 'WITNESS' | 'OTHER' | string;
  fileId?: number;
  uploadedBy?: number;
  uploadedAt?: string;
  remark?: string;
}

export type HrDisputeEvidencePayload = Omit<HrDisputeEvidence, 'id'> & { id?: number };
