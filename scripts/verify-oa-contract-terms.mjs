import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { scanOwnedAuditLogs, scanSecretStream } from './portal-checks/scan-access-logs.mjs';
import { verifyContractTermEditConflicts } from './verify-oa-contract-edit-conflicts.mjs';

// Contract admission states and dates are isolated inputs; term actions and template creation use real HTTP.
export async function verifyOaContractTerms({ admin, api, successful, session, database, check, caseTag, state, accounts, evidence }) {
  const marker = `F4_TERMS_${caseTag}`;
  const sql = value => `CONVERT(0x${Buffer.from(String(value)).toString('hex')} USING utf8mb4)`;
  const rows = query => database(query).split(/\r?\n/).filter(Boolean).map(row => JSON.parse(row));
  const owner = database("SELECT user_id FROM sys_user WHERE tenant_id=100000 AND user_name='g_import_admin';");
  assert.match(owner, /^[1-9][0-9]*$/);
  const employee = await session('g_holiday_employee');
  const foreign = await session('g_import_tenant');
  const secrets = new Set(accounts.map(account => account.password).filter(Boolean));
  for (const page of [admin, employee, foreign]) {
    const token = await page.evaluate(async () => (await import('/src/utils/authStorage.ts')).getAuthToken());
    assert.ok(token); secrets.add(token.replace(/^Bearer /, ''));
  }
  const grants = () => database('SELECT tenant_id,role_id,menu_id FROM sys_role_menu ORDER BY tenant_id,role_id,menu_id;');
  const originalGrants = grants();
  const date = offset => database(`SELECT DATE_FORMAT(DATE_ADD(CURRENT_DATE,INTERVAL ${offset} DAY),'%Y-%m-%d');`);
  const today = date(0);
  const fixture = (suffix, deadline = 30, enabled = 1) => {
    const name = `${marker}_${suffix}`;
    assert.equal(database(`SELECT COUNT(*) FROM oa_contract WHERE tenant_id=100000 AND contract_no=${sql(name)};`), '0');
    database(`INSERT INTO oa_contract(tenant_id,contract_no,contract_name,counterparty_name,contract_type,amount,currency,
      owner_id,owner_name,dept_id,status,requires_fulfilment_flag,fulfilment_deadline,start_date,end_date,create_by)
      VALUES(100000,${sql(name)},${sql(name)},${sql(marker)},'OTHER',0.00,'CNY',${owner},'g_import_admin',100,'ACTIVE',${enabled},
        ${sql(date(deadline))},${sql(today)},${sql(date(60))},${sql(marker)});`);
    const id = database(`SELECT contract_id FROM oa_contract WHERE tenant_id=100000 AND contract_no=${sql(name)} AND create_by=${sql(marker)};`);
    assert.match(id, /^[1-9][0-9]*$/); return id;
  };
  const current = id => rows(`SELECT JSON_OBJECT('status',fulfilment_status,'total',total_term_count,'done',fulfilled_term_count,
    'progress',CAST(fulfilment_progress AS CHAR),'signed',signed_flag,'version',version) FROM oa_contract WHERE tenant_id=100000 AND contract_id=${id};`)[0];
  const list = async id => successful(await api(admin, `/oa/contract/${id}/terms`), '读取实际合同条款');
  const termBody = (id, index, category, deadline = 7) => ({ contractId: Number(id), termNo: index, termCategory: category,
    termContent: `${marker}_${category}_${index}`, requirement: `${marker}_requirement_${index}`, responsibleParty: ['OUR', 'COUNTERPARTY', 'BOTH'][index % 3],
    responsibleId: Number(owner), deadlineDate: date(deadline), sortNo: index });
  const save = async body => String(successful(await api(admin, '/oa/contract/terms', { method: 'POST', body }), '实际保存履约条款'));
  const main = fixture('main');
  check('无条款合同为未开始', current(main).status === 'NOT_STARTED');
  const auditCount = (id, type) => Number(database(`SELECT COUNT(*) FROM sys_audit_log WHERE tenant_id=100000 AND biz_module='oa'
    AND audit_field=${sql(type)} AND JSON_UNQUOTE(JSON_EXTRACT(after_json,'$.contractId'))=${sql(id)};`));
  const traceCount = id => Number(database(`SELECT COUNT(*) FROM oa_trace_event WHERE tenant_id=100000 AND business_type='CONTRACT' AND business_id=${id};`));
  const trigger = `f4_audit_${caseTag}`;
  const failAudit = () => {
    assert.equal(database(`SELECT COUNT(*) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA='cloud_flow_db' AND TRIGGER_NAME=${sql(trigger)};`), '0');
    database(`DELIMITER //\nCREATE TRIGGER ${trigger} BEFORE INSERT ON sys_audit_log FOR EACH ROW BEGIN
      IF NEW.tenant_id=100000 AND NEW.biz_module='oa' AND JSON_UNQUOTE(JSON_EXTRACT(NEW.after_json,'$.contractId'))=${sql(main)} THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='isolated_f4_audit_failure'; END IF; END//\nDELIMITER ;\n`);
  };
  const beforeFault = JSON.stringify(current(main)); const beforeTrace = traceCount(main);
  failAudit();
  try {
    const rejected = await api(admin, '/oa/contract/terms', { method: 'POST', body: termBody(main, 90, 'OTHER') });
    check('审计写入故障使新增条款合同进度和时间线整笔撤回', rejected.status === 500 && JSON.stringify(current(main)) === beforeFault
      && (await list(main)).length === 0 && traceCount(main) === beforeTrace && auditCount(main, 'TERM_SAVED') === 0);
  } finally { database(`DROP TRIGGER ${trigger};`); }
  const ids = []; const categories = ['DELIVERY', 'PAYMENT', 'SERVICE', 'QUALITY', 'CONFIDENTIALITY', 'IP', 'OTHER'];
  for (const [index, category] of categories.entries()) ids.push(await save(termBody(main, index + 1, category)));
  const initial = await list(main);
  check('七类条款、三种责任方及真实责任人和期限完整保存', initial.length === 7
    && initial.every((term, index) => term.termCategory === categories[index] && String(term.responsibleId) === owner && term.deadlineDate === date(7))
    && new Set(initial.map(term => term.responsibleParty)).size === 3 && current(main).status === 'ONGOING' && current(main).total === 7);
  await save({ ...initial[0], requirement: `${marker}_updated`, sortNo: 20 });
  check('条款修改后按排序读取且总数不重复增加', (await list(main)).at(-1).requirement === `${marker}_updated` && current(main).total === 7);
  const beforeInvalid = JSON.stringify(current(main));
  const deniedWrite = await api(employee, '/oa/contract/terms', { method: 'POST', body: termBody(main, 80, 'OTHER') });
  check('普通员工不能维护合同履约条款', deniedWrite.status === 403 && JSON.stringify(current(main)) === beforeInvalid);
  const invalidWaive = await api(admin, `/oa/contract/terms/${ids[1]}/waive`, { method: 'POST', body: {} });
  check('空豁免原因被拒绝且业务状态保持', invalidWaive.body?.code !== 200 && JSON.stringify(current(main)) === beforeInvalid
    && database(`SELECT waived_flag FROM oa_contract_fulfilment_term WHERE term_id=${ids[1]} AND tenant_id=100000;`) === '0');
  const invalidDate = await api(admin, `/oa/contract/terms/${ids[0]}/confirm`, { method: 'POST', body: { fulfilledDate: date(1) } });
  check('未来履约日期被拒绝且业务状态保持', invalidDate.body?.code !== 200 && JSON.stringify(current(main)) === beforeInvalid);
  const content = Buffer.from(`%PDF-1.4\n${marker}_evidence\n%%EOF\n`);
  const upload = successful(await api(admin, `/oa/contract/terms/${ids[0]}/evidence`, { method: 'POST', file: {
    name: `${marker}_evidence.pdf`, type: 'application/pdf', content: content.toString('base64') } }), '真实上传履约证据');
  successful(await api(admin, `/oa/contract/terms/${ids[0]}/confirm`, { method: 'POST', body: {
    fulfilledDate: today, evidenceFileUrl: upload.reference, evidenceRemark: marker } }), '真实确认履约并关联证据');
  check('一条履约后即时更新七条进度为14.29%', current(main).done === 1 && Number(current(main).progress) === 14.29 && current(main).status === 'ONGOING');
  const download = await api(admin, `/oa/contract/terms/${ids[0]}/evidence`);
  check('履约证据下载字节完整', download.status === 200 && download.size === content.length
    && download.sha256 === createHash('sha256').update(content).digest('hex'));
  const deniedFile = await api(employee, `/oa/contract/terms/${ids[0]}/evidence`);
  check('无合同读取权限的员工不能下载内部证据', deniedFile.status === 403 && deniedFile.size == null);
  successful(await api(admin, `/oa/contract/terms/${ids[1]}/waive`, { method: 'POST', body: { waivedReason: `${marker}_agreed` } }), '实际按原因豁免条款');
  check('一条履约加一条豁免即时计入28.57%', current(main).done === 2 && Number(current(main).progress) === 28.57);
  check('豁免与确认保存可定位原合同和操作者的实际审计', auditCount(main, 'TERM_WAIVED') === 1 && auditCount(main, 'TERM_FULFILLED') === 1
    && database(`SELECT COUNT(*) FROM sys_audit_log WHERE tenant_id=100000 AND audit_field='TERM_WAIVED' AND high_risk=1
      AND JSON_UNQUOTE(JSON_EXTRACT(after_json,'$.contractId'))=${sql(main)} AND JSON_UNQUOTE(JSON_EXTRACT(after_json,'$.operatorId'))=${sql(owner)};`) === '1');
  for (const id of ids.slice(2)) successful(await api(admin, `/oa/contract/terms/${id}`, { method: 'DELETE' }), '实际删除未履约条款');
  check('删除未完成条款后剩余两条完成并实时达到100%', current(main).status === 'FULFILLED' && current(main).total === 2
    && current(main).done === 2 && Number(current(main).progress) === 100);
  const readded = await save({ ...termBody(main, 7, 'OTHER'), termContent: `${marker}_readded` });
  check('删除后同序号重新录入恢复原记录且不复制旧状态', readded === ids[6] && current(main).total === 3 && current(main).done === 2
    && Number(current(main).progress) === 66.67 && (await list(main)).some(term => String(term.termId) === readded && term.termContent === `${marker}_readded` && term.fulfilledFlag === 0));
  successful(await api(admin, `/oa/contract/terms/${readded}`, { method: 'DELETE' }), '再次删除重新录入的未履约条款');
  check('重新录入再删除后进度恢复为100%且历史审计保留', current(main).total === 2 && Number(current(main).progress) === 100
    && auditCount(main, 'TERM_REMOVED') === 6);
  const partial = fixture('partial'); await save(termBody(partial, 1, 'DELIVERY', -1));
  check('条款超期但整体未到期为部分违约', current(partial).status === 'PARTIALLY_BREACHED'
    && database(`SELECT overdue_flag FROM oa_contract_fulfilment_term WHERE contract_id=${partial} AND tenant_id=100000 AND deleted=0;`) === '1');
  const breached = fixture('breached', -1); await save(termBody(breached, 1, 'SERVICE', 7));
  check('整体期限已过且有未履约条款为违约', current(breached).status === 'BREACHED');
  const disabled = fixture('disabled', 30, 0); await save(termBody(disabled, 1, 'QUALITY', 7));
  check('未启用跟踪的合同有条款仍为未开始', current(disabled).status === 'NOT_STARTED');
  evidence.states = true; evidence.terms = true;

  const template = async suffix => {
    const code = `${marker}_${suffix}`;
    successful(await api(admin, '/oa/contract/template', { method: 'POST', body: {
      templateCode: code, templateName: code, category: 'OTHER', content: `<p>${marker}</p>`, status: 'ACTIVE' } }), '真实创建合同模板');
    const id = database(`SELECT id FROM oa_contract_template WHERE tenant_id=100000 AND template_code=${sql(code)};`);
    assert.match(id, /^[1-9][0-9]*$/); return id;
  };
  const templateId = await template('source');
  const offsets = [-2, 0, 5];
  successful(await api(admin, `/oa/contract/templates/${templateId}/terms`, { method: 'POST', body: offsets.map((offset, index) => ({
    termNo: index + 1, termCategory: categories[index], termContent: `${marker}_template_${index}`, requirement: marker,
    responsibleParty: 'OUR', deadlineOffsetDays: offset, sortNo: index })) }), '真实保存模板期限偏移');
  const fromTemplate = async (suffix, selectedTemplate) => {
    const name = `${marker}_${suffix}`;
    return String(successful(await api(admin, '/oa/contract', { method: 'POST', body: {
      contractNo: name, contractName: name, counterpartyName: marker, contractType: 'OTHER', amount: '0.00', currency: 'CNY',
      startDate: today, endDate: date(60), templateId: Number(selectedTemplate) } }), '从模板真实创建合同'));
  };
  const created = await fromTemplate('created', templateId);
  const createdTerms = await list(created);
  check('从模板建合同自动产生条款并换算负零正偏移', createdTerms.length === 3
    && createdTerms.every((term, index) => term.deadlineDate === date(offsets[index]) && String(term.responsibleId) === owner)
    && current(created).total === 3);
  const copiedTemplate = await template('copied');
  successful(await api(admin, `/oa/contract/${created}/save-template/${copiedTemplate}`, { method: 'POST' }), '从合同真实反向保存模板');
  const copied = successful(await api(admin, `/oa/contract/templates/${copiedTemplate}/terms`), '读取反向保存模板');
  check('反向保存还原原期限偏移及条款定义', copied.length === 3 && copied.every((term, index) => term.deadlineOffsetDays === offsets[index]
    && term.termContent === createdTerms[index].termContent));
  const recreated = await fromTemplate('recreated', copiedTemplate);
  check('反向模板可再次自动生成完整条款', (await list(recreated)).every((term, index) => term.deadlineDate === date(offsets[index])));
  evidence.templates = true;

  const signedUpload = successful(await api(admin, `/oa/contract/${main}/signed-file`, { method: 'POST', file: {
    name: `${marker}_signed.pdf`, type: 'application/pdf', content: content.toString('base64') } }), '上传用于时间线核对的签署文件');
  const sign = { signMethod: 'SCAN', counterpartySignee: marker, counterpartySignTime: `${date(-1)} 00:00:00`, signedFileUrl: signedUpload.reference };
  const beforeSign = JSON.stringify(current(main)); const beforeSignTrace = traceCount(main);
  failAudit();
  try {
    const rejected = await api(admin, `/oa/contract/${main}/sign`, { method: 'POST', body: { ...sign, signRemark: `${marker}_fault` } });
    check('审计写入故障使签署及时间线整笔撤回', rejected.status === 500 && JSON.stringify(current(main)) === beforeSign
      && traceCount(main) === beforeSignTrace && auditCount(main, 'CONTRACT_SIGNED') === 0);
  } finally { database(`DROP TRIGGER ${trigger};`); }
  successful(await api(admin, `/oa/contract/${main}/sign`, { method: 'POST', body: sign }), '实际签署已履约合同');
  check('签署成功后仅一笔实际高风险审计且故障触发器清理', auditCount(main, 'CONTRACT_SIGNED') === 1
    && database(`SELECT COUNT(*) FROM sys_audit_log WHERE tenant_id=100000 AND audit_field='CONTRACT_SIGNED' AND high_risk=1
      AND JSON_UNQUOTE(JSON_EXTRACT(after_json,'$.contractId'))=${sql(main)};`) === '1'
    && database(`SELECT COUNT(*) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA='cloud_flow_db' AND TRIGGER_NAME=${sql(trigger)};`) === '0');
  evidence.audit = true;
  const timeline = successful(await api(admin, `/oa/contract/${main}/timeline`), '实际读取统一合同时间线');
  check('确认豁免及签署均在统一时间线显示真实操作者', ['TERM_FULFILLED', 'TERM_WAIVED', 'CONTRACT_SIGNED'].every(type =>
    timeline.some(event => event.eventType === type && String(event.operatorId) === owner && Boolean(event.eventTime))));
  evidence.timeline = true;
  const report = successful(await api(admin, `/oa/reports/contracts?from=${today}&to=${today}`), '读取实际履约报表');
  const dashboard = report.dashboard.find(row => String(row.contractId) === main);
  check('履约看板包含实际完成数进度及超期条款', dashboard?.fulfilledTermCount === 2 && dashboard?.totalTermCount === 2
    && Number(dashboard.fulfilmentProgress) === 100 && report.overdue.some(row => String(row.contractId) === partial));
  const counterparty = report.byCounterparty.find(row => row.groupKey === marker);
  // main=2 done; partial=1 and breached=1 unfinished. Template-generated drafts and disabled tracking are excluded.
  check('模板生成的草稿合同不进入履约看板与超期清单', [created, recreated].every(id =>
    !report.dashboard.some(row => String(row.contractId) === String(id))
    && !report.overdue.some(row => String(row.contractId) === String(id))));
  check('按对方履约率仅统计审批后合同，实际分子分母为2/4即50%', Number(counterparty?.contractCount) === 3 && Number(counterparty?.fulfilledContractCount) === 1
    && Number(counterparty?.fulfilledTermCount) === 2 && Number(counterparty?.totalTermCount) === 4 && Number(counterparty?.fulfilmentRate) === 50);
  const foreignReport = successful(await api(foreign, `/oa/reports/contracts?from=${today}&to=${today}`), '其他租户读取本租户报表');
  check('跨租户履约报表不含本轮合同', !JSON.stringify(foreignReport).includes(marker));
  evidence.reports = true;
  const templateRows = async id => successful(await api(admin, `/oa/contract/templates/${id}/terms`), '读取待维护模板');
  const beforeMaintenance = await templateRows(templateId);
  successful(await api(admin, `/oa/contract/templates/${templateId}/terms`, { method: 'POST', body:
    beforeMaintenance.map((term, index) => index === 0 ? { ...term, requirement: `${marker}_edited_template` } : term) }), '实际修改已有模板条款');
  const editedTemplate = await templateRows(templateId);
  check('已有模板条款可修改且保持三条和原记录编号', editedTemplate.length === 3
    && editedTemplate[0].requirement === `${marker}_edited_template`
    && String(editedTemplate[0].templateTermId) === String(beforeMaintenance[0].templateTermId));
  successful(await api(admin, `/oa/contract/templates/${templateId}/terms`, { method: 'POST', body: editedTemplate.slice(0, 2) }), '实际移除模板第三条');
  check('模板移除后仅返回剩余两条并实际保存删除状态', (await templateRows(templateId)).length === 2
    && database(`SELECT deleted FROM oa_contract_template_term WHERE tenant_id=100000 AND template_term_id=${editedTemplate[2].templateTermId};`) === '1');
  const restoreTerm = { termNo: 3, termCategory: 'SERVICE', termContent: `${marker}_restored_template`, requirement: marker,
    responsibleParty: 'OUR', deadlineOffsetDays: 5, sortNo: 2 };
  successful(await api(admin, `/oa/contract/templates/${templateId}/terms`, { method: 'POST', body: [...await templateRows(templateId), restoreTerm] }), '重新录入同序号模板条款');
  const restoredTemplate = await templateRows(templateId);
  check('模板同序号重新录入恢复原编号和新定义', restoredTemplate.length === 3
    && String(restoredTemplate[2].templateTermId) === String(editedTemplate[2].templateTermId)
    && restoredTemplate[2].termContent === restoreTerm.termContent);
  successful(await api(admin, `/oa/contract/${created}/save-template/${templateId}`, { method: 'POST' }), '合同条款再次保存到已有模板');
  const overwrittenTemplate = await templateRows(templateId);
  check('合同反向保存可更新已有模板并完整恢复日期偏移', overwrittenTemplate.length === 3
    && overwrittenTemplate.every((term, index) => term.deadlineOffsetDays === offsets[index] && term.termContent === createdTerms[index].termContent));
  await verifyContractTermEditConflicts({ admin, api, successful, database, check, caseTag, state, evidence });
  check('条款与模板操作未改变角色菜单授权', originalGrants === grants());
  let files = 0; let bytes = 0; let leaks = 0;
  for (const service of state.services) {
    const root = path.join(state.run, service.name);
    const names = await fs.readdir(path.join(root, 'logs')).catch(error => { if (error.code === 'ENOENT') return []; throw error; });
    for (const file of ['stdout.log', 'stderr.log', ...names.filter(name => name.endsWith('.log')).map(name => path.join('logs', name))]) {
      const scan = await scanSecretStream(createReadStream(path.join(root, file)), [...secrets]); files++; bytes += scan.bytes; leaks += scan.leaks;
    }
  }
  const audit = await scanOwnedAuditLogs(state, [...secrets], { log: '0', error: '0', audit: '0' });
  check('履约条款六服务和数据库日志无本次凭据泄漏', leaks === 0 && audit.leaks === 0); evidence.secrets = true;
  console.log(`F4_CONTRACT_TERMS_SECRET_SCAN: files=${files}; bytes=${bytes}; values=${secrets.size}; leaks=${leaks}; database_bytes=${audit.bytes}; database_leaks=${audit.leaks}`);
  console.log('F4_CONTRACT_TERMS_SCOPE: real_terms_templates_timeline_reports=true; approval_states_and_dates_are_fixtures=true; reminders_not_tested=true; records_files_audits_retained=true; production_modified=false');
}
