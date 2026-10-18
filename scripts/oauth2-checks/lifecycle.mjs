export async function verifyOauthLifecycle(context) {
  const { admin, api, successful, check, database, literal, hash, create, update, begin, consent, issued, redeem,
    denied, resource, rememberTokens, tokenRequest, grants, json, actors, evidence, login, random, expire } = context;
  const person = actors.revocable;
  const client = await create('lifecycle', { scopes: ['profile', 'system.tenant.read'] });
  const concurrentCode = await issued(person.page, client);
  const exchanges = await Promise.all([redeem(concurrentCode), redeem(concurrentCode)]);
  check('并发兑换同一授权码只有一个成功', exchanges.filter(result => result.status === 200).length === 1
    && exchanges.filter(result => result.status === 400 && result.body?.error === 'invalid_grant').length === 1);
  const exchanged = rememberTokens(exchanges.find(result => result.status === 200), '并发授权码唯一成功结果');
  denied(await resource(exchanged.access_token), 401, 'invalid_token', '授权码重放后成功分支的令牌族也失效');
  const refreshSource = rememberTokens(await redeem(await issued(person.page, client)), '刷新竞争前授权');
  const refreshes = await Promise.all([
    tokenRequest(client, { grant_type: 'refresh_token', refresh_token: refreshSource.refresh_token }),
    tokenRequest(client, { grant_type: 'refresh_token', refresh_token: refreshSource.refresh_token }),
  ]);
  check('并发刷新同一凭据只有一个成功', refreshes.filter(result => result.status === 200).length === 1
    && refreshes.filter(result => result.status === 400 && result.body?.error === 'invalid_grant').length === 1);
  const winner = rememberTokens(refreshes.find(result => result.status === 200), '并发刷新唯一成功结果');
  denied(await resource(winner.access_token), 401, 'invalid_token', '刷新重放撤销新产生的令牌');
  check('并发刷新没有遗留活动刷新令牌', database(`SELECT COUNT(*) FROM sys_oauth2_refresh_token WHERE client_id=${client.clientId} AND status='ACTIVE';`) === '0');
  evidence.concurrency = true;
  const authorized = rememberTokens(await redeem(await issued(person.page, client)), '本人撤销前真实授权');
  const pending = await begin(person.page, client);
  const unredeemed = await issued(person.page, client);
  const mine = successful(await api(person.page, `${grants}/mine`), '本人查看授权记录');
  const grant = mine.rows.find(row => row.clientName === client.clientName);
  check('本人只看到自己的同意记录', !!grant && grant.status === 'ACTIVE'
    && !successful(await api(actors.peer.page, `${grants}/mine`), '其他员工授权列表').rows.some(row => row.approveId === grant.approveId));
  const peerAttempt = await api(actors.peer.page, `${grants}/${grant.approveId}/revoke`, { method: 'POST', body: { version: grant.version } });
  check('其他员工不能撤销本人的同意', peerAttempt.status === 403 && peerAttempt.body?.code !== 200);
  successful(await api(person.page, `${grants}/${grant.approveId}/revoke`, { method: 'POST', body: { version: grant.version } }), '本人撤销同意');
  denied(await resource(authorized.access_token), 401, 'invalid_token', '本人撤销立即阻断访问');
  denied(await redeem(unredeemed), 400, 'invalid_grant', '本人撤销同时作废尚未兑换授权码');
  denied(await consent(pending), 400, 'invalid_grant', '本人撤销同时作废待确认事务');
  const renewed = rememberTokens(await redeem(await issued(person.page, client)), '本人重新同意产生新授权');
  denied(await tokenRequest(client, { grant_type: 'refresh_token', refresh_token: authorized.refresh_token }), 400, 'invalid_grant', '旧授权刷新凭据不能在重新同意后复活');
  check('旧族重放不撤销重新同意的新族', (await resource(renewed.access_token)).status === 200);
  const beforePolicy = await issued(person.page, client);
  await update(client, { description: '真实策略变更后必须重新授权' });
  denied(await resource(renewed.access_token), 401, 'invalid_token', '策略版本变化立即作废既有访问令牌');
  denied(await redeem(beforePolicy), 400, 'invalid_grant', '策略变更同时作废旧授权码');
  const beforeDisable = rememberTokens(await redeem(await issued(person.page, client)), '账号停用前真实授权');
  const expiredConfirmation = await begin(person.page, client);
  const expiredRequest = successful(expiredConfirmation.result, '准备待过期确认').requestToken;
  await expire(client, 'request', hash(expiredRequest));
  denied(await consent(expiredConfirmation), 400, 'invalid_grant', '已过期待确认请求不能生成授权码');
  const pendingDisable = await begin(person.page, client);
  const pendingCode = await issued(person.page, client);
  const setUserStatus = async status => {
    const version = Number(database(`SELECT version FROM sys_user WHERE tenant_id=${person.tenantId} AND user_id=${person.userId};`));
    successful(await api(admin, '/auth/system/user', { method: 'PUT', body: { userId: person.userId, tenantId: person.tenantId,
      userName: person.username, status, version, roleIds: [person.roleId] } }), `真实账号状态设为${status}`);
    check('账号状态确实保存', database(`SELECT status FROM sys_user WHERE tenant_id=${person.tenantId} AND user_id=${person.userId};`) === status);
  };
  await setUserStatus('1');
  denied(await resource(beforeDisable.access_token), 401, 'invalid_token', '账号停用立即阻断第三方令牌');
  check('账号停用将已有待确认和已签发事务持久作废', database(`SELECT COUNT(*) FROM sys_oauth2_code WHERE client_id=${client.clientId} AND user_id=${person.userId} AND status IN ('PENDING','ISSUED');`) === '0');
  await setUserStatus('0');
  person.page = await login(person.username, person.source);
  denied(await resource(beforeDisable.access_token), 401, 'invalid_token', '账号重新启用不会复活旧访问令牌');
  denied(await redeem(pendingCode), 400, 'invalid_grant', '账号重新启用不会复活旧授权码');
  const newTokens = rememberTokens(await redeem(await issued(person.page, client)), '重新启用后必须重新同意');
  await expire(client, 'access', hash(newTokens.access_token));
  denied(await resource(newTokens.access_token), 401, 'invalid_token', '数据库访问令牌到期即时失效');
  await expire(client, 'refresh', hash(newTokens.refresh_token));
  denied(await tokenRequest(client, { grant_type: 'refresh_token', refresh_token: newTokens.refresh_token }), 400, 'invalid_grant', '数据库刷新令牌到期后不能续期');
  const active = rememberTokens(await redeem(await issued(person.page, client)), '密钥轮换前授权');
  const oldSecret = client.secret;
  await update(client, { secretAction: 'REPLACE', clientSecret: random() });
  denied(await tokenRequest({ ...client, secret: oldSecret }, { grant_type: 'refresh_token', refresh_token: active.refresh_token }), 401, 'invalid_client', '客户端密钥更新后旧密钥不可使用');
  denied(await resource(active.access_token), 401, 'invalid_token', '客户端密钥更新撤销旧令牌');
  const replacement = rememberTokens(await redeem(await issued(person.page, client)), '新密钥配合新同意可用');
  await expire(client, 'approval', person.userId);
  denied(await resource(replacement.access_token), 401, 'invalid_token', '本人同意到期后有效期尚未结束的访问令牌也失效');
  denied(await tokenRequest(client, { grant_type: 'refresh_token', refresh_token: replacement.refresh_token }), 400, 'invalid_grant', '本人同意到期后刷新凭据也不能续期');
  const roleTokens = rememberTokens(await redeem(await issued(person.page, client)), '角色变更前重新确认');
  const changedRole = actors.role('role-change');
  const userVersion = Number(database(`SELECT version FROM sys_user WHERE tenant_id=${person.tenantId} AND user_id=${person.userId};`));
  successful(await api(admin, '/auth/system/user', { method: 'PUT', body: { userId: person.userId, tenantId: person.tenantId,
    userName: person.username, status: '0', version: userVersion, roleIds: [changedRole] } }), '通过真实账号接口更换角色');
  person.roleId = changedRole;
  denied(await resource(roleTokens.access_token), 401, 'invalid_token', '真实角色绑定变化持久撤销此前第三方令牌');
  person.page = await login(person.username, person.source);
  denied(await tokenRequest(client, { grant_type: 'refresh_token', refresh_token: roleTokens.refresh_token }), 400, 'invalid_grant', '角色变更后重新登录也不能恢复旧刷新凭据');
  const afterRole = rememberTokens(await redeem(await issued(person.page, client)), '角色变更后须重新授权');
  await update(client, { status: 'DISABLED' });
  denied(await resource(afterRole.access_token), 401, 'invalid_token', '应用停用即时阻断访问');
  await update(client, { status: 'ACTIVE' });
  denied(await resource(afterRole.access_token), 401, 'invalid_token', '应用重新启用不复活旧令牌');
  evidence.roleRevocation = true;
  evidence.revocations = true;
}
