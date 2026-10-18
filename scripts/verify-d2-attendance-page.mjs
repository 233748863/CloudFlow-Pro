import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createD1LeaveRuntime } from './runtime-checks/d1-leave-runtime.mjs';
import { verifyD2RecordPages } from './runtime-checks/d2-record-page-checks.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
assert.ok(process.argv.includes('--d1-leave') && process.argv.includes('--d2-attendance-page'));
const output = fs.realpathSync(process.argv[process.argv.indexOf('--output') + 1]);
assert.match(path.basename(output), /^d2-attendance-page-20261005-r[1-9][0-9]*$/);
const sourceRound = process.argv[process.argv.indexOf('--source-round') + 1];
assert.match(sourceRound, /^r[1-9][0-9]*$/);
const sourcePath = path.join(path.dirname(output), 'd2-leave-attendance-20261005-' + sourceRound);
const read = name => JSON.parse(fs.readFileSync(path.join(sourcePath, name), 'utf8').replace(/^\uFEFF/, ''));
const previous = read('result.json'), previousFixture = read('fixture.json');
assert.ok(previous.correctness && previous.approval && previous.preservation && previous.restoration);
assert.equal(previousFixture.requests.length, 34);
assert.ok(!fs.existsSync(path.join(output, 'result.json')));
const employeeId = String(previousFixture.employeeId);
assert.match(employeeId, /^[1-9]\d*$/);
const fixture = { sourceRound, employeeId, marker: previousFixture.marker, measurements: [], screenshots: [] };
const write = (name, value) => fs.writeFileSync(path.join(output, name), JSON.stringify(value, null, 2));
const save = () => write('fixture.json', fixture);
const hash = value => createHash('sha256').update(value).digest('hex');
const runtime = await createD1LeaveRuntime(root, output);
const { check, checks, database, rows, sessions, requests, browserErrors, sensitive } = runtime;
const page = sessions.admin.page;
page.setDefaultTimeout(30000);
const facts = () => hash(JSON.stringify([
  database('SELECT * FROM hr_time_request WHERE tenant_id=100000 AND employee_id=' + employeeId + ' ORDER BY id'),
  database('SELECT * FROM hr_leave_ledger WHERE tenant_id=100000 AND employee_id=' + employeeId + ' ORDER BY ledger_id'),
  database('SELECT * FROM hr_leave_quota WHERE tenant_id=100000 AND employee_id=' + employeeId + ' ORDER BY id'),
  database('SELECT employee_id,attendance_date,check_time,log_type,check_method,device_id,remark FROM hr_attendance_checkin WHERE tenant_id=100000 AND employee_id=' + employeeId + ' ORDER BY checkin_id')
]));
const tables = [['hr_employee','id'],['hr_shift','id'],['hr_schedule_assignment','id'],['hr_attendance_checkin','checkin_id'],
  ['hr_attendance_record','id'],['hr_attendance_monthly','id'],['hr_time_request','id'],['hr_leave_ledger','ledger_id'],
  ['hr_leave_quota','id'],['sys_holiday_calendar','calendar_id'],['sys_holiday_date','date_id']];
function preserved() {
  return Object.fromEntries(tables.map(([table, key]) => {
    const scope = ['hr_attendance_record','hr_attendance_monthly'].includes(table) ? 't.employee_id<>' + employeeId : '1=1';
    const digest = createHash('sha256');
    let after = '0';
    for (;;) {
      const raw = database('SELECT t.' + key + ',t.* FROM ' + table + ' t WHERE ' + scope + ' AND t.' + key + '>' + after + ' ORDER BY t.' + key + ' LIMIT 1000');
      if (!raw) break;
      digest.update(raw + '\n');
      after = raw.split(/\r?\n/).at(-1).split('\t')[0];
      assert.match(after, /^[1-9]\d*$/);
    }
    return [table, digest.digest('hex')];
  }));
}
const requestStarts = new WeakMap(), posts = [];
page.on('request', request => {
  if (new URL(request.url()).pathname === '/api/hr/attendance/recalculate' && request.method() === 'POST') {
    requestStarts.set(request, performance.now()); posts.push(request);
  }
});
const evidence = { page:false, pagination:false, confirmation:false, correctness:false, preservation:false, secrets:false };
let original, failure, lastSubmitted = 0;
function month(monthNo, work, leave, actual, absent) {
  const values = rows("SELECT JSON_OBJECT('work',work_days,'leave',leave_days,'actual',actual_days,'absent',absent_days,'late',late_times,'early',early_times) FROM hr_attendance_monthly WHERE tenant_id=100000 AND employee_id=" + employeeId + ' AND year=2026 AND month=' + monthNo);
  check('month_' + monthNo + '_exact_totals', values.length === 1 && Number(values[0].work) === work && Number(values[0].leave) === leave
    && Number(values[0].actual) === actual && Number(values[0].absent) === absent && Number(values[0].late) === 0 && Number(values[0].early) === 0);
}
try {
  check('original_approved_requests_and_facts_unchanged', facts() === previousFixture.ownedFactDigest);
  original = preserved(); fixture.originalDigest = original; save();
  let initialRecordPage;
  const paths = ['/api/hr/attendance/shifts','/api/hr/attendance/rules','/api/hr/attendance/records/page','/api/auth/system/holiday/calendar/list'];
  const loaded = paths.map(expected => page.waitForResponse(response => new URL(response.url()).pathname === expected, { timeout:90000 })
    .then(async response => {
      const body = await response.json();
      await response.finished();
      check('page_load_' + expected, response.status() === 200 && body?.code === 200);
      if (expected.endsWith('/records/page')) {
        check('daily_page_is_bounded', Array.isArray(body.data?.rows) && body.data.rows.length <= 20 && body.data.pageSize === 20 && body.data.pageNum === 1 && body.data.total >= body.data.rows.length);
        initialRecordPage = body.data;
      }
      requests.push({ actor:'admin',path:expected,method:'GET',status:response.status(),code:body?.code });
    }));
  await Promise.all([...loaded, page.goto(new URL('/hr/attendance', page.url()).href, { waitUntil:'domcontentloaded' })]);
  await page.getByRole('heading', { name:'考勤规则与月封账', exact:true }).waitFor();
  await page.locator('table tbody tr td:nth-child(2)').first().waitFor();
  check('daily_records_rendered_from_real_response', await page.locator('table tbody tr').count() > 0);
  check('no_recalculation_before_user_submission', posts.length === 0);
  await verifyD2RecordPages(runtime, { page, output, fixture, save, initialPage: initialRecordPage });
  evidence.pagination = true;
  evidence.page = true;
  for (let index=0; index<4; index++) {
    const monthNo = index % 2 === 0 ? 9 : 8, days = monthNo === 9 ? 30 : 31;
    const from = '2026-' + String(monthNo).padStart(2,'0') + '-01';
    const to = '2026-' + String(monthNo).padStart(2,'0') + '-' + days;
    fixture.phase = 'open_range_' + index; save();
    await page.getByRole('button', { name:'范围重算', exact:true }).click();
    const dialog = page.getByRole('dialog', { name:'确认范围重算', exact:true });
    await dialog.waitFor();
    fixture.phase = 'open_selector_' + index; save();
    await dialog.getByRole('combobox', { name:'选择员工', exact:true }).click();
    const selector = page.getByRole('dialog', { name:'选择员工', exact:true });
    fixture.phase = 'search_employee_' + index; save();
    await selector.getByRole('option').first().waitFor();
    check('selector_includes_more_than_first_500_employees_' + index, await selector.getByRole('option').count() > 500);
    await selector.getByRole('searchbox').fill(fixture.marker);
    fixture.phase = 'select_employee_' + index; save();
    await selector.getByRole('option').filter({ hasText:fixture.marker }).click();
    await selector.getByRole('searchbox').press('Escape');
    await selector.waitFor({ state:'hidden' });
    fixture.phase = 'fill_range_' + index; save();
    await dialog.getByLabel('开始日期', { exact:false }).and(dialog.locator('input')).fill(from);
    await dialog.getByLabel('结束日期', { exact:false }).and(dialog.locator('input')).fill(to);
    check('manual_override_unselected_' + index, !(await dialog.getByRole('checkbox', { name:'覆盖人工调整记录', exact:false }).isChecked()));
    const confirm = dialog.getByRole('checkbox', { name:'确认重算范围；未指定范围时包含有权操作的全部员工', exact:false });
    check('scope_confirmation_initially_unselected_' + index, !(await confirm.isChecked()));
    if (index === 0) {
      await dialog.getByRole('button', { name:'保存', exact:true }).click();
      await page.getByText('请填写确认重算范围；未指定范围时包含有权操作的全部员工', { exact:true }).waitFor();
      check('unconfirmed_form_sends_no_request', posts.length === 0 && await dialog.isVisible());
      evidence.confirmation = true;
    }
    await confirm.check();
    if (index === 0) {
      await page.screenshot({ path:path.join(output,'confirmed-range.png'), fullPage:false });
      fixture.screenshots.push('confirmed-range.png'); save();
    }
    const remaining = 5100 - (Date.now() - lastSubmitted);
    if (remaining > 0) await new Promise(resolve => setTimeout(resolve,remaining));
    const awaitedResponse = page.waitForResponse(response => new URL(response.url()).pathname === '/api/hr/attendance/recalculate'
      && response.request().method() === 'POST', { timeout:90000 });
    const [response] = await Promise.all([awaitedResponse, dialog.getByRole('button', { name:'保存', exact:true }).click()]);
    const body = await response.json();
    await response.finished();
    const milliseconds = Number((performance.now() - requestStarts.get(response.request())).toFixed(2));
    lastSubmitted = Date.now();
    const payload = response.request().postDataJSON();
    check('page_submitted_one_employee_and_exact_range_' + index, payload.employeeIds?.length === 1
      && String(payload.employeeIds[0]) === employeeId && payload.startDate === from && payload.endDate === to
      && payload.confirmed === true && payload.forceOverwrite === false && (payload.deptIds || []).length === 0);
    check('real_synchronous_result_' + index, response.status() === 200 && body.code === 200 && body.data?.asynchronous === false && body.data?.affected === days);
    const timing = response.request().timing();
    fixture.measurements.push({ index, month:monthNo, milliseconds, networkMilliseconds:Number((timing.responseEnd - timing.requestStart).toFixed(2)),
      traceId:response.headers()['x-trace-id'], meets500ms:milliseconds < 500 });
    requests.push({actor:'admin',path:'/api/hr/attendance/recalculate',method:'POST',status:response.status(),code:body.code,traceId:response.headers()['x-trace-id']});
    save();
    await dialog.waitFor({ state:'hidden' });
    await page.getByText('已重算 ' + days + ' 条', { exact:true }).last().waitFor();
    if (monthNo === 9) {
      month(9,30,30,0,0);
      check('all_30_leave_days_and_no_late_early_absent_' + index, database("SELECT COUNT(*) FROM hr_attendance_record WHERE tenant_id=100000 AND employee_id=" + employeeId
        + " AND attendance_date BETWEEN '2026-09-01' AND '2026-09-30' AND deleted=0 AND status='LEAVE' AND late_minutes=0 AND early_exit_minutes=0 AND absent_flag=0 AND half_day_flag=0") === '30');
    } else {
      month(8,31,1,1,29);
      check('half_day_and_hours_only_two_leave_days_' + index, database("SELECT COUNT(*) FROM hr_attendance_record WHERE tenant_id=100000 AND employee_id=" + employeeId
        + " AND attendance_date BETWEEN '2026-08-01' AND '2026-08-31' AND deleted=0 AND status='LEAVE'") === '2');
    }
  }
  check('exactly_four_real_page_recalculations', posts.length === 4);
  await page.screenshot({ path:path.join(output,'completed-range.png'), fullPage:false });
  fixture.screenshots.push('completed-range.png');
  evidence.correctness = true;
} catch(error) {
  failure = error;
  let diagnostic = String(error.message).slice(0,5000);
  for (const value of sensitive) if (value) diagnostic = diagnostic.split(value).join('[REDACTED]');
  write('failure-detail.json', { phase:fixture.phase, message:diagnostic });
  try { await page.screenshot({ path:path.join(output,'failure-page.png'), fullPage:false }); fixture.screenshots.push('failure-page.png'); } catch { /* Preserve the original failure. */ }
}
finally {
  try {
    check('all_existing_business_rows_preserved', !!original && JSON.stringify(original) === JSON.stringify(preserved()));
    check('approved_requests_ledger_quota_raw_facts_preserved', facts() === previousFixture.ownedFactDigest);
    check('browser_no_errors', browserErrors.length === 0); evidence.preservation = true;
  } catch(error) { failure ||= error; }
  try { const scan = await runtime.scan(); evidence.secrets = true; console.log('D2_PAGE_LOG_SCAN: ' + JSON.stringify(scan)); } catch(error) { failure ||= error; }
  await runtime.close(); save(); write('requests.json', requests);
  const raw = failure ? String(failure.message).split('\n')[0].slice(0,220) : undefined;
  const message = raw && [...sensitive].every(value => !raw.includes(value)) ? raw : failure ? 'D2 attendance page verification failed' : undefined;
  const performanceMet = fixture.measurements.length === 4 && fixture.measurements.every(value => value.meets500ms);
  write('result.json',{passed:!failure && Object.values(evidence).every(Boolean),...evidence,checks,requests:requests.length,measurements:fixture.measurements,
    performanceMet,requirementMilliseconds:500,path:'real_page_current_services',sourceRound,recordPagination:fixture.recordPagination,firstRequestPerformanceMeasured:false,all17Complete:false,globalComplete:false,failure:message});
  console.log('D2_PAGE_SUMMARY: checks=' + checks.length + '; requests=' + requests.length + '; performance_met=' + performanceMet + '; correctness=' + evidence.correctness + '; preservation=' + evidence.preservation);
  if(failure) { console.log('D2_PAGE_FAILURE: ' + message); process.exitCode = 1; }
}
