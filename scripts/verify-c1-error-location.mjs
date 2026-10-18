import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const frontend = path.join(root, 'cloudflow-frontend');
const requireFrontend = createRequire(path.join(frontend, 'package.json'));
const requireBrowser = createRequire(path.join(root, '.cloudflow-runtime/playwright/package.json'));
const { createServer } = await import(pathToFileURL(requireFrontend.resolve('vite')).href);
const { chromium, devices } = requireBrowser('playwright-core');
const [round, build, mode = 'probe'] = process.argv.slice(2);
assert.match(round || '', /^r[1-9][0-9]*$/); assert.match(build || '', /^r[1-9][0-9]*$/); assert.ok(['probe','verify'].includes(mode));
const evidenceRoot = path.join(root, '.cloudflow-runtime/full-prd-20260915/approved-runtime');
const output = path.join(evidenceRoot, `c1-error-location-20261005-${round}`); await fs.mkdir(output);
const hash = async filename => createHash('sha256').update(await fs.readFile(path.resolve(root, filename))).digest('hex').toUpperCase();
const inputs = JSON.parse((await fs.readFile(path.join(evidenceRoot, `h3-portal-finance-20261002-frontend-${build}-inputs.json`),'utf8')).replace(/^\uFEFF/,''));
for(const Path of ['scripts/verify-c1-error-location.mjs','scripts/form-checks/FormErrorLocationCheck.tsx']) inputs.push({Path,Hash:await hash(Path)});
const checkInputs = async () => { for(const input of inputs) assert.equal(await hash(input.Path),input.Hash.toUpperCase(),'Error location inputs changed'); };
await checkInputs(); await fs.writeFile(path.join(output,'inputs.json'),JSON.stringify(inputs,null,2));
const server = await createServer({root:frontend,configFile:path.join(frontend,'vite.config.ts'),logLevel:'error',server:{host:'127.0.0.1',port:0,strictPort:true,fs:{allow:[root]}}});
const results=[],pageErrors=[],requests=[];
let browser,failure,activePage;
const settle = page => page.evaluate(async () => {
  let previous='',stable=0;
  for(let frame=0;frame<180;frame++) {
    await new Promise(resolve => requestAnimationFrame(resolve));
    const value=JSON.stringify([window.scrollY,...[...document.querySelectorAll('*')].filter(node => node.scrollHeight>node.clientHeight && node.clientHeight>0).map(node => node.scrollTop)]);
    stable=value===previous?stable+1:0; previous=value; if(stable>=12) return;
  }
});
const observe = (page,target) => page.evaluate(target => {
  const field=document.getElementById('field-'+target),input=document.getElementById('input-'+target),rect=field?.getBoundingClientRect();
  const viewportVisible=Boolean(rect && rect.height && rect.bottom>64 && rect.top<innerHeight);
  const clipped=[...(field?.parentElement ? [field.parentElement] : [])];
  for(let ancestor=field?.parentElement?.parentElement;ancestor;ancestor=ancestor.parentElement) clipped.push(ancestor);
  const withinScrollContainers=Boolean(rect) && clipped.every(node => !/(auto|scroll|hidden)/.test(getComputedStyle(node).overflowY) || (()=>{const parent=node.getBoundingClientRect();return rect.bottom>parent.top && rect.top<parent.bottom;})());
  return {target,rendered:Boolean(field),inView:viewportVisible&&withinScrollContainers,focused:document.activeElement===input,activeId:document.activeElement?.id,top:rect?.top,bottom:rect?.bottom,scrollY,expanded:document.querySelector('#field-collapsed > details')?.open,selectedTab:document.querySelector('[role=tab][aria-selected=true]')?.textContent};
},target);
try {
  await server.listen(); const origin='http://127.0.0.1:'+server.httpServer.address().port;
  browser=await chromium.launch({headless:true});
  for(const device of ['desktop','mobile']) {
    const context=await browser.newContext(device==='mobile'?{...devices['Pixel 5'],viewport:{width:390,height:844},serviceWorkers:'block'}:{viewport:{width:1440,height:1040},serviceWorkers:'block'});
    await context.routeWebSocket('**/*',socket=>socket.close());
    await context.route('**/*',async route=>{
      const request=route.request(),url=new URL(request.url());
      if(url.origin!==origin || !['GET','HEAD'].includes(request.method()) || url.pathname.startsWith('/api/')){requests.push({method:request.method(),path:url.pathname});return route.abort();}
      if(url.pathname==='/c1-location'){
        const entry='/@fs/'+path.join(root,'scripts/form-checks/FormErrorLocationCheck.tsx').replaceAll('\\','/');
        return route.fulfill({contentType:'text/html',body:`<html lang="zh-CN"><head><meta name="viewport" content="width=device-width,initial-scale=1"><script type="module">import RefreshRuntime from '/@react-refresh';RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;</script></head><body><div id="root"></div><script type="module" src="${entry}"></script></body></html>`});
      }
      return route.continue();
    });
    for(const scenario of ['external','order','priority','collapse','tabs','virtual','hidden','correction','virtual-edit']){
      const page=await context.newPage(); activePage=page; page.on('pageerror',error=>pageErrors.push({device,scenario,message:error.message}));
      await page.goto(`${origin}/c1-location?scenario=${scenario}`); await page.getByRole('heading',{name:'字段错误定位验证',exact:true}).waitFor();
      await page.locator('[id="input-filler_31"]').waitFor({state:'attached'});
      const activate=async locator=>device==='mobile'?locator.tap():locator.click();
      const local=['priority','collapse','tabs','correction','virtual-edit'].includes(scenario);
      if(['priority','order','correction'].includes(scenario)) await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));
      await activate(page.getByRole('button',{name:local?'执行填写校验':'显示服务端错误',exact:true}));
      const target=['priority','order','correction'].includes(scenario)?'first':['virtual','virtual-edit'].includes(scenario)?'lines[87].name':'last';
      // Absence of a virtual target is itself a probe result; preserve all device/scenario observations.
      await page.locator(`[id="error-${target}"]`).waitFor({timeout:3000}).catch(()=>undefined); await settle(page);
      const result={device,scenario,...await observe(page,target)}; results.push(result);
      await page.screenshot({path:path.join(output,`${device}-${scenario}.png`)});
      if(scenario==='correction'){
        await page.locator('[id="input-first"]').fill('已修改'); await settle(page);
        result.staysWhileEditing=await page.locator('[id="input-first"]').evaluate(node=>node===document.activeElement);
        await activate(page.getByRole('button',{name:'执行填写校验',exact:true})); await settle(page);
        result.next=await observe(page,'last');
      }
      if(scenario==='external'){
        await page.evaluate(()=>window.scrollTo(0,0)); await activate(page.getByRole('button',{name:'显示服务端错误',exact:true})); await settle(page);
        result.repeated=await observe(page,'last');
      }
      if(['virtual','virtual-edit'].includes(scenario)&&result.rendered){
        if(scenario==='virtual-edit'){
          await page.locator('[id="input-lines[87].name"]').fill('已修正第88行'); await settle(page);
          result.correctedErrorCleared=await page.locator('[id="error-lines[87].name"]').count()===0;
        }
        const table=page.locator('section[aria-label="明细"]');
        const scrollState=async reset=>table.evaluate((section,reset)=>{
          const list=[...section.querySelectorAll('div')].find(node=>/(auto|scroll)/.test(getComputedStyle(node).overflowY)&&node.scrollHeight>node.clientHeight);
          if(!list) throw new Error('Virtual list scroll container missing');
          if(reset) list.scrollTop=0;
          return {scrollTop:list.scrollTop,firstRendered:Boolean(section.querySelector('[id="input-lines[0].name"]')),activeId:document.activeElement?.id};
        },reset);
        result.rowOperations=[];
        for(const name of ['删除第1行','复制第1行','删除第1行','新增明细']){
          await scrollState(true); await settle(page);
          if(device==='mobile' && name!=='新增明细') {
            await activate(table.getByRole('button',{name:'第1条明细操作',exact:true}));
            await activate(page.getByRole('dialog',{name:'第1条明细操作',exact:true}).getByRole('button',{name,exact:true}));
          } else await activate(table.getByRole('button',{name,exact:true}));
          await settle(page);
          const state=await scrollState(false);
          result.rowOperations.push({name,...state,stayed:state.scrollTop===0&&state.firstRendered});
        }
        await page.screenshot({path:path.join(output,`${device}-${scenario}-row-operations.png`)});
        if(scenario==='virtual-edit'){
          await activate(page.getByRole('button',{name:'执行填写校验',exact:true})); await settle(page);
          result.afterRowOperations=await observe(page,'lines[99].name');
          result.afterRowOperationScroll=await table.evaluate(section=>({
            scrollContainers:[...section.querySelectorAll('div')].filter(node=>/(auto|scroll)/.test(getComputedStyle(node).overflowY)&&node.scrollHeight>node.clientHeight).map(node=>({top:node.scrollTop,height:node.clientHeight,total:node.scrollHeight})),
            renderedRows:[...section.querySelectorAll('[aria-label]')].map(node=>node.getAttribute('aria-label')).filter(label=>/^第\d+条明细$/.test(label)),
            tableHeight:section.querySelector('table')?.getBoundingClientRect().height,
          }));
        }
      }
      if(['tabs','virtual','virtual-edit'].includes(scenario)){
        await activate(page.getByRole('tab',{name:'概览',exact:true})); await settle(page);
        result.canSwitchTab=await page.getByRole('tab',{name:'概览',exact:true}).getAttribute('aria-selected')==='true';
        if(scenario!=='tabs'){
          await activate(page.getByRole('tab',{name:'详细',exact:true})); await settle(page);
          result.tabReturnStartsAtFirstRow=await page.locator('[id="input-lines[0].name"]').count()===1;
          if(scenario==='virtual'){
            await activate(page.getByRole('button',{name:'显示服务端错误',exact:true})); await settle(page);
            result.repeated=await observe(page,'lines[87].name');
          }
        }
      }
      await page.close();
    }
    await context.close();
  }
  assert.equal(pageErrors.length,0); assert.equal(requests.length,0);
  if(mode==='verify') assert.ok(results.every(result=>result.inView&&result.focused&&(!result.next||result.next.inView&&result.next.focused&&result.staysWhileEditing)&&(!result.repeated||result.repeated.inView&&result.repeated.focused)&&result.canSwitchTab!==false&&result.correctedErrorCleared!==false&&result.tabReturnStartsAtFirstRow!==false&&(!result.rowOperations||result.rowOperations.every(operation=>operation.stayed))&&(!result.afterRowOperations||result.afterRowOperations.inView&&result.afterRowOperations.focused)),'Field error location, keyboard focus or row editing continuity failed');
} catch(error){failure=error;if(activePage&&!activePage.isClosed())await activePage.screenshot({path:path.join(output,'failure.png')}).catch(()=>undefined);}
finally{
  await browser?.close(); await server.close();
  try{await checkInputs();}catch(error){failure=error;}
  const summary={mode,componentOnly:true,frontendBuild:build,results,pageErrors,businessRequests:requests,inputs:inputs.length,passed:!failure,wholeC1Acceptance:false};
  await fs.writeFile(path.join(output,'result.json'),JSON.stringify(summary,null,2));
  console.log('C1_ERROR_LOCATION: '+JSON.stringify({mode,scenarios:results.length,inView:results.filter(result=>result.inView).length,focused:results.filter(result=>result.focused).length,pageErrors:pageErrors.length,businessRequests:requests.length,inputs:inputs.length,passed:!failure,wholeC1Acceptance:false}));
}
if(failure)throw failure;
