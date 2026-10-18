import path from 'node:path';

async function openPage(context, actor, width) {
  const page = context.sessions[actor].page;
  await page.setViewportSize({ width, height: 1050 });
  await page.goto(context.origin + '/crm/deal-allocations', { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: '业绩与提成事实', exact: true, level: 2 }).waitFor();
  await page.locator('p:visible').filter({ hasText: context.fixture.planName }).first().waitFor();
  return page;
}

async function capture(context, page, name, label, actor) {
  const width = page.viewportSize().width;
  context.check(name + '_no_horizontal_page_overflow', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await page.screenshot({ path: path.join(context.output, name + '.png'), fullPage: true });
  context.fixture.images.push({ name: name + '.png', label, actor, width, actualPage: true, apiDoubles: false });
}

export async function confirmH3CommissionOnPage(context) {
  const page = await openPage(context, 'admin', 1440);
  await page.getByRole('checkbox', { name: '选择分配记录 ' + context.fixture.original[0].id, exact: true }).check();
  await page.getByRole('button', { name: '核定提成', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '核定到账提成', exact: true });
  await dialog.waitFor();
  await dialog.getByRole('spinbutton', { name: '提成比例（%）', exact: true }).fill('12.34');
  await dialog.getByRole('textbox', { name: '核定依据', exact: true }).fill(context.marker + '_提成核定依据');
  await capture(context, page, 'commission-confirm-desktop', '电脑实际核定提成弹窗', 'admin');
  const response = page.waitForResponse(value => new URL(value.url()).pathname === '/api/crm/commission/confirm' && value.request().method() === 'POST');
  await dialog.getByRole('button', { name: '确认核定', exact: true }).click();
  const result = await (await response).json();
  context.check('actual_page_confirms_exact_rate_and_basis', result.code === 200);
  await dialog.waitFor({ state: 'hidden' });
  context.check('page_confirmation_persisted_real_source', context.commissionRows(context.fixture.receipt)[0].commission === '7.41');
}

export async function postH3CommissionOnPage(context) {
  const page = await openPage(context, 'admin', 1440);
  for (const id of context.fixture.allocationIds) await page.getByRole('checkbox', { name: '选择分配记录 ' + id, exact: true }).check();
  await page.getByRole('button', { name: '传送至工资', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '传送提成至工资', exact: true });
  await dialog.waitFor();
  const period = dialog.getByRole('combobox', { name: '工资周期', exact: true });
  await period.locator('option[value="' + context.fixture.previousPeriod + '"]').waitFor({ state: 'attached' });
  await period.selectOption(context.fixture.previousPeriod);
  await dialog.getByRole('combobox', { name: '薪资项目', exact: true }).selectOption(context.fixture.component);
  await capture(context, page, 'commission-post-desktop', '电脑实际选择工资周期与薪资项目', 'admin');
  for (const width of [375, 320]) {
    await page.setViewportSize({ width, height: 1050 });
    context.check('mobile_post_inputs_accessible_' + width, await period.isVisible() && await dialog.getByRole('button', { name: '确认传送', exact: true }).isVisible());
    await capture(context, page, 'commission-post-' + width, width + '像素实际提成传送弹窗', 'admin');
  }
  await page.setViewportSize({ width: 1440, height: 1050 });
  const response = page.waitForResponse(value => new URL(value.url()).pathname === '/api/crm/commission/post' && value.request().method() === 'POST');
  await dialog.getByRole('button', { name: '确认传送', exact: true }).click();
  const result = await (await response).json();
  context.check('actual_page_posts_original_and_refunds', result.code === 200 && result.data?.sources === 4);
  context.check('actual_page_does_not_claim_completion_during_source_failure', result.data?.pending === true && result.data?.synchronizedSources < 4);
  await dialog.waitFor({ state: 'hidden' });
}

export async function verifyH3CommissionFinalPages(context) {
  for (const width of [1440, 375, 320]) {
    const page = await openPage(context, 'admin', width);
    await page.locator('p:visible, dd:visible').filter({ hasText: '已扣回' }).first().waitFor();
    context.check('actual_page_distinguishes_paid_and_recovered_' + width, await page.locator('p:visible, dd:visible').filter({ hasText: '已发放' }).first().isVisible()
      && await page.locator('p:visible, dd:visible').filter({ hasText: '已扣回' }).first().isVisible());
    if (width < 768) {
      const cards = page.getByRole('article');
      context.check('mobile_full_business_names_visible_' + width, await cards.count() >= 6 && await cards.filter({ hasText: context.fixture.planName }).count() === 6);
    }
    await capture(context, page, 'commission-paid-' + width, width + '像素实际已发放与已扣回记录', 'admin');
  }
  const manager = await openPage(context, 'manager', 320);
  context.check('manager_real_page_has_no_commission_actions_or_values', await manager.getByRole('button', { name: '核定提成', exact: true }).count() === 0
    && await manager.getByRole('button', { name: '传送至工资', exact: true }).count() === 0
    && await manager.getByText('工资处理', { exact: true }).count() === 0 && await manager.getByRole('checkbox').count() === 0);
  await capture(context, manager, 'commission-manager-320', '销售主管实际手机页面隐藏提成及工资信息', 'manager');
  context.evidence.desktop = true; context.evidence.mobile = true;
}
