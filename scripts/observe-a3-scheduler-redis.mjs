import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { a3ExecutionWriteMetadata } from './a3-execution-observation.mjs';

// Read-only observation of the owned fixture. Raw MONITOR lines stay in memory and
// are immediately discarded; only this job's lock key, command, time and client port survive.
export async function observeA3SchedulerRedis(state, jobId, secrets, { claims = false, ownsExecution } = {}) {
  assert.match(String(jobId), /^[1-9][0-9]*$/);
  assert.ok(ownsExecution === undefined || typeof ownsExecution === 'function');
  const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
  const run = await fs.realpath(state.run);
  assert.equal(path.dirname(run), await fs.realpath(path.join(root, '.cloudflow-runtime/batch-g-integration')));
  assert.match(path.basename(run), /^[a-f0-9]{32}$/);
  const owner = state.processes.find(item => item.name === 'redis');
  const configFile = await fs.realpath(path.resolve(run, owner.marker));
  assert.equal(path.dirname(configFile), run);
  const config = await fs.readFile(configFile, 'utf8');
  assert.match(config, /^bind 127\.0\.0\.1$/m);
  assert.match(config, new RegExp('^port ' + state.redisPort + '$', 'm'));
  const password = config.match(/^requirepass (.+)$/m)?.[1]?.trim();
  assert.ok(password); secrets.add(password);
  const binary = path.join(root, '.cloudflow-runtime/redis-8.10.1/bin/Redis-8.10.1-Windows-x64-msys2/redis-cli.exe');
  const child = spawn(binary, ['-h', '127.0.0.1', '-p', String(state.redisPort), '--raw', 'MONITOR'],
    { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, REDISCLI_AUTH: password } });
  const events = []; let buffer = ''; let ready = false; let failed = false; let stopped = false;
  const matchingKey = new RegExp('"cloudflow:job:dispatch:' + jobId + ':(FIXED_DELAY|[0-9]+)"');
  const claimKey = new RegExp('"cloudflow:job:dispatch-fired:' + jobId + ':([0-9]+)" "([a-f0-9-]{36})"');
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', chunk => {
    buffer += chunk;
    let end;
    while ((end = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, end).replace(/\r$/, ''); buffer = buffer.slice(end + 1);
      if (line === 'OK') { ready = true; continue; }
      if (ownsExecution) {
        try {
          const execution = a3ExecutionWriteMetadata(line, ownsExecution);
          if (execution) events.push(execution);
        } catch { failed = true; child.kill(); }
      }
      if (claims) {
        const claim = line.match(claimKey);
        const client = line.match(/^([0-9]+\.[0-9]+) \[[0-9]+ 127\.0\.0\.1:([0-9]+)\] "SET" /i);
        if (claim && client) events.push({ at: Math.round(Number(client[1]) * 1000), port: Number(client[2]), window: claim[1], command: 'SET', executeNo: claim[2] });
      }
      const key = line.match(matchingKey);
      if (!key) continue;
      const origin = line.match(/^([0-9]+\.[0-9]+) \[[0-9]+ 127\.0\.0\.1:([0-9]+)\] "(EVAL|EVALSHA)" /i);
      if (origin) events.push({ at: Math.round(Number(origin[1]) * 1000), port: Number(origin[2]), window: key[1], command: origin[3].toUpperCase() });
    }
    if (buffer.length > 2097152 || events.length > 20000) { failed = true; buffer = ''; child.kill(); }
  });
  child.stderr.on('data', () => { failed = true; });
  child.once('error', () => { failed = true; });
  const completion = new Promise(resolve => child.once('close', code => { if (!stopped) failed = true; resolve(code); }));
  const close = async () => { if (!stopped) { stopped = true; child.kill(); } await completion; buffer = ''; };
  const deadline = Date.now() + 5000;
  while (!ready && !failed && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 50));
  if (!ready || failed) { await close(); throw new Error('Owned Redis observation did not become ready'); }
  return { events, assertHealthy: () => assert.ok(ready && !failed && !stopped, 'Owned Redis observation interrupted'), close };
}
