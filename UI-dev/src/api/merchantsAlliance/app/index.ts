import request from '/@/utils/request'
import {
  BannerData,
  PlatformBannerRequest,
  PlatformBannerResponse,
  PlatformNaviMenuData,
  PlatformNaviMenuRequest,
  PlatformNaviMenuResponse, PlatformNaviMenuTreeResponse,
} from '/@/api/merchantsAlliance/app/types'

enum AppApi {
  /** 平台轮播图 */
  GetPlatformBanner = '/merchant/platform/banner/query',
  SavePlatformBanner = '/merchant/platform/banner/save',
  ModifyPlatformBanner = '/merchant/platform/banner/modify',
  EnablePlatformBanner = '/merchant/platform/banner/enable',
  DeletePlatformBanner = '/merchant/platform/banner/delete',
  RebuildPlatformBannerCache = '/merchant/platform/banner/cache/rebuild',

  /** 小程序轮播图 */
  GetMiniBannerIndex = '/merchant/mini/banner/index',

  /** 平台导航菜单 */
  GetPlatformNaviMenuList = '/merchant/platform/navi/menu/list',
  AddPlatformNaviMenu = '/merchant/platform/navi/menu/add',
  ModifyPlatformNaviMenu = '/merchant/platform/navi/menu/modify',
  EnablePlatformNaviMenu = '/merchant/platform/navi/menu/enable',
  DeletePlatformNaviMenu = '/merchant/platform/navi/menu/delete',

  /** 小程序导航菜单查询 */
  GetPlatformNaviMenuTree = '/merchant/mini/navi/menu/tree',
}

/**
 * 平台banner查询
 * @param params 平台banner查询请求参数
 * @returns PlatformBannerResponse
 */
export const getPlatformBanner = (params: PlatformBannerRequest) =>
  request<PlatformBannerResponse>({
    url: AppApi.GetPlatformBanner,
    method: 'put',
    data: params,
  })

/**
 * 平台banner保存
 * @param params 平台banner保存请求参数
 * @returns BannerData
 */
export const createPlatformBanner = (params: BannerData) =>
  request<BannerData>({
    url: AppApi.SavePlatformBanner,
    method: 'post',
    data: params,
  })
/**
 * 平台banner修改
 * @param params 平台banner修改请求参数
 * @returns BannerData
 */
export const modifyPlatformBanner = (params: BannerData) =>
  request<BannerData>({
    url: AppApi.ModifyPlatformBanner,
    method: 'put',
    data: params,
  })

/**
 * 平台banner启用
 * @param params 平台banner启用请求参数
 * @returns BannerData
 */
export const enablePlatformBanner = (params: { id: string }) =>
  request<BannerData>({
    url: AppApi.EnablePlatformBanner,
    method: 'put',
    params: params,
  })
/**
 * 平台banner删除
 * @param params 平台banner删除请求参数
 * @returns BannerData
 */
export const deletePlatformBanner = (params: { id: string }) =>
  request<BannerData>({
    url: AppApi.DeletePlatformBanner,
    method: 'delete',
    params: params,
  })
/**
 * 平台banner缓存重建
 * @returns
 */
export const rebuildPlatformBannerCache = () =>
  request({
    url: AppApi.RebuildPlatformBannerCache,
    method: 'put',
  })

/**
 * 小程序轮播图查询
 * @returns BannerData[]
 */
export const getMiniBannerIndex = () =>
  request<BannerData[]>({
    url: AppApi.GetMiniBannerIndex,
    method: 'get',
  })

/**
 * 平台导航菜单列表查询
 * @param params 平台导航菜单列表查询请求参数
 * @returns PlatformNaviMenuResponse
 */
export const getPlatformNaviMenuList = (params: PlatformNaviMenuRequest) =>
  request<PlatformNaviMenuResponse>({
    url: AppApi.GetPlatformNaviMenuList,
    method: 'post',
    data: params,
  })

/**
 * 平台导航菜单添加
 * @param params 平台导航菜单添加请求参数
 * @returns PlatformNaviMenuData
 */
export const addPlatformNaviMenu = (params: PlatformNaviMenuData) =>
  request<PlatformNaviMenuData>({
    url: AppApi.AddPlatformNaviMenu,
    method: 'put',
    data: params,
  })

/**
 * 平台导航菜单修改
 * @param params 平台导航菜单修改请求参数
 * @returns PlatformNaviMenuData
 */
export const modifyPlatformNaviMenu = (params: PlatformNaviMenuData) =>
  request<PlatformNaviMenuData>({
    url: AppApi.ModifyPlatformNaviMenu,
    method: 'put',
    data: params,
  })

/**
 * 平台导航菜单启用
 * @param params 平台导航菜单启用请求参数
 * @returns
 */
export const enablePlatformNaviMenu = (params: { id: string, platform: boolean }) =>
  request({
    url: AppApi.EnablePlatformNaviMenu,
    method: 'put',
    data: params,
  })

/**
 * 平台导航菜单删除
 * @param params 平台导航菜单删除请求参数
 * @returns
 */
export const deletePlatformNaviMenu = (params: { id: string, platform: boolean }) =>
  request({
    url: AppApi.DeletePlatformNaviMenu,
    method: 'put',
    data: params,
  })

/**
 * 平台导航菜单树查询
 * @param params 平台导航菜单树查询请求参数
 * @returns PlatformNaviMenuTreeResponse
 */
export const getPlatformNaviMenuTree = (params: { type: string; merchantId: string }) =>
  request<PlatformNaviMenuTreeResponse[]>({
    url: AppApi.GetPlatformNaviMenuTree,
    method: 'get',
    params: params,
  })
