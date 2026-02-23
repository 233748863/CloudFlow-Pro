import request from './request';

/** 流程分类接口类型 */
export interface ProcessCategory {
  categoryId?: number;
  parentId?: number;
  categoryName?: string;
  categoryCode?: string;
  icon?: string;
  sortOrder?: number;
  status?: string;
  remark?: string;
  children?: ProcessCategory[];
  parentName?: string;
}

/** 流程分类 API */
export const processCategoryApi = {
  /** 查询分类树(仅正常状态) */
  tree: () => request.get<any, any>('/workflow/category/tree'),

  /** 查询所有分类(含停用) */
  list: () => request.get<any, any>('/workflow/category/list'),

  /** 查询分类详情 */
  getInfo: (categoryId: number) =>
    request.get<any, any>(`/workflow/category/${categoryId}`),

  /** 新增分类 */
  add: (data: ProcessCategory) =>
    request.post<any, any>('/workflow/category', data),

  /** 修改分类 */
  edit: (data: ProcessCategory) =>
    request.put<any, any>('/workflow/category', data),

  /** 删除分类 */
  remove: (categoryId: number) =>
    request.delete<any, any>(`/workflow/category/${categoryId}`),
};
