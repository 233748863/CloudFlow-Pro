import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

export async function scanSecretStream(stream, secrets) {
  const values = [...new Set(secrets)];
  assert.ok(values.length > 0 && values.every(value => typeof value === 'string' && value.length > 0));
  const overlap = Math.max(...values.map(value => value.length)) - 1;
  const found = new Set();
  let tail = '';
  let bytes = 0;
  stream.setEncoding('utf8');
  for await (const chunk of stream) {
    bytes += Buffer.byteLength(chunk);
    const text = tail + chunk;
    values.forEach((value, index) => { if (text.includes(value)) found.add(index); });
    tail = overlap > 0 ? text.slice(-overlap) : '';
  }
  return { bytes, sensitiveValues: values.length, leaks: found.size };
}

export async function scanOwnedAccessLogs(state, secrets) {
  return scanOwnedLogQuery(state, secrets, "SELECT CONCAT_WS('|',params,exception,request_uri) FROM sys_log WHERE service_name IN ('cloudflow-auth','cloudflow-service-crm');\n");
}

export function ownedAuditLogQuery(boundaries) {
  for (const key of ['log', 'error', 'audit']) {
    assert.equal(typeof boundaries?.[key], 'string', 'Audit cursor must preserve its database integer representation');
    assert.match(boundaries[key], /^(0|[1-9]\d*)$/, 'Audit cursor must be an unsigned decimal integer');
  }
  return `SELECT * FROM sys_log WHERE log_id>${boundaries.log};\n`
    + `SELECT * FROM sys_api_error_log WHERE error_id>${boundaries.error};\n`
    + `SELECT * FROM sys_audit_log WHERE audit_id>${boundaries.audit};\n`;
}

export async function scanOwnedAuditLogs(state, secrets, boundaries) {
  return scanOwnedLogQuery(state, secrets, ownedAuditLogQuery(boundaries));
}

async function scanOwnedLogQuery(state, secrets, statement) {
  assert.ok(Number.isInteger(state.mysqlPort) && state.mysqlPort > 1024 && state.mysqlPort < 65536);
  assert.equal(state.status, 'RUNNING');
  const environment = { ...process.env };
  delete environment.MYSQL_PWD;
  const child = spawn('mysql.exe', ['--no-defaults', '--protocol=TCP', '--host=127.0.0.1', `--port=${state.mysqlPort}`, '--user=root', '--skip-password', '--batch', '--raw', '--quick', '--skip-column-names', '--default-character-set=utf8mb4', 'cloud_flow_db'], {
    windowsHide: true, env: environment, stdio: ['pipe', 'pipe', 'pipe'],
  });
  let errorBytes = 0;
  let timedOut = false;
  child.stderr.on('data', chunk => { errorBytes += chunk.length; });
  const completed = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.stdin.once('error', reject);
    child.once('close', code => code === 0 && !timedOut ? resolve() : reject(new Error(`Owned access log query failed: exit=${code}; stderr_bytes=${errorBytes}; timeout=${timedOut}`)));
  });
  const timer = setTimeout(() => { timedOut = true; child.kill(); }, 120000);
  try {
    child.stdin.end(statement);
    const [result] = await Promise.all([scanSecretStream(child.stdout, secrets), completed]);
    return result;
  } finally { clearTimeout(timer); if (child.exitCode === null && child.signalCode === null) child.kill(); }
}
