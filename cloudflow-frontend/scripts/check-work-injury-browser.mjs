import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build, preview } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workspace = path.dirname(frontend);
const output = path.join(workspace, '.cloudflow-runtime', `a2-work-injury-browser-${Date.now()}`);
const modulePath = process.env.CLOUDFLOW_PLAYWRIGHT_MODULE;
assert.ok(modulePath && existsSync(modulePath), 'CLOUDFLOW_PLAYWRIGHT_MODULE must identify the installed browser module');
const { chromium } = await import(pathToFileURL(modulePath).href);
const executablePath = process.env.CLOUDFLOW_CHROMIUM_EXECUTABLE;
assert.ok(!executablePath || existsSync(executablePath), 'CLOUDFLOW_CHROMIUM_EXECUTABLE must identify an installed browser');
const sourceFiles = ['src/pages/hr/laborRelation/HrWorkInjuryPage.tsx', 'src/index.css',
  'src/styles/unity2-refresh.css', 'src/styles/mobile-foundation.css',
  'src/components/common/table.tsx', 'src/hooks/useBreakpoint.ts',
  'scripts/work-injury-browser/fixture.tsx', 'scripts/work-injury-browser/index.html',
  'scripts/check-work-injury-browser.mjs'];
const hashFile = file => createHash('sha256').update(readFileSync(path.join(frontend, file))).digest('hex');
const sourceHashes = Object.fromEntries(sourceFiles.map(file => [file, hashFile(file)]));
mkdirSync(output);
console.log(`WORK_INJURY_BROWSER_RUN=${output}`);
const config = { configFile: false, root: frontend, logLevel: 'warn', plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.join(frontend, 'src') } },
  build: { outDir: path.join(output, 'dist'), emptyOutDir: false,
    rollupOptions: { input: path.join(frontend, 'scripts/work-injury-browser/index.html') } } };
const labels = { REPORTED: '已上报', INVESTIGATING: '调查中', DETERMINING: '认定中', DETERMINED: '已认定',
  COMPENSATING: '赔偿中', REHABILITATING: '康复中', CLOSED: '已关闭', REJECTED: '已驳回' };
const records = [
  { id: 101, employeeId: 712, injuryNo: 'WI-REJECTED', status: 'REJECTED', injuryLevel: 'MINOR',
    occurredAt: '2026-10-16 09:00:00', location: '作业区', eventDescription: '驳回状态页面验收' },
  { id: 102, employeeId: 712, injuryNo: 'WI-DETERMINED', status: 'DETERMINED', injuryLevel: 'MINOR',
    occurredAt: '2026-10-16 10:00:00', location: '作业区', determinedGrade: 10 },
];
const errors = [];
const requests = [];
const checks = [];
const check = (value, label) => { assert.ok(value, label); checks.push(label); console.log(`PASS ${label}`); };
let browser;
let server;
let failure = null;
try {
  await build(config);
  server = await preview({ ...config, preview: { host: '127.0.0.1', port: 0, strictPort: false, open: false } });
  const address = server.httpServer.address();
  assert.ok(address && typeof address === 'object');
  browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(15000);
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    requests.push({ method: route.request().method(), path: url.pathname, status: url.searchParams.get('status') });
    let data;
    if (url.pathname.endsWith('/dict/data/type/hr_work_injury_status')) {
      data = Object.entries(labels).map(([dictValue, dictLabel], index) => ({
        dictCode: index + 1, dictSort: index + 1, dictType: 'hr_work_injury_status', dictValue, dictLabel,
        listClass: dictValue === 'REJECTED' ? 'danger' : 'success', status: '0' }));
    } else if (url.pathname.endsWith('/dict/data/type/hr_work_injury_level')) {
      data = [{ dictValue: 'MINOR', dictLabel: '轻伤', dictType: 'hr_work_injury_level', status: '0' }];
    } else if (url.pathname.endsWith('/hr/labor/work-injuries')) {
      const rows = records.filter(row => !url.searchParams.has('status') || row.status === url.searchParams.get('status'));
      data = { rows, total: rows.length };
    } else if (url.pathname.endsWith('/hr/labor/work-injuries/101')) {
      data = records[0];
    } else {
      errors.push(`Unexpected request ${url.pathname}`);
      await route.fulfill({ status: 500, json: { code: 500, msg: 'Unexpected controlled fixture request' } });
      return;
    }
    await route.fulfill({ json: { code: 200, msg: 'success', data } });
  });
  const url = `http://127.0.0.1:${address.port}/scripts/work-injury-browser/index.html`;
  for (const [name, width, height] of [['desktop', 1440, 1000], ['mobile', 390, 844]]) {
    const requestStart = requests.length;
    await page.setViewportSize({ width, height });
    await page.goto(url);
    const rejected = page.locator('tbody tr').filter({ hasText: 'WI-REJECTED' });
    await rejected.getByText('已驳回', { exact: true }).waitFor();
    check(await rejected.getByText('已驳回', { exact: true }).count() === 1, `${name}: rejected record has one explicit rejected label`);
    check(await rejected.getByText('已认定', { exact: true }).count() === 0, `${name}: rejected record shows no completed normal stages`);
    check(await rejected.getByRole('button', { name: '发起认定', exact: true }).count() === 0
      && await rejected.getByRole('button', { name: '编辑', exact: true }).count() === 0, `${name}: rejected record has no invalid approval or edit actions`);
    const determined = page.locator('tbody tr').filter({ hasText: 'WI-DETERMINED' });
    check(await determined.getByText('已认定', { exact: true }).count() === 1
      && await determined.getByText('已驳回', { exact: true }).count() === 0, `${name}: normal timeline remains intact`);
    if (name === 'mobile') {
      await rejected.locator('td[data-cf-mobile-label="当前阶段"]').waitFor();
      check(await rejected.locator('td[data-cf-mobile-label]').count() === 8, `${name}: every card field keeps its column label`);
      check(await page.locator('table.cf-mobile-table').count() === 1, `${name}: production mobile card layout is active`);
      check(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${name}: page has no horizontal overflow`);
      for (const row of [rejected, determined]) {
        const geometry = await row.evaluate(element => {
          const cells = Array.from(element.querySelectorAll('td'));
          return cells.every((cell, index) => {
            const rect = cell.getBoundingClientRect();
            const previous = cells[index - 1]?.getBoundingClientRect();
            return rect.x >= 0 && rect.right <= window.innerWidth + 1
              && (!previous || rect.top >= previous.bottom - 1);
          });
        });
        check(geometry, `${name}: ${await row.locator('td').first().innerText()} fields fit width and do not overlap`);
      }
      const badge = rejected.getByText('已驳回', { exact: true });
      await badge.scrollIntoViewIfNeeded();
      check(await badge.evaluate(element => {
        const rect = element.getBoundingClientRect();
        const topmost = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
        return rect.x >= 0 && rect.right <= window.innerWidth && !!topmost
          && (element.contains(topmost) || topmost.contains(element));
      }), `${name}: rejected badge is readable and not covered by actions`);
    }
    await page.locator('button[aria-haspopup="listbox"]').click();
    await page.getByRole('listbox').waitFor({ state: 'visible' });
    const options = page.getByRole('option');
    check(await options.count() === 9, `${name}: filter includes all eight states and all-state option`);
    await page.getByRole('option', { name: '已驳回', exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll('tbody tr').length === 1
      && document.querySelector('tbody')?.textContent?.includes('WI-REJECTED'));
    check(requests.slice(requestStart).some(request => request.path.endsWith('/hr/labor/work-injuries') && request.status === 'REJECTED'), `${name}: rejected filter uses formal API status`);
    check(await page.locator('tbody tr').count() === 1, `${name}: filtered list contains only rejected record`);
    await page.screenshot({ path: path.join(output, `${name}-list.jpg`), type: 'jpeg', fullPage: true });
    await rejected.getByRole('button', { name: '详情', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByText('已驳回', { exact: true }).waitFor();
    check(await dialog.getByText('已驳回', { exact: true }).count() === 1
      && await dialog.getByText('已认定', { exact: true }).count() === 0, `${name}: detail displays rejected outcome without success stages`);
    const bounds = await dialog.locator('.modal-content').boundingBox();
    check(bounds && bounds.x >= 0 && bounds.x + bounds.width <= width + 1, `${name}: detail fits viewport width`);
    await page.screenshot({ path: path.join(output, `${name}-detail.jpg`), type: 'jpeg', fullPage: true });
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden' });
    check(await dialog.count() === 0, `${name}: detail closes with Escape`);
  }
  check(errors.length === 0, `No browser errors or unexpected requests: ${JSON.stringify(errors)}`);
  check(requests.every(request => request.method === 'GET'), 'Page verification causes no business writes');
  check(sourceFiles.every(file => sourceHashes[file] === hashFile(file)), 'Checked source hashes remain unchanged');
} catch (error) {
  failure = error.stack || String(error);
  console.error(failure);
  process.exitCode = 1;
} finally {
  await browser?.close();
  await new Promise(resolve => server ? server.httpServer.close(resolve) : resolve());
  writeFileSync(path.join(output, 'result.json'), JSON.stringify({ passed: !failure, assertions: checks.length,
    checks, failure, requests, scope: 'Real production page component and browser; controlled HTTP fixtures; no backend end-to-end claim',
    sourceHashes, browserVersion: browser?.version() }, null, 2));
}
