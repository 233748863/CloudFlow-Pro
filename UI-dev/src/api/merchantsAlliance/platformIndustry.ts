import request from '/@/utils/request'
import {
  PlatformIndustryCreateRequest,
  PlatformIndustryEditRequest,
  PlatformIndustryListRequest,
  PlatformIndustryListResponse,
} from '/@/api/merchantsAlliance/store/types'

enum apiPath {
  LIST_INDUSTRY = '/merchant/platform/industry/list',
  ADD_INDUSTRY = '/merchant/platform/industry/add',
  UPDATE_INDUSTRY = '/merchant/platform/industry/update',
  DELETE_INDUSTRY = '/merchant/platform/industry/',
}

// 获取行业列表
export async function getIndustryList(query: PlatformIndustryListRequest) {
  return request<PlatformIndustryListResponse>({
    url: apiPath.LIST_INDUSTRY,
    method: 'get',
    params: query,
  })
}

// 添加行业
export function addIndustry(query: PlatformIndustryCreateRequest) {
  return request({
    url: apiPath.ADD_INDUSTRY,
    method: 'post',
    data: query,
  })
}

// 更新行业
export function updateIndustry(query: PlatformIndustryEditRequest) {
  return request({
    url: apiPath.UPDATE_INDUSTRY,
    method: 'put',
    data: query,
  })
}

// 删除行业
export function deleteIndustry(id: string) {
  return request({
    url: apiPath.DELETE_INDUSTRY + id,
    method: 'delete',
  })
}
