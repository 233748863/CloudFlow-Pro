import request from './request';

export interface MenuItem {
  menuId: number;
  menuName: string;
  parentId: number;
  orderNum: number;
  path: string;
  component?: string;
  menuType: string; // M=目录, C=菜单, F=按钮
  visible: string;
  status: string;
  perms?: string;
  icon: string;
  children?: MenuItem[];
}

/**
 * 获取路由菜单树（从Redis缓存或数据库）
 */
export const getRouters = async (): Promise<MenuItem[]> => {
  return await request.get('/auth/getRouters');
};

/**
 * 获取菜单列表（用于菜单管理页面）
 */
/** 菜单查询参数 */
export interface MenuQuery {
  menuName?: string;
  status?: string;
}

export const getMenuList = async (params?: MenuQuery) => {
  return await request.get('/auth/system/menu/list', { params });
};

/**
 * 获取菜单详情
 */
export const getMenuDetail = async (menuId: number) => {
  return await request.get(`/auth/system/menu/${menuId}`);
};

/**
 * 新增菜单
 */
export const addMenu = async (data: Partial<MenuItem>) => {
  return await request.post('/auth/system/menu', data);
};

/**
 * 修改菜单
 */
export const updateMenu = async (data: Partial<MenuItem>) => {
  return await request.put('/auth/system/menu', data);
};

/**
 * 删除菜单
 */
export const deleteMenu = async (menuId: number) => {
  return await request.delete(`/auth/system/menu/${menuId}`);
};
