import assert from 'node:assert/strict';
import path from 'node:path';

export async function verifyRfqEmailBoundaries(context) {
  const { admin, api, successful, session, database, check, directory, caseTag, sqlText, row, waitFor, snapshot, mode, rejected,
    today, dateAfter, file, uploaded, mail, first, second, detail, invitations, deliveries, createSupplier, createRfq, invite, trigger, recover, showRfq } = context;
  const sentMessages = async (current, prefix) => (await snapshot()).messages.filter(message => message.subject.includes(current.title) && (!prefix || message.subject.startsWith(prefix)));
  const reached = current => waitFor(() => invitations(current.rfqId), values => values.length > 0 && values.every(value => value.status === 'SENT'), '边界用例实际邮件被接纳');
  let quoteFile;
  const other = await session('g_import_other');
  try {
    check('同租户其他采购员不能读取本单私有邀请附件', rejected(await api(other, `/oa/rfq/${mail.rfqId}/invitation-file`)));
    const foreignFileRequest = { rfq: { title: `RFQ_EMAIL_${caseTag}_other_file`, quoteDeadline: dateAfter(2), attachmentUrl: uploaded.reference }, items: [{ itemName: '附件所属人校验', quantity: 1, unit: '件' }] };
    check('同租户他人上传的附件不能绑定自己的询价', rejected(await api(other, '/oa/rfq', { method: 'POST', body: foreignFileRequest }))
      && database(`SELECT COUNT(*) FROM oa_purchase_rfq WHERE tenant_id=100000 AND title=${sqlText(foreignFileRequest.rfq.title)};`) === '0');
    check('通用文件下载接口不能绕过询价专用鉴权', rejected(await api(admin, `/auth/system/file/${uploaded.fileId}/content`))
      && rejected(await api(other, `/auth/system/file/${uploaded.fileId}/content`)));
    const filePage = successful(await api(admin, `/auth/system/file/list?pageNum=1&pageSize=100&fileName=${encodeURIComponent(file.name)}`), '通用文件列表');
    check('通用文件列表不泄露询价私有附件', !(filePage.records || filePage.rows || []).some(current => String(current.fileId) === String(uploaded.fileId)));
    quoteFile = successful(await api(admin, '/oa/rfq/quotation-files', { method: 'POST', file: { ...file, name: `quotation_${caseTag}.pdf` } }), '上传保密报价附件');
    const switchedKind = { ...foreignFileRequest, rfq: { ...foreignFileRequest.rfq, title: `RFQ_EMAIL_${caseTag}_kind`, attachmentUrl: `oa-file:RFQ_INVITATION:${quoteFile.fileId}` } };
    check('伪造邀请附件前缀不能外发保密报价文件', rejected(await api(admin, '/oa/rfq', { method: 'POST', body: switchedKind }))
      && database(`SELECT COUNT(*) FROM oa_purchase_rfq WHERE tenant_id=100000 AND title=${sqlText(switchedKind.rfq.title)};`) === '0');

    await mode('TEMPORARY');
    const revoked = await createRfq('revoked_permission', undefined, other);
    const revokedDetail = await detail(revoked.rfqId, other);
    successful(await api(other, `/oa/rfq/${revoked.rfqId}/invite`, { method: 'POST', body: { version: revokedDetail.rfq.version, channel: 'EMAIL', supplierIds: [first.supplierId] } }), '本人权限有效时排队邮件');
    await waitFor(() => deliveries(revoked.rfqId), values => values.length === 1 && values[0].status === 'RETRYABLE', '撤权前SMTP明确临时拒收');
    const operatorId = database("SELECT user_id FROM sys_user WHERE tenant_id=100000 AND user_name='g_import_other' AND deleted=0;");
    assert.match(operatorId, /^\d+$/);
    const memberships = row(`SELECT JSON_ARRAYAGG(JSON_OBJECT('userId',user_id,'roleId',role_id)) FROM sys_user_role WHERE user_id=${operatorId};`);
    assert.equal(memberships.length, 1);
    assert.equal(memberships[0].roleId, 1);
    try {
      database(`DELETE FROM sys_user_role WHERE user_id=${operatorId} AND role_id=1;`);
      await mode('ACCEPT');
      await recover([revoked.rfqId]);
      await waitFor(() => invitations(revoked.rfqId), values => values[0]?.status === 'FAILED', '权限撤销结果回写');
      check('发起人角色撤销后真实重试停止外发并回写失败', deliveries(revoked.rfqId)[0].status === 'SKIPPED' && (await sentMessages(revoked)).length === 0);
    } finally {
      database(`INSERT INTO sys_user_role(user_id,role_id) VALUES (${operatorId},1);`);
      check('撤权夹具恢复原角色且没有新增授权', database(`SELECT GROUP_CONCAT(role_id ORDER BY role_id) FROM sys_user_role WHERE user_id=${operatorId};`) === '1');
    }
  } finally { await other.context().close(); }

  await mode('ACCEPT');
  const declined = await createSupplier('declined');
  const boundary = await createRfq('deadline_award');
  successful(await invite(boundary.rfqId, [first, second, declined]), '登记报价边界的三家邀请');
  await reached(boundary);
  const requirements = (await detail(boundary.rfqId)).items;
  const quotation = successful(await api(admin, '/oa/rfq/quotations', { method: 'POST', body: {
    quotation: { rfqId: boundary.rfqId, supplierId: first.supplierId, quoteDate: today, validUntil: dateAfter(5), currency: 'CNY', attachmentUrl: quoteFile.reference },
    items: requirements.map(item => ({ rfqItemId: item.itemId, quantity: item.quantity, unitPrice: '12.50', discountRate: '1.0000', taxRate: '0.0000' })),
  } }), '采购员真实代录已接纳供应商报价');
  successful(await api(admin, `/oa/rfq/quotations/${quotation}/submit`, { method: 'POST', body: {} }), '真实提交报价');
  successful(await api(admin, `/oa/rfq/${boundary.rfqId}/decline`, { method: 'POST', body: { supplierId: declined.supplierId, reason: '供应商已明确拒绝本次报价' } }), '真实登记拒绝报价');
  await trigger('oaRfqDeadlineScan');
  const reminder = await waitFor(() => sentMessages(boundary, '询价截止提醒'), values => values.length === 1, '只提醒未响应者');
  check('截止提醒仅向已接纳且未响应者发送，已报价和已拒绝者均不发送', reminder[0].to.length === 1 && reminder[0].to[0] === second.contactEmail
    && invitations(boundary.rfqId).find(value => value.supplierId === first.supplierId)?.quoteStatus === 'RESPONDED'
    && invitations(boundary.rfqId).find(value => value.supplierId === declined.supplierId)?.quoteStatus === 'DECLINED');
  const beforeDeadline = (await sentMessages(boundary)).length;
  database(`UPDATE oa_purchase_rfq SET quote_deadline=DATE_SUB(CURRENT_DATE,INTERVAL 1 DAY) WHERE rfq_id=${boundary.rfqId} AND tenant_id=100000;`);
  await trigger('oaRfqDeadlineScan');
  const afterDeadline = invitations(boundary.rfqId);
  check('真实截止任务只把未响应者标为NO_RESPONSE并转入比价', (await detail(boundary.rfqId)).rfq.status === 'COMPARING'
    && afterDeadline.find(value => value.supplierId === second.supplierId)?.quoteStatus === 'NO_RESPONSE'
    && afterDeadline.find(value => value.supplierId === first.supplierId)?.quoteStatus === 'RESPONDED'
    && afterDeadline.find(value => value.supplierId === declined.supplierId)?.quoteStatus === 'DECLINED');
  check('截止后不再外发提醒且拒绝继续邀请或代录报价', (await sentMessages(boundary)).length === beforeDeadline
    && rejected(await invite(boundary.rfqId, [first]))
    && rejected(await api(admin, '/oa/rfq/quotations', { method: 'POST', body: { quotation: { rfqId: boundary.rfqId, supplierId: second.supplierId, currency: 'CNY' }, items: [] } })));
  const configId = database("SELECT config_id FROM sys_config WHERE tenant_id=100000 AND config_key='sys.oa.rfq.awardApprovalThreshold';");
  assert.match(configId, /^\d+$/);
  const policy = successful(await api(admin, `/auth/system/config/${configId}`), '读取独立环境定标政策');
  try {
    successful(await api(admin, '/auth/system/config', { method: 'PUT', body: { ...policy, configValue: '1000' } }), '独立环境通过真实配置接口设置小额定标阈值');
    check('定标阈值真实保存且金额未被伪造', database(`SELECT config_value FROM sys_config WHERE config_id=${configId};`) === '1000'
      && database(`SELECT total_amount FROM oa_supplier_quotation WHERE quotation_id=${quotation};`) === '37.50');
    const outcome = successful(await api(admin, `/oa/rfq/${boundary.rfqId}/award`, { method: 'POST', body: { quotationId: quotation, reason: '本次报价符合规格及有效期，按小额定标政策选定供应商' } }), '真实小额定标');
    check('真实定标接口生成中标事实', outcome === 'AWARDED' && (await detail(boundary.rfqId)).rfq.awardedQuotationId === quotation);
  } finally {
    const latest = successful(await api(admin, `/auth/system/config/${configId}`), '读取待恢复的独立政策');
    successful(await api(admin, '/auth/system/config', { method: 'PUT', body: { ...latest, configValue: policy.configValue } }), '恢复独立环境原定标政策');
    check('小额定标阈值已恢复原值', database(`SELECT config_value FROM sys_config WHERE config_id=${configId};`) === policy.configValue);
  }
  const awardVersion = (await detail(boundary.rfqId)).rfq.version;
  const queued = successful(await api(admin, `/oa/rfq/${boundary.rfqId}/notify-award`, { method: 'POST', body: { version: awardVersion } }), '真实登记定标通知');
  const awardMessages = await waitFor(() => sentMessages(boundary, '询价结果通知'), values => values.length === 3, '真实三家独立定标通知');
  check('定标通知逐家实际发送且只包含本家结果', queued === 3 && [first, second, declined].every(supplier => {
    const message = awardMessages.find(value => value.to.length === 1 && value.to[0] === supplier.contactEmail);
    return message && !message.cc && !message.bcc && message.attachments.length === 0
      && message.body.includes(supplier === first ? '中标供应商' : '本次未中标')
      && [first, second, declined].filter(otherSupplier => otherSupplier !== supplier).every(otherSupplier => !message.body.includes(otherSupplier.supplierName) && !message.body.includes(otherSupplier.contactEmail))
      && !['37.50', '12.50', '/comparison'].some(value => message.body.includes(value));
  }));
  await waitFor(() => database(`SELECT COUNT(*) FROM sys_message_delivery delivery JOIN sys_message_record record ON record.record_id=delivery.record_id JOIN oa_purchase_rfq_supplier invitation ON record.biz_id=CAST(invitation.rfq_supplier_id AS CHAR) WHERE invitation.rfq_id=${boundary.rfqId} AND record.biz_type='RFQ_EMAIL_AWARD' AND delivery.status='SENT';`), value => value === '3', '定标通知持久化接纳结果');
  await new Promise(resolve => setTimeout(resolve, 5200));
  successful(await api(admin, `/oa/rfq/${boundary.rfqId}/notify-award`, { method: 'POST', body: { version: (await detail(boundary.rfqId)).rfq.version } }), '重复登记同一轮定标通知');
  check('同一轮定标通知重复登记不增加投递记录', database(`SELECT COUNT(*) FROM sys_message_record record JOIN oa_purchase_rfq_supplier invitation ON record.biz_id=CAST(invitation.rfq_supplier_id AS CHAR) WHERE invitation.rfq_id=${boundary.rfqId} AND record.biz_type='RFQ_EMAIL_AWARD';`) === '3');

  await verifyRfqSelection({ admin, api, successful, session, database, check, directory, caseTag });
  console.log('RFQ_BOUNDARY_FIXTURES: deadline_column_only=true; delivery_success_fabricated=false; temporary_role_removal_restored=true; award_policy_restored=true');
}

export async function verifyRfqSelection({ admin, api, successful, session, database, check, directory, caseTag }) {
  const sqlText = value => `CONVERT(UNHEX('${Buffer.from(String(value)).toString('hex')}') USING utf8mb4)`;
  const title = `RFQ_SELECTION_${caseTag}`;
  const selectionId = successful(await api(admin, '/oa/rfq', { method: 'POST', body: {
    rfq: { title, quoteDeadline: database('SELECT DATE_ADD(CURRENT_DATE,INTERVAL 2 DAY);') },
    items: [{ itemName: `分页物料_${caseTag}`, quantity: 3, unit: '件' }],
  } }), '真实创建分页选择验收询价');
  assert.match(String(selectionId), /^\d+$/);
  const readSelection = async () => successful(await api(admin, `/oa/rfq/${selectionId}`), '读取选择后的真实询价');
  const consumableResponses = [];
  const observeConsumables = response => {
    const address = new URL(response.url());
    if (address.pathname.endsWith('/oa/consumable/list')) consumableResponses.push(response.json().then(body => ({ status: response.status(), pageSize: Number(address.searchParams.get('pageSize')), code: body.code }), error => ({ error: error.message })));
  };
  admin.on('response', observeConsumables);

  const prefix = `PAGINATION_${caseTag}_`;
  const fixtureRows = Array.from({ length: 102 }, (_, index) => {
    const code = prefix + String(index + 1).padStart(3, '0');
    return `(100000,${sqlText(code)},${sqlText(code)},'ACTIVE','2001-01-01 00:00:00',0)`;
  });
  database(`INSERT INTO oa_supplier(tenant_id,supplier_name,supplier_code,status,create_time,deleted) VALUES ${fixtureRows.join(',')};`);
  const materialPrefix = `RFQ_MATERIAL_${caseTag}_`;
  const materialRows = Array.from({ length: 102 }, (_, index) => `(100000,${sqlText(materialPrefix + String(index + 1).padStart(3, '0'))},'件','ACTIVE',0)`);
  database(`INSERT INTO oa_consumable(tenant_id,name,unit,status,deleted) VALUES ${materialRows.join(',')};`);
  try {
    await admin.setViewportSize({ width: 320, height: 1000 });
    await admin.goto(new URL('/', admin.url()).href);
    await admin.getByRole('button', { name: '询价采购', exact: true }).click();
    await admin.getByRole('textbox', { name: '搜索询价标题', exact: true }).waitFor();
    await admin.reload();
    await admin.getByRole('textbox', { name: '搜索询价标题', exact: true }).waitFor();
    check('320px手机从首页打开询价并刷新后仍能访问', await admin.getByRole('textbox', { name: '搜索询价标题', exact: true }).isVisible()
      && await admin.locator('.cf-mobile-app-content').count() === 1);
    await admin.getByRole('textbox', { name: '搜索询价标题', exact: true }).fill(title);
    await admin.getByRole('row').filter({ has: admin.getByText(title, { exact: true }) }).getByRole('button', { name: '查看详情', exact: true }).click();
    const workspace = admin.getByRole('dialog', { name: title, exact: true });
    await workspace.getByRole('button', { name: '邀请供应商', exact: true }).click();
    const dialog = admin.getByRole('dialog', { name: '邀请供应商', exact: true });
    const search = async name => {
      await dialog.getByRole('textbox', { name: '供应商名称', exact: true }).fill(name);
      const response = admin.waitForResponse(value => {
        const address = new URL(value.url());
        return address.pathname.endsWith('/supplier/list') && address.searchParams.get('supplierName') === name && address.searchParams.get('pageNum') === '1';
      });
      await dialog.getByRole('button', { name: '搜索供应商', exact: true }).click();
      const result = await response;
      assert.equal(result.status(), 200);
      const payload = await result.json();
      assert.equal(payload.code, 200);
      await dialog.getByText('正在加载供应商', { exact: true }).waitFor({ state: 'hidden' });
      return payload.data;
    };
    const firstPage = await search(prefix);
    check('供应商搜索真实返回102家且每页最多20家', Number(firstPage.total) === 102 && firstPage.records.length === 20);
    const next = async page => {
      const response = admin.waitForResponse(value => {
        const address = new URL(value.url());
        return address.pathname.endsWith('/supplier/list') && address.searchParams.get('pageNum') === String(page) && address.searchParams.get('supplierName') === prefix;
      });
      await dialog.getByRole('button', { name: '下一页供应商', exact: true }).click();
      assert.equal((await response).status(), 200);
      await dialog.getByText('正在加载供应商', { exact: true }).waitFor({ state: 'hidden' });
    };
    for (let page = 2; page <= 6; page++) await next(page);
    await dialog.getByRole('checkbox', { name: new RegExp(prefix + '001') }).check();
    check('首100家之外的供应商可以通过真实第6页勾选', await dialog.getByRole('checkbox', { name: new RegExp(prefix + '001') }).isChecked());
    await search(prefix + '102');
    await dialog.getByRole('checkbox', { name: new RegExp(prefix + '102') }).check();
    check('切换搜索保留其他页选择', await dialog.getByText('选择供应商（已选 2 家，最多 200 家）', { exact: true }).isVisible());
    await search(prefix);
    for (let page = 2; page <= 6; page++) await next(page);
    check('返回原页保留勾选且末页不可继续翻页', await dialog.getByRole('checkbox', { name: new RegExp(prefix + '001') }).isChecked()
      && await dialog.getByRole('button', { name: '下一页供应商', exact: true }).isDisabled());
    await dialog.getByRole('button', { name: '清空已选', exact: true }).click();
    check('清空选择后不能误提交隐藏页面中的供应商', await dialog.getByRole('button', { name: '登记邀请', exact: true }).isDisabled());
    await dialog.getByRole('button', { name: '取消', exact: true }).click();
    check('仅筛选和翻页不生成任何邀请或消息', database(`SELECT COUNT(*) FROM oa_purchase_rfq_supplier WHERE rfq_id=${selectionId};`) === '0');

    await workspace.getByRole('button', { name: '关联耗材', exact: true }).click();
    const binding = admin.getByRole('dialog', { name: '关联采购耗材', exact: true });
    const materialSearch = async (dialog, keyword) => {
      await dialog.getByRole('textbox', { name: '搜索耗材目录', exact: true }).fill(keyword);
      const response = admin.waitForResponse(value => {
        const address = new URL(value.url());
        return address.pathname.endsWith('/consumable/list') && address.searchParams.get('name') === keyword && address.searchParams.get('pageNum') === '1';
      });
      await dialog.getByRole('button', { name: '查找', exact: true }).click();
      const result = await response;
      assert.equal(result.status(), 200);
      const payload = await result.json();
      assert.equal(payload.code, 200);
      await dialog.getByRole('button', { name: '选择耗材', exact: true }).waitFor();
      return payload.data;
    };
    const materials = await materialSearch(binding, materialPrefix);
    check('耗材搜索返回102条且每页10条，没有超限或自动保存', Number(materials.total) === 102 && materials.records.length === 10
      && await binding.isVisible() && !(await readSelection()).items[0].consumableId);
    for (let page = 2; page <= 11; page++) {
      const response = admin.waitForResponse(value => {
        const address = new URL(value.url());
        return address.pathname.endsWith('/consumable/list') && address.searchParams.get('name') === materialPrefix && address.searchParams.get('pageNum') === String(page);
      });
      await binding.getByRole('button', { name: '下一页耗材', exact: true }).click();
      const result = await response;
      assert.equal(result.status(), 200);
      assert.equal((await result.json()).code, 200);
    }
    await binding.getByRole('button', { name: '选择耗材', exact: true }).click();
    await admin.getByRole('option', { name: new RegExp(materialPrefix + '001') }).click();
    check('首100条之外的耗材可以选择，翻页与选择不会提前保存', await binding.isVisible()
      && !(await readSelection()).items[0].consumableId && await binding.getByRole('button', { name: '下一页耗材', exact: true }).isDisabled());
    for (const width of [375, 320]) {
      await admin.setViewportSize({ width, height: 1000 });
      const bounds = await binding.getByRole('button', { name: '选择耗材', exact: true }).boundingBox();
      check(`耗材选择${width}px无页面横向溢出且选择控件至少44px`, await admin.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth) && bounds?.height >= 44);
      await admin.screenshot({ path: path.join(directory, `rfq-consumable-${caseTag}-${width}.png`), fullPage: true });
    }
    const itemId = (await readSelection()).items[0].itemId;
    const bindingResponse = admin.waitForResponse(response => response.url().endsWith(`/oa/rfq/${selectionId}/items/${itemId}/consumable`) && response.request().method() === 'POST');
    await binding.getByRole('button', { name: '保存', exact: true }).click();
    assert.equal((await (await bindingResponse).json()).code, 200);
    await binding.waitFor({ state: 'hidden' });
    const materialId = database(`SELECT consumable_id FROM oa_consumable WHERE tenant_id=100000 AND name=${sqlText(materialPrefix + '001')};`);
    check('手机真实提交并持久化首100条之外的耗材关联', String((await readSelection()).items[0].consumableId) === materialId);

    await workspace.getByRole('button', { name: '编辑草稿', exact: true }).click();
    const editor = admin.getByRole('dialog', { name: '询价单草稿', exact: true });
    await editor.getByRole('button', { name: '编辑', exact: true }).click();
    const materialEditor = admin.getByRole('dialog', { name: '询价物料', exact: true });
    await materialSearch(materialEditor, materialPrefix + '102');
    check('物料编辑搜索不会触发保存且已有关联保留', await materialEditor.isVisible()
      && await materialEditor.getByRole('button', { name: '清除耗材关联', exact: true }).isVisible()
      && String((await readSelection()).items[0].consumableId) === materialId);
    await materialEditor.getByRole('button', { name: '清除耗材关联', exact: true }).click();
    await materialEditor.getByRole('button', { name: '取消', exact: true }).click();
    await editor.getByRole('button', { name: '取消', exact: true }).click();
    check('取消物料编辑不会修改已保存的耗材关联', String((await readSelection()).items[0].consumableId) === materialId);
    const captured = await Promise.all(consumableResponses);
    check('详情及编辑全部耗材请求均在100条限制内并成功', captured.length >= 13 && captured.every(response => !response.error && response.status === 200 && response.code === 200 && response.pageSize >= 1 && response.pageSize <= 100));
    await admin.setViewportSize({ width: 1440, height: 1000 });
    await admin.goto(new URL('/office/rfqs', admin.url()).href);
    await admin.getByRole('textbox', { name: '搜索询价标题', exact: true }).fill(title);
    await admin.getByRole('row').filter({ has: admin.getByText(title, { exact: true }) }).getByRole('button', { name: '查看详情', exact: true }).click();
    await workspace.getByRole('button', { name: '关联耗材', exact: true }).click();
    await binding.getByRole('button', { name: '选择耗材', exact: true }).waitFor();
    check('1440px电脑首次访问可查看手机保存的关联且不溢出', await binding.getByRole('button', { name: '选择耗材', exact: true }).textContent().then(value => value.includes(materialId))
      && await admin.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    await admin.screenshot({ path: path.join(directory, `rfq-consumable-${caseTag}-1440.png`), fullPage: true });
    await binding.getByRole('button', { name: '取消', exact: true }).click();
    const employee = await session('g_holiday_employee');
    try {
      await employee.setViewportSize({ width: 320, height: 1000 });
      await employee.goto(new URL('/', employee.url()).href);
      await employee.getByRole('button', { name: '会议室', exact: true }).waitFor();
      check('无询价权限的员工手机首页不出现采购入口', await employee.getByRole('button', { name: '询价采购', exact: true }).count() === 0);
      await employee.goto(new URL('/office/rfqs', employee.url()).href);
      await employee.getByText('您没有访问此页面的权限', { exact: true }).waitFor();
      check('员工手工输入手机询价地址仍被权限保护拒绝', await employee.getByRole('textbox', { name: '搜索询价标题', exact: true }).count() === 0);
    } finally { await employee.context().close(); }
  } finally {
    admin.off('response', observeConsumables);
    database(`DELETE FROM oa_supplier WHERE tenant_id=100000 AND LEFT(supplier_code,${prefix.length})=${sqlText(prefix)};`);
    database(`DELETE FROM oa_consumable WHERE tenant_id=100000 AND LEFT(name,${materialPrefix.length})=${sqlText(materialPrefix)} AND consumable_id NOT IN (SELECT consumable_id FROM oa_purchase_rfq_item WHERE consumable_id IS NOT NULL);`);
    console.log(`RFQ_SELECTION_FIXTURES: supplier_inputs_removed=102; referenced_materials_retained=${database(`SELECT COUNT(*) FROM oa_consumable WHERE tenant_id=100000 AND LEFT(name,${materialPrefix.length})=${sqlText(materialPrefix)};`)}; business_save_fabricated=false; production_modified=false`);
  }
}
