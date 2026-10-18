import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export async function verifyHrAdvanceEntryUi(context) {
  const { employee, finance, person, fund, proofBytes, read, current, api, successful, database, check, directory, caseTag, evidence } = context;
  const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
  const waitFor = async (probe, accepted, label) => {
    const deadline = Date.now() + 30000;
    do {
      const value = await probe();
      if (accepted(value)) return value;
      await pause(150);
    } while (Date.now() < deadline);
    throw new Error(label);
  };
  const noOverflow = async (page, label) => check(label, await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  const touchTargets = async page => {
    const violations = await page.locator('.advance-workspace button:visible, [role="dialog"]:has(.advance-workspace) button:visible').evaluateAll(buttons => buttons.flatMap(button => {
      const rectangle = button.getBoundingClientRect();
      return rectangle.width < 43.9 || rectangle.height < 43.9 ? [{ text: button.textContent, width: rectangle.width, height: rectangle.height }] : [];
    }));
    check(`借款页面所有可见按钮触控区至少44px ${JSON.stringify(violations)}`, violations.length === 0);
  };
  const select = async (dialog, name, option) => {
    const trigger = dialog.getByRole('button', { name, exact: true });
    assert.equal(await trigger.getAttribute('aria-haspopup'), 'listbox');
    await trigger.click();
    await dialog.page().getByRole('option', { name: option, exact: true }).click();
  };
  const origin = new URL(employee.url()).origin;
  const purpose = `页面原请求_${caseTag}_${'W'.repeat(450)}`;
  await employee.goto(`${origin}/hr/ess/advances`, { waitUntil: 'domcontentloaded' });
  await employee.getByRole('main').getByRole('heading', { name: '我的借款', exact: true }).waitFor();
  await employee.getByRole('button', { name: '新建借款草稿', exact: true }).click();
  const dialog = employee.getByRole('dialog', { name: '新建本人借款草稿', exact: true });
  await dialog.getByLabel('借款金额（元）', { exact: false }).fill('999999999999.99');
  await dialog.getByLabel('借款用途', { exact: false }).fill(purpose);
  const requests = [];
  const capture = request => {
    if (new URL(request.url()).pathname === '/api/hr/advance' && request.method() === 'POST') requests.push({ key: request.headers()['idempotency-key'], body: request.postDataJSON() });
  };
  employee.on('request', capture);
  let createdId;
  let intercepted = false;
  const loseResponse = async route => {
    if (route.request().method() !== 'POST' || intercepted) return route.continue();
    intercepted = true;
    const response = await route.fetch();
    const result = await response.json();
    assert.equal(response.status(), 200);
    assert.equal(result.code, 200);
    createdId = String(result.data);
    await route.abort('connectionreset');
  };
  await employee.route('**/api/hr/advance', loseResponse);
  try {
    await dialog.getByRole('button', { name: '保存草稿', exact: true }).click();
    await dialog.getByRole('alert').waitFor({ timeout: 30000 });
    check('真实响应丢失后原输入和请求标识保持不变', Boolean(createdId) && await dialog.getByLabel('借款用途', { exact: false }).inputValue() === purpose
      && await dialog.getByLabel('借款金额（元）', { exact: false }).isDisabled());
  } finally { await employee.unroute('**/api/hr/advance', loseResponse); }
  const immediateRetry = employee.waitForResponse(response => new URL(response.url()).pathname === '/api/hr/advance'
    && response.request().method() === 'POST');
  await dialog.getByRole('button', { name: '重试保存原草稿', exact: true }).click();
  const repeatedResponse = await immediateRetry;
  check('快速页面重试实际触发五秒防重复保护', repeatedResponse.status() === 409 && (await repeatedResponse.json()).code === 409);
  await dialog.getByRole('alert').filter({ hasText: '原操作结果尚未确认' }).waitFor();
  check('防重复响应仍保留原操作及输入并允许继续重试', await dialog.getByLabel('借款金额（元）', { exact: false }).isDisabled()
    && await dialog.getByLabel('借款用途', { exact: false }).inputValue() === purpose
    && await dialog.getByRole('button', { name: '重试保存原草稿', exact: true }).isEnabled());
  await pause(5100);
  await dialog.getByRole('button', { name: '重试保存原草稿', exact: true }).click();
  await employee.getByRole('dialog', { name: '本人借款详情', exact: true }).waitFor();
  await dialog.waitFor({ state: 'hidden' });
  employee.off('request', capture);
  check('页面三次请求使用同一标识且服务器仅保存一次', requests.length === 3 && requests.every(request => request.key === requests[0].key)
    && requests.every(request => JSON.stringify(request.body) === JSON.stringify(requests[0].body))
    && database(`SELECT COUNT(*) FROM hr_employee_advance WHERE employee_id=${person.employeeId} AND advance_id=${createdId};`) === '1');
  const detail = employee.getByRole('dialog', { name: '本人借款详情', exact: true });
  await detail.getByText('999,999,999,999.99元', { exact: true }).waitFor();
  await noOverflow(employee, '电脑详情展示十二位金额及长用途不横向溢出');
  await employee.screenshot({ path: path.join(directory, `h2-advance-entry-desktop-${caseTag}.png`), fullPage: true });
  evidence.desktop = true; evidence.lostResponse = true;
  await detail.getByRole('button', { name: '编辑草稿', exact: true }).click();
  const editor = employee.getByRole('dialog', { name: '修改本人借款草稿', exact: true });
  await editor.getByLabel('借款金额（元）', { exact: false }).fill('100.00');
  await editor.getByLabel('借款用途', { exact: false }).fill(`页面分期_${caseTag}`);
  await select(editor, '还款方式', '工资分期扣还');
  const month = database("SELECT DATE_FORMAT(CURDATE(),'%Y-%m');");
  await editor.getByLabel('扣还开始月份', { exact: false }).fill(month);
  await editor.getByLabel('计划扣还期数', { exact: false }).fill('3');
  await editor.getByLabel('计划月扣金额（元）', { exact: false }).fill('40.00');
  await editor.getByRole('button', { name: '保存草稿', exact: true }).click();
  await editor.waitFor({ state: 'hidden' });
  const saved = await waitFor(() => read(employee, `/mine/${createdId}`), result => result.advance.repayMode === 'SALARY_DEDUCT', '页面分期未保存');
  check('页面正确保存分期计划和金额字符串', saved.advance.repayMonths === 3 && saved.advance.monthlyDeductAmount === '40.00' && saved.advance.amount === '100.00');
  await detail.getByRole('button', { name: '编辑草稿', exact: true }).click();
  const pendingPurpose = `保留未提交输入_${caseTag}`;
  await editor.getByLabel('借款用途', { exact: false }).fill(pendingPurpose);
  successful(await api(employee, `/hr/advance/${createdId}`, { method: 'PUT', body: {
    amount: '100.00', purpose: `并发后台保存_${caseTag}`, repayMode: 'SALARY_DEDUCT', repayStartMonth: month,
    repayMonths: 3, monthlyDeductAmount: '40.00', version: saved.advance.version,
  } }), '真实并发保存制造版本冲突');
  await editor.getByRole('button', { name: '保存草稿', exact: true }).click();
  await editor.getByRole('button', { name: '重新读取记录', exact: true }).waitFor();
  await editor.getByRole('button', { name: '重新读取记录', exact: true }).click();
  await editor.getByText(/最新记录版本/).waitFor();
  check('版本冲突重新读取只展示新版本，保留原输入且禁止覆盖提交', await editor.getByLabel('借款用途', { exact: false }).inputValue() === pendingPurpose
    && await editor.getByRole('button', { name: '保存草稿', exact: true }).isDisabled());
  await editor.getByRole('button', { name: '取消', exact: true }).click();
  await detail.getByRole('button', { name: '关闭', exact: true }).click();
  await employee.setViewportSize({ width: 390, height: 844 });
  await employee.reload({ waitUntil: 'domcontentloaded' });
  await employee.getByRole('main').getByRole('heading', { name: '我的借款', exact: true }).waitFor();
  await noOverflow(employee, '手机本人借款列表不横向溢出');
  await touchTargets(employee);
  await employee.screenshot({ path: path.join(directory, `h2-advance-entry-mobile-${caseTag}.png`), fullPage: true });
  const loanId = fund(person, 9, '50.00');
  const loan = await current(loanId);
  await finance.goto(`${origin}/hr/advances`, { waitUntil: 'domcontentloaded' });
  await finance.getByRole('main').getByRole('heading', { name: '员工借款管理', exact: true }).waitFor();
  await finance.getByLabel('员工姓名或借款单号', { exact: true }).fill(loan.advanceNo);
  await finance.getByRole('button', { name: '查询', exact: true }).click();
  const card = finance.locator('.advance-card').filter({ hasText: loan.advanceNo });
  await card.getByRole('button', { name: '查看借款', exact: true }).click();
  const financeDetail = finance.getByRole('dialog', { name: '员工借款详情', exact: true });
  await financeDetail.getByRole('button', { name: '登记实际还款', exact: true }).click();
  const repayment = finance.getByRole('dialog', { name: '登记实际还款', exact: true });
  check('财务页面在上传真实凭据前禁止入账', await repayment.getByRole('button', { name: '确认真实到账', exact: true }).isDisabled());
  await repayment.getByLabel('实际还款金额（元）', { exact: false }).fill('10.00');
  await repayment.getByLabel('还款说明', { exact: false }).fill(`页面真实到账_${caseTag}`);
  await repayment.getByLabel('真实到账凭据', { exact: false }).setInputFiles({ name: `页面凭据_${caseTag}.pdf`, mimeType: 'application/pdf', buffer: proofBytes });
  const uploadPath = `/api/hr/advance/${loanId}/proof`;
  const uploadExchange = Promise.all([
    finance.waitForRequest(request => new URL(request.url()).pathname === uploadPath && request.method() === 'POST'),
    finance.waitForResponse(response => new URL(response.url()).pathname === uploadPath && response.request().method() === 'POST'),
  ]);
  await repayment.getByRole('button', { name: '上传凭据', exact: true }).click();
  const [uploadRequest, uploadResponse] = await uploadExchange;
  check('页面凭据请求由浏览器生成文件表单及分隔标识', /^multipart\/form-data;\s*boundary=\S+/.test(uploadRequest.headers()['content-type'] || ''));
  check('页面凭据上传由真实服务确认成功', uploadResponse.status() === 200 && (await uploadResponse.json()).code === 200);
  await repayment.getByText(/已上传：/).waitFor();
  await repayment.getByRole('button', { name: '确认真实到账', exact: true }).click();
  await repayment.waitFor({ state: 'hidden' });
  await waitFor(() => current(loanId), record => record.repaidAmount === '10.00' && record.outstandingAmount === '40.00', '页面实际还款未入账');
  check('电脑财务页面真实入账10元', (await current(loanId)).repaidAmount === '10.00');
  await finance.setViewportSize({ width: 390, height: 844 });
  await finance.emulateMedia({ reducedMotion: 'reduce' });
  await financeDetail.getByRole('button', { name: '核销本金', exact: true }).click();
  const writeoffDialog = finance.getByRole('dialog', { name: '核销借款本金', exact: true });
  await writeoffDialog.getByLabel('核销金额（元）', { exact: false }).fill('40.00');
  await writeoffDialog.getByLabel('核销原因', { exact: false }).fill(`页面核销依据_${caseTag}`);
  check('手机核销必须二次确认', await writeoffDialog.getByRole('button', { name: '确认核销', exact: true }).isDisabled());
  const confirmation = writeoffDialog.getByRole('checkbox');
  const confirmationArea = await confirmation.evaluate(element => element.closest('label').getBoundingClientRect().height);
  check('手机二次确认整行点击区至少44px', confirmationArea >= 44);
  await confirmation.check();
  await finance.keyboard.press('Tab');
  check('嵌套财务对话框焦点保持在当前操作内', await writeoffDialog.evaluate(element => element.contains(document.activeElement)));
  await noOverflow(finance, '手机核销对话框和按钮不横向溢出');
  await touchTargets(finance);
  check('减少动画偏好关闭借款操作按钮动画', await writeoffDialog.getByRole('button', { name: '确认核销', exact: true }).evaluate(element => getComputedStyle(element).transitionDuration === '0s'));
  await finance.screenshot({ path: path.join(directory, `h2-advance-entry-finance-mobile-${caseTag}.png`), fullPage: true });
  await writeoffDialog.getByRole('button', { name: '确认核销', exact: true }).click();
  await writeoffDialog.waitFor({ state: 'hidden' });
  const settled = await waitFor(() => current(loanId), record => record.status === 'WRITTEN_OFF', '页面核销未保存');
  check('手机核销保持10元实际还款和40元核销分开', settled.repaidAmount === '10.00' && settled.writtenOffAmount === '40.00' && settled.outstandingAmount === '0.00');
  const downloadEvent = finance.waitForEvent('download');
  await financeDetail.getByRole('button', { name: '下载凭据', exact: true }).click();
  const download = await downloadEvent;
  console.log(`H2_ADVANCE_PAGE_DOWNLOAD: filename=${download.suggestedFilename()}`);
  check('页面凭据下载保留原始文件名及PDF扩展名', download.suggestedFilename() === `页面凭据_${caseTag}.pdf`);
  const downloadedPath = path.join(directory, `h2-advance-entry-download-${caseTag}.pdf`);
  await download.saveAs(downloadedPath);
  check('页面下载与真实上传字节完全一致', createHash('sha256').update(await fs.readFile(downloadedPath)).digest('hex') === createHash('sha256').update(proofBytes).digest('hex'));
  await finance.reload({ waitUntil: 'domcontentloaded' });
  await finance.getByRole('main').getByRole('heading', { name: '员工借款管理', exact: true }).waitFor();
  await noOverflow(finance, '财务手机刷新直接进入借款管理且不横向溢出');
  await touchTargets(finance);
  await finance.screenshot({ path: path.join(directory, `h2-advance-entry-finance-list-mobile-${caseTag}.png`), fullPage: false });
  evidence.mobile = true;
}
