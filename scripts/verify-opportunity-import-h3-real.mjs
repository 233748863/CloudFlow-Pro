import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { ownedGatewayRedis } from './owned-gateway-redis.mjs';
import { verifyOpportunityImportRecovery } from './verify-opportunity-import-h3-recovery.mjs';
import { verifyOpportunityImportInterface } from './verify-opportunity-import-h3-ui.mjs';
import { verifyOpportunityImportCompatibility } from './verify-opportunity-import-h3-compatibility.mjs';

export async function verifyOpportunityImport(harness) {
  const { admin, api, successful, session, database, check, directory, caseTag, state, evidence, upload: uploadFile, validate, execute } = harness;
  assert.equal(state.verification?.mode, 'H3_CORE_INDEPENDENT');
  assert.equal(state.verification?.scenario, 'OpportunityImport');
  assert.notEqual(path.basename(directory), '9799534e1a3a47b5958330f14ae16dc7');
  const sql = value => value == null ? 'NULL' : "CONVERT(UNHEX('" + Buffer.from(String(value)).toString('hex') + "') USING utf8mb4)";
  const configuredGuard = Number(database("SELECT COALESCE(MAX(CAST(config_value AS UNSIGNED)),0) FROM sys_config WHERE tenant_id IN (0,100000) AND config_key='sys.common.repeatSubmit.intervalMillis';"));
  const guardMilliseconds = Math.max(5000, configuredGuard) + 100;
  assert.ok(Number.isSafeInteger(guardMilliseconds) && guardMilliseconds <= 60100, 'Owned duplicate-submit interval must be bounded');
  const uploadTimes = new WeakMap();
  const upload = async (page, definition, rows, suffix) => {
    const times = uploadTimes.get(page) || new Map();
    uploadTimes.set(page, times);
    const key = definition.service + '/' + definition.bizType;
    const remaining = (times.get(key) || 0) + guardMilliseconds - Date.now();
    if (remaining > 0) await new Promise(resolve => setTimeout(resolve, remaining));
    try { return await uploadFile(page, definition, rows, suffix); }
    finally { times.set(key, Date.now()); }
  };
  const importHarness = { ...harness, upload, guardMilliseconds };
  const waitFor = async (read, accepts, label, milliseconds = 60000) => {
    const deadline = Date.now() + milliseconds;
    do {
      const value = await read();
      if (accepts(value)) return value;
      await new Promise(resolve => setTimeout(resolve, 250));
    } while (Date.now() < deadline);
    throw new Error(label);
  };
  const rejected = (result, label) => check(label, [400, 403, 404, 409].includes(result.status) || [400, 403, 404, 409].includes(result.body?.code));
  const adminId = Number(database("SELECT user_id FROM sys_user WHERE tenant_id=100000 AND user_name='g_import_admin';"));
  const salesId = Number(database("SELECT user_id FROM sys_user WHERE tenant_id=100000 AND user_name='g_opportunity_sales';"));
  const roleId = 990191717;
  const readonlyId = Number(database("SELECT user_id FROM sys_user WHERE tenant_id=100000 AND user_name='g_import_readonly';"));
  const originalGrants = database('SELECT tenant_id,role_id,menu_id FROM sys_role_menu ORDER BY tenant_id,role_id,menu_id;');
  const originalUserRoles = database('SELECT tenant_id,user_id,role_id FROM sys_user_role ORDER BY tenant_id,user_id,role_id;');
  const originalEmployeeGrants = database('SELECT tenant_id,menu_id FROM sys_role_menu WHERE role_id=5 ORDER BY tenant_id,menu_id;');
  const rules = () => api(admin, '/crm/sales-stage/list').then(result => successful(result, '读取商机导入阶段规则'));
  const originalQualified = (await rules()).find(rule => rule.stageCode === 'QUALIFIED');
  assert.ok(originalQualified);
  const saveQualified = async values => successful(await api(admin, '/crm/sales-stage', { method: 'PUT',
    body: { ...(await rules()).find(rule => rule.stageCode === 'QUALIFIED'), ...values } }), '按真实业务入口修改阶段规则');
  const redis = await ownedGatewayRedis(state);
  const refreshReadonly = () => {
    const keys = ['100000:user_details::100000:g_import_readonly', '100000:user_menus::' + readonlyId,
      '100000:menu_details::' + roleId, '100000:menu_details::perms:' + roleId];
    const removed = Number(redis('DEL', ...keys));
    console.log('H3_IMPORT_FIXTURE_AUTHORITY: own_user=true; exact_keys=4; removed=' + removed + '; rate_keys_modified=0');
  };
  const definitions = [];
  for (const service of ['auth', 'hr', 'oa', 'crm']) {
    definitions.push(...successful(await api(admin, '/' + service + '/system/import/types'), '真实导入业务目录').map(value => ({ ...value, service })));
  }
  const definition = definitions.find(value => value.bizType === 'OPPORTUNITY');
  assert.ok(definition);
  check('商机新增更新真实注册且更新模板权限准确', definition.supportsUpdates === true
    && definition.canDownloadUpdateTemplate === true && definition.columns.length === 13 && definition.maxRows === 10000);
  check('新商机导入权限1917仅默认授予管理员', database('SELECT GROUP_CONCAT(role_id ORDER BY role_id) FROM sys_role_menu WHERE tenant_id=100000 AND menu_id=1917;') === '1');
  const prefix = 'H3_IMPORT_' + caseTag + '_';
  const customerCode = prefix + 'customer';
  successful(await api(admin, '/crm/customer', { method: 'POST', body: { customerCode, customerName: customerCode, ownerId: adminId } }), '真实创建导入引用客户');
  const customerId = Number(database('SELECT customer_id FROM crm_customer WHERE tenant_id=100000 AND customer_code=' + sql(customerCode) + ';'));
  successful(await api(admin, '/crm/contact', { method: 'POST', body: { customerId, contactName: prefix + 'contact', status: 'ACTIVE' } }), '真实建立导入联系人');
  const contactId = Number(database('SELECT contact_id FROM crm_contact WHERE tenant_id=100000 AND customer_id=' + customerId + ' AND contact_name=' + sql(prefix + 'contact') + ';'));
  const detail = async (id, page = admin) => successful(await api(page, '/crm/opportunity/' + id), '读取真实导入商机');
  const createOpportunity = async (suffix, page = admin, ownerId = adminId, linkedCustomer = customerId) => {
    const name = prefix + suffix;
    successful(await api(page, '/crm/opportunity', { method: 'POST', body: { customerId: linkedCustomer, opportunityName: name,
      ownerId, expectedAmount: '50.00', remark: '原备注保留', expectedSignDate: '2026-12-01', ...(linkedCustomer === customerId ? { contactId } : {}) } }), '真实建立待更新商机');
    const id = database('SELECT opportunity_id FROM crm_opportunity WHERE tenant_id=100000 AND opportunity_name=' + sql(name) + ';');
    assert.match(id, /^[1-9]\d*$/);
    return detail(Number(id), page);
  };
  const createRow = (name, values = {}) => ({ operation: 'CREATE', customerId: customerCode, opportunityName: name, ...values });
  const updateRow = (record, values = {}) => ({ operation: 'UPDATE', opportunityId: String(record.opportunityId), version: String(record.version), ...values });
  const fingerprint = record => JSON.stringify(['version', 'customerId', 'ownerId', 'contactId', 'opportunityName', 'stage', 'status',
    'expectedAmount', 'winRate', 'expectedSignDate', 'source', 'remark'].map(key => record[key]));
  const inspect = async uploaded => successful(await api(admin, '/crm/system/import/' + uploaded.task.taskId + '/preview'), '读取真实导入校验错误');
  const refuseRow = async (row, label, pattern, protectedRecord) => {
    const before = protectedRecord ? fingerprint(await detail(protectedRecord.opportunityId)) : null;
    const uploaded = await upload(admin, definition, [row], caseTag + '-' + label);
    const validated = await validate(admin, uploaded);
    const preview = await inspect(uploaded);
    check(label + '在预校验明确定位实际第2行', validated.status === 'VALIDATED' && validated.validRows === 0 && validated.invalidRows === 1
      && preview.errors.rows.some(error => error.rowNo === 2 && pattern.test(error.errorMessage)));
    const completed = await execute(admin, uploaded, true);
    check(label + '实际导入没有保存该行', completed.status === 'FAILED' && completed.successRows === 0 && completed.failRows === 1);
    if (protectedRecord) check(label + '原业务记录保持', fingerprint(await detail(protectedRecord.opportunityId)) === before);
    return uploaded;
  };
  const followUp = async (record, suffix) => {
    const content = prefix + suffix;
    successful(await api(admin, '/crm/follow-up', { method: 'POST', body: { customerId, opportunityId: record.opportunityId,
      followUpType: 'CALL', followUpTime: database("SELECT DATE_FORMAT(NOW(),'%Y-%m-%d %H:%i:%s');"), content } }), '真实创建导入阶段前置跟进');
    return database('SELECT follow_up_id FROM crm_follow_up WHERE tenant_id=100000 AND content=' + sql(content) + ';');
  };
  let readonly, sales, customRoleCreated = false;
  try {
    await saveQualified({ requiredFields: [], requiredActivityFlag: 0 });
    let existing = await createOpportunity('existing');
    const mixedName = prefix + 'mixed_new';
    const mixed = await upload(admin, definition, [createRow(mixedName, { expectedAmount: '125.25', winRate: '40' }),
      updateRow(existing, { opportunityName: prefix + 'mixed_updated', expectedAmount: '80.50' })], caseTag + '-mixed');
    const initial = fingerprint(existing);
    const validated = await validate(admin, mixed);
    check('同一文件新增及更新均通过校验且尚未写业务', validated.validRows === 2 && validated.invalidRows === 0
      && database('SELECT COUNT(*) FROM crm_opportunity WHERE tenant_id=100000 AND opportunity_name=' + sql(mixedName) + ';') === '0'
      && fingerprint(await detail(existing.opportunityId)) === initial);
    const completed = await execute(admin, mixed, false);
    existing = await detail(existing.opportunityId);
    const createdId = database('SELECT opportunity_id FROM crm_opportunity WHERE tenant_id=100000 AND opportunity_name=' + sql(mixedName) + ';');
    const created = await detail(createdId);
    await fs.writeFile(path.join(directory, 'h3-import-mixed-' + caseTag + '.json'), JSON.stringify({
      task: { status: completed.status, successRows: completed.successRows, failRows: completed.failRows },
      updated: { version: existing.version, contactId: existing.contactId, remark: existing.remark, amount: existing.expectedAmount },
      created: { stage: created.stage, winRate: created.winRate, amount: created.expectedAmount, weightedAmount: created.weightedAmount },
    }, null, 2), { flag: 'wx' });
    check('混合文件实际新增一条并更新一条，空白更新保留原值', completed.status === 'SUCCESS' && completed.successRows === 2
      && existing.version === 1 && existing.remark === '原备注保留' && existing.contactId === contactId
      && Number(existing.expectedAmount) === 80.50 && Number(created.expectedAmount) === 125.25);
    check('导入新增沿用起始阶段10%默认成交概率并四舍五入加权金额', created.stage === 'LEAD'
      && Number(created.winRate) === 10 && Number(created.weightedAmount) === 12.53);
    const team = successful(await api(admin, '/crm/deal-team/OPPORTUNITY/' + createdId), '读取导入新增的真实团队');
    check('导入新增沿用负责人100%团队和唯一初始阶段历史', team.members.length === 1
      && team.members[0].salesUserId === adminId && Number(team.members[0].allocatedPercentage) === 1
      && database('SELECT COUNT(*) FROM crm_opportunity_stage_history WHERE tenant_id=100000 AND opportunity_id=' + createdId + ';') === '1');
    rejected(await api(admin, '/crm/system/import/' + mixed.task.taskId + '/execute', { method: 'POST', body: { skipInvalidRows: false } }), '完成后的混合导入重复执行被拒绝');
    await new Promise(resolve => setTimeout(resolve, guardMilliseconds));
    const afterGuard = await api(admin, '/crm/system/import/' + mixed.task.taskId + '/execute', { method: 'POST', body: { skipInvalidRows: false } });
    check('防重复保护自然到期后，已完成任务仍由业务状态拒绝重做', afterGuard.status === 400 && afterGuard.body?.code === 400
      && /已经完成的任务不能重复执行/.test(afterGuard.body?.msg || ''));
    check('重复提交不再增加记录或更新版本', database('SELECT COUNT(*) FROM crm_opportunity WHERE tenant_id=100000 AND opportunity_name=' + sql(mixedName) + ';') === '1'
      && (await detail(existing.opportunityId)).version === existing.version);
    evidence.mixed = true;
    evidence.idempotency = true;

    await refuseRow({ ...createRow(prefix + 'bad_create'), opportunityId: existing.opportunityId, version: existing.version }, '新增不得带编号和版本', /编号|版本/, existing);
    await refuseRow({ operation: 'UPDATE', opportunityId: existing.opportunityId, remark: '不得覆盖' }, '更新缺少导出版本', /编号|版本/, existing);
    await refuseRow(createRow(prefix + 'bad_operation', { operation: 'UNKNOWN' }), '未知操作', /操作|选项|枚举/);
    await refuseRow({ operation: 'CREATE', opportunityName: prefix + 'missing_customer' }, '新增缺少客户', /客户/);
    const stale = updateRow(existing, { remark: '过期版本不得覆盖' });
    successful(await api(admin, '/crm/opportunity', { method: 'PUT', body: { ...existing, remark: '文件下载后人工修改' } }), '真实制造导出后版本竞争');
    existing = await detail(existing.opportunityId);
    await refuseRow(stale, '旧版本更新', /版本|修改|刷新|变化/, existing);
    evidence.versionConflicts = true;
    await refuseRow(updateRow(existing, { stage: 'PROPOSAL' }), '导入禁止跳阶段', /阶段|跳/, existing);
    await refuseRow(updateRow(existing, { stage: 'WON' }), '导入不能代替赢单操作', /阶段|赢单/, existing);
    await refuseRow(updateRow(existing, { stage: 'LOST' }), '导入不能代替丢单审批', /阶段|审批|关闭/, existing);
    let required = await createOpportunity('required_fields');
    successful(await api(admin, '/crm/opportunity', { method: 'PUT', body: { ...required, contactId: null, expectedSignDate: null } }), '真实准备缺少阶段必填信息的商机');
    required = await detail(required.opportunityId);
    await saveQualified({ requiredFields: ['contactId', 'expectedSignDate'], requiredActivityFlag: 0 });
    await refuseRow(updateRow(required, { stage: 'QUALIFIED' }), '导入遵循阶段必填字段', /必填|联系人|签约|字段/, required);
    const filled = await upload(admin, definition, [updateRow(required, { stage: 'QUALIFIED', contactId: 'CONTACT-' + contactId,
      expectedSignDate: '2026-12-01' })], caseTag + '-required-filled');
    check('文件补齐真实联系人及签约日期后校验通过', (await validate(admin, filled)).validRows === 1);
    check('导入补齐阶段必填信息后实际推进', (await execute(admin, filled, false)).successRows === 1
      && (await detail(required.opportunityId)).stage === 'QUALIFIED');
    await saveQualified({ requiredFields: [], requiredActivityFlag: 0 });

    const duplicate = await upload(admin, definition, [updateRow(existing, { remark: '重复文件首行' }),
      updateRow(existing, { remark: '重复文件次行不得覆盖' })], caseTag + '-duplicate');
    const duplicateValidation = await validate(admin, duplicate);
    const duplicatePreview = await inspect(duplicate);
    check('同一文件重复更新编号准确识别第二行', duplicateValidation.validRows === 1 && duplicateValidation.invalidRows === 1
      && duplicatePreview.errors.rows.some(error => error.rowNo === 3 && error.errorType === 'DUPLICATE'));
    rejected(await api(admin, '/crm/system/import/' + duplicate.task.taskId + '/execute', { method: 'POST', body: { skipInvalidRows: false } }), '未允许跳过时重复更新文件整批拒绝');
    check('整批拒绝时首行也未保存', (await detail(existing.opportunityId)).version === existing.version);
    const partial = await execute(admin, duplicate, true);
    const afterDuplicate = await detail(existing.opportunityId);
    check('明确跳过重复行时仅首行更新一次', partial.status === 'PARTIAL' && partial.successRows === 1 && partial.failRows === 1
      && afterDuplicate.version === existing.version + 1 && afterDuplicate.remark === '重复文件首行');
    existing = afterDuplicate;
    evidence.duplicateRows = true;

    sales = await session('g_opportunity_sales');
    const salesCode = prefix + 'sales_customer';
    successful(await api(sales, '/crm/customer', { method: 'POST', body: { customerCode: salesCode, customerName: salesCode, ownerId: salesId } }), '真实创建其他负责人客户');
    const salesCustomerId = Number(database('SELECT customer_id FROM crm_customer WHERE tenant_id=100000 AND customer_code=' + sql(salesCode) + ';'));
    const salesRecord = await createOpportunity('sales_owned', sales, salesId, salesCustomerId);
    successful(await api(admin, '/crm/contact', { method: 'POST', body: { customerId: salesCustomerId, contactName: prefix + 'other_contact',
      status: 'ACTIVE' } }), '真实建立另一客户的联系人');
    const otherContactId = database('SELECT contact_id FROM crm_contact WHERE tenant_id=100000 AND customer_id=' + salesCustomerId
      + ' AND contact_name=' + sql(prefix + 'other_contact') + ';');
    await refuseRow(updateRow(existing, { contactId: 'CONTACT-' + otherContactId }), '导入联系人必须属于当前客户', /联系人|客户/, existing);
    await refuseRow(updateRow(salesRecord, { remark: '管理权限不得替代负责人' }), '非负责人导入更新', /本人|权限|无权/, salesRecord);
    rejected(await api(sales, '/crm/system/import/OPPORTUNITY/template'), '没有专用导入权限的销售代表不能下载模板');
    const foreignCode = prefix + 'foreign_fixture';
    database("INSERT INTO crm_customer (tenant_id,customer_code,customer_name,owner_id,dept_id) VALUES (100001," + sql(foreignCode) + ',' + sql(foreignCode) + ',990000703,990000101);');
    const foreignCustomerId = database('SELECT customer_id FROM crm_customer WHERE tenant_id=100001 AND customer_code=' + sql(foreignCode) + ';');
    database('INSERT INTO crm_opportunity (tenant_id,customer_id,customer_name,opportunity_name,expected_amount,win_rate,weighted_amount,stage,status,owner_id,owner_name,dept_id,version,deleted)'
      + ' SELECT 100001,' + foreignCustomerId + ',' + sql(foreignCode) + ',' + sql(prefix + 'foreign_opportunity') + ",expected_amount,win_rate,weighted_amount,stage,status,990000703,'隔离租户负责人',990000101,0,0"
      + ' FROM crm_opportunity WHERE tenant_id=100000 AND opportunity_id=' + existing.opportunityId + ';');
    const foreignId = database('SELECT opportunity_id FROM crm_opportunity WHERE tenant_id=100001 AND opportunity_name=' + sql(prefix + 'foreign_opportunity') + ';');
    assert.match(foreignId, /^[1-9]\d*$/);
    await refuseRow({ operation: 'UPDATE', opportunityId: foreignId, version: '0', remark: '跨租户不得覆盖' }, '跨租户商机更新', /无权|不存在/);
    check('外租户边界记录经真实导入拒绝后保持原版本', database('SELECT version FROM crm_opportunity WHERE tenant_id=100001 AND opportunity_id=' + foreignId + ';') === '0');
    assert.equal(database('SELECT COUNT(*) FROM sys_role WHERE role_id=' + roleId + ';'), '0');
    database('INSERT INTO sys_role (role_id,tenant_id,role_name,role_key,role_sort,data_scope,ds_type,status,deleted) VALUES ('
      + roleId + ",100000,'导入源权限边界'," + sql('h3_import_source_' + caseTag) + ",10,'1',0,'0',0);");
    customRoleCreated = true;
    database('INSERT INTO sys_role_menu(role_id,menu_id,tenant_id) VALUES (' + roleId + ',1757,100000),(' + roleId + ',1917,100000);'
      + ' INSERT INTO sys_user_role(user_id,role_id,tenant_id) VALUES (' + readonlyId + ',' + roleId + ',100000);');
    refreshReadonly();
    readonly = await session('g_import_readonly');
    const readonlyDefinition = successful(await api(readonly, '/crm/system/import/types'), '读取仅有导入入口权限的业务目录').find(value => value.bizType === 'OPPORTUNITY');
    check('仅有导入权限时不开放更新模板', readonlyDefinition?.supportsUpdates === true && readonlyDefinition.canDownloadUpdateTemplate === false);
    const noSource = await upload(readonly, definition, [createRow(prefix + 'source_denied'), updateRow(existing, { remark: '无编辑权' })], caseTag + '-source-permissions');
    const noSourceValidation = await validate(readonly, noSource);
    check('逐行同时拦截缺少新增和缺少编辑权限', noSourceValidation.validRows === 0 && noSourceValidation.invalidRows === 2
      && (await detail(existing.opportunityId)).version === existing.version
      && database('SELECT COUNT(*) FROM crm_opportunity WHERE tenant_id=100000 AND opportunity_name=' + sql(prefix + 'source_denied') + ';') === '0');
    rejected(await api(readonly, '/crm/system/import/OPPORTUNITY/template?updates=true'), '缺少编辑权限时直接请求更新模板也拒绝');
    evidence.permissions = true;

    const dynamic = await createOpportunity('dynamic_rules');
    const changing = await upload(admin, definition, [updateRow(dynamic, { stage: 'QUALIFIED' })], caseTag + '-rule-change');
    check('变更阶段规则前该文件合法', (await validate(admin, changing)).validRows === 1);
    await saveQualified({ requiredFields: [], requiredActivityFlag: 1 });
    const changed = await execute(admin, changing, false);
    check('校验后增加真实跟进要求，写入时再次检查并停止该行', changed.status === 'FAILED' && changed.successRows === 0 && changed.failRows === 1
      && (await detail(dynamic.opportunityId)).stage === 'LEAD' && (await detail(dynamic.opportunityId)).version === dynamic.version);
    const activityId = await followUp(dynamic, 'activity_removed');
    assert.match(activityId, /^[1-9]\d*$/);
    const disappearing = await upload(admin, definition, [updateRow(dynamic, { stage: 'QUALIFIED' })], caseTag + '-activity-change');
    check('有真实跟进时预校验通过', (await validate(admin, disappearing)).validRows === 1);
    const invalidDeletion = await api(admin, '/crm/follow-up/' + activityId + ',9223372036854775807', { method: 'DELETE' });
    check('批量删除包含不存在记录时整批拒绝，合法跟进保留', invalidDeletion.status === 400
      && database('SELECT deleted FROM crm_follow_up WHERE tenant_id=100000 AND follow_up_id=' + activityId + ';') === '0');
    successful(await api(admin, '/crm/follow-up/' + activityId, { method: 'DELETE' }), '真实删除校验后失效的跟进');
    check('跟进删除标记和操作者时间实际保存', database('SELECT COUNT(*) FROM crm_follow_up WHERE tenant_id=100000 AND follow_up_id='
      + activityId + " AND deleted=1 AND update_by IS NOT NULL AND update_time IS NOT NULL;") === '1');
    const removed = await execute(admin, disappearing, false);
    check('校验后跟进被删除时不推进阶段', removed.status === 'FAILED' && removed.failRows === 1
      && (await detail(dynamic.opportunityId)).version === dynamic.version);
    await followUp(dynamic, 'activity_valid');
    const legal = await upload(admin, definition, [updateRow(dynamic, { stage: 'QUALIFIED' })], caseTag + '-stage-valid');
    check('恢复真实跟进后新文件通过校验', (await validate(admin, legal)).validRows === 1);
    check('合法相邻阶段通过导入实际推进', (await execute(admin, legal, false)).successRows === 1
      && (await detail(dynamic.opportunityId)).stage === 'QUALIFIED'
      && database('SELECT COUNT(*) FROM crm_opportunity_stage_history WHERE tenant_id=100000 AND opportunity_id=' + dynamic.opportunityId + ';') === '2');
    evidence.liveRevalidation = true;
    const terminal = await createOpportunity('terminal');
    for (const stage of ['QUALIFIED', 'PROPOSAL', 'NEGOTIATION']) {
      await followUp(terminal, 'terminal_' + stage);
      const current = await detail(terminal.opportunityId);
      successful(await api(admin, '/crm/opportunity/stage', { method: 'PUT', body: { opportunityId: current.opportunityId, version: current.version, stage } }), '按手工入口准备实际赢单前阶段');
    }
    const beforeWin = await detail(terminal.opportunityId);
    successful(await api(admin, '/crm/opportunity/' + terminal.opportunityId + '/win', { method: 'POST', body: { version: beforeWin.version } }), '通过真实专用入口赢单');
    const won = await detail(terminal.opportunityId);
    assert.equal(won.stage, 'WON');
    await refuseRow(updateRow(won, { remark: '终态不可导入改写' }), '已赢单商机更新', /结案|恢复|终态/, won);
    evidence.stageRules = true;

    const products = await createOpportunity('products');
    successful(await api(admin, '/crm/opportunity/' + products.opportunityId + '/items', { method: 'PUT', body: { version: products.version,
      items: [{ productName: prefix + 'product', quantity: '3', unitPrice: '19.9950', discountRate: '90', taxRate: '13' }] } }), '真实建立商机产品明细');
    const productRecord = await detail(products.opportunityId);
    assert.equal(Number(productRecord.expectedAmount), 53.99);
    await refuseRow(updateRow(productRecord, { expectedAmount: '100.00' }), '金额与产品合计不一致', /产品|金额|合计/, productRecord);
    const productUpdate = await upload(admin, definition, [updateRow(productRecord, { expectedAmount: '53.99', remark: '保留真实产品合计' })], caseTag + '-product-valid');
    check('匹配产品合计的更新通过预校验', (await validate(admin, productUpdate)).validRows === 1);
    check('匹配产品合计时更新保存且未改产品金额', (await execute(admin, productUpdate, false)).successRows === 1
      && Number((await detail(products.opportunityId)).expectedAmount) === 53.99);
    evidence.products = true;
    await verifyOpportunityImportCompatibility({ ...importHarness, definitions, sql });
    await saveQualified({ requiredFields: [], requiredActivityFlag: 0 });
    await verifyOpportunityImportRecovery({ ...importHarness, definition, createOpportunity, detail, createRow, updateRow, sql, waitFor });
    await verifyOpportunityImportInterface({ ...importHarness, definition, existing: await detail(existing.opportunityId),
      salesRecord, won, createRow, updateRow, detail, sql, waitFor });
    await fs.writeFile(path.join(directory, 'h3-import-boundary-inputs-' + caseTag + '.json'),
      JSON.stringify({ foreignCustomerId, foreignOpportunityId: foreignId, sourcePermissionRole: roleId,
        restorationRequired: true, actualBusinessHttp: true, apiDoubles: 0, rateConfigurationChanged: false }, null, 2), { flag: 'wx' });
  } finally {
    const currentQualified = (await rules()).find(rule => rule.stageCode === 'QUALIFIED');
    successful(await api(admin, '/crm/sales-stage', { method: 'PUT', body: { ...originalQualified, version: currentQualified.version } }), '恢复本次隔离阶段规则');
    if (readonly) await readonly.context().close();
    if (sales) await sales.context().close();
    if (customRoleCreated) {
      database('DELETE FROM sys_user_role WHERE tenant_id=100000 AND user_id=' + readonlyId + ' AND role_id=' + roleId + ';'
        + ' DELETE FROM sys_role_menu WHERE tenant_id=100000 AND role_id=' + roleId + ';'
        + ' DELETE FROM sys_role WHERE tenant_id=100000 AND role_id=' + roleId + ';');
      refreshReadonly();
    }
    check('商机导入检查后完整角色授权及用户角色关系恢复', database('SELECT tenant_id,role_id,menu_id FROM sys_role_menu ORDER BY tenant_id,role_id,menu_id;') === originalGrants
      && database('SELECT tenant_id,user_id,role_id FROM sys_user_role ORDER BY tenant_id,user_id,role_id;') === originalUserRoles);
    check('EMPLOYEE全部租户权限完整保持', database('SELECT tenant_id,menu_id FROM sys_role_menu WHERE role_id=5 ORDER BY tenant_id,menu_id;') === originalEmployeeGrants);
    evidence.cleanup = true;
  }
}
