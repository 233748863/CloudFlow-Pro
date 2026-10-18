import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

export async function verifyA1CodegenBoundaries(ctx, base, files) {
  const { admin, api, post, check, generatedRoot, directory, caseTag } = ctx;
  assert.equal(await fs.realpath(generatedRoot), await fs.realpath(ctx.state.codegenFixture.directory));
  assert.equal(path.dirname(generatedRoot), await fs.realpath(directory));
  const observations = [];
  const before = JSON.stringify(await ctx.generatedFileSnapshot());
  const invalidTargets = ['', ' ', '../a1-outside', 'safe/../../a1-outside', '..\\a1-outside',
    path.join(directory, 'a1-absolute-' + caseTag), 'DB', 'db', 'config', '.git', 'target', 'bad\0path'];
  for (const targetRoot of invalidTargets) {
    const response = await api(admin, base + '/write', { method: 'POST', body: { targetRoot, confirmOverwrite: true } });
    const rejected = [400, 403].includes(response.status)
      || response.status === 200 && [400, 403].includes(response.body?.code);
    check('AC-8 真实写盘拒绝不安全路径 ' + JSON.stringify(targetRoot), rejected);
    check('AC-8 路径拒绝保持全部已生成文件 ' + JSON.stringify(targetRoot),
      JSON.stringify(await ctx.generatedFileSnapshot()) === before);
    observations.push({ kind: 'invalid-target', targetRoot, status: response.status, code: response.body?.code, rejected });
  }
  const outside = path.join(directory, 'a1-owned-outside-' + caseTag);
  const protectedRoot = path.join(generatedRoot, 'DB');
  const safeRoot = path.join(generatedRoot, 'a1-safe-link-target-' + caseTag);
  for (const target of [outside, protectedRoot, safeRoot]) await fs.mkdir(target, { recursive: true });
  const sentinel = 'A1_BOUNDARY_' + caseTag;
  await fs.writeFile(path.join(outside, 'sentinel.txt'), sentinel, { flag: 'wx' });
  await fs.writeFile(path.join(protectedRoot, 'sentinel.txt'), sentinel, { flag: 'wx' });
  for (const [label, target, allowed] of [['outside', outside, false], ['protected', protectedRoot, false], ['inside', safeRoot, true]]) {
    const aliasName = 'a1-' + label + '-link-' + caseTag;
    const alias = path.join(generatedRoot, aliasName);
    await fs.symlink(target, alias, process.platform === 'win32' ? 'junction' : 'dir');
    try {
      assert.equal(await fs.realpath(alias), await fs.realpath(target));
      if (allowed) {
        const written = await post(base + '/write', { targetRoot: aliasName, confirmOverwrite: false });
        const expected = Object.keys(files).map(relative => aliasName + '/' + relative).sort();
        check('AC-8 根目录内安全目录链接允许真实写盘并保留请求路径',
          JSON.stringify([...written.written].sort()) === JSON.stringify(expected)
          && written.skipped.length === 0 && written.overwritten.length === 0);
        for (const [relative, content] of Object.entries(files)) {
          check('AC-8 安全目录链接实际文件内容 ' + relative, await fs.readFile(path.join(safeRoot, relative), 'utf8') === content);
        }
        observations.push({ kind: 'directory-link', label, allowed: true, actualTarget: target, written: written.written });
      } else {
        const response = await api(admin, base + '/write', { method: 'POST', body: { targetRoot: aliasName, confirmOverwrite: true } });
        const rejected = [400, 403].includes(response.status)
          || response.status === 200 && [400, 403].includes(response.body?.code);
        check('AC-8 真实写盘拒绝' + label + '目录链接', rejected);
        check('AC-8 被拒绝目录仅保留原哨兵文件 ' + label,
          JSON.stringify(await fs.readdir(target)) === JSON.stringify(['sentinel.txt'])
          && await fs.readFile(path.join(target, 'sentinel.txt'), 'utf8') === sentinel);
        observations.push({ kind: 'directory-link', label, allowed: false, actualTarget: target, rejected,
          status: response.status, code: response.body?.code, targetUnchanged: true });
      }
    } finally {
      assert.equal((await fs.lstat(alias)).isSymbolicLink(), true);
      await fs.unlink(alias);
    }
  }
  check('AC-8 真实边界检查保留独立目录外哨兵',
    await fs.readFile(path.join(outside, 'sentinel.txt'), 'utf8') === sentinel
    && JSON.stringify(await fs.readdir(outside)) === JSON.stringify(['sentinel.txt']));
  await fs.writeFile(path.join(directory, 'a1-path-observations-' + caseTag + '.json'),
    JSON.stringify({ actualGateway: true, actualLogin: true, actualFilesystem: true,
      ownedOutsideFixture: outside, observations, concurrentReplacementExecuted: false,
      linuxSymlinkExecuted: process.platform !== 'win32', referenceRuntimeWritten: false }, null, 2), { flag: 'wx' });
  ctx.evidence.pathBoundaries = true;
}
