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
const quote = value => value == null ? 'NULL' : `'${String(value).replaceAll("'", "''")}'`;
const menuColumns = ['menu_id', 'menu_name', 'parent_id', 'order_num', 'path', 'component', 'query', 'is_frame', 'is_cache', 'menu_type', 'visible', 'status', 'perms', 'icon', 'create_by', 'update_by', 'remark'];
const jobColumns = ['job_id', 'tenant_id', 'job_name', 'job_group', 'service_name', 'handler_name', 'trigger_type', 'cron_expression', 'interval_ms', 'status', 'concurrent_flag', 'misfire_strategy', 'retry_count', 'retry_interval_sec', 'dispatch_retry_count', 'dispatch_retry_interval_sec', 'timeout_seconds', 'lock_time_seconds', 'critical_flag', 'log_success_flag', 'alarm_on_fail_flag'];
const menu = memory.rows('sys_menu').find(row => Number(text(row.menu_id)) === 1784);
const job = memory.rows('sys_job').find(row => Number(text(row.job_id)) === 1784);
const handler = memory.rows('sys_job_handler').find(row => Number(text(row.handler_id)) === 1784);
assert.ok(menu && job && handler);
assert.equal(text(job.handler_name), 'imSyncRecovery');
assert.equal(text(handler.handler_name), 'imSyncRecovery');
const condition = (row, columns) => columns.map(column => `\`${column}\` <=> ${quote(text(row[column]))}`).join(' AND ');
const menuPending = database("SELECT COUNT(*) FROM sys_menu WHERE menu_id=1784 OR perms='system:im:sync:run';") === '0';
const jobPending = database("SELECT COUNT(*) FROM sys_job WHERE job_id=1784 OR handler_name='imSyncRecovery';") === '0';
const handlerRows = database("SELECT CONCAT(handler_id,':',service_name,':',handler_name) FROM sys_job_handler WHERE handler_id=1784 OR handler_name='imSyncRecovery';");
const handlerPending = handlerRows === '';
if (!handlerPending) assert.match(handlerRows, /^[1-9][0-9]*:auth:imSyncRecovery$/);
const before = [
  ["SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='cloud_flow_db' AND table_type='BASE TABLE'", '366'],
  ["SELECT COUNT(*) FROM sys_menu WHERE menu_id BETWEEN 1780 AND 1785 OR perms LIKE 'system:im:config:%' OR perms LIKE 'system:im:sync:%'", menuPending ? '5' : '6'],
  ['SELECT COUNT(*) FROM sys_role_menu WHERE menu_id BETWEEN 1780 AND 1785', menuPending ? '5' : '6'],
  ['SELECT COUNT(*) FROM sys_role_menu WHERE role_id=5 AND menu_id BETWEEN 1780 AND 1785', '0'],
  ["SELECT COUNT(*) FROM sys_role WHERE role_id=1 AND tenant_id=100000 AND role_key='admin' AND status='0' AND deleted=0", '1'],
  ["SELECT COUNT(*) FROM sys_menu WHERE menu_id=6 AND status='0' AND visible='0'", '1'],
  ['SELECT COUNT(*) FROM sys_menu', String(memory.rows('sys_menu').length - Number(menuPending))],
  ...memory.rows('sys_menu').filter(row => [1780, 1781, 1782, 1783, 1785].includes(Number(text(row.menu_id))))
    .map(row => [`SELECT COUNT(*) FROM sys_menu WHERE ${condition(row, menuColumns)}`, '1']),
  ["SELECT COUNT(*) FROM sys_role_menu WHERE role_id=1 AND tenant_id=100000 AND menu_id IN (1780,1781,1782,1783,1785)", '5'],
  [`SELECT COUNT(*) FROM sys_menu WHERE ${menuPending ? "menu_id=1784 OR perms='system:im:sync:run'" : condition(menu, menuColumns)}`, menuPending ? '0' : '1'],
  ['SELECT COUNT(*) FROM sys_role_menu WHERE menu_id=1784', menuPending ? '0' : '1'],
  [`SELECT COUNT(*) FROM sys_job WHERE ${jobPending ? "job_id=1784 OR handler_name='imSyncRecovery'" : condition(job, jobColumns)}`, jobPending ? '0' : '1'],
  ["SELECT COUNT(*) FROM sys_job_handler WHERE handler_id=1784 OR handler_name='imSyncRecovery'", handlerPending ? '0' : '1'],
];
if (!menuPending) before.push(['SELECT COUNT(*) FROM sys_role_menu WHERE role_id=1 AND menu_id=1784 AND tenant_id=100000', '1']);
if (!handlerPending) before.push([`SELECT COUNT(*) FROM sys_job_handler WHERE CONCAT(handler_id,':',service_name,':',handler_name)=${quote(handlerRows)}`, '1']);
for (const [statement, expected] of before) assert.equal(database(`${statement};`), expected, 'Unexpected baseline or candidate conflict; no writes performed');
console.log(`G4_IM_EXECUTION_PREFLIGHT: physical_tables=366; menu_insert=${menuPending}; job_insert=${jobPending}; handler_insert=${handlerPending}; matching_handler_reused=${!handlerPending}; candidate_conflicts=0; employee_grants=0; production_modified=false`);
if (!process.argv.includes('--apply')) {
  console.log('G4_IM_EXECUTION_PREFLIGHT_PASS=true; database_writes=0');
} else {
  const digests = [];
  for (const [table, ordering] of [['sys_menu', 'menu_id'], ['sys_role_menu', 'tenant_id,role_id,menu_id']]) {
    const names = database(`SELECT column_name FROM information_schema.columns WHERE table_schema='cloud_flow_db' AND table_name='${table}' ORDER BY ordinal_position;`).split(/\r?\n/);
    assert.ok(names.every(name => /^[a-z_]+$/.test(name)));
    assert.ok(Number(database(`SELECT COUNT(*) FROM ${table};`)) < 131072);
    const statement = `SELECT SHA2(GROUP_CONCAT(SHA2(CAST(JSON_ARRAY(${names.map(name => `\`${name}\``).join(',')}) AS CHAR),256) ORDER BY ${ordering} SEPARATOR ''),256) FROM ${table} WHERE menu_id<>1784`;
    const hash = database(`${statement};`);
    assert.match(hash, /^[a-f0-9]{64}$/);
    digests.push([statement, hash]);
  }
  const after = [
    ["SELECT COUNT(*) FROM sys_menu WHERE menu_id BETWEEN 1780 AND 1785 OR perms LIKE 'system:im:config:%' OR perms LIKE 'system:im:sync:%'", '6'],
    ['SELECT COUNT(*) FROM sys_role_menu WHERE menu_id BETWEEN 1780 AND 1785', '6'],
    ["SELECT COUNT(*) FROM sys_role_menu WHERE role_id=1 AND menu_id BETWEEN 1780 AND 1785 AND tenant_id=100000", '6'],
    [`SELECT COUNT(*) FROM sys_menu WHERE ${condition(menu, menuColumns)}`, '1'],
    [`SELECT COUNT(*) FROM sys_job WHERE ${condition(job, jobColumns)}`, '1'],
    ["SELECT COUNT(*) FROM sys_job_handler WHERE service_name='auth' AND handler_name='imSyncRecovery'", '1'],
    ...digests,
  ];
  const insert = (table, row, columns) => `INSERT INTO ${table} (${columns.map(column => `\`${column}\``).join(',')},create_time,update_time${table === 'sys_job_handler' ? ',last_report_time' : ''}) VALUES (${columns.map(column => quote(text(row[column]))).join(',')},NOW(),NOW()${table === 'sys_job_handler' ? ',NOW()' : ''});`;
  const guard = checks => checks.map(([statement, expected]) => `INSERT INTO g4_im_execution_increment_guard SELECT (${statement}) <=> ${quote(expected)};`).join('\n');
  const sql = `START TRANSACTION;
CREATE TEMPORARY TABLE g4_im_execution_increment_guard (accepted TINYINT NOT NULL CHECK (accepted=1));
${guard([...before, ...digests])}
${menuPending ? insert('sys_menu', menu, menuColumns) + '\nINSERT INTO sys_role_menu(role_id,menu_id,tenant_id) VALUES (1,1784,100000);' : ''}
${handlerPending ? insert('sys_job_handler', handler, ['handler_id','service_name','handler_name','handler_desc','status','create_by','update_by']) : ''}
${jobPending ? insert('sys_job', job, [...jobColumns, 'create_by', 'update_by']) : ''}
${guard(after)}
DROP TEMPORARY TABLE g4_im_execution_increment_guard;
COMMIT;`;
  const evidence = path.join(directory, `im-execution-prepare-${randomUUID().replaceAll('-', '')}`);
  await fs.mkdir(evidence);
  await fs.writeFile(path.join(evidence, 'executed.sql'), sql);
  database(sql, false);
  for (const [statement, expected] of after) assert.equal(database(`${statement};`), expected);
  console.log('G4_IM_EXECUTION_APPLY_PASS=true; tables=366; menu_id=1784; job_id=1784; handler=imSyncRecovery; interval_ms=60000; employee_grants=0; unrelated_menus_unchanged=true; unrelated_grants_unchanged=true; production_modified=false');
  console.log(`G4_IM_EXECUTION_APPLY_EVIDENCE=${evidence}`);
}
