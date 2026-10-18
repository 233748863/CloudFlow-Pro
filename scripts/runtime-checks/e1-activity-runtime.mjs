import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { authenticateE1ActivityAccount } from './e1-activity-browser-auth.mjs';
import { scanSecretStream, scanOwnedAuditLogs } from '../portal-checks/scan-access-logs.mjs';

export async function createE1ActivityRuntime(root, output) {
  assert.equal(fs.realpathSync(root), fs.realpathSync('D:/CloudFlowPro'));
  const run = path.join(root, '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7');
  const state = JSON.parse(fs.readFileSync(path.join(run, 'state.json'), 'utf8').replace(/^\uFEFF/, ''));
  assert.equal(state.status, 'RUNNING'); assert.equal(fs.realpathSync(state.run), fs.realpathSync(run));
  assert.ok(Number.isInteger(state.mysqlPort) && state.mysqlPort > 1024 && state.mysqlPort < 65536);
  assert.equal(path.dirname(fs.realpathSync(output)), fs.realpathSync(path.join(root, '.cloudflow-runtime/full-prd-20260915/approved-runtime')));
  const checks = [], requests = [], sensitive = new Set(), sessions = {}, browserErrors = [];
  const check = (label, value) => { assert.ok(value, label); checks.push(label); };
  const env = { ...process.env }; delete env.MYSQL_PWD;
  const database = statement => {
    assert.match(statement, /^SELECT\s/i); assert.ok(!/;\s*\S|\bINTO\s+(?:OUTFILE|DUMPFILE)\b/i.test(statement), 'One read statement only');
    const result = spawnSync('mysql.exe', ['--no-defaults', '--protocol=TCP', '--host=127.0.0.1', `--port=${state.mysqlPort}`, '--user=root', '--skip-password',
      '--batch', '--raw', '--skip-column-names', '--default-character-set=utf8mb4', 'cloud_flow_db'],
    { input: statement, encoding: 'utf8', windowsHide: true, env, timeout: 30000, maxBuffer: 16 * 1024 * 1024 });
    assert.equal(result.status, 0, 'Owned E1 read failed'); return result.stdout.trim();
  };
  assert.equal(fs.realpathSync(database('SELECT @@datadir;')), fs.realpathSync(path.join(run, 'mysql-data')));
  const rows = statement => { const result = database(statement); return result ? result.split(/\r?\n/).map(line => JSON.parse(line)) : []; };
  const boundaries = rows("SELECT JSON_OBJECT('log',CAST(COALESCE((SELECT MAX(log_id) FROM sys_log),0) AS CHAR),'error',CAST(COALESCE((SELECT MAX(error_id) FROM sys_api_error_log),0) AS CHAR),'audit',CAST(COALESCE((SELECT MAX(audit_id) FROM sys_audit_log),0) AS CHAR));")[0];
  const frontend = path.join(root, 'cloudflow-frontend');
  const requireFrontend = createRequire(path.join(frontend, 'package.json'));
  const requireBrowser = createRequire(path.join(process.env.CLOUDFLOW_PLAYWRIGHT_HOME || path.join(root, '.cloudflow-runtime/playwright'), 'package.json'));
  const { createServer } = await import(pathToFileURL(requireFrontend.resolve('vite')).href);
  const { chromium } = requireBrowser('playwright-core');
  const gateway = state.services.find(service => service.name === 'gateway'); assert.ok(gateway && Number.isInteger(gateway.port));
  const server = await createServer({ root: frontend, configFile: path.join(frontend, 'vite.config.ts'), logLevel: 'error',
    server: { host: '127.0.0.1', port: 0, hmr: false, watch: null, proxy: {
      '/api': { target: `http://127.0.0.1:${gateway.port}`, changeOrigin: false, rewrite: value => value.replace(/^\/api/, '') } } } });
  let browser;
  const close = async () => { await browser?.close(); await server.close(); };
  try {
    await server.listen(); const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
    browser = await chromium.launch({ headless: true });
    const accounts = JSON.parse(fs.readFileSync(path.join(run, 'private/accounts.json'), 'utf8'));
    for (const [actor, username] of [['admin', 'g_import_admin'], ['sales', 'g_opportunity_sales'], ['manager', 'g_opportunity_manager'], ['foreign', 'g_import_tenant'], ['employee', 'g_holiday_employee']]) {
      const account = accounts.find(value => value.username === username); assert.ok(account, 'Owned account missing'); sensitive.add(account.password);
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
      await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
      const page = await context.newPage(); page.on('pageerror', () => browserErrors.push(actor));
      await page.goto(origin, { waitUntil: 'domcontentloaded' });
      const identity = await authenticateE1ActivityAccount(page, account, origin);
      check(`real_login_${actor}`, identity.authenticated && identity.tenantId === (actor === 'foreign' ? '100001' : '100000'));
      const token = await page.evaluate(async () => (await import('/src/utils/authStorage.ts')).getAuthToken()); sensitive.add(token); sensitive.add(token.replace(/^Bearer /, ''));
      sessions[actor] = { page, context, identity };
    }
  } catch (error) { await close(); throw error; }
  const interval = Math.max(5000, Number(database("SELECT COALESCE(MAX(CAST(config_value AS UNSIGNED)),0) FROM sys_config WHERE config_key='sys.common.repeatSubmit.intervalMillis'"))) + 150;
  assert.ok(Number.isSafeInteger(interval) && interval <= 60150);
  const writeTimes = new Map();
  const api = async (actor, requestPath, options = {}) => {
    const standardPath = /^\/(?:crm\/(?:activity|customer|contact|opportunity|lead|service-ticket)|auth\/system\/(?:message|job))(?:\/|\?|$)/.test(requestPath);
    const workspaceInvoicePath = process.argv.includes('--workspace-invoices') && actor === 'admin' && /^\/oa\/invoice(?:\/|\?|$)/.test(requestPath);
    const businessEntryPath = process.argv.includes('--business-entries') && (/^\/crm\/ticket(?:\/|\?|$)/.test(requestPath) || actor === 'admin' && /^\/oa\/contract(?:\/|\?|$)/.test(requestPath));
    const departmentAdminPath = process.argv.includes('--e1-departments') && actor === 'admin' && /^\/auth\/system\/role(?:\/|$)/.test(requestPath);
    const referenceBoundaryPath = process.argv.includes('--e1-references') && (/^\/crm\/ticket(?:\/|\?|$)/.test(requestPath) || ['admin', 'foreign'].includes(actor) && /^\/oa\/contract(?:\/|\?|$)/.test(requestPath));
    const timelineSourcePath = process.argv.includes('--e1-timeline') && /^\/crm\/(?:quote|receivable|follow-up|ticket)(?:\/|\?|$)/.test(requestPath);
    assert.ok(standardPath || workspaceInvoicePath || businessEntryPath || departmentAdminPath || referenceBoundaryPath || timelineSourcePath, 'Request outside E1 verification scope');
    const writeKey = actor + ':' + (options.method || 'GET') + ':' + requestPath.split('?')[0];
    if (options.method && options.method !== 'GET') {
      const remaining = interval - (Date.now() - (writeTimes.get(writeKey) || 0));
      if (remaining > 0) await new Promise(resolve => setTimeout(resolve, remaining));
    }
    const response = await sessions[actor].page.evaluate(async supplied => {
      const token = (await import('/src/utils/authStorage.ts')).getAuthToken();
      const headers = { Authorization: token.startsWith('Bearer ') ? token : `Bearer ${token}` };
      const csrf = document.cookie.split(';').map(value => value.trim()).find(value => value.startsWith('XSRF-TOKEN='));
      if (csrf) headers['X-CSRF-Token'] = decodeURIComponent(csrf.slice('XSRF-TOKEN='.length));
      if (supplied.body !== undefined) headers['Content-Type'] = 'application/json';
      const result = await fetch(`/api${supplied.requestPath}`, { method: supplied.method || 'GET', credentials: 'same-origin', headers,
        ...(supplied.body === undefined ? {} : { body: JSON.stringify(supplied.body) }) });
      return { status: result.status, traceId: result.headers.get('X-Trace-Id'), body: (result.headers.get('Content-Type') || '').includes('json') ? await result.json() : null };
    }, { requestPath, ...options });
    if (options.method && options.method !== 'GET') writeTimes.set(writeKey, Date.now());
    requests.push({ actor, path: requestPath, method: options.method || 'GET', status: response.status, code: response.body?.code, traceId: response.traceId });
    return response;
  };
  const success = (response, label) => { check(`${label}:status_${response.status}_code_${response.body?.code}`, response.status === 200 && response.body?.code === 200); return response.body.data; };
  const ok = async (actor, url, method = 'GET', body) => success(await api(actor, url, { method, body }), `${method}_${url.split('?')[0]}`);
  const scan = async () => {
    let bytes = 0, leaks = 0, files = 0;
    for (const service of state.services) {
      const directory = path.join(run, service.name, 'logs');
      const logPaths = fs.existsSync(directory) ? fs.readdirSync(directory).filter(name => name.endsWith('.log')).map(name => path.join(directory, name)) : [];
      for (const name of ['stdout.log', 'stderr.log']) if (fs.existsSync(path.join(run, service.name, name))) logPaths.push(path.join(run, service.name, name));
      for (const logPath of logPaths) { const value = await scanSecretStream(fs.createReadStream(logPath), [...sensitive]); bytes += value.bytes; leaks += value.leaks; files++; }
    }
    const audit = await scanOwnedAuditLogs(state, [...sensitive], boundaries); bytes += audit.bytes; leaks += audit.leaks;
    check('service_and_audit_login_secret_scan', files >= 6 && bytes > 0 && leaks === 0);
    return { files, bytes, sensitiveValues: sensitive.size, leaks };
  };
  return { run, state, checks, requests, sensitive, sessions, browserErrors, check, database, rows, api, success, ok, scan, close, newContext: options => browser.newContext(options) };
}
