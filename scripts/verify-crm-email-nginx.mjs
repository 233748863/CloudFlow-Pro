import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import http from 'node:http';
import https from 'node:https';
import { createServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const stateFile = await fs.realpath(process.argv[2]);
const state = JSON.parse(await fs.readFile(stateFile, 'utf8'));
const ownedDirectory = await fs.realpath(state.run);
assert.equal(path.dirname(stateFile), ownedDirectory);
assert.equal(path.dirname(ownedDirectory), await fs.realpath(path.join(root, '.cloudflow-runtime/batch-g-integration')));
assert.match(path.basename(ownedDirectory), /^[a-f0-9]{32}$/);
assert.equal(state.status, 'RUNNING');
const gateway = state.services.find(service => service.name === 'gateway');
const gatewayProcess = state.processes.find(process => process.name === 'gateway');
assert.ok(gateway && gatewayProcess);
const binary = await fs.realpath(process.argv[3]);
const nginxHome = path.dirname(binary);
const openssl = process.env.CLOUDFLOW_OPENSSL || 'C:\\Program Files\\Git\\usr\\bin\\openssl.exe';
const checks = [];
const check = (label, value) => { assert.ok(value, label); checks.push(label); console.log(`PASS ${label}`); };
const execute = (executable, argumentsList, options = {}) => {
  const result = spawnSync(executable, argumentsList, { encoding: 'utf8', windowsHide: true, timeout: 30000, ...options });
  assert.equal(result.status, 0, result.error?.message || result.stderr || result.stdout);
  return result;
};
const processInfo = identifier => {
  assert.ok(Number.isInteger(identifier) && identifier > 0);
  const output = execute('pwsh', ['-NoProfile', '-Command', `$Current=Get-CimInstance Win32_Process -Filter 'ProcessId = ${identifier}'; if($Current){$Current | Select-Object ProcessId,Name,CommandLine | ConvertTo-Json -Compress}`]);
  return output.stdout.trim() ? JSON.parse(output.stdout) : null;
};
const ownedGateway = processInfo(gatewayProcess.id);
check('代理目标是已核验的自有隔离网关进程', ownedGateway?.Name === 'java.exe' && ownedGateway.CommandLine.includes(gatewayProcess.marker));
const gatewaySettings = await fs.readFile(path.join(ownedDirectory, 'gateway', 'integration.properties'), 'utf8');
check('隔离网关仅监听环回地址', gatewaySettings.includes('server.address=127.0.0.1') && gatewaySettings.includes(`server.port=${gateway.port}`));
const version = execute(binary, ['-v']);
assert.match(version.stderr, /nginx\/1\.28\.0/);
const directory = path.join(root, '.cloudflow-runtime', 'nginx-e5', randomUUID().replaceAll('-', ''));
await fs.mkdir(directory, { recursive: true });
assert.equal(await fs.realpath(directory), directory);
await fs.mkdir(path.join(directory, 'logs'));
await fs.mkdir(path.join(directory, 'temp'));
const quote = value => `"${value.replaceAll('\\', '/').replaceAll('"', '\\"')}"`;
const reserve = async () => {
  const reservation = createServer();
  await new Promise((resolve, reject) => { reservation.once('error', reject); reservation.listen(0, '127.0.0.1', resolve); });
  return reservation;
};
const plaintext = await reserve();
const encrypted = await reserve();
const httpPort = plaintext.address().port;
const httpsPort = encrypted.address().port;
const certificate = path.join(directory, 'certificate.pem');
const privateKey = path.join(directory, 'private-key.pem');
execute(openssl, ['req', '-x509', '-nodes', '-newkey', 'rsa:2048', '-days', '1', '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1', '-keyout', privateKey, '-out', certificate]);
const source = await fs.readFile(path.join(root, 'docker/frontend/nginx.conf'), 'utf8');
const sourceSha256 = createHash('sha256').update(source).digest('hex');
const content = source
  .replace('listen 80;', `listen 127.0.0.1:${httpPort};`)
  .replace('listen 443 ssl;', `listen 127.0.0.1:${httpsPort} ssl;`)
  .replaceAll('http://gateway:9000', `http://127.0.0.1:${gateway.port}`)
  .replaceAll('/etc/nginx/ssl/cert.pem', quote(certificate))
  .replaceAll('/etc/nginx/ssl/key.pem', quote(privateKey))
  .replaceAll('/usr/share/nginx/html', quote(path.join(root, 'cloudflow-frontend/dist')))
  .replaceAll('/var/log/nginx/crm_tracking_access.log', quote(path.join(directory, 'tracking-access.log')))
  .replaceAll('/dev/null', 'NUL');
check('配置仅替换自有测试地址、端口和文件路径', content !== source && !content.includes('http://gateway:9000') && content.includes('location ^~ /crm/track/'));
const configuration = path.join(directory, 'nginx.conf');
await fs.writeFile(configuration, `worker_processes 1;
error_log ${quote(path.join(directory, 'error.log'))} warn;
pid ${quote(path.join(directory, 'nginx.pid'))};
events { worker_connections 128; }
http {
  include ${quote(path.join(nginxHome, 'conf/mime.types'))};
  default_type application/octet-stream;
  access_log ${quote(path.join(directory, 'access.log'))};
${content}
}
`);
const argumentsList = ['-p', directory.replaceAll('\\', '/') + '/', '-c', configuration];
await Promise.all([plaintext, encrypted].map(reservation => new Promise(resolve => reservation.close(resolve))));
const syntax = execute(binary, [...argumentsList, '-t'], { cwd: directory });
console.log(syntax.stderr.trim());
check('实际Nginx配置语法校验通过', syntax.stderr.includes('test is successful'));
let child;
let failure;
const secrets = [];
const request = async (route, secure = true, headers = {}, method = 'GET') => {
  const secret = randomBytes(32).toString('base64url');
  secrets.push(secret);
  return new Promise((resolve, reject) => {
    const outgoing = (secure ? https : http).request({ host: '127.0.0.1', port: secure ? httpsPort : httpPort, path: `${route}?token=${secret}`, method, rejectUnauthorized: false, agent: false, headers }, incoming => {
      const chunks = [];
      incoming.on('data', chunk => chunks.push(chunk));
      incoming.on('end', () => resolve({ status: incoming.statusCode, headers: incoming.headers, body: Buffer.concat(chunks) }));
    });
    outgoing.on('error', reject);
    outgoing.setTimeout(10000, () => outgoing.destroy(new Error('Owned proxy request timed out')));
    outgoing.end();
  });
};
try {
  child = spawn(binary, argumentsList, { cwd: directory, windowsHide: true, stdio: 'ignore' });
  await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); });
  const deadline = Date.now() + 15000;
  let ready = false;
  while (Date.now() < deadline) {
    try { ready = (await request('/crm/track/open')).status === 200; if (ready) break; } catch { }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  check('独立HTTPS代理调用真实网关及CRM服务', ready);
  const redirected = await request('/crm/track/open', false);
  check('HTTP入口只跳转HTTPS', redirected.status === 301 && redirected.headers.location?.startsWith('https://'));
  const opened = await request('/crm/track/open', true, { 'X-Forwarded-For': '203.0.113.9', 'X-Real-IP': '203.0.113.9' });
  check('打开入口转发不可缓存的实际像素响应', opened.status === 200 && opened.headers['content-type']?.includes('image/gif') && opened.headers['cache-control']?.includes('no-store') && opened.body.subarray(0, 3).toString() === 'GIF');
  for (const purpose of ['click', 'unsubscribe']) {
    const response = await request(`/crm/track/${purpose}`);
    check(`${purpose}入口透传真实无效令牌拒绝`, response.status === 404 && !response.body.toString().includes('example.com'));
  }
  const anonymousForm = await request('/crm/track/unsubscribe', true, { Origin: 'null', 'Content-Type': 'application/x-www-form-urlencoded' }, 'POST');
  check('隐藏来源的退订表单经过网关并按无效令牌拒绝', anonymousForm.status === 404 && anonymousForm.headers['access-control-allow-credentials'] !== 'true');
  for (const route of ['/crm/track/unknown', '/crm/track/unknown.js', '/crm/track/open/', '/api/crm/track/open', '/api/crm/track/unknown.css']) {
    const response = await request(route);
    check(`${route}不能落到静态文件或API备用入口`, response.status === 404);
  }
} catch (error) {
  failure = error;
} finally {
  if (child?.pid && processInfo(child.pid)) {
    const current = processInfo(child.pid);
    assert.ok(current.Name === 'nginx.exe' && current.CommandLine.includes(configuration), 'Owned Nginx process identity mismatch');
    execute(binary, [...argumentsList, '-s', 'quit'], { cwd: directory });
    const deadline = Date.now() + 15000;
    while (child.exitCode === null && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 100));
    assert.notEqual(child.exitCode, null, 'Owned Nginx did not exit after quit');
  }
  for (const file of ['tracking-access.log', 'access.log', 'error.log']) {
    const log = await fs.readFile(path.join(directory, file), 'utf8').catch(error => { if (error.code === 'ENOENT') return ''; throw error; });
    check(`${file}不包含本轮追踪令牌`, secrets.every(secret => !log.includes(secret)));
  }
  const access = await fs.readFile(path.join(directory, 'tracking-access.log'), 'utf8');
  check('追踪访问日志记录真实连接地址并省略查询参数', access.includes('"GET /crm/track/open HTTP/1.1"') && !access.includes('?token=') && !access.includes('203.0.113.9'));
  await fs.writeFile(path.join(directory, 'result.json'), JSON.stringify({ passed: !failure, checks, sourceSha256, nginxVersion: version.stderr.trim(), productionModified: false, interfaceDoubles: 0, failure: failure?.message, verifiedAt: new Date().toISOString() }, null, 2));
  console.log(`E5_NGINX_RESULT: checks=${checks.length}; failed=${failure ? 1 : 0}; real_nginx=true; real_https=true; real_gateway=true; production_modified=false`);
  console.log(`E5_NGINX_EVIDENCE=${directory}`);
}
if (failure) throw failure;
