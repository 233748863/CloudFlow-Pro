import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createPreviewFixtures, previewDigest, previewPause, previewSql } from './file-preview-fixtures.mjs';
import { ownedGatewayRedis } from './owned-gateway-redis.mjs';
import { scanOwnedAuditLogs } from './portal-checks/scan-access-logs.mjs';

export async function verifyFilePreview(context) {
  const { admin, api, successful, session, database, check, directory, caseTag, state, accounts, requests, evidence } = context;
  const endpoint = '/auth/system/file/preview-ticket';
  const sensitive = new Set(accounts.map(account => account.password).filter(Boolean));
  const offsets = new Map();
  const collect = async (parent, destination) => {
    for (const entry of await fs.readdir(parent, { withFileTypes: true })) {
      if (entry.isSymbolicLink() || ['mysql-data', 'profile', 'private'].includes(entry.name)) continue;
      const filename = path.join(parent, entry.name);
      if (entry.isDirectory()) await collect(filename, destination);
      else if (entry.name.endsWith('.log')) destination.set(filename, (await fs.stat(filename)).size);
    }
  };
  await collect(directory, offsets);
  const auditBefore = database('SELECT COALESCE(MAX(audit_id),0) FROM sys_audit_log;');
  const logBefore = database('SELECT COALESCE(MAX(log_id),0) FROM sys_log;');
  const errorBefore = database('SELECT COALESCE(MAX(error_id),0) FROM sys_api_error_log;');
  const fixture = await createPreviewFixtures(context);
  const { actor, person, peerPerson, foreignPerson, employeePerson, revokePerson, ratePerson, sessionPerson, files, cases, upload, records } = fixture;
  const redis = await ownedGatewayRedis(state);
  const sessions = [actor, admin];
  const budgets = new Map();
  const remember = async page => {
    const token = await page.evaluate(async () => (await import('/src/utils/authStorage.ts')).getAuthToken());
    assert.equal(typeof token, 'string', 'Real preview session required');
    sensitive.add(token.replace(/^Bearer /, ''));
    return token;
  };
  const authenticate = async person => { const page = await session(person.username, person.source); sessions.push(page); await remember(page); return page; };
  const issueRaw = async (page, request) => {
    const budget = budgets.get(page) || { start: Date.now(), count: 0 };
    if (Date.now() - budget.start >= 61000) { budget.start = Date.now(); budget.count = 0; }
    if (budget.count >= 28) {
      const delay = Math.max(100, 61000 - (Date.now() - budget.start));
      console.log(`WAIT 预览测试保留每用户每分钟30次限制，等待${Math.ceil(delay / 1000)}秒`);
      await previewPause(delay); budget.start = Date.now(); budget.count = 0;
    }
    budget.count++; budgets.set(page, budget);
    return api(page, endpoint, { method: 'POST', body: request });
  };
  const issue = async (page, request, label = request.bizType) => {
    const response = await issueRaw(page, request);
    const ticket = successful(response, `${label}申请预览`);
    check(`${label}签发响应禁止缓存`, response.cacheControl?.includes('no-store') && response.nosniff === 'nosniff');
    if (ticket.supported) {
      assert.match(ticket.streamUrl, /^\/api\/auth\/system\/file\/preview-content\?previewToken=[A-Za-z0-9_-]{43}&signature=[A-Za-z0-9_-]{43}$/);
      const values = new URL(ticket.streamUrl, 'http://127.0.0.1').searchParams;
      sensitive.add(values.get('previewToken')); sensitive.add(values.get('signature'));
      assert.ok(ticket.expiresAt > Date.now() && ticket.expiresAt <= Date.now() + 60500, 'Ticket lifetime must be at most 60 seconds');
    }
    return ticket;
  };
  const read = (page, ticket, options) => api(page, ticket.streamUrl.slice(4), options);
  const denied = (result, label, codes = [400, 401, 403, 404, 409, 410]) => check(`${label} HTTP=${result.status} code=${result.body?.code}`,
    codes.includes(result.status) && result.body?.code !== undefined && result.body.code !== 200 && result.body?.data == null && result.size == null);
  const verifyBytes = async (page, ticket, file, label) => {
    check(`${label}真实元信息允许预览`, ticket.supported && ticket.fileName === file.name && ticket.size === file.bytes.length && ticket.mediaType === file.mediaType);
    const response = await read(page, ticket);
    check(`${label}读取真实原文件字节，摘要及安全响应头一致`, response.status === 200 && response.sha256 === file.digest && response.size === file.bytes.length
      && response.contentType === file.mediaType && response.cacheControl?.includes('no-store') && response.nosniff === 'nosniff'
      && response.referrerPolicy === 'no-referrer' && response.acceptRanges === 'bytes' && response.csp === "sandbox; default-src 'none'"
      && response.disposition?.startsWith('inline;'));
    return response;
  };
  const shared = { ...context, ...fixture, issue, issueRaw, read, denied, verifyBytes, redis, sensitive, authenticate, remember };
  try {
    sensitive.add(fixture.confidential);
    await remember(actor); await remember(admin);
    if (process.argv.includes('--file-preview-ui-only')) {
      console.log('H5_PREVIEW_UI_ONLY: full_http_acceptance=false; responses=real; production_modified=false');
      const { verifyFilePreviewUi } = await import('./verify-file-preview-ui.mjs');
      await verifyFilePreviewUi(shared);
      return;
    }
    if (process.argv.includes('--file-preview-workflow-only')) {
      console.log('H5_PREVIEW_WORKFLOW_ONLY: full_http_acceptance=false; responses=real; production_modified=false');
      const peer = await authenticate(peerPerson);
      const foreign = await authenticate(foreignPerson);
      const { verifyPreviewWorkflow } = await import('./verify-file-preview-workflow.mjs');
      shared.workflow = await verifyPreviewWorkflow({ ...shared, peer, foreign });
      return;
    }
    const { verifyPreviewProxy } = await import('./verify-file-preview-nginx.mjs');
    await verifyPreviewProxy(shared);
    const peer = await authenticate(peerPerson);
    const foreign = await authenticate(foreignPerson);
    const employee = await authenticate(employeePerson);
    for (const candidate of cases) {
      await verifyBytes(actor, await issue(actor, candidate.request, candidate.name), candidate.file, candidate.name);
      denied(await issueRaw(foreign, candidate.request), `${candidate.name}拒绝真实外租户`);
    }
    check('全部已适配内部业务上下文读取完成，流程附件另走真实流程核验', new Set(cases.map(candidate => candidate.request.bizType)).size === 10);
    evidence.tenants = true;
    for (const name of ['public', 'contract', 'archive', 'knowledge', 'history', 'expense', 'signed', 'evidence', 'resume']) {
      const candidate = cases.find(value => value.name === name);
      denied(await issueRaw(peer, candidate.request), `${name}同租户非本人不能越过原读取范围`);
    }
    for (const name of ['license', 'invoice', 'qualification']) {
      const candidate = cases.find(value => value.name === name);
      await verifyBytes(peer, await issue(peer, candidate.request, `同租户原台账-${name}`), candidate.file, `同租户原台账-${name}`);
    }
    denied(await issueRaw(employee, cases.find(value => value.name === 'resume').request), '正式EMPLOYEE无招聘读取权不能预览简历');
    denied(await issueRaw(actor, { ...cases[1].request, fileId: files.invoice.id }), '真实文件编号不能冒充合同已绑定附件');
    denied(await issueRaw(actor, { ...cases[1].request, reference: files.invoice.reference }), '真实文件引用不能冒充合同已绑定附件');
    denied(await issueRaw(actor, { bizType: 'PUBLIC', fileId: files.signed.id }), '私有合同文件不能经公共文件预览');
    denied(await issueRaw(actor, { bizType: 'UNREGISTERED', fileId: files.public.id }), '未注册业务类型明确拒绝', [400]);
    const legacyPath = database(`SELECT file_path FROM sys_file WHERE file_id=${files.contract.id};`);
    const legacy = { ...cases[1].request, fileId: undefined, reference: `/api/auth/system/file/access?path=${encodeURIComponent(files.contract.reference)}` };
    await verifyBytes(actor, await issue(actor, legacy, '已有授权下载包装引用'), files.contract, '已有授权下载包装引用');
    database(`UPDATE oa_contract SET attachment_url=${previewSql(legacyPath)} WHERE contract_id=${records.contractId};`);
    try {
      await verifyBytes(actor, await issue(actor, { ...cases[1].request, reference: legacyPath }, '已有真实存储引用'), files.contract, '已有真实存储引用');
    } finally { database(`UPDATE oa_contract SET attachment_url=${previewSql(files.contract.reference)} WHERE contract_id=${records.contractId};`); }
    const ticket = await issue(actor, cases[0].request, '会话隔离');
    denied(await read(peer, ticket), '同租户其他用户不能使用签名地址', [410]);
    denied(await read(foreign, ticket), '其他租户不能使用签名地址', [410]);
    const originalToken = await remember(actor);
    await verifyBytes(actor, ticket, files.public, '原会话保持可读');
    const tampered = new URL(ticket.streamUrl, 'http://127.0.0.1');
    const originalSignature = tampered.searchParams.get('signature');
    tampered.searchParams.set('signature', `${originalSignature[0] === 'A' ? 'B' : 'A'}${originalSignature.slice(1)}`);
    denied(await api(actor, tampered.pathname.slice(4) + tampered.search), '签名任一字节篡改被拒绝', [410]);
    denied(await api(actor, ticket.streamUrl.slice(4) + '&signature=' + originalSignature), '重复签名参数被拒绝', [409]);
    const identifier = new URL(ticket.streamUrl, 'http://127.0.0.1').searchParams.get('previewToken');
    const redisKey = `auth:file-preview:v1:${previewDigest(identifier)}`;
    const stored = redis('GET', redisKey);
    const storedTicket = JSON.parse(stored);
    const lifetime = Number(redis('TTL', redisKey));
    check('Redis签名载荷只存会话摘要，未保存真实会话和签名密钥', /^[a-f0-9]{64}$/.test(storedTicket.sessionDigest)
      && !stored.includes(originalToken.replace(/^Bearer /, '')) && !stored.includes(originalSignature)
      && storedTicket.expiresAt - storedTicket.issuedAt === 60000 && lifetime > 0 && lifetime <= 60);
    redis('SET', redisKey, JSON.stringify({ ...storedTicket, fileId: files.invoice.id }), 'KEEPTTL');
    denied(await read(actor, ticket), '自有Redis载荷被改后原签名失效', [410]);
    redis('SET', redisKey, stored, 'KEEPTTL');
    await verifyBytes(actor, ticket, files.public, '恢复原载荷后签名仍按原到期时间验证');
    evidence.signatures = true;
    const previousSession = await authenticate(sessionPerson);
    const sessionFile = await upload(previousSession, 'session.pdf');
    const previousToken = await remember(previousSession);
    console.log('WAIT 同用户重登测试保留验证码分钟限制，签发凭据前等待61秒');
    await previewPause(61000);
    const sessionRequest = { bizType: 'PUBLIC', fileId: sessionFile.id };
    const previousTicket = await issue(previousSession, sessionRequest, '重登前真实会话');
    const laterSession = await authenticate(sessionPerson);
    const laterToken = await remember(laterSession);
    check('同用户真实重登产生不同会话且原预览票据尚未到期', previousToken !== laterToken && previousTicket.expiresAt > Date.now());
    denied(await read(laterSession, previousTicket), '同用户新会话不能复用尚未到期的旧签名', [410]);
    denied(await read(previousSession, previousTicket), '遵守系统既有重登撤销旧会话策略', [401]);
    await verifyBytes(laterSession, await issue(laterSession, sessionRequest, '重新登录后的本人附件'), sessionFile, '重新登录后的本人附件');
    evidence.sessions = true;
    for (const [module, request] of [['oa', cases[1].request], ['hr', cases.find(value => value.name === 'resume').request],
      ['workflow', { bizType: 'WORKFLOW_FORM', bizId: 'missing', definitionId: 'missing', fieldPath: 'receipt', fileId: files.public.id }]]) {
      const innerPath = `/inner/${module}/file-preview/authorize`;
      denied(await api(actor, `/${module}${innerPath}`, { method: 'POST', body: request,
        headers: { 'X-Inner-Call': 'true', 'X-From-Service': 'cloudflow-auth', 'X-User-Id': person.userId, 'X-Tenant-Id': '100000' } }), `${module}外部网关不能伪造内部来源`);
      const service = state.services.find(value => value.name === module);
      for (const headers of [{}, { 'X-Inner-Call': 'true', 'X-From-Service': 'cloudflow-service-crm' }]) {
        const response = await fetch(`http://127.0.0.1:${service.port}${innerPath}`, { method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${originalToken.replace(/^Bearer /, '')}`, ...headers }, body: JSON.stringify(request) });
        denied({ status: response.status, body: await response.json() }, `${module}直连接口拒绝缺失或错误来源`, [401, 403]);
      }
    }
    evidence.permissions = true;
    const { verifyPreviewFileBoundaries } = await import('./verify-file-preview-boundaries.mjs');
    await verifyPreviewFileBoundaries({ ...shared, peer, foreign });
    const { verifyPreviewWorkflow } = await import('./verify-file-preview-workflow.mjs');
    shared.workflow = await verifyPreviewWorkflow({ ...shared, peer, peerPerson, foreign });
    evidence.contexts = true;
    const revoking = await authenticate(revokePerson);
    const license = cases.find(value => value.name === 'license');
    const beforeRevoke = await issue(revoking, license.request, '正式撤权前');
    const role = successful(await api(admin, `/auth/system/role/${revokePerson.roleId}`), '读取自有撤权角色');
    const withoutLicense = fixture.menuIds.filter(identifier => database(`SELECT perms FROM sys_menu WHERE menu_id=${identifier};`) !== 'oa:license:list');
    successful(await api(admin, '/auth/system/role', { method: 'PUT', body: { ...role, menuIds: withoutLicense } }), '正式接口撤回预览源业务权限');
    denied(await read(revoking, beforeRevoke), '源业务撤权立即拒绝旧会话和旧签名', [401, 403]);
    const relogin = await authenticate(revokePerson);
    denied(await issueRaw(relogin, license.request), '重新登录后源业务权限未恢复');
    await previewPause(5100);
    const currentRole = successful(await api(admin, `/auth/system/role/${revokePerson.roleId}`), '读取更新后自有角色');
    successful(await api(admin, '/auth/system/role', { method: 'PUT', body: { ...currentRole, menuIds: withoutLicense.filter(identifier => identifier !== '1985') } }), '正式接口撤回统一预览权限');
    const noPreview = await authenticate(revokePerson);
    denied(await issueRaw(noPreview, cases[0].request), '没有统一预览权限即拒绝申请', [403]);
    evidence.revoked = true;
    const rateActor = await authenticate(ratePerson);
    const started = Date.now();
    const results = await Promise.all(Array.from({ length: 30 }, () => api(rateActor, endpoint, { method: 'POST', body: license.request })));
    results.push(await api(rateActor, endpoint, { method: 'POST', body: license.request }));
    check('真实申请预览第31次被每分钟30次限制拒绝', results.slice(0, 30).every(result => result.status === 200 && result.body?.code === 200)
      && results[30].status === 429 && results[30].body?.code === 429 && Date.now() - started < 60000);
    for (const result of results) if (result.body?.data?.streamUrl) {
      const values = new URL(result.body.data.streamUrl, 'http://127.0.0.1').searchParams;
      sensitive.add(values.get('previewToken')); sensitive.add(values.get('signature'));
    }
    const rateTicket = results.slice(0, 30).map(result => result.body.data).reduce((latest, candidate) => candidate.expiresAt > latest.expiresAt ? candidate : latest);
    const streamStarted = Date.now();
    const streams = [];
    for (let batch = 0; batch < 12; batch++) streams.push(...await Promise.all(Array.from({ length: 10 }, () => read(rateActor, rateTicket))));
    streams.push(await read(rateActor, rateTicket));
    check('真实字节流第121次被每分钟120次限制拒绝', streams.slice(0, 120).every(result => result.status === 200)
      && streams[120].status === 429 && streams[120].body?.code === 429 && Date.now() - streamStarted < 60000);
    await verifyBytes(peer, await issue(peer, license.request, '其他用户的独立预览限流'), license.file, '其他用户的独立预览限流');
    check('触发字节流限流期间其他合法用户仍可预览', Date.now() - streamStarted < 60000);
    console.log(`H5_PREVIEW_RATE_LIMITS: ticket_allowed=30; ticket_rejected=31; stream_allowed=120; stream_rejected=121; other_user_unaffected=true; production_modified=false`);
    evidence.rateLimits = true;
    if (!process.argv.includes('--file-preview-http-only')) {
      await previewPause(61000);
      const { verifyFilePreviewUi } = await import('./verify-file-preview-ui.mjs');
      await verifyFilePreviewUi(shared);
    }
    await previewPause(1200);
    const audit = database(`SELECT COUNT(*) FROM sys_audit_log WHERE audit_id>${auditBefore} AND audit_name='FILE_PREVIEW' AND after_val LIKE 'READ_AUTHORIZED:%';`);
    check('允许读取的敏感附件均产生身份、业务和文件审计', Number(audit) >= cases.length);
    const databaseScan = await scanOwnedAuditLogs(state, [...sensitive], { log: logBefore, error: errorBefore, audit: auditBefore });
    check('实际操作、错误和预览审计中无签名、会话或附件正文', databaseScan.bytes > 0 && databaseScan.leaks === 0);
    console.log(`H5_PREVIEW_DATABASE_LOG_SCAN: bytes=${databaseScan.bytes}; sensitive_values=${databaseScan.sensitiveValues}; leaks=${databaseScan.leaks}; streamed=true; tables=3; historical_logs_recertified=false; production_modified=false`);
    check('测试证据只保存请求路径，不保存签名查询串', requests.every(request => !request.path.includes('?') && !request.path.includes('signature=')));
    const current = new Map();
    await collect(directory, current);
    let bytes = 0;
    let scanned = 0;
    const secrets = [...sensitive].filter(value => value && value.length > 5);
    const overlap = Math.max(...secrets.map(value => Buffer.byteLength(value))) + 8;
    for (const [filename, size] of current) {
      let offset = size < (offsets.get(filename) || 0) ? 0 : offsets.get(filename) || 0;
      if (offset >= size) continue;
      scanned++;
      const handle = await fs.open(filename, 'r');
      let retained = Buffer.alloc(0);
      try {
        while (offset < size) {
          const buffer = Buffer.alloc(Math.min(65536, size - offset));
          const chunk = await handle.read(buffer, 0, buffer.length, offset);
          if (!chunk.bytesRead) break;
          offset += chunk.bytesRead; bytes += chunk.bytesRead;
          const text = Buffer.concat([retained, buffer.subarray(0, chunk.bytesRead)]);
          assert.ok(secrets.every(value => !text.includes(Buffer.from(value))), `Preview sensitive value leaked in ${path.relative(directory, filename)}`);
          retained = text.subarray(Math.max(0, text.length - overlap));
        }
      } finally { await handle.close(); }
    }
    console.log(`H5_PREVIEW_LOG_SCAN: service_files_with_new_bytes=${scanned}; new_bytes=${bytes}; sensitive_values=${secrets.length}; leaks=0; database_audit_checked=true; historical_logs_recertified=false; production_modified=false`);
    evidence.secrets = true;
  } finally {
    fixture.restore();
  }
}
