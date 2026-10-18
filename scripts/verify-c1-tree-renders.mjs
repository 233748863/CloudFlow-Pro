import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const frontend = path.join(root, 'cloudflow-frontend');
const requireFrontend = createRequire(path.join(frontend, 'package.json'));
const requireBrowser = createRequire(path.join(root, '.cloudflow-runtime/playwright/package.json'));
const { createServer } = await import(pathToFileURL(requireFrontend.resolve('vite')).href);
const { chromium } = requireBrowser('playwright-core');
const [round, build, mode = 'observe'] = process.argv.slice(2);
assert.match(round || '', /^r[1-9][0-9]*$/); assert.match(build || '', /^r[1-9][0-9]*$/); assert.ok(['observe', 'enforce'].includes(mode));
const evidence = path.join(root, '.cloudflow-runtime/full-prd-20260915/approved-runtime');
const output = path.join(evidence, `c1-tree-renders-20261005-${round}`); await fs.mkdir(output);
const hash = async filename => createHash('sha256').update(await fs.readFile(path.resolve(root, filename))).digest('hex').toUpperCase();
const inputs = JSON.parse((await fs.readFile(path.join(evidence, `h3-portal-finance-20261002-frontend-${build}-inputs.json`), 'utf8')).replace(/^\uFEFF/, ''));
for (const Path of ['scripts/verify-c1-tree-renders.mjs', 'scripts/form-checks/FormTreeRenderCheck.tsx']) inputs.push({ Path, Hash: await hash(Path) });
const verifyInputs = async () => { for (const input of inputs) assert.equal(await hash(input.Path), input.Hash.toUpperCase(), 'Tree render input changed'); };
await verifyInputs(); await fs.writeFile(path.join(output, 'inputs.json'), JSON.stringify(inputs, null, 2));
const server = await createServer({ root: frontend, configFile: path.join(frontend, 'vite.config.ts'), logLevel: 'error', server: { host: '127.0.0.1', port: 0, strictPort: true, fs: { allow: [root] } } });
const pageErrors = [], blockedRequests = [], samples = [];
let browser, page, failure, dependenciesUpdate = false;
try {
  await server.listen(); const origin = 'http://127.0.0.1:' + server.httpServer.address().port;
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1365, height: 920 }, serviceWorkers: 'block' });
  await context.routeWebSocket('**/*', socket => socket.close());
  await context.route('**/*', route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== origin || !['GET', 'HEAD'].includes(request.method()) || url.pathname.startsWith('/api/')) {
      blockedRequests.push({ method: request.method(), path: url.pathname }); return route.abort();
    }
    if (url.pathname === '/tree-check') {
      const entry = '/@fs/' + path.join(root, 'scripts/form-checks/FormTreeRenderCheck.tsx').replaceAll('\\', '/');
      return route.fulfill({ contentType: 'text/html', body: `<html lang="zh-CN"><head><meta name="viewport" content="width=device-width,initial-scale=1"><script type="module">import RefreshRuntime from '/@react-refresh';RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;</script></head><body><div id="root"></div><script type="module" src="${entry}"></script></body></html>` });
    }
    return route.continue();
  });
  page = await context.newPage(); page.on('pageerror', error => pageErrors.push(error.name));
  await page.goto(origin + '/tree-check'); await page.locator('#input-person').waitFor();
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  for (let index = 0; index < 4; index++) {
    const before = await page.evaluate(() => ({ ...window.treeRenderObservations }));
    await page.locator('#field-collapse summary').click();
    await page.waitForFunction(commits => window.treeRenderObservations.commits > commits, before.commits);
    const after = await page.evaluate(() => ({ ...window.treeRenderObservations }));
    samples.push({ index, referenceRenders: after.referenceRenders - before.referenceRenders });
  }
  await page.locator('#input-other').fill('丙');
  await page.waitForFunction(() => document.querySelector('#input-person')?.getAttribute('data-peer-value') === '丙');
  dependenciesUpdate = (await page.locator('#input-person').inputValue()) === '甲'
    && JSON.parse(await page.getByTestId('values').textContent()).other === '丙';
  assert.ok(dependenciesUpdate, 'Shared data must reach dependent fields');
  assert.equal(pageErrors.length, 0); assert.equal(blockedRequests.length, 0);
  if (mode === 'enforce') assert.ok(samples.every(sample => sample.referenceRenders === 0), 'Collapse redraws unchanged descendants');
} catch (error) {
  failure = error;
  await fs.writeFile(path.join(output, 'failure.json'), JSON.stringify({ name: error.name, message: String(error.message).split('\n')[0] }));
} finally {
  if (browser) await browser.close(); await server.close(); await verifyInputs();
  const redundantRenders = samples.reduce((sum, sample) => sum + sample.referenceRenders, 0);
  await fs.writeFile(path.join(output, 'result.json'), JSON.stringify({ passed: !failure, scope: 'COMPONENT_ONLY', mode, samples, redundantRenders, dependenciesUpdate, pageErrors, blockedRequests, businessDatabaseWrites: 0, inputs: inputs.length }, null, 2));
  console.log(`C1_TREE_RENDERS: mode=${mode}; toggles=${samples.length}; redundant_reference_renders=${redundantRenders}; dependencies_update=${dependenciesUpdate}; passed=${!failure}; inputs=${inputs.length}; business_database_writes=0`);
}
if (failure) throw failure;
