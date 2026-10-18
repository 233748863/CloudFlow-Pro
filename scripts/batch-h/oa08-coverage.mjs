import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { assertRuntime, prefix, privateDirectory, readFixture, root, saveResult } from './live-lib.mjs';

const databaseLog = '.cloudflow-runtime/batch-h-warning-identity-after.log';
const callbackLog = '.cloudflow-runtime/batch-h-callback-redisson-checks.log';
const databaseSource = 'scripts/oa-db-checks/OaConsumableDatabaseChecks.java';
const baselinePhases = ['inventory', 'approval', 'partial', 'concurrency', 'matrix', 'browser', 'policy', 'reports'];
const linkedPurchaseSteps = ['partial', 'full', 'reverse', 'refill', 'payment', 'paid-link-rejection'];

const digest = text => createHash('sha256').update(text).digest('hex');
const safeId = value => /^[1-9][0-9]{0,18}$/.test(String(value ?? '')) ? String(value) : null;
const passedChecks = checks => Array.isArray(checks) && checks.length > 0 && checks.every(check => check.passed === true);

export function parseDatabaseEvidence(text) {
  const source = /OA08 SOURCE: SHA256=([a-f0-9]{64})/i.exec(text)?.[1]?.toLowerCase();
  const stable = /OA08 SOURCE: stable SHA256=([a-f0-9]{64})/i.exec(text)?.[1]?.toLowerCase();
  const total = /OA08 RESULT: groups=(\d+)\/(\d+); assertions=(\d+)\/(\d+);[^\r\n]*; failed-groups=([A-Z0-9_,]*); exit=([01])/.exec(text);
  const groups = [...text.matchAll(/OA08 GROUP: ([A-Z0-9_]+) (PASS|FAIL); assertions=(\d+)/g)]
    .map(match => ({ name: match[1], passed: match[2] === 'PASS', checks: Number(match[3]) }));
  const restored = /OA08 CLEANUP:[^\r\n]*ownership=verified; database-absent=true; source-table-count=323; cloned-source-structures-unchanged=true; source-row-reads=0; source-DML=0\./.test(text);
  const noSourceAccess = !/source-(?:DML|row-reads)=[1-9][0-9]*/.test(text);
  const failedGroups = total?.[5] ? total[5].split(',') : [];
  const executionEvidenceVerified = Boolean(source && source === stable && total
    && groups.length === Number(total[2]) && new Set(groups.map(group => group.name)).size === groups.length
    && groups.filter(group => group.passed).length === Number(total[1]) && Number(total[3]) <= Number(total[4])
    && JSON.stringify(groups.filter(group => !group.passed).map(group => group.name).sort()) === JSON.stringify([...failedGroups].sort())
    && groups.reduce((sum, group) => sum + group.checks, 0) === Number(total[4]) && restored && noSourceAccess && !text.includes('OA08 HARNESS_FAILURE:'));
  const valid = executionEvidenceVerified && total[6] === '0' && total[1] === total[2] && total[3] === total[4] && failedGroups.length === 0;
  return { valid, executionEvidenceVerified, sourceFingerprint: source ?? null, sourceStableDuringExecution: source === stable && Boolean(source),
    groups, groupCount: total ? Number(total[2]) : null, checks: total ? Number(total[4]) : null,
    passedGroups: total ? Number(total[1]) : null, passedChecks: total ? Number(total[3]) : null, failedGroups,
    isolatedDatabaseRemoved: restored, productionDml: restored ? 0 : null,
    boundary: '真实MySQL、生产Mapper和服务、Spring事务；登录权限、规则远程调用及外部传输为明确的测试替代，不等同线上工作流审批。' };
}

async function evidenceLog(filename) {
  const resolved = path.resolve(root, filename);
  const runtime = path.resolve(root, '.cloudflow-runtime');
  const relative = path.relative(runtime, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative) || path.extname(resolved) !== '.log') throw new Error('H_OA_EVIDENCE_PATH_INVALID');
  try {
    const stat = await fs.lstat(resolved);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('H_OA_EVIDENCE_FILE_INVALID');
    const text = await fs.readFile(resolved, 'utf8');
    return { text, artifact: path.relative(root, resolved).replaceAll('\\', '/'), artifactSha256: digest(text), modifiedAt: stat.mtime.toISOString() };
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

async function privateEvidence(filename) {
  if (!/^[a-z0-9-]+\.private\.json$/.test(filename)) throw new Error('H_OA_EVIDENCE_NAME_INVALID');
  try {
    const full = path.join(privateDirectory, filename);
    const stat = await fs.lstat(full);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('H_OA_EVIDENCE_FILE_INVALID');
    const encoded = JSON.parse((await fs.readFile(full, 'utf8')).replace(/^\uFEFF/, ''));
    if (encoded.milestone !== prefix || encoded.generation !== assertRuntime().generation) throw new Error('H_OA_EVIDENCE_GENERATION_MISMATCH');
    return encoded.payload;
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

async function databaseEvidence() {
  const callbackRuns = (await fs.readdir(path.join(root, '.cloudflow-runtime')))
    .filter(name => /^batch-h-callback-boundaries-oa-db(?:-[a-z0-9-]+)?\.log$/.test(name)).map(name => `.cloudflow-runtime/${name}`);
  const files = [...new Set([databaseLog, ...callbackRuns, process.env.CLOUDFLOW_H_OA_DB_EVIDENCE_LOG].filter(Boolean))];
  const evidence = [];
  for (const filename of files) {
    const saved = await evidenceLog(filename);
    if (saved) evidence.push({ ...parseDatabaseEvidence(saved.text), artifact: saved.artifact,
      artifactSha256: saved.artifactSha256, modifiedAt: saved.modifiedAt });
  }
  return evidence.sort((first, second) => second.modifiedAt.localeCompare(first.modifiedAt));
}

async function redisEvidence() {
  const saved = await evidenceLog(callbackLog);
  if (!saved) return { valid: false };
  const offline = /PASS: callback offline checks=(\d+);/.exec(saved.text);
  const redis = /PASS: callback isolated Redis checks=(\d+);[^\r\n]*total=(\d+)/.exec(saved.text);
  const source = /stable source SHA256=([a-f0-9]{64})/i.exec(saved.text)?.[1]?.toLowerCase();
  const valid = Boolean(source && offline && redis && Number(offline[1]) + Number(redis[1]) === Number(redis[2]));
  return { valid, artifact: saved.artifact, artifactSha256: saved.artifactSha256, sourceFingerprint: source ?? null,
    offlineChecks: offline ? Number(offline[1]) : null, isolatedRedisChecks: redis ? Number(redis[1]) : null,
    combinedChecks: redis ? Number(redis[2]) : null,
    boundary: '离线数据库/协议替代与真实隔离Redis分开计数；Redis重领、租约、并发已验，不替代OA接收端或线上审批证据。' };
}

async function onlineAttempts() {
  const latest = {};
  for (const filename of await fs.readdir(privateDirectory)) {
    if (!/^oa08-live-(?:attempt-[0-9]+|result)\.private\.json$/.test(filename)) continue;
    const result = await privateEvidence(filename);
    for (const phase of ['warning', 'businessUi', 'staleEdit']) {
      if (result?.scope !== `真实API阶段:${phase}` || result.completedAt <= (latest[phase]?.completedAt ?? '')) continue;
      latest[phase] = { artifact: filename, passed: result.passed === true, checks: result.checks?.length ?? 0,
        passedChecks: result.checks?.filter(check => check.passed).length ?? 0, completedAt: result.completedAt,
        includesBootstrapAndRestoration: true };
    }
  }
  return latest;
}

export function restorationEvidence(fixture) {
  const restoration = Object.entries(fixture.configurations || {}).map(([key, value]) => ({ key,
    pending: Boolean(value.pending), verifiedByApiAndSql: value.restoredByApiAndSql === true, restoredAt: value.restoredAt }));
  if (fixture.rulePolicy) restoration.push({ key: 'oa.consumable.request.limit', pending: Boolean(fixture.rulePolicy.pending),
    verifiedByApiAndSql: fixture.rulePolicy.restoredByApiAndSql === true, restoredAt: fixture.rulePolicy.restoredAt });
  if (fixture.identityRestoration) restoration.push({ key: 'borrowed-role-identities', pending: fixture.identityRestoration.pending > 0,
    verifiedByApiAndSql: fixture.identityRestoration.verifiedByApiAndSql === true, restoredCount: fixture.identityRestoration.restored });
  if (fixture.ownedRoleRestoration) restoration.push({ key: 'oa-owned-role-lease', pending: Boolean(fixture.ownedRoleRestoration.pending),
    originalRole: fixture.ownedRoleRestoration.originalRole, verifiedByApiAndSql: fixture.ownedRoleRestoration.verifiedByApiAndSql === true,
    restoredAt: fixture.ownedRoleRestoration.restoredAt });
  if (fixture.masterDataRestoration) restoration.push({ key: 'oa-owned-master-data', pending: Boolean(fixture.masterDataRestoration.pending),
    verifiedByApiAndSql: fixture.masterDataRestoration.verifiedByApiAndSql === true, restoredAt: fixture.masterDataRestoration.restoredAt });
  return restoration;
}

export async function collectCoverage(fixture, phaseNames) {
  const databases = await databaseEvidence();
  const redis = await redisEvidence();
  const recovery = await privateEvidence('oa08-callback-recovery-result.private.json');
  const recovered = recovery?.passed === true && recovery.originalApprovalPreserved === true && recovery.directDatabaseWrites === false
    && recovery.recovery === 'APPROVED_WITH_ORIGINAL_WORKFLOW' && passedChecks(recovery.checks)
    && safeId(recovery.requestId) === safeId(fixture.scenarios?.approval?.requestId);
  const linked = fixture.purchaseCoverage?.links?.passed === true
    && linkedPurchaseSteps.every(step => fixture.steps?.[`purchase-links:${step}`]?.passed === true);
  const stale = fixture.phases?.staleEdit?.passed === true && fixture.boundaryCoverage?.staleEdit?.passed === true
    && fixture.boundaryCoverage.staleEdit.httpStatus === 409 && fixture.boundaryCoverage.staleEdit.restoredByApiAndSql === true;
  const database = (id, label, tests, onlineBoundary) => {
    const proofs = tests.map(test => {
      const evidence = databases.find(run => run.executionEvidenceVerified && run.groups.some(group => group.name === test && group.passed));
      const group = evidence?.groups.find(group => group.name === test);
      return { test, verified: Boolean(evidence), ...(evidence ? { checks: group.checks, artifact: evidence.artifact,
        sourceFingerprint: evidence.sourceFingerprint, sourceFile: databaseSource, suitePassed: evidence.valid,
        suitePassedGroups: evidence.passedGroups, suiteTotalGroups: evidence.groupCount, suiteFailedGroups: evidence.failedGroups.join(',') } : {}) };
    });
    return { id, label, status: proofs.every(proof => proof.verified) ? '已验证（隔离库）' : '待隔离库执行',
      verified: proofs.every(proof => proof.verified), onlineVerified: false, proofs, onlineBoundary };
  };
  const online = (id, label, verified, proof, boundary = null) => ({ id, label, verified, onlineVerified: verified,
    status: verified ? '已验证（真实线上）' : '待真实线上验证', proof, boundary });
  const mapping = [
    { id: 'cache-integrity', label: '真实缓存差异及损坏台账前缀的CHECK和REBUILD', items: [
      database('cache-repair', '缓存差异修复与损坏前缀拒绝重建', ['CACHE_CHECK_REBUILD_IDEMPOTENCY', 'DAMAGED_LEDGER_PREFIX_REJECTED'], '未破坏运行库缓存或台账前缀。'),
    ] },
    { id: 'posting-rollback', label: '台账、原日志及主单写入失败的真实回滚注入', items: [
      database('posting-atomicity', '台账、日志、来源及多行操作失败回滚', ['ISSUE_ROLLBACK_LEDGER', 'ISSUE_ROLLBACK_LOG', 'ISSUE_ROLLBACK_SOURCE',
        'ISSUE_FINAL_ZERO_AFFECTED_ROWS', 'ISSUE_SECOND_LINE_STOCK_SHORTAGE', 'PURCHASE_ROLLBACK_LEDGER', 'PURCHASE_ROLLBACK_LOG', 'PURCHASE_ROLLBACK_SOURCE'], '未向运行库添加失败触发器或制造记账故障。'),
    ] },
    { id: 'callback-ordering', label: '工作流停投递重放、旧轮实例及绑定前快速回调', items: [
      online('persistent-recovery', '原102持久化死信管理员重放', recovered, { artifact: 'oa08-callback-recovery-result.private.json',
        requestId: safeId(recovery?.requestId), checks: recovery?.checks?.length ?? 0, originalApprovalPreserved: recovery?.originalApprovalPreserved === true,
        directDatabaseWrites: recovery?.directDatabaseWrites ?? null }, '复用原真实审批历史；没有停服务造新故障或重复批准。'),
      database('callback-round-ordering', '旧轮忽略及绑定前回调可重试', ['APPROVAL_CALLBACK_OLD_ROUND', 'APPROVAL_CALLBACK_BEFORE_BIND'], '线上未竞速绑定窗口或改写已审批轮次；隔离用例用真实提交、驳回、编辑、再提交服务，工作流结果由测试输入提供。'),
      database('callback-atomicity', '批准明细、主单、决策轨迹及绑定快照的真实事务', ['APPROVAL_CALLBACK_ROLLBACK_ITEM', 'APPROVAL_CALLBACK_ROLLBACK_SOURCE',
        'APPROVAL_CALLBACK_ROLLBACK_TRACE', 'APPROVAL_BINDING_ROLLBACK_TRACE'], '未在运行回调链注入SQL故障；隔离接收器执行生产分发器和真实事务。'),
    ] },
    { id: 'callback-isolation', label: '错误回调令牌及跨租户回调的真实拒绝', items: [
      database('callback-identity', 'OA接收器错误/缺失令牌与跨租户无副作用拒绝', ['APPROVAL_CALLBACK_WRONG_TOKEN', 'APPROVAL_CALLBACK_CROSS_TENANT'], 'OA无HTTP审批回调入口，管理员重放不允许覆盖载荷；未向运行Redis注入错误消息，未伪造登录凭据或线上审批通过。'),
    ] },
    { id: 'message-retries', label: '消息投递失败重试及两个扫描执行器竞争', items: [
      database('message-competition', '双扫描、Outbox和通知失败重试、新风险事件去重', ['TWO_WARNING_SCANNERS', 'OUTBOX_FAILURE_RETRY', 'TWO_OUTBOX_SCANNERS',
        'MESSAGE_DATABASE_FAILURE_REDELIVERY', 'INTERNAL_NOTIFICATION_FAILURE_RETRY', 'WARNING_MESSAGE_EVENT_IDENTITY'], '未故障注入运行消息库或重试扫描器；真实线上新风险通知与全局配置错误分别保留。'),
      online('new-warning-round', '补货后新风险通知与同轮重复扫描', fixture.phases?.warning?.passed === true && fixture.warningCoverage?.targetTenantPassed === true,
        { targetTenantPassed: fixture.warningCoverage?.targetTenantPassed === true, globalJobSucceeded: fixture.warningCoverage?.globalJobSucceeded ?? null,
          globalConfigurationFailurePreserved: fixture.warningCoverage?.globalConfigurationFailurePreserved === true,
          foreignWarehouseConfigurationsUnchanged: fixture.warningCoverage?.foreignWarehouseConfigurationsUnchanged === true,
          foreignTenantCount: fixture.warningCoverage?.foreignWarehouseConfigurationCount ?? null,
          previousSkippedMessagesRetained: fixture.warningCoverage?.previousSkippedMessagesRetained === true }, '49外租户仓管未配置，globalJobSucceeded=false是保留的真实配置失败。'),
    ] },
    { id: 'concurrency-and-version', label: '并发记账与CHECK和REBUILD以及编辑旧版本', items: [
      database('concurrent-recalculation', '并发记账和核对/重建', ['CHECK_AFTER_CONCURRENT_POSTING', 'POSTING_AFTER_CONCURRENT_REBUILD'], '未让运行库核对重建与记账故意竞争；隔离库实际观察InnoDB锁等待。'),
      online('stale-version', '真实API拒绝旧版本编辑且恢复资料', stale, { materialId: safeId(fixture.boundaryCoverage?.staleEdit?.materialId),
        httpStatus: fixture.boundaryCoverage?.staleEdit?.httpStatus, restoredByApiAndSql: fixture.boundaryCoverage?.staleEdit?.restoredByApiAndSql === true }),
    ] },
    { id: 'payment-project-link', label: '已关联付款采购冲正与项目成本联动', items: [
      online('purchase-payment-project', '部分/足额收货、冲正补收、付款草稿幂等、关联后禁止裸冲正及项目成本', linked,
        { steps: linkedPurchaseSteps.map(step => `purchase-links:${step}`), checkedThroughRealApiAndReadonlySql: linked }, '付款草稿和关联边界已验；未办理付款审批或实际支付。'),
    ] },
  ].map(area => ({ ...area, verified: area.items.every(item => item.verified),
    status: area.items.every(item => item.verified) ? [...new Set(area.items.map(item => item.status))].join('、') : '部分已验证，保留待验项' }));
  const onlinePhases = phaseNames.map(name => ({ name, passed: fixture.phases?.[name]?.passed === true,
    phaseChecks: fixture.phases?.[name]?.checks?.filter(check => check.passed).length ?? 0, completedAt: fixture.phases?.[name]?.completedAt ?? null }));
  const unverifiedCoverage = mapping.flatMap(area => area.items.filter(item => !item.verified)
    .map(item => item.proofs ? `${item.label}（待通过：${item.proofs.filter(proof => !proof.verified).map(proof => proof.test).join('、')}）` : item.label));
  const onlineUnverifiedCoverage = mapping.flatMap(area => area.items.filter(item => !item.onlineVerified)
    .map(item => ({ id: item.id, label: item.label, isolatedEvidenceVerified: item.verified, boundary: item.onlineBoundary ?? item.boundary })));
  const restoration = restorationEvidence(fixture);
  const taxed = fixture.scenarios?.['purchase-taxed'];
  return { scope: '真实线上API/浏览器、真实隔离MySQL、真实隔离Redis、离线检查分层汇总，不累计冒充全线上通过',
    mapping: mapping.map(area => ({ ...area, items: area.items.map(item => item.id) })),
    coverageDetails: mapping.flatMap(area => area.items.map(item => ({ areaId: area.id, ...item }))),
    unverifiedCoverage, onlineUnverifiedCoverage, pendingCoverage: [...onlinePhases.filter(phase => !phase.passed).map(phase => phase.name), ...unverifiedCoverage],
    databaseEvidence: databases, callbackEvidence: redis, sourceFile: databaseSource,
    currentTestSourceSha256: digest(await fs.readFile(path.join(root, databaseSource))),
    historicalFingerprintsAreNotAutomaticallyCurrentSourceProof: true,
    onlinePhases, originalEightPhasesPassed: baselinePhases.every(name => fixture.phases?.[name]?.passed === true),
    onlineAttemptEvidence: await onlineAttempts(), completedPhases: onlinePhases.filter(phase => phase.passed).map(phase => phase.name),
    allRequiredOnlinePhasesPassed: onlinePhases.every(phase => phase.passed), allMappedCoverageVerified: unverifiedCoverage.length === 0,
    allCoverageVerifiedOnline: onlineUnverifiedCoverage.length === 0 && onlinePhases.every(phase => phase.passed),
    additionalOnlineCoverage: linked ? ['已关联付款采购冲正与项目成本联动'] : [],
    restoration, configurationRestored: restoration.length > 0 && restoration.every(item => !item.pending && item.verifiedByApiAndSql),
    purchaseGate: safeId(taxed?.rfqId) && taxed.deadlineWait ? { rfqId: safeId(taxed.rfqId), quotationId: safeId(taxed.quotationId),
      quoteDeadline: taxed.pendingDeadline, earliestAwardAt: taxed.deadlineWait.earliestAwardBeijing, legalEarlyAward: false,
      lastDeadlineReadAt: taxed.deadlineWait.checkedAtBeijing, pendingOnlinePurchase: fixture.purchaseCoverage?.taxed?.passed !== true,
      source: ['cloudflow-backend/cloudflow-service-oa/src/main/java/com/cloudflow/oa/service/impl/OaRfqService.java:65',
        'cloudflow-backend/cloudflow-service-oa/src/main/java/com/cloudflow/oa/service/impl/OaRfqService.java:168',
        'cloudflow-backend/cloudflow-service-oa/src/main/java/com/cloudflow/oa/service/impl/OaRfqService.java:177',
        'cloudflow-backend/cloudflow-service-oa/src/main/java/com/cloudflow/oa/service/impl/OaRfqAccessService.java:54'] } : null };
}

export async function writeCoverageSummary(phaseNames) {
  assertRuntime();
  try {
    await fs.access(path.join(privateDirectory, 'oa08-acceptance.lock'));
    throw new Error('H_OA_COVERAGE_BUSY');
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const coverage = await collectCoverage(await readFixture('oa08-live'), phaseNames);
  await saveResult('oa08-coverage', null, { ...coverage, reportOnly: true, addedBusinessChecks: 0 });
  console.log(JSON.stringify({ reportOnly: true, addedBusinessChecks: 0, completedPhases: coverage.completedPhases,
    mappedAreas: coverage.mapping.length, verifiedAreas: coverage.mapping.filter(area => area.verified).length,
    unverifiedCoverage: coverage.unverifiedCoverage, pendingCoverage: coverage.pendingCoverage,
    onlineUnverifiedBoundaryCount: coverage.onlineUnverifiedCoverage.length, configurationRestored: coverage.configurationRestored,
    databaseEvidence: coverage.databaseEvidence.map(run => ({ valid: run.valid, executionEvidenceVerified: run.executionEvidenceVerified,
      groups: run.groupCount, passedGroups: run.passedGroups, checks: run.checks, passedChecks: run.passedChecks,
      failedGroups: run.failedGroups, sourceFingerprint: run.sourceFingerprint })),
    callbackEvidence: { valid: coverage.callbackEvidence.valid, offlineChecks: coverage.callbackEvidence.offlineChecks, isolatedRedisChecks: coverage.callbackEvidence.isolatedRedisChecks } }));
}
