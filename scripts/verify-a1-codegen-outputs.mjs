import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { verifyA1CodegenTemplates } from './verify-a1-codegen-templates.mjs';
import { verifyA1CodegenBoundaries } from './verify-a1-codegen-boundaries.mjs';

export async function verifyA1CodegenOutputs(ctx) {
  const { admin, api, get, post, check, evidence, generatedRoot, codegenSupplier } = ctx;
  await verifyA1CodegenTemplates(ctx);
  const tableId = codegenSupplier.tableId;
  const base = '/auth/system/codegen/' + tableId;
  const detail = await get('/auth/system/codegen/' + tableId);
  const files = await get(base + '/preview');
  const product = await ctx.retainGenerated('download-supplier', detail, files);
  const receiptPath = path.join(product.root, 'product-receipt.json');
  await fs.writeFile(receiptPath, JSON.stringify(product, null, 2), { flag: 'wx' });
  const token = await admin.evaluate(async () => (await import('/src/utils/authStorage.ts')).getAuthToken());
  assert.ok(token);
  const response = await admin.context().request.get(ctx.origin + '/api' + base + '/download', {
    headers: { Authorization: token.startsWith('Bearer ') ? token : 'Bearer ' + token },
  });
  const responseHeaders = response.headers();
  const bytes = await response.body();
  ctx.requests.push({ path: base + '/download', method: 'GET', status: response.status(),
    traceId: responseHeaders['x-trace-id'] });
  check('AC-2/10 当前真实登录下载ZIP成功', response.status() === 200 && bytes.length > 0
    && responseHeaders['content-disposition']?.includes('.zip'));
  const zipPath = path.join(ctx.directory, 'a1-codegen-download-' + ctx.caseTag + '.zip');
  await fs.writeFile(zipPath, bytes, { flag: 'wx' });
  const inspected = spawnSync('python', [path.resolve('scripts/codegen-checks/inspect-codegen-zip.py'), zipPath, receiptPath],
    { encoding: 'utf8', windowsHide: true, timeout: 30000, maxBuffer: 4 * 1024 * 1024 });
  assert.equal(inspected.status, 0, 'Actual codegen ZIP contents did not match retained previews: ' + inspected.stderr);
  const zipObservation = JSON.parse(inspected.stdout);
  check('AC-2/10 实际下载逐文件字节与原预览完全一致', zipObservation.passed
    && zipObservation.allFilesMatchOriginalPreview && zipObservation.files.length === Object.keys(files).length);
  await fs.writeFile(path.join(ctx.directory, 'a1-zip-observations-' + ctx.caseTag + '.json'), JSON.stringify({
    actualGateway: true, actualLogin: true, path: zipPath,
    hash: createHash('sha256').update(bytes).digest('hex'), originalPreview: product, result: zipObservation,
  }, null, 2), { flag: 'wx' });
  evidence.download = true;
  await verifyWrites(ctx, base, files);
  await verifyA1CodegenBoundaries(ctx, base, files);
}

async function verifyWrites(ctx, base, files) {
  const { admin, api, post, check, evidence, generatedRoot } = ctx;
  const targetRoot = 'a1-write-' + ctx.caseTag;
  const expectedPaths = Object.keys(files).map(name => targetRoot + '/' + name).sort();
  const written = await post(base + '/write', { targetRoot, confirmOverwrite: false });
  check('AC-8 首次写盘完整写入实际预览文件', JSON.stringify([...written.written].sort()) === JSON.stringify(expectedPaths)
    && written.skipped.length === 0 && written.overwritten.length === 0);
  const existingFile = path.join(generatedRoot, expectedPaths[0]);
  assert.ok((await fs.realpath(existingFile)).startsWith(generatedRoot + path.sep));
  await fs.writeFile(existingFile, 'A1_EXISTING_' + ctx.caseTag);
  const beforeRepeat = await ctx.generatedFileSnapshot();
  const skipped = await post(base + '/write', { targetRoot, confirmOverwrite: false });
  check('AC-8 默认写盘跳过全部已存在文件并保持原字节', skipped.written.length === 0 && skipped.overwritten.length === 0
    && JSON.stringify([...skipped.skipped].sort()) === JSON.stringify(expectedPaths)
    && JSON.stringify(await ctx.generatedFileSnapshot()) === JSON.stringify(beforeRepeat));
  const overwritten = await post(base + '/write', { targetRoot, confirmOverwrite: true });
  check('AC-8 明确确认后覆盖清单与实际文件一一对应', overwritten.written.length === 0 && overwritten.skipped.length === 0
    && JSON.stringify([...overwritten.overwritten].sort()) === JSON.stringify(expectedPaths));
  for (const [relative, content] of Object.entries(files)) {
    check('AC-8 确认覆盖后文件内容匹配预览 ' + relative,
      await fs.readFile(path.join(generatedRoot, targetRoot, relative), 'utf8') === content);
  }
  evidence.diskWrites = true;
}
