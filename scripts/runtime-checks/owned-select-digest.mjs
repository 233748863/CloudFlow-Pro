import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const run = 'D:/CloudFlowPro/.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7';

export async function digestOwnedSelect(statement) {
  assert.match(statement, /^SELECT\s/i, 'One owned read statement required');
  assert.ok(!/;\s*\S|\bINTO\s+(?:OUTFILE|DUMPFILE)\b/i.test(statement), 'One owned read statement required');
  const state = JSON.parse(fs.readFileSync(path.join(run, 'state.json'), 'utf8').replace(/^\uFEFF/, ''));
  assert.equal(state.status, 'RUNNING');
  assert.equal(fs.realpathSync(state.run), fs.realpathSync(run));
  assert.ok(Number.isInteger(state.mysqlPort) && state.mysqlPort > 1024 && state.mysqlPort < 65536);
  const environment = { ...process.env };
  delete environment.MYSQL_PWD;
  const argumentsList = ['--no-defaults', '--protocol=TCP', '--host=127.0.0.1', `--port=${state.mysqlPort}`,
    '--user=root', '--skip-password', '--batch', '--raw', '--skip-column-names', '--default-character-set=utf8mb4', 'cloud_flow_db'];
  const identity = spawnSync('mysql.exe', argumentsList, { input: 'SELECT @@datadir;', encoding: 'utf8',
    windowsHide: true, env: environment, timeout: 30000, maxBuffer: 65536 });
  assert.equal(identity.status, 0, 'Owned SELECT identity read failed');
  assert.equal(fs.realpathSync(identity.stdout.trim()), fs.realpathSync(path.join(run, 'mysql-data')));

  return await new Promise((resolve, reject) => {
    const digest = createHash('sha256');
    let bytes = 0;
    let failed = false;
    const child = spawn('mysql.exe', argumentsList, { windowsHide: true, env: environment, timeout: 30000 });
    const fail = () => {
      failed = true;
      reject(new Error('Owned SELECT stream failed'));
    };
    child.on('error', fail);
    child.stdin.on('error', fail);
    child.stdout.on('error', fail);
    child.stdout.on('data', chunk => { digest.update(chunk); bytes += chunk.length; });
    child.stderr.resume();
    child.on('close', (code, signal) => {
      if (failed) return;
      if (code !== 0 || signal) { fail(); return; }
      resolve({ hash: digest.digest('hex'), bytes, exactBytes: true });
    });
    child.stdin.end(statement);
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    assert.ok(process.argv.includes('--d1-owned-digest'));
    const statement = fs.readFileSync(0, 'utf8');
    process.stdout.write(JSON.stringify(await digestOwnedSelect(statement)));
  } catch {
    process.stderr.write('OWNED_SELECT_DIGEST_FAILURE\n');
    process.exitCode = 1;
  }
}
