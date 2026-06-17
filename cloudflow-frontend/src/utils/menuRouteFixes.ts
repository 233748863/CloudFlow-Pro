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

export const applyKnownMenuRouteFix = <T extends MenuRouteLike>(item: T): T => {
  const menuId = Number(item.menuId);
  const fix = (Number.isFinite(menuId) ? VEHICLE_MENU_ROUTE_FIXES_BY_ID[menuId] : undefined)
    ?? (item.menuName ? VEHICLE_MENU_ROUTE_FIXES_BY_NAME[item.menuName] : undefined);

  return fix ? ({ ...item, ...fix } as T) : item;
};
