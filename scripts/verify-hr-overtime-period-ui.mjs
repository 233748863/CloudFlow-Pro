import fs from 'node:fs/promises';
import path from 'node:path';
import { captureOwnedLostResponse } from './runtime-checks/owned-lost-response.mjs';

// Every mutation is submitted by the real page. Only the response of one
// successful owned submission is discarded to exercise an uncertain outcome.
export async function resolveHrOvertimePeriodFromPage(context, name, input) {
  const { sessions, fixture, directory, caseTag, check, ok } = context;
  const state = fixture.periodResolution, id = state.requests[name];
  const page = sessions.hr.page, width = name === 'adjustFirst' ? 1440 : 320;
  const loseResponse = name === 'adjustSecond';
  const endpoint = `/api/hr/attendance/overtime-requests/${id}/settlement/resolve`;
  const output = path.join(directory, 'h2-overtime-period-ui-' + caseTag);
  await fs.mkdir(output, { recursive: true });
  const evidence = { requestId: id, width, action: input.action, posts: [], images: [], lostResponse: false, reread: false };
  state.ui ||= {};
  state.ui[name] = evidence;
  const errors = [];
  const onError = error => errors.push(error.message);
  const onRequest = request => {
    if (new URL(request.url()).pathname === endpoint && request.method() === 'POST') evidence.posts.push(request.postDataJSON());
  };
  page.on('pageerror', onError);
  page.on('request', onRequest);
  const capture = async (suffix, scope) => {
    await page.locator('.cf-toast-viewport').waitFor({ state: 'hidden', timeout: 15000 });
    const layout = await scope.evaluate(element => ({
      documentWidth: document.documentElement.scrollWidth, available: element.clientWidth, content: element.scrollWidth,
      controls: [...element.querySelectorAll('button,input:not([type="checkbox"]),textarea')]
        .filter(control => control.getClientRects().length)
        .map(control => ({ width: control.getBoundingClientRect().width, height: control.getBoundingClientRect().height })),
    }));
    check(`周期处置 ${name}/${suffix} ${width}px 内容不溢出`, layout.documentWidth <= width && layout.content <= layout.available + 1);
    if (width === 320) check(`周期处置 ${name}/${suffix} 手机操作区域至少44px`, layout.controls.every(control => control.width >= 44 && control.height >= 44));
    const file = path.join(output, `${name}-${suffix}-${width}.png`);
    await page.screenshot({ path: file, fullPage: true });
    evidence.images.push({ name: path.relative(directory, file), layout });
  };
  try {
    await page.setViewportSize({ width, height: 1100 });
    const origin = new URL(page.url()).origin;
    await page.goto(`${origin}/hr/overtime?id=${id}`, { waitUntil: 'domcontentloaded' });
    const detail = page.getByRole('dialog', { name: /加班详情$/ });
    await detail.getByRole('button', { name: '查看授权结算', exact: true }).click();
    await detail.getByRole('button', { name: '处置结算异常', exact: true }).click();
    const form = page.getByRole('dialog', { name: '处置结算异常', exact: true });
    const submit = form.getByRole('button', { name: '确认处置', exact: true });
    check('页面未选择处置方式时禁止提交 ' + name, await submit.isDisabled());
    await form.getByRole('button', { name: '处置方式', exact: true }).click();
    await page.getByRole('option', { name: input.action === 'REJECT' ? '终止本次自动结算' : '明确补入新的假期周期', exact: true }).click();
    if (input.action !== 'REJECT') {
      const target = form.getByRole('button', { name: '本次补入目标假期周期', exact: true });
      await target.click();
      check('页面目标选项排除原关闭周期和关闭目标 ' + name,
        await page.getByRole('option').filter({ hasText: state.periodBodies.source.periodName }).count() === 0
        && await page.getByRole('option').filter({ hasText: state.periodBodies.closedTarget.periodName }).count() === 0);
      await page.getByRole('option').filter({ hasText: state.periodBodies.target.periodName }).click();
      check('页面明确展示冻结原周期和本次目标 ' + name,
        (await form.innerText()).includes(state.periodBodies.source.periodName)
        && (await form.innerText()).includes(state.periodBodies.target.periodName));
    }
    await form.getByLabel('处置原因').fill(input.reason);
    check('填写完整后仍须明确勾选确认 ' + name, await submit.isDisabled());
    await form.getByRole('checkbox').check();
    check('完成处置确认后才允许提交 ' + name, await submit.isEnabled());
    await capture('form', form);
    if (loseResponse) {
      const lost = captureOwnedLostResponse(() => {});
      const pattern = '**' + endpoint;
      await page.route(pattern, lost.handler);
      try {
        await submit.click();
        await form.getByText('服务未完成请求，请检查网络后重试；记录状态以重新读取为准。', { exact: true }).waitFor();
        check('补入真实成功但响应丢失时保留原因并提示重新读取', await form.getByLabel('处置原因').inputValue() === input.reason);
        await capture('lost-response', form);
      } finally {
        await page.unroute(pattern, lost.handler);
        lost.assertSucceeded();
      }
      evidence.lostResponse = true;
      await form.getByRole('button', { name: '取消', exact: true }).click();
    } else {
      const submitted = page.waitForResponse(response => new URL(response.url()).pathname === endpoint && response.request().method() === 'POST');
      await submit.click();
      const response = await submitted, body = await response.json();
      check('真实页面处置提交成功 ' + name, response.status() === 200 && body.code === 200);
      await form.waitFor({ state: 'hidden' });
    }
    // A real detail reread also covers recovery without submitting a second mutation.
    const rereading = page.waitForResponse(response => new URL(response.url()).pathname === `/api/hr/attendance/overtime-requests/${id}` && response.request().method() === 'GET');
    await detail.getByRole('button', { name: '重新读取详情', exact: true }).click();
    const response = await rereading, body = await response.json();
    check('处置后真实重读保留已通过工时并返回最终状态 ' + name, response.status() === 200 && body.code === 200
      && body.data.status === 'APPROVED' && body.data.approvedMinutes === 1
      && body.data.settlementStatus === (input.action === 'REJECT' ? 'REJECTED' : 'SETTLED'));
    await detail.getByRole('heading', { name: '已记录的人工处置', exact: true }).waitFor();
    const settlement = detail.locator('section').filter({ has: page.getByRole('heading', { name: '调休结算依据', exact: true }) });
    const value = label => settlement.locator('dt').filter({ hasText: new RegExp('^' + label + '$') }).locator('..').locator('dd').innerText();
    check('页面展示准确处置方式原周期目标和原因 ' + name,
      await value('处置方式') === (input.action === 'REJECT' ? '终止本次自动结算' : '额度补入')
      && await value('原目标周期') === state.periods.source
      && await value('本次目标周期') === (input.targetPeriodId || '未变更')
      && await value('处置原因') === input.reason);
    if (input.action === 'REJECT') {
      check('页面终止保留工时且说明不代表放弃报酬', (await settlement.innerText()).includes('已通过工时和原依据保留，不代表员工放弃报酬。'));
    } else {
      check('页面入账小时与两次累计差额相符 ' + name, Number(await value('调休入账小时')) === (name === 'adjustFirst' ? 0.01 : 0.02));
    }
    check('页面完成后停止展示可再次处置按钮 ' + name, await detail.getByRole('button', { name: '处置结算异常', exact: true }).count() === 0);
    // Workflow refresh can replace the heading while Playwright waits for its
    // geometry to settle. Resolve and scroll synchronously in the live document.
    await detail.getByRole('heading', { name: '已记录的人工处置', exact: true }).evaluate(element => element.scrollIntoView({ block: 'center' }));
    await capture('result', settlement);
    check('每笔处置仅由页面发送一次且参数与审批版本吻合 ' + name, evidence.posts.length === 1
      && Object.keys(evidence.posts[0]).length === Object.keys(input).length
      && Object.entries(input).every(([key, value]) => evidence.posts[0][key] === value));
    check('周期处置页面无未捕获错误 ' + name, errors.length === 0);
    evidence.reread = true;
    evidence.passed = true;
    return await ok('hr', `/hr/attendance/overtime-requests/${id}/settlement`);
  } finally {
    page.off('pageerror', onError);
    page.off('request', onRequest);
    await context.save();
  }
}
