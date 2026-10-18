import request from './request';

export interface ConsumablePageResult<Row> { rows: Row[]; total: number; pageNum: number; pageSize: number }
export type ConsumableId = string;
export type ConsumableRequestStatus = 'DRAFT' | 'APPROVING' | 'APPROVED' | 'REJECTED' | 'ISSUED' | 'CANCELLED';
export type ConsumableTransaction = 'INBOUND' | 'OUTBOUND' | 'ADJUST' | 'SCRAP' | 'RETURN';
export type ConsumableSource = 'MANUAL' | 'PURCHASE_RECEIPT' | 'CONSUMABLE_REQUEST';
export interface ConsumableQuery {
  pageNum?: number; pageSize?: number; keyword?: string; consumableId?: string; categoryId?: string;
  transactionType?: ConsumableTransaction; sourceBizType?: ConsumableSource; sourceBizId?: string;
  status?: string; requestNo?: string; applicantName?: string; deptId?: string; applicantId?: string;
  groupBy?: 'CONSUMABLE' | 'DEPARTMENT' | 'PERSON'; from?: string; to?: string;
}
export interface ConsumableOperation { operationKey: string; remark: string }
export interface ConsumableStockCommand extends ConsumableOperation { quantity: number; unitPrice?: string }
export interface ConsumableAdjustCommand extends ConsumableStockCommand { direction: 'IN' | 'OUT' }
export interface ConsumableReturnCommand extends ConsumableOperation { sourceLedgerId: string; quantity: number; requestVersion: number }
export interface ConsumableReverseCommand extends ConsumableOperation { purchaseVersion?: number; requestVersion?: number }
export interface ConsumableRecalculateCommand extends ConsumableOperation { mode: 'CHECK' | 'REBUILD'; version: number }
export interface ConsumableStockRow {
  ledgerId: string; consumableId: string; transactionType: ConsumableTransaction; quantity: number; balanceAfter: number;
  unit: string; unitPrice?: string; amount?: string; balanceAmountAfter?: string;
}
export interface ConsumablePosting {
  operationKey: string; replayed: boolean; ledgerIds: string[]; rows: ConsumableStockRow[]; sourceId?: string;
}
export interface ConsumableLedgerRow extends ConsumableStockRow {
  consumableName: string; model?: string; storageLocation?: string; avgCostAfter?: string;
  sourceBizType: ConsumableSource; sourceBizId?: string; sourceItemId?: string; sourceEventKey: string;
  operationKey: string; operationLineNo: number; sourceLedgerId?: string; reversalOfLedgerId?: string;
  assetLogId: string; beneficiaryId?: string; beneficiaryName?: string; deptId?: string; deptName?: string;
  operatorId: string; operatorName: string; operateTime: string; remark: string;
  reversed: boolean; reversalLedgerId?: string; returnedQuantity: number;
  sourceDocumentId?: string; sourceVersion?: number;
  assetLog?: { logId: string; type: string; quantityChange: number; remark: string; createTime: string };
}
export interface ConsumableBalance { quantity: number; stockAmount?: string; avgCost?: string; lastPurchasePrice?: string; version?: number }
export interface ConsumableRecalculation {
  consistent: boolean; before: ConsumableBalance; expected: ConsumableBalance; after?: ConsumableBalance; changed: boolean; reason: string;
}
export interface ConsumableCatalogItem { consumableId: string; name: string; model?: string; unit: string; categoryId?: string; quantity: number }
export interface ConsumableCategory { categoryId: string; label: string; value: string }
export interface ConsumableRequestLineInput { consumableId: string; applyQuantity: number; remark?: string }
export interface ConsumableRequestInput { purpose: string; applyDate: string; expectDate?: string; items: ConsumableRequestLineInput[] }
export interface ConsumableCreateRequest extends ConsumableRequestInput { operationKey: string }
export interface ConsumableEditRequest extends ConsumableRequestInput { version: number }
export interface ConsumableSubmitRequest { operationKey: string; version: number }
export interface ConsumableRequestResult {
  requestId: string; requestNo: string; status: ConsumableRequestStatus; version: number;
  instanceId?: string; approvalPending: boolean; replayed: boolean;
}
export interface ConsumableRequestRow {
  requestId: string; requestNo: string; applicantId: string; applicantName: string; deptId: string; deptName: string;
  purpose: string; applyDate: string; expectDate?: string; status: ConsumableRequestStatus; version: number;
  totalAmount?: string; issuedAmount?: string; returnedAmount?: string; instanceId?: string;
  submitTime?: string; issueTime?: string; cancelTime?: string; cancelReason?: string; createTime: string;
}
export interface ConsumableRequestItem {
  itemId: string; consumableId: string; consumableName: string; model?: string; unit: string;
  applyQuantity: number; approvedQuantity: number; issuedQuantity: number; returnedQuantity: number;
  unitPrice?: string; amount?: string; issuedAmount?: string; returnedAmount?: string; remark?: string; version: number;
}
export interface ConsumableRequestView extends ConsumableRequestRow { items: ConsumableRequestItem[]; transactions: ConsumableLedgerRow[] }
export interface ConsumableIssueCommand extends ConsumableOperation { version: number; allowPartial: boolean; items: { itemId: string; quantity: number }[] }
export interface ConsumableIssueResult {
  requestId: string; status: ConsumableRequestStatus; version: number; replayed: boolean; ledgerIds: string[];
  rows: { itemId: string; requestedQuantity: number; issuedQuantity: number; shortageQuantity: number; ledgerId?: string }[];
}
export interface ConsumableReportRow {
  consumableId: string; name: string; unit: string; deptId?: string; deptName?: string; beneficiaryId?: string; beneficiaryName?: string;
  openingQuantity?: string; inboundQuantity?: string; outboundQuantity?: string; closingQuantity?: string;
  issuedQuantity?: string; returnedQuantity?: string; netQuantity?: string;
  openingAmount?: string; inboundAmount?: string; inboundCost?: string; outboundAmount?: string; closingAmount?: string;
  issuedAmount?: string; returnedAmount?: string; netAmount?: string; scrapAmount?: string; adjustAmount?: string;
}
export interface ConsumableReceiptView {
  id: string | number; purchaseId: string | number; itemId: string | number; receivedQuantity: number;
  consumableId: string | number; consumableName: string; receiptTime: string; ledgerId: string; reversed: boolean; reversalLedgerId?: string;
}

const base = '/oa/consumable';
export const consumableLedgerApi = {
  list: (params: ConsumableQuery) => request.get(`${base}/ledger/list`, { params }) as Promise<ConsumablePageResult<ConsumableLedgerRow>>,
  detail: (id: string) => request.get(`${base}/ledger/${id}`) as Promise<ConsumableLedgerRow>,
  inbound: (id: string, data: ConsumableStockCommand) => request.post(`${base}/${id}/add-stock`, data) as Promise<ConsumablePosting>,
  adjust: (id: string, data: ConsumableAdjustCommand) => request.post(`${base}/${id}/adjust`, data) as Promise<ConsumablePosting>,
  scrap: (id: string, data: ConsumableStockCommand) => request.post(`${base}/${id}/scrap`, data) as Promise<ConsumablePosting>,
  returnStock: (id: string, data: ConsumableReturnCommand) => request.post(`${base}/${id}/return`, data) as Promise<ConsumablePosting>,
  reverse: (id: string, data: ConsumableReverseCommand) => request.post(`${base}/ledger/${id}/reverse`, data) as Promise<ConsumablePosting>,
  recalculate: (id: string, data: ConsumableRecalculateCommand) => request.post(`${base}/${id}/recalculate`, data) as Promise<ConsumableRecalculation>,
  report: (kind: 'stock' | 'usage' | 'cost', params: ConsumableQuery) => request.get(`${base}/reports/${kind}`, { params }) as Promise<ConsumablePageResult<ConsumableReportRow>>,
};
export const consumableRequestApi = {
  catalog: (params: ConsumableQuery) => request.get(`${base}/request/catalog`, { params }) as Promise<ConsumablePageResult<ConsumableCatalogItem>>,
  categories: () => request.get(`${base}/request/categories`) as Promise<ConsumableCategory[]>,
  list: (scope: 'SELF' | 'DEPARTMENT' | 'DISPATCH', params: ConsumableQuery) => request.get(`${base}/request/${scope === 'SELF' ? 'list' : scope === 'DEPARTMENT' ? 'department-list' : 'dispatch-list'}`, { params }) as Promise<ConsumablePageResult<ConsumableRequestRow>>,
  detail: (id: string, dispatch = false) => request.get(`${base}/request/${id}${dispatch ? '/dispatch-detail' : ''}`) as Promise<ConsumableRequestView>,
  create: (data: ConsumableCreateRequest) => request.post(`${base}/request`, data) as Promise<ConsumableRequestResult>,
  edit: (id: string, data: ConsumableEditRequest) => request.put(`${base}/request/${id}`, data) as Promise<ConsumableRequestResult>,
  submit: (id: string, data: ConsumableSubmitRequest) => request.post(`${base}/request/${id}/submit`, data) as Promise<ConsumableRequestResult>,
  cancel: (id: string, data: { version: number; reason: string }) => request.post(`${base}/request/${id}/cancel`, data) as Promise<ConsumableRequestResult>,
  issue: (id: string, data: ConsumableIssueCommand) => request.post(`${base}/request/${id}/issue`, data) as Promise<ConsumableIssueResult>,
};
