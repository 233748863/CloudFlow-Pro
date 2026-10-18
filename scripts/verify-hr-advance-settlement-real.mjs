import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createOwnedRecoveryJournal } from './runtime-checks/owned-recovery-journal.mjs';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { verifyHrAdvanceApproval } from './verify-hr-advance-approval-real.mjs';
import { prepareSettlementWagePolicy } from './verify-hr-settlement-wage-policy-real.mjs';
import { verifySettlementApproval } from './verify-hr-settlement-approval-real.mjs';
import { prepareSettlementAdvancePayroll, verifySettlementPayrollStage } from './verify-hr-advance-settlement-payroll.mjs';
import { prepareSettlementTraining, verifySettlementTrainingStage } from './verify-hr-settlement-training-source.mjs';
import { prepareSettlementLeave, verifySettlementLeaveStage } from './verify-hr-settlement-leave-source.mjs';
import { prepareSettlementReferral, recoverSettlementReferral, verifySettlementReferralStage } from './verify-hr-settlement-referral-source.mjs';
import { verifySettlementReferralRepayment } from './verify-hr-settlement-referral-repay.mjs';
import { ownedGatewayRedis } from './owned-gateway-redis.mjs';
import { scanOwnedAuditLogs, scanSecretStream } from './portal-checks/scan-access-logs.mjs';

// Identities, approval definitions, pay structures and tax settings are owned prerequisites.
// Borrowing, funding, resignation, settlement, reverse money and recovery use real APIs.
export async function verifyHrAdvanceSettlement(context) {
  const repayMarker = process.argv.find(value => value.startsWith('--hr-referral-repay='))?.split('=')[1];
  if (repayMarker) return verifySettlementReferralRepayment(context, repayMarker);
  const { admin, api, successful, database, check, caseTag, state, accounts, evidence } = context;
  const marker = `h2as_${caseTag}`, combination = evidence.combination = {};
  const fullSources = process.argv.includes('--hr-advance-settlement-all-sources');
  const referralMode = process.argv.includes('--hr-settlement-referral');
  const payrollMode = fullSources || process.argv.includes('--hr-advance-settlement-payroll');
  const receivable = payrollMode ? '50.00' : '100.00';
  const salaryReserved = payrollMode ? '50.00' : '0.00';
  const postedEntryCount = payrollMode ? 2 : 1, restoredEntryCount = payrollMode ? 5 : 2;
  const primaryRepaymentPlan = payrollMode ? { repayMode: 'SALARY_DEDUCT', repayStartMonth: database("SELECT DATE_FORMAT(CURRENT_DATE,'%Y-%m');"),
    repayMonths: 2, monthlyDeductAmount: '50.00' } : {};
  const sql = value => `CONVERT(UNHEX('${Buffer.from(String(value)).toString('hex')}') USING utf8mb4)`;
  const rows = statement => database(statement).split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
  const post = (page, url, body = {}) => api(page, url, { method: 'POST', body });
  const waitFor = async (read, accept, label) => {
    const deadline = Date.now() + 120000;
    do { const value = await read(); if (accept(value)) return value; await new Promise(resolve => setTimeout(resolve, 500)); } while (Date.now() < deadline);
    throw new Error(label);
  };
  const redis = await ownedGatewayRedis(state);
  const secrets = new Set(accounts.map(item => item.password).filter(Boolean));
  const remember = async page => {
    const token = await page.evaluate(async () => (await import('/src/utils/authStorage.ts')).getAuthToken());
    assert.ok(token); secrets.add(token.replace(/^Bearer /, '')); return page;
  };
  await remember(admin);
  const session = async (...args) => remember(await context.session(...args));
  const original = () => database(`SELECT a.advance_id,a.version,a.status,a.approval_status,a.repaid_amount,a.outstanding_amount,a.reserved_amount,a.written_off_amount
    FROM hr_employee_advance a JOIN hr_employee e ON e.tenant_id=a.tenant_id AND e.id=a.employee_id
    WHERE e.employee_no NOT LIKE ${sql(`h2ap_${caseTag}_%`)} ORDER BY a.tenant_id,a.advance_id;`);
  const before = original(); let failure;
  const previousReferral = process.argv.find(value => value.startsWith('--hr-referral-recover='))?.split('=')[1];
  const retainedTables = previousReferral ? [] : [['hr_employee','id'], ['hr_employee_comp','id'], ['hr_comp_change','id'],
    ['hr_salary_slip','id'], ['hr_payroll_batch','batch_id'], ['hr_payroll_batch_employee','batch_employee_id'],
    ['hr_payroll_period','period_id'], ['hr_final_settlement','settlement_id'], ['hr_final_settlement_item','item_id'],
    ['hr_employee_advance','advance_id'], ['hr_advance_repayment','repayment_id'], ['hr_training_recovery','recovery_id'],
    ['hr_employee_referral','referral_id'], ['hr_offer','id'], ['hr_leave_ledger','ledger_id'], ['hr_leave_quota','id']];
  const retainedBounds = Object.fromEntries(retainedTables.map(([table, key]) => {
    const bound = database(`SELECT COALESCE(MAX(${key}),0) FROM ${table};`);
    assert.match(bound, /^\d+$/); return [table, bound];
  }));
  const retainedColumns = Object.fromEntries(retainedTables.map(([table]) => {
    const columns = database(`SELECT column_name FROM information_schema.columns WHERE table_schema='cloud_flow_db' AND table_name=${sql(table)} ORDER BY ordinal_position;`)
      .split(/\r?\n/).filter(column => table !== 'hr_payroll_period' || !['version', 'update_time', 'update_by'].includes(column));
    assert.ok(columns.length > 0); columns.forEach(column => assert.match(column, /^[a-z_][a-z0-9_]*$/));
    return [table, columns];
  }));
  const retainedBusiness = () => Object.fromEntries(retainedTables.map(([table, key]) => {
    const digest = createHash('sha256'); let cursor = '0';
    for (;;) {
      const end = database(`SELECT COALESCE(MAX(${key}),0) FROM (SELECT ${key} FROM ${table} WHERE ${key}>${cursor} AND ${key}<=${retainedBounds[table]} ORDER BY ${key} LIMIT 1000) selected;`);
      assert.match(end, /^\d+$/); if (end === '0') break;
      // Hash every retained column in MySQL; only IDs and fixed-size hashes cross the bounded child-process buffer.
      const columns = retainedColumns[table].map(column => 'HEX(`' + column + '`)').join(',');
      digest.update(database(`SELECT ${key},SHA2(CAST(JSON_ARRAY(${columns}) AS CHAR),256) FROM ${table} WHERE ${key}>${cursor} AND ${key}<=${end} ORDER BY ${key};`)); cursor = end;
    }
    return [table, digest.digest('hex')];
  }));
  const businessBefore = retainedBusiness();
  const journal = createOwnedRecoveryJournal(context.directory, `${marker}-combination`, { marker, retainedTables, retainedBounds, retainedColumns, businessBefore, originalAdvanceHash: createHash('sha256').update(before).digest('hex') });
  combination.preservation = { tables: retainedTables.length, bounds: retainedBounds, before: businessBefore, kept: false,
    periodExcludedColumns: ['version', 'update_time', 'update_by'] };
  try {
    if (referralMode && previousReferral) combination.previousReferralRecovery = await recoverSettlementReferral(context, previousReferral);
    check('已批准的八项结算菜单已经落地', database('SELECT COUNT(*) FROM sys_menu WHERE menu_id BETWEEN 1860 AND 1867 AND status=\'0\';') === '8');
    await verifyHrAdvanceApproval({ ...context, session, primaryRepaymentPlan, trainingParticipants: fullSources,
      verifyFundedSettlement: async setup => {
        const { person, peerPerson, finance, employee, main, loan, createPerson } = setup;
        const hrPerson = createPerson('hr', 4), hr = await session(hrPerson.username, 'g_holiday_employee');
        const employeeId = person.employeeId, userId = person.userId;
        const balance = () => rows(`SELECT JSON_OBJECT('outstanding',CAST(outstanding_amount AS CHAR),'repaid',CAST(repaid_amount AS CHAR),
          'reserved',CAST(reserved_amount AS CHAR),'writtenOff',CAST(written_off_amount AS CHAR),'status',status,'version',version)
          FROM hr_employee_advance WHERE tenant_id=100000 AND advance_id=${main};`)[0];
        const entries = () => rows(`SELECT JSON_OBJECT('id',CAST(repayment_id AS CHAR),'settlement',CAST(settlement_id AS CHAR),
          'type',repay_type,'status',status,'amount',CAST(repay_amount AS CHAR),'reversalOf',CAST(reversal_of_id AS CHAR),'key',source_event_key,'salary',CAST(salary_slip_id AS CHAR))
          FROM hr_advance_repayment WHERE tenant_id=100000 AND advance_id=${main} ORDER BY repayment_id;`);
        check('组合来源为真实审批并实际放款的100元借款', loan(main).outstanding === '100.00' && Boolean(loan(main).paid)
          && entries().length === 0 && balance().reserved === '0.00');
        combination.advanceId = main; combination.employeeId = employeeId; combination.funded = true;
        const applicationId = String(successful(await post(hr, '/hr/lifecycle/applications', {
          applicationNo: marker, employeeId, type: 'RESIGNATION', status: 'DRAFT', effectiveDate: database('SELECT CURRENT_DATE;'),
          successorUserId: peerPerson.userId, detailJson: { reason: '借款与离职结算实际组合验收' },
        }), '人事实际建立借款员工离职申请'));
        assert.match(applicationId, /^[1-9]\d*$/);
        for (const action of ['submit', 'approve']) successful(await post(hr, `/hr/lifecycle/applications/${applicationId}/${action}`), '通过实际入口提交及批准借款员工离职');
        combination.applicationId = applicationId; combination.resignationApproved = true;
        const settlementId = String(successful(await post(hr, '/hr/settlement', { lifecycleApplicationId: applicationId, remark: marker }), '从同员工真实离职建立结算'));
        assert.match(settlementId, /^[1-9]\d*$/);
        let payroll, training, leaves, referral;
        const prepared = await prepareSettlementWagePolicy({ ...context, marker, employeeId, settlementId,
          expectedAdditionalSources: [{ type: 'HR_ADVANCE', id: main, amount: receivable }],
          prepareAdditionalSources: payrollMode ? async () => {
            payroll = await prepareSettlementAdvancePayroll({ ...context, marker, employeeId, advanceId: main,
              beforeCalculation: referralMode ? async period => {
                referral = await prepareSettlementReferral({ ...context, ...setup, ...period, marker, employeeId, hr, hrPerson });
                combination.referral = referral;
              } : undefined });
            combination.payroll = { ...payroll, deduction: '50.00', separateReceivable: '50.00' };
            const sources = [{ type: 'HR_SALARY_SLIP', id: payroll.salaryId, amount: payroll.netAmount }];
            if (fullSources) {
              training = await prepareSettlementTraining({ ...context, ...setup, marker, employeeId, userId, hr, hrPerson });
              leaves = await prepareSettlementLeave({ ...context, marker, employeeId });
              combination.training = { recoveryId: training.recoveryId, enrollmentId: training.enrollmentId,
                sessionId: training.sessionId, courseId: training.courseId, amount: training.amount, instanceId: training.instanceId };
              combination.leaves = leaves.map(({ unit, quantity, amount, leaveTypeId, periodId, quotaId, ledgerId }) => ({ unit, quantity, amount, leaveTypeId, periodId, quotaId, ledgerId }));
              sources.push({ type: 'HR_TRAINING_RECOVERY', id: training.recoveryId, amount: training.amount },
                ...leaves.map(leave => ({ type: 'HR_LEAVE_QUOTA', id: leave.quotaId, amount: leave.amount })));
            }
            return sources;
          } : undefined });
        const stages = [], settlementEvidence = {};
        const observeSources = async (stage, observation) => {
          const current = balance(), ledger = entries(), originalEntry = ledger.find(item => item.settlement === settlementId && item.reversalOf === null);
          if (['calculated', 'submitted', 'approved', 'confirmed', 'released'].includes(stage)) {
            const reserved = ['submitted', 'approved', 'confirmed'].includes(stage);
            check(`借款组合${stage}只按阶段占用且未提前还款`, current.outstanding === '100.00' && current.repaid === '0.00'
              && current.reserved === (reserved ? '100.00' : salaryReserved) && current.writtenOff === '0.00'
              && (reserved ? originalEntry?.status === 'RESERVED' && originalEntry.amount === receivable : !originalEntry || originalEntry.status === 'RELEASED'));
            const item = observation.row.items.find(value => value.sourceBizType === 'HR_ADVANCE');
            if (stage === 'released') {
              check('释放后要求重算并保留原借款来源历史', item === undefined
                && observation.row.missingRequirements.some(value => value.includes('重新核定来源并计算'))
                && database(`SELECT COUNT(*) FROM hr_final_settlement_item WHERE tenant_id=100000 AND settlement_id=${settlementId}
                  AND source_biz_type='HR_ADVANCE' AND source_biz_id=${sql(main)} AND amount=${receivable} AND source_posted_flag=0
                  AND JSON_UNQUOTE(JSON_EXTRACT(source_snapshot,'$.paymentRequestId'))=${sql(loan(main).payment)};`) === '1');
            } else check(`借款组合${stage}保留同一放款来源和应收本金`, String(item?.sourceBizId) === main && item.amount === receivable
              && !item.posted && String(item.evidence.paymentRequestId) === String(loan(main).payment));
          } else if (stage === 'posted' || stage === 'reversalPending') {
            check(`借款组合${stage}已还100元且冲正审批不提前退回`, current.outstanding === '0.00' && current.repaid === '100.00'
              && current.reserved === '0.00' && current.writtenOff === '0.00' && current.status === 'CLEARED' && ledger.length === postedEntryCount
              && originalEntry?.status === 'POSTED' && originalEntry.amount === receivable);
            check(`借款组合${stage}真实结算只入账一次`, database(`SELECT COUNT(*) FROM hr_audit_log WHERE tenant_id=100000
              AND business_domain='HR_ADVANCE' AND business_id=${main} AND operation_type='SETTLEMENT_POST';`) === '1');
          } else if (stage === 'restored') {
            const refund = ledger.find(item => item.reversalOf === originalEntry?.id);
            check('反向真实收款及重放后恢复100元余额并保留原还款', current.outstanding === '100.00' && current.repaid === '0.00'
              && current.reserved === salaryReserved && current.writtenOff === '0.00' && ledger.length === restoredEntryCount && originalEntry?.status === 'REVERSED'
              && originalEntry.amount === receivable && refund?.amount === `-${receivable}` && refund.status === 'POSTED'
              && refund.settlement === observation.reversalId && refund.type === 'SETTLEMENT');
            check('借款冲正仅保留一次实际恢复审计', database(`SELECT COUNT(*) FROM hr_audit_log WHERE tenant_id=100000
              AND business_domain='HR_ADVANCE' AND business_id=${main} AND operation_type='SETTLEMENT_REVERSE';`) === '1');
            combination.reversalId = observation.reversalId;
          } else if (stage === 'replacementDraft') {
            const root = `/hr/settlement/${observation.id}`, read = async () => successful(await api(hr, root), '读取重新结算草稿');
            successful(await api(hr, root, { method: 'PUT', body: { version: (await read()).version, ruleId: prepared.policyId,
              sampling: { months: ['2026-01'], averagingMonths: '0.5', reason: '原单冲正后逐单重新核定' } } }), '实际核定冲正后重新结算');
            const calculated = successful(await post(hr, `${root}/calculate`, { version: (await read()).version }), '重新汇集恢复后的借款余额');
            const item = calculated.items.find(value => value.sourceBizType === 'HR_ADVANCE');
            check('冲正后新结算再次汇集应收本金且草稿不新增占用', calculated.missingRequirements.length === 0
              && String(item?.sourceBizId) === main && item.amount === receivable && !item.posted
              && JSON.stringify(balance()) === JSON.stringify(current) && JSON.stringify(entries()) === JSON.stringify(ledger));
            observation.row = calculated;
            combination.replacementDraftId = observation.id;
          } else throw new Error('Unknown advance settlement observation');
          if (payrollMode) verifySettlementPayrollStage({ database, check, payroll, stage, ledger, settlementId,
            reversalId: observation.reversalId || combination.reversalId, row: observation.row });
          if (fullSources) {
            const sourceContext = { database, check, stage, settlementId, employeeId,
              reversalId: observation.reversalId || combination.reversalId, row: observation.row };
            verifySettlementLeaveStage({ ...sourceContext, leaves });
            verifySettlementTrainingStage({ ...sourceContext, training });
            if (referralMode) verifySettlementReferralStage({ ...sourceContext, referral, payroll });
          }
          stages.push(stage);
          console.log(`H2_ADVANCE_SETTLEMENT_STAGE: stage=${stage}; outstanding=${balance().outstanding}; reserved=${balance().reserved}; entries=${entries().length}`);
        };
        await verifySettlementApproval({ ...context, hr, finance, employee, marker, employeeId, userId, ...prepared,
          existingSettlementId: settlementId, fundsMode: 'payment', evidence: settlementEvidence, observeSources });
        for (const stage of ['calculated', 'submitted', 'released', 'approved', 'confirmed', 'posted', 'reversalPending', 'restored', 'replacementDraft']) assert.ok(stages.includes(stage), 'Required combined stage missing');
        assert.equal(stages.filter(stage => stage === 'released').length, 4);
        check('组合链完成独立审批收付关闭及冲正页面', settlementEvidence.fundsClosed && settlementEvidence.reversalRestoredSources
          && settlementEvidence.reversalPrivateProof && settlementEvidence.approvalDesktop && settlementEvidence.approvalMobile);
        for (const handover of successful(await api(hr, `/hr/lifecycle/applications/${applicationId}/tasks`), '读取真实离职交接任务')) {
          successful(await post(hr, `/hr/lifecycle/tasks/${handover.id}/complete`), '实际办理借款员工交接');
        }
        const application = successful(await api(hr, `/hr/lifecycle/applications/${applicationId}`), '读取离职办理版本');
        const offboardState = () => database(`SELECT CONCAT(a.status,':',a.version,':',e.employee_status,':',COALESCE(CAST(e.resign_date AS CHAR),'NULL'))
          FROM hr_lifecycle_application a JOIN hr_employee e ON e.tenant_id=a.tenant_id AND e.id=a.employee_id
          WHERE a.tenant_id=100000 AND a.id=${applicationId};`);
        const beforeOffboard = offboardState();
        for (const kind of ['employee', 'event']) {
          const trigger = `h2as_${kind}_${caseTag}`;
          const target = kind === 'employee' ? 'UPDATE ON hr_employee' : 'INSERT ON outbox_event';
          const condition = kind === 'employee' ? `NEW.id=${employeeId} AND NEW.employee_status='RESIGNED'`
            : `NEW.aggregate_id=${employeeId} AND NEW.event_type='EMPLOYEE_OFFBOARDED'`;
          database(`DELIMITER $$
            CREATE TRIGGER ${trigger} BEFORE ${target} FOR EACH ROW
            BEGIN IF NEW.tenant_id=100000 AND ${condition} THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='H2_OFFBOARD_ATOMIC_FAULT'; END IF; END$$
            DELIMITER ;`);
          try {
            const failed = await post(hr, `/hr/lifecycle/applications/${applicationId}/complete`, { version: application.version });
            check(`实际离职${kind}保存故障返回失败并回滚申请和员工状态`, failed.status === 500 && failed.body?.code !== 200
              && offboardState() === beforeOffboard && database(`SELECT COUNT(*) FROM outbox_event WHERE tenant_id=100000
                AND event_type='EMPLOYEE_OFFBOARDED' AND aggregate_id=${employeeId};`) === '0');
            check(`实际离职${kind}故障准确保留跨服务账号状态`, database(`SELECT status FROM sys_user WHERE tenant_id=100000 AND user_id=${userId};`) === (kind === 'employee' ? '0' : '1'));
          } finally { database(`DROP TRIGGER ${trigger};`); }
          await new Promise(resolve => setTimeout(resolve, 5100));
        }
        successful(await post(hr, `/hr/lifecycle/applications/${applicationId}/complete`, { version: application.version }), '实际完成借款员工离职并停用账号');
        const eventId = await waitFor(() => database(`SELECT event_id FROM outbox_event WHERE tenant_id=100000 AND event_type='EMPLOYEE_OFFBOARDED' AND aggregate_id=${employeeId};`), Boolean, 'Actual employee offboard event missing');
        const digest = createHash('sha256');
        for (const value of ['cloudflow-event-consumer-group:cloudflow-service-workflow', '100000', eventId]) {
          const bytes = Buffer.from(value), size = Buffer.alloc(4); size.writeInt32BE(bytes.length); digest.update(size).update(bytes);
        }
        const eventKey = 'cloudflow:event:idem:' + digest.digest('hex');
        await waitFor(() => redis('HGET', eventKey, 'state'), value => value === 'DONE', 'Actual offboard delivery incomplete');
        check('离职实际生效停用账号且保留冲正后的应还本金', database(`SELECT employee_status FROM hr_employee WHERE tenant_id=100000 AND id=${employeeId};`) === 'RESIGNED'
          && database(`SELECT status FROM sys_user WHERE tenant_id=100000 AND user_id=${userId};`) === '1' && balance().outstanding === '100.00'
          && database(`SELECT COUNT(*) FROM hr_employee e JOIN hr_lifecycle_application a ON a.tenant_id=e.tenant_id AND a.employee_id=e.id
            WHERE e.tenant_id=100000 AND e.id=${employeeId} AND a.id=${applicationId} AND e.resign_date=a.effective_date AND a.status='COMPLETED';`) === '1');
        const completedState = offboardState();
        await new Promise(resolve => setTimeout(resolve, 5100));
        successful(await post(hr, `/hr/lifecycle/applications/${applicationId}/complete`, { version: application.version }), '重复完成沿用原离职事实');
        check('重复完成不改写员工离职日期或重复发布事件', offboardState() === completedState
          && database(`SELECT COUNT(*) FROM outbox_event WHERE tenant_id=100000 AND event_type='EMPLOYEE_OFFBOARDED' AND aggregate_id=${employeeId};`) === '1');
        combination.offboardAtomicity = true; combination.offboardRepeat = true;
        if (payrollMode) combination.payrollCombination = true;
        if (fullSources) combination.leaveTrainingCombination = true;
        if (referralMode) combination.referralCombination = true;
        combination.settlementId = settlementId; combination.stages = stages; combination.settlement = settlementEvidence;
        combination.resignationCompleted = true; combination.http = true;
      },
    });
  } catch (error) { failure = error; }
  finally {
    try {
      check('组合验证原借款逐行保持且原配置授权恢复', original() === before && evidence.cleanup === true); combination.restoration = true;
      const businessAfter = retainedBusiness(); combination.preservation.after = businessAfter;
      for (const [table, digest] of Object.entries(businessBefore)) check(`组合验证保持原${table}业务记录`, businessAfter[table] === digest);
      combination.preservation.kept = retainedTables.length > 0;
      journal('preservation-verified', { businessAfter, restored: combination.restoration });
    }
    catch (error) { failure = new AggregateError([failure, error].filter(Boolean), 'Combined advance settlement or restoration failed'); }
  }
  let files = 0, leaks = 0;
  for (const service of state.services) {
    const directory = path.join(state.run, service.name), names = await fs.readdir(path.join(directory, 'logs')).catch(error => { if (error.code === 'ENOENT') return []; throw error; });
    for (const name of ['stdout.log', 'stderr.log', ...names.filter(name => name.endsWith('.log')).map(name => path.join('logs', name))]) {
      const result = await scanSecretStream(createReadStream(path.join(directory, name)), [...secrets]); files++; leaks += result.leaks;
    }
  }
  const audit = await scanOwnedAuditLogs(state, [...secrets], { log: '0', error: '0', audit: '0' });
  check('借款结算组合服务与审计日志无凭据泄漏', leaks === 0 && audit.leaks === 0); combination.secrets = true;
  console.log('H2_ADVANCE_SETTLEMENT_SECRET_SCAN: ' + JSON.stringify({ files, values: secrets.size, leaks, databaseLeaks: audit.leaks }));
  if (failure) throw failure;
}
