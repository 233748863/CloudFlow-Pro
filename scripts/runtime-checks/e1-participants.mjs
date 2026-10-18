import path from 'node:path';

export async function verifyParticipants({runtime,create,rejected,owned,marker,customerId,output,observePage}) {
  const {check,ok,api,sessions,database,rows}=runtime;
  const quote=value=>"CONVERT(UNHEX('"+Buffer.from(String(value)).toString('hex')+"') USING utf8mb4)";
  const salesId=Number(sessions.sales.identity.userId);
  const member=(type,id,state='NONE')=>({participantType:type,participantRefId:id,acceptanceStatus:state});
  const replyOf=detail=>detail.participants.find(value=>value.participantType==='USER'&&value.participantRefId===salesId);
  const read=id=>ok('admin','/crm/activity/'+id);
  const save=detail=>ok('admin','/crm/activity','PUT',detail);
  const reply=(id,state)=>ok('sales','/crm/activity/'+id+'/respond','POST',{acceptanceStatus:state});
  const persisted=(detail,label)=>{
    const actual=rows("SELECT JSON_OBJECT('type',participant_type,'id',participant_ref_id,'state',acceptance_status,'time',DATE_FORMAT(response_time,'%Y-%m-%d %H:%i:%s')) FROM crm_activity_participant WHERE activity_id="+detail.activity.activityId+' AND deleted=0 ORDER BY participant_id');
    check(label+'_count',actual.length===detail.participants.length);
    for(const value of detail.participants){
      const stored=actual.find(item=>item.type===value.participantType&&item.id===value.participantRefId);
      check(label+'_'+value.participantType,stored?.state===value.acceptanceStatus&&(stored.time||null)===(value.responseTime||null));
    }
  };
  let guarded=await create('MEETING','participants_guard',{bizType:'CUSTOMER',bizId:customerId},'admin',[member('USER',salesId,'ACCEPTED')]);
  const guardId=guarded.activity.activityId;
  check('participants_new_colleague_not_forged',replyOf(guarded).acceptanceStatus==='NONE'&&!replyOf(guarded).responseTime);
  for(const state of ['TENTATIVE','ACCEPTED','DECLINED','NONE']){
    const stale=structuredClone(guarded);
    await reply(guardId,state);
    const current=replyOf(await read(guardId));
    check('participants_self_'+state,current.acceptanceStatus===state&&Boolean(current.responseTime)===(state!=='NONE'));
    replyOf(stale).acceptanceStatus=state==='ACCEPTED'?'DECLINED':'ACCEPTED';
    replyOf(stale).responseTime='2000-01-01 00:00:00';
    stale.activity.description='旧表单保护 '+state;
    guarded=await save(stale);
    check('participants_stale_save_'+state,replyOf(guarded).acceptanceStatus===state&&(replyOf(guarded).responseTime||null)===(current.responseTime||null));
    persisted(await read(guardId),'participants_database_'+state);
  }
  for(const actor of ['foreign','employee'])rejected(await api(actor,'/crm/activity/'+guardId+'/respond',{method:'POST',body:{acceptanceStatus:'ACCEPTED'}}),'participants_reply_denied_'+actor);
  await reply(guardId,'ACCEPTED');
  guarded=await read(guardId);guarded.participants=[];guarded=await save(guarded);
  const removedBefore=database('SELECT * FROM crm_activity_participant WHERE activity_id='+guardId+' ORDER BY participant_id');
  rejected(await api('sales','/crm/activity/'+guardId+'/respond',{method:'POST',body:{acceptanceStatus:'DECLINED'}}),'participants_removed_reply_denied');
  check('participants_removed_reply_no_write',removedBefore===database('SELECT * FROM crm_activity_participant WHERE activity_id='+guardId+' ORDER BY participant_id'));
  guarded.participants=[member('USER',salesId,'ACCEPTED')];guarded=await save(guarded);
  check('participants_rejoined_unresponded',guarded.participants.length===1&&replyOf(guarded).acceptanceStatus==='NONE'&&!replyOf(guarded).responseTime);
  const contactName=marker+'_客户联系人';const leadName=marker+'_线索';const leadContact=marker+'_线索联系人';
  await ok('admin','/crm/contact','POST',{customerId,contactName});
  await ok('admin','/crm/lead','POST',{leadName,companyName:marker+'_公司',contactName:leadContact});
  const contactId=Number(database('SELECT contact_id FROM crm_contact WHERE contact_name='+quote(contactName)+' AND tenant_id=100000 AND deleted=0'));
  const leadId=Number(database('SELECT lead_id FROM crm_lead WHERE lead_name='+quote(leadName)+' AND tenant_id=100000 AND deleted=0'));
  check('participants_actual_contacts',Number.isSafeInteger(contactId)&&contactId>0&&Number.isSafeInteger(leadId)&&leadId>0);
  const ui=await create('MEETING','participants_page',{bizType:'CUSTOMER',bizId:customerId},'admin');
  const id=ui.activity.activityId;
  const origin=new URL(sessions.admin.page.url()).origin;
  const adminPage=await sessions.admin.context.newPage();const salesPage=await sessions.sales.context.newPage();
  for(const [label,page] of [['admin',adminPage],['sales',salesPage]]){page.setDefaultTimeout(30000);observePage(page);page.on('pageerror',()=>runtime.browserErrors.push('participants_'+label));}
  const dialog=page=>page.getByRole('dialog',{name:ui.activity.subject,exact:true});
  const section=page=>dialog(page).locator('section').filter({has:page.getByRole('heading',{name:/^参与人（/})});
  const open=async page=>{await page.goto(origin+'/office/crm/activity?activityId='+id,{waitUntil:'networkidle'});await dialog(page).waitFor();};
  let lastSave=Date.now();
  const uiSave=async label=>{
    // Include browser writes in the same five-second duplicate-submit spacing.
    const remaining=5200-(Date.now()-lastSave);if(remaining>0)await new Promise(resolve=>setTimeout(resolve,remaining));
    const pending=adminPage.waitForResponse(response=>new URL(response.url()).pathname==='/api/crm/activity'&&response.request().method()==='PUT');
    await dialog(adminPage).getByRole('button',{name:'保存活动',exact:true}).click();
    const response=await pending;const body=await response.json();lastSave=Date.now();
    check(label+'_saved',response.status()===200&&body.code===200&&body.data?.activity?.activityId===id);
    await dialog(adminPage).getByRole('button',{name:'保存活动',exact:true}).waitFor();
    persisted(await read(id),label+'_database');return body.data;
  };
  try {
    await open(adminPage);
    for(const [type,name,ref] of [['CONTACT',contactName,contactId],['LEAD',leadName,leadId]]){
      await section(adminPage).getByRole('combobox',{name:'参与人类型',exact:true}).selectOption(type);
      await section(adminPage).getByRole('textbox',{name:'搜索参与人',exact:true}).fill(name);
      const select=section(adminPage).getByRole('combobox',{name:'参与人',exact:true});
      await select.locator('option[value="'+ref+'"]').waitFor({state:'attached'});await select.selectOption(String(ref));
    }
    await section(adminPage).getByRole('combobox',{name:'参与人类型',exact:true}).selectOption('USER');
    const selector=section(adminPage).locator('[role="combobox"]').filter({hasText:'选择用户'});await selector.click();
    const salesName=database('SELECT nick_name FROM sys_user WHERE user_id='+salesId+' AND tenant_id=100000');
    await adminPage.getByPlaceholder('搜索用户姓名 / 部门...',{exact:true}).fill(salesName);
    await adminPage.getByRole('option').filter({has:adminPage.getByText(salesName,{exact:true})}).click();
    check('participants_ui_added_three',await section(adminPage).getByRole('combobox',{name:/接受状态$/}).count()===3);
    check('participants_ui_colleague_locked',await section(adminPage).getByRole('combobox',{name:salesName+'接受状态',exact:true}).isDisabled());
    await uiSave('participants_ui_initial');
    await open(adminPage);
    let recorded=await read(id);
    check('participants_ui_resolved_names',recorded.participants.some(value=>value.participantType==='CONTACT'&&value.participantName===contactName)&&recorded.participants.some(value=>value.participantType==='LEAD'&&value.participantName===leadContact));
    const internalName=replyOf(recorded).participantName;
    for(const state of ['TENTATIVE','ACCEPTED','DECLINED','NONE']){
      for(const name of [contactName,leadContact])await section(adminPage).getByRole('combobox',{name:name+'接受状态',exact:true}).selectOption(state);
      recorded=await uiSave('participants_ui_'+state);
      check('participants_ui_external_'+state,recorded.participants.filter(value=>value.participantType!=='USER').every(value=>value.acceptanceStatus===state&&Boolean(value.responseTime)===(state!=='NONE')));
      check('participants_ui_internal_unchanged_'+state,replyOf(recorded).acceptanceStatus==='NONE');
      await open(adminPage);
      for(const name of [contactName,leadContact])check('participants_ui_reread_'+name+'_'+state,await section(adminPage).getByRole('combobox',{name:name+'接受状态',exact:true}).inputValue()===state);
      await section(adminPage).scrollIntoViewIfNeeded();await adminPage.screenshot({path:path.join(output,'participants-contacts-'+state.toLowerCase()+'.png')});
    }
    await open(salesPage);
    check('participants_ui_self_cannot_save_owner_activity',await dialog(salesPage).getByRole('button',{name:'保存活动',exact:true}).count()===0);
    let lastUiReply=0;
    for(const [state,label] of [['TENTATIVE','暂定'],['ACCEPTED','接受'],['DECLINED','拒绝']]){
      const remaining=5200-(Date.now()-lastUiReply);if(remaining>0)await new Promise(resolve=>setTimeout(resolve,remaining));
      const response=salesPage.waitForResponse(value=>new URL(value.url()).pathname==='/api/crm/activity/'+id+'/respond'&&value.request().method()==='POST');
      await dialog(salesPage).getByRole('button',{name:label,exact:true}).click();
      const value=await response;lastUiReply=Date.now();check('participants_ui_self_response_'+state,value.status()===200&&(await value.json()).code===200);
      const self=replyOf(await read(id));check('participants_ui_self_persisted_'+state,self.acceptanceStatus===state&&Boolean(self.responseTime));
      await open(salesPage);
    }
    // The administrator still has the NONE version opened before the colleague replied.
    check('participants_ui_old_form_is_stale',await section(adminPage).getByRole('combobox',{name:internalName+'接受状态',exact:true}).inputValue()==='NONE');
    const currentReply=replyOf(await read(id));
    await dialog(adminPage).locator('label').filter({has:adminPage.getByText('活动说明',{exact:true})}).locator('textarea').fill('旧页面保存仍保留同事已拒绝的回复');
    recorded=await uiSave('participants_ui_stale_owner');
    check('participants_ui_stale_keeps_reply',replyOf(recorded).acceptanceStatus==='DECLINED'&&replyOf(recorded).responseTime===currentReply.responseTime);
    check('participants_ui_stale_keeps_edit',recorded.activity.description==='旧页面保存仍保留同事已拒绝的回复');
    await open(adminPage);await section(adminPage).scrollIntoViewIfNeeded();await adminPage.screenshot({path:path.join(output,'participants-stale-owner-saved.png')});
    await section(salesPage).scrollIntoViewIfNeeded();await salesPage.screenshot({path:path.join(output,'participants-self-replied.png')});
    return true;
  } catch(error){await adminPage.screenshot({path:path.join(output,'participants-failure.png')}).catch(()=>{});throw error;}
  finally {await adminPage.close();await salesPage.close();}
}
