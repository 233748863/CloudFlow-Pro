import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { createD1LeaveRuntime } from './runtime-checks/d1-leave-runtime.mjs';
import { authenticateFormTest } from './runtime-checks/form-browser-auth.mjs';

const root = 'D:/CloudFlowPro';
assert.ok(process.argv.includes('--d1-leave') && process.argv.includes('--d3-payroll-corrections'));
const output = fs.realpathSync(process.argv[process.argv.indexOf('--output') + 1]);
assert.match(path.basename(output), /^d3-payroll-corrections-20261006-r[1-9][0-9]*$/);
assert.ok(!fs.existsSync(path.join(output, 'result.json')));
const read = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
assert.ok(process.argv.includes('--source-deduction-round'));
const sourceRound = process.argv[process.argv.indexOf('--source-deduction-round') + 1];
assert.match(sourceRound || '', /^r[1-9][0-9]*$/);
const sourceFolder = 'd3-payroll-deductions-20261006-' + sourceRound;
const prior = read(path.join(path.dirname(output), sourceFolder, 'fixture.json'));
const sourceResult = read(path.join(path.dirname(output), sourceFolder, 'result.json'));
for (const flag of ['passed', 'approval', 'attendance', 'deductions', 'mixedBatch', 'snapshot', 'preservation', 'restoration', 'secrets']) assert.equal(sourceResult[flag], true);
assert.match(prior.marker, /^D3D-[a-f0-9]{12}$/);
assert.match(prior.month, /^\d{4}-\d{2}$/);
const main = prior.employees[0], originalSlipId = String(prior.slipId);
for (const value of [main.id, originalSlipId, String(prior.slabId), String(prior.periodId)]) assert.match(value, /^[1-9]\d*$/);
const currentPeriodId = String(prior.periodId), taxSlabId = String(prior.slabId);
const [sourceYear, sourceMonth] = prior.month.split('-').map(Number);
const nextMonth = new Date(Date.UTC(sourceYear, sourceMonth, 1)).toISOString().slice(0, 7);
const nextMonthEnd = new Date(Date.UTC(sourceYear, sourceMonth + 1, 0)).toISOString().slice(0, 10);
const fixture = { marker: 'D3C-' + randomUUID().replaceAll('-', '').slice(0, 12), source: sourceFolder, corrections: [], restorations: {}, screenshots: [], originalSlipId, employeeId: main.id, currentPeriodId, taxSlabId, nextMonth };
const save = () => fs.writeFileSync(path.join(output, 'fixture.json'), JSON.stringify(fixture, null, 2));
save();
const hash = value => createHash('sha256').update(value).digest('hex');
const id = value => { const text = String(value); assert.match(text, /^[1-9]\d*$/); return text; };
const literal = value => "CONVERT(X'" + Buffer.from(String(value)).toString('hex') + "' USING utf8mb4)";
const cents = value => { const text = String(value); const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(text); assert.ok(match, 'Exact decimal expected'); return (BigInt(match[2]) * 100n + BigInt((match[3] || '').padEnd(2, '0'))) * (match[1] ? -1n : 1n); };
const halfUpTenth = value => value >= 0n ? (value + 5n) / 10n : -((-value + 5n) / 10n);
let runtime, failure, originalConfig, originalTax, bindingChanged = false, taxChanged = false, configChanged = false;
let originalDigests, originalRoles, protectedEmployee, protectedTax, originalSalary;
const evidence = { approval: false, samePeriod: false, negative: false, nextPeriod: false, boundaries: false, ui: false, audits: false, preservation: false, restoration: false, secrets: false };
const tables = [['hr_employee','id'], ['hr_employee_comp','id'], ['hr_comp_component','id'], ['hr_comp_structure','id'], ['hr_comp_change','id'],
  ['hr_tax_profile','id'], ['hr_tax_deduction','id'], ['hr_tax_slab','slab_id'], ['hr_tax_slab_detail','slab_detail_id'],
  ['hr_payroll_period','period_id'], ['hr_payroll_batch','batch_id'], ['hr_payroll_batch_employee','batch_employee_id'],
  ['hr_salary_slip','id'], ['hr_payroll_correction','correction_id'], ['hr_attendance_record','id'], ['hr_attendance_monthly','id']];
const bounds = {}, columns = {};
const pay = '/hr/compensation/payroll', wf = '/workflow/wf', ess = '/hr/ess/salary-slips';
let page, previousTaxable = 263527n, previousTax = 26353n;
try {
  runtime = await createD1LeaveRuntime(root, output);
  const { database, rows, sessions, check } = runtime;
  const salaryDigest = () => hash(database(`SELECT * FROM hr_salary_slip WHERE id=${originalSlipId} AND tenant_id=100000`));
  for (const [table, key] of tables) bounds[table] = database(`SELECT COALESCE(MAX(${key}),0) FROM ${table}`);
  function digestTable(table, key) {
    const digest = createHash('sha256'); let cursor = '0';
    const excluded = table === 'hr_employee' ? ` AND ${key}<>${main.id}` : table === 'hr_tax_slab' ? ` AND ${key}<>${taxSlabId}` : '';
    for (;;) {
      const end = database(`SELECT COALESCE(MAX(${key}),0) FROM (SELECT ${key} FROM ${table} WHERE ${key}>${cursor} AND ${key}<=${bounds[table]} ORDER BY ${key} LIMIT 1000) selected`);
      if (end === '0') break;
      digest.update(database(`SELECT * FROM ${table} WHERE ${key}>${cursor} AND ${key}<=${end}${excluded} ORDER BY ${key}`)); cursor = end;
    }
    return digest.digest('hex');
  }
  runtime.captureDigests = () => Object.fromEntries(tables.map(([table,key]) => [table,digestTable(table,key)]));
  runtime.roleDigest = () => hash(database('SELECT tenant_id,user_id,role_id FROM sys_user_role ORDER BY tenant_id,user_id,role_id')
    + database('SELECT tenant_id,role_id,menu_id FROM sys_role_menu ORDER BY tenant_id,role_id,menu_id'));
  for (const [table, omitted] of [['hr_employee',['user_id','update_time','update_by']], ['hr_tax_slab',['status','version','update_time','update_by']]]) {
    columns[table] = database(`SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='cloud_flow_db' AND TABLE_NAME=${literal(table)} ORDER BY ORDINAL_POSITION`).split(/\r?\n/).filter(column => !omitted.includes(column));
    assert.ok(columns[table].every(column => /^[a-z_][a-z0-9_]*$/.test(column)));
  }
  runtime.employeeDigest = () => hash(database(`SELECT ${columns.hr_employee.join(',')} FROM hr_employee WHERE id=${main.id}`));
  runtime.taxDigest = () => hash(database(`SELECT ${columns.hr_tax_slab.join(',')} FROM hr_tax_slab WHERE slab_id=${taxSlabId}`));
  originalDigests = runtime.captureDigests(); originalRoles = runtime.roleDigest();
  protectedEmployee = runtime.employeeDigest(); protectedTax = runtime.taxDigest(); originalSalary = salaryDigest();
  fixture.bounds = bounds; fixture.originalDigests = originalDigests; fixture.originalRoles = originalRoles; fixture.originalSalary = originalSalary; save();
  const interval = Math.max(5000,Number(database("SELECT config_value FROM sys_config WHERE config_key='sys.common.repeatSubmit.intervalMillis' AND config_scope='0'"))) + 150;
  assert.ok(Number.isSafeInteger(interval) && interval <= 60150);
  const writes = new Map();
  runtime.correctionApi = async (actor,url,method='GET',body) => {
    const key = hash(JSON.stringify([actor,url,method,body??null]));
    if (method !== 'GET') { const wait = (writes.get(key)||0) + interval - Date.now(); if (wait > 0) await new Promise(resolve => setTimeout(resolve,wait)); }
    try { return await runtime.api(actor,url,{method,body}); } finally { if(method!=='GET') writes.set(key,Date.now()); }
  };
  const api = runtime.correctionApi;
  const ok = runtime.correctionOk = async (actor,url,method='GET',body) => runtime.success(await api(actor,url,method,body),`${actor}_${method}_${url.split('?')[0]}`);
  const until = runtime.correctionUntil = async (probe,accept,label) => {
    for(let attempt=0;;attempt++) { const result=await probe(); if(accept(result)) return result;
      if(attempt>0 && attempt%30===0) console.log('D3_CORRECTIONS_PHASE: observing_original='+label);
      await new Promise(resolve=>setTimeout(resolve,1000)); }
  };
  const correctionRow = runtime.correctionRow = correctionId => rows(`SELECT JSON_OBJECT('id',CAST(correction_id AS CHAR),'slipId',CAST(correction_slip_id AS CHAR),'status',status,'instanceId',instance_id,'diff',CAST(diff_amount AS CHAR)) FROM hr_payroll_correction WHERE correction_id=${id(correctionId)} AND tenant_id=100000`)[0];
  const taskRows = runtime.correctionTasks = instance => rows(`SELECT JSON_OBJECT('id',task_id,'actor',CAST(assignee AS CHAR),'node',node_key) FROM wf_task WHERE tenant_id=100000 AND instance_id=${literal(instance)} AND status='TODO'`);
  const original = await ok('admin',pay+'/slips/'+originalSlipId);
  check('original_paid_and_confirmed',original.status==='PAID' && original.employeeConfirmed===true);
  const taxSnapshot = original.components.filter(component=>component.type==='TAX_SNAPSHOT');
  check('owned_original_tax_basis',taxSnapshot.length===1 && cents(taxSnapshot[0].currentTaxableIncome)===previousTaxable && cents(original.currentTax)===previousTax && cents(taxSnapshot[0].thresholdApplied)===0n);
  const earlierPaid=[];
  for(const directory of fs.readdirSync(path.dirname(output)).filter(name=>/^d3-payroll-corrections-20261006-r[1-9][0-9]*$/.test(name))){
    const previousFile=path.join(path.dirname(output),directory,'fixture.json');
    if(path.dirname(previousFile)===output || !fs.existsSync(previousFile))continue;
    const previous=read(previousFile);
    if(previous.originalSlipId!==originalSlipId)continue;
    for(const correction of previous.corrections||[]){
      if(correction.decision!=='APPLIED')continue;
      check('earlier_applied_sample_paid_'+correction.id,correction.paid===true && correction.period===currentPeriodId);
      const actual=await ok('admin',pay+'/slips/'+id(correction.slipId));
      check('earlier_paid_sample_matches_evidence_'+correction.id,actual.status==='PAID' && cents(actual.grossTotal)===BigInt(correction.expected.gross)
        && cents(actual.taxAmount)===BigInt(correction.expected.tax) && cents(actual.netTotal)===BigInt(correction.expected.net)
        && database(`SELECT reason FROM hr_payroll_correction WHERE correction_id=${id(correction.id)}`)===previous.marker+'-'+correction.name);
      previousTaxable+=cents(correction.gross)-cents(correction.deduction);previousTax+=BigInt(correction.expected.tax);
      earlierPaid.push(correction.id);
    }
  }
  check('prior_active_corrections_exactly_owned_evidence',database(`SELECT COUNT(*) FROM hr_payroll_correction WHERE original_slip_id=${originalSlipId} AND deleted=0 AND status<>'REJECTED'`)===String(earlierPaid.length));
  fixture.earlierPaid=earlierPaid;fixture.startingTaxableCents=String(previousTaxable);fixture.startingTaxCents=String(previousTax);save();
  const accountId=id(sessions.employee.identity.userId);
  check('employee_account_unbound',database(`SELECT COUNT(*) FROM hr_employee WHERE tenant_id=100000 AND user_id=${accountId} AND deleted=0`)==='0');
  bindingChanged=true; await ok('admin','/hr/employees/'+main.id,'PUT',{...main.body,userId:accountId});
  check('employee_bound_to_original_salary',database(`SELECT CAST(user_id AS CHAR) FROM hr_employee WHERE id=${main.id}`)===accountId);
  const financeId='990001030', financeName='h2adv_finance_870861120861';
  check('existing_owned_finance_identity',database(`SELECT COUNT(*) FROM sys_user u JOIN sys_user e ON e.user_name='g_holiday_employee' AND e.tenant_id=u.tenant_id JOIN sys_user_role ur ON ur.user_id=u.user_id AND ur.tenant_id=u.tenant_id JOIN sys_role r ON r.role_id=ur.role_id AND r.tenant_id=ur.tenant_id WHERE u.user_id=${financeId} AND u.user_name=${literal(financeName)} AND u.create_by='advance-payroll-fixture' AND u.status='0' AND u.deleted=0 AND u.pwd_reset_required='0' AND u.password=e.password AND r.role_key='finance'`)==='1');
  const account=read(path.join(runtime.run,'private/accounts.json')).find(value=>value.username==='g_holiday_employee');
  const origin=new URL(sessions.admin.page.url()).origin;
  const financeContext=await sessions.admin.context.browser().newContext({viewport:{width:1440,height:1000}});
  await financeContext.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  const financePage=await financeContext.newPage(); financePage.on('pageerror',()=>runtime.browserErrors.push('finance'));
  await financePage.goto(origin,{waitUntil:'domcontentloaded'});
  const financeIdentity=await authenticateFormTest(financePage,{...account,username:financeName},origin);
  check('real_finance_login',financeIdentity.authenticated && financeIdentity.userId===financeId && financeIdentity.tenantId==='100000');
  const financeToken=await financePage.evaluate(async()=>(await import('/src/utils/authStorage.ts')).getAuthToken());
  runtime.sensitive.add(financeToken); runtime.sensitive.add(financeToken.replace(/^Bearer /,''));
  sessions.finance={page:financePage,context:financeContext,identity:financeIdentity};
  const configId=id(database("SELECT config_id FROM sys_config WHERE tenant_id=100000 AND config_key='sys.hr.payroll.correctionProcessKey' AND config_scope='1'"));
  const config=await ok('admin','/auth/system/config/'+configId);
  originalConfig=Object.fromEntries(['configId','tenantId','configScope','configKey','configName','configType','configValue','remark'].map(key=>[key,config[key]??null]));
  fixture.originalConfig=originalConfig;
  const definitions=rows(`SELECT JSON_OBJECT('id',definition_id,'digest',SHA2(model_json,256)) FROM wf_process_definition WHERE tenant_id=100000 AND process_key=${literal(config.configValue)} AND status='PUBLISHED' AND deleted=0 ORDER BY version DESC`);
  check('original_correction_definition_exists',definitions.length>0); fixture.originalDefinition=definitions[0];
  const definition=await ok('admin',wf+'/definition/'+definitions[0].id);
  const model=typeof definition.modelJson==='string'?JSON.parse(definition.modelJson):structuredClone(definition.modelJson);
  const approvals=model.nodes.filter(node=>node.type==='APPROVAL');
  check('original_single_finance_approval',approvals.length===1 && approvals[0].approverType==='ROLE' && approvals[0].approverValue==='finance');
  approvals[0].approverType='USER'; approvals[0].approverValue=financeId;
  const created=await ok('admin',wf+'/definition/save','POST',{processKey:fixture.marker,processName:fixture.marker,modelJson:JSON.stringify(model),formId:null,startPermissionType:'ALL',startPermissionValue:'[]'});
  fixture.definitionId=created.definitionId||created.id; save(); await ok('admin',wf+'/definition/deploy/'+fixture.definitionId,'POST');
  configChanged=true; await ok('admin','/auth/system/config','PUT',{...originalConfig,configValue:fixture.marker});
  const tax=(await ok('admin',pay+'/config/tax-slabs')).find(value=>String(value.slabId)===taxSlabId);
  check('owned_tax_inactive',tax?.status==='INACTIVE');
  originalTax=Object.fromEntries(['slabName','region','effectiveFrom','effectiveTo','thresholdAmount','status','remark'].map(key=>[key,tax[key]??null]));
  fixture.originalTax=originalTax; save();
  taxChanged=true; await ok('admin',pay+'/tax-slabs/'+taxSlabId,'PUT',{...originalTax,effectiveTo:nextMonthEnd,status:'ACTIVE'});
  const periods=await ok('admin',pay+'/config/periods');
  check('owned_current_period_open',periods.some(period=>String(period.periodId)===currentPeriodId && period.status==='OPEN' && period.periodName===prior.marker));
  const existingNext=periods.find(period=>period.startDate===nextMonth+'-01' && period.endDate===nextMonthEnd && period.status==='OPEN');
  const nextPeriodId=existingNext?id(existingNext.periodId):id(await ok('admin',pay+'/periods','POST',{periodName:fixture.marker+'-next',frequency:'MONTHLY',startDate:nextMonth+'-01',endDate:nextMonthEnd,payDate:nextMonthEnd}));
  fixture.nextPeriodId=nextPeriodId;fixture.nextPeriodCreated=!existingNext;save();
  check('current_and_next_period_distinct',nextPeriodId!==currentPeriodId);
  const deny=async(actor,body,code,label)=>{const result=await api(actor,pay+'/corrections','POST',body);check(label,[400,403,404,409].includes(result.status) && result.body?.code!==200 && (!code||result.body.code===code));};
  const base={originalSlipId,payrollPeriodId:currentPeriodId,grossAdjustment:'100.01',deductionAdjustment:'10.02',reason:fixture.marker};
  const beforeDenied=database(`SELECT COUNT(*) FROM hr_payroll_correction WHERE original_slip_id=${originalSlipId}`);
  await deny('employee',base,null,'ordinary_employee_cannot_create_correction');
  await deny('admin',{...base,payrollPeriodId:'122'},'PAYROLL_PERIOD_CLOSED','closed_period_correction_rejected');
  await deny('admin',{...base,originalSlipId:'98209280378'},'CORRECTION_REQUIRES_PAID','unpaid_original_correction_rejected');
  await deny('admin',{...base,grossAdjustment:'0.00',deductionAdjustment:'0.00'},'INVALID_CORRECTION','zero_correction_rejected');
  check('denied_creates_have_no_rows',database(`SELECT COUNT(*) FROM hr_payroll_correction WHERE original_slip_id=${originalSlipId}`)===beforeDenied);
  page=await sessions.admin.context.newPage(); page.on('pageerror',()=>runtime.browserErrors.push('correction-ui')); page.setDefaultTimeout(30000);
  async function openPage(){ await page.goto(origin+'/hr/payroll',{waitUntil:'networkidle'}); await page.getByRole('tab',{name:'工资补正',exact:true}).click(); }
  async function makeCorrection(name,gross,deduction,period,viaUi=false){
    const body={...base,grossAdjustment:gross,deductionAdjustment:deduction,payrollPeriodId:period,reason:fixture.marker+'-'+name};
    let correctionId;
    if(viaUi){
      await openPage(); await page.getByRole('button',{name:'创建工资补正',exact:true}).click();
      const dialog=page.getByRole('dialog');
      await dialog.getByRole('spinbutton',{name:/原已发放工资单编号/}).fill(originalSlipId);
      await dialog.getByRole('combobox',{name:/补正归属周期/}).selectOption(period);
      await dialog.getByRole('spinbutton',{name:/应发调整金额/}).fill(gross);
      await dialog.getByRole('spinbutton',{name:/扣款调整金额/}).fill(deduction);
      await dialog.getByRole('textbox',{name:/补正原因/}).fill(body.reason);
      const posted=page.waitForResponse(response=>response.request().method()==='POST' && new URL(response.url()).pathname==='/api'+pay+'/corrections');
      await dialog.getByRole('button',{name:'确认',exact:true}).click();
      const response=await posted, payload=await response.json();
      runtime.requests.push({actor:'admin-ui',path:pay+'/corrections',method:'POST',status:response.status(),code:payload.code,traceId:response.headers()['x-trace-id']});
      check('ui_creation_posted',response.status()===200 && payload.code===200); correctionId=id(payload.data); await dialog.waitFor({state:'hidden'});
    }else correctionId=id(await ok('admin',pay+'/corrections','POST',body));
    const correction={id:correctionId,name,gross,deduction,period};fixture.corrections.push(correction);save();
    const row=await until(()=>correctionRow(correctionId),value=>Boolean(value?.instanceId),name+'_binding');
    Object.assign(correction,{slipId:row.slipId,instanceId:row.instanceId});save();
    check(name+'_pending',row.status==='PENDING'||row.status==='APPROVING');
    check(name+'_real_definition',database(`SELECT definition_id FROM wf_process_instance WHERE instance_id=${literal(row.instanceId)} AND tenant_id=100000`)===fixture.definitionId);
    const slip=await ok('admin',pay+'/slips/'+row.slipId);
    const taxable=cents(gross)-cents(deduction), cumulative=halfUpTenth(previousTaxable+taxable), tax=cumulative>previousTax?cumulative-previousTax:0n;
    correction.expected={gross:String(cents(gross)),deduction:String(cents(deduction)+tax),tax:String(tax),net:String(taxable-tax)}; save();
    verifyDelta(correction,slip,'PENDING');
    const employeeView=await api('employee',ess+'/'+row.slipId);check(name+'_pending_hidden_from_employee',[403,404].includes(employeeView.status));
    const blocked=await api('admin',pay+'/corrections/'+correctionId+'/pay','POST',{});
    check(name+'_unapproved_payment_rejected',[400,409].includes(blocked.status) && blocked.body?.code==='CORRECTION_NOT_APPROVED');
    check(name+'_original_unchanged',salaryDigest()===originalSalary);
    return correction;
  }
  function verifyDelta(correction,slip,status){
    for(const [field,key] of [['grossTotal','gross'],['deductionTotal','deduction'],['taxAmount','tax'],['currentTax','tax'],['netTotal','net']])check(correction.name+'_'+status+'_'+field,cents(slip[field])===BigInt(correction.expected[key]));
    check(correction.name+'_'+status+'_state',slip.status===status);
    const snapshot=slip.components.filter(component=>component.type==='TAX_SNAPSHOT');
    check(correction.name+'_'+status+'_snapshot',snapshot.length===1 && snapshot[0].correction===true && String(snapshot[0].originalSlipId)===originalSlipId && String(snapshot[0].payrollPeriodId)===correction.period && cents(snapshot[0].thresholdApplied)===0n);
  }
  async function decide(correction,action){
    const tasks=await until(()=>taskRows(correction.instanceId),value=>value.length===1,correction.name+'_finance_task');
    check(correction.name+'_independent_finance',tasks[0].actor===financeId && tasks[0].actor!==sessions.admin.identity.userId && tasks[0].actor!==sessions.employee.identity.userId);
    await ok('finance',wf+'/complete','POST',{taskId:tasks[0].id,action,comment:fixture.marker,variables:{}});
    const row=await until(()=>correctionRow(correction.id),value=>value.status===(action==='APPROVE'?'APPLIED':'REJECTED'),correction.name+'_callback');
    correction.decision=row.status;save();
    const slip=await ok('admin',pay+'/slips/'+correction.slipId);
    verifyDelta(correction,slip,action==='APPROVE'?'SUBMITTED':'CANCELLED');
    check(correction.name+'_decision_sealed',/^[a-f0-9]{64}$/i.test(slip.digestSha256||''));
    if(action==='REJECT'){
      const hidden=await api('employee',ess+'/'+correction.slipId);
      check(correction.name+'_cancelled_hidden_from_employee',[403,404].includes(hidden.status));
    }
    if(action==='APPROVE'){previousTaxable+=cents(correction.gross)-cents(correction.deduction);previousTax+=BigInt(correction.expected.tax);}
    check(correction.name+'_original_after_approval_unchanged',salaryDigest()===originalSalary);
  }
  async function payCorrection(correction,viaUi=false){
    const unauthorized=await api('employee',pay+'/corrections/'+correction.id+'/pay','POST',{});
    check(correction.name+'_employee_cannot_pay',[403,404].includes(unauthorized.status));
    if(viaUi){
      await openPage();const row=page.getByRole('row').filter({hasText:fixture.marker+'-'+correction.name});
      await row.getByRole('button',{name:'发放补正',exact:true}).click(); const dialog=page.getByRole('dialog');
      await dialog.getByRole('checkbox',{name:/确认发放审批通过的补正工资单/}).check();
      const posted=page.waitForResponse(response=>response.request().method()==='POST'&&new URL(response.url()).pathname==='/api'+pay+'/corrections/'+correction.id+'/pay');
      await dialog.getByRole('button',{name:'确认',exact:true}).click();const response=await posted,payload=await response.json();
      runtime.requests.push({actor:'admin-ui',path:pay+'/corrections/'+correction.id+'/pay',method:'POST',status:response.status(),code:payload.code,traceId:response.headers()['x-trace-id']});
      writes.set(hash(JSON.stringify(['admin',pay+'/corrections/'+correction.id+'/pay','POST',{}])),Date.now());
      check('ui_correction_paid',response.status()===200&&payload.code===200);await dialog.waitFor({state:'hidden'});
    }else await ok('admin',pay+'/corrections/'+correction.id+'/pay','POST',{});
    const slip=await ok('admin',pay+'/slips/'+correction.slipId);verifyDelta(correction,slip,'PAID');
    correction.paid=true;save();
    const digest=hash(database(`SELECT * FROM hr_salary_slip WHERE id=${correction.slipId}`));
    await ok('admin',pay+'/corrections/'+correction.id+'/pay','POST',{});
    check(correction.name+'_repeat_pay_unchanged',hash(database(`SELECT * FROM hr_salary_slip WHERE id=${correction.slipId}`))===digest);
    const self=await ok('employee',ess+'/'+correction.slipId);verifyDelta(correction,self,'PAID');
    const changed=await api('admin',pay+'/slips/'+correction.slipId,'PUT',{grossTotal:'1.00'});
    check(correction.name+'_direct_update_rejected',changed.status===405);
    check(correction.name+'_sealed_salary_unchanged',hash(database(`SELECT * FROM hr_salary_slip WHERE id=${correction.slipId}`))===digest);
  }
  const rejected=await makeCorrection('rejected','10.01','0.00',currentPeriodId);
  await deny('admin',{...base,reason:fixture.marker+'-blocked'},'CORRECTION_PENDING','pending_correction_blocks_second');
  await decide(rejected,'REJECT');
  const rejectedPay=await api('admin',pay+'/corrections/'+rejected.id+'/pay','POST',{});check('rejected_correction_cannot_pay',rejectedPay.body?.code==='CORRECTION_NOT_APPROVED');
  evidence.approval=true;
  const same=await makeCorrection('same-period','100.01','10.02',currentPeriodId,true);await decide(same,'APPROVE');await payCorrection(same,true);evidence.samePeriod=true;
  const negative=await makeCorrection('negative','-10.01','0.00',currentPeriodId);await decide(negative,'APPROVE');await payCorrection(negative);
  check('negative_adjustment_does_not_refund_prior_tax',negative.expected.tax==='0'&&negative.expected.net==='-1001');evidence.negative=true;
  const next=await makeCorrection('next-period','200.03','0.00',nextPeriodId);await decide(next,'APPROVE');await payCorrection(next);
  check('next_period_attributed_to_next_month',(await ok('admin',pay+'/slips/'+next.slipId)).periodMonth===nextMonth);evidence.nextPeriod=true;
  await deny('admin',{...base,reason:fixture.marker+'-past'},'CORRECTION_PERIOD_INVALID','later_correction_prevents_backdated_correction');evidence.boundaries=true;
  await openPage();const targetRow=page.getByRole('row').filter({hasText:fixture.marker+'-same-period'});
  await targetRow.getByRole('button',{name:'差额工资单',exact:true}).click();
  await page.getByRole('dialog').waitFor();
  const text=await page.getByRole('dialog').innerText();check('ui_paid_delta_amount',text.includes('80.99')&&text.includes('100.01')&&text.includes('9.00'));
  const screenshot='paid-correction.png';await page.screenshot({path:path.join(output,screenshot),fullPage:false});fixture.screenshots.push(screenshot);save();evidence.ui=true;
  for(const correction of fixture.corrections){
    const operations=rows(`SELECT JSON_OBJECT('op',operation_type,'count',COUNT(*)) FROM hr_audit_log WHERE tenant_id=100000 AND business_domain='PAYROLL_CORRECTION' AND business_id=${literal(correction.id)} GROUP BY operation_type`);
    check(correction.name+'_submit_audit_once',operations.some(item=>item.op==='SUBMIT'&&item.count===1));
    check(correction.name+'_decision_audit_once',operations.some(item=>item.op===(correction.decision==='APPLIED'?'APPROVED':'REJECTED')&&item.count===1));
    check(correction.name+'_payment_audit',correction.paid?operations.some(item=>item.op==='PAY'&&item.count>=2):!operations.some(item=>item.op==='PAY'));
  }evidence.audits=true;
} catch(error){failure=error;}
finally {
  if(runtime){
    const {check,database}=runtime;
    const restore=async(name,action)=>{try{await action();fixture.restorations[name]=true;}catch(error){fixture.restorations[name]=false;failure||=error;}save();};
    await restore('pendingCorrections',async()=>{for(const correction of fixture.corrections){
      if(!runtime.correctionRow)continue;let row=runtime.correctionRow(correction.id);
      if(['PENDING','APPROVING'].includes(row.status)){
        row=await runtime.correctionUntil(()=>runtime.correctionRow(correction.id),value=>Boolean(value?.instanceId),'recovery_binding');
        const tasks=await runtime.correctionUntil(()=>runtime.correctionTasks(row.instanceId),value=>value.length===1,'recovery_finance_task');
        check('recovery_owned_finance_task',tasks[0].actor===runtime.sessions.finance.identity.userId);
        await runtime.correctionOk('finance',wf+'/complete','POST',{taskId:tasks[0].id,action:'REJECT',comment:fixture.marker+' recovery',variables:{}});
        row=await runtime.correctionUntil(()=>runtime.correctionRow(correction.id),value=>value.status==='REJECTED','recovery_callback');
      }
      check('original_correction_terminal_'+correction.id,['APPLIED','REJECTED'].includes(row.status));
    }});
    await restore('binding',async()=>{if(bindingChanged){check('restore_only_owned_binding',database(`SELECT CAST(user_id AS CHAR) FROM hr_employee WHERE id=${main.id}`)===runtime.sessions.employee.identity.userId);await runtime.correctionOk('admin','/hr/employees/'+main.id,'PUT',{...main.body,userId:null});check('employee_unbound_again',database(`SELECT COUNT(*) FROM hr_employee WHERE id=${main.id} AND user_id IS NULL`)==='1');}});
    await restore('syntheticTax',async()=>{if(taxChanged){await runtime.correctionOk('admin',pay+'/tax-slabs/'+taxSlabId,'PUT',originalTax);check('tax_inactive_again',database('SELECT status FROM hr_tax_slab WHERE slab_id='+taxSlabId)==='INACTIVE');}});
    await restore('workflowConfig',async()=>{if(configChanged){await runtime.correctionOk('admin','/auth/system/config','PUT',originalConfig);check('original_correction_workflow_restored',database(`SELECT config_value FROM sys_config WHERE config_id=${id(originalConfig.configId)}`)===originalConfig.configValue);}});
    await restore('preservation',async()=>{if(!originalDigests)return;const current=runtime.captureDigests();for(const table of Object.keys(originalDigests))check('original_'+table+'_preserved',current[table]===originalDigests[table]);
      check('original_employee_other_fields_preserved',runtime.employeeDigest()===protectedEmployee);check('original_tax_configuration_preserved',runtime.taxDigest()===protectedTax);
      check('original_roles_preserved',runtime.roleDigest()===originalRoles);check('confirmed_original_salary_entire_row_preserved',hash(database(`SELECT * FROM hr_salary_slip WHERE id=${originalSlipId} AND tenant_id=100000`))===originalSalary);evidence.preservation=true;});
    evidence.restoration=Object.values(fixture.restorations).every(Boolean);
    try{check('browser_no_unhandled_errors',runtime.browserErrors.length===0);console.log('D3_CORRECTIONS_LOG_SCAN: '+JSON.stringify(await runtime.scan()));evidence.secrets=true;}catch(error){failure||=error;}
    await runtime.close();
  }
  const message=failure?(String(failure.message).split('\n')[0]).slice(0,180):undefined;
  fs.writeFileSync(path.join(output,'requests.json'),JSON.stringify(runtime?.requests||[],null,2));
  fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({passed:!failure&&Object.values(evidence).every(Boolean),...evidence,checks:runtime?.checks||[],requests:runtime?.requests.length||0,corrections:fixture.corrections.length,officialTaxPolicyVerified:false,all18Complete:false,globalComplete:false,failure:message},null,2));
  console.log('D3_CORRECTIONS_RESULT: '+JSON.stringify({passed:!failure&&Object.values(evidence).every(Boolean),...evidence,checks:runtime?.checks.length||0,requests:runtime?.requests.length||0,corrections:fixture.corrections.length,failure:message}));
  if(failure||!Object.values(evidence).every(Boolean))process.exitCode=1;
}
