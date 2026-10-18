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
const [round, build] = process.argv.slice(2);
assert.match(round || '', /^r[1-9][0-9]*$/); assert.match(build || '', /^r[1-9][0-9]*$/);
const evidence = path.join(root, '.cloudflow-runtime/full-prd-20260915/approved-runtime');
const output = path.join(evidence, `c2-row-renders-20261005-${round}`); await fs.mkdir(output);
const hash = async filename => createHash('sha256').update(await fs.readFile(path.resolve(root, filename))).digest('hex').toUpperCase();
const inputs = JSON.parse((await fs.readFile(path.join(evidence, `h3-portal-finance-20261002-frontend-${build}-inputs.json`), 'utf8')).replace(/^\uFEFF/, ''));
for (const Path of ['scripts/verify-c2-row-renders.mjs', 'scripts/form-checks/FormSubTableRenderCheck.tsx']) inputs.push({ Path, Hash: await hash(Path) });
const verifyInputs = async () => { for (const input of inputs) assert.equal(await hash(input.Path), input.Hash.toUpperCase(), 'Row render input changed'); };
await verifyInputs(); await fs.writeFile(path.join(output, 'inputs.json'), JSON.stringify(inputs, null, 2));
const instrumented = new Set();
const instrument = {
  name: 'c2-observe-component-execution', enforce: 'pre',
  async load(id) {
    const file = id.replaceAll('\\', '/').split('?')[0];
    if (!['FormSubTable', 'FormScalarControl'].some(name => file.endsWith(`/src/components/form-renderer/${name}.tsx`))) return;
    let code = await fs.readFile(file, 'utf8');
    const inject = (anchor, observation) => {
      assert.equal(code.split(anchor).length, 2, 'Unique component execution anchor required');
      code = code.replace(anchor, anchor + '\n' + observation + '\n');
    };
    if (file.endsWith('/src/components/form-renderer/FormSubTable.tsx')) {
      inject('const RowFields = memo(function RowFields({ row, index, context, errors }: RowProps) {', "window.__c2Record('RowFields', String(row._rowId), index);");
      inject('const TableRow = memo(function TableRow(props: RowProps) {', "window.__c2Record('TableRow', String(props.row._rowId), props.index);");
      instrumented.add('FormSubTable'); return { code, map: null };
    }
    if (file.endsWith('/src/components/form-renderer/FormScalarControl.tsx')) {
      inject('export const FormScalarControl: React.FC<FormScalarControlProps> = (props) => {', "if (props.inputId.startsWith('input-items[')) { const observedIndex = Number(props.inputId.match(/\\[(\\d+)\\]/)?.[1]); window.__c2Record('Scalar', window.__c2RowIds[observedIndex], observedIndex); }");
      instrumented.add('FormScalarControl'); return { code, map: null };
    }
  },
};
const server = await createServer({ root: frontend, configFile: path.join(frontend, 'vite.config.ts'), logLevel: 'error', plugins: [instrument],
  server: { host: '127.0.0.1', port: 0, strictPort: true, fs: { allow: [root] } } });
const checks = [], samples = [], pageErrors = [], blockedRequests = [];
let browser, page, failure;
const check = (label, passed) => { checks.push({ label, passed: Boolean(passed) }); assert.ok(passed, label); };
try {
  await server.listen(); const origin = 'http://127.0.0.1:' + server.httpServer.address().port;
  browser = await chromium.launch({ headless: true });
  for (const device of ['desktop', 'mobile']) {
    const context = await browser.newContext({ viewport: device === 'desktop' ? { width: 1600, height: 1000 } : { width: 390, height: 844 },
      isMobile: device === 'mobile', hasTouch: device === 'mobile', serviceWorkers: 'block' });
    await context.addInitScript(() => {
      window.__c2Events = [];
      window.__c2RowIds = {};
      window.__c2Record = (component, rowId, index) => {
        if (component === 'RowFields') window.__c2RowIds[index] = rowId;
        window.__c2Events.push({ component, rowId, index });
      };
    });
    await context.routeWebSocket('**/*', socket => socket.close());
    await context.route('**/*', route => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin !== origin || !['GET', 'HEAD'].includes(request.method()) || url.pathname.startsWith('/api/')) {
        blockedRequests.push({ method: request.method(), path: url.pathname }); return route.abort();
      }
      if (url.pathname === '/row-render-check') {
        const entry = '/@fs/' + path.join(root, 'scripts/form-checks/FormSubTableRenderCheck.tsx').replaceAll('\\', '/');
        return route.fulfill({ contentType: 'text/html', body: `<html lang="zh-CN"><head><meta name="viewport" content="width=device-width,initial-scale=1"><script type="module">import RefreshRuntime from '/@react-refresh';RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;</script></head><body><div id="root"></div><script type="module" src="${entry}"></script></body></html>` });
      }
      return route.continue();
    });
    page = await context.newPage(); page.on('pageerror', error => pageErrors.push(error.name));
    const settle = async () => {
      await page.evaluate(() => new Promise((resolve, reject) => {
        let previous = -1, stable = 0; const started = performance.now();
        const next = () => { const count = window.__c2Events.length; stable = count === previous ? stable + 1 : 0; previous = count;
          if (stable >= 5) resolve(); else if (performance.now() - started > 10000) reject(new Error('Component execution did not settle')); else requestAnimationFrame(next); };
        requestAnimationFrame(next);
      }));
    };
    const rows = async () => JSON.parse(await page.getByTestId('values').textContent()).items;
    const input = (index, column) => page.locator('[id=' + JSON.stringify(`input-items[${index}].${column}`) + ']');
    const mountedIds = async () => {
      const values = await rows();
      const indices = await page.locator('[id^="input-items["][id$="].name"]').evaluateAll(elements => elements.map(element => Number(element.id.match(/\[(\d+)\]/)[1])));
      return indices.map(index => values[index]._rowId);
    };
    for (const count of [3, 100]) {
      const prefix = `${device}_${count}`;
      await page.goto(`${origin}/row-render-check?rows=${count}&device=${device}`); await input(0, 'name').waitFor(); await settle();
      const initial = await rows(), initialMounted = await mountedIds();
      check(prefix + '_real_components_instrumented', instrumented.size === 2 && (await page.evaluate(() => window.__c2Events)).some(event => event.component === 'Scalar'));
      check(prefix + '_ordinary_or_virtual_rows', initialMounted.length >= 2 && (count === 3 ? initialMounted.length === 3 : initialMounted.length < 20));
      const observe = async (action, operation, allowedRows) => {
        const beforeMounted = await mountedIds();
        await page.evaluate(() => { window.__c2Events = []; });
        await operation(); await settle();
        const afterMounted = await mountedIds(), events = await page.evaluate(() => window.__c2Events);
        check(prefix + '_' + action + '_all_executions_identified', events.every(event => typeof event.rowId === 'string' && event.rowId !== 'undefined' && Number.isInteger(event.index)));
        const stableRows = beforeMounted.filter(id => afterMounted.includes(id));
        const detail = Object.fromEntries(['TableRow', 'RowFields', 'Scalar'].map(component => [component,
          Object.fromEntries([...new Set(events.filter(event => event.component === component).map(event => event.rowId))].map(id => [id, events.filter(event => event.component === component && event.rowId === id).length]))]));
        samples.push({ device, count, action, beforeMounted, afterMounted, executions: detail });
        if (allowedRows) {
          const unaffected = stableRows.filter(id => !allowedRows.includes(id));
          check(prefix + '_' + action + '_observes_unchanged_rows', unaffected.length > 0);
          check(prefix + '_' + action + '_unchanged_row_fields_not_executed', unaffected.every(id => !detail.RowFields[id] && !detail.Scalar[id]));
          if (action.startsWith('edit_')) check(prefix + '_' + action + '_unchanged_outer_rows_not_executed', unaffected.every(id => !detail.TableRow[id]));
          check(prefix + '_' + action + '_affected_row_executed', allowedRows.every(id => detail.RowFields[id] > 0));
        }
        return detail;
      };
      for (const [index, column, value] of [[0, 'name', '首行改动'], [1, 'name', '次行改动'], [0, 'amount', '0.25']]) {
        await input(index, column).scrollIntoViewIfNeeded(); await input(index, column).focus(); await settle();
        await observe(`edit_${index}_${column}`, () => input(index, column).fill(value), [initial[index]._rowId]);
        check(prefix + `_edit_${index}_${column}_value_and_identity`, (await rows())[index][column] === value && (await rows())[index]._rowId === initial[index]._rowId);
      }
      check(prefix + '_summary_updated', (await page.locator('[data-subtable-footer] strong').textContent()) === (count === 3 ? '0.45' : '10.15'));
      await observe('root_dependency_closed', () => page.locator('#input-gate').fill('closed'));
      check(prefix + '_root_changes_visibility', await input(0, 'conditional').count() === 0);
      check(prefix + '_root_changes_readonly', await input(0, 'locked').count() === 0 && await page.locator('[id="field-items[0].locked"]').getByText('编辑0', { exact: true }).count() === 1);
      await observe('root_dependency_open', () => page.locator('#input-gate').fill('open'));
      check(prefix + '_root_restores_fields_and_values', await input(0, 'conditional').inputValue() === '条件0' && await input(0, 'locked').inputValue() === '编辑0');
      await observe('first_row_error', () => page.getByRole('button', { name: '首行错误', exact: true }).click(), ['row-0']);
      check(prefix + '_first_row_error_visible', await input(0, 'name').getAttribute('aria-invalid') === 'true' && await page.getByText('首行说明错误', { exact: true }).count() === 1);
      await observe('second_row_error', () => page.getByRole('button', { name: '次行错误', exact: true }).click(), ['row-0', 'row-1']);
      check(prefix + '_error_moves_to_specific_column', await input(0, 'name').getAttribute('aria-invalid') !== 'true' && await input(1, 'amount').getAttribute('aria-invalid') === 'true');
      await observe('clear_error', () => page.getByRole('button', { name: '清除错误', exact: true }).click(), ['row-1']);
      check(prefix + '_clear_error_updates_column', await input(1, 'amount').getAttribute('aria-invalid') !== 'true');
      await observe('root_error', () => page.getByRole('button', { name: '主表错误', exact: true }).click(), []);
      check(prefix + '_root_error_visible', await page.locator('#error-gate').textContent() === '主表错误');
      await page.getByRole('button', { name: '清除错误', exact: true }).click(); await settle();
      const menuAction = async (index, name) => {
        if (device === 'mobile') await page.getByRole('button', { name: `第${index + 1}条明细操作`, exact: true }).click();
        await page.getByRole('button', { name: `${name}第${index + 1}行`, exact: true }).click();
      };
      await observe('copy', () => menuAction(0, '复制'));
      const copied = await rows();
      check(prefix + '_copy_updates_rows_and_identity', copied.length === count + 1 && copied[1]._rowId !== copied[0]._rowId && copied[1].name === copied[0].name);
      await observe('delete', () => menuAction(1, '删除'));
      check(prefix + '_delete_preserves_other_rows', JSON.stringify(await rows()) === JSON.stringify(copied.filter((_, index) => index !== 1)));
      await observe('sort', async () => {
        if (device === 'mobile') await page.getByRole('button', { name: '下移第1行', exact: true }).click();
        else {
          await page.getByRole('button', { name: '拖动第1行排序', exact: true }).focus();
          await page.keyboard.press('Space'); await page.waitForTimeout(80); await page.keyboard.press('ArrowDown'); await page.waitForTimeout(80); await page.keyboard.press('Space');
        }
      });
      check(prefix + '_sort_preserves_identity_and_updates_labels', (await rows())[1]._rowId === 'row-0' && await input(1, 'name').inputValue() === '首行改动');
      await observe('add', () => page.getByRole('button', { name: '新增明细', exact: true }).click());
      const added = await rows();
      check(prefix + '_add_creates_new_identity', added.length === count + 1 && new Set(added.map(row => row._rowId)).size === count + 1);
    }
    await context.close();
  }
  check('no_browser_errors_or_business_requests', pageErrors.length === 0 && blockedRequests.length === 0);
} catch (error) {
  failure = error;
  if (page && !page.isClosed()) await page.screenshot({ path: path.join(output, 'failure.png') }).catch(() => undefined);
} finally {
  await browser?.close(); await server.close(); await verifyInputs();
  await fs.writeFile(path.join(output, 'result.json'), JSON.stringify({ passed: !failure, componentOnly: true, runtimeInstrumentationOnly: true,
    actualComponents: [...instrumented], checks, samples, pageErrors, blockedRequests, inputs: inputs.length, businessDatabaseWrites: 0,
    failure: failure ? { name: failure.name, message: String(failure.message).split('\n')[0] } : undefined }, null, 2));
  console.log(`C2_ROW_RENDERS: checks=${checks.length}; samples=${samples.length}; passed=${!failure}; inputs=${inputs.length}; product_modified=false; business_database_writes=0`);
}
if (failure) throw failure;
