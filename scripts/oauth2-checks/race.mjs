import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

async function holdClient(context, client) {
  const { state, literal, pause } = context;
  assert.ok(Number.isInteger(state.mysqlPort) && state.mysqlPort > 1024);
  assert.match(String(client.clientId), /^[1-9][0-9]*$/);
  const environment = { ...process.env };
  delete environment.MYSQL_PWD;
  const connection = spawn('mysql.exe', ['--no-defaults', '--protocol=TCP', '--host=127.0.0.1', `--port=${state.mysqlPort}`,
    '--user=root', '--batch', '--raw', '--unbuffered', '--skip-column-names', '--default-character-set=utf8mb4', 'cloud_flow_db'],
  { windowsHide: true, env: environment, stdio: ['pipe', 'pipe', 'pipe'] });
  let output = '';
  let error = '';
  connection.stdout.setEncoding('utf8');
  connection.stderr.setEncoding('utf8');
  connection.stdout.on('data', value => { output += value; });
  connection.stderr.on('data', value => { error += value; });
  connection.on('error', failure => { error = failure.message; });
  const closed = new Promise(resolve => connection.once('close', resolve));
  connection.stdin.write(`SET SESSION innodb_lock_wait_timeout=15; START TRANSACTION;
    SELECT client_id FROM sys_oauth2_client WHERE tenant_id=${client.tenantId} AND client_id=${client.clientId} AND client_name=${literal(client.clientName)} FOR UPDATE;
    SELECT CONCAT('OAUTH_LOCK:',CONNECTION_ID());\n`);
  const deadline = Date.now() + 10000;
  while (!output.includes('OAUTH_LOCK:') && !error && Date.now() < deadline) await pause(25);
  const identifier = /OAUTH_LOCK:(\d+)/.exec(output)?.[1];
  if (!identifier) { connection.stdin.end('ROLLBACK;\n'); await closed; throw new Error('隔离OAuth客户端行锁准备失败'); }
  return { identifier, release: async () => { connection.stdin.end('ROLLBACK;\n'); await closed; assert.equal(error, '', '隔离行锁连接无数据库错误'); } };
}

export async function verifyOauthUserRace(context) {
  const { actors, login, create, issued, begin, api, admin, successful, check, database, pause, evidence } = context;
  const person = actors.person('race', actors.role('race'));
  person.page = await login(person.username, person.source);
  const existing = await create('race-existing', { scopes: ['profile'] });
  const first = await create('race-first', { scopes: ['profile'] });
  await issued(person.page, existing);
  const blocker = await holdClient(context, existing);
  let finished = false;
  let disableResult;
  const version = Number(database(`SELECT version FROM sys_user WHERE tenant_id=${person.tenantId} AND user_id=${person.userId};`));
  const disabling = api(admin, '/auth/system/user', { method: 'PUT', body: { userId: person.userId, tenantId: person.tenantId,
    userName: person.username, status: '1', version, roleIds: [person.roleId] } }).then(result => { disableResult = result; finished = true; });
  let beforeCommit;
  try {
    let waiting = false;
    const deadline = Date.now() + 12000;
    while (!finished && !waiting && Date.now() < deadline) {
      waiting = database(`SELECT COUNT(*) FROM performance_schema.data_lock_waits waiting
        JOIN performance_schema.threads blocker ON blocker.thread_id=waiting.blocking_thread_id WHERE blocker.processlist_id=${blocker.identifier};`) !== '0';
      if (!waiting && !finished) await pause(35);
    }
    check('真实账号停用已进入数据库锁等待或完成提交', waiting || finished);
    beforeCommit = await begin(person.page, first);
  } finally { await blocker.release(); await disabling; }
  successful(disableResult, '竞争中的真实账号停用');
  const pending = database(`SELECT COUNT(*) FROM sys_oauth2_code WHERE tenant_id=${person.tenantId} AND user_id=${person.userId} AND status IN ('PENDING','ISSUED');`);
  console.log(`H5_OAUTH2_USER_RACE: authorization_http=${beforeCommit.result.status}; authorization_error=${beforeCommit.result.body?.error}; authorization_code=${beforeCommit.result.body?.code}; retained_pending=${pending}; disabled_status=${database(`SELECT status FROM sys_user WHERE tenant_id=${person.tenantId} AND user_id=${person.userId};`)}; mysql_lock_control=true; production_modified=false`);
  check('停用与首次授权竞争后无遗留可确认或可兑换事务', pending === '0');
  check('停用过程中的旧内部会话不能创建首次授权', beforeCommit.result.status === 401
    && (beforeCommit.result.body?.error === 'invalid_token' || beforeCommit.result.body?.code === 401)
    && !beforeCommit.result.body?.data?.requestToken && !beforeCommit.result.body?.data?.redirectUrl);
  evidence.userDisableRace = true;
}
