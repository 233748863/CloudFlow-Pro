import assert from 'node:assert/strict';
import path from 'node:path';

export async function verifyEmailArchiveInterface({ sales, employee, api, successful, check, database, directory, caseTag, customer, contact, businesses, pdfBytes, waitFor, details, evidence }) {
  const origin = new URL(sales.url()).origin;
  const route = `${origin}/crm/emails?bizType=CUSTOMER&bizId=${customer.id}`;
  const responseFor = resource => sales.waitForResponse(response => response.url().includes(`/api/crm/email/${resource}`) && response.request().method() === 'POST');
  const dimensions = async dialog => sales.evaluate(label => {
    const root = [...document.querySelectorAll('[role="dialog"]')].find(element => document.getElementById(element.getAttribute('aria-labelledby'))?.textContent === label && element.getClientRects().length);
    const bounds = root?.getBoundingClientRect();
    const controls = root ? [...root.querySelectorAll('button,input,select,textarea')].filter(element => element.getClientRects().length).map(element => ({ height: element.getBoundingClientRect().height, name: element.getAttribute('aria-label') || element.textContent?.trim() })) : [];
    return { width: innerWidth, scroll: document.documentElement.scrollWidth, dialog: bounds ? { left: bounds.left, right: bounds.right, scroll: root.scrollWidth, width: root.clientWidth } : null, controls };
  }, dialog);
  await sales.setViewportSize({ width: 1440, height: 1000 });
  await sales.goto(route, { waitUntil: 'domcontentloaded' });
  await sales.getByRole('heading', { name: '客户邮件归档', exact: true }).waitFor();
  await sales.getByRole('button', { name: '新建客户邮件', exact: true }).click();
  const compose = sales.getByRole('dialog', { name: '客户邮件草稿', exact: true });
  await compose.getByRole('combobox', { name: '邮件联系人', exact: true }).selectOption(String(contact.id));
  const uiSubject = `H3_MAIL_${caseTag}_ui_draft`;
  await compose.getByRole('textbox', { name: '客户邮件主题', exact: true }).fill(uiSubject);
  await compose.getByRole('textbox', { name: '客户邮件正文', exact: true }).fill('电脑端真实保存正文');
  check('电脑端未核验模板渠道时明确禁用发送', await compose.getByRole('button', { name: '确认发送邮件', exact: true }).isDisabled());
  const uploadResponses = [];
  const watchUpload = response => { if (response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/crm/email/attachments/upload') uploadResponses.push(response); };
  sales.on('response', watchUpload);
  try {
    await compose.getByLabel('客户邮件私有附件', { exact: true }).setInputFiles([
      { name: `ui-${caseTag}.pdf`, mimeType: 'application/pdf', buffer: pdfBytes },
      { name: `ui-second-${caseTag}.pdf`, mimeType: 'application/pdf', buffer: pdfBytes },
    ]);
    await waitFor(() => uploadResponses.length, count => count === 2, '一次选择两个附件未完成真实上传');
    for (const response of uploadResponses) { assert.equal(response.status(), 200); assert.equal((await response.json()).code, 200); }
    await compose.getByRole('button', { name: `移除附件 ui-second-${caseTag}.pdf`, exact: true }).waitFor();
    check('电脑端一次选择两个附件无需等待且均真实上传', await compose.getByRole('button', { name: `移除附件 ui-${caseTag}.pdf`, exact: true }).isVisible());
  } finally { sales.off('response', watchUpload); }
  const submissions = [];
  const watchDraft = outgoing => { if (outgoing.method() === 'POST' && new URL(outgoing.url()).pathname === '/api/crm/email/draft') submissions.push(outgoing); };
  sales.on('request', watchDraft);
  try {
    const savedResponse = responseFor('draft');
    await compose.getByRole('button', { name: '保存邮件草稿', exact: true }).dblclick();
    const saved = await savedResponse;
    const body = await saved.json();
    check('电脑端双击保存只提交一次真实请求', body.code === 200 && submissions.length === 1);
    const record = await details(body.data.emailId);
    check('电脑端草稿正文和私有附件真实落库且未发送', record.sendStatus === 'DRAFT' && record.attachmentCount === 2 && record.contentSummary === '电脑端真实保存正文' && !record.sendTime);
    await compose.getByRole('button', { name: '关闭', exact: true }).click();
    await sales.getByRole('button', { name: uiSubject, exact: true }).click();
    const detail = sales.getByRole('dialog', { name: '客户邮件详情', exact: true });
    await detail.getByRole('button', { name: '继续编辑邮件草稿', exact: true }).click();
    check('电脑端重新打开恢复真实草稿正文及附件', await compose.getByRole('textbox', { name: '客户邮件正文', exact: true }).inputValue() === '电脑端真实保存正文'
      && await compose.getByRole('button', { name: `移除附件 ui-${caseTag}.pdf`, exact: true }).isVisible()
      && await compose.getByRole('button', { name: `移除附件 ui-second-${caseTag}.pdf`, exact: true }).isVisible());
    await compose.getByRole('combobox', { name: '客户邮件模板', exact: true }).selectOption('CRM_CUSTOMER_EMAIL');
    sales.once('dialog', prompt => prompt.accept());
    await compose.getByRole('button', { name: '套用模板并检查渠道', exact: true }).click();
    await waitFor(() => compose.getByRole('button', { name: '确认发送邮件', exact: true }).isEnabled(), enabled => enabled, '真实模板核验未启用发送');
    check('套用模板显示服务端核验的客户正文', (await compose.getByRole('textbox', { name: '客户邮件正文', exact: true }).inputValue()).includes('感谢'));
    await compose.getByRole('textbox', { name: '客户邮件正文', exact: true }).fill('电脑端真实确认发送正文');
    await compose.getByRole('button', { name: '确认发送邮件', exact: true }).click();
    const confirmation = sales.getByRole('dialog', { name: '确认提交客户邮件？', exact: true });
    await confirmation.waitFor();
    check('发送必须经过独立二次确认', await confirmation.getByRole('button', { name: '继续核对', exact: true }).isVisible());
    const sentResponse = responseFor('send');
    await confirmation.getByRole('button', { name: '提交发送', exact: true }).click();
    const sentBody = await (await sentResponse).json();
    check('电脑端真实发送受理只显示QUEUED', sentBody.code === 200 && sentBody.data.sendStatus === 'QUEUED');
    const sent = await waitFor(() => details(record.emailId), value => ['SENT', 'FAILED', 'UNKNOWN'].includes(value.sendStatus), '电脑端发送结果未回写');
    check('电脑端实际发信保持原草稿唯一记录并收到真实接纳', sent.sendStatus === 'SENT' && sent.emailId === record.emailId && Boolean(sent.sendTime));
    await sales.getByRole('button', { name: '刷新邮件归档', exact: true }).click();
    const savedCard = sales.getByRole('listitem').filter({ has: sales.getByRole('button', { name: uiSubject, exact: true }) });
    await savedCard.getByText('邮件服务器已接纳', { exact: true }).waitFor();
    check('电脑端刷新后显示真实已接纳状态', await savedCard.getByText('邮件服务器已接纳', { exact: true }).isVisible());
  } finally { sales.off('request', watchDraft); }
  await sales.screenshot({ path: path.join(directory, `h3-email-archive-desktop-${caseTag}.png`), fullPage: true });
  evidence.desktop = true;
  for (const width of [320, 375]) {
    await sales.setViewportSize({ width, height: 900 });
    await sales.goto(route, { waitUntil: 'domcontentloaded' });
    await sales.getByRole('heading', { name: '客户邮件归档', exact: true }).waitFor();
    await sales.getByRole('button', { name: '新建客户邮件', exact: true }).click();
    await compose.getByRole('textbox', { name: '客户邮件主题', exact: true }).fill(`手机${width}未保存`);
    await compose.getByRole('textbox', { name: '客户邮件正文', exact: true }).fill(`手机${width}输入保持`);
    const layout = await dimensions('客户邮件草稿');
    check(`${width}px手机邮件窗口和页面无横向溢出`, layout.scroll <= layout.width && layout.dialog && layout.dialog.left >= 0 && layout.dialog.right <= layout.width + 1 && layout.dialog.scroll <= layout.dialog.width + 1);
    check(`${width}px手机邮件交互控件至少44px`, layout.controls.length > 0 && layout.controls.every(control => control.height >= 44));
    if (width === 320) {
      const originalInput = await compose.getByRole('textbox', { name: '客户邮件正文', exact: true }).elementHandle();
      for (const resizedWidth of [1440, 375, 320]) {
        await sales.setViewportSize({ width: resizedWidth, height: 900 });
        check(`手机草稿切换至${resizedWidth}px仍保留原输入节点和正文`, await originalInput.evaluate(input => input.isConnected)
          && await compose.getByRole('textbox', { name: '客户邮件正文', exact: true }).inputValue() === '手机320输入保持');
      }
      await originalInput.dispose();
    }
    await compose.getByRole('button', { name: '关闭', exact: true }).click();
    const discard = sales.getByRole('dialog', { name: '关闭未保存的邮件？', exact: true });
    await discard.getByRole('button', { name: '继续编辑', exact: true }).click();
    check(`${width}px手机取消关闭保留未保存正文`, await compose.getByRole('textbox', { name: '客户邮件正文', exact: true }).inputValue() === `手机${width}输入保持`);
    await sales.screenshot({ path: path.join(directory, `h3-email-archive-mobile-${width}-${caseTag}.png`), fullPage: true });
    await compose.getByRole('button', { name: '关闭', exact: true }).click();
    await discard.getByRole('button', { name: '放弃修改并关闭', exact: true }).click();
  }
  await sales.getByRole('button', { name: '手工归档来信', exact: true }).click();
  const inbound = sales.getByRole('dialog', { name: '手工归档客户来信', exact: true });
  await inbound.getByRole('textbox', { name: '来信发件邮箱', exact: true }).fill(contact.email);
  await inbound.getByRole('textbox', { name: '来信收件邮箱', exact: true }).fill('sender@example.com');
  await inbound.getByRole('textbox', { name: '客户邮件主题', exact: true }).fill(`H3_MAIL_${caseTag}_mobile_inbound`);
  await inbound.getByRole('textbox', { name: '客户邮件正文', exact: true }).fill('手机粘贴的真实客户来信');
  await inbound.getByRole('textbox', { name: '邮件来源说明', exact: true }).fill('隔离验收，人工粘贴原始来信');
  const inboundResponse = responseFor('archive-inbound');
  await inbound.getByRole('button', { name: '归档来信', exact: true }).dblclick();
  const archived = await (await inboundResponse).json();
  const inboundRecord = await details(archived.data.emailId);
  check('手机真实归档来信不产生任何外发事实', archived.code === 200 && inboundRecord.direction === 'INBOUND' && inboundRecord.sendStatus === 'MANUAL' && !inboundRecord.sendTime && !inboundRecord.messageRecordId);
  for (const business of businesses) {
    await sales.goto(`${origin}/crm/emails?bizType=${business.type}&bizId=${business.id}`, { waitUntil: 'domcontentloaded' });
    await sales.getByRole('heading', { name: '客户邮件归档', exact: true }).waitFor();
    check(`手机${business.type}邮件入口携带正确原业务`, await sales.getByRole('combobox', { name: '邮件业务类型', exact: true }).inputValue() === business.type
      && await sales.getByRole('button', { name: '新建客户邮件', exact: true }).isVisible());
  }
  await employee.setViewportSize({ width: 375, height: 900 });
  await employee.goto(route, { waitUntil: 'domcontentloaded' });
  await waitFor(() => employee.locator('body').innerText(), value => /权限|拒绝|403/.test(value), '员工直接访问未被权限守卫拒绝');
  check('手机EMPLOYEE无邮件写按钮且直接访问被拒绝', await employee.getByRole('button', { name: '新建客户邮件', exact: true }).count() === 0
    && await employee.getByRole('button', { name: '手工归档来信', exact: true }).count() === 0);
  const denied = await api(employee, '/crm/email/list');
  check('手机权限拒绝由真实后端同时执行', denied.status === 403 && denied.body?.code === 403);
  check('手机归档事实保持业务隔离', database(`SELECT COUNT(*) FROM crm_email_record WHERE tenant_id=100000 AND email_id=${inboundRecord.emailId} AND biz_type='CUSTOMER' AND biz_id=${customer.id};`) === '1');
  evidence.mobile = true;
}
