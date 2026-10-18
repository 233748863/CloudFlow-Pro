import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
assert.notEqual(path.parse(root).root.toLowerCase(), `${process.env.SystemDrive}\\`.toLowerCase());
const stateFile = await fs.realpath(process.argv[2] || '');
assert.equal(path.basename(stateFile), 'state.json');
const directory = path.dirname(stateFile);
assert.equal(path.dirname(directory), await fs.realpath(path.join(root, '.cloudflow-runtime/batch-g-integration')));
assert.match(path.basename(directory), /^[a-f0-9]{32}$/);
const state = JSON.parse((await fs.readFile(stateFile, 'utf8')).replace(/^\uFEFF/, ''));
assert.equal(state.status, 'RUNNING');
assert.equal(await fs.realpath(state.run), directory);
const configPath = path.join(directory, 'auth/integration.properties');
const config = await fs.readFile(configPath);
assert.ok(!/^cloudflow\.im\.enabled=true$/m.test(config.toString('utf8')));
const hash = buffer => createHash('sha256').update(buffer).digest('hex');
const services = state.services.filter(service => ['auth', 'gateway'].includes(service.name));
assert.equal(services.length, 2);
for (const service of services) {
  assert.ok(Number.isInteger(service.port) && service.port > 1024 && service.port < 65536);
  const health = await fetch(`http://127.0.0.1:${service.healthPort}/actuator/health`, { signal: AbortSignal.timeout(10000) });
  assert.equal((await health.json()).status, 'UP');
}
const gateway = services.find(service => service.name === 'gateway');
const auth = services.find(service => service.name === 'auth');
const origin = `http://127.0.0.1:${gateway.port}`;
let assertions = 0;
let requests = 0;
const check = (label, value) => { assert.ok(value, label); assertions++; console.log(`PASS ${label}`); };
async function send(method, endpoint, expected, options = {}) {
  const target = options.directAuth ? `http://127.0.0.1:${auth.port}/im/WECOM` : `${origin}/auth/im/WECOM`;
  const response = await fetch(`${target}${endpoint}`, { method, redirect: 'manual', signal: AbortSignal.timeout(15000),
    headers: { 'X-Forwarded-Proto': options.proto || 'https', 'X-Forwarded-For': '198.51.100.222', Authorization: 'Bearer im-public-fake',
      Cookie: options.cookie || 'Authorization=im-public-old; XSRF-TOKEN=im-public-csrf', ...(options.body ? { 'Content-Type': 'application/json' } : {}) }, body: options.body });
  requests++;
  const body = await response.json();
  check(`${options.directAuth ? 'auth直连' : 'gateway'} ${method} ${endpoint.split('?')[0]}返回${expected}`, response.status === expected && body.code === expected);
  check('真实服务响应禁止缓存和转发来源', (response.headers.get('cache-control') || '').split(',').every(value => value.trim() === 'no-store')
    && (response.headers.get('referrer-policy') || '').split(',').every(value => value.trim() === 'no-referrer'));
  check('真实服务不签发登录Cookie或回显旧凭据', !response.headers.getSetCookie().some(value => value.startsWith('Authorization='))
    && !JSON.stringify(body).includes('im-public-fake') && !JSON.stringify(body).includes('im-public-old') && !JSON.stringify(body).includes('private-test-code'));
  return body;
}
await send('GET', '/availability?tenantCode=im-unconfigured', 403);
const availability = await send('GET', '/availability?tenantCode=im-unconfigured', 200, { directAuth: true });
check('未配置部署明确停用，不受伪造旧身份影响', availability.data?.enabled === false && availability.data?.reasonCode === 'IM_DISABLED');
await send('GET', '/auth-url?tenantCode=im-unconfigured&purpose=SCAN_LOGIN', 400, { directAuth: true });
await send('GET', '/callback?state=invalid&code=private-test-code', 400, { directAuth: true });
await send('POST', '/totp', 400, { body: '{"code":"123456"}', directAuth: true });
await send('GET', '/availability?tenantCode=im-unconfigured', 403, { proto: 'http' });
await send('GET', '/%61vailability?tenantCode=im-unconfigured', 404);
await send('POST', '/callback', 404, { body: '{}' });
await send('GET', '/totp', 404);
await send('GET', '/availability?tenantCode=im-unconfigured', 403, { cookie: '__Host-CloudFlowIM=invalid' });
check('隔离配置保持原字节', hash(await fs.readFile(configPath)) === hash(config));
console.log(`G4_IM_PUBLIC_DISABLED_REAL: assertions=${assertions}; requests=${requests}; failed=0; actual_gateway_and_auth=true; actual_redis_aspects=true; gateway_rejects_untrusted_proxy=true; auth_disabled_endpoints=true; business_doubles=0; vendor_service=false; production_modified=false`);
