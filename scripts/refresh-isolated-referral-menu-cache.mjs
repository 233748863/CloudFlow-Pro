import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ownedGatewayRedis } from './owned-gateway-redis.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const statePath = await fs.realpath(process.argv[2] || '');
const directory = path.dirname(statePath);
assert.equal(path.basename(statePath), 'state.json');
assert.equal(path.dirname(directory), await fs.realpath(path.join(root, '.cloudflow-runtime/batch-g-integration')));
assert.match(path.basename(directory), /^[a-f0-9]{32}$/);
assert.ok(process.argv.length === 3 || process.argv.length === 4 && ['--exit-interview', '--training-recovery', '--advance-submit', '--severance-policy', '--employee-certificate'].includes(process.argv[3]));
const menuIds = process.argv[3] === '--employee-certificate' ? '1015,1016' : process.argv[3] === '--severance-policy' ? '1868' : process.argv[3] === '--advance-submit' ? '1873' : process.argv[3] === '--training-recovery' ? '1870' : process.argv[3] === '--exit-interview' ? '1869' : '1887,1888,1889,1890,1891,1892';
const state = JSON.parse((await fs.readFile(statePath, 'utf8')).replace(/^\uFEFF/, ''));
assert.equal(await fs.realpath(state.run), directory);
assert.equal(state.status, 'RUNNING');
assert.ok(Number.isInteger(state.mysqlPort) && state.mysqlPort > 1024 && state.mysqlPort < 65536);
const environment = { ...process.env };
delete environment.MYSQL_PWD;
const database = statement => {
  const result = spawnSync('mysql.exe', ['--no-defaults', '--protocol=TCP', '--host=127.0.0.1', `--port=${state.mysqlPort}`, '--user=root',
    '--batch', '--raw', '--skip-column-names', '--default-character-set=utf8mb4', 'cloud_flow_db'], { input: statement, encoding: 'utf8', timeout: 30000, windowsHide: true, env: environment });
  assert.equal(result.status, 0, 'Owned referral cache inventory query failed');
  return result.stdout.trim();
};
assert.equal(await fs.realpath(database('SELECT @@datadir;')), await fs.realpath(path.join(directory, 'mysql-data')));
const roles = database(`SELECT DISTINCT tenant_id,role_id FROM sys_role_menu WHERE menu_id IN (${menuIds}) ORDER BY tenant_id,role_id;`);
const users = database(`SELECT DISTINCT user.tenant_id,user.user_id,user.user_name FROM sys_user user
  JOIN sys_user_role binding ON binding.tenant_id=user.tenant_id AND binding.user_id=user.user_id
  JOIN sys_role_menu menu ON menu.tenant_id=binding.tenant_id AND menu.role_id=binding.role_id
  WHERE menu.menu_id IN (${menuIds}) AND user.deleted=0 ORDER BY user.tenant_id,user.user_id;`);
const keys = new Set();
for (const row of roles.split(/\r?\n/).filter(Boolean)) {
  const [tenantId, roleId] = row.split('\t');
  assert.match(tenantId, /^[1-9][0-9]*$/); assert.match(roleId, /^[1-9][0-9]*$/);
  keys.add(`${tenantId}:menu_details::${roleId}`);
  keys.add(`${tenantId}:menu_details::perms:${roleId}`);
}
for (const row of users.split(/\r?\n/).filter(Boolean)) {
  const [tenantId, userId, username] = row.split('\t');
  assert.match(tenantId, /^[1-9][0-9]*$/); assert.match(userId, /^[1-9][0-9]*$/); assert.ok(username);
  keys.add(`${tenantId}:user_details::${tenantId}:${username}`);
  keys.add(`${tenantId}:user_menus::${userId}`);
}
const redis = await ownedGatewayRedis(state);
const deleted = keys.size ? Number(redis('DEL', ...keys)) : 0;
assert.ok(Number.isInteger(deleted) && deleted >= 0 && deleted <= keys.size);
if (process.argv[3] === '--employee-certificate') {
  console.log(`EMPLOYEE_CERTIFICATE_CACHE_REFRESH: exact_keys=${keys.size}; deleted=${deleted}; database_writes=0; session_keys_targeted=0; rate_limit_keys_targeted=0; production_modified=false`);
  process.exit(0);
}
console.log(`H2_${process.argv[3] === '--severance-policy' ? 'SEVERANCE_POLICY' : process.argv[3] === '--advance-submit' ? 'ADVANCE_SUBMIT' : process.argv[3] === '--training-recovery' ? 'TRAINING_RECOVERY' : process.argv[3] === '--exit-interview' ? 'EXIT_INTERVIEW' : 'REFERRAL'}_MENU_CACHE_REFRESH: affected_roles=${roles.split(/\r?\n/).filter(Boolean).length}; affected_users=${users.split(/\r?\n/).filter(Boolean).length}; exact_cache_keys=${keys.size}; deleted=${deleted}; database_writes=0; session_keys_targeted=0; rate_limit_keys_targeted=0; production_modified=false`);
