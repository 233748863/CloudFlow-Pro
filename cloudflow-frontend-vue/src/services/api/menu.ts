import request from '@/services/api/request'

export interface MenuItem {
  menuId: number
  menuName: string
  parentId: number
  orderNum: number
  path: string
  component?: string
  menuType: string
  visible: string
  status: string
  perms?: string
  icon: string
  children?: MenuItem[]
}

export const getRouters = () => request.get<MenuItem[]>('/auth/getRouters')
