import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { oauthRuntimeOffsets, scanOauthRuntime } from './logs.mjs';

test('OAuth scans appended, new and truncated nested logs without recertifying history', async () => {
  const temporary = await fs.realpath(os.tmpdir());
  if (process.platform === 'win32') assert.notEqual(path.parse(temporary).root.toLowerCase(), `${process.env.SystemDrive}\\`.toLowerCase());
  const directory = await fs.mkdtemp(path.join(temporary, 'cloudflow-oauth-log-check-'));
  const secret = 'oauth-unit-secret-1234567890';
  try {
    await fs.mkdir(path.join(directory, 'auth/logs'), { recursive: true });
    await fs.mkdir(path.join(directory, 'private'));
    await fs.mkdir(path.join(directory, 'mysql-data'));
    await fs.mkdir(path.join(directory, 'profile'));
    const nested = path.join(directory, 'auth/logs/application.log');
    const truncated = path.join(directory, 'auth/stdout.log');
    await fs.writeFile(nested, `${secret}\nhistorical content\n`);
    await fs.writeFile(truncated, 'old-content-'.repeat(100));
    for (const name of ['private', 'mysql-data', 'profile']) await fs.writeFile(path.join(directory, name, 'excluded.log'), secret);
    const offsets = await oauthRuntimeOffsets(directory);
    assert.equal(offsets.size, 2);
    await fs.appendFile(nested, 'new non-sensitive content\n');
    let result = await scanOauthRuntime(directory, offsets, [secret]);
    assert.equal(result.files, 1);
    assert.equal(result.leaks, 0);
    await fs.appendFile(nested, 'a'.repeat(65530) + secret);
    await fs.writeFile(truncated, secret);
    await fs.writeFile(path.join(directory, 'auth/new.log'), secret);
    result = await scanOauthRuntime(directory, offsets, [secret]);
    assert.equal(result.discoveredFiles, 3);
    assert.equal(result.files, 3);
    assert.equal(result.leaks, 3);
    assert.ok(result.bytes > 65536);
  } finally {
    assert.equal(path.dirname(await fs.realpath(directory)), temporary);
    assert.match(path.basename(directory), /^cloudflow-oauth-log-check-/);
    await fs.rm(directory, { recursive: true, force: true });
  }
});
