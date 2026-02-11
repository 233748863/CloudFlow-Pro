export interface ICategory {
  id: string
  name: string
  parentId?: string
  sortOrder?: number | null
  children?: ICategory[]
  [key: string]: any
}

export interface ICategoryForm {
  id?: string
  name: string
  parentId?: string
  sortOrder?: number | null
}

export interface IFilterParams {
  parentId?: string
  name?: string
  page: number
  pageSize: number
  total?: number
}
