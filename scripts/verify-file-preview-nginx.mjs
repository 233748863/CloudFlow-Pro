import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import http from 'node:http';
import https from 'node:https';
import { createServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { previewDigest, previewPause } from './file-preview-fixtures.mjs';

export async function verifyPreviewProxy(context) {
  const { actor, files, cases, state, directory, caseTag, check, remember, sensitive, evidence } = context;
  const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
  const runtime = await fs.realpath(path.join(root, '.cloudflow-runtime'));
  assert.equal(path.dirname(directory), await fs.realpath(path.join(runtime, 'batch-g-integration')));
  assert.equal(await fs.realpath(state.run), directory);
  const binary = await fs.realpath(path.join(runtime, 'tools/nginx-1.28.0/nginx-1.28.0/nginx.exe'));
  assert.ok(binary.startsWith(runtime + path.sep));
  const gateway = state.services.find(service => service.name === 'gateway');
  const owned = state.processes.find(process => process.name === 'gateway');
  const execute = (executable, argumentsList, options = {}) => {
    const result = spawnSync(executable, argumentsList, { encoding: 'utf8', timeout: 30000, windowsHide: true, ...options });
    assert.equal(result.status, 0, result.error?.message || result.stderr || 'Owned proxy command failed');
    return result;
  };
  const processInfo = identifier => {
    assert.ok(Number.isInteger(identifier) && identifier > 0);
    const setup = path.join(runtime, 'use-data-drive.ps1').replaceAll("'", "''");
    const result = execute('pwsh', ['-NoProfile', '-Command', `. '${setup}'; $Current=Get-CimInstance Win32_Process -Filter 'ProcessId = ${identifier}'; if($Current){$Current | Select-Object Name,CommandLine | ConvertTo-Json -Compress}`]);
    return result.stdout.trim() ? JSON.parse(result.stdout) : undefined;
  };
  assert.ok(gateway && owned);
  const ownedProcess = processInfo(owned.id);
  const settings = await fs.readFile(path.join(directory, 'gateway/integration.properties'), 'utf8');
  check('预览代理目标为自有环回网关且进程归属一致', ownedProcess?.Name === 'java.exe' && ownedProcess.CommandLine.includes(owned.marker)
    && settings.includes('server.address=127.0.0.1') && settings.includes(`server.port=${gateway.port}`));
  const version = execute(binary, ['-v']).stderr.trim();
  assert.match(version, /nginx\/1\.28\.0$/);
  const output = path.join(directory, `nginx-preview-${caseTag}`);
  await fs.mkdir(path.join(output, 'logs'), { recursive: true });
  await fs.mkdir(path.join(output, 'temp'));
  assert.equal(await fs.realpath(output), output);
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
  const certificate = path.join(output, 'certificate.pem');
  const privateKey = path.join(output, 'private-key.pem');
  execute(process.env.CLOUDFLOW_OPENSSL || 'C:\\Program Files\\Git\\usr\\bin\\openssl.exe', ['req', '-x509', '-nodes', '-newkey', 'rsa:2048', '-days', '1', '-subj', '/CN=localhost',
    '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1', '-keyout', privateKey, '-out', certificate]);
  const authority = await fs.readFile(certificate);
  const source = await fs.readFile(path.join(root, 'docker/frontend/nginx.conf'), 'utf8');
  let configured = source.replace('listen 80;', `listen 127.0.0.1:${httpPort};`).replace('listen 443 ssl;', `listen 127.0.0.1:${httpsPort} ssl;`)
    .replaceAll('http://gateway:9000', `http://127.0.0.1:${gateway.port}`)
    .replaceAll('/etc/nginx/ssl/cert.pem', quote(certificate)).replaceAll('/etc/nginx/ssl/key.pem', quote(privateKey))
    .replaceAll('/usr/share/nginx/html', quote(path.join(root, 'cloudflow-frontend/dist'))).replaceAll('/dev/null', 'NUL');
  for (const filename of ['crm_tracking_access.log', 'cloudflow_access.log', 'file_preview_access.log']) {
    configured = configured.replaceAll(`/var/log/nginx/${filename}`, quote(path.join(output, filename)));
  }
  assert.ok(!configured.includes('/var/log/nginx/') && !configured.includes('http://gateway:9000'));
  const configuration = path.join(output, 'nginx.conf');
  await fs.writeFile(configuration, `worker_processes 1;
error_log ${quote(path.join(output, 'error.log'))} warn;
pid ${quote(path.join(output, 'nginx.pid'))};
events { worker_connections 128; }
http {
include ${quote(path.join(path.dirname(binary), 'conf/mime.types'))};
default_type application/octet-stream;
access_log ${quote(path.join(output, 'access.log'))};
${configured}
}
`);
  const argumentsList = ['-p', output.replaceAll('\\', '/') + '/', '-c', configuration];
  await Promise.all([plaintext, encrypted].map(reservation => new Promise(resolve => reservation.close(resolve))));
  const syntax = execute(binary, [...argumentsList, '-t'], { cwd: output });
  console.log(syntax.stderr.trim());
  check('预览使用正式Nginx配置并通过真实语法检查', syntax.stderr.includes('test is successful'));
  const authorization = `Bearer ${(await remember(actor)).replace(/^Bearer /, '')}`;
  const call = (route, { secure = true, method = 'GET', body, headers = {} } = {}) => new Promise((resolve, reject) => {
    const data = body === undefined ? undefined : JSON.stringify(body);
    const outgoing = (secure ? https : http).request({ host: '127.0.0.1', port: secure ? httpsPort : httpPort, path: route, method,
      ...(secure ? { ca: authority, rejectUnauthorized: true } : {}), agent: false,
      headers: { ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}), ...headers } }, incoming => {
      const chunks = [];
      incoming.on('data', chunk => chunks.push(chunk));
      incoming.on('end', () => resolve({ status: incoming.statusCode, headers: incoming.headers, bytes: Buffer.concat(chunks) }));
    });
    outgoing.on('error', reject);
    outgoing.setTimeout(15000, () => outgoing.destroy(new Error('Owned preview proxy request timed out')));
    outgoing.end(data);
  });
  let child;
  let failure;
  try {
    child = spawn(binary, argumentsList, { cwd: output, windowsHide: true, stdio: 'ignore' });
    await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); });
    const deadline = Date.now() + 20000;
    let ready = false;
    while (Date.now() < deadline) {
      try { ready = (await call('/')).status === 200; if (ready) break; } catch { }
      await previewPause(200);
    }
    check('预览真实HTTPS代理已启动并验证自有证书', ready);
    const assets = path.join(root, 'cloudflow-frontend/dist/assets');
    const workers = (await fs.readdir(assets)).filter(name => /^pdf\.worker-[A-Za-z0-9_-]+\.mjs$/.test(name));
    assert.equal(workers.length, 1, 'Exactly one built PDF worker is required');
    const worker = await call('/assets/' + workers[0]);
    check('正式HTTPS交付实际PDF worker字节、JavaScript类型和内容保护', worker.status === 200
      && worker.headers['content-type'] === 'application/javascript' && worker.headers['x-content-type-options'] === 'nosniff'
      && previewDigest(worker.bytes) === previewDigest(await fs.readFile(path.join(assets, workers[0]))));
    const missingWorker = await call('/assets/pdf.worker-not-present.mjs');
    check('不存在的PDF worker返回404而非应用页面', missingWorker.status === 404 && !missingWorker.bytes.toString().includes('id="root"'));
    for (const [folder, extension] of [['cmaps', '.bcmap'], ['standard_fonts', '.pfb'], ['wasm', '.wasm'], ['iccs', '.icc']]) {
      const parent = path.join(root, 'cloudflow-frontend/dist/pdf-preview-assets', folder);
      const name = (await fs.readdir(parent)).find(candidate => candidate.endsWith(extension));
      assert.ok(name, `Built ${folder} preview resource required`);
      const response = await call(`/pdf-preview-assets/${folder}/${name}`);
      check(`正式HTTPS交付本地${folder}资源且字节一致`, response.status === 200
        && previewDigest(response.bytes) === previewDigest(await fs.readFile(path.join(parent, name)))
        && (folder !== 'wasm' || response.headers['content-type'] === 'application/wasm'));
    }
    const issued = await call('/api/auth/system/file/preview-ticket', { method: 'POST', body: cases[0].request, headers: { Authorization: authorization } });
    const result = JSON.parse(issued.bytes.toString('utf8'));
    const ticket = result.data;
    check('正式代理申请真实预览凭据且禁止缓存', issued.status === 200 && result.code === 200 && ticket?.supported
      && issued.headers['cache-control']?.includes('no-store'));
    const parameters = new URL(ticket.streamUrl, 'https://localhost').searchParams;
    sensitive.add(parameters.get('previewToken')); sensitive.add(parameters.get('signature'));
    const content = await call(ticket.streamUrl, { headers: { Authorization: authorization } });
    console.log(`H5_PREVIEW_NGINX_HEADERS: ${JSON.stringify({ status: content.status, bytes: content.bytes.length,
      digest_matches: previewDigest(content.bytes) === files.public.digest, content_type: content.headers['content-type'],
      cache_control: content.headers['cache-control'], nosniff: content.headers['x-content-type-options'],
      csp: content.headers['content-security-policy'], referrer_policy: content.headers['referrer-policy'], redirected: Boolean(content.headers.location) })}`);
    check('正式代理透传真实PDF字节和安全响应头', content.status === 200 && previewDigest(content.bytes) === files.public.digest
      && content.headers['content-type'] === 'application/pdf' && content.headers['cache-control']?.includes('no-store')
      && content.headers['x-content-type-options'] === 'nosniff' && content.headers['content-security-policy'] === "sandbox; default-src 'none'"
      && content.headers['referrer-policy'] === 'no-referrer' && !content.headers.location);
    const range = await call(ticket.streamUrl, { headers: { Authorization: authorization, Range: 'bytes=0-4' } });
    check('正式代理保留Range单段响应', range.status === 206 && range.bytes.toString() === '%PDF-'
      && range.headers['content-range'] === `bytes 0-4/${files.public.bytes.length}` && range.headers['cache-control']?.includes('no-store'));
    const head = await call(ticket.streamUrl, { method: 'HEAD', headers: { Authorization: authorization } });
    check('正式代理HEAD只返回校验后的文件头', head.status === 200 && head.bytes.length === 0
      && Number(head.headers['content-length']) === files.public.bytes.length);
    const anonymous = await call(ticket.streamUrl);
    check('持有真实预览地址但未登录仍被代理后端拒绝', [401, 403].includes(anonymous.status) && JSON.parse(anonymous.bytes).data == null
      && anonymous.headers['cache-control']?.includes('no-store') && anonymous.headers['referrer-policy'] === 'no-referrer');
    const duplicate = await call(ticket.streamUrl + '&signature=' + parameters.get('signature'), { headers: { Authorization: authorization } });
    check('代理不合并重复签名且透传拒绝', duplicate.status === 409 && JSON.parse(duplicate.bytes).data == null);
    const redirected = await call(ticket.streamUrl, { secure: false });
    check('HTTP预览地址只跳转HTTPS且不提供文件内容', redirected.status === 301 && redirected.headers.location?.startsWith('https://')
      && previewDigest(redirected.bytes) !== files.public.digest);
    for (const suffix of ['unknown', 'content.js', 'content/', 'ticket/']) {
      const unknown = await call('/api/auth/system/file/preview-' + suffix + '?previewToken=' + parameters.get('previewToken'), { headers: { Authorization: authorization } });
      check(`未知预览路径${suffix}返回404且不加载应用页面`, unknown.status === 404 && !unknown.bytes.toString().includes('id="root"')
        && unknown.headers['cache-control']?.includes('no-store'));
    }
    evidence.proxy = true;
  } catch (error) { failure = error; }
  finally {
    if (child?.pid && processInfo(child.pid)) {
      const current = processInfo(child.pid);
      assert.ok(current.Name === 'nginx.exe' && current.CommandLine.includes(configuration), 'Owned preview proxy identity changed');
      execute(binary, [...argumentsList, '-s', 'quit'], { cwd: output });
      const deadline = Date.now() + 15000;
      while (child.exitCode === null && Date.now() < deadline) await previewPause(100);
      assert.notEqual(child.exitCode, null, 'Owned preview proxy did not exit');
    }
    const logs = {};
    for (const name of ['access.log', 'error.log', 'crm_tracking_access.log', 'cloudflow_access.log', 'file_preview_access.log']) {
      logs[name] = await fs.readFile(path.join(output, name), 'utf8').catch(error => { if (error.code === 'ENOENT') return ''; throw error; });
      check(`真实代理${name}无本次会话或预览凭据`, [...sensitive].filter(Boolean).every(value => !logs[name].includes(value)));
    }
    if (!failure) check('预览访问日志保留路径和状态，省略全部查询串', logs['file_preview_access.log'].includes('POST /api/auth/system/file/preview-ticket HTTP/1.1')
      && logs['file_preview_access.log'].includes('GET /api/auth/system/file/preview-content HTTP/1.1') && !logs['file_preview_access.log'].includes('?'));
    assert.equal(previewDigest(await fs.readFile(path.join(root, 'docker/frontend/nginx.conf'))), previewDigest(source), 'Formal proxy source changed during verification');
    await fs.writeFile(path.join(output, 'result.json'), JSON.stringify({ passed: !failure, sourceSha256: previewDigest(source), nginxVersion: version,
      realGateway: true, realHttps: true, productionModified: false, failure: failure?.message, verifiedAt: new Date().toISOString() }, null, 2));
    console.log(`H5_PREVIEW_NGINX_RESULT: failed=${failure ? 1 : 0}; real_nginx=true; real_https=true; real_gateway=true; signed_bytes=real; logs_scanned=5; production_modified=false`);
  }
  if (failure) throw failure;
}
