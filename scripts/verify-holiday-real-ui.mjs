import assert from 'node:assert/strict';
import path from 'node:path';

export async function verifyHolidayInterface({ admin, api, successful, session, database, check, directory, caseTag, pending, csv, upload, validate, execute }) {
  const base = '/auth/system/holiday';
  const year = new Date().getFullYear();
  const month = new Date().getMonth() + 1;
  const datePrefix = `${year}-${String(month).padStart(2, '0')}`;
  const code = `A4_${caseTag.toUpperCase()}`;
  const calendarName = `隔离验收日历_${caseTag}`;
  const departmentName = `隔离日历部门_${caseTag}`;
  const denied = result => result.status === 403 || result.body?.code === 403;
  const absent = result => [403, 404].includes(result.status) || [403, 404].includes(result.body?.code);
  const numericId = value => { const result = String(value); assert.match(result, /^\d+$/); return result; };
  const dateRows = [
    { holidayDate: `${datePrefix}-16`, dateType: 'HOLIDAY', holidayName: '隔离非三倍样本', triplePayFlag: 0 },
    { holidayDate: `${datePrefix}-17`, dateType: 'HOLIDAY', holidayName: '隔离三倍样本', triplePayFlag: 1 },
    { holidayDate: `${datePrefix}-19`, dateType: 'WORKDAY', holidayName: '隔离调休样本', triplePayFlag: 0 },
  ];
  check('本租户真实数据库日历维护授权仅管理员和HR', database('SELECT GROUP_CONCAT(CONCAT(role_id,\':\',grants) ORDER BY role_id) FROM (SELECT role_id,COUNT(*) grants FROM sys_role_menu WHERE tenant_id=100000 AND menu_id BETWEEN 1320 AND 1324 GROUP BY role_id) granted;') === '1:5,4:5');
  check('HR具备日历和导入所需父目录与操作权限', database('SELECT COUNT(*) FROM sys_role_menu WHERE role_id=4 AND menu_id IN (6,1320,1321,1322,1323,1324,1325,1756,1757);') === '9');
  const hr = await session('g_holiday_hr');
  const info = successful(await api(hr, '/auth/info'), 'HR实际登录权限');
  const expected = ['list', 'add', 'edit', 'remove', 'import', 'query'].map(action => `system:holiday:${action}`);
  check('HR真实登录返回全部六项日历权限', expected.every(permission => info.permissions.includes(permission)));
  await hr.goto(new URL('/holiday', hr.url()).href);
  await hr.getByRole('button', { name: '新增日历', exact: true }).click();
  const calendarEditor = hr.getByRole('dialog', { name: '新增节假日日历', exact: true });
  await calendarEditor.getByPlaceholder('例如 CN_2026', { exact: true }).fill(code);
  await calendarEditor.getByPlaceholder('例如 中国大陆标准日历', { exact: true }).fill(calendarName);
  check('真实日历表单保留编码和名称输入', await calendarEditor.getByPlaceholder('例如 CN_2026', { exact: true }).inputValue() === code && await calendarEditor.getByPlaceholder('例如 中国大陆标准日历', { exact: true }).inputValue() === calendarName);
  let created;
  try {
    [created] = await Promise.all([
      hr.waitForResponse(response => response.url().endsWith(`${base}/calendar`) && response.request().method() === 'POST'),
      calendarEditor.getByRole('button', { name: '创建日历', exact: true }).click(),
    ]);
  } catch (error) {
    const validation = await calendarEditor.locator('input,button[type="submit"]').evaluateAll(elements => elements.map(element => ({
      type: element.type, placeholder: element.getAttribute('placeholder'), value: element.value,
      disabled: element.disabled, valid: element.validity?.valid, message: element.validationMessage,
      formId: element.form?.id,
    })));
    console.log(`HOLIDAY_CREATE_FAILURE: ${JSON.stringify({ validation, messages: await hr.locator('[data-sonner-toast]').allTextContents() })}`);
    await hr.screenshot({ path: path.join(directory, `holiday-create-failure-${caseTag}.png`), fullPage: true });
    throw error;
  }
  check('HR从实际页面创建日历成功', created.status() === 200 && (await created.json()).code === 200);
  await calendarEditor.waitFor({ state: 'detached' });
  const calendarId = numericId(database(`SELECT calendar_id FROM sys_holiday_calendar WHERE tenant_id=100000 AND calendar_code='${code}' AND deleted=0;`));
  const calendarBody = successful(await api(hr, `${base}/calendar/${calendarId}`), 'HR读取刚创建日历');
  check('页面保存的日历名称和编码真实落库', calendarBody.calendarName === calendarName && calendarBody.calendarCode === code);
  const batchBody = { calendarId, yearNo: year, dates: dateRows };
  successful(await api(hr, `${base}/date/batch`, { method: 'POST', body: batchBody }), 'HR保存显式0和1样本');
  await hr.goto(new URL(`/holiday/date?calendarId=${calendarId}`, hr.url()).href);
  const row = date => hr.getByRole('row').filter({ has: hr.getByRole('button', { name: date, exact: true }) });
  await row(dateRows[0].holidayDate).getByText('非三倍', { exact: true }).waitFor();
  check('真实接口返回显式0和1且日期页正确展示', await row(dateRows[1].holidayDate).getByText('3 倍', { exact: true }).isVisible());
  for (const date of dateRows.slice(0, 2)) {
    await row(date.holidayDate).getByRole('button', { name: date.holidayDate, exact: true }).click();
    const editor = hr.getByRole('dialog', { name: '编辑例外日期', exact: true });
    await editor.getByRole('switch', { name: '三倍工资日', exact: true }).click();
    await editor.getByRole('button', { name: '暂存日期', exact: true }).click();
    await editor.waitFor({ state: 'detached' });
  }
  const saveResponse = hr.waitForResponse(response => response.url().endsWith(`${base}/date/batch`) && response.request().method() === 'POST');
  await hr.getByRole('button', { name: '保存全年配置', exact: true }).click();
  check('HR实际页面全年保存成功', (await (await saveResponse).json()).code === 200);
  check('实际日期页修改后工资标记按1,0,0落库', database(`SELECT GROUP_CONCAT(triple_pay_flag ORDER BY holiday_date) FROM sys_holiday_date WHERE tenant_id=100000 AND calendar_id=${calendarId} AND year_no=${year} AND deleted=0;`) === '1,0,0');
  await hr.reload();
  await row(dateRows[0].holidayDate).getByText('3 倍', { exact: true }).waitFor();
  check('重新读取保留用户选择且调休显示正确', await row(dateRows[1].holidayDate).getByText('非三倍', { exact: true }).isVisible() && await hr.getByRole('button', { name: `${dateRows[2].holidayDate}，调休上班`, exact: true }).isVisible());
  for (const width of [1440, 375, 320]) {
    await hr.setViewportSize({ width, height: 1000 });
    check(`真实日期页${width}px无页面水平溢出`, await hr.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    await hr.screenshot({ path: path.join(directory, `holiday-real-${caseTag}-${width}.png`), fullPage: true });
  }
  const definition = successful(await api(hr, '/auth/system/import/types'), 'HR可用导入类型').find(item => item.bizType === 'HOLIDAY');
  assert.ok(definition, 'HR has the real holiday import definition');
  definition.service = 'auth';
  const importRows = [0, 1].map((flag, index) => ({ calendarId: code, holidayDate: `${year + 1}-10-0${index + 1}`, dateType: 'HOLIDAY', holidayName: '隔离导入样本', triplePayFlag: String(flag), yearNo: String(year + 1) }));
  const uploaded = await upload(hr, definition, importRows, `holiday-hr-${caseTag}`);
  const validated = await validate(hr, uploaded);
  check('HR真实导入校验两行成功', validated.status === 'VALIDATED' && validated.validRows === 2 && validated.invalidRows === 0);
  const imported = await execute(hr, uploaded, false);
  check('HR通过真实导入框架保留0和1工资标记', imported.status === 'SUCCESS' && imported.successRows === 2 && database(`SELECT GROUP_CONCAT(triple_pay_flag ORDER BY holiday_date) FROM sys_holiday_date WHERE calendar_id=${calendarId} AND year_no=${year + 1} AND deleted=0;`) === '0,1');
  const beforeRoleChecks = database(`SELECT JSON_OBJECT('calendar',calendar_name,'dates',(SELECT COUNT(*) FROM sys_holiday_date WHERE calendar_id=${calendarId} AND deleted=0)) FROM sys_holiday_calendar WHERE calendar_id=${calendarId} AND deleted=0;`);
  const validDateId = numericId(database(`SELECT MIN(date_id) FROM sys_holiday_date WHERE calendar_id=${calendarId} AND deleted=0;`));
  for (const username of ['g_holiday_manager', 'g_holiday_employee']) {
    const viewer = await session(username);
    try {
      const viewerInfo = successful(await api(viewer, '/auth/info'), '实际只读角色权限');
      const permissions = viewerInfo.permissions.filter(permission => permission.startsWith('system:holiday:'));
      check(`${username}登录只有日历查询权限`, permissions.length === 1 && permissions[0] === 'system:holiday:query');
      const query = successful(await api(viewer, `${base}/query/date-type?calendarId=${calendarId}&date=${dateRows[0].holidayDate}`), '查询角色读取日期类型');
      check(`${username}可以查询真实日期且缓存已失效`, query.dateType === 'HOLIDAY' && query.triplePayFlag === 1);
      for (const [route, options] of [
        [`${base}/calendar/list`, {}],
        [`${base}/calendar`, { method: 'POST', body: { ...calendarBody, calendarId: undefined, calendarCode: `${code}_DENIED` } }],
        [`${base}/calendar`, { method: 'PUT', body: { ...calendarBody, calendarName: '越权修改样本' } }],
        [`${base}/calendar/${calendarId}`, { method: 'DELETE' }],
        [`${base}/date/batch`, { method: 'POST', body: batchBody }],
        [`${base}/date/${validDateId}`, { method: 'DELETE' }],
        ['/auth/system/import/HOLIDAY/upload', { method: 'POST', file: { name: 'denied.csv', content: csv(definition, importRows).toString('base64') } }],
      ]) check(`${username}真实拒绝${options.method || 'GET'} ${route}`, denied(await api(viewer, route, options)));
    } finally { await viewer.context().close(); }
  }
  check('越权请求未新增或改动日历与日期', database(`SELECT JSON_OBJECT('calendar',calendar_name,'dates',(SELECT COUNT(*) FROM sys_holiday_date WHERE calendar_id=${calendarId} AND deleted=0)) FROM sys_holiday_calendar WHERE calendar_id=${calendarId} AND deleted=0;`) === beforeRoleChecks && database(`SELECT COUNT(*) FROM sys_holiday_calendar WHERE calendar_code='${code}_DENIED';`) === '0');
  const foreign = await session('g_import_tenant');
  try {
    const foreignList = successful(await api(foreign, `${base}/calendar/list`), '其他租户查询自己的日历');
    check('其他租户列表不含本次日历', foreignList.rows.every(calendar => String(calendar.calendarId) !== calendarId));
    for (const route of [`${base}/calendar/${calendarId}`, `${base}/query/date-type?calendarId=${calendarId}&date=${dateRows[0].holidayDate}`]) check('其他租户不能读取本次日历内容', absent(await api(foreign, route)));
  } finally { await foreign.context().close(); }
  successful(await api(admin, '/auth/system/dept', { method: 'POST', body: { deptName: departmentName, parentId: 0, orderNum: 0, status: '0', holidayCalendarId: calendarId } }), '真实接口创建绑定日历的部门');
  const departmentId = numericId(database(`SELECT dept_id FROM sys_dept WHERE tenant_id=100000 AND dept_name='${departmentName}' AND deleted=0;`));
  const employeeId = numericId(database(`INSERT INTO hr_employee (tenant_id,employee_no,name,gender,dept_id,employee_status) VALUES (100000,'${code}','隔离日历员工','MALE',${departmentId},'REGULAR'); SELECT LAST_INSERT_ID();`));
  const resolve = () => api(admin, `${base}/query/resolve-calendar?employeeId=${employeeId}&date=${dateRows[0].holidayDate}`);
  check('员工日历真实解析命中部门绑定', String(successful(await resolve(), '部门绑定首次解析')) === calendarId);
  const department = successful(await api(admin, `/auth/system/dept/${departmentId}`), '读取部门版本');
  successful(await api(admin, '/auth/system/dept', { method: 'PUT', body: { deptId: departmentId, parentId: 0, deptName: departmentName, version: department.version, orderNum: 1 } }), '省略日历字段修改部门');
  check('真实HTTP省略日历字段保持原绑定', database(`SELECT holiday_calendar_id FROM sys_dept WHERE dept_id=${departmentId};`) === calendarId);
  await admin.goto(new URL('/users', admin.url()).href);
  await admin.getByRole('button', { name: departmentName, exact: true }).click();
  await admin.getByRole('heading', { name: departmentName, exact: true }).waitFor();
  await admin.getByRole('button', { name: '编辑部门', exact: true }).filter({ hasText: '编辑部门' }).click();
  const departmentEditor = admin.getByRole('dialog', { name: '编辑部门', exact: true });
  await departmentEditor.getByRole('button', { name: '节假日日历', exact: true }).click();
  await admin.getByRole('option', { name: '继承租户默认日历', exact: true }).click();
  const clearResponse = admin.waitForResponse(response => response.url().endsWith('/auth/system/dept') && response.request().method() === 'PUT');
  await departmentEditor.getByRole('button', { name: '保存', exact: true }).click();
  const cleared = await clearResponse;
  const clearPayload = cleared.request().postDataJSON();
  const clearResult = await cleared.json();
  console.log(`HOLIDAY_DEPARTMENT_HTTP: id_preserved=${String(clearPayload.deptId) === departmentId}; calendar_explicit_null=${Object.hasOwn(clearPayload, 'holidayCalendarId') && clearPayload.holidayCalendarId === null}; http_status=${cleared.status()}; result_code=${clearResult.code}; version=${clearPayload.version}`);
  check('实际部门弹窗精确保留部门编号、发送显式null并保存成功', String(clearPayload.deptId) === departmentId && clearPayload.holidayCalendarId === null && clearResult.code === 200);
  await departmentEditor.waitFor({ state: 'detached' });
  const defaultCalendar = database("SELECT calendar_id FROM sys_holiday_calendar WHERE tenant_id=100000 AND default_flag=1 AND status='ENABLED' AND deleted=0;");
  check('清空数据库绑定后真实缓存解析继承租户默认', database(`SELECT holiday_calendar_id IS NULL FROM sys_dept WHERE dept_id=${departmentId};`) === '1' && String(successful(await resolve(), '清空绑定后立即解析')) === defaultCalendar);
  const stale = await api(admin, '/auth/system/dept', { method: 'PUT', body: { deptId: departmentId, parentId: 0, deptName: departmentName, version: department.version, holidayCalendarId: calendarId } });
  check('真实HTTP陈旧版本被拒绝且没有恢复旧绑定', stale.body?.code !== 200 && database(`SELECT holiday_calendar_id IS NULL FROM sys_dept WHERE dept_id=${departmentId};`) === '1');
  const referenced = await api(hr, `${base}/calendar/${calendarId}`, { method: 'DELETE' });
  check('日历有日期引用时真实删除被拒绝', referenced.body?.code !== 200 && database(`SELECT deleted FROM sys_holiday_calendar WHERE calendar_id=${calendarId};`) === '0');
  const dateIds = database(`SELECT GROUP_CONCAT(date_id ORDER BY date_id) FROM sys_holiday_date WHERE tenant_id=100000 AND calendar_id=${calendarId} AND deleted=0;`);
  assert.match(dateIds, /^\d+(,\d+)*$/);
  successful(await api(hr, `${base}/date/${dateIds}`, { method: 'DELETE' }), 'HR删除本次日期样本');
  successful(await api(hr, `${base}/calendar/${calendarId}`, { method: 'DELETE' }), 'HR删除无引用日历');
  check('HR真实删除日期和无引用日历成功', database(`SELECT deleted FROM sys_holiday_calendar WHERE calendar_id=${calendarId};`) === '1' && database(`SELECT COUNT(*) FROM sys_holiday_date WHERE calendar_id=${calendarId} AND deleted=0;`) === '0');
  await hr.context().close();
  pending.push('隔离环境未确认2026法定政策；未将本次样本发布到正式数据库', '未启动HR/CRM业务服务，本检查不代替假期、考勤、工单消费方联调');
  console.log('HOLIDAY_REAL_HTTP: maintenance_roles=ADMIN,HR; manager_write_denied=true; employee_write_denied=true; foreign_tenant_denied=true; payroll_flags_preserved=true; real_import=true; department_null_cleared=true; department_default_cache_refreshed=true; controlled_business_responses=false; production_modified=false');
}
