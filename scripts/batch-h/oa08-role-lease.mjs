import fs from 'node:fs/promises';
import path from 'node:path';
import { check, jsonRows, pause, prefix, privateDirectory, readFixture, saveFixture, sqlText } from './live-lib.mjs';
import { id } from './oa08-live.mjs';

export const leasedRoles = new Set(['6', '9', '10', '11']);
const username = 'h_20260914_oa08r2';
const fixtureName = 'oa08-owned-role';

async function ownedSource(live) {
  const identities = await readFixture('oa08-identities');
  const account = identities.accounts?.manager2;
  const shared = JSON.parse(await fs.readFile(path.join(privateDirectory, 'accounts.private.json'), 'utf8')).payload;
  check('角色轮换只使用未列入共享身份的OA独占账号', identities.milestone === prefix && account?.username === username
    && account.roleId === '2' && account.tenantId === live.tenantId && account.passwordInitialized && !account.borrowed
    && !!account.userId && !Object.values(shared.identities || {}).some(value => String(value.userId) === account.userId));
  return { account, identities };
}

function bindings(live, userId) {
  return jsonRows(`SELECT JSON_OBJECT('role', CAST(role_id AS CHAR)) FROM sys_user_role
    WHERE tenant_id = ${sqlText(live.tenantId)} AND user_id = ${sqlText(id(userId))} ORDER BY role_id`).map(row => row.role);
}

function profile(user) {
  return JSON.stringify({ api: Object.fromEntries(['userName', 'tenantId', 'deptId', 'nickName', 'email', 'phonenumber', 'sex',
    'status', 'deleted', 'pwdResetRequired', 'remark'].map(key => [key, user[key] == null ? null : String(user[key])])),
  stored: user.oaStoredProfile });
}

async function ownedUser(live, account) {
  const current = await live.ok('admin', `/auth/system/user/${id(account.userId)}`);
  const persisted = jsonRows(`SELECT JSON_OBJECT('ready', user_name = ${sqlText(username)} AND remark = ${sqlText(`${prefix} OA08独立权限验收`)}
      AND status = '0' AND deleted = 0 AND pwd_reset_required = '0', 'profile', SHA2(CAST(JSON_OBJECT('userId', user_id,
      'userName', user_name, 'tenantId', tenant_id, 'deptId', dept_id, 'nickName', nick_name, 'email', email,
      'phonenumber', phonenumber, 'sex', sex, 'status', status, 'deleted', deleted, 'pwdResetRequired', pwd_reset_required,
      'remark', remark, 'avatar', avatar) AS CHAR), 256)) FROM sys_user
    WHERE tenant_id = ${sqlText(live.tenantId)} AND user_id = ${sqlText(id(account.userId))}`);
  check('角色操作前核对OA独占克隆归属及真实初密状态', String(current.userId) === account.userId && current.userName === username
    && String(current.tenantId) === live.tenantId && current.remark === `${prefix} OA08独立权限验收` && current.status === '0'
    && String(current.deleted) === '0' && ['0', '******'].includes(String(current.pwdResetRequired))
    && persisted.length === 1 && [true, 1].includes(persisted[0].ready) && /^[a-f0-9]{64}$/.test(persisted[0].profile));
  return { ...current, oaStoredProfile: persisted[0].profile };
}

async function acquire(live) {
  if (live.ownedRoleLock) return;
  const filename = path.join(privateDirectory, 'oa08-owned-role.lock');
  let handle;
  try { handle = await fs.open(filename, 'wx', 0o600); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const previous = JSON.parse(await fs.readFile(filename, 'utf8'));
    if (!Number.isSafeInteger(previous.pid) || previous.pid < 1 || previous.username !== username) throw new Error('H_OA_ROLE_LOCK_INVALID');
    try { process.kill(previous.pid, 0); throw new Error('H_OA_OWNED_IDENTITY_IN_USE'); }
    catch (inspection) { if (inspection.code !== 'ESRCH') throw inspection; }
    await fs.unlink(filename);
    handle = await fs.open(filename, 'wx', 0o600);
  }
  await handle.writeFile(JSON.stringify({ pid: process.pid, username, phase: live.phase || 'restore', startedAt: new Date().toISOString() }));
  live.ownedRoleLock = { handle, filename };
}

async function closeOwnedSessions(live, account, identities) {
  const contexts = new Set();
  for (const [name, session] of Object.entries(live.sessions)) {
    if (session?.account?.userId !== account.userId) continue;
    if (session.context) contexts.add(session.context);
    delete live.sessions[name];
    delete live.sessions.accounts[name];
  }
  for (const context of contexts) await context.close();
  delete identities.accounts.manager2.storageState;
  await saveFixture('oa08-identities', identities);
}

async function persist(live, state) {
  await saveFixture(fixtureName, state);
  live.fixture.ownedRoleRestoration = { pending: state.pending === true, originalRole: '2',
    verifiedByApiAndSql: state.verifiedByApiAndSql === true, restoredAt: state.restoredAt };
  await live.persist();
}

export async function restoreOwnedRole(live, release = true) {
  const state = await readFixture(fixtureName);
  try {
    if (!state.pending) return;
    await acquire(live);
    const { account, identities } = await ownedSource(live);
    check('角色恢复资料仅对应本次OA独占账号', state.milestone === prefix && state.userId === account.userId
      && state.tenantId === live.tenantId && state.originalRole === '2' && leasedRoles.has(state.targetRole));
    const current = await ownedUser(live, account);
    const actual = bindings(live, account.userId);
    check('恢复前角色及账号资料没有被其他操作者接管', profile(current) === state.originalProfile && actual.length === 1
      && ['2', state.targetRole].includes(actual[0]) && JSON.stringify((current.roleIds || []).map(String)) === JSON.stringify(actual));
    await closeOwnedSessions(live, account, identities);
    if (actual[0] !== '2') {
      await pause(5200);
      const updated = await live.ok('admin', '/auth/system/user', 'PUT', { userId: account.userId, version: current.version, roleIds: ['2'] });
      check('通过真实管理API恢复OA独占账号原角色', updated === 1);
    }
    const restored = await ownedUser(live, account);
    check('OA独占账号角色恢复由API及只读SQL双重确认', profile(restored) === state.originalProfile
      && JSON.stringify((restored.roleIds || []).map(String)) === '["2"]' && JSON.stringify(bindings(live, account.userId)) === '["2"]');
    state.pending = false;
    state.verifiedByApiAndSql = true;
    state.restoredAt = new Date().toISOString();
    await persist(live, state);
  } finally {
    if (release && live.ownedRoleLock && !state.pending) {
      const lock = live.ownedRoleLock;
      delete live.ownedRoleLock;
      await lock.handle.close();
      await fs.unlink(lock.filename);
    }
  }
}

export async function borrowOwnedRole(live, name, roleId) {
  if (live.phase !== 'matrix' || process.env.CLOUDFLOW_H_OA_MATRIX_ALLOWED !== '1' || !leasedRoles.has(roleId)) {
    throw new Error('H_OA_ROLE_MATRIX_MAINLINE_RELEASE_REQUIRED');
  }
  await acquire(live);
  await restoreOwnedRole(live, false);
  const { account, identities } = await ownedSource(live);
  const current = await ownedUser(live, account);
  check('OA独占账号轮换前原角色为2且未改变配额', JSON.stringify(bindings(live, account.userId)) === '["2"]'
    && JSON.stringify((current.roleIds || []).map(String)) === '["2"]');
  await closeOwnedSessions(live, account, identities);
  const state = { milestone: prefix, userId: account.userId, tenantId: live.tenantId, originalRole: '2', targetRole: roleId,
    originalProfile: profile(current), pending: true, verifiedByApiAndSql: false, startedAt: new Date().toISOString() };
  await persist(live, state);
  await pause(5200);
  const updated = await live.ok('admin', '/auth/system/user', 'PUT', { userId: account.userId, version: current.version, roleIds: [roleId] });
  const changed = await ownedUser(live, account);
  check(`OA独占账号经真实API临时持有既有角色${roleId}`, updated === 1 && profile(changed) === state.originalProfile
    && JSON.stringify((changed.roleIds || []).map(String)) === JSON.stringify([roleId])
    && JSON.stringify(bindings(live, account.userId)) === JSON.stringify([roleId]));
  return { ...account, name, roleId, storageState: undefined, ownedLease: true };
}
