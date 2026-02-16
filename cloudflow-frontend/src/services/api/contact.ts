import request from './request';
import { PageResult } from '@/types';

/** 通讯录联系人类型 */
export interface Contact {
  user_id: number;
  nick_name: string;
  user_name: string;
  email?: string;
  phonenumber?: string;
  sex?: string;
  avatar?: string;
  status?: string;
  dept_id?: number;
  dept_name?: string;
  post_name?: string;
}

/** 部门节点类型 */
export interface DeptNode {
  dept_id: number;
  parent_id: number;
  dept_name: string;
  order_num: number;
  leader?: string;
  phone?: string;
  email?: string;
}

/** 通讯录 API */
export const contactApi = {
  /** 查询通讯录列表 */
  list: (params: { keyword?: string; deptId?: number; pageNum?: number; pageSize?: number }) =>
    request.get('/oa/contact/list', { params }) as Promise<PageResult<Contact>>,
  /** 查询部门树 */
  deptTree: () => request.get('/oa/contact/dept/tree') as Promise<DeptNode[]>,
  /** 查询用户详情 */
  getUserDetail: (userId: number) => request.get(`/oa/contact/user/${userId}`) as Promise<Contact>,
};
