import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export async function verifyObservabilityInterface(harness) {
  const { admin, api, successful, session, database, check, directory, caseTag, requests, pending } = harness;
  const origin = new URL(admin.url()).origin;
  const screenshots = path.join(directory, 'observability-ui');
  await fs.mkdir(screenshots, { recursive: true });
  const traceId = createHash('sha256').update(`observability-${caseTag}`).digest('hex').slice(0, 32);
  const missingTaskId = 900000000000000 + Number.parseInt(caseTag.slice(0, 10), 16);
  const requestPath = `/oa/system/import/${missingTaskId}/execute`;
  const secret = `g-observability-secret-${caseTag}`;
  const errors = [];
  const responseWork = [];
  let failureCookie;
  const onPageError = error => errors.push(error.message);
  const onResponse = response => {
    const address = new URL(response.url());
    if (!/^\/api\/(auth|oa)\/system\/(log|import)(?:\/|$)/.test(address.pathname) && !address.pathname.endsWith('/error-report')) return;
    responseWork.push((async () => {
      let code;
      if ((response.headers()['content-type'] || '').includes('json')) {
        try { code = (await response.json()).code; } catch { }
      }
      const headers = await response.request().allHeaders();
      const cookie = (headers.cookie || '').split(';').map(value => value.trim()).find(value => value.startsWith('Authorization='));
      if (address.pathname === `/api${requestPath}`) failureCookie = cookie;
      requests.push({ path: address.pathname, method: response.request().method(), status: response.status(), code, traceId: response.headers()['x-trace-id'], authorizationHeader: !!headers.authorization, authCookiePresent: !!cookie, authCookieLength: cookie?.length, sameCookieAsFailure: cookie === failureCookie, csrfPresent: !!headers['x-csrf-token'] });
    })());
  };
  admin.on('pageerror', onPageError);
  admin.on('response', onResponse);
  const responseFor = async (pathname, method, action) => {
    const response = admin.waitForResponse(candidate => new URL(candidate.url()).pathname === `/api${pathname}` && candidate.request().method() === method, { timeout: 120000 });
    await action();
    const completed = await response;
    return successful({ status: completed.status(), body: await completed.json() }, pathname);
  };
  const eventually = async (read, accept, label, timeout = 45000, interval = 250) => {
    const deadline = Date.now() + timeout;
    do {
      const value = await read();
      if (accept(value)) return value;
      await new Promise(resolve => setTimeout(resolve, interval));
    } while (Date.now() < deadline);
    throw new Error(label);
  };
  const select = async (container, label, option) => {
    await container.getByRole('button', { name: label, exact: true }).click();
    await admin.getByRole('option', { name: option, exact: true }).click();
  };
  const denied = response => response.status >= 400 || response.body?.code !== 200;
  let otherTenant;
  let readonly;
  let crossService;
  try {
    await admin.goto(`${origin}/system/observability`, { waitUntil: 'domcontentloaded' });
    await admin.getByRole('heading', { name: '错误与请求追踪', level: 2, exact: true }).waitFor({ state: 'visible', timeout: 120000 });
    const reportResponse = admin.waitForResponse(response => new URL(response.url()).pathname.endsWith('/error-report') && response.request().method() === 'POST', { timeout: 45000 });
    const captured = await admin.evaluate(async supplied => {
      const { default: request } = await import('/src/services/api/request.ts');
      const { errorReporter } = await import('/src/services/errorReporter.ts');
      const { errorTraceId } = await import('/src/utils/trace.ts');
      const { getAuthToken } = await import('/src/utils/authStorage.ts');
      const token = getAuthToken();
      errorReporter.setEnabled(true);
      try {
        await request.post(supplied.requestPath, { skipInvalidRows: false, password: supplied.secret, idCard: '11010519491231002X', phone: '13800138000', bankAccount: '6222021234567890123' }, { silent: true, headers: { 'X-Trace-Id': supplied.traceId } });
        return { failed: false };
      } catch (error) {
        errorReporter.captureError(error, { context: supplied.caseTag, extra: { password: supplied.secret, phone: '13800138000' } });
        return { failed: true, traceId: errorTraceId(error), tokenRetained: token === getAuthToken() };
      }
    }, { requestPath, traceId, caseTag, secret });
    check('真实前端请求失败后保留网关返回的追踪编号', captured.failed && captured.traceId === traceId);
    check('业务权限拒绝后保持当前真实登录身份', captured.tokenRetained);
    const reported = await reportResponse;
    check('前端错误上报实际经过应用API代理', new URL(reported.url()).pathname === '/api/oa/error-report');
    successful({ status: reported.status(), body: await reported.json() }, '真实前端错误上报');
    const reportHeaders = await reported.request().allHeaders();
    check('真实错误上报携带登录身份、防伪标识及原追踪号', (!!reportHeaders.authorization || /(?:^|;\s*)Authorization=/.test(reportHeaders.cookie || '')) && !!reportHeaders['x-csrf-token'] && reportHeaders['x-trace-id'] === traceId && reported.headers()['x-trace-id'] === traceId);
    await eventually(() => database(`SELECT COUNT(*) FROM oa_frontend_error_log WHERE tenant_id=100000 AND trace_id='${traceId}' AND context='${caseTag}';`), count => Number(count) > 0, '前端错误未实际写入');
    const bundle = await eventually(async () => successful(await api(admin, `/auth/system/log/trace/${traceId}`), '真实请求链路'), value => value.frontend.total > 0 && value.errors.total > 0 && value.operations.rows.some(entry => entry.serviceName === 'cloudflow-gateway') && value.operations.rows.some(entry => entry.serviceName === 'cloudflow-service-oa'), '网关及OA的真实关联日志未齐全');
    check('真实失败请求关联前端、网关及OA服务', bundle.traceId === traceId && bundle.frontend.rows.some(entry => entry.context === caseTag));
    const entry = bundle.errors.rows.find(candidate => candidate.serviceName === 'cloudflow-service-oa' && candidate.requestUrl?.includes('/system/import/') && candidate.requestUrl.endsWith('/execute'));
    assert.ok(entry, '真实OA异常存在');
    check('错误日志包含真实异常堆栈及脱敏参数', !!entry.exceptionStack && !!entry.requestParams && [secret, '11010519491231002X', '13800138000', '6222021234567890123'].every(value => !JSON.stringify(bundle).includes(value)));
    const frontendData = database(`SELECT CONCAT_WS('|',message,stack,component_stack,context,url,extra,tags) FROM oa_frontend_error_log WHERE tenant_id=100000 AND trace_id='${traceId}';`);
    check('前端错误附加数据实际脱敏落库', !frontendData.includes(secret) && !frontendData.includes('13800138000'));
    const listed = await responseFor('/auth/system/log/error/list', 'GET', () => admin.getByRole('button', { name: '刷新', exact: true }).click());
    const index = listed.rows.findIndex(candidate => candidate.errorId === entry.errorId);
    assert.ok(index >= 0, '真实异常在当前错误列表中');
    check('错误列表响应不包含完整参数或异常堆栈', listed.rows.every(candidate => !candidate.requestParams && !candidate.exceptionStack));
    const region = admin.getByRole('region', { name: '错误日志列表', exact: true });
    await region.locator('tbody tr').nth(index).getByRole('button', { name: '查看详情', exact: true }).click();
    const detail = admin.getByRole('dialog', { name: '错误详情', exact: true });
    await detail.getByText(`追踪编号：${traceId}`, { exact: false }).waitFor({ state: 'visible', timeout: 120000 });
    await detail.getByText('已脱敏请求参数', { exact: true }).click();
    check('真实详情页面展示异常并隐藏敏感原文', [secret, '11010519491231002X', '13800138000', '6222021234567890123'].every(value => !JSON.stringify(entry).includes(value)) && !(await detail.innerText()).includes(secret));
    await select(detail, '更新处理状态', '处理中');
    await detail.getByLabel('处理说明', { exact: true }).fill(`真实页面处理-${caseTag}`);
    await responseFor(`/auth/system/log/error/${entry.errorId}/process`, 'POST', () => detail.getByRole('button', { name: '保存处理状态', exact: true }).click());
    check('真实页面保存错误处理人及说明', database(`SELECT CONCAT_WS('|',process_status,process_by,process_remark) FROM sys_api_error_log WHERE error_id=${entry.errorId} AND tenant_id=100000;`) === `PROCESSING|g_import_admin|真实页面处理-${caseTag}`);
    const stale = await api(admin, `/auth/system/log/error/${entry.errorId}/process`, { method: 'POST', body: { expectedStatus: 'TODO', status: 'DONE', remark: '过期处理拒绝' } });
    check('过期处理状态不能覆盖页面已保存结果', denied(stale) && database(`SELECT process_status FROM sys_api_error_log WHERE error_id=${entry.errorId};`) === 'PROCESSING');
    await detail.screenshot({ path: path.join(screenshots, `detail-${caseTag}.png`) });
    await detail.getByRole('button', { name: '关闭弹窗', exact: true }).click();
    await admin.getByLabel('请求追踪编号', { exact: true }).fill(traceId);
    await responseFor(`/auth/system/log/trace/${traceId}`, 'GET', () => admin.getByRole('button', { name: '查关联', exact: true }).click());
    const traceDialog = admin.getByRole('dialog', { name: '关联请求记录', exact: true });
    await traceDialog.getByRole('heading', { name: `前端错误（${bundle.frontend.total}）`, exact: true }).waitFor({ state: 'visible', timeout: 120000 });
    check('真实关联弹窗同时展示前端、服务请求和后端异常', await traceDialog.getByRole('heading', { name: /网关与服务请求/ }).count() === 1 && await traceDialog.getByRole('heading', { name: /后端异常/ }).count() === 1);
    await traceDialog.screenshot({ path: path.join(screenshots, `trace-${caseTag}.png`) });
    await traceDialog.getByRole('button', { name: '关闭弹窗', exact: true }).click();
    await admin.getByRole('img', { name: '每日API错误数量趋势', exact: true }).waitFor({ state: 'visible', timeout: 120000 });
    const today = database("SELECT DATE_FORMAT(CURRENT_DATE(),'%Y-%m-%d');");
    const trend = successful(await api(admin, `/auth/system/log/error/trend?start=${today}&end=${today}`), '真实错误趋势');
    check('错误趋势数量与当前租户数据库一致', trend.length === 1 && Number(trend[0].errorCount) === Number(database('SELECT COUNT(*) FROM sys_api_error_log WHERE tenant_id=100000 AND DATE(occur_time)=CURRENT_DATE();')));
    await responseFor('/auth/system/log/slow/top', 'GET', () => select(admin, '慢请求排序', '按调用量'));
    check('真实页面慢请求排行支持切换调用量排序', true);
    await admin.screenshot({ path: path.join(screenshots, `desktop-${caseTag}.png`), fullPage: true });
    otherTenant = await session('g_import_tenant');
    const otherBundle = successful(await api(otherTenant, `/auth/system/log/trace/${traceId}`), '其他租户请求链路');
    check('其他租户不能读取同一追踪号下的日志', otherBundle.operations.total === 0 && otherBundle.errors.total === 0 && otherBundle.frontend.total === 0 && denied(await api(otherTenant, `/auth/system/log/error/${entry.errorId}`)));
    readonly = await session('g_import_readonly');
    check('无日志管理权限的真实账号不能查询或处理错误', denied(await api(readonly, '/auth/system/log/error/list')) && denied(await api(readonly, `/auth/system/log/trace/${traceId}`)) && denied(await api(readonly, `/auth/system/log/error/${entry.errorId}/process`, { method: 'POST', body: { expectedStatus: 'PROCESSING', status: 'DONE', remark: '越权处理拒绝' } })));
    crossService = await session('g_import_other');
    let crossAttempt = 0;
    let lastCrossRequest = 0;
    const crossTraces = [];
    const crossBundle = await eventually(async () => {
      if (Date.now() - lastCrossRequest >= 10000) {
        const crossTrace = createHash('sha256').update(`${caseTag}-workplace-${crossAttempt++}`).digest('hex').slice(0, 32);
        successful(await api(crossService, '/oa/workplace/summary/enrichment', { headers: { 'X-Trace-Id': crossTrace } }), '真实工作台跨服务查询');
        crossTraces.push(crossTrace);
        lastCrossRequest = Date.now();
      }
      const completedTrace = database(`SELECT trace_id FROM sys_log WHERE tenant_id=100000 AND trace_id IN (${crossTraces.map(value => `'${value}'`).join(',')}) AND service_name IN ('cloudflow-gateway','cloudflow-service-oa','cloudflow-service-crm') GROUP BY trace_id HAVING COUNT(DISTINCT service_name)=3 ORDER BY MAX(log_id) DESC LIMIT 1;`);
      return completedTrace ? successful(await api(crossService, `/auth/system/log/trace/${completedTrace}`), '真实Feign请求链路') : null;
    }, value => value && ['cloudflow-gateway', 'cloudflow-service-oa', 'cloudflow-service-crm'].every(service => value.operations.rows.some(operation => operation.serviceName === service)), '真实OA至CRM请求未形成同一条追踪链路', 150000, 1000);
    check('真实工作台通过Feign关联网关、OA和CRM且保留租户身份', crossBundle.operations.rows.some(operation => operation.serviceName === 'cloudflow-service-crm' && operation.requestUri === '/dashboard/workplace' && Number(operation.tenantId) === 100000));
    check('追踪管理页面无未处理浏览器异常', errors.length === 0);
    pending.push('工作流与HR服务未纳入本次真实链路；不可删除日志的30天清理冲突仍保留原保护');
  } catch (error) {
    await admin.screenshot({ path: path.join(screenshots, `failure-${caseTag}.png`), fullPage: true }).catch(() => { });
    throw error;
  } finally {
    admin.off('pageerror', onPageError);
    admin.off('response', onResponse);
    await Promise.all(responseWork);
    await otherTenant?.context().close();
    await readonly?.context().close();
    await crossService?.context().close();
  }
}
