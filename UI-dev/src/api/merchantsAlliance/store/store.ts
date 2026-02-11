import request from '/@/utils/request'
import {
  DeleteStoreRequest,
  StoreAuditHandleRequest,
  StoreAuditListRequest,
  StoreCreateRequest,
  StoreListAuditRequest,
  StoreListRequest,
  UpdateStatusBizRequest,
  UpdateStoreInfoRequest,
  UpdateStoreQualificationRequest,
} from '/@/api/merchantsAlliance/store/types'

enum apiPath {
  MERCHANT_STORE_LIST = '/merchant/merchant/store/list', // 商家店铺列表
  MERCHANT_STORE_INFO = '/merchant/merchant/store/info', // 商家店铺详情
  MERCHANT_STORE_QUALIFICATION = '/merchant/merchant/store/qualification', // 商家店铺资质详情
  MERCHANT_STORE_UPDATE = '/merchant/merchant/store/update/info', // 商家店铺更新
  MERCHANT_STORE_UPDATE_QUALIFICATION = '/merchant/merchant/store/update/qualification', // 商家店铺更新资质状态
  MERCHANT_STORE_DELETE = '/merchant/merchant/store/delete', // 商家店铺删除
  MERCHANT_STORE_UPDATE_STATUS_BIZ = '/merchant/merchant/store/update/status/biz', // 商家店铺更新营业状态
  MERCHANT_STORE_CREATE = '/merchant/merchant/store/create', // 商家店铺创建
  MERCHANT_STORE_LIST_AUDIT = '/merchant/merchant/store/list/audit', // 商家店铺审核记录列表
  MERCHANT_STORE_AUDIT_HANDLE = '/merchant/platform/store/audit/handle', // 商家店铺审核处理信息
  MERCHANT_STORE_AUDIT_LIST = '/merchant/platform/store/audit/list', // 商家店铺审核列表
  MERCHANT_STORE_DETAIL = '/merchant/platform/store/detail/{storeId}', // 商家店铺详情
  MERCHANT_STORE_AUDIT_DETAIL = '/merchant/platform/store/audit/detail/{auditId}', // 商家店铺审核详情
}

/**
 * 创建商家店铺
 * @param query 创建商家店铺请求参数
 */
export function storeCreate(query: StoreCreateRequest<string>) {
  return request({
    url: apiPath.MERCHANT_STORE_CREATE,
    method: 'post',
    data: query,
  })
}

/**
 * 获取商家店铺列表
 * @param query 获取商家店铺列表请求参数
 */
export function getStoreList(query: StoreListRequest) {
  return request({
    url: apiPath.MERCHANT_STORE_LIST,
    method: 'post',
    data: query,
  })
}

/**
 * 获取商家店铺详情
 * @param storeId 店铺ID
 */
export function getStoreInfo(storeId: string) {
  return request({
    url: apiPath.MERCHANT_STORE_INFO,
    method: 'get',
    params: {
      storeId: storeId,
    },
  })
}

/**
 * 获取商家店铺资质详情
 * @param storeId 店铺ID
 */
export function getStoreQualification(storeId: string) {
  return request({
    url: apiPath.MERCHANT_STORE_QUALIFICATION,
    method: 'get',
    params: {
      storeId: storeId,
    },
  })
}

/**
 * 更新商家店铺信息
 * @param query 更新商家店铺信息请求参数
 */
export function updateStoreInfo(query: UpdateStoreInfoRequest) {
  return request({
    url: apiPath.MERCHANT_STORE_UPDATE,
    method: 'put',
    data: query,
  })
}

/**
 * 更新商家店铺资质信息
 * @param query 更新商家店铺资质信息请求参数
 */
export function updateStoreQualification(query: UpdateStoreQualificationRequest) {
  return request({
    url: apiPath.MERCHANT_STORE_UPDATE_QUALIFICATION,
    method: 'put',
    data: query,
  })
}

/**
 * 更新商家店铺营业状态
 * @param query 更新商家店铺营业状态请求参数
 */
export function updateStoreBizStatus(query: UpdateStatusBizRequest) {
  return request({
    url: apiPath.MERCHANT_STORE_UPDATE_STATUS_BIZ,
    method: 'put',
    data: query,
  })
}

/**
 * 删除商家店铺
 * @param query 删除商家店铺请求参数
 */
export function deleteStore(query: DeleteStoreRequest) {
  return request({
    url: apiPath.MERCHANT_STORE_DELETE,
    method: 'delete',
    params: query,
  })
}

/**
 * 获取商家店铺审核记录列表
 * @param query 获取商家店铺审核记录列表请求参数
 */
export function getStoreListAudit(query: StoreListAuditRequest) {
  return request({
    url: apiPath.MERCHANT_STORE_LIST_AUDIT,
    method: 'get',
    params: query,
  })
}

/**
 * 处理商家店铺审核
 * @param query 处理商家店铺审核请求参数
 */
export function handleStoreAudit(query: StoreAuditHandleRequest) {
  return request({
    url: apiPath.MERCHANT_STORE_AUDIT_HANDLE,
    method: 'put',
    data: query,
  })
}

/**
 * 获取商家店铺审核列表
 * @param query 获取商家店铺审核列表请求参数
 */
export function getStoreAuditList(query: StoreAuditListRequest) {
  return request({
    url: apiPath.MERCHANT_STORE_AUDIT_LIST,
    method: 'post',
    data: query,
  })
}

/**
 * 获取商家店铺审核详情
 * @param auditId 审核记录ID
 */
export function getStoreAuditDetail(auditId: string) {
  return request({
    url: apiPath.MERCHANT_STORE_AUDIT_DETAIL.replace('{auditId}', auditId),
    method: 'get',
  })
}

/**
 * 获取商家店铺详情
 * @param storeId 店铺ID
 */
export function getStoreDetail(storeId: string) {
  return request({
    url: apiPath.MERCHANT_STORE_DETAIL.replace('{storeId}', storeId),
    method: 'get',
  })
}
