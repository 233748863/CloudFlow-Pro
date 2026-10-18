export interface MobileDesktopPage {
  path: string;
  title: string;
  includeChildren?: boolean;
}

/** G1 FR-6：只登记明确不适配的页面，避免拦截同目录下的移动业务入口。 */
export const MOBILE_DESKTOP_PAGES: readonly MobileDesktopPage[] = [
  { path: '/system/users', title: '用户管理' },
  { path: '/system/roles', title: '角色管理' },
  { path: '/system/menus', title: '菜单管理' },
  { path: '/system/dict', title: '字典管理', includeChildren: true },
  { path: '/system/config', title: '参数配置' },
  { path: '/workflow/design', title: '流程设计器', includeChildren: true },
  { path: '/workflow/versions', title: '流程版本管理', includeChildren: true },
  { path: '/templates/manage', title: '流程模板管理' },
  { path: '/forms', title: '表单设计器', includeChildren: true },
  { path: '/codegen', title: '代码生成器', includeChildren: true },
  { path: '/admin/supplier', title: '供应商管理' },
  { path: '/admin/asset', title: '资产管理' },
  { path: '/hr/payroll', title: '薪资批次' },
  { path: '/office/project', title: '项目任务树' },
  { path: '/office/project/templates', title: '项目模板管理' },
];

export const MOBILE_DESKTOP_FEATURES = {
  reportConfiguration: { path: 'report-configuration', title: '报表配置' },
} satisfies Record<string, MobileDesktopPage>;

export function findMobileDesktopPage(pathname: string): MobileDesktopPage | undefined {
  const path = pathname.replace(/\/+$/, '') || '/';
  return MOBILE_DESKTOP_PAGES.find(page => path === page.path
    || (page.includeChildren && path.startsWith(`${page.path}/`)));
}
