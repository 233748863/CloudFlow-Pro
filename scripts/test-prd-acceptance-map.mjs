import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = await fs.realpath(fileURLToPath(new URL('../', import.meta.url)));
const evidence = path.join(root, '.cloudflow-runtime/prd-acceptance-map');
await fs.mkdir(evidence, { recursive: true });
assert.equal(await fs.realpath(evidence), evidence, 'Evidence directory must not be redirected');
const id = randomUUID().replaceAll('-', '');
const owned = path.join(evidence, id);
await fs.mkdir(owned);
const reports = [];
const passed = [];
const document = path.join(root, 'docs/design/A2-全项验收映射-20261016.md');
const free = async () => { const value = await fs.statfs(root); return value.bavail * value.bsize; };
const before = await free();
const relative = filename => path.relative(root, filename).split(path.sep).join('/');
const write = async (name, text) => {
  const filename = path.join(owned, name);
  await fs.writeFile(filename, text, { flag: 'wx' });
  return relative(filename);
};
const run = (prd, mapping, report) => spawnSync(process.execPath,
  ['scripts/check-prd-acceptance-map.mjs', prd, mapping, relative(report)],
  { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 20000 });
const report = name => { const filename = path.join(evidence, id + '-' + name + '.json'); reports.push(filename); return filename; };
const check = async (name, prd, mapping, success, expectedError) => {
  const output = report(name);
  const result = run(prd, mapping, output);
  assert.equal(result.error, undefined, name);
  assert.equal(result.status === 0, success, name + ': ' + result.stderr);
  if (expectedError) assert.ok(result.stderr.includes(expectedError), name + ': expected precise failure');
  if (success) {
    const value = JSON.parse(await fs.readFile(output, 'utf8'));
    assert.equal(value.businessAcceptanceComplete, false);
    assert.equal(value.numberingAndReferencesOnly, true);
    assert.equal(value.missing, 0);
    return value;
  }
  await assert.rejects(fs.access(output));
  return null;
};
let failure;
try {
  const prd = await write('prd.md', '| AC-1 | requirement | pass |\n');
  const normal = await write('normal.md', '| AC-1 | code | pending |\n');
  const actual = await check('actual-a2', 'docs/prd/A2-SYS-01-统一消息中心-PRD.md',
    'docs/design/A2-全项验收映射-20261016.md', true);
  assert.equal(actual.acceptanceCount, 26);
  passed.push('actual A2 maps all 26 unique acceptance IDs');
  const plain = await check('normal', prd, normal, true);
  assert.equal(plain.acceptanceCount, 1);
  passed.push('normal current mapping succeeds without historical runtime');
  const missing = relative(path.join(owned, 'deleted.log'));
  const conclusion = await write('conclusion.md', '原材料 ' + missing + ' 已清理；保留历史结论，未重新校验。\n');
  const archived = await write('archived.md', '| AC-1 | code | `' + missing + '` |\n'
    + '<!-- archived-evidence ' + JSON.stringify({ original: missing, document: conclusion }) + ' -->\n');
  const value = await check('archived', prd, archived, true);
  assert.equal(value.references.length, 1);
  assert.equal(value.references[0].status, 'archived_not_revalidated');
  assert.equal(value.references[0].originalMaterialsCleaned, true);
  assert.equal(value.references[0].revalidated, false);
  assert.equal(value.references[0].conclusionDocument.path, conclusion);
  assert.match(value.references[0].conclusionDocument.sha256, /^[0-9a-f]{64}$/);
  passed.push('deleted evidence uses hashed conclusion and explicit not-revalidated state');
  const cases = [
    ['missing-reference', '| AC-1 | code | `' + missing + '` |\n', 'ENOENT'],
    ['wrong-number', '| AC-2 | code | pending |\n', 'Every acceptance entry must be mapped exactly once'],
    ['duplicate-number', '| AC-1 | code | pending |\n| AC-1 | code | pending |\n', 'Mapping numbering must be unique'],
    ['unused-archive', '| AC-1 | code | pending |\n<!-- archived-evidence ' + JSON.stringify({ original: missing, document: conclusion }) + ' -->', 'Archived evidence must be explicitly referenced'],
    ['missing-conclusion', '| AC-1 | code | `' + missing + '` |\n<!-- archived-evidence ' + JSON.stringify({ original: missing, document: relative(path.join(owned, 'absent.md')) }) + ' -->', 'ENOENT'],
    ['duplicate-archive', (await fs.readFile(path.resolve(root, archived), 'utf8')) + '<!-- archived-evidence ' + JSON.stringify({ original: missing, document: conclusion }) + ' -->', 'Archived evidence must have one conclusion document'],
  ];
  const unrecorded = await write('unrecorded.md', '历史运行曾经通过。');
  cases.push(['unrecorded-cleanup', '| AC-1 | code | `' + missing + '` |\n<!-- archived-evidence '
    + JSON.stringify({ original: missing, document: unrecorded }) + ' -->', 'Archive document must record material cleanup']);
  for (const [name, text, expected] of cases) {
    await check(name, prd, await write(name + '.md', text), false, expected);
    passed.push(name + ' rejected');
  }
  const duplicatePrd = await write('duplicate-prd.md', '| AC-1 | x | y |\n| AC-1 | x | y |\n');
  await check('duplicate-prd', duplicatePrd, normal, false, 'PRD numbering must be unique');
  passed.push('duplicate PRD numbering rejected');
  const immutable = report('immutable');
  assert.equal(run(prd, normal, immutable).status, 0);
  const original = await fs.readFile(immutable, 'utf8');
  const repeated = run(prd, normal, immutable);
  assert.notEqual(repeated.status, 0);
  assert.ok(repeated.stderr.includes('EEXIST'));
  assert.equal(await fs.readFile(immutable, 'utf8'), original);
  passed.push('existing report protected against overwrite');
  const outsideReport = path.join(owned, 'disallowed-report.json');
  const outside = run(prd, normal, outsideReport);
  assert.notEqual(outside.status, 0);
  assert.ok(outside.stderr.includes('Write only into'));
  await assert.rejects(fs.access(outsideReport));
  passed.push('report outside exact evidence directory rejected');
} catch (error) {
  failure = error;
} finally {
  const files = [...reports, ...(await fs.readdir(owned)).map(name => path.join(owned, name))];
  let bytes = 0;
  const existing = [];
  for (const filename of files) {
    assert.ok(filename.startsWith(evidence + path.sep));
    let stat;
    try { stat = await fs.lstat(filename); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    assert.ok(stat.isFile() && !stat.isSymbolicLink(), 'Only owned plain files may be removed');
    assert.equal(await fs.realpath(filename), filename);
    const tracked = spawnSync('git', ['ls-files', '--', relative(filename)], { cwd: root, encoding: 'utf8', windowsHide: true });
    assert.equal(tracked.status, 0);
    assert.equal(tracked.stdout.trim(), '', 'Tracked files protected');
    bytes += stat.size; existing.push(filename);
  }
  assert.equal(await fs.realpath(owned), owned);
  const result = { passed: !failure, assertions: passed.length, checks: passed, failure: failure?.message,
    reportDirectory: relative(owned), files: existing.length, logicalBytes: bytes, freeBefore: before,
    scope: 'numbering references archive handling and report boundaries only', businessAcceptanceComplete: false };
  await fs.appendFile(document, '\n\n' + new Date().toISOString() + ' 验收映射检查脚本验证：' + JSON.stringify(result)
    + '。子进程均已结束；已核实自有路径、链接和受控文件边界，结论归档后清理报告及测试输入。\n');
  for (const filename of existing) await fs.unlink(filename);
  await fs.rmdir(owned);
  result.freeAfter = await free();
  await fs.appendFile(document, '映射检查清理完成：' + JSON.stringify({ files: existing.length, logicalBytes: bytes,
    freeBefore: before, freeAfter: result.freeAfter, deleted: true }) + '；磁盘差值不归因于本项目。\n');
  console.log(JSON.stringify(result));
}
if (failure) throw failure;
