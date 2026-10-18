export async function verifyOauthLimits(context) {
  const { actors, login, create, issued, redeem, rememberTokens, random, sensitive, pause, wire, api, successful, check, denied, evidence, budgets } = context;
  const person = actors.person('limits', actors.role('limits'));
  person.page = await login(person.username, person.source);
  const resourceClient = await create('limits-resource', { scopes: ['profile', 'system.tenant.read'] });
  const source = await issued(person.page, resourceClient);
  const tokens = rememberTokens(await redeem(source), '限流测试前真实授权');
  const tokenClient = await create('limits-token', { scopes: ['profile'] });
  console.log('WAIT OAuth限流专项：等待61500ms，保留实际IP及用户限制，不删除限流键');
  await pause(61500);
  for (let index = 0; index < 60; index++) {
    const response = await wire(index % 2 ? '/oauth2/userinfo' : '/oauth2/api/system/tenant', { token: tokens.access_token });
    check(`同一令牌共享资源窗口第${index + 1}次请求允许`, response.status === 200);
  }
  const exhausted = await wire('/oauth2/userinfo', { token: tokens.access_token });
  denied(exhausted, 429, 'slow_down', '同一令牌第61次资源读取按协议限流');
  check('资源限流响应有等待秒数且禁止缓存', exhausted.retryAfter === '60' && exhausted.cache === 'no-store');
  for (let index = 0; index < 10; index++) {
    const values = { ...source.values, state: random() };
    sensitive.add(values.state);
    const view = successful(await api(person.page, '/oauth2/authorize?' + new URLSearchParams(values)), '授权窗口内真实请求');
    sensitive.add(view.requestToken);
  }
  const limitedState = random();
  sensitive.add(limitedState);
  const authLimit = await api(person.page, '/oauth2/authorize?' + new URLSearchParams({ ...source.values, state: limitedState }));
  denied(authLimit, 429, 'slow_down', '同一用户第11次授权请求按协议限流');
  for (let index = 0; index < 10; index++) {
    denied(await wire('/oauth2/token', { client: tokenClient, form: { grant_type: 'authorization_code', client_id: tokenClient.clientKey } }),
      400, 'invalid_grant', `客户端窗口第${index + 1}次请求完成真实校验`);
  }
  const clientLimit = await wire('/oauth2/token', { client: tokenClient, form: { grant_type: 'authorization_code', client_id: tokenClient.clientKey } });
  denied(clientLimit, 429, 'slow_down', '同一客户端与IP第11次兑换按协议限流');
  check('客户端限流响应有等待秒数且禁止缓存', clientLimit.retryAfter === '60' && clientLimit.cache === 'no-store');
  for (let index = 11; index < 60; index++) {
    const response = await wire('/oauth2/token', { form: { grant_type: 'password', client_id: `unregistered-limit-${index}` } });
    denied(response, 401, 'invalid_client', `额外IP窗口第${index + 1}次仍执行客户端认证`);
  }
  const ipLimit = await wire('/oauth2/token', { form: { grant_type: 'password', client_id: 'unregistered-limit-final' } });
  denied(ipLimit, 429, 'slow_down', '同一IP第61次兑换保持标准OAuth错误结构');
  check('IP限流响应有等待秒数且禁止缓存', ipLimit.retryAfter === '60' && ipLimit.cache === 'no-store');
  for (let index = 0; index < 20; index++) {
    const token = random();
    sensitive.add(token);
    const response = await wire('/oauth2/revoke', { client: tokenClient, form: { token, client_id: tokenClient.clientKey } });
    check(`客户端撤销窗口第${index + 1}次返回不枚举令牌的成功`, response.status === 200 && JSON.stringify(response.body) === '{}' && response.cache === 'no-store');
  }
  const limitedToken = random();
  sensitive.add(limitedToken);
  const revokeLimit = await wire('/oauth2/revoke', { client: tokenClient, form: { token: limitedToken, client_id: tokenClient.clientKey } });
  denied(revokeLimit, 429, 'slow_down', '同一客户端与IP第21次撤销按协议限流');
  check('撤销限流响应有等待秒数且禁止缓存', revokeLimit.retryAfter === '60' && revokeLimit.cache === 'no-store');
  console.log('WAIT OAuth限流专项：自然等待61500ms后验证恢复，不删除限流键');
  await pause(61500);
  check('限流窗口自然到期后有效资源读取恢复', (await wire('/oauth2/userinfo', { token: tokens.access_token })).status === 200);
  budgets.clear();
  evidence.rateLimits = true;
}
