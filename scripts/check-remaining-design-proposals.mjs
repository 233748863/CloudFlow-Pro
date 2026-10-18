import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { formalFiles, loadRepository } from './check-batch-h-contracts.mjs';
import { scanSql, statements, targetTable, word } from './check-batch-h-contracts-sql.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const designDirectory = path.join(root, 'docs/design');
const outputDirectory = path.join(root, '.cloudflow-runtime/full-prd-20260915/remaining-design');
const runtimeDatabase = 'cloud_flow_db';
const temporaryDatabase = `cf_design_${randomUUID().replaceAll('-', '')}`;
const proposal = JSON.parse(fs.readFileSync(path.join(designDirectory, 'H-G剩余设计菜单清单.json'), 'utf8'));
const repository = loadRepository();
const read = filename => fs.readFileSync(path.join(designDirectory, filename), 'utf8').replace(/^\uFEFF/, '');
const h1Blocks = [...read('H1-代理与网关设计确认稿.md').matchAll(/^```sql\s*\r?\n([\s\S]*?)^```/gm)].map(match => match[1]);
const definitions = [
  { batch: 'H1', filename: 'H1-代理与网关设计确认稿.md', source: h1Blocks[0], expected: 2 },
  { batch: 'H2', filename: 'H2-人事增强提案DDL.sql', expected: 16 },
  { batch: 'H3', filename: 'H3-客户增强提案DDL.sql', expected: 8 },
  { batch: 'H4', filename: 'H4-会议深化提案DDL.sql', expected: 1 },
  { batch: 'H5', filename: 'H5-平台增强提案DDL.sql', expected: 14 },
  { batch: 'EXTERNAL', filename: '外部接入与可靠投递提案DDL.sql', expected: 10 },
];
const newTables = new Set();
const changedTables = new Set(['wf_parallel_join']);
let temporaryCreated = false;
let runtimeBefore;
let caseCount = 0;

assert.equal(proposal.status, 'PROPOSED_NOT_APPLIED');
assert.equal(h1Blocks.length, 2);
assert.match(h1Blocks[1], /^CREATE TABLE wf_parallel_join\s*\(/);
assert.equal(repository.schemas.size, 323);
assert.deepEqual(repository.counts, [50, 45, 103, 90, 35]);
assert.match(process.env.DB_URL ?? '', /^jdbc:mysql:\/\/192\.168\.1\.173:3306\/cloud_flow_db(?:\?|$)/);
assert.ok(process.env.DB_USERNAME && process.env.DB_PASSWORD, 'Protected database configuration is required');
fs.mkdirSync(outputDirectory, { recursive: true });

function mysql(database, statement, readOnly = false, expectedError = null) {
  if (database === runtimeDatabase) assert.equal(readOnly, true, 'Runtime database is strictly read-only');
  assert.ok(database === null || database === runtimeDatabase || database === temporaryDatabase);
  const cleanStatement = statement.replace(/^\uFEFF/, '');
  const result = spawnSync(process.env.CLOUDFLOW_MYSQL_EXE ?? 'C:\\Program Files\\MySQL\\MySQL Server 8.0\\bin\\mysql.exe', [
    '--no-defaults', '--host=192.168.1.173', '--port=3306', '--protocol=TCP', `--user=${process.env.DB_USERNAME}`,
    '--connect-timeout=10', '--batch', '--raw', '--skip-column-names', '--default-character-set=utf8mb4',
    '--local-infile=0', '--binary-mode', ...(database ? [`--database=${database}`] : []),
  ], {
    input: `SET SESSION information_schema_stats_expiry=0;\n${readOnly ? `START TRANSACTION READ ONLY;\n${cleanStatement};\nCOMMIT;` : cleanStatement}`,
    encoding: 'utf8', timeout: 180000, maxBuffer: 16 * 1024 * 1024, windowsHide: true,
    env: { ...process.env, MYSQL_PWD: process.env.DB_PASSWORD },
  });
  const errorLine = (result.stderr ?? '').split(/\r?\n/).find(line => line.startsWith('ERROR ')) ?? result.error?.code ?? 'UNKNOWN';
  if (expectedError) {
    assert.notEqual(result.status, 0, 'Invalid input must be rejected by MySQL');
    assert.match(errorLine, expectedError);
    return errorLine;
  }
  assert.equal(result.status, 0, `MySQL exit=${result.status}; ${errorLine}`);
  assert.ok(!result.error, result.error?.code);
  return result.stdout.trim();
}

function jsonRows(database, statement) {
  const output = mysql(database, statement, true);
  return output ? output.split(/\r?\n/).map(line => JSON.parse(line)) : [];
}

function sameSet(actualValues, expectedValues, label) {
  const actual = new Set(actualValues);
  const expected = new Set(expectedValues);
  const missing = [...expected].filter(value => !actual.has(value));
  const unexpected = [...actual].filter(value => !expected.has(value));
  console.log(`${label}: expected=${expected.size}; actual=${actual.size}; missing=${missing.length}; unexpected=${unexpected.length}`);
  assert.deepEqual({ missing, unexpected }, { missing: [], unexpected: [] }, label);
}

const quote = value => value == null ? 'NULL' : typeof value === 'number' ? String(value) : `'${String(value).replaceAll('\\', '\\\\').replaceAll("'", "''")}'`;
const identifier = value => {
  assert.match(value, /^[a-z_][a-z0-9_]*$/);
  return `\`${value}\``;
};
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const rangePredicate = Object.values(proposal.ranges).map(([lower, upper]) => `menu_id BETWEEN ${lower} AND ${upper}`).join(' OR ');

function menus(database) {
  return jsonRows(database, "SELECT JSON_OBJECT('id',menu_id,'parent',parent_id,'name',menu_name,'permission',perms,'type',menu_type,'path',path,'component',component,'status',status,'visible',visible) FROM sys_menu ORDER BY menu_id");
}

function grants(database) {
  return jsonRows(database, "SELECT JSON_OBJECT('role',role_id,'menu',menu_id,'tenant',tenant_id) FROM sys_role_menu ORDER BY tenant_id,role_id,menu_id");
}

function runtimeSnapshot() {
  return {
    tables: jsonRows(runtimeDatabase, "SELECT JSON_OBJECT('name',table_name) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_type='BASE TABLE' ORDER BY table_name"),
    columns: jsonRows(runtimeDatabase, "SELECT JSON_OBJECT('table',table_name,'column',column_name,'type',column_type,'nullable',is_nullable,'default',column_default) FROM information_schema.columns WHERE table_schema=DATABASE() ORDER BY table_name,ordinal_position"),
    menus: menus(runtimeDatabase),
    grants: grants(runtimeDatabase),
  };
}

function validateProposal() {
  assert.equal(proposal.menus.length, 109);
  sameSet(proposal.roleSets.SELF, Array.from({ length: 11 }, (unused, index) => index + 1), 'SELF_ROLE_SET');
  const ids = new Set();
  const permissions = new Set();
  for (const menu of proposal.menus) {
    assert.ok(!ids.has(menu.id), `Duplicate menu ID: ${menu.id}`);
    assert.ok(!permissions.has(menu.permission), `Duplicate permission: ${menu.permission}`);
    ids.add(menu.id);
    permissions.add(menu.permission);
    assert.ok(['READ', 'WRITE'].includes(menu.kind));
    assert.match(menu.permission, /^(system|oa|crm|hr|workflow):[a-z0-9:-]+$/);
    const [lower, upper] = proposal.ranges[menu.batch];
    assert.ok(Number.isSafeInteger(menu.id) && menu.id >= lower && menu.id <= upper, `Out-of-range menu: ${menu.id}`);
    const roleIds = proposal.roleSets[menu.roles];
    assert.ok(roleIds.includes(1));
    assert.equal(new Set(roleIds).size, roleIds.length);
    assert.ok(roleIds.every(role => proposal.roleSets.SELF.includes(role)));
    assert.ok(Boolean(menu.parent) !== Boolean(menu.parentPermission));
    if (menu.path) {
      assert.match(menu.path, /^\/[a-z0-9/-]+$/);
      assert.match(menu.component, /^pages\/[A-Za-z0-9/_-]+$/);
    } else assert.equal(menu.component, undefined);
    if (roleIds.includes(5)) assert.ok(menu.scope, `EMPLOYEE scope missing: ${menu.id}`);
  }
  const employeeWrites = proposal.menus.filter(menu => proposal.roleSets[menu.roles].includes(5) && menu.kind === 'WRITE');
  const independentlyReviewed = [1789, 1790, 1851, 1852, 1853, 1854, 1872, 1873, 1880, 1889, 1952, 1953, 1954, 1955, 1958, 1979, 1980, 1982, 1983, 1984, 1989, 1991];
  sameSet(employeeWrites.map(menu => menu.id), independentlyReviewed, 'EMPLOYEE_PROPOSED_WRITE_IDS');
  sameSet(proposal.employeeNewWriteIds, independentlyReviewed, 'EMPLOYEE_DECLARED_WRITE_IDS');
  assert.ok(employeeWrites.every(menu => /^(OWN_|SELF_|CURRENT_)/.test(menu.scope)));
  for (const [batch, [lower, upper]] of Object.entries(proposal.ranges)) {
    const selected = proposal.menus.filter(menu => menu.batch === batch);
    console.log(`MENU_RANGE ${batch}: reserved=${lower}-${upper}; actual=${selected.length}; ids=${selected.map(menu => menu.id).join(',')}`);
  }
  console.log('MENU_OUT_OF_RANGE=0; DUPLICATE_MENU_IDS=0; DUPLICATE_PERMISSIONS=0; INVALID_PERMISSION_PREFIXES=0');
  for (const definition of definitions) {
    definition.source ??= read(definition.filename);
    const parsed = statements(scanSql(definition.source, definition.filename));
    const creates = parsed.filter(tokens => word(tokens[0]) === 'CREATE' && word(tokens[1]) === 'TABLE');
    assert.equal(creates.length, definition.expected, definition.filename);
    for (const tokens of parsed) {
      const operation = word(tokens[0]);
      assert.ok(['CREATE', 'ALTER'].includes(operation));
      const table = targetTable(tokens);
      if (operation === 'CREATE') {
        assert.ok(!repository.schemas.has(table) && !newTables.has(table), `Duplicate/new-table mismatch: ${table}`);
        newTables.add(table);
      } else {
        assert.ok(repository.schemas.has(table), `Unknown altered table: ${table}`);
        changedTables.add(table);
      }
    }
    console.log(`PROPOSED_DDL ${definition.batch}: new_tables=${creates.length}; file=${definition.filename}`);
  }
  assert.equal(newTables.size, 51);
}

function checkConflicts(database, label) {
  const conflicts = jsonRows(database, `SELECT JSON_OBJECT('id',menu_id,'permission',perms) FROM sys_menu WHERE ${rangePredicate} ORDER BY menu_id`);
  console.log(`${label}_CONFLICT_SQL: SELECT menu_id,menu_name,perms FROM sys_menu WHERE ${rangePredicate};`);
  console.log(`${label}_PREINSERT_CONFLICT_ROWS=${conflicts.length}`);
  assert.deepEqual(conflicts, []);
  const proposedPermissions = new Set(proposal.menus.map(menu => menu.permission));
  assert.ok(menus(database).every(menu => !proposedPermissions.has(menu.permission)), `${label}: permission already exists`);
}

function applyDefinitions() {
  let expectedTables = 0;
  for (const [index, filename] of formalFiles.entries()) {
    let source = repository.sources.get(`cloudflow-backend/DB/${filename}`);
    assert.ok(!/DROP\s+DATABASE/i.test(source));
    if (filename.startsWith('02.')) {
      const matching = repository.scans.get(filename).statements.filter(tokens => word(tokens[0]) === 'CREATE' && word(tokens[1]) === 'TABLE' && targetTable(tokens) === 'wf_parallel_join');
      assert.equal(matching.length, 1);
      const tokens = matching[0];
      source = source.slice(0, tokens[0].start) + h1Blocks[1].trim().replace(/;$/, '') + source.slice(tokens.at(-1).end);
    }
    source = source.replace(/\bcloud_flow_db\b/gi, temporaryDatabase);
    assert.ok(!/cloud_flow_db/i.test(source));
    mysql(temporaryDatabase, source);
    expectedTables += repository.counts[index];
    assert.equal(Number(mysql(temporaryDatabase, "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_type='BASE TABLE'", true)), expectedTables);
    console.log(`IMPORT ${filename}: mysql_exit=0; tables=${expectedTables}; proposed_join_replacement=${index === 1}`);
  }
  for (const definition of definitions) {
    assert.ok(!/\b(?:USE|DATABASE|GRANT|OUTFILE|DUMPFILE)\b/i.test(definition.source));
    mysql(temporaryDatabase, definition.source);
    expectedTables += definition.expected;
    assert.equal(Number(mysql(temporaryDatabase, "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_type='BASE TABLE'", true)), expectedTables);
    console.log(`APPLY_PROPOSAL ${definition.batch}: mysql_exit=0; tables=${expectedTables}`);
  }
  const seed = repository.sources.get('cloudflow-backend/DB/06.cloudflow-business-seed.sql').replace(/\bcloud_flow_db\b/gi, temporaryDatabase);
  assert.ok(!/cloud_flow_db|DROP\s+DATABASE/i.test(seed));
  mysql(temporaryDatabase, seed);
  console.log('IMPORT 06.cloudflow-business-seed.sql: mysql_exit=0');
}

function verifySchema() {
  const actualTables = jsonRows(temporaryDatabase, "SELECT JSON_OBJECT('name',table_name,'engine',engine,'collation',table_collation,'comment',table_comment,'next',auto_increment) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_type='BASE TABLE' ORDER BY table_name");
  sameSet(actualTables.map(table => table.name), [...repository.schemas.keys(), ...newTables], 'PROPOSED_TABLE_SET');
  assert.equal(actualTables.length, 374);
  const modules = [[], [], [], [], []];
  for (const table of actualTables) {
    const origin = formalFiles.findIndex(filename => repository.scans.get(filename).statements.some(tokens => word(tokens[0]) === 'CREATE' && word(tokens[1]) === 'TABLE' && targetTable(tokens) === table.name));
    const module = origin >= 0 ? origin : table.name.startsWith('sys_') ? 0 : table.name.startsWith('wf_') ? 1 : table.name.startsWith('hr_') ? 2 : table.name.startsWith('oa_') ? 3 : 4;
    modules[module].push(table.name);
    if (newTables.has(table.name)) {
      assert.equal(table.engine, 'InnoDB');
      assert.match(table.collation, /^utf8mb4_/);
      assert.ok(table.comment);
      if (!table.name.startsWith('wf_')) {
        const actualDefinition = mysql(temporaryDatabase, `SHOW CREATE TABLE ${identifier(table.name)}`, true);
        const actualStart = Number(/AUTO_INCREMENT=(\d+)/.exec(actualDefinition)?.[1]);
        if (table.next !== actualStart) console.log(`AUTO_INCREMENT_METADATA ${table.name}: information_schema=${table.next}; show_create=${actualStart}`);
        assert.equal(actualStart, 100, `${table.name} actual AUTO_INCREMENT must start at 100`);
      }
    }
  }
  assert.deepEqual(modules.map(tables => tables.length), [72, 47, 119, 91, 45]);
  console.log('PROPOSED_MODULE_TABLES=72,47,119,91,45; TOTAL=374; BASELINE=323; NEW_TABLES=51');
  const columnRows = jsonRows(temporaryDatabase, "SELECT JSON_OBJECT('table',table_name,'name',column_name,'type',data_type,'length',character_maximum_length,'nullable',is_nullable,'default',column_default,'extra',extra,'comment',column_comment,'key',column_key) FROM information_schema.columns WHERE table_schema=DATABASE() ORDER BY table_name,ordinal_position");
  const proposedColumns = columnRows.filter(column => newTables.has(column.table) || (changedTables.has(column.table) && (!repository.schemas.get(column.table).columns.has(column.name) || column.table === 'wf_parallel_join')));
  assert.ok(proposedColumns.every(column => column.comment?.trim()));
  for (const table of newTables) {
    const columns = columnRows.filter(column => column.table === table);
    assert.ok(columns.some(column => column.name === 'tenant_id' && column.nullable === 'NO'));
    assert.equal(columns.filter(column => column.key === 'PRI').length, 1);
    assert.ok(columns.some(column => column.name === 'create_time'));
    if (table.startsWith('wf_')) {
      assert.ok(columns.some(column => column.key === 'PRI' && column.type === 'varchar' && column.length === 64));
      assert.ok(columns.every(column => column.name !== 'deleted'));
    } else assert.ok(columns.some(column => column.key === 'PRI' && column.type === 'bigint' && column.extra.includes('auto_increment')));
  }
  const foreignKeys = jsonRows(temporaryDatabase, "SELECT JSON_OBJECT('table',table_name,'name',constraint_name) FROM information_schema.table_constraints WHERE constraint_schema=DATABASE() AND constraint_type='FOREIGN KEY'").filter(constraint => newTables.has(constraint.table));
  assert.deepEqual(foreignKeys, []);
  const checks = jsonRows(temporaryDatabase, "SELECT JSON_OBJECT('table',table_name,'name',constraint_name,'enforced',enforced) FROM information_schema.table_constraints WHERE constraint_schema=DATABASE() AND constraint_type='CHECK'").filter(constraint => newTables.has(constraint.table) || changedTables.has(constraint.table));
  assert.ok(checks.every(constraint => constraint.enforced === 'YES'));
  console.log(`SCHEMA_RULES: new_and_replaced_columns=${proposedColumns.length}; missing_comments=0; missing_tenant=0; wrong_primary_keys=0; foreign_keys=0; enforced_checks=${checks.length}`);
  fs.writeFileSync(path.join(outputDirectory, 'proposed-schema.json'), JSON.stringify({ tables: actualTables, columns: columnRows, checks }, null, 2));
  return columnRows;
}

function applyAndVerifyMenus() {
  const baselineMenus = menus(temporaryDatabase);
  const baselineGrants = grants(temporaryDatabase);
  const roles = jsonRows(temporaryDatabase, "SELECT JSON_OBJECT('id',role_id,'key',role_key,'tenant',tenant_id,'status',status,'deleted',deleted) FROM sys_role ORDER BY role_id");
  assert.equal(roles.length, 11);
  assert.ok(roles.every(role => role.status === '0' && role.deleted === 0 && role.tenant === 100000));
  assert.equal(roles.find(role => role.id === 5).key, 'employee');
  const employeeBefore = baselineGrants.filter(grant => grant.role === 5);
  assert.equal(employeeBefore.length, proposal.baselineEmployeeGrantCount);
  sameSet(runtimeBefore.grants.filter(grant => grant.role === 5).map(grant => `${grant.tenant}:${grant.menu}`), employeeBefore.map(grant => `${grant.tenant}:${grant.menu}`), 'RUNTIME_EMPLOYEE_BASELINE');
  const allMenuMap = new Map(baselineMenus.map(menu => [menu.id, menu]));
  const statementsToApply = [];
  const pairs = [];
  for (const menu of proposal.menus) {
    const matches = menu.parentPermission ? baselineMenus.filter(parent => parent.permission === menu.parentPermission) : [];
    if (menu.parentPermission) assert.equal(matches.length, 1, `Parent permission ${menu.parentPermission}`);
    const parent = menu.parent ?? matches[0].id;
    allMenuMap.set(menu.id, { ...menu, parent });
    const columns = ['menu_id','menu_name','parent_id','order_num','path','component','query','is_frame','is_cache','menu_type','visible','status','version','perms','icon','create_by','create_time','update_by','update_time','remark'];
    const values = [menu.id, menu.name, parent, menu.id, menu.path ?? '', menu.component ?? null, null, 1, 0, menu.path ? 'C' : 'F', '0', '0', 0, menu.permission, '#', 'design-proposal', null, 'design-proposal', null, `PROPOSED:${menu.batch}:${menu.kind}:${menu.scope ?? menu.roles}`];
    const expressions = values.map((value, index) => [16, 18].includes(index) ? 'CURRENT_TIMESTAMP' : quote(value));
    statementsToApply.push(`INSERT INTO sys_menu (${columns.map(identifier).join(',')}) VALUES (${expressions.join(',')});`);
    for (const role of proposal.roleSets[menu.roles]) pairs.push({ role, menu: menu.id, tenant: 100000 });
  }
  const grantKeys = new Set([...baselineGrants, ...pairs].map(grant => `${grant.tenant}:${grant.role}:${grant.menu}`));
  for (const menu of proposal.menus) {
    const visited = new Set([menu.id]);
    let parent = allMenuMap.get(menu.id).parent;
    while (parent !== 0) {
      assert.ok(!visited.has(parent), `Menu ancestry cycle: ${menu.id}`);
      visited.add(parent);
      const ancestor = allMenuMap.get(parent);
      assert.ok(ancestor, `Missing parent ${parent} for ${menu.id}`);
      for (const role of proposal.roleSets[menu.roles]) assert.ok(grantKeys.has(`100000:${role}:${parent}`), `Role ${role} missing ancestor ${parent} of ${menu.id}`);
      parent = ancestor.parent;
    }
  }
  const seed = ['START TRANSACTION;', ...statementsToApply, ...pairs.map(grant => `INSERT INTO sys_role_menu (role_id,menu_id,tenant_id) VALUES (${grant.role},${grant.menu},${grant.tenant});`), 'COMMIT;', ''].join('\n');
  fs.writeFileSync(path.join(outputDirectory, 'H-G剩余设计菜单提案.sql'), seed);
  mysql(temporaryDatabase, seed);
  const afterMenus = menus(temporaryDatabase);
  const actualNew = afterMenus.filter(menu => proposal.menus.some(candidate => candidate.id === menu.id));
  assert.equal(actualNew.length, proposal.menus.length);
  for (const actual of actualNew) {
    const expected = allMenuMap.get(actual.id);
    assert.deepEqual(actual, { id: expected.id, parent: expected.parent, name: expected.name, permission: expected.permission, type: expected.path ? 'C' : 'F', path: expected.path ?? '', component: expected.component ?? null, status: '0', visible: '0' });
  }
  const afterGrants = grants(temporaryDatabase);
  assert.equal(afterGrants.length, baselineGrants.length + pairs.length);
  sameSet(afterGrants.map(grant => `${grant.tenant}:${grant.role}:${grant.menu}`), grantKeys, 'PROPOSED_ALL_ROLE_PAIRS');
  const employeeAfter = afterGrants.filter(grant => grant.role === 5);
  const employeeNew = proposal.menus.filter(menu => proposal.roleSets[menu.roles].includes(5));
  assert.equal(employeeAfter.length, 214);
  sameSet(employeeAfter.map(grant => `${grant.tenant}:${grant.menu}`), [...employeeBefore.map(grant => `${grant.tenant}:${grant.menu}`), ...employeeNew.map(menu => `100000:${menu.id}`)], 'PROPOSED_EMPLOYEE_ALL_GRANTS');
  const forbidden = new Set([936, 937, 938, 939]);
  assert.ok(employeeAfter.every(grant => !forbidden.has(grant.menu) && !allMenuMap.get(grant.menu)?.permission?.includes('*')));
  console.log(`PROPOSED_MENU_IMPORT: mysql_exit=0; menus=${actualNew.length}; role_pairs=${pairs.length}; missing_ancestors=0`);
  console.log(`EMPLOYEE: baseline=${employeeBefore.length}; proposed_new=${employeeNew.length}; proposed_total=${employeeAfter.length}; proposed_writes=${proposal.employeeNewWriteIds.length}; unexpected_grants=0; unexpected_new_writes=0; runtime_new_grants=0`);
  for (const menu of employeeNew.filter(menu => menu.kind === 'WRITE')) console.log(`EMPLOYEE_ALLOWED_WRITE ${menu.id}\t${menu.permission}\t${menu.scope}`);
  fs.writeFileSync(path.join(outputDirectory, 'proposed-menu-role-results.json'), JSON.stringify({ menus: actualNew, roles, pairs, employeeBefore, employeeAfter }, null, 2));
}

function verifyDatabaseConstraints(columnRows) {
  function insert(table, supplied) {
    const values = { ...supplied };
    for (const column of columnRows.filter(column => column.table === table)) {
      if (Object.hasOwn(values, column.name) || column.default != null || column.nullable === 'YES' || /auto_increment|GENERATED/.test(column.extra)) continue;
      if (column.name === 'tenant_id') values[column.name] = 100000;
      else if (column.type === 'json') values[column.name] = '{}';
      else if (['datetime','timestamp'].includes(column.type)) values[column.name] = '2026-09-15 10:00:00';
      else if (column.type === 'date') values[column.name] = '2026-09-15';
      else if (column.type === 'time') values[column.name] = '10:00:00';
      else if (['bigint','int','tinyint','smallint','decimal','double'].includes(column.type)) values[column.name] = 100;
      else values[column.name] = `probe_${column.name}`.slice(0, column.length ?? 64);
    }
    return `INSERT INTO ${identifier(table)} (${Object.keys(values).map(identifier).join(',')}) VALUES (${Object.values(values).map(quote).join(',')});`;
  }
  function check(label, table, valid, invalid, constraint) {
    mysql(temporaryDatabase, `START TRANSACTION; ${insert(table, valid)} ROLLBACK;`);
    const output = mysql(temporaryDatabase, `START TRANSACTION; ${insert(table, { ...valid, ...invalid })} ROLLBACK;`, false, new RegExp(`ERROR 3819 .*${constraint}`));
    caseCount += 2;
    console.log(`CONSTRAINT ${label}: positive=PASS; negative=${output}`);
  }
  function unique(label, table, first, duplicate, distinct, index) {
    mysql(temporaryDatabase, `START TRANSACTION; ${insert(table, first)} ${insert(table, { ...first, ...distinct })} ROLLBACK;`);
    const output = mysql(temporaryDatabase, `START TRANSACTION; ${insert(table, first)} ${insert(table, { ...first, ...duplicate })} ROLLBACK;`, false, new RegExp(`ERROR 1062 .*${index}`));
    caseCount += 2;
    console.log(`UNIQUE ${label}: separate_scope=PASS; duplicate=${output}`);
  }
  const agent = { setting_id: 'probe-agent', principal_user_id: 10, agent_user_id: 11, agent_mode: 'AGENT', start_time: '2026-09-15 10:00:00', end_time: '2026-09-15 11:00:00' };
  check('agent_window', 'wf_agent_setting', agent, { end_time: agent.start_time }, 'chk_agent_window');
  check('agent_identity', 'wf_agent_setting', agent, { agent_user_id: 10 }, 'chk_agent_distinct');
  check('agent_mode', 'wf_agent_setting', agent, { agent_mode: 'INVALID' }, 'chk_agent_mode');
  check('gateway_expected', 'wf_gateway_activation', { join_type: 'INCLUSIVE', activated_branches: '["branch-a"]', expected_count: 1 }, { expected_count: 0 }, 'chk_activation_expected');
  unique('gateway_round', 'wf_parallel_join', { activation_id: 'round-a', branch_key: 'branch-a', join_type: 'INCLUSIVE', expected_count: 1 }, {}, { activation_id: 'round-b' }, 'uk_join_arrival');
  const skill = { employee_id: 10, skill_id: 11, current_level: 3, evidence_type: 'SELF', evidence_key: 'proof-a', assessment_status: 'APPROVED', current_flag: 1 };
  check('skill_level', 'hr_employee_skill', skill, { current_level: 6 }, 'chk_employee_skill_level');
  check('skill_pending_not_current', 'hr_employee_skill', skill, { assessment_status: 'PENDING' }, 'chk_employee_skill_current');
  unique('skill_current', 'hr_employee_skill', skill, { evidence_key: 'proof-b' }, { evidence_key: 'proof-b', current_flag: 0 }, 'uk_employee_skill_current');
  check('repayment_sign', 'hr_advance_repayment', { repay_amount: 1, repay_type: 'MANUAL' }, { repay_amount: -1 }, 'chk_repayment_sign');
  check('repayment_reversal_sign', 'hr_advance_repayment', { repay_amount: -1, repay_type: 'MANUAL', reversal_of_id: 100 }, { repay_amount: 1 }, 'chk_repayment_sign');
  const team = { biz_type: 'OPPORTUNITY', biz_id: 10, team_version: 1, sales_user_id: 11, role_type: 'OWNER', allocated_percentage: 1 };
  check('opportunity_percentage', 'crm_opportunity', { opportunity_id: 991001, stage: 'LEAD', win_rate: 65 }, { win_rate: 100.01 }, 'chk_opportunity_win_rate_percentage');
  assert.equal(mysql(temporaryDatabase, 'SELECT CAST(ROUND(420000.00 * 65.00 / 100,2) AS DECIMAL(14,2))', true), '273000.00');
  caseCount += 1;
  console.log('OPPORTUNITY_WEIGHTED_AMOUNT: source_percent=65.00; expected_amount=420000.00; weighted_amount=273000.00; result=PASS');
  check('team_percentage', 'crm_deal_team', team, { allocated_percentage: 1.0001 }, 'chk_deal_team_rates');
  unique('team_current', 'crm_deal_team', team, { team_version: 2 }, { team_version: 2, current_flag: 0 }, 'uk_deal_team_current');
  check('report_tenant_mandatory', 'sys_report_dataset', {}, { tenant_isolated_flag: 0 }, 'chk_dataset_tenant');
  check('report_limit', 'sys_report_chart', { chart_type: 'BAR' }, { limit_rows: 2001 }, 'chk_report_rows');
  check('dashboard_bounds', 'sys_report_dashboard_item', { grid_x: 0, grid_y: 0, grid_w: 12, grid_h: 1 }, { grid_x: 1 }, 'chk_report_grid');
  check('datasource_pool_bound', 'sys_data_source_config', { init_size: 0, max_active: 5 }, { max_active: 21 }, 'chk_data_source_pool');
  check('oauth_public_secret', 'sys_oauth2_client', { client_type: 'PUBLIC' }, { client_secret_encrypted: 'probe-encrypted-only' }, 'chk_oauth_client_secret');
  check('oauth_access_ttl', 'sys_oauth2_client', { client_type: 'PUBLIC' }, { access_token_validity_seconds: 3601 }, 'chk_oauth_client_ttl');
  check('meeting_response', 'oa_meeting_attendance', { user_id: 991001, schedule_event_id: 991001 }, { acceptance_status: 'SIGN_IN' }, 'chk_meeting_acceptance');
  const receiver = { mass_email_id: 991001, campaign_id: 991001, crm_email_id: null, target_type: 'TEST', email_hash: 'a'.repeat(64), email_encrypted: 'probe-ciphertext', email_mask: 'p***@example.invalid', open_token_hash: 'b'.repeat(64), unsubscribe_token_hash: 'c'.repeat(64) };
  check('mail_source_exclusive', 'crm_mass_email_recipient', receiver, { crm_email_id: 991001 }, 'chk_mail_recipient_source');
  unique('mail_receiver', 'crm_mass_email_recipient', receiver, { open_token_hash: 'd'.repeat(64), unsubscribe_token_hash: 'e'.repeat(64) }, { mass_email_id: 991002, open_token_hash: 'd'.repeat(64), unsubscribe_token_hash: 'e'.repeat(64) }, 'uk_mass_email_recipient');
  unique('external_delivery_receiver', 'sys_message_delivery', { record_id: 991001, outbox_event_id: 'event-a', channel_type: 'EMAIL', receiver_key: 'a'.repeat(64), payload_hash: 'b'.repeat(64) }, { record_id: 991002 }, { record_id: 991002, receiver_key: 'c'.repeat(64) }, 'uk_message_delivery_receiver');
  console.log(`DATABASE_CONSTRAINT_ASSERTIONS=${caseCount}; ALL_PASSED=true; SERVICE_AUTHORIZATION_TESTS=NOT_EXECUTED_DESIGN_ONLY`);
}

try {
  console.log(`MODE=PROPOSAL_VALIDATION_ONLY; BUSINESS_CODE_CHANGED=false; RUNTIME_DDL_DML_ALLOWED=false; UTC=${new Date().toISOString()}`);
  validateProposal();
  console.log(`MYSQL_SERVER_VERSION=${mysql(runtimeDatabase, 'SELECT VERSION()', true)}`);
  runtimeBefore = runtimeSnapshot();
  assert.equal(runtimeBefore.tables.length, 323);
  checkConflicts(runtimeDatabase, 'RUNTIME');
  assert.match(temporaryDatabase, /^cf_design_[a-f0-9]{32}$/);
  assert.notEqual(temporaryDatabase, runtimeDatabase);
  assert.equal(mysql(null, `SELECT COUNT(*) FROM information_schema.schemata WHERE schema_name=${quote(temporaryDatabase)}`, true), '0');
  mysql(null, `CREATE DATABASE ${identifier(temporaryDatabase)} CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;`);
  temporaryCreated = true;
  console.log(`TEMPORARY_DATABASE=${temporaryDatabase}; OWNED_NEW_EMPTY_DATABASE=true`);
  applyDefinitions();
  const columns = verifySchema();
  checkConflicts(temporaryDatabase, 'EMPTY_DATABASE');
  applyAndVerifyMenus();
  verifyDatabaseConstraints(columns);
  console.log('PROPOSAL_CHECK_RESULT=PASS; USER_APPROVAL=STILL_REQUIRED; IMPLEMENTATION_COMPLETE=false');
} finally {
  if (temporaryCreated) {
    assert.match(temporaryDatabase, /^cf_design_[a-f0-9]{32}$/);
    assert.notEqual(temporaryDatabase, runtimeDatabase);
    mysql(null, `DROP DATABASE ${identifier(temporaryDatabase)};`);
    assert.equal(mysql(null, `SELECT COUNT(*) FROM information_schema.schemata WHERE schema_name=${quote(temporaryDatabase)}`, true), '0');
    console.log('TEMPORARY_DATABASE_REMOVED=true');
  }
  if (runtimeBefore) {
    const after = runtimeSnapshot();
    assert.equal(hash(after), hash(runtimeBefore), 'Runtime schema/menu/grants changed during proposal validation');
    console.log(`RUNTIME_BEFORE_AFTER_SHA256=${hash(after)}; RUNTIME_SCHEMA_MENU_ROLE_UNCHANGED=true; RUNTIME_WRITES=0`);
  }
}
console.log('EXIT_CODE=0');
