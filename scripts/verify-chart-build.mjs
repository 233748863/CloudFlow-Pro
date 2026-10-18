import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const frontend = path.join(root, 'cloudflow-frontend');
const requireFrontend = createRequire(path.join(frontend, 'package.json'));
const ts = requireFrontend('typescript');
const dist = path.join(frontend, 'dist');
const files = await fs.readdir(path.join(dist, 'assets'));
const charts = files.filter(file => /^(chart-vendor|Chart|presets|UserDashboardCharts)-.*\.js$/.test(file));
assert.ok(charts.some(file => file.startsWith('chart-vendor-')), 'Separate chart vendor chunk is required');
let bytes = 0;
for (const file of charts) {
  const gzip = gzipSync(await fs.readFile(path.join(dist, 'assets', file))).length;
  bytes += gzip;
  console.log(`CHART_CHUNK: ${file}; gzip_bytes=${gzip}`);
}
assert.ok(bytes < 350000, 'Chart gzip budget must remain below 350000 bytes');
const html = await fs.readFile(path.join(dist, 'index.html'), 'utf8');
const entry = [...html.matchAll(/<script\b[^>]*src="([^"]+\.js)"/g)].map(match => match[1]);
assert.ok(entry.length > 0);
const visited = new Set();
async function staticDependencies(file) {
  if (visited.has(file)) return;
  visited.add(file);
  const text = await fs.readFile(file, 'utf8');
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  for (const statement of source.statements) {
    if ((ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)) && statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier)) {
      const specifier = statement.moduleSpecifier.text;
      if (specifier.startsWith('.')) await staticDependencies(path.resolve(path.dirname(file), specifier));
    }
  }
}
for (const file of entry) await staticDependencies(path.join(dist, file.replace(/^\//, '')));
assert.ok(![...visited].some(file => /(?:chart-vendor|Chart|presets)-[^/\\]+\.js$/.test(file)), 'App entry must not statically load chart chunks');
const preload = [...html.matchAll(/<link\b[^>]*rel="modulepreload"[^>]*href="([^"]+)"/g)].map(match => match[1]);
assert.ok(!preload.some(file => file.includes('chart-vendor-')), 'App shell must not preload charts');
const serviceWorker = await fs.readFile(path.join(dist, 'sw.js'), 'utf8');
assert.ok(charts.every(file => serviceWorker.includes(file)), 'Local chart artifacts must be in offline precache');
console.log(`A5_CHART_BUILD_RESULT: gzip_bytes=${bytes}; budget_bytes=350000; independent_chunk=true; entry_static_modules=${visited.size}; charts_in_initial_entry=false; offline_precache=true; checks=5`);
