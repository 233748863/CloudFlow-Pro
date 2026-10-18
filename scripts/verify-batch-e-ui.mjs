import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const browserHome = process.env.CLOUDFLOW_PLAYWRIGHT_HOME || path.join(root, '.cloudflow-runtime', 'playwright');
const requireBrowser = createRequire(path.join(browserHome, 'package.json'));
const { chromium } = requireBrowser('playwright-core');
const origin = process.env.CLOUDFLOW_UI_PREVIEW || 'http://127.0.0.1:4188';
assert.equal(new URL(origin).hostname, '127.0.0.1', 'Only an isolated loopback preview is allowed');
const pages = [
  ['activity', 'CrmActivityPage', '客户活动', /活动日历/],
  ['sla', 'CrmSlaPage', '服务等级', /服务等级|SLA/],
  ['lost-analysis', 'CrmLostAnalysisPage', '丢单与竞对', /丢单/],
  ['credit', 'CrmCreditPage', '客户信用', /客户信用/],
  ['territory', 'CrmTerritoryPage', '销售区域', /销售区域/],
  ['lead-score', 'CrmLeadScorePage', '线索评分', /线索评分/],
  ['campaign', 'CrmCampaignPage', '营销活动', /营销活动经营/],
  ['target-list', 'CrmTargetListPage', '营销目标名单', /营销目标名单/],
  ['profile-report', 'CrmProfileReportPage', '客户分层', /客户分层/],
];
const menus = pages.map(([routePath, component, menuName], index) => ({ menuId: 1550 + index * 10, parentId: 0, orderNum: index, path: `/office/crm/${routePath}`, component: `pages/${component}`, menuName, menuType: 'C', visible: '0', status: '0', icon: 'Users' }));
const customer = { customerId: 900020, customerCode: 'E-UI', customerName: '隔离客户验收', ownerId: 1, ownerName: '隔离验收', status: 'ACTIVE', version: 0 };
const territory = { territoryId: 900020, territoryCode: 'E-UI', territoryName: '隔离区域验收', parentId: 0, levelPath: '/900020/', sortNo: 0, status: 'ACTIVE', version: 0 };
const list = { listId: 900020, listCode: 'E-UI', listName: '隔离名单验收', sourceType: 'MANUAL', status: 'ACTIVE', memberCount: 1, optedOutCount: 0, ownerId: 1, version: 0 };
const campaign = { campaignId: 900020, campaignName: '隔离营销验收', campaignCode: 'E-UI', campaignType: 'EVENT', status: 'PLANNING', startDate: '2026-09-01', endDate: '2026-09-30', budget: '1000.00', actualCost: '0.00', revenue: '0.00', roi: null, ownerId: 1, ownerName: '隔离验收', version: 0, sentCount: 0, deliveredCount: 0, openedCount: 0, clickedCount: 0, bouncedCount: 0, unsubscribedCount: 0, leadCreatedCount: 0, opportunityCreatedCount: 0, wonOpportunityCount: 0 };
let activity = { activity: { activityId: 900020, activityType: 'MEETING', subject: '隔离活动验收', status: 'PLANNED', priority: 'MEDIUM', startTime: '2026-09-08 09:00:00', endTime: '2026-09-08 10:00:00', bizType: 'NONE', ownerId: 1, ownerName: '隔离验收', version: 0 }, participants: [{ participantType: 'USER', participantRefId: 1, participantName: '隔离验收', acceptanceStatus: 'NONE' }], reminders: [{ channelType: 'INTERNAL', remindMinutesBefore: 15 }], conflicts: [] };
const emptyPage = { rows: [], records: [], list: [], total: 0, pageNum: 1, pageSize: 20 };
const results = [];
const errors = [];
const writes = [];
const requests = new Set();
let permissions = ['*:*:*'];
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: 'Asia/Shanghai', serviceWorkers: 'block' });
await context.addCookies([{ name: 'XSRF-TOKEN', value: 'batch-e-local-only', url: origin }]);
await context.routeWebSocket('**/*', socket => socket.close());
await context.route('**/*', async route => {
  const request = route.request(); const address = new URL(request.url());
  if (address.origin !== origin) return route.abort();
  if (!address.pathname.startsWith('/api/')) {
    if (!['GET', 'HEAD'].includes(request.method())) return route.abort();
    return route.continue();
  }
  const apiPath = address.pathname.substring(4); requests.add(apiPath);
  let data = [];
  if (!['GET', 'HEAD'].includes(request.method())) {
    const body = request.postDataJSON(); writes.push({ path: apiPath, method: request.method(), body });
    if (apiPath === '/crm/activity') {
      activity = { ...body, activity: { ...body.activity, activityId: body.activity.activityId || 900021, ownerId: 1, version: (body.activity.version || 0) + 1 }, conflicts: [] };
      data = activity;
    } else data = 900020;
  } else if (apiPath === '/auth/info') data = { user: { userId: 1, userName: 'isolated-check', nickName: '隔离验收', tenantId: 100000, deptId: 100, status: '0' }, roles: ['crm'], permissions };
  else if (apiPath === '/auth/getRouters') data = menus;
  else if (apiPath === '/crm/activity/list') data = { ...emptyPage, rows: [activity.activity], total: 1 };
  else if (/^\/crm\/activity\/\d+$/.test(apiPath)) data = activity;
  else if (apiPath === '/crm/sla/report') data = { total: { key: 'TOTAL', total: 0, responded: 0, resolved: 0, responseMet: 0, resolutionMet: 0, responseRate: null, resolutionRate: null, averageResponseMinutes: null, averageResolutionMinutes: null }, groups: [], trend: [], breachedTickets: [] };
  else if (apiPath === '/crm/sla/calendars') data = [{ calendarId: 100, calendarName: '标准工作日历', status: 'ENABLED' }];
  else if (apiPath === '/crm/sla/priorities') data = [[60, 240], [240, 480], [480, 1440], [1440, 4320]].map(([response, resolution], index) => ({ priorityCode: `P${index + 1}`, priorityName: `P${index + 1}`, firstResponseMinutes: response, resolutionMinutes: resolution }));
  else if (apiPath === '/crm/lost-analysis/report') data = { reasons: [], competitors: [], trend: [] };
  else if (/^\/crm\/lost-analysis\/(reasons|competitors)$/.test(apiPath)) data = emptyPage;
  else if (apiPath === '/crm/territory/tree') data = [territory];
  else if (apiPath === '/crm/profile-report') data = { funnel: { UNQUALIFIED: 0, QUALIFYING: 0, QUALIFIED: 0, DISQUALIFIED: 0, CONVERTED: 0 }, distribution: [] };
  else if (apiPath === '/crm/campaign/list') data = { ...emptyPage, rows: [campaign], total: 1 };
  else if (/^\/crm\/campaign\/\d+$/.test(apiPath)) data = { campaign, targetLists: [] };
  else if (apiPath === '/crm/target-list/list') data = [list];
  else if (/^\/crm\/target-list\/\d+$/.test(apiPath)) data = { list, members: [{ memberType: 'CUSTOMER', memberRefId: customer.customerId, memberName: customer.customerName, email: 'c***@example.com', phone: '138****5678', optedOutFlag: 0 }], visibleMemberCount: 1 };
  else if (/^\/crm\/credit\/customer\/\d+$/.test(apiPath)) data = { credit: null, occupied: 0, overdue: 0, available: null, effective: false, bypassActive: false, pendingApproval: null };
  else if (apiPath === '/crm/customer/list') data = { ...emptyPage, rows: [customer], total: 1 };
  else if (/unread.*count|unreadCount/i.test(apiPath)) data = 0;
  else if (/\/list$|\/page$/.test(apiPath)) data = emptyPage;
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 200, msg: '隔离模拟响应', data }) });
});
const page = await context.newPage(); page.setDefaultTimeout(15000);
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
const outputDirectory = path.join(root, '.cloudflow-runtime', 'playwright');
await fs.mkdir(outputDirectory, { recursive: true });
try {
  for (const [routePath, , , heading] of pages) {
    await page.goto(`${origin}/office/crm/${routePath}`, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: heading }).first().waitFor();
    assert.equal(await page.getByRole('alert').count(), 0, `${routePath} has no loading error`);
    await page.screenshot({ path: path.join(outputDirectory, `batch-e-page-${routePath}.png`), fullPage: true });
    results.push({ route: routePath, rendered: true });
  }
  await page.goto(`${origin}/office/crm/activity`, { waitUntil: 'networkidle' });
  await page.getByRole('combobox', { name: '显示方式' }).selectOption('list');
  await page.getByRole('button', { name: '详情', exact: true }).click();
  const dialog = page.getByRole('dialog');
  assert.deepEqual(await dialog.getByRole('combobox', { name: '活动状态', exact: true }).locator('option').evaluateAll(options => options.map(option => option.value)), ['PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NOT_HELD']);
  assert.deepEqual(await dialog.getByRole('combobox', { name: '隔离验收接受状态' }).locator('option').evaluateAll(options => options.map(option => option.value)), ['NONE', 'ACCEPTED', 'DECLINED', 'TENTATIVE']);
  await dialog.getByLabel('主题', { exact: true }).fill('改期后的客户通话');
  await dialog.getByRole('combobox', { name: '活动类型', exact: true }).selectOption('CALL');
  await dialog.getByRole('combobox', { name: '通话方向' }).selectOption('INBOUND');
  await dialog.getByLabel('开始时间', { exact: true }).fill('2026-09-11T10:00');
  await dialog.getByLabel('结束时间', { exact: true }).fill('2026-09-11T11:00');
  await dialog.getByRole('combobox', { name: '隔离验收接受状态' }).selectOption('ACCEPTED');
  const saved = page.waitForResponse(response => response.url().endsWith('/api/crm/activity') && response.request().method() === 'PUT');
  await dialog.getByRole('button', { name: '保存活动', exact: true }).click(); await saved;
  const write = writes.find(item => item.path === '/crm/activity' && item.method === 'PUT'); assert.ok(write);
  assert.equal(write.body.activity.startTime, '2026-09-11 10:00:00'); assert.equal(write.body.activity.direction, 'INBOUND');
  assert.equal(write.body.participants[0].acceptanceStatus, 'ACCEPTED'); assert.equal(write.body.reminders[0].remindMinutesBefore, 15);
  await page.screenshot({ path: path.join(outputDirectory, 'batch-e-activity.png'), fullPage: true });
  results.push({ check: 'shared-state-values-and-reschedule-payload', passed: true });
  await page.goto(`${origin}/office/crm/campaign`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: '详情', exact: true }).click();
  const blocked = page.getByRole('dialog').getByRole('button', { name: /群发/ }); await blocked.waitFor();
  assert.equal(await blocked.isDisabled(), true, 'E5-b cannot send');
  await blocked.scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(outputDirectory, 'batch-e-campaign.png'), fullPage: true });
  results.push({ check: 'blocked-email-path-visible-and-disabled', passed: true });
  permissions = ['crm:activity:list', 'crm:target-list:list', 'crm:campaign:list', 'crm:territory:list'];
  await page.goto(`${origin}/office/crm/activity`, { waitUntil: 'networkidle' });
  assert.equal(await page.getByRole('button', { name: '创建活动', exact: true }).count(), 0, 'read-only user cannot create');
  await page.getByRole('combobox', { name: '显示方式' }).selectOption('list'); await page.getByRole('button', { name: '详情', exact: true }).click();
  assert.equal(await page.getByRole('dialog').getByRole('button', { name: '保存活动', exact: true }).count(), 0, 'read-only user cannot edit');
  await page.goto(`${origin}/office/crm/target-list`, { waitUntil: 'networkidle' });
  assert.equal(await page.getByRole('button', { name: '导出', exact: true }).count(), 0, 'read permission does not include raw export');
  assert.equal(await page.getByRole('button', { name: '新建名单', exact: true }).count(), 0, 'read permission does not include list write');
  results.push({ check: 'read-only-actions-and-export-permission', passed: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${origin}/office/crm/activity`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: '客户活动', exact: true }).waitFor();
  await page.getByRole('button', { name: '查看与办理', exact: true }).click();
  await page.getByRole('dialog').waitFor();
  assert.equal(await page.getByRole('dialog').getByRole('button', { name: '完成活动', exact: true }).count(), 0, 'mobile read-only user cannot complete');
  await page.screenshot({ path: path.join(outputDirectory, 'batch-e-mobile.png'), fullPage: true });
  results.push({ check: 'mobile-activity-read-only-entry', passed: true, crmMobileSupported: true, mockedResponses: true });
  assert.deepEqual(errors, [], 'No browser runtime or console errors');
  assert.equal(writes.some(write => /send|mass-email|track|unsubscribe/.test(write.path)), false, 'Blocked email paths never requested');
  console.log(`PASS: ${pages.length} CRM pages, shared activity states, reschedule payload, read-only/export permissions and blocked email UI`);
} catch (error) {
  await page.screenshot({ path: path.join(outputDirectory, 'batch-e-failure.png'), fullPage: true });
  console.error(await page.locator('body').innerText());
  throw error;
} finally {
  await fs.writeFile(path.join(root, '.cloudflow-runtime', 'batch-e-ui-results.json'), JSON.stringify({ results, errors, requests: [...requests], writes }, null, 2));
  await context.close(); await browser.close();
}
