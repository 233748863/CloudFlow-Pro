import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {authenticateD2PrivacyAccount} from './d2-privacy-browser-auth.mjs';

async function roleApi(runtime, roleId, method, body) {
  assert.match(String(roleId), /^[1-9][0-9]*$/);
  const url = '/auth/system/role' + (method === 'GET' ? '/' + roleId : '');
  const response = await runtime.sessions.admin.page.evaluate(async supplied => {
    const token = (await import('/src/utils/authStorage.ts')).getAuthToken();
    const headers = {Authorization: token.startsWith('Bearer ') ? token : 'Bearer ' + token};
    const csrf = document.cookie.split(';').map(value => value.trim()).find(value => value.startsWith('XSRF-TOKEN='));
    if (csrf) headers['X-CSRF-Token'] = decodeURIComponent(csrf.slice(11));
    if (supplied.body !== undefined) headers['Content-Type'] = 'application/json';
    const result = await fetch('/api' + supplied.url, {method: supplied.method, headers, credentials: 'same-origin', ...(supplied.body === undefined ? {} : {body: JSON.stringify(supplied.body)})});
    return {status: result.status, body: await result.json(), traceId: result.headers.get('X-Trace-Id')};
  }, {url, method, body});
  runtime.requests.push({actor: 'admin-role-fixture', path: url, method, status: response.status, code: response.body?.code, traceId: response.traceId});
  return runtime.success(response, 'owned_simulator_role_' + method);
}

export async function grantSimulatorPermission(runtime, fixture, save) {
  const manager = runtime.sessions.manager;
  if (manager.identity.permissions.includes('hr:compensation:list') || manager.identity.permissions.includes('*:*:*')) return;
  const denied = await runtime.api('manager', '/hr/compensation/simulate', {method: 'POST', body: {structureId: fixture.structureId}});
  runtime.check('ungranted_simulator_permission_denied', denied.status === 403);
  assert.match(manager.identity.userId, /^[1-9][0-9]*$/);
  const roleId = runtime.database('SELECT role_id FROM sys_user_role WHERE tenant_id=100000 AND user_id=' + manager.identity.userId + ' ORDER BY role_id');
  assert.match(roleId, /^[1-9][0-9]*$/, 'One owned manager role required');
  const menuId = runtime.database("SELECT menu_id FROM sys_menu WHERE menu_id=726 AND perms='hr:compensation:list' AND status='0' AND menu_type='C' AND path='/hr/compensation'");
  assert.equal(menuId, '726', 'Existing compensation page permission required');
  const role = await roleApi(runtime, roleId, 'GET');
  assert.ok(Array.isArray(role.menuIds) && !role.menuIds.map(String).includes(menuId));
  fixture.roleGrant = {roleId, menuId, originalMenuIds: role.menuIds}; save();
  await roleApi(runtime, roleId, 'PUT', {...role, menuIds: [...role.menuIds, Number(menuId)]});
  const account = JSON.parse(fs.readFileSync(path.join(runtime.run, 'private/accounts.json'), 'utf8')).find(value => value.username === 'g_holiday_manager'); assert.ok(account);
  // The five initial logins fill the existing IP limit of five logins per 60 seconds.
  // Let the real window expire before authenticating the updated role; never alter counters.
  console.log('D3_SIMULATOR_AUTH_WINDOW_WAIT: seconds=61; counter_writes=0');
  await delay(30000);
  await delay(31000);
  const identity = await authenticateD2PrivacyAccount(manager.page, account, new URL(manager.page.url()).origin);
  runtime.check('manager_reauthenticated_after_temporary_grant', identity.authenticated && identity.tenantId === '100000');
  const token = await manager.page.evaluate(async () => (await import('/src/utils/authStorage.ts')).getAuthToken());
  runtime.sensitive.add(token); runtime.sensitive.add(token.replace(/^Bearer /, '')); manager.identity = identity;
}

export async function restoreSimulatorPermission(runtime, fixture, save) {
  if (!fixture.roleGrant) { fixture.roleGrantRestored = true; save(); return; }
  const grant = fixture.roleGrant;
  const role = await roleApi(runtime, grant.roleId, 'GET');
  const original = grant.originalMenuIds.map(String).sort();
  const current = role.menuIds.map(String).filter(value => value !== grant.menuId).sort();
  assert.deepEqual(current, original, 'Only the owned simulation grant may be removed');
  await roleApi(runtime, grant.roleId, 'PUT', {...role, menuIds: grant.originalMenuIds});
  const restored = await roleApi(runtime, grant.roleId, 'GET');
  runtime.check('original_manager_menu_grants_restored', JSON.stringify(restored.menuIds.map(String).sort()) === JSON.stringify(original));
  fixture.roleGrantRestored = true; save();
}
