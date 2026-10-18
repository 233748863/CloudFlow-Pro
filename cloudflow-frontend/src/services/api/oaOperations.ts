import request from './request';
import type { PageResult } from '@/types';

export type Decimal = number | string;
export interface OaRecord { version?: number; createTime?: string; updateTime?: string }
export interface SysAsset extends OaRecord {
  assetId?: number;
  assetCode?: string;
  name?: string;
  model?: string;
  status?: string;
  purchaseAmount?: Decimal;
  purchaseDate?: string;
  ownerId?: number;
  location?: string;
  remark?: string;
  categoryId?: number;
  custodianId?: number;
  custodianName?: string;
  deptId?: number;
  deptName?: string;
  locationDetail?: string;
  salvageValue?: Decimal;
  usefulLifeMonths?: number;
  availableFromDate?: string;
  disposalDate?: string;
  depreciationFlag?: number;
  depreciationMethod?: string;
  depreciationFrequency?: string;
  openingAccumulatedDepreciation?: Decimal;
  accumulatedDepreciation?: Decimal;
  netBookValue?: Decimal;
  nextDepreciationDate?: string;
  depreciationCompletedFlag?: number;
  insurancePolicyNo?: string;
  insurerName?: string;
  insuredValue?: Decimal;
  insuranceStartDate?: string;
  insuranceEndDate?: string;
  insuranceReminderDays?: number;
  maintenanceRequiredFlag?: number;
  warrantyExpireDate?: string;
}
export interface SysSupplier extends OaRecord {
  supplierId?: number;
  supplierName?: string;
  contactName?: string;
  contactPhone?: string;
  bankName?: string;
  bankAccount?: string;
  status?: string;
  supplierCode?: string;
  supplierType?: string;
  categoryId?: number;
  shortName?: string;
  creditCode?: string;
  legalPerson?: string;
  registerCapital?: Decimal;
  registerDate?: string;
  businessScope?: string;
  address?: string;
  province?: string;
  city?: string;
  contactEmail?: string;
  taxNo?: string;
  taxRate?: Decimal;
  paymentTerms?: string;
  currency?: string;
  cooperationStartDate?: string;
  levelCode?: string;
  score?: Decimal;
  standing?: string;
  indicatorColor?: string;
  lastScoreTime?: string;
  blacklistFlag?: number;
  blacklistReason?: string;
  blacklistBy?: number;
  blacklistTime?: string;
  preventPurchaseFlag?: number;
  preventRfqFlag?: number;
  qualificationExpireDate?: string;
  instanceId?: string;
  bypassFlag?: number;
  bypassReason?: string;
  bypassBy?: number;
  bypassExpireDate?: string;
}
export interface OaAssetCategory extends OaRecord {
  categoryId?: number;
  categoryCode?: string;
  categoryName?: string;
  parentId?: number;
  levelPath?: string;
  defaultUsefulLifeMonths?: number;
  defaultDepreciationMethod?: string;
  defaultSalvageRate?: Decimal;
  maintenanceRequiredFlag?: number;
  sortNo?: number;
  status?: string;
  remark?: string;
}
export interface OaAssetDepreciationSchedule extends OaRecord {
  scheduleId?: number;
  assetId?: number;
  periodNo?: number;
  periodDate?: string;
  depreciationAmount?: Decimal;
  accumulatedAmount?: Decimal;
  netValue?: Decimal;
  status?: string;
  postTime?: string;
  postBy?: number;
  remark?: string;
}
export interface OaAssetMaintenancePlan extends OaRecord {
  planId?: number;
  assetId?: number;
  planName?: string;
  maintenanceType?: string;
  frequency?: string;
  customIntervalDays?: number;
  responsibleId?: number;
  responsibleName?: string;
  supplierId?: number;
  nextDueDate?: string;
  lastCompletedDate?: string;
  reminderDays?: number;
  status?: string;
}
export interface OaAssetMaintenanceTask extends OaRecord {
  taskId?: number;
  planId?: number;
  assetId?: number;
  plannedDate?: string;
  actualDate?: string;
  executorId?: number;
  executorName?: string;
  result?: string;
  cost?: Decimal;
  description?: string;
  attachmentUrl?: string;
  status?: string;
}
export interface OaAssetRepair extends OaRecord {
  repairId?: number;
  repairNo?: string;
  assetId?: number;
  assetName?: string;
  failureDate?: string;
  reportBy?: number;
  faultDescription?: string;
  repairStatus?: string;
  actionsPerformed?: string;
  completionDate?: string;
  downtimeHours?: Decimal;
  repairCost?: Decimal;
  capitalizeFlag?: number;
  lifeExtensionMonths?: number;
  supplierId?: number;
  repairerName?: string;
  attachmentUrl?: string;
  instanceId?: string;
}
export interface OaAssetMovement extends OaRecord {
  movementId?: number;
  movementNo?: string;
  assetId?: number;
  purpose?: string;
  fromCustodianId?: number;
  fromCustodianName?: string;
  toCustodianId?: number;
  toCustodianName?: string;
  fromDeptId?: number;
  toDeptId?: number;
  fromLocation?: string;
  toLocation?: string;
  movementDate?: string;
  reason?: string;
  attachmentUrl?: string;
  status?: string;
  instanceId?: string;
}
export interface OaSupplierCategory extends OaRecord {
  categoryId?: number;
  categoryCode?: string;
  categoryName?: string;
  parentId?: number;
  levelPath?: string;
  sortNo?: number;
  status?: string;
  remark?: string;
}
export interface OaSupplierQualification extends OaRecord {
  qualificationId?: number;
  supplierId?: number;
  qualificationType?: string;
  certName?: string;
  certNo?: string;
  issueOrg?: string;
  issueDate?: string;
  expireDate?: string;
  longTermFlag?: number;
  fileUrl?: string;
  verifyStatus?: string;
  verifyBy?: number;
  verifyTime?: string;
  rejectReason?: string;
  reminderDays?: number;
}
export interface OaSupplierScorecard extends OaRecord {
  scorecardId?: number;
  supplierId?: number;
  periodType?: string;
  periodStart?: string;
  periodEnd?: string;
  totalScore?: Decimal;
  standing?: string;
  indicatorColor?: string;
  warnFlag?: number;
  preventFlag?: number;
  calcTime?: string;
  calcBy?: number;
  remark?: string;
  status?: string;
}
export interface OaSupplierScoreCriteria extends OaRecord {
  criteriaId?: number;
  scorecardId?: number;
  criteriaCode?: string;
  criteriaName?: string;
  weight?: Decimal;
  score?: Decimal;
  maxScore?: Decimal;
  dataSource?: string;
  autoValue?: Decimal;
  remark?: string;
}
export interface OaProjectTask extends OaRecord {
  taskId?: number;
  projectId?: number;
  parentTaskId?: number;
  levelPath?: string;
  taskNo?: string;
  subject?: string;
  taskTypeId?: number;
  isGroupFlag?: number;
  isMilestoneFlag?: number;
  status?: string;
  priority?: number;
  assigneeId?: number;
  assigneeName?: string;
  taskWeight?: Decimal;
  progress?: Decimal;
  plannedStart?: string;
  plannedEnd?: string;
  baselineStart?: string;
  baselineEnd?: string;
  plannedHours?: Decimal;
  actualStart?: string;
  actualEnd?: string;
  openingActualHours?: Decimal;
  actualHours?: Decimal;
  sortNo?: number;
  description?: string;
}
export interface OaProjectDependency extends OaRecord {
  dependencyId?: number;
  projectId?: number;
  predecessorTaskId?: number;
  successorTaskId?: number;
  dependencyType?: string;
  lagDays?: number;
  remark?: string;
}
export interface OaProjectTemplate extends OaRecord {
  templateId?: number;
  templateCode?: string;
  templateName?: string;
  projectType?: string;
  description?: string;
  status?: string;
}
export interface OaProjectTemplateTask extends OaRecord {
  templateTaskId?: number;
  templateId?: number;
  parentTemplateTaskId?: number;
  levelPath?: string;
  taskNo?: string;
  subject?: string;
  taskTypeId?: number;
  isMilestoneFlag?: number;
  taskWeight?: Decimal;
  plannedHours?: Decimal;
  startOffsetDays?: number;
  durationDays?: number;
  assigneeRole?: string;
  sortNo?: number;
}
export interface OaActivityType extends OaRecord {
  typeId?: number;
  typeCode?: string;
  typeName?: string;
  billableDefaultFlag?: number;
  sortNo?: number;
  status?: string;
  remark?: string;
}
export interface OaActivityCost extends OaRecord {
  costId?: number;
  activityTypeId?: number;
  employeeId?: number;
  jobLevelId?: number;
  costingRate?: Decimal;
  billingRate?: Decimal;
  currency?: string;
  effectiveStart?: string;
  effectiveEnd?: string;
  status?: string;
}
export interface OaTimesheet extends OaRecord {
  timesheetId?: number;
  timesheetNo?: string;
  employeeId?: number;
  employeeName?: string;
  deptId?: number;
  startDate?: string;
  endDate?: string;
  totalHours?: Decimal;
  billableHours?: Decimal;
  costingAmount?: Decimal;
  billingAmount?: Decimal;
  status?: string;
  instanceId?: string;
  submitTime?: string;
  approveTime?: string;
  rejectReason?: string;
}
export interface OaTimesheetDetail extends OaRecord {
  detailId?: number;
  timesheetId?: number;
  projectId?: number;
  projectName?: string;
  taskId?: number;
  activityTypeId?: number;
  workDate?: string;
  fromTime?: string;
  toTime?: string;
  hours?: Decimal;
  billableFlag?: number;
  costingRate?: Decimal;
  costingAmount?: Decimal;
  billingRate?: Decimal;
  billingAmount?: Decimal;
  reversalOfDetailId?: number;
  description?: string;
}
export interface OaPurchaseRfq extends OaRecord {
  rfqId?: number;
  rfqNo?: string;
  title?: string;
  purchaseRequestId?: number;
  deptId?: number;
  deptName?: string;
  projectId?: number;
  projectName?: string;
  ownerId?: number;
  ownerName?: string;
  quoteDeadline?: string;
  expectedDeliveryDate?: string;
  deliveryAddress?: string;
  paymentTerms?: string;
  termsContent?: string;
  invitedCount?: number;
  respondedCount?: number;
  status?: string;
  awardedSupplierId?: number;
  awardedSupplierName?: string;
  awardedQuotationId?: number;
  awardedAmount?: Decimal;
  awardReason?: string;
  awardBy?: number;
  awardTime?: string;
  instanceId?: string;
  attachmentUrl?: string;
}
export interface OaPurchaseRfqItem extends OaRecord {
  itemId?: number;
  rfqId?: number;
  consumableId?: number;
  sortNo?: number;
  itemName?: string;
  spec?: string;
  unit?: string;
  quantity?: number;
  expectedPrice?: Decimal;
  brandRequirement?: string;
  technicalRequirement?: string;
  remark?: string;
}
export interface OaPurchaseRfqSupplier extends OaRecord {
  rfqSupplierId?: number;
  rfqId?: number;
  supplierId?: number;
  supplierName?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  inviteTime?: string;
  inviteChannel?: string;
  inviteDeliveryStatus?: 'QUEUED' | 'SENT' | 'FAILED' | 'UNKNOWN';
  inviteMessageRecordId?: number;
  inviteSentTime?: string;
  respondTime?: string;
  quoteStatus?: string;
  declineReason?: string;
  remark?: string;
}
export interface OaSupplierQuotation extends OaRecord {
  quotationId?: number;
  quotationNo?: string;
  rfqId?: number;
  supplierId?: number;
  supplierName?: string;
  quoteDate?: string;
  validUntil?: string;
  totalAmount?: Decimal;
  taxAmount?: Decimal;
  currency?: string;
  paymentTerms?: string;
  deliveryDays?: number;
  deliveryDate?: string;
  warrantyMonths?: number;
  attachmentUrl?: string;
  remark?: string;
  status?: string;
  entryBy?: number;
  entryTime?: string;
}
export interface OaSupplierQuotationItem extends OaRecord {
  itemId?: number;
  quotationId?: number;
  rfqItemId?: number;
  sortNo?: number;
  itemName?: string;
  spec?: string;
  unit?: string;
  quantity?: number;
  unitPrice?: Decimal;
  discountRate?: Decimal;
  taxRate?: Decimal;
  lineAmount?: Decimal;
  brand?: string;
  model?: string;
  deliveryDays?: number;
  remark?: string;
}
export interface OaContractFulfilmentTerm extends OaRecord {
  termId?: number;
  contractId?: number;
  termNo?: number;
  termCategory?: string;
  termContent?: string;
  requirement?: string;
  responsibleParty?: string;
  responsibleId?: number;
  responsibleName?: string;
  deadlineDate?: string;
  fulfilledFlag?: number;
  fulfilledDate?: string;
  fulfilledBy?: number;
  fulfilledByName?: string;
  evidenceFileUrl?: string;
  evidenceRemark?: string;
  overdueFlag?: number;
  waivedFlag?: number;
  waivedReason?: string;
  sortNo?: number;
  remark?: string;
}
export interface OaContractTemplateTerm extends OaRecord {
  templateTermId?: number;
  templateId?: number;
  termNo?: number;
  termCategory?: string;
  termContent?: string;
  requirement?: string;
  responsibleParty?: string;
  deadlineOffsetDays?: number;
  sortNo?: number;
}

export interface Identity { id: number; name: string; userId?: number; deptId?: number; deptName?: string }
export interface RfqDetail { rfq: OaPurchaseRfq; items: OaPurchaseRfqItem[] }
export interface QuotationDetail { quotation: OaSupplierQuotation; items: OaSupplierQuotationItem[] }
export interface TimesheetDetail { timesheet: OaTimesheet; details: OaTimesheetDetail[] }
export interface TemplateDetail { template: OaProjectTemplate; tasks: OaProjectTemplateTask[] }
export interface ScorecardDetail { scorecard: OaSupplierScorecard; criteria: OaSupplierScoreCriteria[] }
export interface UploadedFile { reference: string; fileName: string }
export interface QuoteCell { quotationId: number; supplierId: number; supplierName: string; currency: string; unitPrice: Decimal; discountRate: Decimal; taxRate: Decimal; lineAmount: Decimal; taxAmount: Decimal; grossAmount: Decimal; deliveryDays?: number; brand?: string; model?: string; isLowest: boolean; isShortestDelivery: boolean }
export interface ComparisonSupplier { quotationId: number; supplierId: number; supplierName: string; currency: string; totalAmount: Decimal; taxAmount: Decimal; deliveryDays?: number; warrantyMonths?: number; paymentTerms?: string; standing?: string; score?: Decimal; indicatorColor?: string; isLowestTotal: boolean; isShortestDelivery: boolean; rank: number }
export interface Comparison { items: { rfqItemId: number; itemName: string; spec?: string; unit?: string; quantity: number; expectedPrice?: Decimal; quotes: QuoteCell[] }[]; suppliers: ComparisonSupplier[]; summaries: { currency: string; lowestTotal: Decimal; highestTotal: Decimal; avgTotal: Decimal; priceSpread: Decimal }[] }
export type ReportRow = Record<string, string | number | null>;
export type OperationsReport = Record<string, ReportRow[]>;
export const oaGet = <T,>(path: string, params?: object) => request.get<T>('/oa' + path, { params });
export const oaPost = <T = void,>(path: string, data?: unknown) => request.post<T>('/oa' + path, data);
export const oaPut = <T = void,>(path: string, data?: unknown) => request.put<T>('/oa' + path, data);
export const oaDelete = (path: string) => request.delete<void>('/oa' + path);
export const pageRows = <T,>(data?: PageResult<T>) => data?.records || data?.rows || [];
export const oaUpload = (path: string, file: File) => { const data = new FormData(); data.append('file', file); return request.post<UploadedFile>('/oa' + path, data, { headers: { 'Content-Type': 'multipart/form-data' } }); };
export async function oaDownload(path: string, name: string) {
  const blob = await request.get<Blob>('/oa' + path, { responseType: 'blob' });
  const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
