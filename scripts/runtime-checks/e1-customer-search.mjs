import path from 'node:path';
import { createHash } from 'node:crypto';

export async function verifyCustomerSearch({ runtime, marker, output, sources, ownedCustomers, uiRequests }) {
  const { check, ok, database, sessions } = runtime;
  const sql = value => "CONVERT(UNHEX('" + Buffer.from(String(value)).toString('hex') + "') USING utf8mb4)";
  const digest = value => createHash('sha256').update(value).digest('hex');
  const suffix = marker.substring('E1REF_'.length);
  const cases = [
    { kind: 'name', customerCode: 'SN' + suffix, customerName: marker + '名称检索', customerTags: '独立标签' },
    { kind: 'code', customerCode: marker + '_code_only', customerName: '编码检索样本' + suffix, customerTags: '独立标签' },
    { kind: 'tag', customerCode: 'ST' + suffix, customerName: '标签检索样本' + suffix, customerTags: marker + '_tag_only' },
  ];
  for (const fixture of cases) {
    const { customerCode, customerName, customerTags } = fixture;
    await ok('sales', '/crm/customer', 'POST', { customerCode, customerName, customerTags, ownerId: Number(sessions.sales.identity.userId) });
    fixture.id = Number(database('SELECT customer_id FROM crm_customer WHERE tenant_id=100000 AND customer_code=' + sql(fixture.customerCode) + ' AND deleted=0'));
    check('search_fixture_created_' + fixture.kind, Number.isSafeInteger(fixture.id) && fixture.id > 0);
    ownedCustomers.set(fixture.id, 'admin');
    fixture.query = 'SELECT * FROM crm_customer WHERE customer_id=' + fixture.id;
    fixture.hash = digest(database(fixture.query));
  }
  const ids = rows => rows.map(row => row.customerId).sort((left, right) => left - right);
  const expected = cases.map(fixture => fixture.id).sort((left, right) => left - right);
  const sameIds = (rows, values) => JSON.stringify(ids(rows)) === JSON.stringify([...values].sort((left, right) => left - right));
  const query = (actor, parameters = {}) => ok(actor, '/crm/customer/list?' + new URLSearchParams({ keyword: marker, pageSize: 100, ...parameters }));
  const own = await query('sales');
  check('search_name_code_or_tag', own.total === 3 && sameIds(own.rows, expected));
  const adminIds = [...expected, ...sources.filter(source => source.table === 'crm_customer' && source.actor === 'admin').map(source => source.id)];
  const admin = await query('admin');
  check('search_admin_scope', admin.total === adminIds.length && sameIds(admin.rows, adminIds));
  const foreignIds = sources.filter(source => source.table === 'crm_customer' && source.actor === 'foreign').map(source => source.id);
  const foreign = await query('foreign');
  check('search_tenant_isolation', foreign.total === foreignIds.length && sameIds(foreign.rows, foreignIds));
  for (const [kind, field] of [['name', 'customerName'], ['code', 'customerCode'], ['tag', 'customerTags']]) {
    const fixture = cases.find(value => value.kind === kind);
    const filtered = await query('sales', { [field]: fixture[field] });
    check('search_combined_filter_' + kind, filtered.total === 1 && sameIds(filtered.rows, [fixture.id]));
  }
  const conjunction = await query('sales', { customerName: marker, customerTags: marker });
  check('search_separate_filters_still_conjoined', conjunction.total === 0 && conjunction.rows.length === 0);
  const paged = [];
  for (let pageNum = 1; pageNum <= 3; pageNum++) {
    const pageResult = await query('sales', { pageNum, pageSize: 1 });
    check('search_page_' + pageNum, pageResult.total === 3 && pageResult.rows.length === 1);
    paged.push(...pageResult.rows);
  }
  check('search_pagination_complete', sameIds(paged, expected));
  const page = await sessions.sales.context.newPage();
  const origin = new URL(sessions.sales.page.url()).origin;
  page.setDefaultTimeout(30000);
  page.on('pageerror', () => runtime.browserErrors.push('customer_search'));
  page.on('response', response => { const url = new URL(response.url()); if (url.pathname.startsWith('/api/')) uiRequests.push({ path: url.pathname, method: response.request().method(), status: response.status() }); });
  try {
    await page.goto(origin + '/office/crm/customers', { waitUntil: 'networkidle' });
    const pending = page.waitForResponse(response => {
      const url = new URL(response.url());
      return url.pathname === '/api/crm/customer/list' && url.searchParams.get('keyword') === marker;
    });
    await page.getByPlaceholder('客户 / 商机 / 报价关键字', { exact: true }).fill(marker);
    const response = await pending;
    const body = await response.json();
    check('search_real_page_response', response.status() === 200 && body.code === 200 && body.data.total === 3 && sameIds(body.data.rows, expected));
    const searched = new URL(response.url()).searchParams;
    check('search_real_page_one_keyword', !searched.has('customerName') && !searched.has('customerTags'));
    for (const fixture of cases) {
      const row = page.getByRole('row').filter({ hasText: fixture.customerName });
      await row.waitFor();
      check('search_real_page_' + fixture.kind, (await row.textContent()).includes(fixture.customerCode));
    }
    check('search_real_page_exact_scope', await page.getByRole('row').filter({ has: page.getByRole('button', { name: '编辑客户', exact: true }) }).count() === 3);
    await page.screenshot({ path: path.join(output, 'customer-search-name-code-tag.png') });
  } finally {
    await page.close();
  }
  for (const fixture of cases) check('search_preserves_row_' + fixture.kind, digest(database(fixture.query)) === fixture.hash);
  return true;
}
