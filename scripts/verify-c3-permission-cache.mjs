import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export async function verifyC3PermissionCache({ sessions, api, success, check, database, sqlText, fixture, saveFixture, marker, evidence, isolatedPath }) {
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
  const output=path.join(evidence,`c3-permission-cache-${fixture.runId}`);await fs.mkdir(output);
  const module=path.join(root,'cloudflow-backend/cloudflow-service-workflow');
  const dependencies=(await fs.readFile(path.join(module,'target/batch-c-classpath.txt'),'utf8')).trim();
  const classpath=[path.join(module,'target/classes'),dependencies].join(path.delimiter);
  const observations=[],definitions=[];let stage='setup',failure;
  const post=async(endpoint,body,label)=>success(await api('admin','/workflow/wf'+endpoint,{method:'POST',body}),label);
  const permissionPath=id=>`/workflow/wf/definition/${id}/field-permissions`;
  const read=async(definition,mode,label)=>{
    const args=['-Dfile.encoding=UTF-8','-Dstdout.encoding=UTF-8','-Dstderr.encoding=UTF-8','-cp',classpath,
      path.join(root,'scripts/form-checks/C3OwnedPermissionCache.java'),isolatedPath,definition.id,definition.key,mode];
    const result=await new Promise((resolve,reject)=>{
      const child=spawn('java',args,{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe']});let stdout='',stderr='';
      child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');child.stdout.on('data',value=>stdout+=value);child.stderr.on('data',value=>stderr+=value);
      child.once('error',reject);child.once('close',code=>resolve({code,stdout,stderr}));
    });
    if(result.code!==0){
      const safe=result.stderr.split(/\r?\n/).filter(line=>/^C3_OWNED_CACHE_FAILED: type=[A-Za-z]+$/.test(line)||/^.*C3OwnedPermissionCache\.java:\d+: error:/.test(line));
      await fs.writeFile(path.join(output,label+'-failure.json'),JSON.stringify({exit:result.code,diagnostics:safe}));
      throw new Error('Owned cache helper failed at '+label+'; private output omitted');
    }
    const lines=result.stdout.split(/\r?\n/).filter(line=>line.startsWith('C3_OWNED_CACHE_RESULT='));assert.equal(lines.length,1);
    const value=JSON.parse(lines[0].slice('C3_OWNED_CACHE_RESULT='.length));observations.push({label,definition:definition.key,mode,...value});
    check('c3_cache_'+label+'_read_only_database',value.databaseWrites===0);
    if(mode==='warm')check('c3_cache_'+label+'_actual_cache_hit',value.actualCacheAnnotation&&value.actualMapper&&value.secondSelects===0);
    return value;
  };
  try {
    const fields=[{id:'privateNote',type:'TEXT',label:'受限说明'},{id:'publicNote',type:'TEXT',label:'公开说明'}];
    const form=await post('/form/save',{formKey:marker+'-cache-form',formName:marker+'-cache-form',fieldsJson:JSON.stringify(fields)},'c3_cache_form_saved');
    const formId=form.formId||form.id;fixture.forms.push(formId);saveFixture();
    const modelJson=JSON.stringify({nodes:[{id:'start',type:'START',title:'发起'},{id:'approval',type:'APPROVAL',title:'核对',approverType:'USER',approverValue:sessions.peer.account.userId},{id:'end',type:'END',title:'完成'}],edges:[{source:'start',target:'approval'},{source:'approval',target:'end'}]});
    for(const suffix of ['a','b']){
      const key=marker+'-cache-'+suffix;
      const saved=await post('/definition/save',{processKey:key,processName:key,formId,modelJson,startPermissionType:'ALL',startPermissionValue:'[]'},'c3_cache_definition_'+suffix+'_saved');
      const id=saved.definitionId||saved.id;fixture.definitions.push(id);saveFixture();definitions.push({id,key});
    }
    const [a,b]=definitions;
    for(const definition of definitions){
      const initial=await read(definition,'warm','initial_'+definition.key.slice(-1));
      check('c3_cache_initial_'+definition.key.slice(-1)+'_loads_database_once',initial.selects===1&&initial.rules.length===0);
    }
    const rules=[{nodeKey:'__START__',fieldId:'privateNote',visibleFlag:false,editableFlag:false,requiredFlag:null}];
    const save=async(body,label)=>success(await api('admin',permissionPath(a.id),{method:'PUT',body}),'c3_cache_'+label);
    stage='save-and-targeted-invalidation';await save(rules,'save_restriction');
    check('c3_cache_saved_definition_evicted',!(await read(a,'peek','after_save_a')).present);
    check('c3_cache_other_definition_retained',(await read(b,'peek','after_save_b')).present);
    const changed=await read(a,'warm','reload_changed');
    check('c3_cache_next_read_uses_saved_rules',changed.selects===1&&JSON.stringify(changed.rules)===JSON.stringify(rules));
    stage='rejected-save-preserves-cache';
    const bad=await api('admin',permissionPath(a.id),{method:'PUT',body:[{...rules[0],fieldId:'absent'}]});
    check('c3_cache_invalid_rule_rejected',bad.status===400);
    check('c3_cache_invalid_save_does_not_evict',(await read(a,'peek','after_invalid')).present);
    const unchanged=await read(a,'warm','unchanged');
    check('c3_cache_invalid_save_preserves_rules',unchanged.selects===0&&JSON.stringify(unchanged.rules)===JSON.stringify(rules)
      &&database(`SELECT COUNT(*) FROM wf_form_field_permission WHERE tenant_id=100000 AND definition_id=${sqlText(a.id)} AND field_id='privateNote' AND visible_flag=0 AND editable_flag=0`)==='1');
    const unauthorized=await api('employee',permissionPath(a.id),{method:'PUT',body:[]});
    check('c3_cache_employee_save_rejected',unauthorized.status===403);
    check('c3_cache_unauthorized_save_preserves_cache',(await read(a,'peek','after_unauthorized')).present);
    stage='clear-and-reload';await save([],'clear_rules');
    check('c3_cache_clear_evicts_saved_definition',!(await read(a,'peek','after_clear')).present);
    const cleared=await read(a,'warm','reload_empty');
    check('c3_cache_clear_reloads_empty_rules',cleared.selects===1&&cleared.rules.length===0);
    check('c3_cache_clear_preserves_other_definition',(await read(b,'peek','after_clear_b')).present);
    stage='publish-and-real-read';await save(rules,'restore_restriction');
    check('c3_cache_restore_evicts_empty_entry',!(await read(a,'peek','before_publish')).present);
    for(const definition of definitions)await post('/definition/deploy/'+definition.id,undefined,'c3_cache_publish_'+definition.key.slice(-1));
    const ids=value=>{
      const result=[];const walk=node=>{if(Array.isArray(node))node.forEach(walk);else if(node&&typeof node==='object'){if(node.id)result.push(node.id);for(const child of Object.values(node))walk(child);}};
      walk(value);return result;
    };
    for(const definition of definitions){
      const formRead=success(await api('employee',`/workflow/wf/form/${formId}?definitionId=${definition.id}`),'c3_cache_published_form_'+definition.key.slice(-1));
      const fieldsRead=typeof formRead.fieldsJson==='string'?JSON.parse(formRead.fieldsJson):formRead.fields;
      const fieldIds=ids(fieldsRead);check('c3_cache_published_'+definition.key.slice(-1)+'_visibility',fieldIds.includes('publicNote')&&fieldIds.includes('privateNote')===(definition===b));
    }
    const populated=await read(a,'warm','after_real_form_read');
    check('c3_cache_real_service_populated_saved_rules',populated.selects===0&&JSON.stringify(populated.rules)===JSON.stringify(rules));
    const frozen=await api('admin',permissionPath(a.id),{method:'PUT',body:[]});
    check('c3_cache_published_rules_remain_immutable',frozen.status===409&&frozen.body?.code==='INVALID_STATE');
    check('c3_cache_published_rejection_preserves_entry',(await read(a,'peek','after_published_denial')).present);
  } catch(error){failure=error;await fs.writeFile(path.join(output,'failure-stage.json'),JSON.stringify({stage,name:error.name,message:String(error.message).split('\n')[0]}));
  } finally {await fs.writeFile(path.join(output,'result.json'),JSON.stringify({passed:!failure,stage,definitions,observations,actualRedis:true,helperDatabaseWrites:0,fabricatedResponses:0},null,2));console.log(`C3_PERMISSION_CACHE: observations=${observations.length}; definitions=${definitions.length}; passed=${!failure}`);}
  if(failure)throw failure;
}
