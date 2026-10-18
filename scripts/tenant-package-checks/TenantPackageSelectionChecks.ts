import assert from 'node:assert/strict';
import { emptyPackageAdjustments, packageFormFrom, packageSelectionError, readPackageAdjustments } from '../../cloudflow-frontend/src/pages/system/_components/tenantPackageSelection';
import type { TenantPackageCatalog } from '../../cloudflow-frontend/src/services/api/tenantPackage';
import { loadRepository, replayFormal } from '../check-batch-h-contracts.mjs';

const independent = [876, 877, 878, 879, 880, 881, 882, 883, 884, 902, 903, 904, 905, 1206, 1207, 1208, 1762, 1985, 1986];
const fixed = [900, 901, 906];
const memory = replayFormal(loadRepository()).memory;
const catalog: TenantPackageCatalog = { modules: ['WORKFLOW', 'OA', 'CRM', 'HR'], features: memory.rows('sys_menu').map(row => ({ menuId: Number(String(row.menu_id)), parentId: Number(String(row.parent_id)), menuName: row.menu_name,
  menuType: row.menu_type, permissions: row.perms, enabled: String(row.status) === '0', fixedAccountOperation: fixed.includes(Number(String(row.menu_id))), independentOperation: independent.includes(Number(String(row.menu_id))) })) };
let checks = 0;
const check = (label: string, predicate: boolean) => { assert.ok(predicate, label); checks++; };
for (const menuId of independent) check(`independent ${menuId} needs no page`, packageSelectionError(catalog, [menuId]) === '');
for (const menuId of fixed) check(`cannot remove account operation ${menuId}`, Boolean(packageSelectionError(catalog, [], undefined, { ...emptyPackageAdjustments(), removeMenuIds: [menuId] })));
check('empty means fixed account only', packageSelectionError(catalog, [], []) === '');
check('normal button requires nearest page', Boolean(packageSelectionError(catalog, [1801], ['WORKFLOW'])));
check('parent and button allow exact module', packageSelectionError(catalog, [1800, 1801], ['WORKFLOW']) === '');
check('selected page requires enabled module', Boolean(packageSelectionError(catalog, [1800, 1801], [])));
check('contradictory override is explicit error', Boolean(packageSelectionError(catalog, [], undefined, { ...emptyPackageAdjustments(), addMenuIds: [1986], removeMenuIds: [1986] })));
check('removed page with retained child fails', Boolean(packageSelectionError(catalog, [1800, 1801], undefined, { ...emptyPackageAdjustments(), removeMenuIds: [1800] })));
check('unknown selected feature fails', Boolean(packageSelectionError(catalog, [999999])));
check('unknown removal fails', Boolean(packageSelectionError(catalog, [], undefined, { ...emptyPackageAdjustments(), removeMenuIds: [999999] })));
check('explicit empty override roundtrips', JSON.stringify(readPackageAdjustments(JSON.stringify(emptyPackageAdjustments()))) === JSON.stringify(emptyPackageAdjustments()));
check('null override follows backend none semantics', JSON.stringify(readPackageAdjustments(null)) === JSON.stringify(emptyPackageAdjustments()));
const override = { addMenuIds: [1762], removeMenuIds: [1986], maxUsers: 5, maxStorageMb: 10 };
check('all original overrides preserved', JSON.stringify(readPackageAdjustments(JSON.stringify(override))) === JSON.stringify(override));
for (const invalid of ['', 'null', '{}', '[]', '{', JSON.stringify({ ...override, addMenuIds: [1762, 1762] }), JSON.stringify({ ...override, maxUsers: 0 }), JSON.stringify({ ...override, effectiveMenuIds: [1986] }), JSON.stringify({ ...override, addMenuIds: ['1762'] }), JSON.stringify({ ...override, removeMenuIds: [-1] })]) {
  assert.throws(() => readPackageAdjustments(invalid)); checks++;
}
const disabled = { ...catalog, features: catalog.features.map(feature => feature.menuId === 2 ? { ...feature, enabled: false } : feature) };
check('disabled ancestor fails selected independent feature', Boolean(packageSelectionError(disabled, [1986])));
const cyclic = { ...catalog, features: catalog.features.map(feature => feature.menuId === 2 ? { ...feature, parentId: 1986 } : feature) };
check('cyclic catalog fails closed', Boolean(packageSelectionError(cyclic, [1986])));
const form = packageFormFrom({ packageId: 10, version: 3, packageCode: 'CHECK', packageName: '测试', menuIds: [1986], enabledModules: [], maxUsers: 5, maxStorageMb: 10, price: 0,
  billingCycle: 'NONE', sortNo: 0, status: 'ACTIVE', remark: '', ...{ updateTime: 'private', createBy: 'private' } });
check('save whitelist excludes backend fields', !('updateTime' in form) && !('createBy' in form));
console.log(`TENANT_PACKAGE_SELECTION_CHECKS: assertions=${checks}; failed=0; formal_catalog=${catalog.features.length}; frontend_helpers=true; backend=false`);
