import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, realpathSync, lstatSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
assert.ok(process.argv.length >= 3 && process.argv.length <= 5 && process.argv.slice(3).every(value => ['--apply', '--management'].includes(value)));
assert.equal(new Set(process.argv.slice(3)).size, process.argv.slice(3).length);
const management = process.argv.includes('--management');
const identifiers = management ? [1786, 1787] : [1788, 1789, 1790];
const selectedIds = identifiers.join(',');
const guardName = management ? 'g4_im_management_guard' : 'g4_im_self_guard';
assert.notEqual(path.parse(root).root.toLowerCase(), `${process.env.SystemDrive}\\`.toLowerCase());
const statePath = realpathSync(process.argv[2]);
const directory = path.dirname(statePath);
assert.equal(path.basename(statePath), 'state.json');
assert.equal(path.dirname(directory), realpathSync(path.join(root, '.cloudflow-runtime/batch-g-integration')));
assert.match(path.basename(directory), /^[a-f0-9]{32}$/);
for (const candidate of [root, directory, statePath, path.join(directory, 'mysql-data')]) assert.equal(lstatSync(candidate).isSymbolicLink(), false);
const state = JSON.parse(readFileSync(statePath, 'utf8').replace(/^\uFEFF/, ''));
assert.equal(state.status, 'RUNNING');
assert.equal(realpathSync(state.run), directory);
assert.ok(Number.isInteger(state.mysqlPort) && state.mysqlPort > 1024 && state.mysqlPort < 65536);
const owned = state.processes.filter(entry => entry.name === 'mysql');
assert.equal(owned.length, 1);
assert.equal(realpathSync(owned[0].marker), realpathSync(path.join(directory, 'mysql-data')));
process.kill(owned[0].id, 0);
const environment = { ...process.env };
delete environment.MYSQL_PWD;
function database(statement, readOnly = true) {
  const result = spawnSync('mysql.exe', ['--no-defaults', '--protocol=TCP', '--host=127.0.0.1', `--port=${state.mysqlPort}`, '--user=root',
    '--batch', '--raw', '--skip-column-names', '--default-character-set=utf8mb4', 'cloud_flow_db'], {
    input: `SET SESSION group_concat_max_len=16777216;\n${readOnly ? `START TRANSACTION READ ONLY;\n${statement}\nCOMMIT;` : statement}`,
    env: environment, encoding: 'utf8', timeout: 60000, maxBuffer: 20 * 1024 * 1024, windowsHide: true,
  });
  assert.equal(result.status, 0, result.error?.message || result.stderr);
  return result.stdout.trim();
}
assert.equal(realpathSync(database('SELECT @@datadir;')), realpathSync(owned[0].marker));
const design = JSON.parse(readFileSync(path.join(root, 'docs/design/H-G剩余设计菜单清单.json'), 'utf8').replace(/^\uFEFF/, ''));
const approved = design.menus.filter(menu => identifiers.includes(menu.id));
assert.equal(approved.length, identifiers.length);
assert.deepEqual(design.roleSets.SELF, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
const formal = readFileSync(path.join(root, 'cloudflow-backend/DB/06.cloudflow-business-seed.sql'), 'utf8');
const start = formal.indexOf(`CREATE TEMPORARY TABLE ${guardName} `);
const end = formal.indexOf(`DROP TEMPORARY TABLE ${guardName};`, start);
assert.ok(start >= 0 && end > start);
const sql = formal.slice(start, end + `DROP TEMPORARY TABLE ${guardName};`.length);
for (const menu of approved) assert.ok(sql.includes(`(${menu.id}, '${menu.name}'`) && sql.includes(`'${menu.permission}'`));
const pending = database(`SELECT COUNT(*) FROM sys_menu WHERE menu_id IN (${selectedIds}) OR perms IN (${approved.map(menu => `'${menu.permission}'`).join(',')});`) === '0';
const exact = () => {
  const menus = JSON.parse(database(`SELECT JSON_ARRAYAGG(JSON_OBJECT('id',menu_id,'parent',parent_id,'name',menu_name,'permission',perms,'path',path,'component',component,'type',menu_type,'visible',visible,'status',status)) FROM sys_menu WHERE menu_id IN (${selectedIds});`));
  assert.deepEqual(menus.sort((left, right) => left.id - right.id), approved.map(menu => ({ id: menu.id, parent: menu.parent, name: menu.name, permission: menu.permission,
    path: menu.path ?? '', component: menu.component ?? null, type: menu.path ? 'C' : 'F', visible: menu.path ? '0' : '1', status: '0' })));
  const pairs = database(`SELECT CONCAT(role_id,':',menu_id,':',tenant_id) FROM sys_role_menu WHERE menu_id IN (${selectedIds}) ORDER BY role_id,menu_id;`).split(/\r?\n/);
  assert.deepEqual(pairs, (management ? design.roleSets.PLATFORM : design.roleSets.SELF).flatMap(role => approved.map(menu => `${role}:${menu.id}:100000`)));
};
if (!pending) exact();
console.log(`G4_IM_${management ? 'MANAGEMENT' : 'SELF'}_PREFLIGHT: ids=${selectedIds}; reserved=1780-1799; pending=${pending}; candidate_conflicts=0; expected_pairs=${management ? 2 : 33}; production_modified=false`);
if (process.argv.includes('--apply') && pending) {
  const digests = [];
  for (const [table, order] of [['sys_menu', 'menu_id'], ['sys_role_menu', 'tenant_id,role_id,menu_id']]) {
    const columns = database(`SELECT column_name FROM information_schema.columns WHERE table_schema='cloud_flow_db' AND table_name='${table}' ORDER BY ordinal_position;`).split(/\r?\n/);
    assert.ok(columns.every(column => /^[a-z_]+$/.test(column)));
    const query = `SELECT SHA2(GROUP_CONCAT(SHA2(CAST(JSON_ARRAY(${columns.map(column => `\`${column}\``).join(',')}) AS CHAR),256) ORDER BY ${order} SEPARATOR ''),256) FROM ${table} WHERE menu_id NOT IN (${selectedIds});`;
    const before = database(query); assert.match(before, /^[a-f0-9]{64}$/); digests.push({ query, before });
  }
  const guards = digests.map(({ query, before }) => `INSERT INTO ${guardName} SELECT (${query.slice(0, -1)}) = '${before}';`).join('\n');
  database(`START TRANSACTION;\n${sql.replace(`DROP TEMPORARY TABLE ${guardName};`, `${guards}\nDROP TEMPORARY TABLE ${guardName};`)}\nCOMMIT;`, false);
  exact();
  for (const { query, before } of digests) assert.equal(database(query), before);
  console.log(`G4_IM_${management ? 'MANAGEMENT' : 'SELF'}_APPLIED: menus=${identifiers.length}; role_pairs=${management ? 2 : 33}; employee_write_grants=${management ? 0 : 2}; unrelated_menus_unchanged=true; unrelated_grants_unchanged=true; production_modified=false`);
}
