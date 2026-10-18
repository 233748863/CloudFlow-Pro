import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs/promises';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const frontend = path.join(root, 'cloudflow-frontend');
const requireFrontend = createRequire(path.join(frontend, 'package.json'));
const [round, build, mode = 'observe'] = process.argv.slice(2);
assert.match(round || '', /^r[1-9][0-9]*$/); assert.match(build || '', /^r[1-9][0-9]*$/); assert.ok(['observe', 'verify'].includes(mode));
const evidence = path.join(root, '.cloudflow-runtime/full-prd-20260915/approved-runtime');
const output = path.join(evidence, `c2-summary-precision-20261005-${round}`); await fs.mkdir(output);
const hash = async filename => createHash('sha256').update(await fs.readFile(path.resolve(root, filename))).digest('hex').toUpperCase();
const inputs = JSON.parse((await fs.readFile(path.join(evidence, `h3-portal-finance-20261002-frontend-${build}-inputs.json`), 'utf8')).replace(/^\uFEFF/, ''));
for (const Path of ['scripts/verify-c2-summary-precision.mjs', 'scripts/form-checks/C2SummaryPrecisionChecks.ts']) inputs.push({ Path, Hash: await hash(Path) });
const verifyInputs = async () => { for (const input of inputs) assert.equal(await hash(input.Path), input.Hash.toUpperCase(), 'Precision input changed'); };
await verifyInputs(); await fs.writeFile(path.join(output, 'inputs.json'), JSON.stringify(inputs, null, 2));
try {
  const log = execFileSync(process.execPath, [requireFrontend.resolve('tsx/cli'), path.join(root, 'scripts/form-checks/C2SummaryPrecisionChecks.ts'), path.join(output, 'result.json'), mode], { cwd: frontend, encoding: 'utf8', windowsHide: true });
  await fs.writeFile(path.join(output, 'checks.log'), log); process.stdout.write(log);
} catch (error) {
  await fs.writeFile(path.join(output, 'checks.log'), String(error.stdout || '') + String(error.stderr || ''));
  throw new Error('Precision checks did not complete successfully; retained diagnostics');
} finally { await verifyInputs(); }
console.log(`C2_SUMMARY_PRECISION_INPUTS: files=${inputs.length}; changed=0; mode=${mode}; product_modified=false`);
