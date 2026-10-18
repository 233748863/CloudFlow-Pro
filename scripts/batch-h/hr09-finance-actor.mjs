import { api, success, check, jsonRows, sqlText, readFixture, saveFixture } from './live-lib.mjs';
import { openHr09Actors } from './hr09-actors.mjs';

function actorSnapshot(userId) {
  const found = jsonRows(`SELECT JSON_OBJECT('userId',CAST(user_id AS CHAR),'deptId',CAST(dept_id AS CHAR),
    'status',status,'version',version) FROM sys_user WHERE tenant_id=100000 AND user_id=${sqlText(userId)} AND deleted=0`);
  check('隔离财务借用身份真实存在且唯一', found.length === 1);
  const roleIds = jsonRows(`SELECT JSON_OBJECT('id',CAST(role_id AS CHAR)) FROM sys_user_role
    WHERE tenant_id=100000 AND user_id=${sqlText(userId)} ORDER BY role_id`).map(row => row.id);
  const postIds = jsonRows(`SELECT JSON_OBJECT('id',CAST(post_id AS CHAR)) FROM sys_user_post
    WHERE tenant_id=100000 AND user_id=${sqlText(userId)} ORDER BY post_id`).map(row => row.id);
  return { ...found[0], roleIds, postIds };
}

export function actorRolePayload(snapshot, roleId) {
  if (!snapshot || !/^[1-9][0-9]*$/.test(snapshot.userId) || !/^[1-9][0-9]*$/.test(snapshot.deptId)
    || !Number.isInteger(snapshot.version) || snapshot.version < 0 || snapshot.status !== '0'
    || !['2', '3'].includes(roleId) || snapshot.roleIds?.length !== 1 || !['2', '3'].includes(snapshot.roleIds[0])) {
    throw new Error('H_HR_FINANCE_IDENTITY_INVALID');
  }
  return { userId: snapshot.userId, version: snapshot.version, deptId: snapshot.deptId, status: snapshot.status, roleIds: [roleId] };
}

function unchangedIdentity(actual, original, roleId) {
  return actual.userId === original.userId && actual.deptId === original.deptId && actual.status === original.status
    && JSON.stringify(actual.postIds) === JSON.stringify(original.postIds)
    && actual.roleIds.length === 1 && actual.roleIds[0] === roleId;
}

async function replaceRole(sessions, snapshot, roleId) {
  if (snapshot.roleIds.length === 1 && snapshot.roleIds[0] === roleId) return;
  success(await api(sessions.admin.page, '/auth/system/user', { method: 'PUT', body: actorRolePayload(snapshot, roleId) }),
    '真实配置接口切换专属身份单一角色');
}

export async function openHr09Finance(context) {
  const { fixture, sessions, save } = context;
  const identities = await readFixture('hr09-actors');
  const account = identities.accounts?.manager;
  check('财务仅借用本组专属主管身份', account?.username === 'h_20260914_hr09manager' && account.roleId === '2'
    && account.deptId === sessions.accounts.employee.deptId && Boolean(account.userId));
  const before = actorSnapshot(account.userId);
  check('借用前主管仅含既有主管单角色', before.roleIds.length === 1 && before.roleIds[0] === '2' && before.status === '0');
  const financeRole = jsonRows(`SELECT JSON_OBJECT('roleId',CAST(role_row.role_id AS CHAR)) FROM sys_role role_row
    JOIN sys_user_role binding ON binding.tenant_id=role_row.tenant_id AND binding.role_id=role_row.role_id
    JOIN sys_user user_row ON user_row.tenant_id=binding.tenant_id AND user_row.user_id=binding.user_id
    WHERE role_row.tenant_id=100000 AND role_row.role_id=3 AND role_row.status='0' AND role_row.deleted=0
      AND user_row.user_id=3 AND user_row.status='0' AND user_row.deleted=0`);
  check('财务角色沿用现有启用角色及真实来源账号', financeRole.length === 1);
  fixture.financialIdentity = { original: before, restorationRequired: true };
  await save();
  await replaceRole(sessions, before, '3');
  check('财务仅保留单一既有角色且部门岗位未变', unchangedIdentity(actorSnapshot(account.userId), before, '3'));
  identities.accounts.finance = { ...account, roleId: '3', sourceUserId: '3', borrowedFrom: 'manager' };
  delete identities.accounts.finance.storageState;
  await saveFixture('hr09-actors', identities);
  await openHr09Actors(sessions, ['finance'], account.deptId);
  sessions.manager = sessions.finance;
  sessions.accounts.manager = { ...sessions.accounts.finance, name: 'manager' };
}

export async function restoreHr09Finance(context) {
  const { fixture, sessions, save } = context;
  const state = fixture?.financialIdentity;
  if (!state) return;
  if (state.restorationRequired) {
    const current = actorSnapshot(state.original.userId);
    await replaceRole(sessions, current, state.original.roleIds[0]);
  }
  const restored = actorSnapshot(state.original.userId);
  check('专属身份角色部门启用状态及岗位精确恢复', unchangedIdentity(restored, state.original, state.original.roleIds[0]));
  state.restorationRequired = false;
  state.restorationEvidence = { checkedAt: new Date().toISOString(), exact: true, userId: restored.userId,
    roleIds: restored.roleIds, deptId: restored.deptId, status: restored.status, sharedAccountsChanged: false, quotaChanged: false };
  await save();
}
