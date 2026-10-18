import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export async function ownedGatewayRedis(state) {
  const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
  const directory = await fs.realpath(state.run);
  assert.equal(path.dirname(directory), await fs.realpath(path.join(root, '.cloudflow-runtime/batch-g-integration')));
  assert.match(path.basename(directory), /^[a-f0-9]{32}$/);
  const redisOwner = state.processes.find(process => process.name === 'redis');
  assert.ok(redisOwner?.marker);
  const configPath = await fs.realpath(path.resolve(directory, redisOwner.marker));
  assert.equal(path.dirname(configPath), directory);
  const config = await fs.readFile(configPath, 'utf8');
  assert.match(config, /^bind 127\.0\.0\.1$/m);
  assert.match(config, new RegExp(`^port ${state.redisPort}$`, 'm'));
  const password = config.match(/^requirepass (.+)$/m)?.[1]?.trim();
  assert.ok(password);
  const binary = path.join(root, '.cloudflow-runtime/redis-8.10.1/bin/Redis-8.10.1-Windows-x64-msys2/redis-cli.exe');
  return (...argumentsList) => {
    const command = argumentsList.length > 0 && !String(argumentsList[0]).startsWith('-');
    const input = command ? argumentsList.map(argument => JSON.stringify(String(argument))).join(' ') + '\n' : undefined;
    const result = spawnSync(binary, ['-h', '127.0.0.1', '-p', String(state.redisPort), '--raw', ...(command ? [] : argumentsList)],
      { input, encoding: 'utf8', windowsHide: true, timeout: 30000, env: { ...process.env, REDISCLI_AUTH: password } });
    assert.equal(result.status, 0, 'Owned Redis operation failed');
    assert.ok(!/^(ERR|NOAUTH|WRONGPASS|WRONGTYPE|NOPERM|READONLY|NOSCRIPT|OOM)\b/m.test(result.stdout), 'Owned Redis command rejected');
    return result.stdout.trim();
  };
}
