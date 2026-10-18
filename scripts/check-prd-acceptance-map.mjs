import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const [prdPath, mappingPath, reportPath] = process.argv.slice(2);
assert.ok(prdPath && mappingPath && reportPath, 'PRD, mapping and a new evidence report path are required');
const repository = await fs.realpath(root);
const evidence = path.join(repository, '.cloudflow-runtime/prd-acceptance-map');
await fs.mkdir(evidence, { recursive: true });
assert.equal(await fs.realpath(evidence), evidence, 'Evidence directory must not be redirected');
const report = path.resolve(root, reportPath);
assert.equal(await fs.realpath(path.dirname(report)), evidence, 'Write only into .cloudflow-runtime/prd-acceptance-map');
const describe = async filename => {
  const full = await fs.realpath(path.resolve(root, filename));
  assert.ok(full.startsWith(repository + path.sep), 'Only repository evidence is accepted');
  const bytes = await fs.readFile(full);
  return { path: path.relative(root, full).replaceAll('\\', '/'), sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length, text: bytes.toString('utf8') };
};
const prd = await describe(prdPath);
const mapping = await describe(mappingPath);
const entries = text => [...text.matchAll(/^\|\s*(AC-\d+[A-Z]*)\s*\|(.+)\|\s*$/gm)].map(match => ({ id: match[1], row: match[0] }));
const expected = entries(prd.text);
const actual = entries(mapping.text);
assert.ok(expected.length > 0);
assert.equal(new Set(expected.map(item => item.id)).size, expected.length, 'PRD numbering must be unique');
assert.equal(new Set(actual.map(item => item.id)).size, actual.length, 'Mapping numbering must be unique');
assert.deepEqual(actual.map(item => item.id).sort(), expected.map(item => item.id).sort(), 'Every acceptance entry must be mapped exactly once');
const referenced = [...new Set([...mapping.text.matchAll(/`([^`\r\n]+\.(?:md|log))`/g)].map(match => match[1]))];
// Explicit mappings only: <!-- archived-evidence {"original":"approved-runtime/run.log","document":"docs/design/record.md"} -->
// Archived conclusions never assert that deleted inputs have been revalidated.
const archived = new Map();
for (const match of mapping.text.matchAll(/<!--\s*archived-evidence\s+(\{[^\r\n]+\})\s*-->/g)) {
  const item = JSON.parse(match[1]);
  assert.ok(typeof item.original === 'string' && typeof item.document === 'string' && item.document.endsWith('.md'));
  assert.ok(referenced.includes(item.original), 'Archived evidence must be explicitly referenced in the mapping');
  assert.ok(!archived.has(item.original), 'Archived evidence must have one conclusion document');
  archived.set(item.original, item.document);
}
const references = [];
for (const filename of referenced) {
  if (archived.has(filename)) {
    const { text, ...metadata } = await describe(archived.get(filename));
    assert.ok(/已清理|已删除|已移除/.test(text), 'Archive document must record material cleanup');
    references.push({ path: filename, status: 'archived_not_revalidated', originalMaterialsCleaned: true,
      revalidated: false, conclusionDocument: metadata });
    continue;
  }
  const resolved = filename.includes('/') || filename.includes('\\') ? filename
    : filename.endsWith('.log') ? path.join(evidence, filename) : path.join('docs/design', filename);
  const { text, ...metadata } = await describe(resolved);
  references.push({ ...metadata, status: 'present', revalidated: true });
}
const stripText = ({ text, ...metadata }) => metadata;
await fs.writeFile(report, JSON.stringify({ createdAt: new Date().toISOString(), prd: stripText(prd), mapping: stripText(mapping),
  acceptanceCount: expected.length, entries: actual, references, missing: 0, duplicate: 0,
  numberingAndReferencesOnly: true, businessAcceptanceComplete: false }, null, 2) + '\n', { flag: 'wx' });
console.log(`PRD_ACCEPTANCE_MAP: entries=${expected.length}; missing=0; duplicates=0; references=${references.length}; referenced_files_present=${references.every(item => item.status === 'present')}; archived_not_revalidated=${archived.size}; business_acceptance_complete=false`);
