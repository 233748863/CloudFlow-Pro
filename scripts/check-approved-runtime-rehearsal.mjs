import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { formalFiles, loadRepository } from './check-batch-h-contracts.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = path.join(root, '.cloudflow-runtime/full-prd-20260915/approved-runtime');
const runtimeDatabase = 'cloud_flow_db';
const temporaryDatabase = `cf_prd_rehearsal_${randomUUID().replaceAll('-', '')}`;
const filenames = [...formalFiles, '06.cloudflow-business-seed.sql', '07.cloudflow-demo-seed.sql'];
const repository = loadRepository();
const expectedTableCount = repository.schemas.size;
const proposal = JSON.parse(fs.readFileSync(path.join(root, 'docs/design/H-G剩余设计菜单清单.json'), 'utf8'));
const digest = value => createHash('sha256').update(value).digest('hex');
const sources = filenames.map(filename => {
  const source = fs.readFileSync(path.join(root, 'cloudflow-backend/DB', filename), 'utf8');
  return { filename, source, sha256: digest(source) };
});
let created = false;
let runtimeBefore;
let succeeded = false;

assert.match(process.env.DB_URL ?? '', /^jdbc:mysql:\/\/192\.168\.1\.173:3306\/cloud_flow_db(?:\?|$)/);
assert.ok(process.env.DB_USERNAME && process.env.DB_PASSWORD, 'Protected database credentials are required');
assert.equal(expectedTableCount, 374);
assert.match(temporaryDatabase, /^cf_prd_rehearsal_[a-f0-9]{32}$/);
assert.notEqual(temporaryDatabase, runtimeDatabase);
fs.mkdirSync(outputDirectory, { recursive: true });
fs.writeFileSync(path.join(outputDirectory, 'rehearsal-result.json'), JSON.stringify({ passed: false, mode: 'IN_PROGRESS', startedAt: new Date().toISOString(), sources: sources.map(({ filename, sha256 }) => ({ filename, sha256 })) }, null, 2));

function mysql(database, statement, readOnly = false, timeout = 60000) {
  assert.ok(database === null || database === temporaryDatabase || database === runtimeDatabase);
  if (database === runtimeDatabase) assert.equal(readOnly, true, 'Runtime database is strictly read-only');
  const normalized = statement.replace(/^\uFEFF/, '');
  const result = spawnSync(process.env.CLOUDFLOW_MYSQL_EXE ?? 'C:\\Program Files\\MySQL\\MySQL Server 8.0\\bin\\mysql.exe', [
    '--no-defaults', '--host=192.168.1.173', '--port=3306', '--protocol=TCP', `--user=${process.env.DB_USERNAME}`,
    '--connect-timeout=10', '--batch', '--raw', '--skip-column-names', '--default-character-set=utf8mb4',
    '--local-infile=0', '--binary-mode', ...(database ? [`--database=${database}`] : []),
  ], {
    input: `SET SESSION information_schema_stats_expiry=0;\n${readOnly ? `START TRANSACTION READ ONLY;\n${normalized};\nCOMMIT;` : normalized}`,
    encoding: 'utf8', windowsHide: true, timeout, maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, MYSQL_PWD: process.env.DB_PASSWORD },
  });
  if (result.status !== 0 || result.error) {
    const error = /ERROR \d+ \([A-Z0-9]+\)(?: at line \d+)?/.exec(result.stderr ?? '')?.[0] ?? result.error?.code ?? 'UNKNOWN';
    throw new Error(`MySQL failed: exit=${result.status}; ${error}`);
  }
  return result.stdout.trim();
}

function rows(database, query) {
  const result = mysql(database, query, true);
  return result ? result.split(/\r?\n/).map(line => JSON.parse(line)) : [];
}

function snapshot(database) {
  return {
    tables: rows(database, "SELECT JSON_OBJECT('table',table_name) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_type='BASE TABLE' ORDER BY table_name"),
    columns: rows(database, "SELECT JSON_OBJECT('table',table_name,'column',column_name,'type',column_type,'key',column_key,'nullable',is_nullable,'default',column_default) FROM information_schema.columns WHERE table_schema=DATABASE() ORDER BY table_name,ordinal_position"),
    menus: rows(database, "SELECT JSON_OBJECT('id',menu_id,'permission',perms,'status',status,'parent',parent_id) FROM sys_menu ORDER BY menu_id"),
    roles: rows(database, "SELECT JSON_OBJECT('id',role_id,'key',role_key,'tenant',tenant_id,'status',status,'deleted',deleted) FROM sys_role ORDER BY tenant_id,role_id"),
    grants: rows(database, 'SELECT JSON_OBJECT(\'role\',role_id,\'menu\',menu_id,\'tenant\',tenant_id) FROM sys_role_menu ORDER BY tenant_id,role_id,menu_id'),
  };
}

function sameSet(actual, expected, label) {
  const actualSet = new Set(actual);
  const expectedSet = new Set(expected);
  const missing = [...expectedSet].filter(item => !actualSet.has(item));
  const extra = [...actualSet].filter(item => !expectedSet.has(item));
  console.log(`${label}: expected=${expectedSet.size}; actual=${actualSet.size}; missing=${missing.length}; extra=${extra.length}`);
  assert.deepEqual({ missing, extra }, { missing: [], extra: [] });
}

try {
console.log(`MODE=APPROVED_01_07_REHEARSAL; UTC=${new Date().toISOString()}; H_G_DESIGN_MENUS_APPLIED=true; EXTERNAL_DEPENDENCIES_DEFERRED=true`);
  runtimeBefore = snapshot(runtimeDatabase);
  const runtimeForms = runtimeBefore.columns.filter(column => column.table === 'wf_form_definition');
  const hasInstanceVersion = runtimeBefore.columns.some(column => column.table === 'wf_process_instance' && column.column === 'form_version');
  console.log(`RUNTIME_C_SCHEMA: form_primary=${runtimeForms.filter(column => column.key === 'PRI').map(column => column.column).join(',')}; instance_form_version=${hasInstanceVersion}; deployment_required=${!hasInstanceVersion || !runtimeForms.some(column => column.column === 'id' && column.key === 'PRI')}`);
  console.log(`RUNTIME_TABLES=${runtimeBefore.tables.length}; RUNTIME_EMPLOYEE_GRANTS=${runtimeBefore.grants.filter(grant => grant.role === 5 && grant.tenant === 100000).length}`);
  assert.equal(mysql(null, `SELECT COUNT(*) FROM information_schema.schemata WHERE schema_name='${temporaryDatabase}'`, true), '0');
  mysql(null, `CREATE DATABASE \`${temporaryDatabase}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;`);
  created = true;
  console.log(`REHEARSAL_DATABASE=${temporaryDatabase}; OWNED_NEW_EMPTY_DATABASE=true`);
  let expectedTables = 0;
  for (const [index, entry] of sources.entries()) {
    assert.ok(!/DROP\s+DATABASE|CREATE\s+USER|GRANT\s+ALL|SET\s+GLOBAL|INTO\s+OUTFILE|INTO\s+DUMPFILE/i.test(entry.source), entry.filename);
    const redirected = entry.source.replace(/\bcloud_flow_db\b/gi, temporaryDatabase);
    assert.ok(!/cloud_flow_db/i.test(redirected));
    console.log(`IMPORT_BEGIN ${entry.filename}: sha256=${entry.sha256}`);
    mysql(temporaryDatabase, redirected, false, 900000);
    if (index < formalFiles.length) expectedTables += repository.counts[index];
    const actualCount = Number(mysql(temporaryDatabase, "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_type='BASE TABLE'", true));
    assert.equal(actualCount, expectedTables);
    console.log(`IMPORT_PASS ${entry.filename}: mysql_exit=0; tables=${actualCount}; expected=${expectedTables}`);
  }
  const after = snapshot(temporaryDatabase);
  sameSet(after.tables.map(table => table.table), repository.schemas.keys(), 'REHEARSED_TABLE_SET');
  for (const [table, schema] of repository.schemas) sameSet(after.columns.filter(column => column.table === table).map(column => column.column), schema.columns.keys(), `COLUMNS ${table}`);
  assert.ok(after.columns.some(column => column.table === 'wf_form_definition' && column.column === 'id' && column.key === 'PRI'));
  assert.ok(after.columns.some(column => column.table === 'wf_form_definition' && column.column === 'checksum'));
  assert.ok(after.columns.some(column => column.table === 'wf_process_instance' && column.column === 'form_version'));
  const cMenus = after.menus.filter(menu => menu.id >= 1400 && menu.id <= 1449);
  sameSet(cMenus.map(menu => `${menu.id}:${menu.permission}`), ['1400:workflow:form:history', '1401:workflow:form:rollback'], 'APPROVED_C_MENUS');
  const cGrants = after.grants.filter(grant => grant.menu >= 1400 && grant.menu <= 1449);
  const administrators = after.roles.filter(role => role.key === 'admin' && role.status === '0' && role.deleted === 0);
  assert.equal(administrators.length, 50);
  sameSet(administrators.map(role => role.tenant), Array.from({ length: 50 }, (unused, index) => 100000 + index), 'APPROVED_ADMIN_TENANTS');
  assert.equal(administrators.find(role => role.tenant === 100000).id, 1);
  const expectedCGrants = administrators.flatMap(role => [1400, 1401].map(menuId => `${role.id}:${menuId}:${role.tenant}`));
  sameSet(cGrants.map(grant => `${grant.role}:${grant.menu}:${grant.tenant}`), expectedCGrants, 'APPROVED_C_ROLE_GRANTS');
  console.log(`C_AUTHORIZATION: administrator_tenants=${administrators.length}; administrator_grants=${cGrants.length}; non_administrator_grants=0`);
  const employee = after.grants.filter(grant => grant.role === 5 && grant.tenant === 100000);
  const runtimeEmployee = runtimeBefore.grants.filter(grant => grant.role === 5 && grant.tenant === 100000);
  const expectedEmployeeGrantCount = 218;
  const expectedEmployeeNewWriteIds = new Set(proposal.employeeNewWriteIds);
  assert.equal(runtimeEmployee.length, proposal.baselineEmployeeGrantCount, 'Historical runtime employee grant baseline changed');
  assert.equal(employee.length, expectedEmployeeGrantCount);
  assert.equal(employee.filter(grant => expectedEmployeeNewWriteIds.has(grant.menu)).length, expectedEmployeeNewWriteIds.size);
  const runtimeEmployeeIds = new Set(runtimeEmployee.map(grant => grant.menu));
  const employeeNewIds = employee.filter(grant => !runtimeEmployeeIds.has(grant.menu)).map(grant => grant.menu);
  assert.equal(new Set(employeeNewIds).size, expectedEmployeeGrantCount - runtimeEmployee.length);
  for (const menuId of expectedEmployeeNewWriteIds) assert.ok(employeeNewIds.includes(menuId), `Expected employee write grant missing: ${menuId}`);
  sameSet(employee.filter(grant => runtimeEmployeeIds.has(grant.menu)).map(grant => grant.menu), runtimeEmployee.map(grant => grant.menu), 'EMPLOYEE_BASELINE_GRANTS_UNCHANGED');
  console.log(`EMPLOYEE_NEW_GRANTS=${employeeNewIds.join(',')}; EMPLOYEE_NEW_GRANT_COUNT=${employeeNewIds.length}; EMPLOYEE_NEW_WRITE_GRANTS=${expectedEmployeeNewWriteIds.size}`);
  const pendingMenuIds = new Set(proposal.menus.map(menu => menu.id));
  sameSet(after.menus.filter(menu => pendingMenuIds.has(menu.id)).map(menu => menu.id), [...pendingMenuIds], 'H_G_DESIGN_MENUS_APPLIED');
  const invalidPrefixes = after.menus.filter(menu => menu.permission && !/^(system|oa|crm|hr|workflow):/.test(menu.permission));
  assert.deepEqual(invalidPrefixes, []);
  const demoMenus = after.menus.filter(menu => menu.id >= 3000 && menu.id <= 3049);
  assert.equal(demoMenus.length, 50);
  assert.ok(demoMenus.every(menu => menu.status === '1'));
  const formCounts = rows(temporaryDatabase, "SELECT JSON_OBJECT('forms',(SELECT COUNT(*) FROM wf_form_definition),'instances',(SELECT COUNT(*) FROM wf_process_instance),'tenants',(SELECT COUNT(*) FROM sys_tenant),'duplicate_latest',(SELECT COUNT(*) FROM (SELECT tenant_id,form_id FROM wf_form_definition WHERE is_latest=1 GROUP BY tenant_id,form_id HAVING COUNT(*)>1) duplicated))")[0];
  assert.equal(formCounts.duplicate_latest, 0);
  assert.ok(formCounts.forms > 0 && formCounts.instances > 0 && formCounts.tenants > 0);
  console.log(`C_READY_SCHEMA_AND_DEMO=${JSON.stringify(formCounts)}`);
  const uniqueAudit = spawnSync(process.execPath, [path.join(root, 'scripts/check-runtime-backup-constraints.mjs')], {
    encoding: 'utf8', windowsHide: true, timeout: 180000, env: { ...process.env, CLOUDFLOW_UNIQUE_AUDIT_DATABASE: temporaryDatabase },
  });
  console.log(uniqueAudit.stdout.trim());
  assert.equal(uniqueAudit.status, 0, 'Approved 01-07 data violates a unique index');
  console.log(`C_MENU_RANGE=1400-1449; C_NEW_MENUS=1400,1401; EMPLOYEE_GRANTS=${employee.length}; EMPLOYEE_NEW_GRANTS=${employeeNewIds.length}; EMPLOYEE_NEW_SELF_WRITE_GRANTS=${expectedEmployeeNewWriteIds.size}; H_G_MENUS=${pendingMenuIds.size}; INVALID_MENU_PREFIXES=0; DISABLED_DEMO_MENUS=50`);
  for (const source of sources) assert.equal(digest(fs.readFileSync(path.join(root, 'cloudflow-backend/DB', source.filename), 'utf8')), source.sha256, `Source changed: ${source.filename}`);
  fs.writeFileSync(path.join(outputDirectory, 'rehearsal-schema.json'), JSON.stringify(after, null, 2));
  fs.writeFileSync(path.join(outputDirectory, 'rehearsal-result.json'), JSON.stringify({ passed: true, tableCount: expectedTableCount, cMenus, cGrants, employeeGrantCount: employee.length, historicalEmployeeGrantBaseline: proposal.baselineEmployeeGrantCount, employeeNewGrantIds: employeeNewIds, employeeNewGrantCount: employeeNewIds.length, employeeNewWriteIds: [...expectedEmployeeNewWriteIds], hGMenuCount: pendingMenuIds.size, externalDependencies: 'DEFERRED', formCounts, sources: sources.map(({ filename, sha256 }) => ({ filename, sha256 })), completedAt: new Date().toISOString(), mode: 'APPROVED_01_07_HG_APPLIED_RUNTIME_UNCHANGED' }, null, 2));
  succeeded = true;
} finally {
  if (created) {
    assert.match(temporaryDatabase, /^cf_prd_rehearsal_[a-f0-9]{32}$/);
    assert.notEqual(temporaryDatabase, runtimeDatabase);
    mysql(null, `DROP DATABASE \`${temporaryDatabase}\`;`, false, 120000);
    assert.equal(mysql(null, `SELECT COUNT(*) FROM information_schema.schemata WHERE schema_name='${temporaryDatabase}'`, true), '0');
    console.log('REHEARSAL_DATABASE_REMOVED=true');
  }
  if (runtimeBefore) {
    assert.equal(digest(JSON.stringify(snapshot(runtimeDatabase))), digest(JSON.stringify(runtimeBefore)), 'Runtime schema/menu/role state changed during rehearsal');
    console.log('RUNTIME_SCHEMA_MENU_ROLE_UNCHANGED=true; RUNTIME_WRITES=0; REDIS_WRITES=0; SERVICE_RESTARTS=0');
  }
}
assert.equal(succeeded, true);
console.log('APPROVED_RUNTIME_REHEARSAL=PASS; EXIT_CODE=0');
