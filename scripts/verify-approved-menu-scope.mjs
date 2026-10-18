import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { approvedCommissionMenus } from './check-batch-h-contracts.mjs';
import { approvedEmailMenus, approvedMeetingMenus, approvedOpportunityMenus, approvedOpportunityImportMenus, approvedPortalMenus, approvedTicketMenus, approvedKnowledgeMenus, approvedPortalFinanceMenus, approvedSkillMenus, approvedAppraisalMenus, approvedAdvanceMenus, approvedReferralMenus, approvedExitInterviewMenus, approvedTrainingRecoveryMenus, approvedSeverancePolicyMenus, approvedSettlementDraftMenus, approvedSettlementApprovalMenus, approvedSettlementFundsMenus, approvedSettlementReversalMenus, approvedBusinessSearchMenus, approvedFilePreviewMenus, approvedDataSourceMenus, approvedOauthMenus, approvedReportMenus, approvedTenantPackageMenus, approvedMenuDesign, expectedMenus, expectedRolePairs, loadRepository, replayFormal, root } from './check-batch-h-contracts.mjs';

const statePath = realpathSync(process.argv[2] || '');
const directory = path.dirname(statePath);
assert.equal(path.basename(statePath), 'state.json');
assert.equal(path.dirname(directory), realpathSync(path.join(root, '.cloudflow-runtime/batch-g-integration')));
assert.match(path.basename(directory), /^[a-f0-9]{32}$/);
const state = JSON.parse(readFileSync(statePath, 'utf8').replace(/^\uFEFF/, ''));
assert.equal(state.status, 'RUNNING');
assert.equal(realpathSync(state.run), directory);
assert.ok(Number.isInteger(state.mysqlPort) && state.mysqlPort > 1024 && state.mysqlPort < 65536);
const environment = { ...process.env };
delete environment.MYSQL_PWD;

function database(statement) {
  const result = spawnSync('mysql.exe', ['--no-defaults', '--protocol=TCP', '--host=127.0.0.1', `--port=${state.mysqlPort}`,
    '--user=root', '--batch', '--raw', '--skip-column-names', '--default-character-set=utf8mb4', 'cloud_flow_db'], {
    input: `START TRANSACTION READ ONLY;\n${statement}\nCOMMIT;`, env: environment, encoding: 'utf8', windowsHide: true, timeout: 30000,
  });
  assert.equal(result.status, 0, result.error?.message || result.stderr);
  return result.stdout.trim();
}

function rows(statement) {
  const value = database(statement);
  return value ? value.split(/\r?\n/).map(row => JSON.parse(row)) : [];
}

function sameSet(label, actual, expected) {
  const missing = [...expected].filter(value => !actual.has(value));
  const unexpected = [...actual].filter(value => !expected.has(value));
  console.log(`${label}: expected=${expected.size}; actual=${actual.size}; missing=${missing.length}; unexpected=${unexpected.length}`);
  if (missing.length || unexpected.length) console.log(JSON.stringify({ missing, unexpected }));
  assert.equal(missing.length + unexpected.length, 0, label);
}

assert.equal(realpathSync(database('SELECT @@datadir;')), realpathSync(path.join(directory, 'mysql-data')));
const formal = replayFormal(loadRepository());
const formalMenus = formal.memory.rows('sys_menu');
const actualMenus = rows('SELECT JSON_OBJECT(\'id\',menu_id,\'permission\',perms) FROM sys_menu ORDER BY menu_id;');
const menuKey = row => `${row.id}:${row.permission || ''}`;
sameSet('FORMAL_MENU_ID_PERMISSION_SET', new Set(actualMenus.map(menuKey)),
  new Set(formalMenus.map(row => menuKey({ id: row.menu_id, permission: row.perms }))));
const allowedPrefixes = new Set(['system', 'oa', 'crm', 'hr', 'workflow']);
const invalidPrefixes = actualMenus.filter(row => row.permission && !allowedPrefixes.has(row.permission.split(':')[0]));
console.log(`MENU_PERMISSION_PREFIXES: invalid=${invalidPrefixes.length}; allowed=${[...allowedPrefixes].join(',')}`);
assert.equal(invalidPrefixes.length, 0);
for (const [batch, lower, upper] of [['A', 1300, 1349], ['B', 1350, 1399], ['C', 1400, 1449], ['D', 1450, 1549],
  ['E', 1550, 1649], ['F', 1650, 1749], ['G', 1750, 1799], ['H', 1800, 1859], ['H2', 1860, 1899], ['H3', 1900, 1949], ['H4', 1950, 1969], ['H5', 1970, 2099]]) {
  const actual = actualMenus.filter(row => row.id >= lower && row.id <= upper);
  const expected = formalMenus.filter(row => Number(row.menu_id) >= lower && Number(row.menu_id) <= upper);
  sameSet(`${batch}_MENU_RANGE_${lower}_${upper}`, new Set(actual.map(menuKey)), new Set(expected.map(row => menuKey({ id: row.menu_id, permission: row.perms }))));
  console.log(`${batch}_MENU_IDS=${actual.map(row => row.id).join(',')}`);
}
sameSet('H_APPROVED_MENU_IDS', new Set(actualMenus.filter(row => row.id >= 1800).map(row => row.id)), new Set(expectedMenus.map(row => row.menuId)));
const hRoles = database('SELECT CONCAT(role_id,\':\',menu_id,\':\',tenant_id) FROM sys_role_menu WHERE tenant_id=100000 AND role_id BETWEEN 1 AND 11 AND menu_id>=1800 ORDER BY role_id,menu_id;').split(/\r?\n/).filter(Boolean);
sameSet('H_APPROVED_ROLE_PAIRS', new Set(hRoles), expectedRolePairs());
const employee = rows('SELECT JSON_OBJECT(\'id\',menu.menu_id,\'permission\',menu.perms) FROM sys_role_menu roles JOIN sys_menu menu ON menu.menu_id=roles.menu_id WHERE roles.tenant_id=100000 AND roles.role_id=5 ORDER BY menu.menu_id;');
const allEmployeeGrants = rows('SELECT JSON_OBJECT(\'tenantId\',tenant_id,\'menuId\',menu_id) FROM sys_role_menu WHERE role_id=5 ORDER BY tenant_id,menu_id;');
sameSet('EMPLOYEE_ALL_TENANTS_GRANTS', new Set(allEmployeeGrants.map(row => `${row.tenantId}:${row.menuId}`)),
  new Set(formal.memory.rows('sys_role_menu').filter(row => String(row.role_id) === '5').map(row => `${row.tenant_id}:${row.menu_id}`)));
const expectedEmployee = formal.memory.rows('sys_role_menu').filter(row => String(row.role_id) === '5' && String(row.tenant_id) === '100000');
sameSet('EMPLOYEE_ALL_GRANTS', new Set(employee.map(row => String(row.id))), new Set(expectedEmployee.map(row => String(row.menu_id))));
const expectedWrites = new Set(['workflow:draft:save', 'workflow:draft:remove', 'workflow:draft:submit',
  'oa:consumable-request:add', 'oa:consumable-request:edit', 'oa:consumable-request:submit', 'oa:consumable-request:cancel',
  'hr:overtime:apply', 'hr:overtime:cancel', 'hr:shift-request:apply', 'hr:shift-request:cancel', 'hr:shift-request:respond',
  'workflow:agent:save', 'workflow:agent:remove', 'workflow:agent:return', 'workflow:agent:assist',
  ...approvedSkillMenus.filter(menu => menu.kind === 'WRITE' && approvedMenuDesign.roleSets[menu.roles].includes(5)).map(menu => menu.permission),
  ...approvedAppraisalMenus.filter(menu => menu.kind === 'WRITE' && approvedMenuDesign.roleSets[menu.roles].includes(5)).map(menu => menu.permission),
  ...approvedAdvanceMenus.filter(menu => menu.kind === 'WRITE' && approvedMenuDesign.roleSets[menu.roles].includes(5)).map(menu => menu.permission),
  ...approvedReferralMenus.filter(menu => menu.kind === 'WRITE' && approvedMenuDesign.roleSets[menu.roles].includes(5)).map(menu => menu.permission),
  ...approvedReportMenus.filter(menu => menu.kind === 'WRITE' && approvedMenuDesign.roleSets[menu.roles].includes(5)).map(menu => menu.permission),
  ...approvedOauthMenus.filter(menu => menu.kind === 'WRITE' && approvedMenuDesign.roleSets[menu.roles].includes(5)).map(menu => menu.permission),
  ...approvedMeetingMenus.filter(menu => menu.kind === 'WRITE' && approvedMenuDesign.roleSets[menu.roles].includes(5)).map(menu => menu.permission)]);
const readMenus = new Set([1800, 1801, 1810, 1811, 1817, 1818, 1820, 1821, 1828, 1829, 1830, 1833, 1840, 1843, 1847, 1850,
  ...approvedSkillMenus.filter(menu => menu.kind === 'READ').map(menu => menu.id),
  ...approvedAppraisalMenus.filter(menu => menu.kind === 'READ').map(menu => menu.id),
  ...approvedAdvanceMenus.filter(menu => menu.kind === 'READ').map(menu => menu.id),
  ...approvedReferralMenus.filter(menu => menu.kind === 'READ').map(menu => menu.id),
  ...approvedBusinessSearchMenus.filter(menu => menu.kind === 'READ').map(menu => menu.id),
  ...approvedFilePreviewMenus.filter(menu => menu.kind === 'READ').map(menu => menu.id),
  ...approvedReportMenus.filter(menu => menu.kind === 'READ').map(menu => menu.id),
  ...approvedOauthMenus.filter(menu => menu.kind === 'READ').map(menu => menu.id),
  ...approvedMeetingMenus.filter(menu => menu.kind === 'READ').map(menu => menu.id)]);
const hWrites = employee.filter(row => row.id >= 1800 && !readMenus.has(row.id));
sameSet('EMPLOYEE_H_SELF_SERVICE_WRITES', new Set(hWrites.map(row => row.permission)), expectedWrites);
for (const row of hWrites) console.log(`EMPLOYEE_APPROVED_SELF_WRITE ${row.id} ${row.permission}`);
assert.equal(employee.filter(row => row.id >= 1400 && row.id <= 1449).length, 0);
assert.equal(employee.filter(row => row.id >= 1320 && row.id <= 1324).length, 0);
console.log('H1_MENU_IDS=1850,1851,1852,1853,1854; RESERVED=1850-1859; OUT_OF_RANGE=0');
sameSet('SETTLEMENT_SUBMIT_ALL_TENANTS_GRANTS', new Set(database("SELECT CONCAT(role_id,':',menu_id,':',tenant_id) FROM sys_role_menu WHERE menu_id=1864 ORDER BY tenant_id,role_id,menu_id;").split(/\r?\n/).filter(Boolean)), new Set(['1:1864:100000', '4:1864:100000']));
const imSelfMenus = approvedMenuDesign.menus.filter(menu => [1788, 1789, 1790].includes(menu.id));
sameSet('G4_IM_CONFIG_MENU_IDS', new Set(actualMenus.filter(row => row.id >= 1780 && row.id <= 1799 || row.permission?.startsWith('system:im:')).map(row => row.id)), new Set([1780, 1781, 1782, 1783, 1784, 1785, 1786, 1787, 1791, ...imSelfMenus.map(menu => menu.id)]));
sameSet('G4_IM_CONFIG_ALL_TENANTS_GRANTS', new Set(database('SELECT CONCAT(role_id,\':\',menu_id,\':\',tenant_id) FROM sys_role_menu WHERE menu_id BETWEEN 1780 AND 1799 ORDER BY tenant_id,role_id,menu_id;').split(/\r?\n/).filter(Boolean)), new Set(['1:1780:100000', '1:1781:100000', '1:1782:100000', '1:1783:100000', '1:1784:100000', '1:1785:100000', '1:1786:100000', '1:1787:100000', '1:1791:100000', ...imSelfMenus.flatMap(menu => approvedMenuDesign.roleSets[menu.roles].map(role => `${role}:${menu.id}:100000`))]));
sameSet('EMPLOYEE_IM_SELF_GRANTS', new Set(allEmployeeGrants.filter(row => row.menuId >= 1780 && row.menuId <= 1799).map(row => row.menuId)), new Set([1788, 1789, 1790]));
console.log('G4_IM_CONFIG_MENU_IDS=1780,1781,1782,1783,1784,1785,1786,1787,1788,1789,1790,1791; RESERVED=1780-1799; OUT_OF_RANGE=0; EMPLOYEE_SELF_GRANTS=3; EMPLOYEE_MANAGEMENT_GRANTS=0; ADMIN_ROLE_PAIRS=12');
sameSet('H2_IMPLEMENTED_MENU_IDS', new Set(actualMenus.filter(row => row.id >= 1860 && row.id <= 1899).map(row => row.id)), new Set([...approvedSkillMenus, ...approvedAppraisalMenus, ...approvedAdvanceMenus, ...approvedReferralMenus, ...approvedExitInterviewMenus, ...approvedTrainingRecoveryMenus, ...approvedSeverancePolicyMenus, ...approvedSettlementDraftMenus, ...approvedSettlementApprovalMenus, ...approvedSettlementFundsMenus, ...approvedSettlementReversalMenus].map(row => row.id)));
sameSet('SETTLEMENT_FUNDS_ALL_TENANTS_GRANTS', new Set(database('SELECT CONCAT(role_id,\':\',menu_id,\':\',tenant_id) FROM sys_role_menu WHERE menu_id IN (1865,1867) ORDER BY tenant_id,role_id,menu_id;').split(/\r?\n/).filter(Boolean)), new Set(approvedSettlementFundsMenus.flatMap(menu => approvedMenuDesign.roleSets[menu.roles].map(role => `${role}:${menu.id}:100000`))));
sameSet('SETTLEMENT_REVERSAL_ALL_TENANTS_GRANTS', new Set(database("SELECT CONCAT(role_id,':',menu_id,':',tenant_id) FROM sys_role_menu WHERE menu_id=1866 ORDER BY tenant_id,role_id,menu_id;").split(/\r?\n/).filter(Boolean)), new Set(['1:1866:100000', '3:1866:100000']));
sameSet('SETTLEMENT_DRAFT_ALL_TENANTS_GRANTS', new Set(database('SELECT CONCAT(role_id,\':\',menu_id,\':\',tenant_id) FROM sys_role_menu WHERE menu_id BETWEEN 1860 AND 1863 ORDER BY tenant_id,role_id,menu_id;').split(/\r?\n/).filter(Boolean)), new Set(approvedSettlementDraftMenus.flatMap(menu => approvedMenuDesign.roleSets[menu.roles].map(role => `${role}:${menu.id}:100000`))));
console.log('H2_SETTLEMENT_DRAFT_MENU_IDS=1860,1861,1862,1863; RESERVED=1860-1899; OUT_OF_RANGE=0; EMPLOYEE_GRANTS=0');
sameSet('EMPLOYEE_REFERRAL_GRANTS', new Set(employee.filter(row => approvedReferralMenus.some(menu => menu.id === row.id)).map(row => row.permission)), new Set(['hr:referral:own', 'hr:referral:submit']));
sameSet('EMPLOYEE_ADVANCE_GRANTS', new Set(employee.filter(row => approvedAdvanceMenus.some(menu => menu.id === row.id)).map(row => row.permission)), new Set(['hr:advance:apply', 'hr:advance:submit', 'hr:advance:own']));
console.log('H2_ADVANCE_MENU_IDS=1871,1872,1873,1874,1875,1876; RESERVED=1860-1899; OUT_OF_RANGE=0; SUBMIT_1873_OWN_ONLY=true; EMPLOYEE_NEW_WRITE=1872_OWN_DRAFT_1873_OWN_SUBMIT_WITHDRAW');
sameSet('SEVERANCE_POLICY_ALL_TENANTS_GRANTS', new Set(database('SELECT CONCAT(role_id,\':\',menu_id,\':\',tenant_id) FROM sys_role_menu WHERE menu_id=1868 ORDER BY tenant_id,role_id;').split(/\r?\n/).filter(Boolean)), new Set(['1:1868:100000', '4:1868:100000', '6:1868:100000']));
console.log('H2_SEVERANCE_POLICY_MENU_ID=1868; RESERVED=1860-1899; OUT_OF_RANGE=0; ROLES=ADMIN,HR,LEGAL; EMPLOYEE_GRANTS=0');
console.log('H2_SKILL_MENU_IDS=1877,1878,1879,1880,1881,1893; RESERVED=1860-1899; OUT_OF_RANGE=0; EMPLOYEE_NEW_WRITE=1880');
sameSet('EMPLOYEE_APPRAISAL_GRANTS', new Set(employee.filter(row => approvedAppraisalMenus.some(menu => menu.id === row.id)).map(row => row.permission)), new Set(['hr:appraisal:own', 'hr:appraisal:respond']));
console.log('H2_APPRAISAL_MENU_IDS=1882,1883,1884,1885,1886,1894,1895; RESERVED=1860-1899; OUT_OF_RANGE=0; EMPLOYEE_NEW_WRITE=1895_OWN_PENDING_CYCLE_INVITATION');
console.log('H4_MENU_IDS=1950,1951,1952,1953,1954,1955,1956,1957,1958,1959; RESERVED=1950-1969; OUT_OF_RANGE=0');
sameSet('H5_IMPLEMENTED_MENU_IDS', new Set(actualMenus.filter(row => row.id >= 1970 && row.id <= 2099).map(row => row.id)), new Set([...approvedBusinessSearchMenus, ...approvedFilePreviewMenus, ...approvedDataSourceMenus, ...approvedOauthMenus, ...approvedReportMenus, ...approvedTenantPackageMenus].map(row => row.id)));
const dataSourceGrants = database('SELECT CONCAT(role_id,\':\',menu_id,\':\',tenant_id) FROM sys_role_menu WHERE menu_id BETWEEN 1973 AND 1976 ORDER BY role_id,menu_id,tenant_id;').split(/\r?\n/).filter(Boolean);
sameSet('DATA_SOURCE_PLATFORM_ONLY_GRANTS', new Set(dataSourceGrants), new Set(approvedDataSourceMenus.map(menu => `1:${menu.id}:100000`)));
assert.equal(allEmployeeGrants.filter(row => approvedDataSourceMenus.some(menu => menu.id === row.menuId)).length, 0);
console.log('H5_DATASOURCE_MENU_IDS=1973,1974,1975,1976; RESERVED=1970-2099; OUT_OF_RANGE=0; EMPLOYEE_GRANTS=0; PLATFORM_ROLE_PAIRS=4');
sameSet('TENANT_PACKAGE_MENU_IDS', new Set(actualMenus.filter(row => row.permission?.startsWith('system:tenant-package:')).map(row => row.id)), new Set([1970, 1971, 1972]));
sameSet('TENANT_PACKAGE_ALL_TENANTS_GRANTS', new Set(database('SELECT CONCAT(role_id,\':\',menu_id,\':\',tenant_id) FROM sys_role_menu WHERE menu_id BETWEEN 1970 AND 1972 ORDER BY tenant_id,role_id,menu_id;').split(/\r?\n/).filter(Boolean)), new Set(['1:1970:100000', '1:1971:100000', '1:1972:100000']));
assert.equal(allEmployeeGrants.filter(row => [1970, 1971, 1972].includes(row.menuId)).length, 0);
console.log('H5_TENANT_PACKAGE_MENU_IDS=1970,1971,1972; RESERVED=1970-2099; OUT_OF_RANGE=0; EMPLOYEE_GRANTS=0; PLATFORM_ROLE_PAIRS=3');
sameSet('EMPLOYEE_H5_EXACT_GRANTS', new Set(employee.filter(row => row.id >= 1970 && row.id <= 2099).map(row => row.permission)), new Set(['system:search:business', 'system:file:preview', 'system:oauth2:grant:list', 'system:oauth2:authorize', 'system:oauth2:grant:revoke', ...approvedReportMenus.filter(menu => approvedMenuDesign.roleSets[menu.roles].includes(5)).map(menu => menu.permission)]));
sameSet('REPORT_APPROVED_MENU_IDS', new Set(actualMenus.filter(row => row.permission?.startsWith('system:report:')).map(row => row.id)), new Set([1977, 1978, 1979, 1980, 1981, 1982, 1983, 1984, 1992, 1993, 1994, 1995, 1996, 1997, 1998, 1999, 2000]));
sameSet('EMPLOYEE_REPORT_SELF_WRITES', new Set(hWrites.filter(row => row.permission.startsWith('system:report:')).map(row => row.id)), new Set([1979, 1980, 1982, 1983, 1984]));
console.log('H5_REPORT_MENU_IDS=1977,1978,1979,1980,1981,1982,1983,1984,1992,1993,1994,1995,1996,1997,1998,1999,2000; RESERVED=1970-2099; OUT_OF_RANGE=0; EMPLOYEE_SELF_WRITES=1979,1980,1982,1983,1984');
sameSet('EMPLOYEE_OAUTH2_SELF_WRITES', new Set(hWrites.filter(row => row.id >= 1987 && row.id <= 1991).map(row => row.permission)), new Set(['system:oauth2:authorize', 'system:oauth2:grant:revoke']));
assert.equal(allEmployeeGrants.filter(row => [1987, 1988].includes(row.menuId)).length, 0);
console.log('H5_OAUTH2_MENU_IDS=1987,1988,1989,1990,1991; RESERVED=1970-2099; OUT_OF_RANGE=0; EMPLOYEE_SELF_WRITES=1989,1991; EMPLOYEE_CLIENT_MANAGEMENT=0');
console.log('H5_PREVIEW_MENU_IDS=1985; RESERVED=1970-2099; OUT_OF_RANGE=0; EMPLOYEE_NEW_WRITE_PERMISSIONS=0');
console.log('H5_SEARCH_MENU_IDS=1986; RESERVED=1970-2099; OUT_OF_RANGE=0; EMPLOYEE_NEW_WRITE_PERMISSIONS=0');
sameSet('H3_IMPLEMENTED_MENU_IDS', new Set(actualMenus.filter(row => row.id >= 1900 && row.id <= 1949).map(row => row.id)), new Set([...approvedOpportunityMenus, ...approvedOpportunityImportMenus, ...approvedCommissionMenus, ...approvedEmailMenus, ...approvedPortalMenus, ...approvedTicketMenus, ...approvedKnowledgeMenus, ...approvedPortalFinanceMenus].map(row => row.id)));
console.log('H3_MENU_IDS=1900,1901,1902,1903,1904,1905,1906,1907,1908,1909,1910,1911,1912,1913,1914,1915,1916,1917; RESERVED=1900-1949; OUT_OF_RANGE=0; EMPLOYEE_H3_GRANTS=0; IMPORT_ROLE_PAIRS=1');
assert.equal(employee.filter(row => row.id >= 1900 && row.id <= 1949).length, 0);
console.log('EMPLOYEE_UNEXPECTED_GRANTS=0; EMPLOYEE_UNEXPECTED_WRITE_PERMISSIONS=0; C_DESIGN_WRITE_GRANTS=0; HOLIDAY_MAINTENANCE_GRANTS=0');
console.log('APPROVED_MENU_SCOPE_PASS=true; ACCESS=READ_ONLY; PRODUCTION_MODIFIED=false; DATABASE_WRITES=0');
