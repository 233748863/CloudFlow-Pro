import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const root = 'D:\\CloudFlowPro';
const round = process.argv.find(value => value.startsWith('--round='))?.slice(8) ?? 'r1';
assert.match(round, /^r[1-9][0-9]*$/);
const run = path.join(root, '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7');
const state = JSON.parse(fs.readFileSync(path.join(run, 'state.json'), 'utf8').replace(/^\uFEFF/, ''));
assert.equal(state.status, 'RUNNING'); assert.equal(fs.realpathSync(state.run), fs.realpathSync(run));
const env = { ...process.env }; delete env.MYSQL_PWD;
const database = statement => {
  const result = spawnSync('mysql.exe', ['--no-defaults', '--protocol=TCP', '--host=127.0.0.1', `--port=${state.mysqlPort}`,
    '--user=root', '--batch', '--raw', '--skip-column-names', '--default-character-set=utf8mb4', 'cloud_flow_db'],
    { input: statement, encoding: 'utf8', env, windowsHide: true, timeout: 300000, maxBuffer: 8 * 1024 * 1024 });
  assert.equal(result.status, 0, result.stderr.slice(0, 1500) || 'Owned certificate permission SQL failed'); return result.stdout.trim();
};
const assertOwned = () => assert.equal(fs.realpathSync(database('SELECT @@datadir;')), fs.realpathSync(path.join(run, 'mysql-data')));
assertOwned();
const files = fs.readdirSync(path.join(root, 'cloudflow-backend/DB')).filter(name => /^0[1-7]\./.test(name)).sort();
assert.equal(files.length, 7);
const inputs = files.map(name => ({ name, bytes: fs.readFileSync(path.join(root, 'cloudflow-backend/DB', name)) }));
const seed = inputs.find(input => input.name.startsWith('06.')).bytes.toString('utf8');
const block = seed.match(/INSERT IGNORE INTO cloud_flow_db\.sys_role_menu \(role_id, menu_id, tenant_id\)\r?\nSELECT rm\.role_id, child\.menu_id, rm\.tenant_id\r?\nFROM cloud_flow_db\.sys_role_menu rm\r?\nJOIN cloud_flow_db\.sys_menu child ON child\.parent_id = 730 AND child\.menu_id IN \(1015, 1016\)\r?\nWHERE rm\.tenant_id = 100000 AND rm\.menu_id = 730;/)?.[0];
assert.ok(block, 'Explicit existing certificate permission seed required');
const before = database('SELECT tenant_id,role_id,menu_id FROM sys_role_menu ORDER BY tenant_id,role_id,menu_id;');
const menuBefore = database('SELECT * FROM sys_menu ORDER BY menu_id;');
assert.equal(database("SELECT GROUP_CONCAT(CONCAT(menu_id,':',perms,':',parent_id) ORDER BY menu_id) FROM sys_menu WHERE menu_id IN(1015,1016);"), '1015:hr:ess:cert:view:730,1016:hr:ess:cert:cancel:730');
assert.equal(database('SELECT GROUP_CONCAT(role_id ORDER BY role_id) FROM sys_role_menu WHERE tenant_id=100000 AND menu_id=730;'), '1,4,5');
const scratch = `h5_certificate_${randomUUID().replaceAll('-', '')}`;
assert.equal(database(`SELECT COUNT(*) FROM information_schema.schemata WHERE schema_name='${scratch}';`), '0');
try {
  for (const input of inputs) {
    const source = input.bytes.toString('utf8').replace(/^\uFEFF/, '').replace(/\bcloud_flow_db\b/g, scratch);
    database(`${input.name.startsWith('01.') ? '' : `USE ${scratch};\n`}${source}`);
    console.log(`EMPLOYEE_CERTIFICATE_EMPTY_SCRIPT: file=${input.name}; exit=0`);
  }
  assert.equal(database(`SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='${scratch}' AND table_type='BASE TABLE';`), '374');
  const certificateGrants = database(`SELECT GROUP_CONCAT(CONCAT(role_id,':',menu_id) ORDER BY role_id,menu_id) FROM ${scratch}.sys_role_menu WHERE tenant_id=100000 AND menu_id IN(1015,1016);`);
  assert.equal(certificateGrants, '1:1015,1:1016,4:1015,4:1016,5:1015,5:1016');
  const employeeMenus = database(`SELECT menu_id FROM ${scratch}.sys_role_menu WHERE tenant_id=100000 AND role_id=5 ORDER BY menu_id;`);
  assert.equal(employeeMenus.split(/\r?\n/).length, 217);
  const existingEmployee = database('SELECT menu_id FROM sys_role_menu WHERE tenant_id=100000 AND role_id=5 ORDER BY menu_id;');
  assert.equal(employeeMenus.split(/\r?\n/).filter(id => !['1015','1016'].includes(id)).join('\n'), existingEmployee.replaceAll('\r\n', '\n'));
  console.log('EMPLOYEE_CERTIFICATE_PERMISSION_PREFLIGHT: tables=374; existing_menus=2; expected_new_grants=4; employee_before=215; employee_after=217; unexpected_employee_grants=0');
  if (process.argv.includes('--apply')) {
    assertOwned(); assert.equal(database('SELECT tenant_id,role_id,menu_id FROM sys_role_menu ORDER BY tenant_id,role_id,menu_id;'), before);
    database(`START TRANSACTION;\n${block}\nCOMMIT;`);
    const after = database('SELECT tenant_id,role_id,menu_id FROM sys_role_menu ORDER BY tenant_id,role_id,menu_id;').split(/\r?\n/);
    const expected = ['100000\t4\t1015','100000\t4\t1016','100000\t5\t1015','100000\t5\t1016'];
    const originalRows = new Set(before.split(/\r?\n/));
    assert.deepEqual(after.filter(row => !originalRows.has(row)).sort(), expected.sort());
    assert.ok([...originalRows].every(row => after.includes(row)));
    assert.equal(database('SELECT * FROM sys_menu ORDER BY menu_id;'), menuBefore);
    assert.equal(database('SELECT menu_id FROM sys_role_menu WHERE tenant_id=100000 AND role_id=5 ORDER BY menu_id;'), employeeMenus);
    console.log('EMPLOYEE_CERTIFICATE_PERMISSION_APPLIED: new_menus=0; new_grants=4; unrelated_grants_changed=0; employee_matches_formal_seed=true; production_modified=false');
  }
} finally {
  assertOwned(); assert.match(scratch, /^h5_certificate_[a-f0-9]{32}$/);
  database(`DROP DATABASE IF EXISTS ${scratch};`);
  assert.equal(database(`SELECT COUNT(*) FROM information_schema.schemata WHERE schema_name='${scratch}';`), '0');
  assert.equal(database("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='cloud_flow_db' AND table_type='BASE TABLE';"), '374');
  for (const input of inputs) assert.ok(fs.readFileSync(path.join(root, 'cloudflow-backend/DB', input.name)).equals(input.bytes));
  console.log('EMPLOYEE_CERTIFICATE_EMPTY_CLEANUP: remaining=0; runtime_tables=374; seed_inputs=7; changed=0; shared_redis_flush=false');
  const snapshot = inputs.map(input => ({ Path: `cloudflow-backend/DB/${input.name}`, Hash: createHash('sha256').update(input.bytes).digest('hex').toUpperCase() }));
  fs.writeFileSync(path.join(root, `.cloudflow-runtime/full-prd-20260915/approved-runtime/h5-employee-certificate-20261002-sql-inputs-${round}.json`), JSON.stringify(snapshot, null, 2), { flag: 'wx' });
}
