import fs from 'node:fs/promises';
import path from 'node:path';
import { captureOwnedLostResponse } from './runtime-checks/owned-lost-response.mjs';

export async function verifyHrOvertimeInterface(context) {
  const {sessions,fixture,database,check,directory,caseTag,evidence}=context;
  const employee=sessions.employee.page,hr=sessions.hr.page;
  const origin=new URL(employee.url()).origin;
  const output=path.join(directory,'h2-overtime-ui-'+caseTag);
  await fs.mkdir(output,{recursive:true});
  const errors=[];
  for(const page of [employee,hr])page.on('pageerror',error=>errors.push(error.message));
  const screenshot=async(page,name,width,scope=page.locator('.admin-source-page'))=>{
    await page.locator('.cf-toast-viewport').waitFor({state:'hidden',timeout:15000});
    const layout=await scope.evaluate(element=>({viewport:innerWidth,document:document.documentElement.scrollWidth,available:element.clientWidth,content:element.scrollWidth,
      controls:[...element.querySelectorAll('button,input:not([type="checkbox"]),textarea,[role="combobox"]')].filter(control=>control.getClientRects().length)
        .map(control=>({width:control.getBoundingClientRect().width,height:control.getBoundingClientRect().height,label:control.getAttribute('aria-label')||control.textContent.trim().slice(0,30)}))}));
    check(name+' '+width+'px 页面及内容无横向溢出',layout.document<=width&&layout.content<=layout.available+1);
    if(width===320)check(name+' 手机可见输入及按钮触控区至少44px',layout.controls.every(control=>control.width>=44&&control.height>=44));
    console.log('H2_OVERTIME_LAYOUT '+JSON.stringify({name,width,...layout}));
    await page.screenshot({path:path.join(output,name+'-'+width+'.png'),fullPage:true});
  };
  for(const width of [1440,320]){
    for(const [page,route,title,endpoint] of [
      [hr,'/hr/overtime','加班管理','/hr/attendance/overtime-requests'],
      [hr,'/hr/shift-requests','调班管理','/hr/attendance/shift-requests'],
      [hr,'/hr/overtime-types','加班规则','/hr/attendance/overtime-types'],
      [employee,'/hr/ess/overtime','我的加班','/hr/attendance/overtime-requests/mine'],
      [employee,'/hr/ess/shift-requests','我的调班','/hr/attendance/shift-requests/mine'],
      [employee,'/hr/ess/shift-invitations','换班邀请','/hr/attendance/shift-requests/invitations']]){
      await page.setViewportSize({width,height:1100});
      const reading=page.waitForResponse(response=>new URL(response.url()).pathname==='/api'+endpoint&&response.request().method()==='GET');
      await page.goto(origin+route,{waitUntil:'domcontentloaded'});
      const response=await reading,body=await response.json();
      check(title+'真实页面读取成功',response.status()===200&&body.code===200);
      await page.locator('.admin-source-page').getByRole('heading',{name:title,exact:true}).waitFor();
      await screenshot(page,route.split('/').filter(Boolean).join('-'),width);
    }
  }
  evidence.desktop=true;evidence.mobile=true;
  for(const route of ['/hr/overtime','/hr/overtime-types','/hr/shift-requests']){
    await employee.goto(origin+route,{waitUntil:'domcontentloaded'});
    await employee.getByText(/权限不足|无权访问/).first().waitFor();
    check('员工手机管理入口按原权限拒绝 '+route,await employee.locator('.admin-source-page').count()===0);
  }
  await employee.goto(origin+'/hr/ess/overtime',{waitUntil:'domcontentloaded'});
  await employee.getByRole('button',{name:'登记加班',exact:true}).click();
  const dialog=employee.getByRole('dialog',{name:'登记本人加班',exact:true});
  await dialog.getByLabel('开始时间（北京时间）').fill('2026-07-20T17:30');
  await dialog.getByLabel('结束时间（北京时间）').fill('2026-07-20T18:30');
  await dialog.getByRole('button',{name:'补偿方式',exact:true}).click();
  await employee.getByRole('option',{name:'调休',exact:true}).click();
  const reason='H2OT_UI_'+caseTag;
  await dialog.getByLabel('加班事由').fill(reason);
  check('页面未经预检不能保存草稿',await dialog.getByRole('button',{name:'保存草稿',exact:true}).isDisabled());
  await dialog.getByRole('button',{name:'预检当前申请',exact:true}).click();
  await dialog.getByText('预检通过，可保存草稿；提交核定时服务端仍会重新检查证据、上限及配置。',{exact:true}).waitFor();
  await screenshot(employee,'mobile-overtime-preview',320,dialog);
  let posts=0;
  const keys=[];
  const lost=captureOwnedLostResponse(route=>{posts++;keys.push(route.request().headers()['idempotency-key']);});
  const endpoint='**/api/hr/attendance/overtime-requests';
  await employee.route(endpoint,lost.handler);
  try{
    await dialog.getByRole('button',{name:'保存草稿',exact:true}).click();
    await dialog.getByRole('alert').waitFor();
    check('加班保存响应丢失后保留事由并锁定原内容',await dialog.getByLabel('加班事由').inputValue()===reason&&await dialog.getByLabel('加班事由').isDisabled());
    await screenshot(employee,'mobile-overtime-lost-response',320,dialog);
  }finally{await employee.unroute(endpoint,lost.handler);lost.assertSucceeded();}
  employee.on('request',request=>{if(new URL(request.url()).pathname==='/api/hr/attendance/overtime-requests'&&request.method()==='POST'){posts++;keys.push(request.headers()['idempotency-key']);}});
  await dialog.getByRole('button',{name:'重试保存同一草稿',exact:true}).click();
  await dialog.waitFor({state:'hidden'});
  check('重试真实保存沿用同键且仅生成一个草稿',posts===2&&Boolean(keys[0])&&keys[0]===keys[1]&&database("SELECT COUNT(*) FROM hr_overtime_request WHERE tenant_id=100000 AND employee_id="+fixture.employeeIds.employee+" AND reason='"+reason+"' AND status='DRAFT';")==='1');
  check('手机草稿不产生工资或调休来源',database("SELECT COUNT(*) FROM hr_overtime_request WHERE tenant_id=100000 AND employee_id="+fixture.employeeIds.employee+" AND reason='"+reason+"' AND settled_flag=0 AND leave_ledger_id IS NULL;")==='1');
  evidence.lostResponse=true;
  await screenshot(employee,'mobile-overtime-restored',320);
  check('加班调班双端无未捕获页面错误',errors.length===0);
  console.log('H2_OVERTIME_UI_EVIDENCE='+output);
}
