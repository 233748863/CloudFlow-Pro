import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createB2MobileBrowser, tapB2Mobile } from './b2-mobile-browser.mjs';

export async function verifyC3PermissionPages({ sessions, api, success, check, database, sqlText, fixture, saveFixture, marker, evidence, secrets, requests }) {
  const output = path.join(evidence, `c3-permission-pages-${fixture.runId}`); await fs.mkdir(output);
  const page = sessions.admin.page, pageErrors = [], readCases = [], versions = [], removers = [], mobiles = [];
  let stage = 'setup', failure, activePage = page, recordingUiWrite = false;
  const name = marker + '-permissions';
  const waitFor = async (read, accept, message) => {
    const deadline = Date.now() + 30000;
    do { const value = await read(); if (accept(value)) return value; await new Promise(resolve => setTimeout(resolve, 100)); } while (Date.now() < deadline);
    throw new Error(message);
  };
  const post = async (endpoint, body, label) => success(await api('admin', '/workflow/wf' + endpoint, { method: 'POST', body }), label);
  const getRules = async definitionId => success(await api('admin', `/workflow/wf/definition/${definitionId}/field-permissions`), 'c3_read_saved_rules');
  const normalizeRules = rules => [...rules].sort((a,b) => `${a.nodeKey}:${a.fieldId}`.localeCompare(`${b.nodeKey}:${b.fieldId}`));
  const fields = [
    { id:'salary', type:'AMOUNT', label:'受限薪资', precision:2 },
    { id:'fixed', type:'TEXT', label:'只读编号' },
    { id:'publicNote', type:'TEXT', label:'公开说明', required:true },
    { id:'items', type:'SUB_TABLE', label:'核对明细', columns:[{ id:'amount', type:'AMOUNT', label:'受限明细金额', precision:2 }, { id:'note', type:'TEXT', label:'核对说明' }] },
  ];
  const modelJson = JSON.stringify({ nodes:[{ id:'start',type:'START',title:'发起' },
    { id:'approval',type:'APPROVAL',title:'部门核对',approverType:'USER',approverValue:sessions.peer.account.userId,allowEdit:true },
    { id:'hr',type:'APPROVAL',title:'人事复核',approverType:'USER',approverValue:sessions.admin.account.userId,allowEdit:true },
    { id:'end',type:'END',title:'结束' }],edges:[{source:'start',target:'approval'},{source:'approval',target:'hr'},{source:'hr',target:'end'}] });
  const safeShape = (value, label) => {
    check(label + '_keys_absent', !Object.hasOwn(value,'salary') && Array.isArray(value.items) && value.items.length === 2 && value.items.every(row => !Object.hasOwn(row,'amount') && Object.hasOwn(row,'note')));
  };
  const decode = value => typeof value === 'string' ? JSON.parse(value) : value;
  const inspectPayload = (payload, label, requireValues) => {
    let values = 0, definitions = 0;
    const walk = value => {
      if (!value || typeof value !== 'object') return;
      if (Array.isArray(value)) { value.forEach(walk); return; }
      for (const [key, child] of Object.entries(value)) {
        if (['variables','formData','formDataSnapshot'].includes(key) && child) {
          safeShape(decode(child),label + '_values_' + values++);
        } else if (['fieldsJson','fields','formSchema'].includes(key) && child) {
          const text = JSON.stringify(decode(child));
          check(label + '_definition_' + definitions++, !text.includes('受限薪资') && !text.includes('受限明细金额') && !text.includes('"id":"salary"'));
        } else if (['modelJson','snapshotJson','snapshotData','activeTasks'].includes(key) && typeof child === 'string' && child.trim()) walk(decode(child));
        else walk(child);
      }
    };
    walk(payload);
    if (requireValues) check(label + '_nonvacuous_values', values > 0 && definitions > 0);
    readCases.push({ label, values, definitions });
  };
  const watch = (actor, current, device) => {
    const error = value => pageErrors.push({ actor,device,name:value.name });
    const response = value => {
      const endpoint = new URL(value.url()).pathname, method = value.request().method();
      if (recordingUiWrite && /^\/api\/workflow\/wf\/(complete|definition\/[^/]+\/field-permissions)$/.test(endpoint) && ['POST','PUT'].includes(method)) {
        requests.push({actor,path:endpoint.slice(4),method,status:value.status(),traceId:value.headers()['x-trace-id'],observedAt:Date.now(),realPage:true,device});
      }
    };
    current.on('pageerror',error); current.on('response',response); removers.push(() => {current.off('pageerror',error);current.off('response',response);});
  };
  const openMatrix = async definitionId => {
    await page.goto(new URL('/workflow/design?id=' + definitionId,page.url()).href,{waitUntil:'domcontentloaded'});
    await page.getByRole('button',{name:'字段权限',exact:true}).click();
    const dialog = page.getByRole('dialog',{name:/^字段权限 · /}); await dialog.getByRole('checkbox',{name:'salary approval 可见',exact:true}).waitFor(); return dialog;
  };
  const saveMatrix = async (dialog, label) => {
    recordingUiWrite = true;
    const waiting = page.waitForResponse(response => response.request().method()==='PUT' && /\/field-permissions$/.test(new URL(response.url()).pathname)).catch(() => null);
    await dialog.getByRole('button',{name:'保存权限',exact:true}).click(); const response = await waiting;
    check(label, response && response.status()===200 && (await response.json()).code===200);
    await waitFor(() => dialog.getByRole('button',{name:'保存权限',exact:true}).isDisabled(),Boolean,'Permission save did not settle');
    recordingUiWrite = false;
  };
  const start = async (definitionId, version) => {
    const values = { salary:'12345.67',fixed:name+'-private-'+version,publicNote:'发起说明',items:[{_rowId:'first',amount:'98.76',note:'第一条'},{_rowId:'second',amount:'54.32',note:'第二条'}] };
    secrets.add(values.fixed);
    const context = success(await api('employee','/workflow/wf/draft/context/' + definitionId),'c3_start_context_' + version);
    const draft = success(await api('employee','/workflow/wf/draft',{method:'POST',body:{definitionId,expectedVersion:0,loadedContextHash:context.contextHash,title:name+'-'+version,formData:values,nodeAssignees:{}}}),'c3_save_draft_' + version);
    const started = success(await api('employee','/workflow/wf/start',{method:'POST',body:{draftId:draft.draftId,expectedVersion:draft.lockVersion}}),'c3_start_version_' + version);
    const instanceId = started.instanceId || started.processInstanceId; assert.ok(instanceId);fixture.instances.push(instanceId);saveFixture();
    const taskId = await waitFor(() => database(`SELECT task_id FROM wf_task WHERE tenant_id=100000 AND instance_id=${sqlText(instanceId)} AND node_key='approval' AND status='TODO'`),Boolean,'Permission approval task missing');
    return {definitionId,version,instanceId,taskId,values};
  };
  try {
    watch('admin',page,'desktop');watch('peer',sessions.peer.page,'desktop');await page.setViewportSize({width:1600,height:1100});
    const form = await post('/form/save',{formKey:name,formName:name,fieldsJson:JSON.stringify(fields)},'c3_initial_form_saved');
    const formId = form.formId || form.id;fixture.forms.push(formId);saveFixture();
    const body = {processKey:name,processName:name,formId,startPermissionType:'ALL',startPermissionValue:'[]',modelJson};
    const definition = await post('/definition/save',body,'c3_source_definition_saved');
    const source = definition.definitionId || definition.id;fixture.definitions.push(source);saveFixture();
    stage = 'matrix-save'; let dialog = await openMatrix(source);
    await dialog.getByRole('button',{name:'全选字段',exact:true}).click();await dialog.getByRole('button',{name:'反选字段',exact:true}).click();
    await dialog.getByRole('button',{name:'全选节点',exact:true}).click();await dialog.getByRole('button',{name:'反选节点',exact:true}).click();
    check('c3_matrix_inverse_clears_selection', (await dialog.textContent()).includes('已选0个字段 × 0个节点'));
    for (const label of ['受限薪资整行','受限明细金额整行','部门核对整列']) await dialog.getByRole('checkbox',{name:label,exact:true}).check();
    await dialog.getByRole('button',{name:'批量隐藏',exact:true}).click();
    check('c3_matrix_bulk_hide_disables_editing', !(await dialog.getByRole('checkbox',{name:'salary approval 可见',exact:true}).isChecked()) && await dialog.getByRole('checkbox',{name:'salary approval 可编辑',exact:true}).isDisabled());
    await dialog.getByRole('checkbox',{name:'fixed approval 可编辑',exact:true}).uncheck();
    await dialog.getByRole('checkbox',{name:'publicNote approval 必填',exact:true}).uncheck();
    await dialog.getByRole('checkbox',{name:'items.note approval 必填',exact:true}).check();
    await saveMatrix(dialog,'c3_matrix_actual_save');await dialog.getByRole('button',{name:'取消',exact:true}).click();
    const expectedRules = await getRules(source);check('c3_matrix_five_expected_rules',expectedRules.length===5 && expectedRules.every(rule => rule.nodeKey==='approval'));
    dialog = await openMatrix(source);
    check('c3_matrix_reload_saved_flags',!(await dialog.getByRole('checkbox',{name:'salary approval 可见',exact:true}).isChecked()) && !(await dialog.getByRole('checkbox',{name:'fixed approval 可编辑',exact:true}).isChecked()) && await dialog.getByRole('checkbox',{name:'items.note approval 必填',exact:true}).isChecked());
    await dialog.getByRole('button',{name:'取消',exact:true}).click();await post('/definition/deploy/'+source,undefined,'c3_source_published');
    versions.push(await start(source,1));
    stage = 'move-and-copy';
    const nested = [{id:'outer',type:'GROUP',label:'外层分组',children:[{id:'section',type:'GRID',label:'分栏布局',columns:2,children:fields}]}];
    await post('/form/save',{formId,formName:name,versionLock:form.versionLock,fieldsJson:JSON.stringify(nested),changeLog:'字段移入分组，业务标识保持'},'c3_layout_form_version_saved');
    const copied = await post('/definition/save',{...body,definitionId:source},'c3_new_definition_copies_permissions');
    const target = copied.definitionId || copied.id;fixture.definitions.push(target);saveFixture();
    check('c3_new_definition_identity_and_rules',target!==source && copied.version===2 && isDeepStrictEqual(normalizeRules(await getRules(target)),normalizeRules(expectedRules)));
    dialog = await openMatrix(target);
    check('c3_layout_matrix_uses_logical_paths',await dialog.getByRole('checkbox',{name:'salary approval 可见',exact:true}).count()===1 && await dialog.getByRole('checkbox',{name:'outer.section.salary approval 可见',exact:true}).count()===0);
    await dialog.getByRole('button',{name:'折叠核对明细',exact:true}).click();check('c3_matrix_collapses_subtable_columns',await dialog.getByRole('checkbox',{name:'items.note approval 必填',exact:true}).count()===0);
    await dialog.getByRole('button',{name:'展开核对明细',exact:true}).click();
    await dialog.getByRole('checkbox',{name:'publicNote approval 可编辑',exact:true}).uncheck();await saveMatrix(dialog,'c3_layout_matrix_saves_logical_paths');
    await dialog.getByRole('checkbox',{name:'publicNote approval 可编辑',exact:true}).check();await saveMatrix(dialog,'c3_layout_matrix_restores_edit');
    await page.screenshot({path:path.join(output,'layout-permission-matrix.png')});await dialog.getByRole('button',{name:'取消',exact:true}).click();
    check('c3_copy_original_permissions_unchanged',isDeepStrictEqual(normalizeRules(await getRules(source)),normalizeRules(expectedRules)));
    await post('/definition/deploy/'+target,undefined,'c3_target_published');versions.push(await start(target,2));
    const publishedWrite = await api('admin',`/workflow/wf/definition/${target}/field-permissions`,{method:'PUT',body:[]});
    check('c3_published_rules_remain_immutable',publishedWrite.status===409 && publishedWrite.body?.code==='INVALID_STATE' && isDeepStrictEqual(normalizeRules(await getRules(target)),normalizeRules(expectedRules)));
    const mobile = await createB2MobileBrowser({admin:sessions.peer.page,secrets,check,landingPath:'/tasks',landingHeading:'我的任务'});mobiles.push(mobile);watch('peer',mobile.page,'mobile');
    for (const current of versions) {
      const {instanceId,taskId,version,values} = current;stage = 'read-version-' + version;
      for (const [label,endpoint,required] of [
        ['instance',`/instance/${instanceId}?taskId=${taskId}`,true],['todo',`/todo/${taskId}`,false],
        ['trace',`/instance/${instanceId}/trace?taskId=${taskId}`,false],['form',`/form/${formId}?instanceId=${instanceId}&taskId=${taskId}`,false],
      ]) {
        const payload = success(await api('peer','/workflow/wf'+endpoint),`c3_v${version}_${label}_read`);inspectPayload(payload,`c3_v${version}_${label}`,required);
        if(label==='form') check(`c3_v${version}_pinned_form`,payload.version===version);
      }
      const before = database(`SELECT variables FROM wf_process_instance WHERE tenant_id=100000 AND instance_id=${sqlText(instanceId)}`);
      check('c3_read_preserves_engine_values_v'+version,JSON.parse(before).fixed===values.fixed && JSON.parse(before).salary===values.salary);
      const denied = await api('foreign',`/workflow/wf/instance/${instanceId}?taskId=${taskId}`);check('c3_cross_tenant_denied_v'+version,denied.status>=400 && denied.status<500);
      stage='write-boundaries-'+version;
      const tamper = values.fixed+'-tamper';secrets.add(tamper);
      const rejected = await api('peer','/workflow/wf/complete',{method:'POST',body:{taskId,action:'APPROVE',variables:{fixed:tamper}}});
      check('c3_readonly_tamper_rejected_v'+version,rejected.status===400 && rejected.body?.code==='FORM_INVALID_DATA');
      check('c3_tamper_retains_task_and_all_values_v'+version,database(`SELECT status FROM wf_task WHERE tenant_id=100000 AND task_id=${sqlText(taskId)}`)==='TODO' && database(`SELECT variables FROM wf_process_instance WHERE tenant_id=100000 AND instance_id=${sqlText(instanceId)}`)===before);
      const audit = database(`SELECT after_json FROM sys_audit_log WHERE tenant_id=100000 AND audit_name=${sqlText('拒绝流程表单字段篡改')} AND JSON_UNQUOTE(JSON_EXTRACT(after_json,'$.taskId'))=${sqlText(taskId)} ORDER BY create_time DESC LIMIT 1`);
      check('c3_tamper_audit_is_durable_and_private_v'+version,Boolean(audit) && JSON.parse(audit).fields.includes('fixed') && !audit.includes(tamper) && !audit.includes(values.fixed));
      const missing = await api('peer','/workflow/wf/complete',{method:'POST',body:{taskId,action:'APPROVE',variables:{items:values.items.map(row => ({_rowId:row._rowId,note:''}))}}});
      check('c3_node_required_overrides_optional_v'+version,missing.status===400 && missing.body?.code==='FORM_INVALID_DATA' && missing.body.errors?.some(error=>error.field==='items[0].note'));
      stage='page-approval-'+version;const reviewer=version===1?sessions.peer.page:mobile.page;activePage=reviewer;
      const tap = locator=>version===1?locator.click():tapB2Mobile(locator);
      await reviewer.goto(new URL('/workflow/task/'+taskId,reviewer.url()).href,{waitUntil:'domcontentloaded'});
      const task = reviewer.getByRole('dialog',{name:'任务处理',exact:true});await task.waitFor();
      const id = value=>task.locator(`[id=${JSON.stringify(value)}]`);await id('input-publicNote').waitFor();
      check('c3_page_hides_field_labels_and_controls_v'+version,await task.getByText('受限薪资',{exact:true}).count()===0 && await task.getByText('受限明细金额',{exact:true}).count()===0 && await id('input-salary').count()===0);
      check('c3_page_readonly_value_has_no_input_v'+version,(await id('field-fixed').textContent()).includes(values.fixed) && await id('input-fixed').count()===0);
      await id('input-publicNote').fill('');
      await id('input-items[0].note').fill('已核对第一条');await id('input-items[1].note').fill('已核对第二条');
      await reviewer.screenshot({path:path.join(output,`v${version}-approval.png`)});
      const completing = reviewer.waitForResponse(response=>response.request().method()==='POST' && new URL(response.url()).pathname==='/api/workflow/wf/complete').catch(()=>null);
      recordingUiWrite = true;
      await tap(task.getByRole('button',{name:'同意',exact:true}));await tap(task.getByRole('button',{name:'确认',exact:true}));
      const response = await completing;check('c3_page_node_optional_override_completes_v'+version,response && response.status()===200 && (await response.json()).code===200);
      recordingUiWrite = false;
      const hrTask = await waitFor(()=>database(`SELECT task_id FROM wf_task WHERE tenant_id=100000 AND instance_id=${sqlText(instanceId)} AND node_key='hr' AND status='TODO'`),Boolean,'HR review task missing');
      const retained = JSON.parse(database(`SELECT variables FROM wf_process_instance WHERE tenant_id=100000 AND instance_id=${sqlText(instanceId)}`));
      check('c3_omitted_readonly_and_hidden_values_preserved_v'+version,retained.fixed===values.fixed && retained.salary===values.salary && retained.publicNote==='' && retained.items.every((row,index)=>row.amount===values.items[index].amount && row._rowId===values.items[index]._rowId));
      const hr = success(await api('admin',`/workflow/wf/instance/${instanceId}?taskId=${hrTask}`),'c3_hr_authorized_read_v'+version);
      check('c3_hr_node_receives_protected_keys_v'+version,decode(hr.variables).salary===values.salary && decode(hr.variables).items.every((row,index)=>row.amount===values.items[index].amount));
      const old = success(await api('peer',`/workflow/wf/instance/${instanceId}`),'c3_history_actor_read_v'+version);inspectPayload(old,'c3_history_actor_v'+version,true);
      success(await api('admin','/workflow/wf/complete',{method:'POST',body:{taskId:hrTask,action:'APPROVE',variables:{publicNote:'复核完成'}}}),'c3_hr_completes_v'+version);
      await waitFor(()=>database(`SELECT status FROM wf_process_instance WHERE tenant_id=100000 AND instance_id=${sqlText(instanceId)}`),value=>value==='PASSED','Permission workflow did not finish');
    }
    check('c3_permission_pages_no_browser_errors',pageErrors.length===0);
  } catch (error) {
    failure=error;let message=String(error.message).split('\n')[0];for(const secret of secrets)message=message.split(secret).join('[REDACTED]');
    await fs.writeFile(path.join(output,'failure-stage.json'),JSON.stringify({stage,name:error.name,message}));
    if(activePage && !activePage.isClosed())await activePage.screenshot({path:path.join(output,'failure.png')}).catch(()=>undefined);
  } finally {
    removers.forEach(remove=>remove());for(const mobile of mobiles)await mobile.close();
    await fs.writeFile(path.join(output,'result.json'),JSON.stringify({passed:!failure,stage,versions:versions.map(({definitionId,version,instanceId,taskId})=>({definitionId,version,instanceId,taskId})),readCases,pageErrors,realPages:true,fabricatedResponses:0},null,2));
    console.log(`C3_PERMISSION_PAGES: versions=${versions.length}; reads=${readCases.length}; browser_errors=${pageErrors.length}; passed=${!failure}`);
  }
  if(failure)throw failure;
}
