import { randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { assertRuntime, api, success, check, jsonRows, sqlText, readFixture, saveFixture, privateDirectory, frontendUrl, pause } from './live-lib.mjs';
import { authenticate, changeInitialPassword, readIdentity } from './browser-auth.mjs';

export const hr09ActorDefinitions = {
  manager: { roleId: '2', sourceUserId: '2' },
  hrpeer: { roleId: '4', sourceUserId: '4' },
  finance: { roleId: '3', sourceUserId: '3' },
  payapprover: { roleId: '3', sourceUserId: '3' },
  periodemployee: { roleId: '5', sourceUserId: '5' },
};

export async function openHr09Actors(sessions, names, departmentId) {
  if (!names.length) return;
  const store = await readFixture('hr09-actors');
  store.accounts ||= {};
  const lockPath = path.join(privateDirectory, 'identity.lock');
  const deadline = Date.now() + 180000;
  let handle;
  let lastAttemptAt = 0;
  while (!handle) {
    assertRuntime();
    try { handle = await fs.open(lockPath, 'wx', 0o600); }
    catch (error) {
      if (error.code !== 'EEXIST') throw new Error('H_HR_IDENTITY_LOCK_FAILED');
      if (Date.now() >= deadline) throw new Error('H_HR_IDENTITY_LOCK_BUSY');
      await pause(500);
    }
  }
  try {
    await handle.writeFile(JSON.stringify({ processId: process.pid, purpose: 'hr09-api-actors' }));
    for (const name of [...new Set(names)]) {
      const definition = Object.hasOwn(hr09ActorDefinitions, name) ? hr09ActorDefinitions[name] : null;
      if (!definition) throw new Error('H_HR_ACTOR_UNKNOWN');
      const roles = jsonRows(`SELECT JSON_OBJECT('roleId',CAST(role_row.role_id AS CHAR)) FROM sys_role role_row
        JOIN sys_user_role binding ON binding.role_id=role_row.role_id AND binding.tenant_id=role_row.tenant_id
        JOIN sys_user user_row ON user_row.user_id=binding.user_id AND user_row.tenant_id=role_row.tenant_id
        WHERE role_row.tenant_id=100000 AND role_row.role_id=${sqlText(definition.roleId)} AND role_row.status='0' AND role_row.deleted=0
          AND user_row.user_id=${sqlText(definition.sourceUserId)} AND user_row.status='0' AND user_row.deleted=0`);
      check('专属审批身份只复用既有有效角色', roles.length === 1, { actor: name, roleId: definition.roleId });
      let account = store.accounts[name];
      if (!account) {
        account = { username: `h_20260914_hr09${name}`, password: `H9a${randomBytes(20).toString('hex')}`,
          replacement: `H9b${randomBytes(20).toString('hex')}`, tenantCode: 'xinyuan', tenantId: '100000',
          deptId: String(departmentId), roleId: definition.roleId, sourceUserId: definition.sourceUserId };
        store.accounts[name] = account;
        await saveFixture('hr09-actors', store);
      }
      check('专属审批身份角色及部门固定', account.roleId === definition.roleId && account.deptId === String(departmentId));
      const lookup = () => jsonRows(`SELECT JSON_OBJECT('userId',CAST(user_id AS CHAR),'deptId',CAST(dept_id AS CHAR),'status',status)
        FROM sys_user WHERE tenant_id=100000 AND user_name=${sqlText(account.username)} AND deleted=0`);
      let users = lookup();
      check('专属审批身份无重名或缺失重建', users.length <= 1 && (!account.userId || users.length === 1));
      if (!users.length) {
        success(await api(sessions.admin.page, '/auth/system/user', { method: 'POST', body: {
          userName: account.username, nickName: `H-20260914 HR09 ${name}`,
          deptId: account.deptId, roleIds: [account.roleId], status: '0', sex: '2', remark: 'HR09隔离验收身份，仅复用既有角色',
        } }), '真实接口创建HR09隔离审批身份');
        users = lookup();
      }
      check('专属审批身份真实创建且同部门有效', users.length === 1 && users[0].deptId === account.deptId && users[0].status === '0');
      account.userId = users[0].userId;
      const bindings = jsonRows(`SELECT JSON_OBJECT('roleId',CAST(role_id AS CHAR)) FROM sys_user_role
        WHERE tenant_id=100000 AND user_id=${sqlText(account.userId)} ORDER BY role_id`);
      check('专属审批身份未增加额外角色或权限', bindings.length === 1 && bindings[0].roleId === account.roleId);
      if (!account.passwordConfigured) {
        if (!/^[A-Za-z0-9]+$/.test(account.password)) account.password = `H9a${randomBytes(20).toString('hex')}`;
        if (!/^[A-Za-z0-9]+$/.test(account.replacement)) account.replacement = `H9b${randomBytes(20).toString('hex')}`;
        await saveFixture('hr09-actors', store);
        success(await api(sessions.admin.page, `/auth/system/user/${account.userId}/password`, {
          method: 'PUT', body: { password: account.password },
        }), '真实专用接口设置隔离审批账号初始凭据');
        account.passwordConfigured = true;
      }
      await saveFixture('hr09-actors', store);
      const context = await sessions.browser.newContext({ baseURL: frontendUrl, serviceWorkers: 'block',
        ...(account.storageState ? { storageState: account.storageState } : {}) });
      const page = await context.newPage();
      page.setDefaultTimeout(30000);
      await page.goto('/login', { waitUntil: 'domcontentloaded' });
      let information = account.storageState ? await readIdentity(page) : null;
      if (!information || information.userId !== account.userId || information.tenantId !== account.tenantId) {
        await pause(13000);
        lastAttemptAt = Date.now();
        const result = await authenticate(page, account);
        if (result.reason === 'INITIAL_PASSWORD_CHANGE_REQUIRED') {
          await changeInitialPassword(page, account);
          account.password = account.replacement;
          await saveFixture('hr09-actors', store);
        } else check('专属审批身份通过真实验证码及登录', result.authenticated === true, { actor: name, reason: result.reason });
        information = await readIdentity(page);
      }
      check('专属审批会话身份部门与角色依据一致', information?.userId === account.userId
        && information?.tenantId === account.tenantId && information?.deptId === account.deptId && !information?.forcePasswordChange);
      account.storageState = await context.storageState();
      await saveFixture('hr09-actors', store);
      const publicAccount = { name, userId: account.userId, roleId: account.roleId, deptId: account.deptId,
        tenantId: account.tenantId, sourceUserId: account.sourceUserId };
      sessions[name] = { page, context, information, account: publicAccount };
      sessions.accounts[name] = publicAccount;
    }
  } finally {
    if (lastAttemptAt) await pause(Math.max(0, 13000 - (Date.now() - lastAttemptAt)));
    await handle.close();
    await fs.unlink(lockPath);
  }
}
