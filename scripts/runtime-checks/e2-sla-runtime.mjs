import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { authenticateE2SlaAccount } from './e2-sla-browser-auth.mjs';
import { ownedGatewayRedis } from '../owned-gateway-redis.mjs';
import { scanSecretStream, scanOwnedAuditLogs } from '../portal-checks/scan-access-logs.mjs';

export async function createE2SlaRuntime(root, statePath, output) {
  assert.equal(fs.realpathSync(root), fs.realpathSync('D:/CloudFlowPro'));
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8').replace(/^\uFEFF/, ''));
  const run = fs.realpathSync(state.run);
  assert.equal(state.status, 'RUNNING');
  assert.equal(path.dirname(run), fs.realpathSync(path.join(root, '.cloudflow-runtime/batch-g-integration')));
  assert.match(path.basename(run), /^[a-f0-9]{32}$/);
  assert.notEqual(path.basename(run), '9799534e1a3a47b5958330f14ae16dc7');
  assert.equal(fs.realpathSync(path.dirname(statePath)), run);
  assert.equal(path.dirname(fs.realpathSync(output)), fs.realpathSync(path.join(root, '.cloudflow-runtime/full-prd-20260915/approved-runtime')));
  assert.match(path.basename(output), /^e2-sla-independent-20261009-r[1-9]\d*$/);
  assert.ok(Number.isInteger(state.mysqlPort) && state.mysqlPort > 1024 && state.mysqlPort < 65536);
  const checks = [], requests = [], uiRequests = [], browserErrors = [], fixtureChanges = [];
  const sensitive = new Set(), sessions = {}, ownedTickets = new Set();
  const check = (label, condition) => { assert.ok(condition, label); checks.push(label); };
  const environment = { ...process.env }; delete environment.MYSQL_PWD;
  const sql = value => `CONVERT(0x${Buffer.from(String(value), 'utf8').toString('hex')} USING utf8mb4)`;
  const executeSql = statement => {
    const result = spawnSync('mysql.exe', ['--no-defaults', '--protocol=TCP', '--host=127.0.0.1', `--port=${state.mysqlPort}`, '--user=root', '--skip-password', '--batch', '--raw', '--skip-column-names', '--default-character-set=utf8mb4', 'cloud_flow_db'],
      { input: statement, encoding: 'utf8', env: environment, windowsHide: true, timeout: 30000, maxBuffer: 16 * 1024 * 1024 });
    assert.equal(result.status, 0, 'Independent E2 database operation failed');
    return result.stdout.trim();
  };
  const database = statement => {
    assert.match(statement, /^SELECT\s/i);
    assert.ok(!/;\s*\S|\bINTO\s+(?:OUTFILE|DUMPFILE)\b/i.test(statement), 'One read statement required');
    return executeSql(statement);
  };
  assert.equal(fs.realpathSync(database('SELECT @@datadir;')), fs.realpathSync(path.join(run, 'mysql-data')));
  const rows = statement => database(statement).split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
  const saveSecrets = () => fs.writeFileSync(path.join(run, 'private/e2-sla-secrets.json'), JSON.stringify([...sensitive]));
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
    for (const [actor, username] of [['admin', 'g_import_admin'], ['other', 'g_import_other'], ['sales', 'g_opportunity_sales'], ['manager', 'g_opportunity_manager'], ['readonly', 'g_import_readonly'], ['foreign', 'g_import_tenant'], ['employee', 'g_holiday_employee']]) {
      if (Object.keys(sessions).length === 5) await new Promise(resolve => setTimeout(resolve, 60000));
      const account = accounts.find(value => value.username === username);
      assert.ok(account, 'Independent E2 account missing');
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
      const identity = await authenticateE2SlaAccount(page, account, origin);
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
    error.e2RuntimeFacts = { checks: [...checks], requests: [...requests], uiRequests: [...uiRequests], browserErrors: [...browserErrors] };
    await close();
    throw error;
  }
  const interval = Math.max(5000, Number(database("SELECT COALESCE(MAX(CAST(config_value AS UNSIGNED)),0) FROM sys_config WHERE config_key='sys.common.repeatSubmit.intervalMillis';"))) + 150;
  assert.ok(Number.isSafeInteger(interval) && interval <= 60150);
  const writeTimes = new Map();
  const api = async (actor, requestPath, options = {}) => {
    assert.ok(sessions[actor], 'E2 actor must be authenticated');
    assert.match(requestPath, /^\/(?:crm\/(?:sla|ticket|customer)(?:\/|\?|$)|crm\/notification\/dispatch\/ticket-sla$|auth\/system\/(?:holiday|job|message)(?:\/|\?|$))/);
    assert.ok(!requestPath.includes('..') && !requestPath.includes('://'));
    const method = options.method || 'GET';
    assert.ok(['GET', 'POST', 'PUT', 'DELETE'].includes(method));
    const writeKey = `${actor}:${method}:${requestPath.split('?')[0]}`;
    if (method !== 'GET' && !options.concurrent) {
      const remaining = interval - (Date.now() - (writeTimes.get(writeKey) || 0));
      if (remaining > 0) await new Promise(resolve => setTimeout(resolve, remaining));
    }
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
      return { status: result.status, traceId: result.headers.get('X-Trace-Id'), body: (result.headers.get('Content-Type') || '').includes('json') ? await result.json() : null };
    }, { requestPath, method, body: options.body });
    if (method !== 'GET') writeTimes.set(writeKey, Date.now());
    requests.push({ actor, path: requestPath, method, status: response.status, code: response.body?.code, traceId: response.traceId });
    return response;
  };
  const success = (response, label) => {
    check(`${label}:status_${response.status}_code_${response.body?.code}`, response.status === 200 && response.body?.code === 200);
    return response.body.data;
  };
  const ok = async (actor, requestPath, method = 'GET', body) => success(await api(actor, requestPath, { method, body }), `${method}_${requestPath.split('?')[0]}`);
  const fixtureTicket = (ticketId, fields, reason) => {
    const id = String(ticketId); assert.match(id, /^[1-9][0-9]*$/); assert.ok(ownedTickets.has(id));
    const allowed = ['opened_time', 'pause_start_time', 'sla_paused_minutes', 'first_response_time', 'first_response_minutes', 'first_response_due', 'resolution_due', 'due_time', 'status', 'sla_status'];
    assert.ok(Object.keys(fields).length > 0 && Object.keys(fields).every(key => allowed.includes(key)));
    assert.ok(typeof reason === 'string' && reason.length > 0);
    assert.equal(database(`SELECT COUNT(*) FROM crm_service_ticket WHERE tenant_id=100000 AND ticket_id=${id} AND ticket_title LIKE 'E2S_%';`), '1');
    const assignments = Object.entries(fields).map(([field, value]) => `${field}=${value == null ? 'NULL' : sql(value)}`);
    executeSql(`UPDATE crm_service_ticket SET ${assignments.join(',')} WHERE tenant_id=100000 AND ticket_id=${id} AND ticket_title LIKE 'E2S_%';`);
    fixtureChanges.push({ ticketId: id, fields: Object.keys(fields), reason, independentDatabaseOnly: true });
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
  return { root, run, state, origin, output, checks, requests, uiRequests, browserErrors, sensitive, sessions, ownedTickets, fixtureChanges, fixtureTicket, sql, check, database, rows, api, success, ok, scan, close };
}
