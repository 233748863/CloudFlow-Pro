import request from '/@/utils/request'
import {
  AuditListRequest,
  MerchantInfoUpdateRequest,
  MerchantQualificationUploadRequest,
} from '/@/api/merchantsAlliance/merchant/types'

export enum apiPath {
  // 资质信息
  QUALIFICATION_MERCHANT = '/merchant/merchant/qualification',
  // 基本信息
  GET_MERCHANT_DETAIL = '/merchant/merchant/info',
  // 审核列表
  LIST_MERCHANT_AUDIT = '/merchant/merchant/audit/list',
  // 审核状态
  GET_MERCHANT_AUDIT_STATUS = '/merchant/merchant/audit/status',
  // 更新基本信息
  UPDATE_MERCHANT_DETAIL = '/merchant/merchant/info/update',
  // 上传资质
  UPLOAD_MERCHANT_QUALIFICATION = '/merchant/merchant/qualification/upload',
}

/**
 * @description 获取商家基本信息
 * @returns
 */
export function getMerchantInfo() {
  return request({
    url: apiPath.GET_MERCHANT_DETAIL,
    method: 'GET',
  })
}

/**
 * @description 获取商家资质信息
 * @returns
 */
export function getMerchantQualification() {
  return request({
    url: apiPath.QUALIFICATION_MERCHANT,
    method: 'GET',
  })
}

/**
 * @description 更新商家信息
 * @param {MerchantInfoUpdateRequest} query - 商家信息更新请求参数
 * @returns
 */
export function updateMerchantInfo(query: MerchantInfoUpdateRequest) {
  return request({
    url: apiPath.UPDATE_MERCHANT_DETAIL,
    method: 'put',
    data: query,
  })
}

/**
 * @description 上传商家资质
 * @param {MerchantQualificationUploadRequest} query - 商家资质上传请求参数
 * @returns
 */
export function uploadMerchantQualification(query: MerchantQualificationUploadRequest) {
  return request({
    url: apiPath.UPLOAD_MERCHANT_QUALIFICATION,
    method: 'put',
    data: query,
  })
}

/**
 * @description 获取商家审核列表
 * @param {AuditListRequest} query - 商家审核列表查询参数
 * @returns
 */
export function getAuditList(query: AuditListRequest) {
  return request({
    url: apiPath.LIST_MERCHANT_AUDIT,
    method: 'POST',
    data: query,
  })
}
