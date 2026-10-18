import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { waitForShellLayout } from '../portal-checks/wait-shell-layout.mjs';

const root = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const assets = path.join(root, 'cloudflow-frontend/dist/assets');
const files = await fs.readdir(assets);
const styles = [];
for (const prefix of ['index-', 'portal-']) {
  const names = files.filter(name => name.startsWith(prefix) && name.endsWith('.css'));
  assert.equal(names.length, 1);
  styles.push(await fs.readFile(path.join(assets, names[0]), 'utf8'));
}
assert.ok(styles[1].includes('.portal-ticket-table'));
const requireBrowser = createRequire(path.join(root, '.cloudflow-runtime/playwright/package.json'));
const { chromium } = requireBrowser('playwright-core');
const browser = await chromium.launch({ headless: true });
const actions = '<div class="portal-ticket-actions flex flex-wrap items-center gap-2"><button class="btn btn-secondary btn-sm">门户处理</button><button class="btn btn-secondary btn-md">客户邮件往来</button><button class="btn btn-secondary btn-sm" aria-label="客户360"><svg width="15" height="15"></svg></button></div>';
try {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  await context.route('**/*', route => route.abort());
  const page = await context.newPage();
  await page.setContent(`<style>${styles.join('\n')}</style><div class="unity-app-shell cf-app-shell"><div class="unity-app-main cf-app-main lg:ml-[210px]"><main class="unity-app-content cf-app-content"><section class="card admin-users-toolbar admin-crm-toolbar portal-ticket-toolbar"><div class="admin-crm-toolbar-grid"><div class="admin-users-toolbar-actions admin-crm-toolbar-actions"><label class="portal-ticket-queue"><input type="checkbox"><span>只看门户待分派工单</span></label></div></div></section><div class="table-scroll-container admin-inner-table-surface"><div class="table-wrapper"><div class="portal-controls p-3"><table class="unity-data-table admin-source-table admin-crm-table portal-ticket-table min-w-[900px]"><tbody><tr><td>${actions}</td></tr></tbody></table><div class="portal-ticket-cards"><article class="min-w-0 rounded-lg border border-cf-border p-3">${actions}</article></div></div></div></div></main></div></div>`);
  const geometry = () => page.getByRole('button', { name: '客户360', exact: true }).evaluate(button => ({ left: button.getBoundingClientRect().left, right: button.getBoundingClientRect().right, width: button.getBoundingClientRect().width, height: button.getBoundingClientRect().height, margin: getComputedStyle(document.querySelector('.cf-app-main')).marginLeft }));
  for (const reducedMotion of ['no-preference', 'reduce']) {
    await page.emulateMedia({ reducedMotion });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await waitForShellLayout(page);
    await page.setViewportSize({ width: 375, height: 1000 });
    const initial = await geometry();
    await waitForShellLayout(page);
    const settled = await geometry();
    assert.ok(settled.left >= 0 && settled.right <= 375 && settled.width >= 44 && settled.height >= 44);
    console.log(`PORTAL_TICKET_SHELL_LAYOUT: motion=${reducedMotion}; initial=${JSON.stringify(initial)}; settled=${JSON.stringify(settled)}; production_css=true; business_apis_used=false`);
  }
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  for (const width of [1440, 1024, 1023, 375, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await waitForShellLayout(page);
    assert.equal(await page.locator('.portal-ticket-table').isVisible(), width >= 1024);
    assert.equal(await page.locator('.portal-ticket-cards').isVisible(), width < 1024);
    assert.equal(await page.getByRole('button', { name: '门户处理', exact: true }).count(), 1);
    const control = await page.getByRole('checkbox').evaluate(input => ({ width: input.getBoundingClientRect().width, height: input.getBoundingClientRect().height, target: input.closest('label').getBoundingClientRect().height }));
    assert.equal(control.width, 20); assert.equal(control.height, 20); assert.ok(control.target >= 44);
    const buttons = await page.getByRole('button').evaluateAll(elements => elements.every(element => element.scrollWidth <= element.clientWidth + 1 && element.getBoundingClientRect().height >= 44 && element.getBoundingClientRect().width >= 44 && (innerWidth >= 1024 || element.getBoundingClientRect().left >= 0 && element.getBoundingClientRect().right <= innerWidth)));
    assert.ok(buttons);
    console.log(`PORTAL_TICKET_LAYOUT: width=${width}; visible_views=1; checkbox=20x20; label_target_at_least_44=true; button_text_fits=true; production_css=true; business_apis_used=false`);
  }
} finally { await browser.close(); }
