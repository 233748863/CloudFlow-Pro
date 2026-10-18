import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { Decimal, MemorySql, SqlError, canonical, numeric, parseAlter, parseCreate, parseInsert, scanSql, stable, statements, targetTable, text, word } from './check-batch-h-contracts-sql.mjs';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const approvedMenuDesign = JSON.parse(fs.readFileSync(path.join(root, 'docs/design/H-G剩余设计菜单清单.json'), 'utf8'));
export const approvedMeetingMenus = approvedMenuDesign.menus.filter(menu => menu.batch === 'H4');
export const approvedOpportunityMenus = approvedMenuDesign.menus.filter(menu => menu.batch === 'H3' && [1900, 1901, 1902, 1903, 1904, 1905, 1906].includes(menu.id))
  .map(menu => ({ ...menu, parent: [1902, 1904].includes(menu.id) ? 801 : menu.parent }));
export const approvedEmailMenus = approvedMenuDesign.menus.filter(menu => menu.batch === 'H3' && [1909, 1910, 1911].includes(menu.id));
export const approvedCommissionMenus = approvedMenuDesign.menus.filter(menu => menu.batch === 'H3' && [1907, 1908].includes(menu.id));
export const approvedPortalMenus = approvedMenuDesign.menus.filter(menu => menu.batch === 'H3' && [1912, 1913].includes(menu.id));
export const approvedTicketMenus = approvedMenuDesign.menus.filter(menu => menu.batch === 'H3' && menu.id === 1914).map(menu => ({ ...menu, parent: 805 }));
export const approvedKnowledgeMenus = approvedMenuDesign.menus.filter(menu => menu.batch === 'H3' && menu.id === 1915).map(menu => ({ ...menu, parent: 210 }));
export const approvedPortalFinanceMenus = approvedMenuDesign.menus.filter(menu => menu.batch === 'H3' && menu.id === 1916);
export const approvedOpportunityImportMenus = approvedMenuDesign.menus.filter(menu => menu.batch === 'H3' && menu.id === 1917);
export const approvedSkillMenus = approvedMenuDesign.menus.filter(menu => menu.batch === 'H2' && [1877, 1878, 1879, 1880, 1881, 1893].includes(menu.id));
export const approvedAppraisalMenus = approvedMenuDesign.menus.filter(menu => menu.batch === 'H2' && [1882, 1883, 1884, 1885, 1886, 1894, 1895].includes(menu.id));
export const approvedAdvanceMenus = approvedMenuDesign.menus.filter(menu => menu.batch === 'H2' && [1871, 1872, 1873, 1874, 1875, 1876].includes(menu.id));
export const approvedReferralMenus = approvedMenuDesign.menus.filter(menu => menu.batch === 'H2' && [1887, 1888, 1889, 1890, 1891, 1892].includes(menu.id));
export const approvedExitInterviewMenus = approvedMenuDesign.menus.filter(menu => menu.batch === 'H2' && menu.id === 1869);
export const approvedTrainingRecoveryMenus = approvedMenuDesign.menus.filter(menu => menu.batch === 'H2' && menu.id === 1870);
export const approvedSeverancePolicyMenus = approvedMenuDesign.menus.filter(menu => menu.batch === 'H2' && menu.id === 1868);
export const approvedSettlementDraftMenus = approvedMenuDesign.menus.filter(menu => menu.batch === 'H2' && menu.id >= 1860 && menu.id <= 1863);
export const approvedSettlementApprovalMenus = approvedMenuDesign.menus.filter(menu => menu.batch === 'H2' && menu.id === 1864);
export const approvedSettlementFundsMenus = approvedMenuDesign.menus.filter(menu => menu.batch === 'H2' && [1865,1867].includes(menu.id));
export const approvedSettlementReversalMenus = approvedMenuDesign.menus.filter(menu => menu.batch === 'H2' && menu.id === 1866);
export const approvedBusinessSearchMenus = approvedMenuDesign.menus.filter(menu => menu.batch === 'H5' && menu.id === 1986);
export const approvedFilePreviewMenus = approvedMenuDesign.menus.filter(menu => menu.batch === 'H5' && menu.id === 1985);
export const approvedDataSourceMenus = approvedMenuDesign.menus.filter(menu => menu.batch === 'H5' && [1973, 1974, 1975, 1976].includes(menu.id));
export const approvedTenantPackageMenus = approvedMenuDesign.menus.filter(menu => menu.batch === 'H5' && [1970, 1971, 1972].includes(menu.id));
export const approvedOauthMenus = approvedMenuDesign.menus.filter(menu => menu.batch === 'H5' && [1987, 1988, 1989, 1990, 1991].includes(menu.id));
export const approvedReportMenus = approvedMenuDesign.menus.filter(menu => menu.batch === 'H5' && (menu.id >= 1977 && menu.id <= 1984 || menu.id >= 1992 && menu.id <= 2000));
export const reportTables = ['sys_report_dataset', 'sys_report_chart', 'sys_report_dashboard', 'sys_report_dashboard_item'];
export const tenantPackageTables = ['sys_tenant_package', 'sys_tenant_package_sync', 'sys_tenant_package_sync_item'];
export const oauthTables = ['sys_oauth2_client', 'sys_oauth2_code', 'sys_oauth2_access_token', 'sys_oauth2_refresh_token', 'sys_oauth2_approve'];
export const imTables = ['sys_im_config', 'sys_im_user_mapping', 'sys_im_dept_mapping', 'sys_im_todo_mapping', 'sys_im_sync_run', 'sys_im_callback_event'];
export const approvedImConfigMenus = approvedMenuDesign.menus.filter(menu => menu.batch === 'G4' && [1780, 1781, 1782, 1783, 1784, 1785, 1786, 1787, 1791].includes(menu.id));
const dbDirectory = 'cloudflow-backend/DB';
const designDirectory = 'docs/design';
export const formalFiles = ['01.cloudflow-common.sql', '02.cloudflow-workflow.sql', '03.cloudflow-hr.sql', '04.cloudflow-oa.sql', '05.cloudflow-crm.sql'];
export const newTables = ['oa_consumable_ledger', 'oa_consumable_request', 'oa_consumable_request_item', 'hr_overtime_type', 'hr_overtime_request', 'hr_shift_request'];
const changedTables = ['wf_form_draft', 'oa_consumable', 'hr_time_request', 'hr_attendance_checkin', 'hr_schedule_assignment', 'hr_comp_change', 'hr_leave_ledger'];
const roleKeys = ['admin', 'manager', 'finance', 'hr', 'employee', 'legal', 'oa_clerk', 'sales_manager', 'sales_rep', 'crm_ops', 'customer_success'];
const startRoles = [1, 2, 3, 4, 5, 8, 9];
const sequence = (first, last) => Array.from({ length: last - first + 1 }, (unused, index) => first + index);
const ownOa = [...sequence(1820, 1825), 1828];
const ownHr = [1830, 1831, 1832, 1843, 1844, 1845, 1846];
const allOa = [...sequence(1810, 1818), ...sequence(1820, 1829)];
const oaGrants = [allOa, allOa.filter(menu => menu !== 1813), [...ownOa, 1810, 1811, 1817, 1818], ownOa, ownOa, ownOa, [...ownOa, 1810, 1816, 1826, 1827], [...ownOa, 1829], ownOa, ownOa, ownOa];
const hrGrants = [sequence(1830, 1848), [...ownHr, 1833, 1847], [...ownHr, 1833, 1835, 1836, 1837, 1838], [...ownHr, 1833, 1834, 1837, 1838, 1839, 1840, 1841, 1842, 1847, 1848], ownHr, ownHr, ownHr, [...ownHr, 1833, 1847], ownHr, ownHr, ownHr];

export const expectedMenus = [
  [1800, 3, 'C', 'workflow:draft:list', '/workflow/drafts', 'pages/WorkflowDraftPage'],
  [1801, 1800, 'F', 'workflow:draft:view'], [1802, 1800, 'F', 'workflow:draft:save'],
  [1803, 1800, 'F', 'workflow:draft:remove'], [1804, 1800, 'F', 'workflow:draft:submit'],
  [1810, 5, 'C', 'oa:consumable-ledger:list', '/admin/consumable-ledger', 'pages/admin/ConsumableLedgerPage'],
  [1811, 1810, 'F', 'oa:consumable-ledger:cost'], [1812, 1810, 'F', 'oa:consumable-ledger:reverse'],
  [1813, 1810, 'F', 'oa:consumable-ledger:recalculate'], [1814, 509, 'F', 'oa:consumable:adjust'],
  [1815, 509, 'F', 'oa:consumable:scrap'], [1816, 1810, 'F', 'oa:consumable:return'],
  [1817, 5, 'C', 'oa:consumable-report:list', '/admin/consumable-reports', 'pages/admin/ConsumableReportsPage'],
  [1818, 1817, 'F', 'oa:consumable-report:cost'],
  [1820, 5, 'C', 'oa:consumable-request:list', '/admin/consumable-request', 'pages/admin/ConsumableRequestPage'],
  [1821, 1820, 'F', 'oa:consumable-request:query'], [1822, 1820, 'F', 'oa:consumable-request:add'],
  [1823, 1820, 'F', 'oa:consumable-request:edit'], [1824, 1820, 'F', 'oa:consumable-request:submit'],
  [1825, 1820, 'F', 'oa:consumable-request:cancel'], [1826, 1820, 'F', 'oa:consumable-request:issue'],
  [1827, 1820, 'F', 'oa:consumable-request:dispatch'], [1828, 1820, 'F', 'oa:consumable-request:lookup'],
  [1829, 1820, 'F', 'oa:consumable-request:dept-list'],
  [1830, 7, 'C', 'hr:overtime:mine', '/hr/ess/overtime', 'pages/OvertimeApplicationPage'],
  [1831, 1830, 'F', 'hr:overtime:apply'], [1832, 1830, 'F', 'hr:overtime:cancel'],
  [1833, 7, 'C', 'hr:overtime:list', '/hr/overtime', 'pages/hr/HrOvertimePage'],
  [1834, 1833, 'F', 'hr:overtime:verify'], [1835, 1833, 'F', 'hr:overtime:price'],
  [1836, 1833, 'F', 'hr:overtime:finance'], [1837, 1833, 'F', 'hr:overtime:retry'],
  [1838, 1833, 'F', 'hr:overtime:resolve'], [1839, 1833, 'F', 'hr:overtime:export'],
  [1840, 7, 'C', 'hr:overtime-type:list', '/hr/overtime-types', 'pages/hr/rules/HrOvertimeTypePage'],
  [1841, 1840, 'F', 'hr:overtime-type:add'], [1842, 1840, 'F', 'hr:overtime-type:edit'],
  [1843, 7, 'C', 'hr:shift-request:mine', '/hr/ess/shift-requests', 'pages/hr/ess/HrEssShiftRequestPage'],
  [1844, 1843, 'F', 'hr:shift-request:apply'], [1845, 1843, 'F', 'hr:shift-request:cancel'],
  [1846, 7, 'C', 'hr:shift-request:respond', '/hr/ess/shift-invitations', 'pages/hr/ess/HrEssShiftInvitationPage'],
  [1847, 7, 'C', 'hr:shift-request:list', '/hr/shift-requests', 'pages/hr/HrShiftRequestPage'],
  [1848, 1847, 'F', 'hr:shift-request:retry'],
  [1850, 2, 'C', 'workflow:agent:mine', '/workflow/my-agents', 'pages/WorkflowAgentPage'],
  [1851, 1850, 'F', 'workflow:agent:save'], [1852, 1850, 'F', 'workflow:agent:remove'],
  [1853, 1850, 'F', 'workflow:agent:return'], [1854, 1850, 'F', 'workflow:agent:assist'],
].map(([menuId, parentId, menuType, permission, route = '', component = null]) => ({ menuId, parentId, menuType, permission, route, component }))
  .concat([...approvedMeetingMenus, ...approvedOpportunityMenus, ...approvedOpportunityImportMenus, ...approvedCommissionMenus, ...approvedEmailMenus, ...approvedPortalMenus, ...approvedTicketMenus, ...approvedKnowledgeMenus, ...approvedPortalFinanceMenus, ...approvedSkillMenus, ...approvedAppraisalMenus, ...approvedAdvanceMenus, ...approvedReferralMenus, ...approvedExitInterviewMenus, ...approvedTrainingRecoveryMenus, ...approvedSeverancePolicyMenus, ...approvedSettlementDraftMenus, ...approvedSettlementApprovalMenus, ...approvedSettlementFundsMenus, ...approvedSettlementReversalMenus, ...approvedBusinessSearchMenus, ...approvedFilePreviewMenus, ...approvedDataSourceMenus, ...approvedTenantPackageMenus, ...approvedOauthMenus, ...approvedReportMenus].map(menu => ({ menuId: menu.id, parentId: menu.parent, menuType: menu.path ? 'C' : 'F', permission: menu.permission, route: menu.path ?? '', component: menu.component ?? null })));

export function expectedRolePairs() {
  return new Set(roleKeys.flatMap((role, index) => {
    const roleId = index + 1;
    const meetingGrants = approvedMeetingMenus.filter(menu => approvedMenuDesign.roleSets[menu.roles].includes(roleId)).map(menu => menu.id);
    const opportunityGrants = [...approvedOpportunityMenus, ...approvedOpportunityImportMenus].filter(menu => approvedMenuDesign.roleSets[menu.roles].includes(roleId)).map(menu => menu.id);
    const emailGrants = [...approvedEmailMenus, ...approvedCommissionMenus].filter(menu => approvedMenuDesign.roleSets[menu.roles].includes(roleId)).map(menu => menu.id);
    const portalGrants = approvedPortalMenus.filter(menu => approvedMenuDesign.roleSets[menu.roles].includes(roleId)).map(menu => menu.id);
    const ticketGrants = approvedTicketMenus.filter(menu => approvedMenuDesign.roleSets[menu.roles].includes(roleId)).map(menu => menu.id);
    const knowledgeGrants = [...approvedKnowledgeMenus, ...approvedPortalFinanceMenus].filter(menu => approvedMenuDesign.roleSets[menu.roles].includes(roleId)).map(menu => menu.id);
    const skillGrants = approvedSkillMenus.filter(menu => approvedMenuDesign.roleSets[menu.roles].includes(roleId)).map(menu => menu.id);
    const appraisalGrants = approvedAppraisalMenus.filter(menu => approvedMenuDesign.roleSets[menu.roles].includes(roleId)).map(menu => menu.id);
    const advanceGrants = [...approvedAdvanceMenus, ...approvedReferralMenus, ...approvedExitInterviewMenus, ...approvedTrainingRecoveryMenus, ...approvedSeverancePolicyMenus, ...approvedSettlementDraftMenus, ...approvedSettlementApprovalMenus, ...approvedSettlementFundsMenus, ...approvedSettlementReversalMenus].filter(menu => approvedMenuDesign.roleSets[menu.roles].includes(roleId)).map(menu => menu.id);
    const searchGrants = [...approvedBusinessSearchMenus, ...approvedFilePreviewMenus, ...approvedDataSourceMenus, ...approvedTenantPackageMenus, ...approvedOauthMenus, ...approvedReportMenus].filter(menu => approvedMenuDesign.roleSets[menu.roles].includes(roleId)).map(menu => menu.id);
    return [...oaGrants[index], ...hrGrants[index], ...sequence(1850, 1854), ...meetingGrants, ...opportunityGrants, ...emailGrants, ...portalGrants, ...ticketGrants, ...knowledgeGrants, ...skillGrants, ...appraisalGrants, ...advanceGrants, ...searchGrants, ...(startRoles.includes(roleId) ? sequence(1800, 1804) : [])].map(menuId => `${roleId}:${menuId}:100000`);
  }));
}

export class Report {
  constructor() { this.entries = []; }
  check(code, description, callback) {
    try { const detail = callback(); this.entries.push({ status: 'PASS', code, description, detail: detail ?? null }); return true; }
    catch (error) { this.entries.push({ status: 'FAIL', code, description, detail: error.message }); return false; }
  }
  pending(code, description, detail) { this.entries.push({ status: 'PENDING', code, description, detail }); }
  get failures() { return this.entries.filter(entry => entry.status === 'FAIL'); }
}

export function ensure(condition, message) { if (!condition) throw new Error(message); }
export function same(actual, expected, label) {
  ensure(stable(actual) === stable(expected), `${label}：期望 ${stable(expected)}；实际 ${stable(actual)}`);
}
export function sameSet(actual, expected, label) {
  const actualSet = new Set(actual);
  const expectedSet = new Set(expected);
  const missing = [...expectedSet].filter(value => !actualSet.has(value)).sort();
  const extra = [...actualSet].filter(value => !expectedSet.has(value)).sort();
  ensure(!missing.length && !extra.length, `${label}：缺少 ${stable(missing)}；意外 ${stable(extra)}`);
}
const location = token => `${token?.file ?? '<内容>'}:${token?.line ?? 1}`;
const readText = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const hash = content => createHash('sha256').update(content).digest('hex');
const cleanAst = value => JSON.parse(JSON.stringify(value, (key, entry) => key === 'token' ? undefined : entry));

export function loadRepository(read = readText) {
  const sources = new Map();
  const load = file => {
    const source = read(file);
    sources.set(file, source);
    return source;
  };
  const scans = new Map([...formalFiles, '06.cloudflow-business-seed.sql', '07.cloudflow-demo-seed.sql'].map(name => {
    const file = `${dbDirectory}/${name}`;
    const scan = scanSql(load(file), file);
    scan.statements = statements(scan);
    return [name, scan];
  }));
  const docs = new Map(['H-批次H首轮设计确认稿.md', 'H-OA08-耗材台账设计确认稿.md', 'H-HR09-加班调班设计确认稿.md'].map(name => [name, load(`${designDirectory}/${name}`)]));
  const schemas = new Map();
  const counts = [];
  for (const name of formalFiles) {
    const definitions = scans.get(name).statements.filter(entry => word(entry[0]) === 'CREATE' && word(entry[1]) === 'TABLE');
    counts.push(definitions.length);
    for (const entry of definitions) {
      const schema = parseCreate(entry);
      ensure(!schemas.has(schema.name), `${location(schema.token)} 重复建表 ${schema.name}`);
      schemas.set(schema.name, schema);
    }
  }
  return { sources, scans, docs, schemas, counts, read, load };
}

function fencedDefinitions(source, file) {
  const result = [];
  for (const match of source.matchAll(/^```sql\s*\r?\n([\s\S]*?)^```/gm)) {
    const bodyOffset = match.index + match[0].indexOf('\n') + 1;
    const padding = '\n'.repeat(source.slice(0, bodyOffset).split('\n').length - 1);
    result.push(...statements(scanSql(padding + match[1], `${designDirectory}/${file}`)));
  }
  return result;
}

export function designContracts(repository) {
  const contracts = new Map();
  for (const [file, fullSource] of repository.docs) {
    const source = file.startsWith('H-HR09') ? fullSource.slice(0, fullSource.indexOf('### 2.5 ')) : fullSource;
    for (const tokens of fencedDefinitions(source, file)) {
      const operation = word(tokens[0]);
      if (!['CREATE', 'ALTER'].includes(operation)) continue;
      const table = targetTable(tokens);
      if (![...newTables, ...changedTables].includes(table)) continue;
      ensure(!contracts.has(table), `确认稿中出现重复或两套结构：${table}`);
      contracts.set(table, { ...(operation === 'CREATE' ? parseCreate(tokens) : parseAlter(tokens)), full: operation === 'CREATE' });
    }
  }
  sameSet(contracts.keys(), [...newTables, ...changedTables], '确认稿 6 新表 + 7 改表');
  return contracts;
}

export function compareSchema(actual, expected) {
  ensure(actual, `缺少正式表 ${expected.name}`);
  const messages = [];
  const check = callback => { try { callback(); } catch (error) { messages.push(error.message); } };
  if (expected.full) check(() => sameSet(actual.columns.keys(), expected.columns.keys(), `${actual.name} 列集合`));
  for (const [name, wanted] of expected.columns) check(() => {
    const column = actual.columns.get(name);
    ensure(column, `${actual.name}.${name} 缺少列`);
    for (const key of ['type', 'width', 'nullable', 'autoIncrement', 'unsigned', 'charset', 'collation', 'generationStorage']) same(column[key], wanted[key], `${location(column.token)} ${actual.name}.${name}.${key}`);
    same(cleanAst(column.generated), cleanAst(wanted.generated), `${location(column.token)} ${actual.name}.${name}.generated`);
    same(cleanAst(column.default), cleanAst(wanted.default), `${location(column.token)} ${actual.name}.${name}.default`);
    same(cleanAst(column.onUpdate), cleanAst(wanted.onUpdate), `${location(column.token)} ${actual.name}.${name}.onUpdate`);
    ensure(Boolean(column.comment?.trim()), `${location(column.token)} ${actual.name}.${name} 缺少列说明`);
  });
  if (expected.full) check(() => sameSet(actual.indexes.keys(), expected.indexes.keys(), `${actual.name} 索引集合`));
  for (const [name, wanted] of expected.indexes) check(() => {
    const index = actual.indexes.get(name);
    ensure(index, `${actual.name} 缺少索引 ${name}`);
    same({ unique: index.unique, columns: index.columns }, { unique: wanted.unique, columns: wanted.columns }, `${location(index.token)} ${actual.name}.${name}`);
    for (const column of index.columns) ensure(actual.columns.has(column.name), `${actual.name}.${name} 索引引用不存在的列 ${column.name}`);
  });
  for (const [name, wanted] of expected.checks) check(() => same(actual.checks.get(name)?.canonical, wanted.canonical, `${actual.name}.${name} CHECK`));
  if (expected.full) for (const key of ['ENGINE', 'CHARSET', 'AUTO_INCREMENT']) check(() => same(actual.options[key]?.toLowerCase(), expected.options[key]?.toLowerCase(), `${actual.name}.${key}`));
  ensure(!messages.length, messages.join('\n'));
  return `${actual.columns.size} 列，${actual.indexes.size} 索引，${actual.checks.size} CHECK`;
}

export function foundation(scan) {
  const starts = scan.comments.filter(entry => entry.value.trim() === '-- batch-h-foundations:start');
  const ends = scan.comments.filter(entry => entry.value.trim() === '-- batch-h-foundations:end');
  same(starts.length, 1, `${scan.file} foundations 起始标记数量`);
  same(ends.length, 1, `${scan.file} foundations 结束标记数量`);
  ensure(starts[0].start < ends[0].start, `${scan.file} foundations 标记顺序错误`);
  const tokens = scan.tokens.filter(entry => entry.start > starts[0].start && entry.start < ends[0].start);
  return { tokens, statements: splitStatements(tokens), start: starts[0], end: ends[0] };
}
const splitStatements = tokens => statements({ tokens });

const formalTables = new Set(['sys_menu', 'sys_role', 'sys_role_menu', 'sys_tenant', 'sys_user', 'sys_config', 'sys_dict_type', 'sys_dict_data', 'sys_job', 'sys_job_handler', 'sys_message_template', 'sys_business_rule', 'sys_business_rule_version', 'wf_process_definition', 'wf_form_draft', 'hr_overtime_type', 'hr_overtime_request', 'hr_shift_request', 'hr_comp_component', 'hr_leave_type', 'oa_consumable', 'oa_consumable_request', 'oa_consumable_request_item', 'oa_consumable_ledger', 'oa_asset_log', 'biz_purchase_request', 'biz_purchase_item', 'biz_purchase_receipt']);
formalTables.add('crm_sales_stage');
formalTables.add('h3_opportunity_role_guard');
formalTables.add('h5_data_source_guard');
formalTables.add('h5_report_guard');

export function replayFormal(repository) {
  const memory = new MemorySql(repository.schemas);
  let beforeH = null;
  for (const entry of repository.scans.get('06.cloudflow-business-seed.sql').statements) {
    const target = targetTable(entry);
    if (!formalTables.has(target) && !target?.startsWith('h_')) continue;
    if (!beforeH && target === 'sys_menu' && ['INSERT', 'REPLACE'].includes(word(entry[0]))) {
      const parsed = parseInsert(entry, repository.schemas.get(target));
      const menuIndex = parsed.columns.indexOf('menu_id');
      if (parsed.rows?.some(row => row[menuIndex]?.type === 'literal' && numeric(row[menuIndex].value) >= 1800)) beforeH = memory.clone();
    }
    memory.execute(entry);
  }
  ensure(beforeH, '未找到真实 H 菜单插入起点');
  return { memory, beforeH };
}

export function checkMenus(memory) {
  const menus = memory.rows('sys_menu');
  const actual = menus.filter(row => numeric(row.menu_id) >= 1800);
  same(actual.length, 143, '06 H 菜单行数');
  sameSet(actual.map(row => numeric(row.menu_id)), expectedMenus.map(menu => menu.menuId), '06 H 菜单编号');
  for (const expected of expectedMenus) {
    const row = actual.find(menu => numeric(menu.menu_id) === expected.menuId);
    const agentMenu = expected.menuId >= 1850 && expected.menuId <= 1854;
    const meetingMenu = expected.menuId >= 1950 && expected.menuId <= 1969;
    const skillMenu = approvedSkillMenus.some(menu => menu.id === expected.menuId);
    const appraisalMenu = approvedAppraisalMenus.some(menu => menu.id === expected.menuId);
    const advanceMenu = [...approvedAdvanceMenus, ...approvedReferralMenus, ...approvedExitInterviewMenus, ...approvedTrainingRecoveryMenus, ...approvedSeverancePolicyMenus, ...approvedSettlementDraftMenus, ...approvedSettlementApprovalMenus, ...approvedSettlementFundsMenus, ...approvedSettlementReversalMenus].some(menu => menu.id === expected.menuId);
    const searchMenu = [...approvedBusinessSearchMenus, ...approvedFilePreviewMenus, ...approvedDataSourceMenus, ...approvedTenantPackageMenus, ...approvedOauthMenus, ...approvedReportMenus].some(menu => menu.id === expected.menuId);
    const customerMenu = [...approvedOpportunityMenus, ...approvedOpportunityImportMenus, ...approvedCommissionMenus, ...approvedEmailMenus, ...approvedPortalMenus, ...approvedTicketMenus, ...approvedKnowledgeMenus, ...approvedPortalFinanceMenus].some(menu => menu.id === expected.menuId);
    const fields = { parent: numeric(row.parent_id), type: text(row.menu_type), path: text(row.path), component: text(row.component), permission: text(row.perms), status: text(row.status), visible: text(row.visible), frame: text(row.is_frame) };
    same(fields, { parent: expected.parentId, type: expected.menuType, path: expected.route, component: expected.component, permission: expected.permission, status: '0', visible: expected.menuType === 'C' || expected.menuId >= 1830 && !agentMenu && !meetingMenu && !customerMenu && !skillMenu && !appraisalMenu && !advanceMenu && !searchMenu ? '0' : '1', frame: expected.menuId < 1810 || agentMenu || meetingMenu || customerMenu || skillMenu || appraisalMenu || advanceMenu || searchMenu ? '0' : '1' }, `${location(row.$origin)} menu_id=${expected.menuId}`);
    ensure(row.query === null || row.query === '', `${expected.menuId} 出现未确认路由查询参数`);
    same(menus.filter(menu => text(menu.perms) === expected.permission).length, 1, `${expected.permission} 权限码唯一`);
    const ancestors = new Set([expected.menuId]);
    let parent = expected.parentId;
    while (parent !== 0) {
      ensure(!ancestors.has(parent), `${expected.menuId} 菜单父级循环`);
      ancestors.add(parent);
      const parentMenu = menus.find(menu => numeric(menu.menu_id) === parent);
      ensure(parentMenu, `${expected.menuId} 缺少父菜单 ${parent}`);
      same([text(parentMenu.visible), text(parentMenu.status)], ['0', '0'], `${expected.menuId} 父菜单 ${parent} 不可见或停用`);
      parent = numeric(parentMenu.parent_id);
    }
  }
  const attempts = memory.writes.filter(write => write.table === 'sys_menu' && numeric(write.row.menu_id) >= 1800);
  same(attempts.length, 143, 'H 菜单实际写入次数（含重复/被忽略行）');
  ensure(attempts.every(write => write.operation === 'INSERT' && !write.ignore && !write.duplicate), 'H 菜单存在 IGNORE、重复插入或后置改写');
  return 'WF10/OA30/HR55/CRM目录16/SYS32；H2含1860—1863结算草稿、1864提交撤回、1865确认关闭、1866冲正、1867实际收款、1868补偿政策、1869离职面谈和1870培训追偿；H3提成1907/1908按批准清单加入；H5为1970—1972套餐、1973—1976数据源、1977—1984及1992—2000报表、1985预览、1986搜索、1987—1991第三方授权；所有菜单按批准字段逐项匹配';
}

export function checkRoles(memory, beforeH) {
  const roles = memory.rows('sys_role').filter(row => text(row.tenant_id) === '100000');
  sameSet(roles.map(row => `${text(row.role_id)}:${row.role_key}:${text(row.deleted)}:${text(row.status)}`), roleKeys.map((key, index) => `${index + 1}:${key}:0:0`), '11 角色 ID/key/状态');
  const pairs = memory.rows('sys_role_menu').filter(row => numeric(row.menu_id) >= 1800);
  const actual = pairs.map(row => `${text(row.role_id)}:${text(row.menu_id)}:${text(row.tenant_id)}`);
  same(actual.length, 842, 'H 授权实际行数');
  for (const [menuId, roles] of [[1860, [1,3,4]], [1861, [1,4]], [1862, [1,4]], [1863, [1,3,4]], [1864, [1,4]], [1865, [1,3,4]], [1866, [1,3]], [1867, [1,3]]]) {
    sameSet(pairs.filter(row => numeric(row.menu_id) === menuId).map(row => `${text(row.role_id)}:${text(row.tenant_id)}`), roles.map(role => `${role}:100000`), `结算${menuId}精确授权`);
  }
  sameSet(pairs.filter(row => numeric(row.menu_id) === 1869).map(row => `${text(row.role_id)}:${text(row.tenant_id)}`), ['1:100000', '4:100000'], '离职面谈仅ADMIN及HR授权');
  sameSet(pairs.filter(row => numeric(row.menu_id) === 1870).map(row => `${text(row.role_id)}:${text(row.tenant_id)}`), ['1:100000', '4:100000'], '培训追偿核定仅ADMIN及HR授权');
  sameSet(pairs.filter(row => numeric(row.menu_id) === 1868).map(row => `${text(row.role_id)}:${text(row.tenant_id)}`), ['1:100000', '4:100000', '6:100000'], '补偿政策仅ADMIN、HR及LEGAL授权');
  same(pairs.filter(row => approvedReferralMenus.some(menu => menu.id === numeric(row.menu_id))).length, 30, 'H2内推精确授权');
  sameSet(pairs.filter(row => numeric(row.role_id) === 5 && approvedReferralMenus.some(menu => menu.id === numeric(row.menu_id))).map(row => numeric(row.menu_id)), [1888, 1889], 'EMPLOYEE仅本人推荐查询与提交');
  sameSet(actual, expectedRolePairs(), 'H 精确角色授权');
  sameSet(pairs.filter(row => numeric(row.menu_id) === 1917).map(row => `${text(row.role_id)}:${text(row.tenant_id)}`), ['1:100000'], 'H3商机导入默认仅ADMIN，逐行仍须新增或编辑权限');
  same(pairs.filter(row => numeric(row.menu_id) < 1810).length, 35, 'WF 授权');
  same(pairs.filter(row => numeric(row.menu_id) >= 1810 && numeric(row.menu_id) < 1830).length, 109, 'OA 授权');
  same(pairs.filter(row => numeric(row.menu_id) >= 1830 && numeric(row.menu_id) < 1850).length, 108, 'HR 授权');
  same(pairs.filter(row => numeric(row.menu_id) >= 1850 && numeric(row.menu_id) <= 1859).length, 55, 'H1 本人代理授权');
  same(pairs.filter(row => approvedSkillMenus.some(menu => menu.id === numeric(row.menu_id))).length, 41, 'H2 技能精确授权');
  same(pairs.filter(row => approvedAppraisalMenus.some(menu => menu.id === numeric(row.menu_id))).length, 34, 'H2 绩效精确授权');
  same(pairs.filter(row => approvedAdvanceMenus.some(menu => menu.id === numeric(row.menu_id))).length, 40, 'H2 借款入口精确授权');
  sameSet(pairs.filter(row => numeric(row.menu_id) >= 1970 && numeric(row.menu_id) <= 2099).map(row => `${text(row.role_id)}:${text(row.menu_id)}`), [...approvedBusinessSearchMenus, ...approvedFilePreviewMenus, ...approvedDataSourceMenus, ...approvedTenantPackageMenus, ...approvedOauthMenus, ...approvedReportMenus].flatMap(menu => approvedMenuDesign.roleSets[menu.roles].map(role => `${role}:${menu.id}`)), 'H5预览搜索、本人授权及平台管理精确授权');
  sameSet(pairs.filter(row => numeric(row.role_id) === 5 && numeric(row.menu_id) >= 1970 && numeric(row.menu_id) <= 2099).map(row => numeric(row.menu_id)), [...sequence(1977, 1986), 1989, 1990, 1991, 1992, 1993, 1996, 1997], 'EMPLOYEE的H5精确授权仅获准读取及本人定义、本人授权操作');
  sameSet(pairs.filter(row => numeric(row.role_id) === 5 && approvedReportMenus.some(menu => menu.id === numeric(row.menu_id) && menu.kind === 'WRITE')).map(row => numeric(row.menu_id)), [1979, 1980, 1982, 1983, 1984], 'EMPLOYEE报表新增写权限只限五项本人定义操作');
  sameSet(pairs.filter(row => numeric(row.role_id) === 5 && approvedAdvanceMenus.some(menu => menu.id === numeric(row.menu_id))).map(row => numeric(row.menu_id)), [1872, 1873, 1876], 'EMPLOYEE借款仅本人草稿、提交撤回及读取');
  sameSet(pairs.filter(row => numeric(row.role_id) === 5 && approvedAppraisalMenus.some(menu => menu.id === numeric(row.menu_id))).map(row => numeric(row.menu_id)), [1894, 1895], 'EMPLOYEE绩效仅本人读取及本人受邀评分');
  sameSet(pairs.filter(row => numeric(row.role_id) === 5 && approvedSkillMenus.some(menu => menu.id === numeric(row.menu_id))).map(row => numeric(row.menu_id)), [1877, 1880, 1893], 'EMPLOYEE技能仅目录、本人自报及本人查询');
  same(pairs.filter(row => numeric(row.menu_id) >= 1950 && numeric(row.menu_id) <= 1969).length, 85, 'H4 会议授权');
  same(pairs.filter(row => approvedOpportunityMenus.some(menu => menu.id === numeric(row.menu_id))).length, 26, 'H3 商机及团队精确授权');
  sameSet(pairs.filter(row => numeric(row.menu_id) === 1904).map(row => numeric(row.role_id)), [1, 8], '终态恢复仅管理员及销售主管');
  same(pairs.filter(row => approvedEmailMenus.some(menu => menu.id === numeric(row.menu_id))).length, 15, 'H3 邮件归档精确授权');
  same(pairs.filter(row => approvedPortalMenus.some(menu => menu.id === numeric(row.menu_id))).length, 6, 'H3 门户账号精确授权');
  sameSet(pairs.filter(row => numeric(row.menu_id) === 1914).map(row => numeric(row.role_id)), [1, 8, 9, 11], 'H3 工单对外方案仅管理员及CRM处理角色');
  same(pairs.filter(row => approvedKnowledgeMenus.some(menu => menu.id === numeric(row.menu_id))).length, 2, 'H3 知识库对外发布精确授权');
  same(pairs.filter(row => approvedCommissionMenus.some(menu => menu.id === numeric(row.menu_id))).length, 7, 'H3 提成精确授权');
  same(pairs.filter(row => numeric(row.menu_id) >= 1900 && numeric(row.menu_id) <= 1949).length, 63, 'H3 已合入菜单的精确授权');
  const previous = new Set(beforeH.rows('sys_role_menu').map(row => `${text(row.role_id)}:${text(row.menu_id)}:${text(row.tenant_id)}`));
  ensure(actual.every(pair => !previous.has(pair)), 'H 菜单在 H 段前已被其他授权语句占用');
  const genericRoles = state => {
    const startMenus = state.rows('sys_menu').filter(row => row.perms === 'workflow:process:start').map(row => text(row.menu_id));
    return new Set(state.rows('sys_role_menu').filter(row => startMenus.includes(text(row.menu_id)) && text(row.tenant_id) === '100000').map(row => numeric(row.role_id)));
  };
  sameSet(genericRoles(beforeH), startRoles, 'H 前通用发起角色');
  sameSet(genericRoles(memory), startRoles, 'H 后通用发起角色');
  const approvedImSelfPairs = new Set(approvedMenuDesign.menus.filter(menu => [1788, 1789, 1790].includes(menu.id)).flatMap(menu => approvedMenuDesign.roleSets[menu.roles].map(role => `${role}:${menu.id}:100000`)));
  const illegalLegacyAdditions = memory.rows('sys_role_menu').filter(row => numeric(row.role_id) !== 1 && numeric(row.menu_id) < 1800 && ![5, 7].includes(numeric(row.menu_id)) && !previous.has(`${text(row.role_id)}:${text(row.menu_id)}:${text(row.tenant_id)}`) && !approvedImSelfPairs.has(`${text(row.role_id)}:${text(row.menu_id)}:${text(row.tenant_id)}`));
  same(illegalLegacyAdditions.length, 0, '非管理员意外获得的旧权限');
  for (const role of roles) {
    const permissions = memory.rows('sys_role_menu').filter(row => text(row.role_id) === text(role.role_id));
    for (const directory of [5, 7]) ensure(permissions.some(row => numeric(row.menu_id) === directory), `角色 ${text(role.role_id)} 缺少业务目录 ${directory}`);
  }
  return '精确842对；提成事实4对、核定传送3对；结算草稿10对、提交撤回2对、确认关闭3对、实际收款2对、冲正2对；财务可查询、计算、独立审批、确认、收款及冲正，不能修改核定或代人事提交普通结算；借款40对中1873仅本人提交撤回；政策3对、面谈与培训追偿各2对、内推30对；源业务权限和通用发起边界不变';
}

export function maskCodeComments(source) {
  let output = '';
  let index = 0;
  let quote = null;
  while (index < source.length) {
    const current = source[index];
    if (quote) {
      output += current; index += 1;
      if (current === '\\') { output += source[index] ?? ''; index += 1; }
      else if (current === quote) quote = null;
    } else if (['"', "'", '`'].includes(current)) { quote = current; output += current; index += 1; }
    else if (source.startsWith('//', index)) {
      while (index < source.length && source[index] !== '\n') { output += ' '; index += 1; }
    } else if (source.startsWith('/*', index)) {
      const end = source.indexOf('*/', index + 2);
      ensure(end >= 0, '源码注释未闭合');
      output += source.slice(index, end + 2).replace(/[^\n]/g, ' '); index = end + 2;
    } else { output += current; index += 1; }
  }
  return output;
}

function callBody(source, offset) {
  let depth = 1;
  let quote = null;
  let index = offset;
  for (; index < source.length && depth; index += 1) {
    const current = source[index];
    if (quote) {
      if (current === '\\') index += 1;
      else if (current === quote) quote = null;
    } else if (current === '"' || current === "'" || current === '`') quote = current;
    else if (current === '(') depth += 1;
    else if (current === ')') depth -= 1;
  }
  ensure(depth === 0, '权限调用括号未闭合');
  return source.slice(offset, index - 1);
}

const hPermission = /^(?:system:file:preview$|system:oauth2:(?:authorize$|(?:client|grant):)|system:(?:portal:user|search|data-source|tenant-package|report):|workflow:(?:draft|agent):|hr:(?:overtime|overtime-type|shift-request|skill|appraisal|advance|referral|exit-interview|training-recovery|severance|settlement):|oa:knowledge:external-publish$|oa:consumable-(?:ledger|report|request):|oa:consumable:(?:adjust|scrap|return)$|oa:meeting:(?!(?:list|edit)$)|crm:(?:sales-stage|deal-team|deal-allocation|commission|email):|crm:portal:solution:publish$|crm:opportunity:(?:items|stage-analysis|stage-reopen|import)$)/;
export function guardedPermissions(source) {
  const code = maskCodeComments(source);
  const permissions = new Set();
  const quoted = new Uint8Array(code.length);
  let quote = null;
  for (let index = 0; index < code.length; index += 1) {
    const character = code[index];
    if (quote) {
      quoted[index] = 1;
      if (character === '\\') { index += 1; if (index < code.length) quoted[index] = 1; }
      else if (character === quote) quote = null;
    } else if (['"', "'", '`'].includes(character)) { quote = character; quoted[index] = 1; }
  }
  for (const match of code.matchAll(/\b(?:SaCheckPermission|hasPermission|checkPermission|requirePermission)\s*\(/g)) {
    if (quoted[match.index]) continue;
    const body = callBody(code, match.index + match[0].length);
    for (const literal of body.matchAll(/['"]((?:system|workflow|hr|oa|crm):[a-zA-Z0-9:_-]+)['"]/g)) permissions.add(literal[1]);
  }
  for (const match of code.matchAll(/<(?:Hr09Access|RouteGuard)\b[^>]*\bpermission\s*=\s*['"]([^'"]+)['"]/g)) if (!quoted[match.index]) permissions.add(match[1]);
  return permissions;
}

function frontendGraph(repository, entry, visited = new Set()) {
  if (visited.has(entry)) return [];
  visited.add(entry);
  const source = repository.load(entry);
  const code = maskCodeComments(source);
  const result = [source];
  for (const match of code.matchAll(/\bimport\s+(?!type\b)[\s\S]*?\bfrom\s*['"]([^'"]+)['"]/g)) {
    const specifier = match[1];
    if (!specifier.startsWith('.') && !specifier.startsWith('@/')) continue;
    const base = specifier.startsWith('@/') ? path.posix.join('cloudflow-frontend/src', specifier.slice(2)) : path.posix.join(path.posix.dirname(entry), specifier);
    if (!base.startsWith('cloudflow-frontend/src/')) continue;
    const file = ['.tsx', '.ts', '/index.tsx', '/index.ts'].map(suffix => base + suffix).find(candidate => fs.existsSync(path.join(root, candidate)));
    if (file) result.push(...frontendGraph(repository, file, visited));
  }
  return result;
}

function walk(directory, suffix) {
  const result = [];
  for (const entry of fs.readdirSync(path.join(root, directory), { withFileTypes: true })) {
    const file = `${directory}/${entry.name}`;
    if (entry.isDirectory()) result.push(...walk(file, suffix));
    else if (file.endsWith(suffix)) result.push(file);
  }
  return result;
}

export function checkMeetingMobileRoutes(repository) {
  const router = maskCodeComments(repository.load('cloudflow-frontend/src/router.tsx'));
  ensure(/<RouteGuard\s+requiredPermissions=\{requiredPermissions\}>\s*\{withSuspense\(node\)\}\s*<\/RouteGuard>/.test(router), '移动页面 guarded 必须传递实际权限给路由守卫');
  const beginning = router.indexOf('const mobileRoutes = [');
  const ending = router.indexOf('export const router', beginning);
  ensure(beginning >= 0 && ending > beginning, '缺少移动路由定义');
  const mobile = router.slice(beginning, ending);
  for (const [route, permission] of [
    ['/office/my-meetings', 'oa:meeting:mine'],
    ['/admin/meeting-board', 'oa:meeting:board'],
    ['/admin/meeting-usage', 'oa:meeting:usage'],
    ['/office/meeting-minutes', 'oa:meeting:list'],
  ]) {
    const declaration = new RegExp(`\\{\\s*path:\\s*['"]${route}['"],\\s*element:\\s*guarded\\(<DynamicMenuRoute\\s*\\/>,\\s*\\[['"]${permission}['"]\\]\\),?\\s*\\}`);
    ensure(declaration.test(mobile), `移动会议入口缺少明确权限守卫：${route} ${permission}`);
  }
  return '4个移动会议路由按各自菜单权限守卫，首次加载不进入兜底页';
}

export function checkAdvanceMobileRoutes(repository) {
  const router = maskCodeComments(repository.load('cloudflow-frontend/src/router.tsx'));
  const beginning = router.indexOf('const mobileRoutes = [');
  const ending = router.indexOf('export const router', beginning);
  ensure(beginning >= 0 && ending > beginning, '缺少移动路由定义');
  const mobile = router.slice(beginning, ending);
  for (const [route, permission] of [['/hr/advances', 'hr:advance:list'], ['/hr/ess/advances', 'hr:advance:own']]) {
    const declaration = new RegExp(`\\{\\s*path:\\s*['"]${route}['"],\\s*element:\\s*guarded\\(<DynamicMenuRoute\\s*\\/>,\\s*\\[['"]${permission}['"]\\]\\),?\\s*\\}`);
    ensure(declaration.test(mobile), `移动借款入口缺少明确权限守卫：${route} ${permission}`);
  }
  return '2个移动借款入口使用各自权限，首次加载不进入兜底页';
}

export function checkReportMobileRoutes(repository) {
  const router = maskCodeComments(repository.load('cloudflow-frontend/src/router.tsx'));
  const mobile = router.slice(router.indexOf('const mobileRoutes = ['), router.indexOf('export const router'));
  for (const [route, permission] of [['/workspace/report-charts', 'system:report:chart:list'], ['/workspace/report-dashboards', 'system:report:dashboard:list']]) {
    const declaration = new RegExp(`\\{\\s*path:\\s*['"]${route}['"],\\s*element:\\s*guarded\\(<DynamicMenuRoute\\s*\\/>,\\s*\\[['"]${permission}['"]\\]\\),?\\s*\\}`);
    ensure(declaration.test(mobile), `移动报表入口缺少明确权限守卫：${route} ${permission}`);
  }
  return '2个移动报表入口使用各自菜单权限';
}

export function checkFilePreviewMobileRoutes(repository) {
  const router = maskCodeComments(repository.load('cloudflow-frontend/src/router.tsx'));
  ensure(/<RouteGuard\s+requiredPermissions=\{requiredPermissions\}>\s*\{withSuspense\(node\)\}\s*<\/RouteGuard>/.test(router), '移动页面 guarded 必须传递实际权限给路由守卫');
  const beginning = router.indexOf('const mobileRoutes = [');
  const ending = router.indexOf('export const router', beginning);
  ensure(beginning >= 0 && ending > beginning, '缺少移动路由定义');
  const mobile = router.slice(beginning, ending);
  for (const [route, permission] of [
    ['/system/files', 'system:file:list'],
    ['/office/contracts', 'oa:contract:list'],
    ['/admin/license', 'oa:license:list'],
    ['/office/knowledge', 'oa:knowledge:list'],
    ['/expense/claim', 'oa:expense:list'],
    ['/office/invoice', 'oa:invoice:list'],
    ['/hr/recruitment', 'hr:recruitment:list'],
    ['/admin/supplier', 'oa:supplier:list'],
  ]) {
    const declaration = new RegExp(`\\{\\s*path:\\s*['"]${route}['"],\\s*element:\\s*guarded\\(<DynamicMenuRoute\\s*\\/>,\\s*\\[['"]${permission}['"]\\]\\),?\\s*\\}`);
    ensure(declaration.test(mobile), `移动预览源业务入口缺少原菜单权限守卫：${route} ${permission}`);
  }
  return '8个移动预览源业务入口保留原菜单权限，预览权限不替代业务权限';
}

export function checkOpportunityImportAuthorization(repository) {
  const common = 'cloudflow-backend/cloudflow-common/cloudflow-common-excel/src/main/java/com/cloudflow/common/excel/importing/';
  const importer = maskCodeComments(repository.load('cloudflow-backend/cloudflow-service-crm/src/main/java/com/cloudflow/crm/importing/OpportunityImport.java'));
  const registry = maskCodeComments(repository.load(common + 'ImportRegistry.java'));
  const identity = maskCodeComments(repository.load(common + 'ImportIdentity.java'));
  const engine = maskCodeComments(repository.load(common + 'ImportEngine.java'));
  const permission = importer.match(/public\s+String\s+permission\(\)\s*\{\s*return\s+"([^"]+)";\s*\}/)?.[1];
  sameSet([permission], approvedOpportunityImportMenus.map(menu => menu.permission), 'H3商机导入定义权限');
  ensure(/implements\s+ImportDefinition<OpportunityImport\.RowData>,\s*ImportHandler<OpportunityImport\.RowData>/.test(importer), 'H3商机导入必须注册真实定义和处理器');
  ensure(registry.includes('definitions.get(type)') && /if\s*\(!hasPermission\(definition\.permission\(\)\)\)\s*throw new ServiceException/.test(registry)
    && registry.includes('filter(definition -> hasPermission(definition.permission()))'), 'H3商机导入注册器须实际拒绝业务权限缺失并过滤候选');
  ensure(identity.includes('tokens.verifyToken(token)') && identity.includes('session.get("userId")') && identity.includes('session.get("tenantId")')
    && /Operator operator = require\(\);\s*if\s*\(!ImportRegistry\.hasPermission\(permission\)\)\s*throw new ServiceException/.test(identity), 'H3商机导入必须核对真实会话和当前权限');
  const entryGuard = /ImportIdentity\.Operator operator = identity\.require\("system:import:execute"\);\s*ImportDefinition<\?> definition = registry\.require\(bizType\);/g;
  ensure([...engine.matchAll(entryGuard)].length >= 2 && engine.includes('identity.require(definition.updatePermission());')
    && /identity\.require\("system:import:execute"\);\s*registry\.require\(task\.getBizType\(\)\);/g.test(engine), 'H3商机导入模板、上传及异步批次须经过公共授权链');
  const requestStart = importer.indexOf('private CrmOpportunity request(');
  const requestEnd = importer.indexOf('private void requireIdentity(', requestStart);
  const request = importer.slice(requestStart, requestEnd);
  ensure(requestStart >= 0 && requestEnd > requestStart && request.includes('requireIdentity(context, permission());')
    && request.includes('requireIdentity(context, creating ? "crm:opportunity:add" : updatePermission());')
    && /public\s+String\s+updatePermission\(\)\s*\{\s*return\s+"crm:opportunity:edit";\s*\}/.test(importer), 'H3商机导入逐行新增和更新权限不可省略');
  ensure(importer.includes('ImportIdentity.Operator operator = identity.require(requiredPermission);')
    && importer.includes('operator.tenantId() != context.getTenantId() || operator.userId() != context.getOperatorId()'), 'H3商机导入逐行身份必须保持同一租户和操作人');
  const toolbar = maskCodeComments(repository.load('cloudflow-frontend/src/components/crm/management/CrmManagementToolbar.tsx'));
  ensure(/<ImportButton\s+bizType="OPPORTUNITY"\s+permission="crm:opportunity:import"/.test(toolbar), 'H3商机导入页面入口必须绑定同一业务权限');
  return new Set([permission]);
}

export function checkPages(repository, memory) {
  checkExitInterviewRoutes(repository);
  const mobileRouteChecks = [checkMeetingMobileRoutes(repository), checkAdvanceMobileRoutes(repository), checkFilePreviewMobileRoutes(repository), checkOpportunityMobileRoutes(repository), checkEmailArchiveMobileRoutes(repository), checkPortalRoutes(repository), checkDataSourceRoutes(repository), checkTenantPackageRoutes(repository)];
  const dynamic = maskCodeComments(repository.load('cloudflow-frontend/src/router/DynamicMenuRoute.tsx'));
  const guard = maskCodeComments(repository.load('cloudflow-frontend/src/components/common/RouteGuard.tsx'));
  ensure(/<RouteGuard\s+requiredPermissions=\{parsePermissions\(menu\.perms\)\}>[\s\S]*?<PageComponent\s*\/>[\s\S]*?<\/RouteGuard>/.test(dynamic), '动态页面必须由当前菜单权限守卫包裹');
  ensure(/hasPermission\(requiredPermissions,\s*true\)/.test(guard) && /if\s*\(!ok\)\s*\{\s*return\s*\(\s*<Result403/.test(guard), '实际路由守卫必须拒绝缺少菜单权限的用户');
  const globCall = dynamic.match(/import\.meta\.glob(?:<[^>]+>)?\s*\(\s*\[([\s\S]*?)\]/);
  ensure(globCall, '动态路由缺少可解析页面模块注册');
  const globs = [...globCall[1].matchAll(/['"]([^'"]+)['"]/g)].map(match => match[1]);
  ensure(globs.length > 0, '动态路由页面 glob 为空');
  for (const expected of expectedMenus.filter(menu => menu.menuType === 'C')) {
    const row = memory.rows('sys_menu').find(menu => numeric(menu.menu_id) === expected.menuId);
    const moduleKey = `../${row.component}.tsx`;
    ensure(globs.some(glob => !glob.startsWith('!') && path.matchesGlob(moduleKey, glob)) && !globs.some(glob => glob.startsWith('!') && path.matchesGlob(moduleKey, glob.slice(1))), `${expected.menuId} ${row.component} 未被动态路由收录`);
    const file = `cloudflow-frontend/src/${row.component}.tsx`;
    const source = repository.load(file);
    const code = maskCodeComments(source);
    ensure(/\bexport\s+default\s+/.test(code), `${file} 没有默认页面导出`);
    const permissions = new Set(frontendGraph(repository, file).flatMap(content => [...guardedPermissions(content)]));
    ensure(permissions.has(expected.permission) || approvedMeetingMenus.some(menu => menu.id === expected.menuId), `${file} 页面或实际导入模块的权限检查缺少 ${expected.permission}`);
  }
  const permissions = checkOpportunityImportAuthorization(repository);
  for (const module of ['cloudflow-auth', ...['workflow', 'hr', 'oa', 'crm'].map(name => `cloudflow-service-${name}`)]) for (const file of walk(`cloudflow-backend/${module}/src/main/java`, '.java')) {
    for (const permission of guardedPermissions(repository.load(file))) if (hPermission.test(permission) || approvedPortalFinanceMenus.some(menu => menu.permission === permission)) permissions.add(permission);
  }
  sameSet(permissions, expectedMenus.map(menu => menu.permission), '菜单与后端实际权限检查调用');
  return `${expectedMenus.filter(menu => menu.menuType === 'C').length}个页面的路径、模块注册、导出与入口权限；${mobileRouteChecks.join('；')}；${expectedMenus.length}个后端权限检查调用`;
}

export function checkExitInterviewRoutes(repository) {
  const router = maskCodeComments(repository.load('cloudflow-frontend/src/router.tsx'));
  const desktop = router.indexOf('const desktopRoutes = ['); const mobile = router.indexOf('const mobileRoutes = ['); const end = router.indexOf('export const router');
  ensure(desktop >= 0 && mobile > desktop && end > mobile, '面谈路由范围无法解析');
  const route = /\{\s*path:\s*['"]\/hr\/exit-interviews['"],\s*element:\s*guarded\(<DynamicMenuRoute\s*\/>,\s*\[['"]hr:exit-interview:manage['"]\]\),?\s*\}/;
  for (const segment of [router.slice(desktop, mobile), router.slice(mobile, end)]) ensure(route.test(segment), '面谈电脑和手机入口均须显式保护');
  const trainingRoute = /\{\s*path:\s*['"]\/hr\/training-recoveries['"],\s*element:\s*guarded\(<DynamicMenuRoute\s*\/>,\s*\[['"]hr:training-recovery:manage['"]\]\),?\s*\}/;
  for (const segment of [router.slice(desktop, mobile), router.slice(mobile, end)]) ensure(trainingRoute.test(segment), '培训追偿电脑和手机入口均须显式保护');
  const severanceRoute = /\{\s*path:\s*['"]\/hr\/severance-rules['"],\s*element:\s*guarded\(<DynamicMenuRoute\s*\/>,\s*\[['"]hr:severance:manage['"]\]\),?\s*\}/;
  for (const segment of [router.slice(desktop, mobile), router.slice(mobile, end)]) ensure(severanceRoute.test(segment), '补偿政策电脑和手机入口均须显式保护');
  const settlementRoute = /\{\s*path:\s*['"]\/hr\/final-settlements['"],\s*element:\s*guarded\(<DynamicMenuRoute\s*\/>,\s*\[['"]hr:settlement:list['"]\]\),?\s*\}/;
  for (const segment of [router.slice(desktop, mobile), router.slice(mobile, end)]) ensure(settlementRoute.test(segment), '结算电脑和手机入口均须显式保护');
  const vite = maskCodeComments(repository.load('cloudflow-frontend/vite.config.ts'));
  const privateRule = /urlPattern:[^\r\n]*exit-interview[^\r\n]*,\s*handler:\s*['"]NetworkOnly['"]/.exec(vite);
  const generic = /urlPattern:[^\r\n]*url\.pathname\.startsWith\(['"]\/api['"]\)/.exec(vite);
  ensure(privateRule && generic && privateRule.index < generic.index, '内部面谈及附件禁止离线缓存');
  const trainingPrivateRule = /urlPattern:[^\r\n]*training-recovery[^\r\n]*,\s*handler:\s*['"]NetworkOnly['"]/.exec(vite);
  ensure(trainingPrivateRule && generic && trainingPrivateRule.index < generic.index, '培训追偿及私有协议禁止离线缓存');
  const severancePrivateRule = /urlPattern:[^\r\n]*severance-rule[^\r\n]*,\s*handler:\s*['"]NetworkOnly['"]/.exec(vite);
  ensure(severancePrivateRule && generic && severancePrivateRule.index < generic.index, '补偿政策及私有文件禁止离线缓存');
  const settlementPrivateRule = /urlPattern:[^\r\n]*settlement[^\r\n]*,\s*handler:\s*['"]NetworkOnly['"]/.exec(vite);
  ensure(settlementPrivateRule && generic && settlementPrivateRule.index < generic.index, '结算金额及取样依据禁止离线缓存');
}

export function checkPortalRoutes(repository) {
  const router = maskCodeComments(repository.load('cloudflow-frontend/src/router.tsx'));
  const desktopStart = router.indexOf('const desktopRoutes = [');
  const mobileStart = router.indexOf('const mobileRoutes = [');
  const routerStart = router.indexOf('export const router');
  ensure(desktopStart >= 0 && mobileStart > desktopStart && routerStart > mobileStart, '门户电脑和手机路由范围无法解析');
  const guardedPortalRoute = /\{\s*path:\s*['"]\/system\/portal-users['"],\s*element:\s*guarded\(<DynamicMenuRoute\s*\/>,\s*\[['"]system:portal:user:list['"]\]\),?\s*\}/;
  for (const [label, routes] of [['电脑', router.slice(desktopStart, mobileStart)], ['手机', router.slice(mobileStart, routerStart)]]) {
    ensure(guardedPortalRoute.test(routes), `${label}门户账号入口缺少明确权限守卫`);
  }
  const client = maskCodeComments(repository.load('cloudflow-frontend/src/services/portal.ts'));
  ensure(/credentials:\s*['"]omit['"]/.test(client) && /cache:\s*['"]no-store['"]/.test(client) && /redirect:\s*['"]error['"]/.test(client), '门户传输必须不带内部Cookie、不缓存、不重定向');
  ensure(!/authStorage|axios|localStorage|Authorization/.test(client), '门户不得使用内部会话存储或Authorization');
  const vite = maskCodeComments(repository.load('cloudflow-frontend/vite.config.ts'));
  const portalCacheRule = /urlPattern:[^\r\n]*portal[^\r\n]*,\s*handler:\s*['"]NetworkOnly['"]/.exec(vite);
  const genericCacheRule = /urlPattern:[^\r\n]*url\.pathname\.startsWith\(['"]\/api['"]\)/.exec(vite);
  ensure(portalCacheRule && genericCacheRule && portalCacheRule.index < genericCacheRule.index, '门户接口必须优先禁止Service Worker离线缓存');
  return '电脑和手机门户账号权限守卫及独立门户会话、禁止离线缓存';
}

export function checkDataSourceRoutes(repository) {
  const router = maskCodeComments(repository.load('cloudflow-frontend/src/router.tsx'));
  const desktopStart = router.indexOf('const desktopRoutes = [');
  const mobileStart = router.indexOf('const mobileRoutes = [');
  const routerStart = router.indexOf('export const router');
  ensure(desktopStart >= 0 && mobileStart > desktopStart && routerStart > mobileStart, '数据源电脑和手机路由范围无法解析');
  const guardedRoute = /\{\s*path:\s*['"]\/system\/data-sources['"],\s*element:\s*guarded\(<DataSourcePage\s*\/>,\s*\[['"]system:data-source:list['"]\]\),?\s*\}/;
  for (const [label, routes] of [['电脑', router.slice(desktopStart, mobileStart)], ['手机', router.slice(mobileStart, routerStart)]]) {
    ensure(guardedRoute.test(routes), `${label}数据源入口缺少明确权限守卫`);
  }
  const vite = maskCodeComments(repository.load('cloudflow-frontend/vite.config.ts'));
  const sensitiveCacheRule = /urlPattern:[^\r\n]*platform[^\r\n]*data-source[^\r\n]*,\s*handler:\s*['"]NetworkOnly['"]/.exec(vite);
  const genericCacheRule = /urlPattern:[^\r\n]*url\.pathname\.startsWith\(['"]\/api['"]\)/.exec(vite);
  ensure(sensitiveCacheRule && genericCacheRule && sensitiveCacheRule.index < genericCacheRule.index, '平台身份与数据源接口必须优先禁止Service Worker离线缓存');
  return '电脑和手机数据源权限守卫及平台高风险接口禁止离线缓存';
}

export function checkDataSourceSeeds(repository, memory) {
  const guard = repository.scans.get('06.cloudflow-business-seed.sql').statements.filter(entry => targetTable(entry) === 'h5_data_source_guard');
  same(guard.map(entry => word(entry[0])), ['CREATE', 'INSERT', 'INSERT', 'INSERT', 'INSERT', 'INSERT', 'DROP'], '数据源落库前冲突保护真实语句');
  const baseline = memory.clone();
  for (const [table, column] of [['sys_menu', 'menu_id'], ['sys_role_menu', 'menu_id'], ['sys_job', 'job_id'], ['sys_job_handler', 'handler_id']]) {
    const rows = baseline.rows(table);
    const retained = rows.filter(row => !approvedDataSourceMenus.some(menu => menu.id === numeric(row[column])));
    rows.splice(0, rows.length, ...retained);
  }
  for (const entry of guard) baseline.execute(entry);
  for (const [table, fields] of [
    ['sys_menu', { menu_id: Decimal.from(1973), perms: 'system:other:list' }],
    ['sys_menu', { menu_id: Decimal.from(9999), perms: 'system:data-source:list' }],
    ['sys_job', { job_id: Decimal.from(1973), handler_name: 'other' }],
    ['sys_job', { job_id: Decimal.from(9999), handler_name: 'dataSourceReconcile' }],
    ['sys_job_handler', { handler_id: Decimal.from(1973), handler_name: 'other' }],
    ['sys_job_handler', { handler_id: Decimal.from(9999), handler_name: 'dataSourceReconcile' }],
  ]) {
    const conflicting = baseline.clone();
    conflicting.rows(table).push(fields);
    let rejected = false;
    try { for (const entry of guard) conflicting.execute(entry); }
    catch (error) { if (error instanceof SqlError && /CHECK .+ rejected row/.test(error.message)) rejected = true; else throw error; }
    ensure(rejected, `数据源落库保护未拒绝 ${table} 编号或名称冲突`);
  }
  const job = oneRow(memory.rows('sys_job').filter(row => numeric(row.job_id) === 1973), '数据源集中核对任务');
  same([job.service_name, job.handler_name, job.trigger_type, text(job.interval_ms), job.status], ['auth', 'dataSourceReconcile', 'FIXED_DELAY', '60000', 'ENABLED'], '数据源A3集中核对接线');
  const handler = oneRow(memory.rows('sys_job_handler').filter(row => numeric(row.handler_id) === 1973), '数据源任务处理器');
  same([handler.service_name, handler.handler_name], ['auth', 'dataSourceReconcile'], '数据源处理器接线');
  const demo = repository.scans.get('07.cloudflow-demo-seed.sql');
  ensure(!demo.statements.some(entry => ['sys_data_source_config', 'sys_data_source_registration'].includes(targetTable(entry))), '07不得生成或删除数据源配置和实例事实');
  ensure(!demo.statements.some(entry => reportTables.includes(targetTable(entry))), '07不得生成或删除报表注册及私人定义');
  const projected = memory.clone();
  const admin = projected.rows('sys_role').find(row => text(row.role_id) === '1' && text(row.tenant_id) === '100000');
  ensure(admin, '缺少平台角色基线');
  projected.rows('sys_role').push({ ...admin, role_id: Decimal.from(900000), tenant_id: Decimal.from(100000) },
    { ...admin, role_id: Decimal.from(900001), tenant_id: Decimal.from(100001) });
  for (const entry of demo.statements) {
    const table = targetTable(entry);
    if (['demo_seed_tenants', 'demo_seed_rows'].includes(table)) projected.execute(entry);
    if (table !== 'sys_role_menu' || !['INSERT', 'REPLACE'].includes(word(entry[0]))) continue;
    for (const row of projectRows(entry, projected).filter(row => approvedDataSourceMenus.some(menu => menu.id === numeric(row.menu_id)))) {
      ensure(text(row.role_id) === '1' && text(row.tenant_id) === '100000', '07不得向演示管理员或其他租户扩授平台数据源权限');
    }
  }
  return '落库前6类冲突均拒绝；A3每60秒集中核对；07不伪造数据源事实、不向演示管理员扩授权限';
}

export function checkTenantPackageRoutes(repository) {
  const router = maskCodeComments(repository.load('cloudflow-frontend/src/router.tsx'));
  const desktopStart = router.indexOf('const desktopRoutes = [');
  const mobileStart = router.indexOf('const mobileRoutes = [');
  const routerStart = router.indexOf('export const router');
  ensure(desktopStart >= 0 && mobileStart > desktopStart && routerStart > mobileStart, '套餐电脑和手机路由范围无法解析');
  for (const [label, routes] of [['电脑', router.slice(desktopStart, mobileStart)], ['手机', router.slice(mobileStart, routerStart)]]) {
    for (const [route, permission, component] of [['/system/tenant-packages', 'system:tenant-package:list', 'TenantPackagePage'], ['/system/tenant', 'system:tenant:list', 'TenantList'], ['/system/data-sources', 'system:data-source:list', 'DataSourcePage'], ['/system/oauth2-clients', 'system:oauth2:client:list', 'OauthClientPage']]) {
      const declaration = new RegExp(`\\{\\s*path:\\s*['"]${route}['"],\\s*element:\\s*guarded\\(<${component}\\s*\\/>,\\s*\\[['"]${permission}['"]\\]\\),?\\s*\\}`, 'g');
      same([...routes.matchAll(declaration)].length, 1, `${label}套餐或租户入口必须有且仅有一个明确权限路由：${route}`);
    }
  }
  for (const [file, permission] of [['TenantPackagePage', 'system:tenant-package:list'], ['TenantList', 'system:tenant:list']]) {
    const source = maskCodeComments(repository.load(`cloudflow-frontend/src/pages/system/${file}.tsx`));
    ensure(source.includes(`<PlatformOperationGate permission="${permission}">`), `${file}必须使用平台再认证`);
  }
  const vite = maskCodeComments(repository.load('cloudflow-frontend/vite.config.ts'));
  const protectedRule = /urlPattern:[^\r\n]*tenant-package\|tenant[^\r\n]*,\s*handler:\s*['"]NetworkOnly['"]/.exec(vite);
  const genericRule = /urlPattern:[^\r\n]*url\.pathname\.startsWith\(['"]\/api['"]\)/.exec(vite);
  ensure(protectedRule && genericRule && protectedRule.index < genericRule.index, '套餐、同步和租户接口必须优先禁止离线缓存');
  ensure(protectedRule[0].includes('tenant\\/switch-options$'), '切换候选接口必须禁止离线缓存');
  const guard = maskCodeComments(repository.load('cloudflow-frontend/src/components/common/RouteGuard.tsx'));
  ensure(guard.includes('if (requiredPermissions.length > 0)') && !guard.includes('requiredPermissions.length > 0 && !isAdmin'), '管理员页面权限不能绕过套餐');
  for (const file of ['UserList', 'RoleList']) ensure(!repository.load(`cloudflow-frontend/src/pages/system/${file}.tsx`).includes('getTenantList'), `${file}不可调用平台租户列表`);
  const switcher = maskCodeComments(repository.load('cloudflow-frontend/src/components/TenantSwitcher.tsx'));
  ensure(switcher.includes("hasPermission('system:tenant:switch')") && switcher.includes('getTenantSwitchOptions') && !switcher.includes('getTenantList'), '切换器必须遵守903并只读取简要候选');
  return '电脑和手机各4个平台直接权限入口，不依赖可选904，工作区仍须平台再认证';
}

export function checkTenantPackageSeeds(repository, memory) {
  const guard = repository.scans.get('06.cloudflow-business-seed.sql').statements.filter(entry => targetTable(entry) === 'h5_tenant_package_guard');
  same(guard.map(entry => word(entry[0])), ['CREATE', 'INSERT', 'INSERT', 'INSERT', 'DROP'], '套餐落库前三项冲突保护');
  const baseline = memory.clone();
  const menus = baseline.rows('sys_menu');
  const retained = menus.filter(row => !approvedTenantPackageMenus.some(menu => menu.id === numeric(row.menu_id)));
  menus.splice(0, menus.length, ...retained);
  for (const entry of guard) baseline.execute(entry);
  for (const change of [
    state => state.rows('sys_menu').push({ menu_id: Decimal.from(1970), perms: 'system:other:list' }),
    state => state.rows('sys_menu').push({ menu_id: Decimal.from(9999), perms: 'system:tenant-package:list' }),
    state => { state.rows('sys_menu').find(row => numeric(row.menu_id) === 6).status = '1'; },
    state => { state.rows('sys_role').find(row => numeric(row.role_id) === 1).status = '1'; },
  ]) {
    const conflicting = baseline.clone(); change(conflicting);
    let rejected = false;
    try { for (const entry of guard) conflicting.execute(entry); }
    catch (error) { if (error instanceof SqlError && /CHECK .+ rejected row/.test(error.message)) rejected = true; else throw error; }
    ensure(rejected, '套餐编号、权限码、父目录或平台角色冲突必须拒绝');
  }
  const projected = memory.clone();
  const admin = projected.rows('sys_role').find(row => numeric(row.role_id) === 1 && numeric(row.tenant_id) === 100000);
  projected.rows('sys_role').push({ ...admin, role_id: Decimal.from(900000), tenant_id: Decimal.from(100000) }, { ...admin, role_id: Decimal.from(900001), tenant_id: Decimal.from(100001) });
  for (const entry of repository.scans.get('07.cloudflow-demo-seed.sql').statements) {
    const table = targetTable(entry);
    if (['demo_seed_tenants', 'demo_seed_rows'].includes(table)) projected.execute(entry);
    if (table !== 'sys_role_menu' || !['INSERT', 'REPLACE'].includes(word(entry[0]))) continue;
    for (const row of projectRows(entry, projected).filter(row => approvedTenantPackageMenus.some(menu => menu.id === numeric(row.menu_id)))) {
      ensure(numeric(row.role_id) === 1 && numeric(row.tenant_id) === 100000, '07不得向演示管理员或其他租户扩授套餐权限');
    }
  }
  sameSet(memory.rows('sys_role_menu').filter(row => approvedTenantPackageMenus.some(menu => menu.id === numeric(row.menu_id))).map(row => `${text(row.role_id)}:${text(row.menu_id)}:${text(row.tenant_id)}`), ['1:1970:100000', '1:1971:100000', '1:1972:100000'], '正式套餐授权精确三对');
  return '1970—1972仅平台ADMIN三对；四种冲突实测拒绝；07不扩授演示管理员和其他租户';
}

export function checkImRecoverySeed(repository, memory) {
  const job = oneRow(memory.rows('sys_job').filter(row => numeric(row.job_id) === 1784 || row.handler_name === 'imSyncRecovery'), 'G4恢复任务唯一');
  const expected = { job_id: '1784', tenant_id: '100000', service_name: 'auth', handler_name: 'imSyncRecovery', trigger_type: 'FIXED_DELAY',
    cron_expression: null, interval_ms: '60000', status: 'ENABLED', concurrent_flag: '0', misfire_strategy: 'IGNORE', retry_count: '0',
    dispatch_retry_count: '3', timeout_seconds: '240', lock_time_seconds: '300', log_success_flag: '0', alarm_on_fail_flag: '1' };
  for (const [field, value] of Object.entries(expected)) same(text(job[field]), value, `G4恢复任务字段${field}`);
  const handler = oneRow(memory.rows('sys_job_handler').filter(row => numeric(row.handler_id) === 1784 || row.handler_name === 'imSyncRecovery'), 'G4恢复处理器唯一');
  same([text(handler.handler_id), handler.service_name, handler.handler_name, handler.status], ['1784', 'auth', 'imSyncRecovery', 'ONLINE'], 'G4恢复处理器接线');
  const guard = repository.scans.get('06.cloudflow-business-seed.sql').statements.filter(entry => targetTable(entry) === 'g4_im_recovery_guard');
  same(guard.map(entry => word(entry[0])), ['CREATE', 'INSERT', 'INSERT', 'DROP'], 'G4恢复编号与名称落库保护');
  const baseline = memory.clone();
  for (const [table, field] of [['sys_job', 'job_id'], ['sys_job_handler', 'handler_id']]) {
    const rows = baseline.rows(table);
    rows.splice(0, rows.length, ...rows.filter(row => numeric(row[field]) !== 1784));
  }
  for (const entry of guard) baseline.execute(entry);
  for (const [table, field] of [['sys_job', 'job_id'], ['sys_job_handler', 'handler_id']]) {
    for (const row of [{ [field]: Decimal.from(1784), handler_name: 'other' }, { [field]: Decimal.from(999999), handler_name: 'imSyncRecovery' }]) {
      const conflicting = baseline.clone(); conflicting.rows(table).push(row);
      let rejected = false;
      try { for (const entry of guard) conflicting.execute(entry); }
      catch (error) { if (error instanceof SqlError && /CHECK .+ rejected row/.test(error.message)) rejected = true; else throw error; }
      ensure(rejected, `G4恢复保护未拒绝${table}编号或名称冲突`);
    }
  }
  return 'G4恢复任务1784每60秒且不可并发；任务与处理器四种编号/名称冲突均拒绝';
}

export function checkImCallbackRecoverySeed(repository, memory) {
  const job = oneRow(memory.rows('sys_job').filter(row => numeric(row.job_id) === 1785 || row.handler_name === 'imCallbackRecovery'), 'G4回调任务唯一');
  const expected = { job_id: '1785', tenant_id: '100000', service_name: 'auth', handler_name: 'imCallbackRecovery', trigger_type: 'FIXED_DELAY',
    cron_expression: null, interval_ms: '10000', status: 'ENABLED', concurrent_flag: '0', misfire_strategy: 'IGNORE', retry_count: '0',
    dispatch_retry_count: '3', timeout_seconds: '240', lock_time_seconds: '300', log_success_flag: '0', alarm_on_fail_flag: '1' };
  for (const [field, value] of Object.entries(expected)) same(text(job[field]), value, `G4回调任务字段${field}`);
  const handler = oneRow(memory.rows('sys_job_handler').filter(row => numeric(row.handler_id) === 1785 || row.handler_name === 'imCallbackRecovery'), 'G4回调处理器唯一');
  same([text(handler.handler_id), handler.service_name, handler.handler_name, handler.status], ['1785', 'auth', 'imCallbackRecovery', 'ONLINE'], 'G4回调处理器接线');
  const guard = repository.scans.get('06.cloudflow-business-seed.sql').statements.filter(entry => targetTable(entry) === 'g4_im_callback_recovery_guard');
  same(guard.map(entry => word(entry[0])), ['CREATE', 'INSERT', 'INSERT', 'DROP'], 'G4回调任务落库保护');
  const baseline = memory.clone();
  for (const [table, field] of [['sys_job', 'job_id'], ['sys_job_handler', 'handler_id']]) {
    const rows = baseline.rows(table);
    rows.splice(0, rows.length, ...rows.filter(row => numeric(row[field]) !== 1785));
  }
  for (const entry of guard) baseline.execute(entry);
  for (const [table, field] of [['sys_job', 'job_id'], ['sys_job_handler', 'handler_id']]) {
    for (const row of [{ [field]: Decimal.from(1785), handler_name: 'other' }, { [field]: Decimal.from(999999), handler_name: 'imCallbackRecovery' }]) {
      const conflicting = baseline.clone(); conflicting.rows(table).push(row);
      let rejected = false;
      try { for (const entry of guard) conflicting.execute(entry); }
      catch (error) { if (error instanceof SqlError && /CHECK .+ rejected row/.test(error.message)) rejected = true; else throw error; }
      ensure(rejected, `G4回调恢复未拒绝${table}编号或名称冲突`);
    }
  }
  return 'G4回调任务1785每10秒且不可并发；四种编号/名称冲突均拒绝';
}

export function checkImConfigMenus(repository, memory) {
  checkImRecoverySeed(repository, memory);
  checkImCallbackRecoverySeed(repository, memory);
  const selfMenus = approvedMenuDesign.menus.filter(menu => [1788, 1789, 1790].includes(menu.id));
  same(selfMenus.length, 3, '本人通信绑定三项批准菜单');
  const implementedMenus = [...approvedImConfigMenus, ...selfMenus];
  const approvedPairs = [...approvedImConfigMenus.map(menu => `1:${menu.id}:100000`), ...selfMenus.flatMap(menu => approvedMenuDesign.roleSets[menu.roles].map(role => `${role}:${menu.id}:100000`))];
  sameSet(approvedImConfigMenus.map(menu => menu.id), [1780, 1781, 1782, 1783, 1784, 1785, 1786, 1787, 1791], 'G4管理批准九个编号');
  same(approvedMenuDesign.roleSets.PLATFORM, [1], 'G4配置批准角色');
  ensure(approvedImConfigMenus.every(menu => menu.roles === 'PLATFORM'), 'G4配置角色集合不可扩大');
  const inRange = row => numeric(row.menu_id) >= 1780 && numeric(row.menu_id) <= 1799;
  const menus = memory.rows('sys_menu').filter(row => inRange(row) || text(row.perms)?.startsWith('system:im:'));
  same(menus.length, 12, 'G4菜单不得越段或提前开放未实现功能');
  for (const expected of implementedMenus) {
    const row = menus.find(menu => numeric(menu.menu_id) === expected.id);
    ensure(row, `G4缺少菜单${expected.id}`);
    same([text(row.menu_name), numeric(row.parent_id), text(row.path), text(row.component), text(row.perms), text(row.menu_type), text(row.visible), text(row.status), text(row.is_frame), text(row.is_cache), text(row.query)],
      [expected.name, expected.parent, expected.path ?? '', expected.component ?? null, expected.permission, expected.path ? 'C' : 'F', expected.path ? '0' : '1', '0', '0', '0', null], `G4配置菜单${expected.id}字段`);
  }
  sameSet(memory.rows('sys_role_menu').filter(inRange).map(row => `${text(row.role_id)}:${text(row.menu_id)}:${text(row.tenant_id)}`), approvedPairs, 'G4管理及本人精确授权');
  const writes = memory.writes.filter(write => write.table === 'sys_menu' && inRange(write.row));
  same(writes.length, 12, 'G4实际菜单写入次数');
  ensure(writes.every(write => write.operation === 'INSERT' && !write.ignore && !write.duplicate), 'G4配置不得忽略冲突或后置改写');
  const guard = repository.scans.get('06.cloudflow-business-seed.sql').statements.filter(entry => targetTable(entry) === 'g4_im_config_guard');
  same(guard.map(entry => word(entry[0])), ['CREATE', 'INSERT', 'INSERT', 'INSERT', 'INSERT', 'DROP'], 'G4配置落库四项保护');
  const baseline = memory.clone();
  for (const table of ['sys_menu', 'sys_role_menu']) {
    const rows = baseline.rows(table);
    rows.splice(0, rows.length, ...rows.filter(row => !inRange(row)));
  }
  for (const entry of guard) baseline.execute(entry);
  for (const change of [
    state => state.rows('sys_menu').push({ menu_id: Decimal.from(1799), perms: 'system:other:list' }),
    state => state.rows('sys_menu').push({ menu_id: Decimal.from(9999), perms: 'system:im:config:list' }),
    state => state.rows('sys_role_menu').push({ role_id: Decimal.from(5), menu_id: Decimal.from(1781), tenant_id: Decimal.from(100000) }),
    state => { state.rows('sys_menu').find(row => numeric(row.menu_id) === 6).status = '1'; },
    state => { state.rows('sys_role').find(row => numeric(row.role_id) === 1).status = '1'; },
  ]) {
    const conflicting = baseline.clone(); change(conflicting);
    let rejected = false;
    try { for (const entry of guard) conflicting.execute(entry); }
    catch (error) { if (error instanceof SqlError && /CHECK .+ rejected row/.test(error.message)) rejected = true; else throw error; }
    ensure(rejected, 'G4配置编号、权限、孤立授权、父目录与角色冲突必须拒绝');
  }
  const projected = memory.clone();
  const admin = projected.rows('sys_role').find(row => numeric(row.role_id) === 1 && numeric(row.tenant_id) === 100000);
  projected.rows('sys_role').push({ ...admin, role_id: Decimal.from(900000), tenant_id: Decimal.from(100000) }, { ...admin, role_id: Decimal.from(900001), tenant_id: Decimal.from(100001) });
  for (const entry of repository.scans.get('07.cloudflow-demo-seed.sql').statements) {
    const table = targetTable(entry);
    if (['demo_seed_tenants', 'demo_seed_rows'].includes(table)) projected.execute(entry);
    if (table !== 'sys_role_menu' || !['INSERT', 'REPLACE'].includes(word(entry[0]))) continue;
    for (const row of projectRows(entry, projected).filter(inRange)) {
      ensure(approvedPairs.includes(`${text(row.role_id)}:${text(row.menu_id)}:${text(row.tenant_id)}`), '07不得扩授G4配置或本人权限');
    }
  }
  const router = maskCodeComments(repository.load('cloudflow-frontend/src/router.tsx'));
  for (const section of [router.slice(router.indexOf('const desktopRoutes = ['), router.indexOf('const mobileRoutes = [')), router.slice(router.indexOf('const mobileRoutes = ['), router.indexOf('export const router'))]) {
    ensure(/path:\s*'\/system\/im\/config',\s*element:\s*guarded\(<ImConfigPage\s*\/>\s*,\s*\['system:im:config:list'\]\)/.test(section), 'G4配置电脑手机须明确权限路由');
    ensure(/path:\s*'\/system\/im\/sync',\s*element:\s*guarded\(<ImSyncPage\s*\/>\s*,\s*\['system:im:sync:list'\]\)/.test(section), 'G4同步电脑手机须明确权限路由');
    ensure(/path:\s*'\/workspace\/im-bindings',\s*element:\s*guarded\(<ImBindingMinePage\s*\/>\s*,\s*\['system:im:binding:mine'\]\)/.test(section), 'G4本人绑定双端权限路由');
  }
  const page = maskCodeComments(repository.load('cloudflow-frontend/src/pages/system/ImConfigPage.tsx'));
  ensure(page.includes('export default function ImConfigPage') && page.includes("hasPermission('system:im:config:list')"), 'G4页面须默认导出且独立检查权限');
  ensure(!page.includes('PlatformOperationGate'), 'G4不得误套H5平台名单门槛');
  ensure(repository.load('cloudflow-frontend/src/router/DynamicMenuRoute.tsx').includes("'../pages/**/*.tsx'"), 'G4配置动态模块注册');
  const syncPage = maskCodeComments(repository.load('cloudflow-frontend/src/pages/system/ImSyncPage.tsx'));
  ensure(syncPage.includes('export default function ImSyncPage') && syncPage.includes("hasPermission('system:im:sync:list')"), 'G4同步页面须默认导出且独立检查权限');
  ensure(syncPage.includes("hasPermission('system:im:sync:preview')") && !syncPage.includes('PlatformOperationGate'), 'G4同步操作独立权限且不得误套H5平台名单');
  for (const menu of approvedImConfigMenus) {
    const controllerName = menu.id === 1791 ? 'ImTodoManagementController' : menu.id === 1784 ? 'ImSyncExecutionController' : menu.id === 1786 || menu.id === 1787 ? 'ImBindingManagementController' : menu.permission.startsWith('system:im:sync:') ? 'ImSyncController' : 'ImConfigController';
    const controller = repository.load(`cloudflow-backend/cloudflow-auth/src/main/java/com/cloudflow/auth/controller/system/${controllerName}.java`);
    ensure(controller.includes(`@SaCheckPermission("${menu.permission}")`), 'G4配置Controller权限对应菜单');
  }
  for (const menu of selfMenus) ensure(repository.load('cloudflow-backend/cloudflow-auth/src/main/java/com/cloudflow/auth/controller/ImBindingController.java').includes(`@SaCheckPermission("${menu.permission}")`), 'G4本人Controller权限对应菜单');
  return 'G4十二菜单/42授权；管理九项仅ADMIN，本人三项11角色；07禁止扩授；双端权限路由与Controller对应';
}

export function checkKnowledgePublication(repository) {
  const backend = 'cloudflow-backend/';
  const oa = backend + 'cloudflow-service-oa/src/main/';
  const auth = backend + 'cloudflow-auth/src/main/java/com/cloudflow/auth/';
  const source = file => maskCodeComments(repository.load(file));
  const document = source(oa + 'java/com/cloudflow/oa/domain/KnowledgeDocument.java');
  for (const [type, field] of [['Integer', 'externalVisibleFlag'], ['Long', 'externalVersionId'], ['String', 'externalAttachmentFileIds']]) {
    ensure(new RegExp(`@JsonProperty\\(access = JsonProperty.Access.READ_ONLY\\)\\s+private ${type} ${field};`).test(document), `知识库通用实体不得接收外部发布字段：${field}`);
  }
  const service = source(oa + 'java/com/cloudflow/oa/service/impl/KnowledgeExternalService.java');
  for (const guard of ['requireVersion(document, request.getVersionId())', 'KnowledgeAttachmentRules.validate(request.getAttachmentFileIds())', 'attachments.selected(', 'write(document, null, false, null)']) {
    ensure(service.includes(guard), `知识库发布缺少版本、选择、撤回或差异审计校验：${guard}`);
  }
  ensure((service.match(/spel = "@knowledgeExternalService\.auditState\(#documentId\)", diff = true/g) || []).length === 2, '知识库发布与撤回均须审计实际发布状态及附件清单变化');
  const comparison = source(backend + 'cloudflow-common/cloudflow-common-audit/src/main/java/com/cloudflow/common/audit/handle/JaversCompareHandle.java');
  ensure(comparison.includes('handle.handle(audit, changes, oldVal, newVal, sourceClass)'), '知识库审计必须通过接口传递前后快照及来源模块');
  const workflow = source(oa + 'java/com/cloudflow/oa/service/impl/KnowledgeServiceImpl.java');
  for (const guard of ['req.setVariables(workflowVariables(document))', 'variables.put("documentTitle", document.getTitle())', 'variables.put("categoryName", document.getCategory())', 'variables.put("publishScope", switch (document.getScopeType())']) {
    ensure(workflow.includes(guard), `知识库审批须接收真实文档对应的固定表单字段：${guard}`);
  }
  const removal = workflow.slice(workflow.indexOf('public boolean removeDocument('), workflow.indexOf('public boolean read('));
  for (const guard of ['.eq(KnowledgeDocument::getVersion, document.getVersion())', '.ne(KnowledgeDocument::getStatus, "PENDING")',
    '.set(KnowledgeDocument::getDeleted, 1)', '.set(KnowledgeDocument::getExternalVisibleFlag, 0)',
    '.set(KnowledgeDocument::getExternalVersionId, null)', '.set(KnowledgeDocument::getExternalAttachmentFileIds, null)']) {
    ensure(removal.includes(guard), `知识库删除须实际清除公开状态并保护并发修订：${guard}`);
  }
  const mapper = source(oa + 'resources/mapper/PortalKnowledgeMapper.xml');
  for (const guard of ['published_version.id = document.external_version_id', 'published_version.document_id = document.document_id', 'document.external_visible_flag = 1', 'document.deleted = 0', 'published_version.deleted = 0', 'portal_user.session_version = #{identity.sessionVersion}', 'contact.version = #{identity.contactVersion}']) {
    ensure(mapper.includes(guard), `知识库门户查询缺少冻结版本或身份约束：${guard}`);
  }
  const reads = source(oa + 'java/com/cloudflow/oa/service/impl/PortalKnowledgeService.java');
  ensure(reads.includes('filter(file -> selected.contains(file.getFileId()))'), '知识库门户必须按保存的清单过滤附件');
  const files = source(auth + 'portal/PortalKnowledgeFileService.java');
  ensure((files.match(/authorize\(token,/g) || []).length === 2 && files.includes('ticket.publicationVersion(), allowed.publicationVersion()'), '知识库文件申请和下载均须复核权限及发布批次');
  ensure(files.includes('storage.getForFile(file).open(file.getFilePath())') && files.includes('ContentDisposition.attachment()') && !/sendRedirect|resolveUrl/.test(files), '知识库附件必须受保护地返回文件内容，不能重定向原始地址');
  const tickets = source(auth + 'portal/PortalFileTickets.java');
  for (const guard of ['LIFETIME_SECONDS = 60', 'PORTAL_KNOWLEDGE_DOWNLOAD', 'digest(token), ticket.sessionDigest()', 'redis.execute(CONSUME', 'setIfAbsent(key(raw)']) {
    ensure(tickets.includes(guard), `知识库下载凭据缺少受众、会话、期限或一次性保护：${guard}`);
  }
  const controller = source(auth + 'controller/PortalFileController.java');
  ensure((controller.match(/@SaCheckPermission\(value = "system:portal:file:access", type = "portal"\)/g) || []).length === 2, '知识库两个下载端点必须处于门户权限域');
  const publication = source('cloudflow-frontend/src/components/knowledge/KnowledgeExternalDialog.tsx');
  ensure(publication.includes('attachmentFileIds: selectedFiles') && publication.includes('!acknowledged') && publication.includes('公开附件 ${file.fileName}'), '知识库页面必须明确勾选并确认附件');
  const router = source('cloudflow-frontend/src/router.tsx');
  const mobile = router.slice(router.indexOf('const mobileRoutes = ['), router.indexOf('export const router'));
  ensure(/\{\s*path:\s*['"]\/office\/knowledge['"],\s*element:\s*guarded\(<DynamicMenuRoute\s*\/>,\s*\[['"]oa:knowledge:list['"]\]\),?\s*\}/.test(mobile), '知识库手机入口须保留明确的知识库权限守卫');
  return '3项只读发布控制、冻结版本、所选文件过滤、门户域、60秒同会话一次性下载及二次权限检查';
}

export function checkEmailArchiveMobileRoutes(repository) {
  const router = maskCodeComments(repository.load('cloudflow-frontend/src/router.tsx'));
  const mobile = router.slice(router.indexOf('const mobileRoutes = ['), router.indexOf('export const router'));
  ensure(/\{\s*path:\s*['"]\/crm\/emails['"],\s*element:\s*guarded\(<DynamicMenuRoute\s*\/>,\s*\[['"]crm:email:list['"]\]\),?\s*\}/.test(mobile), '移动邮件入口缺少明确权限守卫：/crm/emails crm:email:list');
  return '移动邮件归档入口按crm:email:list守卫';
}

export function checkOpportunityMobileRoutes(repository) {
  const router = maskCodeComments(repository.load('cloudflow-frontend/src/router.tsx'));
  const mobile = router.slice(router.indexOf('const mobileRoutes = ['), router.indexOf('export const router'));
  for (const [route, permission] of [
    ['/crm/sales-stages', 'crm:sales-stage:list'], ['/crm/stage-analysis', 'crm:opportunity:stage-analysis'],
    ['/office/crm/opportunities', 'crm:opportunity:list'],
    ['/crm/deal-teams', 'crm:deal-team:query'],
    ['/office/crm/receivables', 'crm:receivable:list'],
    ['/office/contracts', 'oa:contract:list'],
    ['/office/invoice', 'oa:invoice:list'],
  ]) {
    const declaration = new RegExp(`\\{\\s*path:\\s*['"]${route}['"],\\s*element:\\s*guarded\\(<DynamicMenuRoute\\s*\\/>,\\s*\\[['"]${permission}['"]\\]\\),?\\s*\\}`);
    ensure(declaration.test(mobile), `移动商机入口缺少明确权限守卫：${route} ${permission}`);
  }
  ensure(/\{\s*path:\s*['"]\/office\/crm\/customer\/:customerId['"],\s*element:\s*guarded\(<CrmCustomerWorkspacePage\s*\/>,\s*\[['"]crm:customer:list['"]\]\),?\s*\}/.test(mobile), '移动客户工作台缺少明确客户权限守卫');
  return '8个移动商机、团队、应收、合同、发票及客户工作台入口按对应菜单权限守卫';
}

export function checkOpportunityDefaults(repository, memory) {
  const section = file => {
    const scan = repository.scans.get(file);
    const starts = scan.comments.filter(entry => entry.value.trim() === '-- crm-opportunity-stage-defaults:start');
    const ends = scan.comments.filter(entry => entry.value.trim() === '-- crm-opportunity-stage-defaults:end');
    same(starts.length, 1, `${file} 商机默认规则开始标记`);
    same(ends.length, 1, `${file} 商机默认规则结束标记`);
    ensure(starts[0].start < ends[0].start, `${file} 商机默认规则标记顺序`);
    return scan.statements.filter(entry => entry[0].start > starts[0].start && entry[0].start < ends[0].start);
  };
  const formal = section('06.cloudflow-business-seed.sql');
  const demo = section('07.cloudflow-demo-seed.sql');
  same(formal.map(canonical), demo.map(canonical), '06/07 商机阶段与提醒模板完全同义');
  same(formal.map(entry => `${word(entry[0])}:${targetTable(entry)}`), ['INSERT:crm_sales_stage', 'INSERT:sys_message_template'], '商机默认段仅初始化阶段及提醒模板');
  const verify = current => {
    const tenants = current.rows('sys_tenant').filter(row => numeric(row.tenant_id) > 0 && text(row.deleted) === '0' && text(row.status) === '0');
    for (const tenant of tenants) {
      const stages = current.rows('crm_sales_stage').filter(row => text(row.tenant_id) === text(tenant.tenant_id));
      sameSet(stages.map(row => `${row.stage_code}:${text(row.sort_no)}:${text(row.default_win_rate)}:${text(row.is_won_flag)}:${text(row.is_lost_flag)}`),
        ['LEAD:10:0.1:0:0', 'QUALIFIED:20:0.3:0:0', 'PROPOSAL:30:0.5:0:0', 'NEGOTIATION:40:0.7:0:0', 'WON:50:1:1:0', 'LOST:60:0:0:1'], `租户${text(tenant.tenant_id)}六阶段默认值`);
      ensure(stages.every(row => row.required_fields === '[]' && row.overdue_days === null && text(row.required_activity_flag) === '0'
        && text(row.allow_skip_flag) === '0' && row.status === 'ACTIVE' && text(row.deleted) === '0'), '阶段默认要求、超期设置或启用状态被篡改');
      const templates = current.rows('sys_message_template').filter(row => text(row.tenant_id) === text(tenant.tenant_id) && row.template_code === 'CRM_OPPORTUNITY_STAGE_NOTICE');
      same(templates.length, 1, '每租户唯一商机站内提醒模板');
      ensure(templates.every(row => row.channel_type === 'INTERNAL' && text(row.force_send_flag) === '0' && text(row.dedupe_window_sec) === '0'), '商机提醒模板渠道或发送策略被篡改');
    }
    return tenants.length;
  };
  const repeated = memory.clone();
  for (const entry of demo) repeated.execute(entry);
  const tenantCount = verify(repeated);
  const snapshot = stable(repeated.rows('crm_sales_stage'));
  for (const entry of demo) repeated.execute(entry);
  same(stable(repeated.rows('crm_sales_stage')), snapshot, '默认阶段重跑不得覆盖或重复已有配置');
  return `${tenantCount}个有效租户各6阶段、默认超期关闭；06/07相同，重跑不改已有配置`;
}

const expectedConfigs = {
  'sys.oa.consumable.approvalMode': 'ALWAYS',
  'sys.oa.consumable.limitMetric': 'AMOUNT',
  'sys.oa.consumable.approverUserId': '',
  'sys.oa.consumable.stockManagerUserId': '',
  'sys.oa.consumable.recalculateMode': 'CHECK',
  'sys.hr.overtime.processKey': 'overtime_request',
  'sys.hr.shiftRequest.processKey': 'hr_shift_request',
  'sys.hr.overtime.approvalUsers': '',
  'sys.hr.shiftRequest.approvalUsers': '',
  'sys.hr.shift.minimumRestMinutes': '',
};
const dictionaryValues = {
  oa_consumable_category: ['OFFICE', 'PRINT', 'IT'],
  hr_overtime_type: ['WORKDAY', 'REST_DAY', 'HOLIDAY'],
  hr_overtime_compensation_type: ['PAY', 'COMPENSATORY'],
  hr_overtime_status: ['DRAFT', 'SUBMITTED', 'PENDING', 'APPROVING', 'APPROVED', 'REJECTED', 'CANCELLED'],
  hr_overtime_settlement_status: ['NOT_READY', 'PENDING', 'SETTLED', 'FAILED', 'NEEDS_RESOLUTION', 'CORRECTION_PENDING', 'REJECTED'],
  hr_shift_request_mode: ['SINGLE', 'SWAP'],
  hr_shift_request_status: ['DRAFT', 'WAITING_ACCEPTANCE', 'PENDING', 'APPROVING', 'APPROVED', 'REJECTED', 'CANCELLED'],
  hr_shift_peer_acceptance_status: ['NONE', 'PENDING', 'ACCEPTED', 'DECLINED'],
  hr_shift_application_status: ['NOT_READY', 'PENDING', 'APPLIED', 'FAILED'],
};

function oneRow(rows, label) { same(rows.length, 1, label); return rows[0]; }
const activeTenants = memory => memory.rows('sys_tenant').filter(row => numeric(row.tenant_id) > 0 && text(row.deleted) === '0' && text(row.status) === '0');

export function checkPolicies(memory, { requireLeaveType = true } = {}) {
  for (const tenant of activeTenants(memory)) {
    const tenantId = text(tenant.tenant_id);
    const tenantRows = table => memory.rows(table).filter(row => text(row.tenant_id) === tenantId);
    for (const [key, expected] of Object.entries(expectedConfigs)) {
      const config = oneRow(tenantRows('sys_config').filter(row => row.config_key === key), `${tenantId}/${key} 数量`);
      same(text(config.config_value), expected, `${location(config.$origin)} ${tenantId}/${key}`);
    }
    const component = oneRow(tenantRows('hr_comp_component').filter(row => row.component_code === 'OVERTIME'), `${tenantId}/OVERTIME 薪资项`);
    same([component.component_type, component.category, text(component.taxable), text(component.status), text(component.sort_order), text(component.version)], ['VARIABLE', 'OTHER', '1', '0', '40', '0'], '加班薪资项必须停用');
    const types = tenantRows('hr_overtime_type').filter(row => text(row.deleted) === '0');
    same(types.length, 3, `${tenantId} 加班类型数量`);
    sameSet(types.map(row => row.type_code), ['WORKDAY', 'REST_DAY', 'HOLIDAY'], `${tenantId} 加班日类型`);
    for (const type of types) {
      same(type.applicable_day_type, type.type_code, '类型编码与日类型');
      same([text(type.status), text(type.need_approval_flag), text(type.compensatory_flag)], ['0', '1', '0'], `${tenantId}/${type.type_code} 停用/审批/调休开关`);
      same(text(type.rate_multiplier), ({ WORKDAY: '1.5', REST_DAY: '2', HOLIDAY: '3' })[type.type_code], `${type.type_code} 仅作停用草案的倍率`);
      for (const field of ['compensatory_ratio', 'compensatory_leave_type_id', 'max_hours_per_day', 'max_hours_per_month']) same(type[field], null, `${type.type_code}.${field} 未核定值`);
      same(text(type.salary_component_id), text(component.id), '类型指向同租户真实 OVERTIME 项');
      ensure(/待.*核定/.test(type.remark ?? ''), `${type.type_code} 缺少待核定说明`);
    }
    if (requireLeaveType) {
      const leaveType = oneRow(tenantRows('hr_leave_type').filter(row => row.leave_code === 'COMP_TIME'), `${tenantId}/COMP_TIME`);
      same([text(leaveType.need_quota), leaveType.unit, text(leaveType.compensatory_flag), leaveType.quota_rule], ['1', 'HOUR', '1', null], '调休沿用真实 HOUR 假种并移除未经实现的期限');
    }
    for (const [code, effect, enabled, threshold] of [['hr.overtime.hours.limit', 'BLOCK', '0', null], ['oa.consumable.request.limit', 'WARN', '1', '0']]) {
      const rule = oneRow(tenantRows('sys_business_rule').filter(row => row.rule_code === code), `${tenantId}/${code}`);
      same([rule.effect, text(rule.enabled), text(rule.threshold_value), text(rule.priority)], [effect, enabled, threshold, '100'], `${code} 默认政策`);
      const version = oneRow(tenantRows('sys_business_rule_version').filter(row => text(row.rule_id) === text(rule.id) && text(row.version_no) === '1'), `${code} 初始版本`);
      same([version.status, text(version.enabled), text(version.threshold_value), version.effect], [enabled === '0' ? 'DRAFT' : 'PUBLISHED', enabled, threshold, effect], `${code} 版本政策`);
      const snapshot = JSON.parse(version.snapshot_json);
      same([snapshot.ruleCode, text(snapshot.enabled), text(snapshot.thresholdValue), snapshot.effect], [code, enabled, threshold, effect], `${code} 版本实际 JSON`);
    }
  }
  return `${activeTenants(memory).length} 个有效租户；审批人及休息分钟为空，类型/薪资项/HR 上限规则停用`;
}

export function checkSeedRegistrations(memory) {
  for (const tenant of activeTenants(memory)) {
    const tenantId = text(tenant.tenant_id);
    for (const [type, values] of Object.entries(dictionaryValues)) {
      const rows = memory.rows('sys_dict_data').filter(row => text(row.tenant_id) === tenantId && row.dict_type === type);
      same(rows.length, values.length, `${tenantId}/${type} 字典行数`);
      sameSet(rows.map(row => row.dict_value), values, `${tenantId}/${type} 字典取值`);
    }
    for (const processKey of ['overtime_request', 'hr_shift_request', 'oa_consumable_request']) {
      const definition = oneRow(memory.rows('wf_process_definition').filter(row => text(row.tenant_id) === tenantId && row.process_key === processKey && text(row.deleted) === '0'), `${tenantId}/${processKey} 定义`);
      const isOa = processKey === 'oa_consumable_request';
      same(definition.status, isOa ? 'PUBLISHED' : 'DRAFT', `${processKey} 未核定审批人的发布边界`);
      same(definition.form_id, null, `${processKey} 不挂旧手填小时表单`);
      const model = JSON.parse(definition.model_json);
      const expectedIds = isOa ? ['root', 'approval', 'end'] : ['root', 'responsible', 'hr', 'end'];
      sameSet(model.nodes.map(node => node.id), expectedIds, `${processKey} 真实审批节点`);
      sameSet(model.edges.map(edge => `${edge.source}->${edge.target}`), expectedIds.slice(1).map((id, index) => `${expectedIds[index]}->${id}`), `${processKey} 审批连线`);
      const approvals = model.nodes.filter(node => node.type === 'APPROVAL');
      same(approvals.length, isOa ? 1 : 2, `${processKey} 审批节点数`);
      for (const node of approvals) {
        same(node.approverType, 'VARIABLE_USER', `${processKey}/${node.id} 审批人来源`);
        same(node.approverValue, isOa ? 'approverIds' : node.id === 'responsible' ? 'responsibleApproverIds' : 'hrApproverIds', `${processKey}/${node.id} 审批人变量`);
        same([node.allowDelegate, node.allowAddSign, node.allowReduceSign], [false, false, false], `${processKey}/${node.id} 转办与加减签`);
        ensure(node.approveSelf !== 'APPROVE', `${processKey} 自审配置自动通过`);
      }
    }
  }
  for (const [jobId, handler, service, status] of [[1800, 'workflowDraftCleanup', 'workflow', 'ENABLED'], [1810, 'oaConsumableStockWarning', 'oa', 'PAUSED'], [1811, 'oaConsumableStockRecalculate', 'oa', 'PAUSED']]) {
    const job = oneRow(memory.rows('sys_job').filter(row => numeric(row.job_id) === jobId), `任务 ${jobId}`);
    same([job.handler_name, job.service_name, job.status], [handler, service, status], `任务 ${jobId} 接线及默认状态`);
    const registered = oneRow(memory.rows('sys_job_handler').filter(row => numeric(row.handler_id) === jobId), `处理器 ${jobId}`);
    same([registered.handler_name, registered.service_name], [handler, service], `处理器 ${jobId} 接线`);
  }
  same(memory.rows('wf_form_draft').length, 0, '正式种子不预置私人流程草稿');
  for (const table of ['hr_overtime_request', 'hr_shift_request', 'oa_consumable_request']) for (const row of memory.rows(table)) {
    same(row.status, 'DRAFT', `${table} 正式初始状态`);
    same(row.instance_id, null, `${table} 不预造审批实例`);
    if (table === 'hr_overtime_request') same([row.settlement_status, text(row.settled_flag), row.comp_change_id, row.leave_ledger_id], ['NOT_READY', '0', null, null], '初始加班不能带结算结果');
    if (table === 'hr_shift_request') same([row.application_status, row.applied_time, row.peer_acceptance_status], ['NOT_READY', null, 'NONE'], '初始调班不能带同意/应用结果');
  }
  return '字典实际值、审批图与停用边界、三个任务注册、私人草稿及业务初始状态';
}

function cents(value, label) {
  ensure(value !== null && value !== undefined, `${label} 金额缺失`);
  const scaled = Decimal.from(value).multiply(100);
  ensure(scaled.denominator === 1n, `${label} 超过两位小数：${value}`);
  return scaled.numerator;
}

export function checkLedger(memory) {
  const ledger = memory.rows('oa_consumable_ledger');
  same(ledger.length, 10, '正式演示台账：8 笔明确期初 + 2 笔真实采购收货');
  const totals = new Map();
  for (const row of [...ledger].sort((left, right) => numeric(left.ledger_id) - numeric(right.ledger_id))) {
    const key = `${text(row.tenant_id)}:${text(row.consumable_id)}`;
    const prior = totals.get(key) ?? { quantity: Decimal.from(0), amount: 0n, price: null };
    ensure(Decimal.from(row.quantity).denominator === 1n && numeric(row.quantity) !== 0, `${key} 台账数量必须为非零整数`);
    const quantity = prior.quantity.add(row.quantity);
    const amount = prior.amount + cents(row.amount, key);
    ensure(numeric(quantity) >= 0 && amount >= 0n, `${key} 台账前缀为负`);
    same(text(row.balance_after), text(quantity), `${key}/${text(row.ledger_id)} 数量结存链`);
    same(cents(row.balance_amount_after, key).toString(), amount.toString(), `${key}/${text(row.ledger_id)} 金额结存链`);
    const average = numeric(quantity) === 0 ? Decimal.from(0) : new Decimal(amount, 100n).divide(quantity).round(2);
    same(text(row.avg_cost_after), text(average), `${key}/${text(row.ledger_id)} 移动平均成本`);
    const history = oneRow(memory.rows('oa_asset_log').filter(entry => text(entry.log_id) === text(row.asset_log_id) && text(entry.tenant_id) === text(row.tenant_id)), `${key} 通用日志对应`);
    same([text(history.ref_id), history.ref_type, text(history.quantity_change), text(history.operator_id)], [text(row.consumable_id), '2', text(row.quantity), text(row.operator_id)], `${key} 台账/通用日志一致`);
    same(row.transaction_type, 'INBOUND', `${key} 静态示例只能记录明确期初或完整采购收货`);
    if (row.source_biz_type === 'MANUAL') {
      ensure(numeric(row.consumable_id) >= 9001 && numeric(row.consumable_id) <= 9008, `${key} 未声明期初耗材`);
      same(row.source_event_key, `SEED:OA08:${text(row.consumable_id)}:OPENING`, `${key} 期初来源键`);
      same(cents(row.amount, key).toString(), cents(Decimal.from(row.quantity).multiply(row.unit_price), key).toString(), `${key} 期初数量乘单价`);
    } else {
      same(row.source_biz_type, 'PURCHASE_RECEIPT', `${key} 静态台账业务来源`);
      const receipt = oneRow(memory.rows('biz_purchase_receipt').filter(entry => text(entry.id) === text(row.source_biz_id) && text(entry.tenant_id) === text(row.tenant_id)), `${key} 真实采购收货记录`);
      const item = oneRow(memory.rows('biz_purchase_item').filter(entry => text(entry.id) === text(receipt.item_id) && text(entry.tenant_id) === text(row.tenant_id)), `${key} 真实采购明细`);
      same([text(row.source_item_id), text(row.consumable_id), text(row.quantity), row.source_event_key], [text(item.id), text(receipt.consumable_id), text(receipt.received_quantity), `PURCHASE_RECEIPT:${text(receipt.id)}`], `${key} 采购来源映射`);
      same(text(item.received_quantity), text(item.quantity), `${key} 本轮采购示例全部收货`);
      const allocated = Decimal.from(item.amount).multiply(receipt.received_quantity).divide(item.quantity).round(2);
      same(text(row.amount), text(allocated), `${key} 收货金额应从明细金额分摊`);
      same(text(row.unit_price), text(allocated.divide(receipt.received_quantity).round(2)), `${key} 实际收货计价单价`);
      same(text(receipt.purchase_id), text(item.purchase_id), `${key} 收货与明细采购主单关联`);
      const request = oneRow(memory.rows('biz_purchase_request').filter(entry => text(entry.id) === text(item.purchase_id) && text(entry.tenant_id) === text(row.tenant_id)), `${key} 采购主单`);
      same(request.status, 'RECEIVED', `${location(request.$origin)} 采购 ${text(request.id)} 全部收货状态`);
      prior.price = row.unit_price;
    }
    totals.set(key, { quantity, amount, price: prior.price });
  }
  for (const material of memory.rows('oa_consumable')) {
    const key = `${text(material.tenant_id)}:${text(material.consumable_id)}`;
    const total = totals.get(key) ?? { quantity: Decimal.from(0), amount: 0n, price: null };
    same(text(material.quantity), text(total.quantity), `${key} 库存缓存数量`);
    same(cents(material.stock_amount, key).toString(), total.amount.toString(), `${key} 库存缓存金额`);
    const average = numeric(total.quantity) ? new Decimal(total.amount, 100n).divide(total.quantity).round(2) : Decimal.from(0);
    same(text(material.avg_cost), text(average), `${key} 库存缓存均价`);
    same(text(material.last_purchase_price), text(total.price), `${key} 最近真实采购价格`);
  }
  same(memory.rows('oa_asset_log').filter(row => row.ref_type === '2').length, ledger.length, '耗材通用日志与台账逐笔对应，无重复计入来源');
  return '10 笔来源逐笔对齐；数量、金额、均价、缓存及采购 RECEIVED 状态一致';
}

export function checkReplay(repository, memory) {
  const entries = foundation(repository.scans.get('06.cloudflow-business-seed.sql')).statements;
  const replay = snapshot => { for (const entry of entries) snapshot.execute(entry); };
  const repeated = memory.clone();
  replay(repeated);
  for (const table of ['oa_consumable_ledger', 'oa_asset_log', 'oa_consumable']) same(repeated.rows(table), memory.rows(table), `${table} 同载荷重复执行`);
  const scenarios = [];
  for (const receiptId of [90031, 90032]) {
    const receipt = memory.rows('biz_purchase_receipt').find(row => numeric(row.id) === receiptId);
    ensure(receipt, `缺少采购收货 ${receiptId}`);
    scenarios.push({ name: `收货 ${receiptId} 原来源更改数量`, mutate: state => { const row = state.rows('biz_purchase_receipt').find(entry => numeric(entry.id) === receiptId); row.received_quantity = Decimal.from(row.received_quantity).add(1); } });
    scenarios.push({ name: `收货 ${receiptId} 原来源更改金额`, mutate: state => { const row = state.rows('biz_purchase_item').find(entry => text(entry.id) === text(receipt.item_id)); row.amount = Decimal.from(row.amount).add('0.01'); } });
    for (const field of ['quantity', 'amount', 'balance_after', 'balance_amount_after', 'avg_cost_after', 'unit_price']) scenarios.push({ name: `收货 ${receiptId} 已有台账 ${field} 被改`, mutate: state => { const row = state.rows('oa_consumable_ledger').find(entry => numeric(entry.source_biz_id ?? 0) === receiptId); row[field] = Decimal.from(row[field]).add(field.includes('quantity') || field === 'balance_after' ? 1 : '0.01'); } });
  }
  scenarios.push({ name: '期初 9001 已有数量被改', mutate: state => { const row = state.rows('oa_consumable_ledger').find(entry => entry.source_event_key === 'SEED:OA08:9001:OPENING'); row.quantity = Decimal.from(row.quantity).add(1); } });
  const notRejected = [];
  for (const scenario of scenarios) {
    const mutated = memory.clone();
    scenario.mutate(mutated);
    let rejected = false;
    try { replay(mutated); }
    catch (error) {
      if (error instanceof SqlError && /CHECK .+ rejected row/.test(error.message)) rejected = true;
      else throw error;
    }
    if (!rejected) notRejected.push(scenario.name);
  }
  ensure(!notRejected.length, `${location(entries.find(entry => targetTable(entry) === 'oa_consumable_ledger')?.[0])} 同来源换载荷未被实际 SQL CHECK 拒绝：${notRejected.join('；')}`);
  return `同载荷重跑结果不变；${scenarios.length} 项内存载荷篡改均被实际 CHECK 拒绝`;
}

export function projectRows(tokens, memory) {
  const schema = memory.schemas.get(targetTable(tokens));
  const parsed = parseInsert(tokens, schema);
  ensure(parsed.updates.length === 0 || ['sys_tenant', 'hr_comp_component'].includes(parsed.table), `${location(tokens[0])} 验收对象的 ON DUPLICATE 改写须单独审查，不能当纯生成行放行`);
  const inputs = parsed.rows ? parsed.rows.map(row => row.map(value => memory.evaluate(value))) : memory.select(parsed.query).map(row => Object.values(row));
  return inputs.map(values => {
    same(values.length, parsed.columns.length, `${location(tokens[0])} 实际 SELECT 列数`);
    const row = Object.fromEntries(parsed.columns.map((column, index) => [column, values[index]]));
    for (const column of schema.columns.values()) if (!(column.name in row)) row[column.name] = column.default ? memory.evaluate(column.default) : null;
    Object.defineProperty(row, '$origin', { value: tokens[0], enumerable: false });
    return row;
  });
}

const demoTables = new Set(['sys_tenant', 'hr_comp_component', 'sys_config', 'sys_business_rule', 'wf_process_definition', 'wf_form_draft', 'hr_overtime_type', 'hr_overtime_request', 'hr_shift_request', 'oa_consumable_request', 'oa_consumable_request_item', 'oa_consumable_ledger', 'hr_attendance_checkin', 'hr_attendance_record', 'hr_attendance_monthly', 'hr_leave_ledger', 'hr_comp_change', 'hr_schedule_assignment', 'hr_time_request', 'wf_process_instance', 'oa_consumable', 'oa_asset_log', 'biz_purchase_receipt']);
for (const table of ['crm_opportunity', 'crm_opportunity_item', 'crm_opportunity_stage_history', 'crm_deal_team', 'crm_deal_event', 'crm_deal_allocation', 'crm_email_record', 'oa_knowledge_document', 'sys_data_source_config', 'sys_data_source_registration']) demoTables.add(table);
for (const table of [...oauthTables, ...reportTables, ...tenantPackageTables, ...imTables, 'sys_tenant']) demoTables.add(table);
const privateTables = [...oauthTables, ...reportTables, ...tenantPackageTables, ...imTables, 'wf_form_draft', 'hr_overtime_request', 'hr_shift_request', 'oa_consumable_request', 'oa_consumable_request_item', 'crm_opportunity_item', 'crm_opportunity_stage_history', 'crm_deal_team', 'crm_deal_event', 'crm_deal_allocation', 'crm_email_record', 'sys_data_source_config', 'sys_data_source_registration'];

export function projectDemo(repository, formalMemory) {
  const scan = repository.scans.get('07.cloudflow-demo-seed.sql');
  const section = foundation(scan);
  const memory = formalMemory.clone();
  const rows = new Map([...demoTables].map(table => [table, []]));
  const protectedWrites = [];
  const parsedEntries = [];
  for (const entry of scan.statements) {
    const target = targetTable(entry);
    const operation = word(entry[0]);
    if (target === 'demo_seed_tenants' || target === 'demo_seed_rows') { memory.execute(entry); continue; }
    if (!demoTables.has(target)) continue;
    const inside = entry[0].start > section.start.start && entry[0].start < section.end.start;
    if (inside) continue;
    if (operation === 'DELETE') {
      if ([...privateTables, 'oa_consumable_ledger', 'hr_overtime_type'].includes(target)) protectedWrites.push(`${location(entry[0])} DELETE ${target}`);
      continue;
    }
    ensure(['INSERT', 'REPLACE'].includes(operation), `${location(entry[0])} 未建模的 ${operation} ${target}，拒绝跳过受检内容`);
    const projected = projectRows(entry, memory);
    rows.get(target).push(...projected);
    parsedEntries.push({ target, tokens: entry, count: projected.length });
    if ([...privateTables, 'oa_consumable_ledger', 'hr_overtime_type'].includes(target) && projected.length) protectedWrites.push(`${location(entry[0])} ${operation} ${target} 生成 ${projected.length} 行`);
    if (target === 'sys_tenant' || target === 'hr_comp_component') memory.execute(entry);
  }
  for (const entry of section.statements) if (['sys_config', 'hr_comp_component', 'hr_overtime_type', 'sys_business_rule', 'sys_business_rule_version'].includes(targetTable(entry))) memory.execute(entry);
  return { memory, rows, protectedWrites, parsedEntries, section, scan };
}

function assertRows(rows, predicate, label, fields) {
  const failures = rows.filter(row => !predicate(row));
  const samples = failures.slice(0, 3).map(row => `${location(row.$origin)} ${stable(Object.fromEntries(['tenant_id', ...fields].map(field => [field, text(row[field])])) )}`);
  ensure(failures.length === 0, `${label}：${failures.length} 行异常；${samples.join('；')}`);
  return `${rows.length} 行已逐行核验`;
}

export function checkDemoReferences(demo) {
  const types = new Set(demo.memory.rows('hr_overtime_type').map(row => `${text(row.tenant_id)}:${text(row.type_id)}`));
  return assertRows(demo.rows.get('hr_attendance_checkin'), row => row.overtime_type_id === null || types.has(`${text(row.tenant_id)}:${text(row.overtime_type_id)}`), '07 打卡加班类型必须引用同租户真实类型，不能引用被跳过的通用生成编号', ['checkin_id', 'overtime_type_id']);
}

export function checkDemoOvertime(demo) {
  const daily = assertRows(demo.rows.get('hr_attendance_record'), row => text(row.overtime_minutes) === '0', '07 无真实 H 核定来源时不能生成加班分钟', ['id', 'overtime_minutes']);
  const monthly = assertRows(demo.rows.get('hr_attendance_monthly'), row => text(row.overtime_hours) === '0', '07 无真实 H 核定来源时不能生成月加班小时', ['id', 'overtime_hours']);
  return `日考勤 ${daily}；月考勤 ${monthly}`;
}

export function checkDemoLeave(demo) {
  return assertRows(demo.rows.get('hr_leave_ledger'), row => row.transaction_type !== 'COMPENSATORY' && row.source_biz_type !== 'HR_OVERTIME' && !String(row.source_event_key ?? '').startsWith('HR_OVERTIME:'), '07 自动调休入账缺少真实 H 审批及结算来源；明确的普通初始授额可保留', ['ledger_id', 'transaction_type', 'source_biz_type', 'source_event_key']);
}

export function checkDemoBusinessFacts(demo) {
  same(demo.protectedWrites.length, 0, `07 不得写入/清除 H 私人草稿、申请、台账或通用生成加班类型：${demo.protectedWrites.join('；')}`);
  const facts = [
    ['sys_tenant', ['package_id', 'package_version', 'package_override', 'effective_menu_ids']],
    ['hr_attendance_checkin', ['overtime_request_id']],
    ['hr_schedule_assignment', ['source_shift_request_id']],
    ['hr_comp_change', ['source_biz_type', 'source_biz_id', 'salary_component_id', 'payroll_period_id']],
    ['oa_knowledge_document', ['external_version_id', 'external_attachment_file_ids']],
  ];
  for (const [table, fields] of facts) assertRows(demo.rows.get(table), row => fields.every(field => row[field] === null), `07 ${table} 不能伪造 H 审批结果引用`, fields);
  assertRows(demo.rows.get('hr_comp_change'), row => row.change_type !== 'OVERTIME', '07 不能伪造已结算加班费变动', ['id', 'change_type']);
  assertRows(demo.rows.get('hr_time_request'), row => row.request_type !== 'OVERTIME', '07 方案 A 不得重开旧 OVERTIME 申请旁路', ['id', 'request_type']);
  const hDefinitions = new Set(demo.memory.rows('wf_process_definition').filter(row => ['overtime_request', 'hr_shift_request', 'oa_consumable_request'].includes(row.process_key)).map(row => text(row.definition_id)));
  assertRows(demo.rows.get('wf_process_instance'), row => !hDefinitions.has(text(row.definition_id)) && !/^batch-h-(?:hr09|oa08)-/.test(String(row.definition_id)) && !['overtime_request', 'hr_shift_request', 'oa_consumable_request'].includes(row.process_def_key) && !/^(?:HR_OVERTIME|HR_SHIFT_REQUEST|OA_CONSUMABLE_REQUEST):/.test(String(row.business_key)), '07 不能预造 H 审批实例', ['instance_id', 'definition_id', 'process_def_key', 'business_key']);
  assertRows(demo.rows.get('wf_process_definition'), row => !['overtime_request', 'hr_shift_request', 'oa_consumable_request'].includes(row.process_key), '07 通用生成段不能覆盖正式 H 定义', ['definition_id', 'process_key', 'status']);
  assertRows(demo.rows.get('sys_config'), row => !Object.hasOwn(expectedConfigs, row.config_key), '07 通用生成段不能抢占 H 正式政策配置', ['config_key', 'config_value']);
  assertRows(demo.rows.get('sys_business_rule'), row => !['hr.overtime.hours.limit', 'oa.consumable.request.limit'].includes(row.rule_code), '07 通用生成段不能抢占 H 正式业务规则', ['rule_code', 'enabled']);
  assertRows(demo.rows.get('crm_opportunity'), row => Decimal.from(row.weighted_amount).compare(Decimal.from(row.expected_amount).multiply(row.win_rate).divide(100).round(2)) === 0,
    '07 商机加权金额须使用0—100百分数口径', ['opportunity_id', 'expected_amount', 'win_rate', 'weighted_amount']);
  assertRows(demo.rows.get('oa_knowledge_document'), row => text(row.external_visible_flag) === '0', '07 知识文档默认仅内部可见，不得生成门户公开事实', ['document_id', 'external_visible_flag']);
  return '实际生成行均无 H 草稿、申请、审批实例、工资或排班结果；旧加班旁路为空；知识正文与附件默认不公开';
}

export function checkDemoInventory(demo) {
  assertRows(demo.rows.get('oa_consumable'), row => ['quantity', 'stock_amount', 'avg_cost'].every(field => text(row[field]) === '0'), '07 通用耗材应从零库存/零成本开始', ['consumable_id', 'quantity', 'stock_amount', 'avg_cost']);
  assertRows(demo.rows.get('oa_asset_log'), row => row.ref_type !== '2', '07 通用日志不能伪造耗材出入库事实', ['log_id', 'ref_type']);
  same(demo.rows.get('biz_purchase_receipt').length, 0, '07 通用生成不能伪造未记台账的耗材采购收货');
  return '通用库存及成本为零；采购收货与耗材台账仅允许 foundations 中已核验的完整来源';
}

export function checkDemoGuard(repository, formalMemory) {
  const scan = repository.scans.get('07.cloudflow-demo-seed.sql');
  const guard = scan.statements.filter(entry => targetTable(entry) === 'h_demo_seed_guard');
  same(guard.map(entry => word(entry[0])), ['CREATE', 'INSERT', 'DROP'], '07 业务数据保护检查的真实语句');
  const baseline = formalMemory.clone();
  for (const entry of guard) baseline.execute(entry);
  for (const table of ['wf_form_draft', 'wf_agent_setting', 'hr_overtime_request', 'hr_shift_request', 'oa_consumable_request', 'oa_consumable_ledger']) {
    const altered = formalMemory.clone();
    altered.rows(table).push({ tenant_id: Decimal.from(100000), source_biz_type: 'CONSUMABLE_REQUEST', source_event_key: 'FAKE:H:APPROVAL', consumable_id: Decimal.from(9001), source_biz_id: Decimal.from(777) });
    let rejected = false;
    try { for (const entry of guard) altered.execute(entry); }
    catch (error) { if (error instanceof SqlError && /CHECK .+ rejected row/.test(error.message)) rejected = true; else throw error; }
    ensure(rejected, `07 保护检查未拒绝已有 ${table} 业务事实`);
  }
  const portalGuard = scan.statements.filter(entry => targetTable(entry) === 'portal_demo_seed_guard');
  same(portalGuard.map(entry => word(entry[0])), ['CREATE', 'INSERT', 'DROP'], '07 门户业务事实保护检查的真实语句');
  const portalBaseline = formalMemory.clone();
  for (const entry of portalGuard) portalBaseline.execute(entry);
  for (const tenant of [1, 50, 100000, 100049]) {
    for (const [table, fields] of [
      ['sys_portal_user', {}],
      ['oa_knowledge_document', { external_visible_flag: Decimal.from(1) }],
      ['oa_knowledge_document', { external_version_id: Decimal.from(1) }],
      ['oa_knowledge_document', { external_attachment_file_ids: '[1]' }],
    ]) {
      const altered = formalMemory.clone();
      altered.rows(table).push({ tenant_id: Decimal.from(tenant), external_visible_flag: Decimal.from(0), external_version_id: null, external_attachment_file_ids: null, ...fields });
      let rejected = false;
      try { for (const entry of portalGuard) altered.execute(entry); }
      catch (error) { if (error instanceof SqlError && /CHECK .+ rejected row/.test(error.message)) rejected = true; else throw error; }
      ensure(rejected, `07 门户保护检查未拒绝已有 ${table} 租户 ${tenant} 的业务事实：${Object.keys(fields).join(',')}`);
    }
  }
  const emailGuard = scan.statements.filter(entry => targetTable(entry) === 'crm_email_demo_seed_guard');
  same(emailGuard.map(entry => word(entry[0])), ['CREATE', 'INSERT', 'DROP'], '07 邮件业务事实保护检查的真实语句');
  const emailBaseline = formalMemory.clone();
  for (const entry of emailGuard) emailBaseline.execute(entry);
  for (const table of ['crm_mass_email_recipient', 'crm_email_tracking_link', 'crm_email_suppression', 'crm_email_record']) {
    for (const tenant of [1, 50, 100000, 100049]) {
      const altered = formalMemory.clone();
      altered.rows(table).push({ tenant_id: Decimal.from(tenant) });
      let rejected = false;
      try { for (const entry of emailGuard) altered.execute(entry); }
      catch (error) { if (error instanceof SqlError && /CHECK .+ rejected row/.test(error.message)) rejected = true; else throw error; }
      ensure(rejected, `07 邮件保护检查未拒绝已有 ${table} 租户 ${tenant} 的业务事实`);
    }
  }
  const opportunityGuard = scan.statements.filter(entry => targetTable(entry) === 'crm_opportunity_demo_seed_guard');
  same(opportunityGuard.map(entry => word(entry[0])), ['CREATE', 'INSERT', 'DROP'], '07 商机业务事实保护检查的真实语句');
  const opportunityBaseline = formalMemory.clone();
  for (const entry of opportunityGuard) opportunityBaseline.execute(entry);
  for (const table of ['crm_opportunity_item', 'crm_opportunity_stage_history']) for (const tenant of [1, 50, 100000, 100049]) {
    const altered = formalMemory.clone();
    altered.rows(table).push({ tenant_id: Decimal.from(tenant) });
    let rejected = false;
    try { for (const entry of opportunityGuard) altered.execute(entry); }
    catch (error) { if (error instanceof SqlError && /CHECK .+ rejected row/.test(error.message)) rejected = true; else throw error; }
    ensure(rejected, `07 商机保护检查未拒绝已有 ${table} 租户 ${tenant} 的业务事实`);
  }
  const dealGuard = scan.statements.filter(entry => targetTable(entry) === 'crm_deal_demo_seed_guard');
  same(dealGuard.map(entry => word(entry[0])), ['CREATE', 'INSERT', 'DROP'], '07 团队与财务事实保护检查的真实语句');
  const dealBaseline = formalMemory.clone();
  for (const entry of dealGuard) dealBaseline.execute(entry);
  for (const table of ['crm_deal_team', 'crm_deal_event', 'crm_deal_allocation']) for (const tenant of [1, 50, 100000, 100049]) {
    const altered = formalMemory.clone();
    altered.rows(table).push({ tenant_id: Decimal.from(tenant) });
    let rejected = false;
    try { for (const entry of dealGuard) altered.execute(entry); }
    catch (error) { if (error instanceof SqlError && /CHECK .+ rejected row/.test(error.message)) rejected = true; else throw error; }
    ensure(rejected, `07 财务保护检查未拒绝已有 ${table} 租户 ${tenant} 的业务事实`);
  }
  const advanceGuard = scan.statements.filter(entry => targetTable(entry) === 'hr_advance_demo_seed_guard');
  same(advanceGuard.map(entry => word(entry[0])), ['CREATE', 'INSERT', 'DROP'], '07 借款及还款事实保护的真实语句');
  const advanceBaseline = formalMemory.clone();
  for (const entry of advanceGuard) advanceBaseline.execute(entry);
  for (const table of ['hr_employee_advance', 'hr_advance_repayment']) for (const tenant of [1, 50, 100000, 100049]) {
    const altered = formalMemory.clone();
    altered.rows(table).push({ tenant_id: Decimal.from(tenant) });
    let rejected = false;
    try { for (const entry of advanceGuard) altered.execute(entry); }
    catch (error) { if (error instanceof SqlError && /CHECK .+ rejected row/.test(error.message)) rejected = true; else throw error; }
    ensure(rejected, `07 借款保护未拒绝已有 ${table} 租户 ${tenant} 的业务事实`);
  }
  const dataSourceGuard = scan.statements.filter(entry => targetTable(entry) === 'data_source_demo_seed_guard');
  same(dataSourceGuard.map(entry => word(entry[0])), ['CREATE', 'INSERT', 'DROP'], '07 数据源配置与实例事实保护的真实语句');
  const dataSourceBaseline = formalMemory.clone();
  for (const entry of dataSourceGuard) dataSourceBaseline.execute(entry);
  for (const table of ['sys_data_source_config', 'sys_data_source_registration']) for (const tenant of [1, 50, 100000, 100049, 999999]) {
    const altered = formalMemory.clone();
    altered.rows(table).push({ tenant_id: Decimal.from(tenant) });
    let rejected = false;
    try { for (const entry of dataSourceGuard) altered.execute(entry); }
    catch (error) { if (error instanceof SqlError && /CHECK .+ rejected row/.test(error.message)) rejected = true; else throw error; }
    ensure(rejected, `07 数据源保护未拒绝已有 ${table} 租户 ${tenant} 的配置或实例事实`);
  }
  const oauthGuard = scan.statements.filter(entry => targetTable(entry) === 'oauth2_demo_seed_guard');
  same(oauthGuard.map(entry => word(entry[0])), ['CREATE', 'INSERT', 'DROP'], '07 OAuth授权事实空表保护的真实语句');
  const oauthBaseline = formalMemory.clone();
  for (const entry of oauthGuard) oauthBaseline.execute(entry);
  for (const table of oauthTables) for (const tenant of [1, 50, 100000, 100049, 999999]) {
    const altered = formalMemory.clone();
    altered.rows(table).push({ tenant_id: Decimal.from(tenant) });
    let rejected = false;
    try { for (const entry of oauthGuard) altered.execute(entry); }
    catch (error) { if (error instanceof SqlError && /CHECK .+ rejected row/.test(error.message)) rejected = true; else throw error; }
    ensure(rejected, `07 OAuth保护未拒绝已有 ${table} 租户 ${tenant} 的授权事实`);
  }
  const reportGuard = scan.statements.filter(entry => targetTable(entry) === 'report_demo_seed_guard');
  same(reportGuard.map(entry => word(entry[0])), ['CREATE', 'INSERT', 'DROP'], '07 报表注册和私人定义空表保护的真实语句');
  const reportBaseline = formalMemory.clone();
  for (const entry of reportGuard) reportBaseline.execute(entry);
  for (const table of reportTables) for (const tenant of [1, 50, 100000, 100049, 999999]) {
    const altered = formalMemory.clone();
    altered.rows(table).push({ tenant_id: Decimal.from(tenant) });
    let rejected = false;
    try { for (const entry of reportGuard) altered.execute(entry); }
    catch (error) { if (error instanceof SqlError && /CHECK .+ rejected row/.test(error.message)) rejected = true; else throw error; }
    ensure(rejected, `07 报表保护未拒绝已有 ${table} 租户 ${tenant} 的注册或私人定义`);
  }
  const packageGuard = scan.statements.filter(entry => targetTable(entry) === 'tenant_package_demo_seed_guard');
  same(packageGuard.map(entry => word(entry[0])), ['CREATE', 'INSERT', 'DROP'], '07套餐保护顺序');
  const packageBaseline = formalMemory.clone();
  for (const entry of packageGuard) packageBaseline.execute(entry);
  for (const table of tenantPackageTables) for (const tenant of [100000, 100049, 1, 50, 999999]) {
    const altered = formalMemory.clone();
    altered.rows(table).push({ tenant_id: Decimal.from(tenant) });
    let rejected = false;
    try { for (const entry of packageGuard) altered.execute(entry); }
    catch (error) { if (error instanceof SqlError && /CHECK .+ rejected row/.test(error.message)) rejected = true; else throw error; }
    ensure(rejected, `07套餐保护未拒绝已有${table}记录`);
  }
  for (const field of ['package_id', 'package_version', 'package_override', 'effective_menu_ids']) {
    const altered = formalMemory.clone();
    altered.rows('sys_tenant')[0][field] = field.endsWith('_id') || field.endsWith('_version') ? Decimal.from(1) : '[]';
    let rejected = false;
    try { for (const entry of packageGuard) altered.execute(entry); }
    catch (error) { if (error instanceof SqlError && /CHECK .+ rejected row/.test(error.message)) rejected = true; else throw error; }
    ensure(rejected, `07套餐保护未拒绝已有租户${field}`);
  }
  const imGuard = scan.statements.filter(entry => targetTable(entry) === 'im_demo_seed_guard');
  same(imGuard.map(entry => word(entry[0])), ['CREATE', 'INSERT', 'DROP'], '07企业通信保护顺序');
  const imBaseline = formalMemory.clone();
  for (const entry of imGuard) imBaseline.execute(entry);
  for (const table of imTables) for (const tenant of [1, 50, 100000, 100049, 999999]) {
    const altered = formalMemory.clone();
    altered.rows(table).push({ tenant_id: Decimal.from(tenant) });
    let rejected = false;
    try { for (const entry of imGuard) altered.execute(entry); }
    catch (error) { if (error instanceof SqlError && /CHECK .+ rejected row/.test(error.message)) rejected = true; else throw error; }
    ensure(rejected, `07企业通信保护未拒绝已有${table}租户${tenant}记录`);
  }
  return '真实保护接受规范期初；OAuth五表25组、报表四表20组、套餐三表15组/租户四列4组及企业通信六表30组已有事实均阻止生成';
}

export function checkDemoSettlementSources(scan) {
  const required = new Map([
    ['biz_payment_request', ['source_biz_type', 'source_biz_id']],
    ['hr_salary_slip', ['reserved_settlement_id']],
  ]);
  const seen = new Set();
  for (const tokens of scan.statements) {
    const table = targetTable(tokens);
    if (!required.has(table) || !['INSERT', 'REPLACE'].includes(word(tokens[0]))) continue;
    const entry = parseInsert(tokens);
    for (const column of required.get(table)) {
      const index = entry.columns.indexOf(column);
      ensure(index >= 0, `07结算来源 ${table}.${column} 必须显式留空`);
      const values = entry.query ? [entry.query.columns[index]?.expression] : entry.rows.map(row => row[index]);
      ensure(values.length > 0 && values.every(value => value?.type === 'literal' && value.value === null),
        `07结算来源 ${table}.${column} 不得伪造人事来源或工资占位`);
    }
    seen.add(table);
  }
  sameSet(seen, required.keys(), '07普通付款和工资演示语句');
  return '普通付款来源两列及工资结算占位均显式NULL；逐条检查INSERT SELECT及VALUES';
}

export function checkTableCounts(repository) {
  same(repository.counts, [72, 47, 119, 91, 45], '正式 01—05 建表数');
  same(repository.schemas.size, 374, '正式唯一表数');
  const referralTables = new Set(['hr_employee_referral', 'hr_recruitment_identity', 'hr_severance_rule', 'hr_severance_rule_slab',
    'hr_final_settlement', 'hr_final_settlement_item', 'hr_training_recovery', 'hr_exit_interview']);
  const referralFile = `${designDirectory}/H2-人事增强提案DDL.sql`;
  const referralCompared = new Set();
  for (const tokens of statements(scanSql(repository.load(referralFile), referralFile))) {
    const table = targetTable(tokens);
    if (!referralTables.has(table)) continue;
    ensure(word(tokens[0]) === 'CREATE', '内推及结算表须使用批准的完整CREATE定义');
    compareSchema(repository.schemas.get(table), { ...parseCreate(tokens), full: true });
    sameSet(repository.schemas.get(table).checks.keys(), parseCreate(tokens).checks.keys(), `${table} CHECK集合`);
    ensure(repository.schemas.get(table).token.file.endsWith(formalFiles[2]), `${table} 所属正式文件错误`);
    referralCompared.add(table);
  }
  sameSet(referralCompared, referralTables, '内推及离职结算八张批准新表逐列核对');
  const settlementChanges = new Map([['hr_salary_slip', formalFiles[2]], ['biz_payment_request', formalFiles[3]]]);
  const settlementCompared = new Set();
  for (const tokens of statements(scanSql(repository.load(referralFile), referralFile))) {
    const table = targetTable(tokens);
    if (!settlementChanges.has(table)) continue;
    ensure(word(tokens[0]) === 'ALTER', '结算工资占位和付款来源须使用批准ALTER定义');
    compareSchema(repository.schemas.get(table), { ...parseAlter(tokens), full: false });
    ensure(repository.schemas.get(table).token.file.endsWith(settlementChanges.get(table)), `${table} 所属正式文件错误`);
    settlementCompared.add(table);
  }
  sameSet(settlementCompared, settlementChanges.keys(), '结算工资占位及OA付款来源逐列核对');
  const settlementTables = new Set([...referralTables].filter(table => !['hr_employee_referral', 'hr_recruitment_identity'].includes(table)));
  for (const file of ['06.cloudflow-business-seed.sql', '07.cloudflow-demo-seed.sql']) {
    ensure(!repository.scans.get(file).statements.some(entry => settlementTables.has(targetTable(entry))), `${file}不得生成或删除离职结算业务事实`);
  }
  const imFile = `${designDirectory}/外部接入与可靠投递提案DDL.sql`;
  const imCompared = new Set();
  for (const tokens of statements(scanSql(repository.load(imFile), imFile))) {
    const table = targetTable(tokens);
    if (!imTables.includes(table)) continue;
    ensure(word(tokens[0]) === 'CREATE', '企业通信六表必须使用批准CREATE定义');
    compareSchema(repository.schemas.get(table), { ...parseCreate(tokens), full: true });
    sameSet(repository.schemas.get(table).checks.keys(), parseCreate(tokens).checks.keys(), `${table} CHECK集合`);
    ensure(repository.schemas.get(table).token.file.endsWith(formalFiles[0]), `${table} 所属正式文件错误`);
    imCompared.add(table);
  }
  sameSet(imCompared, imTables, '企业通信六张批准新表逐列核对');
  for (const file of ['06.cloudflow-business-seed.sql', '07.cloudflow-demo-seed.sql']) {
    ensure(!repository.scans.get(file).statements.some(entry => imTables.includes(targetTable(entry))), `${file}不得生成或删除企业通信凭据和业务事实`);
  }
  const dataSourceTables = new Set(['sys_data_source_config', 'sys_data_source_registration']);
  const dataSourceFile = `${designDirectory}/H5-平台增强提案DDL.sql`;
  const dataSourceCompared = new Set();
  for (const tokens of statements(scanSql(repository.load(dataSourceFile), dataSourceFile))) {
    const table = targetTable(tokens);
    if (!dataSourceTables.has(table)) continue;
    ensure(word(tokens[0]) === 'CREATE', 'H5数据源两表须按批准CREATE定义实现');
    compareSchema(repository.schemas.get(table), { ...parseCreate(tokens), full: true });
    sameSet(repository.schemas.get(table).checks.keys(), parseCreate(tokens).checks.keys(), `${table} CHECK集合`);
    ensure(repository.schemas.get(table).token.file.endsWith(formalFiles[0]), `${table} 所属正式文件错误`);
    dataSourceCompared.add(table);
  }
  sameSet(dataSourceCompared, dataSourceTables, 'H5数据源两张新表逐列核对');
  const packageCompared = new Set();
  for (const tokens of statements(scanSql(repository.load(dataSourceFile), dataSourceFile))) {
    const table = targetTable(tokens);
    if (!tenantPackageTables.includes(table) && table !== 'sys_tenant') continue;
    const operation = word(tokens[0]);
    ensure(operation === (table === 'sys_tenant' ? 'ALTER' : 'CREATE'), '套餐必须使用批准的新表和租户四列定义');
    compareSchema(repository.schemas.get(table), { ...(operation === 'CREATE' ? parseCreate(tokens) : parseAlter(tokens)), full: operation === 'CREATE' });
    if (operation === 'CREATE') sameSet(repository.schemas.get(table).checks.keys(), parseCreate(tokens).checks.keys(), `${table} CHECK集合`);
    ensure(repository.schemas.get(table).token.file.endsWith(formalFiles[0]), `${table} 所属正式文件错误`);
    packageCompared.add(table);
  }
  sameSet(packageCompared, [...tenantPackageTables, 'sys_tenant'], '套餐三表及租户四列逐列核对');
  const oauthCompared = new Set();
  for (const tokens of statements(scanSql(repository.load(dataSourceFile), dataSourceFile))) {
    const table = targetTable(tokens);
    if (!oauthTables.includes(table)) continue;
    ensure(word(tokens[0]) === 'CREATE', 'OAuth五表必须使用批准CREATE定义');
    compareSchema(repository.schemas.get(table), { ...parseCreate(tokens), full: true });
    sameSet(repository.schemas.get(table).checks.keys(), parseCreate(tokens).checks.keys(), `${table} CHECK集合`);
    ensure(repository.schemas.get(table).token.file.endsWith(formalFiles[0]), `${table} 所属正式文件错误`);
    oauthCompared.add(table);
  }
  sameSet(oauthCompared, oauthTables, 'OAuth五张批准新表逐列核对');
  const reportCompared = new Set();
  for (const tokens of statements(scanSql(repository.load(dataSourceFile), dataSourceFile))) {
    const table = targetTable(tokens);
    if (!reportTables.includes(table)) continue;
    ensure(word(tokens[0]) === 'CREATE', '报表四表必须使用批准CREATE定义');
    compareSchema(repository.schemas.get(table), { ...parseCreate(tokens), full: true });
    sameSet(repository.schemas.get(table).checks.keys(), parseCreate(tokens).checks.keys(), `${table} CHECK集合`);
    ensure(repository.schemas.get(table).token.file.endsWith(formalFiles[0]), `${table} 所属正式文件错误`);
    reportCompared.add(table);
  }
  sameSet(reportCompared, reportTables, '报表四张批准新表逐列核对');
  sameSet(approvedReportMenus.map(menu => menu.id), [...sequence(1977, 1984), ...sequence(1992, 2000)], '报表十七项批准菜单');
  sameSet(approvedReportMenus.filter(menu => menu.kind === 'WRITE' && approvedMenuDesign.roleSets[menu.roles].includes(5)).map(menu => menu.id), [1979, 1980, 1982, 1983, 1984], '员工只能写本人报表定义');
  sameSet(approvedOauthMenus.map(menu => menu.id), [1987, 1988, 1989, 1990, 1991], 'OAuth五项批准菜单');
  ensure(approvedOauthMenus.every(menu => menu.id >= 1970 && menu.id <= 2099), 'OAuth菜单超出H5批准段位');
  sameSet(approvedDataSourceMenus.map(menu => menu.id), [1973, 1974, 1975, 1976], 'H5数据源四项批准菜单');
  ensure(approvedDataSourceMenus.every(menu => menu.id >= 1970 && menu.id <= 2099 && menu.roles === 'PLATFORM'), 'H5数据源超出段位或包含非平台授权');
  same(approvedMenuDesign.roleSets.PLATFORM, [1], 'H5平台角色仅ADMIN');
  const skillTables = new Set(['hr_skill', 'hr_position_skill', 'hr_employee_skill', 'hr_training_course',
    'hr_appraisal_cycle', 'hr_appraisal_kra', 'hr_appraisal_result', 'hr_performance_objective',
    'hr_performance_assignment', 'hr_perf_distribution_rule', 'hr_talent_calibration_session', 'hr_employee_advance', 'hr_advance_repayment']);
  const skillFile = `${designDirectory}/H2-人事增强提案DDL.sql`;
  const skillCompared = new Set();
  for (const tokens of statements(scanSql(repository.load(skillFile), skillFile))) {
    const operation = word(tokens[0]);
    const table = targetTable(tokens);
    if (!skillTables.has(table) || !['CREATE', 'ALTER'].includes(operation)) continue;
    compareSchema(repository.schemas.get(table), { ...(operation === 'CREATE' ? parseCreate(tokens) : parseAlter(tokens)), full: operation === 'CREATE' });
    skillCompared.add(table);
  }
  sameSet(skillCompared, skillTables, 'H2技能四张、绩效七张及借款两张新改表逐列核对');
  sameSet(approvedAppraisalMenus.map(menu => menu.id), [1882, 1883, 1884, 1885, 1886, 1894, 1895], 'H2绩效七项批准菜单');
  sameSet(approvedAdvanceMenus.map(menu => menu.id), [1871, 1872, 1873, 1874, 1875, 1876], 'H2借款入口六项批准菜单');
  sameSet(approvedBusinessSearchMenus.map(menu => menu.id), [1986], 'H5搜索唯一批准菜单');
  sameSet(approvedFilePreviewMenus.map(menu => menu.id), [1985], 'H5预览唯一批准菜单');
  ensure(approvedFilePreviewMenus.every(menu => menu.id >= 1970 && menu.id <= 2099 && menu.kind === 'READ'), 'H5预览超出段位或包含写权限');
  ensure(approvedBusinessSearchMenus.every(menu => menu.id >= 1970 && menu.id <= 2099 && menu.kind === 'READ'), 'H5搜索超出段位或包含写权限');
  ensure([...approvedSkillMenus, ...approvedAppraisalMenus, ...approvedAdvanceMenus].every(menu => menu.id >= 1860 && menu.id <= 1899), 'H2菜单超出1860—1899批准段位');
  same(JSON.parse(repository.load(`${designDirectory}/H-G剩余设计菜单清单.json`)), approvedMenuDesign, '批准菜单清单快照');
  same(approvedMeetingMenus.length, 10, 'H4批准菜单数量');
  ensure(approvedMeetingMenus.every(menu => menu.id >= 1950 && menu.id <= 1969), 'H4菜单超出1950—1969批准段位');
  same(repository.schemas.get('wf_agent_setting')?.columns.size, 15, 'H1代理配置15列');
  same(repository.schemas.get('wf_gateway_activation')?.columns.size, 14, 'H1网关激活14列');
  same(repository.schemas.get('wf_parallel_join')?.columns.size, 9, 'H1本轮到达9列');
  same(repository.schemas.get('wf_task')?.columns.size, 22, 'H1任务18列及A3已批准释放来源4列');
  const offboardFile = `${designDirectory}/A3-离职待办接续与姓名容量补充提案-20261003.md`;
  const offboardApproval = repository.load(offboardFile);
  ensure(offboardApproval.includes('用户明确批准'), 'A3离职接续结构须有用户明确批准');
  const offboardColumns = offboardApproval.match(/^```sql\s*\r?\n([\s\S]*?)^```/m)?.[1];
  ensure(offboardColumns, 'A3批准方案缺少四列及索引定义');
  const offboardExpected = parseCreate(statements(scanSql(`CREATE TABLE wf_task (${offboardColumns});`, offboardFile))[0]);
  compareSchema(repository.schemas.get('wf_task'), { ...offboardExpected, full: false });
  for (const [table, name] of [['wf_process_instance','start_user_name'],['wf_task','assignee_name'],['wf_task_history','operator_name'],
    ['wf_task_attachment','uploader_name'],['wf_task_delegation','from_user_name'],['wf_task_delegation','to_user_name'],
    ['wf_task_add_sign','initiator_name'],['wf_countersign_vote','voter_name'],['wf_node_record','executor_name'],
    ['wf_deploy_record','deployer_name'],['wf_process_copy','start_user_name'],['wf_deploy_rollback_history','rollback_by_name']]) {
    const column = repository.schemas.get(table)?.columns.get(name);
    same(column?.type, 'VARCHAR', `A3姓名类型 ${table}.${name}`);
    same(column?.width, '100', `A3已批准姓名容量 ${table}.${name}`);
  }
  const gatewayDesign = repository.load(`${designDirectory}/H1-代理与网关设计确认稿.md`);
  const gatewayTables = new Set(['wf_agent_setting', 'wf_gateway_activation', 'wf_parallel_join', 'wf_task', 'wf_task_history', 'wf_task_delegation']);
  const compared = new Set();
  for (const tokens of fencedDefinitions(gatewayDesign, 'H1-代理与网关设计确认稿.md')) {
    const operation = word(tokens[0]);
    const table = targetTable(tokens);
    if (!['CREATE', 'ALTER'].includes(operation) || !gatewayTables.has(table)) continue;
    const expected = { ...(operation === 'CREATE' ? parseCreate(tokens) : parseAlter(tokens)), full: operation === 'CREATE' };
    compareSchema(repository.schemas.get(table), expected);
    compared.add(table);
  }
  sameSet(compared, gatewayTables, 'H1批准稿6张新改表均逐列核对');
  const meetingTables = new Set(['oa_meeting_reminder', 'oa_meeting_room', 'oa_schedule_event', 'oa_meeting_attendance']);
  const meetingFile = `${designDirectory}/H4-会议深化提案DDL.sql`;
  const meetingCompared = new Set();
  for (const tokens of statements(scanSql(repository.load(meetingFile), meetingFile))) {
    const operation = word(tokens[0]);
    const table = targetTable(tokens);
    ensure(['CREATE', 'ALTER'].includes(operation) && meetingTables.has(table), 'H4批准结构中出现未识别语句');
    compareSchema(repository.schemas.get(table), { ...(operation === 'CREATE' ? parseCreate(tokens) : parseAlter(tokens)), full: operation === 'CREATE' });
    meetingCompared.add(table);
  }
  sameSet(meetingCompared, meetingTables, 'H4批准稿4张新改表逐列核对');
  const marketingTables = new Set(['crm_mass_email_recipient', 'crm_email_tracking_link', 'crm_email_suppression', 'crm_mass_email', 'crm_campaign_log']);
  const marketingFile = `${designDirectory}/外部接入与可靠投递提案DDL.sql`;
  const marketingCompared = new Set();
  for (const tokens of statements(scanSql(repository.load(marketingFile), marketingFile))) {
    const operation = word(tokens[0]);
    const table = targetTable(tokens);
    if (!marketingTables.has(table) || !['CREATE', 'ALTER'].includes(operation)) continue;
    compareSchema(repository.schemas.get(table), { ...(operation === 'CREATE' ? parseCreate(tokens) : parseAlter(tokens)), full: operation === 'CREATE' });
    marketingCompared.add(table);
  }
  sameSet(marketingCompared, marketingTables, 'E5批准稿3张新表及2张改表逐列核对');
  const opportunityTables = new Set(['crm_sales_stage', 'crm_opportunity_item', 'crm_opportunity_stage_history', 'crm_opportunity', 'crm_deal_team', 'crm_deal_event', 'crm_deal_allocation', 'crm_email_record', 'sys_portal_user', 'oa_knowledge_document', 'sys_file', 'crm_service_ticket']);
  const opportunityFile = `${designDirectory}/H3-客户增强提案DDL.sql`;
  const opportunityCompared = new Set();
  for (const tokens of statements(scanSql(repository.load(opportunityFile), opportunityFile))) {
    const operation = word(tokens[0]);
    const table = targetTable(tokens);
    if (!opportunityTables.has(table) || !['CREATE', 'ALTER'].includes(operation)) continue;
    compareSchema(repository.schemas.get(table), { ...(operation === 'CREATE' ? parseCreate(tokens) : parseAlter(tokens)), full: operation === 'CREATE' });
    opportunityCompared.add(table);
  }
  sameSet(opportunityCompared, opportunityTables, 'H3批准稿8张新表及商机、知识库、附件、工单改表逐列核对');
  same(approvedOpportunityMenus.length, 7, 'H3商机及团队实施菜单数量');
  sameSet(approvedOpportunityImportMenus.map(menu => menu.id), [1917], 'H3商机导入独立批准菜单');
  sameSet(approvedCommissionMenus.map(menu => menu.id), [1907, 1908], 'H3提成两项批准菜单');
  sameSet(approvedEmailMenus.map(menu => menu.id), [1909, 1910, 1911], 'H3邮件归档三项批准菜单');
  sameSet(approvedPortalMenus.map(menu => menu.id), [1912, 1913], 'H3门户账号两项批准菜单');
  sameSet(approvedTicketMenus.map(menu => menu.id), [1914], 'H3工单对外方案批准菜单');
  sameSet(approvedKnowledgeMenus.map(menu => menu.id), [1915], 'H3知识库对外发布批准菜单');
  ensure([...approvedOpportunityMenus, ...approvedOpportunityImportMenus, ...approvedCommissionMenus, ...approvedEmailMenus, ...approvedPortalMenus, ...approvedTicketMenus, ...approvedKnowledgeMenus, ...approvedPortalFinanceMenus].every(menu => menu.id >= 1900 && menu.id <= 1949), 'H3菜单超出1900—1949批准段位');
  for (const file of formalFiles) for (const entry of repository.scans.get(file).statements) {
    ensure(!(word(entry[0]) === 'ALTER' && [...newTables, ...changedTables].includes(targetTable(entry))), `${location(entry[0])} H 结构须直接合入 CREATE TABLE，不能由后置 ALTER 绕过已核验结构`);
  }
  for (const name of newTables) {
    const schema = repository.schemas.get(name);
    ensure(schema, `缺少 H 新表 ${name}`);
    const expectedFile = name.startsWith('hr_') ? formalFiles[2] : formalFiles[3];
    ensure(schema.token.file.endsWith(expectedFile), `${name} 所属正式文件错误`);
  }
  return '374 = 72/47/119/91/45；G4六张、H1六张、H2技能四张及绩效七张及借款两张及内推两张及离职结算六张、H4四张、E5五张、H3十二张及H5数据源两张、OAuth五张、报表四张、套餐三表和租户四列的批准定义逐项一致';
}

export function checkFoundationEquality(formal, demo) {
  const left = foundation(formal);
  const right = foundation(demo);
  const formalCanonical = left.statements.map(canonical);
  const demoCanonical = right.statements.map(canonical);
  if (stable(formalCanonical) !== stable(demoCanonical)) {
    const firstDifference = formalCanonical.findIndex((value, index) => value !== demoCanonical[index]);
    const index = firstDifference < 0 ? formalCanonical.length : firstDifference;
    throw new Error(`foundations 第 ${index + 1} 条有效语句不同：06 ${location(left.statements[index]?.[0])}；07 ${location(right.statements[index]?.[0])}。只忽略注释、空白及等值数值写法，保留字符串载荷。`);
  }
  return `${left.statements.length} 条有效语句逐条同义比较一致`;
}

export function checkDynamicSql(scan) {
  const allowedAlter = new Set([
    'ALTER TABLE oa_meeting_minutes ADD COLUMN room_id VARCHAR(64) DEFAULT NULL AFTER meeting_time',
    'ALTER TABLE oa_meeting_minutes ADD COLUMN schedule_event_id BIGINT(20) DEFAULT NULL AFTER organizer_name',
  ]);
  let approvedAssignment = false;
  for (const entry of scan.statements) {
    const operation = word(entry[0]);
    if (operation === 'SET' && word(entry[1]) === '@' && entry[2]?.value === 'cloudflow_schema_sql') {
      const strings = entry.filter(token => token.kind === 'string').map(token => token.value);
      const sqlStrings = strings.filter(value => /^(?:SELECT|ALTER|INSERT|UPDATE|DELETE|REPLACE|CALL)\b/i.test(value));
      ensure(sqlStrings.length === 2 && sqlStrings.includes('SELECT 1') && sqlStrings.some(value => allowedAlter.has(value)), `${location(entry[0])} 出现未建模动态 SQL，无法保证 H 内容未被改写`);
      approvedAssignment = true;
    } else if (operation === 'PREPARE') {
      ensure(approvedAssignment && entry[1]?.value === 'cloudflow_schema_stmt' && entry.at(-1)?.value === 'cloudflow_schema_sql', `${location(entry[0])} 非白名单 PREPARE`);
    } else if (operation === 'EXECUTE') {
      ensure(approvedAssignment && entry.length === 2 && entry[1]?.value === 'cloudflow_schema_stmt', `${location(entry[0])} 非白名单 EXECUTE`);
      approvedAssignment = false;
    } else if (operation === 'CALL') throw new Error(`${location(entry[0])} 不静态放行存储过程调用`);
  }
  return '动态执行仅允许既有两项 OA 会议字段探测；不执行任何 SQL 或应用源码';
}

export function runChecks({ allowPendingDemo = false, repository = loadRepository() } = {}) {
  const report = new Report();
  report.check('KNOWLEDGE_PUBLICATION', '知识库公开清单与附件安全边界', () => checkKnowledgePublication(repository));
  report.check('TABLE_COUNTS', '正式表数与 H 六新表归属', () => checkTableCounts(repository));
  let contracts;
  if (report.check('DESIGN_CONTRACTS', '提取独立确认稿结构预期', () => { contracts = designContracts(repository); return '方案 A：6 个完整新表、1 个完整既有表、6 组既有表结构差异'; })) {
    for (const [name, expected] of contracts) report.check(`DDL_${name}`, `确认列、索引和约束 ${name}`, () => compareSchema(repository.schemas.get(name), expected));
  }
  const formal = repository.scans.get('06.cloudflow-business-seed.sql');
  const demoScan = repository.scans.get('07.cloudflow-demo-seed.sql');
  report.check('DEMO_SETTLEMENT_SOURCES', '07普通付款及工资没有伪造结算来源', () => checkDemoSettlementSources(demoScan));
  report.check('FORMAL_DYNAMIC_SQL', '06 动态 SQL 边界', () => checkDynamicSql(formal));
  report.check('DEMO_DYNAMIC_SQL', '07 动态 SQL 边界', () => checkDynamicSql(demoScan));
  if (allowPendingDemo) {
    try { report.entries.push({ status: 'PASS', code: 'FOUNDATIONS_SYNC', description: '06/07 foundations 有效内容一致', detail: checkFoundationEquality(formal, demoScan) }); }
    catch (error) { report.pending('FOUNDATIONS_SYNC', '07 待主线程重新生成', error.message); }
  } else report.check('FOUNDATIONS_SYNC', '06/07 foundations 有效内容一致', () => checkFoundationEquality(formal, demoScan));
  let formalState;
  const replayed = report.check('FORMAL_REPLAY', '顺序计算真实 06 行值、筛选、关联及 CHECK', () => {
    formalState = replayFormal(repository);
    return '只在内存求值；未连接数据库，未调用 SQL 客户端或生成器';
  });
  if (replayed) {
    const { memory, beforeH } = formalState;
    report.check('MENUS', '143项菜单真实行字段与预留编号', () => checkMenus(memory));
    report.check('ROLE_PAIRS', '11角色精确新增842对及通用发起边界', () => checkRoles(memory, beforeH));
    report.check('PAGES_PERMISSIONS', '实际页面路径、模块导出与权限调用', () => { checkReportMobileRoutes(repository); return checkPages(repository, memory); });
    report.check('DEFAULT_POLICIES', '正式政策保持未核定/停用', () => checkPolicies(memory));
    report.check('SEED_REGISTRATIONS', '字典、审批图、任务与初始状态', () => checkSeedRegistrations(memory));
    report.check('DATA_SOURCE_SEEDS', '平台数据源落库保护、集中任务与演示授权', () => checkDataSourceSeeds(repository, memory));
    report.check('TENANT_PACKAGE_SEEDS', '套餐菜单冲突与正式、演示授权边界', () => checkTenantPackageSeeds(repository, memory));
    report.check('IM_CONFIG_MENUS', 'G4独立段位、冲突保护、精确授权和页面', () => checkImConfigMenus(repository, memory));
    report.check('OPPORTUNITY_DEFAULTS', '阶段默认配置、模板与演示种子同步', () => checkOpportunityDefaults(repository, memory));
    report.check('INVENTORY_CHAIN', '期初/采购来源、金额与成本结存链', () => checkLedger(memory));
    report.check('SOURCE_REPLAY', '同来源同载荷重跑与异载荷拒绝', () => checkReplay(repository, memory));
    report.check('DEMO_GUARD', '07 业务事实保护检查有真实阻断效果', () => checkDemoGuard(repository, memory));
    let demo;
    if (report.check('DEMO_PROJECTION', '计算 07 通用生成器的真实行值', () => {
      demo = projectDemo(repository, memory);
      return `${demo.parsedEntries.length} 条生成语句；按实际 tenant/row 种子展开，不只读取第 1 行`;
    })) {
      report.check('DEMO_BUSINESS_FACTS', '07 无伪造 H 草稿、审批及结果来源', () => checkDemoBusinessFacts(demo));
      report.check('DEMO_OVERTIME_TYPE_REF', '07 打卡类型引用真实 H 类型', () => checkDemoReferences(demo));
      report.check('DEMO_OVERTIME_MINUTES', '07 日/月加班数量有真实来源', () => checkDemoOvertime(demo));
      report.check('DEMO_COMPENSATORY', '07 调休入账不伪造 H 审批', () => checkDemoLeave(demo));
      report.check('DEMO_INVENTORY', '07 不生成无来源库存与台账', () => checkDemoInventory(demo));
      report.check('DEMO_DEFAULT_POLICIES', '07 有效租户 H 政策仍保持停用', () => checkPolicies(demo.memory, { requireLeaveType: false }));
      report.check('DEMO_OPPORTUNITY_DEFAULTS', '07有效租户六阶段及提醒模板', () => checkOpportunityDefaults(repository, demo.memory));
    }
  }
  report.check('INPUT_SNAPSHOT', '读取期间仓库内容保持一致', () => {
    const changed = [...repository.sources].filter(([file, content]) => hash(repository.read(file)) !== hash(content)).map(([file]) => file);
    ensure(!changed.length, `主线程在验证期间更新了输入，请重跑以取得一致快照：${changed.join('、')}`);
    return `${repository.sources.size} 个输入文件内容摘要一致；验证脚本没有写入输入`;
  });
  return report;
}

const scopeNotes = [
  '静态契约 = 读取正式文件，在内存计算表结构、种子行及授权集合；不连接运行库，不运行应用、生成器、网络请求或数据库命令。',
  '374计正式01—05永久表，含G4六张、内推两张与离职结算六张；143仅计H菜单=WF10/OA30/HR55/CRM目录16/SYS32；842仅计H授权=WF90/OA194/HR279/CRM目录62/SYS217，含管理员实际SELECT授权；H3提成1907授ADMIN/FINANCE/HR/SALES_MANAGER，1908仅授ADMIN/FINANCE/HR；套餐1970—1972及客户端1987/1988仅平台ADMIN，1989/1991只授本人同意和撤销，不授源业务写权限；离职面谈1869及培训追偿1870仅ADMIN/HR，借款1873仅本人提交撤回，结算1860—1863开放草稿，1864提交撤回仅ADMIN/HR，1865确认关闭仅ADMIN/HR/FINANCE，1867实际收款仅ADMIN/FINANCE，1866冲正创建提交撤回仅ADMIN/FINANCE；1868经济补偿规则仅ADMIN/HR/LEGAL；G4独立十二菜单42授权，管理九项仅ADMIN，本人1788/1789/1790授11角色，不计入H集合。',
  '结构比较忽略整数显示宽度与说明文案差异，核对类型/精度、可空、默认、排序索引、唯一键及 CHECK；支持范围外的受检 SQL 直接失败，不猜测结果。',
  '07 的零加班/无自动调休口径仅用于通用演示生成；06 既有 D 手工假期账与运行库真实考勤未据此判错。普通初始授额允许，私人流程草稿禁止；合法期初/采购来源台账允许。',
  '未覆盖：空库执行成功、审批人与并发/权限运行效果、真实工资税率及 C 子表恢复；静态通过不等于 H 业务验收通过。',
];

function main() {
  const argumentsList = process.argv.slice(2);
  const allowed = new Set(['--allow-pending-demo', '--json', '--help']);
  ensure(argumentsList.every(argument => allowed.has(argument)), `未知参数：${argumentsList.filter(argument => !allowed.has(argument)).join(' ')}`);
  if (argumentsList.includes('--help')) {
    console.log('陛下，运行：node scripts/check-batch-h-contracts.mjs [--allow-pending-demo] [--json]\n--allow-pending-demo 仅将 foundations 不同步标为待同步，其余错误仍退出 1。\n退出码：0=无失败（可能有显式待同步）；1=契约失败；2=启动/解析失败。\n' + scopeNotes.join('\n'));
    return;
  }
  const started = Date.now();
  const report = runChecks({ allowPendingDemo: argumentsList.includes('--allow-pending-demo') });
  const summary = { passed: report.entries.filter(entry => entry.status === 'PASS').length, failed: report.failures.length, pending: report.entries.filter(entry => entry.status === 'PENDING').length, milliseconds: Date.now() - started };
  if (argumentsList.includes('--json')) console.log(JSON.stringify({ summary, scope: scopeNotes, entries: report.entries }, null, 2));
  else {
    console.log(`陛下，H 静态契约检查：通过 ${summary.passed}，失败 ${summary.failed}，待同步 ${summary.pending}。`);
    for (const entry of report.entries) console.log(`[${{ PASS: '通过', FAIL: '失败', PENDING: '待同步' }[entry.status]}] ${entry.code} ${entry.description}${entry.detail ? `\n  ${String(entry.detail).replaceAll('\n', '\n  ')}` : ''}`);
    for (const note of scopeNotes) console.log(`口径：${note}`);
  }
  process.exitCode = summary.failed ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); }
  catch (error) { console.error(`陛下，H 静态契约检查未完成：${error.message}`); process.exitCode = 2; }
}
