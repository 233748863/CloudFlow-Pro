import fs from 'node:fs/promises';
import path from 'node:path';
import { captureOwnedLostResponse } from './runtime-checks/owned-lost-response.mjs';

async function capture(context, page, scope, name, width) {
  const { directory, caseTag, fixture, check } = context;
  const output = path.join(directory, 'h2-overtime-payroll-period-ui-' + caseTag);
  await fs.mkdir(output, { recursive: true });
  await page.locator('.cf-toast-viewport').waitFor({ state: 'hidden', timeout: 15000 });
  // Select controls animate their minimum height when the viewport changes.
  // Measure after finite transitions finish; keep the same 44px requirement.
  await scope.evaluate(async element => {
    await new Promise(resolve => requestAnimationFrame(resolve));
    await Promise.all(element.getAnimations({ subtree: true }).filter(animation => Number.isFinite(animation.effect.getComputedTiming().endTime))
      .map(animation => animation.finished.catch(() => {})));
  });
  const layout = await scope.evaluate(element => ({
    documentWidth: document.documentElement.scrollWidth, available: element.clientWidth, content: element.scrollWidth,
    controls: [...element.querySelectorAll('button,input:not([type="checkbox"]),textarea')]
      .filter(control => control.getClientRects().length)
      .map(control => ({ width: control.getBoundingClientRect().width, height: control.getBoundingClientRect().height,
        label: control.getAttribute('aria-label') || control.textContent.trim().slice(0, 30) })),
  }));
  console.log('H2_OVERTIME_PAYROLL_PERIOD_LAYOUT ' + JSON.stringify({ name, width, ...layout }));
  check(`工资补正 ${name} ${width}px 内容不溢出`, layout.documentWidth <= width && layout.content <= layout.available + 1);
  if (width === 320) check(`工资补正 ${name} 手机操作区域至少44px`, layout.controls.every(control => control.width >= 44 && control.height >= 44));
  const file = path.join(output, `${name}-${width}.png`);
  await page.screenshot({ path: file, fullPage: true });
  fixture.payrollPeriodResolution.ui.images.push({ name: path.relative(directory, file), width, layout });
}

function settlementSection(page, detail) {
  return detail.locator('section').filter({ has: page.getByRole('heading', { name: '本人 / 财务授权结算', exact: true }) });
}

async function openDetail(context, width) {
  const page = context.sessions.admin.page, id = context.fixture.payrollPeriodResolution.requestId;
  await page.setViewportSize({ width, height: 1100 });
  await page.goto(`${new URL(page.url()).origin}/hr/overtime?id=${id}`, { waitUntil: 'domcontentloaded' });
  const detail = page.getByRole('dialog', { name: /加班详情$/ });
  await detail.getByRole('button', { name: '查看授权结算', exact: true }).click();
  await detail.getByRole('heading', { name: '本人 / 财务授权结算', exact: true }).waitFor();
  return { page, detail, section: settlementSection(page, detail) };
}

export async function resolveHrOvertimePayrollFromPage(context, input) {
  const { fixture, check, ok, save } = context, state = fixture.payrollPeriodResolution;
  const ui = state.ui = { images: [], posts: [], payrollReads: [], lostResponse: false, reread: false, passed: false };
  const { page, detail, section } = await openDetail(context, 1440);
  const endpoint = `/api/hr/attendance/overtime-requests/${state.requestId}/settlement/resolve`;
  const optionPath = '/api/hr/compensation/payroll/slips/paid-options';
  const errors = [];
  const onError = error => errors.push(error.message);
  const onRequest = request => {
    const url = new URL(request.url());
    if (url.pathname === endpoint && request.method() === 'POST') ui.posts.push(request.postDataJSON());
    if (url.pathname.startsWith('/api/hr/compensation/payroll/') && request.method() === 'GET') ui.payrollReads.push({ path: url.pathname, employeeId: url.searchParams.get('employeeId'), periodId: url.searchParams.get('periodId') });
  };
  page.on('pageerror', onError); page.on('request', onRequest);
  try {
    await detail.getByRole('button', { name: '处置结算异常', exact: true }).click();
    const form = page.getByRole('dialog', { name: '处置结算异常', exact: true });
    const submit = form.getByRole('button', { name: '确认处置', exact: true });
    check('工资补正页面未填完整时禁止提交', await submit.isDisabled());
    await form.getByRole('button', { name: '处置方式', exact: true }).click();
    const reading = page.waitForResponse(response => new URL(response.url()).pathname === optionPath && response.request().method() === 'GET');
    await page.getByRole('option', { name: '基于真实已发工资单补正', exact: true }).click();
    const response = await reading, body = await response.json();
    check('真实页面精确读取本人原周期独立已发工资选项', response.status() === 200 && body.code === 200
      && body.data.length === 1 && body.data[0].salarySlipId === state.seedSlipId
      && Object.keys(body.data[0]).sort().join(',') === 'periodMonth,salarySlipId');
    await form.getByRole('button', { name: '本次补正目标工资周期', exact: true }).click();
    check('工资补正页面目标排除原关闭周期', await page.getByRole('option').filter({ hasText: context.label + ' pay-source' }).count() === 0);
    await page.getByRole('option').filter({ hasText: context.label + ' pay-target' }).click();
    await form.getByRole('button', { name: '原周期已发工资单', exact: true }).click();
    check('页面没有混入其他周期原工资', await page.getByRole('option').filter({ hasText: fixture.payroll.paidSlipId }).count() === 0);
    await page.getByRole('option').filter({ hasText: state.seedSlipId }).click();
    await form.getByLabel('处置原因').fill(input.reason);
    check('工资补正填写完成后仍须明确勾选确认', await submit.isDisabled());
    await form.getByRole('checkbox').check();
    check('工资补正确认后允许提交且说明仍须审批与另行发放', await submit.isEnabled()
      && (await form.innerText()).includes('补正仍须经过原有工资补正审批；补正应用成功后才显示已结算，工资发放另行确认。'));
    await capture(context, page, form, 'form', 1440);
    await page.setViewportSize({ width: 320, height: 1100 });
    check('切换手机尺寸后原单目标和原因保留', (await form.innerText()).includes(state.seedSlipId)
      && (await form.innerText()).includes(context.label + ' pay-target') && await form.getByLabel('处置原因').inputValue() === input.reason);
    await capture(context, page, form, 'form', 320);
    const lost = captureOwnedLostResponse(() => {}), pattern = '**' + endpoint;
    await page.route(pattern, lost.handler);
    try {
      await submit.click();
      await form.getByText('服务未完成请求，请检查网络后重试；记录状态以重新读取为准。', { exact: true }).waitFor();
      check('工资补正响应丢失时保留所选原单及原因', (await form.innerText()).includes(state.seedSlipId)
        && await form.getByLabel('处置原因').inputValue() === input.reason);
      await capture(context, page, form, 'lost-response', 320);
    } finally { await page.unroute(pattern, lost.handler); lost.assertSucceeded(); }
    ui.lostResponse = true;
    await form.getByRole('button', { name: '取消', exact: true }).click();
    const rereading = page.waitForResponse(item => new URL(item.url()).pathname === `/api/hr/attendance/overtime-requests/${state.requestId}` && item.request().method() === 'GET');
    await detail.getByRole('button', { name: '重新读取详情', exact: true }).click();
    const reread = await rereading, refreshed = await reread.json();
    check('页面重读准确保留已批60分钟并显示补正待审批', reread.status() === 200 && refreshed.code === 200
      && refreshed.data.status === 'APPROVED' && refreshed.data.approvedMinutes === 60 && refreshed.data.settlementStatus === 'CORRECTION_PENDING');
    await detail.getByRole('heading', { name: '已记录的人工处置', exact: true }).waitFor();
    const result = await ok('admin', `/hr/attendance/overtime-requests/${state.requestId}/settlement`);
    check('重读已建立唯一关联补正且不能再处置', Boolean(result.payrollCorrectionId) && result.settlementStatus === 'CORRECTION_PENDING'
      && await detail.getByRole('button', { name: '处置结算异常', exact: true }).count() === 0);
    await detail.getByRole('heading', { name: '已记录的人工处置', exact: true }).evaluate(element => element.scrollIntoView({ block: 'center' }));
    await capture(context, page, section, 'pending-result', 320);
    const optionReads = ui.payrollReads.filter(item => item.path === optionPath);
    check('页面仅一次定向原单查询且没有批次或工资明细遍历', optionReads.length === 1
      && optionReads[0].employeeId === state.employeeId && optionReads[0].periodId === state.periods.source
      && ui.payrollReads.every(item => [optionPath, '/api/hr/compensation/payroll/config/periods'].includes(item.path)));
    check('工资补正仅一次真实页面提交且参数完整相符', ui.posts.length === 1 && Object.keys(ui.posts[0]).length === Object.keys(input).length
      && Object.entries(input).every(([key, value]) => ui.posts[0][key] === value));
    check('工资补正处置页面无未捕获错误', errors.length === 0);
    ui.reread = true; ui.passed = true;
    return result;
  } finally {
    page.off('pageerror', onError); page.off('request', onRequest);
    // The real mutation may already have succeeded before a later UI check fails.
    // Record its correction so the outer finally can complete real finance cleanup.
    const observed = await ok('admin', `/hr/attendance/overtime-requests/${state.requestId}/settlement`);
    if (observed.payrollCorrectionId) {
      state.linkedId = String(observed.payrollCorrectionId);
      if (!state.corrections.some(item => item.id === state.linkedId)) state.corrections.push({ id: state.linkedId, linked: true });
    }
    ui.recoveryObserved = true;
    await save();
  }
}

export async function reviewHrOvertimePayrollPaidPage(context) {
  const state = context.fixture.payrollPeriodResolution;
  for (const width of [1440, 320]) {
    const { page, detail, section } = await openDetail(context, width);
    const value = label => section.locator('dt').filter({ hasText: new RegExp('^' + label + '$') }).locator('..').locator('dd').innerText();
    await detail.getByRole('heading', { name: '已记录的人工处置', exact: true }).waitFor();
    context.check('发放后页面结算状态补正编号和原金额准确 ' + width, await value('结算执行状态') === '已结算'
      && await value('关联工资补正') === state.linkedId && Number(await value('服务端核定金额')) === 30.02
      && await value('原目标周期') === state.periods.source && await value('本次目标周期') === state.periods.target
      && await value('处置方式') === '工资补正');
    await detail.getByRole('heading', { name: '已记录的人工处置', exact: true }).evaluate(element => element.scrollIntoView({ block: 'center' }));
    await capture(context, page, section, 'settled-after-payment', width);
  }
  state.ui.afterPayment = true; await context.save();
}
