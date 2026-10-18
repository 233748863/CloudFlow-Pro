import assert from 'node:assert/strict';

export async function verifyOauthResources(context) {
  const { admin, api, successful, check, database, literal, hash, create, issued, redeem, rememberTokens, tokenRequest, resource,
    denied, wire, budget, actors, cleanups, caseTag, state, redis, evidence, config, manage, entry, random, pause } = context;
  const prefix = `oauth-resource-${caseTag}`;
  const customers = [];
  const workflow = { formId: null, definitionId: null, instanceId: null };
  cleanups.push(async () => {
    if (workflow.instanceId) {
      const tables = database("SELECT table_name FROM information_schema.columns WHERE table_schema='cloud_flow_db' AND column_name IN ('instance_id','tenant_id') AND table_name LIKE 'wf_%' GROUP BY table_name HAVING COUNT(*)=2;").split(/\r?\n/).filter(Boolean);
      for (const table of tables) {
        assert.match(table, /^wf_[a-z0-9_]+$/);
        database(`DELETE FROM ${table} WHERE tenant_id=100000 AND BINARY instance_id=BINARY ${literal(workflow.instanceId)};`);
      }
    }
    if (workflow.definitionId) database(`DELETE FROM wf_form_field_permission WHERE tenant_id=100000 AND BINARY definition_id=BINARY ${literal(workflow.definitionId)};
      DELETE FROM wf_performance_stats WHERE tenant_id=100000 AND BINARY process_def_key=BINARY ${literal(`h5o_${caseTag}`)};
      DELETE FROM wf_deploy_record WHERE tenant_id=100000 AND BINARY process_def_id=BINARY ${literal(workflow.definitionId)} AND BINARY process_key=BINARY ${literal(`h5o_${caseTag}`)};
      DELETE FROM wf_process_definition WHERE tenant_id=100000 AND BINARY definition_id=BINARY ${literal(workflow.definitionId)};`);
    if (workflow.formId) database(`DELETE FROM wf_form_definition WHERE tenant_id=100000 AND BINARY form_id=BINARY ${literal(workflow.formId)};`);
    for (const customer of customers) database(`DELETE FROM crm_customer WHERE tenant_id=${customer.tenantId} AND customer_id=${customer.customerId} AND customer_code LIKE ${literal(`${prefix}%`)};`);
    check('OAuth客户与流程专用数据已清理', database(`SELECT
      (SELECT COUNT(*) FROM crm_customer WHERE BINARY LEFT(customer_code,${prefix.length})=BINARY ${literal(prefix)})
      + (SELECT COUNT(*) FROM wf_process_instance WHERE tenant_id=100000 AND BINARY business_key=BINARY ${literal(`h5o_${caseTag}`)})
      + (SELECT COUNT(*) FROM wf_deploy_record WHERE tenant_id=100000 AND BINARY process_key=BINARY ${literal(`h5o_${caseTag}`)})
      + (SELECT COUNT(*) FROM wf_performance_stats WHERE tenant_id=100000 AND BINARY process_def_key=BINARY ${literal(`h5o_${caseTag}`)})
      + (SELECT COUNT(*) FROM wf_process_definition WHERE tenant_id=100000 AND BINARY process_key=BINARY ${literal(`h5o_${caseTag}`)})
      + (SELECT COUNT(*) FROM wf_form_definition WHERE tenant_id=100000 AND BINARY form_key=BINARY ${literal(`h5o_${caseTag}`)});`) === '0');
  });
  const customer = (person, suffix) => {
    const customerId = database(`INSERT INTO crm_customer (tenant_id,dept_id,owner_id,customer_code,customer_name,remark,status)
      VALUES (${person.tenantId},${person.deptId},${person.userId},${literal(`${prefix}-${suffix}`)},${literal(`${prefix}-${suffix}`)},${literal(`internal-only-${caseTag}`)},'ACTIVE'); SELECT LAST_INSERT_ID();`);
    assert.match(customerId, /^[1-9][0-9]*$/);
    const row = { customerId, tenantId: person.tenantId, person, suffix };
    customers.push(row);
    return row;
  };
  const own = customer(actors.own, 'own');
  const peer = customer(actors.peer, 'peer');
  const foreign = customer(actors.foreign, 'foreign');
  const serviceCustomer = customer(actors.service, 'service');
  const business = await create('business', { scopes: ['profile', 'crm.customer.read', 'workflow.instance.read', 'system.tenant.read'] });
  const personal = rememberTokens(await redeem(await issued(actors.own.page, business)), '四个登记范围真实授权');
  const listPath = `/oauth2/api/crm/customer?name=${encodeURIComponent(prefix)}&pageSize=100`;
  const ownList = await resource(personal.access_token, listPath);
  check(`OAuth真实CRM查询复用本人数据范围（HTTP=${ownList.status}; total=${ownList.body?.total}; total_type=${typeof ownList.body?.total}; rows=${ownList.body?.rows?.length}）`, ownList.status === 200 && ownList.body?.total === 1
    && ownList.body.rows.length === 1 && String(ownList.body.rows[0].customerId) === own.customerId);
  const detail = await resource(personal.access_token, `/oauth2/api/crm/customer/${own.customerId}`);
  check(`OAuth客户详情仅返回六个批准字段（HTTP=${detail.status}; fields=${Object.keys(detail.body ?? {}).sort().join(',')}）`, detail.status === 200 && Object.keys(detail.body).sort().join(',') === 'customerCode,customerId,customerName,customerType,industry,status'
    && !JSON.stringify(detail.body).includes(`internal-only-${caseTag}`));
  for (const hidden of [peer, foreign]) denied(await resource(personal.access_token, `/oauth2/api/crm/customer/${hidden.customerId}`), 403, 'insufficient_scope', 'OAuth客户详情拒绝他人或跨租户客户');
  const forged = await wire(listPath, { token: personal.access_token, headers: { 'X-User-Id': actors.peer.userId, 'X-Tenant-Id': '100001',
    'X-User-Tenant-Id': '100001', 'X-Inner-Call': 'true', 'X-From-Service': 'cloudflow-auth' } });
  check('客户端伪造内部用户或租户头仍只得到本人客户', forged.status === 200 && forged.body?.rows.length === 1 && String(forged.body.rows[0].customerId) === own.customerId);
  const tenant = await resource(personal.access_token, '/oauth2/api/system/tenant');
  check('租户资源只包含当前企业编号及名称', tenant.status === 200 && String(tenant.body?.tenantId) === '100000'
    && Object.keys(tenant.body).sort().join(',') === 'tenantId,tenantName');
  const otherClient = await create('foreign', { tenantId: 100001, scopes: ['profile', 'crm.customer.read', 'system.tenant.read'] });
  denied((await context.begin(actors.own.page, otherClient)).result, 403, 'insufficient_scope', '内部员工不能授权其他租户的应用');
  const foreignTokens = rememberTokens(await redeem(await issued(actors.foreign.page, otherClient)), '另一租户真实第三方授权');
  const foreignList = await resource(foreignTokens.access_token, listPath);
  check('另一租户同编号资源接口仍限定当前企业', foreignList.status === 200 && foreignList.body?.rows.length === 1
    && String(foreignList.body.rows[0].customerId) === foreign.customerId);
  denied(await resource(foreignTokens.access_token, `/oauth2/api/crm/customer/${own.customerId}`), 403, 'insufficient_scope', '另一租户令牌不能读取本租户客户编号');
  const invalidManagement = await manage(entry, { method: 'POST', body: config('invalid-service', { grantTypes: ['client_credentials'],
    redirectUris: [], scopes: ['crm.customer.read'], serviceUserId: actors.own.userId }) });
  check('普通员工账号不能被登记为专用服务身份', invalidManagement.status === 400 && invalidManagement.body?.code !== 200);
  const service = await create('service', { grantTypes: ['client_credentials'], redirectUris: [],
    serviceUserId: actors.service.userId, scopes: ['crm.customer.read', 'workflow.instance.read', 'system.tenant.read'] });
  const serviceTokens = rememberTokens(await tokenRequest(service, { grant_type: 'client_credentials' }), '专用只读服务账号真实发码');
  check('客户端凭据模式不产生刷新令牌', !Object.hasOwn(serviceTokens, 'refresh_token')
    && database(`SELECT COUNT(*) FROM sys_oauth2_refresh_token WHERE client_id=${service.clientId};`) === '0');
  const serviceList = await resource(serviceTokens.access_token, listPath);
  check('专用账号读取仍限制为自己的CRM范围', serviceList.status === 200 && serviceList.body?.rows.length === 1
    && String(serviceList.body.rows[0].customerId) === serviceCustomer.customerId);
  denied(await resource(serviceTokens.access_token), 403, 'insufficient_scope', '服务账号令牌不能读取员工本人资料');
  denied(await tokenRequest({ ...service, secret: null }, { grant_type: 'client_credentials' }), 401, 'invalid_client', '机密客户端缺少Basic密钥时拒绝');
  denied(await tokenRequest(service, { grant_type: 'client_credentials', scope: 'profile' }), 400, 'invalid_scope', '服务账号不能申请profile');
  const revoke = async (client, token) => { await budget('revoke-ip', 55); await budget(`revoke-client:${client.clientKey}`, 19);
    return wire('/oauth2/revoke', { client, form: { client_id: client.clientKey, token } }); };
  const foreignRevoke = await revoke(service, personal.access_token);
  check('撤销其他应用令牌保持统一成功响应且不泄露归属', foreignRevoke.status === 200 && JSON.stringify(foreignRevoke.body) === '{}' && foreignRevoke.cache === 'no-store');
  check('其他应用的撤销请求不能影响个人授权', (await resource(personal.access_token)).status === 200);
  const removed = await revoke(service, serviceTokens.access_token);
  check('本应用撤销同样返回统一响应', removed.status === 200 && JSON.stringify(removed.body) === '{}');
  denied(await resource(serviceTokens.access_token, '/oauth2/api/system/tenant'), 401, 'invalid_token', '客户端仅能撤销自身令牌');
  const customerMenu = database("SELECT menu_id FROM sys_menu WHERE perms='crm:customer:list';");
  assert.match(customerMenu, /^[1-9][0-9]*$/);
  database(`DELETE FROM sys_role_menu WHERE tenant_id=100000 AND role_id=${actors.own.roleId} AND menu_id=${customerMenu};`);
  try { denied(await resource(personal.access_token, listPath), 403, 'insufficient_scope', '已经发出的令牌每次访问检查当前业务权限'); }
  finally { database(`INSERT INTO sys_role_menu (tenant_id,role_id,menu_id) VALUES (100000,${actors.own.roleId},${customerMenu});`); }
  const proof = hash(personal.access_token);
  check('缓存丢失前令牌有效', (await resource(personal.access_token)).status === 200);
  const projectionKeys = redis('--scan', '--pattern', `*oauth2_projection_${proof}*`).split(/\r?\n/).filter(Boolean);
  check('第三方会话使用独立带哈希的缓存投影', projectionKeys.length > 0 && projectionKeys.every(key => key.includes(`oauth2_projection_${proof}`)));
  for (const key of projectionKeys) redis('DEL', key);
  check('仅清理本次令牌投影后从数据库恢复访问', (await resource(personal.access_token)).status === 200);
  await revoke(business, personal.access_token);
  for (const key of redis('--scan', '--pattern', `*oauth2_projection_${proof}*`).split(/\r?\n/).filter(Boolean)) redis('DEL', key);
  denied(await resource(personal.access_token), 401, 'invalid_token', '撤销的令牌在缓存丢失后仍不能恢复');
  evidence.redisRecovery = true;
  evidence.currentPermissions = true;
  evidence.clientCredentials = true;
  evidence.tenants = true;
  const formKey = `h5o_${caseTag}`;
  const form = successful(await api(admin, '/workflow/wf/form/save', { method: 'POST', body: { formKey,
    formName: prefix, fieldsJson: JSON.stringify([{ id: 'publicNote', type: 'TEXT', label: '可见说明' }, { id: 'internalNote', type: 'TEXT', label: '内部说明' }]) } }), '创建真实字段权限测试表单');
  workflow.formId = form.formId || form.id;
  const graph = { nodes: [{ id: 'start', type: 'START', title: '发起' }, { id: 'review', type: 'APPROVAL', title: '复核',
    approverType: 'USER', approverValue: actors.peer.userId }, { id: 'end', type: 'END', title: '结束' }],
    edges: [{ source: 'start', target: 'review' }, { source: 'review', target: 'end' }] };
  const definition = successful(await api(admin, '/workflow/wf/definition/save', { method: 'POST', body: { processKey: formKey,
    processName: prefix, formId: workflow.formId, modelJson: JSON.stringify(graph), startPermissionType: 'ALL', startPermissionValue: '[]' } }), '创建真实授权范围测试流程');
  workflow.definitionId = definition.definitionId || definition.id;
  successful(await api(admin, `/workflow/wf/definition/${workflow.definitionId}/field-permissions`, { method: 'PUT', body: [
    { nodeKey: 'review', fieldId: 'publicNote', visibleFlag: true, editableFlag: false, requiredFlag: false },
    { nodeKey: 'review', fieldId: 'internalNote', visibleFlag: false, editableFlag: false, requiredFlag: false },
  ] }), '配置复核人的逐字段只读可见权限');
  successful(await api(admin, `/workflow/wf/definition/deploy/${workflow.definitionId}`, { method: 'POST' }), '发布真实测试流程');
  const started = successful(await api(actors.own.page, '/workflow/wf/start', { method: 'POST', body: { processDefKey: formKey,
    businessKey: formKey, variables: { publicNote: 'visible-business-value', internalNote: `hidden-${caseTag}` } } }), '通过真实引擎发起字段投影测试流程');
  workflow.instanceId = started.instanceId || started.processInstanceId;
  assert.equal(typeof workflow.instanceId, 'string');
  const until = Date.now() + 20000;
  let assigned = '';
  while (Date.now() < until) {
    assigned = database(`SELECT assignee FROM wf_task WHERE tenant_id=100000 AND instance_id=${literal(workflow.instanceId)} AND status='TODO';`);
    if (assigned === actors.peer.userId) break;
    await pause(200);
  }
  check('真实引擎生成指定复核人任务', assigned === actors.peer.userId);
  const peerToken = rememberTokens(await redeem(await issued(actors.peer.page, business, ['workflow.instance.read'])), '复核人同意流程只读授权');
  const projected = await resource(peerToken.access_token, `/oauth2/api/workflow/instance/${workflow.instanceId}`);
  check('OAuth流程读取复用原字段权限且不返回原始variables', projected.status === 200 && projected.body?.formState === 'DECLARED'
    && projected.body.formFields.publicNote === 'visible-business-value' && !Object.hasOwn(projected.body.formFields, 'internalNote')
    && !Object.hasOwn(projected.body, 'variables') && !JSON.stringify(projected.body).includes(`hidden-${caseTag}`));
  const unrelated = actors.person('unrelated', actors.own.roleId);
  unrelated.page = await context.login(unrelated.username, unrelated.source);
  const unrelatedToken = rememberTokens(await redeem(await issued(unrelated.page, business, ['workflow.instance.read'])), '无流程关系员工真实授权');
  denied(await resource(unrelatedToken.access_token, `/oauth2/api/workflow/instance/${workflow.instanceId}`), 403, 'insufficient_scope', '拥有流程只读范围仍不能看无业务关系的流程');
  const crmService = state.services.find(service => service.name === 'crm');
  const direct = await fetch(`http://127.0.0.1:${crmService.port}/inner/crm/oauth2/customer`, { method: 'POST', headers: { 'Content-Type': 'application/json',
    Authorization: `Bearer ${peerToken.access_token}`, 'X-Inner-Call': 'true', 'X-From-Service': 'cloudflow-auth', 'X-Tenant-Id': '100000' },
    body: JSON.stringify({ tokenHash: hash(peerToken.access_token), customerId: own.customerId }), signal: AbortSignal.timeout(15000) });
  check('直连模块并伪造内部来源不能跳过服务认证', direct.status === 403 || direct.status === 401);
  evidence.scope = true;
  evidence.workflowProjection = true;
}
