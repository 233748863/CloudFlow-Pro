import { createHash } from 'node:crypto';
import { inspectOauthPage, secretsStayTransient, holdOauthResponse, oauthUiResponse } from './interface-tools.mjs';

export async function verifyOauthAuthorizationInterface(context, frame, client) {
  const { employee, origin, check, random, sensitive, successful, budget, users, codeFrom, redeem, rememberTokens, resource, denied, database, hash, literal, evidence, expire } = context;
  await employee.setViewportSize({ width: frame.width, height: frame.height });
  const username = users.get(employee);
  const beginPage = async () => {
    await budget(`authorize:${username}`, 8);
    await budget(`authorize:${username}`, 8);
    const verifier = random();
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    const stateValue = random();
    for (const value of [verifier, challenge, stateValue]) sensitive.add(value);
    const query = '?' + new URLSearchParams({ response_type: 'code', client_id: client.clientKey, redirect_uri: client.redirectUris[0],
      scope: client.scopes.join(' '), state: stateValue, code_challenge: challenge, code_challenge_method: 'S256' });
    const response = await oauthUiResponse(employee, '/oauth2/authorize', 'GET', () => employee.goto(`${origin}/oauth2/authorize${query}`, { waitUntil: 'domcontentloaded' }));
    const view = successful(response, '页面读取真实授权事务');
    sensitive.add(view.requestToken);
    await employee.getByRole('button', { name: '确认授权', exact: true }).waitFor();
    return { verifier, stateValue, client, view, page: employee };
  };
  const callbackPattern = `${origin}/oauth2-test-return?**`;
  let callback = null;
  let callbackReferrer = null;
  await employee.route(callbackPattern, async route => {
    callback = new URL(route.request().url());
    callbackReferrer = route.request().headers().referer ?? null;
    for (const key of ['code', 'state']) if (callback.searchParams.get(key)) sensitive.add(callback.searchParams.get(key));
    await route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html lang="zh-CN"><title>第三方回调接收端</title><p>已收到真实授权服务器返回</p></html>' });
  });
  try {
    const declined = await beginPage();
    await inspectOauthPage(context, employee, `${frame.name}-authorization-light`);
    await secretsStayTransient(context, employee, [declined.view.requestToken, declined.verifier, declined.stateValue], `${frame.name}待确认事务`);
    await budget(`authorize:${username}`, 8);
    await employee.getByRole('button', { name: '拒绝授权', exact: true }).click();
    await employee.waitForURL(url => url.pathname === '/oauth2-test-return');
    check(`${frame.name}页面拒绝真实回调且不返回授权码`, callback?.searchParams.get('error') === 'access_denied'
      && callback.searchParams.get('state') === declined.stateValue && !callback.searchParams.has('code') && callbackReferrer === null);
    check(`${frame.name}页面拒绝后数据库没有本人同意记录`, database(`SELECT COUNT(*) FROM sys_oauth2_approve WHERE client_id=${client.clientId};`) === '0');
    const allowed = await beginPage();
    await employee.getByRole('checkbox', { name: /当前企业基本信息/ }).uncheck();
    await employee.getByRole('checkbox', { name: /本人基本资料/ }).uncheck();
    check(`${frame.name}未选择任何范围时不能确认`, await employee.getByRole('button', { name: '确认授权', exact: true }).isDisabled());
    await employee.getByRole('checkbox', { name: /本人基本资料/ }).check();
    await employee.evaluate(() => document.documentElement.classList.add('dark'));
    await inspectOauthPage(context, employee, `${frame.name}-authorization-dark`);
    await budget(`authorize:${username}`, 8);
    await employee.getByRole('button', { name: '确认授权', exact: true }).click();
    await employee.waitForURL(url => url.pathname === '/oauth2-test-return');
    const flow = codeFrom(allowed, { redirectUrl: callback.href });
    const tokens = rememberTokens(await redeem(flow), `${frame.name}页面同意获得真实可兑换授权码`);
    check(`${frame.name}实际访问范围仅为本人选择的基本资料`, tokens.scope === 'profile' && (await resource(tokens.access_token)).status === 200 && callbackReferrer === null);
    denied(await resource(tokens.access_token, '/oauth2/api/system/tenant'), 403, 'insufficient_scope', `${frame.name}未勾选企业范围真实拒绝`);
    await secretsStayTransient(context, employee, [allowed.view.requestToken, flow.code, tokens.access_token, tokens.refresh_token], `${frame.name}已同意事务`);
    await employee.goto(`${origin}/workspace/oauth2-grants`, { waitUntil: 'domcontentloaded' });
    const card = employee.locator('article').filter({ has: employee.getByRole('heading', { name: client.clientName, exact: true }) });
    await card.getByRole('button', { name: '撤销授权', exact: true }).waitFor();
    await inspectOauthPage(context, employee, `${frame.name}-grants-light`);
    await card.getByRole('button', { name: '撤销授权', exact: true }).click();
    const revokeDialog = employee.getByRole('dialog', { name: '撤销本人授权', exact: true });
    await revokeDialog.getByRole('button', { name: '取消', exact: true }).click();
    check(`${frame.name}取消撤销确认不改变实际授权`, (await resource(tokens.access_token)).status === 200);
    await card.getByRole('button', { name: '撤销授权', exact: true }).click();
    await employee.evaluate(() => document.documentElement.classList.add('dark'));
    await inspectOauthPage(context, employee, `${frame.name}-grant-revoke-dark`);
    await revokeDialog.getByRole('button', { name: '确认撤销', exact: true }).click();
    await revokeDialog.waitFor({ state: 'hidden' });
    await card.getByText('已撤销', { exact: true }).waitFor();
    denied(await resource(tokens.access_token), 401, 'invalid_token', `${frame.name}页面撤销立即阻断第三方访问`);
    const expired = await beginPage();
    const expiry = new Date(expired.view.expiresTime.replace(' ', 'T')).getTime();
    await employee.clock.setFixedTime(new Date(expiry + 1000));
    await employee.getByText('确认已过期，请回到原应用重新发起授权。', { exact: true }).waitFor();
    check(`${frame.name}浏览器时间到达真实返回的截止时间后停止确认`, await employee.getByRole('button', { name: '确认授权', exact: true }).isDisabled()
      && await employee.getByRole('button', { name: '拒绝授权', exact: true }).isDisabled());
    await employee.clock.setFixedTime(new Date());
    await expire(client, 'request', hash(expired.view.requestToken));
    const lostFlow = await beginPage();
    const losing = await holdOauthResponse(employee, '/oauth2/authorize', 'POST', result => {
      const view = successful(result, '授权确认丢响应前真实保存');
      const code = new URL(view.redirectUrl).searchParams.get('code');
      if (code) sensitive.add(code);
    }, true);
    try {
      await budget(`authorize:${username}`, 8);
      await employee.getByRole('button', { name: '确认授权', exact: true }).click();
      await losing.arrived();
      losing.release();
      await employee.getByText('本次确认已停止接受提交；如未返回原应用，请从原应用重新发起。', { exact: true }).waitFor();
      check(`${frame.name}真实确认丢响应后禁止再次同意或拒绝`, losing.count() === 1
        && await employee.getByRole('button', { name: '确认授权', exact: true }).isDisabled()
        && await employee.getByRole('button', { name: '拒绝授权', exact: true }).isDisabled()
        && database(`SELECT status FROM sys_oauth2_code WHERE client_id=${client.clientId} AND request_hash=${literal(hash(lostFlow.view.requestToken))};`) === 'ISSUED');
      await inspectOauthPage(context, employee, `${frame.name}-authorization-uncertain`);
    } finally { await losing.close(); }
    await employee.emulateMedia({ reducedMotion: 'reduce' });
    const motion = await employee.locator('.oauth2-workspace button').first().evaluate(element => getComputedStyle(element).transitionDuration);
    check(`${frame.name}遵守减少动画设置`, motion.split(',').every(value => Number.parseFloat(value) === 0));
    await employee.emulateMedia({ reducedMotion: 'no-preference' });
    await employee.evaluate(() => document.documentElement.classList.remove('dark'));
    evidence[frame.name] = true;
  } finally { await employee.unroute(callbackPattern); await employee.clock.setFixedTime(new Date()); }
}
