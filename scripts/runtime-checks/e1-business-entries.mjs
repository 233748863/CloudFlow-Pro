import path from 'node:path';
import {createHash} from 'node:crypto';

export async function verifyBusinessEntries({runtime,rejected,owned,marker,customerId,customerName,output,observePage}) {
  const {check,ok,api,sessions,database,rows}=runtime;
  const quote=value=>"CONVERT(UNHEX('"+Buffer.from(String(value)).toString('hex')+"') USING utf8mb4)";
  const digest=value=>createHash('sha256').update(value).digest('hex');
  const salesOwner=Number(sessions.sales.identity.userId);
  const adminOwner=Number(sessions.admin.identity.userId);
  const fixtures=[{kind:'CUSTOMER',suffix:'customer',id:customerId,name:customerName,customerId,actor:'sales',table:'crm_customer',key:'customer_id'}];
  const definitions=[
    {kind:'OPPORTUNITY',suffix:'opportunity',endpoint:'/crm/opportunity',table:'crm_opportunity',key:'opportunity_id',nameKey:'opportunity_name',body:name=>({opportunityName:name,customerId,ownerId:salesOwner,expectedAmount:'10.00'})},
    {kind:'LEAD',suffix:'lead',endpoint:'/crm/lead',table:'crm_lead',key:'lead_id',nameKey:'lead_name',body:name=>({leadNo:name,leadName:name,companyName:name,contactName:'入口验收联系人'})},
    {kind:'TICKET',suffix:'ticket',endpoint:'/crm/ticket',table:'crm_service_ticket',key:'ticket_id',nameKey:'ticket_title',body:name=>({customerId,ticketTitle:name,severity:'P4'})},
    ...['contract','contract_without_customer'].map(suffix=>({kind:'CONTRACT',suffix,endpoint:'/oa/contract',table:'oa_contract',key:'contract_id',nameKey:'contract_name',body:name=>({contractName:name,contractNo:name,counterpartyName:'活动入口验收客户',contractType:'SALES',amount:'10.00',currency:'CNY',ownerId:salesOwner,...(suffix==='contract'?{customerId}:{})})})),
  ];
  for(const definition of definitions){
    const name=marker+'_entry_'+definition.suffix;
    await ok('admin',definition.endpoint,'POST',definition.body(name));
    const id=Number(database('SELECT '+definition.key+' FROM '+definition.table+' WHERE '+definition.nameKey+'='+quote(name)+' AND tenant_id=100000 AND deleted=0'));
    check('entry_fixture_'+definition.suffix,Number.isSafeInteger(id)&&id>0);
    const source=await ok('admin',definition.endpoint+'/'+id);
    const expectedCustomer=['lead','contract_without_customer'].includes(definition.suffix)?undefined:customerId;
    check('entry_source_customer_'+definition.suffix,(source.customerId||source.convertedCustomerId||undefined)===expectedCustomer);
    if(definition.kind==='LEAD')check('entry_lead_unconverted',!source.convertedCustomerId);
    if(definition.kind==='CONTRACT')check('entry_contract_draft_'+definition.suffix,source.status==='DRAFT');
    fixtures.push({...definition,id,name,customerId:expectedCustomer,actor:'admin'});
  }
  // Workspace reads intentionally recalculate customer health and update audit time.
  // Stabilize that read first; retain every other customer column, and separately
  // compare the complete row immediately around the activity write below.
  await ok('sales','/crm/customer/'+customerId+'/workspace');
  const customerColumns=database("SELECT column_name FROM information_schema.columns WHERE table_schema='cloud_flow_db' AND table_name='crm_customer' AND column_name NOT IN ('update_by','update_time') ORDER BY ordinal_position").split(/\r?\n/);
  check('entry_customer_preservation_columns',customerColumns.length>30&&customerColumns.every(column=>/^[a-z_]+$/.test(column)));
  for(const fixture of fixtures){
    fixture.fullQuery='SELECT * FROM '+fixture.table+' WHERE '+fixture.key+'='+fixture.id;
    fixture.query=fixture.kind==='CUSTOMER'?'SELECT '+customerColumns.join(',')+' FROM crm_customer WHERE customer_id='+fixture.id:fixture.fullQuery;
    fixture.hash=digest(database(fixture.query));
  }
  const origin=new URL(sessions.admin.page.url()).origin;
  const routeFor=fixture=>({CUSTOMER:'/office/crm/customer/'+fixture.id,OPPORTUNITY:'/office/crm/opportunities?opportunityId='+fixture.id,LEAD:'/office/crm/leads',TICKET:'/office/crm/tickets?searchId='+fixture.id,CONTRACT:'/office/contracts?searchId='+fixture.id})[fixture.kind];
  const dialogFor=fixture=>({OPPORTUNITY:'商机详情',LEAD:'线索详情',TICKET:'工单详情',CONTRACT:fixture.name})[fixture.kind];
  const at=date=>new Date(date-new Date(date).getTimezoneOffset()*60000).toISOString().slice(0,16);
  const pages=[];
  let failure;
  try {
    for(const fixture of fixtures){
      const label='entry_'+fixture.suffix;
      const page=await sessions[fixture.actor].context.newPage();pages.push(page);page.setDefaultTimeout(30000);observePage(page);
      page.on('pageerror',()=>runtime.browserErrors.push(label));
      await page.goto(origin+routeFor(fixture),{waitUntil:'networkidle'});
      if(fixture.kind==='CUSTOMER')await page.getByRole('tab',{name:'经营时间线',exact:true}).click();
      if(fixture.kind==='LEAD'){
        await page.getByPlaceholder('线索名称',{exact:true}).fill(fixture.name);
        const row=page.getByRole('row').filter({hasText:fixture.name});await row.waitFor();
        const fresh=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/crm/lead/'+fixture.id&&response.request().method()==='GET');
        await row.getByRole('button',{name:'查看线索',exact:true}).click();
        check(label+'_fresh_read',(await fresh).status()===200);
      }
      const parent=fixture.kind==='CUSTOMER'?page:page.getByRole('dialog',{name:dialogFor(fixture),exact:true});
      const entry=parent.getByRole('button',{name:'安排活动',exact:true});await entry.waitFor();
      check(label+'_button_enabled',await entry.isEnabled());
      const beforeWrite=digest(database(fixture.fullQuery));
      await entry.click();
      const editor=page.getByRole('dialog',{name:'创建活动',exact:true});await editor.waitFor();
      check(label+'_type_default',await editor.getByRole('combobox',{name:'关联类型',exact:true}).inputValue()===fixture.kind);
      const object=editor.locator('label').filter({has:page.getByText('关联对象',{exact:true})}).getByRole('combobox');
      check(label+'_object_default',await object.inputValue()===String(fixture.id));
      // The selected label must remain meaningful even when candidates exclude a customerless contract.
      await object.locator('option:checked').filter({hasText:fixture.name}).waitFor({state:'attached'});
      check(label+'_object_name',await object.locator('option:checked').textContent()===fixture.name);
      if(['LEAD','CONTRACT'].includes(fixture.kind)){
        const customer=editor.getByRole('combobox',{name:fixture.kind==='CONTRACT'?'所属客户':'关联对象',exact:true});
        const field=fixture.kind==='CONTRACT'?customer:editor.locator('label').filter({has:page.getByText('所属客户（可选）',{exact:true})}).getByRole('combobox');
        check(label+'_customer_default',await field.inputValue()===(fixture.customerId?String(fixture.customerId):''));
      }
      const ownerField=editor.locator('label').filter({has:page.getByText('负责人',{exact:true})}).getByRole('combobox');
      const actorOwner=Number(sessions[fixture.actor].identity.userId);
      const ownerName=database('SELECT nick_name FROM sys_user WHERE user_id='+actorOwner+' AND tenant_id=100000');
      await ownerField.getByText(ownerName,{exact:true}).waitFor();
      check(label+'_current_owner_visible',await ownerField.getByText(ownerName,{exact:true}).isVisible());
      if(fixture.actor==='sales')check(label+'_owner_locked',await ownerField.getAttribute('aria-disabled')==='true');
      const subject=marker+'_entry_saved_'+fixture.suffix;
      await editor.getByLabel('主题',{exact:true}).fill(subject);
      await editor.getByLabel('开始时间',{exact:true}).fill(at(Date.now()+172800000));
      await editor.getByLabel('结束时间',{exact:true}).fill(at(Date.now()+176400000));
      await editor.locator('label').filter({has:page.getByText('活动说明',{exact:true})}).locator('textarea').fill('从业务详情安排并保存，核对关联及归属。');
      await editor.locator('section').filter({has:page.getByRole('heading',{name:'提醒设置',exact:true})}).getByRole('button',{name:'移除',exact:true}).click();
      await editor.getByLabel('主题',{exact:true}).scrollIntoViewIfNeeded();
      await page.screenshot({path:path.join(output,'business-'+fixture.suffix+'-draft.png')});
      const savedResponse=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/crm/activity'&&response.request().method()==='POST');
      await editor.getByRole('button',{name:'保存活动',exact:true}).click();
      const response=await savedResponse;const body=await response.json();
      if(body.data?.activity?.activityId)owned.add(body.data.activity.activityId);
      check(label+'_saved',response.status()===200&&body.code===200&&body.data?.activity?.activityId>0);
      const activity=body.data.activity;
      check(label+'_saved_relation',activity.bizType===fixture.kind&&activity.bizId===fixture.id&&(activity.customerId||undefined)===fixture.customerId);
      check(label+'_saved_current_owner',activity.ownerId===actorOwner);
      check(label+'_saved_no_reminder',body.data.reminders.length===0);
      const reread=(await ok(fixture.actor,'/crm/activity/'+activity.activityId)).activity;
      check(label+'_detail_persisted',reread.subject===subject&&reread.bizType===fixture.kind&&reread.bizId===fixture.id&&(reread.customerId||undefined)===fixture.customerId&&reread.ownerId===actorOwner);
      const stored=rows("SELECT JSON_OBJECT('type',biz_type,'id',biz_id,'customer',customer_id,'owner',owner_id,'subject',subject) FROM crm_activity WHERE activity_id="+activity.activityId)[0];
      check(label+'_database_persisted',stored.type===fixture.kind&&stored.id===fixture.id&&(stored.customer||undefined)===fixture.customerId&&stored.owner===actorOwner&&stored.subject===subject);
      const savedDialog=page.getByRole('dialog',{name:subject,exact:true});await savedDialog.waitFor();
      const savedObject=savedDialog.locator('label').filter({has:page.getByText('关联对象',{exact:true})}).getByRole('combobox');
      await savedObject.locator('option:checked').filter({hasText:fixture.name}).waitFor({state:'attached'});
      check(label+'_saved_name_retained',await savedObject.locator('option:checked').textContent()===fixture.name);
      await page.screenshot({path:path.join(output,'business-'+fixture.suffix+'-saved.png')});
      await savedDialog.getByRole('button',{name:'关闭',exact:true}).click();
      check(label+'_source_unchanged',digest(database(fixture.query))===fixture.hash);
      check(label+'_full_source_preserved_during_write',digest(database(fixture.fullQuery))===beforeWrite);
      for(const actor of ['foreign','employee']){
        rejected(await api(actor,'/crm/activity/'+activity.activityId),label+'_read_denied_'+actor);
        const before=database('SELECT COUNT(*) FROM crm_activity');
        rejected(await api(actor,'/crm/activity',{method:'POST',body:{activity:{activityType:'TASK',subject:marker+'_denied_'+fixture.suffix,startTime:activity.startTime,endTime:activity.endTime,bizType:fixture.kind,bizId:fixture.id,customerId:fixture.customerId},participants:[],reminders:[]}}),label+'_create_denied_'+actor);
        check(label+'_denial_has_no_write_'+actor,database('SELECT COUNT(*) FROM crm_activity')===before);
      }
      await page.close();
    }
    const lead=fixtures.find(fixture=>fixture.kind==='LEAD');
    for(const actor of ['foreign','employee'])rejected(await api(actor,'/crm/lead/'+lead.id),'entry_lead_detail_denied_'+actor);
    check('entry_admin_does_not_inherit_sales_owner',adminOwner!==salesOwner);
  } catch(error) {
    failure=error;
    const active=pages.findLast(page=>!page.isClosed());
    if(active)await active.screenshot({path:path.join(output,'business-entry-failure.png')}).catch(()=>{});
  } finally {
    for(const page of pages)if(!page.isClosed())await page.close();
    for(const fixture of fixtures){
      try{check('entry_final_source_preserved_'+fixture.suffix,digest(database(fixture.query))===fixture.hash);}
      catch(error){failure ||= error;}
    }
  }
  if(failure)throw failure;
  return true;
}
