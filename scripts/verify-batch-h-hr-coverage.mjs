import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { acceptanceCoverage, restorationPending } from './batch-h/hr09-evidence.mjs';
import { assertRuntime, check, failureSummary, privateDirectory, readFixture, root, saveResult } from './batch-h/live-lib.mjs';

const phases = ['attendance', 'overtime-complete', 'compensatory', 'comp-leave', 'shift-complete', 'shift-safety',
  'security', 'payroll', 'payroll-privacy', 'payroll-correction', 'payroll-baseline', 'limits', 'periods', 'ui'];
const hash = value => createHash('sha256').update(value).digest('hex');
const parse = value => JSON.parse(value.replace(/^\uFEFF/, ''));
let failure;
let summary = { reportOnly: true, acceptedProductionPolicy: false, runtimeBusinessWrites: 0, runtimeRowReads: 0 };

try {
  const runtime = assertRuntime();
  const fixture = await readFixture('hr09');
  check('HR所有临时政策身份及薪资基线均已恢复', !restorationPending(fixture)
    && fixture.payroll?.baselineRestorationRequired === false);
  const liveEvidence = [];
  for (const phase of phases) {
    const saved = parse(await fs.readFile(path.join(privateDirectory, `hr09-${phase}-result.private.json`), 'utf8'));
    const result = saved.payload;
    check('各阶段报告属于当前真实运行批次', saved.milestone === runtime.milestone && saved.generation === runtime.generation, { phase });
    check('各阶段最终结果通过且保留非空逐项依据', result?.passed === true && result.failure == null
      && Array.isArray(result.checks) && result.checks.length > 0 && result.checks.every(item => item.passed === true), { phase });
    check('写入阶段具有精确恢复证据', phase === 'ui' || result.restored === true, { phase });
    liveEvidence.push({ phase, checks: result.checks.length, completedAt: result.completedAt,
      restored: phase === 'ui' ? 'READ_ONLY_BROWSER' : result.restored });
  }
  const reportArgument = process.argv.find(value => value.startsWith('--database-report='))?.slice(18).replaceAll('\\', '/');
  check('隔离数据库报告限定于既有随机验收目录', /^scripts\/hr-db-checks\/artifacts\/hr09-db-[a-f0-9]{32}\/database-report\.json$/.test(reportArgument || ''));
  const reportPath = path.join(root, reportArgument);
  const reportDirectory = path.dirname(reportPath);
  const report = parse(await fs.readFile(reportPath, 'utf8'));
  const stability = parse(await fs.readFile(path.join(reportDirectory, 'source-stability.json'), 'utf8'));
  const manifestText = await fs.readFile(path.join(reportDirectory, 'source-fingerprints.json'), 'utf8');
  const manifest = parse(manifestText);
  check('数据库验证使用稳定且可核对的源码快照', stability.stable === true && stability.sha256 === report.sourceSha256
    && hash(manifestText) === report.sourceSha256 && Array.isArray(manifest) && manifest.length > 0);
  let currentSourcesMatch = true;
  for (const entry of manifest) {
    const sourcePath = await fs.realpath(path.join(root, entry.path));
    const relative = path.relative(root, sourcePath);
    if (relative.startsWith('..') || path.isAbsolute(relative) || hash(await fs.readFile(sourcePath)) !== entry.sha256) {
      currentSourcesMatch = false;
      break;
    }
  }
  check('隔离数据库证据逐文件匹配当前HR及公共源码', currentSourcesMatch, { sourceEntries: manifest.length });
  check('隔离数据库所有业务组与真实故障竞争均已通过', report.passed === true && report.groupCount === 16
    && report.groups?.length === 16 && report.groups.every(group => group.passed === true && group.assertions > 0)
    && report.realDatabaseRaceCount === 18 && report.observedInjectedWriteFailures === 16);
  const requiredRollbackGroups = ['SWAP second assignment insert rollback', 'SWAP final parent update rollback',
    'COMPENSATORY ledger insert rollback', 'COMPENSATORY quota update rollback', 'COMPENSATORY final parent update rollback',
    'PAY change insert rollback', 'PAY final parent update rollback'];
  const rollbackVerified = requiredRollbackGroups.every(name => report.groups.some(group => group.name === name && group.passed === true));
  check('双人调班及调休工资部分写入故障均有事务回滚依据', rollbackVerified);
  check('隔离库已删除且运行库323表结构未改变', report.databaseDropped === true && report.cleanup?.ownershipVerified === true
    && report.cleanup.schemas === 0 && report.cleanup.tables === 0 && report.cleanup.triggers === 0
    && report.runtimeTableCountBefore === 323 && report.runtimeTableCountAfter === 323
    && report.runtimeSchemaBeforeSha256 === report.runtimeSchemaAfterSha256);
  const coverage = { ...acceptanceCoverage(fixture.completed), atomicFailureRollback: rollbackVerified };
  const remaining = Object.entries(coverage).filter(([, passed]) => !passed).map(([name]) => name);
  summary = { ...summary, coverage, remaining, liveEvidence, restored: true,
    overallAcceptance: remaining.length ? 'NOT_COMPLETED' : 'COMPLETED',
    evidenceScopes: Object.fromEntries(Object.keys(coverage).map(name => [name,
      name === 'atomicFailureRollback' ? 'ISOLATED_DATABASE' : 'LIVE_API_BROWSER_OR_LOG'])),
    isolatedDatabaseEvidence: { report: reportArgument, sourceSha256: report.sourceSha256, groupCount: report.groupCount,
      assertions: report.assertionCount, races: report.realDatabaseRaceCount, injectedWriteFailures: report.observedInjectedWriteFailures,
      databaseDropped: report.databaseDropped, boundaries: report.boundaries },
    boundaries: ['正式报酬与排班政策仍未核定，保持停用或空值', '数据库故障未注入运行库，外部锁及消息投递边界遵循隔离验证报告'] };
  check('HR本轮约定验收覆盖无未完成项且证据类型明确', remaining.length === 0, { remaining });
} catch (error) {
  failure = error;
  console.error(JSON.stringify(failureSummary(error)));
} finally {
  await saveResult('hr09-coverage', failure, summary);
}
if (failure) process.exitCode = 1;
