import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createB2MobileBrowser, tapB2Mobile } from './b2-mobile-browser.mjs';

export async function verifyC3ExpressionPages({ sessions, api, success, check, database, sqlText, fixture, saveFixture, marker, evidence, secrets, requests }) {
  const output=path.join(evidence,`c3-expression-pages-${fixture.runId}`);await fs.mkdir(output);
  const page=sessions.admin.page,pageErrors=[],removers=[],mobiles=[],flows=[];
  let activePage=page,stage='setup',failure,formSaves=0,recordingUiWrite=false;
  const name=marker+'-expressions',condition="${amount} > 10000 && ${type} == 'SPECIAL'";
  const initial=[{id:'amount',type:'AMOUNT',label:'条件金额',precision:2},{id:'type',type:'TEXT',label:'条件类型'},
    {id:'conditionNote',type:'TEXT',label:'条件说明'},{id:'nodeHidden',type:'TEXT',label:'节点受限内容',visibleExpr:condition},
    {id:'nodeReadonly',type:'TEXT',label:'节点只读内容',disabledExpr:'${amount} <= 10000'}];
  const waitFor=async(read,accept,message)=>{const until=Date.now()+30000;do{const value=await read();if(accept(value))return value;await new Promise(resolve=>setTimeout(resolve,100));}while(Date.now()<until);throw new Error(message);};
  const post=async(endpoint,body,label)=>success(await api('admin','/workflow/wf'+endpoint,{method:'POST',body}),label);
  const decode=value=>typeof value==='string'?JSON.parse(value):value;
  const watch=(actor,current,device)=>{
    const error=value=>pageErrors.push({actor,device,name:value.name});
    const request=value=>{if(actor==='admin'&&value.method()==='POST'&&new URL(value.url()).pathname==='/api/workflow/wf/form/save')formSaves++;};
    const response=value=>{const endpoint=new URL(value.url()).pathname,method=value.request().method();
      if(recordingUiWrite&&method==='POST'&&/^\/api\/workflow\/wf\/(form\/save|draft|start|complete)$/.test(endpoint))requests.push({actor,path:endpoint.slice(4),method,status:value.status(),traceId:value.headers()['x-trace-id'],observedAt:Date.now(),realPage:true,device});};
    current.on('pageerror',error);current.on('request',request);current.on('response',response);removers.push(()=>{current.off('pageerror',error);current.off('request',request);current.off('response',response);});
  };
  try {
    const form=await post('/form/save',{formKey:name,formName:name,fieldsJson:JSON.stringify(initial)},'c3_expression_initial_form');
    const formId=form.formId||form.id;fixture.forms.push(formId);saveFixture();watch('admin',page,'desktop');await page.setViewportSize({width:1600,height:1100});
    const properties=page.locator('aside').filter({has:page.getByRole('heading',{name:'字段属性',exact:true})});
    const openDesigner=async()=>{
      await page.goto(new URL('/forms',page.url()).href,{waitUntil:'domcontentloaded'});
      await page.locator('label').filter({hasText:'当前表单'}).getByRole('button').click();await page.getByRole('option').filter({has:page.getByText(name,{exact:true})}).click();
      await waitFor(()=>page.getByRole('textbox',{name:'表单名称',exact:true}).inputValue(),value=>value===name,'Expression form did not load');
      const article=page.getByRole('button',{name:'拖动条件说明',exact:true}).locator('xpath=ancestor::article[1]');
      await article.locator(':scope > div').first().getByRole('button').filter({hasText:'条件说明'}).click();
      await waitFor(()=>properties.getByLabel('字段名称',{exact:true}).inputValue(),value=>value==='条件说明','Expression properties missing');
    };
    await openDesigner();stage='editor-completion-preview';
    const input=properties.getByLabel('显示条件（成立时显示）',{exact:true});const editor=input.locator('xpath=ancestor::section[1]');
    await editor.locator('summary').filter({hasText:'插入字段和试算'}).click();await editor.getByPlaceholder('搜索字段名称',{exact:true}).fill('条件金额');
    await editor.getByRole('button',{name:'条件金额',exact:true}).click();check('c3_expression_field_insertion',await input.inputValue()==='${amount}');
    await input.fill(condition);await editor.getByPlaceholder('搜索字段名称',{exact:true}).fill('');
    const testValue=label=>editor.locator('label').filter({has:page.getByText(label,{exact:true})}).getByPlaceholder('试算值',{exact:true});
    await testValue('条件金额').fill('10000.01');await testValue('条件类型').fill('SPECIAL');
    await editor.getByRole('status').filter({hasText:'试算：条件成立'}).waitFor();check('c3_expression_editor_true_preview',true);
    await testValue('条件金额').fill('10000');await editor.getByRole('status').filter({hasText:'试算：条件不成立'}).waitFor();check('c3_expression_editor_false_preview',true);
    stage='editor-rejections';
    for(const [label,expression] of [['function',"eval('true')"],['property','${type.length} > 0'],['script','true;false'],['unknown','${absent} == 1'],['six_levels','((((((true))))))']]){
      await input.fill(expression);await editor.getByRole('alert').waitFor();const before=formSaves;
      await page.getByRole('button',{name:'保存表单',exact:true}).click();
      check('c3_expression_editor_rejects_'+label,formSaves===before&&await page.getByRole('button',{name:'确认保存版本',exact:true}).count()===0);
    }
    check('c3_expression_editor_limits_500_characters',await input.getAttribute('maxlength')==='500');
    await input.fill('(((((true)))))');check('c3_expression_editor_accepts_five_levels',await editor.getByRole('alert').count()===0);
    await input.fill(condition);stage='editor-save';recordingUiWrite=true;
    const saving=page.waitForResponse(response=>response.request().method()==='POST'&&new URL(response.url()).pathname==='/api/workflow/wf/form/save').catch(()=>null);
    await page.getByRole('button',{name:'保存表单',exact:true}).click();await page.getByRole('button',{name:'确认保存版本',exact:true}).click();
    const saved=await saving;assert.ok(saved);const savedBody=await saved.json();recordingUiWrite=false;
    check('c3_expression_editor_saves_version',saved.status()===200&&savedBody.code===200&&savedBody.data.version===2);
    await openDesigner();check('c3_expression_editor_reload_preserves_condition',await properties.getByLabel('显示条件（成立时显示）',{exact:true}).inputValue()===condition);
    await page.screenshot({path:path.join(output,'saved-expression-editor.png')});
    const stored=JSON.parse(database(`SELECT fields_json FROM wf_form_definition WHERE tenant_id=100000 AND form_id=${sqlText(formId)} AND version=2`));
    check('c3_expression_original_definition_preserved',isDeepStrictEqual(JSON.parse(database(`SELECT fields_json FROM wf_form_definition WHERE tenant_id=100000 AND form_id=${sqlText(formId)} AND version=1`)),initial));
    stage='server-expression-boundaries';
    // The base live flow already exercises employee form-save denial and retains its audit trace.
    for(const [label,expression] of [['function',"eval('true')"],['property','${type.length} > 0'],['script','true;false'],['unknown','${absent} == 1'],['six_levels','((((((true))))))'],['length_501','true'+' '.repeat(497)]]){
      const key=name+'-invalid-'+label;
      const rejected=await api('admin','/workflow/wf/form/save',{method:'POST',body:{formKey:key,formName:key,fieldsJson:JSON.stringify(stored.map(field=>field.id==='conditionNote'?{...field,visibleExpr:expression}:field))}});
      check('c3_expression_server_rejects_'+label,rejected.status===400&&database(`SELECT COUNT(*) FROM wf_form_definition WHERE tenant_id=100000 AND form_key=${sqlText(key)}`)==='0');
    }
    for(const [label,expression] of [['five_levels','(((((true)))))'],['length_500','true'+' '.repeat(496)]]){
      const key=name+'-valid-'+label;const allowed=await post('/form/save',{formKey:key,formName:key,fieldsJson:JSON.stringify(stored.map(field=>field.id==='conditionNote'?{...field,visibleExpr:expression}:field))},'c3_expression_server_accepts_'+label);
      fixture.forms.push(allowed.formId||allowed.id);saveFixture();
    }
    const mobilePages={};for(const actor of ['employee','peer']){const mobile=await createB2MobileBrowser({admin:sessions[actor].page,secrets,check,landingPath:'/tasks',landingHeading:'我的任务'});mobiles.push(mobile);mobilePages[actor]=mobile.page;watch(actor,mobile.page,'mobile');}
    watch('employee',sessions.employee.page,'desktop');watch('peer',sessions.peer.page,'desktop');
    for(const device of ['desktop','mobile']){
      stage=device+'-setup';const configured=device==='mobile',processName=name+'-'+device;
      const definition=await post('/definition/save',{processKey:processName,processName,formId,startPermissionType:'ALL',startPermissionValue:'[]',modelJson:JSON.stringify({nodes:[{id:'start',type:'START',title:'发起'},{id:'approval',type:'APPROVAL',title:'核对',approverType:'USER',approverValue:sessions.peer.account.userId,allowEdit:true},{id:'end',type:'END',title:'结束'}],edges:[{source:'start',target:'approval'},{source:'approval',target:'end'}]})},'c3_expression_'+device+'_definition');
      const definitionId=definition.definitionId||definition.id;fixture.definitions.push(definitionId);saveFixture();
      if(configured)success(await api('admin',`/workflow/wf/definition/${definitionId}/field-permissions`,{method:'PUT',body:[{nodeKey:'approval',fieldId:'nodeHidden',visibleFlag:false,editableFlag:false,requiredFlag:null},{nodeKey:'approval',fieldId:'nodeReadonly',visibleFlag:true,editableFlag:false,requiredFlag:null}]}),'c3_expression_node_restrictions_saved');
      else check('c3_expression_unconfigured_definition_has_no_rules',database(`SELECT COUNT(*) FROM wf_form_field_permission WHERE tenant_id=100000 AND definition_id=${sqlText(definitionId)}`)==='0');
      await post('/definition/deploy/'+definitionId,undefined,'c3_expression_'+device+'_published');
      const employee=device==='desktop'?sessions.employee.page:mobilePages.employee,reviewer=device==='desktop'?sessions.peer.page:mobilePages.peer;
      const tap=locator=>device==='desktop'?locator.click():tapB2Mobile(locator);activePage=employee;
      await employee.goto(new URL('/workplace',employee.url()).href,{waitUntil:'domcontentloaded'});await employee.getByPlaceholder('流程模型名称、Key、描述信息',{exact:true}).fill(processName);await tap(employee.getByRole('button').filter({hasText:processName}));
      const draft=employee.getByRole('dialog',{name:'发起流程 · '+processName,exact:true});await draft.waitFor();
      const id=(scope,value)=>scope.locator(`[id=${JSON.stringify(value)}]`);const control=(scope,field)=>id(scope,'input-'+field);
      await control(draft,'amount').waitFor();await control(draft,'amount').fill('10000');await control(draft,'type').fill('SPECIAL');
      check('c3_expression_'+device+'_false_hides_control',await id(draft,'field-conditionNote').count()===0);
      const draftRows=()=>{const raw=database(`SELECT JSON_OBJECT('draftId',draft_id,'data',form_data,'version',lock_version) FROM wf_form_draft WHERE tenant_id=100000 AND user_id=${sessions.employee.account.userId} AND definition_id=${sqlText(definitionId)}`);return raw?JSON.parse(raw):undefined;};
      const save=async accept=>{recordingUiWrite=true;await tap(draft.getByRole('button',{name:'保存草稿',exact:true}));const savedDraft=await waitFor(draftRows,value=>value&&accept(decode(value.data)),'Expression draft data not saved');await waitFor(()=>draft.getByRole('status').allTextContents(),values=>values.some(value=>/^已保存 /.test(value)),'Expression draft save did not settle');recordingUiWrite=false;return savedDraft;};
      const falseSaved=await save(values=>values.amount==='10000'&&values.type==='SPECIAL');
      const falseDraft=success(await api('employee',`/workflow/wf/draft/${falseSaved.draftId}`),'c3_expression_'+device+'_false_server_read');
      check('c3_expression_'+device+'_false_server_omits_value',!Object.hasOwn(decode(falseDraft.formData),'conditionNote'));
      await control(draft,'amount').fill('10000.01');await control(draft,'conditionNote').waitFor();await control(draft,'type').fill('NORMAL');
      check('c3_expression_'+device+'_type_change_hides_control',await id(draft,'field-conditionNote').count()===0);await control(draft,'type').fill('SPECIAL');await control(draft,'conditionNote').waitFor();
      const values={conditionNote:processName+'-private-condition',nodeHidden:processName+'-private-hidden',nodeReadonly:processName+'-private-fixed'};Object.values(values).forEach(value=>secrets.add(value));
      for(const [field,value] of Object.entries(values))await control(draft,field).fill(value);
      const trueSaved=await save(value=>value.conditionNote===values.conditionNote&&value.nodeHidden===values.nodeHidden&&value.nodeReadonly===values.nodeReadonly);
      const trueDraft=success(await api('employee',`/workflow/wf/draft/${trueSaved.draftId}`),'c3_expression_'+device+'_true_server_read');
      check('c3_expression_'+device+'_true_server_preserves_value',decode(trueDraft.formData).conditionNote===values.conditionNote);
      await employee.screenshot({path:path.join(output,device+'-true-condition.png')});recordingUiWrite=true;
      const starting=employee.waitForResponse(response=>response.request().method()==='POST'&&new URL(response.url()).pathname==='/api/workflow/wf/start').catch(()=>null);
      await tap(draft.getByRole('button',{name:'提交申请',exact:true}));const started=await starting;assert.ok(started);const startBody=await started.json();recordingUiWrite=false;
      check('c3_expression_'+device+'_real_start',started.status()===200&&startBody.code===200);const instanceId=startBody.data.instanceId||startBody.data.processInstanceId;fixture.instances.push(instanceId);saveFixture();
      const taskId=await waitFor(()=>database(`SELECT task_id FROM wf_task WHERE tenant_id=100000 AND instance_id=${sqlText(instanceId)} AND status='TODO'`),Boolean,'Expression task missing');flows.push({device,configured,definitionId,instanceId,taskId});
      const detail=success(await api('peer',`/workflow/wf/instance/${instanceId}?taskId=${taskId}`),'c3_expression_'+device+'_approval_read');const projected=decode(detail.variables);
      check('c3_expression_'+device+'_node_visibility_priority',configured?!Object.hasOwn(projected,'nodeHidden'):projected.nodeHidden===values.nodeHidden);
      if(configured){for(const field of ['nodeHidden','nodeReadonly']){
        const attempted=values[field]+'-tamper';secrets.add(attempted);const before=database(`SELECT variables FROM wf_process_instance WHERE tenant_id=100000 AND instance_id=${sqlText(instanceId)}`);
        const rejected=await api('peer','/workflow/wf/complete',{method:'POST',body:{taskId,action:'APPROVE',variables:{[field]:attempted}}});
        check('c3_expression_node_'+field+'_tamper_denied',rejected.status===400&&rejected.body?.code==='FORM_INVALID_DATA'&&database(`SELECT status FROM wf_task WHERE tenant_id=100000 AND task_id=${sqlText(taskId)}`)==='TODO'&&database(`SELECT variables FROM wf_process_instance WHERE tenant_id=100000 AND instance_id=${sqlText(instanceId)}`)===before);
      }}
      stage=device+'-approval';activePage=reviewer;await reviewer.goto(new URL('/workflow/task/'+taskId,reviewer.url()).href,{waitUntil:'domcontentloaded'});
      const task=reviewer.getByRole('dialog',{name:'任务处理',exact:true});await task.waitFor();await control(task,'conditionNote').waitFor();
      if(configured)check('c3_expression_mobile_node_controls_restricted',await id(task,'field-nodeHidden').count()===0&&await control(task,'nodeReadonly').count()===0&&(await id(task,'field-nodeReadonly').textContent()).includes(values.nodeReadonly));
      else {check('c3_expression_desktop_unconfigured_editable',await control(task,'nodeHidden').isEditable()&&await control(task,'nodeReadonly').isEditable());await control(task,'nodeHidden').fill('核对后公开值');await control(task,'nodeReadonly').fill('核对后编号');}
      await control(task,'conditionNote').fill('条件说明已核对');recordingUiWrite=true;
      const completing=reviewer.waitForResponse(response=>response.request().method()==='POST'&&new URL(response.url()).pathname==='/api/workflow/wf/complete').catch(()=>null);
      await tap(task.getByRole('button',{name:'同意',exact:true}));await tap(task.getByRole('button',{name:'确认',exact:true}));const completed=await completing;recordingUiWrite=false;
      check('c3_expression_'+device+'_page_completes',completed&&completed.status()===200&&(await completed.json()).code===200);
      await waitFor(()=>database(`SELECT status FROM wf_process_instance WHERE tenant_id=100000 AND instance_id=${sqlText(instanceId)}`),value=>value==='PASSED','Expression process did not finish');
      const final=JSON.parse(database(`SELECT variables FROM wf_process_instance WHERE tenant_id=100000 AND instance_id=${sqlText(instanceId)}`));
      check('c3_expression_'+device+'_final_values',final.conditionNote==='条件说明已核对'&&final.nodeHidden===(configured?values.nodeHidden:'核对后公开值')&&final.nodeReadonly===(configured?values.nodeReadonly:'核对后编号'));
    }
    check('c3_expression_pages_no_browser_errors',pageErrors.length===0);
  } catch(error){failure=error;let message=String(error.message).split('\n')[0];for(const secret of secrets)message=message.split(secret).join('[REDACTED]');await fs.writeFile(path.join(output,'failure-stage.json'),JSON.stringify({stage,name:error.name,message}));if(activePage&&!activePage.isClosed())await activePage.screenshot({path:path.join(output,'failure.png')}).catch(()=>undefined);
  } finally {removers.forEach(remove=>remove());for(const mobile of mobiles)await mobile.close();await fs.writeFile(path.join(output,'result.json'),JSON.stringify({passed:!failure,stage,flows,pageErrors,realPages:true,fabricatedResponses:0},null,2));console.log(`C3_EXPRESSION_PAGES: flows=${flows.length}; browser_errors=${pageErrors.length}; passed=${!failure}`);}
  if(failure)throw failure;
}
