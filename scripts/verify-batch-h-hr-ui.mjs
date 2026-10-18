import path from 'node:path';
import {
  check, checks, failureSummary, logEvidence, openSessions, privateDirectory, registerLogMarker, saveResult,
} from './batch-h/live-lib.mjs';

const routes = {
  overtime: { path: '/hr/overtime', api: '/hr/attendance/overtime-requests', title: '加班管理', permission: 'hr:overtime:list' },
  shifts: { path: '/hr/shift-requests', api: '/hr/attendance/shift-requests', title: '调班管理', permission: 'hr:shift-request:list' },
  types: { path: '/hr/overtime-types', api: '/hr/attendance/overtime-types', title: '加班规则', permission: 'hr:overtime-type:list', array: true },
  myOvertime: { path: '/hr/ess/overtime', api: '/hr/attendance/overtime-requests/mine', title: '我的加班', permission: 'hr:overtime:mine' },
  myShifts: { path: '/hr/ess/shift-requests', api: '/hr/attendance/shift-requests/mine', title: '我的调班', permission: 'hr:shift-request:mine' },
  invitations: { path: '/hr/ess/shift-invitations', api: '/hr/attendance/shift-requests/invitations', title: '换班邀请', permission: 'hr:shift-request:respond' },
};
const cases = {
  admin1: [['overtime', true], ['shifts', true], ['types', true]],
  hr4: [['overtime', true], ['shifts', true], ['types', true]],
  employee5: [['myOvertime', true], ['myShifts', true], ['invitations', true], ['overtime', false], ['shifts', false], ['types', false]],
  finance3: [['overtime', true], ['shifts', false], ['types', false]],
  sales8: [['overtime', true], ['shifts', true], ['types', false]],
};
const networkFailures = [];
const reads = [];
const pendingReads = new Set();
const expectedPolicyRejections = new Set();
let attemptedWrites = 0;
let pageErrors = 0;
let activeStep = '初始化';
let activePage;
let sessions;
let failure;

function responseFor(page, endpoint) {
  return page.waitForResponse(response => new URL(response.url()).pathname === `/api${endpoint}`
    && response.request().method() === 'GET');
}

async function checkResponse(response, label, array = false, paginated = true) {
  const body = await response.json();
  check(`${label}真实读取成功`, response.status() === 200 && body?.code === 200,
    { status: response.status(), code: typeof body?.code === 'number' ? body.code : null });
  if (array) check(`${label}返回完整类型列表`, Array.isArray(body.data));
  else if (paginated) {
    check(`${label}返回真实分页记录`, Array.isArray(body.data?.rows) && Number.isSafeInteger(body.data.total));
    check(`${label}列表不返回时薪金额或密文`, body.data.rows.every(row => Object.keys(row)
      .every(key => !/^(hourlyRate|settlementAmount|hourlyRateCipher|settlementAmountCipher)$/i.test(key))));
  }
  return body.data;
}

async function closeDialog(dialog) {
  await dialog.getByRole('button', { name: '取消', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
}

async function inspectForm(page, kind, label) {
  const marker = registerLogMarker(`${label}未提交表单正文`);
  if (kind === 'myOvertime') {
    activeStep = `${label}申请配置`;
    const response = responseFor(page, '/hr/attendance/overtime-requests/options');
    await page.getByRole('button', { name: '登记加班', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '登记本人加班', exact: true });
    await dialog.waitFor({ state: 'visible' });
    const options = await checkResponse(await response, `${label}申请配置`, false, false);
    check(`${label}配置使用北京时间`, options?.businessTimezone === 'Asia/Shanghai' && Array.isArray(options.types));
    const configured = options.types.some(type => type.eligibleSettleModes?.some(mode => ['PAY', 'COMPENSATORY'].includes(mode)));
    if (configured) {
      await dialog.getByLabel('开始时间（北京时间）').fill('2026-09-12T18:00');
      await dialog.getByLabel('结束时间（北京时间）').fill('2026-09-12T19:00');
      await dialog.getByLabel('加班事由').fill(marker);
    } else {
      check(`${label}未核定规则时禁用申请控件`, await dialog.getByLabel('开始时间（北京时间）').isDisabled()
        && await dialog.getByLabel('结束时间（北京时间）').isDisabled()
        && await dialog.getByText('尚未配置可申请的加班类型、补偿方式或北京时间规则。请由有权经办人核定后再登记，当前无法保存。', { exact: true }).isVisible());
    }
    check(`${label}完成预检前禁止保存`, await dialog.getByRole('button', { name: '保存草稿', exact: true }).isDisabled());
    await closeDialog(dialog);
  } else if (kind === 'myShifts') {
    activeStep = `${label}排班选项`;
    await page.getByRole('button', { name: '登记调班', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '登记本人调班', exact: true });
    await dialog.waitFor({ state: 'visible' });
    const response = responseFor(page, '/hr/attendance/shift-requests/options');
    const tomorrow = new Date(Date.now() + 32 * 60 * 60 * 1000).toISOString().slice(0, 10);
    await dialog.getByLabel('考勤日期（北京时间）').fill(tomorrow);
    const optionsResponse = await response;
    const optionsBody = await optionsResponse.json();
    if (optionsResponse.status() === 409 && optionsBody?.code === 'MINIMUM_REST_NOT_CONFIGURED') {
      expectedPolicyRejections.add('/api/hr/attendance/shift-requests/options:MINIMUM_REST_NOT_CONFIGURED');
      await dialog.getByText('排班选项读取失败', { exact: true }).waitFor({ state: 'visible' });
      check(`${label}未核定休息间隔时安全阻止申请`, await dialog.getByRole('button', { name: '保存草稿', exact: true }).isDisabled());
    } else {
      const options = await checkResponse(optionsResponse, `${label}排班选项`, false, false);
      check(`${label}排班归属日期匹配`, options?.attendanceDate === tomorrow);
    }
    await dialog.getByLabel('调班事由').fill(marker);
    check(`${label}完成排班预检前禁止保存`, await dialog.getByRole('button', { name: '保存草稿', exact: true }).isDisabled());
    await closeDialog(dialog);
  } else if (kind === 'types') {
    activeStep = `${label}配置表单`;
    await page.getByRole('button', { name: '新增加班类型', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '新增加班类型（停用）', exact: true });
    await dialog.waitFor({ state: 'visible' });
    await dialog.getByLabel('类型编码').waitFor({ state: 'visible' });
    check(`${label}新增类型明确保持停用`, await dialog.getByLabel('类型编码').isVisible()
      && await dialog.getByLabel('类型名称').isVisible());
    await page.getByText('正在读取薪资项目配置', { exact: true }).waitFor({ state: 'hidden' });
    await page.getByText('正在读取合格调休假种', { exact: true }).waitFor({ state: 'hidden' });
    await closeDialog(dialog);
  }
}

try {
  sessions = await openSessions(Object.keys(cases));
  for (const [actor, scenarios] of Object.entries(cases)) {
    const { page, context, information } = sessions[actor];
    page.on('pageerror', () => { pageErrors++; });
    await context.route('**/api/hr/**', async route => {
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(route.request().method())) {
        attemptedWrites++;
        await route.abort('blockedbyclient');
      } else await route.continue();
    });
    page.on('response', response => {
      const pathname = new URL(response.url()).pathname;
      if (!pathname.startsWith('/api/hr/') || response.request().method() !== 'GET') return;
      reads.push({ actor, path: pathname, status: response.status() });
      const pending = (async () => {
        let code;
        try { code = (await response.json())?.code; } catch { return; }
        if (response.status() >= 400 || code != null && code !== 200) networkFailures.push({ actor, path: pathname,
          status: response.status(), code: typeof code === 'number' || /^[A-Z0-9_]+$/.test(String(code)) ? code : null });
      })();
      pendingReads.add(pending);
      void pending.finally(() => pendingReads.delete(pending));
    });
    for (const [kind, allowed] of scenarios) {
      const route = routes[kind];
      const label = `${actor} ${route.title}`;
      activeStep = `${label}页面读取`;
      activePage = page;
      const permissions = information.permissions || [];
      check(`${label}实际权限符合角色矩阵`, (permissions.includes('*:*:*') || permissions.includes(route.permission)) === allowed);
      const before = reads.length;
      const response = allowed ? responseFor(page, route.api) : null;
      await page.goto(route.path, { waitUntil: 'domcontentloaded' });
      if (!allowed) {
        await page.getByText(/^(权限不足|无权访问此页面|菜单路由未配置)$/).first().waitFor({ state: 'visible' });
        check(`${label}页面拒绝且不发起业务读取`, await page.locator('.admin-source-page').count() === 0
          && reads.slice(before).every(read => read.path !== `/api${route.api}`));
        continue;
      }
      await checkResponse(await response, label, route.array);
      await page.locator('.admin-source-page').getByRole('heading', { name: route.title, exact: true }).waitFor({ state: 'visible' });
      check(`${label}真实页面成功展示`, await page.locator('.admin-source-page').count() === 1);
      check(`${label}页面没有横向溢出`, await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
      if (kind === 'overtime' || kind === 'shifts') check(`${label}管理页不冒用本人登记入口`,
        await page.getByRole('button', { name: kind === 'overtime' ? '登记加班' : '登记调班', exact: true }).count() === 0);
      if (['myOvertime', 'myShifts', 'types'].includes(kind)) await inspectForm(page, kind, label);
    }
  }
  await Promise.all([...pendingReads]);
  const unexpectedFailures = networkFailures.filter(record => !expectedPolicyRejections.has(`${record.path}:${record.code}`));
  check('HR真实页面关联读取没有权限或服务错误', unexpectedFailures.length === 0, { failures: unexpectedFailures });
  check('HR页面验证未尝试写入业务或政策', attemptedWrites === 0);
  check('HR真实页面无未捕获异常', pageErrors === 0);
  check('HR未提交表单内容没有进入浏览器日志', logEvidence().browserLeaks.length === 0);
  console.log(`PASS H HR真实只读页面 ${checks.length} 项检查`);
} catch (error) {
  failure = error;
  await activePage?.screenshot({ path: path.join(privateDirectory, 'hr09-ui-failure.png'), fullPage: true }).catch(() => {});
  console.log(JSON.stringify({ ...failureSummary(error), activeStep,
    errorType: error?.name === 'TimeoutError' ? 'TimeoutError' : 'Error' }));
  process.exitCode = 1;
} finally {
  await saveResult('hr09-ui', failure, { scope: 'READ_ONLY_REAL_BROWSER', roles: Object.keys(cases), activeStep,
    attemptedWrites, pageErrors, networkFailures, expectedPolicyRejections: [...expectedPolicyRejections], requestsChecked: reads.length, policyWrites: false });
  await sessions?.browser.close();
}
