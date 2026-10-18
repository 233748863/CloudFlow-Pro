import request from '../request';
import type { PageResult } from '@/types';
import type { Decimal } from './operations';
import type { DealRole } from './dealTeams';

export type StageRequiredField = 'contactId' | 'expectedAmount' | 'expectedSignDate' | 'ownerId' | 'remark';
export interface SalesStage {
  stageId?: number;
  version?: number;
  stageCode: string;
  stageName: string;
  sortNo: number;
  defaultWinRate: Decimal;
  allowSkipFlag: number;
  requiredFields: StageRequiredField[];
  requiredActivityFlag: number;
  overdueDays?: number | null;
  isWonFlag: number;
  isLostFlag: number;
  status: 'ACTIVE' | 'DISABLED';
}

export interface OpportunityItemInput {
  productId?: number | null;
  productNo?: string;
  productName: string;
  spec?: string;
  unit?: string;
  quantity: Decimal;
  unitPrice: Decimal;
  discountRate: Decimal;
  taxRate: Decimal;
  remark?: string;
}
export interface OpportunityItem extends OpportunityItemInput { itemId?: number; lineAmount: Decimal; taxAmount: Decimal }
export interface OpportunityItems {
  opportunityId: number;
  version: number;
  items: OpportunityItem[];
  subtotal: Decimal;
  taxAmount: Decimal;
  totalAmount: Decimal;
  expectedAmount: Decimal;
  weightedAmount: Decimal;
}
export interface OpportunityStageHistory {
  historyId: number;
  fromStage?: string;
  toStage: string;
  enteredTime: string;
  changedTime: string;
  durationSeconds: number;
  reason?: string;
  operatorId: number;
  createBy?: string;
}
export interface OpportunityReopenRequest { version: number; targetStage: string; reason: string }
export interface OpportunityReopenReceipt extends OpportunityReopenRequest {
  historyId: number;
  originalVersion: number;
  fromStage: string;
  operatorId: number;
  changedTime: string;
  originalEventId?: number | null;
  reversalEventId?: number | null;
}
export interface OpportunityReopenView {
  opportunityId: number;
  opportunityName: string;
  stage: string;
  version: number;
  allowed: boolean;
  blockers: string[];
  winningEventId?: number | null;
  amount?: Decimal | null;
  currency?: string | null;
  teamVersion?: number | null;
  shares: { userId: number; name: string; roleType: DealRole; percentage: Decimal; amount: Decimal }[];
  retainedContracts: number;
  lastReopen?: OpportunityReopenReceipt | null;
}
export interface StageAnalysisRow {
  stage: string;
  stageName: string;
  terminal: boolean;
  enabled: boolean;
  currentCount: number;
  currentAmount: Decimal;
  weightedForecast: Decimal;
  incompleteCount: number;
  incompleteSeconds: number;
  completedCount: number;
  completedSeconds: number;
  averageCompletedSeconds: Decimal | null;
  cohortCount: number;
  convertedCount: number;
  conversionRate: Decimal | null;
  wonCount: number;
  lostCount: number;
  untrackedCount: number;
}
export interface StageAnalysis {
  startDate: string;
  endDate: string;
  asOf: string;
  currency: 'CNY';
  stages: StageAnalysisRow[];
}

export const opportunityStages = {
  list: () => request.get<SalesStage[]>('/crm/sales-stage/list'),
  options: () => request.get<SalesStage[]>('/crm/opportunity/stage-options'),
  save: (data: SalesStage) => data.stageId ? request.put<SalesStage>('/crm/sales-stage', data) : request.post<SalesStage>('/crm/sales-stage', data),
  items: (id: number) => request.get<OpportunityItems>(`/crm/opportunity/${id}/items`),
  saveItems: (id: number, data: { version: number; items: OpportunityItemInput[] }) => request.put<OpportunityItems>(`/crm/opportunity/${id}/items`, data),
  history: (id: number, pageNum: number) => request.get<PageResult<OpportunityStageHistory>>(`/crm/opportunity/${id}/stage-history`, { params: { pageNum, pageSize: 20 } }),
  inspectReopen: (id: number) => request.get<OpportunityReopenView>(`/crm/opportunity/${id}/stage-reopen`, { silent: true }),
  reopen: (id: number, data: OpportunityReopenRequest) => request.post<OpportunityReopenReceipt>(`/crm/opportunity/${id}/stage-reopen`, data, { silent: true }),
  analysis: (params: { startDate?: string; endDate?: string; currency?: string; ownerId?: number }) => request.get<StageAnalysis>('/crm/opportunity/stage-analysis', { params }),
};
