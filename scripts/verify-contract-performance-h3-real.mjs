import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import { verifyContractPerformanceRecovery } from './verify-contract-performance-h3-recovery.mjs';
import { verifyContractPerformanceInterface } from './verify-contract-performance-h3-ui.mjs';

export async function verifyContractPerformance(context) {
  const { admin, api, successful, session, database, check, caseTag, state, evidence } = context;
  const employee = await session('g_holiday_employee');
  const foreign = await session('g_import_tenant');
  const literal = value => `CONVERT(UNHEX('${Buffer.from(String(value)).toString('hex')}') USING utf8mb4)`;
  const rows = statement => database(statement).split('\n').filter(Boolean).map(value => JSON.parse(value));
  const user = name => Number(database(`SELECT user_id FROM sys_user WHERE tenant_id=100000 AND user_name=${literal(name)} AND deleted=0;`));
  const adminId = user('g_import_admin'), salesId = user('g_opportunity_sales');
  const today = database('SELECT CURRENT_DATE;');
  const tomorrow = database('SELECT DATE_ADD(CURRENT_DATE,INTERVAL 1 DAY);');
  const yesterday = database('SELECT DATE_SUB(CURRENT_DATE,INTERVAL 1 DAY);');
  const endDate = database('SELECT DATE_ADD(CURRENT_DATE,INTERVAL 1 MONTH);');
  const grantSql = 'SELECT menu_id FROM sys_role_menu WHERE tenant_id=100000 AND role_id=5 ORDER BY menu_id;';
  const grants = database(grantSql);
  const workflowSql = "SELECT definition_id,version,status,model_json FROM wf_process_definition WHERE tenant_id=100000 AND process_key='biz_contract' AND deleted=0 ORDER BY version;";
  const workflowDefinition = database(workflowSql);
  check('真实合同审批沿用已有发布定义，不新设正式审批顺序', workflowDefinition.includes('PUBLISHED'));
  const seed = await readFile(new URL('../cloudflow-backend/DB/06.cloudflow-business-seed.sql', import.meta.url), 'utf8');
  const formSeed = seed.match(/\('form_contract', '合同审批表单', '([^']+)'/);
  assert.ok(formSeed, 'Formal contract form seed is present');
  const formFields = JSON.parse(formSeed[1]);
  const currentForm = rows("SELECT JSON_OBJECT('version',version,'versionLock',version_lock,'fields',fields_json) FROM wf_form_definition WHERE tenant_id=100000 AND form_id='form_contract' AND is_latest=1;")[0];
  assert.ok(currentForm);
  const formHistory = rows("SELECT JSON_OBJECT('version',version,'fields',fields_json) FROM wf_form_definition WHERE tenant_id=100000 AND form_id='form_contract' ORDER BY version;");
  if (!isDeepStrictEqual(JSON.parse(currentForm.fields), formFields)) {
    const savedForm = successful(await api(admin, '/workflow/wf/form/save', { method: 'POST', body: {
      formId: 'form_contract', formName: '合同审批表单', versionLock: currentForm.versionLock, fieldsJson: JSON.stringify(formFields),
      changeLog: '隔离验证同步正式种子的合同台账字段绑定，保留既有历史表单版本',
    } }), '通过真实版本接口同步正式合同表单定义');
    check(`合同表单字段绑定修复创建新版本：${currentForm.version}→${savedForm.version}`, savedForm.version === currentForm.version + 1);
  } else {
    check(`合同表单内容与正式种子一致，沿用版本${currentForm.version}，不因属性顺序创建新版本`,
      Number(database("SELECT version FROM wf_form_definition WHERE tenant_id=100000 AND form_id='form_contract' AND is_latest=1;")) === currentForm.version);
  }
  check('合同表单同步保留全部既有版本的字段原文', formHistory.every(form =>
    database(`SELECT fields_json FROM wf_form_definition WHERE tenant_id=100000 AND form_id='form_contract' AND version=${form.version};`) === form.fields));
  check('实际最新版合同表单字段与正式种子逐项一致', isDeepStrictEqual(JSON.parse(database("SELECT fields_json FROM wf_form_definition WHERE tenant_id=100000 AND form_id='form_contract' AND is_latest=1;")), formFields));
  check('合同审批表单字段与实际业务快照一致，备注沿用台账可选规则', formFields.map(field => field.id).join(',') === 'contractName,counterpartyName,amount,contractType,remark'
    && formFields.slice(0, 4).every(field => field.required === true) && formFields[4].required === false
    && formFields[3].options.join(',') === 'PURCHASE,SALES,SERVICE,OTHER');
  const waitFor = async (readValue, accepts, label, milliseconds = 90000) => {
    const deadline = Date.now() + milliseconds;
    do {
      const value = await readValue();
      if (accepts(value)) return value;
      await new Promise(resolve => setTimeout(resolve, 500));
    } while (Date.now() < deadline);
    throw new Error(label);
  };
  const reject = (response, label, pattern = /合同|日期|版本|修改|填写|金额|币种|签署|取消|来源|编号|权限|无权|不存在|重复|频繁/) => {
    const message = response.body?.msg || response.body?.message || '';
    check(`${label} HTTP=${response.status} code=${response.body?.code} message=${message}`,
      ([400, 403, 404, 409].includes(response.status) || response.status === 200 && response.body?.code === 500)
      && response.body?.code !== 200 && pattern.test(message));
  };
  const read = async (id, page = admin) => successful(await api(page, `/oa/contract/${id}`), '读取真实合同及业务版本');
  const performance = async id => successful(await api(admin, `/oa/contract/${id}/performance`), '读取真实合同业绩状态');
  const sources = record => rows(`SELECT payload_json FROM outbox_event WHERE tenant_id=100000 AND aggregate_type='cloudflow-service-oa'
    AND aggregate_id=${record.contractId} AND event_type='CONTRACT_PERFORMANCE_CHANGED' ORDER BY id;`);
  const facts = record => rows(`SELECT JSON_OBJECT('id',event_id,'key',event_key,'amount',amount,'currency',currency,'teamVersion',team_version,'snapshot',source_snapshot)
    FROM crm_deal_event WHERE tenant_id=100000 AND biz_type='CONTRACT' AND biz_id=${record.contractId} ORDER BY event_id;`);
  const allocations = record => rows(`SELECT JSON_OBJECT('id',allocation.allocation_id,'user',allocation.sales_user_id,'employee',allocation.employee_id,
    'amount',allocation.allocated_amount,'percentage',allocation.allocated_percentage,'commission',allocation.commission_amount,'status',allocation.commission_status,'changeId',allocation.comp_change_id)
    FROM crm_deal_allocation allocation JOIN crm_deal_event event ON event.event_id=allocation.event_id AND event.tenant_id=allocation.tenant_id
    WHERE event.tenant_id=100000 AND event.biz_type='CONTRACT' AND event.biz_id=${record.contractId} ORDER BY allocation.sales_user_id;`);
  const customerName = `H3_CP_${caseTag}`;
  successful(await api(admin, '/crm/customer', { method: 'POST', body: { customerCode: customerName, customerName, ownerId: adminId } }), '真实创建合同业绩客户');
  const customerId = Number(database(`SELECT customer_id FROM crm_customer WHERE tenant_id=100000 AND customer_code=${literal(customerName)} AND deleted=0;`));
  assert.ok(Number.isSafeInteger(customerId) && customerId > 0);
  const create = async (suffix, startDate = today, changes = {}) => {
    const name = `H3_CP_${caseTag}_${suffix}`;
    const id = successful(await api(admin, '/oa/contract', { method: 'POST', body: {
      contractNo: name, contractName: name, counterpartyName: customerName, contractType: 'SALES', customerId, customerName,
      amount: '100.01', currency: 'CNY', ownerId: adminId, startDate, endDate, ...changes,
    } }), '通过真实OA接口建立合同');
    assert.ok(Number.isSafeInteger(id) && id > 0);
    return read(id);
  };
  const edit = async (record, changes) => {
    successful(await api(admin, '/oa/contract', { method: 'PUT', body: { ...record, ...changes } }), '真实合同版本更新');
    return read(record.contractId);
  };
  const approve = async record => {
    successful(await api(admin, `/oa/contract/submit/${record.contractId}`, { method: 'POST' }), '真实提交合同审批');
    const instanceId = await waitFor(() => database(`SELECT COALESCE(instance_id,'') FROM oa_contract WHERE tenant_id=100000 AND contract_id=${record.contractId};`),
      value => value && value !== 'NULL', '合同提交事件未启动并绑定真实审批实例');
    const workflowState = () => database(`SELECT status FROM wf_process_instance WHERE tenant_id=100000 AND instance_id=${literal(instanceId)};`);
    const variables = JSON.parse(database(`SELECT variables FROM wf_process_instance WHERE tenant_id=100000 AND instance_id=${literal(instanceId)};`));
    check('真实OA发起将合同名称、对方、金额和类型传入固定表单版本', variables.contractName === record.contractName
      && variables.counterpartyName === record.counterpartyName && Number(variables.amount) === Number(record.amount) && variables.contractType === record.contractType);
    for (let step = 0; step < 20 && !['PASSED', 'AUTO_PASSED'].includes(workflowState()); step++) {
      const task = await waitFor(() => rows(`SELECT JSON_OBJECT('id',task_id,'assignee',assignee) FROM wf_task
        WHERE tenant_id=100000 AND instance_id=${literal(instanceId)} AND status='TODO' ORDER BY task_id LIMIT 1;`)[0], Boolean, '真实合同审批任务未生成');
      check('实际合同审批任务已指定办理人，管理员代办沿用既有审计规则', task.assignee != null);
      successful(await api(admin, '/workflow/wf/complete', { method: 'POST', body: {
        taskId: task.id, action: 'APPROVE', comment: `H3合同业绩隔离验收，管理员按既有权限代办_${caseTag}`,
      } }), '通过真实工作流接口完成合同审批节点');
      const history = rows(`SELECT JSON_OBJECT('operator',operator_id,'action',action,'metadata',variables_changed) FROM wf_task_history
        WHERE tenant_id=100000 AND instance_id=${literal(instanceId)} AND task_id=${literal(task.id)} AND action IN ('APPROVE','COUNTERSIGN_APPROVE');`);
      check('真实会签或签发历史唯一记录实际办理人', history.length === 1 && history[0].operator === adminId
        && ['APPROVE', 'COUNTERSIGN_APPROVE'].includes(history[0].action));
      if (task.assignee !== adminId) {
        const metadata = JSON.parse(history[0].metadata);
        check('管理员代办审计实际保存代办标记和原办理人', metadata.adminOverride === true && metadata.originalAssigneeId === task.assignee);
      }
    }
    check('已有合同审批引擎产生真实通过终态', ['PASSED', 'AUTO_PASSED'].includes(workflowState()));
    await waitFor(() => database(`SELECT status FROM oa_contract WHERE tenant_id=100000 AND contract_id=${record.contractId};`), value => value === 'APPROVED', '真实审批结果未回写OA');
    check('合同审批终态与业务编号、流程键和结束时间一致', database(`SELECT COUNT(*) FROM wf_process_instance WHERE tenant_id=100000
      AND instance_id=${literal(instanceId)} AND business_key='CONTRACT:${record.contractId}' AND process_def_key='biz_contract' AND end_time IS NOT NULL;`) === '1');
    evidence.workflow = true; evidence.approvalOperator = 'existing_admin_override_with_audit';
    return read(record.contractId);
  };
  const signedFiles = new Map();
  const sign = async record => {
    let reference = signedFiles.get(record.contractId);
    if (!reference) {
      const file = Buffer.from(`%PDF-1.4\nH3 isolated signed contract ${record.contractNo}\n%%EOF\n`);
      const uploaded = successful(await api(admin, `/oa/contract/${record.contractId}/signed-file`, { method: 'POST',
        file: { name: `${record.contractNo}.pdf`, type: 'application/pdf', content: file.toString('base64') } }), '真实上传受权限保护的合同签署文件');
      reference = uploaded.reference; signedFiles.set(record.contractId, reference);
    }
    successful(await api(admin, `/oa/contract/${record.contractId}/sign`, { method: 'POST', body: {
      signMethod: 'SCAN', counterpartySignee: '合同业绩隔离签署人', counterpartySignTime: `${yesterday} 12:00:00`,
      signedFileUrl: reference, signRemark: `H3_CP_${caseTag}`,
    } }), '真实确认双方签署并保存签署依据');
    const current = await read(record.contractId);
    check('实际签署保存双方时间和文件引用', current.signedFlag === 1 && current.ourSignTime && current.counterpartySignTime && current.signedFileUrl === reference);
    evidence.signature = true;
    return current;
  };
  const prepareMissing = async suffix => {
    const record = await create(suffix, null); await approve(record); await sign(record);
    check('真实审批签署后缺日期保持未计入状态', (await performance(record.contractId)).state === 'MISSING_START_DATE'
      && sources(record).length === 0 && facts(record).length === 0);
    return read(record.contractId);
  };
  const confirmed = async record => {
    await waitFor(() => facts(record).length, count => count === 1, '合同持久来源未被CRM实际接收');
    const result = await performance(record.contractId);
    check('OA状态以CRM真实结果为准，金额为100.01', result.state === 'CONFIRMED' && Number(result.confirmedAmount) === 100.01);
    return result;
  };
  const saveTeam = async (record, ownerShare, salesShare) => {
    const address = `/crm/deal-team/CONTRACT/${record.contractId}`;
    const current = successful(await api(admin, address), '读取真实合同团队版本');
    return successful(await api(admin, address, { method: 'PUT', body: {
      businessVersion: current.businessVersion, teamVersion: current.teamVersion, remark: `H3_CP_${caseTag}`,
      members: [{ salesUserId: adminId, roleType: 'OWNER', allocatedPercentage: ownerShare }, { salesUserId: salesId, roleType: 'CO_SELLER', allocatedPercentage: salesShare }],
    } }), '通过CRM和OA真实入口保存合同团队');
  };

  const primary = await create('primary');
  check('草稿合同不计业绩', (await performance(primary.contractId)).state === 'WAITING_APPROVAL' && sources(primary).length === 0 && facts(primary).length === 0);
  await saveTeam(primary, '0.6', '0.4');
  await approve(primary);
  check('审批通过但未完成签署仍不计业绩', (await performance(primary.contractId)).state === 'WAITING_SIGNATURE' && sources(primary).length === 0 && facts(primary).length === 0);
  await verifyContractPerformanceRecovery({ ...context, primary, salesId, sign, performance, sources, facts, allocations, waitFor });
  await confirmed(primary);
  const originalSource = JSON.stringify(sources(primary));
  const originalFacts = JSON.stringify(facts(primary));
  const originalAllocations = JSON.stringify(allocations(primary));
  const frozen = JSON.parse(sources(primary)[0].payload);
  check('实际来源冻结审批、签署摘要及真实HR身份，无签署文件地址和提成率', frozen.contractId === primary.contractId && frozen.customerId === customerId
    && frozen.startDate === today && frozen.approvalInstanceId && frozen.approvedTime && frozen.signedEvidenceDigest.length === 64
    && frozen.members.length === 2 && frozen.members.every(member => Number(member.employeeId) > 0)
    && !originalSource.includes('signedFileUrl') && !originalSource.includes('commissionRate'));
  const split = allocations(primary);
  check('实际合同100.01按60/40冻结为60.01及40.00，未生成工资或到账提成', split.length === 2
    && Number(split.find(member => member.user === adminId).amount) === 60.01 && Number(split.find(member => member.user === salesId).amount) === 40
    && split.every(member => member.status === 'NOT_APPLICABLE' && member.commission == null && member.changeId == null));
  await saveTeam(primary, '0.5', '0.5');
  check('后续团队变更不改原合同业绩和冻结分配', JSON.stringify(sources(primary)) === originalSource
    && JSON.stringify(facts(primary)) === originalFacts && JSON.stringify(allocations(primary)) === originalAllocations);
  for (const [label, changes] of [['金额', { amount: '90' }], ['币种', { currency: 'USD' }], ['已有开始日期', { startDate: yesterday }]]) {
    reject(await api(admin, '/oa/contract', { method: 'PUT', body: { ...await read(primary.contractId), ...changes } }), `真实已签署合同禁止直接修改${label}`);
  }
  reject(await api(admin, `/oa/contract/cancel/${primary.contractId}`, { method: 'PUT' }), '真实已生效合同未开放直接取消');
  check('拒绝已签署合同变更没有新增更正或冲正事实', JSON.stringify(facts(primary)) === originalFacts && JSON.stringify(sources(primary)) === originalSource);
  const crmPort = state.services.find(service => service.name === 'crm').port;
  const replay = async (body, tenant = '100000', service = 'cloudflow-service-oa') => {
    const response = await fetch(`http://127.0.0.1:${crmPort}/inner/crm/deal-event/contract`, { method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Inner-Call': 'true', 'X-From-Service': service, 'X-Tenant-Id': tenant },
      body: JSON.stringify(body), signal: AbortSignal.timeout(20000) });
    return { status: response.status, body: await response.json() };
  };
  const replays = await Promise.all([replay({ eventId: sources(primary)[0].eventId }), replay({ eventId: sources(primary)[0].eventId })]);
  check('同一持久来源内部HTTP并发重放两次均成功，独立于队列去重', replays.every(result => result.status === 200 && result.body?.code === 200));
  check('业务处理器重放保留全部原事实和逐人分配', JSON.stringify(facts(primary)) === originalFacts && JSON.stringify(allocations(primary)) === originalAllocations);
  reject(await replay({ contractId: primary.contractId, amount: '999' }), '内部入口拒绝无持久来源编号的裸金额');
  reject(await replay({ eventId: sources(primary)[0].eventId }, '100001'), '内部入口拒绝跨租户持久来源');
  const wrongService = await replay({ eventId: sources(primary)[0].eventId }, '100000', 'cloudflow-service-hr');
  check('内部合同同步限定OA来源服务', wrongService.status === 403 && wrongService.body?.code === 403);
  const forged = await api(admin, '/crm/inner/crm/deal-event/contract', { method: 'POST', headers: { 'X-Inner-Call': 'true', 'X-From-Service': 'cloudflow-service-oa' }, body: { eventId: sources(primary)[0].eventId } });
  check('外部网关阻断伪造内部来源头', [403, 404].includes(forged.status));
  evidence.internalReplay = true;

  const missing = await prepareMissing('missing');
  for (const [label, body] of [
    ['缺日期', { version: missing.version, startDate: null }], ['缺版本', { startDate: today }],
    ['过期版本', { version: missing.version - 1, startDate: today }], ['开始晚于结束', { version: missing.version, startDate: '2099-12-31' }],
  ]) reject(await api(admin, `/oa/contract/${missing.contractId}/start-date`, { method: 'PUT', body }), `真实日期补填拒绝${label}`);
  const denied = await api(employee, `/oa/contract/${missing.contractId}/start-date`, { method: 'PUT', body: { version: missing.version, startDate: today } });
  check('EMPLOYEE没有取得合同日期补填写权限', denied.status === 403 && denied.body?.code === 403);
  reject(await api(foreign, `/oa/contract/${missing.contractId}/performance`), '外租户不可读取合同业绩');
  reject(await api(foreign, `/oa/contract/${missing.contractId}/start-date`, { method: 'PUT', body: { version: missing.version, startDate: today } }), '外租户不可补填合同日期');
  check('所有拒绝请求保留原日期、版本且无业绩来源', (await read(missing.contractId)).version === missing.version
    && !(await read(missing.contractId)).startDate && sources(missing).length === 0 && facts(missing).length === 0);
  const race = await prepareMissing('date_race');
  const competing = await Promise.all([today, yesterday].map(startDate => api(admin, `/oa/contract/${race.contractId}/start-date`, { method: 'PUT', body: { version: race.version, startDate } })));
  check('不同日期的真实并发补填只有一次成功', competing.filter(result => result.status === 200 && result.body?.code === 200).length === 1);
  await confirmed(race);
  const afterRace = await read(race.contractId);
  check('成功补填只增加一个业务版本且保留原签署凭证', afterRace.version === race.version + 1 && afterRace.signedFileUrl === race.signedFileUrl
    && afterRace.ourSignTime === race.ourSignTime && sources(race).length === 1);
  reject(await api(admin, `/oa/contract/${race.contractId}/start-date`, { method: 'PUT', body: { version: afterRace.version, startDate: tomorrow } }), '补齐后不能使用补填入口覆盖日期');
  check('未配置团队的真实合同冻结主责100%，不虚构团队版本', JSON.parse(sources(race)[0].payload).teamVersion === 0
    && allocations(race).length === 1 && Number(allocations(race)[0].amount) === 100.01);
  evidence.dateSupplement = true;

  const future = await create('future', tomorrow); await approve(future); await sign(future);
  check('双方签署但未来开始的合同保持待生效且来源与业绩均为零', (await performance(future.contractId)).state === 'WAITING_START_DATE'
    && sources(future).length === 0 && facts(future).length === 0);
  const beforeJob = Number(database('SELECT COALESCE(MAX(log_id),0) FROM sys_job_log WHERE tenant_id=100000 AND job_id=1901;'));
  database(`UPDATE oa_contract SET start_date=CURRENT_DATE,version=version+1 WHERE tenant_id=100000 AND contract_id=${future.contractId}
    AND contract_no=${literal(future.contractNo)} AND start_date=${literal(tomorrow)} AND signed_flag=1;`);
  check('到日验证只调整本次隔离合同日期输入，不伪造审批、来源或业绩', (await read(future.contractId)).startDate === today);
  await waitFor(() => database(`SELECT COUNT(*) FROM sys_job_log WHERE tenant_id=100000 AND job_id=1901 AND log_id>${beforeJob} AND execute_status='SUCCESS';`),
    value => Number(value) > 0 && facts(future).length === 1, '60秒集中自动任务未确认到日合同', 150000);
  await confirmed(future);
  check('真实集中任务自动确认到日合同，未由测试直接触发任务或重发消息', sources(future).length === 1 && facts(future).length === 1);
  evidence.dueJob = 'automatic_60_seconds_with_explicit_isolated_date_input';
  const unlinked = await create('unlinked', today, { customerId: null, customerName: null });
  const purchase = await create('purchase', today, { contractType: 'PURCHASE' });
  check('未关联客户及采购合同明确不适用客户销售业绩', (await performance(unlinked.contractId)).state === 'NOT_APPLICABLE'
    && (await performance(purchase.contractId)).state === 'NOT_APPLICABLE' && sources(unlinked).length === 0 && sources(purchase).length === 0);
  const view = await performance(primary.contractId);
  check('普通合同业绩状态不泄漏团队人员、比例或签署文件地址', !JSON.stringify(view).match(/members|percentage|employeeId|signedFileUrl/));
  evidence.conditions = true; evidence.permissions = true;
  if (!context.httpOnly) await verifyContractPerformanceInterface({ ...context, missing, prepareMissing, today, tomorrow, read, edit, performance, sources, facts, confirmed, waitFor });
  check('合同业绩验收没有修改正式审批定义或EMPLOYEE菜单授权', database(grantSql) === grants && database(workflowSql) === workflowDefinition);
  evidence.salaryPosting = false; evidence.financialCorrections = 'independent_database_checks_only_not_a_formal_change_workflow';
}
