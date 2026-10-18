import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { createD1LeaveRuntime } from './runtime-checks/d1-leave-runtime.mjs';

const root = 'D:/CloudFlowPro';
assert.ok(process.argv.includes('--d1-payroll-effects'));
const output = path.resolve(process.argv[process.argv.indexOf('--output') + 1]);
assert.match(path.basename(output), /^d1-payroll-effects-live-20261005-r[1-9][0-9]*$/);
assert.ok(!fs.existsSync(path.join(output, 'result.json')));
const sourcePath = path.join(path.dirname(output), 'd1-ledger-rules-live-20261005-r5');
const readSource = name => JSON.parse(fs.readFileSync(path.join(sourcePath, name), 'utf8').replace(/^\uFEFF/, ''));
assert.equal(readSource('result.json').passed, true);
const source = readSource('fixture.json');
const runtime = await createD1LeaveRuntime(root, output);
const { check, checks, requests, database, rows, api, ok, sessions, sensitive, browserErrors } = runtime;
const marker = 'D1W-' + randomUUID().replaceAll('-', '').slice(0, 12);
const fixture = { marker, employeeId: source.employeeId, periodId: source.periodId, sourceRound: 'ledger-rules-r5', types: {}, requests: [], restorations: {} };
const evidence = { approval: false, negative: false, payroll: false, snapshot: false, preservation: false, restoration: false, secrets: false };
const id = value => { const result = String(value); assert.match(result, /^[1-9]\d*$/); return result; };
const sql = value => `CONVERT(X'${Buffer.from(String(value)).toString('hex')}' USING utf8mb4)`;
const hash = value => createHash('sha256').update(value).digest('hex');
const save = () => fs.writeFileSync(path.join(output, 'fixture.json'), JSON.stringify(fixture, null, 2));
const base = '/hr/attendance/leave', ess = '/hr/ess/leave', pay = '/hr/compensation/payroll', wf = '/workflow/wf';
const employeeId = id(fixture.employeeId);
const tables = [['hr_leave_ledger','ledger_id'],['hr_leave_quota','id'],['hr_time_request','id'],['hr_comp_change','id'],['hr_salary_slip','id'],
  ['hr_employee_comp','id'],['hr_tax_profile','id'],['hr_tax_slab','slab_id'],['hr_payroll_period','period_id']];
const boundaries = tables.map(([table,key]) => [table,key,database(`SELECT COALESCE(MAX(${key}),0) FROM ${table}`)]);
const preserved = () => hash(JSON.stringify(boundaries.map(([table,key,limit]) => database(`SELECT * FROM ${table} WHERE ${key}<=${limit} ORDER BY ${key}`))));
const originalHash = preserved();
let employeeBody, originalConfig, bound = false, configChanged = false, failure;
async function until(read, accept, label, timeout = 120000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { const value = await read(); if (accept(value)) return value; await new Promise(resolve => setTimeout(resolve, 700)); }
  throw Error(label + ': observation deadline; retain original IDs');
}
const requestRow = requestId => rows(`SELECT JSON_OBJECT('id',CAST(id AS CHAR),'status',status,'instanceId',process_instance_id,'duration',duration) FROM hr_time_request WHERE tenant_id=100000 AND id=${id(requestId)}`)[0];
async function approve(typeId, date, label) {
  const duration = await ok('employee', ess + '/calculate?' + new URLSearchParams({ leaveTypeId: typeId, startTime: date + 'T09:00:00', endTime: date + 'T18:00:00' }));
  check(label + '_calculates_one_day', Number(duration) === 1);
  const requestId = id(await ok('employee', ess, 'POST', { leaveTypeId: typeId, startTime: date + ' 09:00:00', endTime: date + ' 18:00:00',
    duration: 1, unit: 'DAY', reason: marker + '-' + label, attachmentFileIds: [] }));
  fixture.requests.push(requestId); save();
  const record = await until(() => requestRow(requestId), value => !!value?.instanceId, label + ' workflow binding');
  const process = rows(`SELECT JSON_OBJECT('definition',definition_id,'applicant',CAST(start_user_id AS CHAR)) FROM wf_process_instance WHERE tenant_id=100000 AND instance_id=${sql(record.instanceId)}`)[0];
  check(label + '_owned_workflow', process.definition === fixture.definitionId && process.applicant === sessions.employee.identity.userId);
  for (const [actor,node] of [['admin','manager'],['hr','hr']]) {
    const tasks = await until(() => rows(`SELECT JSON_OBJECT('id',task_id,'actor',CAST(assignee AS CHAR),'node',node_key) FROM wf_task WHERE tenant_id=100000 AND instance_id=${sql(record.instanceId)} AND status='TODO'`),
      values => values.length === 1 && values[0].node === node, label + ' task ' + node);
    check(label + '_' + node + '_real_assignee', tasks[0].actor === sessions[actor].identity.userId);
    await ok(actor, wf + '/complete', 'POST', { taskId: tasks[0].id, action: 'APPROVE', comment: marker, variables: {} });
  }
  await until(() => requestRow(requestId), value => value.status === 'APPROVED', label + ' callback');
  check(label + '_single_actual_application', database(`SELECT COUNT(*) FROM hr_leave_ledger WHERE tenant_id=100000 AND employee_id=${employeeId} AND source_biz_type='HR_TIME_REQUEST' AND source_biz_id=${sql(requestId)} AND transaction_type='APPLICATION' AND leave_days=-1`) === '1');
  return requestId;
}
function verifySlip(slip, label) {
  const components = slip.components || [];
  const cash = components.filter(value => value.name === 'LEAVE_ENCASHMENT');
  check(label + '_exact_encashment_source_and_component', cash.length === 1 && Number(cash[0].amount) === 123.45
    && String(cash[0].changeId) === source.salaryChangeId && String(cash[0].salaryComponentId) === source.components.cash
    && cash[0].salaryComponentCode === source.componentBody.componentCode && cash[0].salaryComponentIdentity === 'VERIFIED');
  const leave = components.filter(value => value.name === '无薪及部分带薪假扣款');
  check(label + '_unpaid100_partial40_paid0', leave.length === 1 && Number(leave[0].amount) === 140);
  check(label + '_gross_and_net', Number(slip.grossTotal) === 2823.45 && Number(slip.netTotal) === 2683.45 && Number(slip.taxAmount) === 0);
}
try {
  check('source_employee_marker_and_unbound', database(`SELECT CONCAT(employee_no,':',COALESCE(CAST(user_id AS CHAR),'NULL')) FROM hr_employee WHERE tenant_id=100000 AND id=${employeeId} AND deleted=0`) === source.marker + ':NULL');
  check('employee_account_initially_unbound', database(`SELECT COUNT(*) FROM hr_employee WHERE tenant_id=100000 AND user_id=${id(sessions.employee.identity.userId)} AND deleted=0`) === '0');
  employeeBody = rows(`SELECT JSON_OBJECT('employeeNo',employee_no,'name',name,'gender',gender,'deptId',CAST(dept_id AS CHAR),'employeeType',employee_type,'employeeStatus',employee_status,'hireDate',hire_date) FROM hr_employee WHERE tenant_id=100000 AND id=${employeeId}`)[0];
  bound = true; await ok('admin', '/hr/employees/' + employeeId, 'PUT', { ...employeeBody, userId: sessions.employee.identity.userId });
  fixture.employeeBody = employeeBody; save();
  const configId = id(database("SELECT config_id FROM sys_config WHERE tenant_id=100000 AND config_key='sys.hr.leave.processKey' AND config_scope='1'"));
  const config = await ok('admin', '/auth/system/config/' + configId);
  originalConfig = Object.fromEntries(['configId','tenantId','configScope','configKey','configName','configType','configValue','remark'].map(key => [key, config[key] ?? null]));
  fixture.originalConfig = originalConfig; save();
  const definitions = rows(`SELECT JSON_OBJECT('id',definition_id,'digest',SHA2(model_json,256)) FROM wf_process_definition WHERE tenant_id=100000 AND process_key=${sql(config.configValue)} AND status='PUBLISHED' AND deleted=0 ORDER BY version DESC`);
  check('original_workflow_available', definitions.length > 0); fixture.originalDefinition = definitions[0];
  const definition = await ok('admin', wf + '/definition/' + definitions[0].id);
  const model = typeof definition.modelJson === 'string' ? JSON.parse(definition.modelJson) : structuredClone(definition.modelJson);
  const stages = model.nodes.filter(value => value.type === 'APPROVAL');
  check('original_two_stage_model', stages.length === 2 && stages[0].id === 'manager' && stages[1].id === 'hr');
  for (const [index,actor] of ['admin','hr'].entries()) { stages[index].approverType = 'USER'; stages[index].approverValue = sessions[actor].identity.userId; }
  const created = await ok('admin', wf + '/definition/save', 'POST', { processKey: marker, processName: marker, modelJson: JSON.stringify(model), formId: null, startPermissionType: 'ALL', startPermissionValue: '[]' });
  fixture.definitionId = created.definitionId || created.id; save(); await ok('admin', wf + '/definition/deploy/' + fixture.definitionId, 'POST');
  configChanged = true; await ok('admin', '/auth/system/config', 'PUT', { ...originalConfig, configValue: marker });
  const options = { unpaid: { lwpFlag: 1 }, partial: { partialPaidFlag: 1, salaryFractionPerDay: 0.6 }, paid: {}, negative: { allowNegativeFlag: 1 } };
  for (const [name, fields] of Object.entries(options)) {
    const body = { leaveCode: marker + '-' + name, leaveName: marker + '-' + name, unit: 'DAY', needQuota: 1, isPaid: 1, status: 1,
      maxDaysPerYear: 10, roundingMode: 'NONE', includeHolidayFlag: 1, ...fields };
    fixture.types[name] = { id: id(await ok('admin', '/hr/attendance/leave-types', 'POST', body)), body }; save();
  }
  fixture.policyId = id(await ok('admin', base + '/policies', 'POST', { policyCode: marker, policyName: marker, status: 'ACTIVE' })); save();
  await ok('admin', base + '/policies/' + fixture.policyId + '/details', 'PUT', Object.entries(fixture.types).map(([name,value]) => ({ leaveTypeId: value.id, annualDays: name === 'negative' ? 1 : 5 })));
  check('one_employee_policy_assignment', Number(await ok('admin', base + '/assignments', 'POST', { employeeIds: [employeeId], policyId: fixture.policyId, periodId: fixture.periodId, assignmentBasis: 'PERIOD', carryForwardFlag: 0 })) === 1);
  await ok('admin', base + '/ledger', 'POST', { employeeId, leaveTypeId: fixture.types.negative.id, periodId: fixture.periodId, transactionType: 'ADJUSTMENT', quantity: -1, sourceId: marker + '-zero', remark: marker });
  for (const [name,day] of [['unpaid','06'],['partial','07'],['paid','08'],['negative','09']]) await approve(fixture.types[name].id, '2026-10-' + day, name);
  evidence.approval = true;
  check('approved_negative_leave_ends_at_minus_one', database(`SELECT available_quota FROM hr_leave_quota WHERE tenant_id=100000 AND employee_id=${employeeId} AND leave_type_id=${id(fixture.types.negative.id)} AND period_id=${id(fixture.periodId)} AND deleted=0`) === '-1.00'); evidence.negative = true;
  for (const [name,changed] of [['unpaid',{lwpFlag:0}],['partial',{salaryFractionPerDay:0.2}],['paid',{lwpFlag:1}]]) {
    await ok('admin', '/hr/attendance/leave-types/' + fixture.types[name].id, 'PUT', { ...fixture.types[name].body, ...changed });
  }
  const periods = await ok('admin', pay + '/config/periods');
  const overlap = periods.filter(value => value.startDate <= '2026-10-31' && value.endDate >= '2026-10-05');
  check('payroll_target_range_available', overlap.length === 0 || overlap.length === 1 && overlap[0].startDate === '2026-10-05' && overlap[0].endDate === '2026-10-31' && overlap[0].status === 'OPEN');
  fixture.payrollPeriodId = overlap.length ? id(overlap[0].periodId) : id(await ok('admin', pay + '/periods', 'POST', { periodName: marker, frequency: 'MONTHLY', startDate: '2026-10-05', endDate: '2026-10-31', payDate: '2026-10-31' })); save();
  const componentId = id(await ok('admin', '/hr/compensation/components', 'POST', { componentCode: marker + '-BASE', componentName: marker + '-固定月薪', componentType: 'FIXED', category: 'EARNING', taxable: 1, status: 1, sortOrder: 999 }));
  fixture.fixedComponentId = componentId;
  fixture.structureId = id(await ok('admin', '/hr/compensation/structures', 'POST', { structureCode: marker, structureName: marker, status: 1, componentConfig: {} })); save();
  await ok('admin', pay + '/structures/' + fixture.structureId, 'PUT', { salaryBasis: 'MONTHLY', prorationBasis: 'CALENDAR_DAYS', benefitTiming: 'FIRST_PAYROLL' });
  fixture.compensationId = id(await ok('admin', '/hr/compensation/employee-compensations', 'POST', { employeeId, structureId: fixture.structureId, componentValues: { [componentId]: '3100.00' }, totalSalary: '3100.00', effectiveDate: '2026-01-01', status: 'ACTIVE' })); save();
  const slab = { slabName: marker + '-仅用于本机验证', region: '隔离测试', effectiveFrom: '2026-01-01', effectiveTo: '2026-12-31', thresholdAmount: 0, status: 'DRAFT', remark: '合成零税率样本，仅绑定本次验证员工，不代表正式政策' };
  fixture.slabId = id(await ok('admin', pay + '/tax-slabs', 'POST', slab)); save();
  await ok('admin', pay + '/tax-slabs/' + fixture.slabId + '/details', 'PUT', Array.from({ length: 7 }, (_,index) => ({ levelNo: index + 1, fromAmount: index * 10000, toAmount: index === 6 ? null : (index + 1) * 10000, taxRate: 0, quickDeduction: 0 })));
  await ok('admin', pay + '/tax-slabs/' + fixture.slabId, 'PUT', { ...slab, status: 'ACTIVE' });
  fixture.profileId = id(await ok('admin', '/hr/compensation/tax-profiles', 'POST', { employeeId, taxSlabId: fixture.slabId, taxResidenceCity: '隔离测试', status: 'ACTIVE' })); save();
  const preview = await ok('admin', pay + '/slips/preview?employeeId=' + employeeId + '&periodId=' + fixture.payrollPeriodId); verifySlip(preview, 'preview');
  fixture.batchId = id(await ok('admin', pay + '/batches', 'POST', { payrollPeriodId: fixture.payrollPeriodId, employeeIds: [employeeId], validateAttendanceFlag: 0, deductUnverifiedFlag: 0 })); save();
  fixture.executeNo = await ok('admin', pay + '/batches/' + fixture.batchId + '/calculate', 'POST', {}); save();
  const batch = await until(() => ok('admin', pay + '/batches/' + fixture.batchId), value => value.batch.status !== 'CALCULATING', 'Original payroll task', 180000);
  check('real_payroll_batch_calculated_one_employee', batch.batch.status === 'CALCULATED' && batch.employees.length === 1 && batch.employees[0].calcStatus === 'SUCCESS' && String(batch.employees[0].employeeId) === employeeId);
  fixture.slipId = id(batch.employees[0].salarySlipId); save();
  const draft = await ok('admin', pay + '/slips/' + fixture.slipId); verifySlip(draft, 'actual_draft');
  await ok('admin', pay + '/batches/' + fixture.batchId + '/submit', 'POST', {});
  const submitted = await ok('admin', pay + '/slips/' + fixture.slipId); verifySlip(submitted, 'submitted');
  check('actual_slip_submitted', submitted.status === 'SUBMITTED');
  check('actual_slip_integrity_digest', /^[a-f0-9]{64}$/i.test(database(`SELECT digest_sha256 FROM hr_salary_slip WHERE tenant_id=100000 AND id=${fixture.slipId}`)));
  fs.writeFileSync(path.join(output, 'payroll.json'), JSON.stringify({ employeeId, batchId: fixture.batchId, slipId: fixture.slipId, gross: submitted.grossTotal, net: submitted.netTotal, components: submitted.components }, null, 2));
  evidence.payroll = true; evidence.snapshot = true;
} catch (error) { failure = error; }
finally {
  const restore = async (label, action) => { try { await action(); fixture.restorations[label] = true; } catch (error) { fixture.restorations[label] = false; failure ||= error; } save(); };
  await restore('pendingRequests', async () => {
    for (const requestId of fixture.requests) { const value = requestRow(requestId); if (['PENDING','SUBMITTED','APPROVING','APPLYING'].includes(value.status)) await ok('admin', '/hr/attendance/time-requests/' + requestId + '/cancel', 'POST'); }
  });
  await restore('workflowConfig', async () => {
    if (configChanged) { const current = await ok('admin', '/auth/system/config/' + originalConfig.configId); check('owned_workflow_config_still_current', current.configValue === marker); await ok('admin', '/auth/system/config', 'PUT', originalConfig);
      check('original_workflow_config_restored', (await ok('admin', '/auth/system/config/' + originalConfig.configId)).configValue === originalConfig.configValue); }
  });
  await restore('accountBinding', async () => {
    if (bound) { check('owned_binding_before_restore', database(`SELECT user_id FROM hr_employee WHERE tenant_id=100000 AND id=${employeeId}`) === sessions.employee.identity.userId);
      await ok('admin', '/hr/employees/' + employeeId, 'PUT', { ...employeeBody, userId: null });
      check('employee_account_unbound_again', database(`SELECT COUNT(*) FROM hr_employee WHERE tenant_id=100000 AND user_id=${id(sessions.employee.identity.userId)} AND deleted=0`) === '0'); }
  });
  evidence.restoration = Object.values(fixture.restorations).every(Boolean);
  try { check('all_original_business_and_source_encashment_preserved', originalHash === preserved()); check('no_browser_errors', browserErrors.length === 0); evidence.preservation = true; } catch (error) { failure ||= error; }
  try { const scan = await runtime.scan(); evidence.secrets = true; console.log('D1_PAYROLL_EFFECTS_LOG_SCAN: ' + JSON.stringify(scan)); } catch (error) { failure ||= error; }
  await runtime.close(); save();
  const message = failure ? String(failure.message).split('\n')[0].slice(0, 220) : undefined;
  const safe = message && [...sensitive].every(value => !message.includes(value)) ? message : failure ? 'D1 payroll effects failed' : undefined;
  fs.writeFileSync(path.join(output, 'requests.json'), JSON.stringify(requests, null, 2));
  fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify({ marker, passed: !failure && Object.values(evidence).every(Boolean), ...evidence, checks, requests: requests.length, failure: safe }, null, 2));
  console.log(`D1_PAYROLL_EFFECTS_SUMMARY: checks=${checks.length}; failed=${failure ? 1 : 0}; requests=${requests.length}; restoration=${evidence.restoration}`);
  if (failure) { console.log('D1_PAYROLL_EFFECTS_FAILURE: ' + safe); process.exitCode = 1; }
}
