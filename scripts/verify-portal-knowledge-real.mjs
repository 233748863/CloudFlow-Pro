import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { ownedGatewayRedis } from './owned-gateway-redis.mjs';
import { verifyPortalKnowledgeFiles } from './verify-portal-knowledge-files-real.mjs';

export async function verifyPortalKnowledge(context) {
  const { admin, employee, sales, api, successful, session, database, check, directory, caseTag, state, browser, origin,
    token, portalUserId, portalCall, tenantCode, first, password, secrets, sql, waitFor, minute, denied, evidence } = context;
  const rows = statement => database(statement).split('\n').filter(Boolean).map(value => JSON.parse(value));
  const actorId = Number(database("SELECT user_id FROM sys_user WHERE tenant_id=100000 AND user_name='g_import_admin';"));
  const prefix = `H3_KNOWLEDGE_${caseTag}`;
  const publicBody = `PUBLIC_BODY_${caseTag}`;
  const secretScript = `PRIVATE_SCRIPT_${caseTag}`;
  const secretLink = `PRIVATE_LINK_${caseTag}`;
  const secretSummary = `PRIVATE_SUMMARY_${caseTag}`;
  const workBody = `WORKING_COPY_${caseTag}`;
  const sourceContent = `<h2>使用说明</h2><p>${publicBody}</p><script>${secretScript}</script><img src="https://example.test/${secretLink}" onerror="alert(1)"><a href="https://example.test/${secretLink}">链接说明</a><p onclick="alert(2)">正文结束</p><!--${secretScript}-->`;
  const current = id => rows(`SELECT JSON_OBJECT('id',document_id,'version',version,'status',status,'visible',external_visible_flag,'externalVersionId',external_version_id,'selectedFiles',external_attachment_file_ids,'title',title,'content',content,'tenant',tenant_id,'owner',submitter_id,'deleted',deleted) FROM oa_knowledge_document WHERE document_id=${id};`)[0];
  const preview = async (id, versionId, page = admin) => successful(await api(page, `/oa/knowledge/${id}/external-preview${versionId ? `?versionId=${versionId}` : ''}`), '读取对外发布状态与指定预览');
  const publishRequest = (record, versionId) => ({ version: current(record.id).version, versionId, attachmentFileIds: [] });
  const publish = async (record, versionId, page = admin, selectedFiles = []) => successful(await api(page, `/oa/knowledge/${record.id}/external-publish`, { method: 'POST', body: { ...publishRequest(record, versionId), attachmentFileIds: selectedFiles } }), '真实发布指定知识版本及所选附件');
  const withdraw = async (record, page = admin) => successful(await api(page, `/oa/knowledge/${record.id}/external-withdraw`, { method: 'POST', body: { version: current(record.id).version } }), '真实撤回对外知识');
  const readPortal = async (route, suppliedToken = token, headers = {}) => {
    let result = await portalCall(`/portal/oa/knowledge${route}`, undefined, suppliedToken, headers);
    if (result.status === 429) { await minute(); result = await portalCall(`/portal/oa/knowledge${route}`, undefined, suppliedToken, headers); }
    return result;
  };
  const list = async keyword => successful(await readPortal(`/list?${new URLSearchParams({ keyword, pageNum: '1', pageSize: '10' })}`), '真实门户知识列表');
  const operationBefore = Number(database('SELECT IFNULL(MAX(log_id),0) FROM sys_log;'));
  const auditBefore = Number(database('SELECT IFNULL(MAX(audit_id),0) FROM sys_audit_log;'));
  const readsBefore = database('SELECT COUNT(*) FROM oa_knowledge_read;');
  const workflowBefore = database("SELECT definition_id,version,status,model_json FROM wf_process_definition WHERE tenant_id=100000 AND process_key='knowledge_publish' AND deleted=0 ORDER BY version;");
  const contexts = [];
  const boundaryDocuments = [];
  const uploaded = [];
  const create = async (suffix, attachmentUrl = `https://example.test/${secretLink}`, page = admin, submitterId = actorId) => {
    const title = `${prefix}_${suffix}`;
    successful(await api(page, '/oa/knowledge', { method: 'POST', body: {
      title, category: '产品知识', summary: secretSummary, content: sourceContent, scopeType: 'ALL', attachmentUrl,
      externalVisibleFlag: 1, externalVersionId: 1, externalAttachmentFileIds: '[1]', tenantId: 100001,
    } }), '真实创建知识草稿并尝试伪造公开与租户字段');
    const id = Number(database(`SELECT document_id FROM oa_knowledge_document WHERE tenant_id=100000 AND title=${sql(title)} AND submitter_id=${submitterId} AND deleted=0;`));
    assert.ok(Number.isSafeInteger(id) && id > 0);
    const record = current(id);
    check('创建始终采用内部可信租户且草稿不会因伪造字段公开', record.tenant === 100000 && record.visible === 0 && record.externalVersionId == null && record.selectedFiles == null);
    return record;
  };
  const approve = async (record, submitterPage = admin) => {
    successful(await api(submitterPage, `/oa/knowledge/submit/${record.id}`, { method: 'POST' }), '真实提交知识发布审批');
    const instance = await waitFor(() => database(`SELECT IFNULL(instance_id,'') FROM oa_knowledge_document WHERE document_id=${record.id};`), Boolean, '知识发布事件没有绑定审批实例', 90000);
    const workflowStatus = () => database(`SELECT status FROM wf_process_instance WHERE tenant_id=100000 AND instance_id=${sql(instance)};`);
    const variables = JSON.parse(database(`SELECT variables FROM wf_process_instance WHERE tenant_id=100000 AND instance_id=${sql(instance)};`));
    check('真实知识审批收到正确标题、分类、可见范围及原始发布说明', variables.documentTitle === record.title
      && variables.categoryName === '产品知识' && variables.publishScope === '全员' && variables.summary === secretSummary);
    for (let step = 0; step < 20 && !['PASSED', 'AUTO_PASSED'].includes(workflowStatus()); step++) {
      const task = await waitFor(() => rows(`SELECT JSON_OBJECT('id',task_id,'assignee',assignee) FROM wf_task WHERE tenant_id=100000 AND instance_id=${sql(instance)} AND status='TODO' ORDER BY task_id LIMIT 1;`)[0], Boolean, '知识审批没有待办节点');
      successful(await api(admin, '/workflow/wf/complete', { method: 'POST', body: { taskId: task.id, action: 'APPROVE', comment: `${prefix}通过已有管理员代办权限验收知识审批` } }), '真实工作流完成知识审批节点');
      check('知识审批保留真实操作人和代办轨迹', Number(database(`SELECT COUNT(*) FROM wf_task_history WHERE tenant_id=100000 AND task_id=${sql(task.id)} AND operator_id=${actorId} AND action IN ('APPROVE','COUNTERSIGN_APPROVE');`)) === 1);
    }
    await waitFor(() => current(record.id).status, value => value === 'PUBLISHED', '知识审批没有回写内部发布状态', 90000);
    const versions = await waitFor(() => preview(record.id), value => value.versions.length > 0, '知识审批没有生成指定版本');
    check('知识审批使用已有定义并真正到达通过终态', ['PASSED', 'AUTO_PASSED'].includes(workflowStatus()));
    evidence.workflow = true;
    return versions.versions[0].id;
  };
  try {
    check('业务租户100000知识发布菜单1915精确授予管理员与行政专员', database('SELECT GROUP_CONCAT(role_id ORDER BY role_id) FROM sys_role_menu WHERE tenant_id=100000 AND menu_id=1915;') === '1,7');
    check('所有租户知识发布授权均关联本租户有效角色且员工没有发布权', database("SELECT COUNT(*) FROM sys_role_menu binding LEFT JOIN sys_role role ON role.role_id=binding.role_id AND role.tenant_id=binding.tenant_id WHERE binding.menu_id=1915 AND (role.role_id IS NULL OR role.deleted<>0 OR role.status<>'0' OR role.role_key='employee');") === '0');
    check('知识发布菜单父级为现有知识库且员工未获写权限', database("SELECT CONCAT(parent.perms,':',(SELECT COUNT(*) FROM sys_role_menu WHERE role_id=5 AND menu_id=1915)) FROM sys_menu menu JOIN sys_menu parent ON parent.menu_id=menu.parent_id WHERE menu.menu_id=1915;") === 'oa:knowledge:list:0');
    for (const suffix of ['public', 'internal', 'other-document']) {
      if (uploaded.length) await new Promise(resolve => setTimeout(resolve, 5100));
      const content = Buffer.from(`H3_KNOWLEDGE_FILE_${suffix}_${caseTag}\r\n`, 'utf8');
      const result = successful(await api(admin, '/auth/system/file/upload', { method: 'POST', file: {
        name: `${prefix}_${suffix}.txt`, content: content.toString('base64'), type: 'text/plain',
      } }), '真实上传知识版本附件');
      uploaded.push({ id: Number(result.fileId), name: result.fileName, url: result.url, size: content.length, sha256: createHash('sha256').update(content).digest('hex') });
    }
    const record = await create('main', `${uploaded[0].url},${uploaded[1].url},https://example.test/${secretLink}`);
    check('未对外发布的草稿不进入客户列表和总数', (await list(prefix)).total === 0);
    denied(await readPortal(`/${record.id}`), 404, '客户不能通过ID读取工作草稿');
    denied(await api(admin, `/oa/knowledge/${record.id}/external-publish`, { method: 'POST', body: publishRequest(record, 1) }), 409, '内部草稿不能直接对外发布');
    const versionId = await approve(record);
    const original = current(record.id);
    const selected = await preview(record.id, versionId);
    check('审批通过仅生成内部版本，不自动对客户公开', !selected.externalVisible && (await list(prefix)).total === 0);
    check('发布预览只含净化正文且附件保持不公开', selected.preview.content.includes(publicBody) && selected.preview.attachments.length === 0
      && [secretScript, secretLink, secretSummary, 'onclick', 'onerror', '<script', 'href=', 'src='].every(value => !JSON.stringify(selected.preview).includes(value)));
    check('附件候选只包含该版本的两个有效站内文件并说明无效引用', selected.attachmentCandidates.length === 2 && selected.attachmentCandidates.every(file => uploaded.slice(0, 2).some(upload => upload.id === file.fileId)) && Boolean(selected.attachmentUnavailableReason));
    for (const actor of [employee, sales]) {
      denied(await api(actor, `/oa/knowledge/${record.id}/external-preview`), 403, '没有专门发布权限的内部角色不能预览发布');
      denied(await api(actor, `/oa/knowledge/${record.id}/external-publish`, { method: 'POST', body: publishRequest(record, versionId) }), 403, '没有专门发布权限的内部角色不能公开文档');
      denied(await api(actor, `/oa/knowledge/${record.id}/external-withdraw`, { method: 'POST', body: { version: current(record.id).version } }), 403, '没有专门发布权限的内部角色不能撤回公开');
    }
    for (const changes of [{ version: null }, { version: -1 }, { versionId: null }, { attachmentFileIds: null }, { customerId: first.customerId }, { externalVisibleFlag: 1 }]) {
      denied(await api(admin, `/oa/knowledge/${record.id}/external-publish`, { method: 'POST', body: { ...publishRequest(record, versionId), ...changes } }), 400, '发布拒绝缺失、负版本及越界控制字段');
    }
    denied(await api(admin, `/oa/knowledge/${record.id}/external-publish`, { method: 'POST', body: { ...publishRequest(record, versionId), attachmentFileIds: [uploaded[2].id] } }), 409, '不能选择不属于指定版本的附件');
    const published = await publish(record, versionId);
    check('发布绑定明确版本并提升文档竞争版本', published.externalVisible && published.externalVersionId === versionId && published.version === original.version + 1);
    const result = await readPortal(`/${record.id}`);
    const detail = successful(result, '真实客户读取公开正文');
    check('门户仅返回指定版本白名单字段', Object.keys(detail).every(key => ['documentId','versionId','versionNo','title','content','attachments'].includes(key))
      && detail.documentId === record.id && detail.versionId === versionId && detail.content.includes(publicBody));
    check('门户不泄露历史摘要、脚本、链接或附件地址', [secretScript, secretLink, secretSummary, 'submitter', 'scopeType', 'instanceId'].every(value => !JSON.stringify(detail).includes(value)) && detail.attachments.length === 0);
    check('客户正文响应明确禁止缓存且不写内部Cookie', result.headers['cache-control'].includes('no-store') && result.headers.pragma === 'no-cache' && !result.headers['set-cookie']);
    check('公开标题搜索与分页总数只统计已公开版本', (await list(prefix)).total === 1 && (await list(secretSummary)).total === 0 && (await list(secretScript)).total === 0);
    const bounded = successful(await readPortal(`/list?keyword=${prefix}&pageNum=2&pageSize=1`), '分页越过公开结果');
    check('第二页无记录但真实总数保持一条', bounded.total === 1 && bounded.rows.length === 0 && bounded.pageNum === 2);
    for (const query of ['pageNum=0', 'pageNum=1000001', 'pageSize=101', 'pageSize=-1', 'tenantId=100001', 'customerId=1', 'keyword=a&keyword=b', `keyword=${'a'.repeat(101)}`]) {
      denied(await readPortal(`/list?${query}`), 400, '客户查询拒绝越界分页及身份条件');
    }
    const internalToken = await admin.evaluate(async () => (await import('/src/utils/authStorage.ts')).getAuthToken());
    denied(await readPortal(`/${record.id}`, internalToken.replace(/^Bearer /, '')), 401, '内部令牌不能读取门户知识');
    denied(await portalCall(`/portal/oa/knowledge/${record.id}`, undefined), 401, '匿名不能读取门户知识');
    for (const route of [`/${record.id}/versions`, `/${record.id}/external-preview`, '/list/export']) denied(await readPortal(route), 404, '门户没有历史版本与内部发布别名');
    denied(await portalCall(`/portal/oa/knowledge/${record.id}`, {}, token), 404, '门户知识没有写入入口');
    const forgedHeaders = successful(await readPortal(`/${record.id}`, token, { 'X-Tenant-Id': '100001', 'X-User-Id': '1', 'X-Inner-Call': 'true' }), '门户重新取得真实租户');
    check('伪造内部及租户头不改变指定客户门户身份', forgedHeaders.documentId === record.id);
    denied(await api(admin, '/oa/inner/oa/portal/knowledge/list', { headers: { 'X-Inner-Call': 'true', 'X-From-Service': 'cloudflow-auth', 'portal-token': token } }), 403, '网关拒绝访问OA内部知识入口');
    const foreignId = Number(database(`INSERT INTO oa_knowledge_document(tenant_id,title,category,content,status,submitter_id,dept_id,create_by) VALUES(100001,${sql(prefix + '_foreign')},'产品知识','foreign','PUBLISHED',${actorId},101,${sql(prefix)}); SELECT LAST_INSERT_ID();`));
    boundaryDocuments.push(foreignId);
    const foreignVersion = Number(database(`INSERT INTO oa_knowledge_doc_version(tenant_id,document_id,version_no,title,content,publish_time,create_by) VALUES(100001,${foreignId},1,${sql(prefix + '_foreign')},'foreign',NOW(),${sql(prefix)}); SELECT LAST_INSERT_ID();`));
    database(`UPDATE oa_knowledge_document SET external_visible_flag=1,external_version_id=${foreignVersion} WHERE document_id=${foreignId} AND create_by=${sql(prefix)};`);
    check('跨租户边界输入具有有效发布时间及公开指针', database(`SELECT COUNT(*) FROM oa_knowledge_document document JOIN oa_knowledge_doc_version published ON published.tenant_id=document.tenant_id AND published.document_id=document.document_id AND published.id=document.external_version_id WHERE document.document_id=${foreignId} AND document.tenant_id=100001 AND document.external_visible_flag=1 AND published.publish_time IS NOT NULL AND published.deleted=0;`) === '1');
    denied(await readPortal(`/${foreignId}`), 404, '客户不能按ID读取另一租户公开知识');
    check('另一租户的公开知识不进入当前列表总数', (await list(prefix)).total === 1);
    denied(await api(admin, `/oa/knowledge/${record.id}/external-publish`, { method: 'POST', body: publishRequest(record, foreignVersion) }), 404, '对外发布拒绝另一租户版本ID');
    denied(await api(admin, `/oa/knowledge/${foreignId}/external-preview`), 404, '内部发布范围同样隔离其他租户');
    const other = await create('other', uploaded[2].url);
    const otherVersion = Number(database(`INSERT INTO oa_knowledge_doc_version(tenant_id,document_id,version_no,title,content,publish_time,create_by) VALUES(100000,${other.id},1,${sql(prefix + '_other_snapshot')},'other snapshot boundary input',NOW(),${sql(prefix)}); SELECT LAST_INSERT_ID();`));
    check('跨文档边界输入是同租户有效历史发布版本', database(`SELECT COUNT(*) FROM oa_knowledge_doc_version WHERE tenant_id=100000 AND document_id=${other.id} AND id=${otherVersion} AND publish_time IS NOT NULL AND deleted=0;`) === '1');
    denied(await api(admin, `/oa/knowledge/${record.id}/external-publish`, { method: 'POST', body: publishRequest(record, otherVersion) }), 404, '对外发布拒绝同租户跨文档版本');
    database(`UPDATE oa_knowledge_document SET title=${sql(workBody)},content=${sql(workBody)},status='DRAFT',version=version+1 WHERE document_id=${record.id} AND submitter_id=${actorId};`);
    try {
      const frozen = successful(await readPortal(`/${record.id}`), '编辑工作副本后客户仍读取明确发布版本');
      check('工作草稿改名改正文不改变客户已公开版本', frozen.title === original.title && frozen.content.includes(publicBody) && !JSON.stringify(frozen).includes(workBody));
      check('搜索不透出工作草稿标题', (await list(workBody)).total === 0);
      const draft = successful(await api(admin, `/oa/knowledge/${record.id}`), '读取边界工作副本');
      successful(await api(admin, '/oa/knowledge', { method: 'PUT', body: { ...draft, externalVisibleFlag: 0, externalVersionId: otherVersion, externalAttachmentFileIds: JSON.stringify([uploaded[2].id]), tenantId: 100001 } }), '通用更新无法改写对外发布绑定');
      check('普通编辑保留原租户及已指定的外部版本', current(record.id).tenant === 100000 && current(record.id).externalVersionId === versionId && current(record.id).visible === 1);
      denied(await api(admin, `/oa/knowledge/${record.id}/external-publish`, { method: 'POST', body: publishRequest(record, versionId) }), 409, '工作副本在草稿状态不能重新对外发布');
    } finally { database(`UPDATE oa_knowledge_document SET title=${sql(original.title)},content=${sql(original.content)},status='PUBLISHED',version=version+1 WHERE document_id=${record.id} AND submitter_id=${actorId};`); }
    evidence.frozenVersion = true; evidence.sanitization = true;
    const beforeRace = current(record.id);
    const race = await Promise.all(Array.from({ length: 3 }, () => api(admin, `/oa/knowledge/${record.id}/external-publish`, { method: 'POST', body: { version: beforeRace.version, versionId, attachmentFileIds: [] } })));
    check('同一文档版本并发公开只成功一次', race.filter(value => value.status === 200 && value.body?.code === 200).length === 1 && race.filter(value => value.status === 409 && value.body?.code === 409).length === 2);
    check('并发发布只提升一次文档版本', current(record.id).version === beforeRace.version + 1);
    await withdraw(record);
    denied(await readPortal(`/${record.id}`), 404, '撤回后原知识链接立即不可读取');
    check('撤回同步移除列表和总数且清除发布指针', (await list(prefix)).total === 0 && current(record.id).externalVersionId == null && current(record.id).visible === 0);
    denied(await api(admin, `/oa/knowledge/${record.id}/external-publish`, { method: 'POST', body: { version: beforeRace.version, versionId, attachmentFileIds: [] } }), 409, '旧发布请求不能重新打开已经撤回的文档');
    evidence.concurrency = true; evidence.withdrawal = true;
    const clerkName = `g_knowledge_${caseTag}`;
    database(`INSERT INTO sys_user(tenant_id,dept_id,user_name,nick_name,password,status,deleted,pwd_reset_required,create_by) SELECT tenant_id,dept_id,${sql(clerkName)},${sql(clerkName)},password,'0',0,'0',${sql(prefix)} FROM sys_user WHERE user_name='g_import_admin' AND tenant_id=100000;
      INSERT INTO sys_user_role(tenant_id,user_id,role_id) SELECT 100000,user_id,7 FROM sys_user WHERE tenant_id=100000 AND user_name=${sql(clerkName)} AND create_by=${sql(prefix)};`);
    const clerkActorId = Number(database(`SELECT user_id FROM sys_user WHERE tenant_id=100000 AND user_name=${sql(clerkName)} AND create_by=${sql(prefix)};`));
    assert.ok(Number.isSafeInteger(clerkActorId) && clerkActorId > 0);
    const redis = await ownedGatewayRedis(state);
    redis('DEL', '100000:menu_details::7', '100000:menu_details::perms:7');
    const clerk = await session(clerkName, 'g_import_admin');
    denied(await api(clerk, `/oa/knowledge/${record.id}/external-publish`, { method: 'POST', body: publishRequest(record, versionId) }), 404, '行政专员的发布权限不能越过既有本人数据范围');
    const clerkRecord = await create('clerk', '', clerk, clerkActorId);
    const clerkVersion = await approve(clerkRecord, clerk);
    await publish(clerkRecord, clerkVersion, clerk);
    check('行政专员可以真实审批后公开本人范围内的文档', current(clerkRecord.id).externalVersionId === clerkVersion && current(clerkRecord.id).visible === 1);
    await withdraw(clerkRecord, clerk);
    evidence.permissions = true;
    await verifyPortalKnowledgeFiles({ ...context, current, preview, publish, withdraw, readPortal, record, versionId, uploaded, operationBefore });
    for (const viewport of [{ width: 1440, height: 1000, name: 'desktop' }, { width: 390, height: 844, name: 'mobile' }, { width: 320, height: 844, name: 'mobileNarrow' }]) {
      await publish(record, versionId);
      await admin.setViewportSize({ width: viewport.width, height: viewport.height });
      await admin.goto(`${origin}/office/knowledge`, { waitUntil: 'domcontentloaded' });
      const pageHeader = admin.locator('.admin-knowledge-page .admin-source-header');
      await pageHeader.getByRole('heading', { name: '知识库', exact: true }).waitFor();
      await pageHeader.scrollIntoViewIfNeeded();
      const headerGeometry = await pageHeader.evaluate(element => {
        const rect = element.getBoundingClientRect();
        const textRects = [...element.querySelectorAll('h2, span')].flatMap(text => {
          const range = document.createRange(); range.selectNodeContents(text);
          return [...range.getClientRects()].map(line => ({ left: line.left, right: line.right }));
        });
        return { width: innerWidth, left: rect.left, right: rect.right, textRects };
      });
      check(`${viewport.name}内部知识库标题和完整说明均在屏幕内`, headerGeometry.left >= -1 && headerGeometry.right <= headerGeometry.width + 1
        && headerGeometry.textRects.length > 0 && headerGeometry.textRects.every(rect => rect.left >= -1 && rect.right <= headerGeometry.width + 1));
      await admin.screenshot({ path: path.join(directory, `h3-knowledge-header-${viewport.name}-${caseTag}.png`), fullPage: false });
      await admin.getByPlaceholder('标题、摘要或正文').fill(record.title);
      await admin.getByPlaceholder('标题、摘要或正文').press('Enter');
      const row = admin.getByRole('row').filter({ hasText: record.title });
      await row.getByRole('button', { name: '对外发布知识版本', exact: true }).click();
      const dialog = admin.getByRole('dialog', { name: '对外发布知识版本', exact: true });
      await dialog.getByRole('combobox', { name: '选择客户可见版本' }).selectOption(String(versionId));
      await dialog.getByRole('region', { name: '客户正文预览' }).getByText(publicBody, { exact: true }).waitFor();
      check(`${viewport.name}发布预览未经明确确认不能提交`, await dialog.getByRole('button', { name: '确认发布', exact: true }).isDisabled());
      check(`${viewport.name}附件没有默认全选`, await dialog.getByRole('checkbox', { name: `公开附件 ${uploaded[0].name}`, exact: true }).isChecked() === false && await dialog.getByRole('checkbox', { name: `公开附件 ${uploaded[1].name}`, exact: true }).isChecked() === false);
      await dialog.getByRole('checkbox', { name: `公开附件 ${uploaded[0].name}`, exact: true }).check();
      await dialog.getByRole('checkbox', { name: '确认公开本页预览正文和勾选附件，其他附件仅内部可见。', exact: true }).check();
      await dialog.getByRole('button', { name: '确认发布', exact: true }).click();
      await dialog.getByRole('status').filter({ hasText: '已对外发布所选版本正文' }).waitFor();
      check(`${viewport.name}公开选择真实保存为一个文件且另一个保持内部`, JSON.stringify(current(record.id).selectedFiles) === JSON.stringify([uploaded[0].id]));
      const geometry = await dialog.evaluate(element => ({ width: innerWidth, left: element.getBoundingClientRect().left, right: element.getBoundingClientRect().right,
        controls: [...element.querySelectorAll('button,select')].filter(control => control.getClientRects().length).map(control => control.getBoundingClientRect().height) }));
      check(`${viewport.name}发布弹窗适配屏幕且操作至少44px`, geometry.left >= 0 && geometry.right <= geometry.width + 1 && geometry.controls.every(height => height >= 44));
      const publicationLayout = await dialog.evaluate(element => {
        const body = element.querySelector('.cf-dialog-body');
        const fieldset = element.querySelector('fieldset');
        const bounds = fieldset.getBoundingClientRect();
        const textFits = (node, container) => {
          const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
          const limit = container.getBoundingClientRect();
          while (walker.nextNode()) {
            if (!walker.currentNode.textContent.trim()) continue;
            const range = document.createRange(); range.selectNodeContents(walker.currentNode);
            if ([...range.getClientRects()].some(rect => rect.left < limit.left - 1 || rect.right > limit.right + 1)) return false;
          }
          return true;
        };
        return { bodyFits: body.scrollWidth <= body.clientWidth + 1,
          filesFit: bounds.left >= 0 && bounds.right <= innerWidth + 1
            && [...fieldset.querySelectorAll('label > span')].every(label => textFits(label, fieldset)),
          buttons: [...element.querySelectorAll('.cf-dialog-footer button')].map(button => {
            const rect = button.getBoundingClientRect();
            return { width: rect.width, height: rect.height, left: rect.left, right: rect.right, textFits: textFits(button, button) };
          }), width: innerWidth };
      });
      check(`${viewport.name}发布附件完整名称及分组均不横向溢出`, publicationLayout.bodyFits && publicationLayout.filesFit);
      check(`${viewport.name}发布底部四个按钮文字完整且操作至少44px`, publicationLayout.buttons.length === 4
        && publicationLayout.buttons.every(button => button.width >= 44 && button.height >= 44 && button.left >= 0
          && button.right <= publicationLayout.width + 1 && button.textFits));
      await dialog.locator('.cf-dialog-body').evaluate(element => { element.scrollTop = 0; });
      await admin.screenshot({ path: path.join(directory, `h3-knowledge-publish-top-${viewport.name}-${caseTag}.png`), fullPage: false });
      await dialog.locator('fieldset').scrollIntoViewIfNeeded();
      await admin.screenshot({ path: path.join(directory, `h3-knowledge-publish-${viewport.name}-${caseTag}.png`), fullPage: false });
      await dialog.getByRole('button', { name: '关闭', exact: true }).click();
      const portalContext = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, ignoreHTTPSErrors: true, serviceWorkers: 'block' });
      contexts.push(portalContext);
      await portalContext.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
      const portalPage = await portalContext.newPage();
      await portalPage.goto(`${origin}/portal/${tenantCode}/login`, { waitUntil: 'domcontentloaded' });
      await portalPage.getByRole('textbox', { name: '登录账号', exact: true }).fill(first.account);
      await portalPage.getByLabel('密码', { exact: true }).fill(password);
      await portalPage.getByRole('button', { name: '登录', exact: true }).click();
      await portalPage.getByRole('button', { name: '客户知识库', exact: true }).waitFor();
      secrets.push(await portalPage.evaluate(code => JSON.parse(sessionStorage.getItem(`cloudflow.portal.session:${code}`)).token, tenantCode));
      await portalPage.getByRole('button', { name: '客户知识库', exact: true }).click();
      await portalPage.getByRole('textbox', { name: '搜索已公开标题', exact: true }).fill(record.title);
      await portalPage.getByRole('button', { name: '搜索', exact: true }).click();
      await portalPage.getByRole('button', { name: `阅读 ${record.title}`, exact: true }).click();
      const reading = portalPage.getByRole('dialog', { name: record.title, exact: true });
      await reading.getByText(publicBody, { exact: true }).waitFor();
      const publicFiles = reading.getByRole('region', { name: '公开附件', exact: true });
      check(`${viewport.name}门户只展示勾选的附件`, await publicFiles.getByRole('button', { name: `下载公开附件 ${uploaded[0].name}`, exact: true }).count() === 1 && !(await reading.textContent()).includes(uploaded[1].name));
      const grantResponse = portalPage.waitForResponse(response => new URL(response.url()).pathname === '/api/portal/file/access');
      const downloadEvent = portalPage.waitForEvent('download');
      await publicFiles.getByRole('button', { name: `下载公开附件 ${uploaded[0].name}`, exact: true }).click();
      const grant = await (await grantResponse).json(); assert.match(grant.data?.downloadTicket || '', /^kf_[A-Za-z0-9_-]{43}$/); secrets.push(grant.data.downloadTicket);
      const download = await downloadEvent;
      const downloadedPath = path.join(directory, `h3-knowledge-download-${viewport.name}-${caseTag}.txt`);
      await download.saveAs(downloadedPath);
      const downloadedBytes = await fs.readFile(downloadedPath);
      check(`${viewport.name}真实附件下载逐字节一致`, downloadedBytes.length === uploaded[0].size && createHash('sha256').update(downloadedBytes).digest('hex') === uploaded[0].sha256);
      check(`${viewport.name}客户页面只渲染指定正文且不生成危险链接`, (await reading.locator('script,iframe,img,a[href]').count()) === 0 && !(await reading.textContent()).includes(secretSummary));
      const overflow = await portalPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
      check(`${viewport.name}客户阅读页面无横向溢出`, overflow);
      await portalPage.screenshot({ path: path.join(directory, `h3-knowledge-portal-${viewport.name}-${caseTag}.png`), fullPage: true });
      await withdraw(record);
      await reading.getByRole('button', { name: '核对最新状态', exact: true }).click();
      await portalPage.getByRole('dialog', { name: '阅读公开知识', exact: true }).getByRole('alert').filter({ hasText: '知识文档不存在或未对外发布' }).waitFor();
      check(`${viewport.name}撤回核对后清空已展示的旧正文`, (await portalPage.getByText(publicBody, { exact: true }).count()) === 0);
      await publish(record, versionId);
      await portalContext.close();
      evidence[viewport.name] = true;
    }
    evidence.internalHeader = true;
    await employee.goto(`${origin}/office/knowledge`, { waitUntil: 'domcontentloaded' });
    await employee.getByPlaceholder('标题、摘要或正文').waitFor();
    check('员工页面没有对外发布按钮', await employee.getByRole('button', { name: '对外发布知识版本', exact: true }).count() === 0);
    check('客户读取不将外部身份写入内部员工阅读表', database('SELECT COUNT(*) FROM oa_knowledge_read;') === readsBefore);
    await publish(record, versionId, admin, [uploaded[0].id]);
    const deletionTicket = successful(await portalCall('/portal/file/access', { documentId: record.id, versionId, fileId: uploaded[0].id }, token), '删除前生成有效下载凭据');
    secrets.push(deletionTicket.downloadTicket);
    const beforeDelete = current(record.id);
    successful(await api(admin, `/oa/knowledge/${record.id}`, { method: 'DELETE' }), '真实删除本次知识文档');
    const afterDelete = current(record.id);
    check('删除真实落库并同时停用公开版本与附件清单', afterDelete.deleted === 1 && afterDelete.visible === 0
      && afterDelete.externalVersionId == null && afterDelete.selectedFiles == null && afterDelete.version === beforeDelete.version + 1);
    denied(await readPortal(`/${record.id}`), 404, '账号仍有效时已删除知识不能继续读取');
    denied(await portalCall('/portal/file/download', { downloadTicket: deletionTicket.downloadTicket }, token), 404, '删除知识立即阻断先前有效的下载凭据');
    check('删除不会修改只读历史版本', database(`SELECT COUNT(*) FROM oa_knowledge_doc_version WHERE document_id=${record.id} AND id=${versionId} AND content=${sql(sourceContent)};`) === '1');
    await context.action(first.account, 'disable');
    denied(await readPortal(`/${record.id}`), 401, '账号停用后旧知识令牌即失效');
    const auditCount = await waitFor(() => Number(database(`SELECT COUNT(*) FROM sys_audit_log WHERE audit_id>${auditBefore} AND tenant_id=100000 AND audit_name IN ('对外发布知识版本','撤回对外知识版本') AND JSON_UNQUOTE(JSON_EXTRACT(after_json,'$.documentId'))=${sql(record.id)};`)), value => value > 0, '本次发布撤回审计未保存');
    check('本次发布撤回有真实差异审计', auditCount > 0);
    const mutationRows = rows(`SELECT JSON_OBJECT('name',audit_name,'module',biz_module,'operator',create_by,'risk',high_risk,'before',before_json,'after',after_json,'diff',diff_json) FROM sys_audit_log WHERE audit_id>${auditBefore} AND tenant_id=100000 AND audit_name IN ('对外发布知识版本','撤回对外知识版本') AND JSON_UNQUOTE(JSON_EXTRACT(after_json,'$.documentId'))=${sql(record.id)};`).map(entry => ({
      ...entry, before: typeof entry.before === 'string' ? JSON.parse(entry.before) : entry.before,
      after: typeof entry.after === 'string' ? JSON.parse(entry.after) : entry.after,
      diff: typeof entry.diff === 'string' ? JSON.parse(entry.diff) : entry.diff,
    }));
    check('发布与撤回审计均保存本次文档前后快照、操作人、OA归属及高风险标记', mutationRows.length === auditCount
      && mutationRows.every(entry => entry.module === 'oa' && entry.operator === 'g_import_admin' && entry.risk === 1
        && Number(entry.before?.documentId) === record.id && Number(entry.after?.documentId) === record.id
        && entry.after.version === entry.before.version + 1 && Array.isArray(entry.diff) && entry.diff.length > 0)
      && ['对外发布知识版本', '撤回对外知识版本'].every(name => mutationRows.some(entry => entry.name === name)));
    check('真实发布审计保存逐个勾选的附件清单且撤回记录清空清单', mutationRows.some(entry => entry.name === '对外发布知识版本'
      && entry.after.externalVisible === true && entry.after.externalAttachmentFileIds.length === 1
      && Number(entry.after.externalAttachmentFileIds[0]) === uploaded[0].id)
      && mutationRows.some(entry => entry.name === '撤回对外知识版本' && entry.before.externalAttachmentFileIds.length === 1
        && entry.after.externalVisible === false && entry.after.externalVersionId == null && entry.after.externalAttachmentFileIds.length === 0));
    const accessCount = await waitFor(() => Number(database(`SELECT COUNT(*) FROM sys_log WHERE log_id>${operationBefore} AND create_by=${sql('portal:' + portalUserId)} AND service_name='cloudflow-auth' AND request_uri LIKE '/portal/oa/knowledge/%' AND result_code=200;`)), value => value > 0, '本次知识访问审计未保存');
    check('客户知识读取使用独立身份命名空间审计', accessCount > 0);
    check('知识发布验证未改写已有审批定义', workflowBefore === database("SELECT definition_id,version,status,model_json FROM wf_process_definition WHERE tenant_id=100000 AND process_key='knowledge_publish' AND deleted=0 ORDER BY version;"));
    const files = [];
    const collect = async folder => { for (const entry of await fs.readdir(folder, { withFileTypes: true })) {
      if (entry.isSymbolicLink() || ['private','mysql-data','profile'].includes(entry.name)) continue;
      const target = path.join(folder, entry.name);
      if (entry.isDirectory()) await collect(target); else if (entry.name.endsWith('.log')) files.push(target);
    } };
    await collect(directory);
    let bytes = 0, leaks = 0;
    for (const file of files) { const content = await fs.readFile(file, 'utf8'); bytes += Buffer.byteLength(content); for (const secret of new Set(secrets)) if (content.includes(secret)) leaks++; }
    check('全部隔离日志未泄漏本次门户密码或转发令牌', files.length > 0 && leaks === 0);
    const auditRows = database(`SELECT CONCAT_WS('|',before_val,after_val,before_json,after_json,diff_json) FROM sys_audit_log WHERE audit_id>${auditBefore};`);
    const operationRows = database(`SELECT CONCAT_WS('|',params,exception,request_uri) FROM sys_log WHERE log_id>${operationBefore};`);
    check('数据库审计和操作日志没有本次密码、会话或一次性下载凭据', [...new Set(secrets)].every(secret => !auditRows.includes(secret) && !operationRows.includes(secret)));
    console.log(`H3_KNOWLEDGE_LOG_SCAN: files=${files.length}; bytes=${bytes}; sensitive_values=${new Set(secrets).size}; leaks=${leaks}; ui_tokens_included=true; database_audit_checked=true`);
    console.log(`H3_KNOWLEDGE_AUDIT: mutation_rows=${auditCount}; access_rows=${accessCount}; scoped_to_current_case=true; attachment_publication=true`);
  } finally {
    for (const pageContext of contexts) await pageContext.close().catch(() => {});
    for (const id of boundaryDocuments) database(`DELETE FROM oa_knowledge_doc_version WHERE document_id=${id} AND create_by=${sql(prefix)}; DELETE FROM oa_knowledge_document WHERE document_id=${id} AND create_by=${sql(prefix)};`);
  }
}
