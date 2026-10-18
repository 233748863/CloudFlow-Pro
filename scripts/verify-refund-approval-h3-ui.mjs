import path from 'node:path';

export async function decideRefundInInterface(context) {
  const { page, task, approval, action, stage, directory, caseTag, check } = context;
  const mobile = stage === 'finance';
  await page.setViewportSize({ width: mobile ? 375 : 1440, height: 1000 });
  if (mobile) await page.addInitScript(() => Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, get: () => 1 }));
  await page.goto(new URL('/tasks', page.url()).href, { waitUntil: 'domcontentloaded' });
  const row = page.locator(`[data-task-id="${task.id}"]`);
  await row.waitFor();
  await row.click();
  const dialog = page.getByRole('dialog', { name: '任务处理', exact: true });
  const summary = dialog.getByTestId('refund-approval-summary');
  await summary.waitFor();
  const text = await summary.innerText();
  check(`${stage}实际办理页面完整显示原款、金额、客户、计划、负责人及原因`, text.includes(`#${approval.payload.receiptEventId}`)
    && text.includes(`${approval.payload.currency} ${Number(approval.payload.refundAmount).toFixed(2)}`)
    && [approval.no, approval.reason, approval.payload.customerName, approval.payload.approvalPolicy.businessOwnerName].every(value => value && text.includes(value)));
  const editableFields = await summary.locator('input,textarea,select,[contenteditable="true"]').count();
  const internalKeys = (await dialog.innerText()).match(/\[object Object\]|_hDefinition|callbackStreamKey|financeReviewerIds|modelDigest/g) || [];
  const forbiddenButtons = await dialog.getByRole('button', { name: /^(转办|加签|减签|驳回)$/ }).allTextContents();
  console.log(`H3_REFUND_REVIEW_READONLY: stage=${stage}; editable_fields=${editableFields}; internal_keys=${JSON.stringify(internalKeys)}; forbidden_buttons=${JSON.stringify(forbiddenButtons)}`);
  check(`${stage}退款摘要全只读且不展示内部审批名单或模型数据`, editableFields === 0 && internalKeys.length === 0 && forbiddenButtons.length === 0);
  const opinion = dialog.getByPlaceholder('请输入审批意见...');
  const comment = `退款页面实际${action}_${stage}_${caseTag}`;
  await opinion.fill(comment);
  for (const width of mobile ? [320, 375] : [1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await summary.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(directory, `h3-refund-summary-${stage}-${action}-${caseTag}-${width}.png`), fullPage: true });
    const button = dialog.getByRole('button', { name: action === 'APPROVE' ? '同意' : '拒绝', exact: true });
    await button.scrollIntoViewIfNeeded();
    const bounds = await button.boundingBox();
    console.log(`H3_REFUND_REVIEW_BUTTON: stage=${stage}; viewport=${width}; width=${bounds?.width}; height=${bounds?.height}`);
    check(`${stage}退款办理${width}px无溢出且审批意见保留、按钮至少44px`, await opinion.inputValue() === comment
      && await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)
      && bounds?.width >= 44 && bounds?.height >= 44);
    await page.screenshot({ path: path.join(directory, `h3-refund-review-${stage}-${action}-${caseTag}-${width}.png`), fullPage: true });
  }
  await dialog.getByRole('button', { name: action === 'APPROVE' ? '同意' : '拒绝', exact: true }).click();
  const response = page.waitForResponse(item => item.request().method() === 'POST' && item.url().endsWith('/workflow/wf/complete'));
  await dialog.getByRole('button', { name: '确认', exact: true }).click();
  const actual = await response;
  const submitted = actual.request().postDataJSON();
  check(`${stage}退款${action}由真实办理页面提交且不上传或改写业务依据`, actual.status() === 200 && (await actual.json()).code === 200
    && submitted.taskId === task.id && submitted.action === action && submitted.comment === comment && submitted.variables == null);
  await dialog.waitFor({ state: 'hidden' });
}
