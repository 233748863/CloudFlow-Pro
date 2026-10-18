import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

export async function verifyC3MatrixTemplates({ sessions, api, success, check, fixture, saveFixture, marker, evidence, requests }) {
  const output=path.join(evidence,`c3-matrix-templates-${fixture.runId}`);await fs.mkdir(output);
  const page=sessions.admin.page,errors=[];let stage='setup',failure,recording=false;
  const onError=error=>errors.push(error.name);
  const onResponse=response=>{const endpoint=new URL(response.url()).pathname;if(recording&&response.request().method()==='PUT'&&endpoint.endsWith('/field-permissions'))requests.push({actor:'admin',path:endpoint.slice(4),method:'PUT',status:response.status(),traceId:response.headers()['x-trace-id'],observedAt:Date.now(),realPage:true});};
  page.on('pageerror',onError);page.on('response',onResponse);
  const post=async(endpoint,body,label)=>success(await api('admin','/workflow/wf'+endpoint,{method:'POST',body}),label);
  try {
    const name=marker+'-templates';
    const fields=[{id:'note',type:'TEXT',label:'填写说明',required:true},{id:'fixed',type:'TEXT',label:'固定编号',readonly:true},
      {id:'items',type:'SUB_TABLE',label:'明细',columns:[{id:'note',type:'TEXT',label:'明细说明'},{id:'amount',type:'AMOUNT',label:'明细金额',precision:2}]}];
    const form=await post('/form/save',{formKey:name,formName:name,fieldsJson:JSON.stringify(fields)},'c3_template_form_saved');
    const formId=form.formId||form.id;fixture.forms.push(formId);saveFixture();
    const modelJson=JSON.stringify({nodes:[{id:'start',type:'START',title:'发起'},{id:'approval',type:'APPROVAL',title:'部门核对',approverType:'USER',approverValue:sessions.peer.account.userId,allowEdit:true},{id:'hr',type:'APPROVAL',title:'人事复核',approverType:'USER',approverValue:sessions.admin.account.userId},{id:'end',type:'END',title:'完成'}],edges:[{source:'start',target:'approval'},{source:'approval',target:'hr'},{source:'hr',target:'end'}]});
    const saved=await post('/definition/save',{processKey:name,processName:name,formId,modelJson,startPermissionType:'ALL',startPermissionValue:'[]'},'c3_template_definition_saved');
    const definitionId=saved.definitionId||saved.id;fixture.definitions.push(definitionId);saveFixture();
    const open=async()=>{await page.goto(new URL('/workflow/design?id='+definitionId,page.url()).href,{waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'字段权限',exact:true}).click();const dialog=page.getByRole('dialog',{name:/^字段权限 · /});await dialog.getByRole('checkbox',{name:'note approval 可见',exact:true}).waitFor();return dialog;};
    const rules=async()=>success(await api('admin',`/workflow/wf/definition/${definitionId}/field-permissions`),'c3_template_rules_read');
    const box=(dialog,field,node,setting)=>dialog.getByRole('checkbox',{name:`${field} ${node} ${setting}`,exact:true});
    const save=async(dialog,label)=>{
      recording=true;const waiting=page.waitForResponse(response=>response.request().method()==='PUT'&&new URL(response.url()).pathname===`/api/workflow/wf/definition/${definitionId}/field-permissions`);
      await dialog.getByRole('button',{name:'保存权限',exact:true}).click();const response=await waiting;check(label,response.status()===200&&(await response.json()).code===200);
      const deadline=Date.now()+30000;while(!(await dialog.getByRole('button',{name:'保存权限',exact:true}).isDisabled())){assert.ok(Date.now()<deadline);await new Promise(resolve=>setTimeout(resolve,100));}recording=false;
    };
    stage='initiator-template';let dialog=await open();await dialog.getByRole('button',{name:'仅发起人可编辑',exact:true}).click();
    for(const node of ['__START__','approval','hr'])for(const field of ['note','fixed','items','items.note','items.amount']){
      check('c3_template_cell_'+node+'_'+field,await box(dialog,field,node,'可见').isChecked()&&(await box(dialog,field,node,'可编辑').isChecked())===(node==='__START__'&&field!=='fixed'));
    }
    check('c3_template_keeps_intrinsic_readonly',await box(dialog,'fixed','__START__','可编辑').isDisabled());
    await save(dialog,'c3_template_initiator_actual_save');const first=await rules();
    check('c3_template_saved_all_fields_and_nodes',first.length===15&&first.every(rule=>rule.visibleFlag&&rule.editableFlag===(rule.nodeKey==='__START__'&&rule.fieldId!=='fixed')&&rule.requiredFlag===null));
    await dialog.getByRole('button',{name:'取消',exact:true}).click();dialog=await open();
    check('c3_template_reload_and_required_inheritance',await box(dialog,'note','__START__','可编辑').isChecked()&&!(await box(dialog,'note','approval','可编辑').isChecked())&&await box(dialog,'note','approval','必填').isChecked());
    stage='selected-visibility';await dialog.getByRole('checkbox',{name:'明细金额整行',exact:true}).check();await dialog.getByRole('checkbox',{name:'人事复核整列',exact:true}).check();await dialog.getByRole('button',{name:'仅所选节点可见',exact:true}).click();
    check('c3_template_selected_column_visibility',!(await box(dialog,'items.amount','__START__','可见').isChecked())&&!(await box(dialog,'items.amount','approval','可见').isChecked())&&await box(dialog,'items.amount','hr','可见').isChecked());
    await save(dialog,'c3_template_selected_actual_save');const selected=await rules();
    check('c3_template_selected_only_changes_target_column',selected.length===15&&selected.every(rule=>rule.fieldId==='items.amount'?rule.visibleFlag===(rule.nodeKey==='hr')&&!rule.editableFlag:JSON.stringify(rule)===JSON.stringify(first.find(previous=>previous.nodeKey===rule.nodeKey&&previous.fieldId===rule.fieldId))));
    stage='inheritance';await dialog.getByRole('button',{name:'items.amount approval 恢复继承',exact:true}).click();await save(dialog,'c3_template_restore_inheritance_save');
    const inherited=await rules();check('c3_template_inheritance_removes_only_exception',inherited.length===14&&!inherited.some(rule=>rule.nodeKey==='approval'&&rule.fieldId==='items.amount'));
    await dialog.getByRole('button',{name:'取消',exact:true}).click();dialog=await open();
    check('c3_template_inheritance_reload',await box(dialog,'items.amount','approval','可见').isChecked()&&await box(dialog,'items.amount','approval','可编辑').isChecked());
    await page.screenshot({path:path.join(output,'templates-and-inheritance.png')});await dialog.getByRole('button',{name:'取消',exact:true}).click();
    await post('/definition/deploy/'+definitionId,undefined,'c3_template_publish');dialog=await open();
    check('c3_template_published_actions_disabled',await dialog.getByRole('button',{name:'仅发起人可编辑',exact:true}).isDisabled()&&await dialog.getByRole('button',{name:'保存权限',exact:true}).isDisabled());
    check('c3_template_no_browser_errors',errors.length===0);
  } catch(error){failure=error;await fs.writeFile(path.join(output,'failure-stage.json'),JSON.stringify({stage,name:error.name,message:String(error.message).split('\n')[0]}));await page.screenshot({path:path.join(output,'failure.png')}).catch(()=>undefined);
  } finally {page.off('pageerror',onError);page.off('response',onResponse);await fs.writeFile(path.join(output,'result.json'),JSON.stringify({passed:!failure,stage,browserErrors:errors.length,realPage:true},null,2));console.log(`C3_MATRIX_TEMPLATES: browser_errors=${errors.length}; passed=${!failure}`);}
  if(failure)throw failure;
}
