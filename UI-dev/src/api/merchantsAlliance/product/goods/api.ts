import request from '/@/utils/request'
import { IGoodsFormData } from '/@/api/merchantsAlliance/product/goods/types'

export const goodsDetailApi = (id: string) => request<IGoodsFormData>({ url: `/merchant/product/detail/${id}`, method: 'get' })

export const goodsSaveApi = (params: IGoodsFormData, isUpdate: boolean) =>
  request({ url: '/merchant/product', method: isUpdate ? 'put' : 'post', data: params })

export const goodsListApi = (params: any) => request({ url: '/merchant/product/page', method: 'post', data: params })

export const goodsStatusApi = (id: string, status: string) =>
  request({ url: `/merchant/product/${id}/status`, method: 'put', params: { status } })

export const goodsRemoveApi = (id: string) => request({ url: `/merchant/product/${id}`, method: 'delete' })
