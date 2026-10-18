import path from 'node:path';

export async function verifyNextActivity({runtime,create,detail,edit,rejected,owned,marker,customerId,invited,output,observePage}) {
  const {check,ok,api,sessions,database}=runtime;
  const owner=Number(sessions.sales.identity.userId);
  const cases=[
    {name:'short',action:'确认下一次实施会议与参与人',actor:'admin'},
    {name:'boundary',action:'界'.repeat(200),actor:'sales'},
    {name:'long',action:'续'.repeat(500),actor:'sales'},
    {name:'empty',action:'',actor:'sales'},
    {name:'custom',action:'待用户改写的行动',actor:'sales',subject:'自行填写的后续主题',description:'自行补充的后续说明'},
    {name:'cleared',action:'待用户清空的行动',actor:'sales',description:''},
  ];
  const expected=sample=>({subject:sample.subject??(sample.action.length>0&&sample.action.length<=200?sample.action:sample.source.activity.subject),description:sample.description??sample.action});
  const verifySaved=async(sample,saved,kind)=>{
    const target=saved.activity;const values=expected(sample);
    check('next_'+kind+'_'+sample.name+'_content',target.subject===values.subject&&(target.description||'')===values.description);
    check('next_'+kind+'_'+sample.name+'_inheritance',target.bizType==='CUSTOMER'&&target.bizId===customerId&&target.customerId===customerId&&target.ownerId===owner&&target.status==='PLANNED');
    const stored=(await detail(target.activityId)).activity;
    check('next_'+kind+'_'+sample.name+'_persisted',stored.subject===values.subject&&(stored.description||'')===values.description&&stored.ownerId===owner);
    check('next_'+kind+'_'+sample.name+'_source_retained',((await detail(sample.source.activity.activityId)).activity.nextAction||'')===sample.action);
  };
  for(const sample of cases){
    sample.source=await create('TASK','next_'+sample.name,{bizType:'CUSTOMER',bizId:customerId,nextAction:sample.action});
    const values={activityType:'TASK',startTime:sample.source.activity.startTime,endTime:sample.source.activity.endTime,bizType:'NONE',ownerId:Number(sessions.admin.identity.userId)};
    if(Object.hasOwn(sample,'subject'))values.subject=sample.subject;
    if(Object.hasOwn(sample,'description'))values.description=sample.description;
    const saved=await ok(sample.actor,'/crm/activity/'+sample.source.activity.activityId+'/next','POST',{activity:values,participants:[],reminders:[]});
    owned.add(saved.activity.activityId);await verifySaved(sample,saved,'api');
    // Fallback titles intentionally equal the source title. Clean up this API
    // sample before locating the source row in the separate browser scenario.
    await ok('admin','/crm/activity/'+saved.activity.activityId,'DELETE');
    owned.delete(saved.activity.activityId);
  }
  const countBefore=database('SELECT COUNT(*) FROM crm_activity');
  const deniedBody={activity:{activityType:'TASK',startTime:invited.activity.startTime,endTime:invited.activity.endTime},participants:[],reminders:[]};
  for(const actor of ['sales','foreign','employee']){
    rejected(await api(actor,'/crm/activity/'+invited.activity.activityId+'/next',{method:'POST',body:deniedBody}),'next_denied_'+actor);
  }
  check('next_denied_creates_no_rows',database('SELECT COUNT(*) FROM crm_activity')===countBefore);
  check('next_participant_has_no_assign_permission',!sessions.sales.identity.permissions.includes('crm:activity:assign'));
  const origin=new URL(sessions.sales.page.url()).origin;
  const pages={};
  for(const actor of ['admin','sales']){
    const page=await sessions[actor].context.newPage();page.setDefaultTimeout(30000);observePage(page);
    page.on('pageerror',()=>runtime.browserErrors.push('e1-next-'+actor));pages[actor]=page;
    await page.goto(origin+'/office/crm/activity',{waitUntil:'networkidle'});
    await page.getByRole('combobox',{name:'显示方式',exact:true}).selectOption('list');
  }
  const findRow=async(page,subject)=>{
    await page.getByRole('textbox',{name:'搜索活动',exact:true}).fill(subject);
    const row=page.getByRole('row').filter({has:page.getByRole('button',{name:subject,exact:true})});
    await row.waitFor();return row;
  };
  for(const sample of cases){
    const page=pages[sample.actor];const row=await findRow(page,sample.source.activity.subject);
    if(sample.name==='short'){
      sample.action='读取最新安排：确认交付日期并发送会议资料';
      sample.source=await edit(sample.source,{nextAction:sample.action});
    }
    const fresh=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/crm/activity/'+sample.source.activity.activityId&&response.request().method()==='GET');
    await row.getByRole('button',{name:'后续活动',exact:true}).click();
    check('next_ui_'+sample.name+'_fresh_read',(await fresh).status()===200);
    const dialog=page.getByRole('dialog',{name:'安排后续活动',exact:true});await dialog.waitFor();
    const description=dialog.locator('label').filter({has:page.getByText('活动说明',{exact:true})}).locator('textarea');
    const initialSubject=sample.action.length>0&&sample.action.length<=200?sample.action:sample.source.activity.subject;
    check('next_ui_'+sample.name+'_defaults',await dialog.getByLabel('主题',{exact:true}).inputValue()===initialSubject&&await description.inputValue()===sample.action);
    check('next_ui_'+sample.name+'_business',await dialog.getByRole('combobox',{name:'关联类型',exact:true}).inputValue()==='CUSTOMER');
    const ownerField=dialog.locator('label').filter({has:page.getByText('负责人',{exact:true})}).getByRole('combobox');
    await ownerField.getByText(sample.source.activity.ownerName,{exact:true}).waitFor();
    check('next_ui_'+sample.name+'_owner_visible',await ownerField.getByText(sample.source.activity.ownerName,{exact:true}).isVisible());
    if(sample.actor==='sales')check('next_ui_'+sample.name+'_owner_locked',await ownerField.getAttribute('aria-disabled')==='true');
    check('next_ui_'+sample.name+'_mail_label',await dialog.getByRole('combobox',{name:'提醒渠道',exact:true}).locator('option[value="EMAIL"]').textContent()==='邮件');
    if(Object.hasOwn(sample,'subject'))await dialog.getByLabel('主题',{exact:true}).fill(sample.subject);
    if(Object.hasOwn(sample,'description'))await description.fill(sample.description);
    await dialog.getByLabel('开始时间',{exact:true}).fill(sample.source.activity.startTime.replace(' ','T').slice(0,16));
    await dialog.getByLabel('结束时间',{exact:true}).fill(sample.source.activity.endTime.replace(' ','T').slice(0,16));
    const reminderSection=dialog.locator('section').filter({has:page.getByRole('heading',{name:'提醒设置',exact:true})});
    await reminderSection.getByRole('button',{name:'移除',exact:true}).click();
    if(['short','long','custom','cleared'].includes(sample.name))await page.screenshot({path:path.join(output,'next-'+sample.name+'-draft.png')});
    const savedResponse=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/crm/activity/'+sample.source.activity.activityId+'/next'&&response.request().method()==='POST');
    await dialog.getByRole('button',{name:'保存活动',exact:true}).click();
    const response=await savedResponse;const body=await response.json();
    check('next_ui_'+sample.name+'_saved',response.status()===200&&body.code===200&&body.data.activity.activityId>0);
    owned.add(body.data.activity.activityId);
    check('next_ui_'+sample.name+'_submitted_owner',response.request().postDataJSON().activity.ownerId===owner);
    await verifySaved(sample,body.data,'ui');
    await page.getByRole('dialog').getByRole('button',{name:'关闭',exact:true}).click();
  }
  const participantRow=await findRow(pages.sales,invited.activity.subject);
  check('next_ui_participant_button_absent',await participantRow.getByRole('button',{name:'后续活动',exact:true}).count()===0);
  check('next_ui_participant_can_read',await participantRow.getByRole('button',{name:'详情',exact:true}).isVisible());
  await pages.sales.screenshot({path:path.join(output,'next-participant-read-only.png')});
  for(const page of Object.values(pages))await page.close();
  return true;
}
