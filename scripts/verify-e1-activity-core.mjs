import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { createE1ActivityRuntime } from './runtime-checks/e1-activity-runtime.mjs';
import { verifyNextActivity } from './runtime-checks/e1-next-activity.mjs';
import { verifyBusinessEntries } from './runtime-checks/e1-business-entries.mjs';
import { verifyParticipants } from './runtime-checks/e1-participants.mjs';

assert.ok(process.argv.includes('--e1-activity'));
const output = process.argv[process.argv.indexOf('--output') + 1];
assert.ok(output);
const runtime = await createE1ActivityRuntime('D:/CloudFlowPro', output);
const { check, ok, api, rows, database, sessions } = runtime;
const marker = 'E1_' + randomUUID().replaceAll('-', '').slice(0, 12);
const workspaceInvoices = process.argv.includes('--workspace-invoices');
const businessEntries = process.argv.includes('--business-entries');
const participantsCheck = process.argv.includes('--participants');
const quote = value => "CONVERT(UNHEX('" + Buffer.from(String(value)).toString('hex') + "') USING utf8mb4)";
const at = date => { const d = new Date(date); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 19).replace('T', ' '); };
const owned = new Set();
const ownedInvoices = new Set();
const result = { marker, passed: false, allAcceptanceComplete: false, core: false, mobileWorkspace: false, mobileDirect: false, desktopDeepLink: false, preservation: false, secrets: false };
const uiRequests = [];
const observePage = page => page.on('response', response => {
  const url = new URL(response.url());
  if (url.pathname.startsWith('/api/')) uiRequests.push({path:url.pathname,method:response.request().method(),status:response.status()});
});
const digest = value => createHash('sha256').update(value).digest('hex');
const originals = [];
for (const [table, key] of [['crm_activity','activity_id'],['crm_activity_participant','participant_id'],['crm_activity_reminder','reminder_id'],['crm_customer','customer_id'],['crm_follow_up','follow_up_id'],...(workspaceInvoices?[['oa_invoice','invoice_id']]:[]),...(businessEntries?[['crm_lead','lead_id'],['crm_opportunity','opportunity_id'],['crm_service_ticket','ticket_id'],['oa_contract','contract_id']]:[]),...(participantsCheck?[['crm_contact','contact_id'],...(!businessEntries?[['crm_lead','lead_id']]:[])]:[])]) {
  const last = database('SELECT COALESCE(MAX(' + key + '),0) FROM ' + table);
  assert.match(last, /^\d+$/);
  const query = 'SELECT * FROM ' + table + ' WHERE ' + key + '<=' + last + ' ORDER BY ' + key;
  originals.push({ table, last, query, hash: digest(database(query)) });
}
const grants = digest(database('SELECT * FROM sys_role_menu ORDER BY tenant_id,role_id,menu_id'));
const create = async (kind, suffix, changes = {}, actor = 'sales', participants = []) => {
  const start = Date.now() + 86400000;
  const detail = await ok(actor, '/crm/activity', 'POST', { activity: { activityType: kind, subject: marker + '_' + suffix, status: 'PLANNED', priority: 'MEDIUM', startTime: at(start), endTime: at(start + 3600000), bizType: 'NONE', ...changes }, participants, reminders: [] });
  check('created_' + suffix, detail.activity.activityId > 0 && detail.activity.activityType === kind);
  owned.add(detail.activity.activityId); return detail;
};
const detail = (id, actor = 'sales') => ok(actor, '/crm/activity/' + id);
const edit = (value, changes, actor = 'sales') => ok(actor, '/crm/activity', 'PUT', { ...value, activity: { ...value.activity, ...changes } });
const rejected = (value, name) => check(name, [400,403,404,409].includes(value.status) || [400,403,404,409].includes(value.body?.code));
const list = (query, actor = 'sales') => ok(actor, '/crm/activity/list?' + new URLSearchParams(query));
let failure;
try {
  check('five_actual_roles', Object.keys(sessions).length === 5);
  check('sales_activity_permission', sessions.sales.identity.permissions.includes('crm:activity:add'));
  const customerCode = marker + '_customer';
  if(workspaceInvoices) check('current_customer_name_capacity_120',database("SELECT character_maximum_length FROM information_schema.columns WHERE table_schema='cloud_flow_db' AND table_name='crm_customer' AND column_name='customer_name'")==='120');
  const customerName = workspaceInvoices ? (customerCode + '完整名称跨区域客户经营服务公司'.repeat(7)).slice(0,120) : customerCode;
  if(workspaceInvoices) check('customer_name_fixture_exactly_120',customerName.length===120);
  await ok('sales', '/crm/customer', 'POST', { customerCode, customerName, ownerId: Number(sessions.sales.identity.userId) });
  const customerId = Number(database('SELECT customer_id FROM crm_customer WHERE customer_code=' + quote(customerCode) + ' AND tenant_id=100000 AND deleted=0'));
  check('actual_customer_created', Number.isSafeInteger(customerId) && customerId > 0);
  let expectedInvoice, otherInvoice;
  if (workspaceInvoices) {
    const otherCode=marker+'_invoice_other';
    await ok('admin','/crm/customer','POST',{customerCode:otherCode,customerName:otherCode,ownerId:Number(sessions.admin.identity.userId)});
    const otherCustomerId=Number(database('SELECT customer_id FROM crm_customer WHERE customer_code='+quote(otherCode)+' AND tenant_id=100000 AND deleted=0'));
    check('other_customer_for_invoice_scope',Number.isSafeInteger(otherCustomerId)&&otherCustomerId>0&&otherCustomerId!==customerId);
    const createInvoice=async(id,suffix)=>{
      const invoiceNo=marker+'_'+suffix;
      await ok('admin','/oa/invoice','POST',{invoiceDirection:'OUTPUT',invoiceCode:marker,invoiceNo,invoiceType:'NORMAL',customerId:id,grossAmount:'10.00',taxAmount:'0.00'});
      const invoiceId=Number(database('SELECT invoice_id FROM oa_invoice WHERE invoice_no='+quote(invoiceNo)+' AND tenant_id=100000 AND deleted=0'));
      check('invoice_fixture_'+suffix,Number.isSafeInteger(invoiceId)&&invoiceId>0); ownedInvoices.add(invoiceId);
      return {invoiceId,invoiceNo};
    };
    expectedInvoice=await createInvoice(customerId,'included'); otherInvoice=await createInvoice(otherCustomerId,'excluded');
  }
  for (const kind of ['MEETING','CALL','TASK']) {
    let item = await create(kind, kind + '_complete', { bizType: 'CUSTOMER', bizId: customerId });
    item = await edit(item, { subject: marker + '_' + kind + '_edited', description: '已确认安排', ...(kind === 'CALL' ? { direction: 'INBOUND' } : {}) });
    check(kind + '_edited', item.activity.description === '已确认安排' && (kind !== 'CALL' || item.activity.direction === 'INBOUND'));
    const oldVersion = item.activity.version;
    item = await ok('sales', '/crm/activity/' + item.activity.activityId + '/complete', 'POST', { version: oldVersion, resultSummary: marker + '_result_' + kind, nextAction: marker + '_next_' + kind, generateFollowUp: true });
    check(kind + '_completed_and_followup', item.activity.status === 'COMPLETED' && item.activity.followUpId > 0 && Boolean(item.activity.completeTime));
    const stored = rows("SELECT JSON_OBJECT('time',DATE_FORMAT(last_follow_up_time,'%Y-%m-%d %H:%i:%s')) FROM crm_customer WHERE customer_id=" + customerId)[0];
    check(kind + '_customer_followup_time', stored.time === item.activity.completeTime);
    rejected(await api('sales', '/crm/activity', { method: 'PUT', body: { ...item, activity: { ...item.activity, status: 'PLANNED' } } }), kind + '_cannot_reopen');
    const cancelled = await create(kind, kind + '_cancel');
    const terminal = await ok('sales', '/crm/activity/' + cancelled.activity.activityId + '/cancel', 'POST', { version: cancelled.activity.version });
    check(kind + '_cancelled', terminal.activity.status === 'CANCELLED' && terminal.reminders.length === 0);
  }
  const participants = [{ participantType: 'USER', participantRefId: Number(sessions.sales.identity.userId), acceptanceStatus: 'NONE' }];
  const invited = await create('MEETING', 'invited', {}, 'manager', participants);
  const invitedId = invited.activity.activityId;
  check('participant_can_read', (await detail(invitedId)).activity.activityId === invitedId);
  check('participant_calendar', (await list({ ownerId: sessions.sales.identity.userId, subject: marker + '_invited' })).rows.some(row => row.activityId === invitedId));
  rejected(await api('sales', '/crm/activity/' + invitedId + '/complete', { method:'POST', body:{version:invited.activity.version} }), 'participant_cannot_complete_others_activity');
  for (const acceptanceStatus of ['NONE','ACCEPTED','DECLINED','TENTATIVE']) {
    await ok('sales', '/crm/activity/' + invitedId + '/respond', 'POST', { acceptanceStatus });
    check('participant_response_' + acceptanceStatus, (await detail(invitedId)).participants.some(member => member.participantRefId === Number(sessions.sales.identity.userId) && member.acceptanceStatus === acceptanceStatus));
  }
  const privateItem = await create('TASK', 'private', {}, 'admin');
  rejected(await api('sales', '/crm/activity/' + privateItem.activity.activityId), 'sales_cannot_read_unrelated');
  check('sales_list_excludes_unrelated', !(await list({ subject: marker + '_private' })).rows.some(row => row.activityId === privateItem.activity.activityId));
  const own = await create('TASK', 'own');
  check('manager_sees_subordinate', (await detail(own.activity.activityId, 'manager')).activity.activityId === own.activity.activityId);
  rejected(await api('foreign', '/crm/activity/' + own.activity.activityId), 'foreign_tenant_denied');
  rejected(await api('employee', '/crm/activity/' + own.activity.activityId), 'employee_without_permission_denied');
  const conflicting = await create('TASK', 'conflict', { startTime: own.activity.startTime, endTime: own.activity.endTime });
  check('conflict_reported_and_saved', conflicting.conflicts.some(row => row.activityId === own.activity.activityId));
  const updated = await edit(own, { description: '新版本' });
  rejected(await api('sales', '/crm/activity', { method:'PUT', body:{ ...own, activity:{...own.activity, description:'过期版本'} } }), 'stale_edit_rejected');
  check('stale_edit_preserves_current', (await detail(own.activity.activityId)).activity.version === updated.activity.version);
  for (const bizType of ['CUSTOMER','OPPORTUNITY','LEAD','TICKET','CONTRACT']) {
    rejected(await api('sales', '/crm/activity', { method:'POST', body:{activity:{activityType:'TASK',subject:marker+'_invalid_'+bizType,startTime:own.activity.startTime,endTime:own.activity.endTime,bizType,bizId:9007199254740990},participants:[],reminders:[]} }), 'missing_' + bizType + '_rejected');
  }
  const past = await create('TASK', 'past', {startTime:at(Date.now()-7200000),endTime:at(Date.now()-3600000)});
  check('overdue_task', (await list({view:'OVERDUE',subject:marker})).rows.some(row=>row.activityId===past.activity.activityId));
  check('today_includes_today', (await list({view:'TODAY',subject:marker})).rows.some(row=>row.activityId===past.activity.activityId));
  check('today_excludes_terminal', (await list({view:'TODAY',subject:marker})).rows.every(row=>['PLANNED','IN_PROGRESS'].includes(row.status)));
  const timeline = await ok('sales', '/crm/activity/customer/' + customerId + '/timeline');
  check('timeline_contains_activity_followup', ['ACTIVITY','FOLLOW_UP'].every(type=>timeline.rows.some(row=>row.type===type)));
  for (const type of ['ACTIVITY','FOLLOW_UP']) {
    const filtered = await ok('sales', '/crm/activity/customer/' + customerId + '/timeline?type=' + type);
    check('timeline_filter_'+type, filtered.rows.length>0 && filtered.rows.every(row=>row.type===type));
  }
  const mobileActivity = await create('TASK', 'mobile', {bizType:'CUSTOMER',bizId:customerId});
  const next = await ok('sales', '/crm/activity/' + mobileActivity.activity.activityId + '/next', 'POST', {activity:{activityType:'CALL',subject:marker+'_next',startTime:own.activity.startTime,endTime:own.activity.endTime,bizType:'NONE'},participants:[],reminders:[]});
  owned.add(next.activity.activityId);
  check('next_inherits_business_owner', next.activity.bizType==='CUSTOMER' && next.activity.bizId===customerId && next.activity.ownerId===Number(sessions.sales.identity.userId));
  result.core = true;
  const origin = new URL(sessions.sales.page.url()).origin;
  const context = await runtime.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,storageState:await sessions.sales.context.storageState()});
  await context.route('**/*', route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  const page = await context.newPage(); page.setDefaultTimeout(30000);
  observePage(page);
  page.on('pageerror',()=>runtime.browserErrors.push('e1-mobile'));
  await page.goto(origin + '/office/crm/customer/' + customerId, {waitUntil:'networkidle'});
  if(workspaceInvoices){
    check('sales_has_no_oa_invoice_list_permission',!sessions.sales.identity.permissions.includes('oa:invoice:list'));
    check('sales_workspace_skips_invoice_candidates',!uiRequests.some(request=>request.path==='/api/oa/invoice/list'));
    for(const width of [320,390]){
      await page.setViewportSize({width,height:844});
      const heading=page.getByRole('heading',{name:customerName,exact:true});await heading.waitFor();
      check('customer_name_complete_'+width,await heading.evaluate((element,name)=>element.textContent===name && element.scrollWidth<=element.clientWidth+1 && element.getBoundingClientRect().right<=innerWidth+1,customerName));
      check('workspace_width_'+width,await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
      await page.screenshot({path:path.join(output,'workspace-'+width+'-complete-name.png')});
    }
  }
  await page.getByRole('tab', {name:'经营时间线'}).click();
  await page.getByRole('button',{name:mobileActivity.activity.subject,exact:true}).click();
  const dialog = page.getByRole('dialog'); await dialog.waitFor();
  const completion = page.waitForResponse(response=>response.url().endsWith('/api/crm/activity/'+mobileActivity.activity.activityId+'/complete') && response.status()===200);
  await dialog.getByRole('button',{name:'完成活动',exact:true}).click();
  await completion;
  await dialog.getByRole('button',{name:'完成活动',exact:true}).waitFor({state:'hidden'});
  check('mobile_customer_workspace_completed', (await detail(mobileActivity.activity.activityId)).activity.status==='COMPLETED');
  await page.screenshot({path:path.join(output,'mobile-workspace-completed.png'),fullPage:true}); result.mobileWorkspace=true;
  await page.goto(origin + '/office/crm/activity?activityId=' + own.activity.activityId,{waitUntil:'networkidle'});
  result.mobileDirect = await page.getByRole('dialog').isVisible();
  result.mobileDirectUnsupported = await page.getByText('此功能暂不支持移动端，请在电脑访问。').isVisible();
  await page.screenshot({path:path.join(output,'mobile-direct-entry.png'),fullPage:true});
  if (process.argv.includes('--require-direct')) {
    check('mobile_reminder_opens_correct_activity', result.mobileDirect && await page.getByRole('dialog').getByRole('heading',{name:own.activity.subject,exact:true}).isVisible());
    await page.setViewportSize({width:320,height:740});
    const directDialog = page.getByRole('dialog');
    const completed = page.waitForResponse(response=>response.url().endsWith('/api/crm/activity/'+own.activity.activityId+'/complete') && response.status()===200);
    await directDialog.getByRole('button',{name:'完成活动',exact:true}).click(); await completed;
    await directDialog.getByRole('button',{name:'完成活动',exact:true}).waitFor({state:'hidden'});
    check('mobile_reminder_complete_persisted', (await detail(own.activity.activityId)).activity.status==='COMPLETED');
    check('mobile_320_dialog_within_viewport', await directDialog.evaluate(element=>{const box=element.getBoundingClientRect();return box.left>=0&&box.right<=innerWidth+1;}));
    await page.screenshot({path:path.join(output,'mobile-320-direct-completed.png'),fullPage:true});
    await directDialog.getByRole('button',{name:'关闭',exact:true}).click();
    check('closing_clears_activity_parameter', !new URL(page.url()).searchParams.has('activityId'));
    await page.reload({waitUntil:'networkidle'});
    check('mobile_refresh_stays_on_list', !await page.getByRole('dialog').isVisible() && await page.getByRole('heading',{name:'客户活动',exact:true}).isVisible());
    check('mobile_320_list_within_viewport', await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    await page.screenshot({path:path.join(output,'mobile-320-list.png'),fullPage:true});
    await page.goto(origin+'/office/crm/activity?activityId=invalid',{waitUntil:'networkidle'});
    check('invalid_link_has_clear_error', await page.getByRole('alert').filter({hasText:'活动链接无效'}).isVisible() && !await page.getByRole('dialog').isVisible());
    await page.goto(origin+'/office/crm/activity?activityId='+privateItem.activity.activityId,{waitUntil:'networkidle'});
    check('unrelated_link_denied_in_page', !await page.getByRole('dialog').isVisible() && await page.getByRole('alert').filter({hasText:'活动不存在或无权访问'}).isVisible());
  }
  await context.close();
  const desktop = await sessions.sales.context.newPage();
  observePage(desktop);
  await desktop.goto(origin + '/office/crm/activity?activityId=' + own.activity.activityId,{waitUntil:'networkidle'});
  result.desktopDeepLink = await desktop.getByRole('dialog').isVisible();
  if (process.argv.includes('--require-direct')) check('desktop_reminder_opens_correct_activity', result.desktopDeepLink && await desktop.getByRole('dialog').getByRole('heading',{name:own.activity.subject,exact:true}).isVisible());
  await desktop.screenshot({path:path.join(output,'desktop-direct-entry.png'),fullPage:true});
  await desktop.close();
  if(workspaceInvoices){
    const salesPageRequests=uiRequests.length;
    check('sales_pages_never_read_oa_invoice_candidates',!uiRequests.some(request=>request.path==='/api/oa/invoice/list'));
    const adminPage=await sessions.admin.context.newPage();observePage(adminPage);adminPage.setDefaultTimeout(30000);
    const loaded=adminPage.waitForResponse(response=>new URL(response.url()).pathname==='/api/oa/invoice/list'&&new URL(response.url()).searchParams.get('customerId')===String(customerId));
    await adminPage.goto(origin+'/office/crm/customer/'+customerId,{waitUntil:'networkidle'});
    const response=await loaded;const invoices=await response.json();
    check('authorized_invoice_candidates_loaded',response.status()===200&&invoices.code===200&&invoices.data.rows.some(row=>row.invoiceId===expectedInvoice.invoiceId));
    check('invoice_candidates_scoped_to_customer',invoices.data.rows.every(row=>row.customerId===customerId)&&!invoices.data.rows.some(row=>row.invoiceId===otherInvoice.invoiceId));
    const heading=adminPage.getByRole('heading',{name:customerName,exact:true});
    check('desktop_customer_name_complete',await heading.evaluate(element=>element.scrollWidth<=element.clientWidth+1&&element.getBoundingClientRect().right<=innerWidth+1));
    await adminPage.getByRole('tab',{name:'回款与发票'}).click();
    await adminPage.getByRole('button',{name:'请选择销项发票',exact:true}).click();
    await adminPage.getByRole('option').filter({hasText:expectedInvoice.invoiceNo}).waitFor();
    check('authorized_invoice_choice_visible',await adminPage.getByRole('option').filter({hasText:expectedInvoice.invoiceNo}).isVisible());
    check('other_customer_invoice_choice_absent',await adminPage.getByRole('option').filter({hasText:otherInvoice.invoiceNo}).count()===0);
    await adminPage.screenshot({path:path.join(output,'workspace-authorized-invoice-choices.png')});
    check('no_unexpected_ui_http_failure',uiRequests.every(request=>request.status<400||request.status===400&&/^\/api\/crm\/activity\/[0-9]+$/.test(request.path)));
    result.workspaceInvoices=true;result.salesPageRequests=salesPageRequests;
    await adminPage.close();
  }
  if(process.argv.includes('--next-activity')) {
    result.nextActivity = await verifyNextActivity({runtime,create,detail,edit,rejected,owned,marker,customerId,invited,output,observePage});
    check('next_ui_no_unexpected_http_failure',uiRequests.every(request=>request.status<400||request.status===400&&/^\/api\/crm\/activity\/[0-9]+$/.test(request.path)));
  }
  if(businessEntries) {
    result.businessEntries = await verifyBusinessEntries({runtime,rejected,owned,marker,customerId,customerName,output,observePage});
    check('business_entries_do_not_load_dashboard',!uiRequests.some(request=>request.path==='/api/crm/dashboard/summary'));
    const failures=uiRequests.filter(request=>request.status>=400);
    check('business_entries_ui_only_expected_denials',failures.length===2&&failures.every(request=>request.method==='GET'&&request.status===400&&request.path==='/api/crm/activity/'+privateItem.activity.activityId));
  }
  if(participantsCheck){
    result.participants=await verifyParticipants({runtime,create,rejected,owned,marker,customerId,output,observePage});
    const failures=uiRequests.filter(request=>request.status>=400);
    check('participants_ui_only_expected_denials',failures.length===2&&failures.every(request=>request.method==='GET'&&request.status===400&&request.path==='/api/crm/activity/'+privateItem.activity.activityId));
  }
  check('browser_no_runtime_errors', runtime.browserErrors.length===0);
} catch (error) { failure = error instanceof Error ? error.message : 'E1 activity verification failed'; }
finally {
  const finalFailures=[];
  const finalize=async task=>{try{await task();}catch(error){const message=error instanceof Error?error.message:'E1 final verification failed';finalFailures.push(message);failure ||= message;}};
  for (const id of owned) await finalize(()=>ok('admin', '/crm/activity/' + id, 'DELETE'));
  for (const id of ownedInvoices) await finalize(()=>ok('admin', '/oa/invoice/' + id, 'DELETE'));
  for (const original of originals) await finalize(()=>check('original_rows_preserved_' + original.table, digest(database(original.query))===original.hash));
  await finalize(()=>check('role_grants_preserved', digest(database('SELECT * FROM sys_role_menu ORDER BY tenant_id,role_id,menu_id'))===grants));
  result.preservation=finalFailures.length===0;
  await finalize(async()=>{result.secretScan=await runtime.scan();result.secrets=true;});
  result.finalFailures=finalFailures;
  await runtime.close();
  result.passed = !failure; result.checks=runtime.checks; result.requests=runtime.requests; result.uiRequests=uiRequests; result.failure=failure; result.verifiedAt=new Date().toISOString();
  await fs.writeFile(path.join(output,'result.json'),JSON.stringify(result,null,2),{flag:'wx'});
  console.log('E1_ACTIVITY_CORE: passed='+result.passed+'; checks='+runtime.checks.length+'; requests='+runtime.requests.length+'; mobile_workspace='+result.mobileWorkspace+'; mobile_direct='+result.mobileDirect+'; desktop_deep_link='+result.desktopDeepLink+'; all_acceptance_complete=false');
}
if(failure) throw new Error(failure);
