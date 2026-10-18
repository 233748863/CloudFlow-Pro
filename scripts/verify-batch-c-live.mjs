import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { authenticateFormTest } from './runtime-checks/form-browser-auth.mjs';
import { verifyC1ErrorPages } from './verify-c1-error-pages.mjs';
import { verifyC1ValueBoundaries } from './verify-c1-value-boundaries.mjs';
import { verifyC1ValuePages } from './verify-c1-value-pages.mjs';
import { verifyC1DictionaryPages } from './verify-c1-dictionary-pages.mjs';
import { verifyC1LayoutPages } from './verify-c1-layout-pages.mjs';
import { verifyC1OriginalPages } from './verify-c1-original-pages.mjs';
import { verifyC1HistoricalReferences } from './verify-c1-historical-references.mjs';
import { verifyC1DesignerOperations } from './verify-c1-designer-operations.mjs';
import { verifyC2SubtablePages } from './verify-c2-mobile-subtable-pages.mjs';
import { verifyC2TypePages } from './verify-c2-type-pages.mjs';
import { verifyC2DesignerPages } from './verify-c2-designer-pages.mjs';
import { verifyC2PrecisionPages } from './verify-c2-precision-pages.mjs';
import { verifyC3PermissionPages } from './verify-c3-permission-pages.mjs';
import { verifyC3ExpressionPages } from './verify-c3-expression-pages.mjs';
import { verifyC3PermissionCache } from './verify-c3-permission-cache.mjs';
import { verifyC3MatrixTemplates } from './verify-c3-matrix-templates.mjs';
import { verifyC3ReadEntries } from './verify-c3-read-entries.mjs';
import { verifyC3PermissionRaces } from './verify-c3-permission-races.mjs';
import { verifyC3OauthResources } from './verify-c3-oauth-resources.mjs';
import { verifyC3LinkedReads } from './verify-c3-linked-reads.mjs';
import { verifyC3ActionReturns } from './verify-c3-action-returns.mjs';
import { verifyC4VersionRecords } from './verify-c4-version-records.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const isolatedArgument = process.argv.indexOf('--isolated');
const isolatedPath = isolatedArgument < 0 ? null : fs.realpathSync(process.argv[isolatedArgument + 1]);
const directory = isolatedPath ? path.dirname(isolatedPath) : path.join(root, '.cloudflow-runtime/full-prd-20260915/approved-runtime');
if (isolatedPath) {
  assert.equal(path.basename(isolatedPath), 'state.json');
  assert.equal(path.dirname(directory), fs.realpathSync(path.join(root, '.cloudflow-runtime/batch-g-integration')));
  assert.match(path.basename(directory), /^[a-f0-9]{32}$/);
}
const state = JSON.parse(fs.readFileSync(isolatedPath || path.join(directory, 'deployment-state.json'), 'utf8').replace(/^\uFEFF/, ''));
assert.equal(state.status, 'RUNNING');
if (isolatedPath) {
  assert.equal(fs.realpathSync(state.run), directory);
  assert.ok(Number.isInteger(state.mysqlPort) && state.mysqlPort > 1024 && state.mysqlPort < 65536);
} else {
  assert.equal(process.env.CLOUDFLOW_C_LIVE_ACCEPTANCE, '1');
  assert.equal(state.target, '192.168.1.173:3306/cloud_flow_db');
  assert.ok(state.health.passed && (state.backup.restoreVerified || state.backup.archiveVerified) && state.approvedOnly);
  assert.match(process.env.DB_URL ?? '', /^jdbc:mysql:\/\/192\.168\.1\.173:3306\/cloud_flow_db(?:\?|$)/);
}
const runId = randomUUID().replaceAll('-', '');
const suffix = runId.slice(0, 8);
const marker = `C-LIVE-${suffix}`;
const configurationOnly = process.argv.includes('--configuration-only');
const errorPages = process.argv.includes('--error-pages');
const valueBoundaries = process.argv.includes('--value-boundaries');
const valuePages = process.argv.includes('--value-pages');
const dictionaryPages = process.argv.includes('--dictionary-pages');
const layoutPages = process.argv.includes('--layout-pages');
const originalPages = process.argv.includes('--original-pages');
const historicalReferences = process.argv.includes('--historical-references');
const designerOperations = process.argv.includes('--designer-operations');
const subtableMobile = process.argv.includes('--subtable-mobile');
const subtableNative = process.argv.includes('--subtable-native');
const subtableTypes = process.argv.includes('--subtable-types');
const subtableDesigner = process.argv.includes('--subtable-designer');
const subtablePrecision = process.argv.includes('--subtable-precision');
const permissionPages = process.argv.includes('--permission-pages');
const expressionPages = process.argv.includes('--expression-pages');
const permissionCache = process.argv.includes('--permission-cache');
const matrixTemplates = process.argv.includes('--matrix-templates');
const readEntries = process.argv.includes('--read-entries');
const permissionRaces = process.argv.includes('--permission-races');
const oauthResources = process.argv.includes('--oauth-resources');
const linkedReads = process.argv.includes('--linked-reads');
const actionReturns = process.argv.includes('--action-returns');
const versionRecords = process.argv.includes('--version-records');
assert.ok(!versionRecords || isolatedPath && ![configurationOnly,errorPages,valueBoundaries,valuePages,dictionaryPages,layoutPages,originalPages,historicalReferences,designerOperations,subtableMobile,subtableNative,subtableTypes,subtableDesigner,subtablePrecision,permissionPages,expressionPages,permissionCache,matrixTemplates,readEntries,permissionRaces,oauthResources,linkedReads,actionReturns].some(Boolean), 'Version records require a dedicated owned-environment round');
assert.ok(!actionReturns || isolatedPath && ![configurationOnly,errorPages,valueBoundaries,valuePages,dictionaryPages,layoutPages,originalPages,historicalReferences,designerOperations,subtableMobile,subtableNative,subtableTypes,subtableDesigner,subtablePrecision,permissionPages,expressionPages,permissionCache,matrixTemplates,readEntries,permissionRaces,oauthResources,linkedReads].some(Boolean), 'Action returns require a dedicated owned-environment round');
assert.ok(!linkedReads || isolatedPath && ![configurationOnly,errorPages,valueBoundaries,valuePages,dictionaryPages,layoutPages,originalPages,historicalReferences,designerOperations,subtableMobile,subtableNative,subtableTypes,subtableDesigner,subtablePrecision,permissionPages,expressionPages,permissionCache,matrixTemplates,readEntries,permissionRaces,oauthResources].some(Boolean), 'Linked reads require a dedicated owned-environment round');
assert.ok(!oauthResources || isolatedPath && state.oauth2Fixture && ![configurationOnly,errorPages,valueBoundaries,valuePages,dictionaryPages,layoutPages,originalPages,historicalReferences,designerOperations,subtableMobile,subtableNative,subtableTypes,subtableDesigner,subtablePrecision,permissionPages,expressionPages,permissionCache,matrixTemplates,readEntries,permissionRaces].some(Boolean), 'OAuth resources require a dedicated configured owned-environment round');
assert.ok(!permissionRaces || isolatedPath && !configurationOnly && !valuePages && !valueBoundaries && !errorPages && !dictionaryPages && !layoutPages && !originalPages && !historicalReferences && !designerOperations && !subtableMobile && !subtableNative && !subtableTypes && !subtableDesigner && !subtablePrecision && !permissionPages && !expressionPages && !permissionCache && !matrixTemplates && !readEntries, 'Permission races require a dedicated owned-environment round');
assert.ok(!readEntries || isolatedPath && !configurationOnly && !valuePages && !valueBoundaries && !errorPages && !dictionaryPages && !layoutPages && !originalPages && !historicalReferences && !designerOperations && !subtableMobile && !subtableNative && !subtableTypes && !subtableDesigner && !subtablePrecision && !permissionPages && !expressionPages && !permissionCache && !matrixTemplates, 'Read entries require a dedicated owned-environment round');
assert.ok(!matrixTemplates || isolatedPath && !configurationOnly && !valuePages && !valueBoundaries && !errorPages && !dictionaryPages && !layoutPages && !originalPages && !historicalReferences && !designerOperations && !subtableMobile && !subtableNative && !subtableTypes && !subtableDesigner && !subtablePrecision && !permissionPages && !expressionPages && !permissionCache, 'Matrix templates require a dedicated owned-environment round');
assert.ok(!permissionCache || isolatedPath && !configurationOnly && !valuePages && !valueBoundaries && !errorPages && !dictionaryPages && !layoutPages && !originalPages && !historicalReferences && !designerOperations && !subtableMobile && !subtableNative && !subtableTypes && !subtableDesigner && !subtablePrecision && !permissionPages && !expressionPages, 'Permission cache requires a dedicated owned-environment round');
assert.ok(!expressionPages || isolatedPath && !configurationOnly && !valuePages && !valueBoundaries && !errorPages && !dictionaryPages && !layoutPages && !originalPages && !historicalReferences && !designerOperations && !subtableMobile && !subtableNative && !subtableTypes && !subtableDesigner && !subtablePrecision && !permissionPages, 'Expression pages require a dedicated owned-environment round');
assert.ok(!permissionPages || isolatedPath && !configurationOnly && !valuePages && !valueBoundaries && !errorPages && !dictionaryPages && !layoutPages && !originalPages && !historicalReferences && !designerOperations && !subtableMobile && !subtableNative && !subtableTypes && !subtableDesigner && !subtablePrecision, 'Field permission pages require a dedicated owned-environment round');
assert.ok(!subtablePrecision || isolatedPath && !configurationOnly && !valuePages && !valueBoundaries && !errorPages && !dictionaryPages && !layoutPages && !originalPages && !historicalReferences && !designerOperations && !subtableMobile && !subtableNative && !subtableTypes && !subtableDesigner, 'Subtable precision pages require a dedicated owned-environment round');
assert.ok(!subtableDesigner || isolatedPath && !configurationOnly && !valuePages && !valueBoundaries && !errorPages && !dictionaryPages && !layoutPages && !originalPages && !historicalReferences && !designerOperations && !subtableMobile && !subtableNative && !subtableTypes, 'Subtable designer pages require a dedicated owned-environment round');
assert.ok(!subtableTypes || isolatedPath && !configurationOnly && !valuePages && !valueBoundaries && !errorPages && !dictionaryPages && !layoutPages && !originalPages && !historicalReferences && !designerOperations && !subtableMobile && !subtableNative, 'Typed subtable pages require a dedicated owned-environment round');
assert.ok(!subtableNative || isolatedPath && !configurationOnly && !valuePages && !valueBoundaries && !errorPages && !dictionaryPages && !layoutPages && !originalPages && !historicalReferences && !designerOperations && !subtableMobile, 'Native table pages require a dedicated owned-environment round');
assert.ok(!subtableMobile || isolatedPath && !configurationOnly && !valuePages && !valueBoundaries && !errorPages && !dictionaryPages && !layoutPages && !originalPages && !historicalReferences && !designerOperations, 'Mobile subtable pages require a dedicated owned-environment round');
assert.ok(!designerOperations || isolatedPath && !configurationOnly && !valuePages && !valueBoundaries && !errorPages && !dictionaryPages && !layoutPages && !originalPages && !historicalReferences, 'Designer operations require a dedicated owned-environment round');
assert.ok(!historicalReferences || isolatedPath && !configurationOnly && !valuePages && !valueBoundaries && !errorPages && !dictionaryPages && !layoutPages && !originalPages, 'Historical references require a dedicated owned-environment round');
assert.ok(!originalPages || isolatedPath && !configurationOnly && !valuePages && !valueBoundaries && !errorPages && !dictionaryPages && !layoutPages, 'Original field pages require a dedicated owned-environment round');
assert.ok(!layoutPages || isolatedPath && !configurationOnly && !valuePages && !valueBoundaries && !errorPages && !dictionaryPages, 'Layout pages require a dedicated owned-environment round');
assert.ok(!dictionaryPages || isolatedPath && !configurationOnly && !valuePages && !valueBoundaries && !errorPages, 'Dictionary pages require a dedicated owned-environment round');
assert.ok(!errorPages || isolatedPath && !configurationOnly, 'Page error fixtures require the owned environment');
assert.ok(!valueBoundaries || isolatedPath && !configurationOnly, 'Value fixtures require the owned environment');
assert.ok(!valuePages || isolatedPath && !configurationOnly && !valueBoundaries && !errorPages, 'Value pages require a dedicated owned-environment round');
const applicationLogs = (isolatedPath ? [
  'auth/logs/auth-service.log', 'gateway/logs/gateway-service.log',
  'workflow/logs/cloudflow-workflow.log', 'workflow/logs/cloudflow-workflow-error.log', 'oa/logs/oa-service.log',
].map(filename => path.join(directory, filename)) : [
  'cloudflow-auth/logs/auth-service.log', 'cloudflow-gateway/logs/gateway-service.log',
  'cloudflow-service-workflow/logs/cloudflow-workflow.log', 'cloudflow-service-workflow/logs/cloudflow-workflow-error.log',
  'cloudflow-service-crm/logs/crm-service.log', 'cloudflow-service-hr/logs/hr-service.log',
].map(filename => path.join(root, 'cloudflow-backend', filename))).filter(filename => fs.existsSync(filename));
const logSizesBefore = new Map(applicationLogs.map(filename => [filename, fs.statSync(filename).size]));
const privateFile = path.join(directory, 'private', `live-${runId}.json`);
const checks = [];
const requests = [];
const sessions = {};
const fixture = { runId, accounts: {}, forms: [], definitions: [], instances: [], files: [] };
const sensitiveValues = new Set(Object.entries(process.env).filter(([name, value]) => /password|secret|token|key/i.test(name) && value.length >= 8).map(([, value]) => value));
const sqlText = value => `CONVERT(X'${Buffer.from(String(value), 'utf8').toString('hex')}' USING utf8mb4)`;
let browser;
let frontendServer;
let origin = 'http://127.0.0.1:3000';
let employeeGrantsBefore;

function database(statement) {
  const environment = { ...process.env };
  if (isolatedPath) delete environment.MYSQL_PWD;
  else environment.MYSQL_PWD = process.env.DB_PASSWORD;
  const result = spawnSync('C:\\Program Files\\MySQL\\MySQL Server 8.0\\bin\\mysql.exe', [
    '--no-defaults', `--host=${isolatedPath ? '127.0.0.1' : '192.168.1.173'}`, `--port=${isolatedPath ? state.mysqlPort : 3306}`,
    '--protocol=TCP', `--user=${isolatedPath ? 'root' : process.env.DB_USERNAME}`,
    '--database=cloud_flow_db', '--connect-timeout=10', '--batch', '--raw', '--skip-column-names', '--default-character-set=utf8mb4',
  ], { input: statement, encoding: 'utf8', windowsHide: true, timeout: 60000, env: environment });
  assert.equal(result.status, 0, `C_LIVE_DATABASE_FAILED:${/ERROR \d+/.exec(result.stderr ?? '')?.[0] ?? 'UNKNOWN'}`);
  return result.stdout.trim();
}

function rows(statement) {
  const output = database(statement);
  return output ? output.split(/\r?\n/).map(line => JSON.parse(line)) : [];
}

function saveFixture() { fs.writeFileSync(privateFile, JSON.stringify(fixture, null, 2)); }
function recordCheck(label, condition) {
  const passed = Boolean(condition);
  checks.push({ label, passed });
  console.log(`${passed ? 'PASS' : 'FAIL'} C_LIVE ${label}`);
  return passed;
}

function check(label, condition) {
  assert.ok(recordCheck(label, condition), label);
}

async function api(actor, requestPath, options = {}) {
  assert.ok(requestPath.startsWith('/workflow/') || requestPath === '/auth/getInfo' || /^\/auth\/system\/(message\/channel|file\/config)(?:\/[a-zA-Z0-9,]+)?(?:\?|$)/.test(requestPath) || dictionaryPages && /^\/auth\/system\/dict\/(type|data)$/.test(requestPath)
    || oauthResources && (/^\/oauth2\/authorize(?:\?|$)/.test(requestPath) || requestPath === '/auth/system/platform/access/reauthenticate' || /^\/auth\/system\/oauth2\/client(?:\/[0-9]+\/disable)?$/.test(requestPath))
    || linkedReads && /^\/auth\/system\/file\/preview-(?:ticket|content)(?:\?|$)/.test(requestPath));
  assert.ok(!options.range || linkedReads && /^bytes=\d+-\d*$/.test(options.range), 'Only explicit preview byte ranges allowed');
  const result = await sessions[actor].page.evaluate(async supplied => {
    const storage = await import('/src/utils/authStorage.ts');
    const token = storage.getAuthToken();
    const headers = token ? { Authorization: token.startsWith('Bearer ') ? token : `Bearer ${token}` } : {};
    const csrf = document.cookie.split(';').map(value => value.trim()).find(value => value.startsWith('XSRF-TOKEN='));
    if (csrf) headers['X-CSRF-Token'] = decodeURIComponent(csrf.slice('XSRF-TOKEN='.length));
    if (supplied.range) headers.Range = supplied.range;
    let body;
    if (supplied.file) {
      body = new FormData();
      body.append('file', new File([supplied.file.content], supplied.file.name, { type: supplied.file.type }));
    } else if (supplied.body !== undefined) {
      headers['Content-Type'] = 'application/json'; body = JSON.stringify(supplied.body);
    }
    const response = await fetch(`/api${supplied.requestPath}`, { method: supplied.method || 'GET', credentials: 'same-origin', headers, body });
    const result = { status: response.status, traceId: response.headers.get('X-Trace-Id'), cacheControl: response.headers.get('Cache-Control'), contentType: response.headers.get('Content-Type'), nosniff: response.headers.get('X-Content-Type-Options') };
    if ((result.contentType || '').includes('json')) return { ...result, body: await response.json() };
    const bytes = new Uint8Array(await response.arrayBuffer());
    const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))).map(value => value.toString(16).padStart(2, '0')).join('');
    return { ...result, length: bytes.length, signature: new TextDecoder().decode(bytes.slice(0, 8)), sha256, contentRange: response.headers.get('Content-Range') };
  }, { requestPath, ...options });
  const evidencePath = requestPath.startsWith('/oauth2/authorize?') || requestPath.startsWith('/auth/system/file/preview-content?') ? requestPath.split('?')[0] : requestPath;
  requests.push({ actor, path: evidencePath, method: options.method || 'GET', status: result.status, code: result.body?.code, traceId: result.traceId, observedAt: Date.now() });
  return result;
}

async function formClientFailure(actor, operation, body) {
  const requestPath = operation === 'draft' ? '/workflow/wf/draft' : operation === 'start' ? '/workflow/wf/start' : '/workflow/wf/complete';
  const page = sessions[actor].page;
  const response = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === `/api${requestPath}`);
  const failure = await page.evaluate(async ({ operation, body }) => {
    try {
      if (operation === 'draft') await (await import('/src/services/api/workflow/draft.ts')).saveWorkflowDraft(body);
      else {
        const workflow = await import('/src/services/api/workflow.ts');
        await (operation === 'start' ? workflow.startProcess(body) : workflow.completeTask(body));
      }
      return { accepted: true };
    } catch (error) {
      const { getFormFieldErrors } = await import('/src/utils/formFieldErrors.ts');
      return { accepted: false, code: error.code, fieldErrors: getFormFieldErrors(error) };
    }
  }, { operation, body });
  const observed = await response;
  requests.push({ actor, path: requestPath, method: 'POST', status: observed.status(), code: failure.code, traceId: observed.headers()['x-trace-id'], observedAt: Date.now(), throughProductionClient: true });
  return { ...failure, status: observed.status() };
}

function success(result, label, required = true) {
  if (result.status !== 200 || result.body?.code !== 200) {
    let message = String(result.body?.msg ?? result.body?.message ?? '');
    for (const value of sensitiveValues) message = message.split(value).join('[REDACTED]');
    console.log(`C_LIVE_HTTP_FAILURE label=${label}; status=${result.status}; code=${result.body?.code}; message=${message.slice(0, 180)}`);
  }
  const passed = result.status === 200 && result.body?.code === 200;
  if (required) check(label, passed);
  else recordCheck(label, passed);
  return passed ? result.body.data : undefined;
}

function denied(result, label, expected = /权限|拒绝|不存在|不可访问|不匹配|无效|禁止|VERSION|CONFLICT|VALIDATION|PERMISSION|DENIED|参数|字段|版本|冲突|引用|访问/) {
  const message = `${result.body?.code ?? ''} ${result.body?.msg ?? ''} ${result.body?.message ?? ''} ${result.body?.data?.code ?? ''} ${result.body?.data?.errorCode ?? ''}`;
  const rejected = result.status >= 400 && result.status < 500 && (result.status === 403 || result.body?.code === 403 || expected.test(message));
  if (!rejected) {
    let safeMessage = message;
    for (const value of sensitiveValues) safeMessage = safeMessage.split(value).join('[REDACTED]');
    console.log(`C_LIVE_DENIAL_FAILURE label=${label}; status=${result.status}; code=${result.body?.code}; message=${safeMessage.slice(0, 180)}`);
  }
  check(label, rejected);
}

function latestForm(formId) {
  return rows(`SELECT JSON_OBJECT('version',version,'versionLock',version_lock,'checksum',checksum) FROM wf_form_definition WHERE tenant_id=100000 AND form_id=${sqlText(formId)} AND is_latest=1`)[0];
}

async function openSessions() {
  const password = `${randomBytes(18).toString('hex')}Aa9!`;
  sensitiveValues.add(password);
  const authModule = path.join(root, 'cloudflow-backend/cloudflow-auth');
  const dependencies = fs.readFileSync(path.join(authModule, isolatedPath ? 'target/batch-g-classpath.txt' : 'target/approved-runtime-classpath.txt'), 'utf8').trim();
  const hashed = spawnSync(path.join(process.env.JAVA_HOME, 'bin/java.exe'), ['-cp', `${path.join(authModule, 'target/classes')};${dependencies}`, path.join(root, 'scripts/runtime-checks/FormLivePasswordHash.java')],
    { encoding: 'utf8', windowsHide: true, timeout: 60000, env: { ...process.env, CLOUDFLOW_FORM_TEST_PASSWORD: password } });
  assert.equal(hashed.status, 0, 'C_LIVE_PASSWORD_HASH_FAILED');
  assert.match(hashed.stdout, /^\$2[aby]\$/);
  sensitiveValues.add(hashed.stdout);
  let chromium;
  for (const location of [path.join(root, '.cloudflow-runtime/playwright'), path.join(root, 'cloudflow-frontend'), root]) {
    try { ({ chromium } = createRequire(path.join(location, 'package.json'))('playwright-core')); break; } catch { }
  }
  assert.ok(chromium, 'C_LIVE_PLAYWRIGHT_MISSING');
  const executablePath = process.env.CLOUDFLOW_C_CHROMIUM || chromium.executablePath();
  assert.ok(fs.existsSync(executablePath), 'C_LIVE_CHROMIUM_MISSING');
  browser = await chromium.launch({ headless: true, executablePath });
  const actors = [['admin', 100000, 1], ['employee', 100000, 5], ['peer', 100000, 5], ['foreign', 100001, isolatedPath ? 990000701 : 27801001]];
  if (errorPages) {
    const roleId = database(`INSERT INTO sys_role (tenant_id,role_name,role_key,role_sort,data_scope,ds_type,status,deleted,create_by,remark) SELECT tenant_id,${sqlText('C1错误-'+suffix)},${sqlText('C1_ERROR_'+suffix)},role_sort,data_scope,ds_type,'0',0,${sqlText(marker)},${sqlText('自有直接发起验证角色')} FROM sys_role WHERE tenant_id=100000 AND role_id=5; SELECT LAST_INSERT_ID();`);
    assert.match(roleId, /^\d+$/);
    fixture.roles = [roleId]; saveFixture();
    database(`INSERT INTO sys_role_menu (tenant_id,role_id,menu_id) SELECT rm.tenant_id,${roleId},rm.menu_id FROM sys_role_menu rm JOIN sys_menu m ON m.menu_id=rm.menu_id WHERE rm.tenant_id=100000 AND rm.role_id=5 AND COALESCE(m.perms,'') NOT LIKE 'workflow:draft:%';`);
    actors.push(['legacy', 100000, Number(roleId)]);
  }
  for (const [actor, tenantId, roleId] of configurationOnly ? actors.slice(0, 2) : actors) {
    const tenant = rows(`SELECT JSON_OBJECT('code',tenant_code,'department',(SELECT MIN(dept_id) FROM sys_dept WHERE tenant_id=${tenantId} AND deleted=0 AND status='0')) FROM sys_tenant WHERE tenant_id=${tenantId} AND deleted=0 AND status='0'`)[0];
    assert.ok(tenant?.department && tenant.code, 'C_LIVE_TENANT_NOT_READY');
    const username = `c_20260915_${suffix}_${actor}`;
    const userId = database(`INSERT INTO sys_user (tenant_id,dept_id,user_name,nick_name,password,status,deleted,pwd_reset_required,create_by,remark) VALUES (${tenantId},${tenant.department},${sqlText(username)},${sqlText(marker+' '+actor)},${sqlText(hashed.stdout)},'0',0,'0',${sqlText(marker)},${sqlText('当前C真实接口验收专用账号')}); SELECT LAST_INSERT_ID();`);
    assert.match(userId, /^\d+$/);
    database(`INSERT INTO sys_user_role (user_id,role_id,tenant_id) SELECT ${userId},role_id,tenant_id FROM sys_role WHERE role_id=${roleId} AND tenant_id=${tenantId} AND status='0' AND deleted=0;`);
    assert.equal(database(`SELECT COUNT(*) FROM sys_user_role WHERE user_id=${userId} AND role_id=${roleId} AND tenant_id=${tenantId}`), '1');
    fixture.accounts[actor] = { username, password, userId, tenantId, roleId }; saveFixture();
    const context = await browser.newContext({ viewport: { width: 1365, height: 920 }, serviceWorkers: 'block' });
    if (isolatedPath) await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    const page = await context.newPage(); await page.goto(`${origin}/login`, { waitUntil: 'networkidle' });
    let identity;
    for (let attempt = 0; attempt < 3; attempt++) {
      try { identity = await authenticateFormTest(page, { username, password, tenantCode: tenant.code }, origin); if (identity.authenticated) break; } catch { }
      await page.waitForTimeout(1200);
    }
    check(`real_login_${actor}`, identity?.authenticated && identity.userId === userId && identity.tenantId === String(tenantId));
    if (actor === 'legacy') check('owned_direct_starter_has_start_without_draft_permissions', identity.permissions.includes('workflow:process:start') && !identity.permissions.some(permission => permission.startsWith('workflow:draft:')));
    sessions[actor] = { page, context, account: fixture.accounts[actor], identity };
  }
}

async function configuredSecrets() {
  const channelPath = '/auth/system/message/channel';
  const storagePath = '/auth/system/file/config';
  const code = `c_secret_${suffix}`;
  const secrets = { apiSecret: randomBytes(24).toString('base64url'), smtpPwd: randomBytes(24).toString('base64url'), secretKey: randomBytes(24).toString('base64url') };
  for (const secret of Object.values(secrets)) sensitiveValues.add(secret);
  fixture.configurationSecrets = secrets; saveFixture();
  const masterBefore = database('SELECT config_id FROM sys_file_config WHERE tenant_id=100000 AND master_flag=1 AND deleted=0 ORDER BY config_id');
  let channelId;
  let configId;
  try {
    success(await api('admin', channelPath, { method: 'POST', body: { channelType: 'EMAIL', channelCode: code, channelName: marker, status: 'DISABLED', smtpHost: '127.0.0.1', smtpPort: 9, smtpUsername: 'disabled-test', apiSecret: secrets.apiSecret, smtpPwd: secrets.smtpPwd } }), 'create_disabled_channel_with_nonempty_secrets');
    channelId = database(`SELECT CAST(channel_id AS CHAR) FROM sys_message_channel WHERE tenant_id=100000 AND channel_code=${sqlText(code)} AND deleted=0`);
    assert.match(channelId, /^\d+$/);
    fixture.channelId = channelId; saveFixture();
    const storedChannel = rows(`SELECT JSON_OBJECT('api',api_secret_cipher,'smtp',smtp_pwd_cipher,'status',status) FROM sys_message_channel WHERE tenant_id=100000 AND channel_id=${channelId}`)[0];
    for (const value of [storedChannel.api, storedChannel.smtp]) sensitiveValues.add(value);
    const encrypted = (cipher, secret) => typeof cipher === 'string' && /^[A-Za-z0-9+/]+={0,2}$/.test(cipher) && Buffer.from(cipher, 'base64').length === Buffer.byteLength(secret) + 28 && !cipher.includes(secret);
    check('message_secrets_are_encrypted_in_runtime_database', storedChannel.status === 'DISABLED' && encrypted(storedChannel.api, secrets.apiSecret) && encrypted(storedChannel.smtp, secrets.smtpPwd));
    const channel = success(await api('admin', `${channelPath}/${channelId}`), 'read_nonempty_channel_secret_masks');
    check('message_secret_masks_are_nonempty', /^\*{4,}/.test(channel.apiSecret) && /^\*{4,}/.test(channel.smtpPwd) && !Object.hasOwn(channel, 'apiSecretCipher') && !Object.hasOwn(channel, 'smtpPwdCipher') && Object.values(secrets).every(secret => !JSON.stringify(channel).includes(secret)));
    denied(await api('employee', `${channelPath}/${channelId}`), 'employee_cannot_read_nonempty_channel_secrets');
    const storage = success(await api('admin', storagePath, { method: 'POST', body: { configCode: code, configName: marker, storageType: 'MINIO', masterFlag: 0, status: 'DISABLED', endpoint: 'http://127.0.0.1:9', region: 'us-east-1', bucket: 'c-acceptance', accessKey: 'disabled-test', secretKey: secrets.secretKey, accessPolicy: '0' } }), 'create_disabled_nondefault_storage_with_secret');
    configId = String(storage.configId); assert.match(configId, /^\d+$/);
    fixture.configId = configId; saveFixture();
    const storedStorage = rows(`SELECT JSON_OBJECT('cipher',secret_key_cipher,'status',status,'master',master_flag) FROM sys_file_config WHERE tenant_id=100000 AND config_id=${configId}`)[0];
    sensitiveValues.add(storedStorage.cipher);
    check('storage_secret_is_encrypted_in_runtime_database', encrypted(storedStorage.cipher, secrets.secretKey) && storedStorage.status === 'DISABLED' && storedStorage.master === 0);
    const detail = success(await api('admin', `${storagePath}/${configId}`), 'read_nonempty_storage_secret_projection');
    check('storage_secret_and_cipher_are_absent_from_response', !Object.hasOwn(detail, 'secretKey') && !Object.hasOwn(detail, 'secretKeyCipher') && !JSON.stringify(detail).includes(secrets.secretKey));
    denied(await api('employee', `${storagePath}/${configId}`), 'employee_cannot_read_nonempty_storage_secret');
    console.log('CONFIGURATION_SECRETS_AT_REST encrypted_fields=3; plaintext_fields=0; HTTP_NONEMPTY_SECRET_LEAKS=0; EXTERNAL_SEND_REQUESTS=0');
  } finally {
    if (channelId) {
      success(await api('admin', `${channelPath}/${channelId}`, { method: 'DELETE' }), 'remove_owned_disabled_channel_fixture');
      check('owned_channel_fixture_is_deleted', database(`SELECT COUNT(*) FROM sys_message_channel WHERE tenant_id=100000 AND channel_id=${channelId} AND channel_code=${sqlText(code)} AND deleted=1`) === '1');
    }
    if (configId) {
      success(await api('admin', `${storagePath}/${configId}`, { method: 'DELETE' }), 'remove_owned_disabled_storage_fixture');
      check('owned_storage_fixture_is_deleted', database(`SELECT COUNT(*) FROM sys_file_config WHERE tenant_id=100000 AND config_id=${configId} AND config_code=${sqlText(code)} AND deleted=1`) === '1');
    }
    check('default_storage_configuration_is_unchanged', database('SELECT config_id FROM sys_file_config WHERE tenant_id=100000 AND master_flag=1 AND deleted=0 ORDER BY config_id') === masterBefore);
  }
}

async function scanRuntimeLogs() {
  const logs = [...applicationLogs, ...fs.readdirSync(directory).filter(filename => /\.(out|err)\.log$/.test(filename)).map(filename => path.join(directory, filename))];
  const activeApplicationLogs = applicationLogs.filter(filename => fs.statSync(filename).size > logSizesBefore.get(filename));
  check('real_auth_application_log_records_current_requests', activeApplicationLogs.some(filename => filename.endsWith(path.join(isolatedPath ? 'auth' : 'cloudflow-auth', 'logs', 'auth-service.log'))));
  let logLeaks = 0;
  let bytes = 0;
  for (const filename of logs) {
    const content = fs.readFileSync(filename, 'utf8');
    bytes += Buffer.byteLength(content);
    for (const value of sensitiveValues) if (content.includes(value)) logLeaks++;
  }
  console.log(`C_LOG_SCAN files=${logs.length}; application_files=${applicationLogs.length}; active_application_files=${activeApplicationLogs.length}; bytes=${bytes}; known_sensitive_values=${sensitiveValues.size}; plaintext_hits=${logLeaks}`);
  check('current_service_logs_hide_credentials_and_private_form_values', logLeaks === 0);
  if (errorPages || valueBoundaries || valuePages || dictionaryPages || layoutPages || originalPages || historicalReferences || designerOperations || subtableMobile || subtableNative || subtableTypes || subtableDesigner || subtablePrecision || permissionPages || expressionPages || permissionCache || matrixTemplates || readEntries || permissionRaces || oauthResources || linkedReads || actionReturns || versionRecords) {
    const approvals = requests.filter(request => request.method === 'POST' && request.path === '/workflow/wf/complete');
    check('approval_requests_have_unique_trace_ids', approvals.length > 0 && approvals.every(request => /^[a-zA-Z0-9_-]{1,64}$/.test(request.traceId || ''))
      && new Set(approvals.map(request => request.traceId)).size === approvals.length);
    const failed = approvals.filter(request => request.status >= 400);
    const traceList = values => values.map(request => sqlText(request.traceId)).join(',');
    const accessQuery = `SELECT JSON_OBJECT('trace',trace_id,'params',params,'exception',exception) FROM sys_log WHERE tenant_id=100000 AND request_url='/wf/complete' AND trace_id IN (${traceList(approvals)})`;
    const errorQuery = `SELECT JSON_OBJECT('trace',trace_id,'params',request_params,'message',exception_message,'stack',exception_stack) FROM sys_api_error_log WHERE tenant_id=100000 AND request_url='/wf/complete' AND trace_id IN (${traceList(failed)})`;
    let access = [], errors = [];
    const deadline = Date.now() + 15000;
    do {
      access = rows(accessQuery); errors = rows(errorQuery);
      if (new Set(access.map(row => row.trace)).size === approvals.length && new Set(errors.map(row => row.trace)).size === failed.length) break;
      await new Promise(resolve => setTimeout(resolve, 200));
    } while (Date.now() < deadline);
    check('all_approval_requests_retain_access_and_error_audits', new Set(access.map(row => row.trace)).size === approvals.length
      && new Set(errors.map(row => row.trace)).size === failed.length);
    const serialized = JSON.stringify([...access, ...errors]);
    const auditLeaks = [...sensitiveValues].filter(value => serialized.includes(value)).length;
    console.log(`C_AUDIT_SCAN access_requests=${approvals.length}; failed_requests=${failed.length}; access_rows=${access.length}; error_rows=${errors.length}; plaintext_hits=${auditLeaks}`);
    check('current_approval_audits_hide_private_form_values', auditLeaks === 0 && [...access, ...errors].every(row => !row.params));
    if (subtableMobile || subtableNative || subtableTypes || subtableDesigner || subtablePrecision || expressionPages || permissionCache || matrixTemplates || readEntries || permissionRaces || oauthResources || linkedReads || actionReturns || versionRecords) {
      const saves = requests.filter(request => request.method === 'POST' && request.path === '/workflow/wf/form/save');
      check('form_definition_saves_have_unique_trace_ids', saves.length > 0 && saves.every(request => /^[a-zA-Z0-9_-]{1,64}$/.test(request.traceId || ''))
        && new Set(saves.map(request => request.traceId)).size === saves.length);
      const gatewayDenied = saves.filter(request => request.actor === 'employee');
      check('form_definition_gateway_denial_exercised', gatewayDenied.length === 1 && gatewayDenied[0].status === 403);
      const forwardedSaves = saves.filter(request => request.actor !== 'employee');
      const query = `SELECT JSON_OBJECT('trace',trace_id,'params',params,'exception',exception) FROM sys_log WHERE tenant_id=100000 AND request_url='/wf/form/save' AND trace_id IN (${traceList(saves)})`;
      const gatewayQuery = `SELECT JSON_OBJECT('trace',trace_id,'params',params,'exception',exception) FROM sys_log WHERE tenant_id=100000 AND request_url='/workflow/wf/form/save' AND trace_id IN (${traceList(saves)})`;
      const rejectedSaves = forwardedSaves.filter(request => request.status >= 400);
      check('form_definition_save_rejection_exercised', rejectedSaves.length > 0);
      const rejectedQuery = `SELECT JSON_OBJECT('trace',trace_id,'params',request_params,'message',exception_message,'stack',exception_stack) FROM sys_api_error_log WHERE tenant_id=100000 AND request_url='/wf/form/save' AND trace_id IN (${traceList(rejectedSaves)})`;
      const saveDeadline = Date.now() + 15000;
      let savedAudits = [], rejectedAudits = [], gatewayAudits = [];
      do {
        savedAudits = rows(query); rejectedAudits = rows(rejectedQuery); gatewayAudits = rows(gatewayQuery);
        if (new Set(savedAudits.map(row => row.trace)).size === forwardedSaves.length
          && new Set(gatewayAudits.map(row => row.trace)).size === saves.length
          && new Set(rejectedAudits.map(row => row.trace)).size === rejectedSaves.length) break;
        await new Promise(resolve => setTimeout(resolve, 200));
      } while (Date.now() < saveDeadline);
      const savedText = JSON.stringify([...savedAudits, ...rejectedAudits, ...gatewayAudits]);
      const saveLeaks = [...sensitiveValues].filter(value => savedText.includes(value)).length;
      console.log(`C2_FORM_SAVE_AUDIT: requests=${saves.length}; gateway_rows=${gatewayAudits.length}; access_rows=${savedAudits.length}; error_rows=${rejectedAudits.length}; plaintext_hits=${saveLeaks}`);
      check('form_definition_requests_retain_safe_audits', new Set(savedAudits.map(row => row.trace)).size === forwardedSaves.length
        && savedAudits.every(row => forwardedSaves.some(request => request.traceId === row.trace))
        && new Set(gatewayAudits.map(row => row.trace)).size === saves.length
        && new Set(rejectedAudits.map(row => row.trace)).size === rejectedSaves.length
        && [...savedAudits, ...rejectedAudits, ...gatewayAudits].every(row => !row.params) && saveLeaks === 0);
    }
  }
}

async function run() {
  if (isolatedPath) {
    check('owned_isolated_database_directory', fs.realpathSync(database('SELECT @@datadir;')) === fs.realpathSync(path.join(directory, 'mysql-data')));
    const gateway = state.services.find(service => service.name === 'gateway');
    assert.ok(gateway && Number.isInteger(gateway.port) && gateway.port > 1024 && gateway.port < 65536);
    for (const service of state.services) {
      assert.ok(Number.isInteger(service.healthPort) && service.healthPort > 1024 && service.healthPort < 65536);
      const health = await fetch(`http://127.0.0.1:${service.healthPort}/actuator/health`).then(response => response.json());
      check(`real_service_health_${service.name}`, health.status === 'UP');
    }
    const frontend = path.join(root, 'cloudflow-frontend');
    const requireFrontend = createRequire(path.join(frontend, 'package.json'));
    const { createServer } = await import(pathToFileURL(requireFrontend.resolve('vite')).href);
    frontendServer = await createServer({ root: frontend, configFile: path.join(frontend, 'vite.config.ts'), logLevel: 'error',
      server: { host: '127.0.0.1', port: oauthResources ? state.oauth2Fixture.port : 0, strictPort: true, proxy: {
        '/api': { target: `http://127.0.0.1:${gateway.port}`, changeOrigin: false, rewrite: requestPath => requestPath.replace(/^\/api/, '') },
        '/ws': { target: `http://127.0.0.1:${gateway.port}`, changeOrigin: false, ws: true },
      } },
    });
    await frontendServer.listen();
    origin = `http://127.0.0.1:${frontendServer.httpServer.address().port}`;
    console.log('C_ISOLATION: production_modified=false; service_restarts=0; interface_doubles=0; credentials_logged=false');
  }
  employeeGrantsBefore = database('SELECT menu_id FROM sys_role_menu WHERE tenant_id=100000 AND role_id=5 ORDER BY menu_id;');
  await openSessions();
  for (const route of ['/auth/system/message/channel/list?pageSize=100', '/auth/system/file/config/list?pageSize=100']) {
    const page = success(await api('admin', route), 'administrator_reads_masked_configuration');
    const records = Array.isArray(page) ? page : page.records || page.rows || [];
    let leakedFields = 0;
    for (const record of records) {
      for (const field of ['secretKey', 'secretKeyCipher', 'apiSecretCipher', 'smtpPwdCipher']) if (record[field]) leakedFields++;
      for (const field of ['apiSecret', 'smtpPwd']) if (record[field] && !/^\*{4,}/.test(record[field])) leakedFields++;
    }
    check('configuration_does_not_expose_plaintext_or_ciphertext', leakedFields === 0 && [...sensitiveValues].every(value => !JSON.stringify(records).includes(value)));
    denied(await api('employee', route), 'employee_cannot_read_secret_configuration');
  }
  if (configurationOnly) {
    await configuredSecrets();
    await scanRuntimeLogs();
    console.log(`C_CONFIGURATION_HTTP=PASS; CHECKS=${checks.length}; REQUESTS=${requests.length}; FULL_FORM_FLOW_EXECUTED=false`);
    return;
  }
  const base = '/workflow/wf';
  const fields = [
    { id: 'note', type: 'TEXT', label: '说明', required: true },
    { id: 'budget', type: 'AMOUNT', label: '金额' },
    { id: 'items', type: 'SUB_TABLE', label: '明细', columns: [{ id: 'name', type: 'TEXT', label: '项目' }, { id: 'amount', type: 'AMOUNT', label: '金额' }] },
    { id: 'receipt', type: 'UPLOAD_FILE', label: '凭证', accept: '.pdf', maxSize: 1 },
    { id: 'secret', type: 'TEXT', label: '隐藏信息' },
  ];
  const saved = success(await api('admin', `${base}/form/save`, { method: 'POST', body: { formKey: `c_${suffix}`, formName: marker, fieldsJson: JSON.stringify(fields) } }), 'create_form_version_one');
  const formId = saved.formId || saved.id;
  assert.equal(typeof formId, 'string'); fixture.forms.push(formId); saveFixture();
  check('new_form_version_and_checksum', saved.version === 1 && /^[a-f0-9]{64}$/.test(saved.checksum));
  const graph = { nodes: [{ id: 'start', type: 'START', title: '发起' }, { id: 'approval', type: 'APPROVAL', title: '审批', approverType: 'USER', approverValue: sessions.peer.account.userId, allowEdit: true }, { id: 'end', type: 'END', title: '结束' }], edges: [{ source: 'start', target: 'approval' }, { source: 'approval', target: 'end' }] };
  const definition = success(await api('admin', `${base}/definition/save`, { method: 'POST', body: { processKey: `c_${suffix}`, processName: marker, formId, modelJson: JSON.stringify(graph), startPermissionType: 'ALL', startPermissionValue: '[]' } }), 'create_form_process');
  const definitionId = definition.definitionId || definition.id; assert.equal(typeof definitionId, 'string'); fixture.definitions.push(definitionId); saveFixture();
  success(await api('admin', `${base}/definition/${definitionId}/field-permissions`, { method: 'PUT', body: [{ nodeKey: 'approval', fieldId: 'secret', visibleFlag: false, editableFlag: false, requiredFlag: false }, { nodeKey: 'approval', fieldId: 'items.amount', visibleFlag: false, editableFlag: false, requiredFlag: false }] }), 'save_field_and_subtable_permissions');
  success(await api('admin', `${base}/definition/deploy/${definitionId}`, { method: 'POST' }), 'publish_process');
  denied(await api('employee', `${base}/form/${formId}/versions`), 'employee_cannot_read_designer_history');
  denied(await api('employee', `${base}/form/${formId}`), 'employee_cannot_read_form_without_business_context');
  success(await api('employee', `${base}/form/${formId}?definitionId=${encodeURIComponent(definitionId)}`), 'employee_reads_startable_form_with_business_context', false);
  denied(await api('employee', `${base}/form/${formId}/rollback/1`, { method: 'POST', body: { versionLock: 0 } }), 'employee_cannot_rollback_form');
  denied(await api('employee', `${base}/form/save`, { method: 'POST', body: { formId, versionLock: 0, formName: marker, fieldsJson: JSON.stringify(fields) } }), 'employee_cannot_write_form_definition');
  const uploadPath = `${base}/form-files?definitionId=${encodeURIComponent(definitionId)}&fieldPath=receipt`;
  const uploadCountQuery = `SELECT COUNT(*) FROM sys_file WHERE tenant_id=100000 AND biz_type='WORKFLOW_FORM' AND biz_id=${sqlText(definitionId)} AND create_by=${sqlText(sessions.employee.account.username)}`;
  const filesBeforeInvalidUpload = database(uploadCountQuery);
  const forged = await api('employee', uploadPath, { method: 'POST', file: { name: 'forged.pdf', type: 'application/pdf', content: 'not-a-pdf' } });
  check('reject_forged_pdf', forged.status === 400 && forged.body?.code === 'INVALID_REQUEST');
  check('forged_pdf_does_not_create_file_record', database(uploadCountQuery) === filesBeforeInvalidUpload);
  const pdf = '%PDF-1.4\nC form integration attachment\n%%EOF';
  const uploaded = success(await api('employee', uploadPath, { method: 'POST', file: { name: 'receipt.pdf', type: 'application/pdf', content: pdf } }), 'upload_private_pdf');
  const fileId = String(uploaded.fileId); fixture.files.push(fileId); saveFixture();
  const unboundPath = `${base}/form-files/${fileId}?definitionId=${encodeURIComponent(definitionId)}&fieldPath=receipt`;
  success(await api('employee', unboundPath), 'uploader_reads_unbound_file', false);
  denied(await api('peer', unboundPath), 'peer_cannot_read_unbound_file');
  denied(await api('foreign', unboundPath), 'other_tenant_cannot_read_unbound_file');
  const context = success(await api('employee', `${base}/draft/context/${definitionId}`), 'load_real_form_start_context');
  const values = { note: marker, budget: '123456789.01', items: [{ _rowId: 'first', name: '项目', amount: '12.34' }], receipt: [fileId], secret: `${marker}-private` };
  sensitiveValues.add(values.secret);
  const invalidSubtable = await api('employee', `${base}/draft`, { method: 'POST', body: { definitionId, expectedVersion: 0, loadedContextHash: context.contextHash, title: marker, formData: { ...values, items: 'invalid-table' }, nodeAssignees: {} } });
  check('server_rejects_invalid_subtable_values', invalidSubtable.status === 400 && invalidSubtable.body?.code === 'FORM_INVALID_DATA');
  const returnedFieldErrors = Array.isArray(invalidSubtable.body?.errors) ? invalidSubtable.body.errors : [];
  check('draft_validation_returns_exact_field_without_rejected_value', returnedFieldErrors.length === 1 && returnedFieldErrors[0].field === 'items' && !returnedFieldErrors[0].rejectedValue);
  const draftFailure = await formClientFailure('employee', 'draft', { definitionId, expectedVersion: 0, loadedContextHash: context.contextHash, title: marker, formData: { ...values, items: 'invalid-table-client' }, nodeAssignees: {} });
  check('production_draft_client_retains_field_error', draftFailure.status === 400 && !draftFailure.accepted && draftFailure.code === 'FORM_INVALID_DATA' && typeof draftFailure.fieldErrors?.items === 'string');
  const directFailure = await formClientFailure('employee', 'start', { processDefKey: `c_${suffix}`, businessKey: `${marker}-invalid`, title: marker, variables: { ...values, budget: 'invalid-amount-client' }, nodeAssignees: {} });
  check('production_start_client_retains_field_error', directFailure.status === 400 && !directFailure.accepted && directFailure.code === 'FORM_INVALID_DATA' && typeof directFailure.fieldErrors?.budget === 'string');
  check('invalid_direct_start_does_not_create_instance', database(`SELECT COUNT(*) FROM wf_process_instance WHERE tenant_id=100000 AND definition_id=${sqlText(definitionId)}`) === '0');
  check('invalid_subtable_does_not_create_a_draft', database(`SELECT COUNT(*) FROM wf_form_draft WHERE tenant_id=100000 AND definition_id=${sqlText(definitionId)} AND user_id=${sessions.employee.account.userId}`) === '0');
  let draft = success(await api('employee', `${base}/draft`, { method: 'POST', body: { definitionId, expectedVersion: 0, loadedContextHash: context.contextHash, title: marker, formData: values, nodeAssignees: {} } }), 'save_form_draft_with_private_attachment');
  const started = success(await api('employee', `${base}/start`, { method: 'POST', body: { draftId: draft.draftId, expectedVersion: draft.lockVersion } }), 'start_process_from_real_form_draft');
  const instanceId = started.instanceId || started.processInstanceId; assert.ok(instanceId); fixture.instances.push(instanceId); saveFixture();
  let task;
  for (let attempt = 0; attempt < 40; attempt++) {
    task = rows(`SELECT JSON_OBJECT('id',task_id,'assignee',CAST(assignee AS CHAR)) FROM wf_task WHERE tenant_id=100000 AND instance_id=${sqlText(instanceId)} AND status='TODO'`)[0];
    if (task) break;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  check('real_approval_task_assigned', task?.assignee === sessions.peer.account.userId);
  check('instance_pins_version_one', database(`SELECT form_version FROM wf_process_instance WHERE tenant_id=100000 AND instance_id=${sqlText(instanceId)}`) === '1');
  const boundPath = `${base}/form-files/${fileId}?instanceId=${encodeURIComponent(instanceId)}&taskId=${encodeURIComponent(task.id)}&fieldPath=receipt`;
  success(await api('peer', boundPath), 'assigned_peer_reads_bound_attachment', false);
  denied(await api('employee', unboundPath), 'bound_file_rejects_old_draft_context');
  denied(await api('foreign', boundPath), 'other_tenant_cannot_read_bound_file');
  const detail = success(await api('peer', `${base}/instance/${instanceId}?taskId=${encodeURIComponent(task.id)}`), 'read_real_instance_with_field_projection');
  const safeValues = typeof detail.variables === 'string' ? JSON.parse(detail.variables) : detail.variables;
  check('hidden_scalar_and_subtable_column_removed', !Object.hasOwn(safeValues, 'secret') && !Object.hasOwn(safeValues.items[0], 'amount'));
  check('engine_values_are_not_mutated_by_read', database(`SELECT JSON_UNQUOTE(JSON_EXTRACT(variables,'$.secret')) FROM wf_process_instance WHERE tenant_id=100000 AND instance_id=${sqlText(instanceId)}`) === values.secret);
  const hiddenWrite = await api('peer', `${base}/complete`, { method: 'POST', body: { taskId: task.id, action: 'APPROVE', variables: { secret: 'forbidden-write' } } });
  check('assigned_approver_cannot_write_a_hidden_field', hiddenWrite.status === 400 && hiddenWrite.body?.code === 'FORM_INVALID_DATA'
    && Array.isArray(hiddenWrite.body.errors) && hiddenWrite.body.errors.length === 0 && !JSON.stringify(hiddenWrite.body).includes('forbidden-write'));
  check('hidden_field_write_does_not_consume_task', database(`SELECT status FROM wf_task WHERE tenant_id=100000 AND task_id=${sqlText(task.id)}`) === 'TODO');
  const approvalFailure = await formClientFailure('peer', 'complete', { taskId: task.id, action: 'APPROVE', variables: { budget: 'invalid-approval-client' } });
  check('production_approval_client_retains_field_error', approvalFailure.status === 400 && !approvalFailure.accepted && approvalFailure.code === 'FORM_INVALID_DATA' && typeof approvalFailure.fieldErrors?.budget === 'string');
  check('invalid_approval_does_not_change_task_or_values', database(`SELECT status FROM wf_task WHERE tenant_id=100000 AND task_id=${sqlText(task.id)}`) === 'TODO'
    && database(`SELECT JSON_UNQUOTE(JSON_EXTRACT(variables,'$.budget')) FROM wf_process_instance WHERE tenant_id=100000 AND instance_id=${sqlText(instanceId)}`) === values.budget);
  const changedFields = fields.filter(field => field.id !== 'receipt').concat({ id: 'newNote', type: 'TEXT', label: '新增说明' });
  const versionTwo = success(await api('admin', `${base}/form/save`, { method: 'POST', body: { formId, formName: marker, versionLock: saved.versionLock, fieldsJson: JSON.stringify(changedFields), changeLog: '删除新版本凭证字段' } }), 'save_version_two_without_attachment_field');
  check('version_two_is_new_record', versionTwo.version === 2 && latestForm(formId).version === 2);
  const historical = success(await api('peer', `${base}/form/${formId}?instanceId=${encodeURIComponent(instanceId)}&taskId=${encodeURIComponent(task.id)}`), 'instance_reads_pinned_historical_form', false);
  recordCheck('historical_form_retains_deleted_attachment_field', historical?.version === 1 && JSON.stringify(historical.fields || historical.fieldsJson).includes('receipt'));
  const download = await api('peer', boundPath.replace(`/${fileId}?`, `/${fileId}/content?`));
  recordCheck('historical_private_file_downloaded_through_real_storage', download.status === 200 && download.signature.startsWith('%PDF-1.4') && download.length === Buffer.byteLength(pdf));
  recordCheck('download_has_private_no_store_and_nosniff', download.cacheControl === 'private, no-store' && download.nosniff === 'nosniff');
  const difference = success(await api('admin', `${base}/form/${formId}/versions/compare?from=1&to=2`), 'compare_saved_versions');
  check('version_diff_reports_addition_and_removal', difference.added.some(field => field.fieldId === 'newNote') && difference.removed.some(field => field.fieldId === 'receipt'));
  const conflicts = await Promise.all(['left', 'right'].map(branch => api('admin', `${base}/form/save`, { method: 'POST', body: { formId, formName: marker, versionLock: versionTwo.versionLock, fieldsJson: JSON.stringify(changedFields.concat({ id: branch, type: 'TEXT', label: branch })) } })));
  check('concurrent_version_save_has_one_winner', conflicts.filter(result => result.status === 200 && result.body?.code === 200).length === 1);
  denied(conflicts.find(result => result.status !== 200 || result.body?.code !== 200), 'stale_version_write_is_rejected');
  const latest = latestForm(formId);
  const rolledBack = success(await api('admin', `${base}/form/${formId}/rollback/1`, { method: 'POST', body: { versionLock: latest.versionLock, changeLog: '真实接口回滚核验' } }), 'rollback_creates_new_form_version');
  check('rollback_preserves_middle_versions_and_instance_reference', rolledBack.version === 4 && rolledBack.isRollback === 1 && rolledBack.rollbackFromVersion === 1
    && database(`SELECT COUNT(*) FROM wf_form_definition WHERE tenant_id=100000 AND form_id=${sqlText(formId)}`) === '4'
    && database(`SELECT form_version FROM wf_process_instance WHERE tenant_id=100000 AND instance_id=${sqlText(instanceId)}`) === '1');
  success(await api('peer', `${base}/complete`, { method: 'POST', body: { taskId: task.id, action: 'APPROVE', variables: { note: `${marker}-approved` } } }), 'assigned_approver_completes_task_with_allowed_field_edit');
  let finalInstance;
  for (let attempt = 0; attempt < 40; attempt++) {
    finalInstance = rows(`SELECT JSON_OBJECT('status',status,'formVersion',form_version,'note',JSON_UNQUOTE(JSON_EXTRACT(variables,'$.note')),'secret',JSON_UNQUOTE(JSON_EXTRACT(variables,'$.secret')),'amount',JSON_UNQUOTE(JSON_EXTRACT(variables,'$.items[0].amount'))) FROM wf_process_instance WHERE tenant_id=100000 AND instance_id=${sqlText(instanceId)}`)[0];
    if (finalInstance?.status === 'PASSED') break;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  check('real_instance_reaches_passed_after_approval', finalInstance?.status === 'PASSED'
    && database(`SELECT COUNT(*) FROM wf_task WHERE tenant_id=100000 AND task_id=${sqlText(task.id)}`) === '0'
    && database(`SELECT COUNT(*) FROM wf_task_history WHERE tenant_id=100000 AND task_id=${sqlText(task.id)} AND action='APPROVE'`) === '1');
  check('approval_changes_only_allowed_data_and_keeps_pinned_version', finalInstance.formVersion === 1 && finalInstance.note === `${marker}-approved` && finalInstance.secret === values.secret && finalInstance.amount === '12.34');
  const historyCount = database(`SELECT COUNT(*) FROM wf_task_history WHERE tenant_id=100000 AND task_id=${sqlText(task.id)}`);
  denied(await api('peer', `${base}/complete`, { method: 'POST', body: { taskId: task.id, action: 'APPROVE', variables: { note: 'replayed-value' } } }), 'completed_task_rejects_replayed_approval', /NOT_FOUND|INVALID_STATE|任务已|TASK_/);
  check('replayed_approval_does_not_duplicate_history_or_write_data', database(`SELECT COUNT(*) FROM wf_task_history WHERE tenant_id=100000 AND task_id=${sqlText(task.id)}`) === historyCount
    && database(`SELECT JSON_UNQUOTE(JSON_EXTRACT(variables,'$.note')) FROM wf_process_instance WHERE tenant_id=100000 AND instance_id=${sqlText(instanceId)}`) === `${marker}-approved`);
  if (valueBoundaries) {
    await verifyC1ValueBoundaries({ sessions, api, success, check, database, sqlText, fixture, saveFixture, marker,
      evidence: path.join(root, '.cloudflow-runtime/full-prd-20260915/approved-runtime'), secrets: sensitiveValues, requests });
  }
  if (errorPages) {
    sensitiveValues.add('INVALID_SERVER_ONLY_' + marker);
    await verifyC1ErrorPages({ sessions, api, success, check, database, sqlText, fixture, saveFixture, marker,
      evidence: path.join(root, '.cloudflow-runtime/full-prd-20260915/approved-runtime'), secrets: sensitiveValues, requests });
  }
  if (valuePages) {
    await verifyC1ValuePages({ sessions, api, success, check, database, sqlText, fixture, saveFixture, marker,
      evidence: path.join(root, '.cloudflow-runtime/full-prd-20260915/approved-runtime'), secrets: sensitiveValues, requests });
  }
  if (dictionaryPages) {
    await verifyC1DictionaryPages({ sessions, api, success, check, database, sqlText, fixture, saveFixture, marker,
      evidence: path.join(root, '.cloudflow-runtime/full-prd-20260915/approved-runtime'), secrets: sensitiveValues, requests });
  }
  if (layoutPages) {
    await verifyC1LayoutPages({ sessions, api, success, check, database, sqlText, fixture, saveFixture, marker,
      evidence: path.join(root, '.cloudflow-runtime/full-prd-20260915/approved-runtime'), secrets: sensitiveValues, requests });
  }
  if (originalPages) {
    await verifyC1OriginalPages({ sessions, api, success, check, database, sqlText, fixture, saveFixture, marker,
      evidence: path.join(root, '.cloudflow-runtime/full-prd-20260915/approved-runtime'), secrets: sensitiveValues, requests });
  }
  if (historicalReferences) {
    await verifyC1HistoricalReferences({ sessions, api, success, check, database, sqlText, fixture, saveFixture, marker,
      evidence: path.join(root, '.cloudflow-runtime/full-prd-20260915/approved-runtime'), secrets: sensitiveValues, requests });
  }
  if (designerOperations) {
    await verifyC1DesignerOperations({ sessions, api, success, check, database, sqlText, fixture, saveFixture, marker,
      evidence: path.join(root, '.cloudflow-runtime/full-prd-20260915/approved-runtime'), secrets: sensitiveValues, requests });
  }
  if (subtableMobile || subtableNative) {
    await verifyC2SubtablePages({ sessions, api, success, check, database, sqlText, fixture, saveFixture, marker, desktop: subtableNative,
      evidence: path.join(root, '.cloudflow-runtime/full-prd-20260915/approved-runtime'), secrets: sensitiveValues, requests });
  }
  if (subtableTypes) {
    await verifyC2TypePages({ sessions, api, success, check, database, sqlText, fixture, saveFixture, marker,
      evidence: path.join(root, '.cloudflow-runtime/full-prd-20260915/approved-runtime'), secrets: sensitiveValues, requests });
  }
  if (subtableDesigner) {
    await verifyC2DesignerPages({ sessions, api, success, check, database, sqlText, fixture, saveFixture, marker,
      evidence: path.join(root, '.cloudflow-runtime/full-prd-20260915/approved-runtime'), secrets: sensitiveValues, requests });
  }
  if (subtablePrecision) {
    await verifyC2PrecisionPages({ sessions, api, success, check, database, sqlText, fixture, saveFixture, marker,
      evidence: path.join(root, '.cloudflow-runtime/full-prd-20260915/approved-runtime'), secrets: sensitiveValues, requests });
  }
  if (permissionPages) {
    await verifyC3PermissionPages({ sessions, api, success, check, database, sqlText, fixture, saveFixture, marker,
      evidence: path.join(root, '.cloudflow-runtime/full-prd-20260915/approved-runtime'), secrets: sensitiveValues, requests });
  }
  if (expressionPages) {
    await verifyC3ExpressionPages({ sessions, api, success, check, database, sqlText, fixture, saveFixture, marker,
      evidence: path.join(root, '.cloudflow-runtime/full-prd-20260915/approved-runtime'), secrets: sensitiveValues, requests });
  }
  if (permissionCache) {
    await verifyC3PermissionCache({ sessions, api, success, check, database, sqlText, fixture, saveFixture, marker, isolatedPath,
      evidence: path.join(root, '.cloudflow-runtime/full-prd-20260915/approved-runtime') });
  }
  if (matrixTemplates) {
    await verifyC3MatrixTemplates({ sessions, api, success, check, fixture, saveFixture, marker, requests,
      evidence: path.join(root, '.cloudflow-runtime/full-prd-20260915/approved-runtime') });
  }
  if (readEntries) {
    await verifyC3ReadEntries({ sessions, api, success, check, database, sqlText, fixture, saveFixture, marker, secrets: sensitiveValues,
      evidence: path.join(root, '.cloudflow-runtime/full-prd-20260915/approved-runtime') });
  }
  if (permissionRaces) {
    await verifyC3PermissionRaces({ sessions, api, success, check, database, sqlText, fixture, saveFixture, marker, isolatedPath,
      evidence: path.join(root, '.cloudflow-runtime/full-prd-20260915/approved-runtime') });
  }
  if (oauthResources) {
    await verifyC3OauthResources({ sessions, api, success, check, database, sqlText, fixture, saveFixture, marker, state, requests, secrets: sensitiveValues,
      evidence: path.join(root, '.cloudflow-runtime/full-prd-20260915/approved-runtime') });
  }
  if (linkedReads) {
    await verifyC3LinkedReads({ sessions, api, success, check, database, sqlText, fixture, saveFixture, marker, requests, secrets: sensitiveValues,
      evidence: path.join(root, '.cloudflow-runtime/full-prd-20260915/approved-runtime') });
  }
  if (actionReturns) {
    await verifyC3ActionReturns({ sessions, api, success, check, database, sqlText, fixture, saveFixture, marker, secrets: sensitiveValues,
      evidence: path.join(root, '.cloudflow-runtime/full-prd-20260915/approved-runtime') });
  }
  if (versionRecords) {
    await verifyC4VersionRecords({ sessions, api, success, check, database, sqlText, fixture, saveFixture, marker, secrets: sensitiveValues, requests,
      evidence: path.join(root, '.cloudflow-runtime/full-prd-20260915/approved-runtime') });
  }
  check('employee_menu_grants_unchanged', database('SELECT menu_id FROM sys_role_menu WHERE tenant_id=100000 AND role_id=5 ORDER BY menu_id;') === employeeGrantsBefore
    && database('SELECT COUNT(*) FROM sys_role_menu WHERE role_id=5 AND menu_id BETWEEN 1400 AND 1449') === '0');
  await scanRuntimeLogs();
  assert.ok(checks.every(result => result.passed), 'C_LIVE_HAS_FAILED_CHECKS');
  console.log(`C_LIVE_HTTP=PASS; CHECKS=${checks.length}; REQUESTS=${requests.length}; ISOLATED_API_DOUBLES=0; REAL_GATEWAY_AUTH_WORKFLOW_STORAGE=true`);
}

let failure;
try { await run(); }
catch (error) { failure = String(error.message).replace(/\$2[aby]\$[^\s]+/g, '[REDACTED_HASH]').slice(0, 200); console.error(`C_LIVE_FAILED=${failure}`); process.exitCode = 1; }
finally {
  await browser?.close();
  await frontendServer?.close();
  const result = { scope: configurationOnly ? 'CONFIGURATION_ONLY' : 'FULL_C', isolated: Boolean(isolatedPath), passed: !failure && checks.every(check => check.passed), errorPagesExecuted: errorPages && !failure, valueBoundariesExecuted: valueBoundaries && !failure, valuePagesExecuted: valuePages && !failure, dictionaryPagesExecuted: dictionaryPages && !failure, layoutPagesExecuted: layoutPages && !failure, originalPagesExecuted: originalPages && !failure, checks, requests, failure, runId, runtimeProcesses: (isolatedPath ? state.services : state.processes).map(({ name, id }) => ({ name, id })), fixtureSha256: fs.existsSync(privateFile) ? createHash('sha256').update(fs.readFileSync(privateFile)).digest('hex') : null, completedAt: new Date().toISOString() };
  result.historicalReferencesExecuted = historicalReferences && !failure;
  result.designerOperationsExecuted = designerOperations && !failure;
  result.subtableMobileExecuted = subtableMobile && !failure;
  result.subtableNativeExecuted = subtableNative && !failure;
  result.subtableTypesExecuted = subtableTypes && !failure;
  result.subtableDesignerExecuted = subtableDesigner && !failure;
  result.subtablePrecisionExecuted = subtablePrecision && !failure;
  result.permissionPagesExecuted = permissionPages && !failure;
  result.expressionPagesExecuted = expressionPages && !failure;
  result.permissionCacheExecuted = permissionCache && !failure;
  result.matrixTemplatesExecuted = matrixTemplates && !failure;
  result.readEntriesExecuted = readEntries && !failure;
  result.permissionRacesExecuted = permissionRaces && !failure;
  result.oauthResourcesExecuted = oauthResources && !failure;
  result.linkedReadsExecuted = linkedReads && !failure;
  result.actionReturnsExecuted = actionReturns && !failure;
  result.versionRecordsExecuted = versionRecords && !failure;
  fs.writeFileSync(path.join(directory, `${configurationOnly ? 'configuration' : 'live'}-result-${runId}.json`), JSON.stringify(result, null, 2));
  console.log(`C_LIVE_SUMMARY scope=${result.scope}; checks_passed=${checks.filter(check => check.passed).length}; checks_failed=${checks.filter(check => !check.passed).length}; requests=${requests.length}; FULL_SUITE_PASS=${result.passed}`);
}
