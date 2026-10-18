import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createOwnedRecoveryJournal } from './runtime-checks/owned-recovery-journal.mjs';
import { scanOwnedAuditLogs, scanSecretStream } from './portal-checks/scan-access-logs.mjs';
import { runHrOvertimeCore } from './verify-hr-overtime-core.mjs';

export async function verifyHrOvertime(context) {
  const { admin, api, session, database, check, directory, caseTag, state, accounts, evidence } = context;
  assert.match(caseTag, /^[a-f0-9]{12}$/);
  const literal = value => "CONVERT(UNHEX('" + Buffer.from(String(value)).toString('hex') + "') USING utf8mb4)";
  const tableKeys = [['hr_overtime_type','type_id'],['hr_overtime_request','request_id'],['hr_shift_request','request_id'],
    ['hr_employee','id'],['hr_shift','id'],['hr_attendance_rule','id'],['hr_schedule_assignment','id'],['hr_attendance_checkin','checkin_id'],
    ['hr_time_request','id'],['hr_leave_type','id'],['hr_leave_period','period_id'],['hr_leave_ledger','ledger_id'],['hr_leave_quota','id'],
    ['hr_leave_policy','policy_id'],['hr_leave_policy_detail','detail_id'],['hr_leave_policy_assignment','assignment_id'],
    ['hr_comp_component','id'],['hr_comp_change','id'],['hr_payroll_period','period_id'],['hr_payroll_batch','batch_id'],['hr_payroll_batch_employee','batch_employee_id'],
    ['hr_employee_comp','id'],['hr_comp_structure','id'],['hr_comp_grade','id'],['hr_tax_profile','id'],['hr_tax_slab','slab_id'],['hr_tax_slab_detail','slab_detail_id'],
    ['hr_tax_deduction','id'],['hr_salary_slip','id'],['hr_payroll_correction','correction_id'],['hr_employee_advance','advance_id'],['hr_advance_repayment','repayment_id'],
    ['biz_payment_request','id'],['hr_employee_referral','referral_id'],['hr_attendance_record','id'],['hr_attendance_monthly','id'],
    ['hr_benefit_scheme','id'],['hr_employee_benefit','id'],['hr_benefit_request','id'],['hr_benefit_payment','id'],
    ['sys_holiday_calendar','calendar_id'],['sys_holiday_date','date_id'],['sys_config','config_id'],['sys_business_rule','id']];
  const payrollPeriodAllowance = { periodId: '102', originalVersion: Number(database('SELECT version FROM hr_payroll_period WHERE tenant_id=100000 AND period_id=102;')), expectedDelta: 0 };
  assert.ok(Number.isSafeInteger(payrollPeriodAllowance.originalVersion));
  const columns = Object.fromEntries(tableKeys.map(([table]) => {
    const values = database("SELECT column_name FROM information_schema.columns WHERE table_schema='cloud_flow_db' AND table_name=" + literal(table) + " ORDER BY ordinal_position;").split(/\r?\n/);
    assert.ok(values.length); values.forEach(value => assert.match(value, /^[a-z_][a-z0-9_]*$/)); return [table, values];
  }));
  const bounds = Object.fromEntries(tableKeys.map(([table,key]) => {
    const bound = database('SELECT COALESCE(MAX(' + key + '),0) FROM ' + table + ';'); assert.match(bound,/^\d+$/); return [table,bound];
  }));
  const snapshot = () => Object.fromEntries(tableKeys.map(([table,key]) => {
    const digest = createHash('sha256'); let cursor = '0';
    for (;;) {
      const end = database('SELECT COALESCE(MAX(' + key + '),0) FROM (SELECT ' + key + ' FROM ' + table + ' WHERE ' + key + '>' + cursor + ' AND ' + key + '<=' + bounds[table] + ' ORDER BY ' + key + ' LIMIT 1000) selected;');
      assert.match(end,/^\d+$/); if(end==='0')break;
      const projection = columns[table].map(column => table === 'hr_payroll_period' && column === 'version'
        ? 'IF(period_id=' + payrollPeriodAllowance.periodId + ',NULL,HEX(CAST(version AS CHAR)))' : 'HEX(CAST(' + column + ' AS CHAR))');
      digest.update(database('SELECT ' + key + ',SHA2(CAST(JSON_ARRAY(' + projection.join(',') + ') AS CHAR),256) FROM ' + table + ' WHERE ' + key + '>' + cursor + ' AND ' + key + '<=' + end + ' ORDER BY ' + key + ';'));
      cursor=end;
    }
    return [table,digest.digest('hex')];
  }));
  const roleRows = () => database('SELECT tenant_id,user_id,role_id FROM sys_user_role ORDER BY tenant_id,user_id,role_id;');
  const menuRows = () => database('SELECT tenant_id,role_id,menu_id FROM sys_role_menu ORDER BY tenant_id,role_id,menu_id;');
  const rolesBefore=roleRows(), menusBefore=menuRows(), before=snapshot();
  const configKeys=['sys.hr.overtime.approvalUsers','sys.hr.shiftRequest.approvalUsers','sys.hr.shift.minimumRestMinutes','sys.hr.overtime.processKey','sys.hr.shiftRequest.processKey','sys.hr.leave.processKey','sys.hr.payroll.correctionProcessKey'];
  const policyScopes = {
    hr_overtime_type:"tenant_id=100000",
    hr_comp_component:"tenant_id=100000 AND component_code='OVERTIME'",
    sys_config:"tenant_id=100000 AND config_scope='1' AND config_key IN ("+configKeys.map(literal).join(',')+")",
    sys_business_rule:"tenant_id=100000 AND rule_code='hr.overtime.hours.limit'",
  };
  const policies = () => Object.fromEntries(Object.entries(policyScopes).map(([table,where]) => {
    const key=tableKeys.find(([name])=>name===table)[1];
    const result=database('SELECT JSON_OBJECT('+columns[table].flatMap(column=>[literal(column),'HEX(CAST('+column+' AS CHAR))']).join(',')+') FROM '+table+' WHERE '+where+' ORDER BY '+key+';');
    return [table,result?result.split(/\r?\n/).map(JSON.parse):[]];
  }));
  const policyBefore=policies(); let expectedPolicy=policyBefore;
  assert.equal(policyBefore.hr_overtime_type.length,3);
  assert.equal(policyBefore.sys_config.length,configKeys.length);
  assert.equal(policyBefore.hr_comp_component.length,1);
  assert.equal(policyBefore.sys_business_rule.length,1);
  const definitions=[['admin',1],['hr',4],['employee',5],['peer',5],['manager',2],['finance',3]];
  const names=definitions.map(([actor])=>'h2ot_'+actor+'_'+caseTag);
  assert.equal(database('SELECT COUNT(*) FROM sys_user WHERE tenant_id=100000 AND user_name IN ('+names.map(literal).join(',')+');'),'0');
  const journal=createOwnedRecoveryJournal(directory,'h2ot-'+caseTag,{names,rolesBefore,menusBefore,tableKeys,columns,bounds,before,policyBefore,payrollPeriodAllowance});
  evidence.preservation={tables:tableKeys.length,before,kept:false,payrollPeriodAllowance};
  const secrets=new Set(accounts.map(account=>account.password).filter(Boolean));
  const remember=async page=>{
    const token=await page.evaluate(async()=>(await import('/src/utils/authStorage.ts')).getAuthToken());
    assert.ok(token);secrets.add(token.replace(/^Bearer /,''));return page;
  };
  const guardedApi=async(page,endpoint,options={})=>{
    const mutation=['POST','PUT','PATCH','DELETE'].includes(options.method)
      && (/^\/auth\/system\/(config|rules)(\/|$)/.test(endpoint)||/^\/hr\/(attendance\/overtime-types|compensation\/components)(\/|$)/.test(endpoint));
    if(mutation)assert.deepEqual(policies(),expectedPolicy,'Overtime policy changed outside this verification');
    try{return await api(page,endpoint,options);}
    finally{if(mutation){expectedPolicy=policies();journal('policy-observed',{expectedPolicy});}}
  };
  let failure;
  try{
    await remember(admin);
    const sessions={accounts:{}};
    for(const [actor,roleId] of definitions){
      const name='h2ot_'+actor+'_'+caseTag;
      database("INSERT INTO sys_user (tenant_id,dept_id,user_name,nick_name,password,status,deleted,pwd_reset_required,create_by,create_time) SELECT 100000,100,"+literal(name)+","+literal(name)+",password,'0',0,'0','overtime-fixture',NOW() FROM sys_user WHERE tenant_id=100000 AND user_name='g_holiday_employee';");
      const userId=database("SELECT user_id FROM sys_user WHERE tenant_id=100000 AND user_name="+literal(name)+" AND create_by='overtime-fixture';");
      assert.match(userId,/^[1-9]\d*$/);
      journal('account-created',{actor,name,userId,roleId});
      database('INSERT INTO sys_user_role (tenant_id,user_id,role_id) VALUES (100000,'+userId+','+roleId+');');
      const page=await remember(await session(name,'g_holiday_employee'));
      sessions[actor]={page};sessions.accounts[actor]={userId,roleId:String(roleId),tenantId:'100000',deptId:'100',sourceUserId:database("SELECT user_id FROM sys_user WHERE tenant_id=100000 AND user_name='g_holiday_employee';")};
    }
    sessions.tenantPeer={page:await remember(await session('g_import_tenant'))};
    sessions.accounts.tenantPeer={tenantId:'100001'};
    await runHrOvertimeCore({...context,sessions,guardedApi,journal,payrollPeriodAllowance});
  }catch(error){journal('verification-failed',{name:error.name,message:String(error.message).split('\n')[0]});failure=error;}
  finally{
    const errors=[];
    const attempt=async operation=>{try{await operation();}catch(error){journal('cleanup-failed',{name:error.name,message:String(error.message).split('\n')[0]});errors.push(error);}};
    await attempt(async()=>{
      assert.deepEqual(policies(),expectedPolicy,'Refuse to overwrite external policy change');
      // Restore exact original metadata after the core restored policy values through real APIs.
      // Optimistic predicates cover every column and prevent overwriting another writer.
      for(const [table,originalRows] of Object.entries(policyBefore)){
        for(let index=0;index<originalRows.length;index++){
          const original=originalRows[index],expected=expectedPolicy[table][index];
          assert.ok(expected);
          const predicate=columns[table].map(column=>'HEX(CAST('+column+' AS CHAR)) <=> '+(expected[column]==null?'NULL':literal(expected[column]))).join(' AND ');
          assert.equal(database('SELECT COUNT(*) FROM '+table+' WHERE '+policyScopes[table]+' AND '+predicate+';'),'1');
          const changes=columns[table].map(column=>column+'='+(original[column]==null?'NULL':"CONVERT(UNHEX('"+original[column]+"') USING utf8mb4)")).join(',');
          database('UPDATE '+table+' SET '+changes+' WHERE '+policyScopes[table]+' AND '+predicate+';');
        }
      }
      assert.deepEqual(policies(),policyBefore);
      journal('policy-exactly-restored',{tables:Object.keys(policyBefore)});
    });
    for(const name of names)await attempt(async()=>{
      const id=database("SELECT user_id FROM sys_user WHERE tenant_id=100000 AND user_name="+literal(name)+" AND create_by='overtime-fixture';");
      if(!id)return;assert.match(id,/^[1-9]\d*$/);
      database("UPDATE sys_user SET status='1' WHERE tenant_id=100000 AND user_id="+id+" AND user_name="+literal(name)+" AND create_by='overtime-fixture'; DELETE FROM sys_user_role WHERE tenant_id=100000 AND user_id="+id+";");
      check('本轮加班临时账号停用并撤回角色',database("SELECT COUNT(*) FROM sys_user WHERE tenant_id=100000 AND user_id="+id+" AND status='1';")==='1'&&database('SELECT COUNT(*) FROM sys_user_role WHERE tenant_id=100000 AND user_id='+id+';')==='0');
      journal('account-disabled',{userId:id,name});
    });
    await attempt(async()=>{
      const after=snapshot();evidence.preservation.after=after;
      journal('restoration-observed',{after,rolesKept:roleRows()===rolesBefore,menusKept:menuRows()===menusBefore});
      check('加班验证后原账号角色及菜单授权保持',roleRows()===rolesBefore&&menuRows()===menusBefore);
      check('加班验证前已有业务记录各列保持，仅指定工资周期版本另核',JSON.stringify(after)===JSON.stringify(before));
      payrollPeriodAllowance.observedVersion=Number(database('SELECT version FROM hr_payroll_period WHERE tenant_id=100000 AND period_id='+payrollPeriodAllowance.periodId+';'));
      check('指定原工资周期仅允许已记录真实操作产生的版本变化',payrollPeriodAllowance.observedVersion===payrollPeriodAllowance.originalVersion+payrollPeriodAllowance.expectedDelta);
      evidence.preservation.kept=true;
    });
    if(errors.length)failure=new AggregateError([failure,...errors].filter(Boolean),'Overtime verification or restoration failed');
    else{evidence.restoration=true;journal('restored',{tables:tableKeys.length,accountsDisabled:true,rolesKept:true,menusKept:true});}
  }
  let files=0,leaks=0;
  for(const service of state.services){
    const serviceDirectory=path.join(state.run,service.name);
    const names=await fs.readdir(path.join(serviceDirectory,'logs')).catch(error=>{if(error.code==='ENOENT')return[];throw error;});
    for(const name of ['stdout.log','stderr.log',...names.filter(name=>name.endsWith('.log')).map(name=>path.join('logs',name))]){
      const result=await scanSecretStream(createReadStream(path.join(serviceDirectory,name)),[...secrets]);files++;leaks+=result.leaks;
    }
  }
  const audit=await scanOwnedAuditLogs(state,[...secrets],{log:'0',error:'0',audit:'0'});
  check('加班登录凭据未出现在服务日志及审计',leaks===0&&audit.leaks===0);evidence.secrets=true;
  console.log('H2_OVERTIME_SECRET_SCAN: '+JSON.stringify({files,values:secrets.size,leaks,databaseLeaks:audit.leaks}));
  if(failure)throw failure;
}
