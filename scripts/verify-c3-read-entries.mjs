import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

export async function verifyC3ReadEntries({sessions,api,success,check,database,sqlText,fixture,saveFixture,marker,evidence,secrets}) {
  const output=path.join(evidence,`c3-read-entries-${fixture.runId}`);await fs.mkdir(output);
  const cases=[],flows=[];let stage='setup',failure;
  const decode=value=>typeof value==='string'?JSON.parse(value):value;
  const post=async(endpoint,body,label)=>success(await api('admin','/workflow/wf'+endpoint,{method:'POST',body}),label);
  const waitFor=async(read,accept,message)=>{const until=Date.now()+30000;do{const value=await read();if(accept(value))return value;await new Promise(resolve=>setTimeout(resolve,100));}while(Date.now()<until);throw new Error(message);};
  const inspect=(payload,{label,hidden=false,minValues=0,minDefinitions=0})=>{
    let values=0,definitions=0;
    const walk=value=>{
      if(Array.isArray(value)){value.forEach(walk);return;}if(!value||typeof value!=='object')return;
      for(const [key,child]of Object.entries(value)){
        if(['variables','formData','variablesChanged','formDataSnapshot'].includes(key)&&child){
          const data=decode(child);values++;
          check(label+'_values_'+values,data.publicNote!==undefined&&Array.isArray(data.items)&&data.items.length===2
            &&(hidden?!Object.hasOwn(data,'salary'):Object.hasOwn(data,'salary'))
            &&data.items.every(row=>Object.hasOwn(row,'note')&&(hidden?!Object.hasOwn(row,'amount'):Object.hasOwn(row,'amount'))));
        }else if(['fieldsJson','fields','formSchema'].includes(key)&&child){
          const text=JSON.stringify(decode(child));definitions++;
          check(label+'_definition_'+definitions,text.includes('公开说明')&&(hidden?!text.includes('受限薪资')&&!text.includes('受限明细金额'):text.includes('受限薪资')&&text.includes('受限明细金额')));
        }else if(['modelJson','snapshotJson','snapshotData','activeTasks'].includes(key)&&typeof child==='string'&&child.trim())walk(decode(child));
        else walk(child);
      }
    };
    walk(payload);check(label+'_expected_payload_present',values>=minValues&&definitions>=minDefinitions);cases.push({label,hidden,values,definitions});
  };
  const read=async(actor,endpoint,label,options={})=>{const value=success(await api(actor,'/workflow'+endpoint),label);inspect(value,{label,...options});return value;};
  const forbidden=async(actor,endpoint,label,method='GET',body)=>{
    const result=await api(actor,'/workflow'+endpoint,{method,body});check(label,result.status===403);cases.push({label,status:result.status,denied:true});
  };
  try {
    const name=marker+'-reads',fields=[{id:'salary',type:'AMOUNT',label:'受限薪资',precision:2},{id:'fixed',type:'TEXT',label:'固定编号'},
      {id:'publicNote',type:'TEXT',label:'公开说明'},{id:'items',type:'SUB_TABLE',label:'明细',columns:[{id:'amount',type:'AMOUNT',label:'受限明细金额',precision:2},{id:'note',type:'TEXT',label:'明细说明'}]}];
    const form=await post('/form/save',{formKey:name,formName:name,fieldsJson:JSON.stringify(fields)},'c3_reads_form_saved');
    const formId=form.formId||form.id;fixture.forms.push(formId);saveFixture();
    const modelJson=JSON.stringify({nodes:[{id:'start',type:'START',title:'发起'},{id:'approval',type:'APPROVAL',title:'部门核对',approverType:'USER',approverValue:sessions.peer.account.userId,allowEdit:true},{id:'end',type:'END',title:'完成'}],edges:[{source:'start',target:'approval'},{source:'approval',target:'end'}]});
    for(const suffix of ['a','b']){
      stage='create-'+suffix;const processName=name+'-'+suffix;
      const saved=await post('/definition/save',{processKey:processName,processName,formId,modelJson,startPermissionType:'ALL',startPermissionValue:'[]'},'c3_reads_definition_'+suffix);
      const definitionId=saved.definitionId||saved.id;fixture.definitions.push(definitionId);saveFixture();
      const hidden=suffix==='a';if(hidden)success(await api('admin',`/workflow/wf/definition/${definitionId}/field-permissions`,{method:'PUT',body:['salary','items.amount'].map(fieldId=>({nodeKey:'approval',fieldId,visibleFlag:false,editableFlag:false,requiredFlag:null}))}),'c3_reads_hidden_rules_saved');
      await post('/definition/deploy/'+definitionId,undefined,'c3_reads_publish_'+suffix);
      const context=await read('employee','/wf/draft/context/'+definitionId,'c3_reads_context_'+suffix,{minDefinitions:1});
      const values={salary:'32145.67',fixed:processName+'-private',publicNote:'申请'+suffix,items:[{_rowId:'first',amount:'98.76',note:'第一条'},{_rowId:'second',amount:'54.32',note:'第二条'}]};secrets.add(values.fixed);
      const draft=success(await api('employee','/workflow/wf/draft',{method:'POST',body:{definitionId,expectedVersion:0,loadedContextHash:context.contextHash,title:processName,formData:values,nodeAssignees:{}}}),'c3_reads_save_draft_'+suffix);
      inspect(draft,{label:'c3_reads_draft_save_response_'+suffix});check('c3_reads_draft_save_is_summary_'+suffix,!Object.hasOwn(draft,'formData'));
      const detail=await read('employee','/wf/draft/'+draft.draftId,'c3_reads_draft_detail_'+suffix,{minValues:1,minDefinitions:1});
      check('c3_reads_draft_owner_value_'+suffix,decode(detail.formData).fixed===values.fixed);
      const summary=await read('employee','/wf/draft/by-definition/'+definitionId,'c3_reads_draft_summary_'+suffix);
      check('c3_reads_draft_summary_identity_'+suffix,summary.draftId===draft.draftId&&!Object.hasOwn(summary,'formData'));
      const list=await read('employee','/wf/draft/list?pageNum=1&pageSize=100&definitionId='+definitionId,'c3_reads_draft_list_'+suffix);
      check('c3_reads_draft_list_contains_owned_'+suffix,list.rows.some(row=>row.draftId===draft.draftId)&&list.rows.every(row=>!Object.hasOwn(row,'formData')));
      const otherDraft=await api('peer','/workflow/wf/draft/'+draft.draftId);
      check('c3_reads_other_user_draft_denied_'+suffix,otherDraft.status>=400&&otherDraft.status<500&&otherDraft.body?.code==='DRAFT_NOT_FOUND');cases.push({label:'other-draft-'+suffix,status:otherDraft.status,denied:true});
      const started=success(await api('employee','/workflow/wf/start',{method:'POST',body:{draftId:draft.draftId,expectedVersion:draft.lockVersion}}),'c3_reads_start_'+suffix);
      const instanceId=started.instanceId||started.processInstanceId;fixture.instances.push(instanceId);saveFixture();
      const taskId=await waitFor(()=>database(`SELECT task_id FROM wf_task WHERE tenant_id=100000 AND instance_id=${sqlText(instanceId)} AND status='TODO'`),Boolean,'Read-entry task missing');
      flows.push({definitionId,instanceId,taskId,hidden,suffix,values});
    }
    stage='mixed-lists';
    const mixed=async(endpoint,actor,asOwner=false)=>{
      const label='c3_reads_'+endpoint+'_'+actor,result=success(await api(actor,'/workflow/wf/'+endpoint+'?pageNum=1&pageSize=100'),label);
      const owned=result.rows.filter(row=>flows.some(flow=>flow.instanceId===row.instanceId));check(label+'_contains_two_instances',owned.length===2);
      for(const flow of flows)inspect(owned.find(row=>row.instanceId===flow.instanceId),{label:label+'_'+flow.suffix,hidden:!asOwner&&flow.hidden,minValues:1,minDefinitions:1});
    };
    await mixed('todo','peer');await mixed('my-instances','employee',true);
    for(const flow of flows){
      const {instanceId,taskId,definitionId,hidden,suffix}=flow;
      for(const [entry,endpoint,values,definitions]of [['instance',`/wf/instance/${instanceId}`,1,1],['task',`/wf/todo/${taskId}`,1,1],['trace',`/wf/instance/${instanceId}/trace`,0,0],['flowchart',`/enhance/flowchart/${instanceId}`,0,0],['business_form',`/wf/form/${formId}?instanceId=${instanceId}&taskId=${taskId}`,0,1]]){
        await read('peer',endpoint,'c3_reads_'+entry+'_'+suffix,{hidden,minValues:values,minDefinitions:definitions});
      }
      await read('employee',`/wf/form/${formId}?definitionId=${definitionId}`,'c3_reads_start_form_'+suffix,{minDefinitions:1});
      await read('admin','/monitor/process/'+instanceId,'c3_reads_monitor_'+suffix);
      for(const endpoint of [`/wf/instance/${instanceId}`,`/wf/todo/${taskId}`,`/wf/form/${formId}?instanceId=${instanceId}&taskId=${taskId}`]){
        const denied=await api('foreign','/workflow'+endpoint);check('c3_reads_foreign_'+suffix+'_'+cases.length,denied.status>=400&&denied.status<500);cases.push({label:'foreign-'+suffix,endpoint,status:denied.status,denied:true});
      }
    }
    stage='designer-history';
    const second=await post('/form/save',{formId,formName:name,versionLock:form.versionLock,fieldsJson:JSON.stringify([...fields,{id:'added',type:'TEXT',label:'新版说明'}])},'c3_reads_form_version_two');check('c3_reads_form_version_two_created',second.version===2);
    const original=flows[0];
    const definition=success(await api('admin','/workflow/wf/definition/'+original.definitionId),'c3_reads_original_definition');
    const copied=await post('/definition/save',{definitionId:original.definitionId,versionLock:definition.versionLock,processKey:definition.processKey,processName:definition.processName,formId,modelJson,startPermissionType:'ALL',startPermissionValue:'[]'},'c3_reads_copy_definition');
    const copiedId=copied.definitionId||copied.id;fixture.definitions.push(copiedId);saveFixture();check('c3_reads_definition_version_copy',copiedId!==original.definitionId&&copied.version===2);
    const designerEntries=[
      ['form',`/wf/form/${formId}`,1],['forms','/wf/forms?pageNum=1&pageSize=100',1],['form_versions',`/wf/form/${formId}/versions`,1],
      ['form_version',`/wf/form/${formId}/versions/1`,1],['form_diff',`/wf/form/${formId}/versions/compare?from=1&to=2`,0],
      ['definition',`/wf/definition/${original.definitionId}`,0],['definitions','/wf/definitions?pageNum=1&pageSize=100',0],
      ['definition_versions',`/versions/workflow/${original.definitionId}`,0],['definition_version',`/versions/${original.definitionId}`,0],
      ['definition_diff',`/versions/compare?fromVersionId=${original.definitionId}&toVersionId=${copiedId}`,0],
      ['deploy_versions',`/deploy/rollback/versions/${original.definitionId}`,0],['deploy_snapshot',`/deploy/snapshot/${original.definitionId}/1`,0],
      ['definition_flowchart',`/enhance/flowchart/definition/${original.definitionId}`,0],
    ];
    for(const [label,endpoint,minDefinitions]of designerEntries){
      await forbidden('employee',endpoint,'c3_reads_employee_'+label+'_denied');
      const result=success(await api('admin','/workflow'+endpoint),'c3_reads_admin_'+label);
      const selected=label==='forms'?(Array.isArray(result)?result:result.rows).filter(row=>(row.formId||row.id)===formId):result;
      inspect(selected,{label:'c3_reads_admin_'+label,minDefinitions});
      if(label==='form')check('c3_reads_designer_latest_version',result.version===2);
      if(label==='form_version')check('c3_reads_designer_historical_version',result.version===1);
      if(label==='form_diff')check('c3_reads_designer_diff_contains_addition',result.added.some(row=>row.fieldId==='added'));
    }
    for(const includeSensitive of ['false','true']){
      const endpoint='/import-export/export/'+original.definitionId+'?includeSensitive='+includeSensitive;
      await forbidden('employee',endpoint,'c3_reads_employee_export_'+includeSensitive+'_denied');
      const exported=await api('admin','/workflow'+endpoint);check('c3_reads_admin_export_'+includeSensitive,exported.status===200&&exported.contentType?.includes('application/json')&&exported.body?.workflow);
      cases.push({label:'admin-export-'+includeSensitive,status:exported.status,designerAccess:true});
    }
    const exportBody={workflowIds:[original.definitionId,copiedId],includeSensitive:false};
    await forbidden('employee','/import-export/export/batch','c3_reads_employee_batch_export_denied','POST',exportBody);
    const batch=await api('admin','/workflow/import-export/export/batch',{method:'POST',body:exportBody});check('c3_reads_admin_batch_export',batch.status===200&&Array.isArray(batch.body)&&batch.body.length===2);cases.push({label:'admin-batch-export',status:batch.status,designerAccess:true});
    stage='completed-lists';
    for(const flow of flows){
      await read('peer',`/wf/form/${formId}?instanceId=${flow.instanceId}&taskId=${flow.taskId}`,'c3_reads_pinned_old_form_'+flow.suffix,{hidden:flow.hidden,minDefinitions:1});
      success(await api('peer','/workflow/wf/complete',{method:'POST',body:{taskId:flow.taskId,action:'APPROVE',variables:{publicNote:'核对完成'}}}),'c3_reads_complete_'+flow.suffix);
      await waitFor(()=>database(`SELECT status FROM wf_process_instance WHERE tenant_id=100000 AND instance_id=${sqlText(flow.instanceId)}`),value=>value==='PASSED','Read-entry process did not finish');
    }
    await mixed('done','peer');await mixed('my-instances','employee',true);
    for(const flow of flows){
      await read('peer','/wf/instance/'+flow.instanceId,'c3_reads_completed_detail_'+flow.suffix,{hidden:flow.hidden,minValues:1,minDefinitions:1});
      const stored=JSON.parse(database(`SELECT variables FROM wf_process_instance WHERE tenant_id=100000 AND instance_id=${sqlText(flow.instanceId)}`));
      check('c3_reads_engine_values_retained_'+flow.suffix,stored.fixed===flow.values.fixed&&stored.salary===flow.values.salary&&stored.items.every((row,index)=>row.amount===flow.values.items[index].amount));
    }
  }catch(error){failure=error;let message=String(error.message).split('\n')[0];for(const secret of secrets)message=message.split(secret).join('[REDACTED]');await fs.writeFile(path.join(output,'failure-stage.json'),JSON.stringify({stage,name:error.name,message}));
  }finally{await fs.writeFile(path.join(output,'result.json'),JSON.stringify({passed:!failure,stage,flows:flows.map(({values,...flow})=>flow),cases,fabricatedResponses:0},null,2));console.log(`C3_READ_ENTRIES: cases=${cases.length}; flows=${flows.length}; passed=${!failure}`);}
  if(failure)throw failure;
}
