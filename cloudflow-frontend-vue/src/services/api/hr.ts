import request from '@/services/api/request'
import type { PageResult } from '@/types'
import { getStoredAuthUser } from '@/utils/authStorage'

export type HrRecord = Record<string, unknown>

export type HrPagedResult<T> = {
  records?: T[]
  rows?: T[]
  total?: number
  current?: number
  size?: number
}

export interface HrPageQuery {
  pageNum?: number
  pageSize?: number
  [key: string]: string | number | boolean | undefined
}

export interface DeptTreeNode extends HrRecord {
  deptId: number
  deptName: string
  parentId?: number
  children?: DeptTreeNode[]
}

export interface PostOption extends HrRecord {
  postId: number
  postName: string
  postCode?: string
  status?: number
}

export interface PositionOption extends HrRecord {
  id: number
  positionId?: number
  positionCode?: string
  positionName: string
  positionType?: string
  positionLevel?: string
  deptId?: number
  deptName?: string
  postId?: number
  postName?: string
  status?: number
}

export interface PositionFamily extends HrRecord {
  id: number
  familyCode: string
  familyName: string
  description?: string
  sortOrder?: number
  status?: number
  createTime?: string
  updateTime?: string
}

export interface PositionFamilyPayload extends HrRecord {
  familyCode: string
  familyName: string
  description?: string
  sortOrder?: number
  status: number
}

export interface JobLevel extends HrRecord {
  id: number
  levelCode: string
  levelName: string
  levelSeries: string
  levelRank: number
  description?: string
  status?: number
  createTime?: string
  updateTime?: string
}

export interface JobLevelPayload extends HrRecord {
  levelCode: string
  levelName: string
  levelSeries: string
  levelRank: number
  description?: string
  status: number
}

export interface PositionPayload extends HrRecord {
  positionCode?: string
  positionName: string
  familyId?: number
  levelId?: number
  postId?: number
  jobDescription?: string
  requirements?: string
  workContent?: string
  status: number
}

export interface PositionQuery extends HrRecord {
  positionCode?: string
  positionName?: string
  familyId?: number
  levelId?: number
  postId?: number
  status?: number
}

export interface PositionDetail extends PositionOption {
  family?: PositionFamily
  level?: JobLevel
  post?: HrRecord
  dept?: HrRecord
  jobDescription?: string
  requirements?: string
  workContent?: string
  createTime?: string
  updateTime?: string
}

export interface ReportingLine extends HrRecord {
  id: number
  employeeId: number
  employeeName?: string
  employeeNo?: string
  reportToId: number
  reportToName?: string
  reportToNo?: string
  reportType: string
  reportTypeDesc?: string
  effectiveDate?: string
  expiryDate?: string
  createTime?: string
  updateTime?: string
}

export interface ReportingLinePayload extends HrRecord {
  employeeId: number
  reportToId: number
  reportType: string
  effectiveDate?: string
  expiryDate?: string
}

export interface ReportingMatrixNode extends HrRecord {
  employeeId: number
  employeeName?: string
  employeeNo?: string
  directReportTo?: ReportingMatrixNode | null
  dottedReportToList?: ReportingMatrixNode[]
  directReports?: ReportingMatrixNode[]
}

export interface ReportingMatrix extends HrRecord {
  deptId: number
  deptName?: string
  reportingLines?: ReportingLine[]
  reportingTree?: ReportingMatrixNode[]
}

export interface HrEmployee extends HrRecord {
  id: number
  employeeNo: string
  name: string
  gender?: string
  birthDate?: string | null
  phone?: string | null
  email?: string | null
  deptId?: number | null
  deptName?: string | null
  postId?: number | null
  postName?: string | null
  positionId?: number | null
  positionName?: string | null
  employeeType?: string
  employeeStatus: string
  hireDate?: string | null
  regularDate?: string | null
  resignDate?: string | null
  userId?: number | null
  createTime?: string
  updateTime?: string
}

export interface HrEmployeePayload extends HrRecord {
  employeeNo: string
  name: string
  gender: string
  birthDate?: string | null
  phone?: string | null
  email?: string | null
  deptId?: number | null
  postId?: number | null
  positionId?: number | null
  employeeType: string
  employeeStatus: string
  hireDate?: string | null
  regularDate?: string | null
  resignDate?: string | null
  userId?: number | null
}

export interface EmployeeContract extends HrRecord {
  id: number
  employeeId: number
  contractType: string
  contractNo: string
  signDate: string
  startDate: string
  endDate: string
  duration?: number | null
  attachmentUrls?: string[] | null
  status?: string | null
  remainingDays?: number | null
}

export interface EmployeeContractPayload extends HrRecord {
  employeeId?: number
  contractType: string
  contractNo: string
  signDate: string
  startDate: string
  endDate: string
  duration?: number | null
  attachmentUrls?: string | string[] | null
  status?: string | null
}

export interface EmployeeDocument extends HrRecord {
  id: number
  employeeId: number
  documentType: string
  documentNo: string
  issueDate?: string | null
  expiryDate?: string | null
  attachmentUrls?: string[] | null
}

export interface EmployeeDocumentPayload extends HrRecord {
  employeeId?: number
  documentType: string
  documentNo: string
  issueDate?: string | null
  expiryDate?: string | null
  attachmentUrls?: string | string[] | null
}

export interface EmergencyContact extends HrRecord {
  id: number
  employeeId: number
  employeeName?: string | null
  employeeNo?: string | null
  contactName: string
  relationship: string
  relationshipName?: string | null
  phone: string
  address?: string | null
  priority?: number | null
  createTime?: string
  updateTime?: string
}

export interface EmergencyContactPayload extends HrRecord {
  employeeId: number
  contactName: string
  relationship: string
  phone: string
  address?: string | null
  priority?: number | null
}

export interface HrShift extends HrRecord {
  id: number
  shiftCode?: string
  shiftName: string
  startTime: string
  endTime: string
  breakMinutes?: number
  lateThreshold?: number
  earlyThreshold?: number
  workMinutes?: number
  color?: string
  description?: string
  status?: number
  statusDesc?: string
  createTime?: string
  updateTime?: string
}

export interface HrScheduleRule extends HrRecord {
  id: number
  ruleName: string
  ruleType: string
  ruleConfig?: string
  description?: string
  status?: number
}

export type HrScheduleTargetType = 'EMPLOYEE' | 'POST' | 'DEPT'
export type HrSchedulePlanStatus = 'DRAFT' | 'PUBLISHED' | 'CANCELLED'

export interface HrSchedulePlan extends HrRecord {
  id: number
  tenantId?: number
  planName: string
  targetType: HrScheduleTargetType | string
  targetId: number
  targetName?: string
  shiftId: number
  shiftName?: string
  shiftCode?: string
  scheduleDate: string
  status: HrSchedulePlanStatus | string
  createTime?: string
  updateTime?: string
}

export interface HrSchedulePlanPayload extends HrRecord {
  planName: string
  targetType: HrScheduleTargetType
  targetId: number
  shiftId: number
  scheduleDate: string
}

export interface HrSchedulePlanBatchPayload extends HrRecord {
  planName: string
  targetType: HrScheduleTargetType
  targetIds: number[]
  shiftId: number
  startDate: string
  endDate: string
}

export interface HrSchedulePlanQuery extends HrRecord {
  targetType?: HrScheduleTargetType | string
  targetId?: number
  shiftId?: number
  startDate?: string
  endDate?: string
  status?: HrSchedulePlanStatus | string
}

export interface HrScheduleCalendar extends HrRecord {
  employeeId: number
  employeeName?: string
  yearMonth: string
  schedulePlans?: HrSchedulePlan[]
  statistics?: {
    totalDays?: number
    workDays?: number
    restDays?: number
    expectedWorkHours?: number
  }
}

export interface AttendanceRuleConfig {
  shiftId?: number
  workDays?: number[]
  checkMethods?: string[]
  locationPoints?: Array<{
    name?: string
    latitude?: number
    longitude?: number
    radius?: number
  }>
  wifiConfigs?: Array<{
    ssid?: string
    bssid?: string
  }>
  overtimeEnabled?: boolean
  overtimeMinMinutes?: number
  lateToleranceCount?: number
  severeLateMinutes?: number
  absentMinutes?: number
  photoRequired?: boolean
  radius?: number
  coreTime?: {
    start?: string
    end?: string
  }
  dailyHours?: number
}

export interface AttendanceRuleAssignment extends HrRecord {
  id: number
  ruleId: number
  targetType: 'DEPT' | 'POST' | 'EMPLOYEE'
  targetId: number
  targetName?: string
  effectiveStart: string
  effectiveEnd?: string
  status?: number
  statusDesc?: string
}

export interface WorkCalendarDay extends HrRecord {
  id: number
  calendarDate: string
  dayType: 'WORKDAY' | 'REST' | 'HOLIDAY'
  dayTypeName?: string
  dayName?: string
  source?: string
  status?: number
  statusDesc?: string
}

export interface EffectiveAttendanceRule extends HrRecord {
  ruleId: number
  ruleName: string
  ruleType: string
  sourceType?: string
  sourceTargetId?: number
  sourceTargetName?: string
  shiftId?: number
  shiftName?: string
  checkInTime?: string
  checkOutTime?: string
  breakMinutes?: number
  lateThreshold?: number
  earlyThreshold?: number
  severeLateMinutes?: number
  absentMinutes?: number
  overtimeEnabled?: boolean
  overtimeMinMinutes?: number
  photoRequired?: boolean
  radius?: number
  checkMethods?: string[]
  dayType?: string
  dayName?: string
  effectiveDate?: string
}

export interface AttendanceCheckPayload extends HrRecord {
  employeeId?: number
  checkMethod: 'GPS' | 'WIFI' | 'FACE' | string
  location?: string
  latitude?: number
  longitude?: number
  wifiSsid?: string
  faceToken?: string
  remark?: string
}

export interface HrAttendanceRecord extends HrRecord {
  id: number
  employeeId: number
  employeeName?: string
  employeeNo?: string
  deptName?: string
  attendanceDate: string
  ruleId?: number
  ruleName?: string
  shiftId?: number
  shiftName?: string
  checkType?: 'CHECK_IN' | 'CHECK_OUT' | string
  checkTime?: string
  expectedTime?: string
  deviationMinutes?: number
  checkMethod?: string
  location?: string
  status?: string
  processInstanceId?: string
  remark?: string
  createTime?: string
}

export interface AttendanceDaily extends HrRecord {
  employeeId: number
  employeeName?: string
  attendanceDate: string
  shiftId?: number
  shiftName?: string
  checkInRecord?: HrAttendanceRecord | null
  checkOutRecord?: HrAttendanceRecord | null
  attendanceStatus?: string
  lateMinutes?: number
  earlyMinutes?: number
  workMinutes?: number
}

export interface AttendanceRecordQuery extends HrRecord {
  employeeId?: number
  deptId?: number
  startDate?: string
  endDate?: string
  checkType?: string
  status?: string
  pageNum?: number
  pageSize?: number
}

export interface AttendanceSupplement extends HrRecord {
  id?: number
  supplementNo?: string
  employeeId?: number
  employeeName?: string
  attendanceDate: string
  checkType: string
  checkTime: string
  reason: string
  status?: string
  processInstanceId?: string
  createTime?: string
  updateTime?: string
}

export interface AttendanceSupplementForm {
  id?: number
  attendanceDate: string
  checkType: string
  checkTime: string
  reason: string
}

export interface HrAttendanceMonthly extends HrRecord {
  id?: number
  employeeId: number
  employeeName?: string
  employeeNo?: string
  deptId?: number
  deptName?: string
  year: number
  month: number
  workDays?: number
  actualDays?: number
  lateTimes?: number
  earlyTimes?: number
  absentDays?: number
  missingTimes?: number
  leaveDays?: number
  overtimeHours?: number
  attendanceRate?: number
  status?: string
  statusName?: string
  createTime?: string
  updateTime?: string
}

export interface HrAttendanceMonthlyQuery extends HrRecord {
  employeeId?: number
  deptId?: number
  year?: number
  month?: number
  status?: string
  pageNum?: number
  pageSize?: number
}

export interface HrAttendanceAnomaly extends HrRecord {
  employeeId: number
  employeeName?: string
  employeeNo?: string
  deptName?: string
  attendanceDate: string
  anomalyType: string
  anomalyTypeName?: string
  checkTime?: string
  expectedTime?: string
  description?: string
}

export interface HrAttendanceAnomalyQuery extends HrRecord {
  employeeId?: number
  deptId?: number
  anomalyType?: string
  startDate?: string
  endDate?: string
  pageNum?: number
  pageSize?: number
}

export interface HrAttendanceRate extends HrRecord {
  deptId?: number
  deptName?: string
  year: number
  month: number
  totalEmployees?: number
  totalWorkDays?: number
  totalActualDays?: number
  averageAttendanceRate?: number
  totalLateTimes?: number
  totalEarlyTimes?: number
  totalAbsentDays?: number
  totalMissingTimes?: number
}

export interface HrAttendanceReportExportPayload extends HrRecord {
  deptId?: number
  year: number
  month: number
  format: 'EXCEL' | 'PDF' | string
}

export interface SalaryItem extends HrRecord {
  id: number
  itemCode: string
  itemName: string
  itemType: string
  category: string
  formula?: string
  calculationRule?: string
  defaultAmount?: number
  isTaxable?: boolean
  sortOrder?: number
  status?: number
}

export interface SalaryItemPayload extends HrRecord {
  itemCode: string
  itemName: string
  itemType: string
  category: string
  formula?: string
  calculationRule?: string
  defaultAmount?: number
  isTaxable?: boolean
  sortOrder?: number
  status?: number
}

export interface SalaryStructure extends HrRecord {
  id: number
  structureCode: string
  structureName: string
  description?: string
  itemIds?: number[]
  status?: number
}

export interface SalaryStructureDetail extends SalaryStructure {
  items?: SalaryItem[]
}

export interface SalaryStructurePayload extends HrRecord {
  structureCode: string
  structureName: string
  description?: string
  itemIds: number[]
  status?: number
}

export interface SalaryGrade extends HrRecord {
  id?: number
  levelId: number
  levelCode?: string
  levelName?: string
  minSalary: number
  maxSalary: number
  midSalary?: number
  medianSalary?: number
  currency?: string
}

export interface SalaryGradePayload extends HrRecord {
  levelId: number
  minSalary: number
  maxSalary: number
  midSalary: number
  currency?: string
}

export interface JobLevelOption extends HrRecord {
  id: number
  levelCode: string
  levelName: string
  levelSeries?: string
  levelRank?: number
  status?: number
}

export interface EmployeeSalary extends HrRecord {
  id?: number
  employeeId: number
  employeeName?: string
  employeeNo?: string
  deptName?: string
  structureId?: number
  structureName?: string
  structureCode?: string
  totalSalary?: number
  effectiveDate?: string
  status?: string
  statusDesc?: string
}

export interface EmployeeSalaryDetail extends EmployeeSalary {
  items?: Array<HrRecord & {
    itemId: number
    itemCode?: string
    itemName?: string
    amount?: number
  }>
}

export interface EmployeeSalaryAssignPayload extends HrRecord {
  employeeId: number
  structureId: number
  effectiveDate: string
  salaryData: Record<string | number, number | string>
}

export interface SalaryAdjustment extends HrRecord {
  id: number
  applicationNo?: string
  employeeId: number
  employeeName?: string
  employeeNo?: string
  adjustmentType: string
  adjustmentReason?: string
  beforeTotal?: number
  afterTotal?: number
  adjustmentAmount?: number
  effectiveDate?: string
  status?: string
  statusDesc?: string
  createTime?: string
}

export interface SalaryAdjustmentPayload extends HrRecord {
  employeeId: number
  adjustmentType: string
  adjustmentReason?: string
  afterSalaryData: string
  afterTotal: number
  effectiveDate: string
}

export interface SalaryAdjustmentHistory extends HrRecord {
  id: number
  employeeId: number
  adjustmentId?: number
  beforeTotal?: number
  afterTotal?: number
  effectiveDate?: string
  status?: string
}

export interface InsuranceScheme extends HrRecord {
  id: number
  schemeName: string
  city: string
  pensionCompanyRate?: number
  pensionPersonalRate?: number
  medicalCompanyRate?: number
  medicalPersonalRate?: number
  unemploymentCompanyRate?: number
  unemploymentPersonalRate?: number
  injuryCompanyRate?: number
  maternityCompanyRate?: number
  housingFundCompanyRate?: number
  housingFundPersonalRate?: number
  baseMin?: number
  baseMax?: number
  baseRule?: string
  effectiveDate?: string
  status?: number
}

export interface InsuranceSchemePayload extends HrRecord {
  schemeName: string
  city: string
  pensionCompanyRate: number
  pensionPersonalRate: number
  medicalCompanyRate: number
  medicalPersonalRate: number
  unemploymentCompanyRate: number
  unemploymentPersonalRate: number
  injuryCompanyRate: number
  maternityCompanyRate: number
  housingFundCompanyRate: number
  housingFundPersonalRate: number
  baseMin: number
  baseMax: number
  baseRule?: string
  effectiveDate: string
}

export interface EmployeeInsurance extends HrRecord {
  id?: number
  employeeId: number
  employeeName?: string
  employeeNo?: string
  schemeId: number
  schemeName?: string
  city?: string
  base?: number
  effectiveDate?: string
  status?: string
  statusDesc?: string
}

export interface EmployeeInsuranceDetail extends EmployeeInsurance {
  companyTotal?: number
  personalTotal?: number
  totalAmount?: number
}

export interface EmployeeInsuranceAssignPayload extends HrRecord {
  employeeId: number
  schemeId: number
  base: number
  effectiveDate: string
}

export interface InsuranceCalculation extends HrRecord {
  employeeId?: number
  base?: number
  companyTotal?: number
  personalTotal?: number
  totalAmount?: number
}

export interface TaxConfig extends HrRecord {
  id: number
  threshold: number
  effectiveDate?: string
  taxBrackets?: string
  deductionItems?: string
  status?: number
}

export interface TaxConfigPayload extends HrRecord {
  threshold: number
  effectiveDate?: string
  taxBrackets?: string
  deductionItems?: string
  status?: number
}

export interface EmployeeTaxDeduction extends HrRecord {
  id: number
  employeeId: number
  deductionType: string
  deductionTypeName?: string
  amount: number
  startDate?: string
  endDate?: string
  status?: string
  remark?: string
}

export interface EmployeeTaxDeductionPayload extends HrRecord {
  employeeId: number
  deductionType: string
  amount: number
  startDate: string
  endDate?: string
  remark?: string
}

export interface EmployeeTaxDeductionUpdatePayload extends HrRecord {
  deductionType?: string
  amount?: number
  startDate?: string
  endDate?: string
  status?: string
  remark?: string
}

export interface TaxCalculation extends HrRecord {
  employeeId?: number
  threshold?: number
  taxableIncome?: number
  taxableAmount?: number
  taxAmount?: number
  afterTaxIncome?: number
  deductionAmount?: number
}

export interface HrLeaveTypeOption extends HrRecord {
  id: number
  leaveCode: string
  leaveName: string
  needQuota?: boolean
  isPaid?: boolean
  unit: string
  quotaRule?: string
  expiryRule?: string
  status?: number
  createTime?: string
  updateTime?: string
}

export interface HrLeaveTypePayload extends HrRecord {
  leaveCode?: string
  leaveName: string
  needQuota?: boolean
  isPaid?: boolean
  unit: string
  quotaRule?: string
  expiryRule?: string
  status?: number
}

export interface HrLeaveQuotaVO extends HrRecord {
  id: number
  employeeId: number
  employeeName?: string
  leaveTypeId: number
  leaveTypeName?: string
  year: number
  totalQuota: number
  usedQuota: number
  frozenQuota: number
  availableQuota: number
  expiryDate?: string | null
  createTime?: string
  updateTime?: string
}

export interface HrLeaveQuotaInitItem extends HrRecord {
  leaveTypeId: number
  leaveTypeName?: string
  action: 'CREATED' | 'REFRESHED' | 'SKIPPED' | string
  message?: string
  totalQuota?: number
  expiryDate?: string | null
}

export interface HrLeaveQuotaInitResult extends HrRecord {
  employeeId: number
  employeeName?: string
  year: number
  mode: 'SINGLE' | 'BATCH' | string
  requestedCount: number
  createdCount: number
  refreshedCount: number
  skippedCount: number
  items: HrLeaveQuotaInitItem[]
}

export interface HrLeaveQuotaAdjustPayload extends HrRecord {
  employeeId: number
  leaveTypeId: number
  year: number
  adjustmentAmount: number
  expiryDate?: string | null
  reason?: string
}

export interface HrLeaveApplicationVO extends HrRecord {
  id: number
  applicationNo?: string
  employeeId: number
  employeeName?: string
  leaveTypeId: number
  leaveTypeName?: string
  startTime: string
  endTime: string
  duration: number
  unit: string
  reason?: string | null
  processInstanceId?: string | null
  status: string
  createTime?: string
  updateTime?: string
}

export interface HrLeaveApplicationPayload extends HrRecord {
  employeeId: number
  leaveTypeId: number
  startTime: string
  endTime: string
  duration: number
  unit: string
  reason?: string
}

export interface HrLeaveApplicationQuery extends HrRecord {
  employeeId?: number
  leaveTypeId?: number
  status?: string
  startTimeFrom?: string
  startTimeTo?: string
  pageNum?: number
  pageSize?: number
}

export interface HrOvertimeApplicationVO extends HrRecord {
  id: number
  applicationNo?: string
  employeeId: number
  employeeName?: string
  employeeNo?: string
  startTime: string
  endTime: string
  duration: number
  overtimeType: string
  overtimeTypeName?: string
  reason?: string | null
  compensationType: string
  compensationTypeName?: string
  compensationHours?: number | null
  processInstanceId?: string | null
  status: string
  statusName?: string
  createTime?: string
  updateTime?: string
}

export interface HrOvertimeApplicationPayload extends HrRecord {
  employeeId: number
  startTime: string
  endTime: string
  overtimeType: string
  reason?: string
  compensationType: string
}

export interface HrOvertimeApplicationQuery extends HrRecord {
  employeeId?: number
  overtimeType?: string
  status?: string
  startTimeFrom?: string
  startTimeTo?: string
  pageNum?: number
  pageSize?: number
}

export interface HrOvertimeStatisticsVO extends HrRecord {
  employeeId: number
  employeeName?: string
  employeeNo?: string
  year: number
  month: number
  workdayHours?: number
  weekendHours?: number
  holidayHours?: number
  totalHours?: number
  timeOffHours?: number
  paymentHours?: number
  overtimeCount?: number
}

export interface PerformanceMetric extends HrRecord {
  metricCode: string
  metricName: string
  metricUnit: string
  valueType?: 'DECIMAL' | 'INTEGER' | 'PERCENT' | string
  metricValueType?: 'DECIMAL' | 'INTEGER' | 'PERCENT' | string
  precision?: number
  metricPrecision?: number
  metricWeight?: number
}

export interface PerformanceCategoryDefinition extends HrRecord {
  categoryCode: string
  categoryName: string
}

export interface PerformanceCategoryAllocation extends HrRecord {
  categoryCode: string
  categoryName?: string
  metricCode?: string
  metricName?: string
  metricUnit?: string
  metricWeight?: number
  targetAmount?: number
  locked?: boolean
}

export interface PerformanceDepartmentAllocation extends HrRecord {
  deptId: number
  deptName?: string
  targetAmount?: number
  ownerEmployeeId?: number
  categories?: PerformanceCategoryAllocation[]
}

export interface PerformanceAssignment extends HrRecord {
  id: number
  objectiveId: number
  parentId?: number
  nodeKey?: string
  assigneeType: 'DEPT' | 'EMPLOYEE' | string
  assigneeId?: number
  assigneeName?: string
  employeeId?: number
  employeeName?: string
  categoryCode?: string
  categoryName?: string
  metricCode?: string
  metricName?: string
  metricUnit?: string
  metricValueType?: string
  metricPrecision?: number
  metricWeight?: number
  targetAmount?: number
  actualAmount?: number
  completionRate?: number
  cappedRate?: number
  score?: number
  grade?: string
  quotaSource?: string
  locked?: boolean
  ownerEmployeeId?: number
  sortOrder?: number
  status?: string
  children?: PerformanceAssignment[]
}

export interface PerformanceObjective extends HrRecord {
  id: number
  objectiveNo?: string
  cycleName: string
  cycleStartDate?: string
  cycleEndDate?: string
  objectiveName: string
  totalTargetAmount?: number
  actualAmount?: number
  completionRate?: number
  cappedRate?: number
  score?: number
  grade?: string
  categoryCodes?: string[]
  categoryDefinitions?: PerformanceCategoryDefinition[]
  metrics?: PerformanceMetric[]
  scoreCap?: number
  archivedActualAmount?: number
  archivedCompletionRate?: number
  archivedCappedRate?: number
  archivedScore?: number
  archivedGrade?: string
  archivedTime?: string
  planProcessInstanceId?: string
  resultProcessInstanceId?: string
  status: string
  departmentCount?: number
  leafTaskCount?: number
  createTime?: string
  updateTime?: string
  assignments?: PerformanceAssignment[]
}

export interface PerformanceOverview extends HrRecord {
  draftCount?: number
  planApprovingCount?: number
  runningCount?: number
  resultApprovingCount?: number
  completedCount?: number
  objectiveCount?: number
  activeObjectiveCount?: number
  completedObjectiveCount?: number
  averageCompletionRate?: number
}

export interface PerformanceObjectivePayload extends HrRecord {
  cycleName: string
  cycleStartDate: string
  cycleEndDate: string
  objectiveName: string
  totalTargetAmount?: number
  categoryCodes?: string[]
  categoryDefinitions?: PerformanceCategoryDefinition[]
  metrics?: PerformanceMetric[]
  scoreCap?: number
  departmentAssignments?: PerformanceDepartmentAllocation[]
}

export interface RecruitmentRequest extends HrRecord {
  id: number
  requestNo?: string
  deptId?: number
  deptName?: string
  positionId?: number
  positionName?: string
  headcount?: number
  hiredCount?: number
  jobRequirements?: string
  salaryMin?: number
  salaryMax?: number
  expectedDate?: string
  processInstanceId?: string
  status?: string
  statusDesc?: string
  createTime?: string
  updateTime?: string
}

export interface RecruitmentRequestPayload extends HrRecord {
  deptId: number
  positionId: number
  headcount: number
  jobRequirements?: string
  salaryMin?: number
  salaryMax?: number
  expectedDate?: string
}

export interface Candidate extends HrRecord {
  id: number
  candidateNo?: string
  requestId?: number
  requestNo?: string
  deptId?: number
  deptName?: string
  positionId?: number
  positionName?: string
  salaryMin?: number
  salaryMax?: number
  expectedDate?: string
  name: string
  gender?: string
  genderDesc?: string
  phone?: string
  email?: string
  resumeAttachmentUrls?: string[]
  source?: string
  sourceDesc?: string
  status?: string
  statusDesc?: string
  rejectReason?: string
  createTime?: string
  updateTime?: string
}

export interface CandidatePayload extends HrRecord {
  requestId?: number
  name: string
  gender?: string
  phone?: string
  email?: string
  resumeAttachmentUrls?: string[] | string | null
  source?: string
}

export interface Interview extends HrRecord {
  id: number
  candidateId: number
  candidateName?: string
  interviewRound?: string
  interviewRoundName?: string
  interviewType?: string
  interviewTypeName?: string
  interviewTime?: string
  location?: string
  interviewerIds?: number[]
  interviewerNames?: string[]
  evaluation?: string
  score?: number
  result?: string
  resultName?: string
  status?: string
  statusName?: string
  createTime?: string
  updateTime?: string
}

export interface InterviewSchedulePayload extends HrRecord {
  candidateId: number
  interviewRound?: string
  interviewType?: string
  interviewTime: string
  location?: string
  interviewerIds?: number[]
}

export interface InterviewEvaluationPayload extends HrRecord {
  evaluation: string
  score?: number
  result: string
}

export interface Offer extends HrRecord {
  id: number
  offerNo?: string
  candidateId: number
  candidateName?: string
  deptId?: number
  deptName?: string
  positionId?: number
  positionName?: string
  salary?: number
  expectedDate?: string
  expectedArrivalDate?: string
  expiryDate?: string
  offerContent?: string
  processInstanceId?: string
  status?: string
  statusDesc?: string
  createTime?: string
  updateTime?: string
}

export interface OfferPayload extends HrRecord {
  candidateId: number
  deptId?: number
  positionId?: number
  salary?: number
  expectedDate?: string
  expiryDate?: string
  offerContent?: string
}

export interface Headcount extends HrRecord {
  id: number
  targetType: string
  targetId: number
  targetName?: string
  approvedCount: number
  actualCount: number
  vacancyCount: number
  effectiveDate?: string
  expiryDate?: string
  createTime?: string
  updateTime?: string
}

export interface HeadcountPayload extends HrRecord {
  targetType: string
  targetId: number
  approvedCount: number
  effectiveDate?: string
  expiryDate?: string
}

export interface HeadcountStatistics extends HrRecord {
  targetType: string
  targetId: number
  targetName?: string
  approvedCount: number
  actualCount: number
  vacancyCount: number
  utilizationRate?: number
  isOverstaffed?: boolean
}

export interface OnboardingApplication extends HrRecord {
  id: number
  applicationNo?: string
  candidateId?: number
  name: string
  gender?: string
  phone?: string
  email?: string
  deptId?: number
  deptName?: string
  postId?: number
  postName?: string
  positionId?: number
  positionName?: string
  expectedDate?: string
  processInstanceId?: string
  status?: string
  statusDesc?: string
  employeeId?: number
  createTime?: string
  updateTime?: string
}

export interface OnboardingApplicationPayload extends HrRecord {
  candidateId?: number
  name: string
  gender: string
  phone: string
  email?: string
  deptId: number
  postId: number
  positionId?: number
  expectedDate: string
}

export interface OnboardingTask extends HrRecord {
  id: number
  applicationId: number
  taskName: string
  taskType?: string
  taskTypeDesc?: string
  taskDescription?: string
  assigneeId?: number
  assigneeName?: string
  status?: string
  statusDesc?: string
  completedTime?: string
  remark?: string
  createTime?: string
}

export interface ProbationConfirmation extends HrRecord {
  id: number
  applicationNo?: string
  employeeId: number
  employeeName?: string
  employeeNo?: string
  probationStartDate?: string
  probationEndDate?: string
  expectedRegularDate?: string
  selfEvaluation?: string
  managerEvaluation?: string
  processInstanceId?: string
  status?: string
  statusDesc?: string
  rejectReason?: string
  extensionDays?: number
  createTime?: string
}

export interface ProbationConfirmationPayload extends HrRecord {
  employeeId: number
  probationStartDate?: string
  probationEndDate?: string
  expectedRegularDate?: string
  selfEvaluation?: string
  managerEvaluation?: string
}

export interface TransferApplication extends HrRecord {
  id: number
  applicationNo?: string
  employeeId: number
  employeeName?: string
  employeeNo?: string
  fromDeptId?: number
  fromDeptName?: string
  fromPostId?: number
  fromPostName?: string
  fromPositionId?: number
  fromPositionName?: string
  toDeptId: number
  toDeptName?: string
  toPostId: number
  toPostName?: string
  toPositionId?: number
  toPositionName?: string
  transferType: string
  transferTypeDesc?: string
  reason?: string
  effectiveDate?: string
  salaryChange?: boolean
  processInstanceId?: string
  status?: string
  statusDesc?: string
  createTime?: string
}

export interface TransferApplicationPayload extends HrRecord {
  employeeId: number
  toDeptId: number
  toPostId: number
  toPositionId?: number
  transferType: string
  reason?: string
  effectiveDate?: string
  salaryChange?: boolean
}

export interface ResignationApplication extends HrRecord {
  id: number
  applicationNo?: string
  employeeId: number
  employeeName?: string
  employeeNo?: string
  resignationType: string
  resignationTypeDesc?: string
  resignationReason?: string
  expectedDate?: string
  actualDate?: string
  interviewContent?: string
  processInstanceId?: string
  status?: string
  statusDesc?: string
  createTime?: string
}

export interface ResignationApplicationPayload extends HrRecord {
  employeeId: number
  resignationType: string
  resignationReason?: string
  expectedDate?: string
}

export interface ResignationHandover extends HrRecord {
  id: number
  applicationId: number
  handoverItem?: string
  handoverType?: string
  handoverTypeDesc?: string
  handoverToId?: number
  handoverToName?: string
  status?: string
  statusDesc?: string
  completedTime?: string
  remark?: string
  createTime?: string
}

const employeeResolverMap = new Map<string, Promise<HrEmployee>>()

const readStoredUser = (): Record<string, unknown> | null => {
  try {
    const raw = getStoredAuthUser()
    return raw ? (JSON.parse(raw) as Record<string, unknown>) : null
  } catch {
    return null
  }
}

const readStoredUserId = () => {
  const storedUser = readStoredUser()
  return storedUser?.id ?? storedUser?.userId ?? storedUser?.user_id
}

const getCurrentUserId = (userId?: number | string) => {
  const value = userId ?? readStoredUserId()
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error('未找到当前登录用户')
  }
  return parsed
}

const getEmployeeCacheKey = (userId?: number | string) => {
  const storedUser = readStoredUser()
  return `hr:employee:${storedUser?.tenantId ?? 'default'}:${getCurrentUserId(userId)}`
}

const readCachedEmployee = (cacheKey: string) => {
  const cached = sessionStorage.getItem(cacheKey)
  if (!cached) return null
  try {
    return JSON.parse(cached) as HrEmployee
  } catch {
    sessionStorage.removeItem(cacheKey)
    return null
  }
}

const storeResolvedEmployee = (cacheKey: string, employee: HrEmployee) => {
  sessionStorage.setItem(cacheKey, JSON.stringify(employee))
  return employee
}

const isCurrentSignedInUser = (userId?: number | string) => {
  if (userId == null) return true
  const storedUserId = Number(readStoredUserId())
  if (!Number.isFinite(storedUserId) || storedUserId <= 0) return false
  return Number(userId) === storedUserId
}

const resolveEmployeeByUserId = async (targetUserId: number) => {
  const employees = await listEmployees()
  const matched = employees.find((employee) => employee.userId === targetUserId)
  if (!matched) throw new Error('当前登录用户未关联 HR 员工档案')
  return matched
}

const normalizeCheckTime = (attendanceDate: string, checkTime: string) => {
  const normalizedTime = checkTime.length === 5 ? `${checkTime}:00` : checkTime
  return normalizedTime.includes(' ') ? normalizedTime : `${attendanceDate} ${normalizedTime}`
}

const mapSupplementRecord = (item: HrAttendanceRecord): AttendanceSupplement => ({
  id: item.id,
  supplementNo: item.id ? `ATTENDANCE-${item.id}` : undefined,
  employeeId: item.employeeId,
  employeeName: item.employeeName,
  attendanceDate: item.attendanceDate,
  checkType: item.checkType || 'CHECK_IN',
  checkTime: item.checkTime || '',
  reason: item.remark || '',
  status: item.status,
  processInstanceId: item.processInstanceId,
  createTime: item.createTime,
  updateTime: item.updateTime as string | undefined
})

const paginate = <T>(items: T[], pageNum = 1, pageSize = 10): PageResult<T> => {
  const start = Math.max(pageNum - 1, 0) * pageSize
  const rows = items.slice(start, start + pageSize)
  return { total: items.length, rows, records: rows }
}

const normalizeOptionalFilter = (value?: string) => {
  const normalized = value?.trim()
  return normalized || undefined
}

const normalizeSupplementPayload = async (data: AttendanceSupplementForm) => {
  const employee = await assertCurrentEmployeeCanStartSelfService('考勤补录')
  return {
    employeeId: employee.id,
    attendanceDate: data.attendanceDate,
    checkType: data.checkType,
    checkTime: normalizeCheckTime(data.attendanceDate, data.checkTime),
    reason: data.reason.trim()
  }
}

export const listEmployees = (params?: HrPageQuery) =>
  request.get<HrEmployee[]>('/hr/employee/list', { params })

export const getCurrentHrEmployee = () =>
  request.get<HrEmployee>('/hr/employee/current')

export const getEmployeeDetail = (id: number) =>
  request.get<HrEmployee>(`/hr/employee/${id}`)

export const createEmployee = (data: HrEmployeePayload) =>
  request.post<number>('/hr/employee', data)

export const updateEmployee = (id: number, data: Partial<HrEmployeePayload>) =>
  request.put<void>(`/hr/employee/${id}`, data)

export const deleteEmployee = (id: number) =>
  request.delete<void>(`/hr/employee/${id}`)

export const getDeptTreeOptions = () =>
  request.get<DeptTreeNode[]>('/auth/system/dept/tree')

export const getPostOptions = () =>
  request.get<PageResult<PostOption>>('/auth/system/post/list')

export const getPositionOptions = (params?: HrPageQuery) =>
  request.get<PositionOption[]>('/hr/position/list', { params })
export const listPositionFamilies = () =>
  request.get<PositionFamily[]>('/hr/position-family/list')
export const getPositionFamily = (id: number) =>
  request.get<PositionFamily>(`/hr/position-family/${id}`)
export const createPositionFamily = (data: PositionFamilyPayload) =>
  request.post<number>('/hr/position-family', data)
export const updatePositionFamily = (id: number, data: PositionFamilyPayload) =>
  request.put<void>(`/hr/position-family/${id}`, data)
export const deletePositionFamily = (id: number) =>
  request.delete<void>(`/hr/position-family/${id}`)
export const createJobLevel = (data: JobLevelPayload) =>
  request.post<number>('/hr/job-level', data)
export const updateJobLevel = (id: number, data: JobLevelPayload) =>
  request.put<void>(`/hr/job-level/${id}`, data)
export const getJobLevel = (id: number) =>
  request.get<JobLevel>(`/hr/job-level/${id}`)
export const deleteJobLevel = (id: number) =>
  request.delete<void>(`/hr/job-level/${id}`)
export const listPositions = (params?: PositionQuery) =>
  request.get<PositionOption[]>('/hr/position/list', { params })
export const getPosition = (id: number) =>
  request.get<PositionDetail>(`/hr/position/${id}`)
export const createPosition = (data: PositionPayload & { positionCode: string }) =>
  request.post<number>('/hr/position', data)
export const updatePosition = (id: number, data: PositionPayload) =>
  request.put<void>(`/hr/position/${id}`, data)
export const deletePosition = (id: number) =>
  request.delete<void>(`/hr/position/${id}`)
export const setReportingLine = (data: ReportingLinePayload) =>
  request.post<void>('/hr/reporting-line/set', data)
export const listReportingLines = (employeeId: number) =>
  request.get<ReportingLine[]>(`/hr/reporting-line/employee/${employeeId}`)
export const getReportingMatrix = (deptId: number) =>
  request.get<ReportingMatrix>(`/hr/reporting-line/matrix/${deptId}`)
export const deleteReportingLine = (id: number) =>
  request.delete<void>(`/hr/reporting-line/${id}`)

export const listEmployeeContracts = (employeeId: number) =>
  request.get<EmployeeContract[]>(`/hr/employee/${employeeId}/contracts`)
export const getEmployeeContract = (id: number) =>
  request.get<EmployeeContract>(`/hr/employee/contract/${id}`)
export const createEmployeeContract = (data: EmployeeContractPayload) =>
  request.post<number>('/hr/employee/contract', data)
export const updateEmployeeContract = (id: number, data: Partial<EmployeeContractPayload>) =>
  request.put<void>(`/hr/employee/contract/${id}`, data)
export const deleteEmployeeContract = (id: number) =>
  request.delete<void>(`/hr/employee/contract/${id}`)
export const listExpiringEmployeeContracts = (days = 30) =>
  request.get<EmployeeContract[]>('/hr/employee/contract/expiring', { params: { days } })

export const listEmployeeDocuments = (employeeId: number) =>
  request.get<EmployeeDocument[]>(`/hr/employee/${employeeId}/documents`)
export const getEmployeeDocument = (id: number) =>
  request.get<EmployeeDocument>(`/hr/employee/document/${id}`)
export const createEmployeeDocument = (data: EmployeeDocumentPayload) =>
  request.post<number>('/hr/employee/document', data)
export const updateEmployeeDocument = (id: number, data: Partial<EmployeeDocumentPayload>) =>
  request.put<void>(`/hr/employee/document/${id}`, data)
export const deleteEmployeeDocument = (id: number) =>
  request.delete<void>(`/hr/employee/document/${id}`)

export const listEmergencyContacts = (employeeId: number) =>
  request.get<EmergencyContact[]>(`/hr/employee/${employeeId}/emergency-contacts`)
export const getEmergencyContact = (id: number) =>
  request.get<EmergencyContact>(`/hr/employee/emergency-contact/${id}`)
export const createEmergencyContact = (data: EmergencyContactPayload) =>
  request.post<number>('/hr/employee/emergency-contact', data)
export const updateEmergencyContact = (id: number, data: Partial<EmergencyContactPayload>) =>
  request.put<void>(`/hr/employee/emergency-contact/${id}`, data)
export const deleteEmergencyContact = (id: number) =>
  request.delete<void>(`/hr/employee/emergency-contact/${id}`)

export const resolveCurrentEmployee = async (userId?: number | string) => {
  const cacheKey = getEmployeeCacheKey(userId)
  const cached = readCachedEmployee(cacheKey)
  if (cached) return cached

  if (!employeeResolverMap.has(cacheKey)) {
    const targetUserId = getCurrentUserId(userId)
    const promise = (async () => {
      if (isCurrentSignedInUser(userId)) {
        const employee = await getCurrentHrEmployee()
        return storeResolvedEmployee(cacheKey, employee)
      }

      const employee = await resolveEmployeeByUserId(targetUserId)
      return storeResolvedEmployee(cacheKey, employee)
    })().finally(() => {
      employeeResolverMap.delete(cacheKey)
    })
    employeeResolverMap.set(cacheKey, promise)
  }

  return employeeResolverMap.get(cacheKey)!
}

export const resolveCurrentEmployeeId = async (userId?: number | string) =>
  (await resolveCurrentEmployee(userId)).id

const HR_SELF_SERVICE_ALLOWED_STATUSES = new Set(['PROBATION', 'REGULAR'])

export const getHrEmployeeStatusLabel = (status?: string | null) => {
  switch (String(status || '').toUpperCase()) {
    case 'PROBATION':
      return '试用员工'
    case 'REGULAR':
      return '正式员工'
    case 'RESIGNED':
      return '已离职'
    default:
      return status || '未知状态'
  }
}

export const isHrSelfServiceCreatableEmployee = (employee?: HrEmployee | null) =>
  HR_SELF_SERVICE_ALLOWED_STATUSES.has(String(employee?.employeeStatus || '').toUpperCase())

export const getHrSelfServiceRestrictionMessage = (employee?: HrEmployee | null) => {
  if (!employee) return '当前登录用户未关联 HR 员工档案，请联系 HR 完成员工档案绑定。'
  if (isHrSelfServiceCreatableEmployee(employee)) return ''
  return `当前员工状态为“${getHrEmployeeStatusLabel(employee.employeeStatus)}”，不能发起 HR 自助操作。`
}

export const assertCurrentEmployeeCanStartSelfService = async (
  actionLabel: string,
  userId?: number | string
) => {
  const employee = await resolveCurrentEmployee(userId)
  const restrictionMessage = getHrSelfServiceRestrictionMessage(employee)
  if (restrictionMessage) throw new Error(`${restrictionMessage} 当前操作：${actionLabel}。`)
  return employee
}

export const listHrShifts = () => request.get<HrShift[]>('/hr/schedule/shift/list')
export const createHrShift = (data: Omit<HrShift, 'id'> & HrRecord) =>
  request.post<number>('/hr/schedule/shift', data)
export const updateHrShift = (id: number, data: Partial<HrShift>) =>
  request.put<void>(`/hr/schedule/shift/${id}`, data)
export const deleteHrShift = (id: number) =>
  request.delete<void>(`/hr/schedule/shift/${id}`)
export const getHrScheduleRule = (id: number) =>
  request.get<HrScheduleRule>(`/hr/schedule/rule/${id}`)
export const listHrScheduleRules = () => request.get<HrScheduleRule[]>('/hr/schedule/rule/list')
export const createHrScheduleRule = (data: Omit<HrScheduleRule, 'id'> & HrRecord) =>
  request.post<number>('/hr/schedule/rule', data)
export const updateHrScheduleRule = (id: number, data: Partial<HrScheduleRule>) =>
  request.put<void>(`/hr/schedule/rule/${id}`, data)
export const deleteHrScheduleRule = (id: number) =>
  request.delete<void>(`/hr/schedule/rule/${id}`)
export const listHrScheduleRuleAssignments = (ruleId: number) =>
  request.get<AttendanceRuleAssignment[]>(`/hr/schedule/rule/${ruleId}/assignments`)
export const createHrScheduleRuleAssignment = (
  ruleId: number,
  data: Omit<AttendanceRuleAssignment, 'id' | 'ruleId'> & HrRecord
) => request.post<number>(`/hr/schedule/rule/${ruleId}/assignments`, data)
export const deleteHrScheduleRuleAssignment = (assignmentId: number) =>
  request.delete<void>(`/hr/schedule/rule/assignments/${assignmentId}`)
export const listHrSchedulePlans = (params?: HrSchedulePlanQuery) =>
  request.get<HrSchedulePlan[]>('/hr/schedule/plan/list', { params })
export const createHrSchedulePlan = (data: HrSchedulePlanPayload) =>
  request.post<void>('/hr/schedule/plan', data)
export const batchCreateHrSchedulePlans = (data: HrSchedulePlanBatchPayload) =>
  request.post<void>('/hr/schedule/plan/batch', data)
export const publishHrSchedulePlans = (planIds: number[]) =>
  request.post<void>('/hr/schedule/plan/publish', planIds)
export const cancelHrSchedulePlan = (planId: number) =>
  request.post<void>(`/hr/schedule/plan/${planId}/cancel`)
export const getHrScheduleCalendar = (employeeId: number, yearMonth: string) =>
  request.get<HrScheduleCalendar>(`/hr/schedule/plan/calendar/${employeeId}`, { params: { yearMonth } })
export const getEffectiveAttendanceRule = (params?: { employeeId?: number; date?: string }) =>
  request.get<EffectiveAttendanceRule>('/hr/attendance/rule/effective', { params })
export const hrCheckIn = (data: AttendanceCheckPayload) =>
  request.post<void>('/hr/attendance/check-in', data)
export const hrCheckOut = (data: AttendanceCheckPayload) =>
  request.post<void>('/hr/attendance/check-out', data)
export const listHrAttendanceRecords = (params?: AttendanceRecordQuery) =>
  request.get<HrAttendanceRecord[]>('/hr/attendance/records', { params })
export const getHrAttendanceDaily = (employeeId: number, date: string) =>
  request.get<AttendanceDaily>('/hr/attendance/daily', { params: { employeeId, date } })
export const generateHrAttendanceMonthly = (year: number, month: number) =>
  request.post<void>('/hr/attendance/statistics/monthly/generate', undefined, { params: { year, month } })
export const generateHrEmployeeAttendanceMonthly = (employeeId: number, year: number, month: number) =>
  request.post<void>(`/hr/attendance/statistics/monthly/generate/${employeeId}`, undefined, { params: { year, month } })
export const getHrAttendanceMonthly = (employeeId: number, year: number, month: number) =>
  request.get<HrAttendanceMonthly>(`/hr/attendance/statistics/monthly/${employeeId}`, { params: { year, month } })
export const listHrAttendanceMonthly = (params?: HrAttendanceMonthlyQuery) =>
  request.get<HrAttendanceMonthly[]>('/hr/attendance/statistics/monthly', { params })
export const listHrAttendanceAnomalies = (params?: HrAttendanceAnomalyQuery) =>
  request.get<HrPagedResult<HrAttendanceAnomaly>>('/hr/attendance/statistics/anomalies', { params })
export const getHrAttendanceRate = (params: { deptId?: number; year: number; month: number }) =>
  request.get<HrAttendanceRate>('/hr/attendance/statistics/rate', { params })
export const exportHrAttendanceReport = (data: HrAttendanceReportExportPayload) =>
  request.post<string>('/hr/attendance/statistics/export', data)
export const listAttendanceSupplements = async (params: AttendanceRecordQuery = {}) => {
  const employeeId = params.employeeId ?? await resolveCurrentEmployeeId()
  const records = await request.get<HrAttendanceRecord[]>('/hr/attendance/supplement/list', {
    params: {
      employeeId,
      status: normalizeOptionalFilter(params.status),
      checkType: normalizeOptionalFilter(params.checkType),
      startDate: params.startDate,
      endDate: params.endDate
    }
  })
  return paginate(records.map(mapSupplementRecord), params.pageNum, params.pageSize)
}
export const getAttendanceSupplement = async (id: number) =>
  mapSupplementRecord(await request.get<HrAttendanceRecord>(`/hr/attendance/supplement/${id}`))
export const createAttendanceSupplement = async (data: AttendanceSupplementForm) =>
  request.post<number>('/hr/attendance/supplement', await normalizeSupplementPayload(data))
export const updateAttendanceSupplement = async (id: number, data: AttendanceSupplementForm) =>
  request.put<void>(`/hr/attendance/supplement/${id}`, await normalizeSupplementPayload(data))
export const deleteAttendanceSupplement = (id: number) =>
  request.delete<void>(`/hr/attendance/supplement/${id}`)
export const submitAttendanceSupplement = async (id: number) => {
  await assertCurrentEmployeeCanStartSelfService('提交考勤补录')
  await request.post<void>(`/hr/attendance/supplement/${id}/submit`)
}
export const approveAttendanceSupplement = (id: number) =>
  request.post<void>(`/hr/attendance/supplement/${id}/approve`)
export const rejectAttendanceSupplement = (id: number) =>
  request.post<void>(`/hr/attendance/supplement/${id}/reject`)
export const listWorkCalendarDays = (params?: { startDate?: string; endDate?: string; dayType?: string }) =>
  request.get<WorkCalendarDay[]>('/hr/work-calendar', { params })
export const createWorkCalendarDay = (data: Omit<WorkCalendarDay, 'id'> & HrRecord) =>
  request.post<number>('/hr/work-calendar', data)
export const updateWorkCalendarDay = (id: number, data: Partial<WorkCalendarDay>) =>
  request.put<void>(`/hr/work-calendar/${id}`, data)
export const deleteWorkCalendarDay = (id: number) =>
  request.delete<void>(`/hr/work-calendar/${id}`)

export const listSalaryItems = () =>
  request.get<SalaryItem[]>('/hr/salary/item/list')
export const createSalaryItem = (data: SalaryItemPayload) =>
  request.post<number>('/hr/salary/item', data)
export const updateSalaryItem = (id: number, data: Partial<SalaryItemPayload>) =>
  request.put<void>(`/hr/salary/item/${id}`, data)
export const deleteSalaryItem = (id: number) =>
  request.delete<void>(`/hr/salary/item/${id}`)

export const listSalaryStructures = () =>
  request.get<SalaryStructure[]>('/hr/salary/structure/list')
export const getSalaryStructure = (id: number) =>
  request.get<SalaryStructureDetail>(`/hr/salary/structure/${id}`)
export const createSalaryStructure = (data: SalaryStructurePayload) =>
  request.post<number>('/hr/salary/structure', data)
export const updateSalaryStructure = (id: number, data: Partial<SalaryStructurePayload>) =>
  request.put<void>(`/hr/salary/structure/${id}`, data)
export const deleteSalaryStructure = (id: number) =>
  request.delete<void>(`/hr/salary/structure/${id}`)

export const listSalaryGrades = () =>
  request.get<SalaryGrade[]>('/hr/salary/grade/list')
export const setSalaryGrade = (data: SalaryGradePayload) =>
  request.post<void>('/hr/salary/grade', data)
export const deleteSalaryGrade = (levelId: number) =>
  request.delete<void>(`/hr/salary/grade/level/${levelId}`)
export const listJobLevels = (params?: { levelSeries?: string }) =>
  request.get<JobLevelOption[]>('/hr/job-level/list', { params })

export const assignSalaryStructure = (data: EmployeeSalaryAssignPayload) =>
  request.post<void>('/hr/salary/employee', data)
export const getEmployeeSalary = (employeeId: number) =>
  request.get<EmployeeSalaryDetail>(`/hr/salary/employee/${employeeId}`)
export const listEmployeeSalaries = (params?: HrRecord) =>
  request.get<EmployeeSalary[]>('/hr/salary/employee/list', { params })

export const createSalaryAdjustment = (data: SalaryAdjustmentPayload) =>
  request.post<number>('/hr/salary/adjustment', data)
export const submitSalaryAdjustment = (id: number) =>
  request.post<void>(`/hr/salary/adjustment/${id}/submit`)
export const approveSalaryAdjustment = (id: number) =>
  request.post<void>(`/hr/salary/adjustment/${id}/approve`)
export const effectiveSalaryAdjustment = (id: number) =>
  request.post<void>(`/hr/salary/adjustment/${id}/effective`)
export const getSalaryAdjustment = (id: number) =>
  request.get<SalaryAdjustment>(`/hr/salary/adjustment/${id}`)
export const listSalaryAdjustments = (params?: HrRecord) =>
  request.get<HrPagedResult<SalaryAdjustment>>('/hr/salary/adjustment/list', { params })
export const getSalaryAdjustmentHistory = (employeeId: number) =>
  request.get<SalaryAdjustmentHistory[]>(`/hr/salary/adjustment/history/${employeeId}`)

export const listInsuranceSchemes = () =>
  request.get<InsuranceScheme[]>('/hr/insurance/scheme/list')
export const createInsuranceScheme = (data: InsuranceSchemePayload) =>
  request.post<number>('/hr/insurance/scheme', data)
export const updateInsuranceScheme = (id: number, data: Partial<InsuranceSchemePayload>) =>
  request.put<void>(`/hr/insurance/scheme/${id}`, data)
export const assignInsuranceScheme = (data: EmployeeInsuranceAssignPayload) =>
  request.post<void>('/hr/insurance/employee', data)
export const getEmployeeInsurance = (employeeId: number) =>
  request.get<EmployeeInsuranceDetail>(`/hr/insurance/employee/${employeeId}`)
export const listEmployeeInsurances = (params?: HrRecord) =>
  request.get<HrPagedResult<EmployeeInsurance>>('/hr/insurance/employee/list', { params })
export const calculateEmployeeInsurance = (employeeId: number, salary?: number) =>
  request.get<InsuranceCalculation>(`/hr/insurance/employee/${employeeId}/calculate`, { params: { salary } })

export const createTaxConfig = (data: TaxConfigPayload) =>
  request.post<number>('/hr/tax/config', data)
export const updateTaxConfig = (id: number, data: Partial<TaxConfigPayload>) =>
  request.put<void>(`/hr/tax/config/${id}`, data)
export const getCurrentTaxConfig = () =>
  request.get<TaxConfig>('/hr/tax/config/current')
export const addTaxDeduction = (data: EmployeeTaxDeductionPayload) =>
  request.post<number>('/hr/tax/deduction', data)
export const updateTaxDeduction = (id: number, data: EmployeeTaxDeductionUpdatePayload) =>
  request.put<void>(`/hr/tax/deduction/${id}`, data)
export const deleteTaxDeduction = (id: number) =>
  request.delete<void>(`/hr/tax/deduction/${id}`)
export const listTaxDeductions = (employeeId: number) =>
  request.get<EmployeeTaxDeduction[]>(`/hr/tax/deduction/employee/${employeeId}`)
export const listActiveTaxDeductions = (employeeId: number, year: number, month: number) =>
  request.get<EmployeeTaxDeduction[]>(`/hr/tax/deduction/employee/${employeeId}/active`, { params: { year, month } })
export const calculateTax = (data: HrRecord) =>
  request.post<TaxCalculation>('/hr/tax/calculate', data)

export const listHrLeaveTypes = () =>
  request.get<HrLeaveTypeOption[]>('/hr/leave/type/list')
export const createHrLeaveType = (data: HrLeaveTypePayload) =>
  request.post<number>('/hr/leave/type', data)
export const updateHrLeaveType = (id: number, data: HrLeaveTypePayload) =>
  request.put<void>(`/hr/leave/type/${id}`, data)
export const getHrLeaveQuota = (params: { employeeId: number; leaveTypeId: number; year: number }) =>
  request.get<HrLeaveQuotaVO>('/hr/leave/quota', { params })
export const listHrLeaveQuotaBuckets = (params: { employeeId: number; leaveTypeId: number; year: number }) =>
  request.get<HrLeaveQuotaVO[]>('/hr/leave/quota/buckets', { params })
export const listHrLeaveQuotas = (params: { employeeId: number; year: number }) =>
  request.get<HrLeaveQuotaVO[]>('/hr/leave/quota/list', { params })
export const initHrLeaveQuota = (params: { employeeId: number; year: number; leaveTypeId?: number }) =>
  request.post<HrLeaveQuotaInitResult>('/hr/leave/quota/init', undefined, { params })
export const adjustHrLeaveQuota = (data: HrLeaveQuotaAdjustPayload) =>
  request.post<void>('/hr/leave/quota/adjust', data)
export const createHrLeaveApplication = (data: HrLeaveApplicationPayload) =>
  request.post<number>('/hr/leave/application', data)
export const submitHrLeaveApplication = (id: number) =>
  request.post<void>(`/hr/leave/application/${id}/submit`)
export const approveHrLeaveApplication = (id: number) =>
  request.post<void>(`/hr/leave/application/${id}/approve`)
export const rejectHrLeaveApplication = (id: number) =>
  request.post<void>(`/hr/leave/application/${id}/reject`)
export const cancelHrLeaveApplication = (id: number) =>
  request.post<void>(`/hr/leave/application/${id}/cancel`)
export const getHrLeaveApplication = (id: number) =>
  request.get<HrLeaveApplicationVO>(`/hr/leave/application/${id}`)
export const listHrLeaveApplications = (params?: HrLeaveApplicationQuery) =>
  request.get<HrPagedResult<HrLeaveApplicationVO>>('/hr/leave/application/page', { params })
export const listHrApprovedLeaveBoard = (params?: { startDate?: string; endDate?: string }) =>
  listHrLeaveApplications({
    status: 'APPROVED',
    startTimeFrom: params?.startDate,
    startTimeTo: params?.endDate,
    pageNum: 1,
    pageSize: 1000
  }).then((page) => page.records || page.rows || [])
export const createHrOvertimeApplication = (data: HrOvertimeApplicationPayload) =>
  request.post<number>('/hr/overtime/applications', data)
export const updateHrOvertimeApplication = (id: number, data: HrOvertimeApplicationPayload) =>
  request.put<void>(`/hr/overtime/applications/${id}`, data)
export const deleteHrOvertimeApplication = (id: number) =>
  request.delete<void>(`/hr/overtime/applications/${id}`)
export const submitHrOvertimeApplication = (id: number) =>
  request.post<void>(`/hr/overtime/applications/${id}/submit`)
export const approveHrOvertimeApplication = (id: number) =>
  request.post<void>(`/hr/overtime/applications/${id}/approve`)
export const rejectHrOvertimeApplication = (id: number) =>
  request.post<void>(`/hr/overtime/applications/${id}/reject`)
export const cancelHrOvertimeApplication = (id: number) =>
  request.post<void>(`/hr/overtime/applications/${id}/cancel`)
export const getHrOvertimeApplication = (id: number) =>
  request.get<HrOvertimeApplicationVO>(`/hr/overtime/applications/${id}`)
export const listHrOvertimeApplications = (params?: HrOvertimeApplicationQuery) =>
  request.get<HrOvertimeApplicationVO[]>('/hr/overtime/applications', { params })
export const getHrOvertimeStatistics = (employeeId: number, yearMonth: string) =>
  request.get<HrOvertimeStatisticsVO>(`/hr/overtime/statistics/${employeeId}`, { params: { yearMonth } })

export const createPerformanceObjective = (data: PerformanceObjectivePayload) =>
  request.post<number>('/hr/performance/objective', data)
export const listPerformanceObjectives = (params?: HrRecord) =>
  request.get<HrPagedResult<PerformanceObjective>>('/hr/performance/objective/list', { params })
export const getPerformanceObjective = (id: number) =>
  request.get<PerformanceObjective>(`/hr/performance/objective/${id}`)
export const getPerformanceObjectiveTree = (id: number) =>
  request.get<PerformanceObjective>(`/hr/performance/objective/${id}/tree`)
export const getPerformanceOverview = () =>
  request.get<PerformanceOverview>('/hr/performance/overview')
export const savePerformanceAssignmentChildren = (parentId: number, data: { children: HrRecord[] }) =>
  request.post<void>(`/hr/performance/assignment/${parentId}/children`, data)
export const updatePerformanceResult = (data: { assignmentId: number; actualAmount: number }) =>
  request.post<void>('/hr/performance/result', data)
export const submitPerformancePlan = (id: number) =>
  request.post<void>(`/hr/performance/objective/${id}/submit-plan`)
export const submitPerformanceResult = (id: number) =>
  request.post<void>(`/hr/performance/objective/${id}/submit-result`)
export const createPerformanceSalaryAdjustment = (id: number, data: HrRecord) =>
  request.post<number>(`/hr/performance/objective/${id}/salary-adjustment`, data)

export const listRecruitmentRequests = (params?: HrRecord) =>
  request.get<HrPagedResult<RecruitmentRequest>>('/hr/recruitment-request/list', { params })
export const getRecruitmentRequest = (id: number) =>
  request.get<RecruitmentRequest>(`/hr/recruitment-request/${id}`)
export const createRecruitmentRequest = (data: RecruitmentRequestPayload) =>
  request.post<number>('/hr/recruitment-request', data)
export const submitRecruitmentRequest = (id: number) =>
  request.post<void>(`/hr/recruitment-request/${id}/submit`)
export const approveRecruitmentRequest = (id: number) =>
  request.post<void>(`/hr/recruitment-request/${id}/approve`)
export const completeRecruitmentRequest = (id: number) =>
  request.post<void>(`/hr/recruitment-request/${id}/complete`)
export const cancelRecruitmentRequest = (id: number) =>
  request.post<void>(`/hr/recruitment-request/${id}/cancel`)

export const listCandidates = (params?: HrRecord) =>
  request.get<HrPagedResult<Candidate>>('/hr/candidate/list', { params })
export const getCandidate = (id: number) =>
  request.get<Candidate>(`/hr/candidate/${id}`)
export const createCandidate = (data: CandidatePayload) =>
  request.post<number>('/hr/candidate', data)
export const updateCandidate = (id: number, data: Partial<CandidatePayload>) =>
  request.put<void>(`/hr/candidate/${id}`, data)
export const updateCandidateStatus = (id: number, status: string, rejectReason?: string) =>
  request.put<void>(`/hr/candidate/${id}/status`, undefined, { params: { status, rejectReason } })

export const listInterviews = (params?: HrRecord) =>
  request.get<Interview[]>('/hr/interview/list', { params })
export const getInterview = (id: number) =>
  request.get<Interview>(`/hr/interview/${id}`)
export const scheduleInterview = (data: InterviewSchedulePayload) =>
  request.post<number>('/hr/interview/schedule', data)
export const updateInterview = (id: number, data: Partial<InterviewSchedulePayload>) =>
  request.put<void>(`/hr/interview/${id}`, data)
export const completeInterview = (id: number, data: InterviewEvaluationPayload) =>
  request.post<void>(`/hr/interview/${id}/complete`, data)
export const cancelInterview = (id: number) =>
  request.post<void>(`/hr/interview/${id}/cancel`)

export const listOffers = (params?: HrRecord) =>
  request.get<Offer[]>('/hr/offer/list', { params })
export const getOffer = (id: number) =>
  request.get<Offer>(`/hr/offer/${id}`)
export const createOffer = (data: OfferPayload) =>
  request.post<number>('/hr/offer', data)
export const submitOffer = (id: number) =>
  request.post<void>(`/hr/offer/${id}/submit`)
export const approveOffer = (id: number) =>
  request.post<void>(`/hr/offer/${id}/approve`)
export const sendOffer = (id: number) =>
  request.post<void>(`/hr/offer/${id}/send`)
export const acceptOffer = (id: number) =>
  request.post<void>(`/hr/offer/${id}/accept`)
export const rejectOffer = (id: number) =>
  request.post<void>(`/hr/offer/${id}/reject`)
export const convertOfferToOnboarding = (id: number) =>
  request.post<number>(`/hr/offer/${id}/convert-to-onboarding`)

export const listHeadcounts = (params?: HrRecord) =>
  request.get<Headcount[]>('/hr/headcount/list', { params })
export const setHeadcount = (data: HeadcountPayload) =>
  request.post<void>('/hr/headcount/set', data)
export const getHeadcountStatistics = (targetType: string, targetId: number) =>
  request.get<HeadcountStatistics>('/hr/headcount/statistics', { params: { targetType, targetId } })
export const updateHeadcountActualCount = (targetType: string, targetId: number, actualCount: number) =>
  request.put<void>('/hr/headcount/actual-count', undefined, { params: { targetType, targetId, actualCount } })

export const listOnboardingApplications = (params?: { keyword?: string; status?: string }) =>
  request.get<OnboardingApplication[]>('/hr/onboarding/application/list', { params })
export const getOnboardingApplication = (id: number) =>
  request.get<OnboardingApplication>(`/hr/onboarding/application/${id}`)
export const listOnboardingTasks = (id: number) =>
  request.get<OnboardingTask[]>(`/hr/onboarding/application/${id}/tasks`)
export const createOnboardingApplication = (data: OnboardingApplicationPayload) =>
  request.post<number>('/hr/onboarding/application', data)
export const submitOnboardingApplication = (id: number) =>
  request.post<void>(`/hr/onboarding/application/${id}/submit`)
export const approveOnboardingApplication = (id: number) =>
  request.post<void>(`/hr/onboarding/application/${id}/approve`)
export const rejectOnboardingApplication = (id: number) =>
  request.post<void>(`/hr/onboarding/application/${id}/reject`)
export const completeOnboardingTask = (taskId: number, remark?: string) =>
  request.post<void>('/hr/onboarding/task/complete', { taskId, remark })
export const confirmOnboardingApplication = (applicationId: number, actualDate: string) =>
  request.post<void>('/hr/onboarding/application/confirm', { applicationId, actualDate })

export const createProbationConfirmation = (data: ProbationConfirmationPayload) =>
  request.post<number>('/hr/probation-confirmation', data)
export const submitProbationConfirmation = (id: number) =>
  request.post<void>(`/hr/probation-confirmation/${id}/submit`)
export const approveProbationConfirmation = (id: number) =>
  request.post<void>(`/hr/probation-confirmation/${id}/approve`)
export const rejectProbationConfirmation = (id: number, reason: string, extensionDays?: number) =>
  request.post<void>(`/hr/probation-confirmation/${id}/reject`, undefined, { params: { reason, extensionDays } })
export const getProbationConfirmation = (id: number) =>
  request.get<ProbationConfirmation>(`/hr/probation-confirmation/${id}`)
export const listProbationByEmployee = (employeeId: number) =>
  request.get<ProbationConfirmation[]>(`/hr/probation-confirmation/employee/${employeeId}`)
export const sendProbationReminders = () =>
  request.post<void>('/hr/probation-confirmation/send-reminders')

export const createTransferApplication = (data: TransferApplicationPayload) =>
  request.post<number>('/hr/transfer', data)
export const submitTransferApplication = (id: number) =>
  request.post<void>(`/hr/transfer/${id}/submit`)
export const approveTransferApplication = (id: number) =>
  request.post<void>(`/hr/transfer/${id}/approve`)
export const effectiveTransferApplication = (id: number) =>
  request.post<void>(`/hr/transfer/${id}/effective`)
export const getTransferApplication = (id: number) =>
  request.get<TransferApplication>(`/hr/transfer/${id}`)
export const listTransferByEmployee = (employeeId: number) =>
  request.get<TransferApplication[]>(`/hr/transfer/employee/${employeeId}`)

export const createResignationApplication = (data: ResignationApplicationPayload) =>
  request.post<number>('/hr/resignation', data)
export const submitResignationApplication = (id: number) =>
  request.post<void>(`/hr/resignation/${id}/submit`)
export const approveResignationApplication = (id: number) =>
  request.post<void>(`/hr/resignation/${id}/approve`)
export const completeResignationInterview = (id: number, interviewContent: string) =>
  request.post<void>(`/hr/resignation/${id}/interview`, interviewContent)
export const completeResignationHandover = (handoverId: number, remark?: string) =>
  request.post<void>('/hr/resignation/handover/complete', { handoverId, remark })
export const confirmResignationApplication = (applicationId: number, actualDate: string) =>
  request.post<void>('/hr/resignation/confirm', { applicationId, actualDate })
export const getResignationApplication = (id: number) =>
  request.get<ResignationApplication>(`/hr/resignation/${id}`)
export const listResignationByEmployee = (employeeId: number) =>
  request.get<ResignationApplication[]>(`/hr/resignation/employee/${employeeId}`)
export const listResignationHandovers = (applicationId: number) =>
  request.get<ResignationHandover[]>(`/hr/resignation/${applicationId}/handovers`)
