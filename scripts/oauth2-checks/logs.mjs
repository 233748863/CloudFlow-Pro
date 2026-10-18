import assert from 'node:assert/strict';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { scanSecretStream } from '../portal-checks/scan-access-logs.mjs';

export async function oauthRuntimeOffsets(directory) {
  const offsets = new Map();
  const collect = async parent => {
    for (const entry of await fs.readdir(parent, { withFileTypes: true })) {
      if (entry.isSymbolicLink() || ['mysql-data', 'profile', 'private'].includes(entry.name)) continue;
      const filename = path.join(parent, entry.name);
      if (entry.isDirectory()) await collect(filename);
      else if (entry.isFile() && entry.name.endsWith('.log')) offsets.set(filename, (await fs.stat(filename)).size);
    }
  };
  await collect(directory);
  return offsets;
}

export async function scanOauthRuntime(directory, offsets, secrets) {
  const current = await oauthRuntimeOffsets(directory);
  assert.ok(current.size > 0, 'Owned runtime logs must exist');
  let files = 0;
  let bytes = 0;
  let leaks = 0;
  for (const [filename, size] of current) {
    const previous = offsets.get(filename) || 0;
    const start = size < previous ? 0 : previous;
    if (size <= start) continue;
    const result = await scanSecretStream(createReadStream(filename, { start, end: size - 1 }), secrets);
    files++;
    bytes += result.bytes;
    leaks += result.leaks;
  }
  return { files, bytes, leaks, discoveredFiles: current.size };
}
