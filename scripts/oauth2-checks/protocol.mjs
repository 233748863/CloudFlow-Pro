export async function verifyOauthProtocol(context) {
  const { api, successful, check, database, literal, random, hash, budget, wire, denied, create, begin, consent,
    codeFrom, issued, redeem, rememberTokens, tokenRequest, resource, login, actors, evidence, expire } = context;
  const person = actors.own;
  const publicClient = await create('public', { clientType: 'PUBLIC', secretAction: 'NONE', scopes: ['profile', 'system.tenant.read'] });
  check('公共客户端不保存或返回密钥', publicClient.secret == null && database(`SELECT COUNT(*) FROM sys_oauth2_client WHERE client_id=${publicClient.clientId} AND client_secret_encrypted IS NULL;`) === '1');
  const decline = await begin(person.page, publicClient);
  const refused = successful(await consent(decline, false, []), '本人拒绝授权');
  const destination = new URL(refused.redirectUrl);
  check('拒绝回到精确回调并保留state，不返回code', destination.searchParams.get('error') === 'access_denied'
    && destination.searchParams.get('state') === decline.stateValue && !destination.searchParams.has('code'));
  check('拒绝不创建同意或访问令牌', database(`SELECT COUNT(*) FROM sys_oauth2_approve WHERE client_id=${publicClient.clientId};`) === '0'
    && database(`SELECT COUNT(*) FROM sys_oauth2_access_token WHERE client_id=${publicClient.clientId};`) === '0');
  const bound = await begin(person.page, publicClient);
  denied(await consent(bound, true, ['profile'], actors.peer.page), 403, 'insufficient_scope', '其他员工不能确认本人的授权事务');
  const secondSession = await login(person.username, person.source);
  denied(await consent(bound, true, ['profile'], secondSession), 403, 'insufficient_scope', '同一员工另一个登录会话不能消费旧确认事务');
  check('重新登录遵守既有旧内部会话撤销策略', (await api(person.page, '/auth/auth/userInfo')).status === 401);
  person.page = secondSession;
  const current = await begin(person.page, publicClient);
  const bindingToken = successful(current.result, '读取当前会话绑定事务').requestToken;
  const internal = await person.page.evaluate(async () => (await import('/src/utils/authStorage.ts')).getAuthToken());
  const wrongOrigin = await wire('/oauth2/authorize', { token: internal, raw: JSON.stringify({ requestToken: bindingToken, approve: true, scopes: ['profile'] }),
    headers: { 'Content-Type': 'application/json', Origin: 'https://not-the-owned-ui.invalid' } });
  check('持有内部凭据的错误Origin被入口防护拒绝且不消费事务', wrongOrigin.status === 403 && !wrongOrigin.body?.access_token
    && !wrongOrigin.location && database(`SELECT status FROM sys_oauth2_code WHERE request_hash=${literal(hash(bindingToken))};`) === 'PENDING');
  const flow = codeFrom(current, successful(await consent(current, true, ['profile']), '当前会话确认授权'));
  const publicTokens = rememberTokens(await redeem(flow), '公共客户端使用S256授权码兑换');
  check('公共客户端仅获得明确勾选的范围', publicTokens.scope === 'profile');
  denied(await tokenRequest(publicClient, { grant_type: 'refresh_token', refresh_token: publicTokens.refresh_token, scope: 'system.tenant.read' }),
    400, 'invalid_scope', '公共客户端刷新不能扩大同意范围');
  check('失败的扩权刷新不消费旧刷新凭据', database(`SELECT status FROM sys_oauth2_refresh_token WHERE token_hash=${literal(hash(publicTokens.refresh_token))};`) === 'ACTIVE');
  denied(await resource(publicTokens.access_token, '/oauth2/api/system/tenant'), 403, 'insufficient_scope', '公共客户端未选企业范围不可访问');
  const broad = rememberTokens(await redeem(await issued(person.page, publicClient)), '公共客户端完整范围经本人重新确认');
  const narrowed = rememberTokens(await tokenRequest(publicClient, { grant_type: 'refresh_token', refresh_token: broad.refresh_token, scope: 'profile' }), '刷新时主动缩小只读范围');
  check('刷新缩小范围后访问及新刷新记录都只保留profile', narrowed.scope === 'profile'
    && JSON.parse(database(`SELECT scopes FROM sys_oauth2_refresh_token WHERE token_hash=${literal(hash(narrowed.refresh_token))};`)).join(',') === 'profile');
  denied(await resource(narrowed.access_token, '/oauth2/api/system/tenant'), 403, 'insufficient_scope', '缩小范围后的令牌不能再读取原企业范围');
  denied(await tokenRequest(publicClient, { grant_type: 'refresh_token', refresh_token: narrowed.refresh_token, scope: 'profile system.tenant.read' }),
    400, 'invalid_scope', '缩小范围后的刷新令牌不能恢复已放弃范围');
  const invalidBegins = [
    [{ redirect_uri: publicClient.redirectUris[0] + '/changed' }, 400, 'invalid_request', '回调路径必须精确一致'],
    [{ redirect_uri: 'https://outside.invalid/callback' }, 400, 'invalid_request', '未登记回调不产生跳转'],
    [{ response_type: 'token' }, 400, 'unsupported_response_type', '拒绝隐式授权模式'],
    [{ code_challenge_method: 'plain' }, 400, 'invalid_request', '拒绝普通文本PKCE'],
    [{ scope: 'crm.customer.write' }, 400, 'invalid_scope', '拒绝未登记写入范围'],
  ];
  for (const [overrides, status, error, label] of invalidBegins) {
    const invalid = await begin(person.page, publicClient, overrides);
    denied(invalid.result, status, error, label);
    check(`${label}没有授权回调`, !invalid.result.body?.data?.redirectUrl);
  }
  const expired = await issued(person.page, publicClient, ['profile']);
  await expire(publicClient, 'code', hash(expired.code));
  denied(await redeem(expired), 400, 'invalid_grant', '已过期授权码不能兑换');
  const rawToken = async options => { await budget('token-ip', 55); return wire('/oauth2/token', options); };
  denied(await rawToken({ raw: `grant_type=authorization_code&client_id=${publicClient.clientKey}&client_id=${publicClient.clientKey}` }),
    400, 'invalid_request', '重复客户端参数明确拒绝');
  denied(await rawToken({ raw: `grant_type=authorization_code&grant_type=authorization_code&client_id=${publicClient.clientKey}` }),
    400, 'invalid_request', '重复授权模式参数明确拒绝');
  denied(await rawToken({ raw: `grant_type=authorization_code&client_id=${publicClient.clientKey}&unexpected_parameter=1` }),
    400, 'invalid_request', '令牌入口拒绝未登记参数');
  denied(await rawToken({ raw: `grant_type=password&client_id=${publicClient.clientKey}` }), 400, 'unsupported_grant_type', '拒绝密码授权模式');
  denied(await rawToken({ raw: `grant_type=client_credentials&client_id=${publicClient.clientKey}` }), 400, 'unauthorized_client', '公共客户端不能使用客户端凭据模式');
  denied(await rawToken({ raw: `grant_type=authorization_code&client_id=${publicClient.clientKey}&client_secret=${random()}` }),
    400, 'invalid_request', '不接受表单正文中的客户端密钥');
  denied(await rawToken({ raw: `grant_type=authorization_code&client_id=${publicClient.clientKey}`, headers: { Authorization: 'Basic !!!!' } }),
    401, 'invalid_client', '畸形Basic认证明确拒绝');
  await budget('token-ip', 55);
  denied(await wire('/oauth2/token?client_id=conflicting', { form: { grant_type: 'authorization_code', client_id: publicClient.clientKey } }),
    400, 'invalid_request', '令牌兑换不能混用查询与正文');
  const duplicateAuthorization = `${bound.query}&state=duplicate`;
  await budget(`authorize:${person.username}`, 9);
  denied(await api(person.page, `/oauth2/authorize${duplicateAuthorization}`), 400, 'invalid_request', '授权入口拒绝重复state');
  await budget(`authorize:${person.username}`, 9);
  denied(await api(person.page, `/oauth2/authorize${bound.query}&unexpected_parameter=1`), 400, 'invalid_request', '授权入口拒绝未登记参数');
  const automatic = await create('automatic', { scopes: ['profile'], autoApproveScopes: ['profile'] });
  const first = await begin(person.page, automatic);
  check('首次访问即使配置自动同意也必须本人确认', successful(first.result, '首次自动同意入口').automatic === false
    && !first.result.body.data.redirectUrl && !!first.result.body.data.requestToken);
  rememberTokens(await redeem(codeFrom(first, successful(await consent(first), '首次手动同意'))), '首次手动授权可兑换');
  const reused = await begin(person.page, automatic);
  check('已有有效同意且范围匹配才允许复用', successful(reused.result, '再次请求自动同意').automatic === true && !reused.result.body.data.requestToken);
  rememberTokens(await redeem(codeFrom(reused, reused.result.body.data)), '有效历史同意可复用授权');
  evidence.protocol = true;
}
