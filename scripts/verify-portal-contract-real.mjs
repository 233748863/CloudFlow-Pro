import assert from 'node:assert/strict';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { verifyPortalContractInterface } from './verify-portal-contract-ui.mjs';
import { scanOwnedAccessLogs, scanSecretStream } from './portal-checks/scan-access-logs.mjs';

export async function verifyPortalContracts(context) {
  const { admin, employee, sales, api, successful, session, database, caseTag, state, directory, secrets, origin, first, portalUserId,
    portalCall, tenantCode, sql, waitFor, minute, denied, evidence, createBusiness, invite, messageIds, message, activation, login, password } = context;
  let featureChecks = 0;
  const check = (label, condition) => { context.check(label, condition); featureChecks++; };
  let token = context.token;
  const rows = statement => database(statement).split('\n').filter(Boolean).map(value => JSON.parse(value));
  const actorId = Number(database("SELECT user_id FROM sys_user WHERE tenant_id=100000 AND user_name='g_import_admin';"));
  const prefix = `H3_PC_${caseTag}`;
  const today = database('SELECT CURRENT_DATE;');
  const tomorrow = database('SELECT DATE_ADD(CURRENT_DATE,INTERVAL 1 DAY);');
  const yesterday = database('SELECT DATE_SUB(CURRENT_DATE,INTERVAL 1 DAY);');
  const endDate = database('SELECT DATE_ADD(CURRENT_DATE,INTERVAL 2 MONTH);');
  const roleGrants = database('SELECT tenant_id,role_id,menu_id FROM sys_role_menu ORDER BY tenant_id,role_id,menu_id;');
  const workflowDefinition = database("SELECT definition_id,version,status,model_json FROM wf_process_definition WHERE tenant_id=100000 AND process_key='biz_contract' AND deleted=0 ORDER BY version;");
  const auditBefore = Number(database('SELECT IFNULL(MAX(audit_id),0) FROM sys_audit_log;'));
  const operationLogBefore = Number(database('SELECT IFNULL(MAX(log_id),0) FROM sys_log;'));
  const privateMarker = `PRIVATE_PORTAL_CONTRACT_${caseTag}`;
  const publicText = `已选择的公开条款_${caseTag}`;
  const sourceText = `${publicText}\n<img src="https://example.test/${caseTag}" onerror="window.contractMarkupExecuted=true">`;
  const read = async id => successful(await api(admin, `/oa/contract/${id}`), '读取真实内部合同');
  const publication = async (id, actor = admin) => successful(await api(actor, `/oa/contract/${id}/portal-publication`), '读取真实合同公开候选与版本');
  const readPortal = async (suffix, suppliedToken = token, headers = {}) => {
    let response = await portalCall(`/portal/crm/contract${suffix}`, undefined, suppliedToken, headers);
    if (response.status === 429) { await minute(); response = await portalCall(`/portal/crm/contract${suffix}`, undefined, suppliedToken, headers); }
    return response;
  };
  const list = async (keyword = prefix, pageNum = 1, pageSize = 10, suppliedToken = token) =>
    successful(await readPortal(`/list?${new URLSearchParams({ keyword, pageNum: String(pageNum), pageSize: String(pageSize) })}`, suppliedToken), '真实门户合同分页');
  const detail = async (record, suppliedToken = token) => successful(await readPortal(`/${record.id}`, suppliedToken), '真实门户合同详情');
  const selection = (record, version, index = 0) => ({ version,
    termIds: index < 0 ? [] : [record.termIds[index]], milestoneIds: index < 0 ? [] : [record.milestoneIds[index]], paymentScheduleIds: index < 0 ? [] : [record.paymentScheduleIds[index]],
  });
  const save = async (record, index = 0, actor = admin) => successful(await api(actor, `/oa/contract/${record.id}/portal-publication`, {
    method: 'PUT', body: selection(record, (await publication(record.id, actor)).version, index),
  }), '真实保存三类合同公开选择');
  const create = async (suffix, startDate = null, ownerId = actorId, customer = first, itemActor = admin) => {
    const name = `${prefix}_${suffix}`;
    const id = successful(await api(admin, '/oa/contract', { method: 'POST', body: {
      contractNo: name, contractName: name, counterpartyName: customer.name, contractType: 'SALES', customerId: customer.customerId,
      amount: '100.01', currency: 'CNY', ownerId, startDate, endDate, remark: privateMarker,
      portalTermIds: '[1]', portalMilestoneIds: '[2]', portalPaymentScheduleIds: '[3]',
    } }), '通过真实OA创建门户合同候选');
    assert.ok(Number.isSafeInteger(id) && id > 0);
    const record = { id, contractNo: name, contractName: name, termIds: [], milestoneIds: [], paymentScheduleIds: [] };
    for (const number of [1, 2]) {
      const term = successful(await api(itemActor, '/oa/contract/terms', { method: 'POST', body: {
        contractId: id, termNo: number, termCategory: 'SERVICE', termContent: number === 1 ? sourceText : `仅内部条款_${caseTag}`,
        requirement: `履约要求_${number}_${caseTag}`, responsibleParty: 'BOTH', deadlineDate: endDate, remark: privateMarker,
      } }), '通过真实接口创建履约条款');
      record.termIds.push(String(term));
      successful(await api(itemActor, '/oa/contract/milestone', { method: 'POST', body: {
        contractId: id, milestoneNo: number, milestoneName: `节点_${number}_${caseTag}`, amount: '50.01', plannedDate: endDate,
        completionRemark: privateMarker, ownerName: privateMarker, attachmentUrl: `https://example.test/${privateMarker}`,
      } }), '通过真实接口创建关键节点');
      record.milestoneIds.push(database(`SELECT id FROM oa_contract_milestone WHERE tenant_id=100000 AND contract_id=${id} AND milestone_no=${number};`));
      successful(await api(itemActor, '/oa/contract/payment', { method: 'POST', body: {
        contractId: id, paymentNo: number, paymentName: `付款计划_${number}_${caseTag}`, amount: '50.01', actualAmount: '0.01', planDate: endDate, currency: 'CNY',
        payeeName: privateMarker, remark: privateMarker,
      } }), '通过真实接口创建付款计划');
      record.paymentScheduleIds.push(database(`SELECT id FROM oa_contract_payment_schedule WHERE tenant_id=100000 AND contract_id=${id} AND payment_no=${number};`));
    }
    const initial = await publication(id);
    check('普通新增传入公开列不会绕过逐项选择，三类清单默认空', !initial.termIds.length && !initial.milestoneIds.length && !initial.paymentScheduleIds.length);
    return record;
  };
  const approve = async record => {
    successful(await api(admin, `/oa/contract/submit/${record.id}`, { method: 'POST' }), '真实提交合同审批');
    const instance = await waitFor(() => database(`SELECT COALESCE(instance_id,'') FROM oa_contract WHERE tenant_id=100000 AND contract_id=${record.id};`), value => value && value !== 'NULL', '合同未绑定真实审批实例', 90000);
    const workflowState = () => database(`SELECT status FROM wf_process_instance WHERE tenant_id=100000 AND instance_id=${sql(instance)};`);
    for (let step = 0; step < 20 && !['PASSED', 'AUTO_PASSED'].includes(workflowState()); step++) {
      const task = await waitFor(() => rows(`SELECT JSON_OBJECT('id',task_id,'assignee',assignee) FROM wf_task WHERE tenant_id=100000 AND instance_id=${sql(instance)} AND status='TODO' ORDER BY task_id LIMIT 1;`)[0], Boolean, '合同审批没有实际待办');
      successful(await api(admin, '/workflow/wf/complete', { method: 'POST', body: { taskId: task.id, action: 'APPROVE', comment: `${prefix}门户合同验收，按既有管理员代办权限审批` } }), '通过真实工作流完成合同审批节点');
      check('合同审批保留真实管理员操作历史', database(`SELECT COUNT(*) FROM wf_task_history WHERE tenant_id=100000 AND task_id=${sql(task.id)} AND operator_id=${actorId} AND action IN ('APPROVE','COUNTERSIGN_APPROVE');`) === '1');
    }
    await waitFor(() => database(`SELECT status FROM oa_contract WHERE tenant_id=100000 AND contract_id=${record.id};`), value => value === 'APPROVED', '真实审批结果未回写合同', 90000);
    check('合同审批使用既有定义并到达真实通过终态', ['PASSED', 'AUTO_PASSED'].includes(workflowState()));
    record.instance = instance; evidence.workflow = true;
  };
  const sign = async record => {
    const content = Buffer.from(`%PDF-1.4\nIsolated portal contract ${caseTag}\n%%EOF\n`);
    const file = successful(await api(admin, `/oa/contract/${record.id}/signed-file`, { method: 'POST', file: {
      name: `${record.contractNo}.pdf`, type: 'application/pdf', content: content.toString('base64'),
    } }), '真实上传私有合同签署文件');
    successful(await api(admin, `/oa/contract/${record.id}/sign`, { method: 'POST', body: {
      signMethod: 'SCAN', counterpartySignee: privateMarker, counterpartySignTime: `${yesterday} 12:00:00`, signedFileUrl: file.reference, signRemark: privateMarker,
    } }), '真实完成双方签署并保存私有依据');
    const signed = await read(record.id);
    check('真实签署包含双方时间、签署人及签署文件', signed.signedFlag === 1 && signed.ourSignTime && signed.counterpartySignTime && signed.signedFileUrl === file.reference);
    evidence.signature = true;
  };
  const assertFields = (value, allowed, label) => check(label, Object.keys(value).every(field => allowed.includes(field)));
  const publicFields = value => {
    assertFields(value, ['contractId', 'contractNo', 'contractName', 'counterpartyName', 'amount', 'currency', 'startDate', 'endDate', 'status', 'terms', 'milestones', 'paymentSchedules'], '合同主信息仅下发白名单字段');
    for (const term of value.terms) assertFields(term, ['termId', 'termNo', 'termCategory', 'termContent', 'requirement', 'responsibleParty', 'deadlineDate', 'fulfilledDate', 'status'], '所选条款隐藏责任人、证据和内部备注');
    for (const milestone of value.milestones) assertFields(milestone, ['id', 'milestoneNo', 'milestoneName', 'milestoneType', 'plannedDate', 'actualDate', 'amount', 'currency', 'status'], '所选节点隐藏负责人、完成备注和附件地址');
    for (const payment of value.paymentSchedules) assertFields(payment, ['id', 'paymentNo', 'paymentName', 'planDate', 'actualDate', 'amount', 'actualAmount', 'currency', 'status'], '所选付款计划隐藏收款人、发票和内部备注');
    check('公开响应不包含任何内部敏感标记或私有文件路径', !JSON.stringify(value).includes(privateMarker) && !JSON.stringify(value).includes('signedFileUrl'));
  };
  const fixtureAccounts = [];
  const activateAccount = async business => {
    const before = await messageIds(); await invite(business);
    const activationToken = activation(await message(business, before));
    successful(await portalCall(`/portal/${tenantCode}/activate`, { activationToken, password }), '真实激活合同可见范围验证账号');
    return login(business);
  };
  let legal;
  try {
    check('合同公开维护沿用ADMIN与LEGAL授权，EMPLOYEE无合同编辑授权', database("SELECT GROUP_CONCAT(DISTINCT role.role_key ORDER BY role.role_key) FROM sys_role_menu grants JOIN sys_menu menu ON menu.menu_id=grants.menu_id JOIN sys_role role ON role.role_id=grants.role_id AND role.tenant_id=grants.tenant_id WHERE grants.tenant_id=100000 AND menu.perms='oa:contract:edit';") === 'admin,legal'
      && database("SELECT COUNT(*) FROM sys_role_menu grants JOIN sys_menu menu ON menu.menu_id=grants.menu_id WHERE grants.role_id=5 AND menu.perms='oa:contract:edit';") === '0');
    check('真实CRM联系人邮箱按既有加密策略存储，已认证门户会话不依赖数据库明文比较', database(`SELECT COUNT(*) FROM crm_contact WHERE tenant_id=100000 AND contact_id=${first.contactId} AND email<>${sql(first.email)} AND CHAR_LENGTH(email)>CHAR_LENGTH(${sql(first.email)});`) === '1');
    const primary = await create('main'); const other = await create('other', tomorrow);
    check('未审批签署的合同不计入门户列表与总数', (await list()).total === 0);
    denied(await readPortal(`/${primary.id}`), 404, '客户通过合同ID也不能读取草稿');
    await save(primary); await approve(primary);
    denied(await readPortal(`/${primary.id}`), 404, '仅审批通过未签署时仍不可见');
    await sign(primary);
    const exposed = await detail(primary); publicFields(exposed);
    check('真实审批及双方签署后立即开放，无开始日期也可查看', exposed.contractId === String(primary.id) && !exposed.startDate && (await list()).total === 1);
    check('三类明细只返回各自所选的一项', exposed.terms.length === 1 && exposed.terms[0].termId === primary.termIds[0]
      && exposed.milestones.length === 1 && exposed.milestones[0].id === primary.milestoneIds[0] && exposed.paymentSchedules.length === 1 && exposed.paymentSchedules[0].id === primary.paymentScheduleIds[0]);
    evidence.selection = true;
    await approve(other); await sign(other);
    const later = await detail(other);
    check('未来开始日期不阻挡已审批签署合同，未选择的明细全部隐藏', later.startDate === tomorrow && !later.terms.length && !later.milestones.length && !later.paymentSchedules.length);
    const firstPage = await list(prefix, 1, 1); const secondPage = await list(prefix, 2, 1);
    check('真实分页总数仅含本公司两份已开放合同且页间无重复', firstPage.total === 2 && secondPage.total === 2 && firstPage.rows.length === 1 && secondPage.rows.length === 1 && firstPage.rows[0].contractId !== secondPage.rows[0].contractId);
    check('合同名称与编号搜索限定当前公司', (await list(primary.contractNo)).total === 1 && (await list(`${prefix}_absent`)).total === 0);
    const protectedRead = await readPortal(`/${primary.id}`, token, { 'X-Tenant-Id': '100001', 'X-User-Id': '1', 'X-Customer-Id': '1', Authorization: 'Bearer forged', Cookie: 'portal-token=forged' });
    check('伪造内部身份头不改变合同归属，响应禁止缓存', successful(protectedRead, '门户合同可信身份').contractId === String(primary.id)
      && protectedRead.headers['cache-control']?.includes('no-store') && !protectedRead.headers['set-cookie']);
    for (const suffix of [`/${primary.id}?customerId=${first.customerId}`, `/${primary.id}?tenantId=100000`, '/list?keyword=x&keyword=y', '/list?pageNum=0', '/list?pageSize=101', '/list?unknown=1']) {
      denied(await readPortal(suffix), 400, '门户合同拒绝多余、重复或越界查询');
    }
    for (const actor of [employee, sales]) {
      denied(await api(actor, `/oa/contract/${primary.id}/portal-publication`), 403, '无合同编辑权限者不能读取公开维护候选');
      denied(await api(actor, `/oa/contract/${primary.id}/portal-publication`, { method: 'PUT', body: selection(primary, (await publication(primary.id)).version, -1) }), 403, '员工与销售不能改合同公开选择');
    }
    const legalName = 'g_portal_contract_legal';
    const existingLegal = database(`SELECT create_by FROM sys_user WHERE tenant_id=100000 AND user_name=${sql(legalName)};`);
    assert.ok(!existingLegal || existingLegal === 'isolated-portal-contract-fixture');
    if (!existingLegal) {
      database(`INSERT INTO sys_user(tenant_id,dept_id,user_name,nick_name,password,status,deleted,pwd_reset_required,create_by) SELECT 100000,101,${sql(legalName)},${sql(legalName)},password,'0',0,'0','isolated-portal-contract-fixture' FROM sys_user WHERE tenant_id=100000 AND user_name='g_import_admin';`);
      database(`INSERT INTO sys_user_role(user_id,role_id,tenant_id) SELECT user_id,6,100000 FROM sys_user WHERE tenant_id=100000 AND user_name=${sql(legalName)};`);
    }
    const legalId = Number(database(`SELECT user_id FROM sys_user WHERE tenant_id=100000 AND user_name=${sql(legalName)};`));
    assert.ok(Number.isSafeInteger(legalId) && legalId >= 990000000);
    check('法务测试账号仅绑定既有LEGAL角色且角色权限未修改', database(`SELECT GROUP_CONCAT(role_id ORDER BY role_id) FROM sys_user_role WHERE tenant_id=100000 AND user_id=${legalId};`) === '6');
    legal = await session(legalName, 'g_import_admin'); fixtureAccounts.push(legal);
    denied(await api(legal, `/oa/contract/${primary.id}/portal-publication`), 404, '法务不能读取本人范围外的公开维护候选');
    denied(await api(legal, `/oa/contract/${primary.id}/portal-publication`, { method: 'PUT', body: selection(primary, (await publication(primary.id)).version, -1) }), 404, '法务不能修改本人范围外合同');
    const ownedLegal = await create('legal', null, legalId, first, legal);
    check('法务可维护本人负责的合同公开范围', (await save(ownedLegal, 0, legal)).termIds[0] === ownedLegal.termIds[0]);
    evidence.permissions = true;
    const beforeInvalid = await publication(primary.id);
    for (const body of [
      { ...selection(primary, beforeInvalid.version), termIds: [other.termIds[0]] },
      { ...selection(primary, beforeInvalid.version), milestoneIds: [other.milestoneIds[0]] },
      { ...selection(primary, beforeInvalid.version), paymentScheduleIds: [other.paymentScheduleIds[0]] },
    ]) denied(await api(admin, `/oa/contract/${primary.id}/portal-publication`, { method: 'PUT', body }), 409, '跨合同项目整笔拒绝');
    for (const body of [
      { ...selection(primary, beforeInvalid.version), termIds: [primary.termIds[0], primary.termIds[0]] },
      { ...selection(primary, beforeInvalid.version), termIds: ['01'] }, { ...selection(primary, beforeInvalid.version), termIds: ['9223372036854775808'] },
      { ...selection(primary, beforeInvalid.version), version: beforeInvalid.version + 0.5 },
      { ...selection(primary, beforeInvalid.version), customerId: first.customerId }, { version: beforeInvalid.version },
    ]) denied(await api(admin, `/oa/contract/${primary.id}/portal-publication`, { method: 'PUT', body }), 400, '公开选择拒绝非法编号、版本或多余字段');
    check('全部无效写请求保持三类原选择与版本不变', isDeepStrictEqual(beforeInvalid, await publication(primary.id)));
    const races = await Promise.all([0, 1].map(index => api(admin, `/oa/contract/${primary.id}/portal-publication`, { method: 'PUT', body: selection(primary, beforeInvalid.version, index) })));
    check('同一版本两种真实公开提交只有一笔成功且另一笔409', races.filter(response => response.status === 200 && response.body?.code === 200).length === 1 && races.filter(response => response.status === 409).length === 1);
    const raceResult = await publication(primary.id); const chosen = raceResult.termIds[0] === primary.termIds[0] ? 0 : 1;
    check('并发没有混合三类清单且版本只增加一次', raceResult.version === beforeInvalid.version + 1 && raceResult.milestoneIds[0] === primary.milestoneIds[chosen] && raceResult.paymentScheduleIds[0] === primary.paymentScheduleIds[chosen]); evidence.concurrency = true;
    await save(primary, 0);
    const originalInternal = await read(primary.id);
    successful(await api(admin, '/oa/contract', { method: 'PUT', body: { ...originalInternal, portalTermIds: '[]', portalMilestoneIds: '[]', portalPaymentScheduleIds: '[]', remark: privateMarker + '_edited' } }), '真实普通编辑保留公开范围');
    check('普通合同编辑不能覆盖公开选择', (await publication(primary.id)).termIds[0] === primary.termIds[0]);
    database(`UPDATE oa_contract SET amount=9999999999999999.99 WHERE tenant_id=100000 AND contract_id=${primary.id};`);
    database(`UPDATE oa_contract_milestone SET amount=9007199254740993.01 WHERE tenant_id=100000 AND id=${primary.milestoneIds[0]};`);
    try {
      const exact = await detail(primary);
      check('明确数据库金额边界输入：18位金额和超安全整数节点金额以字符串精确返回', exact.amount === '9999999999999999.99' && exact.milestones[0].amount === '9007199254740993.01' && exact.paymentSchedules[0].actualAmount === '0.01'); evidence.precision = true;
    } finally {
      database(`UPDATE oa_contract SET amount=100.01 WHERE tenant_id=100000 AND contract_id=${primary.id};`);
      database(`UPDATE oa_contract_milestone SET amount=50.01 WHERE tenant_id=100000 AND id=${primary.milestoneIds[0]};`);
    }
    const baseline = rows(`SELECT JSON_OBJECT('status',status,'signedFlag',signed_flag,'ourTime',DATE_FORMAT(our_sign_time,'%Y-%m-%d %H:%i:%s'),'counterpartyTime',DATE_FORMAT(counterparty_sign_time,'%Y-%m-%d %H:%i:%s'),'customerId',customer_id,'tenantId',tenant_id) FROM oa_contract WHERE contract_id=${primary.id};`)[0];
    for (const [label, mutation] of [
      ['未来我方签署', 'our_sign_time=DATE_ADD(NOW(),INTERVAL 1 DAY)'], ['缺少对方签署', 'counterparty_sign_time=NULL'],
      ['草稿状态', "status='DRAFT'"], ['取消状态', "status='CANCELLED'"], ['已删除', 'deleted=1'], ['跨公司', 'customer_id=0'], ['跨租户', 'tenant_id=100001'],
    ]) {
      database(`UPDATE oa_contract SET ${mutation} WHERE contract_id=${primary.id};`);
      try { denied(await readPortal(`/${primary.id}`), 404, `${label}边界详情关闭`); check(`${label}边界不泄漏列表或总数`, (await list(primary.contractNo)).total === 0); }
      finally { database(`UPDATE oa_contract SET tenant_id=${baseline.tenantId},customer_id=${baseline.customerId},deleted=0,status=${sql(baseline.status)},signed_flag=${baseline.signedFlag},our_sign_time=${sql(baseline.ourTime)},counterparty_sign_time=${sql(baseline.counterpartyTime)} WHERE contract_id=${primary.id};`); }
    }
    database(`UPDATE wf_process_instance SET business_key='CONTRACT:0' WHERE tenant_id=100000 AND instance_id=${sql(primary.instance)};`);
    try { denied(await readPortal(`/${primary.id}`), 404, '审批实例错绑不能仅凭合同已签状态开放'); }
    finally { database(`UPDATE wf_process_instance SET business_key=${sql(`CONTRACT:${primary.id}`)} WHERE tenant_id=100000 AND instance_id=${sql(primary.instance)};`); }
    await save(primary, -1); const withdrawn = await detail(primary);
    check('真实撤回后三类明细立即为空，基础合同继续可见', !withdrawn.terms.length && !withdrawn.milestones.length && !withdrawn.paymentSchedules.length && withdrawn.contractId === String(primary.id)); evidence.withdrawal = true;
    await save(primary, 0);
    const sibling = { ...first, contactId: undefined, email: `sibling-${caseTag}@example.test`, account: `sibling.${caseTag}` };
    successful(await api(admin, '/crm/contact', { method: 'POST', body: { customerId: first.customerId, contactName: `${prefix}_同公司联系人`, email: sibling.email, status: 'ACTIVE' } }), '真实创建同公司第二联系人');
    sibling.contactId = Number(database(`SELECT contact_id FROM crm_contact WHERE tenant_id=100000 AND customer_id=${first.customerId} AND contact_name=${sql(`${prefix}_同公司联系人`)};`));
    assert.ok(Number.isSafeInteger(sibling.contactId) && sibling.contactId > 0);
    const siblingToken = await activateAccount(sibling);
    check('同公司另一位已激活联系人可看相同已开放合同', (await detail(primary, siblingToken)).contractId === String(primary.id));
    const outsider = await createBusiness('contract-outside'); const outsideToken = await activateAccount(outsider);
    denied(await readPortal(`/${primary.id}`, outsideToken), 404, '另一家公司真实门户账号不能读取合同ID');
    check('另一家公司真实门户列表和总数也不泄漏合同', (await list(prefix, 1, 10, outsideToken)).total === 0);
    const innerPath = `/inner/oa/portal/contract/${primary.id}`;
    const gatewayAttack = await api(admin, `/oa${innerPath}`, { headers: { 'X-Inner-Call': 'true', 'X-From-Service': 'cloudflow-auth', 'portal-token': token } });
    check('网关拒绝外部伪造内部合同读取', [403, 404].includes(gatewayAttack.status));
    const oaPort = state.services.find(service => service.name === 'oa').port;
    const inner = await fetch(`http://127.0.0.1:${oaPort}${innerPath}`, { headers: { 'X-Inner-Call': 'true', 'X-From-Service': 'cloudflow-service-crm', 'X-Tenant-Id': '100000', 'portal-token': token }, signal: AbortSignal.timeout(30000) });
    check('OA内部接口拒绝非认证服务来源', inner.status === 403);
    await minute();
    await verifyPortalContractInterface({ ...context, check, primary, other, prefix, privateMarker, publicText, sourceText, today, tomorrow, publication, save, selection, read, detail, list });
    const contact = rows(`SELECT JSON_OBJECT('version',version,'name',contact_name) FROM crm_contact WHERE tenant_id=100000 AND contact_id=${first.contactId};`)[0];
    successful(await api(admin, '/crm/contact', { method: 'PUT', body: { contactId: first.contactId, customerId: first.customerId, contactName: contact.name, email: first.email, status: 'INACTIVE', version: contact.version } }), '真实停用合同门户联系人');
    try { denied(await readPortal(`/${primary.id}`), 401, '联系人真实停用立即撤销合同会话'); }
    finally {
      successful(await api(admin, '/crm/contact', { method: 'PUT', body: { contactId: first.contactId, customerId: first.customerId, contactName: contact.name, email: first.email, status: 'ACTIVE', version: Number(database(`SELECT version FROM crm_contact WHERE contact_id=${first.contactId};`)) } }), '恢复本次测试联系人状态');
    }
    denied(await readPortal(`/${primary.id}`), 401, '联系人重新启用后旧合同会话仍失效');
    token = await login(first); check('重新真实登录核对联系人版本后恢复合同读取', (await detail(primary)).contractId === String(primary.id));
    const changedEmail = `contract-updated-${caseTag}@example.test`;
    const changeEmail = async email => successful(await api(admin, '/crm/contact', { method: 'PUT', body: {
      contactId: first.contactId, customerId: first.customerId, contactName: contact.name, email, status: 'ACTIVE',
      version: Number(database(`SELECT version FROM crm_contact WHERE tenant_id=100000 AND contact_id=${first.contactId};`)),
    } }), '通过真实CRM修改联系人邮箱并更新联系人版本');
    await changeEmail(changedEmail);
    try { denied(await readPortal(`/${primary.id}`), 401, '真实修改加密邮箱后合同旧会话立即失效'); }
    finally { await changeEmail(first.email); }
    denied(await readPortal(`/${primary.id}`), 401, '恢复邮箱也不恢复旧合同会话');
    token = await login(first); check('恢复邮箱并重新登录后合同查询正常，邮箱保持加密', (await detail(primary)).contractId === String(primary.id)
      && database(`SELECT email<>${sql(first.email)} FROM crm_contact WHERE tenant_id=100000 AND contact_id=${first.contactId};`) === '1'); evidence.identity = true;
    const audits = await waitFor(() => rows(`SELECT JSON_OBJECT('before',before_json,'after',after_json,'risk',high_risk,'diff',diff_json) FROM sys_audit_log WHERE audit_id>${auditBefore} AND tenant_id=100000 AND audit_name='维护客户合同公开范围' AND JSON_UNQUOTE(JSON_EXTRACT(after_json,'$.contractId'))=${sql(primary.id)};`), entries => entries.length >= 6, '公开变更前后审计未落库');
    check('真实公开与撤回审计包含版本及三类前后清单', audits.every(entry => {
      const before = typeof entry.before === 'string' ? JSON.parse(entry.before) : entry.before;
      const after = typeof entry.after === 'string' ? JSON.parse(entry.after) : entry.after;
      return entry.risk === 1 && before && after && ['termIds', 'milestoneIds', 'paymentScheduleIds'].every(key => Array.isArray(before[key]) && Array.isArray(after[key])) && after.version > before.version;
    }));
    check('合同专项没有改动任何既有角色菜单授权', database('SELECT tenant_id,role_id,menu_id FROM sys_role_menu ORDER BY tenant_id,role_id,menu_id;') === roleGrants);
    check('合同专项未改动正式审批定义或审批顺序', database("SELECT definition_id,version,status,model_json FROM wf_process_definition WHERE tenant_id=100000 AND process_key='biz_contract' AND deleted=0 ORDER BY version;") === workflowDefinition);
    const accesses = await waitFor(() => rows(`SELECT JSON_OBJECT('code',result_code,'count',COUNT(*)) FROM sys_log WHERE log_id>${operationLogBefore} AND create_by=${sql('portal:' + portalUserId)} AND service_name='cloudflow-auth' AND request_uri LIKE '/portal/crm/contract/%' GROUP BY result_code;`), entries => entries.some(entry => entry.code === 200) && entries.some(entry => entry.code === 404), '合同门户成功和拒绝访问审计未落库');
    check('合同门户成功及不可见请求均按独立门户身份记录访问审计', accesses.some(entry => entry.code === 200 && entry.count > 0) && accesses.some(entry => entry.code === 404 && entry.count > 0));
    const files = [];
    const collect = async folder => {
      for (const entry of await fs.readdir(folder, { withFileTypes: true })) {
        if (entry.isSymbolicLink()) continue;
        const filename = path.join(folder, entry.name);
        if (entry.isDirectory()) await collect(filename); else if (entry.name.endsWith('.log')) files.push(filename);
      }
    };
    for (const service of state.services) await collect(path.join(directory, service.name));
    let bytes = 0; let leaks = 0; const sensitive = [...new Set(secrets)];
    for (const filename of files) {
      const scanned = await scanSecretStream(createReadStream(filename), sensitive);
      bytes += scanned.bytes; leaks += scanned.leaks;
    }
    const databaseScan = await scanOwnedAccessLogs(state, sensitive);
    const auditRows = database(`SELECT CONCAT_WS('|',before_val,after_val,before_json,after_json,diff_json) FROM sys_audit_log WHERE audit_id>${auditBefore};`);
    const oaOperations = database(`SELECT CONCAT_WS('|',params,exception,request_uri) FROM sys_log WHERE log_id>${operationLogBefore} AND service_name='cloudflow-service-oa';`);
    check('合同运行、访问及前后审计记录没有明文密码、激活或会话凭据', files.length > 0 && leaks === 0 && databaseScan.leaks === 0
      && sensitive.every(value => !auditRows.includes(value) && !oaOperations.includes(value)));
    console.log(`H3_PORTAL_CONTRACT_LOG_SCAN: files=${files.length}; bytes=${bytes}; sensitive_values=${sensitive.length}; leaks=${leaks}; database_bytes=${databaseScan.bytes}; database_leaks=${databaseScan.leaks}; oa_and_audit_checked=true; production_modified=false`);
    console.log(`H3_PORTAL_CONTRACT_FEATURE_RESULT: checks=${featureChecks}; failed=0; authentication_preparation_excluded=true; real_workflow=true; real_signature=true; primary_contract=${primary.id}; boundary_inputs=explicit_and_restored; production_modified=false`);
  } finally {
    for (const page of fixtureAccounts) await page.context().close();
  }
}
