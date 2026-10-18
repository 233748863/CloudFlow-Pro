import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const requireBrowser = createRequire(path.join(root, '.cloudflow-runtime/playwright/package.json'));
const { chromium } = requireBrowser('playwright-core');
const browser = await chromium.launch({ headless: true });
try {
  for (const premature of [true, false]) {
    let requests = 0;
    let releaseResponse;
    const gate = new Promise(resolve => { releaseResponse = resolve; });
    const server = createServer(async (request, response) => {
      if (request.url !== '/upload') { response.end('<html><body>route lifecycle fixture</body></html>'); return; }
      requests++;
      await gate;
      response.setHeader('Content-Type', 'application/json');
      response.end('{"code":200}');
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    const context = await browser.newContext({ serviceWorkers: 'block' });
    let callbackError;
    let entered;
    let completed;
    const entry = new Promise(resolve => { entered = resolve; });
    const completion = new Promise(resolve => { completed = resolve; });
    try {
      await context.route('**/*', route => route.continue());
      const page = await context.newPage();
      await page.goto(origin);
      const handler = async route => {
        entered();
        try {
          const response = await route.fetch();
          assert.equal(response.status(), 200);
          await route.abort('connectionfailed');
        } catch (error) { callbackError = error; }
        finally { completed(); }
      };
      await page.route('**/upload', handler);
      const result = page.evaluate(() => fetch('/upload', { method: 'POST', body: 'fixture' }).then(() => 'received', () => 'dropped'));
      await entry;
      if (premature) await page.unroute('**/upload', handler);
      releaseResponse();
      await completion;
      if (!premature) await page.unroute('**/upload', handler);
      const observed = await result;
      if (premature) { assert.equal(requests, 2); assert.match(callbackError?.message || '', /Route is already handled/); assert.equal(observed, 'received'); }
      else { assert.equal(requests, 1); assert.equal(callbackError, undefined); assert.equal(observed, 'dropped'); }
      console.log(`PORTAL_ROUTE_LIFECYCLE: premature_unroute=${premature}; upstream_requests=${requests}; callback_error=${callbackError ? 'already_handled' : 'none'}; browser_result=${observed}; business_apis_used=false`);
    } finally {
      releaseResponse();
      await context.close();
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
    }
  }
} finally { await browser.close(); }
