import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { authenticateH3CommissionAccount } from './h3-commission-browser-auth.mjs';
import { ownedGatewayRedis } from '../owned-gateway-redis.mjs';
import { scanSecretStream, scanOwnedAuditLogs } from '../portal-checks/scan-access-logs.mjs';

export async function createH3CommissionRuntime(root, statePath, output) {
  assert.equal(fs.realpathSync(root), fs.realpathSync('D:/CloudFlowPro'));
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8').replace(/^\uFEFF/, ''));
  const run = fs.realpathSync(state.run);
  assert.equal(state.status, 'RUNNING');
  assert.equal(path.dirname(run), fs.realpathSync(path.join(root, '.cloudflow-runtime/batch-g-integration')));
  assert.match(path.basename(run), /^[a-f0-9]{32}$/);
  assert.notEqual(path.basename(run), '9799534e1a3a47b5958330f14ae16dc7');
  assert.equal(fs.realpathSync(path.dirname(statePath)), run);
  assert.equal(path.dirname(fs.realpathSync(output)), fs.realpathSync(path.join(root, '.cloudflow-runtime/full-prd-20260915/approved-runtime')));
  assert.match(path.basename(output), /^h3-commission-independent-20261010-r[1-9]\d*$/);
  assert.ok(Number.isInteger(state.mysqlPort) && state.mysqlPort > 1024 && state.mysqlPort < 65536);
  const checks = [], requests = [], uiRequests = [], browserErrors = [], fixtureChanges = [];
  const sensitive = new Set(), sessions = {}, ownedEntities = new Map();
  const check = (label, condition) => { assert.ok(condition, label); checks.push(label); };
  const environment = { ...process.env }; delete environment.MYSQL_PWD;
  const sql = value => `CONVERT(UNHEX('${Buffer.from(String(value), 'utf8').toString('hex')}') USING utf8mb4)`;
  const executeSql = statement => {
    const result = spawnSync('mysql.exe', ['--no-defaults', '--protocol=TCP', '--host=127.0.0.1', `--port=${state.mysqlPort}`, '--user=root', '--skip-password', '--batch', '--raw', '--skip-column-names', '--default-character-set=utf8mb4', 'cloud_flow_db'],
      { input: statement, encoding: 'utf8', env: environment, windowsHide: true, timeout: 30000, maxBuffer: 16 * 1024 * 1024 });
    const databaseError = String(result.stderr || '').match(/ERROR [0-9]+ \([A-Z0-9]+\)/)?.[0] || 'diagnostics withheld';
    assert.equal(result.status, 0, 'Independent H3 commission database operation failed (' + databaseError + ')');
    return result.stdout.trim();
  };
  const database = statement => {
    assert.match(statement, /^SELECT\s/i);
    assert.ok(!/;\s*\S|\bINTO\s+(?:OUTFILE|DUMPFILE)\b/i.test(statement), 'One read statement required');
    return executeSql(statement);
  };
  assert.equal(fs.realpathSync(database('SELECT @@datadir;')), fs.realpathSync(path.join(run, 'mysql-data')));
  const rows = statement => database(statement).split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
  const saveSecrets = () => fs.writeFileSync(path.join(run, 'private/h3-commission-secrets.json'), JSON.stringify([...sensitive]));
  const accounts = JSON.parse(fs.readFileSync(path.join(run, 'private/accounts.json'), 'utf8'));
  const redis = await ownedGatewayRedis(state);
  for (const account of accounts) sensitive.add(account.password);
  for (const service of state.services) {
    const configuration = fs.readFileSync(path.join(run, service.name, 'integration.properties'), 'utf8');
    for (const line of configuration.split(/\r?\n/)) {
      const match = line.match(/^([^#=]+)=(.*)$/);
      if (match && /secret-key|aes-key|internal-auth\.keys\.|^spring\.data\.redis\.password$/.test(match[1]) && match[2]) sensitive.add(match[2]);
    }
  }
  saveSecrets();
  const smtpDirectory = fs.realpathSync(path.join(run, 'private/smtp'));
  assert.equal(smtpDirectory, fs.realpathSync(state.smtpFixture.directory));
  assert.equal(state.smtpFixture.loopback, true);
  sensitive.add(fs.readFileSync(path.join(smtpDirectory, 'store-password.txt'), 'utf8'));
  saveSecrets();
  const frontend = path.join(root, 'cloudflow-frontend');
  const requireFrontend = createRequire(path.join(frontend, 'package.json'));
  const requireBrowser = createRequire(path.join(process.env.CLOUDFLOW_PLAYWRIGHT_HOME || path.join(root, '.cloudflow-runtime/playwright'), 'package.json'));
  const { createServer } = await import(pathToFileURL(requireFrontend.resolve('vite')).href);
  const { chromium } = requireBrowser('playwright-core');
  const gateway = state.services.find(service => service.name === 'gateway');
  assert.ok(gateway && Number.isInteger(gateway.port));
  const server = await createServer({ root: frontend, configFile: path.join(frontend, 'vite.config.ts'), logLevel: 'error',
    server: { host: '127.0.0.1', port: 0, hmr: false, watch: null, proxy: {
      '/api': { target: `http://127.0.0.1:${gateway.port}`, changeOrigin: false, rewrite: value => value.replace(/^\/api/, '') },
    } },
  });
  let browser, origin;
  const close = async () => {
    saveSecrets();
    try { await browser?.close(); } finally { await server.close(); }
  };
  try {
    await server.listen(); origin = `http://127.0.0.1:${server.httpServer.address().port}`;
    browser = await chromium.launch({ headless: true });
    for (const [actor, username] of [['admin', 'g_import_admin'], ['other', 'g_import_other'], ['sales', 'g_opportunity_sales'], ['manager', 'g_opportunity_manager'], ['readonly', 'g_import_readonly'], ['foreign', 'g_import_tenant'], ['reviewer', 'g_holiday_employee'], ['finance', 'g_holiday_hr']]) {
      if (Object.keys(sessions).length === 5) await new Promise(resolve => setTimeout(resolve, 60000));
      const account = accounts.find(value => value.username === username);
      assert.ok(account, 'Independent H3 commission account missing');
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
      await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
      const page = await context.newPage();
      page.on('pageerror', () => browserErrors.push(actor));
      page.on('response', response => {
        const requestUrl = new URL(response.url());
        if (requestUrl.origin === origin && requestUrl.pathname.startsWith('/api/')) {
          uiRequests.push({ actor, path: requestUrl.pathname, method: response.request().method(), status: response.status(), traceId: response.headers()['x-trace-id'] || null });
        }
      });
      await page.goto(origin, { waitUntil: 'domcontentloaded' });
      const identity = await authenticateH3CommissionAccount(page, account, origin);
      check(`actual_login_${actor}`, identity.authenticated && identity.tenantId === (actor === 'foreign' ? '100001' : '100000'));
      const token = await page.evaluate(async () => (await import('/src/utils/authStorage.ts')).getAuthToken());
      assert.ok(token, 'Completed login token required');
      sensitive.add(token); sensitive.add(token.replace(/^Bearer /, '')); saveSecrets();
      sessions[actor] = { page, context, identity };
      const expectedScope = { sales: 4, manager: 3, readonly: 0 }[actor];
      if (expectedScope !== undefined) {
        check(`page_read_dependencies_${actor}`, ['system:lookup:read', 'system:message:mine:list'].every(permission => identity.permissions.includes(permission)));
        assert.match(identity.userId, /^[1-9][0-9]*$/);
        const scope = JSON.parse(redis('GET', `user:datascope:${identity.tenantId}:${identity.userId}`));
        const configuredScope = database(`SELECT MIN(role.ds_type) FROM sys_user_role binding JOIN sys_role role ON role.role_id=binding.role_id AND role.tenant_id=binding.tenant_id WHERE binding.tenant_id=${identity.tenantId} AND binding.user_id=${identity.userId};`);
        check(`actual_data_scope_${actor}`, Number(configuredScope) === expectedScope && scope.dsType === expectedScope && String(scope.userId) === identity.userId && String(scope.tenantId) === identity.tenantId);
      }
    }
  } catch (error) {
    for (const context of browser?.contexts() || []) {
      for (const page of context.pages()) {
        try {
          const token = await page.evaluate(async () => (await import('/src/utils/authStorage.ts')).getAuthToken());
          if (token) { sensitive.add(token); sensitive.add(token.replace(/^Bearer /, '')); }
        } catch {}
      }
    }
    error.h3RuntimeFacts = { checks: [...checks], requests: [...requests], uiRequests: [...uiRequests], browserErrors: [...browserErrors] };
    await close();
    throw error;
  }
  const interval = Math.max(5000, Number(database("SELECT COALESCE(MAX(CAST(config_value AS UNSIGNED)),0) FROM sys_config WHERE config_key='sys.common.repeatSubmit.intervalMillis';"))) + 150;
  assert.ok(Number.isSafeInteger(interval) && interval <= 60150);
  const writeTimes = new Map();
  const api = async (actor, requestPath, options = {}) => {
    assert.ok(sessions[actor], 'H3 commission actor must be authenticated');
    assert.match(requestPath, /^\/(?:hr\/(?:compensation|ess\/salary-slips)(?:\/|\?|$)|inner\/hr\/comp-change\/commission(?:\/|\?|$)|crm\/(?:customer|opportunity|quote|receivable|approval|deal-team|deal-allocation|commission)(?:\/|\?|$)|oa\/contract(?:\/|\?|$)|workflow\/wf\/(?:todo|complete|history)(?:\/|\?|$))/);
    assert.ok(!requestPath.includes('..') && !requestPath.includes('://'));
    const method = options.method || 'GET';
    assert.ok(['GET', 'POST', 'PUT', 'DELETE'].includes(method));
    if (options.file) {
      assert.match(requestPath, /^\/oa\/contract\/[1-9][0-9]*\/signed-file$/);
      assert.equal(method, 'POST'); assert.equal(options.file.type, 'application/pdf');
      assert.match(options.file.name, /^[A-Za-z0-9_-]+\.pdf$/);
      assert.ok(typeof options.file.content === 'string' && options.file.content.length < 10000);
    }
    const writeKey = JSON.stringify([actor, method, requestPath.split('?')[0], options.body ?? null]);
    if (method !== 'GET' && !options.concurrent) {
      const remaining = interval - (Date.now() - (writeTimes.get(writeKey) || 0));
      if (remaining > 0) await new Promise(resolve => setTimeout(resolve, remaining));
    }
    const requestStarted = performance.now();
    const response = await sessions[actor].page.evaluate(async supplied => {
      const token = (await import('/src/utils/authStorage.ts')).getAuthToken();
      const headers = {};
      if (token) headers.Authorization = token.startsWith('Bearer ') ? token : `Bearer ${token}`;
      const csrf = document.cookie.split(';').map(value => value.trim()).find(value => value.startsWith('XSRF-TOKEN='));
      if (csrf) headers['X-CSRF-Token'] = decodeURIComponent(csrf.slice('XSRF-TOKEN='.length));
      let requestBody;
      if (supplied.file) {
        const bytes = Uint8Array.from(atob(supplied.file.content), character => character.charCodeAt(0));
        requestBody = new FormData(); requestBody.append('file', new Blob([bytes], { type: supplied.file.type }), supplied.file.name);
      } else if (supplied.body !== undefined) { headers['Content-Type'] = 'application/json'; requestBody = JSON.stringify(supplied.body); }
      const result = await fetch(`/api${supplied.requestPath}`, { method: supplied.method, credentials: 'same-origin', headers,
        ...(requestBody === undefined ? {} : { body: requestBody }), signal: AbortSignal.timeout(30000),
      });
      const responseText = await result.text();
      return { status: result.status, traceId: result.headers.get('X-Trace-Id'), ruleWarning: result.headers.get('X-CRM-Rule-Warning'), body: (result.headers.get('Content-Type') || '').includes('json') ? JSON.parse(responseText) : null, text: supplied.textResponse ? responseText : null };
    }, { requestPath, method, body: options.body, file: options.file, textResponse: options.textResponse === true });
    response.durationMs = performance.now() - requestStarted;
    if (method !== 'GET') writeTimes.set(writeKey, Date.now());
    requests.push({ actor, path: requestPath, method, status: response.status, code: response.body?.code, traceId: response.traceId, durationMs: response.durationMs, ruleWarning: response.ruleWarning });
    return response;
  };
  const success = (response, label) => {
    check(`${label}:status_${response.status}_code_${response.body?.code}`, response.status === 200 && response.body?.code === 200);
    return response.body.data;
  };
  const ok = async (actor, requestPath, method = 'GET', body) => success(await api(actor, requestPath, { method, body }), `${method}_${requestPath.split('?')[0]}`);
  const fixtureWrite = (kind, identifierValue, changes, reason) => {
    const definitions = {
      opportunity: { table: 'crm_opportunity', key: 'opportunity_id', fields: ['stage_changed_time'] },
      event: { table: 'crm_deal_event', key: 'event_id', fields: ['occurred_time'] },
      history: { table: 'crm_opportunity_stage_history', key: 'history_id', fields: ['changed_time'] },
      user: { table: 'sys_user', key: 'user_id', fields: ['dept_id'] },
      employee: { table: 'hr_employee', key: 'id', fields: ['dept_id'] },
    };
    const definition = definitions[kind], identifier = String(identifierValue);
    assert.ok(definition && ownedEntities.get(kind)?.has(identifier), 'Only an identified owned sample may be changed');
    assert.match(identifier, /^[1-9][0-9]*$/);
    assert.ok(typeof reason === 'string' && reason.length > 0 && reason.length <= 200);
    assert.ok(changes && !Array.isArray(changes) && Object.keys(changes).length > 0);
    const values = Object.entries(changes).map(([field, value]) => {
      assert.ok(definition.fields.includes(field), 'Only explicit historical time or fixture department fields may change');
      if (field === 'dept_id') assert.ok(['100', '990000840'].includes(String(value)));
      else assert.match(String(value), /^[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2}$/);
      return field + '=' + sql(value);
    });
    const filter = ' WHERE tenant_id=100000 AND ' + definition.key + '=' + identifier;
    assert.equal(database('SELECT COUNT(*) FROM ' + definition.table + filter + ';'), '1', 'Exactly one owned source must exist');
    executeSql('UPDATE ' + definition.table + ' SET ' + values.join(',') + filter + ';');
    fixtureChanges.push({ table: definition.table, identifier, fields: Object.keys(changes), values: { ...changes }, reason,
      actualBusinessAction: false, independentFixtureOnly: true });
  };
  const ownedAllocation = identifierValue => {
    const identifier = String(identifierValue);
    assert.match(identifier, /^[1-9][0-9]*$/);
    assert.ok(ownedEntities.get('allocation')?.has(identifier), 'Commission fault or delivery read requires an owned actual allocation');
    assert.equal(database('SELECT COUNT(*) FROM crm_deal_allocation WHERE tenant_id=100000 AND allocation_id=' + identifier + ';'), '1');
    return identifier;
  };
  const installCommissionFault = (kind, allocationValue) => {
    assert.ok(['sourceInsert', 'paymentAudit'].includes(kind));
    const allocationId = ownedAllocation(allocationValue);
    const trigger = kind === 'sourceInsert' ? 'h3_commission_source_failure' : 'h3_commission_payment_audit_failure';
    const table = kind === 'sourceInsert' ? 'hr_comp_change' : 'hr_audit_log';
    let condition = "NEW.tenant_id=100000 AND NEW.source_biz_type='CRM_COMMISSION' AND NEW.source_biz_id=" + sql(allocationId);
    if (kind === 'paymentAudit') {
      const changeId = database("SELECT id FROM hr_comp_change WHERE tenant_id=100000 AND source_biz_type='CRM_COMMISSION' AND source_biz_id=" + sql(allocationId) + ' AND deleted=0;');
      assert.match(changeId, /^[1-9][0-9]*$/);
      condition = "NEW.tenant_id=100000 AND NEW.business_domain='CRM_COMMISSION' AND NEW.operation_type='COMMISSION_PROGRESS' AND NEW.business_id=" + changeId
        + " AND JSON_UNQUOTE(JSON_EXTRACT(NEW.after_data,'$.state'))='PAID'";
    }
    const count = () => database("SELECT COUNT(*) FROM information_schema.triggers WHERE trigger_schema='cloud_flow_db' AND trigger_name=" + sql(trigger) + ';');
    assert.equal(count(), '0', 'A controlled fault may not replace an existing trigger');
    executeSql('DELIMITER //\nCREATE TRIGGER ' + trigger + ' BEFORE INSERT ON ' + table + ' FOR EACH ROW BEGIN IF ' + condition
      + " THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='H3_COMMISSION_CONTROLLED_FAILURE'; END IF; END//\nDELIMITER ;\n");
    assert.equal(count(), '1');
    const record = { kind: 'controlledCommissionFailure', operation: kind, allocationId, table, trigger,
      independentFixtureOnly: true, actualBusinessAction: false, removed: false };
    fixtureChanges.push(record);
    return () => {
      if (record.removed) return;
      assert.equal(count(), '1', 'Owned commission fault must remain identifiable');
      executeSql('DROP TRIGGER cloud_flow_db.' + trigger + ';');
      assert.equal(count(), '0'); record.removed = true;
    };
  };
  const commissionDelivery = allocationValue => {
    const allocationId = ownedAllocation(allocationValue);
    const events = rows("SELECT JSON_OBJECT('id',event_id) FROM outbox_event WHERE tenant_id=100000 AND aggregate_type='cloudflow-service-crm'"
      + " AND event_type='CRM_COMMISSION_REQUEST' AND aggregate_id=" + allocationId
      + " AND JSON_UNQUOTE(JSON_EXTRACT(JSON_UNQUOTE(JSON_EXTRACT(payload_json,'$.payload')),'$.operation'))='POST';");
    assert.equal(events.length, 1, 'One durable actual commission POST request required');
    const configuration = fs.readFileSync(path.join(run, 'hr/integration.properties'), 'utf8');
    const prefix = configuration.match(/^cloudflow\.outbox\.consumer-group=(.+)$/m)?.[1]?.trim() || 'cloudflow-event-consumer-group';
    const digest = createHash('sha256');
    for (const value of [prefix + ':cloudflow-service-hr', '100000', events[0].id]) {
      const bytes = Buffer.from(value, 'utf8'), length = Buffer.alloc(4); length.writeInt32BE(bytes.length);
      digest.update(length).update(bytes);
    }
    const values = redis('HMGET', 'cloudflow:event:idem:' + digest.digest('hex'), 'state', 'attempts').split(/\r?\n/);
    return { eventId: events[0].id, state: values[0] || null, attempts: Number(values[1] || 0), readOnly: true };
  };
  const observeSecret = value => { assert.ok(typeof value === 'string' && value.length > 0); sensitive.add(value); saveSecrets(); };
  const workflowPacing = [], workflowStarts = new Map();
  const paceWorkflowStart = async actor => {
    const prior = workflowStarts.get(actor) || 0;
    const delay = 60050 - (Date.now() - prior);
    if (delay > 0) { workflowPacing.push({ actor, milliseconds: delay, naturalWindow: true }); await new Promise(resolve => setTimeout(resolve, delay)); }
    workflowStarts.set(actor, Date.now());
  };
  const scan = async () => {
    saveSecrets();
    let files = 0, leaks = 0, bytes = 0;
    for (const service of state.services) {
      const directory = path.join(run, service.name);
      const logPaths = fs.readdirSync(directory).filter(name => name.endsWith('.log')).map(name => path.join(directory, name));
      const nested = path.join(directory, 'logs');
      if (fs.existsSync(nested)) logPaths.push(...fs.readdirSync(nested).filter(name => name.endsWith('.log')).map(name => path.join(nested, name)));
      for (const logPath of logPaths) {
        const result = await scanSecretStream(fs.createReadStream(logPath), [...sensitive]); files++; leaks += result.leaks; bytes += result.bytes;
      }
    }
    const audit = await scanOwnedAuditLogs(state, [...sensitive], { log: '0', error: '0', audit: '0' });
    leaks += audit.leaks; bytes += audit.bytes;
    check('service_and_audit_secrets_kept', files >= 12 && bytes > 0 && leaks === 0);
    return { files, bytes, sensitiveValues: sensitive.size, leaks };
  };
  return { root, run, state, origin, output, checks, requests, uiRequests, browserErrors, sensitive, sessions, ownedEntities, fixtureChanges, sql, check, database, rows, api, success, ok, fixtureWrite, installCommissionFault, commissionDelivery, observeSecret, smtpDirectory, paceWorkflowStart, workflowPacing, scan, close };
}
