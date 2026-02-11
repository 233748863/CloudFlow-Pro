import { ICategoryForm } from '/@/api/merchantsAlliance/product/category/types'
import request from '/@/utils/request'

export const saveApi = (params: ICategoryForm, isUpdate: boolean) =>
  request({ url: '/merchant/product-category', method: isUpdate ? 'put' : 'post', data: params })

export const categoryTreeApi = () => request({ url: '/merchant/product-category/tree', method: 'get' })

export const removeApi = (id: string) => request({ url: `/merchant/product-category/${id}`, method: 'delete' })
