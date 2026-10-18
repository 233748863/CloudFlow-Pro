export type Hr09Id = string;
export type Hr09Decimal = string;
export type SettleMode = 'PAY' | 'COMPENSATORY';
export type OvertimeDayType = 'WORKDAY' | 'REST_DAY' | 'HOLIDAY';
export type OvertimeStatus = 'DRAFT' | 'SUBMITTED' | 'PENDING' | 'APPROVING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
export type SettlementStatus = 'NOT_READY' | 'PENDING' | 'SETTLED' | 'FAILED' | 'NEEDS_RESOLUTION' | 'CORRECTION_PENDING' | 'REJECTED';
export type ShiftStatus = 'DRAFT' | 'WAITING_ACCEPTANCE' | 'PENDING' | 'APPROVING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
export type PeerAcceptanceStatus = 'NONE' | 'PENDING' | 'ACCEPTED' | 'DECLINED';
export type ShiftApplicationStatus = 'NOT_READY' | 'PENDING' | 'APPLIED' | 'FAILED';

export interface Hr09Page<Result> {
  rows: Result[];
  total: number;
  pageNum: number;
  pageSize: number;
}

export interface VersionDTO { version: number }
export interface ReasonVersionDTO extends VersionDTO { reason: string }
export interface BusinessBlockerVO { code: string; message: string }
export interface RuleWarningVO {
  ruleCode: string;
  dimension: 'DAY' | 'MONTH';
  effect: string;
  limitHours: Hr09Decimal;
  actualHours: Hr09Decimal;
  message: string;
}

export interface TimeSegmentVO {
  startTime: string;
  endTime: string;
  minutes: number;
  kind: 'WORK' | 'BREAK' | 'EXCLUDED';
  sourceCheckinIds: Hr09Id[];
}

export interface OvertimeDraftDTO {
  startTime: string;
  endTime: string;
  settleMode: SettleMode;
  reason: string;
}

export interface OvertimeQuery {
  pageNum: number;
  pageSize: number;
  workDateFrom?: string;
  workDateTo?: string;
  status?: OvertimeStatus;
  settlementStatus?: SettlementStatus;
  settleMode?: SettleMode;
  employeeId?: Hr09Id;
  deptId?: Hr09Id;
}

export interface OvertimeListVO extends VersionDTO {
  requestId: Hr09Id;
  requestNo: string;
  employeeId: Hr09Id;
  employeeName: string;
  deptId: Hr09Id;
  deptName: string;
  workDate: string;
  startTime: string;
  endTime: string;
  overtimeTypeId: Hr09Id;
  overtimeTypeName: string;
  settleMode: SettleMode;
  requestedMinutes: number;
  actualMinutes: number | null;
  actualHours: Hr09Decimal | null;
  approvedMinutes: number | null;
  approvedHours: Hr09Decimal | null;
  status: OvertimeStatus;
  settlementStatus: SettlementStatus;
  settledFlag: 0 | 1;
  createTime: string;
  allowedActions: string[];
}

export interface OvertimeDetailVO extends OvertimeListVO {
  attendanceDate: string | null;
  shiftId: Hr09Id | null;
  shiftName: string | null;
  ruleId: Hr09Id | null;
  calendarId: Hr09Id | null;
  dateType: string | null;
  triplePayFlag: 0 | 1;
  rateMultiplier: Hr09Decimal | null;
  compensatoryRatio: Hr09Decimal | null;
  reason: string;
  reviewedBy: Hr09Id | null;
  reviewedTime: string | null;
  reviewNote: string | null;
  instanceId: string | null;
  calculationSummary: {
    segments?: TimeSegmentVO[];
    actualMinutes?: number;
    excludedMinutes?: number;
    thresholdMinutes?: number;
    expectedMinutes?: number;
    assignmentVersion?: number;
    shiftVersion?: number;
    ruleVersion?: number;
  } | null;
  ruleWarnings: RuleWarningVO[];
  settleTime: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
}

export interface OvertimeHoursReviewDTO extends VersionDTO {
  approvedMinutes: number;
  note: string;
}

export interface OvertimePayReviewDTO extends VersionDTO {
  hourlyRate: Hr09Decimal;
  payrollPeriodId: Hr09Id;
  note: string;
}

export type OvertimeResolutionAction = 'REJECT' | 'COMPENSATORY_ADJUSTMENT' | 'PAY_CORRECTION';
export interface OvertimeResolutionDTO extends ReasonVersionDTO {
  action: OvertimeResolutionAction;
  targetPeriodId?: Hr09Id;
  originalSlipId?: Hr09Id;
}

export interface ResolutionVO {
  action: OvertimeResolutionAction;
  originalPeriodId: Hr09Id;
  targetPeriodId?: Hr09Id | null;
  originalSlipId?: Hr09Id | null;
  correctionSlipId?: Hr09Id | null;
  operatorId: Hr09Id;
  handledTime: string;
  reason: string;
}

export interface OvertimeRoundingVO {
  policy: 'CUMULATIVE_FLOOR_2_V1';
  sourcePeriodId: Hr09Id;
  rawMinutes: number;
  ratio: Hr09Decimal;
  currentCreditHours: Hr09Decimal;
  cumulativeCreditHours: Hr09Decimal;
  residualNumerator: number;
}

export interface OvertimeSettlementVO extends VersionDTO {
  requestId: Hr09Id;
  settleMode: SettleMode;
  settlementStatus: SettlementStatus;
  settledFlag: 0 | 1;
  settleTime: string | null;
  leaveTypeId: Hr09Id | null;
  leavePeriodId: Hr09Id | null;
  compensatoryQuantity: Hr09Decimal | null;
  quantityUnit: string | null;
  compChangeId: Hr09Id | null;
  leaveLedgerId: Hr09Id | null;
  payrollPeriodId: Hr09Id | null;
  payrollCorrectionId: Hr09Id | null;
  salaryComponentId: Hr09Id | null;
  currency: string | null;
  hourlyRate: Hr09Decimal | null;
  settlementAmount: Hr09Decimal | null;
  pricedBy: Hr09Id | null;
  pricedTime: string | null;
  priceNote: string | null;
  resolution: ResolutionVO | null;
  rounding: OvertimeRoundingVO | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  allowedActions: string[];
}

export interface OvertimePreviewVO {
  workDate: string;
  attendanceDate: string;
  calendarId: Hr09Id;
  dateType: string;
  triplePayFlag: 0 | 1;
  overtimeTypeId: Hr09Id;
  overtimeTypeName: string;
  requestedMinutes: number;
  actualMinutes?: number | null;
  actualHours?: Hr09Decimal | null;
  thresholdMinutes: number;
  rateMultiplier?: Hr09Decimal | null;
  compensatoryRatio?: Hr09Decimal | null;
  eligibleSettleModes: SettleMode[];
  segments: TimeSegmentVO[];
  warnings: RuleWarningVO[];
  blockers: BusinessBlockerVO[];
}

export interface OvertimeOptionsVO {
  types: { typeId: Hr09Id; typeName: string; applicableDayType: OvertimeDayType; eligibleSettleModes: SettleMode[] }[];
  businessTimezone: string;
}

export interface OvertimeTypeDTO {
  typeCode: string;
  typeName: string;
  applicableDayType: OvertimeDayType;
  rateMultiplier?: Hr09Decimal | null;
  salaryComponentId?: Hr09Id | null;
  compensatoryFlag: 0 | 1;
  compensatoryRatio?: Hr09Decimal | null;
  compensatoryLeaveTypeId?: Hr09Id | null;
  maxHoursPerMonth?: Hr09Decimal | null;
  maxHoursPerDay?: Hr09Decimal | null;
  needApprovalFlag: 1;
  remark?: string;
}

export interface OvertimeTypeVO extends OvertimeTypeDTO, VersionDTO {
  typeId: Hr09Id;
  status: 0 | 1;
  createTime: string;
  updateTime: string | null;
}

export interface ShiftSlotVO {
  employeeId: Hr09Id;
  attendanceDate: string;
  assignmentId: Hr09Id | null;
  assignmentVersion: number | null;
  shiftId: Hr09Id;
  shiftVersion: number;
  ruleId: Hr09Id | null;
  ruleVersion: number | null;
  startTime: string;
  endTime: string;
  calendarId: Hr09Id | null;
  dateType: string;
}

export interface ShiftDraftDTO {
  requestMode: 'SINGLE' | 'SWAP';
  attendanceDate: string;
  targetShiftId?: Hr09Id;
  targetRuleId?: Hr09Id;
  swapEmployeeId?: Hr09Id;
  reason: string;
}

export interface ShiftRequestQuery {
  pageNum: number;
  pageSize: number;
  dateFrom?: string;
  dateTo?: string;
  status?: ShiftStatus;
  applicationStatus?: ShiftApplicationStatus;
  employeeId?: Hr09Id;
  deptId?: Hr09Id;
}

export interface ShiftRequestVO extends VersionDTO {
  requestId: Hr09Id;
  requestNo: string;
  employeeId: Hr09Id;
  employeeName: string;
  deptName: string;
  requestMode: 'SINGLE' | 'SWAP';
  fromDate: string;
  toDate: string;
  fromShiftId: Hr09Id;
  fromShiftName: string;
  toShiftId: Hr09Id;
  toShiftName: string;
  swapEmployeeId: Hr09Id | null;
  swapEmployeeName: string | null;
  peerAcceptanceStatus: PeerAcceptanceStatus;
  status: ShiftStatus;
  applicationStatus: ShiftApplicationStatus;
  createTime: string;
  allowedActions: string[];
}

export interface ShiftRequestDetailVO extends ShiftRequestVO {
  reason: string;
  fromRuleId: Hr09Id | null;
  toRuleId: Hr09Id | null;
  peerRespondedBy: Hr09Id | null;
  peerRespondedTime: string | null;
  peerResponseNote: string | null;
  minimumRestMinutes: number | null;
  instanceId: string | null;
  approverId: Hr09Id | null;
  appliedTime: string | null;
  beforeSlots: ShiftSlotVO[];
  afterSlots: ShiftSlotVO[];
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
}

export interface ShiftInvitationVO extends VersionDTO {
  requestId: Hr09Id;
  requestNo: string;
  applicantName: string;
  attendanceDate: string;
  ownBefore: ShiftSlotVO;
  ownAfter: ShiftSlotVO;
  applicantBefore: ShiftSlotVO;
  applicantAfter: ShiftSlotVO;
  reason: string;
  peerAcceptanceStatus: PeerAcceptanceStatus;
  status: ShiftStatus;
  allowedActions: string[];
}

export interface ShiftResponseDTO extends VersionDTO {
  decision: 'ACCEPTED' | 'DECLINED';
  note?: string;
}

export interface ShiftOptionsVO {
  attendanceDate: string;
  ownSlot: ShiftSlotVO;
  eligibleShifts: { shiftId: Hr09Id; shiftName: string; ruleId: Hr09Id; startTime: string; endTime: string }[];
  eligiblePeers: { employeeId: Hr09Id; name: string; shiftName: string }[];
}

export interface ShiftPreviewVO {
  beforeSlots: ShiftSlotVO[];
  afterSlots: ShiftSlotVO[];
  restGaps: { employeeId: Hr09Id; previousEnd: string; nextStart: string; gapMinutes: number }[];
  minimumRestMinutes: number | null;
  blockers: BusinessBlockerVO[];
}

export interface Hr09PeriodOption {
  periodId: Hr09Id;
  periodName: string;
  startDate: string;
  endDate: string;
  status: string;
}

export interface Hr09NamedOption { value: Hr09Id; label: string }
