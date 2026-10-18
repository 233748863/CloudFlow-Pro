export type FinanceKind = 'RECEIVABLE' | 'INVOICE';
export interface FinanceFile { fileId: string; fileName: string; fileSize: number; extension: string }
export interface PortalFinanceRecord {
  recordId: string; kind: FinanceKind; number: string; invoiceCode?: string; invoiceType?: string;
  plannedAmount?: string; receivedAmount?: string; outstandingAmount?: string; grossAmount?: string; taxAmount?: string;
  dueDate?: string; receivedDate?: string; invoiceDate?: string; status: string; attachments: FinanceFile[];
}
export interface PortalFinancePage { rows: PortalFinanceRecord[]; total: number; pageNum: number; pageSize: number }
export interface FinancePublication {
  version: number; publicationStatus: 'PRIVATE' | 'PUBLISHED' | 'STALE'; customerId: string; customerName: string;
  publishedBy?: string; publishedTime?: string; fileIds: string[]; availableFiles: FinanceFile[]; record: PortalFinanceRecord;
}
