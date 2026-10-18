import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { waitForShellLayout } from '../portal-checks/wait-shell-layout.mjs';

const root = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const [round] = process.argv.slice(2);
assert.match(round, /^r[1-9]\d*$/);
const output = path.join(root, '.cloudflow-runtime/full-prd-20260915/approved-runtime', `h3-opportunity-table-layout-20261011-${round}`);
await fs.mkdir(output);
await fs.copyFile(fileURLToPath(import.meta.url), path.join(output, 'original.mjs'));
const assets = path.join(root, 'cloudflow-frontend/dist/assets');
const styles = [];
for (const name of (await fs.readdir(assets)).filter(name => name.endsWith('.css'))) {
  const content = await fs.readFile(path.join(assets, name), 'utf8');
  if (!name.startsWith('index-') && !content.includes('.crm-opportunity-panel') && !content.includes('.cf-table-scroll-area')) continue;
  styles.push({ name, content, hash: createHash('sha256').update(content).digest('hex') });
}
styles.sort((first, second) => Number(second.name.startsWith('index-')) - Number(first.name.startsWith('index-')));
assert.ok(styles.some(style => style.content.includes('.crm-opportunity-list-table')));
const requireBrowser = createRequire(path.join(process.env.CLOUDFLOW_PLAYWRIGHT_HOME || path.join(root, '.cloudflow-runtime/playwright'), 'package.json'));
const { chromium } = requireBrowser('playwright-core');
const browser = await chromium.launch({ headless: true });
const records = [];
try {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  await context.route('**/*', route => route.abort());
  const page = await context.newPage();
  const headers = ['商机', '客户', '阶段', '金额 / 赢率', '最近跟进', '负责人', '操作'];
  const buttons = ['查看详情', '客户360', '编辑商机', '调整阶段', '赢单', '丢单审批', '转项目'];
  const actions = '<div class="admin-users-row-actions">' + buttons.map(label => `<button type="button" aria-label="${label}"><svg width="15" height="15"></svg></button>`).join('') + '</div>';
  const rows = ['notice', 'disabled_recipient', 'main', 'visible_admin_owner'].map(name => `<tr><td><strong>H3_4829e170a6fd_${name}</strong></td><td>H3_4829e170a6fd_customer</td><td>需求确认_4829e170a6fd<small>停留 0 个完整天</small></td><td><strong>58.05 元</strong><small>赢率 30% · 加权 17.42 元</small></td><td>2026-10-11 04:30:00</td><td>商机验收销售</td><td>${actions}</td></tr>`).join('');
  await page.setContent(`<style>${styles.map(style => style.content).join('\n')}</style><div class="unity-app-shell cf-app-shell"><div class="unity-app-main cf-app-main lg:ml-[210px]"><main class="unity-app-content cf-app-content"><div class="admin-crm-opportunity-grid crm-opportunity-panel"><p>左右滑动查看商机信息及操作</p><div class="table-scroll-container admin-inner-table-surface admin-crm-table-panel h-auto flex-none overflow-visible"><div class="cf-table-scroll-area table-wrapper is-scrollable" role="region" aria-label="商机列表横向滚动区域" tabindex="0" style="max-height:none"><table class="unity-data-table admin-source-table admin-crm-table crm-opportunity-list-table min-w-[900px]" aria-label="商机列表"><thead><tr>${headers.map(header => `<th scope="col">${header}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div></div></div></main></div></div>`);
  const region = page.getByRole('region');
  for (const width of [1440, 375, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await waitForShellLayout(page);
    const columns = [];
    for (let index = 0; index < headers.length; index += 1) {
      await page.getByRole('columnheader').nth(index).scrollIntoViewIfNeeded();
      const measured = await page.locator('tbody tr').nth(2).getByRole('cell').nth(index).evaluate(element => {
        const region = element.closest('[role="region"]');
        const cell = element.getBoundingClientRect();
        const bounds = region.getBoundingClientRect();
        const style = getComputedStyle(element);
        const actions = element.querySelector('.admin-users-row-actions');
        return { left: cell.left, right: cell.right, width: cell.width, viewportLeft: bounds.left + region.clientLeft,
          viewportRight: bounds.left + region.clientLeft + region.clientWidth, clientWidth: element.clientWidth,
          scrollWidth: element.scrollWidth, scrollLeft: region.scrollLeft, position: style.position,
          paddingLeft: style.paddingLeft, paddingRight: style.paddingRight,
          actions: actions ? { width: actions.getBoundingClientRect().width, left: actions.getBoundingClientRect().left,
            right: actions.getBoundingClientRect().right, scrollWidth: actions.scrollWidth } : null };
      });
      columns.push({ header: headers[index], ...measured });
    }
    await page.screenshot({ path: path.join(output, `opportunity-list-${width}.png`), fullPage: true });
    const record = { width, columns, pageWidth: await page.evaluate(() => document.documentElement.scrollWidth),
      businessApis: false, productionStyles: true, fixtureMarkup: true };
    records.push(record);
    console.log('H3_TABLE_LAYOUT: ' + JSON.stringify({ width, lastColumn: columns.at(-1), pageWidth: record.pageWidth }));
    await region.evaluate(element => { element.scrollLeft = 0; });
  }
  await context.close();
} finally { await browser.close(); }
await fs.writeFile(path.join(output, 'result.json'), JSON.stringify({ diagnosticOnly: true, businessApis: false, fixtureMarkup: true,
  styles: styles.map(({ name, hash }) => ({ name, hash })), records }, null, 2), { flag: 'wx' });
