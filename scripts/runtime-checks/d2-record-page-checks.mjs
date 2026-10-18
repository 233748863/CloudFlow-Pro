import assert from 'node:assert/strict';
import path from 'node:path';

export async function verifyD2RecordPages(runtime, { page, output, fixture, save, initialPage }) {
  const { check, database, rows, ok, api, requests } = runtime;
  const endpoint = '/hr/attendance/records/page';
  const employeeId = String(fixture.employeeId);
  assert.match(employeeId, /^[1-9]\d*$/);
  const sql = value => "CONVERT(X'" + Buffer.from(String(value)).toString('hex') + "' USING utf8mb4)";
  const where = query => {
    const conditions = ['tenant_id=100000', 'deleted=0'];
    for (const [key, column] of [['employeeId', 'employee_id'], ['shiftId', 'shift_id']]) {
      if (query[key] != null) { assert.match(String(query[key]), /^[1-9]\d*$/); conditions.push(column + '=' + query[key]); }
    }
    if (query.status) conditions.push('status=' + sql(query.status));
    if (query.startDate) conditions.push('attendance_date>=' + sql(query.startDate));
    if (query.endDate) conditions.push('attendance_date<=' + sql(query.endDate));
    if (query.deptId) {
      assert.match(String(query.deptId), /^[1-9]\d*$/);
      conditions.push('employee_id IN (SELECT id FROM hr_employee WHERE tenant_id=100000 AND deleted=0 AND dept_id=' + query.deptId + ')');
    }
    return conditions.join(' AND ');
  };
  const verifyPage = (label, result, query) => {
    const expectedTotal = Number(database('SELECT COUNT(*) FROM hr_attendance_record WHERE ' + where(query)));
    check(label + '_total', result.total === expectedTotal);
    check(label + '_bounded', Array.isArray(result.rows) && result.rows.length <= result.pageSize && result.pageSize >= 1 && result.pageSize <= 500);
    const offset = (result.pageNum - 1) * result.pageSize;
    const expectedIds = rows("SELECT JSON_OBJECT('id',CAST(id AS CHAR)) FROM hr_attendance_record WHERE " + where(query)
      + ' ORDER BY update_time DESC,id DESC LIMIT ' + offset + ',' + result.pageSize).map(record => record.id);
    check(label + '_exact_ordered_rows', JSON.stringify(result.rows.map(record => String(record.id))) === JSON.stringify(expectedIds));
    if (expectedIds.length) {
      const expectedMinutes = rows("SELECT JSON_OBJECT('id',CAST(record.id AS CHAR),'minutes',COALESCE((SELECT SUM(overtime.approved_minutes) FROM hr_overtime_request overtime WHERE overtime.tenant_id=record.tenant_id AND overtime.employee_id=record.employee_id AND overtime.attendance_date=record.attendance_date AND overtime.deleted=0 AND overtime.status='APPROVED'),0)) FROM hr_attendance_record record WHERE record.tenant_id=100000 AND record.id IN (" + expectedIds.join(',') + ')');
      const minutes = new Map(expectedMinutes.map(record => [record.id, Number(record.minutes)]));
      check(label + '_approved_overtime_preserved', result.rows.every(record => record.approvedOvertimeMinutes === minutes.get(String(record.id))));
    }
    return result;
  };
  const readPage = async (label, query) => verifyPage(label, await ok('admin', endpoint + '?' + new URLSearchParams(query)), query);
  const rendered = async result => {
    await page.waitForFunction(expected => {
      const table = [...document.querySelectorAll('table')].find(element => element.getClientRects().length);
      if (!table) return false;
      const actual = [...table.querySelectorAll('tbody tr')];
      if (!expected.length) return actual.length === 1 && actual[0].textContent.trim() === '暂无数据';
      return actual.length === expected.length && actual.every((row, index) => {
        const cells = row.querySelectorAll('td');
        return cells.length >= 4 && cells[0].textContent.trim() === String(expected[index].employeeId)
          && cells[1].textContent.trim() === expected[index].attendanceDate
          && cells[3].textContent.trim() === String(expected[index].workMinutes ?? '-');
      });
    }, result.rows);
  };
  const uiRead = async (label, query, action) => {
    const pending = page.waitForResponse(response => {
      const url = new URL(response.url());
      return url.pathname === '/api' + endpoint && Object.entries(query).every(([key, value]) => url.searchParams.get(key) === String(value));
    }, { timeout: 90000 });
    const [response] = await Promise.all([pending, Promise.resolve().then(action)]);
    const body = await response.json();
    await response.finished();
    check(label + '_real_response', response.status() === 200 && body.code === 200);
    requests.push({ actor: 'admin', path: endpoint, method: 'GET', status: response.status(), code: body.code, pageNum: body.data.pageNum, pageSize: body.data.pageSize });
    const result = verifyPage(label, body.data, query);
    await rendered(result);
    return result;
  };
  const screenshot = async name => {
    await page.screenshot({ path: path.join(output, name), fullPage: true });
    fixture.screenshots.push(name);
    save();
  };
  fixture.phase = 'record-pagination'; save();
  check('daily_large_existing_table_over_100000', initialPage.total > 100000);
  verifyPage('daily_initial_large_page', initialPage, {});
  await rendered(initialPage);
  const second = await uiRead('daily_next_page', { pageNum: 2, pageSize: 20 }, () => page.getByRole('button', { name: '下一页', exact: true }).click());
  check('daily_pages_have_no_duplicate_ids', second.rows.every(record => !initialPage.rows.some(first => first.id === record.id)));
  await uiRead('daily_previous_page', { pageNum: 1, pageSize: 20 }, () => page.getByRole('button', { name: '上一页', exact: true }).click());
  const last = await readPage('daily_last_page', { pageNum: Math.ceil(initialPage.total / 20), pageSize: 20 });
  check('daily_last_page_remainder', last.rows.length === initialPage.total % 20 || last.rows.length === 20 && initialPage.total % 20 === 0);
  const beyond = await readPage('daily_beyond_last_page', { pageNum: Math.ceil(initialPage.total / 20) + 1, pageSize: 20 });
  check('daily_beyond_last_page_empty', beyond.rows.length === 0);
  const oversized = await readPage('daily_large_size_capped', { pageNum: 1, pageSize: 1000000 });
  check('daily_absolute_page_limit_500', oversized.pageSize === 500 && oversized.rows.length === 500);
  const normalized = await readPage('daily_nonpositive_page', { pageNum: 0, pageSize: 0 });
  check('daily_nonpositive_page_normalized', normalized.pageNum === 1 && normalized.pageSize === 1 && normalized.rows.length === 1);
  const invalidRange = await api('admin', endpoint + '?startDate=2026-09-30&endDate=2026-09-01');
  check('daily_reversed_date_range_rejected', invalidRange.body?.code !== 200 && !Array.isArray(invalidRange.body?.data?.rows));
  const selectedEmployee = rows("SELECT JSON_OBJECT('deptId',CAST(dept_id AS CHAR)) FROM hr_employee WHERE tenant_id=100000 AND deleted=0 AND id=" + employeeId)[0];
  check('daily_existing_employee_has_department', Boolean(selectedEmployee?.deptId));
  await readPage('daily_department_filter', { deptId: selectedEmployee.deptId, pageNum: 1, pageSize: 20 });
  await readPage('daily_combined_employee_department_dates', { employeeId, deptId: selectedEmployee.deptId, startDate: '2026-09-01', endDate: '2026-09-30', status: 'LEAVE', pageNum: 1, pageSize: 20 });
  const form = page.getByRole('form', { name: '考勤结论筛选', exact: true });
  await form.getByRole('combobox', { name: '选择员工', exact: true }).click();
  const selector = page.getByRole('dialog', { name: '选择员工', exact: true });
  await selector.getByRole('option').first().waitFor();
  await selector.getByRole('searchbox').fill(fixture.marker);
  await selector.getByRole('option').filter({ hasText: fixture.marker }).click();
  await selector.waitFor({ state: 'hidden' });
  await form.getByLabel('开始日期', { exact: false }).and(form.locator('input')).fill('2026-08-01');
  await form.getByLabel('结束日期', { exact: false }).and(form.locator('input')).fill('2026-09-30');
  await form.getByLabel('判定', { exact: false }).and(form.locator('select')).selectOption('LEAVE');
  const filteredQuery = { employeeId, startDate: '2026-08-01', endDate: '2026-09-30', status: 'LEAVE' };
  const filtered = await uiRead('daily_filter_form', { ...filteredQuery, pageNum: 1, pageSize: 20 }, () => form.getByRole('button', { name: '查询结论', exact: true }).click());
  check('daily_filter_has_multiple_pages', filtered.total > 20);
  await uiRead('daily_filtered_second_page', { ...filteredQuery, pageNum: 2, pageSize: 20 }, () => page.getByRole('button', { name: '下一页', exact: true }).click());
  await uiRead('daily_page_size_resets_to_first', { ...filteredQuery, pageNum: 1, pageSize: 10 }, async () => {
    await page.locator('.pagination-desktop .unity-select').getByRole('button', { name: '20', exact: true }).click();
    await page.getByRole('option', { name: '10', exact: true }).click();
  });
  await uiRead('daily_refresh_retains_filter', { ...filteredQuery, pageNum: 1, pageSize: 10 }, () => page.getByRole('button', { name: '刷新', exact: true }).click());
  await screenshot('record-page-filtered-desktop.png');
  await page.setViewportSize({ width: 390, height: 844 });
  await uiRead('daily_mobile_next_page', { ...filteredQuery, pageNum: 2, pageSize: 10 }, () => page.getByRole('button', { name: '下一页', exact: true }).click());
  check('daily_mobile_no_document_horizontal_overflow', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await screenshot('record-page-filtered-mobile.png');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await form.getByLabel('开始日期', { exact: false }).and(form.locator('input')).fill('2026-09-01');
  const septemberQuery = { ...filteredQuery, startDate: '2026-09-01' };
  await uiRead('daily_changed_filter_resets_page', { ...septemberQuery, pageNum: 1, pageSize: 10 }, () => form.getByRole('button', { name: '查询结论', exact: true }).click());
  await form.getByLabel('判定', { exact: false }).and(form.locator('select')).selectOption('NORMAL');
  const empty = await uiRead('daily_empty_filter', { ...septemberQuery, status: 'NORMAL', pageNum: 1, pageSize: 10 }, () => form.getByRole('button', { name: '查询结论', exact: true }).click());
  check('daily_empty_filter_has_no_old_rows', empty.total === 0 && await page.getByText('暂无数据', { exact: true }).isVisible());
  let releaseDelayed;
  let markDelayed;
  let delayedTimeout;
  const delayed = new Promise((resolve, reject) => {
    markDelayed = () => { clearTimeout(delayedTimeout); resolve(); };
    delayedTimeout = setTimeout(() => reject(new Error('Expected delayed record request was not sent')), 30000);
  });
  const release = new Promise(resolve => { releaseDelayed = resolve; });
  const routePattern = '**/api/hr/attendance/records/page?**';
  const holdEarlierRead = async route => {
    if (new URL(route.request().url()).searchParams.get('status') === 'LATE') { markDelayed(); await release; }
    await route.continue();
  };
  await page.route(routePattern, holdEarlierRead);
  try {
    await form.getByLabel('判定', { exact: false }).and(form.locator('select')).selectOption('LATE');
    const earlierResponse = page.waitForResponse(response => new URL(response.url()).pathname === '/api' + endpoint && new URL(response.url()).searchParams.get('status') === 'LATE');
    earlierResponse.catch(() => {});
    await form.getByRole('button', { name: '查询结论', exact: true }).click();
    await delayed;
    await form.getByLabel('判定', { exact: false }).and(form.locator('select')).selectOption('LEAVE');
    const latest = await uiRead('daily_latest_filter_response', { ...septemberQuery, pageNum: 1, pageSize: 10 }, () => form.getByRole('button', { name: '查询结论', exact: true }).click());
    releaseDelayed();
    const stale = await earlierResponse;
    await stale.finished();
    check('daily_delayed_read_is_real', stale.status() === 200 && (await stale.json()).code === 200);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await rendered(latest);
    check('daily_stale_response_does_not_replace_latest_filter', await form.getByLabel('判定', { exact: false }).and(form.locator('select')).inputValue() === 'LEAVE');
  } finally {
    clearTimeout(delayedTimeout);
    releaseDelayed();
    await page.unroute(routePattern, holdEarlierRead);
  }
  await uiRead('daily_reset_filters', { pageNum: 1, pageSize: 10 }, () => form.getByRole('button', { name: '重置', exact: true }).click());
  fixture.recordPagination = { passed: true, sourceRows: initialPage.total, maximumPageSize: 500, firstPageSize: 20, filters: true, mobile: true, staleResponses: true };
  save();
}
