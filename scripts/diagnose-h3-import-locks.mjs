import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

const [port, cloneData, caseTag, outputDirectory] = process.argv.slice(2);
assert.match(port, /^[1-9]\d{3,4}$/);
assert.match(caseTag, /^[a-f0-9]{12}$/);
assert.equal(path.resolve(cloneData), path.resolve(outputDirectory, 'private/mysql-data'));
const environment = { ...process.env };
delete environment.MYSQL_PWD;
const argumentsList = ['--no-defaults', '--protocol=TCP', '--host=127.0.0.1', '--port=' + port, '--user=root',
  '--skip-password', '--batch', '--raw', '--skip-column-names', '--unbuffered', '--default-character-set=utf8mb4', 'cloud_flow_db'];
const query = statement => {
  assert.match(statement, /^SELECT /);
  assert.ok(!/;\s*\S/.test(statement));
  const result = spawnSync('mysql.exe', argumentsList, { input: statement, encoding: 'utf8', timeout: 10000, windowsHide: true, env: environment });
  assert.equal(result.status, 0, 'Read-only diagnostic SELECT must succeed');
  return result.stdout.trim();
};
assert.equal(await fs.realpath(query('SELECT @@datadir;')), await fs.realpath(cloneData));
// The clone stays globally read-only. Its root account needs locking reads,
// which MySQL forbids with super_read_only even though these statements change no rows.
assert.equal(query('SELECT CONCAT(@@read_only,@@super_read_only);'), '10');
const opportunityId = query("SELECT opportunity_id FROM crm_opportunity WHERE tenant_id=100000 AND opportunity_name='H3_IMPORT_" + caseTag + "_recovery_blocked';");
assert.match(opportunityId, /^[1-9]\d*$/);
const clients = [];
const start = statement => {
  const processHandle = spawn('mysql.exe', [...argumentsList, '--execute=' + statement], { windowsHide: true, env: environment, stdio: ['ignore', 'pipe', 'pipe'] });
  const client = { processHandle, stdout: '', stderr: '', error: null, exitCode: null };
  client.ended = new Promise(resolve => {
    processHandle.once('close', code => { client.exitCode = code; resolve(); });
    processHandle.once('error', error => { client.error = error.message; resolve(); });
  });
  processHandle.stdout.on('data', bytes => { client.stdout += bytes.toString(); });
  processHandle.stderr.on('data', bytes => { client.stderr += bytes.toString(); });
  clients.push(client);
  return client;
};
const until = async (read, accepts) => {
  const deadline = Date.now() + 10000;
  let value;
  do {
    value = read();
    if (accepts(value)) return value;
    await new Promise(resolve => setTimeout(resolve, 100));
  } while (Date.now() < deadline);
  throw new Error('Owned read-only lock observation timed out; final value=' + JSON.stringify(value));
};
const result = { sourceCase: caseTag, opportunityId, readOnly: true, superReadOnly: false, administrativeLockingReads: true, businessWrites: 0, observed: [], passed: false };
try {
  const record = 'SELECT opportunity_id FROM crm_opportunity WHERE tenant_id=100000 AND opportunity_id=' + opportunityId + ' FOR UPDATE;';
  const blocker = start("START TRANSACTION; " + record + " SELECT CONCAT('BLOCKER:',CONNECTION_ID()); DO SLEEP(20); ROLLBACK;");
  const blockerConnection = await until(() => blocker.stdout.match(/BLOCKER:(\d+)/)?.[1], value => !!value);
  const waiter = start("START TRANSACTION; SELECT CONCAT('WAITER:',CONNECTION_ID()); " + record + ' ROLLBACK;');
  const waiterConnection = await until(() => waiter.stdout.match(/WAITER:(\d+)/)?.[1], value => !!value);
  result.blockerConnection = blockerConnection;
  result.waiterConnection = waiterConnection;
  result.settings = JSON.parse(query("SELECT JSON_OBJECT('version',VERSION(),'performanceSchema',@@performance_schema,'lockWaitTimeout',@@innodb_lock_wait_timeout,'threadCount',(SELECT COUNT(*) FROM performance_schema.threads));"));
  const observation = await until(() => {
    const value = JSON.parse(query("SELECT JSON_OBJECT('legacyQuery',(SELECT GROUP_CONCAT(DISTINCT requester.PROCESSLIST_ID ORDER BY requester.PROCESSLIST_ID) FROM performance_schema.data_lock_waits waiting JOIN performance_schema.threads requester ON requester.THREAD_ID=waiting.REQUESTING_THREAD_ID JOIN performance_schema.threads blocker ON blocker.THREAD_ID=waiting.BLOCKING_THREAD_ID WHERE blocker.PROCESSLIST_ID=" + blockerConnection + "),'waits',(SELECT JSON_ARRAYAGG(JSON_OBJECT('requestingThread',REQUESTING_THREAD_ID,'blockingThread',BLOCKING_THREAD_ID,'requestingTransaction',REQUESTING_ENGINE_TRANSACTION_ID,'blockingTransaction',BLOCKING_ENGINE_TRANSACTION_ID)) FROM performance_schema.data_lock_waits),'transactions',(SELECT JSON_ARRAYAGG(JSON_OBJECT('id',trx_id,'connection',trx_mysql_thread_id,'state',trx_state,'rowsLocked',trx_rows_locked)) FROM information_schema.innodb_trx),'threads',(SELECT JSON_ARRAYAGG(JSON_OBJECT('id',THREAD_ID,'connection',PROCESSLIST_ID,'instrumented',INSTRUMENTED)) FROM performance_schema.threads WHERE PROCESSLIST_ID IN (" + blockerConnection + ',' + waiterConnection + ')));'));
    result.observed.push(value);
    return value;
  }, value => value.transactions?.some(transaction => String(transaction.connection) === waiterConnection && transaction.state === 'LOCK WAIT'));
  result.legacyFindsWaiter = observation.legacyQuery === waiterConnection;
  result.passed = true;
} catch (error) {
  result.failure = error.message;
} finally {
  await Promise.all(clients.map(client => client.ended));
  result.clients = clients.map(client => ({ exitCode: client.exitCode, error: client.error, stdout: client.stdout, stderr: client.stderr }));
  result.clientsStopped = clients.every(client => client.processHandle.exitCode !== null);
  result.passed = result.passed && result.clientsStopped && clients.every(client => client.exitCode === 0);
  await fs.writeFile(path.join(outputDirectory, 'lock-probe.json'), JSON.stringify(result, null, 2), { flag: 'wx' });
}
console.log('H3_LOCK_OBSERVATION: passed=' + result.passed + '; legacy_finds_waiter=' + result.legacyFindsWaiter + '; clients_stopped=' + result.clientsStopped + '; business_writes=0');
if (!result.passed) process.exitCode = 1;
