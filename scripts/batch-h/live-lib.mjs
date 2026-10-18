import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { authenticate, changeInitialPassword, readIdentity } from './browser-auth.mjs';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const directory = path.join(root, '.cloudflow-runtime/batch-h-20260914');
export const privateDirectory = path.join(directory, 'private');
export const prefix = 'H-20260914';
export const frontendUrl = (process.env.CLOUDFLOW_H_FRONTEND_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
export const checks = [];
export const requests = [];
export const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
export const sqlText = value => value == null ? 'NULL' : `CONVERT(X'${Buffer.from(String(value), 'utf8').toString('hex')}' USING utf8mb4)`;

const target = Object.freeze({ host: '192.168.1.173', port: 3306, database: 'cloud_flow_db', tableCount: 323 });
const sensitiveValues = new Set();
const logMarkers = [];
const browserLeaks = [];
let activeGeneration;
let checkedDatabaseGeneration;
let privateDirectoryReady = false;

function fail(code, label = code) {
  const error = new Error(redact(label));
  error.code = code;
  error.hAcceptance = true;
  throw error;
}

function requireCondition(condition, code, label) {
  if (!condition) fail(code, label);
}

function redact(value) {
  let text = String(value ?? '');
  for (const secret of sensitiveValues) if (secret) text = text.split(secret).join('[REDACTED]');
  return text.replace(/Bearer\s+[^\s"']+/gi, 'Bearer [REDACTED]').slice(0, 240);
}

function evidence(value, depth = 0) {
  if (value == null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') return redact(value);
  if (depth >= 5) return '[OMITTED]';
  if (Array.isArray(value)) return value.slice(0, 100).map(item => evidence(item, depth + 1));
  if (typeof value !== 'object') return '[OMITTED]';
  const result = {};
  for (const [key, item] of Object.entries(value).slice(0, 100)) {
    if (/password|replacement|token|authorization|cookie|secret|formData|variables|^body$|^text$|^content$|^msg$|^message$|^headers$/i.test(key)) continue;
    result[key] = evidence(item, depth + 1);
  }
  return result;
}

function safeCode(code) {
  return typeof code === 'number' || typeof code === 'string' && /^[A-Z0-9_-]{1,64}$/.test(code) ? code : null;
}

function safeTrace(traceId) {
  return typeof traceId === 'string' && /^[A-Za-z0-9._-]{1,128}$/.test(traceId) ? traceId : null;
}

export function assertRuntime() {
  requireCondition(process.env.CLOUDFLOW_H_ACCEPTANCE === '1', 'H_ACCEPTANCE_NOT_AUTHORIZED', '必须先设置 CLOUDFLOW_H_ACCEPTANCE=1');
  requireCondition(/^jdbc:mysql:\/\/192\.168\.1\.173:3306\/cloud_flow_db(?:\?[^#\r\n]*)?$/.test(process.env.DB_URL || ''), 'H_DATABASE_TARGET_MISMATCH');
  requireCondition(Boolean(process.env.DB_USERNAME) && Boolean(process.env.DB_PASSWORD), 'H_DATABASE_CREDENTIALS_REQUIRED');
  requireCondition(['http://127.0.0.1:3000', 'http://localhost:3000'].includes(frontendUrl), 'H_FRONTEND_TARGET_MISMATCH');
  let state;
  try { state = JSON.parse(readFileSync(path.join(directory, 'state.json'), 'utf8').replace(/^\uFEFF/, '')); }
  catch { fail('H_RUNTIME_STATE_UNAVAILABLE', 'H运行状态文件尚未就绪'); }
  requireCondition(state.milestone === prefix && state.status === 'RUNNING', 'H_RUNTIME_NOT_RUNNING', '主线程须完成H初始化与六服务健康检查，状态必须为 RUNNING');
  requireCondition(state.target?.host === target.host && Number(state.target.port) === target.port
    && state.target.database === target.database, 'H_STATE_TARGET_MISMATCH');
  const healthyServices = new Set((state.health?.services || []).filter(service => service.status === 'UP').map(service => service.name));
  requireCondition(state.health?.passed === true && ['gateway', 'auth', 'workflow', 'oa', 'crm', 'hr'].every(name => healthyServices.has(name)), 'H_SERVICES_NOT_HEALTHY');
  const imports = Array.isArray(state.imports) ? state.imports : [];
  const initializedIndex = imports.findLastIndex(entry => entry.phase === 'Initialize');
  const initialized = imports[initializedIndex];
  requireCondition(initialized?.passed === true && initialized.tableCount === target.tableCount,
    'H_OFFICIAL_INITIALIZATION_REQUIRED');
  const verifiedImports = imports.slice(initializedIndex);
  requireCondition(verifiedImports.every((entry, index) => entry.passed === true
    && entry.tableCount === target.tableCount && entry.phase === (index === 0 ? 'Initialize' : 'Demo')),
  'H_IMPORT_SEQUENCE_NOT_VERIFIED');
  const generation = createHash('sha256').update(JSON.stringify({ startedAt: state.startedAt, verifiedImports })).digest('hex');
  requireCondition(!activeGeneration || activeGeneration === generation, 'H_RUNTIME_CHANGED_DURING_SUITE');
  activeGeneration = generation;
  return { generation, milestone: prefix, target, status: 'RUNNING' };
}

function privatePath(name) {
  requireCondition(/^[A-Za-z0-9][A-Za-z0-9_-]{0,95}$/.test(name), 'H_ARTIFACT_NAME_INVALID');
  return path.join(privateDirectory, `${name}.private.json`);
}

async function ensurePrivateDirectory() {
  assertRuntime();
  if (privateDirectoryReady) return;
  await fs.mkdir(privateDirectory, { recursive: true, mode: 0o700 });
  requireCondition(!(await fs.lstat(privateDirectory)).isSymbolicLink(), 'H_PRIVATE_DIRECTORY_LINK_REJECTED');
  const actualParent = await fs.realpath(directory);
  const relative = path.relative(actualParent, await fs.realpath(privateDirectory));
  requireCondition(relative === 'private', 'H_PRIVATE_DIRECTORY_ESCAPED');
  if (process.platform === 'win32') {
    const script = "$ErrorActionPreference='Stop'; $identity=[System.Security.Principal.WindowsIdentity]::GetCurrent(); "
      + '$security=New-Object System.Security.AccessControl.DirectorySecurity; $security.SetOwner($identity.User); '
      + '$security.SetAccessRuleProtection($true,$false); '
      + "$system=New-Object System.Security.Principal.SecurityIdentifier('S-1-5-18'); "
      + 'foreach($sid in @($identity.User,$system)) { '
      + "$rule=New-Object System.Security.AccessControl.FileSystemAccessRule($sid,'FullControl','ContainerInherit,ObjectInherit','None','Allow'); "
      + '$security.AddAccessRule($rule) }; Set-Acl -LiteralPath $env:CLOUDFLOW_H_PRIVATE_DIRECTORY -AclObject $security';
    const secured = spawnSync('pwsh.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script], {
      encoding: 'utf8', timeout: 30000, windowsHide: true,
      env: { ...process.env, CLOUDFLOW_H_PRIVATE_DIRECTORY: privateDirectory },
    });
    requireCondition(secured.status === 0, 'H_PRIVATE_ACL_FAILED');
  } else {
    await fs.chmod(privateDirectory, 0o700);
  }
  privateDirectoryReady = true;
}

async function readPrivate(name, fallback = null) {
  await ensurePrivateDirectory();
  let saved;
  try {
    requireCondition(!(await fs.lstat(privatePath(name))).isSymbolicLink(), 'H_PRIVATE_ARTIFACT_LINK_REJECTED');
    saved = JSON.parse((await fs.readFile(privatePath(name), 'utf8')).replace(/^\uFEFF/, ''));
  }
  catch (error) {
    if (error.code === 'ENOENT') return fallback;
    if (error.hAcceptance) throw error;
    fail('H_PRIVATE_ARTIFACT_UNREADABLE');
  }
  requireCondition(saved.milestone === prefix && saved.generation === assertRuntime().generation, 'H_ARTIFACT_GENERATION_MISMATCH', 'H私有资料与当前初始化批次不一致，请主线程核对；脚本不会覆盖旧凭据');
  return saved.payload;
}

async function writePrivate(name, payload) {
  await ensurePrivateDirectory();
  await readPrivate(name);
  const destination = privatePath(name);
  const temporary = `${destination}.${randomBytes(8).toString('hex')}.tmp`;
  const encoded = JSON.stringify({ milestone: prefix, generation: assertRuntime().generation, payload }, null, 2);
  await fs.writeFile(temporary, encoded, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  await fs.rename(temporary, destination);
  if (process.platform !== 'win32') await fs.chmod(destination, 0o600);
}

async function withIdentityLock(operation) {
  await ensurePrivateDirectory();
  const lockPath = path.join(privateDirectory, 'identity.lock');
  const deadline = Date.now() + 600000;
  let handle;
  while (!handle) {
    assertRuntime();
    try { handle = await fs.open(lockPath, 'wx', 0o600); }
    catch (error) {
      if (error.code !== 'EEXIST') fail('H_IDENTITY_LOCK_FAILED');
      requireCondition(Date.now() < deadline, 'H_IDENTITY_LOCK_TIMEOUT', 'H身份资料被占用；脚本不会自动删除锁文件');
      await pause(500);
    }
  }
  try {
    await handle.writeFile(JSON.stringify({ processId: process.pid, createdAt: new Date().toISOString() }));
    return await operation();
  } finally {
    await handle.close();
    await fs.unlink(lockPath);
  }
}

export const readFixture = name => readPrivate(`${name}-fixture`, {});
export const saveFixture = (name, fixture) => writePrivate(`${name}-fixture`, fixture);

export function check(label, condition, details) {
  const record = { label: redact(label), passed: Boolean(condition), details: evidence(details), checkedAt: new Date().toISOString() };
  checks.push(record);
  requireCondition(condition, 'H_CHECK_FAILED', label);
  console.log(`PASS ${record.label}`);
}

export function failureSummary(error) {
  return error?.hAcceptance
    ? { code: safeCode(error.code), label: redact(error.message) }
    : { code: /^H_[A-Z_]+$/.test(error?.message || '') ? error.message : 'H_UNEXPECTED_ERROR' };
}

export async function saveResult(name, error = null, extra = {}) {
  const previous = await readPrivate(`${name}-result`);
  if (previous) await writePrivate(`${name}-attempt-${Date.now()}`, previous);
  await writePrivate(`${name}-result`, {
    ...evidence(extra), milestone: prefix, passed: !error,
    checks: [...checks], requests: [...requests], failure: error ? failureSummary(error) : null,
    completedAt: new Date().toISOString(),
  });
}

function runMysql(statement) {
  assertRuntime();
  const result = spawnSync(process.env.CLOUDFLOW_MYSQL_EXE || 'mysql.exe', [
    '--no-defaults', `--host=${target.host}`, `--port=${target.port}`, '--protocol=TCP',
    `--user=${process.env.DB_USERNAME}`, `--database=${target.database}`, '--connect-timeout=10',
    '--batch', '--raw', '--skip-column-names', '--default-character-set=utf8mb4', '--local-infile=0', '--binary-mode',
  ], { input: statement, encoding: 'utf8', timeout: 60000, maxBuffer: 16 * 1024 * 1024, windowsHide: true,
    env: { ...process.env, MYSQL_PWD: process.env.DB_PASSWORD } });
  if (result.status !== 0 || result.error) {
    const mysqlCode = /ERROR (\d+) \([A-Z0-9]+\)/.exec(result.stderr || '')?.[1];
    fail('H_DATABASE_COMMAND_FAILED', `数据库命令失败，退出码=${result.status ?? '无'}，错误号=${mysqlCode || result.error?.code || '无'}`);
  }
  return result.stdout.trim();
}

function verifyDatabase() {
  const { generation } = assertRuntime();
  if (checkedDatabaseGeneration === generation) return;
  const actual = JSON.parse(runMysql("SELECT JSON_OBJECT('databaseName', DATABASE(), 'tableCount', (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE'));"));
  check('H运行库目标及323张基础表', actual.databaseName === target.database && actual.tableCount === target.tableCount, actual);
  checkedDatabaseGeneration = generation;
}

export function database(statement) {
  verifyDatabase();
  requireCondition(typeof statement === 'string', 'H_READONLY_SQL_REQUIRED');
  const query = statement.trim().replace(/;\s*$/, '');
  const syntax = query.replace(/'(?:''|\\.|[^'\\])*'|"(?:""|\\.|[^"\\])*"/g, "''");
  requireCondition(/^SELECT\s/i.test(syntax) && !/[;@\\\x00]|--|\/\*|\*\/|#/.test(syntax)
    && !/\b(INTO|OUTFILE|DUMPFILE|LOAD_FILE|SLEEP|BENCHMARK|GET_LOCK|RELEASE_LOCK|PROCEDURE|CALL)\b|\bFOR\s+UPDATE\b|\bLOCK\s+IN\s+SHARE\b/i.test(syntax),
  'H_READONLY_SQL_REQUIRED', 'database只接受单条只读SELECT；业务写入须走真实接口');
  return runMysql(`START TRANSACTION READ ONLY;\n${query};\nCOMMIT;`);
}

export function jsonRows(statement) {
  const output = database(statement);
  try { return output ? output.split(/\r?\n/).map(row => JSON.parse(row)) : []; }
  catch { fail('H_DATABASE_JSON_INVALID'); }
}

export async function until(operation, predicate, label, timeout = 90000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    assertRuntime();
    const result = await operation();
    if (predicate(result)) return result;
    await pause(750);
  }
  fail('H_POLL_TIMEOUT', `${label}等待超时`);
}

export function requestMetadata(result) {
  return { status: result.status, code: safeCode(result.body?.code), traceId: safeTrace(result.traceId) };
}

export async function api(page, requestPath, options = {}) {
  verifyDatabase();
  requireCondition(new URL(page.url()).origin === frontendUrl, 'H_BROWSER_ORIGIN_MISMATCH');
  requireCondition(typeof requestPath === 'string' && /^\/(auth|workflow|oa|hr|crm)\//.test(requestPath)
    && !/[\\#\x00-\x1f]/.test(requestPath), 'H_API_PATH_INVALID');
  const parsed = new URL(`/api${requestPath}`, frontendUrl);
  requireCondition(parsed.origin === frontendUrl && parsed.pathname.startsWith('/api/'), 'H_API_PATH_INVALID');
  const method = (options.method || 'GET').toUpperCase();
  requireCondition(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method), 'H_HTTP_METHOD_INVALID');
  requireCondition([options.body !== undefined, options.rawBody !== undefined, Boolean(options.file)].filter(Boolean).length <= 1, 'H_HTTP_BODY_AMBIGUOUS');
  const headers = options.headers || {};
  requireCondition(!Object.keys(headers).some(name => /^(authorization|cookie|host|origin|referer)$/i.test(name)), 'H_AUTH_HEADER_OVERRIDE_REJECTED');
  let result;
  try {
    result = await page.evaluate(async supplied => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 30000);
      try {
        const storage = await import('/src/utils/authStorage.ts');
        const token = storage.getAuthToken();
        const headers = { ...supplied.headers };
        if (token) headers.Authorization = token.startsWith('Bearer ') ? token : `Bearer ${token}`;
        const csrf = document.cookie.split(';').map(value => value.trim()).find(value => value.startsWith('XSRF-TOKEN='));
        if (csrf) headers['X-CSRF-Token'] = decodeURIComponent(csrf.slice('XSRF-TOKEN='.length));
        let body;
        if (supplied.file) {
          body = new FormData();
          const bytes = Uint8Array.from(atob(supplied.file.content), character => character.charCodeAt(0));
          body.append('file', new File([bytes], supplied.file.name, { type: supplied.file.type || 'text/plain' }));
          for (const [key, value] of Object.entries(supplied.file.fields || {})) body.append(key, String(value));
        } else if (supplied.rawBody !== undefined) {
          headers['Content-Type'] = 'application/json';
          body = supplied.rawBody;
        } else if (supplied.body !== undefined) {
          headers['Content-Type'] = 'application/json';
          body = JSON.stringify(supplied.body);
        }
        const response = await fetch(`/api${supplied.requestPath}`, {
          method: supplied.method, credentials: 'same-origin', redirect: 'error', headers, body, signal: controller.signal,
        });
        const metadata = { status: response.status, traceId: response.headers.get('X-Trace-Id'), ruleWarning: response.headers.get('X-CRM-Rule-Warning') };
        return (response.headers.get('Content-Type') || '').includes('json')
          ? { ...metadata, body: await response.json() }
          : { ...metadata, text: (await response.text()).slice(0, 16384) };
      } catch {
        return { status: 0, transportError: 'HTTP_TRANSPORT_FAILED' };
      } finally {
        clearTimeout(timer);
      }
    }, { requestPath, method, headers, body: options.body, rawBody: options.rawBody, file: options.file });
  } catch {
    result = { status: 0, transportError: 'BROWSER_REQUEST_FAILED' };
  }
  requests.push({ path: parsed.pathname, queryKeys: [...parsed.searchParams.keys()], method,
    ...requestMetadata(result), requestedAt: new Date().toISOString() });
  requireCondition(result.status !== 0, 'H_HTTP_TRANSPORT_FAILED', `真实接口传输失败：${method} ${parsed.pathname}`);
  return result;
}

export function success(result, label = '真实接口') {
  requireCondition(result.status === 200 && result.body?.code === 200, 'H_API_NOT_SUCCESS',
    `${label}：HTTP ${result.status}，业务码 ${safeCode(result.body?.code) ?? '无'}`);
  return result.body.data;
}

function matchesRejection(result, expression) {
  requireCondition(expression instanceof RegExp, 'H_REJECTION_EXPRESSION_REQUIRED');
  expression.lastIndex = 0;
  return expression.test(`${result.body?.code ?? ''} ${result.body?.msg || result.body?.message || result.text || ''}`);
}

export function rejected(result, expression, label) {
  check(label, result.status >= 400 && result.status < 500 && result.status !== 429
    && matchesRejection(result, expression), requestMetadata(result));
}

export function businessBlocked(result, expression, label) {
  const refused = result.status >= 400 && result.status < 500 && result.status !== 429
    || result.status === 200 && result.body?.code != null && result.body.code !== 200;
  check(label, refused && matchesRejection(result, expression), requestMetadata(result));
}

export function registerLogMarker(label) {
  const marker = `H_BODY_20260914_${randomBytes(16).toString('hex')}`;
  sensitiveValues.add(marker);
  logMarkers.push({ label: redact(label), marker });
  return marker;
}

let browserEventsObserved = 0;

function observeBrowser(page, accountName) {
  const inspect = (text, source) => {
    browserEventsObserved++;
    for (const entry of logMarkers) {
      if (text.includes(entry.marker)) browserLeaks.push({ label: entry.label, account: accountName, source, observedAt: new Date().toISOString() });
    }
  };
  page.on('console', message => inspect(message.text(), `console:${message.type()}`));
  page.on('pageerror', error => inspect(error.message, 'pageerror'));
}

export function logEvidence() {
  return { markers: logMarkers.map(entry => ({ ...entry })), browserLeaks: [...browserLeaks], browserEventsObserved,
    serverAndOperationLogScan: 'PENDING_MAIN_THREAD_SCAN' };
}

export async function completeWorkflowTask(sessions, instanceId, actor, action = 'APPROVE') {
  requireCondition(Boolean(sessions[actor]?.page), 'H_WORKFLOW_ACTOR_MISSING');
  const task = await until(async () => {
    const response = success(await api(sessions[actor].page, '/workflow/wf/todo?pageNum=1&pageSize=100'), '真实审批待办');
    return (response?.rows || []).find(item => String(item.instanceId || item.processInstanceId) === String(instanceId));
  }, item => Boolean(item), `${actor}审批待办`);
  return success(await api(sessions[actor].page, '/workflow/wf/complete', {
    method: 'POST', body: { taskId: task.taskId || task.id, action, comment: `${prefix} ${action}`, variables: {} },
  }), `${actor}审批处理`);
}

const accountDefinitions = Object.freeze({
  admin1: { roleId: '1', preferredSource: '1' },
  manager2: { roleId: '2', preferredSource: '2' },
  finance3: { roleId: '3', preferredSource: '3' },
  hr4: { roleId: '4', preferredSource: '4' },
  hrpeer4: { roleId: '4', preferredSource: '4' },
  employee5: { roleId: '5', preferredSource: '5' },
  peer5: { roleId: '5', preferredSource: '5' },
  production6: { roleId: '6' },
  oa7: { roleId: '7', preferredSource: '7' },
  sales8: { roleId: '8', preferredSource: '32' },
  sales9: { roleId: '9', preferredSource: '34' },
  salespeer9: { roleId: '9', preferredSource: '34' },
  salesother9: { roleId: '9', preferredSource: '34' },
  operations10: { roleId: '10' },
  auditor11: { roleId: '11' },
  approverHr4: { roleId: '4', preferredSource: '4' },
  approverFinance3: { roleId: '3', preferredSource: '3' },
  tenantPeer5: { roleId: '5', preferredSource: '5', isolated: true },
});

const accountAliases = Object.freeze({
  admin: 'admin1', manager: 'manager2', finance: 'finance3', hr: 'hr4', hrpeer: 'hrpeer4',
  employee: 'employee5', peer: 'peer5', oa: 'oa7', sales: 'sales8', salespeer: 'salespeer9', salesother: 'salesother9',
  approverHr: 'approverHr4', approverFinance: 'approverFinance3', tenantPeer: 'tenantPeer5',
  role1: 'admin1', role2: 'manager2', role3: 'finance3', role4: 'hr4', role5: 'employee5', role6: 'production6',
  role7: 'oa7', role8: 'sales8', role9: 'sales9', role10: 'operations10', role11: 'auditor11',
});

function canonicalAccount(name) {
  const canonical = Object.hasOwn(accountAliases, name) ? accountAliases[name] : name;
  requireCondition(Object.hasOwn(accountDefinitions, canonical), 'H_ACCOUNT_ALIAS_UNKNOWN', '未知H测试账号别名');
  return canonical;
}

function identifier(value) {
  requireCondition(/^[1-9][0-9]{0,18}$/.test(String(value)), 'H_ID_INVALID');
  return String(value);
}

function databaseBoolean(value) {
  return value === true || value === 1;
}

function insertIdentityFixture(table, statement) {
  verifyDatabase();
  requireCondition(['sys_tenant', 'sys_dept', 'sys_role', 'sys_role_menu', 'sys_user', 'sys_user_role'].includes(table)
    && statement.startsWith(`INSERT INTO ${table} `) && statement.includes(sqlText(prefix))
    && !/;|\b(UPDATE|DELETE|REPLACE|DROP|ALTER|TRUNCATE|GRANT|REVOKE)\b/i.test(statement), 'H_IDENTITY_INSERT_SCOPE_INVALID');
  runMysql(`START TRANSACTION;\n${statement};\nCOMMIT;`);
}

function sourceAccount(definition) {
  const preferred = definition.preferredSource ? `source.user_id = ${sqlText(definition.preferredSource)} DESC, ` : '';
  const rows = jsonRows(`SELECT JSON_OBJECT('userId', CAST(source.user_id AS CHAR), 'deptId', CAST(source.dept_id AS CHAR),
      'roleId', CAST(role.role_id AS CHAR)) FROM sys_user source
    JOIN sys_user_role binding ON binding.user_id = source.user_id AND binding.tenant_id = source.tenant_id
    JOIN sys_role role ON role.role_id = binding.role_id AND role.tenant_id = source.tenant_id
    WHERE source.tenant_id = 100000 AND role.role_id = ${sqlText(definition.roleId)}
      AND source.status = '0' AND source.deleted = 0 AND role.status = '0' AND role.deleted = 0
      AND COALESCE(source.create_by, '') <> ${sqlText(prefix)}
    ORDER BY ${preferred}source.user_id LIMIT 1`);
  requireCondition(rows.length === 1, 'H_SOURCE_ROLE_ACCOUNT_MISSING', `缺少既有角色${definition.roleId}的有效克隆来源`);
  identifier(rows[0].userId);
  return rows[0];
}

function prepareIsolatedTenant() {
  const tenantCode = 'h_20260914';
  let tenants = jsonRows(`SELECT JSON_OBJECT('tenantId', CAST(tenant_id AS CHAR), 'owned', create_by = ${sqlText(prefix)},
    'active', status = '0' AND deleted = 0) FROM sys_tenant WHERE tenant_code = ${sqlText(tenantCode)}`);
  if (!tenants.length) {
    insertIdentityFixture('sys_tenant', `INSERT INTO sys_tenant (tenant_code, tenant_name, status, user_limit, create_by, create_time, remark)
      SELECT ${sqlText(tenantCode)}, ${sqlText(`${prefix} 隔离租户`)}, '0', 100, ${sqlText(prefix)}, NOW(), ${sqlText(`${prefix} 真实租户隔离夹具`)}
      WHERE NOT EXISTS (SELECT 1 FROM sys_tenant WHERE tenant_code = ${sqlText(tenantCode)})`);
    tenants = jsonRows(`SELECT JSON_OBJECT('tenantId', CAST(tenant_id AS CHAR), 'owned', create_by = ${sqlText(prefix)},
      'active', status = '0' AND deleted = 0) FROM sys_tenant WHERE tenant_code = ${sqlText(tenantCode)}`);
  }
  requireCondition(tenants.length === 1 && databaseBoolean(tenants[0].owned) && databaseBoolean(tenants[0].active), 'H_TENANT_FIXTURE_OWNERSHIP_FAILED');
  const tenantId = identifier(tenants[0].tenantId);
  const deptName = `${prefix} 隔离部门`;
  insertIdentityFixture('sys_dept', `INSERT INTO sys_dept (tenant_id, parent_id, ancestors, dept_name, status, create_by, create_time)
    SELECT tenant_id, 0, '0', ${sqlText(deptName)}, '0', ${sqlText(prefix)}, NOW() FROM sys_tenant
    WHERE tenant_id = ${sqlText(tenantId)} AND tenant_code = ${sqlText(tenantCode)} AND create_by = ${sqlText(prefix)}
      AND NOT EXISTS (SELECT 1 FROM sys_dept WHERE tenant_id = ${sqlText(tenantId)} AND dept_name = ${sqlText(deptName)})`);
  const departments = jsonRows(`SELECT JSON_OBJECT('deptId', CAST(dept_id AS CHAR)) FROM sys_dept
    WHERE tenant_id = ${sqlText(tenantId)} AND dept_name = ${sqlText(deptName)} AND create_by = ${sqlText(prefix)} AND status = '0' AND deleted = 0`);
  requireCondition(departments.length === 1, 'H_ISOLATED_DEPARTMENT_MISSING');
  const roleKey = 'h_20260914_employee';
  insertIdentityFixture('sys_role', `INSERT INTO sys_role (tenant_id, role_name, role_key, role_sort, data_scope, ds_type, status, create_by, create_time, remark)
    SELECT ${sqlText(tenantId)}, ${sqlText(`${prefix} 员工`)}, ${sqlText(roleKey)}, source.role_sort, source.data_scope, source.ds_type, '0', ${sqlText(prefix)}, NOW(), ${sqlText(`${prefix} 克隆角色5`)}
    FROM sys_role source WHERE source.tenant_id = 100000 AND source.role_id = 5 AND source.status = '0' AND source.deleted = 0
      AND NOT EXISTS (SELECT 1 FROM sys_role WHERE tenant_id = ${sqlText(tenantId)} AND role_key = ${sqlText(roleKey)})`);
  const roles = jsonRows(`SELECT JSON_OBJECT('roleId', CAST(role_id AS CHAR)) FROM sys_role WHERE tenant_id = ${sqlText(tenantId)}
    AND role_key = ${sqlText(roleKey)} AND create_by = ${sqlText(prefix)} AND status = '0' AND deleted = 0`);
  requireCondition(roles.length === 1, 'H_ISOLATED_ROLE_MISSING');
  const roleId = identifier(roles[0].roleId);
  insertIdentityFixture('sys_role_menu', `INSERT INTO sys_role_menu (role_id, menu_id, tenant_id)
    SELECT role.role_id, source.menu_id, role.tenant_id FROM sys_role role
    JOIN sys_role_menu source ON source.role_id = 5 AND source.tenant_id = 100000
    WHERE role.role_id = ${sqlText(roleId)} AND role.tenant_id = ${sqlText(tenantId)} AND role.create_by = ${sqlText(prefix)}
      AND NOT EXISTS (SELECT 1 FROM sys_role_menu existing WHERE existing.role_id = role.role_id AND existing.menu_id = source.menu_id)`);
  check('隔离租户员工权限逐项克隆', Number(database(`SELECT COUNT(*) FROM sys_role_menu source WHERE source.role_id = 5 AND source.tenant_id = 100000
    AND NOT EXISTS (SELECT 1 FROM sys_role_menu target WHERE target.role_id = ${sqlText(roleId)} AND target.tenant_id = ${sqlText(tenantId)} AND target.menu_id = source.menu_id)`)) === 0);
  check('隔离租户员工没有额外菜单权限', Number(database(`SELECT COUNT(*) FROM sys_role_menu target
    WHERE target.role_id = ${sqlText(roleId)} AND target.tenant_id = ${sqlText(tenantId)}
      AND NOT EXISTS (SELECT 1 FROM sys_role_menu source WHERE source.role_id = 5 AND source.tenant_id = 100000 AND source.menu_id = target.menu_id)`)) === 0);
  return { tenantCode, tenantId, deptId: identifier(departments[0].deptId), roleId };
}

function targetAccount(username, tenantId, sourceId) {
  const rows = jsonRows(`SELECT JSON_OBJECT('userId', CAST(target.user_id AS CHAR), 'deptId', CAST(target.dept_id AS CHAR),
    'owned', target.create_by = ${sqlText(prefix)}, 'active', target.status = '0' AND target.deleted = 0,
    'resetRequired', target.pwd_reset_required, 'initialHashMatches', target.password = source.password)
    FROM sys_user target JOIN sys_user source ON source.user_id = ${sqlText(sourceId)} AND source.tenant_id = 100000
    WHERE target.tenant_id = ${sqlText(tenantId)} AND target.user_name = ${sqlText(username)}`);
  requireCondition(rows.length <= 1, 'H_ACCOUNT_NOT_UNIQUE');
  if (rows.length) requireCondition(databaseBoolean(rows[0].owned) && databaseBoolean(rows[0].active), 'H_ACCOUNT_FIXTURE_OWNERSHIP_FAILED');
  return rows[0];
}

async function prepareAccount(name, store) {
  const definition = accountDefinitions[name];
  const source = sourceAccount(definition);
  const ownership = definition.isolated
    ? (store.isolatedTenant ||= prepareIsolatedTenant())
    : { tenantId: '100000', tenantCode: 'xinyuan', deptId: source.deptId, roleId: definition.roleId };
  const username = `h_20260914_${name.toLowerCase()}`;
  requireCondition(username.length <= 30, 'H_ACCOUNT_NAME_TOO_LONG');
  let account = store.identities[name];
  let current = targetAccount(username, ownership.tenantId, source.userId);
  if (!account) {
    requireCondition(!current || current.resetRequired === '1' && databaseBoolean(current.initialHashMatches), 'H_ACCOUNT_CREDENTIAL_RECOVERY_REQUIRED');
    const password = process.env[`CLOUDFLOW_H_INITIAL_PASSWORD_ROLE_${definition.roleId}`] || process.env.CLOUDFLOW_H_INITIAL_PASSWORD;
    requireCondition(Boolean(password), 'H_INITIAL_PASSWORD_REQUIRED', '首次克隆须提供 CLOUDFLOW_H_INITIAL_PASSWORD，脚本不会读取DE账号文件');
    account = { name, username, ...ownership, sourceUserId: source.userId, password,
      replacement: `${randomBytes(15).toString('hex')}A1`, changed: false, changePending: false };
    store.identities[name] = account;
    await writePrivate('accounts', store);
  }
  sensitiveValues.add(account.password);
  sensitiveValues.add(account.replacement);
  requireCondition(account.username === username && account.tenantId === ownership.tenantId
    && account.roleId === ownership.roleId && account.sourceUserId === source.userId, 'H_ACCOUNT_DEFINITION_CHANGED');
  if (!current) {
    requireCondition(!account.userId, 'H_ACCOUNT_DISAPPEARED');
    insertIdentityFixture('sys_user', `INSERT INTO sys_user (tenant_id, dept_id, user_name, nick_name, password, status, deleted, pwd_reset_required, create_by, create_time, remark)
      SELECT ${sqlText(account.tenantId)}, ${sqlText(account.deptId)}, ${sqlText(username)}, ${sqlText(`${prefix} ${name}`)},
        source.password, '0', 0, '1', ${sqlText(prefix)}, NOW(), ${sqlText(`${prefix} 真实验收克隆账号`)}
      FROM sys_user source WHERE source.user_id = ${sqlText(account.sourceUserId)} AND source.tenant_id = 100000 AND source.status = '0' AND source.deleted = 0
        AND NOT EXISTS (SELECT 1 FROM sys_user WHERE tenant_id = ${sqlText(account.tenantId)} AND user_name = ${sqlText(username)})`);
    current = targetAccount(username, account.tenantId, source.userId);
  }
  requireCondition(Boolean(current), 'H_ACCOUNT_CREATION_FAILED');
  requireCondition(!account.userId || account.userId === current.userId, 'H_ACCOUNT_ID_CHANGED');
  account.userId = identifier(current.userId);
  account.deptId = current.deptId;
  insertIdentityFixture('sys_user_role', `INSERT INTO sys_user_role (user_id, role_id, tenant_id)
    SELECT target.user_id, role.role_id, target.tenant_id FROM sys_user target
    JOIN sys_role role ON role.role_id = ${sqlText(account.roleId)} AND role.tenant_id = target.tenant_id AND role.status = '0' AND role.deleted = 0
    WHERE target.user_id = ${sqlText(account.userId)} AND target.tenant_id = ${sqlText(account.tenantId)}
      AND target.user_name = ${sqlText(username)} AND target.create_by = ${sqlText(prefix)}
      AND NOT EXISTS (SELECT 1 FROM sys_user_role existing WHERE existing.user_id = target.user_id AND existing.role_id = role.role_id)`);
  const bindings = jsonRows(`SELECT JSON_OBJECT('roleId', CAST(role_id AS CHAR)) FROM sys_user_role
    WHERE user_id = ${sqlText(account.userId)} AND tenant_id = ${sqlText(account.tenantId)}`);
  requireCondition(bindings.length === 1 && bindings[0].roleId === account.roleId, 'H_ACCOUNT_ROLE_SCOPE_CHANGED');
  if (current.resetRequired === '0' && !account.changed) {
    requireCondition(account.changePending === true, 'H_ACCOUNT_PASSWORD_STATE_CHANGED');
    account.password = account.replacement;
    account.changed = true;
    account.changePending = false;
  }
  requireCondition(!(current.resetRequired === '1' && account.changed), 'H_ACCOUNT_PASSWORD_RESET_EXTERNALLY');
  await writePrivate('accounts', store);
  return account;
}

function publicAccount(account) {
  return Object.freeze({ name: account.name, username: account.username, userId: String(account.userId),
    tenantId: String(account.tenantId), tenantCode: account.tenantCode, deptId: String(account.deptId ?? ''),
    roleId: String(account.roleId), sourceUserId: String(account.sourceUserId) });
}

async function launchBrowser() {
  let chromium;
  const locations = [process.env.CLOUDFLOW_PLAYWRIGHT_HOME, path.join(root, '.cloudflow-runtime/playwright'), path.join(root, 'cloudflow-frontend'), root].filter(Boolean);
  for (const location of locations) {
    try {
      const requireBrowser = createRequire(path.join(path.resolve(location), 'package.json'));
      ({ chromium } = requireBrowser('playwright-core'));
      break;
    } catch {
      continue;
    }
  }
  requireCondition(Boolean(chromium), 'H_PLAYWRIGHT_MISSING', '需使用现有playwright-core；脚本不会安装依赖');
  const executablePath = process.env.CLOUDFLOW_H_CHROMIUM || chromium.executablePath();
  requireCondition(existsSync(executablePath), 'H_CHROMIUM_MISSING', '请用 CLOUDFLOW_H_CHROMIUM 指向已安装的Chromium；脚本不会下载浏览器');
  try { return await chromium.launch({ headless: true, executablePath }); }
  catch { fail('H_BROWSER_LAUNCH_FAILED'); }
}

export async function openSessions(names = ['admin1', 'hr4', 'employee5', 'peer5', 'sales8']) {
  assertRuntime();
  requireCondition(Array.isArray(names) && names.length > 0 && names.length <= 32
    && names.every(name => typeof name === 'string'), 'H_ACCOUNT_NAMES_INVALID');
  const requested = [...new Set(names)];
  const canonicalNames = [...new Set(requested.map(canonicalAccount))];
  verifyDatabase();
  const tenants = jsonRows("SELECT JSON_OBJECT('tenantCode', tenant_code) FROM sys_tenant WHERE tenant_id = 100000 AND status = '0' AND deleted = 0");
  requireCondition(tenants.length === 1 && tenants[0].tenantCode === 'xinyuan', 'H_PRIMARY_TENANT_MISMATCH');
  return withIdentityLock(async () => {
    const store = await readPrivate('accounts', { identities: {} });
    requireCondition(store && typeof store.identities === 'object', 'H_ACCOUNTS_FILE_INVALID');
    for (const name of canonicalNames) await prepareAccount(name, store);
    const browser = await launchBrowser();
    const sessions = { browser, accounts: {}, fixture: { prefix, tenantId: '100000', tenantCode: 'xinyuan', isolatedTenant: store.isolatedTenant } };
    try {
      for (const name of canonicalNames) {
        const account = store.identities[name];
        const storageState = await readPrivate(`session-${name}`);
        let context = await browser.newContext({ baseURL: frontendUrl, viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block',
          ...(storageState ? { storageState } : {}) });
        let page = await context.newPage();
        page.setDefaultTimeout(30000);
        observeBrowser(page, name);
        try { await page.goto('/login', { waitUntil: 'domcontentloaded' }); }
        catch { fail('H_FRONTEND_UNAVAILABLE', '前端须由主线程预先准备；本脚本不会启动服务'); }
        let information = storageState ? await readIdentity(page) : null;
        const reusable = information && information.userId === account.userId && information.tenantId === account.tenantId
          && !information.forcePasswordChange && account.changed;
        if (reusable) {
          check(`${name}复用已通过真实验证码的会话`, true);
        } else {
          if (storageState) {
            await context.close();
            context = await browser.newContext({ baseURL: frontendUrl, viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
            page = await context.newPage();
            page.setDefaultTimeout(30000);
            observeBrowser(page, name);
            await page.goto('/login', { waitUntil: 'domcontentloaded' });
          }
          const loginWindow = await readPrivate('login-window', { attemptedAt: 0 });
          await pause(Math.max(0, 13000 - (Date.now() - loginWindow.attemptedAt)));
          assertRuntime();
          await writePrivate('login-window', { attemptedAt: Date.now() });
          const result = await authenticate(page, account);
          if (result.reason === 'INITIAL_PASSWORD_CHANGE_REQUIRED') {
            requireCondition(!account.changed, 'H_UNEXPECTED_PASSWORD_RESET');
            account.changePending = true;
            await writePrivate('accounts', store);
            await changeInitialPassword(page, account);
            account.password = account.replacement;
            account.changed = true;
            account.changePending = false;
            await writePrivate('accounts', store);
          } else {
            requireCondition(result.authenticated === true && account.changed, 'H_REAL_LOGIN_FAILED', `${name}真实认证未完成：${result.reason || '改密状态不符'}`);
          }
          information = await readIdentity(page);
          check(`${name}真实验证码、登录协议及首次改密`, Boolean(information) && !information.forcePasswordChange);
        }
        check(`${name}会话用户及租户与H克隆一致`, information?.userId === account.userId && information?.tenantId === account.tenantId,
          { userId: account.userId, tenantId: account.tenantId, roleId: account.roleId });
        await writePrivate(`session-${name}`, await context.storageState());
        const view = publicAccount(account);
        const session = { page, context, account: view, information };
        sessions[name] = session;
        sessions.accounts[name] = view;
        for (const alias of requested.filter(alias => canonicalAccount(alias) === name)) {
          sessions[alias] = session;
          sessions.accounts[alias] = view;
        }
      }
      return sessions;
    } catch (error) {
      try { await browser.close(); }
      catch { fail('H_SESSION_CLEANUP_FAILED', `会话初始化失败且浏览器关闭失败：${failureSummary(error).code}`); }
      throw error;
    }
  });
}
