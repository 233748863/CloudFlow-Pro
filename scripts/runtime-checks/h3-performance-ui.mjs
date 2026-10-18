import assert from 'node:assert/strict';
import path from 'node:path';

export async function verifyH3PerformancePages(context) {
  const { sessions, query, period, check, fixture, evidence, waitFor, database } = context;
  let actor = 'foreign';
  let page = sessions[actor].page;
  let panel = page.getByRole('region', { name: '销售业绩', exact: true });
  check('independent_page_has_no_performance_objective', database('SELECT COUNT(*) FROM hr_performance_objective WHERE tenant_id=' + context.tenant(actor) + ' AND deleted=0;') === '0');
  const snapshots = [];
  const money = value => {
    const [whole, fraction] = String(value).split('.');
    return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '.' + fraction;
  };
  const open = async (width, emptyObjective = false) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(context.origin + '/hr/performance', { waitUntil: 'domcontentloaded' });
    if (emptyObjective) await page.getByRole('heading', { name: '暂无绩效目标', exact: true }).waitFor();
    await page.getByRole('tab', { name: /销售业绩/ }).click();
    await panel.waitFor();
    await panel.getByText(/^以下卡片仅汇总/).waitFor();
  };
  const date = async (label, value) => {
    await panel.getByRole('group', { name: label, exact: true }).getByRole('button').click();
    const [year, month, selected] = value.split('-').map(Number);
    for (let attempt = 0; attempt < 14; attempt++) {
      const title = await page.locator('.cf-date-title').innerText();
      const numbers = title.match(/[0-9]+/g)?.map(Number);
      assert.ok(numbers?.length === 2, 'Actual date picker month title required');
      const difference = (year - numbers[0]) * 12 + month - numbers[1];
      if (difference === 0) break;
      await page.locator('.cf-date-nav-button').nth(difference < 0 ? 0 : 1).click();
    }
    await page.locator('.cf-date-cell:not(.cf-date-cell-outside)').filter({ hasText: new RegExp('^' + selected + '$') }).click();
    check('actual_picker_' + label + '_' + value, await panel.getByRole('group', { name: label, exact: true }).locator('input[type="hidden"]').inputValue() === value);
  };
  const setPeriod = async range => {
    await date('结束日期', range.endDate);
    await date('起始日期', range.startDate);
  };
  const verify = async (label, range, basis = 'TEAM_V2', currency = 'CNY') => {
    const owners = await query(actor, 'top-owners', range, basis, currency, { limit: '10' });
    const depts = await query(actor, 'top-depts', range, basis, currency, { limit: '10' });
    const expected = [owners, depts].map(rows => rows.map((row, index) => [String(index + 1), row.targetName || '#' + row.targetId,
      String(row.wonOpportunityCount), row.allocatedWonCount, money(row.wonAmount), money(row.contractAmount), money(row.receivedAmount),
      money(row.outstandingAmount), String(row.customerCount), String(row.followUpCount)]));
    const actual = await waitFor(async () => {
      if (await panel.getByRole('alert').count() || await panel.locator('[data-crm-sales-scroll] table').count() !== 2) return null;
      return panel.locator('[data-crm-sales-scroll] table').evaluateAll(tables => tables.map(table => [...table.tBodies[0].rows]
        .filter(row => row.cells.length === 10).map(row => [...row.cells].map(cell => cell.textContent.trim()))));
    }, values => JSON.stringify(values) === JSON.stringify(expected), 'Actual HR page did not match four-service query result: ' + label);
    check(label + '_actual_page_matches_hr_query_every_cell', JSON.stringify(actual) === JSON.stringify(expected));
    const geometry = await panel.evaluate(element => ({ viewport: innerWidth, page: document.documentElement.scrollWidth,
      left: element.getBoundingClientRect().left, right: element.getBoundingClientRect().right,
      tables: [...element.querySelectorAll('[data-crm-sales-scroll]')].map(wrapper => ({ width: wrapper.clientWidth, scroll: wrapper.scrollWidth,
        columns: wrapper.querySelectorAll('thead th').length, tabIndex: wrapper.tabIndex,
        cells: [...wrapper.querySelectorAll('tbody td')].filter(cell => !cell.hasAttribute('colspan')).map(cell => {
          const range = document.createRange(); range.selectNodeContents(cell);
          const text = range.getBoundingClientRect(), bounds = cell.getBoundingClientRect();
          return range.getClientRects().length === 1 && text.left >= bounds.left - 1 && text.right <= bounds.right + 1;
        }) })),
      amounts: [...element.querySelectorAll('[data-crm-sales-card-amount]')].map(amount => {
        const range = document.createRange(); range.selectNodeContents(amount);
        const bounds = range.getBoundingClientRect(), card = amount.closest('.admin-source-stat').getBoundingClientRect();
        return range.getClientRects().length === 1 && bounds.left >= card.left && bounds.right <= card.right && parseFloat(getComputedStyle(amount).fontSize) >= 16;
      }),
    }));
    check(label + '_actual_page_width_and_complete_amounts', geometry.page <= geometry.viewport + 1 && geometry.left >= -1 && geometry.right <= geometry.viewport + 1
      && geometry.tables.length === 2 && geometry.tables.every(table => table.columns === 10 && table.tabIndex === 0 && table.cells.every(Boolean)
        && (geometry.viewport >= 1180 || table.scroll > table.width)) && geometry.amounts.length === 2 && geometry.amounts.every(Boolean));
    snapshots.push({ label, actor, width: geometry.viewport, range, basis, currency, actual });
  };
  const capture = async (name, label, fullPage = false) => {
    const target = path.join(context.output, name);
    if (fullPage) await page.screenshot({ path: target, fullPage: true }); else await panel.screenshot({ path: target });
    fixture.images.push({ name, label, actor, width: page.viewportSize().width, actualPage: true, apiDoubles: false });
  };
  await open(1440, true);
  await verify('entry_without_objective', {});
  await capture('h3-entry-1440.png', '完整绩效管理页面无考核目标仍可打开销售业绩', true);
  actor = 'admin';
  page = sessions[actor].page;
  panel = page.getByRole('region', { name: '销售业绩', exact: true });
  for (const width of [1440, 375, 320]) {
    await open(width);
    await setPeriod(period.current);
    await verify('current_' + width, period.current);
    await capture('h3-current-' + width + '.png', '本月负业绩及真实合同与回款');
    if (width < 1180) {
      await panel.locator('[data-crm-sales-scroll]').evaluateAll(wrappers => wrappers.forEach(wrapper => {
        const cell = wrapper.querySelector('thead tr').cells[4];
        wrapper.scrollLeft = cell.offsetLeft - wrapper.offsetLeft;
      }));
      await capture('h3-current-amounts-' + width + '.png', '手机横向查看赢单和合同金额');
    }
    if (width === 1440 || width === 320) {
      await setPeriod(period.previous);
      await verify('previous_' + width, period.previous);
      await capture('h3-previous-' + width + '.png', '重查上月仍保留原赢单');
    }
  }
  await open(375); await setPeriod(period.current);
  await panel.getByLabel('币种', { exact: true }).fill('USD');
  await verify('usd_mobile', period.current, 'TEAM_V2', 'USD');
  await capture('h3-usd-375.png', '手机美元金额单独统计');
  await open(320); await setPeriod(period.current);
  await panel.locator('#crm-sales-basis').click();
  await page.getByRole('option', { name: '负责人（旧口径）', exact: true }).click();
  await verify('owner_v1_mobile', period.current, 'OWNER_V1', 'CNY');
  check('legacy_page_explains_estimated_contract_amount', (await panel.innerText()).includes('合同金额按赢单预期金额估算'));
  await capture('h3-owner-v1-320.png', '手机切换负责人旧口径及解释');
  fixture.pageSnapshots = snapshots;
  evidence.desktop = true; evidence.mobile = true;
}
