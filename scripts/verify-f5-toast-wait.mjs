import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.resolve(process.argv[2] || '');
const businessWarningOnly = process.argv.includes('--business-warning-duration');
assert.ok(process.argv[2] && output.startsWith(path.join(root, '.cloudflow-runtime') + path.sep));
await fs.mkdir(output, { recursive: true });
const requireFrontend = createRequire(path.join(root, 'cloudflow-frontend/package.json'));
const requireBrowser = createRequire(path.join(root, '.cloudflow-runtime/playwright/package.json'));
const { createServer } = await import(pathToFileURL(requireFrontend.resolve('vite')).href);
const { chromium } = requireBrowser('playwright-core');
const serveProbe = async (request, response) => {
  response.setHeader('Content-Type', 'text/html; charset=utf-8');
  response.end(await server.transformIndexHtml('/__f5-toast-probe', '<div id=probe></div><script type=module>import{createElement}from"react";import{createRoot}from"react-dom/client";import{ToastViewport}from"/src/components/common/Toast.tsx";import{createToast,getToastSnapshot}from"/src/lib/toastStore.ts";createRoot(document.getElementById("probe")).render(createElement(ToastViewport));window.createProbeToast=createToast;window.getProbeToastSnapshot=getToastSnapshot;document.body.dataset.ready="true";</script>'));
};
const server = await createServer({
  root: path.join(root, 'cloudflow-frontend'), configFile: false,
  plugins: [{ name: 'f5-toast-probe', configureServer(instance) {
    instance.middlewares.use('/__f5-toast-probe', serveProbe);
  } }],
  resolve: { alias: { '@': path.join(root, 'cloudflow-frontend/src') } },
  esbuild: { jsx: 'automatic' }, server: { host: '127.0.0.1', port: 0, strictPort: false },
});
let browser;
const observations = [];
try {
  await server.listen();
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const owner = await context.newPage();
  const other = await context.newPage();
  owner.on('pageerror', failure => console.log('PAGE_ERROR ' + failure.message));
  const constant = await owner.waitForFunction(() => true, null, { timeout: 10000 });
  await constant.dispose();
  await owner.goto('http://127.0.0.1:' + server.httpServer.address().port + '/__f5-toast-probe');
  await owner.locator('body[data-ready="true"]').waitFor({ state: 'attached', timeout: 10000 });
  const ready = await owner.waitForFunction(() => typeof window.createProbeToast === 'function', null, { timeout: 10000 });
  await ready.dispose();
  const scenarios = businessWarningOnly
    ? [{ type: 'warning', duration: 10000, expectedShortTimeout: true }]
    : ['success', 'warning', 'error'].map(type => ({ type, expectedShortTimeout: false }));
  for (const scenario of scenarios) {
    const { type, duration, expectedShortTimeout } = scenario;
    await other.bringToFront();
    await owner.evaluate(({ type: toastType, duration: toastDuration }) => window.createProbeToast(
      toastType, 'F5 notification wait ' + toastType, toastDuration ? { duration: toastDuration } : undefined), scenario);
    await owner.locator('.cf-toast').first().waitFor({ state: 'visible' });
    await owner.bringToFront();
    const initial = await owner.evaluate(() => ({ visibility: document.visibilityState,
      hasFocus: document.hasFocus(), toasts: window.getProbeToastSnapshot() }));
    const started = Date.now();
    const outcomes = await Promise.allSettled([
      owner.waitForFunction(() => document.querySelectorAll('.cf-toast').length === 0, null, { timeout: 10000, polling: 100 }),
      owner.locator('.cf-toast').first().waitFor({ state: 'detached', timeout: expectedShortTimeout ? 12000 : 10000 }),
    ]);
    const observation = { type, duration: duration ?? initial.toasts[0]?.duration, initial, expectedShortTimeout,
      shortTimeoutMs: 10000, detachedTimeoutMs: expectedShortTimeout ? 12000 : 10000,
      elapsedMs: Date.now() - started, outcomes: outcomes.map(outcome => ({
      status: outcome.status, failure: outcome.status === 'rejected' ? outcome.reason.message : null,
    })), remaining: await owner.locator('.cf-toast').count() };
    observations.push(observation);
    console.log(JSON.stringify(observation));
    for (const outcome of outcomes) if (outcome.status === 'fulfilled' && outcome.value?.dispose) await outcome.value.dispose();
  }
} finally {
  await fs.writeFile(path.join(output, 'observations.json'), JSON.stringify(observations, null, 2), { flag: 'wx' });
  await browser?.close();
  await server.close();
}
assert.equal(observations.length, businessWarningOnly ? 1 : 3);
assert.ok(observations.every(observation => observation.remaining === 0
  && observation.outcomes[1].status === 'fulfilled'
  && (observation.expectedShortTimeout
    ? observation.duration === 10000 && observation.outcomes[0].status === 'rejected'
      && observation.outcomes[0].failure.includes('Timeout 10000ms exceeded')
    : observation.outcomes[0].status === 'fulfilled')));
