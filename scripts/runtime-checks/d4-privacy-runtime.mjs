import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createD1LeaveRuntime } from './d1-leave-runtime.mjs';
import { authenticateD4PrivacyAccount } from './d4-privacy-browser-auth.mjs';

export async function createD4PrivacyRuntime(root,output){
  assert.ok(process.argv.includes('--d4-privacy'));
  const runtime=await createD1LeaveRuntime(root,output);
  try {
    const {sessions,check,sensitive,browserErrors}=runtime;
    const browser=sessions.admin.context.browser(),origin=new URL(sessions.admin.page.url()).origin;
    const accounts=JSON.parse(fs.readFileSync(path.join(runtime.run,'private/accounts.json'),'utf8'));
    for(const [actor,username,tenant] of [['manager','g_holiday_manager','100000'],['foreign','g_import_tenant','100001'],['anonymous',null,null],['peerHr','sd_hr_e74d534df2a3','100000']]){
      const context=await browser.newContext({viewport:{width:1440,height:1000}});
      await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
      const page=await context.newPage();page.setDefaultTimeout(30000);page.on('pageerror',()=>browserErrors.push(actor));
      await page.goto(origin,{waitUntil:'domcontentloaded'});
      let identity={authenticated:false};
      if(username){
        if(actor==='peerHr'){
          // Existing settlement fixture copied this credential; verify that provenance without exposing hashes.
          check('peer_hr_existing_owned_credential',runtime.database("SELECT COUNT(*) FROM sys_user u JOIN sys_user original ON original.tenant_id=u.tenant_id AND original.user_name='g_holiday_employee' WHERE u.tenant_id=100000 AND u.user_name='sd_hr_e74d534df2a3' AND u.create_by='settlement_draft_e74d534df2a3' AND u.password=original.password AND u.deleted=0 AND u.status='0'")==='1');
          console.log('D4_PRIVACY_LOGIN_WAIT: existing_peer_hr=true; preserve_five_logins_per_minute=true');
          await new Promise(resolve=>setTimeout(resolve,61000));
        }
        const source=accounts.find(value=>value.username===(actor==='peerHr'?'g_holiday_employee':username));assert.ok(source);
        const account={...source,username};sensitive.add(account.password);
        identity=await authenticateD4PrivacyAccount(page,account,origin);
        check('real_login_'+actor,identity.authenticated&&identity.tenantId===tenant);
        const token=await page.evaluate(async()=>(await import('/src/utils/authStorage.ts')).getAuthToken());sensitive.add(token);sensitive.add(token.replace(/^Bearer /,''));
      } else {
        check('anonymous_no_auth_token',!(await page.evaluate(async()=>(await import('/src/utils/authStorage.ts')).getAuthToken())));
      }
      sessions[actor]={context,page,identity};
    }
    const interval=Math.max(5000,Number(runtime.database("SELECT COALESCE(MAX(CAST(config_value AS UNSIGNED)),0) FROM sys_config WHERE config_key='sys.common.repeatSubmit.intervalMillis'")))+150;
    check('bounded_repeat_interval',Number.isSafeInteger(interval)&&interval<=60150);
    const clocks=new Map();
    runtime.privacyApi=async(actor,url,method='GET',body,file)=>{
      assert.match(url,/^(?:\/hr\/(?:ess\/grievances|grievances|employees|labor\/disputes)(?:\/|\?|$)|\/auth\/system\/file(?:\/|\?|$))/);
      const key=actor+' '+method+' '+url.split('?')[0];
      if(method!=='GET'){const remaining=interval-(Date.now()-(clocks.get(key)||0));if(remaining>0)await new Promise(resolve=>setTimeout(resolve,remaining));}
      try {
        const response=await sessions[actor].page.evaluate(async supplied=>{
          const token=(await import('/src/utils/authStorage.ts')).getAuthToken(),headers={};
          if(token)headers.Authorization=token.startsWith('Bearer ')?token:'Bearer '+token;
          const csrf=document.cookie.split(';').map(value=>value.trim()).find(value=>value.startsWith('XSRF-TOKEN='));
          if(csrf)headers['X-CSRF-Token']=decodeURIComponent(csrf.slice('XSRF-TOKEN='.length));
          let payload;
          if(supplied.file){payload=new FormData();payload.append('file',new Blob([Uint8Array.from(atob(supplied.file.base64),character=>character.charCodeAt(0))],{type:'text/plain'}),supplied.file.name);}
          else if(supplied.body!==undefined){headers['Content-Type']='application/json';payload=JSON.stringify(supplied.body);}
          const result=await fetch('/api'+supplied.url,{method:supplied.method,credentials:'same-origin',headers,body:payload});
          const type=result.headers.get('Content-Type')||'';
          return {status:result.status,traceId:result.headers.get('X-Trace-Id'),cache:result.headers.get('Cache-Control'),type,
            ...(type.includes('json')?{body:await result.json()}:{base64:btoa(String.fromCharCode(...new Uint8Array(await result.arrayBuffer())))})};
        },{url,method,body,file});
        runtime.requests.push({actor,path:url,method,status:response.status,code:response.body?.code,traceId:response.traceId});return response;
      } finally {if(method!=='GET')clocks.set(key,Date.now());}
    };
    runtime.privacyOk=async(actor,url,method='GET',body,file)=>runtime.success(await runtime.privacyApi(actor,url,method,body,file),actor+'_'+method+'_'+url.split('?')[0]);
    runtime.createPrivacyUiPage=async(actor,viewport)=>{
      const page=await sessions[actor].context.newPage();page.setDefaultTimeout(30000);await page.setViewportSize(viewport);
      page.on('pageerror',()=>browserErrors.push(actor+'-ui'));return page;
    };
    return runtime;
  } catch(error){await runtime.close();throw error;}
}
