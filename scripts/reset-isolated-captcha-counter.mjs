import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ownedGatewayRedis } from './owned-gateway-redis.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const statePath = await fs.realpath(process.argv[2] || '');
const directory = path.dirname(statePath);
assert.equal(path.basename(statePath), 'state.json');
assert.equal(path.dirname(directory), await fs.realpath(path.join(root, '.cloudflow-runtime/batch-g-integration')));
assert.match(path.basename(directory), /^[a-f0-9]{32}$/);
assert.ok(process.argv.slice(3).every(argument => argument === '--reset'), 'Only --reset is supported');
const state = JSON.parse((await fs.readFile(statePath, 'utf8')).replace(/^\uFEFF/, ''));
assert.equal(await fs.realpath(state.run), directory);
assert.equal(state.status, 'RUNNING');
assert.ok(Number.isInteger(state.redisPort) && state.redisPort > 1024 && state.redisPort < 65536);
const owner = state.processes.find(process => process.name === 'redis');
assert.ok(owner?.marker);
const configPath = await fs.realpath(path.resolve(directory, owner.marker));
assert.equal(path.dirname(configPath), directory);
const expectedExecutable = await fs.realpath(path.join(root, '.cloudflow-runtime/redis-8.10.1/bin/Redis-8.10.1-Windows-x64-msys2/redis-server.exe'));
const inspection = spawnSync('C:\\Program Files\\PowerShell\\7\\pwsh.exe', ['-NoProfile', '-Command', `
$ErrorActionPreference='Stop'
$listeners=@(Get-NetTCPConnection -State Listen -LocalPort ([int]$env:OWNED_CAPTCHA_REDIS_PORT))
if ($listeners.Count -ne 1 -or $listeners[0].LocalAddress -ne '127.0.0.1') { throw 'Expected one owned loopback Redis listener' }
$process=Get-CimInstance Win32_Process -Filter "ProcessId = $($listeners[0].OwningProcess)"
$process | Select-Object ProcessId,ExecutablePath,CommandLine | ConvertTo-Json -Compress
`], { encoding: 'utf8', windowsHide: true, timeout: 30000, env: { ...process.env, OWNED_CAPTCHA_REDIS_PORT: String(state.redisPort) } });
assert.equal(inspection.status, 0, 'Owned Redis listener inspection failed');
const redisProcess = JSON.parse(inspection.stdout);
assert.equal((await fs.realpath(redisProcess.ExecutablePath)).toLowerCase(), expectedExecutable.toLowerCase());
assert.ok(redisProcess.CommandLine.includes(path.basename(configPath)), 'Redis process must reference the isolated config marker');
const redis = await ownedGatewayRedis(state);
const server = redis('INFO', 'server');
assert.equal(Number(/^tcp_port:(\d+)/m.exec(server)?.[1]), state.redisPort);
const reportedConfig = /^config_file:(.+)$/m.exec(server)?.[1].trim();
assert.ok(reportedConfig);
const windowsConfig = reportedConfig.replace(/^\/cygdrive\/([a-z])\//i, (match, drive) => `${drive.toUpperCase()}:\\`).replaceAll('/', '\\');
assert.equal((await fs.realpath(windowsConfig)).toLowerCase(), configPath.toLowerCase());
console.log(`VERIFIED_OWNED_REDIS: pid=${redisProcess.ProcessId}; address=127.0.0.1; port=${state.redisPort}; config=${configPath}`);
const key = 'CAPTCHA:LIMIT:127.0.0.1';
const before = redis('GET', key);
assert.ok(before === '' || /^\d+$/.test(before));
let deleted = 0;
if (process.argv.includes('--reset') && before !== '') {
  deleted = Number(redis('EVAL', "if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) else return 0 end", '1', key, before));
  assert.equal(deleted, 1);
}
const after = Number(redis('EXISTS', key));
if (process.argv.includes('--reset')) assert.equal(after, 0);
console.log(`ISOLATED_CAPTCHA_COUNTER: reset=${process.argv.includes('--reset')}; key=${key}; before=${before || 'absent'}; deleted=${deleted}; after_exists=${after}; redis_port=${state.redisPort}; other_keys_targeted=0; production_modified=false`);
