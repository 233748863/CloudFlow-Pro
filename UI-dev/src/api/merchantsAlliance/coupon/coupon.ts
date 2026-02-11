import { ICouponForm, IGoodsPageParams, IMerchantPageParams } from '/@/api/merchantsAlliance/coupon/types'
import request from '/@/utils/request'

export const pageList = (params?: Object) =>
  request({ url: '/merchant/merchant/coupon/list', method: 'post', data: params })

export const getDetailApi = (params: { merchantId: string; couponTemplateId: string }) =>
  request({ url: `/merchant/merchant/coupon/detail`, method: 'get', params })

export const addCouponApi = (data: ICouponForm) =>
  request({ url: '/merchant/merchant/coupon/create', method: 'post', data })

export const invalidateApi = (params: { merchantId: string; couponTemplateId: string }) =>
  request({ url: '/merchant/merchant/coupon/cancel', method: 'put', data: params })

export const storeOptsApi = (merchantId: string) =>
  request({ url: '/merchant/merchant/store/list', method: 'post', data: { page: 1, pageSize: 1000, merchantId } })

export const goodsOptsApi = (params?: Partial<IGoodsPageParams>) =>
  request({ url: '/merchant/product-sku/detail/page', method: 'post', data: params })

export const merchantOptsApi = (params?: Partial<IMerchantPageParams>) =>
  request({ url: '/merchant/platform/merchant/list', method: 'post', data: params })

export const removeCouponApi = (params: { couponTemplateId: string }) => {
  return request({ url: `/merchant/merchant/coupon/cancel`, method: 'put', data: params })
}
