import assert from 'node:assert/strict';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { scanOwnedAuditLogs, scanSecretStream } from './portal-checks/scan-access-logs.mjs';

export async function verifyOaContractReview({ admin, api, successful, session, database, check, caseTag, state, accounts, evidence }) {
  const marker = `F4_REVIEW_${caseTag}`;
  const sql = value => `CONVERT(0x${Buffer.from(String(value)).toString('hex')} USING utf8mb4)`;
  const rows = query => database(query).split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
  const owner = database("SELECT user_id FROM sys_user WHERE tenant_id=100000 AND user_name='g_import_admin' AND deleted=0;");
  assert.match(owner, /^[1-9][0-9]*$/);
  const ownerDisplayName = database(`SELECT nick_name FROM sys_user WHERE tenant_id=100000 AND user_id=${owner};`);
  const employee = await session('g_holiday_employee');
  const secrets = new Set(accounts.map(account => account.password).filter(Boolean));
  for (const page of [admin, employee]) {
    const token = await page.evaluate(async () => (await import('/src/utils/authStorage.ts')).getAuthToken());
    assert.ok(token); secrets.add(token.replace(/^Bearer /, ''));
  }
  const errors = []; admin.on('pageerror', error => errors.push(error.name));
  const grants = () => database('SELECT tenant_id,role_id,menu_id FROM sys_role_menu ORDER BY tenant_id,role_id,menu_id;');
  const originalGrants = grants();
  const date = offset => database(`SELECT DATE_FORMAT(DATE_ADD(CURRENT_DATE,INTERVAL ${offset} DAY),'%Y-%m-%d');`);
  const today = date(0);
  const report = async () => successful(await api(admin, '/oa/reports/contracts'), '读取实际合同分组报表');
  const beforeReport = await report();
  for (const query of ['from=2099-12-31&to=2000-01-01', 'from=1900-01-01&to=2099-12-31']) {
    const unfiltered = successful(await api(admin, `/oa/reports/contracts?${query}`), '合同实时统计忽略日期区间');
    check('合同统计不受反向或超长日期区间影响', JSON.stringify(unfiltered) === JSON.stringify(beforeReport));
  }
  const create = async suffix => {
    const id = String(successful(await api(admin, '/oa/contract', { method: 'POST', body: {
      contractNo: `${marker}_${suffix}`, contractName: `${marker}_${suffix}`, counterpartyName: marker, contractType: 'SERVICE',
      amount: '100.00', currency: 'CNY', startDate: today, endDate: date(60), requiresFulfilmentFlag: 1, fulfilmentDeadline: date(30),
    } }), '真实创建待核对合同'));
    assert.match(id, /^[1-9][0-9]*$/);
    database(`UPDATE oa_contract SET status='ACTIVE' WHERE tenant_id=100000 AND contract_id=${id} AND contract_no=${sql(`${marker}_${suffix}`)};`);
    return id;
  };
  const main = await create('main');
  const terms = async id => successful(await api(admin, `/oa/contract/${id}/terms`), '读取实际条款');
  const facts = () => rows(`SELECT JSON_OBJECT('amount',CAST(amount AS CHAR),'currency',currency,'counterparty',counterparty_name,
    'supplier',supplier_id,'customer',customer_id,'start',start_date,'end',end_date,'tracking',requires_fulfilment_flag,
    'deadline',fulfilment_deadline,'template',template_id,'signed',signed_flag,'method',sign_method,'signer',our_signee_id,
    'time',our_sign_time,'ip',our_sign_ip,'file',signed_file_url,'status',fulfilment_status,'total',total_term_count,
    'done',fulfilled_term_count,'progress',CAST(fulfilment_progress AS CHAR),'version',version)
    FROM oa_contract WHERE tenant_id=100000 AND contract_id=${main};`)[0];
  const waitFor = async (read, accept, label) => {
    const deadline = Date.now() + 30000;
    do { const value = await read(); if (accept(value)) return value; await new Promise(resolve => setTimeout(resolve, 250)); } while (Date.now() < deadline);
    throw new Error(label);
  };
  const open = async () => {
    await admin.goto(new URL('/office/contracts', admin.url()).href, { waitUntil: 'domcontentloaded' });
    await admin.getByPlaceholder('合同名称', { exact: true }).fill(`${marker}_main`);
    const row = admin.getByRole('row').filter({ hasText: `${marker}_main` }); await row.waitFor();
    await row.getByRole('button', { name: '查看详情', exact: true }).click();
    const dialog = admin.getByRole('dialog', { name: `${marker}_main`, exact: true }); await dialog.waitFor(); return dialog;
  };
  await admin.setViewportSize({ width: 320, height: 1000 });
  let detail = await open();
  const saveEditor = async name => {
    const editor = admin.getByRole('dialog', { name, exact: true });
    await editor.getByRole('button', { name: '保存', exact: true }).click();
    await editor.waitFor({ state: 'hidden' });
  };
  for (const number of [1, 2, 3]) {
    await detail.getByRole('button', { name: '新增条款', exact: true }).click();
    const editor = admin.getByRole('dialog', { name: '履约条款', exact: true });
    await editor.getByLabel('条款序号', { exact: true }).fill(String(number));
    await editor.getByLabel('条款类别', { exact: true }).selectOption('SERVICE');
    await editor.getByLabel('条款内容', { exact: true }).fill(`${marker}_term_${number}`);
    await editor.getByLabel('履约要求', { exact: true }).fill(`完成约定服务${number}`);
    await editor.getByLabel('责任方', { exact: true }).selectOption('BOTH');
    await editor.getByLabel('履约截止日', { exact: true }).fill(date(7));
    await saveEditor('履约条款');
    await waitFor(facts, value => value.total === number, '页面新增条款未实际保存');
  }
  check('手机实际页面逐条新增三条合同义务并即时更新总数', facts().total === 3);
  await detail.getByRole('row').filter({ hasText: `${marker}_term_1` }).getByRole('button', { name: '编辑', exact: true }).click();
  await admin.getByRole('dialog', { name: '履约条款', exact: true }).getByLabel('履约要求', { exact: true }).fill('页面修改后的履约要求');
  await saveEditor('履约条款');
  check('页面编辑真实保存履约要求', (await terms(main)).find(term => term.termNo === 1).requirement === '页面修改后的履约要求');
  await detail.getByRole('row').filter({ hasText: `${marker}_term_3` }).getByRole('button', { name: '删除', exact: true }).click();
  const removal = admin.getByRole('dialog', { name: '移除履约条款', exact: true });
  await removal.getByRole('button', { name: '确认移除', exact: true }).click(); await removal.waitFor({ state: 'hidden' });
  await waitFor(facts, value => value.total === 2, '页面删除后总数未更新');
  check('页面确认删除后数据库仅余两条有效义务', (await terms(main)).length === 2);
  await detail.getByRole('row').filter({ hasText: `${marker}_term_1` }).getByRole('button', { name: '确认履约', exact: true }).click();
  await admin.getByRole('dialog', { name: '确认条款履约', exact: true }).getByLabel('实际履约日', { exact: true }).fill(today);
  await saveEditor('确认条款履约');
  await waitFor(facts, value => value.done === 1, '页面确认履约未保存');
  check('页面确认后实际进度为50%', Number(facts().progress) === 50);
  await detail.getByRole('row').filter({ hasText: `${marker}_term_2` }).getByRole('button', { name: '豁免', exact: true }).click();
  await admin.getByRole('dialog', { name: '豁免履约条款', exact: true }).getByLabel('豁免原因', { exact: true }).fill('双方已协商免除本条义务');
  await saveEditor('豁免履约条款');
  await waitFor(facts, value => value.done === 2, '页面豁免未保存');
  check('页面豁免后实际进度为100%且状态已履约', Number(facts().progress) === 100 && facts().status === 'FULFILLED');
  evidence.termsUi = true;
  const content = Buffer.from(`%PDF-1.4\n${marker}\n%%EOF\n`);
  const upload = successful(await api(admin, `/oa/contract/${main}/signed-file`, { method: 'POST', file: {
    name: `${marker}.pdf`, type: 'application/pdf', content: content.toString('base64'),
  } }), '上传真实签署文件');
  successful(await api(admin, `/oa/contract/${main}/sign`, { method: 'POST', body: {
    signMethod: 'SCAN', counterpartySignee: marker, counterpartySignTime: `${date(-1)} 00:00:00`, signedFileUrl: upload.reference,
  } }), '真实签署待核对合同');
  const read = async () => successful(await api(admin, `/oa/contract/${main}`), '读取当前合同版本');
  const edit = async changes => api(admin, '/oa/contract', { method: 'PUT', body: { ...await read(), ...changes } });
  successful(await edit({ remark: `${marker}_allowed` }), '签署后仍可修改未锁定备注');
  const locked = { amount: '101.00', currency: 'USD', counterpartyName: `${marker}_changed`, supplierId: 999999991, customerId: 999999992,
    startDate: date(1), endDate: date(61), requiresFulfilmentFlag: 0, fulfilmentDeadline: date(31), templateId: 999999993 };
  for (const [field, value] of Object.entries(locked)) {
    const before = JSON.stringify(facts()); const result = await edit({ [field]: value });
    check(`已签署合同拒绝变更${field}且原记录不变`, result.body?.code !== 200 && JSON.stringify(facts()) === before);
  }
  const stable = facts(); delete stable.version;
  successful(await edit({ ...Object.fromEntries(Object.keys(locked).map(key => [key, null])), signedFlag: 0, signMethod: 'OFFLINE',
    ourSigneeId: 999999994, ourSignIp: '203.0.113.70', fulfilmentProgress: 0, totalTermCount: 0, remark: `${marker}_nulls` }), '空值与伪造派生字段不能覆盖签署事实');
  const preserved = facts(); delete preserved.version;
  check('清空锁定字段及伪造签署和履约字段均保留原事实', JSON.stringify(preserved) === JSON.stringify(stable)); evidence.locks = true;
  detail = await open();
  for (const type of ['TERM_FULFILLED', 'TERM_WAIVED', 'CONTRACT_SIGNED']) await detail.getByText(type, { exact: true }).waitFor();
  check('实际合同页面统一时间线显示确认豁免和签署事件', true); evidence.timelineUi = true;
  for (const width of [1440, 375, 320]) {
    await admin.setViewportSize({ width, height: 1000 });
    await detail.getByRole('button', { name: '下载签署文件', exact: true }).scrollIntoViewIfNeeded();
    const layout = await detail.evaluate(element => ({ width: window.innerWidth, overflow: document.documentElement.scrollWidth - window.innerWidth,
      contractVisible: element.getBoundingClientRect().width > 0 }));
    const button = await detail.getByRole('button', { name: '下载签署文件', exact: true }).boundingBox();
    check(`履约页面${width}像素可读且手机操作区不少于44像素`, layout.overflow <= 1 && layout.contractVisible && button?.height > 0 && (width > 639 || button.height >= 44));
    await admin.screenshot({ path: path.join(state.run, `f4-contract-review-${caseTag}-${width}.png`), fullPage: true });
  }
  const secondary = await create('partial');
  // Model a stored name from before an employee rename; both contracts still belong to the same real user.
  database(`UPDATE oa_contract SET owner_name=${sql(`${marker}_previous_name`)} WHERE tenant_id=100000 AND contract_id=${secondary};`);
  for (const number of [1, 2]) {
    const id = successful(await api(admin, '/oa/contract/terms', { method: 'POST', body: { contractId: Number(secondary), termNo: number,
      termCategory: 'SERVICE', termContent: `${marker}_partial_${number}`, requirement: marker, responsibleParty: 'OUR', responsibleId: Number(owner), deadlineDate: date(7), sortNo: number } }), '建立报表部分履约合同条款');
    if (number === 1) successful(await api(admin, `/oa/contract/terms/${id}/confirm`, { method: 'POST', body: { fulfilledDate: today } }), '确认报表分子条款');
  }
  const afterReport = await report();
  for (const [dimension, key] of [['byType', 'SERVICE'], ['byOwner', owner], ['byCounterparty', marker]]) {
    const previous = beforeReport[dimension].find(row => String(row.groupKey) === key) || {};
    const matching = afterReport[dimension].filter(row => String(row.groupKey) === key);
    const current = matching[0];
    const done = Number(previous.fulfilledTermCount || 0) + 3; const total = Number(previous.totalTermCount || 0) + 4;
    check(`${dimension}按已知两份合同增量核对条款分子分母及履约率`, matching.length === 1 && Number(current?.contractCount) === Number(previous.contractCount || 0) + 2
      && Number(current?.fulfilledContractCount) === Number(previous.fulfilledContractCount || 0) + 1
      && Number(current?.fulfilledTermCount) === done && Number(current?.totalTermCount) === total
      && (dimension !== 'byOwner' || current.groupName === ownerDisplayName)
      && Number(current?.fulfilmentRate) === Math.round(done * 10000 / total) / 100);
  }
  await admin.setViewportSize({ width: 1440, height: 1000 });
  const contractRequest = admin.waitForRequest(request => new URL(request.url()).pathname === '/api/oa/reports/contracts');
  await admin.goto(new URL('/admin/reports/contracts', admin.url()).href, { waitUntil: 'domcontentloaded' });
  const reportRequestUrl = new URL((await contractRequest).url());
  await admin.getByText('按当前履约情况统计', { exact: true }).waitFor();
  check('合同页隐藏日期且实际请求不带日期参数', await admin.locator('input[type="date"]').count() === 0
    && !reportRequestUrl.searchParams.has('from') && !reportRequestUrl.searchParams.has('to'));
  const chart = admin.getByRole('img', { name: '业务分布', exact: true }); await chart.waitFor();
  await chart.locator('canvas,svg').first().waitFor();
  const partySection = admin.locator('section.oa-ops-section').filter({ has: admin.getByRole('heading', { name: '按相对方履约统计', exact: true }) });
  const partyRow = partySection.getByRole('row').filter({ hasText: marker });
  for (let page = 1; page < Math.ceil(afterReport.byCounterparty.length / 25) && await partyRow.count() === 0; page++) {
    await partySection.getByRole('button', { name: '下一页', exact: true }).click();
  }
  await partyRow.waitFor();
  check('真实履约报表页面显示本轮两合同75.00%且图表可见', await partyRow.getByRole('cell', { name: '75.00%', exact: true }).count() === 1
    && await chart.locator('canvas,svg').count() > 0);
  for (const width of [1440, 375, 320]) {
    await admin.setViewportSize({ width, height: 1000 }); await partySection.scrollIntoViewIfNeeded();
    const overflow = await admin.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check(`履约报表${width}像素页面无横向溢出且保留统计行`, overflow <= 1 && await partyRow.count() === 1);
    await admin.screenshot({ path: path.join(state.run, `f4-contract-report-${caseTag}-${width}.png`), fullPage: true });
  }
  evidence.reportUi = true;
  const assetRequest = admin.waitForRequest(request => new URL(request.url()).pathname === '/api/oa/reports/assets');
  await admin.getByLabel('业务报表', { exact: true }).selectOption('assets');
  const assetUrl = new URL((await assetRequest).url());
  check('切换资产报表仍显示两个日期并实际发送筛选区间', await admin.locator('input[type="date"]').count() === 2
    && Boolean(assetUrl.searchParams.get('from')) && Boolean(assetUrl.searchParams.get('to')));
  successful(await api(admin, `/oa/reports/assets?from=${today}&to=${today}`), '其他报表仍接受合法日期区间');
  const periodFailures = async () => ((await fs.readFile(path.join(state.run, 'oa/stdout.log'), 'utf8'))
    .match(/IllegalArgumentException: 查询期间必须为1至366天/g) || []).length;
  const errorsBeforePeriod = await periodFailures();
  const invalidPeriod = await api(admin, '/oa/reports/assets?from=2099-12-31&to=2000-01-01');
  // Existing period validation throws IllegalArgumentException, mapped by the platform to generic HTTP 500.
  check('其他报表仍拒绝反向日期且确由原期间校验阻断', invalidPeriod.status === 500 && invalidPeriod.body?.code === 500
    && !invalidPeriod.body?.data && await periodFailures() === errorsBeforePeriod + 1);
  await admin.getByLabel('业务报表', { exact: true }).selectOption('contracts');
  await admin.getByText('按当前履约情况统计', { exact: true }).waitFor();
  check('切回合同报表仍隐藏日期筛选', await admin.locator('input[type="date"]').count() === 0);
  const deniedReport = await api(employee, '/oa/reports/contracts');
  check('普通员工无报表权限时不能获取履约数据', deniedReport.status === 403 && !deniedReport.body?.data); evidence.reports = true;
  check('履约页面无运行异常且角色菜单授权未变', errors.length === 0 && originalGrants === grants());
  let files = 0; let bytes = 0; let leaks = 0;
  for (const service of state.services) {
    const root = path.join(state.run, service.name);
    const names = await fs.readdir(path.join(root, 'logs')).catch(error => { if (error.code === 'ENOENT') return []; throw error; });
    for (const file of ['stdout.log', 'stderr.log', ...names.filter(name => name.endsWith('.log')).map(name => path.join('logs', name))]) {
      const scan = await scanSecretStream(createReadStream(path.join(root, file)), [...secrets]); files++; bytes += scan.bytes; leaks += scan.leaks;
    }
  }
  const audit = await scanOwnedAuditLogs(state, [...secrets], { log: '0', error: '0', audit: '0' });
  check('履约页面和锁定验证六服务及数据库日志无凭据泄漏', leaks === 0 && audit.leaks === 0); evidence.secrets = true;
  console.log(`F4_CONTRACT_REVIEW_SECRET_SCAN: files=${files}; bytes=${bytes}; values=${secrets.size}; leaks=${leaks}; database_bytes=${audit.bytes}; database_leaks=${audit.leaks}`);
  console.log('F4_CONTRACT_REVIEW_SCOPE: actual_ui_terms_timeline_locks_and_three_report_groups=true; ACTIVE_status_and_historical_owner_name_are_fixtures=true; records_files_audits_retained=true; production_modified=false');
}
