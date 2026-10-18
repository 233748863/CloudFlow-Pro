import { hundredths, decimal, weightedMinutes, creditDelta, payAmount, restorationPending, acceptanceCoverage } from '../batch-h/hr09-evidence.mjs';
import { payrollWorkDates, conditionalPayrollTotals, syntheticPayGrade } from '../batch-h/hr09-payroll.mjs';
import { containsPayLogLeak } from '../batch-h/hr09-pay-privacy.mjs';
import { hr09ActorDefinitions } from '../batch-h/hr09-actors.mjs';
import { actorRolePayload } from '../batch-h/hr09-finance-actor.mjs';
import { limitDimensions, limitHitMatches } from '../batch-h/hr09-limits.mjs';
import { payBaselinePayloads, encryptionBaselineRestored } from '../batch-h/hr09-pay-baseline.mjs';
import { correctionTax, correctionWorkflowModel, correctionLogLeak, correctionActorPayload } from '../batch-h/hr09-pay-correction.mjs';
import { periodActorPayload } from '../batch-h/hr09-periods.mjs';

let checks = 0;
const check = condition => {
  if (!condition) throw new Error(`H_HR_EVIDENCE_CHECK_FAILED_${checks + 1}`);
  checks++;
};
const fails = operation => {
  let rejected = false;
  try { operation(); } catch { rejected = true; }
  check(rejected);
};

check(hundredths('0') === 0n);
check(hundredths('1.2') === 120n);
check(hundredths('999999.99') === 99999999n);
check(decimal(1n) === '0.01');
check(decimal(100n) === '1.00');
for (const input of ['-1', '1.001', 'NaN', 'Infinity', '', null, '1e2']) fails(() => hundredths(input));
check(creditDelta(0n, 1, '1.00') === 1n);
check(creditDelta(100n, 1, '1.00') === 2n);
check(creditDelta(200n, 1, '1.00') === 2n);
check(creditDelta(0n, 1, '0.25') === 0n);
check(creditDelta(25n, 1, '0.25') === 0n);
check(creditDelta(50n, 1, '0.25') === 1n);
const minuteEntries = Array.from({ length: 60 }, () => ({ minutes: 1, ratio: '1.00' }));
check(weightedMinutes(minuteEntries) / 60n === 100n);
check(weightedMinutes([{ minutes: 1, ratio: '0.25' }, { minutes: 1, ratio: '1.00' }]) === 125n);
fails(() => weightedMinutes([{ minutes: 0, ratio: '1.00' }]));
fails(() => weightedMinutes([{ minutes: 1, ratio: '0.00' }]));
fails(() => creditDelta(-1n, 1, '1.00'));
check(payAmount(120, '20.00', '1.50') === '60.00');
check(payAmount(1, '20.00', '1.50') === '0.50');
check(payAmount(1, '1.00', '1.50') === '0.03');
fails(() => payAmount(0, '20.00', '1.50'));
fails(() => payAmount(1, '20.00', '0.00'));
check(Object.values(acceptanceCoverage({ 'overtime-registered': true, 'overtime-started': true })).every(value => !value));
check(acceptanceCoverage({ 'overtime-minimal': true }).dualApprovalAndComp);
check(!acceptanceCoverage({ security: 'true' }).accessAndReplay);
check(!acceptanceCoverage({ logs: true }).logPrivacy);
check(!acceptanceCoverage({ 'pay-log-privacy': true }).logPrivacy);
check(!acceptanceCoverage({ 'pay-correction-log-privacy': true }).logPrivacy);
check(!acceptanceCoverage({ 'pay-log-privacy': true, 'pay-correction-log-privacy': 'true' }).logPrivacy);
check(acceptanceCoverage({ 'pay-log-privacy': true, 'pay-correction-log-privacy': true }).logPrivacy);
check(payrollWorkDates('2026-08').length === 21);
check(payrollWorkDates('2026-08')[0] === '2026-08-03');
check(payrollWorkDates('2026-08').at(-1) === '2026-08-31');
check(payrollWorkDates('2026-02').length === 20);
fails(() => payrollWorkDates('2026-13'));
fails(() => payrollWorkDates('2027-08'));
check(conditionalPayrollTotals('100.00', '1.05').tax === '10.11');
check(conditionalPayrollTotals('100.00', '1.05').net === '90.94');
check(conditionalPayrollTotals('100.00', '1.04').tax === '10.10');
fails(() => conditionalPayrollTotals('1.001', '0'));
const grade = syntheticPayGrade('H-20260914-HR09', '100.00');
check(grade.gradeCode === 'H-20260914-HR09-PAY' && grade.currency === 'CNY');
check(grade.minSalary === '100.00' && grade.midSalary === '100.00' && grade.maxSalary === '100.00');
fails(() => syntheticPayGrade('SHARED', '100.00'));
fails(() => syntheticPayGrade('H-20260914-HR09', '0.00'));
fails(() => syntheticPayGrade('H-20260914-HR09', '1.001'));
check(containsPayLogLeak({ hourlyRate: '20.00' }, []));
check(containsPayLogLeak({ settlementAmount: 20 }, []));
check(containsPayLogLeak({ nested: { note: 'SENSITIVE_MARKER' } }, ['SENSITIVE_MARKER']));
check(!containsPayLogLeak({ hourlyRate: '[REDACTED]' }, []));
check(!containsPayLogLeak({ requestId: '100', settlementAmount: null, code: 'INVALID_REQUEST' }, []));
check(containsPayLogLeak({ params: JSON.stringify({ hourlyRate: '20.00' }) }, []));
check(containsPayLogLeak({ exception: 'rejected value [redacted-test-input]' }, []));
check(containsPayLogLeak({ after: { hourly_rate_cipher: 'PRIVATE_TEST' } }, []));
check(!containsPayLogLeak({ params: '[REDACTED]', exception: 'INVALID_REQUEST' }, []));
check(Object.keys(hr09ActorDefinitions).length === 5);
check(hr09ActorDefinitions.periodemployee.roleId === '5' && hr09ActorDefinitions.periodemployee.sourceUserId === '5');
check(hr09ActorDefinitions.finance.roleId === '3' && hr09ActorDefinitions.finance.sourceUserId === '3');
check(hr09ActorDefinitions.payapprover.roleId === '3' && hr09ActorDefinitions.payapprover.sourceUserId === '3');
check(hr09ActorDefinitions.manager.roleId === '2' && hr09ActorDefinitions.manager.sourceUserId === '2');
check(hr09ActorDefinitions.hrpeer.roleId === '4' && hr09ActorDefinitions.hrpeer.sourceUserId === '4');
check(!Object.hasOwn(hr09ActorDefinitions, 'admin'));
check(!Object.hasOwn(hr09ActorDefinitions, '__proto__'));
check(!restorationPending());
check(!restorationPending({ restorationRequired: false, payroll: { restorationRequired: false } }));
check(restorationPending({ restorationRequired: true }));
check(restorationPending({ restorationRequired: false, payroll: { restorationRequired: true } }));
check(restorationPending({ restorationRequired: true, payroll: { restorationRequired: false } }));
check(restorationPending({ financialIdentity: { restorationRequired: true } }));
check(restorationPending({ compLeave: { restorationRequired: true } }));
check(!restorationPending({ compLeave: { restorationRequired: false } }));
check(acceptanceCoverage({ 'comp-leave-consumption': true }).compLeaveConsumption);
check(restorationPending({ limits: { restorationRequired: true } }));
check(!restorationPending({ limits: { restorationRequired: false } }));
check(JSON.stringify(limitDimensions([{ dimension: 'MONTH', effect: 'WARN' }, { dimension: 'DAY', effect: 'BLOCK' }]))
  === '["DAY:BLOCK","MONTH:WARN"]');
check(limitDimensions([]).length === 0);
fails(() => limitDimensions(null));
fails(() => limitDimensions([{ dimension: 'YEAR', effect: 'BLOCK' }]));
fails(() => limitDimensions([{ dimension: 'DAY', effect: 'ALLOW' }]));
check(limitHitMatches({ dimension: 'HR_OVERTIME_DAY', effect: 'BLOCK', result: 'BLOCK', threshold: '3.00', actual: '3.02' }, 'DAY', 'BLOCK', 180, 181));
check(limitHitMatches({ dimension: 'HR_OVERTIME_MONTH', effect: 'WARN', result: 'WARN', threshold: '10.00', actual: '10.02' }, 'MONTH', 'WARN', 600, 601));
check(!limitHitMatches({ dimension: 'HR_OVERTIME_DAY', effect: 'BLOCK', result: 'BLOCK', threshold: '3.00', actual: '3.00' }, 'DAY', 'BLOCK', 180, 181));
check(!limitHitMatches({ dimension: 'HR_OVERTIME_MONTH', effect: 'WARN', result: 'WARN', threshold: '10.00', actual: '10.02' }, 'DAY', 'WARN', 600, 601));
check(!limitHitMatches(null, 'DAY', 'BLOCK', 180, 181));
check(!limitHitMatches({}, 'DAY', 'BLOCK', 180, 180));
check(!limitHitMatches({}, 'DAY', 'BLOCK', -1, 1));
check(!limitHitMatches({}, 'DAY', 'BLOCK', 180, 181.5));
check(restorationPending({ periodResolution: { restorationRequired: true } }));
check(!restorationPending({ periodResolution: { restorationRequired: false } }));
const periodActor = { userId: '28349057', username: 'h_20260914_finance3', tenantId: '100000', owned: 1,
  status: '0', version: 2, roleIds: ['3'], deptId: '102' };
check(JSON.stringify(periodActorPayload(periodActor, '5', '101')) === JSON.stringify({ userId: '28349057', version: 2,
  deptId: '101', status: '0', roleIds: ['5'] }));
check(periodActorPayload({ ...periodActor, roleIds: ['5'] }, '3', '102').roleIds[0] === '3');
for (const invalid of [{ userId: '3' }, { username: 'finance3' }, { tenantId: '1' }, { owned: 0 }, { status: '1' },
  { version: -1 }, { roleIds: ['3', '5'] }, { roleIds: ['1'] }]) fails(() => periodActorPayload({ ...periodActor, ...invalid }, '5', '101'));
fails(() => periodActorPayload(periodActor, '1', '101'));
fails(() => periodActorPayload(periodActor, '5', '0'));
const actor = { userId: '101', deptId: '101', status: '0', version: 1, roleIds: ['2'] };
check(JSON.stringify(actorRolePayload(actor, '3').roleIds) === '["3"]');
check(JSON.stringify(actorRolePayload({ ...actor, roleIds: ['3'] }, '2').roleIds) === '["2"]');
check(!Object.hasOwn(actorRolePayload(actor, '3'), 'password'));
fails(() => actorRolePayload({ ...actor, status: '1' }, '3'));
fails(() => actorRolePayload({ ...actor, roleIds: ['2', '3'] }, '3'));
fails(() => actorRolePayload({ ...actor, roleIds: ['1'] }, '3'));
fails(() => actorRolePayload({ ...actor, version: undefined }, '3'));
fails(() => actorRolePayload(actor, '1'));
const correctionActor = { ...actor, username: 'h_20260914_finance3', tenantId: '100000', deptId: '102', roleIds: ['3'] };
check(correctionActorPayload(correctionActor, '101').deptId === '101');
check(correctionActorPayload(correctionActor, '101').roleIds.join(',') === '3');
check(correctionActorPayload(correctionActor, '102').deptId === correctionActor.deptId);
check(!Object.hasOwn(correctionActorPayload(correctionActor, '101'), 'password'));
for (const invalid of [{ username: 'finance3' }, { tenantId: '1' }, { status: '1' }, { roleIds: ['2'] },
  { roleIds: ['3', '1'] }, { version: undefined }, { version: -1 }, { userId: '0' }]) {
  fails(() => correctionActorPayload({ ...correctionActor, ...invalid }, '101'));
}
fails(() => correctionActorPayload(correctionActor, '0'));
const baselineFixture = { employeeIds: { employee: '99' }, ids: { payGrade: '6749051', payStructure: '6849051',
  payAssignment: '7749051', payTaxProfile: '13849051', payTaxSlab: '13949051' },
  payroll: { synthetic: true, employeeId: '99', salary: '100.00',
    assignment: { employeeId: '99', gradeId: '6749051', structureId: '6849051', componentValues: {}, totalSalary: '100.00' },
    profile: { employeeId: '99', taxSlabId: '13949051', taxConfig: {} } } };
const baselinePayloads = payBaselinePayloads(baselineFixture);
check(baselinePayloads.assignment.status === 'INACTIVE' && baselinePayloads.profile.status === 'INACTIVE');
check(baselinePayloads.grade.minSalary === '100.00' && baselinePayloads.grade.midSalary === '100.00' && baselinePayloads.grade.maxSalary === '100.00');
check(!Object.hasOwn(baselineFixture.payroll.assignment, 'status'));
for (const mutate of [value => { value.payroll.synthetic = false; }, value => { value.ids.payGrade = '1'; },
  value => { value.payroll.assignment.employeeId = '1'; }, value => { value.payroll.profile.taxSlabId = '1'; },
  value => { value.payroll.salary = '***'; }, value => { value.payroll.assignment.totalSalary = '101.00'; },
  value => { value.payroll.profile.taxConfig = { secret: '***' }; }]) {
  const invalid = structuredClone(baselineFixture);
  mutate(invalid);
  fails(() => payBaselinePayloads(invalid));
}
const restoredRuntime = { requestedPhase: 'Restore', restartVerified: true, temporaryEnabled: false, restored: true, baselineEnabled: 'false' };
check(encryptionBaselineRestored(restoredRuntime));
check(!encryptionBaselineRestored({ ...restoredRuntime, requestedPhase: 'Enable' }));
check(!encryptionBaselineRestored({ ...restoredRuntime, temporaryEnabled: true }));
check(!encryptionBaselineRestored({ ...restoredRuntime, restartVerified: false }));
check(!encryptionBaselineRestored({ ...restoredRuntime, baselineEnabled: 'true' }));
check(!encryptionBaselineRestored());
check(restorationPending({ payCorrection: { restorationRequired: true } }));
check(!restorationPending({ payCorrection: { restorationRequired: false } }));
check(correctionTax('12.34', '100.00', '10.00').tax === '1.23');
check(correctionTax('12.34', '100.00', '10.00').net === '11.11');
check(correctionTax('30.00', '112.34', '11.23').tax === '3.00');
check(correctionTax('0.05', '100.05', '10.01').tax === '0.00');
fails(() => correctionTax('1.00', '0.00', '2.00'));
fails(() => correctionTax('1.001', '0.00', '0.00'));
const correctionModel = { nodes: [{ id: 'start', type: 'START' }, { id: 'finance', type: 'APPROVAL', approverType: 'ROLE', approverValue: 'finance' },
  { id: 'end', type: 'END' }], edges: [{ source: 'start', target: 'finance' }, { source: 'finance', target: 'end' }] };
const normalModel = correctionWorkflowModel(correctionModel, '99', false);
const linkedModel = correctionWorkflowModel(correctionModel, '99', true);
check(normalModel.nodes[1].approverType === 'USER' && normalModel.nodes[1].approverValue === '99');
check(linkedModel.nodes[1].approverType === 'VARIABLE_USER' && linkedModel.nodes[1].approverValue === 'hCorrectionApproverIds');
check(linkedModel.nodes[1].signType === 'ANY' && linkedModel.nodes[1].approveSelf === 'ALLOW');
check(correctionModel.nodes[1].approverType === 'ROLE' && !Object.hasOwn(correctionModel.nodes[1], 'signType'));
fails(() => correctionWorkflowModel({ nodes: [], edges: [] }, '99', false));
fails(() => correctionWorkflowModel(correctionModel, '0', true));
check(correctionLogLeak({ diffAmount: '1.00' }, 'marker'));
check(correctionLogLeak({ after: '{"grossAdjustment":1}' }, 'marker'));
check(correctionLogLeak({ params: 'grossAdjustment=1.20' }, 'marker'));
check(correctionLogLeak({ reason: 'test-marker' }, 'marker'));
check(!correctionLogLeak({ diffAmount: '[REDACTED]', hourlyRate: '***' }, 'marker'));
check(!correctionLogLeak({ originalSlipId: '99', correctionId: '101', status: 'APPLIED' }, 'marker'));
check(correctionLogLeak({ hourlyRateCipher: 'opaque-test-value' }, 'private-marker'));
check(correctionLogLeak({ grossTotal: 'private-value' }, 'private-marker'));
check(correctionLogLeak('rejectedValue=[private-value]', 'private-marker'));
check(!correctionLogLeak({ hourlyRateCipher: '[REDACTED]' }, 'private-marker'));
console.log(`PASS HR09证据纯函数检查 ${checks} 项；不连接数据库，不调用业务接口`);
