import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Execute the production function with controlled transport and session boundaries.
const source = readFileSync(new URL('../src/services/api/file.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
let checks = 0;
const token = 'a'.repeat(43);
const context = { bizType: 'PUBLIC', fileId: 12 };
function fixture() {
  let session = 1;
  let access: unknown = { url: `/api/auth/system/file/download?token=${token}`, expiresAt: Date.now() + 300_000 };
  const calls: { url: string; options: Record<string, unknown> }[] = [];
  const remote: { url: string; options: RequestInit }[] = [];
  const saved: { blob: Blob; name: string }[] = [];
  const blob = new Blob(['download bytes']);
  let onRead = () => {};
  let onAccess = () => {};
  let ok = true;
  const compiled = { exports: {} as Record<string, any> };
  const request = { get: async (url: string, options: Record<string, unknown>) => {
    calls.push({ url, options });
    if (calls.length === 1) { onAccess(); return access; }
    onRead(); return blob;
  } };
  vm.runInNewContext(code, { module: compiled, exports: compiled.exports, Blob, URL, DOMException, Date, AbortController,
    require: (name: string) => {
      if (name === './request') return { __esModule: true, default: request };
      if (name === '@/utils/authStorage') return { getAuthSessionVersion: () => session };
      if (name === '@/utils/download') return { downloadBlob: (blob: Blob, name: string) => saved.push({ blob, name }) };
      throw new Error(`Unexpected runtime dependency: ${name}`);
    },
    fetch: async (url: string, options: RequestInit) => { remote.push({ url, options }); onRead(); return { ok, blob: async () => blob }; },
  });
  return { calls, remote, saved, blob, save: (input: unknown, name: string) => compiled.exports.saveAuthorizedFile(input, name) as Promise<void>,
    run: (signal = new AbortController().signal, input: unknown = context) => compiled.exports.downloadAuthorizedFile(input, signal) as Promise<Blob>,
    access: (value: unknown) => { access = value; }, switchSession: () => { session++; },
    afterAccess: (run: () => void) => { onAccess = run; }, afterRead: (run: () => void) => { onRead = run; }, failRemote: () => { ok = false; } };
}
async function check(label: string, run: () => Promise<void>) { await run(); checks++; console.log(`PASS ${label}`); }
await check('LOCAL uses authenticated request and preserves business context', async () => {
  const test = fixture(); assert.equal(await test.run(), test.blob); assert.equal(test.remote.length, 0);
  assert.equal(test.calls[0].url, '/auth/system/file/12/url'); assert.deepEqual(test.calls[0].options.params, context);
  assert.equal(test.calls[1].url, `/auth/system/file/download?token=${token}`); assert.equal(test.calls[1].options.responseType, 'blob');
});
await check('bound reference requests its business file without a fabricated file id', async () => {
  const test = fixture(); const input = { bizType: 'OA_RFQ_INVITATION', bizId: '27', reference: 'oa-file:RFQ_INVITATION:12' };
  assert.equal(await test.run(undefined, input), test.blob);
  assert.equal(test.calls[0].url, '/auth/system/file/url'); assert.deepEqual(test.calls[0].options.params, input);
});
await check('missing reference is refused before issuing a ticket', async () => {
  const test = fixture(); await assert.rejects(test.run(undefined, { bizType: 'OA_RFQ_QUOTATION', bizId: '27', reference: ' ' }), /有效文件/);
  assert.equal(test.calls.length, 0);
});
await check('business download saves only authorized bytes with its supplied name', async () => {
  const test = fixture(); await test.save({ bizType: 'OA_RFQ_QUOTATION', bizId: '27', reference: 'oa-file:RFQ_QUOTATION:12' }, '报价.pdf');
  assert.equal(test.saved.length, 1); assert.equal(test.saved[0].blob, test.blob); assert.equal(test.saved[0].name, '报价.pdf');
});
await check('remote signed URL carries no internal authentication or cookies', async () => {
  const test = fixture(); test.access({ url: 'https://storage.example/file?signature=test', expiresAt: Date.now() + 10000 });
  await test.run(); assert.equal(test.calls.length, 1); assert.equal(test.remote.length, 1);
  assert.equal(test.remote[0].options.credentials, 'omit'); assert.equal(test.remote[0].options.headers, undefined);
  assert.equal(test.remote[0].options.referrerPolicy, 'no-referrer'); assert.equal(test.remote[0].options.cache, 'no-store'); assert.equal(test.remote[0].options.redirect, 'error');
});
await check('public URL supports the declared zero expiry', async () => {
  const test = fixture(); test.access({ url: 'https://storage.example/public', expiresAt: 0 }); await test.run(); assert.equal(test.remote.length, 1);
});
await check('expired and malformed access responses fail before reading bytes', async () => {
  for (const access of [null, {}, { url: '/bad', expiresAt: '300' }, { url: '/bad', expiresAt: Date.now() - 1 }]) {
    const test = fixture(); test.access(access); await assert.rejects(test.run(), /失效/); assert.equal(test.calls.length, 1); assert.equal(test.remote.length, 0);
  }
});
await check('invalid URL schemes, credentials and malformed local tickets are refused', async () => {
  for (const url of ['javascript:alert(1)', 'https://user:password@storage.example/f', '/api/auth/system/file/download?token=bad']) {
    const test = fixture(); test.access({ url, expiresAt: 0 }); await assert.rejects(test.run(), /无效/); assert.equal(test.remote.length, 0);
  }
});
await check('invalid file id is refused before a request', async () => {
  const test = fixture(); await assert.rejects(test.run(undefined, { ...context, fileId: 0 }), /有效文件/); assert.equal(test.calls.length, 0);
});
await check('already cancelled download does not request a ticket', async () => {
  const test = fixture(); const controller = new AbortController(); controller.abort();
  await assert.rejects(test.run(controller.signal), { name: 'AbortError' }); assert.equal(test.calls.length, 0);
});
await check('cancellation after ticket issuance prevents the byte request', async () => {
  const test = fixture(); const controller = new AbortController(); test.afterAccess(() => controller.abort());
  await assert.rejects(test.run(controller.signal), { name: 'AbortError' }); assert.equal(test.calls.length, 1);
});
await check('session change after ticket issuance prevents the byte request', async () => {
  const test = fixture(); test.afterAccess(test.switchSession); await assert.rejects(test.run(), { name: 'AbortError' }); assert.equal(test.calls.length, 1);
});
await check('session change during LOCAL or remote reads discards the result', async () => {
  for (const remote of [false, true]) {
    const test = fixture(); if (remote) test.access({ url: 'https://storage.example/f', expiresAt: 0 });
    test.afterRead(test.switchSession); await assert.rejects(test.run(), { name: 'AbortError' });
  }
});
await check('remote failure produces a fixed message without signed URL', async () => {
  const test = fixture(); test.access({ url: 'https://storage.example/f?signature=test', expiresAt: 0 }); test.failRemote(); await assert.rejects(test.run(), /^Error: 文件下载失败，请重新申请$/);
});
console.log(`FILE_DOWNLOAD_FRONTEND_BASIC: checks=${checks}; failed=0; transport=controlled; http=false; browser=false; artifacts=none`);
