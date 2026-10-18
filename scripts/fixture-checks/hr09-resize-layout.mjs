import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

// Isolated rendering of existing components: no business endpoints or login.
const root = 'D:/CloudFlowPro';
const round = process.argv[2];
assert.match(round, /^r[1-9][0-9]*$/);
const frontend = path.join(root, 'cloudflow-frontend');
const requireFrontend = createRequire(path.join(frontend, 'package.json'));
const requireBrowser = createRequire(path.join(process.env.CLOUDFLOW_PLAYWRIGHT_HOME || path.join(root, '.cloudflow-runtime/playwright'), 'package.json'));
const { createServer } = await import(pathToFileURL(requireFrontend.resolve('vite')).href);
const { chromium } = requireBrowser('playwright-core');
const html = '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="probe"></div></body></html>';
const server = await createServer({ root: frontend, configFile: path.join(frontend, 'vite.config.ts'), logLevel: 'error',
  server: { host: '127.0.0.1', port: 0, hmr: false, watch: null },
  plugins: [{ name: 'owned-hr09-layout', configureServer(instance) { instance.middlewares.use(async (request, response, next) => {
    if (request.url !== '/__owned-hr09-layout') return next();
    response.setHeader('Content-Type', 'text/html');
    response.end(await instance.transformIndexHtml(request.url, html));
  }); } }],
});
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  await page.route('**/api/**', route => new URL(route.request().url()).pathname.startsWith('/api/') ? route.abort() : route.continue());
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/__owned-hr09-layout`);
  await page.evaluate(async () => {
    await import('/src/index.css');
    const React = await import('/node_modules/.vite/deps/react.js');
    const client = await import('/node_modules/.vite/deps/react-dom_client.js');
    const createRoot = client.createRoot || client.default.createRoot;
    const { Hr09FormDialog, Hr09Select, Hr09Textarea } = await import('/src/pages/hr/components/Hr09Shared.tsx');
    const h = React.createElement || React.default.createElement;
    createRoot(document.getElementById('probe')).render(h(Hr09FormDialog, {
      title: '处置结算异常', description: '隔离布局检查', confirmation: '确认', submitText: '确认处置', onClose() {}, async onSubmit() {},
    }, ...['处置方式', '本次补正目标工资周期', '原周期已发工资单'].map(label => h(Hr09Select, { key: label, label, value: 'owned', options: [{ value: 'owned', label: '本轮布局值' }], onChange() {} })),
    h(Hr09Textarea, { label: '处置原因', defaultValue: '本轮布局原因' })));
  });
  const form = page.getByRole('dialog', { name: '处置结算异常', exact: true });
  await form.getByRole('checkbox').check();
  const measure = () => form.evaluate(element => ({ viewport: innerWidth, mobile: matchMedia('(max-width: 767px)').matches,
    controls: [...element.querySelectorAll('button,input:not([type="checkbox"]),textarea')].filter(control => control.getClientRects().length).map(control => {
      const rect = control.getBoundingClientRect(), style = getComputedStyle(control);
      return { name: control.getAttribute('aria-label') || control.textContent, width: rect.width, height: rect.height,
        minWidth: style.minWidth, minHeight: style.minHeight, transform: style.transform };
    }),
  }));
  const observations = [];
  for (let index = 0; index < 5; index++) {
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.screenshot();
    await page.setViewportSize({ width: 320, height: 1100 });
    observations.push({ phase: 'immediate', index, ...(await measure()) });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    observations.push({ phase: 'painted', index, ...(await measure()) });
    await form.evaluate(async element => {
      await Promise.all(element.getAnimations({ subtree: true }).filter(animation => Number.isFinite(animation.effect.getComputedTiming().endTime))
        .map(animation => animation.finished.catch(() => {})));
    });
    observations.push({ phase: 'settled', index, ...(await measure()) });
  }
  const output = path.join(root, `.cloudflow-runtime/full-prd-20260915/approved-runtime/hr09-resize-layout-20261007-${round}.json`);
  await fs.writeFile(output, JSON.stringify({ componentOnly: true, businessRequests: false, observations }, null, 2), { flag: 'wx' });
  assert.ok(observations.filter(item => item.phase === 'settled').every(item => item.controls.every(control => control.width >= 44 && control.height >= 44)));
  console.log(JSON.stringify({ componentOnly: true, businessRequests: false, resizes: 5, afterTransitionsAllControlsAtLeast44: true }));
} finally { await browser?.close(); await server.close(); }
