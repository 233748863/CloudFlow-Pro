import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

// Reconcile the original HTTP evidence with existing persisted logs; no login or mutation.
const root = 'D:/CloudFlowPro';
const run = path.join(root, '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7');
const evidence = path.join(root, '.cloudflow-runtime/full-prd-20260915/approved-runtime');
const [round, privacyRound, backendRound, frontendRound] = process.argv.slice(2);
for (const value of [round, privacyRound, backendRound, frontendRound]) assert.match(value || '', /^r[1-9][0-9]*$/);
const output = path.join(evidence, `d3-denied-query-audit-20261006-${round}`);
fs.mkdirSync(output);
const read = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
const hash = value => createHash('sha256').update(value).digest('hex');
const state = read(path.join(run, 'state.json'));
const checks = [], records = [], failures = [];
const check = (label, condition) => { if (!condition) failures.push(label); checks.push(label); };
const env = { ...process.env }; delete env.MYSQL_PWD;
let queryCount = 0;
function db(statement) {
  assert.match(statement, /^SELECT\s/i);
  assert.ok(!/;\s*\S|\bINTO\s+(?:OUTFILE|DUMPFILE)\b/i.test(statement));
  queryCount++;
  const result = spawnSync('mysql.exe', ['--no-defaults', '--protocol=TCP', '--host=127.0.0.1', `--port=${state.mysqlPort}`,
    '--user=root', '--skip-password', '--batch', '--raw', '--skip-column-names', '--default-character-set=utf8mb4', 'cloud_flow_db'],
  { input: statement, encoding: 'utf8', windowsHide: true, env, timeout: 30000, maxBuffer: 32 * 1024 * 1024 });
  assert.equal(result.status, 0, 'Owned read-only database query failed');
  return result.stdout.trim();
}
const rows = statement => db(statement).split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
const source = path.join(evidence, 'd3-salary-privacy-20261006-' + privacyRound);
const requestsFile = path.join(source, 'requests.json');
const sources = ['requests.json', 'result.json', 'fixture.json', 'inputs.json'].map(name => ({
  path: path.join(source, name), sha256: hash(fs.readFileSync(path.join(source, name)))
}));
const inputs = read(path.join(source, 'inputs.json'));
const inputsBefore = inputs.map(item => ({ path: item.Path, sha256: hash(fs.readFileSync(path.join(root, item.Path))) }));
const scriptHash = hash(fs.readFileSync(new URL(import.meta.url)));
let summary = {};
try {
  check('owned_runtime_running', state.status === 'RUNNING' && fs.realpathSync(state.run) === fs.realpathSync(run));
  assert.ok(Number.isInteger(state.mysqlPort) && state.mysqlPort > 1024 && state.mysqlPort < 65536);
  assert.equal(fs.realpathSync(db('SELECT @@datadir')), fs.realpathSync(path.join(run, 'mysql-data')));
  check('original_inputs_match_current', inputs.every((item, index) => item.Hash.toLowerCase() === inputsBefore[index].sha256));
  for (const build of ['backend-' + backendRound, 'frontend-' + frontendRound]) {
    const builtInputs = read(path.join(evidence, 'h3-portal-finance-20261002-' + build + '-inputs.json'));
    check('source_matches_verified_' + build, builtInputs.every(built => inputs.some(item => item.Path === built.Path && item.Hash === built.Hash)));
  }
  const original = read(path.join(source, 'result.json'));
  const fixture = read(path.join(source, 'fixture.json'));
  // A newly generated peer adds two denied draft reads and two allowed submitted reads.
  check('original_privacy_matrix_passed', original.passed && original.matrix === (fixture.reusedPeer ? 103 : 107)
    && original.auditedOperations === (fixture.reusedPeer ? 45 : 49));
  check('original_pending_boundary_retained', original.deniedQueryAuditVerified === false && original.all18Complete === false && original.globalComplete === false);
  const requests = read(requestsFile).filter(request => request.method === 'GET'
    && /^\/hr\/(?:ess\/salary-slips|compensation\/payroll\/(?:slips|batches))(?:\/|\?|$)/.test(request.path));
  // Polling may add reads; every recorded query is reconciled below without sampling.
  check('original_query_coverage_retained', requests.length >= 117);
  const denied = requests.filter(request => request.status >= 400);
  check('original_denied_query_coverage_retained', denied.length === (fixture.reusedPeer ? 77 : 79));
  assert.ok(requests.every(request => /^[a-f0-9]{32}$/.test(request.traceId)));
  check('original_trace_ids_unique', new Set(requests.map(request => request.traceId)).size === requests.length);
  const traceIds = requests.map(request => "'" + request.traceId + "'").join(',');
  // Read every persisted column into memory for secret/content scanning; never write payloads.
  function logRows(table, order) {
    assert.ok(['sys_log', 'sys_api_error_log'].includes(table));
    const columns = db(`SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='cloud_flow_db' AND TABLE_NAME='${table}' ORDER BY ORDINAL_POSITION`).split(/\r?\n/);
    assert.ok(columns.every(column => /^[a-z_][a-z0-9_]*$/.test(column)));
    return rows(`SELECT JSON_OBJECT(${columns.map(column => `'${column}',\`${column}\``).join(',')}) FROM ${table} WHERE trace_id IN (${traceIds}) ORDER BY ${order}`);
  }
  const access = logRows('sys_log', 'log_id');
  const errors = logRows('sys_api_error_log', 'error_id');
  const identities = {
    admin: ['g_import_admin', '100000'], hr: ['g_holiday_hr', '100000'], employee: ['g_holiday_employee', '100000'],
    manager: ['g_holiday_manager', '100000'], foreign: ['g_import_tenant', '100001'], anonymous: ['', '0']
  };
  const parameters = [];
  for (const [index, request] of requests.entries()) {
    const label = 'request_' + (index + 1);
    const requestPath = request.path.split('?')[0];
    const expected = identities[request.actor]; assert.ok(expected);
    const matched = access.filter(entry => entry.trace_id === request.traceId && entry.request_url === requestPath);
    check(label + '_gateway_record', matched.length >= 1);
    check(label + '_identity_method_status_type', matched.length >= 1 && matched.every(entry =>
      (entry.create_by || '') === expected[0] && String(entry.tenant_id) === expected[1]
      && entry.request_method === request.method && Number(entry.result_code) === request.status
      && entry.log_type === (request.status >= 400 ? '9' : '0')));
    check(label + '_gateway_has_no_parameters', matched.length >= 1 && matched.every(entry => !entry.params));
    const relatedAccess = access.filter(entry => entry.trace_id === request.traceId);
    const relatedErrors = errors.filter(entry => entry.trace_id === request.traceId);
    check(label + '_all_paths_and_methods', [...relatedAccess, ...relatedErrors].every(entry =>
      [requestPath, requestPath.replace(/^\/hr/, '')].includes(entry.request_url) && entry.request_method === 'GET'));
    for (const entry of [...relatedAccess.map(item => ({ id: item.log_id, type: 'access', value: item.params })),
      ...relatedErrors.map(item => ({ id: item.error_id, type: 'error', value: item.request_params }))]) {
      if (!entry.value) continue;
      let parsed;
      try { parsed = JSON.parse(entry.value); } catch { check(label + '_parameter_json', false); continue; }
      const query = new URL(request.path, 'http://127.0.0.1').searchParams;
      const keys = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? Object.keys(parsed) : null;
      const pathId = requestPath.match(/\/(\d+)(?:\/pdf)?$/)?.[1];
      let allowed = false;
      if (keys?.length === 1 && keys[0] === 'id') {
        allowed = Boolean(pathId) && String(parsed.id) === pathId;
      } else if (keys?.length === 1 && keys[0] === 'query' && requestPath === '/hr/ess/salary-slips') {
        const value = parsed.query;
        const expected = { pageNum: query.get('pageNum') || '1', pageSize: query.get('pageSize') || '10',
          employeeId: query.get('employeeId'), signerId: null, periodMonth: null, status: null,
          cardType: null, relation: null, keyword: null, params: {} };
        allowed = value !== null && typeof value === 'object' && !Array.isArray(value)
          && Object.keys(value).every(key => Object.hasOwn(expected, key) && (key === 'params'
            ? value[key] !== null && typeof value[key] === 'object' && !Array.isArray(value[key]) && Object.keys(value[key]).length === 0
            : expected[key] === null ? value[key] === null : String(value[key]) === expected[key]))
          && ['pageNum', 'pageSize'].every(key => String(value[key]) === expected[key])
          && (!query.has('employeeId') || String(value.employeeId) === query.get('employeeId'));
      }
      check(label + '_' + entry.type + '_parameters_only_original_filters', allowed);
      parameters.push({ request: index + 1, type: entry.type, id: String(entry.id), object: keys !== null, keys, valid: allowed });
    }
    records.push({ ...request, path: requestPath, gatewayLogIds: matched.map(entry => String(entry.log_id)),
      actorVerified: expected[0], tenantVerified: expected[1], accessRecords: relatedAccess.length, errorRecords: relatedErrors.length });
  }
  const accounts = read(path.join(run, 'private/accounts.json'));
  const passwords = [...new Set(accounts.filter(account => Object.values(identities).some(([name]) => name === account.username)).map(account => account.password))];
  assert.ok(passwords.length > 0 && passwords.every(value => typeof value === 'string' && value.length >= 8));
  const logText = [...access, ...errors].flatMap(entry => Object.values(entry).filter(value => typeof value === 'string')).join('\n');
  check('persisted_logs_no_known_account_passwords', passwords.every(value => !logText.includes(value)));
  check('persisted_logs_no_bearer_or_jwt', !/Bearer\s+[A-Za-z0-9._~-]{16,}|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/.test(logText));
  check('persisted_logs_no_salary_amount_fields', !/"(?:grossTotal|deductionTotal|netTotal|taxAmount|benefitAmount|components|gross_total|net_total|tax_amount)"\s*:/.test(logText));
  const salaryValues = Object.values(fixture.targets).map(target => target.net);
  check('persisted_logs_no_four_sample_net_amounts', salaryValues.every(value => !logText.includes(value)));
  summary = { requests: requests.length, denied: denied.length, accessRecords: access.length, errorRecords: errors.length,
    allowedQueries: requests.length - denied.length, byActor: Object.fromEntries(Object.keys(identities).map(actor => [actor,
      { queries: requests.filter(request => request.actor === actor).length, denied: denied.filter(request => request.actor === actor).length }])),
    parametersChecked: parameters.length, parameterShapes: [...new Set(parameters.map(item => JSON.stringify(item.keys)))],
    secretsChecked: passwords.length, salaryValuesChecked: salaryValues.length };
  fs.writeFileSync(path.join(output, 'requests.json'), JSON.stringify(records, null, 2), { flag: 'wx' });
  fs.writeFileSync(path.join(output, 'parameter-checks.json'), JSON.stringify(parameters, null, 2), { flag: 'wx' });
} catch (error) {
  // No assertion payloads: they may contain secrets from private inputs or database values.
  failures.push('execution_exception_' + error.constructor.name);
} finally {
  check('original_evidence_unchanged', sources.every(item => hash(fs.readFileSync(item.path)) === item.sha256));
  check('inputs_unchanged_during_read_only_check', inputsBefore.every(item => hash(fs.readFileSync(path.join(root, item.path))) === item.sha256));
  check('verifier_unchanged', hash(fs.readFileSync(new URL(import.meta.url))) === scriptHash);
  const result = { passed: failures.length === 0, readOnly: true, databaseSelects: queryCount, backend: backendRound, frontend: frontendRound, privacyRound,
    ...summary, checkedInputs: inputsBefore.length, sources, verifierSha256: scriptHash, checks, failures,
    deniedQueryAuditVerified: failures.length === 0, dedicatedHrDeniedAudit: false, all18Complete: false, globalComplete: false };
  fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify(result, null, 2), { flag: 'wx' });
  fs.copyFileSync(new URL(import.meta.url), path.join(output, 'original-verify-d3-denied-query-audit.mjs'), fs.constants.COPYFILE_EXCL);
  console.log('D3_DENIED_AUDIT: ' + JSON.stringify({ ...summary, passed: result.passed, checks: checks.length,
    inputs: inputsBefore.length, databaseSelects: queryCount, failedChecks: failures.length, firstFailures: failures.slice(0, 5), all18Complete: false, globalComplete: false }));
  if (!result.passed) process.exitCode = 1;
}
