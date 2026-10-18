import assert from 'node:assert/strict';
import { captureOwnedLostResponse } from './runtime-checks/owned-lost-response.mjs';
import path from 'node:path';

export async function submitSettlementWithLostResponse({ hr: page, id, withdraw, reversal = false, check, directory, caseTag, evidence }) {
  await page.setViewportSize({ width: withdraw ? 320 : 1440, height: 1000 });
  await page.goto(new URL(`/hr/final-settlements?settlementId=${id}`, page.url()).href, { waitUntil: 'domcontentloaded' });
  const detail = page.getByRole('dialog', { name: '离职结算详情', exact: true });
  await detail.getByRole('button', { name: withdraw ? '撤回审批' : '提交财务复核', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: withdraw ? '撤回财务复核' : '提交财务复核', exact: true });
  const action = withdraw ? '申请撤回' : '提交复核'; const reason = `保留原撤回原因_${caseTag}`;
  if (withdraw) await dialog.getByLabel('撤回原因', { exact: true }).fill(reason);
  await dialog.getByRole('checkbox').check();
  const pattern = `**/api/hr/settlement/${id}/${reversal ? 'reversal-' : ''}${withdraw ? 'withdraw' : 'submit'}`; let submissions = 0;
  const lostResponse = captureOwnedLostResponse(() => submissions++);
  await page.route(pattern, lostResponse.handler);
  try {
    await dialog.getByRole('button', { name: action, exact: true }).click(); await dialog.getByRole('button', { name: '读取已保存结果', exact: true }).waitFor();
    check(`${action}响应丢失后禁止重复提交`, submissions === 1 && await dialog.getByRole('button', { name: action, exact: true }).isDisabled());
  } finally { await page.unroute(pattern, lostResponse.handler); lostResponse.assertSucceeded(); }
  const readPattern = `**/api/hr/settlement/${id}`; let failedRead = false;
  await page.route(readPattern, async route => { if (!failedRead && route.request().method() === 'GET') { failedRead = true;
    await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ code: 503, msg: '隔离审批读取故障' }) }); } else await route.continue(); });
  try {
    await dialog.getByRole('button', { name: '读取已保存结果', exact: true }).click(); await dialog.getByText('隔离审批读取故障', { exact: false }).waitFor();
    check(`${action}结果读取失败后保持输入和保护`, failedRead && await dialog.getByRole('button', { name: action, exact: true }).isDisabled()
      && (!withdraw || await dialog.getByLabel('撤回原因', { exact: true }).inputValue() === reason));
  } finally { await page.unroute(readPattern); }
  await dialog.getByRole('button', { name: '读取已保存结果', exact: true }).click(); await dialog.getByRole('button', { name: '返回最新结算详情', exact: true }).waitFor();
  check(`${action}恢复只读结果且不重发`, submissions === 1 && await dialog.getByRole('button', { name: action, exact: true }).isDisabled());
  await page.screenshot({ path: path.join(directory, `h2-settlement-${withdraw ? 'withdraw' : 'submit'}-recovered-${caseTag}.png`), fullPage: true });
  await dialog.getByRole('button', { name: '返回最新结算详情', exact: true }).click(); await dialog.waitFor({ state: 'hidden' });
  evidence.approvalLostResponse = true;
}

export async function approveSettlementInUi({ finance: page, task, expected, directory, caseTag, check, evidence }) {
  const pattern = `**/api/hr/settlement/approval-task/${task.id}`;
  await page.route(pattern, route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ code: 503, msg: '结算详情暂时无法读取' }) }));
  try {
    await page.goto(new URL(`/workflow/task/${task.id}`, page.url()).href, { waitUntil: 'domcontentloaded' });
    const failed = page.getByRole('dialog', { name: '任务处理', exact: true }); await failed.getByRole('alert').filter({ hasText: '当前不能同意' }).waitFor();
    check('财务待办详情读取失败时禁止同意', await failed.getByRole('button', { name: '同意', exact: true }).isDisabled());
  } finally { await page.unroute(pattern); }
  await page.goto(new URL(`/workflow/task/${task.id}`, page.url()).href, { waitUntil: 'domcontentloaded' });
  const dialog = page.getByRole('dialog', { name: '任务处理', exact: true }); const summary = dialog.getByTestId('settlement-approval-summary'); await summary.waitFor();
  const cancelled = await page.evaluate(async () => {
    const request = (await import('/src/services/api/request.ts')).default;
    const controller = new AbortController(); controller.abort();
    try { await request.get('/hr/settlement/list', { signal: controller.signal }); return false; }
    catch (error) { return error?.code === 'ERR_CANCELED' && error?.__CANCEL__ === true; }
  });
  check('页面主动取消过期读取保留取消信号且不误报失败', cancelled && await page.getByText('请求失败，请稍后重试', { exact: true }).count() === 0);
  const content = await summary.innerText();
  if (expected.settlementKind === 'REVERSAL') check('财务待办明确显示冲正及原单号和冲正原因',
    content.includes('冲正') && content.includes(expected.reversal.originalSettlementNo) && content.includes(expected.remark));
  check('财务待办展示真实金额取样和各项来源', [expected.employeeName, expected.settlementNo, expected.netAmount, expected.sampling.reason, ...expected.items.map(item => item.itemName)].every(value => content.includes(value)));
  check('结算待办只读且不提供转办加减签', await summary.locator('input,textarea,select,[contenteditable="true"]').count() === 0 && await dialog.getByRole('button', { name: /^(转办|加签|减签)$/ }).count() === 0);
  check('完整依据入口定位原结算', await summary.getByRole('link', { name: '查看完整结算依据', exact: true }).getAttribute('href') === `/hr/final-settlements?settlementId=${expected.settlementId}`);
  for (const width of [1440, 320]) {
    await page.setViewportSize({ width, height: 1000 }); await summary.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(directory, `h2-settlement-finance-${caseTag}-${width}.png`), fullPage: true });
    const approve = dialog.getByRole('button', { name: '同意', exact: true }); await approve.scrollIntoViewIfNeeded(); const bounds = await approve.boundingBox();
    check(`财务结算${width}px布局无溢出且按钮至少44px`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth) && bounds?.width >= 44 && bounds?.height >= 44);
  }
  await dialog.getByPlaceholder('请输入审批意见...').fill(`结算独立财务实际复核_${caseTag}`);
  await dialog.getByRole('button', { name: '同意', exact: true }).click();
  const submitted = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/workflow/wf/complete');
  await dialog.getByRole('button', { name: '确认', exact: true }).click(); const response = await submitted;
  assert.equal(response.status(), 200); assert.equal((await response.json()).code, 200);
  const body = response.request().postDataJSON(); check('财务实际审批不提交金额或冻结变量', body.taskId === task.id && body.action === 'APPROVE' && body.variables == null);
  await dialog.waitFor({ state: 'hidden' }); evidence.approvalDesktop = true; evidence.approvalMobile = true;
}
