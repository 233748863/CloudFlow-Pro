import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { isDeepStrictEqual } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export async function verifyC3PermissionRaces({sessions,api,success,check,database,sqlText,fixture,saveFixture,marker,evidence,isolatedPath}) {
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),output=path.join(evidence,`c3-permission-races-${fixture.runId}`);await fs.mkdir(output);
  const module=path.join(root,'cloudflow-backend/cloudflow-service-workflow');
  const dependencies=(await fs.readFile(path.join(module,'target/batch-c-classpath.txt'),'utf8')).trim();
  const classpath=[path.join(module,'target/classes'),dependencies].join(path.delimiter);
  const races=[];let stage='setup',failure;
  const waitFor=async(read,accept,message)=>{const until=Date.now()+30000;do{const value=await read();if(accept(value))return value;await new Promise(resolve=>setTimeout(resolve,100));}while(Date.now()<until);throw new Error(message);};
  const post=async(endpoint,body,label)=>success(await api('admin','/workflow/wf'+endpoint,{method:'POST',body}),label);
  const rulesPath=id=>`/workflow/wf/definition/${id}/field-permissions`;
  const normalize=rules=>rules.map(rule=>({...rule,requiredFlag:rule.requiredFlag??null})).sort((a,b)=>a.fieldId.localeCompare(b.fieldId));
  const hold=async(definitionId,processKey)=>{
    const child=spawn('java',['-Dfile.encoding=UTF-8','-Dstdout.encoding=UTF-8','-Dstderr.encoding=UTF-8','-cp',classpath,
      path.join(root,'scripts/form-checks/C3OwnedDefinitionLock.java'),isolatedPath,definitionId,processKey],{cwd:root,windowsHide:true,stdio:['pipe','pipe','pipe']});
    let stdout='',stderr='',readyId,ended=false;
    child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');
    child.stdout.on('data',data=>{stdout+=data;const match=stdout.match(/^C3_OWNED_LOCK_READY=(\d+)\r?$/m);if(match)readyId=Number(match[1]);});child.stderr.on('data',data=>stderr+=data);
    const completion=new Promise(resolve=>{child.once('error',()=>{ended=true;resolve(-1);});child.once('close',code=>{ended=true;resolve(code);});});
    const release=async()=>{if(!child.stdin.destroyed)child.stdin.end('RELEASE\n');const code=await completion;check('c3_race_owned_lock_released_'+processKey.slice(-1),code===0&&stdout.includes('C3_OWNED_LOCK_RELEASED: database_writes=0'));};
    try{
      await waitFor(()=>({readyId,ended}),value=>value.readyId||value.ended,'Owned definition lock did not become ready');
      if(!readyId){await fs.writeFile(path.join(output,processKey.slice(-1)+'-helper-failure.json'),JSON.stringify({diagnostics:stderr.split(/\r?\n/).filter(line=>/^C3_OWNED_LOCK_FAILED: type=[A-Za-z]+$/.test(line)||/^.*C3OwnedDefinitionLock\.java:\d+: error:/.test(line))}));throw new Error('Owned definition lock could not initialize');}
      return {connectionId:readyId,release};
    }catch(error){if(!child.stdin.destroyed)child.stdin.end('RELEASE\n');await completion;throw error;}
  };
  try {
    const name=marker+'-race-form',form=await post('/form/save',{formKey:name,formName:name,fieldsJson:JSON.stringify([{id:'salary',type:'AMOUNT',label:'薪资',precision:2},{id:'note',type:'TEXT',label:'说明'}])},'c3_race_form_saved');
    const formId=form.formId||form.id;fixture.forms.push(formId);saveFixture();
    const modelJson=JSON.stringify({nodes:[{id:'start',type:'START',title:'发起'},{id:'approval',type:'APPROVAL',title:'核对',approverType:'USER',approverValue:sessions.peer.account.userId},{id:'end',type:'END',title:'结束'}],edges:[{source:'start',target:'approval'},{source:'approval',target:'end'}]});
    const originalRules=[{nodeKey:'__START__',fieldId:'salary',visibleFlag:true,editableFlag:true,requiredFlag:null}];
    const changedRules=[{nodeKey:'__START__',fieldId:'salary',visibleFlag:false,editableFlag:false,requiredFlag:null},{nodeKey:'__START__',fieldId:'note',visibleFlag:true,editableFlag:false,requiredFlag:null}];
    for(const suffix of ['a','b']){
      stage='prepare-'+suffix;const processKey=marker+'-race-'+suffix;
      const body={processKey,processName:processKey,formId,modelJson,startPermissionType:'ALL',startPermissionValue:'[]'};
      const saved=await post('/definition/save',body,'c3_race_definition_'+suffix);const definitionId=saved.definitionId||saved.id;fixture.definitions.push(definitionId);saveFixture();
      success(await api('admin',rulesPath(definitionId),{method:'PUT',body:originalRules}),'c3_race_original_rules_'+suffix);
      const locked=await hold(definitionId,processKey);const pending=[];let observedWaiters=0,settled=0,waitFailure;
      const order=suffix==='a'?['save','publish']:['publish','save'];
      // A second writer may queue behind an index lock already held by the first waiting writer.
      // Follow the wait graph rooted at this owned connection, instead of counting only direct edges.
      const waiting=()=>Number(database(`WITH RECURSIVE owned_waiters(thread_id, depth) AS (
        SELECT waits.REQUESTING_THREAD_ID, 1 FROM performance_schema.data_lock_waits waits
          JOIN performance_schema.threads blocker ON blocker.THREAD_ID=waits.BLOCKING_THREAD_ID WHERE blocker.PROCESSLIST_ID=${locked.connectionId}
        UNION ALL SELECT waits.REQUESTING_THREAD_ID, prior.depth+1 FROM performance_schema.data_lock_waits waits
          JOIN owned_waiters prior ON waits.BLOCKING_THREAD_ID=prior.thread_id WHERE prior.depth<8
      ) SELECT COUNT(DISTINCT thread_id) FROM owned_waiters`));
      const invoke=kind=>{
        const result=(kind==='save'?api('admin',rulesPath(definitionId),{method:'PUT',body:changedRules}):api('admin','/workflow/wf/definition/deploy/'+definitionId,{method:'POST'}))
          .then(value=>{settled++;return {kind,...value};},()=>{settled++;return {kind,transportFailure:true};});pending.push(result);
      };
      stage='overlap-'+suffix;
      try{invoke(order[0]);await waitFor(waiting,count=>count>=1,'First actual writer wait was not observed');invoke(order[1]);observedWaiters=await waitFor(waiting,count=>count>=2,'Two actual waiting writers were not observed');check('c3_race_two_real_writers_blocked_'+suffix,observedWaiters>=2&&settled===0);}
      catch(error){waitFailure=error;}
      finally{await locked.release();}
      const outcomes=await Promise.all(pending);
      await fs.writeFile(path.join(output,suffix+'-overlap.json'),JSON.stringify({observedWaiters,requestOrder:order,outcomes:outcomes.map(value=>({kind:value.kind,status:value.status,code:value.body?.code,transportFailure:Boolean(value.transportFailure)})),released:true}));
      if(waitFailure)throw waitFailure;
      const permission=outcomes.find(value=>value.kind==='save'),publication=outcomes.find(value=>value.kind==='publish');
      check('c3_race_real_publish_succeeds_'+suffix,publication?.status===200&&publication.body?.code===200);
      const changed=permission?.status===200&&permission.body?.code===200;
      check('c3_race_permission_has_serializable_outcome_'+suffix,changed||permission?.status===409&&permission.body?.code==='INVALID_STATE');
      const expected=changed?changedRules:originalRules;
      const actual=success(await api('admin',rulesPath(definitionId)),'c3_race_read_final_rules_'+suffix);
      check('c3_race_no_partial_or_lost_permissions_'+suffix,isDeepStrictEqual(normalize(actual),normalize(expected))&&database(`SELECT status FROM wf_process_definition WHERE tenant_id=100000 AND definition_id=${sqlText(definitionId)}`)==='PUBLISHED');
      const formRead=success(await api('employee',`/workflow/wf/form/${formId}?definitionId=${definitionId}`),'c3_race_actual_published_form_'+suffix);
      const fields=typeof formRead.fieldsJson==='string'?JSON.parse(formRead.fieldsJson):formRead.fields;
      check('c3_race_next_read_matches_committed_rules_'+suffix,Array.isArray(fields)&&fields.some(field=>field.id==='note')&&fields.some(field=>field.id==='salary')===!changed);
      stage='copy-'+suffix;
      const source=success(await api('admin','/workflow/wf/definition/'+definitionId),'c3_race_source_version_'+suffix);
      const copy=await post('/definition/save',{...body,definitionId,versionLock:source.versionLock},'c3_race_copy_after_overlap_'+suffix);
      const copyId=copy.definitionId||copy.id;fixture.definitions.push(copyId);saveFixture();
      const copied=success(await api('admin',rulesPath(copyId)),'c3_race_copied_rules_'+suffix);
      check('c3_race_copy_keeps_complete_committed_permissions_'+suffix,copyId!==definitionId&&copy.version===2&&isDeepStrictEqual(normalize(copied),normalize(expected)));
      await post('/definition/deploy/'+copyId,undefined,'c3_race_publish_copy_'+suffix);
      const preserved=success(await api('admin',rulesPath(definitionId)),'c3_race_original_rules_after_copy_'+suffix);
      check('c3_race_original_permissions_preserved_'+suffix,isDeepStrictEqual(normalize(preserved),normalize(expected)));
      races.push({suffix,definitionId,copyId,requestOrder:order,observedWaiters,permissionStatus:permission.status,publishStatus:publication.status,savedBeforePublish:changed,ruleCount:expected.length});
    }
  }catch(error){failure=error;await fs.writeFile(path.join(output,'failure-stage.json'),JSON.stringify({stage,name:error.name,message:String(error.message).split('\n')[0]}));
  }finally{await fs.writeFile(path.join(output,'result.json'),JSON.stringify({passed:!failure,stage,races,helperDatabaseWrites:0,fabricatedResponses:0},null,2));console.log(`C3_PERMISSION_RACES: races=${races.length}; passed=${!failure}`);}
  if(failure)throw failure;
}
