import assert from 'node:assert/strict';
import { createD1LeaveRuntime } from './d1-leave-runtime.mjs';

export async function createD4GrievanceRuntime(root,output){
  assert.ok(process.argv.includes('--d4-mobile-statistics'));
  const runtime=await createD1LeaveRuntime(root,output);
  const interval=Math.max(5000,Number(runtime.database("SELECT COALESCE(MAX(CAST(config_value AS UNSIGNED)),0) FROM sys_config WHERE config_key='sys.common.repeatSubmit.intervalMillis'")))+150;
  assert.ok(Number.isSafeInteger(interval)&&interval<=60150);
  const clock=new Map();
  runtime.grievanceApi=async(actor,url,method='GET',body)=>{
    assert.match(url,/^\/hr\/(?:ess\/grievances|grievances|employees)(?:\/|\?|$)/);
    const key=actor+' '+method+' '+url.split('?')[0];
    if(method!=='GET'){const remaining=interval-(Date.now()-(clock.get(key)||0));if(remaining>0)await new Promise(resolve=>setTimeout(resolve,remaining));}
    try{
      const response=await runtime.sessions[actor].page.evaluate(async supplied=>{
        const token=(await import('/src/utils/authStorage.ts')).getAuthToken();
        if(!token)throw new Error('Owned API authentication page lost its token');
        const headers={Authorization:token.startsWith('Bearer ')?token:'Bearer '+token};
        const csrf=document.cookie.split(';').map(value=>value.trim()).find(value=>value.startsWith('XSRF-TOKEN='));if(csrf)headers['X-CSRF-Token']=decodeURIComponent(csrf.slice('XSRF-TOKEN='.length));
        if(supplied.body!==undefined)headers['Content-Type']='application/json';
        const result=await fetch('/api'+supplied.url,{method:supplied.method,credentials:'same-origin',headers,...(supplied.body===undefined?{}:{body:JSON.stringify(supplied.body)})});
        if((result.headers.get('Content-Type')||'').includes('json'))return{status:result.status,traceId:result.headers.get('X-Trace-Id'),body:await result.json()};
        return{status:result.status,traceId:result.headers.get('X-Trace-Id'),base64:btoa(String.fromCharCode(...new Uint8Array(await result.arrayBuffer())))};
      },{url,method,body});
      runtime.requests.push({actor,path:url,method,status:response.status,code:response.body?.code,traceId:response.traceId});return response;
    }finally{if(method!=='GET')clock.set(key,Date.now());}
  };
  runtime.grievanceOk=async(actor,url,method='GET',body)=>runtime.success(await runtime.grievanceApi(actor,url,method,body),actor+'_'+method+'_'+url.split('?')[0]);
  runtime.createUiPage=async(actor,viewport={width:1440,height:1000})=>{
    const page=await runtime.sessions[actor].context.newPage();await page.setViewportSize(viewport);page.setDefaultTimeout(30000);
    page.on('pageerror',()=>runtime.browserErrors.push(actor+'-ui'));return page;
  };
  return runtime;
}
