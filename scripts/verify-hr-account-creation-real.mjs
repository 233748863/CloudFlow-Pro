import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const statePath = await fs.realpath(process.argv[2]);
const directory = path.dirname(statePath);
assert.equal(path.dirname(directory), await fs.realpath(path.join(root, '.cloudflow-runtime/batch-g-integration')));
assert.match(path.basename(directory), /^[a-f0-9]{32}$/);
const state = JSON.parse((await fs.readFile(statePath, 'utf8')).replace(/^\uFEFF/, ''));
assert.equal(state.status, 'RUNNING');
assert.equal(await fs.realpath(state.run), directory);
const environment = { ...process.env }; delete environment.MYSQL_PWD;
const database = statement => {
  const result = spawnSync('mysql.exe', ['--no-defaults', '--protocol=TCP', '--host=127.0.0.1', `--port=${state.mysqlPort}`, '--user=root',
    '--batch', '--raw', '--skip-column-names', '--default-character-set=utf8mb4', 'cloud_flow_db'], { input: statement, encoding: 'utf8', timeout: 30000, windowsHide: true, env: environment });
  assert.equal(result.status, 0, 'Owned account verification SQL failed'); return result.stdout.trim();
};
assert.equal(await fs.realpath(database('SELECT @@datadir;')), await fs.realpath(path.join(directory, 'mysql-data')));
const auth = state.services.find(service => service.name === 'auth');
assert.ok(Number.isInteger(auth.port) && auth.port > 1024 && auth.port < 65536);
const marker = `ref_account_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
const headers = { 'Content-Type': 'application/json', 'X-Inner-Call': 'true', 'X-From-Service': 'cloudflow-service-hr', 'X-Tenant-Id': '100000' };
const request = { tenantId: 100000, deptId: 100, userName: marker, nickName: marker, sex: '2',
  email: `${marker.padEnd(64, 'a')}@${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(61)}`, phonenumber: '+123456789012345' };
assert.equal(database(`SELECT COUNT(*) FROM sys_user WHERE tenant_id=100000 AND user_name='${marker}';`), '0');
try {
  for (const nameLength of [30, 31, 100, 101]) {
    request.nickName = marker.padEnd(nameLength, '名');
    const response = await fetch(`http://127.0.0.1:${auth.port}/inner/auth/user`, { method: 'POST', headers, body: JSON.stringify(request), signal: AbortSignal.timeout(30000) });
    const body = await response.json();
    console.log(`H2_REFERRAL_ACCOUNT_HTTP: name_length=${nameLength}; status=${response.status}; code=${body.code}; secret_output=0`);
    if (nameLength === 101) {
      assert.equal(response.status, 400, 'Oversized nickname must be rejected before persistence');
      assert.equal(database(`SELECT COUNT(*) FROM sys_user WHERE tenant_id=100000 AND user_name='${marker}';`), '0');
      continue;
    }
    assert.ok(response.status === 200 && body.code === 200, 'Actual Auth account creation must succeed');
    const userId = String(body.data); assert.match(userId, /^[1-9]\d*$/);
    assert.equal(database(`SELECT COUNT(*) FROM sys_user WHERE tenant_id=100000 AND user_id=${userId} AND user_name='${marker}' AND pwd_reset_required='1' AND LENGTH(password)>0 AND HEX(email)='${Buffer.from(request.email).toString('hex').toUpperCase()}' AND HEX(phonenumber)='${Buffer.from(request.phonenumber).toString('hex').toUpperCase()}';`), '1');
    const nameHex = Buffer.from(request.nickName).toString('hex').toUpperCase();
    assert.equal(database(`SELECT HEX(nick_name) FROM sys_user WHERE tenant_id=100000 AND user_id=${userId};`), nameHex);
    const changed = await fetch(`http://127.0.0.1:${auth.port}/inner/auth/user/${userId}`, { method: 'PUT', headers,
      body: JSON.stringify({ nickName: marker.padEnd(101, '名') }), signal: AbortSignal.timeout(30000) });
    assert.equal(changed.status, 400, 'Oversized nickname update must be rejected');
    assert.equal(database(`SELECT HEX(nick_name) FROM sys_user WHERE tenant_id=100000 AND user_id=${userId};`), nameHex);
    database(`DELETE FROM sys_user_role WHERE tenant_id=100000 AND user_id=${userId}; DELETE FROM sys_user_post WHERE tenant_id=100000 AND user_id=${userId}; DELETE FROM sys_user WHERE tenant_id=100000 AND user_id=${userId} AND user_name='${marker}';`);
  }
  console.log('H2_REFERRAL_ACCOUNT_PASS: actual_auth=true; name_lengths=30,31,100; oversized_create_update_rejected=true; maximum_contacts_preserved=true; password_reset_required=true; production_modified=false');
} finally {
  const userIds = database(`SELECT user_id FROM sys_user WHERE tenant_id=100000 AND user_name='${marker}';`).split(/\r?\n/).filter(Boolean);
  for (const userId of userIds) {
    assert.match(userId, /^[1-9]\d*$/);
    database(`DELETE FROM sys_user_role WHERE tenant_id=100000 AND user_id=${userId}; DELETE FROM sys_user_post WHERE tenant_id=100000 AND user_id=${userId}; DELETE FROM sys_user WHERE tenant_id=100000 AND user_id=${userId} AND user_name='${marker}';`);
  }
  console.log(`H2_REFERRAL_ACCOUNT_CLEANUP: owned_accounts=${userIds.length}; audit_retained=true; production_modified=false`);
}
