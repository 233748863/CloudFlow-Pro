import request from '/@/utils/request'
import {
  JointMarketingPlanMerchantListRequest,
  JointMarketingPlanMerchantListResponse,
  MerchantAuditHandleRequest,
  MerchantAuditListRequest,
  MerchantCreateRequest,
  MerchantListRequest,
} from '/@/api/merchantsAlliance/merchant/types'

enum apiPath {
  // 商家列表
  LIST_MERCHANT = '/merchant/platform/merchant/list',
  // 创建商户
  CREATE_MERCHANT = '/merchant/merchant/create',
  // 审核列表
  LIST_MERCHANT_AUDIT = '/merchant/platform/merchant/audit/list',
  // 处理审核
  HANDLE_MERCHANT_AUDIT = '/merchant/platform/merchant/audit/handle',
  // 审核详情
  GET_MERCHANT_AUDIT_DETAIL = '/merchant/platform/merchant/audit/{auditId}',
  // 商家详情
  GET_MERCHANT_DETAIL = '/merchant/platform/merchant/detail/{merchantId}',
  // 绑定码
  BIND_CODE = '/merchant/platform/merchant/bindCode',
  // 联合营销计划获取商家列表
  LIST_JOINT_MARKETING_PLAN = '/merchant/merchant/list/joint/marketing',
}

/**
 * 创建商户
 * @param query MerchantCreateRequest
 * @returns
 */
export function createMerchant(query: MerchantCreateRequest) {
  return request({
    url: apiPath.CREATE_MERCHANT,
    method: 'post',
    data: query,
  })
}

/**
 * 审核列表
 * @param query MerchantAuditListRequest
 * @returns
 */
export function getMerchantAuditList(query: MerchantAuditListRequest) {
  return request({
    url: apiPath.LIST_MERCHANT_AUDIT,
    method: 'post',
    data: query,
  })
}

/**
 * 获取审核详情
 * @param auditId number 审核id
 * @returns
 */
export function getMerchantAuditDetail(auditId: string) {
  return request({
    url: apiPath.GET_MERCHANT_AUDIT_DETAIL.replace('{auditId}', auditId),
    method: 'get',
  })
}

/**
 * 处理审核
 * @param query MerchantAuditHandleRequest
 * @returns
 */
export function handleMerchantAudit(query: MerchantAuditHandleRequest) {
  return request({
    url: apiPath.HANDLE_MERCHANT_AUDIT,
    method: 'put',
    data: query,
  })
}

/**
 * 商家列表
 * @param query MerchantListRequest
 * @returns
 */
export function getMerchantList(query: MerchantListRequest) {
  return request({
    url: apiPath.LIST_MERCHANT,
    method: 'post',
    data: query,
  })
}

/**
 * 获取商家详情
 * @param merchantId number 商家id
 * @returns
 */
export function getMerchantDetail(merchantId: string) {
  return request({
    url: apiPath.GET_MERCHANT_DETAIL.replace('{merchantId}', merchantId),
    method: 'GET',
  })
}

/**
 * 绑定码
 * @param merchantId string 商家id
 * @returns
 */
export function bindCode(merchantId: string) {
  return request({
    url: apiPath.BIND_CODE,
    method: 'GET',
    params: { merchantId },
  })
}

/**
 * 联合营销计划获取商家列表
 * @param query JointMarketingPlanMerchantListRequest
 * @returns
 */
export function getJointMarketingPlanMerchantList(query: JointMarketingPlanMerchantListRequest) {
  return request<JointMarketingPlanMerchantListResponse>({
    url: apiPath.LIST_JOINT_MARKETING_PLAN,
    method: 'post',
    data: query,
  })
}
