import { check, failureSummary, readFixture, until } from './live-lib.mjs';
import { ensureRoles } from './oa08-identities.mjs';
import { id, requestPath, roles, stockPath } from './oa08-live.mjs';

async function button(scope, name, expected, label) {
  const locator = scope.getByRole('button', { name, exact: true });
  check(label, await locator.count() === (expected ? 1 : 0) && (!expected || await locator.isVisible() && await locator.isEnabled()));
}

async function open(page, route, endpoint, label) {
  const [response] = await Promise.all([
    page.waitForResponse(reply => reply.request().method() === 'GET' && new URL(reply.url()).pathname.endsWith(endpoint), { timeout: 45000 }),
    page.goto(route, { waitUntil: 'domcontentloaded' }),
  ]);
  check(label, response.status() === 200);
}

async function loaded(root, label) {
  await until(() => root.locator('tbody [role="status"]').count(), count => count === 0, label, 45000);
  check(label, await root.getByRole('alert').count() === 0);
}

async function costHeader(scope, name, expected, label) {
  const header = scope.locator('th').filter({ hasText: new RegExp(`^${name}$`) });
  check(label, await header.count() === (expected ? 1 : 0) && (!expected || await header.isVisible()));
}

async function deniedPage(page, route, selector, message, endpoint, label) {
  const successfulReads = [];
  const observe = response => {
    if (response.request().method() === 'GET' && new URL(response.url()).pathname.includes(endpoint) && response.status() === 200) {
      successfulReads.push(response.status());
    }
  };
  page.on('response', observe);
  try {
    await page.goto(route, { waitUntil: 'domcontentloaded' });
    await page.getByText(message, { exact: true }).or(page.getByText('权限不足', { exact: true }))
      .or(page.getByText('菜单路由未配置', { exact: true })).first().waitFor();
    check(label, new URL(page.url()).pathname === route && await page.locator(selector).count() === 0 && successfulReads.length === 0);
  } finally { page.off('response', observe); }
}

export async function roleUi(live, actor, roleId, requestId) {
  await live.step(`browser:role-${roleId}`, async () => {
    const page = live.sessions[actor].page;
    const request = await live.ok(actor, `${requestPath}/${id(requestId)}`);
    const cost = [1, 2, 3].includes(roleId);
    await open(page, `/admin/consumable-request?requestId=${requestId}`, `${requestPath}/${requestId}`, `角色${roleId}浏览器实际读取本人领用详情`);
    const workspace = page.locator('.consumable-request-page');
    await workspace.getByRole('heading', { name: '耗材领用', exact: true }).waitFor();
    const dialog = page.getByRole('dialog');
    await dialog.waitFor();
    await button(workspace, '新建申请', true, `角色${roleId}新建领用入口真实可用`);
    const navigation = workspace.getByRole('navigation', { name: '领用数据范围' });
    await button(navigation, '我的申请', true, `角色${roleId}本人范围入口可用`);
    await button(navigation, '部门范围', [1, 2, 8].includes(roleId), `角色${roleId}部门范围按钮与后台授权一致`);
    await button(navigation, '待发料 / 发料记录', [1, 2, 7].includes(roleId), `角色${roleId}发料队列按钮与后台授权一致`);
    await costHeader(workspace, '申请估价', cost, `角色${roleId}本人申请估价列按成本权限显示`);
    await costHeader(dialog, '估价', cost, `角色${roleId}申请明细估价列按成本权限显示`);
    await button(dialog, '提交审批', request.status === 'DRAFT', `角色${roleId}提交按钮遵守本人及草稿状态`);
    await button(dialog, '编辑草稿', ['DRAFT', 'REJECTED'].includes(request.status), `角色${roleId}编辑按钮遵守本人及单据状态`);
    await button(dialog, '分批发料', request.status === 'APPROVED' && [1, 2, 7].includes(roleId), `角色${roleId}发料按钮与后台权限及状态一致`);
    await dialog.getByRole('button', { name: '关闭', exact: true }).click();
    await workspace.getByRole('button', { name: '新建申请', exact: true }).click();
    await page.getByRole('dialog').getByText('新建耗材领用申请', { exact: true }).waitFor();
    await button(page.getByRole('dialog'), '保存草稿', true, `角色${roleId}可打开真实领用编辑器`);
    await page.getByRole('dialog').getByRole('button', { name: '关闭', exact: true }).click();
    if ([1, 2, 3, 7].includes(roleId)) {
      const materialId = live.fixture.scenarios.inventory?.materialId;
      const last = materialId && live.proof(materialId).ledger.at(-1);
      check('浏览器台账检查使用已真实记账的H耗材', !!last && !last.reversalOf);
      await open(page, `/admin/consumable-ledger?ledgerId=${last.id}`, `${stockPath}/ledger/${last.id}`, `角色${roleId}浏览器实际读取库存台账`);
      const ledger = page.locator('.consumable-ledger-page');
      await ledger.getByRole('heading', { name: '耗材台账', exact: true }).waitFor();
      await page.getByRole('dialog').waitFor();
      await button(page.getByRole('dialog'), '整笔冲正', [1, 2].includes(roleId), `角色${roleId}整笔冲正按钮与后台授权一致`);
      check(`角色${roleId}台账详情成本只对授权身份展示`, await page.getByRole('dialog').getByText('本笔成本 / 本笔后均价', { exact: true }).count() === (cost ? 1 : 0));
      await page.getByRole('dialog').getByRole('button', { name: '关闭', exact: true }).click();
      await loaded(ledger, `角色${roleId}台账表格真实加载成功`);
    } else {
      await deniedPage(page, '/admin/consumable-ledger', '.consumable-ledger-page', '无耗材台账查看权限。',
        `${stockPath}/ledger`, `角色${roleId}直接访问台账页面明确拒绝且不读取台账`);
    }
    if (cost) {
      await open(page, '/admin/consumable-reports', `${stockPath}/reports/stock`, `角色${roleId}浏览器真实加载进出存报表`);
      const reports = page.locator('.consumable-reports-page');
      await reports.getByRole('heading', { name: '耗材报表', exact: true }).waitFor();
      for (const [name, endpoint] of [['领用统计', 'usage'], ['成本', 'cost']]) {
        const [response] = await Promise.all([
          page.waitForResponse(reply => reply.request().method() === 'GET' && new URL(reply.url()).pathname.endsWith(`${stockPath}/reports/${endpoint}`)),
          reports.getByRole('navigation', { name: '耗材报表类型' }).getByRole('button', { name, exact: true }).click(),
        ]);
        check(`角色${roleId}真实切换${name}报表成功`, response.status() === 200);
        await loaded(reports, `角色${roleId}${name}报表未出现加载错误`);
      }
    } else {
      await deniedPage(page, '/admin/consumable-reports', '.consumable-reports-page', '无耗材报表查看权限。',
        `${stockPath}/reports`, `角色${roleId}直接访问成本报表页面明确拒绝且不读取报表`);
    }
  });
}

export async function browser(live) {
  const materialId = await live.material('matrix');
  const identities = await readFixture('oa08-identities');
  const available = roles.map((actor, index) => ({ actor, roleId: index + 1 }))
    .filter(({ actor }) => live.sessions[actor]?.page || identities.accounts?.[actor]?.userId && !identities.accounts[actor].borrowed);
  const failures = [];
  for (const { actor, roleId } of available) {
    try {
      await ensureRoles(live, [actor]);
      const request = await live.createRequest(`matrix-role-${roleId}`, actor, [{ consumableId: materialId, applyQuantity: 1 }]);
      await roleUi(live, actor, roleId, id(request.requestId));
    } catch (error) { failures.push({ roleId, error }); console.error(JSON.stringify({ role: roleId, failure: failureSummary(error) })); }
  }
  await recordBrowserCoverage(live, available.map(value => value.roleId), failures.map(value => value.roleId));
  if (failures.length) throw failures[0].error;
  check('本轮实际可用身份均完成浏览器核验且仍保留十一角色目标', available.length > 0
    && available.every(value => live.fixture.steps[`browser:role-${value.roleId}`]?.passed));
}

export async function recordBrowserCoverage(live, attempted = [], failed = []) {
  const required = roles.map((_, index) => index + 1);
  const passed = required.filter(roleId => live.fixture.steps[`browser:role-${roleId}`]?.passed);
  const backendPassed = required.filter(roleId => live.fixture.steps[`matrix:role-${roleId}`]?.passed);
  live.fixture.browserCoverage = { required, attempted, passed, failed, backendPassed,
    remaining: required.filter(roleId => !passed.includes(roleId) || !backendPassed.includes(roleId)), checkedAt: new Date().toISOString() };
  await live.persist();
}
