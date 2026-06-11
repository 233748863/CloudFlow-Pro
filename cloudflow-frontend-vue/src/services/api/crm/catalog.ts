import { createCrmRecord, deleteCrmRecords, listCrmPage, updateCrmRecord } from './service'
import type { CrmListParams, CrmRecord } from './types'

export const listProducts = (params?: CrmListParams) => listCrmPage('product', params)
export const addProduct = (data: CrmRecord) => createCrmRecord('product', data)
export const editProduct = (data: CrmRecord) => updateCrmRecord('product', data)
export const removeProduct = (ids: Array<string | number>) => deleteCrmRecords('product', ids)
export const listPriceBooks = (params?: CrmListParams) => listCrmPage('price-book', params)
export const addPriceBook = (data: CrmRecord) => createCrmRecord('price-book', data)
export const editPriceBook = (data: CrmRecord) => updateCrmRecord('price-book', data)
export const removePriceBook = (ids: Array<string | number>) => deleteCrmRecords('price-book', ids)
export const listSalesTargets = (params?: CrmListParams) => listCrmPage('sales-target', params)
export const addSalesTarget = (data: CrmRecord) => createCrmRecord('sales-target', data)
export const editSalesTarget = (data: CrmRecord) => updateCrmRecord('sales-target', data)
export const removeSalesTarget = (ids: Array<string | number>) => deleteCrmRecords('sales-target', ids)
