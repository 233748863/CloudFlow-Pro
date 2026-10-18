import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ownedGatewayRedis } from './owned-gateway-redis.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const statePath = await fs.realpath(process.argv[2] || '');
assert.ok(process.argv.slice(3).every(argument => argument === '--apply'));
const directory = path.dirname(statePath); const dataDirectory = path.join(directory, 'mysql-data');
assert.equal(path.basename(statePath), 'state.json'); assert.match(path.basename(directory), /^[a-f0-9]{32}$/);
assert.equal(path.dirname(directory), await fs.realpath(path.join(root, '.cloudflow-runtime/batch-g-integration')));
assert.equal(path.parse(root).root.toLowerCase(), 'd:\\');
const state = JSON.parse((await fs.readFile(statePath, 'utf8')).replace(/^\uFEFF/, ''));
assert.equal(state.status, 'RUNNING'); assert.equal(await fs.realpath(state.run), directory);
assert.ok(Number.isInteger(state.mysqlPort) && state.mysqlPort > 1024 && state.mysqlPort < 65536);
const owners = state.processes.filter(process => process.name === 'mysql'); assert.equal(owners.length, 1); assert.equal(await fs.realpath(owners[0].marker), await fs.realpath(dataDirectory));
const inspect = spawnSync('C:\\Program Files\\PowerShell\\7\\pwsh.exe', ['-NoProfile', '-Command', `
$ErrorActionPreference='Stop'
$listeners=@(Get-NetTCPConnection -State Listen -LocalPort ([int]$env:SETTLEMENT_MYSQL_PORT))
if ($listeners.Count -ne 1 -or $listeners[0].LocalAddress -ne '127.0.0.1') { throw 'Owned loopback database required' }
$process=Get-CimInstance Win32_Process -Filter "ProcessId = $($listeners[0].OwningProcess)"
if ($process.Name -ne 'mysqld.exe' -or -not $process.CommandLine.Contains($env:SETTLEMENT_MYSQL_DATA)) { throw 'Database process ownership mismatch' }
if ($process.ProcessId -ne [int]$env:SETTLEMENT_MYSQL_PID -and $process.ParentProcessId -ne [int]$env:SETTLEMENT_MYSQL_PID) { throw 'Database process identity mismatch' }
Write-Output 'OWNED_MYSQL_VERIFIED'
`], { encoding: 'utf8', windowsHide: true, timeout: 30000, env: { ...process.env, SETTLEMENT_MYSQL_PORT: String(state.mysqlPort), SETTLEMENT_MYSQL_DATA: dataDirectory, SETTLEMENT_MYSQL_PID: String(owners[0].id) } });
assert.equal(inspect.status, 0, 'Database ownership verification failed'); assert.equal(inspect.stdout.trim(), 'OWNED_MYSQL_VERIFIED');
const environment = { ...process.env }; delete environment.MYSQL_PWD;
const database = statement => {
  const result = spawnSync('mysql.exe', ['--no-defaults', '--protocol=TCP', '--host=127.0.0.1', `--port=${state.mysqlPort}`, '--user=root', '--skip-password',
    '--batch', '--raw', '--skip-column-names', '--default-character-set=utf8mb4', 'cloud_flow_db'], { input: statement, encoding: 'utf8', timeout: 30000, windowsHide: true, env: environment });
  assert.equal(result.status, 0, 'Owned settlement menu SQL rejected; raw diagnostics withheld'); return result.stdout.trim();
};
assert.equal(await fs.realpath(database('SELECT @@datadir;')), await fs.realpath(dataDirectory));
assert.equal(database("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='cloud_flow_db' AND table_type='BASE TABLE';"), '374');
assert.equal(database("SELECT COUNT(*) FROM sys_menu WHERE menu_id=1864 OR perms='hr:settlement:submit';"), '0', 'Reserved menu identifiers must be unoccupied');
assert.equal(database('SELECT COUNT(*) FROM sys_role_menu WHERE menu_id=1864;'), '0');
const seedPath = path.join(root, 'cloudflow-backend/DB/06.cloudflow-business-seed.sql'); const seed = await fs.readFile(seedPath, 'utf8');
const block = /-- batch-h2-settlement-approval:start[\s\S]*?-- batch-h2-settlement-approval:end/.exec(seed)?.[0]; assert.ok(block);
const beforeMenus = database('SELECT * FROM sys_menu ORDER BY menu_id;');
const beforeGrants = database('SELECT * FROM sys_role_menu ORDER BY tenant_id,role_id,menu_id;');
console.log('H2_SETTLEMENT_APPROVAL_MENU_PREFLIGHT: tables=374; menus=1864; conflicts=0; grants=2; employee_grants_added=0');
if (process.argv.includes('--apply')) {
  assert.equal(await fs.readFile(seedPath, 'utf8'), seed, 'Seed changed during preparation');
  database(`START TRANSACTION;\n${block}\nCOMMIT;`);
  assert.equal(database('SELECT * FROM sys_menu WHERE menu_id!=1864 ORDER BY menu_id;'), beforeMenus);
  assert.equal(database('SELECT * FROM sys_role_menu WHERE menu_id!=1864 ORDER BY tenant_id,role_id,menu_id;'), beforeGrants);
  const expected = ['1:1864','4:1864'];
  assert.deepEqual(database("SELECT CONCAT(role_id,':',menu_id) FROM sys_role_menu WHERE tenant_id=100000 AND menu_id=1864 ORDER BY role_id,menu_id;").split(/\r?\n/), expected);
  assert.equal(database("SELECT COUNT(*) FROM sys_menu WHERE menu_id=1864 AND perms='hr:settlement:submit' AND parent_id=1860 AND menu_type='F' AND visible='1' AND status='0';"), '1');
  const redis = await ownedGatewayRedis(state); const keys = new Set([1,4].flatMap(role => [`100000:menu_details::${role}`, `100000:menu_details::perms:${role}`]));
  const users = database('SELECT DISTINCT u.user_id,u.user_name FROM sys_user u JOIN sys_user_role r ON r.tenant_id=u.tenant_id AND r.user_id=u.user_id WHERE u.tenant_id=100000 AND u.deleted=0 AND r.role_id IN (1,4) ORDER BY u.user_id;').split(/\r?\n/).filter(Boolean);
  for (const row of users) { const [id, name] = row.split('\t'); assert.match(id, /^[1-9]\d*$/); assert.ok(name); keys.add(`100000:user_details::100000:${name}`); keys.add(`100000:user_menus::${id}`); }
  const removed = Number(redis('DEL', ...keys)); assert.ok(Number.isInteger(removed) && removed >= 0 && removed <= keys.size);
  console.log(`H2_SETTLEMENT_APPROVAL_MENU_APPLIED: new_menus=1; new_grants=2; other_menu_rows_unchanged=true; other_grants_unchanged=true; exact_cache_keys=${keys.size}; cache_deleted=${removed}; session_keys_targeted=0; production_modified=false`);
}
