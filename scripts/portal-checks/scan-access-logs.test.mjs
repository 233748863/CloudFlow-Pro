import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import test from 'node:test';
import { ownedAuditLogQuery, scanOwnedAuditLogs, scanSecretStream } from './scan-access-logs.mjs';

test('all byte boundaries preserve split UTF-8 secrets and count each value once', async () => {
  const value = '校验口令_日本語🙂_token';
  const source = Buffer.from(`prefix ${value} suffix ${value} end`);
  for (let boundary = 1; boundary < source.length; boundary++) {
    const result = await scanSecretStream(Readable.from([source.subarray(0, boundary), source.subarray(boundary)]), [value, value, 'absent']);
    assert.deepEqual(result, { bytes: source.length, sensitiveValues: 2, leaks: 1 });
  }
});

test('single-byte chunks find overlapping values across arbitrary boundaries', async () => {
  const source = Buffer.from('before ABCDEF after');
  const result = await scanSecretStream(Readable.from([...source].map(value => Buffer.from([value]))), ['ABCDEF', 'CDE', 'F']);
  assert.deepEqual(result, { bytes: source.length, sensitiveValues: 3, leaks: 3 });
});

test('streams more than one MiB without truncating a secret at the end', async () => {
  const chunk = Buffer.alloc(65536, 120);
  const chunks = [...Array.from({ length: 33 }, () => chunk), Buffer.from('tail-secret')];
  assert.deepEqual(await scanSecretStream(Readable.from(chunks), ['tail-secret']), { bytes: 2162699, sensitiveValues: 1, leaks: 1 });
});

test('clean and empty streams report no leak', async () => {
  assert.deepEqual(await scanSecretStream(Readable.from(['safe']), ['absent']), { bytes: 4, sensitiveValues: 1, leaks: 0 });
  assert.deepEqual(await scanSecretStream(Readable.from([]), ['absent']), { bytes: 0, sensitiveValues: 1, leaks: 0 });
});

test('failed input cannot be reported as a clean scan', async () => {
  const source = Readable.from((async function* () { yield 'safe'; throw new Error('input failed'); })());
  await assert.rejects(scanSecretStream(source, ['absent']), /input failed/);
  await assert.rejects(scanSecretStream(Readable.from([]), ['']));
});

test('audit queries preserve large integer cursors and every column of all three tables', () => {
  assert.equal(ownedAuditLogQuery({ log: '0', error: '9007199254740993', audit: '9223372036854775807' }),
    'SELECT * FROM sys_log WHERE log_id>0;\n'
    + 'SELECT * FROM sys_api_error_log WHERE error_id>9007199254740993;\n'
    + 'SELECT * FROM sys_audit_log WHERE audit_id>9223372036854775807;\n');
});

test('audit cursors reject injection, incomplete boundaries and imprecise number conversion', () => {
  const valid = { log: '1', error: '2', audit: '3' };
  for (const key of Object.keys(valid)) {
    for (const value of [undefined, null, 0, 9007199254740992, '', '-1', '1.0', '1e3', ' 1', '01', '1; SELECT 1']) {
      assert.throws(() => ownedAuditLogQuery({ ...valid, [key]: value }));
    }
  }
  assert.throws(() => ownedAuditLogQuery());
});

test('audit scans reject stopped state and invalid local ports before starting a client', async () => {
  const boundaries = { log: '0', error: '0', audit: '0' };
  await assert.rejects(scanOwnedAuditLogs({ mysqlPort: 57701, status: 'STOPPED' }, ['absent'], boundaries));
  for (const port of [0, 1024, 65536, '57701', 57701.5]) {
    await assert.rejects(scanOwnedAuditLogs({ mysqlPort: port, status: 'RUNNING' }, ['absent'], boundaries));
  }
});
