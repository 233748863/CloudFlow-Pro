import { randomBytes } from 'node:crypto';
import { authenticate, changeInitialPassword, readIdentity } from './browser-auth.mjs';
import { check, frontendUrl, jsonRows, pause, prefix, readFixture, saveFixture, sqlText } from './live-lib.mjs';
import { id, records, roles } from './oa08-live.mjs';
import { borrowOwnedRole, leasedRoles, restoreOwnedRole } from './oa08-role-lease.mjs';

function assignedRoles(account) {
  return jsonRows(`SELECT JSON_OBJECT('roleId', CAST(role_id AS CHAR)) FROM sys_user_role
    WHERE tenant_id = ${sqlText(account.tenantId)} AND user_id = ${sqlText(account.userId)} ORDER BY role_id`);
}

function passwordState(account) {
  return jsonRows(`SELECT JSON_OBJECT('resetRequired', pwd_reset_required) FROM sys_user WHERE tenant_id = ${sqlText(account.tenantId)}
    AND user_id = ${sqlText(account.userId)} AND user_name = ${sqlText(account.username)} AND deleted = 0 AND status = '0'`);
}

export async function ensureRoles(live, selected = roles) {
  let fixture = await readFixture('oa08-identities');
  fixture.accounts ||= {};
  fixture.milestone ||= prefix;
  check('OA角色身份恢复资料属于H测试', fixture.milestone === prefix);
  for (let roleIndex = 0; roleIndex < roles.length; roleIndex++) {
    const name = roles[roleIndex];
    if (!selected.includes(name)) continue;
    const roleId = String(roleIndex + 1);
    if (live.sessions[name]) {
      const bindings = assignedRoles(live.sessions.accounts[name]);
      check(`复用角色${roleId}既有会话且不修改其绑定`, bindings.length === 1 && bindings[0].roleId === roleId);
      continue;
    }
    let account = fixture.accounts[name];
    if (!account?.userId) {
      if (!leasedRoles.has(roleId)) throw new Error('H_OA_OWNED_ROLE_IDENTITY_REQUIRED');
      account = await borrowOwnedRole(live, name, roleId);
      fixture = await readFixture('oa08-identities');
    }
    if (account.borrowed) throw new Error('H_OA_FORMAL_IDENTITY_BORROWING_DISABLED');
    if (!account.ownedLease) {
      check('仅初始化OA独占测试账号凭据', /^h_20260914_oa08r(?:[1-9]|10|11)$/.test(account.username));
      const users = records(await live.ok('admin', `/auth/system/user/list?${new URLSearchParams({ userName: account.username })}`))
        .filter(user => user.userName === account.username);
      check('仅复用已持久保存的独立H角色账号', users.length === 1 && String(users[0].tenantId) === live.tenantId
        && (!account.userId || account.userId === String(users[0].userId)) && users[0].remark === `${prefix} OA08独立权限验收`);
      account.userId = id(users[0].userId);
      if (account.changePending && passwordState(account)[0]?.resetRequired === '0') {
        account.password = account.replacement;
        account.changePending = false;
        account.passwordInitialized = true;
      }
      if (!account.passwordInitialized) {
        if (!/^[A-Za-z0-9]+$/.test(account.password)) {
          account.password = `${randomBytes(20).toString('hex')}A1`;
          account.replacement = `${randomBytes(20).toString('hex')}B2`;
          await saveFixture('oa08-identities', fixture);
        }
        await live.ok('admin', `/auth/system/user/${account.userId}/password`, 'PUT', { password: account.password });
        account.passwordInitialized = true;
      }
    }
    const bindings = assignedRoles(account);
    check(`角色${roleId}真实用户仅绑定既有单一角色`, bindings.length === 1 && bindings[0].roleId === roleId);
    await saveFixture('oa08-identities', fixture);
    const context = await live.sessions.browser.newContext({ baseURL: frontendUrl, ...(account.storageState ? { storageState: account.storageState } : {}) });
    const page = await context.newPage();
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    let information = await readIdentity(page);
    if (!information || information.userId !== account.userId || information.tenantId !== account.tenantId || information.forcePasswordChange) {
      await pause(13500);
      const result = await authenticate(page, account);
      if (result.reason === 'INITIAL_PASSWORD_CHANGE_REQUIRED') {
        if (account.ownedLease) throw new Error('H_OA_OWNED_LEASE_PASSWORD_STATE_CHANGED');
        account.changePending = true;
        if (account.borrowed) {
          account.restorationPending = true;
          account.restoredByApiAndSql = false;
        }
        await saveFixture('oa08-identities', fixture);
        await changeInitialPassword(page, account);
        account.password = account.replacement;
        account.changePending = false;
      } else {
        if (result.authenticated !== true) throw new Error(`H_OA_LOGIN_${/^[A-Z_]+$/.test(result.reason || '') ? result.reason : 'FAILED'}`);
        if (account.borrowed && !account.restorationPending) throw new Error('H_OA_EXISTING_IDENTITY_STATE_CHANGED');
      }
      information = await readIdentity(page);
    }
    check(`角色${roleId}真实登录用户与租户核对`, information?.userId === account.userId && information?.tenantId === account.tenantId && !information.forcePasswordChange);
    account.storageState = await context.storageState();
    await saveFixture('oa08-identities', fixture);
    const view = { name, roleId, userId: account.userId, deptId: account.deptId, tenantId: account.tenantId, tenantCode: account.tenantCode };
    live.sessions[name] = { page, context, information, account: view };
    live.sessions.accounts[name] = view;
  }
}

export async function restoreRoleIdentities(live) {
  const fixture = await readFixture('oa08-identities');
  const failures = [];
  try { await restoreOwnedRole(live); } catch (error) { failures.push(error); }
  for (const account of Object.values(fixture.accounts || {})) {
    if (!account.borrowed || !account.restorationPending) continue;
    try {
      const bindings = assignedRoles(account);
      check('还原借用账号前确认原租户角色及身份未变', account.tenantId === live.tenantId && bindings.length === 1
        && bindings[0].roleId === account.roleId && passwordState(account).length === 1 && account.originalResetRequired === '1');
      await pause(5200);
      await live.ok('admin', `/auth/system/user/${account.userId}/password`, 'PUT', { password: account.originalPassword });
      const restored = await live.ok('admin', `/auth/system/user/${account.userId}`);
      check('原账号初密及首次改密要求由API与只读SQL核对恢复', String(restored.pwdResetRequired) === '1'
        && passwordState(account)[0]?.resetRequired === '1' && assignedRoles(account)[0]?.roleId === account.roleId);
      account.password = account.originalPassword;
      account.changePending = false;
      account.restorationPending = false;
      account.restoredByApiAndSql = true;
      account.restoredAt = new Date().toISOString();
      delete account.storageState;
      await saveFixture('oa08-identities', fixture);
      if (live.sessions[account.name]?.context) await live.sessions[account.name].context.close();
      delete live.sessions[account.name];
      delete live.sessions.accounts[account.name];
    } catch (error) { failures.push(error); }
  }
  const borrowed = Object.values(fixture.accounts || {}).filter(account => account.borrowed && (account.restorationPending || account.restoredAt));
  live.fixture.identityRestoration = { pending: borrowed.filter(account => account.restorationPending).length,
    restored: borrowed.filter(account => account.restoredByApiAndSql && !account.restorationPending).length,
    verifiedByApiAndSql: borrowed.every(account => account.restoredByApiAndSql && !account.restorationPending) };
  await live.persist();
  if (failures.length) throw failures[0];
}
