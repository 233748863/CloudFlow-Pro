import request from '../request'
import type { ApiRecord } from '../page'

/**
 * CRM 审批流 API
 * 对标 React: cloudflow-frontend/src/services/api/crm/approval.ts
 */

/** 提交客户认领/释放审批 */
export const submitCustomerClaim = (data: {
  customerId: string | number
  action: 'claim' | 'release'
  reason?: string
}) => request.post('/crm/approval/customer-claim', data)

/** 提交客户等级变更审批 */
export const submitCustomerLevelChange = (data: {
  customerId: string | number
  currentLevel: string
  targetLevel: string
  reason?: string
}) => request.post('/crm/approval/customer-level-change', data)

/** 提交商机降级/关闭审批 */
export const submitOpportunityDowngrade = (data: {
  opportunityId: string | number
  action: 'downgrade' | 'close'
  currentStage: string
  targetStage?: string
  reason?: string
}) => request.post('/crm/approval/opportunity-downgrade', data)

/** 提交退款审批 */
export const submitRefund = (data: {
  receivableId?: string | number
  orderId?: string | number
  refundAmount: number
  reason?: string
}) => request.post('/crm/approval/refund', data)

/** 审批客户认领 */
export const approveCustomerClaim = (approvalId: string | number, data?: ApiRecord) =>
  request.post(`/crm/approval/${approvalId}/approve`, data || {})

/** 拒绝客户认领 */
export const rejectCustomerClaim = (approvalId: string | number, data: { reason: string }) =>
  request.post(`/crm/approval/${approvalId}/reject`, data)
