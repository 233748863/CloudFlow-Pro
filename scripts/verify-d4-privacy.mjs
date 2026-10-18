import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash,randomUUID } from 'node:crypto';
import { createD4PrivacyRuntime } from './runtime-checks/d4-privacy-runtime.mjs';

const root='D:/CloudFlowPro',mine='/hr/ess/grievances',manage='/hr/grievances',disputes='/hr/labor/disputes';
assert.ok(process.argv.includes('--d1-leave')&&process.argv.includes('--d4-privacy'));
const output=fs.realpathSync(process.argv[process.argv.indexOf('--output')+1]);
assert.match(path.basename(output),/^d4-privacy-20261006-r[1-9][0-9]*$/);assert.ok(!fs.existsSync(path.join(output,'result.json')));
const id=value=>{const text=String(value);assert.match(text,/^[1-9]\d*$/);return text;},hash=value=>createHash('sha256').update(value).digest('hex');
const literal=value=>"CONVERT(X'"+Buffer.from(String(value)).toString('hex')+"' USING utf8mb4)";
const fixture={marker:'D4P-'+randomUUID().replaceAll('-','').slice(0,12),employees:[],grievances:[],files:[],matrix:[],screenshots:[],restorations:{}};
const save=()=>fs.writeFileSync(path.join(output,'fixture.json'),JSON.stringify(fixture,null,2));save();
const evidence={identities:false,scope:false,targets:false,assignment:false,internal:false,files:false,tenant:false,anonymous:false,disputes:false,audits:false,browser:false,preservation:false,restoration:false,secrets:false};
const tables=[['hr_employee','id'],['hr_grievance','grievance_id'],['hr_grievance_record','record_id'],['hr_labor_dispute','id'],['hr_dispute_evidence','id'],['hr_salary_slip','id'],['hr_payroll_period','period_id'],['hr_payroll_batch','batch_id'],['hr_payroll_correction','correction_id']];
let runtime,failure,api,ok,preserved,roles,originalDigests,originalRoles,uiPage;
try{
  runtime=await createD4PrivacyRuntime(root,output);api=runtime.privacyApi;ok=runtime.privacyOk;
  const {database,rows,check,sessions}=runtime;
  const bounds=Object.fromEntries(tables.map(([table,key])=>[table,database('SELECT COALESCE(MAX('+key+'),0) FROM '+table)]));
  preserved=()=>Object.fromEntries(tables.map(([table,key])=>{const digest=createHash('sha256');let cursor='0';for(;;){const end=database('SELECT COALESCE(MAX('+key+'),0) FROM (SELECT '+key+' FROM '+table+' WHERE '+key+'>'+cursor+' AND '+key+'<='+bounds[table]+' ORDER BY '+key+' LIMIT 1000) selected');if(end==='0')break;digest.update(database('SELECT * FROM '+table+' WHERE '+key+'>'+cursor+' AND '+key+'<='+end+' ORDER BY '+key));cursor=end;}return[table,digest.digest('hex')];}));
  roles=()=>hash(database('SELECT tenant_id,user_id,role_id FROM sys_user_role ORDER BY tenant_id,user_id,role_id')+database('SELECT tenant_id,role_id,menu_id FROM sys_role_menu ORDER BY tenant_id,role_id,menu_id'));
  originalDigests=preserved();originalRoles=roles();fixture.originalBounds=bounds;fixture.originalDigests=originalDigests;fixture.originalRoles=originalRoles;save();
  const uid=actor=>id(sessions[actor].identity.userId),tenant=actor=>id(sessions[actor].identity.tenantId);
  const permission=(actor,value)=>sessions[actor].identity.permissions.includes('*:*:*')||sessions[actor].identity.permissions.includes(value);
  for(const actor of ['admin','employee','hr','manager','foreign'])check(actor+'_existing_grievance_permission',permission(actor,'hr:grievance:manage:list')&&permission(actor,'hr:grievance:mine:list'));
  check('existing_employee_dispute_permission',permission('employee','hr:dispute:list'));check('manager_dispute_permission_absent',!permission('manager','hr:dispute:list'));evidence.identities=true;
  check('existing_peer_hr_permissions',permission('peerHr','hr:dispute:list')&&permission('peerHr','hr:grievance:manage:handle'));
  check('employee_existing_department_scope',database(`SELECT COUNT(*) FROM sys_user_role ur JOIN sys_role r ON r.tenant_id=ur.tenant_id AND r.role_id=ur.role_id WHERE ur.tenant_id=100000 AND ur.user_id=${uid('employee')} AND r.role_key='employee' AND r.data_scope='2'`)==='1');
  const digest=sample=>hash(database(`SELECT * FROM hr_grievance WHERE tenant_id=${sample.tenant} AND grievance_id=${sample.id}`)+database(`SELECT * FROM hr_grievance_record WHERE tenant_id=${sample.tenant} AND grievance_id=${sample.id} ORDER BY record_id`)+(sample.disputeId?database(`SELECT * FROM hr_labor_dispute WHERE tenant_id=${sample.tenant} AND id=${sample.disputeId}`)+database(`SELECT * FROM hr_dispute_evidence WHERE tenant_id=${sample.tenant} AND dispute_id=${sample.disputeId} ORDER BY id`):''));
  const deny=async(actor,url,label,sample,method='GET',body,statuses=[403])=>{
    const before=sample?digest(sample):null,response=await api(actor,url,method,body);
    check(label+'_denied',statuses.includes(response.status)&&response.body?.code!==200);
    check(label+'_no_private_content',!JSON.stringify(response.body??{}).includes(fixture.marker)&&!response.base64);
    if(sample)check(label+'_business_unchanged',digest(sample)===before);
    fixture.matrix.push({actor,path:url,method,label,status:response.status,allowed:false});save();return response;
  };
  const makeEmployee=async(actor,deptId)=>{
    check(actor+'_initially_unbound',database(`SELECT COUNT(*) FROM hr_employee WHERE tenant_id=${tenant(actor)} AND user_id=${uid(actor)} AND deleted=0`)==='0');
    const body={employeeNo:fixture.marker+'-'+actor,name:fixture.marker+'-'+actor,gender:'UNKNOWN',deptId,employeeType:'FULL_TIME',employeeStatus:'REGULAR',hireDate:'2026-01-01',userId:uid(actor)};
    const creator=actor==='foreign'?'foreign':'admin',employee={id:id(await ok(creator,'/hr/employees','POST',body)),actor,creator,tenant:tenant(actor),body,bound:true};
    fixture.employees.push(employee);save();return employee;
  };
  for(const actor of ['employee','manager','hr','foreign'])await makeEmployee(actor,actor==='foreign'?'990000101':'100');
  const upload=async(actor,label,personal=true)=>{
    const bytes=Buffer.from(fixture.marker+'-'+label+'\n隔离隐私验收附件','utf8'),name=fixture.marker+'-'+label+'.txt';
    const result=await ok(actor,(personal?mine:manage)+'/files','POST',undefined,{name,base64:bytes.toString('base64')});
    const file={id:id(result.fileId),actor,name,hash:hash(bytes)};fixture.files.push(file);save();return file;
  };
  const make=async(actor,label,file,extra={})=>{
    const employee=fixture.employees.find(value=>value.actor===actor);
    const body={grievanceType:'OTHER',priority:'NORMAL',subject:fixture.marker+'-'+label,description:fixture.marker+'-'+label+'详细事实',cause:fixture.marker+'-'+label+'起因',expectation:fixture.marker+'-'+label+'期望',againstType:'NONE',fileIds:file?[file.id]:[],...extra};
    const sample={id:id(await ok(actor,mine,'POST',body)),actor,employeeId:employee.id,tenant:employee.tenant,body,status:'SUBMITTED',handler:null,file};fixture.grievances.push(sample);save();return sample;
  };
  const firstFile=await upload('employee','员工原始'),main=await make('employee','分派经理',firstFile);
  const managerFile=await upload('manager','经理本人原始'),peer=await make('manager','分派员工',managerFile);
  const targetManager=await make('employee','指向经理',firstFile,{againstType:'USER',againstId:uid('manager')});
  const targetHr=await make('employee','指向人事',firstFile,{againstType:'USER',againstId:uid('hr')});
  const ownHr=await make('hr','人事本人',await upload('hr','人事本人原始'));
  const foreignFile=await upload('foreign','外租户原始'),foreign=await make('foreign','外租户本人',foreignFile);
  const list=async(actor,base)=>{
    const entries=[];let pageNum=1,total;
    do{const result=await ok(actor,base+'?pageNum='+pageNum+'&pageSize=100');assert.ok(Array.isArray(result.rows));if(total===undefined)total=Number(result.total);check(actor+'_list_total_stable_'+pageNum,Number(result.total)===total);entries.push(...result.rows);pageNum++;assert.ok(pageNum<=300);}while(entries.length<total);
    check(actor+'_list_complete',entries.length===total);return entries;
  };
  const checkLists=async(label)=>{
    for(const actor of ['admin','employee','hr','manager','foreign'])for(const personal of [false,true]){
      // The administrator has no employee record; employee-only entry is checked separately.
      if(actor==='admin'&&personal)continue;
      const actual=await list(actor,personal?mine:manage);
      for(const sample of fixture.grievances){
        const target=sample.body.againstType==='USER'&&String(sample.body.againstId)===uid(actor);
        const wanted=tenant(actor)===sample.tenant&&!target&&(personal?sample.actor===actor:sample.actor!==actor&&(actor==='hr'||sample.handler===uid(actor)));
        check(label+'_'+actor+'_'+(personal?'mine':'manage')+'_'+sample.id,actual.some(row=>String(row.grievanceId)===sample.id)===wanted);
        if(!wanted)check(label+'_hidden_subject_'+actor+'_'+personal+'_'+sample.id,!JSON.stringify(actual).includes(sample.body.subject));
      }
      if(!personal){const statistics=await ok(actor,manage+'/statistics');check(label+'_'+actor+'_statistics_same_scope',Number(statistics.total)===actual.length);}
    }
  };
  await checkLists('unassigned');
  for(const actor of ['admin','manager','foreign'])await deny(actor,manage+'/'+main.id,'unassigned_management_'+actor,main);
  for(const actor of ['manager','hr','foreign'])await deny(actor,mine+'/'+main.id,'unrelated_personal_'+actor,main);
  await deny('employee',manage+'/'+main.id,'applicant_management',main);
  await deny('hr',manage+'/'+ownHr.id,'hr_applicant_management',ownHr);
  for(const sample of [targetHr,targetManager]){
    const actor=sample===targetHr?'hr':'manager';
    for(const suffix of ['', '/handlers','/files/'+firstFile.id])await deny(actor,manage+'/'+sample.id+suffix,'target_'+actor+'_'+suffix,sample);
    for(const action of ['accept','comment'])await deny(actor,manage+'/'+sample.id+'/'+action,'target_write_'+actor+'_'+action,sample,'POST',{content:fixture.marker+'拒绝目标操作'});
  }
  await deny('foreign',manage+'/'+main.id+'/accept','cross_tenant_accept',main,'POST',{content:fixture.marker+'拒绝跨租户'});
  const candidates=await ok('hr',manage+'/'+main.id+'/handlers');check('handler_candidates_exclude_applicant_and_foreign',!candidates.some(row=>[uid('employee'),uid('foreign')].includes(String(row.userId)))&&candidates.some(row=>String(row.userId)===uid('manager')));
  const targetCandidates=await ok('hr',manage+'/'+targetManager.id+'/handlers');check('handler_candidates_exclude_target',!targetCandidates.some(row=>[uid('employee'),uid('manager')].includes(String(row.userId))));
  await deny('hr',manage+'/'+main.id+'/assign','cannot_assign_applicant',main,'POST',{handlerId:uid('employee')},[400]);
  await deny('hr',manage+'/'+targetManager.id+'/assign','cannot_assign_target',targetManager,'POST',{handlerId:uid('manager')},[400]);
  await deny('hr',manage+'/'+main.id+'/assign','cannot_assign_foreign',main,'POST',{handlerId:uid('foreign')},[400]);
  const assign=async(sample,actor)=>{await ok('hr',manage+'/'+sample.id+'/assign','POST',{handlerId:uid(actor)});sample.handler=uid(actor);save();};
  await assign(main,'manager');await assign(peer,'employee');
  for(const [sample,actor]of [[main,'manager'],[peer,'employee']]){
    const detail=await ok(actor,manage+'/'+sample.id);check('assigned_detail_'+actor,String(detail.grievance.grievanceId)===sample.id&&!detail.canAssign);
    await deny(actor,manage+'/'+sample.id+'/handlers','assigned_cannot_choose_handlers_'+actor,sample);
    await deny(actor,manage+'/'+sample.id+'/assign','assigned_cannot_reassign_'+actor,sample,'POST',{handlerId:uid('hr')});
    await ok(actor,manage+'/'+sample.id+'/accept','POST',{content:fixture.marker+'指定处理人受理'});sample.status='ACCEPTED';save();
  }
  await checkLists('assigned');evidence.scope=true;evidence.targets=true;evidence.assignment=true;
  console.log('D4_PRIVACY_PHASE: identities=6; anonymous_context=true; assignment_and_conflict_matrix=true; original_grants_unchanged=true');
  const internalFile=await upload('hr','内部材料',false),publicFile=await upload('hr','公开处理材料',false);
  const internalContent=fixture.marker+'内部说明只给有权处理人',publicContent=fixture.marker+'可向本人显示的处理说明';
  await ok('hr',manage+'/'+main.id+'/comment','POST',{content:internalContent,visibleToEmployee:false,fileIds:[internalFile.id]});
  await ok('hr',manage+'/'+main.id+'/comment','POST',{content:publicContent,visibleToEmployee:true,fileIds:[publicFile.id]});
  const fileMatches=async(actor,url,file,label)=>{const result=await api(actor,url);check(label,result.status===200&&result.cache==='no-store'&&hash(Buffer.from(result.base64||'','base64'))===file.hash);fixture.matrix.push({actor,path:url,method:'GET',label,status:result.status,allowed:true});save();};
  for(const [actor,base]of [['employee',mine],['hr',manage],['manager',manage]]){
    const detail=await ok(actor,base+'/'+main.id),serialized=JSON.stringify(detail);
    check(actor+'_public_record_present',serialized.includes(publicContent));check(actor+'_internal_record_projection',serialized.includes(internalContent)===(actor!=='employee'));
    check(actor+'_internal_attachment_projection',detail.records.some(row=>String(row.attachmentUrl||'').includes(internalFile.id))===(actor!=='employee'));
    await fileMatches(actor,base+'/'+main.id+'/files/'+firstFile.id,firstFile,actor+'_original_file');
    await fileMatches(actor,base+'/'+main.id+'/files/'+publicFile.id,publicFile,actor+'_public_file');
    if(actor==='employee')await deny(actor,base+'/'+main.id+'/files/'+internalFile.id,'applicant_internal_attachment',main);
    else await fileMatches(actor,base+'/'+main.id+'/files/'+internalFile.id,internalFile,actor+'_internal_file');
  }
  await deny('employee',mine+'/'+peer.id+'/files/'+managerFile.id,'assigned_handler_not_applicant',peer);
  await fileMatches('employee',manage+'/'+peer.id+'/files/'+managerFile.id,managerFile,'assigned_employee_original');
  await deny('employee',mine+'/'+main.id+'/files/'+managerFile.id,'file_not_attached_to_grievance',main);
  await deny('hr',manage+'/'+main.id+'/files/'+foreignFile.id,'foreign_file_not_attached',main);
  for(const actor of ['admin','foreign'])for(const file of [firstFile,internalFile,publicFile])await deny(actor,manage+'/'+main.id+'/files/'+file.id,'unassigned_file_'+actor+'_'+file.id,main);
  const originalAudit=Number(database(`SELECT COUNT(*) FROM hr_audit_log WHERE tenant_id=100000 AND business_domain='GRIEVANCE' AND business_id=${main.id} AND operator_id=${uid('hr')} AND operation_type='VIEW'`));
  await ok('hr',manage+'/'+main.id);
  check('hr_view_one_audit',Number(database(`SELECT COUNT(*) FROM hr_audit_log WHERE tenant_id=100000 AND business_domain='GRIEVANCE' AND business_id=${main.id} AND operator_id=${uid('hr')} AND operation_type='VIEW'`))===originalAudit+1);evidence.audits=true;
  const origin=new URL(sessions.employee.page.url()).origin;
  for(const actor of ['employee','hr'])for(const viewport of [{name:'desktop',width:1440,height:1000},{name:'mobile',width:390,height:844}]){
    uiPage=await runtime.createPrivacyUiPage(actor,{width:viewport.width,height:viewport.height});
    await uiPage.goto(origin+(actor==='employee'?mine:manage)+'?id='+main.id,{waitUntil:'networkidle'});
    const dialog=uiPage.getByRole('dialog',{name:main.body.subject,exact:true});await dialog.waitFor();
    const text=await dialog.innerText();check(actor+'_'+viewport.name+'_public_record_visible',text.includes(publicContent));check(actor+'_'+viewport.name+'_internal_record_visibility',text.includes(internalContent)===(actor==='hr'));
    if(actor==='hr')await dialog.getByText(internalContent,{exact:true}).scrollIntoViewIfNeeded();else await dialog.getByText(publicContent,{exact:true}).scrollIntoViewIfNeeded();
    const name=actor+'-'+viewport.name+'-record-privacy.png';await uiPage.screenshot({path:path.join(output,name),fullPage:true});fixture.screenshots.push(name);save();await uiPage.close();uiPage=null;
  }
  evidence.internal=true;evidence.browser=true;
  for(const actor of ['admin','employee','hr','manager'])for(const base of [mine,manage]){
    if(actor==='admin'&&base===mine)continue;
    await deny(actor,base+'/'+foreign.id,'foreign_grievance_'+actor+'_'+base,foreign);
    await deny(actor,base+'/'+foreign.id+'/files/'+foreignFile.id,'foreign_attachment_'+actor+'_'+base,foreign);
  }
  for(const base of [mine,manage])for(const sample of [main,peer,targetHr,ownHr])await deny('foreign',base+'/'+sample.id,'foreign_account_'+base+'_'+sample.id,sample);
  await fileMatches('foreign',mine+'/'+foreign.id+'/files/'+foreignFile.id,foreignFile,'foreign_own_attachment');evidence.tenant=true;
  for(const actor of ['admin','foreign']){
    const files=await ok(actor,'/auth/system/file/list?pageNum=1&pageSize=100&fileName='+encodeURIComponent(fixture.marker));check(actor+'_generic_file_list_hides_private',Number(files.total)===0&&files.rows.length===0);
  }
  for(const file of fixture.files){
    const metadata=rows(`SELECT JSON_OBJECT('path',file_path,'type',file_type) FROM sys_file WHERE file_id=${file.id} AND deleted=0`)[0];check('private_metadata_'+file.id,metadata.type==='HR_GRIEVANCE');
    for(const actor of ['admin','foreign',file.actor])for(const url of ['/auth/system/file/'+file.id+'/content','/auth/system/file/access?path='+encodeURIComponent(metadata.path)])await deny(actor,url,'generic_private_file_'+actor+'_'+file.id+'_'+url.includes('access'));
  }
  evidence.files=true;
  for(const url of [mine,manage,manage+'/statistics',mine+'/'+main.id,manage+'/'+main.id,manage+'/'+main.id+'/handlers',mine+'/'+main.id+'/files/'+firstFile.id,manage+'/'+main.id+'/files/'+internalFile.id,'/auth/system/file/'+firstFile.id+'/content'])await deny('anonymous',url,'anonymous_'+url,null,'GET',undefined,[401]);
  await deny('anonymous',mine+'/'+main.id+'/comment','anonymous_write',main,'POST',{content:fixture.marker+'拒绝匿名'},[401]);evidence.anonymous=true;
  console.log('D4_PRIVACY_PHASE: private_records_both_viewports=true; business_and_generic_files=true; bidirectional_tenant_boundaries=true; anonymous_boundaries=true');
  for(const sample of [main,peer,targetManager]){
    if(sample.status==='SUBMITTED'){await ok('hr',manage+'/'+sample.id+'/accept','POST',{content:fixture.marker+'受理后验证升级隔离'});sample.status='ACCEPTED';sample.handler=uid('hr');save();}
    await ok('hr',manage+'/'+sample.id+'/escalate','POST',{content:fixture.marker+'验证关联劳动争议权限'});sample.status='ESCALATED';sample.disputeId=id((await ok('hr',manage+'/'+sample.id)).grievance.escalatedDisputeId);save();
  }
  for(const sample of [targetHr,ownHr]){
    await ok('peerHr',manage+'/'+sample.id+'/accept','POST',{content:fixture.marker+'另一人事受理回避案件'});sample.status='ACCEPTED';sample.handler=uid('peerHr');save();
    await ok('peerHr',manage+'/'+sample.id+'/escalate','POST',{content:fixture.marker+'另一人事升级后核验回避'});sample.status='ESCALATED';sample.disputeId=id((await ok('peerHr',manage+'/'+sample.id)).grievance.escalatedDisputeId);save();
  }
  const grievanceDispute=async(actor,sample,allowed)=>{
    for(const suffix of ['', '/evidence','/grievance-files/'+sample.file.id]){
      const url=disputes+'/'+sample.disputeId+suffix;
      if(allowed){if(suffix.includes('grievance-files'))await fileMatches(actor,url,sample.file,'linked_original_'+actor+'_'+sample.id);else{const result=await ok(actor,url);
        if(actor==='employee'&&suffix===''){
          check('assigned_employee_dispute_detail_allowed',result!==null&&String(result.id)===sample.disputeId);
          fixture.linkedHandlerNavigation={pending:false,actor,grievanceId:sample.id,disputeId:sample.disputeId,disputeNo:result.disputeNo,detailHidden:false,evidenceVisible:false,fileVisible:false};save();
        } else {
          check('linked_data_'+actor+'_'+sample.id+'_'+suffix,result!==null&&(suffix===''?String(result.id)===sample.disputeId:Array.isArray(result.rows)&&result.rows.length>=2));
          if(actor==='employee'&&suffix==='/evidence'){fixture.linkedHandlerNavigation.evidenceVisible=true;save();}
        }
      }
      if(actor==='employee'&&suffix.includes('grievance-files')){fixture.linkedHandlerNavigation.fileVisible=true;save();}}
      else await deny(actor,url,'linked_denied_'+actor+'_'+sample.id+'_'+suffix,sample,'GET',undefined,actor==='anonymous'?[401]:[403]);
    }
  };
  for(const sample of [main,peer,targetManager]){
    await grievanceDispute('hr',sample,true);
    for(const actor of ['admin','employee','manager','anonymous'])await grievanceDispute(actor,sample,actor==='employee'&&sample===peer);
    // Cross-tenant dispute queries may return an empty projection instead of revealing existence.
    for(const suffix of ['', '/evidence','/grievance-files/'+sample.file.id]){
      const response=await api('foreign',disputes+'/'+sample.disputeId+suffix);
      const empty=response.status===403||response.status===200&&response.body?.code===200&&(response.body.data===null||Array.isArray(response.body.data?.rows)&&response.body.data.rows.length===0&&Number(response.body.data.total)===0);
      check('foreign_linked_empty_'+sample.id+'_'+suffix,empty&&!JSON.stringify(response.body??{}).includes(fixture.marker)&&!response.base64);
    }
  }
  for(const sample of [targetHr,ownHr]){
    await grievanceDispute('peerHr',sample,true);
    for(const actor of ['hr','employee','manager','admin','anonymous'])await grievanceDispute(actor,sample,false);
  }
  await fileMatches('hr',disputes+'/'+main.disputeId+'/grievance-files/'+internalFile.id,internalFile,'hr_linked_internal');
  await deny('employee',disputes+'/'+main.disputeId+'/grievance-files/'+internalFile.id,'applicant_linked_internal_denied',main);
  for(const actor of ['admin','employee','hr','foreign'])for(const applicant of [main.employeeId,peer.employeeId]){
    // The generic labor list does not join the employee name for keyword matching.
    // Use its explicit applicant filter so unrelated historical disputes are excluded.
    const actual=await ok(actor,disputes+'?pageNum=1&pageSize=100&applicantEmployeeId='+applicant);
    const expected=actor==='hr'?(applicant===main.employeeId?[main.disputeId,targetManager.disputeId]:[peer.disputeId]):actor==='employee'&&applicant===peer.employeeId?[peer.disputeId]:[];
    check(actor+'_linked_list_scope_'+applicant,Number(actual.total)===expected.length&&JSON.stringify(actual.rows.map(row=>String(row.id)).sort())===JSON.stringify(expected.sort()));
    const pages=[];for(let pageNum=1;pageNum<=expected.length+1;pageNum++){
      const page=await ok(actor,disputes+'?pageNum='+pageNum+'&pageSize=1&applicantEmployeeId='+applicant);
      check(actor+'_linked_page_total_'+applicant+'_'+pageNum,Number(page.total)===expected.length);pages.push(...page.rows.map(row=>String(row.id)));
    }
    check(actor+'_linked_pagination_complete_'+applicant,JSON.stringify(pages.sort())===JSON.stringify(expected.sort()));
  }
  for(const actor of ['manager','anonymous'])await deny(actor,disputes,'linked_list_'+actor,null,'GET',undefined,actor==='anonymous'?[401]:[403]);
  for(const sample of [targetHr,ownHr]){
    const actual=await ok('hr',disputes+'?pageNum=1&pageSize=100&applicantEmployeeId='+sample.employeeId);
    check('hr_linked_applicant_and_target_absent_'+sample.id,!actual.rows.some(row=>String(row.id)===sample.disputeId));
    const other=await ok('peerHr',disputes+'?pageNum=1&pageSize=100&applicantEmployeeId='+sample.employeeId);
    check('peer_hr_linked_case_present_'+sample.id,other.rows.some(row=>String(row.id)===sample.disputeId));
  }
  evidence.disputes=true;await checkLists('escalated');check('no_browser_errors',runtime.browserErrors.length===0);
  check('linked_handler_read_scope_consistent',!fixture.linkedHandlerNavigation.detailHidden&&fixture.linkedHandlerNavigation.evidenceVisible&&fixture.linkedHandlerNavigation.fileVisible);
  for(const [permissionName,suffix]of [['hr:dispute:close','/close'],['hr:dispute:evidence:upload','/evidence']]){
    check('employee_no_write_permission_'+suffix,!permission('employee',permissionName));
    await deny('employee',disputes+'/'+peer.disputeId+suffix,'assigned_handler_no_write_'+suffix,peer,'POST',{reason:fixture.marker,description:fixture.marker});
  }
  for(const viewport of [{name:'desktop',width:1440,height:1000},{name:'mobile',width:390,height:844}]){
    uiPage=await runtime.createPrivacyUiPage('employee',{width:viewport.width,height:viewport.height});
    const deniedRequests=[];uiPage.on('response',response=>{if(response.url().includes('/api/')&&response.status()>=400)deniedRequests.push({path:new URL(response.url()).pathname,status:response.status()});});
    await uiPage.goto(origin+manage+'?id='+peer.id,{waitUntil:'networkidle'});
    await uiPage.getByRole('link',{name:'查看升级后的劳动争议 #'+peer.disputeId,exact:true}).click();
    await uiPage.waitForURL('**/hr/labor-dispute-list?id='+peer.disputeId);
    const dialog=uiPage.getByRole('dialog',{name:'争议详情 · '+fixture.linkedHandlerNavigation.disputeNo,exact:true});await dialog.waitFor();
    const content=await dialog.innerText();check('handler_'+viewport.name+'_dispute_details_and_evidence',content.includes(peer.employeeId)&&content.includes('证据材料')&&await dialog.getByRole('button',{name:'下载申诉材料',exact:true}).count()>=2);
    check('handler_'+viewport.name+'_no_ungranted_write_controls',await uiPage.getByRole('button',{name:/^(登记争议|发起处理|编辑|上传证据)$/}).count()===0);
    fixture.linkedUiDeniedRequests=deniedRequests;save();check('handler_'+viewport.name+'_no_unauthorized_picker_requests',deniedRequests.length===0);
    const name='handler-'+viewport.name+'-linked-dispute.png';await uiPage.screenshot({path:path.join(output,name),fullPage:true});fixture.screenshots.push(name);save();await uiPage.close();uiPage=null;
  }
  check('no_linked_browser_errors',runtime.browserErrors.length===0);
  console.log('D4_PRIVACY_PHASE: linked_dispute_privacy=true; assigned_non_hr_evidence_allowed=true; handler_dispute_navigation_pending=false; original_role_permissions_unchanged=true');
}catch(error){failure=error;try{if(uiPage)await uiPage.screenshot({path:path.join(output,'failure.png'),fullPage:true});}catch{}}
finally{
  const restore=async(label,operation)=>{try{await operation();fixture.restorations[label]=true;}catch(error){fixture.restorations[label]=false;failure||=error;}save();};
  await restore('grievances',async()=>{
    for(const sample of fixture.grievances){
      const detail=await ok(sample.actor,mine+'/'+sample.id);sample.status=detail.grievance.status;save();
      if(sample.status==='SUBMITTED'){await ok(sample.actor,mine+'/'+sample.id+'/withdraw','POST',{content:fixture.marker+'隐私验证正常结束'});sample.status='WITHDRAWN';save();}
      else if(['ACCEPTED','INVESTIGATING'].includes(sample.status)){
        const closer=sample.handler===String(runtime.sessions.peerHr?.identity.userId)?'peerHr':'hr';
        if(sample.status==='ACCEPTED'){await ok(closer,manage+'/'+sample.id+'/investigate','POST',{content:fixture.marker+'隐私验证收尾调查'});sample.status='INVESTIGATING';save();}
        await ok(closer,manage+'/'+sample.id+'/resolve','POST',{content:fixture.marker+'隐私验证收尾结论'});sample.status='RESOLVED';save();
      }
      if(sample.status==='RESOLVED'){await ok(sample.actor,mine+'/'+sample.id+'/confirm','POST',{satisfied:true,content:fixture.marker+'认可收尾'});sample.status='CLOSED';save();}
      runtime.check('owned_grievance_terminal_'+sample.id,['WITHDRAWN','CLOSED','ESCALATED'].includes(sample.status));
    }
  });
  await restore('bindings',async()=>{for(const employee of fixture.employees){if(!employee.bound)continue;await ok(employee.creator,'/hr/employees/'+employee.id,'PUT',{...employee.body,userId:null});employee.bound=false;save();runtime.check('binding_restored_'+employee.actor,runtime.database(`SELECT COUNT(*) FROM hr_employee WHERE tenant_id=${employee.tenant} AND user_id=${id(employee.body.userId)} AND deleted=0`)==='0');}});
  evidence.restoration=Object.values(fixture.restorations).every(Boolean);
  if(runtime){if(originalDigests)try{const final=preserved();for(const [table]of tables)runtime.check('original_'+table+'_unchanged',final[table]===originalDigests[table]);runtime.check('original_grants_unchanged',roles()===originalRoles);evidence.preservation=true;}catch(error){failure||=error;}
    try{console.log('D4_PRIVACY_LOG_SCAN: '+JSON.stringify(await runtime.scan()));evidence.secrets=true;}catch(error){failure||=error;}await runtime.close();}
  save();const raw=failure?String(failure.message).split('\n')[0].slice(0,220):undefined,safe=raw&&[...(runtime?.sensitive||[])].every(value=>!raw.includes(value))?raw:failure?'D4 privacy verification failed':undefined;
  fs.writeFileSync(path.join(output,'requests.json'),JSON.stringify(runtime?.requests||[],null,2));
  fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({passed:!failure&&Object.values(evidence).every(Boolean),...evidence,checks:runtime?.checks||[],requests:runtime?.requests.length||0,grievances:fixture.grievances.length,matrixCases:fixture.matrix.length,handlerDisputeNavigationPending:!!failure||!fixture.linkedHandlerNavigation||fixture.linkedHandlerNavigation.pending,all13Complete:false,globalComplete:false,remaining:['Related business navigation','Working-day reminders','Controlled duration-bin boundaries'],failure:safe},null,2));
  console.log(`D4_PRIVACY_SUMMARY: checks=${runtime?.checks.length||0}; failed=${failure?1:0}; requests=${runtime?.requests.length||0}; matrix_cases=${fixture.matrix.length}; preservation=${evidence.preservation}; restoration=${evidence.restoration}; all13_complete=false`);if(failure){console.log('D4_PRIVACY_FAILURE: '+safe);process.exitCode=1;}
}
