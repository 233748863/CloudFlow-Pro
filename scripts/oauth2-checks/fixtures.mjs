import assert from 'node:assert/strict';

export async function prepareOauthActors(context, authenticate = true) {
  const { database, literal, caseTag, fixture, cleanups, login, check } = context;
  const roles = [];
  const people = [];
  const prefix = `h5o_${caseTag}_`;
  cleanups.push(async () => {
    for (const person of people) {
      database(`DELETE FROM sys_user_role WHERE tenant_id=${person.tenantId} AND user_id=${person.userId};
        DELETE FROM sys_user WHERE tenant_id=${person.tenantId} AND user_id=${person.userId} AND user_name=${literal(person.username)};`);
    }
    for (const role of roles) {
      database(`DELETE FROM sys_role_menu WHERE tenant_id=${role.tenantId} AND role_id=${role.roleId};
        DELETE FROM sys_role WHERE tenant_id=${role.tenantId} AND role_id=${role.roleId} AND role_key LIKE ${literal(`${prefix}%`)};`);
    }
    check('独立OAuth测试人员及角色已清理，既有账号未修改', database(`SELECT COUNT(*) FROM sys_user WHERE user_name LIKE ${literal(`${prefix}%`)};`) === '0'
      && database(`SELECT COUNT(*) FROM sys_role WHERE role_key LIKE ${literal(`${prefix}%`)};`) === '0');
  });
  const identifier = statement => { const result = database(statement); assert.match(result, /^[1-9][0-9]*$/); return result; };
  const role = (suffix, tenantId = 100000, service = false) => {
    const roleId = identifier(`INSERT INTO sys_role (tenant_id,role_name,role_key,role_sort,data_scope,ds_type,status,deleted)
      VALUES (${tenantId},${literal(prefix + suffix)},${literal(prefix + suffix)},999,'2',4,'0',0); SELECT LAST_INSERT_ID();`);
    roles.push({ roleId, tenantId });
    if (service) {
      database(`INSERT INTO sys_role_menu (tenant_id,role_id,menu_id) SELECT ${tenantId},${roleId},menu_id FROM sys_menu
        WHERE perms IN ('crm:customer:list','workflow:process:view','system:auth:info','system:auth:logout');`);
    } else {
      database(`INSERT INTO sys_role_menu (tenant_id,role_id,menu_id) SELECT ${tenantId},${roleId},menu_id FROM sys_role_menu WHERE tenant_id=100000 AND role_id=5;`);
    }
    return roleId;
  };
  const person = (suffix, roleId, tenantId = 100000, fixedId = null) => {
    const source = tenantId === 100000 ? 'g_holiday_employee' : 'g_import_tenant';
    const username = prefix + suffix;
    if (fixedId != null) assert.equal(database(`SELECT COUNT(*) FROM sys_user WHERE user_id=${fixedId};`), '0');
    const inserted = identifier(`INSERT INTO sys_user (${fixedId == null ? '' : 'user_id,'}tenant_id,dept_id,user_name,nick_name,password,status,deleted,pwd_reset_required,create_by,create_time)
      SELECT ${fixedId == null ? '' : `${fixedId},`}tenant_id,dept_id,${literal(username)},${literal(username)},password,'0',0,'0','oauth2-fixture',NOW()
      FROM sys_user WHERE tenant_id=${tenantId} AND user_name=${literal(source)} AND deleted=0; SELECT ${fixedId == null ? 'LAST_INSERT_ID()' : fixedId};`);
    const result = { userId: inserted, username, source, tenantId, roleId, deptId: tenantId === 100000 ? 100 : 990000101 };
    people.push(result);
    database(`INSERT INTO sys_user_role (tenant_id,user_id,role_id) VALUES (${tenantId},${inserted},${roleId});`);
    return result;
  };
  const service = person('service', role('service', 100000, true), 100000, fixture.serviceUserId);
  const own = person('own', role('own'));
  const peer = person('peer', own.roleId);
  const foreign = person('foreign', role('foreign', 100001), 100001);
  const revocable = person('revocable', role('revocable'));
  if (authenticate) {
    own.page = await login(own.username, own.source);
    peer.page = await login(peer.username, peer.source);
    foreign.page = await login(foreign.username, foreign.source);
    revocable.page = await login(revocable.username, revocable.source);
  }
  return { own, peer, foreign, service, revocable, person, role };
}
