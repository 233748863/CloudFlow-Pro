import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readOwnedJobKeys, signJobRequest } from './job-internal-signing.mjs';
import { scanSecretStream } from './portal-checks/scan-access-logs.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const [round] = process.argv.slice(2); assert.match(round || '', /^r[1-9][0-9]*$/);
const run = path.join(root, '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7');
const evidence = path.join(root, '.cloudflow-runtime/full-prd-20260915/approved-runtime');
const output = path.join(evidence, `a3-internal-auth-http-20261002-${round}.json`);
await assert.rejects(fs.access(output), { code: 'ENOENT' });
const state = JSON.parse((await fs.readFile(path.join(run, 'state.json'), 'utf8')).replace(/^\uFEFF/, ''));
assert.equal(state.status, 'RUNNING'); assert.equal(await fs.realpath(state.run), await fs.realpath(run));
const inputs = JSON.parse((await fs.readFile(path.join(evidence, 'a3-internal-auth-20261002-backend-inputs-r2.json'), 'utf8')).replace(/^\uFEFF/, ''));
const unchanged = async () => { for (const input of inputs) assert.equal(createHash('sha256').update(await fs.readFile(path.join(root, input.Path))).digest('hex').toUpperCase(), input.Hash); };
await unchanged();
const keys = await readOwnedJobKeys(state);
const services = state.services.filter(service => ['auth', 'hr', 'oa', 'crm', 'workflow'].includes(service.name));
assert.equal(services.length, 5);
const auth = services.find(service => service.name === 'auth');
const observations = []; let requests = 0; let failure;
const sensitive = new Set(Object.values(keys));
const send = async (service, target, method, body, headers, scenario, accept) => {
  if (headers['X-Job-Signature']) sensitive.add(headers['X-Job-Signature']);
  const response = await fetch(`http://127.0.0.1:${service.port}${target}`, { method, headers,
    ...(method === 'GET' ? {} : { body }), redirect: 'error', signal: AbortSignal.timeout(15000) }); requests++;
  const parsed = await response.json();
  const passed = accept(response.status, parsed);
  observations.push({ service: service.name, scenario, status: response.status, code: parsed.code, passed });
  assert.ok(passed, `Internal task check failed: ${service.name}/${scenario}`);
};
const blocked = (status, body) => status === 403 && body.code === 403 && !body.data;
const reached = (status, body) => status === 200 && body.code === 200 && body.data?.accepted === false && body.data?.reason === 'HANDLER_NOT_REGISTERED';
try {
  for (const service of services) {
    const recipient = service.name === 'auth' ? 'cloudflow-auth' : `cloudflow-service-${service.name}`;
    const body = JSON.stringify({ executeNo: randomUUID(), handlerName: `__unregistered_auth_check_${randomUUID().replaceAll('-', '')}` });
    const target = '/inner/job/execute';
    const valid = signJobRequest(keys, 'cloudflow-auth', recipient, 'POST', target, body);
    await send(service, target, 'POST', body, valid, 'valid_signed_execution_protocol', reached);
    await send(service, target, 'POST', body, valid, 'signed_request_replay', blocked);
    await send(service, target, 'POST', body, { 'Content-Type': 'application/json', 'X-Inner-Call': 'true', 'X-From-Service': 'cloudflow-auth' }, 'forged_dispatcher', blocked);
    await send(service, target, 'POST', body + ' ', signJobRequest(keys, 'cloudflow-auth', recipient, 'POST', target, body), 'modified_body', blocked);
    for (const [name, change] of [['tenant', { 'X-Tenant-Id': '200000' }], ['user', { 'X-User-Id': '1' }], ['source', { 'X-From-Service': 'cloudflow-service-oa' }], ['signature', { 'X-Job-Signature': '0'.repeat(64) }]]) {
      await send(service, target, 'POST', body, { ...signJobRequest(keys, 'cloudflow-auth', recipient, 'POST', target, body), ...change }, `modified_${name}`, blocked);
    }
    for (const offset of [-360, 360]) await send(service, target, 'POST', body,
      signJobRequest(keys, 'cloudflow-auth', recipient, 'POST', target, body, {}, offset), `timestamp_${offset}`, blocked);
    const other = recipient === 'cloudflow-auth' ? 'cloudflow-service-hr' : 'cloudflow-auth';
    await send(service, target, 'POST', body, signJobRequest(keys, 'cloudflow-auth', other, 'POST', target, body), 'wrong_recipient', blocked);
    const statusTarget = `/inner/job/status/${randomUUID()}`;
    await send(service, statusTarget, 'GET', '', signJobRequest(keys, 'cloudflow-auth', recipient, 'GET', statusTarget), 'valid_signed_status', (status, result) => status === 200 && result.code === 200 && !result.data);
    await send(service, statusTarget, 'GET', '', { 'X-Inner-Call': 'true', 'X-From-Service': 'cloudflow-auth' }, 'forged_status', blocked);
    await send(service, target, 'POST', body, signJobRequest(keys, 'cloudflow-service-oa', recipient, 'POST', target, body), 'worker_cannot_dispatch', blocked);
    const reportTarget = '/inner/job/report'; const report = JSON.stringify({ executeNo: randomUUID(), executeStatus: 'SUCCESS' });
    await send(auth, reportTarget, 'POST', report, signJobRequest(keys, recipient, 'cloudflow-auth', 'POST', reportTarget, report), `valid_${service.name}_report_protocol`, (status, result) => status === 200 && result.code === 200);
    await send(auth, reportTarget, 'POST', report, { 'Content-Type': 'application/json', 'X-Inner-Call': 'true', 'X-From-Service': recipient }, `forged_${service.name}_report`, blocked);
  }
  for (const target of ['/inner/job/handler/report', '/inner/job/business/register']) {
    await send(auth, target, 'POST', '{}', { 'Content-Type': 'application/json', 'X-Inner-Call': 'true', 'X-From-Service': 'cloudflow-auth' }, `forged_${target.split('/').slice(-2).join('_')}`, blocked);
  }
} catch (error) { failure = error; }
let files = 0; let bytes = 0; let leaks = 0;
for (const service of state.services) {
  const directory = path.join(run, service.name);
  const names = await fs.readdir(path.join(directory, 'logs')).catch(error => { if (error.code === 'ENOENT') return []; throw error; });
  for (const filename of ['stdout.log', 'stderr.log', ...names.filter(name => name.endsWith('.log')).map(name => path.join('logs', name))]) {
    const scan = await scanSecretStream(createReadStream(path.join(directory, filename)), [...sensitive]); files++; bytes += scan.bytes; leaks += scan.leaks;
  }
}
assert.equal(leaks, 0, 'Service credential appeared in runtime log'); await unchanged();
await fs.writeFile(output, JSON.stringify({ observations, requests, passed: !failure, files, bytes, leaks,
  inputFiles: inputs.length, inputChanges: 0, scope: 'Actual five-service authentication protocol; unknown handlers and nonexistent execution reports do not prove business execution. Existing task UI test verifies actual auth dispatch. No production changes.' }, null, 2), { flag: 'wx' });
console.log(`A3_INTERNAL_AUTH_HTTP: requests=${requests}; passed=${observations.filter(item => item.passed).length}; failed=${observations.filter(item => !item.passed).length}; log_files=${files}; log_bytes=${bytes}; credential_values=5; leaks=${leaks}; product_changed=0; production_modified=false`);
if (failure) throw failure;
