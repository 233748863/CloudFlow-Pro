import request from './request'

export interface SysTenant {
  tenantId: number
  tenantName?: string
  status?: string
  [key: string]: unknown
}

export type TenantListResponse =
  | SysTenant[]
  | {
      records?: SysTenant[]
      rows?: SysTenant[]
      list?: SysTenant[]
      data?: {
        records?: SysTenant[]
        rows?: SysTenant[]
        list?: SysTenant[]
      }
    }

export const getTenantList = (params?: Record<string, string | number | undefined>) =>
  request.get<TenantListResponse>('/auth/system/tenant/list', { params })
