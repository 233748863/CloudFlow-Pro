import assert from 'node:assert/strict';
import { captureOwnedLostResponse } from './runtime-checks/owned-lost-response.mjs';
import path from 'node:path';

export async function approveAdvanceInUi({ page, task, expected, stage, directory, caseTag, check }) {
  await page.setViewportSize({ width: stage === 'finance' ? 320 : 1440, height: 1000 });
  const detailsPattern = `**/api/hr/advance/approval-task/${task.id}`;
  const unavailable = route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ code: 'DEPENDENCY_UNAVAILABLE', msg: '借款详情暂时无法读取' }) });
  await page.route(detailsPattern, unavailable);
  try {
    await page.goto(new URL(`/workflow/task/${task.id}`, page.url()).href, { waitUntil: 'domcontentloaded' });
    const blockedDialog = page.getByRole('dialog', { name: '任务处理', exact: true });
    await blockedDialog.getByRole('alert').filter({ hasText: '当前不能同意' }).waitFor();
    check(`${stage}详情读取失败时禁止同意`, await blockedDialog.getByRole('button', { name: '同意', exact: true }).isDisabled());
  } finally { await page.unroute(detailsPattern, unavailable); }
  await page.goto(new URL(`/workflow/task/${task.id}`, page.url()).href, { waitUntil: 'domcontentloaded' });
  const dialog = page.getByRole('dialog', { name: '任务处理', exact: true });
  const summary = dialog.getByTestId('advance-approval-summary');
  await summary.waitFor();
  const summaryText = await summary.innerText();
  check(`${stage}待办直接展示完整借款申请`, [expected.employeeName, expected.advanceNo, expected.purpose, `${expected.amount}元`, '一次性归还'].every(value => summaryText.includes(value)));
  check(`${stage}借款详情只读`, await summary.locator('input,textarea,select,[contenteditable="true"]').count() === 0);
  check(`${stage}不提供改派和加减签入口`, await dialog.getByRole('button', { name: /^(转办|加签|减签|驳回)$/ }).count() === 0);
  const opinion = dialog.getByPlaceholder('请输入审批意见...');
  await opinion.fill(`借款真实页面核验_${caseTag}_${stage}`);
  for (const width of [1440, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await summary.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(directory, `h2-advance-review-${stage}-${caseTag}-${width}.png`), fullPage: true });
    const approve = dialog.getByRole('button', { name: '同意', exact: true });
    await approve.scrollIntoViewIfNeeded();
    const bounds = await approve.boundingBox();
    check(`${stage}借款审批${width}px布局不溢出且同意按钮至少44px`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)
      && bounds?.width >= 44 && bounds?.height >= 44);
  }
  await dialog.getByRole('button', { name: '同意', exact: true }).click();
  const submitted = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/workflow/wf/complete');
  await dialog.getByRole('button', { name: '确认', exact: true }).click();
  const response = await submitted;
  assert.equal(response.status(), 200); assert.equal((await response.json()).code, 200);
  const body = response.request().postDataJSON();
  check(`${stage}真实界面仅提交审批动作和意见`, body.taskId === task.id && body.action === 'APPROVE' && body.variables == null);
  await dialog.waitFor({ state: 'hidden' });
}

export async function submitAdvanceWithLostResponse({ page, record, check }) {
  await page.setViewportSize({ width: 320, height: 1000 });
  await page.goto(new URL('/hr/ess/advances', page.url()).href, { waitUntil: 'domcontentloaded' });
  const card = page.locator('.advance-card').filter({ hasText: record.advanceNo });
  await card.getByRole('button', { name: '查看借款', exact: true }).click();
  const detail = page.getByRole('dialog', { name: '本人借款详情', exact: true });
  await detail.getByRole('button', { name: '提交审批', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '提交借款审批', exact: true });
  let submitted = 0;
  const pattern = `**/api/hr/advance/${record.advanceId}/submit`;
  const lostResponse = captureOwnedLostResponse(() => submitted++);
  const lose = lostResponse.handler;
  await page.route(pattern, lose);
  try {
    await dialog.getByRole('button', { name: '提交审批', exact: true }).click();
    await dialog.getByRole('alert').waitFor();
    check('真实提交成功但响应丢失后锁定再次提交', submitted === 1 && await dialog.getByRole('button', { name: '提交审批', exact: true }).isDisabled());
    await dialog.getByRole('button', { name: '核对原单', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    check('核对原单恢复结果且不会再次提交', submitted === 1);
  } finally { await page.unroute(pattern, lose); lostResponse.assertSucceeded(); }
}
