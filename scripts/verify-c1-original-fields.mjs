import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const frontend = path.join(root, 'cloudflow-frontend');
const frontendRequire = createRequire(path.join(frontend, 'package.json'));
const browserRequire = createRequire(path.join(root, '.cloudflow-runtime/playwright/package.json'));
const { createServer } = await import(pathToFileURL(frontendRequire.resolve('vite')).href);
const { chromium, devices } = browserRequire('playwright-core');
const [round, build] = process.argv.slice(2);
assert.match(round || '', /^r[1-9][0-9]*$/); assert.match(build || '', /^r[1-9][0-9]*$/);
const evidence = path.join(root, '.cloudflow-runtime/full-prd-20260915/approved-runtime');
const output = path.join(evidence, `c1-original-fields-20261005-${round}`); await fs.mkdir(output);
const hash = async name => createHash('sha256').update(await fs.readFile(path.join(root, name))).digest('hex').toUpperCase();
const inputs = JSON.parse((await fs.readFile(path.join(evidence, `h3-portal-finance-20261002-frontend-${build}-inputs.json`), 'utf8')).replace(/^\uFEFF/, ''));
for (const Path of ['scripts/verify-c1-original-fields.mjs', 'scripts/form-checks/FormOriginalFieldsCheck.tsx']) inputs.push({ Path, Hash: await hash(Path) });
const assertInputs = async () => { for (const input of inputs) assert.equal(await hash(input.Path), input.Hash.toUpperCase(), 'Original field input changed'); };
await assertInputs(); await fs.writeFile(path.join(output, 'inputs.json'), JSON.stringify(inputs, null, 2));
const server = await createServer({ root: frontend, configFile: path.join(frontend, 'vite.config.ts'), logLevel: 'error', server: { host: '127.0.0.1', port: 0, strictPort: true, fs: { allow: [root] } } });
const checks = [], pageErrors = [], requests = [], observations = [];
let browser, activePage, failure;
const check = (label, passed) => { checks.push({ label, passed: Boolean(passed) }); console.log(`${passed ? 'PASS' : 'FAIL'} C1_ORIGINAL ${label}`); };
const expectedDefaults = { text: '文字默认值', number: 1234.5, date: '2026-10-05', select: '乙', textarea: '第一行\n第二行', employee: '100', dept: '101', post: '102', position: '103' };
try {
  await server.listen(); const origin = 'http://127.0.0.1:' + server.httpServer.address().port;
  browser = await chromium.launch({ headless: true });
  for (const device of ['desktop', 'mobile']) {
    const context = await browser.newContext(device === 'mobile' ? { ...devices['Pixel 5'], viewport: { width: 390, height: 844 }, timezoneId: 'America/Los_Angeles', serviceWorkers: 'block' } : { viewport: { width: 1440, height: 1000 }, timezoneId: 'Asia/Shanghai', serviceWorkers: 'block' });
    await context.routeWebSocket('**/*', socket => socket.close());
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin !== origin || !['GET', 'HEAD'].includes(request.method()) || url.pathname.startsWith('/api/')) { requests.push({ method: request.method(), path: url.pathname }); return route.abort(); }
      if (url.pathname === '/c1-original') {
        const entry = '/@fs/' + path.join(root, 'scripts/form-checks/FormOriginalFieldsCheck.tsx').replaceAll('\\', '/');
        return route.fulfill({ contentType: 'text/html', body: `<html lang="zh-CN"><head><meta name="viewport" content="width=device-width,initial-scale=1"><script type="module">import RefreshRuntime from '/@react-refresh';RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;</script></head><body><div id="root"></div><script type="module" src="${entry}"></script></body></html>` });
      }
      return route.continue();
    });
    const page = await context.newPage(); activePage = page;
    page.on('pageerror', error => pageErrors.push({ device, name: error.name }));
    const tap = locator => device === 'mobile' ? locator.tap() : locator.click();
    const open = async scenario => {
      await page.goto(origin + '/c1-original?scenario=' + scenario); await page.locator('#field-position').waitFor();
      await page.locator('#field-position [role="status"]').waitFor({ state: 'hidden' });
    };
    const snapshot = async () => { await tap(page.getByRole('button', { name: '检查当前值', exact: true })); return JSON.parse(await page.getByTestId('current-values').textContent()); };
    const visibleValue = id => page.locator('#field-' + id + ' > div').innerText();
    await open('defaults');
    const defaults = await snapshot();
    for (const [id, value] of Object.entries(expectedDefaults)) check(`${device}_${id}_configured_default`, defaults[id] === value);
    check(`${device}_text_number_textarea_defaults_visible`, await page.locator('#input-text').inputValue() === expectedDefaults.text && await page.locator('#input-number').inputValue() === '1234.5' && await page.locator('#input-textarea').inputValue() === expectedDefaults.textarea);
    for (const id of ['employee', 'dept', 'post', 'position']) check(`${device}_${id}_field_readonly_uses_saved_name`, await visibleValue(id) === id + '历史名称' && await page.locator('#field-' + id).locator('input,button').count() === 0);
    await page.locator('#input-text').fill('修改后文字'); await page.locator('#input-number').fill('0'); await page.locator('#input-textarea').fill('修改后说明');
    await tap(page.locator('#input-select')); await tap(page.getByText('甲', { exact: true }));
    const edited = await snapshot();
    check(`${device}_edits_override_defaults_and_keep_zero`, edited.text === '修改后文字' && edited.number === 0 && edited.textarea === '修改后说明' && edited.select === '甲');
    await page.locator('#input-text').fill('');
    check(`${device}_clearing_does_not_refill_default`, (await snapshot()).text === '' && await page.locator('#input-text').inputValue() === '');
    await tap(page.getByRole('button', { name: '切换只读', exact: true }));
    check(`${device}_global_readonly_removes_edit_controls`, await page.locator('[id^="field-"]').locator('input,textarea,button').count() === 0);
    check(`${device}_readonly_toggle_preserves_values`, (await snapshot()).number === 0 && await visibleValue('text') === '未填写');
    await tap(page.getByRole('button', { name: '切换只读', exact: true }));
    await tap(page.getByRole('button', { name: '切换新版本', exact: true }));
    check(`${device}_new_version_uses_new_default`, await page.locator('#input-text').inputValue() === '新版默认值');
    await open('empty');
    const empty = await snapshot();
    check(`${device}_explicit_empty_null_zero_override_defaults`, empty.text === '' && empty.number === 0 && empty.date === null && empty.select === '' && empty.textarea === '');
    await open('readonly');
    observations.push({ device, scenario: 'readonly', number: await visibleValue('number'), date: await visibleValue('date') });
    check(`${device}_readonly_number_retains_original_grouping`, await visibleValue('number') === '1,234.5');
    check(`${device}_readonly_date_retains_original_format`, await visibleValue('date') === '2026/10/05');
    const after = await snapshot();
    check(`${device}_readonly_format_does_not_change_data`, Object.entries(expectedDefaults).every(([id, value]) => after[id] === value));
    await page.screenshot({ path: path.join(output, device + '-readonly.png'), fullPage: true });
    await open('fallback');
    for (const [index, id] of ['employee', 'dept', 'post', 'position'].entries()) {
      const displayed = await visibleValue(id); observations.push({ device, scenario: 'fallback', id, displayed });
      check(`${device}_${id}_missing_name_retains_original_id`, displayed === String(100 + index));
    }
    await open('precision');
    check(`${device}_configured_precision_and_large_number_display`, await visibleValue('number') === '9,007,199,254,740,993.125');
    check(`${device}_formatted_large_number_keeps_exact_data`, (await snapshot()).number === '9007199254740993.125');
    await context.close();
  }
  check('no_browser_exceptions', pageErrors.length === 0); check('readonly_references_issue_no_business_requests', requests.length === 0);
  assert.ok(checks.every(item => item.passed), 'Original field component requirements failed');
} catch (error) {
  failure = error;
  if (activePage && !activePage.isClosed()) await activePage.screenshot({ path: path.join(output, 'failure.png') }).catch(() => undefined);
} finally {
  await browser?.close(); await server.close();
  try { await assertInputs(); } catch (error) { failure = error; }
  await fs.writeFile(path.join(output, 'result.json'), JSON.stringify({ passed: !failure, componentOnly: true, frontendBuild: build, checks, observations, pageErrors, businessRequests: requests, inputs: inputs.length, failure: failure?.message, wholeC1Acceptance: false }, null, 2));
  console.log('C1_ORIGINAL_FIELDS: ' + JSON.stringify({ passed: !failure, checks: checks.length, failedChecks: checks.filter(item => !item.passed).length, inputs: inputs.length, componentOnly: true, pageErrors: pageErrors.length, businessRequests: requests.length }));
}
if (failure) throw failure;
