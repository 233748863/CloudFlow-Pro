import path from 'node:path';
import { createHash } from 'node:crypto';

export async function verifyCustomerCapacity({ runtime, marker, output, ownedCustomers, uiRequests, sources }) {
  const { check, ok, api, database, sessions } = runtime;
  const sql = value => "CONVERT(UNHEX('" + Buffer.from(String(value)).toString('hex') + "') USING utf8mb4)";
  const digest = value => createHash('sha256').update(value).digest('hex');
  const customerId = code => Number(database('SELECT customer_id FROM crm_customer WHERE customer_code=' + sql(code) + ' AND tenant_id=100000 AND deleted=0'));
  const customerRow = id => database('SELECT * FROM crm_customer WHERE customer_id=' + id);
  const sized = (prefix, character, length) => prefix + character.repeat(length - Array.from(prefix).length);
  const invalid = (response, label) => check(label, response.status < 500 && response.body?.code === 400 && response.body?.msg === '客户名称不能超过120个字符');
  check('customer_name_database_capacity', database("SELECT character_maximum_length FROM information_schema.columns WHERE table_schema='cloud_flow_db' AND table_name='crm_customer' AND column_name='customer_name'") === '120');
  let sampleCustomer;
  for (const [suffix, character] of [['ascii', 'A'], ['chinese', '客'], ['supplementary', '𠮷']]) {
    const code = marker + '_name_' + suffix;
    const name = sized(code, character, 120);
    check('name_exact_capacity_' + suffix, Array.from(name).length === 120);
    await ok('sales', '/crm/customer', 'POST', { customerCode: code, customerName: name, ownerId: Number(sessions.sales.identity.userId) });
    const id = customerId(code);
    check('name_created_' + suffix, Number.isSafeInteger(id) && id > 0);
    ownedCustomers.set(id, 'admin');
    let current = await ok('sales', '/crm/customer/' + id);
    check('name_reread_' + suffix, current.customerName === name && database('SELECT CHAR_LENGTH(customer_name) FROM crm_customer WHERE customer_id=' + id) === '120');
    const changedName = sized(code + '_edit', character, 120);
    await ok('sales', '/crm/customer', 'PUT', { ...current, customerName: changedName });
    current = await ok('sales', '/crm/customer/' + id);
    check('name_edit_exact_capacity_' + suffix, current.customerName === changedName);
    sampleCustomer ||= current;
  }
  for (const [suffix, character] of [['ascii', 'A'], ['chinese', '客'], ['supplementary', '𠮷']]) {
    const name = sized(marker + '_over_' + suffix, character, 121);
    const before = digest(database('SELECT * FROM crm_customer ORDER BY customer_id'));
    invalid(await api('sales', '/crm/customer', { method: 'POST', body: { customerCode: marker + '_reject_' + suffix, customerName: name } }), 'name_create_over_limit_rejected_' + suffix);
    check('name_create_rejection_preserves_rows_' + suffix, digest(database('SELECT * FROM crm_customer ORDER BY customer_id')) === before);
    invalid(await api('sales', '/crm/customer', { method: 'PUT', body: { ...sampleCustomer, customerName: name } }), 'name_edit_over_limit_rejected_' + suffix);
    check('name_edit_rejection_preserves_rows_' + suffix, digest(database('SELECT * FROM crm_customer ORDER BY customer_id')) === before);
  }
  const conversionCode = marker + '_capacity_lead';
  const defaultName = sized(conversionCode, '线', 120);
  const contactName = marker + '_capacity_contact';
  await ok('admin', '/crm/lead', 'POST', { leadNo: conversionCode, leadName: conversionCode, companyName: defaultName, contactName });
  const leadId = Number(database('SELECT lead_id FROM crm_lead WHERE tenant_id=100000 AND lead_no=' + sql(conversionCode) + ' AND deleted=0'));
  check('name_conversion_source_created', Number.isSafeInteger(leadId) && leadId > 0);
  const lead = await ok('admin', '/crm/lead/' + leadId);
  await ok('admin', '/crm/lead/' + leadId + '/qualify', 'POST', { version: lead.version, comment: '客户名称容量验收' });
  const leadFixture = { actor: 'admin', kind: 'LEAD', table: 'crm_lead', key: 'lead_id', id: leadId, query: 'SELECT * FROM crm_lead WHERE lead_id=' + leadId };
  leadFixture.hash = digest(database(leadFixture.query));
  sources.push(leadFixture);
  const conversionSnapshot = () => digest(['crm_lead', 'crm_customer', 'crm_contact', 'crm_opportunity'].map(table => database('SELECT * FROM ' + table + ' ORDER BY 1')).join('\n'));
  const conversionBefore = conversionSnapshot();
  for (const [suffix, character] of [['ascii', 'A'], ['chinese', '客'], ['supplementary', '𠮷']]) {
    invalid(await api('admin', '/crm/lead/convert', { method: 'POST', body: { leadId, customerName: sized(conversionCode, character, 121), createOpportunity: true } }), 'name_conversion_over_limit_rejected_' + suffix);
    check('name_conversion_rejection_preserves_rows_' + suffix, conversionSnapshot() === conversionBefore);
  }
  const correctedConversionName = sized(conversionCode, '𠮷', 120);
  const convertedId = await ok('admin', '/crm/lead/convert', 'POST', { leadId, customerName: correctedConversionName, createOpportunity: false });
  check('name_conversion_corrected_saved', Number.isSafeInteger(convertedId) && convertedId > 0);
  check('name_conversion_corrected_name_complete', (await ok('admin', '/crm/customer/' + convertedId)).customerName === correctedConversionName);
  check('name_conversion_source_linked_once', (await ok('admin', '/crm/lead/' + leadId)).convertedCustomerId === convertedId);
  leadFixture.hash = digest(database(leadFixture.query));
  const contactId = Number(database('SELECT contact_id FROM crm_contact WHERE tenant_id=100000 AND customer_id=' + convertedId + ' AND contact_name=' + sql(contactName) + ' AND deleted=0'));
  check('name_conversion_contact_created_once', Number.isSafeInteger(contactId) && contactId > 0);
  for (const [kind, table, key, id] of [['CUSTOMER', 'crm_customer', 'customer_id', convertedId], ['CONTACT', 'crm_contact', 'contact_id', contactId]]) {
    const query = 'SELECT * FROM ' + table + ' WHERE ' + key + '=' + id;
    sources.push({ actor: 'admin', kind, table, key, id, query, hash: digest(database(query)) });
  }
  const origin = new URL(sessions.admin.page.url()).origin;
  const page = await sessions.admin.context.newPage();
  page.setDefaultTimeout(30000);
  page.on('pageerror', () => runtime.browserErrors.push('customer_capacity'));
  page.on('response', response => { const url = new URL(response.url()); if (url.pathname.startsWith('/api/')) uiRequests.push({ path: url.pathname, method: response.request().method(), status: response.status() }); });
  const interval = Math.max(5000, Number(database("SELECT COALESCE(MAX(CAST(config_value AS UNSIGNED)),0) FROM sys_config WHERE config_key='sys.common.repeatSubmit.intervalMillis'"))) + 150;
  const save = async (dialog, method) => {
    const pending = page.waitForResponse(response => new URL(response.url()).pathname === '/api/crm/customer' && response.request().method() === method);
    await dialog.getByRole('button', { name: '保存', exact: true }).click();
    const response = await pending;
    return { status: response.status(), body: await response.json() };
  };
  try {
    await page.goto(origin + '/office/crm/customers', { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: '新增客户', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '新增客户', exact: true });
    const input = dialog.getByPlaceholder('客户名称，例如：景曜科技', { exact: true });
    const code = marker + '_ui_name';
    const tooLong = sized(code, '名', 121);
    await input.fill(tooLong);
    await dialog.getByPlaceholder('客户编码，留空自动生成', { exact: true }).fill(code);
    invalid(await save(dialog, 'POST'), 'ui_name_create_rejected');
    await page.getByText('客户名称不能超过120个字符', { exact: true }).first().waitFor();
    check('ui_name_create_single_error', await page.getByText('客户名称不能超过120个字符', { exact: true }).count() === 1);
    check('ui_name_create_draft_retained', await input.inputValue() === tooLong && await dialog.isVisible());
    check('ui_name_create_no_row', database('SELECT COUNT(*) FROM crm_customer WHERE customer_code=' + sql(code) + ' AND tenant_id=100000') === '0');
    await page.screenshot({ path: path.join(output, 'customer-name-create-rejected.png') });
    const corrected = sized(code, '名', 120);
    await input.fill(corrected);
    await new Promise(resolve => setTimeout(resolve, interval));
    const saved = await save(dialog, 'POST');
    check('ui_name_corrected_saved', saved.status === 200 && saved.body?.code === 200);
    const id = customerId(code);
    check('ui_name_created_id', Number.isSafeInteger(id) && id > 0);
    ownedCustomers.set(id, 'admin');
    await dialog.waitFor({ state: 'hidden' });
    check('ui_name_corrected_persisted', (await ok('admin', '/crm/customer/' + id)).customerName === corrected);
    await page.getByPlaceholder('客户 / 商机 / 报价关键字', { exact: true }).fill(code);
    const row = page.getByRole('row').filter({ hasText: corrected });
    await row.waitFor();
    await page.screenshot({ path: path.join(output, 'customer-name-corrected-saved.png') });
    await row.getByRole('button', { name: '编辑客户', exact: true }).click();
    const editor = page.getByRole('dialog', { name: '编辑客户', exact: true });
    const editInput = editor.getByPlaceholder('客户名称，例如：景曜科技', { exact: true });
    const beforeEdit = digest(customerRow(id));
    await editInput.fill(tooLong);
    invalid(await save(editor, 'PUT'), 'ui_name_edit_rejected');
    await page.getByText('客户名称不能超过120个字符', { exact: true }).first().waitFor();
    check('ui_name_edit_single_error', await page.getByText('客户名称不能超过120个字符', { exact: true }).count() === 1);
    check('ui_name_edit_draft_retained', await editInput.inputValue() === tooLong && await editor.isVisible());
    check('ui_name_edit_original_preserved', digest(customerRow(id)) === beforeEdit);
    await page.screenshot({ path: path.join(output, 'customer-name-edit-rejected.png') });
    await editor.getByRole('button', { name: '取消', exact: true }).click();
  } finally {
    await page.close();
  }
  return true;
}
