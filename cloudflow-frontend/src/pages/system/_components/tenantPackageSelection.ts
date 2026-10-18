import type { TenantPackageAdjustments, TenantPackageCatalog, TenantPackageFeature, TenantPackageSave } from '@/services/api/tenantPackage';

export const packageModuleNames: Record<string, string> = { WORKFLOW: '审批流程', OA: '办公协同', CRM: '客户管理', HR: '人力资源' };
export const emptyPackageAdjustments = (): TenantPackageAdjustments => ({ addMenuIds: [], removeMenuIds: [], maxUsers: null, maxStorageMb: null });

export function packageFormFrom(template: TenantPackageSave): TenantPackageSave {
  return { packageId: template.packageId, version: template.version, packageCode: template.packageCode, packageName: template.packageName,
    menuIds: [...template.menuIds], enabledModules: [...template.enabledModules], maxUsers: template.maxUsers, maxStorageMb: template.maxStorageMb,
    price: template.price, billingCycle: template.billingCycle, sortNo: template.sortNo, status: template.status, remark: template.remark ?? '' };
}

export function featureAncestors(feature: TenantPackageFeature, catalog: TenantPackageCatalog): TenantPackageFeature[] {
  const indexed = new Map(catalog.features.map(item => [item.menuId, item]));
  const visited = new Set([feature.menuId]);
  const ancestors: TenantPackageFeature[] = [];
  let parentId = feature.parentId;
  while (parentId !== 0) {
    const parent = indexed.get(parentId);
    if (!parent || visited.has(parentId)) throw new Error('功能目录不完整，请刷新后重试');
    visited.add(parentId); ancestors.push(parent); parentId = parent.parentId;
  }
  return ancestors;
}

export function packageSelectionError(catalog: TenantPackageCatalog, menuIds: number[], modules?: string[], adjustments = emptyPackageAdjustments()): string {
  try {
    const indexed = new Map(catalog.features.map(item => [item.menuId, item]));
    const selected = new Set([...menuIds, ...adjustments.addMenuIds].filter(menuId => !adjustments.removeMenuIds.includes(menuId)));
    for (const feature of catalog.features) if (feature.fixedAccountOperation) selected.add(feature.menuId);
    for (const menuId of adjustments.addMenuIds) if (adjustments.removeMenuIds.includes(menuId)) return `功能${menuId}同时新增和移除，请明确选择`;
    for (const menuId of adjustments.removeMenuIds) {
      if (!indexed.has(menuId)) return `移除项${menuId}已不在目录，请核对`;
      if (indexed.get(menuId)?.fixedAccountOperation) return '三项账号基本操作必须保留';
    }
    for (const menuId of selected) {
      const feature = indexed.get(menuId);
      if (!feature) return `功能${menuId}已不在目录，请核对`;
      const ancestors = feature.fixedAccountOperation ? [] : featureAncestors(feature, catalog);
      if ([feature, ...ancestors].some(item => !item.enabled)) return `“${feature.menuName}”或其上级已停用，请取消选择`;
      if (feature.fixedAccountOperation) continue;
      if (ancestors.some(item => adjustments.removeMenuIds.includes(item.menuId))) return `“${feature.menuName}”仍保留，但其上级被移除，请逐项处理`;
      const page = ancestors.find(item => item.menuType === 'C');
      if (feature.menuType === 'F' && !feature.independentOperation && (!page || !selected.has(page.menuId))) return `“${feature.menuName}”需同时选择页面“${page?.menuName ?? '未登记'}”`;
      if (modules) {
        for (const item of [feature, ...ancestors]) {
          for (const permission of (item.permissions ?? '').split(',')) {
            const module = ({ workflow: 'WORKFLOW', oa: 'OA', crm: 'CRM', hr: 'HR' } as Record<string, string>)[permission.split(':')[0]];
            if (module && !modules.includes(module)) return `“${feature.menuName}”需启用“${packageModuleNames[module]}”模块`;
          }
        }
      }
    }
    return '';
  } catch (failure) { return failure instanceof Error ? failure.message : '功能目录不可用'; }
}

export function readPackageAdjustments(source: string | null | undefined): TenantPackageAdjustments {
  if (source == null) return emptyPackageAdjustments();
  const parsed: unknown = JSON.parse(source);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('原套餐覆盖格式错误');
  const record = parsed as Record<string, unknown>;
  const ids = (value: unknown): value is number[] => Array.isArray(value) && value.every(item => Number.isSafeInteger(item) && item > 0) && new Set(value).size === value.length;
  const quota = (value: unknown) => value === null || typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
  if (Object.keys(record).some(key => !['addMenuIds', 'removeMenuIds', 'maxUsers', 'maxStorageMb'].includes(key))
    || !ids(record.addMenuIds) || !ids(record.removeMenuIds) || !quota(record.maxUsers) || !quota(record.maxStorageMb)) throw new Error('原套餐覆盖格式错误，请核对后再改选');
  return { addMenuIds: record.addMenuIds, removeMenuIds: record.removeMenuIds, maxUsers: record.maxUsers as number | null, maxStorageMb: record.maxStorageMb as number | null };
}
