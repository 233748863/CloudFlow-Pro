import request from '@/services/api/request'
import type { CrmRecord } from './types'

export const createWorkspaceContractDraft = (customerId: string | number, data: CrmRecord) =>
  request.post(`/crm/customer/${customerId}/workspace/contract-draft`, data)
export const createWorkspaceProjectDraft = (customerId: string | number, data: CrmRecord) =>
  request.post(`/crm/customer/${customerId}/workspace/project-draft`, data)
export const createWorkspaceBudgetDraft = (customerId: string | number, data: CrmRecord) =>
  request.post(`/crm/customer/${customerId}/workspace/budget-draft`, data)
export const createWorkspaceInvoiceDraft = (customerId: string | number, data: CrmRecord) =>
  request.post(`/crm/customer/${customerId}/workspace/invoice-draft`, data)
