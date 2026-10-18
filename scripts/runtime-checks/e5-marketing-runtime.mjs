import assert from 'node:assert/strict';
import { createCipheriv } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { authenticateE5MarketingAccount } from './e5-marketing-browser-auth.mjs';
import { ownedGatewayRedis } from '../owned-gateway-redis.mjs';
import { scanSecretStream, scanOwnedAuditLogs } from '../portal-checks/scan-access-logs.mjs';

export async function createE5MarketingRuntime(root, statePath, output) {
  assert.equal(fs.realpathSync(root), fs.realpathSync('D:/CloudFlowPro'));
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8').replace(/^\uFEFF/, ''));
  const run = fs.realpathSync(state.run);
  assert.equal(state.status, 'RUNNING');
  assert.equal(path.dirname(run), fs.realpathSync(path.join(root, '.cloudflow-runtime/batch-g-integration')));
  assert.match(path.basename(run), /^[a-f0-9]{32}$/);
  assert.notEqual(path.basename(run), '9799534e1a3a47b5958330f14ae16dc7');
  assert.equal(fs.realpathSync(path.dirname(statePath)), run);
  assert.equal(path.dirname(fs.realpathSync(output)), fs.realpathSync(path.join(root, '.cloudflow-runtime/full-prd-20260915/approved-runtime')));
  assert.match(path.basename(output), /^e5-marketing-independent-20261010-r[1-9]\d*$/);
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
    assert.equal(result.status, 0, 'Independent E5 database operation failed (' + databaseError + ')');
    return result.stdout.trim();
  };
  const database = statement => {
    assert.match(statement, /^SELECT\s/i);
    assert.ok(!/;\s*\S|\bINTO\s+(?:OUTFILE|DUMPFILE)\b/i.test(statement), 'One read statement required');
    return executeSql(statement);
  };
  assert.equal(fs.realpathSync(database('SELECT @@datadir;')), fs.realpathSync(path.join(run, 'mysql-data')));
  const rows = statement => database(statement).split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
  const saveSecrets = () => fs.writeFileSync(path.join(run, 'private/e5-marketing-secrets.json'), JSON.stringify([...sensitive]));
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
      assert.ok(account, 'Independent E5 account missing');
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
      const identity = await authenticateE5MarketingAccount(page, account, origin);
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
    error.e5RuntimeFacts = { checks: [...checks], requests: [...requests], uiRequests: [...uiRequests], browserErrors: [...browserErrors] };
    await close();
    throw error;
  }
  const interval = Math.max(5000, Number(database("SELECT COALESCE(MAX(CAST(config_value AS UNSIGNED)),0) FROM sys_config WHERE config_key='sys.common.repeatSubmit.intervalMillis';"))) + 150;
  assert.ok(Number.isSafeInteger(interval) && interval <= 60150);
  const writeTimes = new Map();
  const api = async (actor, requestPath, options = {}) => {
    assert.ok(sessions[actor], 'E5 actor must be authenticated');
    assert.match(requestPath, /^\/(?:inner\/auth\/message\/crm-templates$|crm\/(?:lead|lead-score|territory|profile-report|customer|contact|opportunity|quote|receivable|approval|deal-team|campaign|target-list|dashboard)(?:\/|\?|$)|oa\/contract(?:\/|\?|$)|workflow\/wf\/(?:todo|complete|history)(?:\/|\?|$)|auth\/system\/(?:rules|message|job)(?:\/|\?|$))/);
    assert.ok(!requestPath.includes('..') && !requestPath.includes('://'));
    const method = options.method || 'GET';
    assert.ok(['GET', 'POST', 'PUT', 'DELETE'].includes(method));
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
      if (supplied.body !== undefined) headers['Content-Type'] = 'application/json';
      const result = await fetch(`/api${supplied.requestPath}`, { method: supplied.method, credentials: 'same-origin', headers,
        ...(supplied.body === undefined ? {} : { body: JSON.stringify(supplied.body) }), signal: AbortSignal.timeout(30000),
      });
      const responseText = await result.text();
      return { status: result.status, traceId: result.headers.get('X-Trace-Id'), ruleWarning: result.headers.get('X-CRM-Rule-Warning'), body: (result.headers.get('Content-Type') || '').includes('json') ? JSON.parse(responseText) : null, text: supplied.textResponse ? responseText : null };
    }, { requestPath, method, body: options.body, textResponse: options.textResponse === true });
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
  const fixtureWrite = (table, identifierValue, statement, reason) => {
    assert.ok(['sys_config', 'crm_lead', 'crm_campaign_log'].includes(table));
    if (table === 'sys_config') {
      assert.ok(['crm.email.sendingEnabled', 'crm.email.publicOrigin', 'crm.email.allowedHosts', 'crm.email.trackingEnabled', 'crm.email.confirmationThreshold', 'crm.campaign.attribution.window.days'].includes(identifierValue), 'Only explicit independent marketing settings may change');
      assert.ok(statement.includes('config_key=' + sql(identifierValue)) && statement.includes("tenant_id=100000") && statement.includes("config_scope='1'"));
      assert.match(statement, /^UPDATE sys_config SET config_value=/);
    } else {
      assert.match(String(identifierValue), /^[1-9][0-9]*$/);
      assert.ok(ownedEntities.get(table === 'crm_lead' ? 'lead' : 'log')?.has(String(identifierValue)), 'Only this run-owned sample may be dated for historical validation');
      assert.ok(statement.includes((table === 'crm_lead' ? 'lead_id=' : 'log_id=') + identifierValue) && statement.includes('tenant_id=100000'));
      assert.match(statement, table === 'crm_lead' ? /^UPDATE crm_lead SET create_time=/ : /^UPDATE crm_campaign_log SET action_time=/);
    }
    assert.ok(!/;\s*\S/.test(statement), 'One owned fixture update required');
    executeSql(statement);
    fixtureChanges.push({ table, identifier: String(identifierValue), reason, actualBusinessAction: false, independentFixtureOnly: true });
  };
  const observeSecret = value => { assert.ok(typeof value === 'string' && value.length > 0); sensitive.add(value); saveSecrets(); };
  const workflowPacing = [], workflowStarts = new Map();
  const paceWorkflowStart = async actor => {
    const prior = workflowStarts.get(actor) || 0;
    const delay = 60050 - (Date.now() - prior);
    if (delay > 0) { workflowPacing.push({ actor, milliseconds: delay, naturalWindow: true }); await new Promise(resolve => setTimeout(resolve, delay)); }
    workflowStarts.set(actor, Date.now());
  };
  const leadContactMatches = (entityId, supplied) => {
    const id = String(entityId);
    assert.match(id, /^[1-9][0-9]*$/);
    assert.ok(ownedEntities.get('lead')?.has(id), 'Owned source lead required');
    assert.ok(['mobile', 'phone', 'email'].every(field => typeof supplied[field] === 'string'), 'Complete source contact expected');
    return database('SELECT mobile=' + sql(supplied.mobile) + ' AND phone=' + sql(supplied.phone) + ' AND email=' + sql(supplied.email)
      + ' FROM crm_lead WHERE tenant_id=100000 AND lead_id=' + id + ' AND deleted=0;') === '1';
  };
  const encryptedFixtureEquals = (kind, entityId, field, expected) => {
    const allowed = { customer: { table: 'crm_customer', key: 'customer_id', fields: ['email'] }, contact: { table: 'crm_contact', key: 'contact_id', fields: ['email', 'mobile'] } };
    const definition = allowed[kind], id = String(entityId);
    assert.ok(definition && definition.fields.includes(field) && ownedEntities.get(kind)?.has(id), 'Owned encrypted fixture field required');
    assert.match(id, /^[1-9][0-9]*$/);
    const config = fs.readFileSync(path.join(run, 'crm/integration.properties'), 'utf8');
    const keyLine = config.split(/\r?\n/).find(line => line.startsWith('cloudflow.encrypt.aes-key='));
    assert.ok(keyLine, 'Independent encryption configuration missing');
    const key = Buffer.from(keyLine.slice(keyLine.indexOf('=') + 1), 'utf8');
    assert.ok([16, 24, 32].includes(key.length));
    const cipher = createCipheriv('aes-' + key.length * 8 + '-ecb', key, null);
    const encrypted = Buffer.concat([cipher.update(expected, 'utf8'), cipher.final()]).toString('base64');
    const stored = database('SELECT ' + field + ' FROM ' + definition.table + ' WHERE tenant_id=100000 AND ' + definition.key + '=' + id + ' AND deleted=0;');
    return stored !== expected && stored === encrypted;
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
  return { root, run, state, origin, output, checks, requests, uiRequests, browserErrors, sensitive, sessions, ownedEntities, fixtureChanges, sql, check, database, rows, api, success, ok, fixtureWrite, observeSecret, smtpDirectory, paceWorkflowStart, workflowPacing, leadContactMatches, encryptedFixtureEquals, scan, close };
}
