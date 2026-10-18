import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';

export async function verifyLoginTotp({ page, api, successful, authenticate, database, check, redis, userId, username, tokens, sensitive, credentials }) {
  assert.match(username, /^g_session_[a-f0-9]{12}$/);
  assert.ok(Number.isSafeInteger(userId) && userId > 0);
  assert.equal(database(`SELECT COUNT(*) FROM sys_user WHERE user_id=${userId} AND tenant_id=100000 AND user_name='${username}' AND create_by='${username}';`), '1');
  const predicate = `user_id=${userId} AND tenant_id=100000`;
  assert.equal(database(`SELECT COUNT(*) FROM sys_user_totp WHERE ${predicate};`), '0');
  const contexts = [];
  const challengeKeys = new Set();
  const origin = new URL(page.url()).origin;
  const begin = async () => {
    const context = await page.context().browser().newContext({ serviceWorkers: 'block' });
    contexts.push(context);
    await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    const candidate = await context.newPage();
    await candidate.goto(`${origin}/login`, { waitUntil: 'domcontentloaded' });
    let result;
    try { result = await authenticate(candidate, credentials, { acceptTotpChallenge: true }); }
    catch (failure) {
      if (!/请求过于频繁|登录尝试过于频繁/.test(failure.message)) throw failure;
      console.log('WAIT 保留认证限流，等待61秒后重新取得动态验证码挑战');
      await new Promise(resolve => setTimeout(resolve, 61000));
      result = await authenticate(candidate, credentials, { acceptTotpChallenge: true });
    }
    check('正确密码只取得二次验证挑战，尚未取得登录凭据', result.authenticated === false && result.challenge?.requiresTotp === true
      && !result.challenge.token && /^[A-Za-z0-9_-]{43}$/.test(result.challenge.tempToken));
    const token = result.challenge.tempToken;
    sensitive.add(token);
    const keys = redis('--scan', '--pattern', `*auth:totp:challenge:${token}`).split(/\r?\n/).filter(Boolean);
    assert.equal(keys.length, 1);
    challengeKeys.add(keys[0]);
    check('动态验证码挑战真实存于Redis且浏览器还没有登录Cookie', Number(redis('TTL', keys[0])) > 0
      && !(await context.cookies()).some(cookie => cookie.name === 'Authorization'));
    return { candidate, token, key: keys[0] };
  };
  const submit = (pending, code) => api(pending.candidate, '/auth/login/totp', { method: 'POST', body: { tempToken: pending.token, code } });
  const rejected = (response, label) => check(label, response.body?.code !== 200 && response.body?.data == null);
  try {
    const setup = successful(await api(page, '/auth/profile/totp/setup', { method: 'POST', body: { password: credentials.password } }), '本人登记真实动态验证码');
    assert.match(setup.manualEntryKey, /^[A-Z2-7]{32}$/);
    sensitive.add(setup.manualEntryKey);
    sensitive.add(setup.otpAuthUri);
    const cipher = database(`SELECT secret_ciphertext FROM sys_user_totp WHERE ${predicate};`);
    sensitive.add(cipher);
    check('动态验证码登记使用数据库密文', cipher.startsWith('v1:') && !cipher.includes(setup.manualEntryKey));
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    const bits = [...setup.manualEntryKey].map(character => alphabet.indexOf(character).toString(2).padStart(5, '0')).join('');
    const secret = Buffer.from(bits.match(/.{8}/g).map(chunk => Number.parseInt(chunk, 2)));
    const generate = step => {
      const counter = Buffer.alloc(8);
      counter.writeBigUInt64BE(BigInt(step));
      const digest = createHmac('sha1', secret).update(counter).digest();
      return String((digest.readUInt32BE(digest[digest.length - 1] & 15) & 0x7fffffff) % 1000000).padStart(6, '0');
    };
    if (Date.now() % 30000 > 26000) await new Promise(resolve => setTimeout(resolve, 31000 - Date.now() % 30000));
    successful(await api(page, '/auth/profile/totp/enable', { method: 'POST', body: { password: credentials.password, code: generate(Math.floor(Date.now() / 30000) - 1) } }), '本人启用真实动态验证码');
    const wrong = await begin();
    const step = Math.floor(Date.now() / 30000);
    const validCodes = new Set([-1, 0, 1].map(offset => generate(step + offset)));
    let invalidCode = '000000';
    while (validCodes.has(invalidCode)) invalidCode = String(Number(invalidCode) + 1).padStart(6, '0');
    rejected(await submit(wrong, invalidCode), '错误动态验证码不能登录');
    check('错误动态验证码原子丢弃真实Redis挑战', redis('EXISTS', wrong.key) === '0');
    rejected(await submit(wrong, generate(Math.floor(Date.now() / 30000))), '失败后不能用同一挑战再试正确验证码');
    const valid = await begin();
    const login = successful(await submit(valid, generate(Math.floor(Date.now() / 30000))), '正确动态验证码通过共用登录签发服务');
    assert.ok(login.token && !login.forcePasswordChange);
    tokens.add(login.token.replace(/^Bearer /, ''));
    await valid.candidate.evaluate(async token => (await import('/src/utils/authStorage.ts')).setAuthToken(token), login.token);
    check('二次验证后真实Cookie及当前账号信息有效', redis('EXISTS', valid.key) === '0'
      && (await valid.candidate.context().cookies()).some(cookie => cookie.name === 'Authorization')
      && successful(await api(valid.candidate, '/auth/info'), '二次验证后读取本人').user.userId === userId);
    rejected(await submit(valid, generate(Math.floor(Date.now() / 30000))), '已成功的二次验证挑战不能重放');
    const competing = await begin();
    const previousStep = Number(database(`SELECT last_used_step FROM sys_user_totp WHERE ${predicate};`));
    const delay = Math.max(0, (previousStep + 1) * 30000 + 1000 - Date.now());
    if (delay > 0) await new Promise(resolve => setTimeout(resolve, delay));
    const concurrentCode = generate(Math.floor(Date.now() / 30000));
    const responses = await Promise.all([submit(competing, concurrentCode), submit(competing, concurrentCode)]);
    const successes = responses.filter(response => response.body?.code === 200 && response.body?.data?.token);
    for (const success of successes) tokens.add(success.body.data.token.replace(/^Bearer /, ''));
    console.log('G4_LOGIN_TOTP_CONCURRENT_RESPONSES:', JSON.stringify(responses.map(response => ({ status: response.status, code: response.body?.code, issued: Boolean(response.body?.data?.token) }))));
    check('同一真实动态验证码和挑战并发仅签发一次登录', successes.length === 1
      && responses.filter(response => response.body?.code !== 200 && response.body?.data == null).length === 1
      && redis('EXISTS', competing.key) === '0');
    console.log('G4_LOGIN_TOTP_REAL: password_challenge=true; setup_http=true; enable_http=true; wrong_code_rejected=true; challenge_replay_rejected=true; concurrent_success=1; current_info=true; shared_login_completion=true; real_mysql=true; real_redis=true; vendor_login=false');
  } finally {
    database(`DELETE FROM sys_user_totp WHERE ${predicate};`);
    for (const key of challengeKeys) redis('DEL', key);
    for (const context of contexts) await context.close();
    check('仅清理专项账号的动态验证码和本轮挑战', database(`SELECT COUNT(*) FROM sys_user_totp WHERE ${predicate};`) === '0'
      && [...challengeKeys].every(key => redis('EXISTS', key) === '0'));
  }
}
