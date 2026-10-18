type MenuRouteLike = {
  menuId?: number | string;
  menuName?: string;
  parentId?: number;
  orderNum?: number;
  path?: string;
  component?: string;
  perms?: string;
  icon?: string;
};

const VEHICLE_MENU_ROUTE_FIXES_BY_ID: Record<number, Partial<MenuRouteLike>> = {
  502: {
    menuName: '车辆管理',
    parentId: 5,
    orderNum: 3,
    path: '/admin/vehicle/list',
    component: 'pages/admin/vehicle/VehicleList',
    perms: 'oa:vehicle:list',
    icon: 'Car',
  },
  503: {
    menuName: '用车申请',
    parentId: 5,
    orderNum: 4,
    path: '/admin/vehicle/booking',
    component: 'pages/admin/vehicle/VehicleBooking',
    perms: 'oa:vehicle:booking',
    icon: 'Car',
  },
  504: {
    menuName: '用车记录',
    parentId: 5,
    orderNum: 5,
    path: '/admin/vehicle/usage',
    component: 'pages/admin/vehicle/VehicleUsageList',
    perms: 'oa:vehicle:usage',
    icon: 'Car',
  },
};

const VEHICLE_MENU_ROUTE_FIXES_BY_NAME = Object.values(VEHICLE_MENU_ROUTE_FIXES_BY_ID)
  .reduce<Record<string, Partial<MenuRouteLike>>>((acc, item) => {
    if (item.menuName) {
      acc[item.menuName] = item;
    }
    return acc;
  }, {});

const WORKFLOW_MENU_ROUTE_FIXES_BY_ID: Record<number, Partial<MenuRouteLike>> = {
  400: {
    menuName: '创建流程',
  },
  404: {
    menuName: '流程管理',
  },
};

const WORKFLOW_MENU_ROUTE_FIXES_BY_PATH: Record<string, Partial<MenuRouteLike>> = {
  '/workflow': {
    menuName: '创建流程',
  },
  '/workflow/management': {
    menuName: '流程管理',
  },
};

/**
 * 把后端菜单的 path 归一成以 / 开头的绝对路径，并剥掉内联 query。
 *
 * sys_menu 里存的 path 有两种写法：大部分带前导斜杠（/system/user），
 * 少数不带（message/channel、job/log、codegen 等）。而 location.pathname
 * 永远带斜杠，直接拿去比就永远匹配不上——侧栏因此认不出当前路由，
 * 刷新后父级不展开、面包屑掉回默认的「工作台 / 仪表盘」。
 *
 * 路由渲染侧本来就各自补过斜杠，所以页面能正常打开，只有侧栏没补。
 * 这里收成一个函数，两边都用，避免再次跑偏。
 */
export const normalizeMenuRoutePath = (path?: string) => {
  const trimmed = (path || '').trim();
  if (!trimmed) {
    return '';
  }
  const [purePath] = trimmed.split('?');
  if (!purePath) {
    return '';
  }
  return purePath.startsWith('/') ? purePath : `/${purePath}`;
};

export const applyKnownMenuRouteFix = <T extends MenuRouteLike>(item: T): T => {
  const menuId = Number(item.menuId);
  const path = item.path?.split('?')[0];
  const fix = (Number.isFinite(menuId) ? VEHICLE_MENU_ROUTE_FIXES_BY_ID[menuId] : undefined)
    ?? (Number.isFinite(menuId) ? WORKFLOW_MENU_ROUTE_FIXES_BY_ID[menuId] : undefined)
    ?? (path ? WORKFLOW_MENU_ROUTE_FIXES_BY_PATH[path] : undefined)
    ?? (item.menuName ? VEHICLE_MENU_ROUTE_FIXES_BY_NAME[item.menuName] : undefined);

  return fix ? ({ ...item, ...fix } as T) : item;
};
