import request from '@/services/api/request'

export interface SysDictType {
  dictId?: number
  tenantId?: number
  dictName: string
  dictType: string
  status?: string
  remark?: string
  createTime?: string
  updateTime?: string
}

export interface SysDictData {
  dictCode?: number
  tenantId?: number
  dictSort?: number
  dictLabel: string
  dictValue: string
  dictType: string
  cssClass?: string
  listClass?: string
  isDefault?: string
  status?: string
  remark?: string
  createTime?: string
  updateTime?: string
}

export const dictTypeApi = {
  list: () => request.get<SysDictType[]>('/auth/system/dict/type/list'),
  getInfo: (dictId: number) => request.get<SysDictType>(`/auth/system/dict/type/${dictId}`),
  add: (data: SysDictType) => request.post<void>('/auth/system/dict/type', data),
  edit: (data: SysDictType) => request.put<void>('/auth/system/dict/type', data),
  remove: (dictIds: number[]) => request.delete<void>(`/auth/system/dict/type/${dictIds.join(',')}`),
  optionselect: () => request.get<SysDictType[]>('/auth/system/dict/type/optionselect')
}

export const dictDataApi = {
  getByType: (dictType: string) => request.get<SysDictData[]>(`/auth/system/dict/data/type/${dictType}`),
  list: (dictType?: string) => request.get<SysDictData[]>('/auth/system/dict/data/list', { params: { dictType } }),
  getInfo: (dictCode: number) => request.get<SysDictData>(`/auth/system/dict/data/${dictCode}`),
  add: (data: SysDictData) => request.post<void>('/auth/system/dict/data', data),
  edit: (data: SysDictData) => request.put<void>('/auth/system/dict/data', data),
  remove: (dictCodes: number[]) => request.delete<void>(`/auth/system/dict/data/${dictCodes.join(',')}`)
}
