import assert from 'node:assert/strict';
import { createHash, createHmac, randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export async function readOwnedJobKeys(state) {
  const config = await fs.readFile(path.join(state.run, 'auth/integration.properties'), 'utf8');
  const entries = [...config.matchAll(/^cloudflow\.job\.internal-auth\.keys\.([^=\r\n]+)=([^\r\n]+)$/gm)];
  const keys = Object.fromEntries(entries.map(([, name, value]) => [name, value]));
  assert.ok(entries.length === 5 && new Set(Object.values(keys)).size === 5, 'Five independent owned service credentials required');
  for (const key of Object.values(keys)) assert.ok(Buffer.from(key, 'base64').length === 32, '32-byte service credential required');
  return keys;
}

export function signJobRequest(keys, source, recipient, method, target, body = '', extra = {}, offset = 0) {
  const digest = value => createHash('sha256').update(value).digest('hex');
  const headers = { 'Content-Type': 'application/json', 'X-Inner-Call': 'true', 'X-From-Service': source,
    'X-Tenant-Id': '100000', ...extra, 'X-Job-Target': recipient,
    'X-Job-Timestamp': String(Math.floor(Date.now() / 1000) + offset), 'X-Job-Nonce': randomBytes(16).toString('hex'),
    'X-Job-Body-SHA256': digest(body) };
  const canonical = ['CF-JOB-V1', method, target, source, recipient, headers['X-Tenant-Id'] || '', headers['X-User-Id'] || '',
    digest(headers.Authorization || ''), digest(headers.Cookie || ''), headers['X-Job-Body-SHA256'],
    headers['X-Job-Timestamp'], headers['X-Job-Nonce']].join('\n');
  headers['X-Job-Signature'] = createHmac('sha256', Buffer.from(keys[source], 'base64')).update(canonical).digest('hex');
  return headers;
}
