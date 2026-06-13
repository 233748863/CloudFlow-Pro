import request from '../request';
import type {
  CrmWorkspaceBudgetDraftPayload,
  CrmWorkspaceContractDraftPayload,
  CrmWorkspaceInvoiceBindPayload,
  CrmWorkspaceInvoiceDraftPayload,
  CrmWorkspaceProjectDraftPayload,
} from './types';

// ===== 客户工作台跨模块草稿/快捷动作 =====

export const createWorkspaceContractDraft = (
  customerId: number,
  data: CrmWorkspaceContractDraftPayload,
) =>
  request.post(`/crm/customer/${customerId}/workspace/contract-draft`, data) as Promise<number>;

export const createWorkspaceProjectDraft = (
  customerId: number,
  data: CrmWorkspaceProjectDraftPayload,
) =>
  request.post(`/crm/customer/${customerId}/workspace/project-draft`, data) as Promise<number>;

export const createWorkspaceBudgetDraft = (
  customerId: number,
  data: CrmWorkspaceBudgetDraftPayload,
) => request.post(`/crm/customer/${customerId}/workspace/budget-draft`, data);

export const createWorkspaceInvoiceDraft = (
  customerId: number,
  data: CrmWorkspaceInvoiceDraftPayload,
) => request.post(`/crm/customer/${customerId}/workspace/invoice-draft`, data);

export const bindWorkspaceInvoice = (
  customerId: number,
  invoiceId: number,
  data: CrmWorkspaceInvoiceBindPayload,
) => request.put(`/crm/customer/${customerId}/workspace/invoice/${invoiceId}/bind`, data);

export const voidWorkspaceInvoice = (
  customerId: number,
  invoiceId: number,
  remark?: string,
) =>
  request.post(`/crm/customer/${customerId}/workspace/invoice/${invoiceId}/void`, { remark });

export const confirmWorkspaceReceivable = (customerId: number, receivableId: number) =>
  request.post(`/crm/customer/${customerId}/workspace/receivable/${receivableId}/confirm`);
