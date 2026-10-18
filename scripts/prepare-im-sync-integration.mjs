import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { checkImConfigMenus, loadRepository, replayFormal, root } from './check-batch-h-contracts.mjs';
import { text } from './check-batch-h-contracts-sql.mjs';

assert.ok(process.argv.length === 3 || process.argv.length === 4 && process.argv[3] === '--apply');
assert.notEqual(path.parse(root).root.toLowerCase(), `${process.env.SystemDrive}\\`.toLowerCase());
const statePath = await fs.realpath(process.argv[2]);
const directory = path.dirname(statePath);
const runtime = path.join(root, '.cloudflow-runtime/batch-g-integration');
assert.equal(path.basename(statePath), 'state.json');
assert.equal(path.dirname(directory), await fs.realpath(runtime));
assert.match(path.basename(directory), /^[a-f0-9]{32}$/);
const data = path.join(directory, 'mysql-data');
for (const candidate of [root, runtime, directory, statePath, data]) assert.equal((await fs.lstat(candidate)).isSymbolicLink(), false);
const state = JSON.parse((await fs.readFile(statePath, 'utf8')).replace(/^\uFEFF/, ''));
assert.equal(state.status, 'RUNNING');
assert.equal(await fs.realpath(state.run), directory);
assert.ok(Number.isInteger(state.mysqlPort) && state.mysqlPort > 1024 && state.mysqlPort < 65536);
const owned = state.processes.filter(process => process.name === 'mysql');
assert.equal(owned.length, 1);
assert.equal(owned[0].marker, data);
assert.ok(Number.isInteger(owned[0].id) && owned[0].id > 0);
const ownership = spawnSync('pwsh.exe', ['-NoProfile', '-NonInteractive', '-Command', `
  $ErrorActionPreference='Stop'; $Data='${data.replaceAll("'", "''")}';
  $Owned=Get-CimInstance Win32_Process -Filter 'ProcessId = ${owned[0].id}';
  if (-not $Owned -or $Owned.Name -ne 'mysqld.exe' -or -not $Owned.CommandLine.Contains($Data)) { throw 'Owned MySQL mismatch' }
  $Listeners=@(Get-NetTCPConnection -State Listen -LocalPort ${state.mysqlPort});
  if ($Listeners.Count -ne 1 -or $Listeners[0].LocalAddress -ne '127.0.0.1') { throw 'Loopback-only database required' }
  $Listener=Get-CimInstance Win32_Process -Filter "ProcessId = $($Listeners[0].OwningProcess)";
  if (-not $Listener -or $Listener.Name -ne 'mysqld.exe' -or -not $Listener.CommandLine.Contains($Data) -or ($Listener.ProcessId -ne $Owned.ProcessId -and $Listener.ParentProcessId -ne $Owned.ProcessId)) { throw 'Listener ownership mismatch' }
  Write-Output 'OWNED_MYSQL=true';`], { encoding: 'utf8', timeout: 30000, windowsHide: true });
assert.equal(ownership.status, 0, ownership.stderr);
assert.equal(ownership.stdout.trim(), 'OWNED_MYSQL=true');
const environment = { ...process.env };
delete environment.MYSQL_PWD;
function database(statement, readOnly = true) {
  const result = spawnSync('mysql.exe', ['--no-defaults', '--protocol=TCP', '--host=127.0.0.1', `--port=${state.mysqlPort}`, '--user=root',
    '--batch', '--raw', '--skip-column-names', '--default-character-set=utf8mb4', 'cloud_flow_db'], {
    input: `SET SESSION group_concat_max_len=8388608;\n${readOnly ? `START TRANSACTION READ ONLY;\n${statement}\nCOMMIT;` : statement}`,
    env: environment, encoding: 'utf8', timeout: 60000, maxBuffer: 16 * 1024 * 1024, windowsHide: true,
  });
  assert.equal(result.status, 0, result.error?.message || result.stderr);
  return result.stdout.trim();
}
assert.equal(await fs.realpath(database('SELECT @@datadir;')), await fs.realpath(data));
const repository = loadRepository();
const { memory } = replayFormal(repository);
checkImConfigMenus(repository, memory);
const ids = [1780, 1781, 1782, 1783, 1784, 1785];
const candidates = [1783, 1784, 1785];
const columns = ['menu_id', 'menu_name', 'parent_id', 'order_num', 'path', 'component', 'query', 'is_frame', 'is_cache', 'menu_type', 'visible', 'status', 'perms', 'icon', 'create_by', 'update_by', 'remark'];
const quote = value => value == null ? 'NULL' : `'${String(value).replaceAll("'", "''")}'`;
const menuConditions = ids.map(id => {
  const row = memory.rows('sys_menu').find(menu => Number(text(menu.menu_id)) === id);
  assert.ok(row);
  return { id, condition: columns.map(column => `\`${column}\` <=> ${quote(text(row[column]))}`).join(' AND ') };
});
const range = "menu_id BETWEEN 1780 AND 1799 OR perms LIKE 'system:im:%'";
const assertions = [
  ["SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='cloud_flow_db' AND table_type='BASE TABLE'", '366'],
  [`SELECT COUNT(*) FROM sys_menu WHERE ${range}`, '3'],
  ['SELECT COUNT(*) FROM sys_role_menu WHERE menu_id BETWEEN 1780 AND 1799', '3'],
  ["SELECT COUNT(*) FROM sys_menu WHERE menu_id=6 AND visible='0' AND status='0'", '1'],
  ["SELECT COUNT(*) FROM sys_role WHERE role_id=1 AND tenant_id=100000 AND role_key='admin' AND status='0' AND deleted=0", '1'],
  ...menuConditions.filter(menu => !candidates.includes(menu.id)).map(menu => [`SELECT COUNT(*) FROM sys_menu WHERE ${menu.condition}`, '1']),
  ["SELECT COUNT(*) FROM sys_role_menu WHERE role_id=1 AND tenant_id=100000 AND menu_id IN (1780,1781,1782)", '3'],
  ['SELECT COUNT(*) FROM sys_menu', String(memory.rows('sys_menu').length - 3)],
];
for (const [statement, expected] of assertions) assert.equal(database(`${statement};`), expected, 'Unexpected isolated baseline; no writes performed');
const preflight = database("SELECT COUNT(*) FROM sys_menu WHERE menu_id IN (1783,1784,1785) OR perms IN ('system:im:sync:preview','system:im:sync:run','system:im:sync:list');");
assert.equal(preflight, '0');
console.log('G4_IM_SYNC_PREFLIGHT: physical_tables=366; existing_menu_ids=1780,1781,1782; existing_admin_pairs=3; candidate_conflicts=0; employee_grants=0; loopback=true; production_modified=false');
if (!process.argv.includes('--apply')) {
  console.log('G4_IM_SYNC_PREFLIGHT_PASS=true; database_writes=0');
} else {
  const digests = [];
  for (const [table, ordering] of [['sys_menu', 'menu_id'], ['sys_role_menu', 'tenant_id,role_id,menu_id']]) {
    const names = database(`SELECT column_name FROM information_schema.columns WHERE table_schema='cloud_flow_db' AND table_name='${table}' ORDER BY ordinal_position;`).split(/\r?\n/);
    assert.ok(names.every(name => /^[a-z_]+$/.test(name)));
    assert.ok(Number(database(`SELECT COUNT(*) FROM ${table};`)) < 131072);
    const statement = `SELECT SHA2(GROUP_CONCAT(SHA2(CAST(JSON_ARRAY(${names.map(name => `\`${name}\``).join(',')}) AS CHAR),256) ORDER BY ${ordering} SEPARATOR ''),256) FROM ${table} WHERE menu_id NOT IN (1783,1784,1785)`;
    const hash = database(`${statement};`);
    assert.match(hash, /^[a-f0-9]{64}$/);
    digests.push([statement, hash]);
  }
  const seed = repository.load('cloudflow-backend/DB/06.cloudflow-business-seed.sql');
  const tuples = candidates.map(id => {
    const matches = [...seed.matchAll(new RegExp(`^ \\(${id}, .+\\)[,;]$`, 'gm'))];
    assert.equal(matches.length, 1);
    return matches[0][0].trim().slice(0, -1);
  });
  const guard = checks => checks.map(([statement, expected]) => `INSERT INTO g4_im_sync_increment_guard SELECT (${statement}) <=> ${quote(expected)};`).join('\n');
  const after = [
    [`SELECT COUNT(*) FROM sys_menu WHERE ${range}`, '6'],
    ['SELECT COUNT(*) FROM sys_role_menu WHERE menu_id BETWEEN 1780 AND 1799', '6'],
    ["SELECT COUNT(*) FROM sys_role_menu WHERE role_id=1 AND tenant_id=100000 AND menu_id IN (1780,1781,1782,1783,1784,1785)", '6'],
    ...menuConditions.map(menu => [`SELECT COUNT(*) FROM sys_menu WHERE ${menu.condition}`, '1']),
    ...digests,
  ];
  const sql = `START TRANSACTION;
CREATE TEMPORARY TABLE g4_im_sync_increment_guard (accepted TINYINT NOT NULL CHECK (accepted=1));
${guard([...assertions, ...digests])}
INSERT INTO sys_menu (menu_id,menu_name,parent_id,order_num,path,component,query,is_frame,is_cache,menu_type,visible,status,perms,icon,create_by,create_time,update_by,update_time,remark) VALUES
${tuples.join(',\n')};
INSERT INTO sys_role_menu(role_id,menu_id,tenant_id) VALUES (1,1783,100000),(1,1784,100000),(1,1785,100000);
${guard(after)}
DROP TEMPORARY TABLE g4_im_sync_increment_guard;
COMMIT;`;
  const evidence = path.join(directory, `im-sync-prepare-${randomUUID().replaceAll('-', '')}`);
  await fs.mkdir(evidence);
  await fs.writeFile(path.join(evidence, 'executed.sql'), sql);
  database(sql, false);
  for (const [statement, expected] of after) assert.equal(database(`${statement};`), expected);
  console.log('G4_IM_SYNC_APPLY_PASS=true; tables_before=366; tables_after=366; menu_ids_added=1783,1784,1785; admin_pairs_added=3; employee_grants=0; unrelated_menus_unchanged=true; unrelated_grants_unchanged=true; recovery_job_requires_execution_prepare=true; production_modified=false');
  console.log(`G4_IM_SYNC_APPLY_EVIDENCE=${evidence}`);
}
