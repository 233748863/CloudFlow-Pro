import request from './request';

/** 字典类型 */
export interface SysDictType {
  dictId?: number;
  tenantId?: number;
  dictName: string;
  dictType: string;
  status?: string;
  remark?: string;
  createTime?: string;
}

/** 字典数据 */
export interface SysDictData {
  dictCode?: number;
  tenantId?: number;
  dictSort?: number;
  dictLabel: string;
  dictValue: string;
  dictType: string;
  cssClass?: string;
  listClass?: string;
  isDefault?: string;
  status?: string;
  remark?: string;
  createTime?: string;
}

/** 字典类型管理 API */
export const dictTypeApi = {
  /** 查询字典类型列表 */
  list: () =>
    request.get('/auth/system/dict/type/list') as Promise<SysDictType[]>,

  /** 查询字典类型详情 */
  getInfo: (dictId: number) =>
    request.get(`/auth/system/dict/type/${dictId}`) as Promise<SysDictType>,

  /** 新增字典类型 */
  add: (data: SysDictType) =>
    request.post('/auth/system/dict/type', data),

  /** 修改字典类型 */
  edit: (data: SysDictType) =>
    request.put('/auth/system/dict/type', data),

  /** 删除字典类型 */
  remove: (dictIds: number[]) =>
    request.delete(`/auth/system/dict/type/${dictIds.join(',')}`),

  /** 获取字典类型选择框列表 */
  optionselect: () =>
    request.get('/auth/system/dict/type/optionselect') as Promise<SysDictType[]>,
};

/** 字典数据管理 API */
export const dictDataApi = {
  /** 根据字典类型查询字典数据（公共接口，供下拉框使用） */
  getByType: (dictType: string) =>
    request.get(`/auth/system/dict/data/type/${dictType}`) as Promise<SysDictData[]>,

  /** 查询字典数据列表（管理页面用） */
  list: (dictType?: string) =>
    request.get('/auth/system/dict/data/list', { params: { dictType } }) as Promise<SysDictData[]>,

  /** 查询字典数据详情 */
  getInfo: (dictCode: number) =>
    request.get(`/auth/system/dict/data/${dictCode}`) as Promise<SysDictData>,

  /** 新增字典数据 */
  add: (data: SysDictData) =>
    request.post('/auth/system/dict/data', data),

  /** 修改字典数据 */
  edit: (data: SysDictData) =>
    request.put('/auth/system/dict/data', data),

  /** 删除字典数据 */
  remove: (dictCodes: number[]) =>
    request.delete(`/auth/system/dict/data/${dictCodes.join(',')}`),
};
