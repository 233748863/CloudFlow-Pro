import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import { authenticateFormTest } from './runtime-checks/form-browser-auth.mjs';

export async function verifyC3OauthResources({sessions,api,success,check,database,sqlText,fixture,saveFixture,marker,evidence,secrets,requests,state}) {
  const output=path.join(evidence,`c3-oauth-resources-${fixture.runId}`);await fs.mkdir(output);
  const cases=[],flows=[],clients=[],issuedTokens=[];let stage='platform-login',failure,platformContext;
  const origin=new URL(sessions.admin.page.url()).origin;
  assert.equal(state.oauth2Fixture?.publicUrl,origin,'Owned OAuth origin mismatch');
  const gateway=state.services.find(service=>service.name==='gateway'),base=`http://127.0.0.1:${gateway.port}`;
  const random=()=>randomBytes(32).toString('base64url'),hash=value=>createHash('sha256').update(value).digest('base64url');
  const waitFor=async(read,accept,message)=>{const until=Date.now()+30000;do{const value=await read();if(accept(value))return value;await new Promise(resolve=>setTimeout(resolve,150));}while(Date.now()<until);throw new Error(message);};
  const remember=value=>{if(typeof value==='string'&&value.length>=8)secrets.add(value);return value;};
  const wire=async(endpoint,{token,form,headers={}}={})=>{
    if(token){remember(token);headers.Authorization='Bearer '+token;remember(headers.Authorization);}
    if(form)headers['Content-Type']='application/x-www-form-urlencoded';
    const response=await fetch(base+endpoint,{method:form?'POST':'GET',headers,body:form?new URLSearchParams(form):undefined,redirect:'manual',signal:AbortSignal.timeout(20000)});
    const body=await response.json().catch(()=>null);
    for(const value of [body?.access_token,body?.refresh_token])remember(value);
    const result={status:response.status,body,traceId:response.headers.get('X-Trace-Id'),cache:response.headers.get('Cache-Control'),cookie:response.headers.get('Set-Cookie')};
    requests.push({actor:'oauth-client',path:endpoint,method:form?'POST':'GET',status:result.status,traceId:result.traceId,observedAt:Date.now()});
    return result;
  };
  const deny=(label,result,status,error)=>{check(label,result.status===status&&result.body?.error===error&&!result.body?.formFields);cases.push({label,status:result.status,denied:true});};
  const entry='/auth/system/oauth2/client';
  let verifiedAt=0;
  const manage=async(endpoint,options)=>{
    if(Date.now()-verifiedAt>200000){
      const view=success(await api('platform','/auth/system/platform/access/reauthenticate',{method:'POST',body:{password:sessions.platform.account.password}}),'c3_oauth_platform_reauthenticated');
      check('c3_oauth_platform_verification_active',view.verified===true&&view.verifiedUntil>Date.now());verifiedAt=Date.now();
    }
    return api('platform',endpoint,options);
  };
  const createClient=async(tenantId,scopes,suffix)=>{
    const body={tenantId,clientType:'PUBLIC',clientName:marker+'-oauth-'+suffix,description:'自有C3字段读取专项',accessTokenValiditySeconds:900,refreshTokenValiditySeconds:3600,
      redirectUris:[origin+'/oauth2-test-return'],grantTypes:['authorization_code'],scopes,autoApproveScopes:[],status:'DISABLED',secretAction:'NONE'};
    const created=success(await manage(entry,{method:'POST',body}),'c3_oauth_create_client_'+suffix);
    const client={...created.client};clients.push(client);fixture.oauthClients??=[];fixture.oauthClients.push({clientId:client.clientId,tenantId});saveFixture();
    check('c3_oauth_public_client_has_no_secret_'+suffix,created.clientSecret==null&&client.status==='DISABLED');
    Object.assign(client,success(await manage(entry,{method:'PUT',body:{...body,clientId:client.clientId,version:client.version,status:'ACTIVE',secretAction:'KEEP'}}),'c3_oauth_enable_client_'+suffix));
    return client;
  };
  const issue=async(actor,client)=>{
    const verifier=remember(random()),stateValue=remember(random());
    const query=new URLSearchParams({response_type:'code',client_id:client.clientKey,redirect_uri:client.redirectUris[0],scope:client.scopes.join(' '),state:stateValue,code_challenge:remember(hash(verifier)),code_challenge_method:'S256'});
    const prepared=success(await api(actor,'/oauth2/authorize?'+query),'c3_oauth_authorization_begin_'+actor);
    check('c3_oauth_explicit_consent_required_'+actor,typeof prepared.requestToken==='string'&&!prepared.redirectUrl);remember(prepared.requestToken);
    const confirmed=success(await api(actor,'/oauth2/authorize',{method:'POST',body:{requestToken:prepared.requestToken,approve:true,scopes:client.scopes}}),'c3_oauth本人确认_'+actor);
    const destination=new URL(confirmed.redirectUrl),code=remember(destination.searchParams.get('code'));
    check('c3_oauth_exact_callback_and_state_'+actor,destination.origin===origin&&destination.pathname==='/oauth2-test-return'&&destination.searchParams.get('state')===stateValue&&/^[A-Za-z0-9_-]{43}$/.test(code));
    const result=await wire('/oauth2/token',{form:{grant_type:'authorization_code',client_id:client.clientKey,code,redirect_uri:client.redirectUris[0],code_verifier:verifier}});
    check('c3_oauth_real_token_'+actor,result.status===200&&/^[A-Za-z0-9_-]{43}$/.test(result.body?.access_token)&&result.body.token_type==='Bearer'&&result.cache?.includes('no-store')&&result.cookie===null);
    issuedTokens.push({client,access:result.body.access_token,refresh:result.body.refresh_token});
    return result.body.access_token;
  };
  const decode=value=>typeof value==='string'?JSON.parse(value):value;
  const read=async(flow,actor,token,phase)=>{
    const label='c3_oauth_'+phase+'_'+flow.suffix+'_'+actor;
    const result=await wire('/oauth2/api/workflow/instance/'+flow.instanceId,{token});
    check(label+'_success',result.status===200&&result.body?.instanceId===flow.instanceId&&result.body.formState==='DECLARED'&&result.cache?.includes('no-store'));
    const internal=success(await api(actor,'/workflow/wf/instance/'+flow.instanceId),label+'_normal_read');
    const values=decode(internal.variables);
    check(label+'_same_projection',isDeepStrictEqual(result.body.formFields,values));
    check(label+'_only_approved_response_fields',Object.keys(result.body).sort().join(',')==='endTime,formFields,formState,instanceId,processNo,startTime,status,title');
    const visible=result.body.formFields,reviewer=actor==='employee';
    check(label+'_visible_values',visible.publicNote===flow.values.publicNote&&visible.items.length===2&&visible.items[0].note==='第一条'&&visible.items[1].note==='第二条');
    if(reviewer&&flow.suffix==='a')check(label+'_hidden_top_and_columns',!Object.hasOwn(visible,'salary')&&visible.items.every(row=>!Object.hasOwn(row,'amount')));
    else check(label+'_salary_and_columns_present',Number(visible.salary)===Number(flow.values.salary)&&visible.items.every((row,index)=>Number(row.amount)===Number(flow.values.items[index].amount)));
    check(label+'_different_definition_policy',reviewer&&flow.suffix==='b'?!Object.hasOwn(visible,'privateCode'):visible.privateCode===flow.values.privateCode);
    check(label+'_fixed_form_version',!Object.hasOwn(visible,'added'));
    cases.push({label,actor,phase,suffix:flow.suffix,status:result.status,keys:Object.keys(visible),hiddenSalary:!Object.hasOwn(visible,'salary'),hiddenCode:!Object.hasOwn(visible,'privateCode')});
    return result;
  };
  try{
    const accounts=JSON.parse(await fs.readFile(path.join(state.run,'private/accounts.json'),'utf8'));
    const credentials=accounts.find(account=>account.username==='g_import_admin');assert.ok(credentials,'Owned platform account missing');remember(credentials.password);
    const userId=database("SELECT user_id FROM sys_user WHERE tenant_id=100000 AND user_name='g_import_admin' AND deleted=0 AND status='0'");
    assert.match(userId,/^[1-9][0-9]*$/);
    platformContext=await sessions.admin.context.browser().newContext({serviceWorkers:'block'});
    await platformContext.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
    const page=await platformContext.newPage();await page.goto(origin+'/login',{waitUntil:'networkidle'});
    const identity=await authenticateFormTest(page,credentials,origin);
    check('c3_oauth_owned_platform_login',identity.authenticated&&identity.userId===userId&&identity.tenantId==='100000');
    sessions.platform={page,context:platformContext,account:credentials,identity};
    stage='clients';
    const local=await createClient(100000,['workflow.instance.read'],'local');
    const foreign=await createClient(100001,['workflow.instance.read'],'foreign');
    const limited=await createClient(100000,['profile'],'limited');
    stage='flows';
    const name=marker+'-oauth',fields=[{id:'salary',type:'AMOUNT',label:'受限薪资',precision:2},{id:'privateCode',type:'TEXT',label:'内部编号'},
      {id:'publicNote',type:'TEXT',label:'公开说明'},{id:'items',type:'SUB_TABLE',label:'明细',columns:[{id:'amount',type:'AMOUNT',label:'受限金额',precision:2},{id:'note',type:'TEXT',label:'明细说明'}]}];
    const form=success(await api('admin','/workflow/wf/form/save',{method:'POST',body:{formKey:name,formName:name,fieldsJson:JSON.stringify(fields)}}),'c3_oauth_form_saved');
    const formId=form.formId||form.id;fixture.forms.push(formId);saveFixture();
    for(const suffix of ['a','b']){
      const modelJson=JSON.stringify({nodes:[{id:'start',type:'START',title:'发起'},{id:'approval',type:'APPROVAL',title:'员工核对',approverType:'USER',approverValue:sessions.employee.account.userId,allowEdit:true},{id:'end',type:'END',title:'完成'}],edges:[{source:'start',target:'approval'},{source:'approval',target:'end'}]});
      const processKey=name+'-'+suffix;
      const definition=success(await api('admin','/workflow/wf/definition/save',{method:'POST',body:{processKey,processName:processKey,formId,modelJson,startPermissionType:'ALL',startPermissionValue:'[]'}}),'c3_oauth_definition_'+suffix);
      const definitionId=definition.definitionId||definition.id;fixture.definitions.push(definitionId);saveFixture();
      success(await api('admin','/workflow/wf/definition/'+definitionId+'/field-permissions',{method:'PUT',body:(suffix==='a'?['salary','items.amount']:['privateCode']).map(fieldId=>({nodeKey:'approval',fieldId,visibleFlag:false,editableFlag:false,requiredFlag:null}))}),'c3_oauth_permissions_'+suffix);
      success(await api('admin','/workflow/wf/definition/deploy/'+definitionId,{method:'POST'}),'c3_oauth_published_'+suffix);
      const values={salary:'32145.67',privateCode:remember(processKey+'-private'),publicNote:'公开'+suffix,items:[{_rowId:'first',amount:'98.76',note:'第一条'},{_rowId:'second',amount:'54.32',note:'第二条'}]};
      const started=success(await api('admin','/workflow/wf/start',{method:'POST',body:{processDefKey:processKey,businessKey:processKey,variables:values}}),'c3_oauth_started_'+suffix);
      const instanceId=started.instanceId||started.processInstanceId;fixture.instances.push(instanceId);saveFixture();
      const taskId=await waitFor(()=>database(`SELECT task_id FROM wf_task WHERE tenant_id=100000 AND instance_id=${sqlText(instanceId)} AND status='TODO' AND assignee=${sqlText(sessions.employee.account.userId)}`),Boolean,'Owned OAuth reviewer task missing');
      flows.push({suffix,definitionId,instanceId,taskId,values});
    }
    const revised=success(await api('admin','/workflow/wf/form/save',{method:'POST',body:{formId,versionLock:form.versionLock,formName:name,fieldsJson:JSON.stringify([...fields,{id:'added',type:'TEXT',label:'新版字段'}])}}),'c3_oauth_form_revised');
    check('c3_oauth_original_form_pinned',revised.version===2&&flows.every(flow=>database(`SELECT form_version FROM wf_process_instance WHERE tenant_id=100000 AND instance_id=${sqlText(flow.instanceId)}`)==='1'));
    stage='consent';
    const employeeToken=await issue('employee',local),ownerToken=await issue('admin',local),unrelatedToken=await issue('peer',local),foreignToken=await issue('foreign',foreign),limitedToken=await issue('employee',limited);
    stage='resource-reads';
    for(const flow of flows){
      await read(flow,'employee',employeeToken,'pending');await read(flow,'admin',ownerToken,'owner_pending');
      const endpoint='/oauth2/api/workflow/instance/'+flow.instanceId;
      deny('c3_oauth_unrelated_denied_'+flow.suffix,await wire(endpoint,{token:unrelatedToken}),403,'insufficient_scope');
      deny('c3_oauth_foreign_denied_'+flow.suffix,await wire(endpoint,{token:foreignToken}),403,'insufficient_scope');
      deny('c3_oauth_missing_scope_denied_'+flow.suffix,await wire(endpoint,{token:limitedToken}),403,'insufficient_scope');
      const forged=await wire(endpoint,{token:employeeToken,headers:{'X-User-Id':sessions.admin.account.userId,'X-Tenant-Id':'100001','X-User-Tenant-Id':'100001','X-Inner-Call':'true','X-From-Service':'cloudflow-auth'}});
      check('c3_oauth_forged_identity_filtered_'+flow.suffix,forged.status===200&&isDeepStrictEqual(forged.body.formFields,(await wire(endpoint,{token:employeeToken})).body.formFields));
      cases.push({label:'forged-identity-'+flow.suffix,status:forged.status});
      success(await api('employee','/workflow/wf/complete',{method:'POST',body:{taskId:flow.taskId,action:'APPROVE',comment:'本人核对完成',variables:{}}}),'c3_oauth_complete_'+flow.suffix);
      await waitFor(()=>database(`SELECT status FROM wf_process_instance WHERE tenant_id=100000 AND instance_id=${sqlText(flow.instanceId)}`),value=>value==='PASSED','OAuth workflow did not complete');
      await read(flow,'employee',employeeToken,'done');await read(flow,'admin',ownerToken,'owner_done');
      const stored=JSON.parse(database(`SELECT variables FROM wf_process_instance WHERE tenant_id=100000 AND instance_id=${sqlText(flow.instanceId)}`));
      check('c3_oauth_original_private_values_retained_'+flow.suffix,stored.privateCode===flow.values.privateCode&&Number(stored.salary)===Number(flow.values.salary)&&stored.items.every((row,index)=>Number(row.amount)===Number(flow.values.items[index].amount)));
    }
    stage='revocation';
    for(const owned of issuedTokens){
      for(const token of [owned.refresh,owned.access].filter(Boolean)){
        const revoked=await wire('/oauth2/revoke',{form:{client_id:owned.client.clientKey,token}});
        check('c3_oauth_owned_token_revoked',revoked.status===200&&JSON.stringify(revoked.body)==='{}');
      }
    }
    deny('c3_oauth_revoked_token_denied',await wire('/oauth2/api/workflow/instance/'+flows[0].instanceId,{token:employeeToken}),401,'invalid_token');
  }catch(error){failure=error;let message=String(error.message).split('\n')[0];for(const secret of secrets)message=message.split(secret).join('[REDACTED]');await fs.writeFile(path.join(output,'failure-stage.json'),JSON.stringify({stage,name:error.name,message}));}
  finally{
    for(const client of clients){
      try{success(await manage(entry+'/'+client.clientId+'/disable',{method:'POST',body:{version:client.version}}),'c3_oauth_owned_client_disabled');client.retired=true;}
      catch(error){failure??=new Error('Owned OAuth client retirement failed');}
    }
    await platformContext?.close();delete sessions.platform;
    await fs.writeFile(path.join(output,'result.json'),JSON.stringify({passed:!failure,stage,cases,flows:flows.map(({values,...flow})=>flow),clients:clients.map(client=>({clientId:client.clientId,tenantId:client.tenantId,retired:client.retired===true})),issuedTokens:issuedTokens.length,databaseWrites:0,redisDeletes:0,fabricatedResponses:0},null,2));
    console.log(`C3_OAUTH_RESOURCES: flows=${flows.length}; cases=${cases.length}; tokens=${issuedTokens.length}; clients_retired=${clients.filter(client=>client.retired).length}; passed=${!failure}`);
  }
  if(failure)throw new Error('C3 OAuth resource verification failed; see safe failure-stage.json');
}
