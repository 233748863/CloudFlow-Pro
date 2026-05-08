import request from './request';
import { PageResult } from '@/types';

export interface Invoice {
  invoiceId?: number;
  invoiceDirection: string;
  thirdPartySystem?: string;
  externalBillNo?: string;
  externalLinkUrl?: string;
  invoiceCode: string;
  invoiceNo: string;
  invoiceType?: string;
  invoiceDate?: string;
  grossAmount?: number;
  taxAmount?: number;
  sellerName?: string;
  buyerName?: string;
  imageUrl?: string;
  customerId?: number;
  customerName?: string;
  contractId?: number;
  contractNo?: string;
  expenseClaimId?: number;
  paymentRequestId?: number;
  receivableId?: number;
  status?: string;
  remark?: string;
  createTime?: string;
  updateTime?: string;
}

export interface InvoiceWriteoff {
  writeoffId?: number;
  invoiceId?: number;
  businessType: string;
  businessId: number;
  businessNo?: string;
  writeoffAmount: number;
  writeoffDate?: string;
  remark?: string;
}

export interface InvoiceLookupParams {
  pageNum?: number;
  pageSize?: number;
  invoiceDirection?: string;
  invoiceCode?: string;
  invoiceNo?: string;
  receivableId?: number;
  customerId?: number;
  status?: string;
}

export const invoiceApi = {
  list: (params: InvoiceLookupParams) => request.get('/oa/invoice/list', { params }) as Promise<PageResult<Invoice>>,

  getInfo: (id: number) => request.get(`/oa/invoice/${id}`) as Promise<Invoice>,

  listWriteoffs: (id: number) => request.get(`/oa/invoice/${id}/writeoff/list`) as Promise<InvoiceWriteoff[]>,

  add: (data: Invoice) => request.post('/oa/invoice', data),

  edit: (data: Invoice) => request.put('/oa/invoice', data),

  bind: (id: number, data: Partial<Invoice>) => request.put(`/oa/invoice/bind/${id}`, data),

  writeoff: (id: number, data: InvoiceWriteoff) => request.post(`/oa/invoice/${id}/writeoff`, data),

  voidInvoice: (id: number, remark?: string) => request.post(`/oa/invoice/${id}/void`, { remark }),

  remove: (ids: number[]) => request.delete(`/oa/invoice/${ids.join(',')}`),
};
