import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

export function createOwnedRecoveryJournal(directory, name, original) {
  assert.match(name, /^[a-z0-9_-]+$/);
  const folder = path.join(directory, 'private', 'recovery');
  fs.mkdirSync(folder, { recursive: true });
  const file = path.join(folder, name + '.jsonl');
  const write = (event, data, flags) => {
    const descriptor = fs.openSync(file, flags, 0o600);
    try { fs.writeFileSync(descriptor, JSON.stringify({ event, at: new Date().toISOString(), data }) + '\n'); fs.fsyncSync(descriptor); }
    finally { fs.closeSync(descriptor); }
  };
  write('original', original, 'wx');
  return (event, data) => write(event, data, 'a');
}
