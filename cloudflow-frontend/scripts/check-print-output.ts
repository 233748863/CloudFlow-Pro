import assert from 'node:assert/strict';
import { downloadPrintOutput, printOutputFormats } from '../src/utils/printOutput';

// 仅检查本次下载生命周期；不启动浏览器、不创建文件或服务。
const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
const originalCreate = URL.createObjectURL;
const originalRevoke = URL.revokeObjectURL;
const events: string[] = [];
let failClick = false;
let downloadedName = '';
const link = {
  href: '', download: '',
  click() { events.push('click'); downloadedName = this.download; if (failClick) throw new Error('download failed'); },
  remove() { events.push('remove'); },
};

try {
  Object.defineProperty(globalThis, 'document', { configurable: true, value: {
    createElement: () => link, body: { appendChild: () => events.push('append') },
  } });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {
    setTimeout: (callback: () => void, delay: number) => { assert.equal(delay, 1000); events.push('timer'); callback(); return 1; },
  } });
  URL.createObjectURL = () => { events.push('create'); return 'blob:print-basic'; };
  URL.revokeObjectURL = url => { assert.equal(url, 'blob:print-basic'); events.push('revoke'); };
  assert.deepEqual(printOutputFormats('HTML'), ['PDF', 'HTML']);
  assert.deepEqual(printOutputFormats('EXCEL'), ['EXCEL', 'PDF']);

  downloadPrintOutput(new Blob(['example']), 'example.pdf');
  assert.equal(downloadedName, 'example.pdf');
  assert.deepEqual(events, ['create', 'append', 'click', 'remove', 'timer', 'revoke']);

  events.length = 0;
  downloadPrintOutput(new File(['example'], 'server-name.xls'), 'fallback.xlsx');
  assert.equal(downloadedName, 'server-name.xls');
  assert.deepEqual(events, ['create', 'append', 'click', 'remove', 'timer', 'revoke']);

  events.length = 0; failClick = true;
  assert.throws(() => downloadPrintOutput(new Blob(['example']), 'example.pdf'), /download failed/);
  assert.deepEqual(events, ['create', 'append', 'click', 'remove', 'timer', 'revoke']);
  process.stdout.write('PrintOutputBasicChecks PASS checks=5\n');
} finally {
  URL.createObjectURL = originalCreate; URL.revokeObjectURL = originalRevoke;
  if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument); else Reflect.deleteProperty(globalThis, 'document');
  if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow); else Reflect.deleteProperty(globalThis, 'window');
}
