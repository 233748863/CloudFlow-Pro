import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ownedGatewayRedis } from './owned-gateway-redis.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const statePath = await fs.realpath(process.argv[2]);
assert.ok(process.argv.length === 3 || process.argv.length === 4 && process.argv[3] === 'todo');
const todo = process.argv[3] === 'todo';
const jobId = todo ? 1786 : 1785;
const handler = todo ? 'imTodoRecovery' : 'imCallbackRecovery';
const directory = path.dirname(statePath);
assert.equal(path.basename(statePath), 'state.json');
assert.equal(path.dirname(directory), await fs.realpath(path.join(root, '.cloudflow-runtime/batch-g-integration')));
assert.match(path.basename(directory), /^[a-f0-9]{32}$/);
const state = JSON.parse((await fs.readFile(statePath, 'utf8')).replace(/^\uFEFF/, ''));
assert.equal(state.status, 'RUNNING');
assert.equal(await fs.realpath(state.run), directory);
const auth = state.services.find(service => service.name === 'auth');
const databaseOwner = state.processes.find(process => process.name === 'mysql');
const authOwner = state.processes.find(process => process.name === 'auth');
assert.equal(databaseOwner.marker, path.join(directory, 'mysql-data'));
assert.equal(authOwner.marker, path.join(directory, 'auth/service.args'));
for (const owner of [databaseOwner, authOwner]) assert.ok(Number.isInteger(owner.id) && owner.id > 0);
for (const port of [auth.port, state.mysqlPort]) assert.ok(Number.isInteger(port) && port > 1024 && port < 65536);
const ownership = spawnSync('pwsh.exe', ['-NoProfile', '-NonInteractive', '-Command', `
  . '${path.join(root, '.cloudflow-runtime/use-data-drive.ps1').replaceAll("'", "''")}';
  $ErrorActionPreference='Stop';
  foreach ($Target in @(
    @{ Id=${databaseOwner.id}; Port=${state.mysqlPort}; Name='mysqld.exe'; Marker='${databaseOwner.marker.replaceAll("'", "''")}' },
    @{ Id=${authOwner.id}; Port=${auth.port}; Name='java.exe'; Marker='${authOwner.marker.replaceAll("'", "''")}' }
  )) {
    $Owner=Get-CimInstance Win32_Process -Filter "ProcessId = $($Target.Id)";
    if (-not $Owner -or $Owner.Name -ne $Target.Name -or -not $Owner.CommandLine.Contains($Target.Marker)) { throw 'Owned process mismatch' }
    $Listeners=@(Get-NetTCPConnection -State Listen -LocalPort $Target.Port);
    if ($Listeners.Count -ne 1 -or $Listeners[0].LocalAddress -ne '127.0.0.1') { throw 'Loopback required' }
    $Listener=Get-CimInstance Win32_Process -Filter "ProcessId = $($Listeners[0].OwningProcess)";
    if (-not $Listener -or $Listener.Name -ne $Target.Name -or -not $Listener.CommandLine.Contains($Target.Marker) -or ($Listener.ProcessId -ne $Owner.ProcessId -and $Listener.ParentProcessId -ne $Owner.ProcessId)) { throw 'Listener ownership mismatch' }
  }
  Write-Output 'OWNERSHIP_OK';`], { encoding: 'utf8', timeout: 30000, windowsHide: true });
assert.equal(ownership.status, 0, 'Owned callback runtime required');
assert.equal(ownership.stdout.trim(), 'OWNERSHIP_OK');
const properties = await fs.readFile(path.join(directory, 'auth/integration.properties'), 'utf8');
assert.ok(!/^cloudflow\.im\.enabled=(?!false\s*$)/m.test(properties), 'Disabled integration required');
const environment = { ...process.env };
delete environment.MYSQL_PWD;
function database(statement) {
  const result = spawnSync('mysql.exe', ['--no-defaults', '--protocol=TCP', '--host=127.0.0.1', `--port=${state.mysqlPort}`,
    '--user=root', '--batch', '--raw', '--skip-column-names', '--default-character-set=utf8mb4', 'cloud_flow_db'],
  { input: `START TRANSACTION READ ONLY;\n${statement}\nCOMMIT;`, env: environment, encoding: 'utf8', timeout: 30000, windowsHide: true });
  assert.equal(result.status, 0, 'Owned read-only query failed');
  return result.stdout.trim();
}
assert.equal(await fs.realpath(database('SELECT @@datadir;')), await fs.realpath(databaseOwner.marker));
const redis = await ownedGatewayRedis(state);
let assertions = 0;
const check = (condition, label) => { assertions++; assert.ok(condition, label); };
const waitUntil = async (condition, timeout = 30000) => {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { if (await condition()) return; await new Promise(resolve => setTimeout(resolve, 100)); }
  throw new Error('Callback job condition timed out');
};
const businessRows = () => database("SELECT CONCAT((SELECT COUNT(*) FROM sys_im_config),':',(SELECT COUNT(*) FROM sys_im_callback_event),':',(SELECT COUNT(*) FROM sys_im_todo_mapping));");
const before = businessRows();
check(before === '0:0:0', 'Owned callback fixtures must be absent');
check(database(`SELECT COUNT(*) FROM sys_job WHERE job_id=${jobId} AND tenant_id=100000 AND handler_name='${handler}' AND service_name='auth' AND trigger_type='FIXED_DELAY' AND interval_ms=10000 AND status='ENABLED' AND concurrent_flag=0 AND timeout_seconds=240 AND lock_time_seconds=300;`) === '1', 'Formal recovery schedule');
check(database(`SELECT COUNT(*) FROM sys_job_handler WHERE handler_name='${handler}' AND service_name='auth' AND status='ONLINE';`) === '1', 'Unique reported handler');
const timing = () => JSON.parse(database(`SELECT JSON_OBJECT('last',last_fire_time,'next',next_fire_time,'failed',consecutive_fail_count) FROM sys_job WHERE job_id=${jobId};`));
const initial = timing();
let scheduled;
await waitUntil(() => { scheduled = timing(); return scheduled.last && scheduled.last !== initial.last && scheduled.next > scheduled.last; });
check(scheduled.failed === 0, 'Automatic dispatch and real report schedule next run');
const headers = { 'Content-Type': 'application/json', 'X-Inner-Call': 'true', 'X-From-Service': 'cloudflow-auth', 'X-Tenant-Id': '100000' };
const request = () => ({ executeNo: randomUUID(), jobId, handlerName: handler, timeoutSeconds: 240, lockTimeSeconds: 300, concurrentFlag: 0 });
const execute = async body => {
  const response = await fetch(`http://127.0.0.1:${auth.port}/inner/job/execute`, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(10000) });
  check(response.ok, 'Actual execution HTTP accepted');
  const result = await response.json();
  check(result.code === 200, 'Actual execution business response');
  return result.data;
};
const lockKey = todo ? 'cloudflow:job:lock:im-todo-recovery' : 'cloudflow:job:lock:im-callback-recovery';
const lockOwner = `callback-check:${randomUUID()}`;
await waitUntil(() => redis('EVAL', "if redis.call('exists',KEYS[1])==0 then redis.call('hset',KEYS[1],ARGV[1],1); redis.call('pexpire',KEYS[1],15000); return 1 end; return 0", '1', lockKey, lockOwner) === '1');
try {
  const blockedRequest = request();
  const blocked = await execute(blockedRequest);
  check(blocked.accepted === false && blocked.reason === 'LOCK_HELD', 'Real Redis lock excludes another scheduler');
  const blockedResult = JSON.parse(redis('GET', `cloudflow:job:execution:${blockedRequest.executeNo}`));
  check(blockedResult.executeStatus === 'SKIPPED', 'Lock conflict stored');
  check(redis('HGET', lockKey, lockOwner) === '1', 'Rejected execution preserves other owner lock');
} finally {
  redis('EVAL', "if redis.call('hget',KEYS[1],ARGV[1])=='1' then return redis.call('del',KEYS[1]) end; return 0", '1', lockKey, lockOwner);
}
const acceptedRequest = request();
check((await execute(acceptedRequest)).accepted === true, 'Recovery handler accepted');
const resultKey = `cloudflow:job:execution:${acceptedRequest.executeNo}`;
let result;
await waitUntil(() => { const value = redis('GET', resultKey); result = value ? JSON.parse(value) : null; return result && result.executeStatus !== 'RUNNING'; });
check(result.executeStatus === 'SUCCESS' && result.affectedRows === 0 && result.resultMsg === (todo ? '已扫描=0；已更新投递状态=0；失败=0' : '已检查=0；已记录结果=0；等待其他处理器=0；失败=0'), 'Actual disabled recovery returns empty result');
check(Number(redis('TTL', resultKey)) > 0 && Number(redis('TTL', resultKey)) <= 480, 'Real execution expiry');
const stored = JSON.stringify(result);
check((await execute(acceptedRequest)).accepted === true, 'Duplicate execution acknowledged');
check(JSON.stringify(JSON.parse(redis('GET', resultKey))) === stored, 'Duplicate execution preserves result');
check(before === businessRows(), 'Disabled execution leaves business rows unchanged');
check(await fs.readFile(path.join(directory, 'auth/integration.properties'), 'utf8') === properties, 'Configuration bytes unchanged');
console.log(`G4_IM_${todo ? 'TODO' : 'CALLBACK'}_RECOVERY_LIVE: assertions=${assertions}; failed=0; job_id=${jobId}; interval_ms=10000; automatic_dispatch=true; actual_handler=true; real_redis_lock=true; real_redis_result=true; duplicate_execution=true; automatic_report_receiver=true; business_rows_unchanged=true; workflow_action=false; vendor_service=false; production_modified=false`);
