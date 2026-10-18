import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
assert.notEqual(path.parse(root).root.toLowerCase(), `${process.env.SystemDrive}\\`.toLowerCase());
const frontend = path.join(root, 'cloudflow-frontend');
const output = path.join(root, '.cloudflow-runtime/im-login-ui', randomUUID().replaceAll('-', ''));
const requireFrontend = createRequire(path.join(frontend, 'package.json'));
const requireBrowser = createRequire(path.join(root, '.cloudflow-runtime/playwright/package.json'));
const { createServer } = await import(pathToFileURL(requireFrontend.resolve('vite')).href);
const { chromium } = requireBrowser('playwright-core');
await fs.mkdir(output, { recursive: true });
const password = randomBytes(24).toString('hex');
const store = path.join(output, 'tls.p12');
await promisify(execFile)('keytool', ['-genkeypair', '-alias', 'owned-login-ui', '-dname', 'CN=localhost', '-ext', 'SAN=dns:localhost,ip:127.0.0.1', '-validity', '2', '-keyalg', 'RSA', '-keysize', '2048', '-storetype', 'PKCS12', '-keystore', store, '-storepass:env', 'IM_UI_CERT_PASSWORD', '-noprompt'], { windowsHide: true, env: { ...process.env, IM_UI_CERT_PASSWORD: password } });
const server = await createServer({ root: frontend, configFile: path.join(frontend, 'vite.config.ts'), cacheDir: path.join(output, 'vite-cache'), logLevel: 'error',
  server: { host: '127.0.0.1', port: 0, https: { pfx: await fs.readFile(store), passphrase: password }, hmr: false, watch: null, fs: { allow: [root] } } });
const checks = [];
const errors = [];
const contexts = [];
let browser;
let origin;
const check = (label, result) => { assert.ok(result, label); checks.push(label); console.log(`PASS ${label}`); };
const release = { releaseCode: 'im-ui-legal', title: '登录条款', effectiveDate: '2026-09-30', documents: [{ docType: 'terms', title: '服务条款', required: true }] };
const browserProof = 'a'.repeat(43);
const mfaProof = 'b'.repeat(43);

async function createCase({ width = 1440, mobile = false, enabled = true, failTotp = false, badDestination = false, badProvider = false } = {}) {
  const context = await browser.newContext({ viewport: { width, height: 1000 }, ignoreHTTPSErrors: true, serviceWorkers: 'block',
    userAgent: mobile ? 'Mozilla/5.0 MicroMessenger wxwork/4.1' : undefined });
  contexts.push(context);
  const test = { context, page: await context.newPage(), api: [], external: [], enabled, failTotp, badDestination, badProvider, totpCookies: '', callbackCookies: '', totpBody: null };
  test.page.on('pageerror', error => errors.push(error.message));
  await context.routeWebSocket('**/*', socket => socket.close());
  await context.route('**/*', async route => {
    const request = route.request(); const url = new URL(request.url());
    const result = (data, status = 200, headers = {}) => route.fulfill({ status, headers, contentType: 'application/json', body: JSON.stringify({ code: status, data }) });
    if (['open.work.weixin.qq.com', 'open.weixin.qq.com'].includes(url.hostname)) {
      test.external.push(url.hostname);
      return route.fulfill({ contentType: 'text/html; charset=utf-8', body: `<!doctype html><a href="${origin}/api/auth/im/WECOM/callback?code=fixture&state=fixture">确认企业微信身份</a>` });
    }
    if (url.origin !== origin) { test.external.push(url.origin); return route.abort(); }
    if (url.pathname === '/dashboard') return route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<!doctype html><h1>隔离返回终点</h1>' });
    if (!url.pathname.startsWith('/api/')) return route.continue();
    test.api.push({ path: url.pathname, method: request.method(), query: Object.fromEntries(url.searchParams), body: request.postData() });
    if (url.pathname === '/api/auth/tenant/options') return result([{ tenantCode: 'im-ui-tenant', tenantName: '登录验证租户' }]);
    if (url.pathname === '/api/auth/legal/public/active') return result(release);
    if (url.pathname === '/api/auth/im/WECOM/availability') return result({ enabled: test.enabled, message: test.enabled ? '企业微信登录可用' : '当前套餐未启用我的通信绑定，请使用原账号登录' });
    if (url.pathname === '/api/auth/im/WECOM/auth-url') return result({ authorizationUrl: test.badProvider ? 'https://foreign.example.test/phishing' : `https://${mobile ? 'open.weixin.qq.com' : 'open.work.weixin.qq.com'}/fixture`, expiresIn: 300 }, 200,
      { 'set-cookie': `__Host-CloudFlowIM=${browserProof}; Path=/; Secure; HttpOnly; SameSite=Lax` });
    if (url.pathname === '/api/auth/im/WECOM/callback') {
      test.callbackCookies = (await request.allHeaders()).cookie || '';
      return route.fulfill({ status: 303, headers: { location: `${origin}/login?im=totp`, 'set-cookie': `__Host-CloudFlowIMMfa=${mfaProof}; Path=/; Secure; HttpOnly; SameSite=Strict`, 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' }, body: '' });
    }
    if (url.pathname === '/api/auth/im/WECOM/totp') {
      test.totpCookies = (await request.allHeaders()).cookie || ''; test.totpBody = request.postDataJSON();
      return result({ redirectUrl: test.badDestination ? 'https://foreign.example.test/' : `${origin}/dashboard` }, test.failTotp ? 400 : 200);
    }
    if (url.pathname === '/api/auth/captcha/get') return result(null, 503);
    throw new Error(`未声明的页面接口: ${url.pathname}`);
  });
  await test.page.goto(`${origin}/login`);
  await test.page.getByRole('button', { name: '同意并继续', exact: true }).waitFor();
  return test;
}

async function agree(test) {
  await test.page.getByRole('button', { name: '同意并继续', exact: true }).click();
  await test.page.locator('.cf-auth-public-agreement input').check();
}

async function dimensions(test, label) {
  const measured = await test.page.evaluate(() => ({ viewport: innerWidth, scroll: document.documentElement.scrollWidth,
    height: document.querySelector('.cf-auth-im-button')?.getBoundingClientRect().height }));
  check(`${label}无横向溢出且企业微信按钮至少44px`, measured.scroll <= measured.viewport && measured.height >= 44);
}

async function reachMfa(test, mobile = false) {
  await agree(test);
  await test.page.getByRole('button', { name: mobile ? '企业微信登录' : '企业微信扫码登录', exact: true }).click();
  await test.page.getByRole('link', { name: '确认企业微信身份' }).click();
  await test.page.getByRole('dialog', { name: '双因素认证', exact: true }).waitFor();
  check('跨站返回只用固定标志，不把证明或厂商凭据放页面URL', test.page.url() === `${origin}/login?im=totp`);
  check('跨站授权返回携带Lax浏览器证明', test.callbackCookies.includes(`__Host-CloudFlowIM=${browserProof}`));
  check('动态码页面不叠加条款弹窗且没有请求未完成的登录信息', await test.page.getByRole('dialog').count() === 1 && !test.api.some(entry => entry.path === '/api/auth/info'));
  check('JavaScript读不到HttpOnly浏览器与动态码证明', !(await test.page.evaluate(() => document.cookie)).includes('__Host-CloudFlowIM'));
}

try {
  await server.listen(); origin = `https://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({ headless: true });
  for (const width of [1440, 375, 320]) {
    const disabled = await createCase({ width, enabled: false });
    check(`${width}px未同意条款前企业微信入口禁用`, await disabled.page.getByRole('button', { name: '企业微信扫码登录', exact: true }).isDisabled());
    await agree(disabled);
    await disabled.page.getByText('当前套餐未启用我的通信绑定，请使用原账号登录', { exact: true }).waitFor();
    check(`${width}px套餐未选中时明确停用企业微信`, await disabled.page.getByRole('button', { name: '企业微信扫码登录', exact: true }).isDisabled());
    check(`${width}px原账号登录仍可用`, await disabled.page.getByRole('button', { name: '登录', exact: true }).isEnabled() && await disabled.page.locator('#auth-login-username').isEnabled());
    await dimensions(disabled, `${width}px`);
    await disabled.page.screenshot({ path: path.join(output, `disabled-${width}.png`), fullPage: true });
  }
  for (const mobile of [false, true]) {
    const success = await createCase({ mobile, width: mobile ? 375 : 1440 });
    await reachMfa(success, mobile);
    await success.page.getByRole('textbox', { name: '六位动态验证码' }).fill('123456');
    await success.page.screenshot({ path: path.join(output, `totp-${mobile ? 'mobile' : 'desktop'}.png`), fullPage: true });
    await success.page.getByRole('button', { name: '验证', exact: true }).click();
    await success.page.getByRole('heading', { name: '隔离返回终点' }).waitFor();
    check(`${mobile ? '内嵌' : '扫码'}使用对应真实SDK主机白名单`, success.external.length === 1 && success.external[0] === (mobile ? 'open.weixin.qq.com' : 'open.work.weixin.qq.com'));
    check('跨站回调后本地POST自动携带Strict动态码证明', success.totpCookies.includes(`__Host-CloudFlowIMMfa=${mfaProof}`) && success.totpCookies.includes(`__Host-CloudFlowIM=${browserProof}`));
    check('提交体只有六位动态码，不传本地账号或租户', JSON.stringify(success.totpBody) === '{"code":"123456"}');
    const authorization = success.api.find(entry => entry.path.endsWith('/auth-url'));
    check('发起携带当前租户和条款，不要求本地密码', authorization.query.tenantCode === 'im-ui-tenant' && authorization.query.legalReleaseCode === release.releaseCode && !authorization.body);
  }
  for (const options of [{ failTotp: true }, { badDestination: true }]) {
    const failed = await createCase(options); await reachMfa(failed);
    await failed.page.getByRole('textbox', { name: '六位动态验证码' }).fill('123456');
    await failed.page.getByRole('button', { name: '验证', exact: true }).click();
    await failed.page.getByRole('heading', { name: '企业微信登录未完成' }).waitFor();
    check('失败或非同源终点要求重新发起，不重复使用证明', failed.api.filter(entry => entry.path.endsWith('/totp')).length === 1 && !failed.external.includes('https://foreign.example.test'));
    await failed.page.getByRole('button', { name: '返回登录页' }).click();
    await failed.page.waitForURL(`${origin}/login`);
  }
  const badProvider = await createCase({ badProvider: true }); await agree(badProvider);
  await badProvider.page.getByRole('button', { name: '企业微信扫码登录', exact: true }).click();
  await badProvider.page.getByText('企业微信登录未能发起，请确认套餐与配置后重试；也可使用原账号登录', { exact: true }).waitFor();
  check('非企业微信授权主机禁止跳转', badProvider.external.length === 0);
  const canceled = await createCase(); await reachMfa(canceled);
  await canceled.page.getByRole('button', { name: '取消登录' }).click(); await canceled.page.waitForURL(`${origin}/login`);
  check('取消动态码不提交且回原登录页', !canceled.api.some(entry => entry.path.endsWith('/totp')));
  const insecureServer = await createServer({ root: frontend, configFile: path.join(frontend, 'vite.config.ts'), cacheDir: path.join(output, 'http-vite-cache'), logLevel: 'error',
    server: { host: '127.0.0.1', port: 0, strictPort: false, hmr: false, watch: null, fs: { allow: [root] } } });
  const secureOrigin = origin;
  try {
    await insecureServer.listen(); origin = `http://127.0.0.1:${insecureServer.httpServer.address().port}`;
    const insecure = await createCase(); await agree(insecure);
    check('HTTP明确提示HTTPS要求且不发企业微信请求', await insecure.page.getByText('企业微信登录需通过本系统HTTPS页面使用', { exact: true }).isVisible()
      && await insecure.page.getByRole('button', { name: '企业微信扫码登录', exact: true }).isDisabled() && !insecure.api.some(entry => entry.path.includes('/im/WECOM/')));
    check('HTTP原账号登录仍可用', await insecure.page.getByRole('button', { name: '登录', exact: true }).isEnabled());
    await insecure.context.close();
  } finally { origin = secureOrigin; await insecureServer.close(); }
  check('浏览器运行错误为零', errors.length === 0);
  console.log(`G4_IM_LOGIN_UI: assertions=${checks.length}; failed=0; real_browser=true; real_https=true; desktop_and_mobile=true; cross_site_cookie_roundtrip=true; api_responses=fixture; vendor_service=false; screenshots=${output}`);
} catch (failure) {
  const page = contexts.at(-1)?.pages()[0];
  if (page) {
    await page.screenshot({ path: path.join(output, 'failure.png'), fullPage: true });
    console.log('IM_UI_FAILURE', JSON.stringify({ url: page.url(), status: await page.locator('#im-login-status').allTextContents(), errors, output }));
  }
  throw failure;
} finally { await Promise.all(contexts.map(context => context.close())); await browser?.close(); await server.close(); }
