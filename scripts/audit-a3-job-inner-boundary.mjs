import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const [round] = process.argv.slice(2);
assert.match(round || '', /^r[1-9][0-9]*$/);
const run = path.join(root, '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7');
const evidence = path.join(root, '.cloudflow-runtime/full-prd-20260915/approved-runtime');
const report = path.join(evidence, `a3-job-inner-boundary-20261002-${round}.json`);
await assert.rejects(fs.access(report), { code: 'ENOENT' });
const state = JSON.parse((await fs.readFile(path.join(run, 'state.json'), 'utf8')).replace(/^\uFEFF/, ''));
assert.equal(state.status, 'RUNNING');
assert.equal(await fs.realpath(state.run), await fs.realpath(run));
const back = JSON.parse((await fs.readFile(path.join(evidence, 'f4-sign-methods-20261002-backend-inputs-r8.json'), 'utf8')).replace(/^\uFEFF/, ''));
const verifyInputs = async () => {
  for (const input of back) assert.equal(createHash('sha256').update(await fs.readFile(path.join(root, input.Path))).digest('hex').toUpperCase(), input.Hash);
};
await verifyInputs();
const observations = [];
const services = state.services.filter(value => ['auth', 'hr', 'oa', 'crm', 'workflow'].includes(value.name));
assert.equal(services.length, 5);
for (const service of services) {
  assert.ok(Number.isInteger(service.port) && service.port > 1024 && service.port < 65536);
  const handler = `__unregistered_a3_audit_${randomUUID().replaceAll('-', '')}`;
  const executeNo = randomUUID().replaceAll('-', '');
  for (const [scenario, extra] of [
    ['no_internal_markers', {}],
    ['unapproved_source', { 'X-Inner-Call': 'true', 'X-From-Service': 'external-a3-probe' }],
    ['forged_auth_source', { 'X-Inner-Call': 'true', 'X-From-Service': 'cloudflow-auth' }],
  ]) {
    const response = await fetch(`http://127.0.0.1:${service.port}/inner/job/execute`, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000),
      headers: { 'Content-Type': 'application/json', ...extra },
      body: JSON.stringify({ executeNo, handlerName: handler }),
    });
    const body = await response.json();
    // An unregistered handler is rejected before accepting an execution or writing the execution cache.
    const reachedRegistry = response.status === 200 && body.code === 200 && body.data?.accepted === false && body.data?.reason === 'HANDLER_NOT_REGISTERED';
    const blocked = [401, 403].includes(response.status) && body.code === response.status && !body.data;
    assert.ok(blocked || reachedRegistry, 'Unexpected boundary result; do not print the raw response');
    observations.push({ service: service.name, scenario, http: response.status, code: body.code,
      authenticationBlocked: blocked, reachedUnregisteredHandlerCheck: reachedRegistry, acceptedExecution: false });
  }
}
await verifyInputs();
const forged = observations.filter(value => value.scenario === 'forged_auth_source' && value.reachedUnregisteredHandlerCheck);
await fs.writeFile(report, JSON.stringify({ createdAt: new Date().toISOString(), observations,
  sources: { backendSnapshot: 'f4-sign-methods-20261002-backend-inputs-r8.json', files: back.length, changes: 0 },
  auditCompleted: true, authenticationAcceptancePassed: forged.length === 0, forgedSourceAcceptedServices: forged.map(value => value.service),
  scope: 'Owned loopback service endpoints; deliberately unknown random handler, no business execution. Findings are not passing security acceptance. Production reachability was not tested.',
}, null, 2) + '\n', { flag: 'wx' });
console.log(`A3_INNER_BOUNDARY_AUDIT: services=${services.length}; requests=${observations.length}; authentication_rejected=${observations.filter(value => value.authenticationBlocked).length}; forged_source_reached_registry=${forged.length}; accepted_executions=0; security_acceptance_passed=${forged.length === 0}; backend_changed=0; production_modified=false`);
