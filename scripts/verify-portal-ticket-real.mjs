import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { ownedGatewayRedis } from './owned-gateway-redis.mjs';
import { verifyPortalTicketInterface } from './verify-portal-ticket-ui.mjs';
import { scanOwnedAccessLogs } from './portal-checks/scan-access-logs.mjs';
import { verifyPortalTicketCapacity } from './verify-portal-ticket-capacity.mjs';

export async function verifyPortalTickets(context) {
  const { admin, employee, api, successful, session, database, check, directory, caseTag, state, browser, origin,
    token, portalUserId, portalCall, tenantCode, first, password, secrets, sql, waitFor, minute, denied, evidence, requests } = context;
  const prefix = `H3_TICKET_${caseTag}`;
  const redis = await ownedGatewayRedis(state);
  const actors = new Map([[token, portalUserId]]);
  const client = await browser.newContext({ ignoreHTTPSErrors: true, serviceWorkers: 'block' });
  const current = id => JSON.parse(database(`SELECT JSON_OBJECT('ticketId',ticket_id,'version',version,'ownerId',owner_id,'status',status,
    'customerId',customer_id,'portalContactId',portal_contact_id,'title',ticket_title,'description',description,'internalSolution',solution,
    'portalSolution',portal_solution,'portalSolutionTime',portal_solution_time,'firstResponseTime',first_response_time,'deleted',deleted)
    FROM crm_service_ticket WHERE tenant_id=100000 AND ticket_id=${id};`));
  const count = () => Number(database(`SELECT COUNT(*) FROM crm_service_ticket WHERE tenant_id=100000 AND ticket_title LIKE ${sql(prefix + '%')};`));
  const reserve = async supplied => {
    const id = actors.get(supplied);
    if (id && (Number(redis('GET', `cloudflow:portal:rate:file:100000:${id}`)) >= 15
      || Number(redis('GET', `cloudflow:portal:rate:user:100000:${id}`)) >= 52)) await minute();
  };
  const call = async (route, options = {}) => {
    const supplied = options.token === undefined ? token : options.token;
    if (options.waitForCapacity !== false) await reserve(supplied);
    const send = () => client.request.fetch(`${origin}/api${route}`, {
      method: options.method || (options.body === undefined && !options.multipart ? 'GET' : 'POST'),
      headers: { Origin: origin, ...(supplied ? { 'portal-token': supplied } : {}), ...options.headers },
      ...(options.body === undefined ? {} : { data: options.body }), ...(options.multipart ? { multipart: options.multipart } : {}),
      timeout: 30000, maxRedirects: 0,
    });
    let response = await send();
    if (response.status() === 429 && options.waitForCapacity !== false) { await minute(); response = await send(); }
    const result = { status: response.status(), headers: response.headers() };
    if (result.headers['content-type']?.includes('json')) result.body = await response.json();
    else { const bytes = await response.body(); result.size = bytes.length; result.sha256 = createHash('sha256').update(bytes).digest('hex'); }
    requests.push({ path: new URL(route, origin).pathname, method: options.method || (options.body === undefined && !options.multipart ? 'GET' : 'POST'), status: result.status, code: result.body?.code, source: 'portal-ticket-https' });
    return result;
  };
  const request = (suffix, fileIds = []) => ({ requestKey: randomUUID(), title: `${prefix}_${suffix}`, description: `客户原始问题 ${caseTag}\n保留原始内容`, fileIds });
  const create = async (suffix, fileIds = [], supplied = token) => {
    const input = request(suffix, fileIds);
    const ticket = successful(await call('/portal/crm/ticket', { body: input, token: supplied }), '真实客户提交工单');
    return { input, ticket };
  };
  const upload = async (suffix, supplied = token) => {
    const requestKey = randomUUID(); const name = `${prefix}_${suffix}.txt`; const bytes = Buffer.from(`PORTAL_TICKET_BYTES_${suffix}_${caseTag}\r\n`, 'utf8');
    const multipart = { requestKey, file: { name, mimeType: 'text/plain', buffer: bytes } };
    const file = successful(await call('/portal/file/upload', { multipart, token: supplied }), '真实客户上传私有附件');
    check('上传只返回文件编号、名称、字节数及扩展名', Object.keys(file).sort().join(',') === 'extension,fileId,fileName,fileSize'
      && file.fileName === name && file.fileSize === bytes.length && file.extension === 'txt');
    return { ...file, requestKey, multipart, bytes, sha256: createHash('sha256').update(bytes).digest('hex') };
  };
  const access = async (fileId, ticketId, supplied = token) => {
    const result = successful(await call('/portal/file/access', { token: supplied, body: { resourceType: ticketId ? 'TICKET' : 'UPLOAD', ...(ticketId ? { ticketId } : {}), fileId } }), '真实申请工单附件下载凭据');
    check('工单下载凭据为独立60秒随机值', /^tf_[A-Za-z0-9_-]{43}$/.test(result.downloadTicket) && result.expiresIn === 60
      && Object.keys(result).sort().join(',') === 'downloadTicket,expiresIn');
    secrets.push(result.downloadTicket);
    const key = `cloudflow:portal:ticket-file:${createHash('sha256').update(result.downloadTicket).digest('hex')}`;
    const stored = redis('GET', key); const ticket = JSON.parse(stored); const lifetime = Number(redis('TTL', key));
    check('工单下载缓存只保存凭据与会话摘要，受众和60秒期限正确', ticket.audience === 'PORTAL_TICKET_DOWNLOAD'
      && ticket.sessionDigest === createHash('sha256').update(supplied).digest('hex')
      && !stored.includes(result.downloadTicket) && !stored.includes(supplied) && lifetime > 0 && lifetime <= 60
      && redis('EXISTS', `cloudflow:portal:ticket-file:${result.downloadTicket}`) === '0');
    return result.downloadTicket;
  };
  const download = (downloadTicket, supplied = token) => call('/portal/file/download', { body: { downloadTicket }, token: supplied, waitForCapacity: false });
  const detail = async (id, supplied = token) => successful(await call(`/portal/crm/ticket/${id}`, { token: supplied }), '真实读取客户工单');
  const view = async (id, page = admin) => successful(await api(page, `/crm/ticket/${id}/portal-management`), '真实读取内部门户处理视图');
  const assign = (id, ownerId, page = admin) => api(page, `/crm/ticket/${id}/assign`, { method: 'POST', body: { version: current(id).version, ownerId } });
  const publish = (id, solution, page) => api(page, `/crm/ticket/${id}/portal-solution`, { method: 'PUT', body: { version: current(id).version, publish: solution != null, ...(solution == null ? {} : { solution }) } });
  const outsideScope = (result, label) => {
    denied(result, 400, label);
    check(`${label}返回精确的不可见提示且不含工单数据`, result.body.msg === '工单不存在或无权访问' && result.body.data == null);
  };
  const register = async business => {
    const invited = await context.invite(business);
    const activationToken = context.activation(await context.message(business));
    successful(await portalCall(`/portal/${tenantCode}/activate`, { activationToken, password }), '真实邀请激活工单客户');
    const supplied = await context.login(business); actors.set(supplied, invited.portalUserId);
    return supplied;
  };
  const operator = async (username, roleId) => {
    assert.ok(username === 'g_portal_ticket_sales' && roleId === 9 || username === 'g_portal_ticket_support' && roleId === 11);
    const existing = database(`SELECT create_by FROM sys_user WHERE tenant_id=100000 AND user_name=${sql(username)};`);
    assert.ok(!existing || existing === 'isolated-portal-ticket-fixture');
    if (!existing) {
      database(`INSERT INTO sys_user(tenant_id,dept_id,user_name,nick_name,password,status,deleted,pwd_reset_required,create_by)
        SELECT 100000,101,${sql(username)},${sql(username)},password,'0',0,'0','isolated-portal-ticket-fixture'
        FROM sys_user WHERE tenant_id=100000 AND user_name='g_import_admin';
        INSERT INTO sys_user_role(user_id,role_id,tenant_id) SELECT user_id,${roleId},100000 FROM sys_user WHERE tenant_id=100000 AND user_name=${sql(username)};`);
    }
    const id = Number(database(`SELECT user_id FROM sys_user WHERE tenant_id=100000 AND user_name=${sql(username)} AND status='0' AND deleted=0;`));
    assert.ok(Number.isSafeInteger(id) && id >= 990000000);
    check(`${username}只持有批准角色${roleId}`, database(`SELECT GROUP_CONCAT(role_id ORDER BY role_id) FROM sys_user_role WHERE tenant_id=100000 AND user_id=${id};`) === String(roleId));
    redis('DEL', `100000:user_details::100000:${username}`, `100000:user_menus::${id}`, `100000:menu_details::${roleId}`, `100000:menu_details::perms:${roleId}`);
    return { id, page: await session(username, 'g_import_admin'), name: username };
  };
  try {
    const preflight = await call('/portal/file/1', { method: 'OPTIONS', token: null,
      headers: { 'Access-Control-Request-Method': 'DELETE', 'Access-Control-Request-Headers': 'portal-token' } });
    check('真实入口允许门户来源的附件删除预检且不允许Cookie凭据', preflight.status === 200
      && preflight.headers['access-control-allow-origin'] === origin
      && preflight.headers['access-control-allow-methods'].split(',').map(method => method.trim()).includes('DELETE')
      && preflight.headers['access-control-allow-credentials'] !== 'true');
    denied(await call('/portal/file/1', { method: 'OPTIONS', token: null, headers: { Origin: 'https://foreign.example.test',
      'Access-Control-Request-Method': 'DELETE', 'Access-Control-Request-Headers': 'portal-token' } }), 403, '外部来源不能通过附件删除预检');
    check('业务租户100000工单发布1914位于1900—1949且精确授予1/8/9/11', database("SELECT CONCAT(menu.parent_id,':',menu.perms,':',GROUP_CONCAT(CONCAT(grants.tenant_id,'/',grants.role_id) ORDER BY grants.tenant_id,grants.role_id)) FROM sys_menu menu JOIN sys_role_menu grants ON grants.menu_id=menu.menu_id WHERE menu.menu_id=1914 AND grants.tenant_id=100000 GROUP BY menu.parent_id,menu.perms;") === '805:crm:portal:solution:publish:100000/1,100000/8,100000/9,100000/11');
    check('员工没有任何H3新增权限', database('SELECT COUNT(*) FROM sys_role_menu WHERE role_id=5 AND menu_id BETWEEN 1900 AND 1949;') === '0');
    const sales = await operator('g_portal_ticket_sales', 9); const support = await operator('g_portal_ticket_support', 11);
    check('客服与销售代表保持真实仅本人数据范围', database('SELECT GROUP_CONCAT(CONCAT(role_id,\':\',ds_type) ORDER BY role_id) FROM sys_role WHERE tenant_id=100000 AND role_id IN (9,11);') === '9:4,11:4');
    const colleague = { ...first, account: `ticket.same.${caseTag}`, email: `ticket-same-${caseTag}@example.test`, name: `${prefix}_同公司联系人` };
    successful(await api(admin, '/crm/contact', { method: 'POST', body: { customerId: first.customerId, contactName: colleague.name, email: colleague.email, status: 'ACTIVE' } }), '真实新增同公司联系人');
    colleague.contactId = Number(database(`SELECT contact_id FROM crm_contact WHERE tenant_id=100000 AND customer_id=${first.customerId} AND contact_name=${sql(colleague.name)} AND deleted=0;`));
    const colleagueToken = await register(colleague); const foreign = await context.createBusiness('ticket-foreign'); const foreignToken = await register(foreign);
    if (process.argv.includes('--portal-ticket-capacity')) await verifyPortalTicketCapacity({ ...context, call, access, download });
    const firstFile = await upload('main'); const otherFile = await upload('colleague', colleagueToken);
    check('同一上传标识同一字节重试返回原文件', successful(await call('/portal/file/upload', { multipart: firstFile.multipart }), '重试真实上传').fileId === firstFile.fileId);
    denied(await call('/portal/file/upload', { multipart: { ...firstFile.multipart, file: { ...firstFile.multipart.file, buffer: Buffer.from('changed') } } }), 409, '同一上传标识不能改写文件');
    check('上传只读核对找到原文件', successful(await call(`/portal/file/upload/${firstFile.requestKey}`), '核对真实附件').fileId === firstFile.fileId);
    denied(await call(`/portal/file/upload/${firstFile.requestKey}`, { token: colleagueToken }), 404, '同公司其他联系人不能核对私人暂存文件');
    denied(await call('/portal/file/access', { body: { resourceType: 'UPLOAD', fileId: firstFile.fileId }, token: colleagueToken }), 404, '同公司其他联系人不能下载私人暂存文件');
    denied(await call(`/portal/file/${firstFile.fileId}`, { method: 'DELETE', token: colleagueToken }), 404, '同公司其他联系人不能移除私人暂存文件');
    denied(await api(admin, `/auth/system/file/${firstFile.fileId}/content`), 403, '内部通用文件入口不能读取客户暂存文件');
    const temporaryGrant = await access(firstFile.fileId); const temporaryBytes = await download(temporaryGrant);
    check('暂存文件HTTPS下载字节一致且强制安全响应头', temporaryBytes.status === 200 && temporaryBytes.sha256 === firstFile.sha256
      && temporaryBytes.size === firstFile.fileSize && !temporaryBytes.headers.location && temporaryBytes.headers['cache-control'].includes('no-store')
      && temporaryBytes.headers['content-type'].startsWith('application/octet-stream') && temporaryBytes.headers['content-disposition'].startsWith('attachment;')
      && temporaryBytes.headers['x-content-type-options'] === 'nosniff' && temporaryBytes.headers['content-security-policy'].includes('sandbox'));
    denied(await download(temporaryGrant), 404, '工单文件单次凭据不能重放');
    const beforeInvalid = count();
    denied(await call('/portal/crm/ticket', { body: request('invalid-bind', [firstFile.fileId, otherFile.fileId]) }), 409, '混入他人的暂存附件时拒绝全部提交');
    check('非法附件整笔回滚，不遗留工单或部分绑定', count() === beforeInvalid && database(`SELECT biz_type FROM sys_file WHERE file_id=${firstFile.fileId};`) === 'PORTAL_TICKET_UPLOAD');
    const created = await create('main', [firstFile.fileId]); const id = created.ticket.ticketId; const initial = current(id);
    check('客户新单进入待分派且归属完全由服务端确定', created.ticket.status === 'PENDING_ASSIGNMENT' && initial.ownerId == null
      && initial.portalContactId === first.contactId && initial.customerId === first.customerId && initial.firstResponseTime == null);
    check('新单已计算响应与解决截止，附件只随提交绑定', Boolean(created.ticket.firstResponseDue && created.ticket.resolutionDue)
      && created.ticket.attachments[0].fileId === firstFile.fileId && database(`SELECT biz_type FROM sys_file WHERE file_id=${firstFile.fileId};`) === 'CRM_PORTAL_TICKET');
    check('同标识同内容提交返回同一工单', successful(await call('/portal/crm/ticket', { body: created.input }), '真实提交重试').ticketId === id);
    denied(await call('/portal/crm/ticket', { body: { ...created.input, description: '改写原请求' } }), 409, '同一请求标识不能换业务内容');
    check('提交结果可以只读核对', successful(await call(`/portal/crm/ticket/submission/${created.input.requestKey}`), '核对原提交').ticketId === id);
    denied(await call(`/portal/crm/ticket/submission/${created.input.requestKey}`, { token: colleagueToken }), 404, '其他联系人不能借请求标识查询私有提交');
    check('绑定后同公司联系人可查看工单与附件', (await detail(id, colleagueToken)).attachments[0].fileId === firstFile.fileId
      && (await download(await access(firstFile.fileId, id, colleagueToken), colleagueToken)).sha256 === firstFile.sha256);
    denied(await call(`/portal/crm/ticket/${id}`, { token: foreignToken }), 404, '其他公司不能读取客户工单');
    denied(await call('/portal/file/access', { token: foreignToken, body: { resourceType: 'TICKET', ticketId: id, fileId: firstFile.fileId } }), 404, '其他公司不能读取客户工单附件');
    check('跨公司列表及总数严格隔离', successful(await call(`/portal/crm/ticket/list?keyword=${prefix}`, { token: foreignToken }), '跨公司查询').total === 0);
    denied(await call('/portal/file/access', { body: { resourceType: 'UPLOAD', fileId: firstFile.fileId } }), 404, '已绑定文件不能绕回暂存入口');
    denied(await call(`/portal/file/${firstFile.fileId}`, { method: 'DELETE' }), 404, '已绑定文件不能通过暂存删除入口移除');
    for (const field of [{ tenantId: 100001 }, { customerId: foreign.customerId }, { ownerId: sales.id }, { portalContactId: colleague.contactId }, { status: 'CLOSED' }, { solution: '未经发布' }, { portalSolution: '伪造发布' }]) {
      denied(await call('/portal/crm/ticket', { body: { ...request('injected'), ...field } }), 400, '客户提交拒绝伪造归属与内部处理字段');
    }
    denied(await call(`/portal/crm/ticket/${id}?customerId=${foreign.customerId}`), 400, '工单读取拒绝越界查询条件');
    const safe = JSON.stringify(await detail(id));
    check('门户工单仅返回业务白名单，不含内部身份或存储字段', ['tenantId','customerId','ownerId','portalContactId','createBy','attachmentUrl','portalOwnerId','filePath'].every(field => !safe.includes(`"${field}"`)));
    evidence.submission = true;
    for (const page of [employee, sales.page]) {
      denied(await assign(id, sales.id, page), 403, '员工及销售代表不能分派工单');
      denied(await api(page, `/crm/ticket/${id}/handlers`), 403, '非分派角色不能读取接手人候选');
    }
    denied(await api(admin, `/crm/ticket/${id}/respond`, { method: 'POST' }), 409, '待分派工单不能提前登记响应');
    const handlers = successful(await api(admin, `/crm/ticket/${id}/handlers?keyword=g_portal_ticket&pageSize=100`), '真实查询接手人候选');
    check('无HR档案的有效CRM用户可作为接手人，员工不被加入', handlers.rows.some(handler => handler.userId === sales.id)
      && handlers.rows.some(handler => handler.userId === support.id) && handlers.rows.every(handler => handler.name.startsWith('g_portal_ticket_')));
    successful(await assign(id, sales.id), '管理员真实分派工单');
    check('分派只改变当前负责人，不伪造首次响应', current(id).ownerId === sales.id && current(id).firstResponseTime == null);
    denied(await api(admin, `/crm/ticket/${id}/assign`, { method: 'POST', body: { version: initial.version, ownerId: support.id } }), 409, '旧版本不能覆盖已完成分派');
    denied(await publish(id, '管理员不得代发其他负责人的方案', admin), 403, '管理员持有发布权限仍须是当前接手人');
    check('当前接手人可独立读取指定工单', (await view(id, sales.page)).canPublish);
    const scoped = successful(await api(sales.page, `/crm/ticket/list?ticketTitle=${prefix}&pageNum=1&pageSize=100`), '真实SQL核对接手人工单范围');
    check('接手人列表与总数只包含获分派工单', scoped.total === 1 && scoped.rows[0].ticketId === id);
    check('对照账号可读取同一真实客户档案', successful(await api(admin, `/crm/customer/${first.customerId}`), '管理员读取客户对照').customerId === first.customerId);
    const hiddenCustomer = await api(sales.page, `/crm/customer/${first.customerId}`);
    check(`分派不扩张客户详情权限，沿用既有不可见响应 HTTP=${hiddenCustomer.status} code=${hiddenCustomer.body?.code}`,
      hiddenCustomer.status === 200 && hiddenCustomer.body?.code === 500 && hiddenCustomer.body.msg === '客户不存在' && hiddenCustomer.body.data == null);
    const hiddenCustomers = successful(await api(sales.page, `/crm/customer/list?${new URLSearchParams({ customerName: first.name, pageNum: '1', pageSize: '100' })}`), '核对接手人的客户列表隔离');
    check('获分派工单不扩张客户列表及分页总数', hiddenCustomers.total === 0 && hiddenCustomers.rows.length === 0);
    const internalNote = `PRIVATE_TICKET_NOTE_${caseTag}`;
    successful(await api(sales.page, '/crm/ticket', { method: 'PUT', body: { ticketId: id, version: current(id).version, solution: internalNote } }), '接手人真实保存内部意见');
    check('内部意见不被自动公开给客户', (await detail(id)).solution == null && !JSON.stringify(await detail(id)).includes(internalNote));
    const publication = { version: current(id).version, publish: true, solution: `PUBLIC_TICKET_SOLUTION_${caseTag}` };
    successful(await api(sales.page, `/crm/ticket/${id}/portal-solution`, { method: 'PUT', body: publication }), '当前接手人明确发布方案');
    check('发布对同公司客户生效，内部意见保持原样且不自动解决', (await detail(id, colleagueToken)).solution === publication.solution
      && current(id).internalSolution === internalNote && current(id).status === 'OPEN' && current(id).firstResponseTime != null);
    denied(await api(sales.page, `/crm/ticket/${id}/portal-solution`, { method: 'PUT', body: { ...publication, solution: '旧版本变更' } }), 409, '过期方案版本不能覆盖发布');
    successful(await publish(id, null, sales.page), '当前接手人真实撤回对外方案');
    check('撤回立即清空客户方案和发布时间并保留内部意见', (await detail(id)).solution == null && current(id).portalSolutionTime == null && current(id).internalSolution === internalNote);
    const beforeDeniedAssignment = current(id);
    outsideScope(await assign(id, support.id, support.page), '客服不能重新分派范围外的工单');
    outsideScope(await api(support.page, `/crm/ticket/${id}/handlers`), '客服不能读取范围外工单的候选人');
    outsideScope(await api(support.page, `/crm/ticket/${id}/portal-management`), '客服不能读取范围外工单的处理视图');
    const outsideTickets = successful(await api(support.page, `/crm/ticket/list?ticketTitle=${prefix}&pageNum=1&pageSize=100`), '核对客服范围外工单列表');
    check('范围外分派被拒后负责人及版本不变，列表和总数均不泄漏', current(id).ownerId === beforeDeniedAssignment.ownerId
      && current(id).version === beforeDeniedAssignment.version && outsideTickets.total === 0 && outsideTickets.rows.length === 0);
    const supportedBusiness = await context.createBusiness('ticket-support', { ownerId: support.id, deptId: 101 });
    const supportedToken = await register(supportedBusiness);
    const supportedInput = { ...request('support-scope'), title: `H3_TICKET_SCOPE_${caseTag}` };
    const supportedTicket = successful(await call('/portal/crm/ticket', { token: supportedToken, body: supportedInput }), '客服本人客户真实提交待分派工单');
    check('范围内对照客户通过真实CRM创建并归属客服本人', database(`SELECT owner_id FROM crm_customer WHERE tenant_id=100000 AND customer_id=${supportedBusiness.customerId};`) === String(support.id));
    const queue = successful(await api(support.page, `/crm/ticket/list?ticketTitle=${supportedInput.title}&portalQueue=true&pageNum=1&pageSize=100`), '客服读取本人客户待分派队列');
    check('客服待分派队列与详情使用同一范围', queue.total === 1 && queue.rows[0].ticketId === supportedTicket.ticketId
      && (await view(supportedTicket.ticketId, support.page)).canAssign);
    successful(await assign(supportedTicket.ticketId, sales.id, support.page), '客服可真实初次分派范围内工单');
    successful(await assign(supportedTicket.ticketId, support.id, support.page), '客服可真实重新分派本人客户工单');
    check('客服完成范围内分派且角色数据范围没有改变', current(supportedTicket.ticketId).ownerId === support.id
      && database('SELECT ds_type FROM sys_role WHERE tenant_id=100000 AND role_id=11;') === '4');
    successful(await assign(id, support.id), '管理员将原工单真实重新分派给客服');
    outsideScope(await publish(id, '旧接手人不得继续发布', sales.page), '重分派后旧接手人不能发布范围外工单');
    successful(await publish(id, publication.solution, support.page), '新接手人可以重新发布');
    check('内部有工单范围的人员通过专用入口下载原始字节', (await api(support.page, `/crm/ticket/${id}/portal-files/${firstFile.fileId}/content`)).sha256 === firstFile.sha256);
    denied(await api(employee, `/crm/ticket/${id}/portal-files/${firstFile.fileId}/content`), 403, '员工不能下载内部客户附件');
    evidence.assignment = true; evidence.publication = true; evidence.permissions = true;
    const repeatInput = request('concurrent'); const beforeRepeat = count();
    const repeated = await Promise.all(Array.from({ length: 3 }, () => call('/portal/crm/ticket', { body: repeatInput })));
    check('三个真实相同提交只产生一张工单并返回同一编号', repeated.every(result => result.status === 200 && result.body?.code === 200)
      && new Set(repeated.map(result => result.body.data.ticketId)).size === 1 && count() === beforeRepeat + 1);
    const bindingFile = await upload('binding-race'); const beforeBind = count();
    const binding = await Promise.all(['bind-left','bind-right'].map(suffix => call('/portal/crm/ticket', { body: request(suffix, [bindingFile.fileId]) })));
    check('真实附件竞争只允许一次绑定，另一笔完整回滚', binding.filter(result => result.status === 200).length === 1 && binding.filter(result => result.status === 409).length === 1 && count() === beforeBind + 1);
    const version = current(id).version;
    const publications = await Promise.all(['LEFT','RIGHT'].map(suffix => api(support.page, `/crm/ticket/${id}/portal-solution`, { method: 'PUT', body: { version, publish: true, solution: `${prefix}_${suffix}` } })));
    check('两个真实同版本发布只保存一个', publications.filter(result => result.status === 200).length === 1 && publications.filter(result => result.status === 409).length === 1);
    const raceGrant = await access(firstFile.fileId, id);
    const downloads = await Promise.all(Array.from({ length: 3 }, () => download(raceGrant)));
    check('真实Redis三个下载竞争只返回一次文件字节', downloads.filter(result => result.status === 200 && result.sha256 === firstFile.sha256).length === 1 && downloads.filter(result => result.status === 404).length === 2);
    const secondToken = await context.login(first); actors.set(secondToken, portalUserId);
    const sessionGrant = await access(firstFile.fileId, id);
    denied(await download(sessionGrant, secondToken), 404, '同一账号的其他会话不能使用下载凭据');
    check('错配会话不消费原会话凭据', (await download(sessionGrant)).sha256 === firstFile.sha256);
    const wrongAudience = await access(firstFile.fileId, id);
    denied(await download(wrongAudience.replace(/^tf_/, 'kf_')), 404, '工单凭据不能变换为知识库受众');
    const revoked = await access(firstFile.fileId, id); const expiry = await access(firstFile.fileId, id);
    database(`UPDATE crm_service_ticket SET deleted=1 WHERE tenant_id=100000 AND ticket_id=${id} AND ticket_title=${sql(created.input.title)};`);
    try { denied(await download(revoked), 404, '工单删除立即阻断已发下载凭据'); denied(await call(`/portal/crm/ticket/${id}`), 404, '工单删除同时阻断详情'); }
    finally { database(`UPDATE crm_service_ticket SET deleted=0 WHERE tenant_id=100000 AND ticket_id=${id} AND ticket_title=${sql(created.input.title)};`); }
    const changedFile = await access(firstFile.fileId, id);
    database(`UPDATE sys_file SET deleted=1 WHERE tenant_id=100000 AND file_id=${firstFile.fileId} AND portal_owner_id=${portalUserId};`);
    try { denied(await download(changedFile), 404, '文件删除立即阻断已发凭据'); check('已删除文件从客户附件清单消失', (await detail(id)).attachments.length === 0); }
    finally { database(`UPDATE sys_file SET deleted=0 WHERE tenant_id=100000 AND file_id=${firstFile.fileId} AND portal_owner_id=${portalUserId};`); }
    database(`UPDATE crm_service_ticket SET tenant_id=100001 WHERE tenant_id=100000 AND ticket_id=${id} AND ticket_title=${sql(created.input.title)};`);
    try { denied(await call(`/portal/crm/ticket/${id}`), 404, '异租户工单不能按原编号读取'); }
    finally { database(`UPDATE crm_service_ticket SET tenant_id=100000 WHERE tenant_id=100001 AND ticket_id=${id} AND ticket_title=${sql(created.input.title)};`); }
    await minute(); denied(await download(expiry), 404, '超过60秒后真实下载凭据过期');
    successful(await call(`/portal/file/${otherFile.fileId}`, { method: 'DELETE', token: colleagueToken }), '上传者移除自己的未提交文件');
    denied(await call(`/portal/file/upload/${otherFile.requestKey}`, { token: colleagueToken }), 404, '已移除暂存文件不可重新读取');
    evidence.files = true; evidence.concurrency = true;
    for (let index = 0; index < 10; index++) await create(`page-${index}`);
    const pageOne = successful(await call(`/portal/crm/ticket/list?keyword=${prefix}&pageNum=1&pageSize=10`), '真实工单第一页');
    const pageTwo = successful(await call(`/portal/crm/ticket/list?keyword=${prefix}&pageNum=2&pageSize=10`), '真实工单第二页');
    check('工单在数据库分页且跨页不重复', pageOne.total === count() && pageTwo.total === pageOne.total && pageOne.rows.length === 10 && pageTwo.rows.length > 0
      && pageOne.rows.every(left => pageTwo.rows.every(right => left.ticketId !== right.ticketId)));
    await verifyPortalTicketInterface({ ...context, prefix, created, firstFile, current, support, sales, call, create, assign, publish, reserve, actors });
    const disabledGrant = await access(firstFile.fileId, id, colleagueToken);
    await context.action(colleague.account, 'disable');
    denied(await download(disabledGrant, colleagueToken), 401, '真实停用账号立即拒绝停用前已发工单下载凭据');
    denied(await call(`/portal/crm/ticket/${id}`, { token: colleagueToken }), 401, '停用账号不能继续读取同公司工单');
    denied(await call('/portal/file/upload', { token: colleagueToken, multipart: otherFile.multipart }), 401, '停用账号不能重放原上传请求');
    check('停用同公司其他账号不影响仍有效账号读取工单', (await detail(id)).ticketId === id);
    const auditCount = await waitFor(() => Number(database(`SELECT COUNT(*) FROM sys_audit_log WHERE tenant_id=100000 AND audit_field=${sql(id)} AND audit_name IN ('PORTAL_TICKET_CREATED','PORTAL_TICKET_ASSIGNED','PORTAL_TICKET_SOLUTION_PUBLISHED','PORTAL_TICKET_SOLUTION_WITHDRAWN');`)), amount => amount >= 7, '门户工单业务审计未落库');
    check('提交、分派、发布与撤回均写入真实审计', auditCount >= 7);
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
    for (const filename of files) { const content = await fs.readFile(filename); bytes += content.length; const text = content.toString('utf8'); leaks += sensitive.filter(value => text.includes(value)).length; }
    const databaseScan = await scanOwnedAccessLogs(state, sensitive);
    check('工单运行及数据库访问日志没有明文密码、会话或下载凭据', files.length > 0 && leaks === 0 && databaseScan.leaks === 0);
    console.log(`H3_PORTAL_TICKET_LOG_SCAN: files=${files.length}; bytes=${bytes}; sensitive_values=${sensitive.length}; leaks=${leaks}; database_logs_checked=true; database_bytes=${databaseScan.bytes}; database_leaks=${databaseScan.leaks}; production_modified=false`);
    console.log(`H3_PORTAL_TICKET_PROTOCOL: byte_comparison=true; concurrent_submissions=3; concurrent_downloads=3; account_customer_tenant_isolation=true; audit_rows=${auditCount}; api_doubles=0; production_modified=false`);
  } finally { await client.close(); }
}
