import path from 'node:path';

export async function verifyReceivableInvoiceEntry(context) {
  const { admin, api, successful, database, check, caseTag, evidence, create, read, reject, today, state } = context;
  const detail = async invoiceId => successful(await api(admin, `/oa/invoice/${invoiceId}`), '读取真实发票到账及页面版本');
  const writeoffs = invoiceId => Number(database(`SELECT COUNT(*) FROM oa_invoice_writeoff WHERE tenant_id=100000 AND invoice_id=${invoiceId};`));
  const events = record => Number(database(`SELECT COUNT(*) FROM crm_deal_event WHERE tenant_id=100000 AND biz_type='RECEIVABLE' AND biz_id=${record.receivableId};`));
  const prepare = async suffix => {
    const record = await create(`invoice_${suffix}`, '100');
    successful(await api(admin, `/crm/receivable/${record.receivableId}/writeoff`, { method: 'POST', body: {
      version: record.version, amount: '30', writeoffDate: today, remark: `绑定前实际到账_${caseTag}_${suffix}`,
    } }), '真实CRM入口登记绑定前历史到账30');
    const historical = await read(record.receivableId);
    check('绑定前真实到账30且剩余70', Number(historical.receivedAmount) === 30 && Number(historical.outstandingAmount) === 70);
    const invoiceNo = `H3_RI_${caseTag}_${suffix}`;
    successful(await api(admin, '/oa/invoice', { method: 'POST', body: {
      invoiceDirection: 'OUTPUT', invoiceCode: invoiceNo, invoiceNo, invoiceDate: today,
      grossAmount: '100', taxAmount: '0', buyerName: record.customerName,
    } }), '创建真实销项发票');
    const invoiceId = Number(database(`SELECT invoice_id FROM oa_invoice WHERE tenant_id=100000 AND invoice_no='${invoiceNo}' AND deleted=0;`));
    check('真实销项发票已创建且未伪造回款绑定', Number.isSafeInteger(invoiceId) && invoiceId > 0 && historical.invoiceId == null);
    const factsBefore = events(record);
    check('绑定前30元已保存一笔真实收款来源', factsBefore === 1
      && database(`SELECT COUNT(*) FROM crm_deal_event WHERE tenant_id=100000 AND biz_type='RECEIVABLE' AND biz_id=${record.receivableId} AND event_type='RECEIPT' AND amount=30 AND reversal_of_id IS NULL AND baseline_flag=0;`) === '1');
    successful(await api(admin, `/crm/receivable/${record.receivableId}/bind-invoice/${invoiceId}`, { method: 'POST' }), '通过真实CRM和OA绑定发票');
    const linked = await read(record.receivableId);
    const invoice = await detail(invoiceId);
    check('真实绑定保留历史30，发票累计30、剩余70，不重新登记或分配历史到账', linked.invoiceId === invoiceId
      && linked.invoiceStatus === 'WRITEOFF_PARTIAL' && invoice.receivableId === record.receivableId
      && Number(linked.receivedAmount) === 30 && Number(invoice.receivedAmount) === 30
      && Number(invoice.outstandingAmount) === 70 && writeoffs(invoiceId) === 0 && events(record) === factsBefore);
    return { invoiceRecord: linked, invoiceId, invoiceNo };
  };
  const request = (invoice, amount = '20', changes = {}) => ({
    businessType: 'CRM_RECEIVABLE', businessId: invoice.receivableId, invoiceVersion: invoice.version,
    writeoffAmount: amount, writeoffDate: today, remark: `发票实际到账_${caseTag}`, ...changes,
  });
  const primary = await prepare('primary');
  const { invoiceId, invoiceRecord: record } = primary;
  let linked = record;
  let invoice = await detail(invoiceId);
  const boundVersion = invoice.version;
  const sourceCount = () => database(`SELECT COUNT(*) FROM outbox_event WHERE tenant_id=100000 AND aggregate_id=${invoiceId} AND event_type='INVOICE_RECEIVABLE_CHANGED';`);
  const beforeSources = sourceCount();
  successful(await api(admin, `/oa/invoice/bind/${invoiceId}`, { method: 'PUT', body: { receivableId: record.receivableId } }), '真实OA入口重复绑定同一回款计划');
  check('重复绑定不增加发票版本、历史核销或持久通知', (await detail(invoiceId)).version === boundVersion
    && (await read(record.receivableId)).version === linked.version && writeoffs(invoiceId) === 0 && sourceCount() === beforeSources);
  const deny = async current => {
    for (const [requestPath, body, label] of [
      [`/crm/receivable/${record.receivableId}/confirm`, { version: current.version }, '绑定发票后CRM全额确认被拒绝'],
      [`/crm/receivable/${record.receivableId}/writeoff`, { version: current.version, amount: '1', writeoffDate: today }, '绑定发票后CRM部分收款被拒绝'],
      [`/crm/customer/${record.customerId}/workspace/receivable/${record.receivableId}/confirm`, { version: current.version }, '客户工作台不能绕过发票收款入口'],
    ]) reject(await api(admin, requestPath, { method: 'POST', body }), label, /已绑定发票.*发票页面|频繁|重复/);
    const after = await read(record.receivableId);
    check('绑定后拒绝CRM收款不改变到账、余额和版本', after.receivedAmount === current.receivedAmount
      && after.outstandingAmount === current.outstandingAmount && after.version === current.version && after.invoiceId === invoiceId);
  };
  await deny(linked);
  for (const [label, changes] of [
    ['真实发票收款缺少页面版本被拒绝', { invoiceVersion: undefined }],
    ['真实发票不能重复登记历史金额导致超额', { writeoffAmount: '70.01' }],
    ['真实发票不能登记超过分的金额', { writeoffAmount: '0.001' }],
    ['真实发票不能写入其他回款对象', { businessId: record.receivableId + 1 }],
  ]) reject(await api(admin, `/oa/invoice/${invoiceId}/writeoff`, { method: 'POST', body: request(invoice, '20', changes) }), label);
  const receiptRequest = request(invoice);
  successful(await api(admin, `/oa/invoice/${invoiceId}/writeoff`, { method: 'POST', body: receiptRequest }), '在真实发票入口登记本次新增到账20');
  linked = await read(record.receivableId); invoice = await detail(invoiceId);
  check('真实CRM历史30加发票新增20，两边累计均50、剩余均50', Number(linked.receivedAmount) === 50
    && Number(linked.outstandingAmount) === 50 && Number(invoice.receivedAmount) === 50
    && Number(invoice.outstandingAmount) === 50 && Number(invoice.pendingReceivedAmount) === 0);
  reject(await api(admin, `/oa/invoice/${invoiceId}/writeoff`, { method: 'POST', body: { ...receiptRequest, remark: `重复页面_${caseTag}` } }),
    '绕开相同请求频率限制后，旧页面版本仍不能重复登记', /发票已被修改|版本/);
  await deny(linked);
  check('实际新增20只生成一笔新到账事实，历史30的原事实和审计保持不变', writeoffs(invoiceId) === 1 && events(record) === 2
    && database(`SELECT COUNT(*) FROM sys_audit_log WHERE tenant_id=100000 AND audit_field='CRM_RECEIVABLE:${record.receivableId}' AND audit_name='CRM_RECEIVABLE_WRITEOFF';`) === '1'
    && database(`SELECT COUNT(*) FROM crm_deal_event WHERE tenant_id=100000 AND biz_type='RECEIVABLE' AND biz_id=${record.receivableId} AND event_type='RECEIPT' AND amount=30 AND reversal_of_id IS NULL AND baseline_flag=0;`) === '1'
    && database(`SELECT COUNT(*) FROM crm_deal_event WHERE tenant_id=100000 AND biz_type='RECEIVABLE' AND biz_id=${record.receivableId} AND event_type='RECEIPT' AND amount=20 AND baseline_flag=0;`) === '1');
  check('新增到账通过真实HR核验并冻结20元分配，未提前发薪', database(`SELECT COUNT(*) FROM crm_deal_allocation allocation JOIN crm_deal_event event ON event.event_id=allocation.event_id AND event.tenant_id=allocation.tenant_id JOIN hr_employee employee ON employee.id=allocation.employee_id AND employee.tenant_id=allocation.tenant_id WHERE event.tenant_id=100000 AND event.biz_type='RECEIVABLE' AND event.biz_id=${record.receivableId} AND allocation.allocated_amount=20 AND allocation.sales_user_id=${record.ownerId} AND employee.user_id=allocation.sales_user_id AND allocation.commission_status='UNCONFIRMED' AND allocation.comp_change_id IS NULL;`) === '1');
  const envelope = JSON.parse(database(`SELECT payload_json FROM outbox_event WHERE tenant_id=100000 AND aggregate_id=${invoiceId} AND event_type='INVOICE_RECEIVABLE_CHANGED' AND JSON_UNQUOTE(JSON_EXTRACT(JSON_UNQUOTE(JSON_EXTRACT(payload_json,'$.payload')),'$.operation'))='RECEIPT' ORDER BY id DESC LIMIT 1;`));
  const source = JSON.parse(envelope.payload);
  check('OA持久来源保存真实前后金额30和50、本次20及冻结员工身份', source.invoiceId === invoiceId
    && Number(source.receivedBefore) === 30 && Number(source.receivedAfter) === 50 && Number(source.receiptAmount) === 20
    && source.members.length === 1 && source.members[0].userId === record.ownerId && source.members[0].employeeId > 0);
  const crmPort = state.services.find(service => service.name === 'crm')?.port;
  check('真实重放只访问已核验的隔离CRM回环端口', Number.isInteger(crmPort) && crmPort > 1024 && crmPort < 65536);
  const replay = async body => {
    const response = await fetch(`http://127.0.0.1:${crmPort}/inner/crm/receivable/${record.receivableId}/invoice-status`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Inner-Call': 'true', 'X-From-Service': 'cloudflow-service-oa', 'X-Tenant-Id': '100000' },
      body: JSON.stringify(body), signal: AbortSignal.timeout(20000),
    });
    return { status: response.status, body: await response.json() };
  };
  const replayVersion = linked.version;
  const replayed = await Promise.all([replay({ eventId: envelope.eventId }), replay({ eventId: envelope.eventId })]);
  check('真实持久来源通过内部HTTP并发重放两次均成功进入业务处理', replayed.every(result => result.status === 200 && result.body?.code === 200));
  linked = await read(record.receivableId);
  check('内部HTTP重放不依赖队列去重，累计仍50、版本不变、原30和新增20仍各一笔', Number(linked.receivedAmount) === 50
    && linked.version === replayVersion && events(record) === 2 && writeoffs(invoiceId) === 1);
  reject(await replay({ invoiceId, invoiceStatus: 'WRITEOFF_FULL', totalWriteoffAmount: '100' }), '内部接口也拒绝缺乏持久来源的裸累计值', /来源|编号/);
  evidence.invoiceReceiptEntry = true; evidence.invoiceReceiptAllocations = true; evidence.invoiceReceiptInnerReplay = true;
  const concurrent = await prepare('concurrent');
  const concurrentInvoice = await detail(concurrent.invoiceId);
  const competing = await Promise.all(['first', 'second'].map(remark => api(admin, `/oa/invoice/${concurrent.invoiceId}/writeoff`, {
    method: 'POST', body: request(concurrentInvoice, '20', { remark: `${remark}_${caseTag}` }),
  })));
  check('不同请求内容绕开频率去重后，两笔同版本收款仍仅一次成功', competing.filter(result => result.status === 200 && result.body?.code === 200).length === 1);
  check('真实并发发票收款只增加20，CRM累计50且历史和新增收款事实各一笔', Number((await read(concurrent.invoiceRecord.receivableId)).receivedAmount) === 50
    && Number((await detail(concurrent.invoiceId)).receivedAmount) === 50 && writeoffs(concurrent.invoiceId) === 1 && events(concurrent.invoiceRecord) === 2);
  evidence.invoiceReceiptConcurrency = true;
  return prepare('interface');
}

async function holdInvoiceResponse(admin, pattern, method, action, inspect, check) {
  let release, observe, finish;
  const held = new Promise(resolve => { release = resolve; });
  const observed = new Promise(resolve => { observe = resolve; });
  const finished = new Promise(resolve => { finish = resolve; });
  let started = false, failure, timer;
  const handler = async route => {
    if (route.request().method() !== method) return route.continue();
    started = true;
    try {
      const response = await route.fetch({ timeout: 20000 });
      observe({ status: response.status(), body: await response.json() });
      await held; await route.fulfill({ response });
    } catch (error) { failure = error; observe({ failure: error.message }); await route.abort(); }
    finally { finish(); }
  };
  await admin.route(pattern, handler);
  try {
    await action();
    const response = await Promise.race([observed, new Promise((resolve, reject) => { timer = setTimeout(() => reject(new Error('真实发票响应等待超时')), 25000); })]);
    check(`发票${method}等待状态使用真实服务响应，仅延迟传输`, response.status === 200 && response.body?.code === 200);
    await inspect();
  } finally { clearTimeout(timer); release(); if (started) await finished; await admin.unroute(pattern, handler); }
  if (failure) throw failure;
}

export async function verifyReceivableInvoiceInterface(context) {
  const { admin, employee, api, successful, database, check, directory, caseTag, evidence, invoiceRecord, invoiceId, invoiceNo, read } = context;
  const navigate = route => admin.goto(new URL(route, admin.url()).href, { waitUntil: 'domcontentloaded' });
  const notice = '已绑定发票，请在发票页面登记收款；此处只查看到账结果。';
  await admin.setViewportSize({ width: 320, height: 1000 });
  await navigate('/office/invoice');
  await admin.getByPlaceholder('搜索发票代码或号码', { exact: true }).fill(invoiceNo);
  const invoiceRow = admin.getByRole('row').filter({ hasText: invoiceNo });
  await invoiceRow.waitFor();
  const editor = admin.getByRole('dialog', { name: '发票核销', exact: true });
  const amount = editor.getByLabel('本次新增到账', { exact: false });
  await holdInvoiceResponse(admin, `**/api/oa/invoice/${invoiceId}`, 'GET', () => invoiceRow.getByRole('button', { name: '核销发票', exact: true }).click(), async () => {
    check('发票详情读取完成前禁用金额和确认，避免按旧累计重复登记', await amount.isDisabled()
      && await editor.getByRole('button', { name: '确认核销', exact: true }).isDisabled());
  }, check);
  await amount.fill('20');
  const remark = editor.getByPlaceholder('例如：景曜科技首期回款到账 2 万，先做部分核销。', { exact: true });
  const draft = `历史30新增20_${caseTag}`;
  await remark.fill(draft);
  check('手机发票页先展示历史累计30、剩余70和勿重复登记说明', await editor.getByTestId('invoice-received-total').innerText() === '¥30.00'
    && await editor.getByTestId('invoice-receipt-remaining').innerText() === '¥70.00'
    && (await editor.innerText()).includes('累计到账已包含绑定前历史到账，请勿重复登记。'));
  const mounted = await editor.elementHandle();
  try {
    for (const width of [320, 1440, 375]) {
      await admin.setViewportSize({ width, height: 1000 });
      await admin.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const save = editor.getByRole('button', { name: '确认核销', exact: true });
      await save.click({ trial: true });
      const bounds = await save.boundingBox();
      const dimensions = await admin.evaluate(() => ({ document: document.documentElement.scrollWidth, viewport: innerWidth }));
      check(`发票收款${width}px保留同一输入、无页面溢出、操作区至少44px`, await mounted.evaluate(element => element.isConnected)
        && await amount.inputValue() === '20' && await remark.inputValue() === draft && dimensions.document <= dimensions.viewport
        && bounds?.width >= 44 && bounds?.height >= 44);
      await admin.screenshot({ path: path.join(directory, `h3-invoice-receipt-editor-${caseTag}-${width}.png`), fullPage: true });
    }
  } finally { await mounted.dispose(); }
  let current = successful(await api(admin, `/oa/invoice/${invoiceId}`), '读取另一操作前的真实发票版本');
  successful(await api(admin, '/oa/invoice', { method: 'PUT', body: { ...current, remark: `服务器已有修改_${caseTag}` } }), '实际编辑发票产生页面版本冲突');
  await editor.getByRole('button', { name: '确认核销', exact: true }).click();
  await editor.getByRole('alert').waitFor();
  check('真实发票冲突保留本次20、日期和说明，核对前禁止再次提交', await amount.inputValue() === '20'
    && await remark.inputValue() === draft && await editor.getByRole('button', { name: '确认核销', exact: true }).isDisabled()
    && /发票已被修改|版本/.test(await editor.getByRole('alert').innerText()));
  await holdInvoiceResponse(admin, `**/api/oa/invoice/${invoiceId}`, 'GET',
    () => editor.getByRole('button', { name: '核对最新到账', exact: true }).click(), async () => {
      check('重新读取最新到账时仍保留输入，不能提前确认', await amount.inputValue() === '20' && await amount.isDisabled()
        && await editor.getByRole('button', { name: '确认核销', exact: true }).isDisabled());
    }, check);
  const adopt = editor.getByRole('button', { name: '已核对，采用最新版本', exact: true });
  await adopt.waitFor();
  check('最新结果只读展示30和70，采用前本次金额保持20', (await editor.innerText()).includes('最新累计到账 ¥30.00，剩余可登记 ¥70.00')
    && await amount.inputValue() === '20' && await editor.getByRole('button', { name: '确认核销', exact: true }).isDisabled());
  await adopt.click();
  await holdInvoiceResponse(admin, `**/api/oa/invoice/${invoiceId}/writeoff`, 'POST',
    () => editor.getByRole('button', { name: '确认核销', exact: true }).click(), async () => {
      check('保存中禁止重复提交、改金额、取消及关闭', await amount.isDisabled() && await remark.isDisabled()
        && await editor.getByRole('button', { name: '核销中...', exact: true }).isDisabled()
        && await editor.getByRole('button', { name: '取消', exact: true }).isDisabled()
        && await editor.getByRole('button', { name: '关闭', exact: true }).count() === 0);
      await admin.keyboard.press('Escape');
      check('发票保存等待时Escape不能关闭，数据库已经真实提交新增20', await editor.isVisible()
        && Number((await read(invoiceRecord.receivableId)).receivedAmount) === 50);
    }, check);
  await editor.getByTestId('invoice-received-total').filter({ hasText: '¥50.00' }).waitFor();
  await editor.getByRole('button', { name: '确认核销', exact: true }).waitFor();
  check('真实页面保存后累计50、剩余50、本次金额归零并禁止原值再次提交', await amount.inputValue() === '0'
    && await editor.getByTestId('invoice-receipt-remaining').innerText() === '¥50.00'
    && await editor.getByRole('button', { name: '确认核销', exact: true }).isDisabled());
  await editor.getByRole('button', { name: '取消', exact: true }).click();
  const received = await read(invoiceRecord.receivableId);
  check('手机发票页真实30加20累计50，只有本次20的核销记录', Number(received.receivedAmount) === 50 && Number(received.outstandingAmount) === 50
    && database(`SELECT COUNT(*) FROM oa_invoice_writeoff WHERE tenant_id=100000 AND invoice_id=${invoiceId} AND writeoff_amount=20;`) === '1');
  for (const width of [320, 1440, 375]) {
    await admin.setViewportSize({ width, height: 1000 });
    await navigate('/office/crm/receivables');
    const row = admin.getByRole('row').filter({ hasText: invoiceRecord.receivableName });
    await row.getByText(notice, { exact: true }).waitFor();
    let dimensions = await admin.evaluate(() => ({ document: document.documentElement.scrollWidth, viewport: innerWidth }));
    const displayedAmounts = (await row.innerText()).match(/到账\s+([\d.]+)；未收\s+([\d.]+)/);
    check(`已绑定回款${width}px只读显示50且无确认收款入口`, await row.getByRole('button', { name: '确认回款', exact: true }).count() === 0
      && Number(displayedAmounts?.[1]) === 50 && Number(displayedAmounts?.[2]) === 50 && dimensions.document <= dimensions.viewport);
    await admin.screenshot({ path: path.join(directory, `h3-invoice-receivable-${caseTag}-${width}.png`), fullPage: true });
    await navigate(`/office/crm/customer/${invoiceRecord.customerId}`);
    await admin.getByRole('tab', { name: '回款与发票', exact: true }).click();
    const workspaceRow = admin.getByRole('row').filter({ hasText: invoiceRecord.receivableName }).filter({ has: admin.getByText(notice, { exact: true }) });
    await workspaceRow.waitFor();
    dimensions = await admin.evaluate(() => ({ document: document.documentElement.scrollWidth, viewport: innerWidth }));
    const workspaceReceived = (await workspaceRow.innerText()).match(/已到账\s+([\d.]+)/);
    check(`客户工作台${width}px绑定后只读累计50且无页面溢出`, await workspaceRow.getByRole('button', { name: '确认回款', exact: true }).count() === 0
      && Number(workspaceReceived?.[1]) === 50 && dimensions.document <= dimensions.viewport);
    await admin.screenshot({ path: path.join(directory, `h3-invoice-workspace-${caseTag}-${width}.png`), fullPage: true });
  }
  await admin.reload({ waitUntil: 'domcontentloaded' });
  await admin.getByRole('tab', { name: '回款与发票', exact: true }).click();
  check('手机工作台刷新仍显示绑定发票的只读结果', await admin.getByText(notice, { exact: true }).count() > 0);
  await navigate('/office/invoice');
  await admin.getByPlaceholder('搜索发票代码或号码', { exact: true }).fill(invoiceNo);
  await invoiceRow.getByRole('button', { name: '核销发票', exact: true }).click();
  await editor.getByTestId('invoice-received-total').filter({ hasText: '¥50.00' }).waitFor();
  check('重新打开手机发票保留真实累计50，本次新增金额仍为0', await amount.inputValue() === '0'
    && await editor.getByRole('button', { name: '确认核销', exact: true }).isDisabled());
  await editor.getByRole('button', { name: '取消', exact: true }).click();
  await employee.setViewportSize({ width: 320, height: 1000 });
  await employee.goto(new URL('/office/invoice', employee.url()).href, { waitUntil: 'domcontentloaded' });
  check('员工直达手机发票页没有收款操作', await employee.getByRole('button', { name: '核销发票', exact: true }).count() === 0);
  current = successful(await api(admin, `/oa/invoice/${invoiceId}`), '读取权限验收前最新发票版本');
  const denied = await api(employee, `/oa/invoice/${invoiceId}/writeoff`, { method: 'POST', body: {
    businessType: 'CRM_RECEIVABLE', businessId: invoiceRecord.receivableId, invoiceVersion: current.version, writeoffAmount: '1',
  } });
  check('员工即使携带有效版本也不能通过发票接口取得收款权限', denied.status === 403 && denied.body?.code === 403);
  evidence.invoiceReceiptDesktop = true; evidence.invoiceReceiptMobile = true; evidence.invoiceReceiptConflict = true;
}
